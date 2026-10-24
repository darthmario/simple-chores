"""Pytest fixtures for Simple Chores tests."""
from __future__ import annotations

import sys
import types
from datetime import UTC, date, datetime
from enum import Enum
from types import SimpleNamespace

import pytest

# Stub the package __init__.py to allow importing submodules
# (const.py, recurrence.py) without pulling in Home Assistant dependencies.
_pkg = types.ModuleType("custom_components")
_pkg.__path__ = ["custom_components"]
sys.modules.setdefault("custom_components", _pkg)

_sub = types.ModuleType("custom_components.simple_chores")
_sub.__path__ = ["custom_components/simple_chores"]
sys.modules.setdefault("custom_components.simple_chores", _sub)

# ---------------------------------------------------------------------------
# Lightweight Home Assistant stubs
#
# The real `homeassistant` package is not installed in this environment.
# store.py and coordinator.py import a handful of HA modules at import time,
# so we install minimal stand-ins into sys.modules BEFORE those modules are
# imported by tests. Everything uses sys.modules.setdefault so a real HA
# install (or other stubs) would take precedence.
# ---------------------------------------------------------------------------

# Fixed, timezone-aware "now" so tests are deterministic.
# June 15, 2024 is a Saturday (matches the date fixtures below).
FIXED_NOW = datetime(2024, 6, 15, 12, 0, 0, tzinfo=UTC)


class StubStore:
    """Stand-in for homeassistant.helpers.storage.Store."""

    def __init__(self, hass, version, key, **kwargs):
        self.hass = hass
        self.version = version
        self.key = key
        self.load_result = None
        self.saved_data = None
        self.save_calls: list = []

    def __class_getitem__(cls, _item):
        return cls

    async def async_load(self):
        return self.load_result

    async def async_save(self, data):
        self.saved_data = data
        self.save_calls.append(data)


class StubDataUpdateCoordinator:
    """Stand-in for homeassistant.helpers.update_coordinator.DataUpdateCoordinator."""

    def __init__(self, hass, logger, name=None, update_interval=None, **kwargs):
        self.hass = hass
        self.logger = logger
        self.name = name
        self.update_interval = update_interval
        self.data = None

    def __class_getitem__(cls, _item):
        return cls

    async def async_request_refresh(self):
        # Real HA debounces this with a 10s cooldown; the integration uses
        # async_refresh() instead so edits show up immediately
        self.refresh_calls = getattr(self, "refresh_calls", 0) + 1
        self.data = await self._async_update_data()

    async def async_refresh(self):
        self.refresh_calls = getattr(self, "refresh_calls", 0) + 1
        self.data = await self._async_update_data()

    async def async_config_entry_first_refresh(self):
        self.data = await self._async_update_data()

    def async_update_listeners(self):
        pass


class StubConfigEntry:
    """Stand-in for homeassistant.config_entries.ConfigEntry."""

    def __init__(self, data=None, options=None, entry_id="test-entry"):
        self.data = data or {}
        self.options = options or {}
        self.entry_id = entry_id

    def __class_getitem__(cls, _item):
        return cls


class StubHomeAssistant:
    """Stand-in for homeassistant.core.HomeAssistant."""


class StubServiceCall:
    """Stand-in for homeassistant.core.ServiceCall."""

    def __init__(self, data=None, context=None):
        self.data = data or {}
        self.context = context or SimpleNamespace(user_id=None)


class StubEvent:
    """Stand-in for homeassistant.core.Event."""

    def __init__(self, event_type, data=None, context=None):
        self.event_type = event_type
        self.data = data or {}
        self.context = context


class StubSupportsResponse(Enum):
    """Stand-in for homeassistant.core.SupportsResponse."""

    NONE = "none"
    OPTIONAL = "optional"
    ONLY = "only"


class StubPlatform(str, Enum):
    """Stand-in for homeassistant.const.Platform."""

    SENSOR = "sensor"
    BINARY_SENSOR = "binary_sensor"
    CALENDAR = "calendar"


