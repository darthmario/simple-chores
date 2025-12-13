"""Sensor platform for Simple Chores integration."""
from __future__ import annotations

import logging
from typing import Any

from homeassistant.components.sensor import SensorEntity, SensorStateClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import SimpleChoresCoordinator

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Simple Chores sensors from a config entry."""
    coordinator: SimpleChoresCoordinator = hass.data[DOMAIN][entry.entry_id]

    entities: list[SensorEntity] = [
        SimpleChoresDueTodaySensor(coordinator, entry),
        SimpleChoresDueThisWeekSensor(coordinator, entry),
        SimpleChoresOverdueSensor(coordinator, entry),
        SimpleChoresTotalSensor(coordinator, entry),
    ]

    async_add_entities(entities)


class SimpleChoresBaseSensor(CoordinatorEntity[SimpleChoresCoordinator], SensorEntity):
    """Base class for Simple Chores sensors."""

    _attr_has_entity_name = True
    _attr_state_class = SensorStateClass.TOTAL

    def __init__(
        self,
        coordinator: SimpleChoresCoordinator,
        entry: ConfigEntry,
        key: str,
        name: str,
        icon: str,
    ) -> None:
        """Initialize the sensor."""
        super().__init__(coordinator)
        self._attr_unique_id = f"{entry.entry_id}_{key}"
        self._attr_name = name
        self._attr_icon = icon
        self._key = key


class SimpleChoresDueTodaySensor(SimpleChoresBaseSensor):
    """Sensor showing number of chores due today."""

    def __init__(
        self, coordinator: SimpleChoresCoordinator, entry: ConfigEntry
    ) -> None:
        """Initialize the sensor."""
        super().__init__(
            coordinator,
            entry,
            "due_today",
            "Chores Due Today",
            "mdi:clipboard-check-outline",
        )

    @property
    def native_value(self) -> int:
        """Return the number of chores due today."""
        if self.coordinator.data is None:
            return 0
        return self.coordinator.data.get("due_today_count", 0)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return additional state attributes."""
        if self.coordinator.data is None:
            return {}
        chores = self.coordinator.data.get("due_today", [])
        return {
            "chores": [
                {
                    "id": c["id"],
                    "name": c["name"],
                    "room": c.get("room_name", "Unknown"),
                    "frequency": c["frequency"],
                }
                for c in chores
            ],
            "date": self.coordinator.data.get("today"),
        }


class SimpleChoresDueThisWeekSensor(SimpleChoresBaseSensor):
    """Sensor showing number of chores due this week."""

    def __init__(
        self, coordinator: SimpleChoresCoordinator, entry: ConfigEntry
    ) -> None:
        """Initialize the sensor."""
        super().__init__(
            coordinator,
            entry,
            "due_this_week",
            "Chores Due This Week",
            "mdi:calendar-week",
        )

    @property
    def native_value(self) -> int:
        """Return the number of chores due this week."""
        if self.coordinator.data is None:
            return 0
        return self.coordinator.data.get("due_this_week_count", 0)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return additional state attributes."""
        if self.coordinator.data is None:
            return {}
        chores = self.coordinator.data.get("due_this_week", [])
        return {
            "chores": [
                {
                    "id": c["id"],
                    "name": c["name"],
                    "room": c.get("room_name", "Unknown"),
                    "frequency": c["frequency"],
                    "due_date": c["next_due"],
                }
                for c in chores
            ],
            "week_start": self.coordinator.data.get("week_start"),
            "week_end": self.coordinator.data.get("week_end"),
        }


class SimpleChoresOverdueSensor(SimpleChoresBaseSensor):
    """Sensor showing number of overdue chores."""

    def __init__(
        self, coordinator: SimpleChoresCoordinator, entry: ConfigEntry
    ) -> None:
        """Initialize the sensor."""
        super().__init__(
            coordinator,
            entry,
            "overdue",
            "Overdue Chores",
            "mdi:alert-circle-outline",
        )

    @property
    def native_value(self) -> int:
        """Return the number of overdue chores."""
        if self.coordinator.data is None:
            return 0
        return self.coordinator.data.get("overdue_count", 0)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return additional state attributes."""
        if self.coordinator.data is None:
            return {}
        chores = self.coordinator.data.get("overdue", [])
        return {
            "chores": [
                {
                    "id": c["id"],
                    "name": c["name"],
                    "room": c.get("room_name", "Unknown"),
                    "frequency": c["frequency"],
                    "due_date": c["next_due"],
                }
                for c in chores
            ],
        }


class SimpleChoresTotalSensor(SimpleChoresBaseSensor):
    """Sensor showing total number of chores."""

    def __init__(
        self, coordinator: SimpleChoresCoordinator, entry: ConfigEntry
    ) -> None:
        """Initialize the sensor."""
        super().__init__(
            coordinator,
            entry,
            "total",
            "Total Chores",
            "mdi:clipboard-list-outline",
        )

    @property
    def native_value(self) -> int:
        """Return the total number of chores."""
        if self.coordinator.data is None:
            return 0
        return self.coordinator.data.get("total_chores", 0)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return additional state attributes."""
        if self.coordinator.data is None:
            return {}
        
        # Get all chores from the coordinator data
        all_chores = self.coordinator.data.get("chores", [])
        
        return {
            "chores": [
                {
                    "id": c["id"],
                    "name": c["name"],
                    "room_id": c.get("room_id"),
                    "room_name": c.get("room_name", "Unknown"),
                    "frequency": c["frequency"],
                    "next_due": c["next_due"],
                    "last_completed": c.get("last_completed"),
                    "last_completed_by": c.get("last_completed_by"),
                    "created_at": c.get("created_at"),
                }
                for c in all_chores
            ],
            "total_count": len(all_chores),
            "completion_history": self.coordinator.store.history,
            "rooms": [
                {"id": r["id"], "name": r["name"], "is_custom": r.get("is_custom", False)}
                for r in self.coordinator.data.get("rooms", [])
            ],
        }

