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
    FREQUENCY_DAILY,
    FREQUENCY_MONTHLY,
    FREQUENCY_QUARTERLY,
    FREQUENCY_WEEKLY,
    FREQUENCY_YEARLY,
    ROOM_PREFIX_AREA,
)
from .store import HouseholdTasksStore

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
    if frequency == FREQUENCY_MONTHLY:
        return from_date + relativedelta(months=1)
    if frequency == FREQUENCY_QUARTERLY:
        return from_date + relativedelta(months=3)
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


class HouseholdTasksCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Coordinator to manage household tasks data."""

    config_entry: ConfigEntry

    def __init__(
        self,
        hass: HomeAssistant,
        store: HouseholdTasksStore,
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

    async def _async_update_data(self) -> dict[str, Any]:
        """Calculate due chores and prepare data for entities."""
        today = date.today()
        week_start, week_end = get_week_bounds(today)

        # Get all rooms (HA Areas + custom)
        all_rooms = await self._get_all_rooms()

        # Categorize chores
        due_today: list[dict[str, Any]] = []
        due_this_week: list[dict[str, Any]] = []
        overdue: list[dict[str, Any]] = []
        by_room: dict[str, list[dict[str, Any]]] = {room["id"]: [] for room in all_rooms}

        for chore in self.store.chores.values():
            next_due = date.fromisoformat(chore["next_due"])
            chore_with_room = {
                **chore,
                "room_name": self._get_room_name(chore["room_id"], all_rooms),
            }

            # Categorize by due date
            if next_due < today:
                overdue.append(chore_with_room)
                # Overdue items are also due today
                due_today.append(chore_with_room)
            elif next_due == today:
                due_today.append(chore_with_room)

            if week_start <= next_due <= week_end:
                due_this_week.append(chore_with_room)

            # Group by room
            room_id = chore["room_id"]
            if room_id in by_room:
                by_room[room_id].append(chore_with_room)

        return {
            "today": today.isoformat(),
            "week_start": week_start.isoformat(),
            "week_end": week_end.isoformat(),
            "due_today": due_today,
            "due_today_count": len(due_today),
            "due_this_week": due_this_week,
            "due_this_week_count": len(due_this_week),
            "overdue": overdue,
            "overdue_count": len(overdue),
            "has_overdue": len(overdue) > 0,
            "by_room": by_room,
            "rooms": all_rooms,
            "chores": list(self.store.chores.values()),
            "total_chores": len(self.store.chores),
        }

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

    def _get_room_name(
        self, room_id: str, all_rooms: list[dict[str, Any]]
    ) -> str:
        """Get the display name for a room."""
        for room in all_rooms:
            if room["id"] == room_id:
                return room["name"]
        return "Unknown Room"

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
        await self.store.async_save()
        await self.async_request_refresh()
        return room

    async def async_update_room(
        self, room_id: str, name: str | None = None, icon: str | None = None
    ) -> dict[str, Any] | None:
        """Update a custom room."""
        room = self.store.update_room(room_id, name, icon)
        if room:
            await self.store.async_save()
            await self.async_request_refresh()
        return room

    async def async_remove_room(self, room_id: str) -> bool:
        """Remove a custom room."""
        result = self.store.remove_room(room_id)
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
    ) -> dict[str, Any]:
        """Add a new chore."""
        chore = self.store.add_chore(name, room_id, frequency, start_date)
        await self.store.async_save()
        await self.async_request_refresh()
        return chore

    async def async_update_chore(
        self,
        chore_id: str,
        name: str | None = None,
        room_id: str | None = None,
        frequency: str | None = None,
    ) -> dict[str, Any] | None:
        """Update an existing chore."""
        chore = self.store.update_chore(chore_id, name, room_id, frequency)
        if chore:
            await self.store.async_save()
            await self.async_request_refresh()
        return chore

    async def async_remove_chore(self, chore_id: str) -> bool:
        """Remove a chore."""
        result = self.store.remove_chore(chore_id)
        if result:
            await self.store.async_save()
            await self.async_request_refresh()
        return result