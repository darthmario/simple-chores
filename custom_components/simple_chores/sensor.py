"""Sensor platform for Simple Chores integration."""
from __future__ import annotations

import logging
from typing import Any

from homeassistant.components.sensor import SensorEntity, SensorStateClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import (
    DOMAIN,
    SENSOR_DUE_NEXT_7_DAYS,
    SENSOR_DUE_TODAY,
    SENSOR_OVERDUE,
    SENSOR_TOTAL,
)
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

    _attr_has_entity_name = False  # We set explicit entity_id
    _attr_state_class = SensorStateClass.TOTAL

    def __init__(
        self,
        coordinator: SimpleChoresCoordinator,
        entry: ConfigEntry,
        key: str,
        name: str,
        icon: str,
        sensor_entity_id: str,
    ) -> None:
        """Initialize the sensor."""
        super().__init__(coordinator)
        self._attr_unique_id = f"{entry.entry_id}_{key}"
        self._attr_name = name
        self._attr_icon = icon
        self._key = key
        self.entity_id = sensor_entity_id


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
            SENSOR_DUE_TODAY,
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
                    "room_id": c.get("room_id"),
                    "frequency": c["frequency"],
                    "assigned_to": c.get("assigned_to"),
                    "next_due": c.get("next_due"),
                    # Recurrence settings
                    "recurrence_type": c.get("recurrence_type", "interval"),
                    "anchor_days_of_week": c.get("anchor_days_of_week", []),
                    "anchor_type": c.get("anchor_type"),
                    "anchor_day_of_month": c.get("anchor_day_of_month"),
                    "anchor_week": c.get("anchor_week"),
                    "anchor_weekday": c.get("anchor_weekday"),
                    "interval": c.get("interval", 1),
                }
                for c in chores
            ],
            "date": self.coordinator.data.get("today"),
        }


class SimpleChoresDueThisWeekSensor(SimpleChoresBaseSensor):
    """Sensor showing number of chores due in next 7 days."""

    def __init__(
        self, coordinator: SimpleChoresCoordinator, entry: ConfigEntry
    ) -> None:
        """Initialize the sensor."""
        super().__init__(
            coordinator,
            entry,
            "due_this_week",
            "Chores Due Next 7 Days",
            "mdi:calendar-clock",
            SENSOR_DUE_NEXT_7_DAYS,
        )

    @property
    def native_value(self) -> int:
        """Return the number of chores due in next 7 days."""
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
                    "room_id": c.get("room_id"),
                    "frequency": c["frequency"],
                    "next_due": c.get("next_due"),
                    "assigned_to": c.get("assigned_to"),
                    # Recurrence settings
                    "recurrence_type": c.get("recurrence_type", "interval"),
                    "anchor_days_of_week": c.get("anchor_days_of_week", []),
                    "anchor_type": c.get("anchor_type"),
                    "anchor_day_of_month": c.get("anchor_day_of_month"),
                    "anchor_week": c.get("anchor_week"),
                    "anchor_weekday": c.get("anchor_weekday"),
                    "interval": c.get("interval", 1),
                }
                for c in chores
            ],
            "period_start": self.coordinator.data.get("today"),
            "period_end": self.coordinator.data.get("seven_days_from_today"),
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
            SENSOR_OVERDUE,
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
                    "room_id": c.get("room_id"),
                    "frequency": c["frequency"],
                    "next_due": c["next_due"],
                    "assigned_to": c.get("assigned_to"),
                    # Recurrence settings
                    "recurrence_type": c.get("recurrence_type", "interval"),
                    "anchor_days_of_week": c.get("anchor_days_of_week", []),
                    "anchor_type": c.get("anchor_type"),
                    "anchor_day_of_month": c.get("anchor_day_of_month"),
                    "anchor_week": c.get("anchor_week"),
                    "anchor_weekday": c.get("anchor_weekday"),
                    "interval": c.get("interval", 1),
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
            SENSOR_TOTAL,
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
        history = self.coordinator.store.history

        _LOGGER.debug(
            "Total sensor attributes: %d chores, %d history entries",
            len(all_chores),
            len(history),
        )

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
                    "assigned_to": c.get("assigned_to"),
                    # Recurrence settings
                    "recurrence_type": c.get("recurrence_type", "interval"),
                    "anchor_days_of_week": c.get("anchor_days_of_week", []),
                    "anchor_type": c.get("anchor_type"),
                    "anchor_day_of_month": c.get("anchor_day_of_month"),
                    "anchor_week": c.get("anchor_week"),
                    "anchor_weekday": c.get("anchor_weekday"),
                    "interval": c.get("interval", 1),
                }
                for c in all_chores
            ],
            "total_count": len(all_chores),
            "completion_history": history,
            "rooms": [
                {"id": r["id"], "name": r["name"], "is_custom": r.get("is_custom", False)}
                for r in self.coordinator.data.get("rooms", [])
            ],
            "users": self.coordinator.data.get("users", []),
        }

