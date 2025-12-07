"""The Simple Chores integration."""
from __future__ import annotations

import logging
from datetime import date, datetime, time, timedelta
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.event import async_track_time_change

from .const import (
    ATTR_CHORE_ID,
    ATTR_CHORE_NAME,
    ATTR_FREQUENCY,
    ATTR_ICON,
    ATTR_ROOM_ID,
    ATTR_ROOM_NAME,
    ATTR_START_DATE,
    ATTR_USER_ID,
    CONF_NOTIFICATION_TIME,
    CONF_NOTIFICATIONS_ENABLED,
    CONF_NOTIFY_TARGETS,
    DEFAULT_NOTIFICATION_TIME,
    DEFAULT_NOTIFICATIONS_ENABLED,
    DOMAIN,
    FREQUENCIES,
    SERVICE_ADD_CHORE,
    SERVICE_ADD_ROOM,
    SERVICE_COMPLETE_CHORE,
    SERVICE_GET_HISTORY,
    SERVICE_GET_USER_STATS,
    SERVICE_REMOVE_CHORE,
    SERVICE_REMOVE_ROOM,
    SERVICE_SEND_NOTIFICATION,
    SERVICE_SKIP_CHORE,
    SERVICE_UPDATE_CHORE,
    SERVICE_UPDATE_ROOM,
)
from .coordinator import HouseholdTasksCoordinator
from .store import HouseholdTasksStore

_LOGGER = logging.getLogger(__name__)

PLATFORMS: list[Platform] = [
    Platform.SENSOR,
    Platform.BINARY_SENSOR,
    Platform.CALENDAR,
]

# Service schemas
SERVICE_ADD_ROOM_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_ROOM_NAME): cv.string,
        vol.Optional(ATTR_ICON): cv.string,
    }
)

SERVICE_REMOVE_ROOM_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_ROOM_ID): cv.string,
    }
)

SERVICE_UPDATE_ROOM_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_ROOM_ID): cv.string,
        vol.Optional(ATTR_ROOM_NAME): cv.string,
        vol.Optional(ATTR_ICON): cv.string,
    }
)

SERVICE_ADD_CHORE_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_CHORE_NAME): cv.string,
        vol.Required(ATTR_ROOM_ID): cv.string,
        vol.Required(ATTR_FREQUENCY): vol.In(FREQUENCIES),
        vol.Optional(ATTR_START_DATE): cv.date,
    }
)

SERVICE_REMOVE_CHORE_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_CHORE_ID): cv.string,
    }
)

SERVICE_UPDATE_CHORE_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_CHORE_ID): cv.string,
        vol.Optional(ATTR_CHORE_NAME): cv.string,
        vol.Optional(ATTR_ROOM_ID): cv.string,
        vol.Optional(ATTR_FREQUENCY): vol.In(FREQUENCIES),
    }
)

SERVICE_COMPLETE_CHORE_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_CHORE_ID): cv.string,
        vol.Optional(ATTR_USER_ID): cv.string,
    }
)

SERVICE_SKIP_CHORE_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_CHORE_ID): cv.string,
    }
)

SERVICE_GET_HISTORY_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_CHORE_ID): cv.string,
    }
)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Household Tasks from a config entry."""
    hass.data.setdefault(DOMAIN, {})

    # Initialize store and load data
    store = HouseholdTasksStore(hass)
    await store.async_load()

    # Create coordinator
    coordinator = HouseholdTasksCoordinator(hass, store, entry)
    await coordinator.async_config_entry_first_refresh()

    hass.data[DOMAIN][entry.entry_id] = coordinator

    # Set up platforms
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    # Register services
    await _async_setup_services(hass, coordinator)

    # Set up notification scheduler
    await _async_setup_notification_scheduler(hass, entry, coordinator)

    # Listen for options updates
    entry.async_on_unload(entry.add_update_listener(_async_update_listener))

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    if unload_ok := await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
        hass.data[DOMAIN].pop(entry.entry_id)

    return unload_ok


async def _async_update_listener(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Handle options update."""
    await hass.config_entries.async_reload(entry.entry_id)


