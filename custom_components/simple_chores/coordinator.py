"""DataUpdateCoordinator for the Simple Chores integration."""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import TYPE_CHECKING, Any

from dateutil.relativedelta import relativedelta

from homeassistant.config_entries import ConfigEntry
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator

from .const import (
    DOMAIN,
    FREQUENCY_BIANNUAL,
    FREQUENCY_BIMONTHLY,
    FREQUENCY_BIWEEKLY,
    FREQUENCY_DAILY,
    FREQUENCY_MONTHLY,
    FREQUENCY_QUARTERLY,
    FREQUENCY_WEEKLY,
    FREQUENCY_YEARLY,
    ROOM_PREFIX_AREA,
)
from .store import SimpleChoresStore

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant
    from homeassistant.helpers.area_registry import AreaRegistry

_LOGGER = logging.getLogger(__name__)


def calculate_next_due(from_date: date, frequency: str) -> date:
    """Calculate the next due date based on frequency."""
    if frequency == FREQUENCY_DAILY:
        return from_date + timedelta(days=1)
    if frequency == FREQUENCY_WEEKLY:
        return from_date + timedelta(weeks=1)
    if frequency == FREQUENCY_BIWEEKLY:
        return from_date + timedelta(weeks=2)
    if frequency == FREQUENCY_MONTHLY:
        return from_date + relativedelta(months=1)
    if frequency == FREQUENCY_BIMONTHLY:
        return from_date + relativedelta(months=2)
    if frequency == FREQUENCY_QUARTERLY:
        return from_date + relativedelta(months=3)
    if frequency == FREQUENCY_BIANNUAL:
        return from_date + relativedelta(months=6)
    if frequency == FREQUENCY_YEARLY:
        return from_date + relativedelta(years=1)
    return from_date


def get_week_bounds(for_date: date) -> tuple[date, date]:
    """Get the start (Sunday) and end (Saturday) of the week containing the given date."""
    # Python weekday: Monday=0, Sunday=6
    # We want Sunday=0, so adjust
    days_since_sunday = (for_date.weekday() + 1) % 7
    week_start = for_date - timedelta(days=days_since_sunday)
    week_end = week_start + timedelta(days=6)
    return week_start, week_end


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
        self._room_name_cache: dict[str, str] | None = {}

    async def _async_update_data(self) -> dict[str, Any]:
        """Calculate due chores and prepare data for entities."""
        today = date.today()
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
        by_room: dict[str, list[dict[str, Any]]] = {room["id"]: [] for room in all_rooms}

        for chore in self.store.chores.values():
            next_due = date.fromisoformat(chore["next_due"])
            room_name = self._get_room_name(chore["room_id"], all_rooms)
            chore_with_room = {
                **chore,
                "room_name": room_name,
            }
            
            # Debug logging for troubleshooting
            _LOGGER.debug("Chore: %s, Room ID: %s, Room Name: %s, Next Due: %s, Assigned To: %s", 
                         chore["name"], chore["room_id"], room_name, chore["next_due"], chore.get("assigned_to"))
            _LOGGER.debug("Full chore data: %s", chore)

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
            "chores": list(self.store.chores.values()),
            "total_chores": len(self.store.chores),
        }
        
        _LOGGER.debug("Data update complete. Total chores: %d, Due today: %d, Due this week: %d, Overdue: %d", 
                     len(self.store.chores), len(due_today), len(due_this_week), len(overdue))
        
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

    def _get_room_name(
        self, room_id: str, all_rooms: list[dict[str, Any]]
    ) -> str:
        """Get the display name for a room."""
        # Build cache once if empty or invalidated
        if not self._room_name_cache:
            self._room_name_cache = {room["id"]: room["name"] for room in all_rooms}
        return self._room_name_cache.get(room_id, "Unknown Room")

    async def async_get_users(self) -> list[dict[str, Any]]:
        """Get all Home Assistant users."""
        users = await self.hass.auth.async_get_users()
        return [
            {
                "id": user.id,
                "name": user.name or user.id,
                "is_active": user.is_active,
            }
            for user in users
            if user.is_active
        ]

    async def async_get_user_name(self, user_id: str) -> str:
        """Get a user's display name by ID."""
        users = await self.hass.auth.async_get_users()
        for user in users:
            if user.id == user_id:
                return user.name or user_id
        return user_id

    async def async_complete_chore(
        self, chore_id: str, user_id: str | None = None
    ) -> dict[str, Any] | None:
        """Complete a chore and reschedule it."""
        if chore_id not in self.store.chores:
            return None

        chore = self.store.chores[chore_id]
        today = date.today()
        next_due = calculate_next_due(today, chore["frequency"])

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
        next_due = calculate_next_due(current_due, chore["frequency"])

        result = self.store.skip_chore(chore_id, next_due)
        if result:
            await self.store.async_save()
            await self.async_request_refresh()
        return result

    async def async_add_room(
        self, name: str, icon: str | None = None
    ) -> dict[str, Any]:
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

    async def async_add_chore(
        self,
        name: str,
        room_id: str,
        frequency: str,
        start_date: date | None = None,
        assigned_to: str | None = None,
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

        _LOGGER.info("Coordinator: Adding chore '%s' with assigned_to: %s", name, assigned_to)
        chore = self.store.add_chore(name, room_id, frequency, start_date, assigned_to)
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

        chore = self.store.update_chore(chore_id, name, room_id, frequency, next_due, assigned_to)
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