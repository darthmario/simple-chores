"""Data storage for the Simple Chores integration."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import TYPE_CHECKING, Any

from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import (
    ANCHOR_DAY_OF_MONTH,
    ANCHOR_TYPES,
    ANCHOR_WEEK_PATTERN,
    EXPOSED_HISTORY_DAYS,
    EXPOSED_HISTORY_ENTRIES,
    FREQUENCIES,
    FREQUENCY_BIANNUAL,
    FREQUENCY_BIMONTHLY,
    FREQUENCY_BIWEEKLY,
    FREQUENCY_MONTHLY,
    FREQUENCY_QUARTERLY,
    FREQUENCY_WEEKLY,
    FREQUENCY_YEARLY,
    MAX_CHORE_NAME_LENGTH,
    MAX_ESTIMATED_MINUTES,
    MAX_HISTORY_ENTRIES,
    MAX_ROOM_NAME_LENGTH,
    MAX_STEP_LENGTH,
    MAX_STEPS_PER_CHORE,
    RECURRENCE_ANCHORED,
    RECURRENCE_INTERVAL,
    RECURRENCE_TYPES,
    STORAGE_KEY,
    STORAGE_VERSION,
    WEEK_ORDINALS,
    WEEKDAYS,
)

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)


class SimpleChoresStore:
    """Class to manage persistent storage for simple chores."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize the store."""
        self._hass = hass
        self._store = Store[dict[str, Any]](hass, STORAGE_VERSION, STORAGE_KEY)
        self._data: dict[str, Any] = {
            "rooms": {},
            "chores": {},
            "history": [],
            "users": {},
        }
        self._dirty = False
        self._save_task: asyncio.Task | None = None

    @property
    def rooms(self) -> dict[str, Any]:
        """Return all custom rooms."""
        return self._data.get("rooms", {})

    @property
    def chores(self) -> dict[str, Any]:
        """Return all chores."""
        return self._data.get("chores", {})

    @property
    def history(self) -> list[dict[str, Any]]:
        """Return completion history."""
        return self._data.get("history", [])

    @property
    def users(self) -> dict[str, Any]:
        """Return all custom users."""
        return self._data.get("users", {})

    async def async_load(self) -> dict[str, Any]:
        """Load data from storage."""
        data = await self._store.async_load()
        if data:
            self._data = data
            # Ensure all required keys exist (for backward compatibility)
            if "users" not in self._data:
                self._data["users"] = {}
                _LOGGER.info("Added missing 'users' key to existing data")
            # Migrate legacy chores missing recurrence fields
            self._migrate_chores()
        return self._data

    def _migrate_chores(self) -> None:
        """Backfill missing recurrence fields on legacy chores."""
        migrated = 0
        for chore in self._data.get("chores", {}).values():
            if "recurrence_type" not in chore:
                chore["recurrence_type"] = RECURRENCE_INTERVAL
                migrated += 1
            if "interval" not in chore:
                chore["interval"] = 1
            # Ensure anchor fields exist (None is fine as default)
            for field in (
                "anchor_days_of_week",
                "anchor_type",
                "anchor_day_of_month",
                "anchor_week",
                "anchor_weekday",
            ):
                if field not in chore:
                    chore[field] = None
            # Ensure is_completed exists
            if "is_completed" not in chore:
                chore["is_completed"] = False
            # Focus view fields: no estimate is a valid state, steps default to empty
            if "estimated_minutes" not in chore:
                chore["estimated_minutes"] = None
            if "steps" not in chore:
                chore["steps"] = []
            if "step_progress" not in chore:
                chore["step_progress"] = []
        if migrated:
            _LOGGER.info("Migrated %d chore(s) with missing recurrence fields", migrated)

    async def async_save(self) -> None:
        """Save data to storage immediately."""
        await self._store.async_save(self._data)
        self._dirty = False

    async def async_save_debounced(self, delay: float = 2.0) -> None:
        """Save data to storage with debouncing to reduce I/O operations."""
        self._dirty = True

        # Cancel existing save task
        if self._save_task and not self._save_task.done():
            self._save_task.cancel()

        async def _delayed_save() -> None:
            try:
                await asyncio.sleep(delay)
                if self._dirty:
                    await self._store.async_save(self._data)
                    self._dirty = False
                    _LOGGER.debug("Debounced save completed")
            except asyncio.CancelledError:
                _LOGGER.debug("Debounced save cancelled")
            except OSError as e:
                _LOGGER.error("File system error in debounced save: %s", e, exc_info=True)
            except Exception:
                _LOGGER.exception("Unexpected error in debounced save")
                raise  # Re-raise unexpected errors

        self._save_task = asyncio.create_task(_delayed_save())

    async def async_flush_debounced_save(self) -> None:
        """Flush any pending debounced save immediately (e.g., on shutdown)."""
        # Cancel pending save task
        if self._save_task and not self._save_task.done():
            self._save_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._save_task

        # Save immediately if there are pending changes
        if self._dirty:
            _LOGGER.info("Flushing pending changes on shutdown")
            await self.async_save()

    # Room operations
    def add_room(self, name: str, icon: str | None = None) -> dict[str, Any]:
        """Add a custom room."""
        # Input validation
        if not name or not name.strip():
            raise ValueError("Room name cannot be empty")
        if len(name.strip()) > MAX_ROOM_NAME_LENGTH:
            raise ValueError(f"Room name too long (max {MAX_ROOM_NAME_LENGTH} characters)")

        room_id = f"custom_{uuid.uuid4().hex[:8]}"
        room = {
            "id": room_id,
            "name": name.strip(),
            "icon": icon or "mdi:home",
            "is_custom": True,
        }
        self._data["rooms"][room_id] = room
        return room

    def update_room(self, room_id: str, name: str | None = None, icon: str | None = None) -> dict[str, Any] | None:
        """Update a custom room."""
        if room_id not in self._data["rooms"]:
            return None

        # Validate name length if provided
        if name is not None:
            if not name.strip():
                raise ValueError("Room name cannot be empty")
            if len(name.strip()) > MAX_ROOM_NAME_LENGTH:
                raise ValueError(f"Room name too long (max {MAX_ROOM_NAME_LENGTH} characters)")

        room = self._data["rooms"][room_id]
        if name is not None:
            room["name"] = name.strip()
        if icon is not None:
            room["icon"] = icon
        return room

    def remove_room(self, room_id: str) -> bool:
        """Remove a custom room and all associated chores."""
        if room_id not in self._data["rooms"]:
            return False

        # Find and remove all chores associated with this room
        chores_to_remove = [chore_id for chore_id, chore in self._data["chores"].items() if chore["room_id"] == room_id]

        # Log and delete associated chores
        for chore_id in chores_to_remove:
            chore_name = self._data["chores"][chore_id].get("name", "Unknown")
            _LOGGER.info(
                "Removing chore '%s' (ID: %s) due to room deletion",
                chore_name,
                chore_id,
            )
            del self._data["chores"][chore_id]

        # Remove the room
        room_name = self._data["rooms"][room_id].get("name", room_id)
        del self._data["rooms"][room_id]

        if chores_to_remove:
            _LOGGER.warning(
                "Removed room '%s' and deleted %d associated chore(s)",
                room_name,
                len(chores_to_remove),
            )

        return True

    # User operations
    def add_user(self, name: str, avatar: str | None = None) -> dict[str, Any]:
        """Add a custom user (no HA login required)."""
        # Input validation
        if not name or not name.strip():
            raise ValueError("User name cannot be empty")
        if len(name.strip()) > MAX_ROOM_NAME_LENGTH:  # Reuse room name length limit
            raise ValueError(f"User name too long (max {MAX_ROOM_NAME_LENGTH} characters)")

        user_id = f"custom_user_{uuid.uuid4().hex[:8]}"
        user = {
            "id": user_id,
            "name": name.strip(),
            "avatar": avatar or "mdi:account",
            "is_custom": True,
        }
        self._data["users"][user_id] = user
        _LOGGER.info("Created custom user '%s' with ID: %s", name, user_id)
        return user

    def update_user(self, user_id: str, name: str | None = None, avatar: str | None = None) -> dict[str, Any] | None:
        """Update a custom user."""
        if user_id not in self._data["users"]:
            return None

        # Validate name length if provided
        if name is not None:
            if not name.strip():
                raise ValueError("User name cannot be empty")
            if len(name.strip()) > MAX_ROOM_NAME_LENGTH:
                raise ValueError(f"User name too long (max {MAX_ROOM_NAME_LENGTH} characters)")

        user = self._data["users"][user_id]
        if name is not None:
            user["name"] = name.strip()
        if avatar is not None:
            user["avatar"] = avatar
        return user

    def remove_user(self, user_id: str) -> bool:
        """Remove a custom user."""
        if user_id not in self._data["users"]:
            return False

        # Note: We don't remove chore assignments when deleting a user
        # The assignments will just show the user ID until reassigned
        user_name = self._data["users"][user_id].get("name", user_id)
        del self._data["users"][user_id]

        _LOGGER.info("Removed custom user '%s' (ID: %s)", user_name, user_id)
        return True

    # Chore operations
    def add_chore(
        self,
        name: str,
        room_id: str,
        frequency: str,
        start_date: date | None = None,
        assigned_to: str | None = None,
        recurrence_type: str | None = None,
        anchor_days_of_week: list[int] | None = None,
        anchor_type: str | None = None,
        anchor_day_of_month: int | None = None,
        anchor_week: int | None = None,
        anchor_weekday: int | None = None,
        interval: int | None = None,
        estimated_minutes: int | None = None,
        steps: list[str] | None = None,
    ) -> dict[str, Any]:
        """Add a new chore."""
        # Input validation
        if not name or not name.strip():
            raise ValueError("Chore name cannot be empty")
        if len(name.strip()) > MAX_CHORE_NAME_LENGTH:
            raise ValueError(f"Chore name too long (max {MAX_CHORE_NAME_LENGTH} characters)")
        if not room_id or not room_id.strip():
            raise ValueError("Room ID cannot be empty")

        # Validate room ID format
        if not (room_id.startswith("area_") or room_id.startswith("custom_")):
            raise ValueError(
                f"Invalid room ID format: {room_id}. "
                "Room IDs must start with 'area_' (Home Assistant areas) or 'custom_' (custom rooms)"
            )

        # Normalize frequency to lowercase for case-insensitive comparison
        frequency = frequency.lower()
        if frequency not in FREQUENCIES:
            raise ValueError(f"Invalid frequency: {frequency}. Must be one of: {FREQUENCIES}")

        # Validate recurrence type
        recurrence_type = recurrence_type or RECURRENCE_INTERVAL
        if recurrence_type not in RECURRENCE_TYPES:
            raise ValueError(f"Invalid recurrence type: {recurrence_type}. Must be one of: {RECURRENCE_TYPES}")

        # Validate anchor fields if anchored recurrence
        if recurrence_type == RECURRENCE_ANCHORED:
            self._validate_anchor_fields(
                frequency, anchor_days_of_week, anchor_type, anchor_day_of_month, anchor_week, anchor_weekday
            )

        # Validate interval (default to 1)
        if interval is None:
            interval = 1
        if interval < 1:
            raise ValueError("Interval must be at least 1")

        # Focus view fields
        estimated_minutes = self._validate_estimated_minutes(estimated_minutes)
        steps = self._validate_steps(steps)

        chore_id = uuid.uuid4().hex[:8]
        next_due = start_date or dt_util.now().date()
        chore = {
            "id": chore_id,
            "name": name,
            "room_id": room_id,
            "frequency": frequency,
            "assigned_to": assigned_to,
            "last_completed": None,
            "last_completed_by": None,
            "next_due": next_due.isoformat(),
            "created_at": dt_util.now().isoformat(),
            "is_completed": False,
            # Recurrence fields
            "recurrence_type": recurrence_type,
            "interval": interval,
            "anchor_days_of_week": anchor_days_of_week,
            "anchor_type": anchor_type,
            "anchor_day_of_month": anchor_day_of_month,
            "anchor_week": anchor_week,
            "anchor_weekday": anchor_weekday,
            # Focus view fields
            "estimated_minutes": estimated_minutes,
            "steps": steps,
            "step_progress": [],
        }

        # Debug logging for assignment
        _LOGGER.info(
            "Creating chore '%s' with recurrence_type: %s, assigned_to: %s",
            name,
            recurrence_type,
            assigned_to,
        )
        self._data["chores"][chore_id] = chore
        return chore

    def _validate_anchor_fields(
        self,
        frequency: str,
        anchor_days_of_week: list[int] | None,
        anchor_type: str | None,
        anchor_day_of_month: int | None,
        anchor_week: int | None,
        anchor_weekday: int | None,
    ) -> None:
        """Validate anchor fields for anchored recurrence."""
        if frequency in (FREQUENCY_WEEKLY, FREQUENCY_BIWEEKLY):
            # Weekly anchored requires anchor_days_of_week
            if not anchor_days_of_week:
                raise ValueError("Weekly anchored recurrence requires anchor_days_of_week")
            for day in anchor_days_of_week:
                if day not in WEEKDAYS:
                    raise ValueError(f"Invalid day of week: {day}. Must be 0-6 (Sunday-Saturday)")

        elif frequency in (FREQUENCY_MONTHLY, FREQUENCY_BIMONTHLY, FREQUENCY_QUARTERLY, FREQUENCY_BIANNUAL):
            # Monthly anchored requires anchor_type
            if not anchor_type:
                raise ValueError("Monthly anchored recurrence requires anchor_type")
            if anchor_type not in ANCHOR_TYPES:
                raise ValueError(f"Invalid anchor type: {anchor_type}. Must be one of: {ANCHOR_TYPES}")

            if anchor_type == ANCHOR_DAY_OF_MONTH:
                if anchor_day_of_month is None or anchor_day_of_month < 1 or anchor_day_of_month > 31:
                    raise ValueError("anchor_day_of_month must be between 1 and 31")
            elif anchor_type == ANCHOR_WEEK_PATTERN:
                if anchor_week not in WEEK_ORDINALS:
                    raise ValueError(f"Invalid anchor_week: {anchor_week}. Must be 1-5 (1st-4th, or 5 for last)")
                if anchor_weekday not in WEEKDAYS:
                    raise ValueError(f"Invalid anchor_weekday: {anchor_weekday}. Must be 0-6 (Sunday-Saturday)")

        elif frequency == FREQUENCY_YEARLY:
            # Yearly anchored - similar to monthly but also needs month specification
            # For now, we'll use the start_date's month as the anchor month
            pass

    @staticmethod
    def _validate_estimated_minutes(estimated_minutes: Any) -> int | None:
        """Normalize an estimated duration.

        None means "no estimate"; 0 is accepted as an explicit way to clear one.
        """
        if estimated_minutes is None:
            return None
        try:
            minutes = int(estimated_minutes)
        except (TypeError, ValueError) as err:
            raise ValueError(
                f"estimated_minutes must be a whole number of minutes, got: {estimated_minutes!r}"
            ) from err
        if minutes == 0:
            return None
        if minutes < 0 or minutes > MAX_ESTIMATED_MINUTES:
            raise ValueError(f"estimated_minutes must be between 1 and {MAX_ESTIMATED_MINUTES} (or 0 to clear)")
        return minutes

    @staticmethod
    def _validate_steps(steps: Any) -> list[str]:
        """Normalize a chore's micro-steps, dropping blanks."""
        if steps is None:
            return []
        if isinstance(steps, str) or not isinstance(steps, (list, tuple)):
            raise ValueError("steps must be a list of short text steps")

        cleaned: list[str] = []
        for raw_step in steps:
            text = str(raw_step).strip()
            if not text:
                continue
            if len(text) > MAX_STEP_LENGTH:
                raise ValueError(f"Step text too long (max {MAX_STEP_LENGTH} characters): {text[:30]}...")
            cleaned.append(text)

        if len(cleaned) > MAX_STEPS_PER_CHORE:
            raise ValueError(f"Too many steps (max {MAX_STEPS_PER_CHORE}). Consider splitting this into two chores.")
        return cleaned

    def update_chore(
        self,
        chore_id: str,
        name: str | None = None,
        room_id: str | None = None,
        frequency: str | None = None,
        next_due: date | None = None,
        assigned_to: str | None = None,
        recurrence_type: str | None = None,
        anchor_days_of_week: list[int] | None = None,
        anchor_type: str | None = None,
        anchor_day_of_month: int | None = None,
        anchor_week: int | None = None,
        anchor_weekday: int | None = None,
        interval: int | None = None,
        estimated_minutes: int | None = None,
        steps: list[str] | None = None,
    ) -> dict[str, Any] | None:
        """Update an existing chore.

        Omitted fields are left unchanged. Pass estimated_minutes=0 to clear an
        estimate and steps=[] to clear the step list.
        """
        if chore_id not in self._data["chores"]:
            return None

        # Normalize frequency to lowercase if provided
        if frequency is not None:
            frequency = frequency.lower()
            if frequency not in FREQUENCIES:
                raise ValueError(f"Invalid frequency: {frequency}. Must be one of: {FREQUENCIES}")

        # Validate room ID format if provided
        if room_id is not None and not (room_id.startswith("area_") or room_id.startswith("custom_")):
            raise ValueError(f"Invalid room ID format: {room_id}. Room IDs must start with 'area_' or 'custom_'")

        # Validate recurrence type if provided
        if recurrence_type is not None and recurrence_type not in RECURRENCE_TYPES:
            raise ValueError(f"Invalid recurrence type: {recurrence_type}. Must be one of: {RECURRENCE_TYPES}")

        # Validate interval before any mutation so a failed update can't
        # leave the chore partially modified
        if interval is not None and interval < 1:
            raise ValueError("Interval must be at least 1")

        # Same for the focus view fields - validate up front, assign later
        validated_minutes = (
            self._validate_estimated_minutes(estimated_minutes) if estimated_minutes is not None else None
        )
        validated_steps = self._validate_steps(steps) if steps is not None else None

        chore = self._data["chores"][chore_id]

        # Validate the effective anchor configuration (provided values merged
        # over stored ones) before mutating anything
        effective_recurrence = recurrence_type if recurrence_type is not None else chore.get("recurrence_type")
        if effective_recurrence == RECURRENCE_ANCHORED:
            self._validate_anchor_fields(
                frequency if frequency is not None else chore.get("frequency"),
                anchor_days_of_week if anchor_days_of_week is not None else chore.get("anchor_days_of_week"),
                anchor_type if anchor_type is not None else chore.get("anchor_type"),
                anchor_day_of_month if anchor_day_of_month is not None else chore.get("anchor_day_of_month"),
                anchor_week if anchor_week is not None else chore.get("anchor_week"),
                anchor_weekday if anchor_weekday is not None else chore.get("anchor_weekday"),
            )

        if name is not None:
            chore["name"] = name
        if room_id is not None:
            chore["room_id"] = room_id
        if frequency is not None:
            chore["frequency"] = frequency
        if next_due is not None:
            chore["next_due"] = next_due.isoformat()

        # Assignment: None (omitted) leaves it unchanged, "" explicitly clears it
        if assigned_to is not None:
            chore["assigned_to"] = assigned_to or None
        elif "assigned_to" not in chore:
            chore["assigned_to"] = None

        # Update recurrence fields if provided
        if recurrence_type is not None:
            chore["recurrence_type"] = recurrence_type
        if interval is not None:
            chore["interval"] = interval
        if anchor_days_of_week is not None:
            chore["anchor_days_of_week"] = anchor_days_of_week
        if anchor_type is not None:
            chore["anchor_type"] = anchor_type
        if anchor_day_of_month is not None:
            chore["anchor_day_of_month"] = anchor_day_of_month
        if anchor_week is not None:
            chore["anchor_week"] = anchor_week
        if anchor_weekday is not None:
            chore["anchor_weekday"] = anchor_weekday

        # Focus view fields
        if estimated_minutes is not None:
            chore["estimated_minutes"] = validated_minutes
        if validated_steps is not None:
            chore["steps"] = validated_steps
            # Indices past the end of the new list no longer refer to anything
            chore["step_progress"] = [i for i in chore.get("step_progress", []) if i < len(validated_steps)]

        # Ensure recurrence fields exist for backwards compatibility
        if "recurrence_type" not in chore:
            chore["recurrence_type"] = RECURRENCE_INTERVAL
        if "interval" not in chore:
            chore["interval"] = 1

        return chore

    def remove_chore(self, chore_id: str) -> bool:
        """Remove a chore."""
        if chore_id in self._data["chores"]:
            del self._data["chores"][chore_id]
            return True
        return False

    def complete_chore(
        self,
        chore_id: str,
        user_id: str,
        user_name: str,
        next_due: date | None,
    ) -> dict[str, Any] | None:
        """Mark a chore as completed and schedule next occurrence (or mark as done if one-off)."""
        if chore_id not in self._data["chores"]:
            return None

        chore = self._data["chores"][chore_id]
        now = dt_util.now()

        # Remember what completing overwrites, so an accidental tap can be
        # undone exactly (see undo_completion)
        previous = {
            "next_due": chore.get("next_due"),
            "last_completed": chore.get("last_completed"),
            "last_completed_by": chore.get("last_completed_by"),
            "step_progress": list(chore.get("step_progress") or []),
            "is_completed": bool(chore.get("is_completed", False)),
        }

        # Update chore
        chore["last_completed"] = now.date().isoformat()
        chore["last_completed_by"] = user_id
        # The next occurrence starts with a fresh checklist
        chore["step_progress"] = []

        if next_due is None:
            # One-off chore - mark as completed permanently
            chore["is_completed"] = True
            _LOGGER.info("One-off chore '%s' marked as completed", chore["name"])
        else:
            # Recurring chore - reschedule
            chore["next_due"] = next_due.isoformat()
            chore["is_completed"] = False  # Ensure flag is set for recurring chores

        # Add to history
        history_entry = {
            "id": uuid.uuid4().hex[:8],
            "chore_id": chore_id,
            "chore_name": chore["name"],
            "completed_at": now.isoformat(),
            "completed_by": user_id,
            "completed_by_name": user_name,
            "previous": previous,
        }
        self._data["history"].append(history_entry)
        _LOGGER.info(
            "Added history entry for chore '%s' completed by %s. Total history entries: %d",
            chore["name"],
            user_name,
            len(self._data["history"]),
        )

        # Efficient history cleanup to prevent memory bloat
        self._cleanup_history()

        return chore

    def _cleanup_history(self) -> None:
        """Efficiently clean up history entries to prevent memory bloat."""
        history = self._data["history"]

        # Only cleanup if we exceed the limit
        if len(history) <= MAX_HISTORY_ENTRIES:
            return

        # Since we append entries in chronological order, we can simply
        # keep the last N entries without expensive sorting
        # This is O(1) instead of O(n log n)
        entries_to_remove = len(history) - MAX_HISTORY_ENTRIES
        self._data["history"] = history[entries_to_remove:]
        _LOGGER.debug(
            "History cleanup: removed %d old entries, kept %d most recent",
            entries_to_remove,
            len(self._data["history"]),
        )

    def undo_completion(
        self,
        history_id: str | None = None,
        chore_id: str | None = None,
    ) -> dict[str, Any] | None:
        """Reverse a completion: drop its history entry and put the chore back.

        Pick the entry by ``history_id``, or the newest completion of
        ``chore_id``. The chore's due date, last-completed fields, checklist
        progress and one-off flag are restored from the snapshot the entry
        carries, so statistics, streaks and anything derived from history (a
        certain otter's meals) stay honest.

        Only a chore's newest completion is unwound into the chore itself;
        undoing an older one just corrects the history, since later
        completions have moved the chore on since. Entries written before
        snapshots existed are restored approximately: the day the chore was
        marked done becomes its due date again, and the previous completion
        (if any) becomes its last one.

        Returns the chore, or the removed entry if its chore no longer exists,
        or None if nothing matched.
        """
        if history_id is None and chore_id is None:
            raise ValueError("undo_completion needs a history_id or a chore_id")

        history = self._data["history"]
        index = None
        for i in range(len(history) - 1, -1, -1):
            entry = history[i]
            if history_id is not None:
                if entry.get("id") == history_id:
                    index = i
                    break
            elif entry.get("chore_id") == chore_id:
                index = i
                break
        if index is None:
            return None

        entry = history.pop(index)
        entry_chore_id = entry.get("chore_id")
        chore = self._data["chores"].get(entry_chore_id)
        if chore is None:
            _LOGGER.info("Removed completion %s of a chore that no longer exists", entry.get("id"))
            return entry

        completed_at = self._entry_time(entry)
        siblings = [h for h in history if h.get("chore_id") == entry_chore_id]
        later = [
            h
            for h in siblings
            if (t := self._entry_time(h)) is not None and completed_at is not None and t > completed_at
        ]
        if later:
            _LOGGER.info(
                "Removed an older completion of '%s' from history; a later one keeps the chore where it is",
                chore["name"],
            )
            return chore

        previous = entry.get("previous")
        if isinstance(previous, dict):
            chore["next_due"] = previous.get("next_due")
            chore["last_completed"] = previous.get("last_completed")
            chore["last_completed_by"] = previous.get("last_completed_by")
            chore["step_progress"] = list(previous.get("step_progress") or [])
            chore["is_completed"] = bool(previous.get("is_completed", False))
            _LOGGER.info("Undid completion of '%s'; due %s again", chore["name"], chore["next_due"])
            return chore

        # No snapshot (the entry predates them): the best reconstruction is
        # that the chore was due the day it was marked done, and that the
        # completion before this one, if any, is its last
        due_day = dt_util.as_local(completed_at).date() if completed_at is not None else dt_util.now().date()
        prior = max(siblings, key=lambda h: self._entry_time(h) or datetime.min.replace(tzinfo=UTC), default=None)
        prior_time = self._entry_time(prior) if prior else None
        chore["next_due"] = due_day.isoformat()
        chore["last_completed"] = dt_util.as_local(prior_time).date().isoformat() if prior_time else None
        chore["last_completed_by"] = prior.get("completed_by") if prior else None
        chore["is_completed"] = False
        _LOGGER.info(
            "Undid a pre-snapshot completion of '%s'; due %s again (approximate)",
            chore["name"],
            chore["next_due"],
        )
        return chore

    @staticmethod
    def _entry_time(entry: dict[str, Any] | None) -> datetime | None:
        """The aware completion time of a history entry, or None if unusable."""
        if not entry:
            return None
        parsed = dt_util.parse_datetime(str(entry.get("completed_at") or ""))
        if parsed is None:
            return None
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        return parsed

    def skip_chore(self, chore_id: str, next_due: date) -> dict[str, Any] | None:
        """Skip a chore to the next occurrence without marking complete."""
        if chore_id not in self._data["chores"]:
            return None
        chore = self._data["chores"][chore_id]
        chore["next_due"] = next_due.isoformat()
        # Skipping abandons this occurrence, so any part-done checklist goes with it
        chore["step_progress"] = []
        return chore

    def toggle_chore_step(self, chore_id: str, step_index: int, completed: bool | None = None) -> dict[str, Any] | None:
        """Tick or untick one micro-step on a chore.

        Progress is stored server-side so a chore started on a phone shows the
        same state on the wall display. Pass completed to set it explicitly,
        or leave it None to flip the current value.
        """
        if chore_id not in self._data["chores"]:
            return None

        chore = self._data["chores"][chore_id]
        steps = chore.get("steps") or []
        if step_index < 0 or step_index >= len(steps):
            raise ValueError(f"step_index {step_index} is out of range for a chore with {len(steps)} step(s)")

        progress = set(chore.get("step_progress") or [])
        should_complete = step_index not in progress if completed is None else bool(completed)
        if should_complete:
            progress.add(step_index)
        else:
            progress.discard(step_index)

        chore["step_progress"] = sorted(progress)
        _LOGGER.debug(
            "Chore '%s' step %d -> %s (%d/%d done)",
            chore["name"],
            step_index,
            "done" if should_complete else "todo",
            len(progress),
            len(steps),
        )
        return chore

    def snooze_chore(self, chore_id: str) -> dict[str, Any] | None:
        """Snooze a chore by postponing it 1 day."""
        if chore_id not in self._data["chores"]:
            return None
        chore = self._data["chores"][chore_id]
        current_due = date.fromisoformat(chore["next_due"])
        new_due = current_due + timedelta(days=1)
        chore["next_due"] = new_due.isoformat()
        _LOGGER.info("Snoozed chore '%s' from %s to %s", chore["name"], current_due, new_due)
        return chore

    def get_recent_history(
        self,
        max_entries: int = EXPOSED_HISTORY_ENTRIES,
        max_age_days: int = EXPOSED_HISTORY_DAYS,
    ) -> list[dict[str, Any]]:
        """Return a trimmed copy of the history for publishing as entity attributes.

        The full history stays in storage; this only bounds what gets pushed to
        every connected client on each state update. Entries are appended in
        chronological order, so the tail is the most recent.
        """
        history = self._data.get("history", [])
        recent = history[-max_entries:] if max_entries > 0 else []
        cutoff = dt_util.now() - timedelta(days=max_age_days)

        trimmed: list[dict[str, Any]] = []
        for entry in recent:
            completed_at = dt_util.parse_datetime(entry.get("completed_at") or "")
            # Keep anything we can't confidently place in time rather than
            # silently dropping it
            if completed_at is not None and completed_at.tzinfo is not None and completed_at < cutoff:
                continue
            # The undo snapshot is only ever read server-side; "id" stays so
            # the history modal can undo a specific entry
            trimmed.append({k: v for k, v in entry.items() if k != "previous"})

        if len(trimmed) < len(history):
            _LOGGER.debug(
                "Publishing %d of %d history entries as attributes",
                len(trimmed),
                len(history),
            )
        return trimmed

    def get_chore_history(self, chore_id: str) -> list[dict[str, Any]]:
        """Get completion history for a specific chore."""
        return [h for h in self._data["history"] if h["chore_id"] == chore_id]

    def get_user_stats(self) -> dict[str, dict[str, Any]]:
        """Get completion statistics per user."""
        stats: dict[str, dict[str, Any]] = {}
        for entry in self._data["history"]:
            user_id = entry["completed_by"]
            user_name = entry["completed_by_name"]
            if user_id not in stats:
                stats[user_id] = {
                    "user_id": user_id,
                    "user_name": user_name,
                    "total_completed": 0,
                    "last_completed": None,
                }
            stats[user_id]["total_completed"] += 1
            completed_at = entry["completed_at"]
            if stats[user_id]["last_completed"] is None or completed_at > stats[user_id]["last_completed"]:
                stats[user_id]["last_completed"] = completed_at
        return stats