async def _async_setup_services(
    hass: HomeAssistant, coordinator: HouseholdTasksCoordinator
) -> None:
    """Set up services for the integration."""

    async def handle_add_room(call: ServiceCall) -> None:
        """Handle add_room service call."""
        name = call.data[ATTR_ROOM_NAME]
        icon = call.data.get(ATTR_ICON)
        await coordinator.async_add_room(name, icon)

    async def handle_remove_room(call: ServiceCall) -> None:
        """Handle remove_room service call."""
        room_id = call.data[ATTR_ROOM_ID]
        await coordinator.async_remove_room(room_id)

    async def handle_update_room(call: ServiceCall) -> None:
        """Handle update_room service call."""
        room_id = call.data[ATTR_ROOM_ID]
        name = call.data.get(ATTR_ROOM_NAME)
        icon = call.data.get(ATTR_ICON)
        await coordinator.async_update_room(room_id, name, icon)

    async def handle_add_chore(call: ServiceCall) -> None:
        """Handle add_chore service call."""
        name = call.data[ATTR_CHORE_NAME]
        room_id = call.data[ATTR_ROOM_ID]
        frequency = call.data[ATTR_FREQUENCY]
        start_date = call.data.get(ATTR_START_DATE)
        await coordinator.async_add_chore(name, room_id, frequency, start_date)

    async def handle_remove_chore(call: ServiceCall) -> None:
        """Handle remove_chore service call."""
        chore_id = call.data[ATTR_CHORE_ID]
        await coordinator.async_remove_chore(chore_id)

    async def handle_update_chore(call: ServiceCall) -> None:
        """Handle update_chore service call."""
        chore_id = call.data[ATTR_CHORE_ID]
        name = call.data.get(ATTR_CHORE_NAME)
        room_id = call.data.get(ATTR_ROOM_ID)
        frequency = call.data.get(ATTR_FREQUENCY)
        await coordinator.async_update_chore(chore_id, name, room_id, frequency)

    async def handle_complete_chore(call: ServiceCall) -> None:
        """Handle complete_chore service call."""
        chore_id = call.data[ATTR_CHORE_ID]
        # Get user ID from service call context or override
        user_id = call.data.get(ATTR_USER_ID)
        if user_id is None and call.context.user_id:
            user_id = call.context.user_id
        await coordinator.async_complete_chore(chore_id, user_id)

    async def handle_skip_chore(call: ServiceCall) -> None:
        """Handle skip_chore service call."""
        chore_id = call.data[ATTR_CHORE_ID]
        await coordinator.async_skip_chore(chore_id)

    async def handle_get_history(call: ServiceCall) -> dict[str, Any]:
        """Handle get_history service call."""
        chore_id = call.data[ATTR_CHORE_ID]
        history = coordinator.store.get_chore_history(chore_id)
        return {"history": history}

    async def handle_get_user_stats(call: ServiceCall) -> dict[str, Any]:
        """Handle get_user_stats service call."""
        stats = coordinator.store.get_user_stats()
        return {"stats": stats}

    async def handle_send_notification(call: ServiceCall) -> None:
        """Handle send_due_notification service call."""
        await _async_send_due_notification(hass, coordinator)

    # Register all services
    hass.services.async_register(
        DOMAIN, SERVICE_ADD_ROOM, handle_add_room, schema=SERVICE_ADD_ROOM_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_REMOVE_ROOM, handle_remove_room, schema=SERVICE_REMOVE_ROOM_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_UPDATE_ROOM, handle_update_room, schema=SERVICE_UPDATE_ROOM_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_ADD_CHORE, handle_add_chore, schema=SERVICE_ADD_CHORE_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_REMOVE_CHORE, handle_remove_chore, schema=SERVICE_REMOVE_CHORE_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_UPDATE_CHORE, handle_update_chore, schema=SERVICE_UPDATE_CHORE_SCHEMA
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_COMPLETE_CHORE,
        handle_complete_chore,
        schema=SERVICE_COMPLETE_CHORE_SCHEMA,
    )
    hass.services.async_register(
        DOMAIN, SERVICE_SKIP_CHORE, handle_skip_chore, schema=SERVICE_SKIP_CHORE_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_GET_HISTORY, handle_get_history, schema=SERVICE_GET_HISTORY_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_GET_USER_STATS, handle_get_user_stats
    )
    hass.services.async_register(
        DOMAIN, SERVICE_SEND_NOTIFICATION, handle_send_notification
    )


async def _async_setup_notification_scheduler(
    hass: HomeAssistant,
    entry: ConfigEntry,
    coordinator: HouseholdTasksCoordinator,
) -> None:
    """Set up the daily notification scheduler."""

    @callback
    def _schedule_notification(now: datetime) -> None:
        """Schedule notification check."""
        hass.async_create_task(_async_check_and_notify(hass, entry, coordinator))

    # Get notification time from options
    notification_time_str = entry.options.get(
        CONF_NOTIFICATION_TIME, DEFAULT_NOTIFICATION_TIME
    )

    # Parse time string (HH:MM format)
    try:
        hour, minute = map(int, notification_time_str.split(":"))
    except (ValueError, AttributeError):
        hour, minute = 8, 0

    # Schedule daily notification
    entry.async_on_unload(
        async_track_time_change(
            hass,
            _schedule_notification,
            hour=hour,
            minute=minute,
            second=0,
        )
    )


async def _async_check_and_notify(
    hass: HomeAssistant,
    entry: ConfigEntry,
    coordinator: HouseholdTasksCoordinator,
) -> None:
    """Check for due chores and send notification if enabled."""
    if not entry.options.get(CONF_NOTIFICATIONS_ENABLED, DEFAULT_NOTIFICATIONS_ENABLED):
        return

    await _async_send_due_notification(hass, coordinator, entry)


async def _async_send_due_notification(
    hass: HomeAssistant,
    coordinator: HouseholdTasksCoordinator,
    entry: ConfigEntry | None = None,
) -> None:
    """Send notification about chores due today."""
    # Refresh data first
    await coordinator.async_request_refresh()

    if coordinator.data is None:
        return

    due_today = coordinator.data.get("due_today", [])
    if not due_today:
        return

    # Build notification message
    chore_list = "\n".join([f"• {c['name']} ({c.get('room_name', 'Unknown')})" for c in due_today])
    message = f"You have {len(due_today)} chore(s) due today:\n{chore_list}"

    # Get notify targets from options
    notify_targets = []
    if entry:
        notify_targets = entry.options.get(CONF_NOTIFY_TARGETS, [])

    # If no specific targets, try to notify all mobile apps
    if not notify_targets:
        # Find all mobile app notify services
        for service in hass.services.async_services().get("notify", {}):
            if service.startswith("mobile_app_"):
                notify_targets.append(service)

    # Send notifications
    for target in notify_targets:
        try:
            await hass.services.async_call(
                "notify",
                target,
                {
                    "title": "Household Tasks Due Today",
                    "message": message,
                    "data": {
                        "tag": "household_tasks_due",
                        "actions": [
                            {
                                "action": "OPEN_APP",
                                "title": "Open Home Assistant",
                            }
                        ],
                    },
                },
            )
        except Exception as err:
            _LOGGER.warning("Failed to send notification to %s: %s", target, err)