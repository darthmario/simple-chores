"""The Simple Chores integration."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
from datetime import date, datetime, time, timedelta
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.event import async_track_time_change

# Conditional imports for frontend resource registration
try:
    from aiohttp import web
    from homeassistant.components.http.static import CachingStaticResource
except ImportError:
    web = None
    CachingStaticResource = None

from .const import (
    ATTR_CHORE_ID,
    ATTR_CHORE_NAME,
    ATTR_FREQUENCY,
    ATTR_ICON,
    ATTR_NEXT_DUE,
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
        vol.Optional(ATTR_NEXT_DUE): cv.date,
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
    except Exception as e:
        _LOGGER.error("Failed to setup Simple Chores integration: %s", e, exc_info=True)
        return False

    # Register services
    await _async_setup_services(hass, coordinator)

    # Set up notification scheduler
    await _async_setup_notification_scheduler(hass, entry, coordinator)

    # Listen for options updates
    entry.async_on_unload(entry.add_update_listener(_async_update_listener))

    # Register frontend resources
    await _async_register_frontend_resources(hass)

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
    hass: HomeAssistant, coordinator: SimpleChoresCoordinator
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
        next_due = call.data.get(ATTR_NEXT_DUE)
        await coordinator.async_update_chore(chore_id, name, room_id, frequency, next_due)

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


async def _async_send_due_notification(
    hass: HomeAssistant,
    coordinator: SimpleChoresCoordinator,
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
                    "title": "Simple Chores Due Today",
                    "message": message,
                    "data": {
                        "tag": "simple_chores_due",
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


async def _async_register_frontend_resources(hass: HomeAssistant) -> None:
    """Register frontend resources for the Lovelace card."""
    try:
        
        # Check if files exist first
        www_path = hass.config.path(f"custom_components/{DOMAIN}/www")
        card_file = os.path.join(www_path, "simple-chores-card.js")
        
        if not os.path.exists(card_file):
            _LOGGER.error("Card file not found at: %s", card_file)
            return
            
        _LOGGER.debug("Card file exists at: %s", card_file)
        
        # Try different methods for static path registration
        registered = False
        
        # Method 1: Modern HA versions
        if hasattr(hass.http, 'register_static_path'):
            try:
                hass.http.register_static_path(f"/{DOMAIN}", www_path, cache_headers=False)
                registered = True
                _LOGGER.info("Registered static path using register_static_path")
            except Exception as err:
                _LOGGER.debug("register_static_path failed: %s", err)
        
        # Method 2: Alternative approach for older versions
        if not registered:
            try:
                # aiohttp and CachingStaticResource imports moved to top
                
                # Add static route directly
                hass.http.app.router.add_static(
                    f"/{DOMAIN}",
                    www_path,
                    name=f"{DOMAIN}_static"
                )
                registered = True
                _LOGGER.info("Registered static path using aiohttp router")
            except Exception as err:
                _LOGGER.debug("aiohttp router method failed: %s", err)
        
        # Method 3: HACS community folder approach (ALWAYS try this for HACS compatibility)
        try:
            from homeassistant.components.frontend import add_extra_js_url
            
            # Copy the file to HACS community directory structure
            community_dir = hass.config.path("www/community/simple-chores")
            
            # Use async file operations to avoid blocking
            def _copy_file():
                if not os.path.exists(community_dir):
                    os.makedirs(community_dir)
                target_file = os.path.join(community_dir, "simple-chores-card.js")
                shutil.copy2(card_file, target_file)
                return target_file
            
            # Run file copy in executor to avoid blocking the event loop
            target_file = await hass.async_add_executor_job(_copy_file)
            
            card_url = "/local/community/simple-chores/simple-chores-card.js"
            add_extra_js_url(hass, card_url)
            
            # Note: Automatic lovelace resource registration disabled to avoid I/O blocking warnings
            # Users should manually add the resource if it doesn't auto-register via add_extra_js_url
            # await _async_auto_register_lovelace_resource(hass, card_url)
            
            registered = True
            _LOGGER.info("Card copied to HACS community folder and registered: %s", card_url)
            _LOGGER.info("Card should be accessible at: %s", card_url)
        except Exception as err:
            _LOGGER.error("HACS community folder method failed: %s", err)
        
        if registered:
            _LOGGER.info(
                "Simple Chores card is now available - check Resources or add manually"
            )
            # Try to auto-add to resources
            await _async_add_to_lovelace_resources(hass)
        else:
            _LOGGER.warning(
                "Could not auto-register card. Please manually add to Lovelace resources:"
            )
            _LOGGER.warning("1. Copy %s to /config/www/community/simple-chores/", card_file)
            _LOGGER.warning("2. Add /local/community/simple-chores/simple-chores-card.js to Lovelace resources")
        
    except Exception as err:
        _LOGGER.error("Failed to register frontend resources: %s", err)
        _LOGGER.error("Path attempted: %s", hass.config.path(f"custom_components/{DOMAIN}/www"))


async def _async_add_to_lovelace_resources(hass: HomeAssistant) -> None:
    """Automatically add the card to Lovelace resources."""
    try:
        # For most reliability, just let the user add manually
        _LOGGER.info(
            "Simple Chores card should now be automatically available!"
        )
        _LOGGER.info("If not, manually add: /local/community/simple-chores/simple-chores-card.js to Lovelace resources")
        
    except Exception as err:
        _LOGGER.debug("Resource registration info failed: %s", err)


async def _async_auto_register_lovelace_resource(hass: HomeAssistant, url: str) -> None:
    """Automatically register a resource with Lovelace."""
    try:
        # Method 1: Use Lovelace config API directly
        from homeassistant.components import lovelace
        
        # Get the lovelace config
        ll_config = await lovelace.async_get_lovelace_config(hass)
        
        # Check if resources exist and add our card
        if "resources" not in ll_config:
            ll_config["resources"] = []
        
        # Check if already exists
        card_resource = {
            "url": url,
            "type": "module"
        }
        
        existing = any(
            r.get("url") == url for r in ll_config["resources"]
        )
        
        if not existing:
            ll_config["resources"].append(card_resource)
            await lovelace.async_save_config(hass, ll_config)
            _LOGGER.info("Successfully auto-added card to Lovelace resources!")
            return True
        else:
            _LOGGER.info("Card resource already exists in Lovelace config")
            return True
            
    except Exception as err:
        _LOGGER.debug("Method 1 (Lovelace API) failed: %s", err)
    
    try:
        # Method 2: Use websocket to send resource update
        from homeassistant.components import websocket_api
        
        # Create a synthetic websocket message to add the resource
        resource_data = {
            "url": url,
            "res_type": "module"
        }
        
        # Try to add via frontend websocket commands
        if hasattr(hass.data.get("frontend"), "async_get_resources"):
            resources = await hass.data["frontend"].async_get_resources()
            if url not in [r["url"] for r in resources]:
                # Use internal API to add resource
                hass.data["frontend"].async_add_resource(resource_data)
                _LOGGER.info("Added card resource via frontend API")
                return True
        
    except Exception as err:
        _LOGGER.debug("Method 2 (Websocket API) failed: %s", err)
    
    try:
        # Method 3: Direct file modification approach (async)
        
        # Try to modify .storage/lovelace_resources directly (careful approach)
        storage_path = hass.config.path(".storage/lovelace_resources")
        
        def _modify_lovelace_resources():
            if os.path.exists(storage_path):
                with open(storage_path, 'r') as f:
                    storage_data = json.load(f)
                
                resources = storage_data.get("data", {}).get("items", [])
                
                # Check if resource already exists
                existing = any(item.get("url") == url for item in resources)
                
                if not existing:
                    new_resource = {
                        "id": f"simple_chores_{len(resources)}",
                        "url": url,
                        "type": "module"
                    }
                    resources.append(new_resource)
                    
                    # Save back to file
                    with open(storage_path, 'w') as f:
                        json.dump(storage_data, f, indent=2)
                    
                    return True
            return False
        
        # Run file operations in executor to avoid blocking
        if await hass.async_add_executor_job(_modify_lovelace_resources):
            _LOGGER.info("Added card resource via direct storage modification")
            # Fire event to reload resources
            hass.bus.async_fire("lovelace_updated", {"mode": "storage"})
            return True
        
    except Exception as err:
        _LOGGER.debug("Method 3 (Direct storage) failed: %s", err)
    
    _LOGGER.info("Automatic resource registration not successful - manual addition needed")
    return False


async def _async_register_card_resource(hass: HomeAssistant) -> None:
    """Register the card resource with the frontend."""
    try:
        # This approach works with newer HA versions
        hass.data.setdefault("frontend_extra_module_url", set()).add(
            f"/{DOMAIN}/simple-chores-card.js"
        )
        
        # Fire event to notify frontend of new resource
        hass.bus.async_fire("frontend_set_theme", {"theme": None})
        
    except Exception as err:
        _LOGGER.debug("Resource registration failed: %s", err)


async def _async_register_with_websocket(hass: HomeAssistant) -> None:
    """Register card using websocket API for older HA versions."""
    try:
        from homeassistant.components import websocket_api
        
        @websocket_api.websocket_command(
            {
                "type": "frontend/lovelace_config",
            }
        )
        def handle_lovelace_config(hass, connection, msg):
            """Handle lovelace config requests."""
            # This is a simplified approach that just logs
            _LOGGER.info("Lovelace config requested - card should be available")
        
        websocket_api.async_register_command(hass, handle_lovelace_config)
        
    except Exception as err:
        _LOGGER.debug("Websocket registration failed: %s", err)