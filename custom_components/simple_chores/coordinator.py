"""DataUpdateCoordinator for the Simple Chores integration."""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import TYPE_CHECKING, Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator
from homeassistant.util import dt as dt_util

from .const import (
    DOMAIN,
    RECURRENCE_ANCHORED,
    RECURRENCE_INTERVAL,
    ROOM_PREFIX_AREA,
)
from .recurrence import calculate_next_due_for_chore
from .store import SimpleChoresStore

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant
    from homeassistant.helpers.area_registry import AreaRegistry

_LOGGER = logging.getLogger(__name__)


class SimpleChoresCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Coordinator to manage simple chores data."""

    config_entry: ConfigEntry

    def __init__(
        self,
        hass: HomeAssistant,
        store: SimpleChoresStore,
        config_entry: ConfigEntry,
    ) -> None:
        """Initialize the coordinator."""
        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=timedelta(minutes=15),
        )
        self.store = store
        self.config_entry = config_entry
        self._room_name_cache: dict[str, str] | None = None

    async def _async_update_data(self) -> dict[str, Any]:
        """Calculate due chores and prepare data for entities."""
        today = dt_util.now().date()
        # Use rolling 7-day window instead of calendar week
        next_seven_days = today + timedelta(days=7)

        # Get all rooms (HA Areas + custom)
        # Cache is only cleared when rooms are modified, not on every update
        all_rooms = await self._get_all_rooms()
        _LOGGER.debug("Available rooms: %s", [(room["id"], room["name"]) for room in all_rooms])

        # Categorize chores
        due_today: list[dict[str, Any]] = []
        due_this_week: list[dict[str, Any]] = []
        overdue: list[dict[str, Any]] = []
        all_active_chores: list[dict[str, Any]] = []
        by_room: dict[str, list[dict[str, Any]]] = {room["id"]: [] for room in all_rooms}

        for chore in self.store.chores.values():
            # Skip completed one-off chores
            if chore.get("is_completed", False):
                continue

            next_due = date.fromisoformat(chore["next_due"])
            room_name = self._get_room_name(chore["room_id"], all_rooms)
            chore_with_room = {
                **chore,
                "room_name": room_name,
            }

            # Add to all active chores list (with room_name)
            all_active_chores.append(chore_with_room)

            # Debug logging for troubleshooting
            _LOGGER.debug(
                "Chore: %s, Room ID: %s, Room Name: %s, Next Due: %s, Assigned To: %s",
                chore["name"],
                chore["room_id"],
                room_name,
                chore["next_due"],
                chore.get("assigned_to"),
            )

            # Add days_overdue for all chores
            chore_with_room["days_overdue"] = max(0, (today - next_due).days)

            # Categorize by due date
            if next_due < today:
                overdue.append(chore_with_room)
                # Overdue items are also due today
                due_today.append(chore_with_room)
            elif next_due == today:
                due_today.append(chore_with_room)

            # Due in next 7 days (rolling window, not calendar week)
            if today < next_due <= next_seven_days:
                due_this_week.append(chore_with_room)

            # Group by room
            room_id = chore["room_id"]
            if room_id in by_room:
                by_room[room_id].append(chore_with_room)

        # Get all users (HA + custom)
        all_users = await self.async_get_users()

        result = {
            "today": today.isoformat(),
            "seven_days_from_today": next_seven_days.isoformat(),
            "due_today": due_today,
            "due_today_count": len(due_today),
            "due_this_week": due_this_week,
            "due_this_week_count": len(due_this_week),
            "overdue": overdue,
            "overdue_count": len(overdue),
            "has_overdue": bool(overdue),
            "by_room": by_room,
            "rooms": all_rooms,
            "users": all_users,
            "chores": all_active_chores,
            "total_chores": len(all_active_chores),
        }

        _LOGGER.debug(
            "Data update complete. Total chores: %d, Due today: %d, Due this week: %d, Overdue: %d",
            len(self.store.chores),
            len(due_today),
            len(due_this_week),
            len(overdue),
        )

        return result

    async def _get_all_rooms(self) -> list[dict[str, Any]]:
        """Get all rooms from HA Area Registry and custom rooms."""
        rooms: list[dict[str, Any]] = []

        # Get HA Areas
        from homeassistant.helpers import area_registry as ar

        area_registry: AreaRegistry = ar.async_get(self.hass)
        for area in area_registry.async_list_areas():
            rooms.append(
                {
                    "id": f"{ROOM_PREFIX_AREA}{area.id}",
                    "name": area.name,
                    "icon": area.icon or "mdi:home",
                    "is_custom": False,
                }
            )

        # Add custom rooms
        for room in self.store.rooms.values():
            rooms.append(room)

        return rooms

    def _invalidate_room_cache(self) -> None:
        """Invalidate the room name cache when rooms are modified."""
        self._room_name_cache = None

    def _get_room_name(self, room_id: str, all_rooms: list[dict[str, Any]]) -> str:
        """Get the display name for a room."""
        # Build cache once if empty or invalidated
        if not self._room_name_cache:
            self._room_name_cache = {room["id"]: room["name"] for room in all_rooms}
        return self._room_name_cache.get(room_id, "Unknown Room")

    async def async_get_users(self) -> list[dict[str, Any]]:
        """Get all users (HA users + custom users)."""
        users = []

        # Get Home Assistant users (filter out system-generated accounts)
        ha_users = await self.hass.auth.async_get_users()
        for user in ha_users:
            # Skip system-generated users (Supervisor, Home Assistant Cloud, etc.)
            if user.system_generated:
                continue
            if user.is_active:
                users.append(
                    {
                        "id": user.id,
                        "name": user.name or user.id,
                        "is_custom": False,
                        "is_active": True,
                    }
                )

        # Add custom users
        for user in self.store.users.values():
            users.append(user)

        return users

    async def async_get_user_name(self, user_id: str) -> str:
        """Get a user's display name by ID (checks both HA users and custom users)."""
        # Check custom users first
        if user_id in self.store.users:
            return self.store.users[user_id]["name"]

        # Check HA users
        users = await self.hass.auth.async_get_users()
        for user in users:
            if user.id == user_id:
                return user.name or user_id
        return user_id

    async def async_complete_chore(self, chore_id: str, user_id: str | None = None) -> dict[str, Any] | None:
        """Complete a chore and reschedule it."""
        if chore_id not in self.store.chores:
            return None

        chore = self.store.chores[chore_id]
        today = dt_util.now().date()

        # For anchored recurrence, calculate from the current due date to maintain pattern
        # For interval-based, calculate from today (completion date)
        recurrence_type = chore.get("recurrence_type", RECURRENCE_INTERVAL)
        if recurrence_type == RECURRENCE_ANCHORED and chore.get("next_due"):
            current_due = date.fromisoformat(chore["next_due"])
            # Use whichever is later to ensure we get the NEXT occurrence
            calc_from = max(today, current_due)
        else:
            calc_from = today

        next_due = calculate_next_due_for_chore(chore, calc_from)

        # Get user info
        if user_id is None:
            user_id = "unknown"
        user_name = await self.async_get_user_name(user_id)

        result = self.store.complete_chore(chore_id, user_id, user_name, next_due)
        if result:
            await self.store.async_save()
            await self.async_request_refresh()
        return result

    async def async_skip_chore(self, chore_id: str) -> dict[str, Any] | None:
        """Skip a chore to the next occurrence."""
        if chore_id not in self.store.chores:
            return None

        chore = self.store.chores[chore_id]
        current_due = date.fromisoformat(chore["next_due"])
        # Use the new anchored-aware calculation
        next_due = calculate_next_due_for_chore(chore, current_due)

        result = self.store.skip_chore(chore_id, next_due)
        if result:
            await self.store.async_save()
            await self.async_request_refresh()
        return result

    async def async_snooze_chore(self, chore_id: str) -> dict[str, Any] | None:
        """Snooze a chore by postponing it 1 day."""
        if chore_id not in self.store.chores:
            return None

        result = self.store.snooze_chore(chore_id)
        if result:
            await self.store.async_save()
            await self.async_request_refresh()
        return result

    async def async_add_room(self, name: str, icon: str | None = None) -> dict[str, Any]:
        """Add a custom room."""
        room = self.store.add_room(name, icon)
        self._invalidate_room_cache()  # Cache must be refreshed
        await self.store.async_save()
        await self.async_request_refresh()
        return room

    async def async_update_room(
        self, room_id: str, name: str | None = None, icon: str | None = None
    ) -> dict[str, Any] | None:
        """Update a custom room."""
        room = self.store.update_room(room_id, name, icon)
        if room:
            self._invalidate_room_cache()  # Cache must be refreshed
            await self.store.async_save()
            await self.async_request_refresh()
        return room

    async def async_remove_room(self, room_id: str) -> bool:
        """Remove a custom room."""
        result = self.store.remove_room(room_id)
        if result:
            self._invalidate_room_cache()  # Cache must be refreshed
            await self.store.async_save()
            await self.async_request_refresh()
        return result

    async def async_add_user(self, name: str, avatar: str | None = None) -> dict[str, Any]:
        """Add a custom user."""
        user = self.store.add_user(name, avatar)
        await self.store.async_save()
        await self.async_request_refresh()
        return user

    async def async_update_user(
        self, user_id: str, name: str | None = None, avatar: str | None = None
    ) -> dict[str, Any] | None:
        """Update a custom user."""
        user = self.store.update_user(user_id, name, avatar)
        if user:
            await self.store.async_save()
            await self.async_request_refresh()
        return user

    async def async_remove_user(self, user_id: str) -> bool:
        """Remove a custom user."""
        result = self.store.remove_user(user_id)
        if result:
            await self.store.async_save()
            await self.async_request_refresh()
        return result

    async def async_add_chore(
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
    ) -> dict[str, Any]:
        """Add a new chore."""
        # Validate room exists before creating chore
        all_rooms = await self._get_all_rooms()
        valid_room_ids = {room["id"] for room in all_rooms}
        if room_id not in valid_room_ids:
            raise ValueError(
                f"Invalid room ID: {room_id}. Room does not exist. "
                f"Please create the room first or use an existing HA Area."
            )

        _LOGGER.info(
            "Coordinator: Adding chore '%s' with recurrence_type: %s, assigned_to: %s",
            name,
            recurrence_type,
            assigned_to,
        )
        chore = self.store.add_chore(
            name,
            room_id,
            frequency,
            start_date,
            assigned_to,
            recurrence_type,
            anchor_days_of_week,
            anchor_type,
            anchor_day_of_month,
            anchor_week,
            anchor_weekday,
            interval,
        )
        _LOGGER.info("Coordinator: Created chore data: %s", chore)
        await self.store.async_save_debounced()  # Use debounced save for performance
        await self.async_request_refresh()
        return chore

    async def async_update_chore(
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
    ) -> dict[str, Any] | None:
        """Update an existing chore."""
        # Validate room exists if room_id is being updated
        if room_id is not None:
            all_rooms = await self._get_all_rooms()
            valid_room_ids = {room["id"] for room in all_rooms}
            if room_id not in valid_room_ids:
                raise ValueError(
                    f"Invalid room ID: {room_id}. Room does not exist. "
                    f"Please create the room first or use an existing HA Area."
                )

        chore = self.store.update_chore(
            chore_id,
            name,
            room_id,
            frequency,
            next_due,
            assigned_to,
            recurrence_type,
            anchor_days_of_week,
            anchor_type,
            anchor_day_of_month,
            anchor_week,
            anchor_weekday,
            interval,
        )
        if chore:
            await self.store.async_save_debounced()  # Use debounced save for performance
            await self.async_request_refresh()
        return chore

    async def async_remove_chore(self, chore_id: str) -> bool:
        """Remove a chore."""
        result = self.store.remove_chore(chore_id)
        if result:
            await self.store.async_save()  # Use immediate save for deletions
            await self.async_request_refresh()
        return result
