"""The Simple Chores integration."""
from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from datetime import date, datetime, timedelta
from typing import Any

import voluptuous as vol
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.exceptions import HomeAssistantError, ServiceNotFound
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.event import async_track_time_change

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
    ATTR_FREQUENCY,
    ATTR_ICON,
    ATTR_INTERVAL,
    ATTR_NEXT_DUE,
    ATTR_RECURRENCE_TYPE,
    ATTR_ROOM_ID,
    ATTR_ROOM_NAME,
    ATTR_START_DATE,
    ATTR_USER_ID,
    ATTR_USER_NAME,
    CONF_NOTIFICATION_TIME,
    CONF_NOTIFICATIONS_ENABLED,
    CONF_NOTIFY_DAYS_BEFORE,
    CONF_NOTIFY_TARGETS,
    DEFAULT_NOTIFICATION_TIME,
    DEFAULT_NOTIFICATIONS_ENABLED,
    DEFAULT_NOTIFY_DAYS_BEFORE,
    DOMAIN,
    FREQUENCIES,
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
    SERVICE_UPDATE_CHORE,
    SERVICE_UPDATE_ROOM,
    SERVICE_UPDATE_USER,
    WEEK_ORDINALS,
    WEEKDAYS,
)
from .coordinator import SimpleChoresCoordinator
from .store import SimpleChoresStore

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
        vol.Optional(ATTR_ANCHOR_DAYS_OF_WEEK): vol.All(
            cv.ensure_list, [vol.In(WEEKDAYS)]
        ),
        vol.Optional(ATTR_ANCHOR_TYPE): vol.In(ANCHOR_TYPES),
        vol.Optional(ATTR_ANCHOR_DAY_OF_MONTH): vol.All(
            vol.Coerce(int), vol.Range(min=1, max=31)
        ),
        vol.Optional(ATTR_ANCHOR_WEEK): vol.In(WEEK_ORDINALS),
        vol.Optional(ATTR_ANCHOR_WEEKDAY): vol.In(WEEKDAYS),
        vol.Optional(ATTR_INTERVAL): vol.All(vol.Coerce(int), vol.Range(min=1)),
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
        vol.Optional(ATTR_ANCHOR_DAYS_OF_WEEK): vol.All(
            cv.ensure_list, [vol.In(WEEKDAYS)]
        ),
        vol.Optional(ATTR_ANCHOR_TYPE): vol.In(ANCHOR_TYPES),
        vol.Optional(ATTR_ANCHOR_DAY_OF_MONTH): vol.All(
            vol.Coerce(int), vol.Range(min=1, max=31)
        ),
        vol.Optional(ATTR_ANCHOR_WEEK): vol.In(WEEK_ORDINALS),
        vol.Optional(ATTR_ANCHOR_WEEKDAY): vol.In(WEEKDAYS),
        vol.Optional(ATTR_INTERVAL): vol.All(vol.Coerce(int), vol.Range(min=1)),
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
        raise

    # Register services
    await _async_setup_services(hass, coordinator)

    # Set up notification scheduler
    await _async_setup_notification_scheduler(hass, entry, coordinator)

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
                _LOGGER.info("=== User handler called for operation: %s ===", operation)
                _LOGGER.info("Service call data: %s", dict(call.data))
                _LOGGER.info("ATTR_USER_NAME constant value: %s", ATTR_USER_NAME)
                _LOGGER.info("ATTR_AVATAR constant value: %s", ATTR_AVATAR)
                _LOGGER.info("ATTR_USER_ID constant value: %s", ATTR_USER_ID)

                user_id = call.data.get(ATTR_USER_ID)
                name = call.data.get(ATTR_USER_NAME)
                avatar = call.data.get(ATTR_AVATAR)

                _LOGGER.info("Extracted values - user_id: %s, name: %s, avatar: %s", user_id, name, avatar)

                if operation == "add":
                    _LOGGER.info("Calling coordinator.async_add_user with name=%s, avatar=%s", name, avatar)
                    await self.coordinator.async_add_user(name, avatar)
                    _LOGGER.info("Successfully added custom user: %s", name)
                elif operation == "remove":
                    await self.coordinator.async_remove_user(user_id)
                    _LOGGER.info("Successfully removed custom user: %s", user_id)
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

                if operation == "add":
                    await self.coordinator.async_add_chore(
                        name, room_id, frequency, start_date, assigned_to,
                        recurrence_type, anchor_days_of_week, anchor_type,
                        anchor_day_of_month, anchor_week, anchor_weekday, interval
                    )
                    _LOGGER.info("Successfully added chore: %s", name)
                elif operation == "remove":
                    await self.coordinator.async_remove_chore(chore_id)
                    _LOGGER.info("Successfully removed chore: %s", chore_id)
                elif operation == "update":
                    await self.coordinator.async_update_chore(
                        chore_id, name, room_id, frequency, next_due, assigned_to,
                        recurrence_type, anchor_days_of_week, anchor_type,
                        anchor_day_of_month, anchor_week, anchor_weekday, interval
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
                await _async_send_due_notification(self.hass, self.coordinator)
                _LOGGER.info("Successfully sent notification")
            except Exception as e:
                _LOGGER.exception("Error sending notification")
                raise HomeAssistantError(f"Failed to send notification: {e}") from e

        return handler


async def _async_setup_services(
    hass: HomeAssistant, coordinator: SimpleChoresCoordinator
) -> None:
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

        # Data services
        (SERVICE_GET_HISTORY, factory.create_data_handler("history"), SERVICE_GET_HISTORY_SCHEMA),
        (SERVICE_GET_USER_STATS, factory.create_data_handler("stats"), None),

        # Notification service
        (SERVICE_SEND_NOTIFICATION, factory.create_notification_handler(), None),
    ]

    # Register all services using the factory pattern
    for service_name, handler, schema in service_configs:
        hass.services.async_register(
            DOMAIN, service_name, handler, schema=schema
        )


