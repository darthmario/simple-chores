"""Calendar platform for Household Tasks integration."""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Any

from homeassistant.components.calendar import CalendarEntity, CalendarEvent
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from homeassistant.util import dt as dt_util

from .const import DOMAIN
from .coordinator import HouseholdTasksCoordinator, calculate_next_due

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Simple Chores calendar from a config entry."""
    coordinator: HouseholdTasksCoordinator = hass.data[DOMAIN][entry.entry_id]

    async_add_entities([HouseholdTasksCalendar(coordinator, entry)])


class HouseholdTasksCalendar(
    CoordinatorEntity[HouseholdTasksCoordinator], CalendarEntity
):
    """Calendar entity for Household Tasks."""

    _attr_has_entity_name = True

    def __init__(
        self, coordinator: HouseholdTasksCoordinator, entry: ConfigEntry
    ) -> None:
        """Initialize the calendar."""
        super().__init__(coordinator)
        self._attr_unique_id = f"{entry.entry_id}_calendar"
        self._attr_name = "Household Tasks"
        self._attr_icon = "mdi:calendar-check"

    @property
    def event(self) -> CalendarEvent | None:
        """Return the next upcoming event."""
        if self.coordinator.data is None:
            return None

        # Get chores due today first
        due_today = self.coordinator.data.get("due_today", [])
        if due_today:
            chore = due_today[0]
            today = date.today()
            return CalendarEvent(
                start=today,
                end=today + timedelta(days=1),
                summary=chore["name"],
                description=f"Room: {chore.get('room_name', 'Unknown')}\nFrequency: {chore['frequency']}",
            )

        # Otherwise get next upcoming chore
        chores = self.coordinator.data.get("chores", [])
        if not chores:
            return None

        # Find the next due chore
        sorted_chores = sorted(chores, key=lambda c: c["next_due"])
        if sorted_chores:
            chore = sorted_chores[0]
            due_date = date.fromisoformat(chore["next_due"])
            return CalendarEvent(
                start=due_date,
                end=due_date + timedelta(days=1),
                summary=chore["name"],
                description=f"Room: {chore.get('room_name', 'Unknown')}\nFrequency: {chore['frequency']}",
            )

        return None

    async def async_get_events(
        self,
        hass: HomeAssistant,
        start_date: datetime,
        end_date: datetime,
    ) -> list[CalendarEvent]:
        """Return calendar events within a datetime range."""
        events: list[CalendarEvent] = []

        if self.coordinator.data is None:
            return events

        chores = self.coordinator.data.get("chores", [])
        rooms = self.coordinator.data.get("rooms", [])

        # Create a room lookup
        room_names = {r["id"]: r["name"] for r in rooms}

        start = start_date.date()
        end = end_date.date()

        for chore in chores:
            # Generate events for this chore within the date range
            chore_events = self._generate_chore_events(
                chore, room_names, start, end
            )
            events.extend(chore_events)

        return sorted(events, key=lambda e: e.start)

    def _generate_chore_events(
        self,
        chore: dict[str, Any],
        room_names: dict[str, str],
        start: date,
        end: date,
    ) -> list[CalendarEvent]:
        """Generate calendar events for a chore within a date range."""
        events: list[CalendarEvent] = []
        room_name = room_names.get(chore["room_id"], "Unknown Room")
        frequency = chore["frequency"]

        # Start from the chore's next due date
        try:
            current_due = date.fromisoformat(chore["next_due"])
        except ValueError:
            _LOGGER.warning("Invalid date format for chore %s: %s", chore["id"], chore["next_due"])
            continue

        # If the due date is before our start, advance it until it's within range
        while current_due < start:
            try:
                current_due = calculate_next_due(current_due, frequency)
            except Exception as e:
                _LOGGER.error("Error calculating next due date for chore %s: %s", chore["id"], e)
                break

        # Generate events until we pass the end date
        # Limit to 100 events to prevent infinite loops
        count = 0
        while current_due <= end and count < 100:
            try:
                events.append(
                    CalendarEvent(
                        start=current_due,
                        end=current_due + timedelta(days=1),
                        summary=chore["name"],
                        description=f"Room: {room_name}\nFrequency: {frequency}",
                        uid=f"{chore['id']}_{current_due.isoformat()}",
                    )
                )
                current_due = calculate_next_due(current_due, frequency)
                count += 1
            except Exception as e:
                _LOGGER.error("Error generating calendar event for chore %s: %s", chore["id"], e)
                break

        return events