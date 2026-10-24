"""Tests for notification logic.

The first half checks the pure utility functions against local copies; the
async sending logic runs against the real notifications.py with the Home
Assistant stubs from conftest.py (fixed "now" of 2024-06-15 UTC).
"""
from __future__ import annotations

import inspect
from datetime import UTC, datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from homeassistant.util import dt as dt_util

from custom_components.simple_chores import notifications
from custom_components.simple_chores.const import CONF_NOTIFY_DAYS_BEFORE


def _get_due_date_label(days_ahead: int) -> str:
    """Local copy of get_due_date_label for testing without HA imports."""
    if days_ahead == 0:
        return "today"
    elif days_ahead == 1:
        return "tomorrow"
    elif days_ahead == 7:
        return "in 1 week"
    else:
        return f"in {days_ahead} days"


class TestGetDueDateLabel:
    """Tests for human-readable due date labels."""

    def test_today(self):
        assert _get_due_date_label(0) == "today"

    def test_tomorrow(self):
        assert _get_due_date_label(1) == "tomorrow"

    def test_one_week(self):
        assert _get_due_date_label(7) == "in 1 week"

    def test_two_days(self):
        assert _get_due_date_label(2) == "in 2 days"

    def test_three_days(self):
        assert _get_due_date_label(3) == "in 3 days"

    def test_fourteen_days(self):
        assert _get_due_date_label(14) == "in 14 days"


class TestNotificationMessageFormat:
    """Tests for notification message building logic."""

    def _build_message(self, chores, due_label="today"):
        """Build notification message the same way notifications.py does."""
        chore_list = "\n".join([f"• {c['name']} ({c.get('room_name', 'Unknown')})" for c in chores])
        return f"You have {len(chores)} chore(s) due {due_label}:\n{chore_list}"

    def test_single_chore(self):
        chores = [{"name": "Vacuum", "room_name": "Living Room"}]
        msg = self._build_message(chores)
        assert "1 chore(s) due today" in msg
        assert "• Vacuum (Living Room)" in msg

    def test_multiple_chores(self):
        chores = [
            {"name": "Vacuum", "room_name": "Living Room"},
            {"name": "Mop", "room_name": "Kitchen"},
        ]
        msg = self._build_message(chores)
        assert "2 chore(s) due today" in msg
        assert "• Vacuum (Living Room)" in msg
        assert "• Mop (Kitchen)" in msg

    def test_missing_room_name(self):
        chores = [{"name": "Clean"}]
        msg = self._build_message(chores)
        assert "• Clean (Unknown)" in msg

    def test_tomorrow_label(self):
        chores = [{"name": "Dust", "room_name": "Office"}]
        msg = self._build_message(chores, due_label="tomorrow")
        assert "due tomorrow" in msg

    def test_chore_filtering_by_date(self):
        """Test that chore filtering by next_due date works correctly."""
        all_chores = [
            {"name": "Today chore", "next_due": "2024-06-15", "room_name": "Room A"},
            {"name": "Tomorrow chore", "next_due": "2024-06-16", "room_name": "Room B"},
            {"name": "Next week chore", "next_due": "2024-06-22", "room_name": "Room C"},
        ]
        target_date_str = "2024-06-15"
        chores_due = [c for c in all_chores if c.get("next_due") == target_date_str]
        assert len(chores_due) == 1
        assert chores_due[0]["name"] == "Today chore"

    def test_chore_grouping_by_user(self):
        """Test chore grouping by assigned user."""
        chores = [
            {"name": "Chore A", "assigned_to": "user1"},
            {"name": "Chore B", "assigned_to": "user1"},
            {"name": "Chore C", "assigned_to": "user2"},
            {"name": "Chore D", "assigned_to": None},
        ]
        chores_by_user: dict[str | None, list] = {}
        for chore in chores:
            assigned = chore.get("assigned_to")
            if assigned not in chores_by_user:
                chores_by_user[assigned] = []
            chores_by_user[assigned].append(chore)

        assert len(chores_by_user["user1"]) == 2
        assert len(chores_by_user["user2"]) == 1
        assert len(chores_by_user[None]) == 1

    def test_user_service_matching(self):
        """Test the username-to-service matching logic."""
        services = [
            "mobile_app_nates_iphone",
            "mobile_app_janes_pixel",
            "mobile_app_office_tablet",
        ]
        username = "Nate"
        normalized = username.lower().replace(" ", "_").replace("-", "_")

        matched = [s for s in services if normalized in s.replace("mobile_app_", "").lower()]
        assert matched == ["mobile_app_nates_iphone"]

    def test_user_service_no_match(self):
        """No match returns empty list."""
        services = ["mobile_app_janes_pixel"]
        username = "Bob"
        normalized = username.lower().replace(" ", "_").replace("-", "_")

        matched = [s for s in services if normalized in s.replace("mobile_app_", "").lower()]
        assert matched == []