async def _async_setup_notification_scheduler(
    hass: HomeAssistant,
    entry: ConfigEntry,
    coordinator: SimpleChoresCoordinator,
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
    coordinator: SimpleChoresCoordinator,
) -> None:
    """Check for due chores and send notification if enabled."""
    if not entry.options.get(CONF_NOTIFICATIONS_ENABLED, DEFAULT_NOTIFICATIONS_ENABLED):
        return

    await _async_send_due_notification(hass, coordinator, entry)


def _get_due_date_label(days_ahead: int) -> str:
    """Get a human-readable label for the due date."""
    if days_ahead == 0:
        return "today"
    elif days_ahead == 1:
        return "tomorrow"
    elif days_ahead == 7:
        return "in 1 week"
    else:
        return f"in {days_ahead} days"


async def _async_send_due_notification(
    hass: HomeAssistant,
    coordinator: SimpleChoresCoordinator,
    entry: ConfigEntry | None = None,
) -> None:
    """Send targeted notifications about chores due based on configured days."""
    # Refresh data first
    await coordinator.async_request_refresh()

    if coordinator.data is None:
        return

    # Get configured days to notify (default: only day-of)
    days_before_list = DEFAULT_NOTIFY_DAYS_BEFORE
    if entry:
        days_before_list = entry.options.get(CONF_NOTIFY_DAYS_BEFORE, DEFAULT_NOTIFY_DAYS_BEFORE)

    # Get all chores and filter for each notification day
    all_chores = coordinator.data.get("all_chores", [])
    today = date.today()

    # Get all mobile app notify services
    all_mobile_apps = []
    for service in hass.services.async_services().get("notify", {}):
        if service.startswith("mobile_app_"):
            all_mobile_apps.append(service)

    # Get configured notify targets
    configured_targets = []
    if entry:
        configured_targets = entry.options.get(CONF_NOTIFY_TARGETS, [])

    # Process notifications for each configured day
    for days_ahead in days_before_list:
        target_date = today + timedelta(days=days_ahead)
        target_date_str = target_date.isoformat()

        # Find chores due on this target date
        chores_due = [
            chore for chore in all_chores
            if chore.get("next_due") == target_date_str
        ]

        if not chores_due:
            continue

        due_label = _get_due_date_label(days_ahead)

        # Group chores by assigned user
        chores_by_user: dict[str | None, list[dict[str, Any]]] = {}
        for chore in chores_due:
            assigned_to = chore.get("assigned_to")
            if assigned_to not in chores_by_user:
                chores_by_user[assigned_to] = []
            chores_by_user[assigned_to].append(chore)

        # Send targeted notifications for assigned chores
        for user_id, user_chores in chores_by_user.items():
            if user_id is None:
                # Unassigned chores - broadcast to all targets
                targets = configured_targets if configured_targets else all_mobile_apps
                await _async_send_notification_to_targets(
                    hass, targets, user_chores, f"Unassigned Chores Due {due_label.title()}", due_label
                )
            else:
                # Assigned chores - send to specific user
                user_name = await coordinator.async_get_user_name(user_id)
                user_targets = await _async_find_user_notify_services(hass, user_id, user_name)

                if user_targets:
                    await _async_send_notification_to_targets(
                        hass, user_targets, user_chores, f"{user_name}'s Chores Due {due_label.title()}", due_label
                    )
                else:
                    _LOGGER.debug(
                        "No notification service found for user %s (%s), falling back to broadcast",
                        user_name,
                        user_id,
                    )
                    # Fallback to broadcast if user's device not found
                    targets = configured_targets if configured_targets else all_mobile_apps
                    await _async_send_notification_to_targets(
                        hass, targets, user_chores, f"{user_name}'s Chores Due {due_label.title()}", due_label
                    )


