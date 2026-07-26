"""The Simple Chores integration."""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from typing import Any

import voluptuous as vol
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv

from . import frontend_resources
from .const import (
    ANCHOR_TYPES,
    ATTR_ANCHOR_DAY_OF_MONTH,
    ATTR_ANCHOR_DAYS_OF_WEEK,
    ATTR_ANCHOR_TYPE,
    ATTR_ANCHOR_WEEK,
    ATTR_ANCHOR_WEEKDAY,
    ATTR_ASSIGNED_TO,
    ATTR_AVATAR,
    ATTR_CHORE_ID,
    ATTR_CHORE_NAME,
    ATTR_COMPLETED,
    ATTR_ESTIMATED_MINUTES,
    ATTR_FREQUENCY,
    ATTR_ICON,
    ATTR_INTERVAL,
    ATTR_NEXT_DUE,
    ATTR_RECURRENCE_TYPE,
    ATTR_ROOM_ID,
    ATTR_ROOM_NAME,
    ATTR_START_DATE,
    ATTR_STEP_INDEX,
    ATTR_STEPS,
    ATTR_USER_ID,
    ATTR_USER_NAME,
    DOMAIN,
    FREQUENCIES,
    MAX_ESTIMATED_MINUTES,
    RECURRENCE_TYPES,
    SERVICE_ADD_CHORE,
    SERVICE_ADD_ROOM,
    SERVICE_ADD_USER,
    SERVICE_COMPLETE_CHORE,
    SERVICE_GET_HISTORY,
    SERVICE_GET_USER_STATS,
    SERVICE_REMOVE_CHORE,
    SERVICE_REMOVE_ROOM,
    SERVICE_REMOVE_USER,
    SERVICE_SEND_NOTIFICATION,
    SERVICE_SKIP_CHORE,
    SERVICE_SNOOZE_CHORE,
    SERVICE_TOGGLE_CHORE_STEP,
    SERVICE_UPDATE_CHORE,
    SERVICE_UPDATE_ROOM,
    SERVICE_UPDATE_USER,
    WEEK_ORDINALS,
    WEEKDAYS,
)
from .coordinator import SimpleChoresCoordinator
from .notifications import (
    async_send_due_notification,
    async_setup_notification_actions,
    async_setup_notification_scheduler,
)
from .store import SimpleChoresStore
from .websocket import async_register_websocket_api

_LOGGER = logging.getLogger(__name__)

PLATFORMS: list[Platform] = [
    Platform.SENSOR,
    Platform.BINARY_SENSOR,
    Platform.CALENDAR,
]

ALL_SERVICES: tuple[str, ...] = (
    SERVICE_ADD_ROOM,
    SERVICE_REMOVE_ROOM,
    SERVICE_UPDATE_ROOM,
    SERVICE_ADD_USER,
    SERVICE_REMOVE_USER,
    SERVICE_UPDATE_USER,
    SERVICE_ADD_CHORE,
    SERVICE_REMOVE_CHORE,
    SERVICE_UPDATE_CHORE,
    SERVICE_COMPLETE_CHORE,
    SERVICE_SKIP_CHORE,
    SERVICE_SNOOZE_CHORE,
    SERVICE_TOGGLE_CHORE_STEP,
    SERVICE_GET_HISTORY,
    SERVICE_GET_USER_STATS,
    SERVICE_SEND_NOTIFICATION,
)

# Reused by add_chore and update_chore
_ESTIMATED_MINUTES_VALIDATOR = vol.All(vol.Coerce(int), vol.Range(min=0, max=MAX_ESTIMATED_MINUTES))
_STEPS_VALIDATOR = vol.All(cv.ensure_list, [cv.string])

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

SERVICE_ADD_USER_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_USER_NAME): cv.string,
        vol.Optional(ATTR_AVATAR): cv.string,
    }
)

SERVICE_REMOVE_USER_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_USER_ID): cv.string,
    }
)

SERVICE_UPDATE_USER_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_USER_ID): cv.string,
        vol.Optional(ATTR_USER_NAME): cv.string,
        vol.Optional(ATTR_AVATAR): cv.string,
    }
)

