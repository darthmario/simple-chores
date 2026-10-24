"""Tests for service registration in custom_components/simple_chores/__init__.py.

conftest.py registers a stub package for ``custom_components.simple_chores`` so
the submodules import without Home Assistant, which means the real
``__init__.py`` has to be loaded by path here.
"""
from __future__ import annotations

import importlib.util
import sys
from datetime import date
from importlib.machinery import SourceFileLoader
from pathlib import Path
from types import SimpleNamespace

import pytest
from homeassistant.core import ServiceCall, SupportsResponse

from custom_components.simple_chores.const import (
    DOMAIN,
    SERVICE_ADD_CHORE,
    SERVICE_COMPLETE_CHORE,
    SERVICE_GET_HISTORY,
    SERVICE_GET_USER_STATS,
)
from custom_components.simple_chores.coordinator import SimpleChoresCoordinator
from custom_components.simple_chores.store import SimpleChoresStore

from .test_coordinator import FakeConfigEntry, FakeHass

TODAY = date(2024, 6, 15)


def _load_integration():
    name = "custom_components.simple_chores._integration"
    if name in sys.modules:
        return sys.modules[name]
    path = Path(__file__).resolve().parent.parent / "custom_components" / "simple_chores" / "__init__.py"
    # Load it as a plain module (not a package) so its relative imports resolve
    # against the stub package conftest.py registered
    spec = importlib.util.spec_from_loader(name, SourceFileLoader(name, str(path)), is_package=False)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


class FakeServiceRegistry:
    def __init__(self):
        self.registered: dict[str, SimpleNamespace] = {}

    def async_register(self, domain, service, handler, schema=None, supports_response=None):
        assert domain == DOMAIN
        self.registered[service] = SimpleNamespace(handler=handler, schema=schema, supports_response=supports_response)


@pytest.fixture
def hass():
    hass = FakeHass()
    hass.services = FakeServiceRegistry()
    return hass


@pytest.fixture
async def coordinator(hass):
    coordinator = SimpleChoresCoordinator(hass, SimpleChoresStore(hass), config_entry=FakeConfigEntry())
    await coordinator.async_refresh()
    return coordinator


@pytest.fixture
async def services(hass, coordinator):
    integration = _load_integration()
    await integration._async_setup_services(hass, coordinator)
    return hass.services.registered


class TestResponseServices:
    """get_history and get_user_stats return data, which Home Assistant throws
    away unless the service is registered as supporting a response. Automations
    and Developer Tools saw nothing."""

    def test_every_service_is_registered(self, services):
        integration = _load_integration()
        assert set(services) == set(integration.ALL_SERVICES)

    @pytest.mark.parametrize("service", [SERVICE_GET_HISTORY, SERVICE_GET_USER_STATS])
    def test_data_services_return_a_response(self, services, service):
        assert services[service].supports_response is SupportsResponse.ONLY

    def test_other_services_do_not_claim_a_response(self, services):
        integration = _load_integration()
        for name in integration.ALL_SERVICES:
            if name in (SERVICE_GET_HISTORY, SERVICE_GET_USER_STATS):
                continue
            assert services[name].supports_response is None, name

    async def test_get_history_returns_the_completions(self, services, coordinator):
        chore = await coordinator.async_add_chore("Vacuum", "area_kitchen", "weekly", start_date=TODAY)
        await coordinator.async_complete_chore(chore["id"], "ha-user-1")

        response = await services[SERVICE_GET_HISTORY].handler(ServiceCall(data={"chore_id": chore["id"]}))

        assert [h["chore_id"] for h in response["history"]] == [chore["id"]]
        assert response["history"][0]["completed_by_name"] == "Nate"

    async def test_get_user_stats_returns_a_response(self, services, coordinator):
        chore = await coordinator.async_add_chore("Vacuum", "area_kitchen", "weekly", start_date=TODAY)
        await coordinator.async_complete_chore(chore["id"], "ha-user-1")

        response = await services[SERVICE_GET_USER_STATS].handler(ServiceCall(data={}))

        assert "stats" in response
        assert response["stats"]

    async def test_mutating_services_still_work_through_the_handler(self, services, coordinator):
        await services[SERVICE_ADD_CHORE].handler(
            ServiceCall(data={"name": "Mop", "room_id": "area_kitchen", "frequency": "daily"})
        )
        chore = next(c for c in coordinator.data["chores"] if c["name"] == "Mop")
        await services[SERVICE_COMPLETE_CHORE].handler(ServiceCall(data={"chore_id": chore["id"]}))
        assert coordinator.store.get_chore_history(chore["id"])