async def _async_find_user_notify_services(
    hass: HomeAssistant, user_id: str, user_name: str
) -> list[str]:
    """Find mobile app notify services for a specific user."""
    user_services = []

    # Get all mobile app services
    all_services = hass.services.async_services().get("notify", {})

    # Try to match by username (sanitized for service naming)
    username_normalized = user_name.lower().replace(" ", "_").replace("-", "_")

    for service in all_services:
        if not service.startswith("mobile_app_"):
            continue

        # Extract device/user name from service (e.g., mobile_app_john -> john)
        device_name = service.replace("mobile_app_", "")

        # Match if the device name contains the username
        if username_normalized in device_name.lower():
            user_services.append(service)

    return user_services


async def _async_send_notification_to_targets(
    hass: HomeAssistant,
    targets: list[str],
    chores: list[dict[str, Any]],
    title: str,
    due_label: str = "today",
) -> None:
    """Send notification to specified targets."""
    if not targets or not chores:
        return

    # Build notification message
    chore_list = "\n".join([f"• {c['name']} ({c.get('room_name', 'Unknown')})" for c in chores])
    message = f"You have {len(chores)} chore(s) due {due_label}:\n{chore_list}"

    # Send notifications
    for target in targets:
        try:
            await hass.services.async_call(
                "notify",
                target,
                {
                    "title": title,
                    "message": message,
                    "data": {
                        "tag": f"simple_chores_due_{due_label.replace(' ', '_')}",
                        "actions": [
                            {
                                "action": "OPEN_APP",
                                "title": "Open Home Assistant",
                            }
                        ],
                    },
                },
            )
        except ServiceNotFound:
            _LOGGER.warning("Notification service not found for target: %s", target)
        except (HomeAssistantError, ValueError) as err:
            _LOGGER.warning("Failed to send notification to %s: %s", target, err, exc_info=True)
        except Exception:
            _LOGGER.exception("Unexpected error sending notification to %s", target)
            # Don't raise - notification failures shouldn't break the integration
