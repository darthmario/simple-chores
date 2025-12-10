"""Sensor platform for Household Tasks integration."""
from __future__ import annotations

import logging
from typing import Any

from homeassistant.components.sensor import SensorEntity, SensorStateClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import HouseholdTasksCoordinator

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Household Tasks sensors from a config entry."""
    _LOGGER.info("Setting up Simple Chores sensors...")
    
    try:
        coordinator: HouseholdTasksCoordinator = hass.data[DOMAIN][entry.entry_id]
        _LOGGER.info("Got coordinator: %s", coordinator)
        _LOGGER.info("Coordinator data: %s", coordinator.data)

        entities: list[SensorEntity] = [
            HouseholdTasksDueTodaySensor(coordinator, entry),
            HouseholdTasksDueThisWeekSensor(coordinator, entry),
            HouseholdTasksOverdueSensor(coordinator, entry),
            HouseholdTasksTotalSensor(coordinator, entry),
        ]

        _LOGGER.info("Created %d sensor entities", len(entities))
        async_add_entities(entities)
        _LOGGER.info("Simple Chores sensors setup complete!")
        
    except Exception as e:
        _LOGGER.error("Failed to setup Simple Chores sensors: %s", e, exc_info=True)


class HouseholdTasksBaseSensor(CoordinatorEntity[HouseholdTasksCoordinator], SensorEntity):
    """Base class for Household Tasks sensors."""

    _attr_has_entity_name = True
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(
        self,
        coordinator: HouseholdTasksCoordinator,
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


class HouseholdTasksDueTodaySensor(HouseholdTasksBaseSensor):
    """Sensor showing number of chores due today."""

    _attr_native_unit_of_measurement = "chores"

    def __init__(
        self, coordinator: HouseholdTasksCoordinator, entry: ConfigEntry
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


class HouseholdTasksDueThisWeekSensor(HouseholdTasksBaseSensor):
    """Sensor showing number of chores due this week."""

    _attr_native_unit_of_measurement = "chores"

    def __init__(
        self, coordinator: HouseholdTasksCoordinator, entry: ConfigEntry
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


class HouseholdTasksOverdueSensor(HouseholdTasksBaseSensor):
    """Sensor showing number of overdue chores."""

    _attr_native_unit_of_measurement = "chores"

    def __init__(
        self, coordinator: HouseholdTasksCoordinator, entry: ConfigEntry
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


class HouseholdTasksTotalSensor(HouseholdTasksBaseSensor):
    """Sensor showing total number of chores."""

    _attr_native_unit_of_measurement = "chores"

    def __init__(
        self, coordinator: HouseholdTasksCoordinator, entry: ConfigEntry
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
            _LOGGER.error("SIMPLE CHORES: Total sensor - coordinator.data is None!")
            return 0
        value = self.coordinator.data.get("total_chores", 0)
        _LOGGER.error("SIMPLE CHORES: Total sensor returning value: %s", value)
        return value

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return additional state attributes."""
        if self.coordinator.data is None:
            return {}
        return {
            "rooms": [
                {"id": r["id"], "name": r["name"], "is_custom": r.get("is_custom", False)}
                for r in self.coordinator.data.get("rooms", [])
            ],
        }