class StubHomeAssistantError(Exception):
    """Stand-in for homeassistant.exceptions.HomeAssistantError."""


class StubServiceNotFound(StubHomeAssistantError):
    """Stand-in for homeassistant.exceptions.ServiceNotFound."""


def _callback(func):
    """Stand-in for homeassistant.core.callback (marks a function loop-safe)."""
    return func


def _area_registry_async_get(hass):
    """Return the area registry attached to the stub hass."""
    return hass.area_registry


def _async_track_time_change(hass, action, hour=None, minute=None, second=None):
    """Stand-in for homeassistant.helpers.event.async_track_time_change.

    Records the subscription on ``hass.time_change_listeners`` when the fake
    hass has that list, and returns the unsubscribe callable like HA does.
    """
    entry = SimpleNamespace(action=action, hour=hour, minute=minute, second=second)
    listeners = getattr(hass, "time_change_listeners", None)
    if listeners is not None:
        listeners.append(entry)

    def _unsub():
        if listeners is not None and entry in listeners:
            listeners.remove(entry)

    return _unsub


def _websocket_command(schema):
    """Stand-in for websocket_api.websocket_command (decorator, no-op here)."""

    def _decorator(func):
        func.websocket_schema = schema
        return func

    return _decorator


def _has_at_least_one_key(*keys):
    """Stand-in for config_validation.has_at_least_one_key."""

    def _validate(obj):
        if not any(k in obj for k in keys):
            raise ValueError(f"must contain at least one of {keys}")
        return obj

    return _validate


def _make_module(name: str, is_pkg: bool = False) -> types.ModuleType:
    if name in sys.modules:
        return sys.modules[name]
    mod = types.ModuleType(name)
    if is_pkg:
        mod.__path__ = []
    sys.modules[name] = mod
    return mod


_ha = _make_module("homeassistant", is_pkg=True)
_ha_core = _make_module("homeassistant.core")
_ha_core.HomeAssistant = getattr(_ha_core, "HomeAssistant", StubHomeAssistant)
_ha_core.ServiceCall = getattr(_ha_core, "ServiceCall", StubServiceCall)
_ha_core.Event = getattr(_ha_core, "Event", StubEvent)
_ha_core.SupportsResponse = getattr(_ha_core, "SupportsResponse", StubSupportsResponse)
if not hasattr(_ha_core, "callback"):
    _ha_core.callback = _callback
_ha.core = _ha_core

_ha_const = _make_module("homeassistant.const")
_ha_const.Platform = getattr(_ha_const, "Platform", StubPlatform)
_ha.const = _ha_const

_ha_exceptions = _make_module("homeassistant.exceptions")
_ha_exceptions.HomeAssistantError = getattr(_ha_exceptions, "HomeAssistantError", StubHomeAssistantError)
_ha_exceptions.ServiceNotFound = getattr(_ha_exceptions, "ServiceNotFound", StubServiceNotFound)
_ha.exceptions = _ha_exceptions

_ha_config_entries = _make_module("homeassistant.config_entries")
_ha_config_entries.ConfigEntry = getattr(_ha_config_entries, "ConfigEntry", StubConfigEntry)
_ha.config_entries = _ha_config_entries

_ha_helpers = _make_module("homeassistant.helpers", is_pkg=True)
_ha.helpers = _ha_helpers

_ha_storage = _make_module("homeassistant.helpers.storage")
_ha_storage.Store = getattr(_ha_storage, "Store", StubStore)
_ha_helpers.storage = _ha_storage

_ha_update_coordinator = _make_module("homeassistant.helpers.update_coordinator")
_ha_update_coordinator.DataUpdateCoordinator = getattr(
    _ha_update_coordinator, "DataUpdateCoordinator", StubDataUpdateCoordinator
)
_ha_helpers.update_coordinator = _ha_update_coordinator

_ha_area_registry = _make_module("homeassistant.helpers.area_registry")
if not hasattr(_ha_area_registry, "async_get"):
    _ha_area_registry.async_get = _area_registry_async_get
