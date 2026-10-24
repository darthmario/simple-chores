"""Notification logic for the Simple Chores integration."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Any

from homeassistant.core import Event, callback
from homeassistant.exceptions import HomeAssistantError, ServiceNotFound
from homeassistant.helpers.event import async_track_time_change
from homeassistant.util import dt as dt_util

from .const import (
    CONF_NOTIFICATION_TIME,
    CONF_NOTIFICATIONS_ENABLED,
    CONF_NOTIFY_DAYS_BEFORE,
    CONF_NOTIFY_TARGETS,
    DEFAULT_NOTIFICATION_TIME,
    DEFAULT_NOTIFICATIONS_ENABLED,
    DEFAULT_NOTIFY_DAYS_BEFORE,
)

if TYPE_CHECKING:
    from homeassistant.config_entries import ConfigEntry
    from homeassistant.core import HomeAssistant

    from .coordinator import SimpleChoresCoordinator

_LOGGER = logging.getLogger(__name__)

ACTION_PREFIX = "SIMPLE_CHORES_COMPLETE_"


async def async_setup_notification_scheduler(
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
    notification_time_str = entry.options.get(CONF_NOTIFICATION_TIME, DEFAULT_NOTIFICATION_TIME)

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


def async_setup_notification_actions(
    hass: HomeAssistant,
    entry: ConfigEntry,
    coordinator: SimpleChoresCoordinator,
) -> None:
    """Set up listener for notification action events."""

    @callback
    def _handle_notification_action(event: Event) -> None:
        """Handle mobile_app_notification_action events."""
        action = event.data.get("action", "")
        if not action.startswith(ACTION_PREFIX):
            return

        chore_ids_str = action[len(ACTION_PREFIX) :]
        chore_ids = [cid for cid in chore_ids_str.split(",") if cid]

        if not chore_ids:
            return

        _LOGGER.debug("Notification action: completing chores %s", chore_ids)

        # Get the user ID from the event context if available
        user_id = None
        if event.context and event.context.user_id:
            user_id = event.context.user_id

        hass.async_create_task(_async_complete_chores_from_action(coordinator, chore_ids, user_id))

    entry.async_on_unload(hass.bus.async_listen("mobile_app_notification_action", _handle_notification_action))


async def _async_complete_chores_from_action(
    coordinator: SimpleChoresCoordinator,
    chore_ids: list[str],
    user_id: str | None,
) -> None:
    """Complete chores triggered by a notification action."""
    for chore_id in chore_ids:
        try:
            await coordinator.async_complete_chore(chore_id, user_id)
            _LOGGER.debug("Completed chore %s from notification action", chore_id)
        except Exception:
            _LOGGER.exception("Failed to complete chore %s from notification action", chore_id)


async def _async_check_and_notify(
    hass: HomeAssistant,
    entry: ConfigEntry,
    coordinator: SimpleChoresCoordinator,
) -> None:
    """Check for due chores and send notification if enabled."""
    if not entry.options.get(CONF_NOTIFICATIONS_ENABLED, DEFAULT_NOTIFICATIONS_ENABLED):
        return

    await async_send_due_notification(hass, coordinator, entry)


def get_due_date_label(days_ahead: int) -> str:
    """Get a human-readable label for the due date."""
    if days_ahead == 0:
        return "today"
    elif days_ahead == 1:
        return "tomorrow"
    elif days_ahead == 7:
        return "in 1 week"
    else:
        return f"in {days_ahead} days"


async def async_send_due_notification(
    hass: HomeAssistant,
    coordinator: SimpleChoresCoordinator,
    entry: ConfigEntry | None = None,
) -> None:
    """Send targeted notifications about chores due based on configured days."""
    # Refresh data first. async_request_refresh() is debounced by 10 s, so the
    # notification could go out from stale data; the coordinator's immediate
    # refresh is what every other caller uses.
    await coordinator._async_refresh_now()

    if coordinator.data is None:
        return

    # Get configured days to notify (default: only day-of)
    days_before_list = DEFAULT_NOTIFY_DAYS_BEFORE
    if entry:
        days_before_list = entry.options.get(CONF_NOTIFY_DAYS_BEFORE, DEFAULT_NOTIFY_DAYS_BEFORE)

    # Get all chores and filter for each notification day
    all_chores = coordinator.data.get("chores", [])
    # The configured HA timezone decides what "today" is, not the host clock
    today = dt_util.now().date()

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
        # For "today" (days_ahead=0), also include overdue chores
        if days_ahead == 0:
            chores_due = [
                chore for chore in all_chores if chore.get("next_due") and chore["next_due"] <= target_date_str
            ]
        else:
            chores_due = [chore for chore in all_chores if chore.get("next_due") == target_date_str]

        if not chores_due:
            continue

        due_label = get_due_date_label(days_ahead)

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


async def _async_find_user_notify_services(hass: HomeAssistant, user_id: str, user_name: str) -> list[str]:
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

    # Build action with chore IDs for completion
    chore_ids = ",".join(c["id"] for c in chores)
    actions = [
        {
            "action": f"{ACTION_PREFIX}{chore_ids}",
            "title": "Mark All Done",
        },
        {
            "action": "URI",
            "title": "Open App",
            "uri": "/lovelace/0",
        },
    ]

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
                        "actions": actions,
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