SERVICE_ADD_CHORE_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_CHORE_NAME): cv.string,
        vol.Required(ATTR_ROOM_ID): cv.string,
        vol.Required(ATTR_FREQUENCY): vol.In(FREQUENCIES),
        vol.Optional(ATTR_START_DATE): cv.date,
        vol.Optional(ATTR_ASSIGNED_TO): cv.string,
        # Recurrence options
        vol.Optional(ATTR_RECURRENCE_TYPE): vol.In(RECURRENCE_TYPES),
        vol.Optional(ATTR_ANCHOR_DAYS_OF_WEEK): vol.All(cv.ensure_list, [vol.In(WEEKDAYS)]),
        vol.Optional(ATTR_ANCHOR_TYPE): vol.In(ANCHOR_TYPES),
        vol.Optional(ATTR_ANCHOR_DAY_OF_MONTH): vol.All(vol.Coerce(int), vol.Range(min=1, max=31)),
        vol.Optional(ATTR_ANCHOR_WEEK): vol.In(WEEK_ORDINALS),
        vol.Optional(ATTR_ANCHOR_WEEKDAY): vol.In(WEEKDAYS),
        vol.Optional(ATTR_INTERVAL): vol.All(vol.Coerce(int), vol.Range(min=1)),
        # Focus view options
        vol.Optional(ATTR_ESTIMATED_MINUTES): _ESTIMATED_MINUTES_VALIDATOR,
        vol.Optional(ATTR_STEPS): _STEPS_VALIDATOR,
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
        vol.Optional(ATTR_NEXT_DUE): cv.date,
        vol.Optional(ATTR_ASSIGNED_TO): cv.string,
        # Recurrence options
        vol.Optional(ATTR_RECURRENCE_TYPE): vol.In(RECURRENCE_TYPES),
        vol.Optional(ATTR_ANCHOR_DAYS_OF_WEEK): vol.All(cv.ensure_list, [vol.In(WEEKDAYS)]),
        vol.Optional(ATTR_ANCHOR_TYPE): vol.In(ANCHOR_TYPES),
        vol.Optional(ATTR_ANCHOR_DAY_OF_MONTH): vol.All(vol.Coerce(int), vol.Range(min=1, max=31)),
        vol.Optional(ATTR_ANCHOR_WEEK): vol.In(WEEK_ORDINALS),
        vol.Optional(ATTR_ANCHOR_WEEKDAY): vol.In(WEEKDAYS),
        vol.Optional(ATTR_INTERVAL): vol.All(vol.Coerce(int), vol.Range(min=1)),
        # Focus view options (0 minutes clears an estimate, [] clears the steps)
        vol.Optional(ATTR_ESTIMATED_MINUTES): _ESTIMATED_MINUTES_VALIDATOR,
        vol.Optional(ATTR_STEPS): _STEPS_VALIDATOR,
    }
)

SERVICE_TOGGLE_CHORE_STEP_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_CHORE_ID): cv.string,
        vol.Required(ATTR_STEP_INDEX): vol.All(vol.Coerce(int), vol.Range(min=0)),
        vol.Optional(ATTR_COMPLETED): cv.boolean,
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

