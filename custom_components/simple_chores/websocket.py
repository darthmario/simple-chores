"""WebSocket API for the Simple Chores integration.

Completion history is served here rather than published as a state attribute.
Attributes are pushed to every connected client on every state update, which
made a growing history expensive for always-on displays and pushed
``sensor.total_chores`` past Home Assistant's 16 KB recorder limit. The card
only needs raw entries when someone opens the calendar or the history modal,
so it asks for them then.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any, Final

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN, EXPOSED_HISTORY_ENTRIES, MAX_HISTORY_ENTRIES

if TYPE_CHECKING:
    from .coordinator import SimpleChoresCoordinator

_LOGGER = logging.getLogger(__name__)

# Fields sent per chore. Deliberately excludes created_at, last_completed and
# last_completed_by, which no consumer reads. Roughly half the bytes in a chore
# list are repeated JSON key names, so dropping dead ones is worth it even
# here, where the 16 KB attribute limit no longer applies.
_CHORE_FIELDS: Final = (
    "id",
    "name",
    "room_name",
    "room_id",
    "frequency",
    "next_due",
    "assigned_to",
    "days_overdue",
    "recurrence_type",
    "anchor_days_of_week",
    "anchor_type",
    "anchor_day_of_month",
    "anchor_week",
    "anchor_weekday",
    "interval",
    "estimated_minutes",
    "steps",
    "step_progress",
)


def _slim_chore(chore: dict[str, Any]) -> dict[str, Any]:
    """Build the wire form of a chore, dropping fields that say nothing.

    Most chores carry several null anchor fields and empty step lists;
    JavaScript reads a missing key exactly as it reads null everywhere the card
    touches these. Note that 0 is kept - it is a meaningful anchor_weekday
    (Sunday) - except for days_overdue, where it is the uninteresting default.
    """
    slim: dict[str, Any] = {}
    for field in _CHORE_FIELDS:
        value = chore.get(field)
        if value is None or value == [] or value == {}:
            continue
        if field == "days_overdue" and not value:
            continue
        slim[field] = value
    return slim


# hass.data key marking that the commands are registered, so reloading a
# config entry doesn't try to register them a second time
DATA_WEBSOCKET_REGISTERED = "simple_chores_websocket_registered"

WS_TYPE_HISTORY = f"{DOMAIN}/history"
WS_TYPE_CHORES = f"{DOMAIN}/chores"


@callback
def async_register_websocket_api(hass: HomeAssistant) -> None:
    """Register the integration's websocket commands (idempotent)."""
    if hass.data.get(DATA_WEBSOCKET_REGISTERED):
        return

    websocket_api.async_register_command(hass, websocket_get_history)
    websocket_api.async_register_command(hass, websocket_get_chores)
    hass.data[DATA_WEBSOCKET_REGISTERED] = True
    _LOGGER.info("Registered websocket commands: %s, %s", WS_TYPE_HISTORY, WS_TYPE_CHORES)


def _get_coordinator(hass: HomeAssistant) -> SimpleChoresCoordinator | None:
    """Return the coordinator for the single config entry, if set up."""
    entries: dict[str, SimpleChoresCoordinator] = hass.data.get(DOMAIN, {})
    for value in entries.values():
        # hass.data[DOMAIN] also holds bookkeeping keys, so pick the real one
        if hasattr(value, "store"):
            return value
    return None


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_TYPE_HISTORY,
        vol.Optional("limit", default=EXPOSED_HISTORY_ENTRIES): vol.All(
            vol.Coerce(int), vol.Range(min=1, max=MAX_HISTORY_ENTRIES)
        ),
    }
)
@callback
def websocket_get_history(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return recent completion history, newest entries last."""
    coordinator = _get_coordinator(hass)
    if coordinator is None:
        connection.send_error(msg["id"], "not_loaded", "Simple Chores is not set up")
        return

    history = coordinator.store.get_recent_history(max_entries=msg["limit"])
    connection.send_result(msg["id"], {"history": history, "count": len(history)})


@websocket_api.websocket_command({vol.Required("type"): WS_TYPE_CHORES})
@callback
def websocket_get_chores(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return every active chore, plus which of them fall in each due window.

    The due groupings are sent as ID lists rather than repeated chore objects:
    an overdue chore appears in three of them, and duplicating the full record
    three times is what made this data too big for state attributes in the
    first place. Categorising here rather than in the card also keeps one
    definition of "due today".
    """
    coordinator = _get_coordinator(hass)
    if coordinator is None or coordinator.data is None:
        connection.send_error(msg["id"], "not_loaded", "Simple Chores is not set up")
        return

    data = coordinator.data

    def ids(key: str) -> list[str]:
        return [chore["id"] for chore in data.get(key, []) if chore.get("id")]

    connection.send_result(
        msg["id"],
        {
            "revision": data.get("revision", ""),
            "chores": [_slim_chore(chore) for chore in data.get("chores", [])],
            "due_today": ids("due_today"),
            "due_this_week": ids("due_this_week"),
            "overdue": ids("overdue"),
            "today": data.get("today"),
            "seven_days_from_today": data.get("seven_days_from_today"),
        },
    )
