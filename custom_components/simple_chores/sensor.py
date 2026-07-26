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
from .entity import get_device_info

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
        self._attr_device_info = get_device_info(entry)
        self._key = key
        self.entity_id = sensor_entity_id


class SimpleChoresDueTodaySensor(SimpleChoresBaseSensor):
    """Sensor showing number of chores due today."""

    def __init__(self, coordinator: SimpleChoresCoordinator, entry: ConfigEntry) -> None:
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
        return {"date": self.coordinator.data.get("today")}


class SimpleChoresDueThisWeekSensor(SimpleChoresBaseSensor):
    """Sensor showing number of chores due in next 7 days."""

    def __init__(self, coordinator: SimpleChoresCoordinator, entry: ConfigEntry) -> None:
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
        return {
            "period_start": self.coordinator.data.get("today"),
            "period_end": self.coordinator.data.get("seven_days_from_today"),
        }


class SimpleChoresOverdueSensor(SimpleChoresBaseSensor):
    """Sensor showing number of overdue chores."""

    def __init__(self, coordinator: SimpleChoresCoordinator, entry: ConfigEntry) -> None:
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
            "max_days_overdue": max((c.get("days_overdue", 0) for c in chores), default=0),
        }


class SimpleChoresTotalSensor(SimpleChoresBaseSensor):
    """Sensor showing total number of chores."""

    def __init__(self, coordinator: SimpleChoresCoordinator, entry: ConfigEntry) -> None:
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

        _LOGGER.debug("Total sensor attributes: %d chores", len(all_chores))

        return {
            "total_count": len(all_chores),
            # Chores are served over the simple_chores/chores websocket command
            # rather than published here - the list outgrew the 16 KB attribute
            # limit. This digest tells the card when its copy is stale.
            "revision": self.coordinator.data.get("revision", ""),
            # Raw completion history is NOT published here. It grew without
            # bound and pushed this attribute past the recorder's 16 KB limit,
            # so the card reads these summaries instead and fetches raw entries
            # on demand via the simple_chores/history websocket command.
            "statistics": self.coordinator.data.get("statistics", {}),
            "rooms": [
                {
                    "id": r["id"],
                    "name": r["name"],
                    # The focus view badges each card with its room icon
                    "icon": r.get("icon", "mdi:home"),
                    "is_custom": r.get("is_custom", False),
                }
                for r in self.coordinator.data.get("rooms", [])
            ],
            "users": self.coordinator.data.get("users", []),
        }