if not hasattr(_ha_area_registry, "EVENT_AREA_REGISTRY_UPDATED"):
    _ha_area_registry.EVENT_AREA_REGISTRY_UPDATED = "area_registry_updated"
_ha_helpers.area_registry = _ha_area_registry

_ha_event = _make_module("homeassistant.helpers.event")
if not hasattr(_ha_event, "async_track_time_change"):
    _ha_event.async_track_time_change = _async_track_time_change
_ha_helpers.event = _ha_event

# Just enough of config_validation for the service schemas in __init__.py
_ha_cv = _make_module("homeassistant.helpers.config_validation")
for _name, _validator in (
    ("string", str),
    ("boolean", bool),
    ("date", lambda value: value if isinstance(value, date) else date.fromisoformat(value)),
    ("ensure_list", lambda value: value if isinstance(value, list) else [value]),
    ("has_at_least_one_key", _has_at_least_one_key),
):
    if not hasattr(_ha_cv, _name):
        setattr(_ha_cv, _name, _validator)
_ha_helpers.config_validation = _ha_cv

_ha_components = _make_module("homeassistant.components", is_pkg=True)
_ha.components = _ha_components
_ha_websocket_api = _make_module("homeassistant.components.websocket_api")
if not hasattr(_ha_websocket_api, "websocket_command"):
    _ha_websocket_api.websocket_command = _websocket_command
if not hasattr(_ha_websocket_api, "async_register_command"):
    _ha_websocket_api.async_register_command = lambda *_args: None
if not hasattr(_ha_websocket_api, "ActiveConnection"):
    _ha_websocket_api.ActiveConnection = type("ActiveConnection", (), {})
_ha_components.websocket_api = _ha_websocket_api

_ha_util = _make_module("homeassistant.util", is_pkg=True)
_ha.util = _ha_util

def _parse_datetime(value):
    """Stand-in for homeassistant.util.dt.parse_datetime (None on bad input)."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None


_ha_dt = _make_module("homeassistant.util.dt")
if not hasattr(_ha_dt, "now"):
    _ha_dt.FIXED_NOW = FIXED_NOW
    _ha_dt.now = lambda: FIXED_NOW
if not hasattr(_ha_dt, "parse_datetime"):
    _ha_dt.parse_datetime = _parse_datetime
if not hasattr(_ha_dt, "as_local"):
    # Tests pin everything to UTC, so "local" is a no-op here
    _ha_dt.as_local = lambda value: value
_ha_util.dt = _ha_dt


@pytest.fixture
def today() -> date:
    """Return a fixed date for consistent testing."""
    return date(2024, 6, 15)  # Saturday, June 15, 2024


@pytest.fixture
def sample_chore() -> dict:
    """Return a sample chore dictionary."""
    return {
        "id": "test-chore-1",
        "name": "Vacuum living room",
        "room_id": "area_living_room",
        "frequency": "weekly",
        "next_due": "2024-06-15",
        "recurrence_type": "interval",
        "assigned_to": None,
    }


@pytest.fixture
def sample_anchored_weekly_chore() -> dict:
    """Return a sample anchored weekly chore."""
    return {
        "id": "test-chore-2",
        "name": "Take out trash",
        "room_id": "area_kitchen",
        "frequency": "weekly",
        "next_due": "2024-06-17",
        "recurrence_type": "anchored",
        "anchor_days_of_week": [1, 4],  # Monday and Thursday
        "interval": 1,
    }


@pytest.fixture
def sample_anchored_monthly_chore() -> dict:
    """Return a sample anchored monthly chore (day of month)."""
    return {
        "id": "test-chore-3",
        "name": "Pay rent",
        "room_id": "custom_office",
        "frequency": "monthly",
        "next_due": "2024-07-01",
        "recurrence_type": "anchored",
        "anchor_type": "day_of_month",
        "anchor_day_of_month": 1,
        "interval": 1,
    }