SERVICE_SNOOZE_CHORE_SCHEMA = vol.Schema(
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
    """Set up Simple Chores from a config entry."""
    _LOGGER.info("Setting up Simple Chores integration...")
    hass.data.setdefault(DOMAIN, {})

    try:
        # Initialize store and load data
        store = SimpleChoresStore(hass)
        await store.async_load()

        # Create coordinator
        coordinator = SimpleChoresCoordinator(hass, store, entry)
        await coordinator.async_config_entry_first_refresh()

        hass.data[DOMAIN][entry.entry_id] = coordinator

        # Set up platforms
        await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    except OSError as e:
        _LOGGER.error("File system error during setup: %s", e, exc_info=True)
        return False
    except HomeAssistantError as e:
        _LOGGER.error("Home Assistant error during setup: %s", e, exc_info=True)
        return False
    except Exception:
        _LOGGER.exception("Unexpected error setting up Simple Chores integration")
        return False

    # Register services
    await _async_setup_services(hass, coordinator)

    # Serve completion history on demand instead of in a state attribute
    async_register_websocket_api(hass)

    # Set up notification scheduler and action listener
    await async_setup_notification_scheduler(hass, entry, coordinator)
    async_setup_notification_actions(hass, entry, coordinator)

    # Listen for options updates
    entry.async_on_unload(entry.add_update_listener(_async_update_listener))

    # Register frontend resources
    await frontend_resources.register_frontend_resources(hass, DOMAIN)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    # Flush any pending saves before unloading
    coordinator: SimpleChoresCoordinator = hass.data[DOMAIN][entry.entry_id]
    await coordinator.store.async_flush_debounced_save()

    if unload_ok := await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
        hass.data[DOMAIN].pop(entry.entry_id)
        # Single-instance integration: remove services with the last entry
        if not hass.data[DOMAIN]:
            for service_name in ALL_SERVICES:
                hass.services.async_remove(DOMAIN, service_name)

    return unload_ok


async def _async_update_listener(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Handle options update."""
    await hass.config_entries.async_reload(entry.entry_id)


class ServiceHandlerFactory:
    """Factory for creating service handlers with common patterns."""

    def __init__(self, coordinator: SimpleChoresCoordinator, hass: HomeAssistant):
        self.coordinator = coordinator
        self.hass = hass

    def create_room_handler(self, operation: str) -> Callable[[ServiceCall], Awaitable[None]]:
        """Create a room operation handler."""

        async def handler(call: ServiceCall) -> None:
            try:
                room_id = call.data.get(ATTR_ROOM_ID)
                name = call.data.get(ATTR_ROOM_NAME)
                icon = call.data.get(ATTR_ICON)

                if operation == "add":
                    await self.coordinator.async_add_room(name, icon)
                    _LOGGER.info("Successfully added room: %s", name)
                elif operation == "remove":
                    await self.coordinator.async_remove_room(room_id)
                    _LOGGER.info("Successfully removed room: %s", room_id)
                elif operation == "update":
                    await self.coordinator.async_update_room(room_id, name, icon)
                    _LOGGER.info("Successfully updated room: %s", room_id)
            except ValueError as e:
                _LOGGER.error("Validation error in %s_room: %s", operation, e)
                raise HomeAssistantError(f"Invalid input: {e}") from e
            except KeyError as e:
                _LOGGER.error("Missing required field in %s_room: %s", operation, e)
                raise HomeAssistantError(f"Missing required field: {e}") from e
            except Exception as e:
                _LOGGER.exception("Unexpected error in %s_room", operation)
                raise HomeAssistantError(f"Failed to {operation} room: {e}") from e

        return handler

    def create_user_handler(self, operation: str) -> Callable[[ServiceCall], Awaitable[None]]:
        """Create a user operation handler."""

        async def handler(call: ServiceCall) -> None:
            try:
                _LOGGER.debug("User handler called for operation: %s", operation)
                _LOGGER.debug("Service call data: %s", dict(call.data))

                user_id = call.data.get(ATTR_USER_ID)
                name = call.data.get(ATTR_USER_NAME)
                avatar = call.data.get(ATTR_AVATAR)

                _LOGGER.debug("Extracted values - user_id: %s, name: %s, avatar: %s", user_id, name, avatar)

                if operation == "add":
                    await self.coordinator.async_add_user(name, avatar)
                    _LOGGER.debug("Successfully added custom user: %s", name)
                elif operation == "remove":
                    await self.coordinator.async_remove_user(user_id)
                    _LOGGER.debug("Successfully removed custom user: %s", user_id)
                elif operation == "update":
                    await self.coordinator.async_update_user(user_id, name, avatar)
                    _LOGGER.info("Successfully updated custom user: %s", user_id)
            except ValueError as e:
                _LOGGER.error("Validation error in %s_user: %s", operation, e)
                raise HomeAssistantError(f"Invalid input: {e}") from e
            except KeyError as e:
                _LOGGER.error("Missing required field in %s_user: %s", operation, e)
                _LOGGER.error("KeyError details - Key: %s, Type: %s", e, type(e))
                raise HomeAssistantError(f"Missing required field: {e}") from e
            except Exception as e:
                _LOGGER.exception("Unexpected error in %s_user", operation)
                raise HomeAssistantError(f"Failed to {operation} user: {e}") from e

        return handler

    def create_chore_handler(self, operation: str) -> Callable[[ServiceCall], Awaitable[None]]:
        """Create a chore operation handler."""

        async def handler(call: ServiceCall) -> None:
            try:
                chore_id = call.data.get(ATTR_CHORE_ID)
                name = call.data.get(ATTR_CHORE_NAME)
                room_id = call.data.get(ATTR_ROOM_ID)
                frequency = call.data.get(ATTR_FREQUENCY)
                start_date = call.data.get(ATTR_START_DATE)
                next_due = call.data.get(ATTR_NEXT_DUE)
                assigned_to = call.data.get(ATTR_ASSIGNED_TO)
                # Recurrence fields
                recurrence_type = call.data.get(ATTR_RECURRENCE_TYPE)
                anchor_days_of_week = call.data.get(ATTR_ANCHOR_DAYS_OF_WEEK)
                anchor_type = call.data.get(ATTR_ANCHOR_TYPE)
                anchor_day_of_month = call.data.get(ATTR_ANCHOR_DAY_OF_MONTH)
                anchor_week = call.data.get(ATTR_ANCHOR_WEEK)
                anchor_weekday = call.data.get(ATTR_ANCHOR_WEEKDAY)
                interval = call.data.get(ATTR_INTERVAL)
                # Focus view fields
                estimated_minutes = call.data.get(ATTR_ESTIMATED_MINUTES)
                steps = call.data.get(ATTR_STEPS)

                if operation == "add":
                    await self.coordinator.async_add_chore(
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
                        estimated_minutes,
                        steps,
                    )
                    _LOGGER.info("Successfully added chore: %s", name)
                elif operation == "remove":
                    await self.coordinator.async_remove_chore(chore_id)
                    _LOGGER.info("Successfully removed chore: %s", chore_id)
                elif operation == "update":
                    await self.coordinator.async_update_chore(
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
                        estimated_minutes,
                        steps,
                    )
                    _LOGGER.info("Successfully updated chore: %s", chore_id)
                elif operation == "complete":
                    user_id = call.data.get(ATTR_USER_ID)
                    if user_id is None and call.context.user_id:
                        user_id = call.context.user_id
                    await self.coordinator.async_complete_chore(chore_id, user_id)
                    _LOGGER.info("Successfully completed chore: %s by user: %s", chore_id, user_id)
                elif operation == "skip":
                    await self.coordinator.async_skip_chore(chore_id)
                    _LOGGER.info("Successfully skipped chore: %s", chore_id)
                elif operation == "snooze":
                    await self.coordinator.async_snooze_chore(chore_id)
                    _LOGGER.info("Successfully snoozed chore: %s", chore_id)
                elif operation == "toggle_step":
                    step_index = call.data[ATTR_STEP_INDEX]
                    completed = call.data.get(ATTR_COMPLETED)
                    await self.coordinator.async_toggle_chore_step(chore_id, step_index, completed)
                    _LOGGER.debug("Toggled step %s on chore: %s", step_index, chore_id)
            except ValueError as e:
                _LOGGER.error("Validation error in %s_chore: %s", operation, e)
                raise HomeAssistantError(f"Invalid input: {e}") from e
            except KeyError as e:
                _LOGGER.error("Missing required field in %s_chore: %s", operation, e)
                raise HomeAssistantError(f"Missing required field: {e}") from e
            except Exception as e:
                _LOGGER.exception("Unexpected error in %s_chore", operation)
                raise HomeAssistantError(f"Failed to {operation} chore: {e}") from e

        return handler

    def create_data_handler(self, data_type: str) -> Callable[[ServiceCall], Awaitable[dict[str, Any]]]:
        """Create a data retrieval handler."""

        async def handler(call: ServiceCall) -> dict[str, Any]:
            try:
                if data_type == "history":
                    chore_id = call.data[ATTR_CHORE_ID]
                    history = self.coordinator.store.get_chore_history(chore_id)
                    _LOGGER.debug("Retrieved %d history entries for chore: %s", len(history), chore_id)
                    return {"history": history}
                elif data_type == "stats":
                    stats = self.coordinator.store.get_user_stats()
                    _LOGGER.debug("Retrieved stats for %d users", len(stats))
                    return {"stats": stats}
                else:
                    raise HomeAssistantError(f"Unknown data type: {data_type}")
            except KeyError as e:
                _LOGGER.error("Missing required field in get_%s: %s", data_type, e)
                raise HomeAssistantError(f"Missing required field: {e}") from e
            except Exception as e:
                _LOGGER.exception("Unexpected error in get_%s", data_type)
                raise HomeAssistantError(f"Failed to get {data_type}: {e}") from e

        return handler

    def create_notification_handler(self) -> Callable[[ServiceCall], Awaitable[None]]:
        """Create notification handler."""

        async def handler(call: ServiceCall) -> None:
            try:
                await async_send_due_notification(self.hass, self.coordinator)
                _LOGGER.info("Successfully sent notification")
            except Exception as e:
                _LOGGER.exception("Error sending notification")
                raise HomeAssistantError(f"Failed to send notification: {e}") from e

        return handler


async def _async_setup_services(hass: HomeAssistant, coordinator: SimpleChoresCoordinator) -> None:
    """Set up services for the integration using factory pattern."""

    factory = ServiceHandlerFactory(coordinator, hass)

    # Service configuration: (service_name, handler_factory_method, schema)
    service_configs = [
        # Room services
        (SERVICE_ADD_ROOM, factory.create_room_handler("add"), SERVICE_ADD_ROOM_SCHEMA),
        (SERVICE_REMOVE_ROOM, factory.create_room_handler("remove"), SERVICE_REMOVE_ROOM_SCHEMA),
        (SERVICE_UPDATE_ROOM, factory.create_room_handler("update"), SERVICE_UPDATE_ROOM_SCHEMA),
        # User services
        (SERVICE_ADD_USER, factory.create_user_handler("add"), SERVICE_ADD_USER_SCHEMA),
        (SERVICE_REMOVE_USER, factory.create_user_handler("remove"), SERVICE_REMOVE_USER_SCHEMA),
        (SERVICE_UPDATE_USER, factory.create_user_handler("update"), SERVICE_UPDATE_USER_SCHEMA),
        # Chore services
        (SERVICE_ADD_CHORE, factory.create_chore_handler("add"), SERVICE_ADD_CHORE_SCHEMA),
        (SERVICE_REMOVE_CHORE, factory.create_chore_handler("remove"), SERVICE_REMOVE_CHORE_SCHEMA),
        (SERVICE_UPDATE_CHORE, factory.create_chore_handler("update"), SERVICE_UPDATE_CHORE_SCHEMA),
        (SERVICE_COMPLETE_CHORE, factory.create_chore_handler("complete"), SERVICE_COMPLETE_CHORE_SCHEMA),
        (SERVICE_SKIP_CHORE, factory.create_chore_handler("skip"), SERVICE_SKIP_CHORE_SCHEMA),
        (SERVICE_SNOOZE_CHORE, factory.create_chore_handler("snooze"), SERVICE_SNOOZE_CHORE_SCHEMA),
        (
            SERVICE_TOGGLE_CHORE_STEP,
            factory.create_chore_handler("toggle_step"),
            SERVICE_TOGGLE_CHORE_STEP_SCHEMA,
        ),
        # Data services
        (SERVICE_GET_HISTORY, factory.create_data_handler("history"), SERVICE_GET_HISTORY_SCHEMA),
        (SERVICE_GET_USER_STATS, factory.create_data_handler("stats"), None),
        # Notification service
        (SERVICE_SEND_NOTIFICATION, factory.create_notification_handler(), None),
    ]

    # Register all services using the factory pattern
    for service_name, handler, schema in service_configs:
        hass.services.async_register(DOMAIN, service_name, handler, schema=schema)