class FakeServices:
    def __init__(self, notify_targets):
        self._notify = dict.fromkeys(notify_targets)
        self.calls: list[tuple[str, str, dict]] = []

    def async_services(self):
        return {"notify": self._notify}

    async def async_call(self, domain, service, data):
        self.calls.append((domain, service, data))


class FakeCoordinator:
    def __init__(self, chores):
        self.data = {"chores": chores}
        self.immediate_refreshes = 0

    async def _async_refresh_now(self):
        self.immediate_refreshes += 1

    async def async_request_refresh(self):
        raise AssertionError("async_request_refresh() is debounced by 10s; use _async_refresh_now()")

    async def async_get_user_name(self, user_id):
        return {"u-nate": "Nate"}.get(user_id, user_id)


@pytest.fixture
def hass():
    return SimpleNamespace(services=FakeServices(["mobile_app_nates_phone", "mobile_app_wall_tablet"]))


def _chore(name, next_due, assigned_to=None):
    return {"id": f"id-{name}", "name": name, "room_name": "Kitchen", "next_due": next_due, "assigned_to": assigned_to}


class TestSendDueNotification:
    """async_send_due_notification used the host clock's date and the debounced
    refresh; the configured HA timezone and the immediate refresh are what the
    rest of the integration uses."""

    async def test_refreshes_immediately_before_reading_chores(self, hass):
        coordinator = FakeCoordinator([_chore("Dishes", "2024-06-15")])
        await notifications.async_send_due_notification(hass, coordinator)
        assert coordinator.immediate_refreshes == 1

    def test_no_debounced_refresh_or_host_clock_in_source(self):
        source = inspect.getsource(notifications)
        assert "await coordinator.async_request_refresh()" not in source
        assert "date.today()" not in source, "use dt_util.now().date() so the HA timezone applies"

    async def test_today_comes_from_the_ha_clock(self, hass):
        # "Tomorrow" relative to the pinned HA now (2024-06-15); under the host
        # clock's date nothing would match and no notification would go out
        coordinator = FakeCoordinator([_chore("Dishes", "2024-06-16"), _chore("Later", "2024-06-17")])
        entry = SimpleNamespace(options={CONF_NOTIFY_DAYS_BEFORE: [1]})
        await notifications.async_send_due_notification(hass, coordinator, entry)

        targets = sorted(service for _domain, service, _data in hass.services.calls)
        assert targets == ["mobile_app_nates_phone", "mobile_app_wall_tablet"]
        _domain, _service, data = hass.services.calls[0]
        assert data["title"] == "Unassigned Chores Due Tomorrow"
        assert "Dishes (Kitchen)" in data["message"]
        assert "Later" not in data["message"]

    async def test_follows_the_configured_timezone_across_midnight(self, hass, monkeypatch):
        # 23:30 on the 15th in UTC is already the 16th in a UTC+2 house. HA's
        # dt_util.now() is in the configured zone, so the 16th is "today".
        local_now = datetime(2024, 6, 16, 1, 30, tzinfo=timezone(timedelta(hours=2)))
        monkeypatch.setattr(dt_util, "now", lambda: local_now)
        assert local_now.astimezone(UTC).date().isoformat() == "2024-06-15"

        coordinator = FakeCoordinator([_chore("Dishes", "2024-06-16", assigned_to="u-nate")])
        await notifications.async_send_due_notification(hass, coordinator)  # default: day-of only

        assert [service for _d, service, _data in hass.services.calls] == ["mobile_app_nates_phone"]
        assert hass.services.calls[0][2]["title"] == "Nate's Chores Due Today"

    async def test_nothing_sent_when_nothing_is_due(self, hass):
        coordinator = FakeCoordinator([_chore("Dishes", "2024-06-20")])
        await notifications.async_send_due_notification(hass, coordinator)
        assert hass.services.calls == []
