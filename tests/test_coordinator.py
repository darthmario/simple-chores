"""Tests for SimpleChoresCoordinator.

These run against the real coordinator.py and store.py using the lightweight
Home Assistant stubs installed by conftest.py (fixed "now" of 2024-06-15,
a Saturday). The hass stub provides an area registry with two areas and an
auth manager with HA users.
"""
from __future__ import annotations

from datetime import UTC, date, datetime
from types import SimpleNamespace

import pytest
from homeassistant.util import dt as dt_util

from custom_components.simple_chores.coordinator import SimpleChoresCoordinator
from custom_components.simple_chores.store import SimpleChoresStore

TODAY = date(2024, 6, 15)


class FakeArea(SimpleNamespace):
    pass


class FakeAreaRegistry:
    def __init__(self, areas):
        self.areas = areas

    def async_list_areas(self):
        return self.areas


class FakeAuth:
    def __init__(self, users):
        self.users = users

    async def async_get_users(self):
        return self.users


class FakeBus:
    def __init__(self):
        self.listeners: list[tuple[str, object]] = []

    def async_listen(self, event_type, listener):
        entry = (event_type, listener)
        self.listeners.append(entry)

        def _unsub():
            self.listeners.remove(entry)

        return _unsub


class FakeConfigEntry(SimpleNamespace):
    def __init__(self, **kwargs):
        super().__init__(data={}, options={}, entry_id="test-entry", on_unload=[], **kwargs)

    def async_on_unload(self, func):
        self.on_unload.append(func)


class FakeHass:
    def __init__(self):
        self.bus = FakeBus()
        # Filled by the async_track_time_change stub in conftest
        self.time_change_listeners: list = []
        self.area_registry = FakeAreaRegistry(
            [
                FakeArea(id="kitchen", name="Kitchen", icon="mdi:stove"),
                FakeArea(id="living_room", name="Living Room", icon=None),
            ]
        )
        self.auth = FakeAuth(
            [
                SimpleNamespace(id="ha-user-1", name="Nate", system_generated=False, is_active=True),
                SimpleNamespace(id="ha-sys-1", name="Supervisor", system_generated=True, is_active=True),
                SimpleNamespace(id="ha-user-2", name="Inactive", system_generated=False, is_active=False),
            ]
        )


@pytest.fixture
def hass():
    return FakeHass()


@pytest.fixture
def store(hass):
    return SimpleChoresStore(hass)


@pytest.fixture
def coordinator(hass, store):
    return SimpleChoresCoordinator(hass, store, config_entry=FakeConfigEntry())


class TestUpdateData:
    async def test_categorization(self, coordinator, store):
        overdue = store.add_chore("Overdue", "area_kitchen", "weekly", start_date=date(2024, 6, 13))
        due_today = store.add_chore("Today", "area_kitchen", "daily", start_date=TODAY)
        this_week = store.add_chore("This week", "area_living_room", "weekly", start_date=date(2024, 6, 20))
        future = store.add_chore("Future", "area_living_room", "monthly", start_date=date(2024, 7, 30))
        one_off = store.add_chore("One off", "area_kitchen", "once", start_date=TODAY)
        store.complete_chore(one_off["id"], "u1", "Nate", next_due=None)

        await coordinator.async_request_refresh()
        data = coordinator.data

        assert data["today"] == "2024-06-15"
        assert data["seven_days_from_today"] == "2024-06-22"

        # Completed one-off excluded everywhere
        active_ids = {c["id"] for c in data["chores"]}
        assert one_off["id"] not in active_ids
        assert data["total_chores"] == 4

        # Overdue is also counted as due today
        overdue_ids = {c["id"] for c in data["overdue"]}
        due_today_ids = {c["id"] for c in data["due_today"]}
        assert overdue_ids == {overdue["id"]}
        assert due_today_ids == {overdue["id"], due_today["id"]}
        assert data["overdue_count"] == 1
        assert data["due_today_count"] == 2
        assert data["has_overdue"] is True

        # days_overdue computed for overdue, zero otherwise
        overdue_entry = next(c for c in data["overdue"] if c["id"] == overdue["id"])
        assert overdue_entry["days_overdue"] == 2
        today_entry = next(c for c in data["due_today"] if c["id"] == due_today["id"])
        assert today_entry["days_overdue"] == 0

        # Rolling 7-day window excludes today and far-future
        week_ids = {c["id"] for c in data["due_this_week"]}
        assert week_ids == {this_week["id"]}
        assert data["due_this_week_count"] == 1
        assert future["id"] not in week_ids

        # Grouped by room
        kitchen = {c["id"] for c in data["by_room"]["area_kitchen"]}
        living = {c["id"] for c in data["by_room"]["area_living_room"]}
        assert kitchen == {overdue["id"], due_today["id"]}
        assert living == {this_week["id"], future["id"]}

    async def test_no_overdue(self, coordinator, store):
        store.add_chore("Today", "area_kitchen", "daily", start_date=TODAY)
        await coordinator.async_request_refresh()
        assert coordinator.data["has_overdue"] is False
        assert coordinator.data["overdue"] == []

    async def test_rooms_combine_areas_and_custom(self, coordinator, store):
        custom = store.add_room("Garage", icon="mdi:garage")
        await coordinator.async_request_refresh()
        rooms = {r["id"]: r for r in coordinator.data["rooms"]}
        assert rooms["area_kitchen"]["name"] == "Kitchen"
        assert rooms["area_living_room"]["icon"] == "mdi:home"  # default icon for None
        assert rooms[custom["id"]]["name"] == "Garage"
        assert rooms["area_kitchen"]["is_custom"] is False
        assert rooms[custom["id"]]["is_custom"] is True

    async def test_room_name_resolution(self, coordinator, store):
        custom = store.add_room("Garage")
        in_area = store.add_chore("A", "area_kitchen", "weekly")
        in_custom = store.add_chore("B", custom["id"], "weekly")
        orphan = store.add_chore("C", "custom_nonexistent", "weekly")

        await coordinator.async_request_refresh()
        by_id = {c["id"]: c for c in coordinator.data["chores"]}
        assert by_id[in_area["id"]]["room_name"] == "Kitchen"
        assert by_id[in_custom["id"]]["room_name"] == "Garage"
        assert by_id[orphan["id"]]["room_name"] == "Unknown Room"

    async def test_room_cache_invalidation(self, coordinator, store):
        # A chore must exist for _get_room_name to run and build the cache
        store.add_chore("Vacuum", "area_kitchen", "weekly")
        await coordinator.async_request_refresh()
        assert coordinator._room_name_cache is not None

        room = await coordinator.async_add_room("Garage")
        # async_add_room invalidates and its refresh rebuilds the cache
        assert coordinator._get_room_name(room["id"], coordinator.data["rooms"]) == "Garage"

    async def test_stale_cache_without_invalidation(self, coordinator, store):
        store.add_chore("Vacuum", "area_kitchen", "weekly")
        await coordinator.async_request_refresh()  # cache built with initial rooms
        store.add_room("Garage")  # bypass coordinator: no invalidation
        all_rooms = await coordinator._get_all_rooms()
        # Cache is stale until explicitly invalidated
        new_room_id = next(r["id"] for r in all_rooms if r["name"] == "Garage")
        assert coordinator._get_room_name(new_room_id, all_rooms) == "Unknown Room"
        coordinator._invalidate_room_cache()
        assert coordinator._get_room_name(new_room_id, all_rooms) == "Garage"


class TestUsers:
    async def test_async_get_users_filters_system_and_inactive(self, coordinator, store):
        custom = store.add_user("Kiddo")
        users = await coordinator.async_get_users()
        ids = {u["id"] for u in users}
        assert ids == {"ha-user-1", custom["id"]}

    async def test_async_get_user_name(self, coordinator, store):
        custom = store.add_user("Kiddo")
        assert await coordinator.async_get_user_name(custom["id"]) == "Kiddo"
        assert await coordinator.async_get_user_name("ha-user-1") == "Nate"
        assert await coordinator.async_get_user_name("nobody") == "nobody"


class TestCompleteChore:
    async def test_interval_chore_reschedules_from_today(self, coordinator, store):
        # Overdue weekly interval chore: completion reschedules from today, not from due date
        chore = store.add_chore("Vacuum", "area_kitchen", "weekly", start_date=date(2024, 6, 13))
        result = await coordinator.async_complete_chore(chore["id"], "ha-user-1")
        assert result["next_due"] == "2024-06-22"  # today + 7
        assert result["last_completed_by"] == "ha-user-1"
        assert store.history[-1]["completed_by_name"] == "Nate"
        # Saved and refreshed
        assert store._store.saved_data is not None
        assert coordinator.data is not None

    async def test_anchored_chore_calculates_from_future_due_date(self, coordinator, store):
        # Anchored Monday chore due next Monday (6/17); completing early (today 6/15)
        # must compute from the current due date to keep the anchor pattern.
        chore = store.add_chore(
            "Trash",
            "area_kitchen",
            "weekly",
            start_date=date(2024, 6, 17),
            recurrence_type="anchored",
            anchor_days_of_week=[1],  # Monday
        )
        result = await coordinator.async_complete_chore(chore["id"], "ha-user-1")
        assert result["next_due"] == "2024-06-24"  # Monday after the anchored 6/17

    async def test_anchored_chore_overdue_calculates_from_today(self, coordinator, store):
        # Anchored Monday chore overdue since 6/10; max(today, due) = today (Sat 6/15)
        chore = store.add_chore(
            "Trash",
            "area_kitchen",
            "weekly",
            start_date=date(2024, 6, 10),
            recurrence_type="anchored",
            anchor_days_of_week=[1],  # Monday
        )
        result = await coordinator.async_complete_chore(chore["id"], "ha-user-1")
        assert result["next_due"] == "2024-06-17"  # next Monday after today

    async def test_one_off_completion(self, coordinator, store):
        chore = store.add_chore("Build shed", "area_kitchen", "once")
        result = await coordinator.async_complete_chore(chore["id"], "ha-user-1")
        assert result["is_completed"] is True
        await coordinator.async_request_refresh()
        assert coordinator.data["total_chores"] == 0

    async def test_unknown_user_defaults(self, coordinator, store):
        chore = store.add_chore("Vacuum", "area_kitchen", "weekly")
        await coordinator.async_complete_chore(chore["id"])
        assert store.history[-1]["completed_by"] == "unknown"
        assert store.history[-1]["completed_by_name"] == "unknown"

    async def test_unknown_chore_returns_none(self, coordinator):
        assert await coordinator.async_complete_chore("missing", "ha-user-1") is None


class TestSkipAndSnooze:
    async def test_skip_advances_from_current_due(self, coordinator, store):
        chore = store.add_chore("Vacuum", "area_kitchen", "weekly", start_date=TODAY)
        result = await coordinator.async_skip_chore(chore["id"])
        assert result["next_due"] == "2024-06-22"

    async def test_skip_unknown_returns_none(self, coordinator):
        assert await coordinator.async_skip_chore("missing") is None

    async def test_snooze_postpones_one_day(self, coordinator, store):
        chore = store.add_chore("Vacuum", "area_kitchen", "weekly", start_date=TODAY)
        result = await coordinator.async_snooze_chore(chore["id"])
        assert result["next_due"] == "2024-06-16"

    async def test_snooze_unknown_returns_none(self, coordinator):
        assert await coordinator.async_snooze_chore("missing") is None


class TestAddChore:
    async def test_rejects_nonexistent_room(self, coordinator):
        with pytest.raises(ValueError, match="Room does not exist"):
            await coordinator.async_add_chore("Vacuum", "custom_nope", "weekly")

    async def test_accepts_area_room(self, coordinator):
        chore = await coordinator.async_add_chore("Vacuum", "area_kitchen", "weekly")
        assert chore["room_id"] == "area_kitchen"
        assert coordinator.data["total_chores"] == 1

    async def test_accepts_custom_room(self, coordinator):
        room = await coordinator.async_add_room("Garage")
        chore = await coordinator.async_add_chore("Sweep", room["id"], "weekly")
        assert chore["room_id"] == room["id"]


class TestUpdateChore:
    async def test_validates_room_exists_when_provided(self, coordinator):
        chore = await coordinator.async_add_chore("Vacuum", "area_kitchen", "weekly")
        with pytest.raises(ValueError, match="Room does not exist"):
            await coordinator.async_update_chore(chore["id"], room_id="custom_nope")

    async def test_room_change_to_valid_room(self, coordinator):
        chore = await coordinator.async_add_chore("Vacuum", "area_kitchen", "weekly")
        updated = await coordinator.async_update_chore(chore["id"], room_id="area_living_room")
        assert updated["room_id"] == "area_living_room"

    async def test_unknown_chore_returns_none(self, coordinator):
        assert await coordinator.async_update_chore("missing", name="X") is None

    async def test_assigned_to_preserved_when_omitted(self, coordinator, store):
        # End-to-end regression: updating other fields must not clear assignment
        chore = await coordinator.async_add_chore("Vacuum", "area_kitchen", "weekly", assigned_to="user1")
        updated = await coordinator.async_update_chore(chore["id"], name="Vacuum upstairs")
        assert updated["assigned_to"] == "user1"
        assert store.chores[chore["id"]]["assigned_to"] == "user1"

    async def test_assigned_to_cleared_with_empty_string(self, coordinator):
        chore = await coordinator.async_add_chore("Vacuum", "area_kitchen", "weekly", assigned_to="user1")
        updated = await coordinator.async_update_chore(chore["id"], assigned_to="")
        assert updated["assigned_to"] is None

    async def test_assigned_to_reassigned(self, coordinator):
        chore = await coordinator.async_add_chore("Vacuum", "area_kitchen", "weekly", assigned_to="user1")
        updated = await coordinator.async_update_chore(chore["id"], assigned_to="user2")
        assert updated["assigned_to"] == "user2"


class TestRoomAndUserManagement:
    async def test_add_update_remove_room(self, coordinator, store):
        room = await coordinator.async_add_room("Garage", icon="mdi:garage")
        assert room["id"] in store.rooms

        updated = await coordinator.async_update_room(room["id"], name="Workshop")
        assert updated["name"] == "Workshop"
        assert await coordinator.async_update_room("custom_missing", name="X") is None

        assert await coordinator.async_remove_room(room["id"]) is True
        assert await coordinator.async_remove_room(room["id"]) is False

    async def test_remove_room_drops_room_chores_from_data(self, coordinator):
        room = await coordinator.async_add_room("Garage")
        await coordinator.async_add_chore("Sweep", room["id"], "weekly")
        assert coordinator.data["total_chores"] == 1
        await coordinator.async_remove_room(room["id"])
        assert coordinator.data["total_chores"] == 0

    async def test_add_update_remove_user(self, coordinator, store):
        user = await coordinator.async_add_user("Kiddo")
        assert user["id"] in store.users

        updated = await coordinator.async_update_user(user["id"], name="Kid 2")
        assert updated["name"] == "Kid 2"
        assert await coordinator.async_update_user("custom_user_missing", name="X") is None

        assert await coordinator.async_remove_user(user["id"]) is True
        assert await coordinator.async_remove_user(user["id"]) is False

    async def test_remove_chore(self, coordinator):
        chore = await coordinator.async_add_chore("Vacuum", "area_kitchen", "weekly")
        assert await coordinator.async_remove_chore(chore["id"]) is True
        assert await coordinator.async_remove_chore(chore["id"]) is False


class TestRevision:
    """The card re-fetches its chore list when this digest moves, so it has to
    change for anything the card renders - and not change otherwise."""

    async def test_present_and_stable_across_identical_updates(self, coordinator, store):
        store.add_chore("Vacuum", "area_kitchen", "weekly", start_date=TODAY)
        first = (await coordinator._async_update_data())["revision"]
        second = (await coordinator._async_update_data())["revision"]
        assert first
        assert first == second, "an unchanged chore list must not force a re-fetch"

    async def test_changes_when_a_chore_is_added(self, coordinator, store):
        store.add_chore("Vacuum", "area_kitchen", "weekly", start_date=TODAY)
        before = (await coordinator._async_update_data())["revision"]
        store.add_chore("Dishes", "area_kitchen", "daily", start_date=TODAY)
        assert (await coordinator._async_update_data())["revision"] != before

    async def test_changes_when_a_chore_is_removed(self, coordinator, store):
        chore = store.add_chore("Vacuum", "area_kitchen", "weekly", start_date=TODAY)
        before = (await coordinator._async_update_data())["revision"]
        store.remove_chore(chore["id"])
        assert (await coordinator._async_update_data())["revision"] != before

    @pytest.mark.parametrize(
        ("field", "value"),
        [
            ("name", "Renamed"),
            ("estimated_minutes", 15),
            ("steps", ["one", "two"]),
            ("assigned_to", "u2"),
            ("frequency", "daily"),
        ],
    )
    async def test_changes_when_a_rendered_field_changes(self, coordinator, store, field, value):
        chore = store.add_chore("Vacuum", "area_kitchen", "weekly", start_date=TODAY)
        before = (await coordinator._async_update_data())["revision"]
        store.update_chore(chore["id"], **{field: value})
        assert (await coordinator._async_update_data())["revision"] != before, f"{field} must bust the cache"

    async def test_changes_when_step_progress_moves(self, coordinator, store):
        chore = store.add_chore("Vacuum", "area_kitchen", "weekly", start_date=TODAY, steps=["a", "b"])
        before = (await coordinator._async_update_data())["revision"]
        store.toggle_chore_step(chore["id"], 0)
        # Ticking a step on one device has to show up on the others
        assert (await coordinator._async_update_data())["revision"] != before

    async def test_changes_when_a_chore_is_completed(self, coordinator, store):
        chore = store.add_chore("Vacuum", "area_kitchen", "weekly", start_date=TODAY)
        before = (await coordinator._async_update_data())["revision"]
        await coordinator.async_complete_chore(chore["id"], "u1")
        assert (await coordinator._async_update_data())["revision"] != before

    async def test_empty_chore_list_still_has_a_revision(self, coordinator):
        assert (await coordinator._async_update_data())["revision"]


class TestStatisticsInData:
    async def test_statistics_are_attached(self, coordinator, store):
        chore = store.add_chore("Vacuum", "area_kitchen", "weekly", start_date=TODAY)
        store.complete_chore(chore["id"], "u1", "Nate", next_due=date(2024, 6, 22))
        stats = (await coordinator._async_update_data())["statistics"]
        assert stats["done_today"] == 1
        assert stats["streak_days"] == 1
        assert stats["total_completions"] == 1
        assert stats["by_room"][0]["name"] == "Kitchen"

    async def test_statistics_present_with_no_history(self, coordinator):
        stats = (await coordinator._async_update_data())["statistics"]
        assert stats["total_completions"] == 0
        assert stats["done_today"] == 0


class TestRefreshIsNotDebounced:
    """HA's DataUpdateCoordinator debounces async_request_refresh() with a 10s
    cooldown, which left the UI showing stale data for seconds at a time during
    a run of edits. Every user-initiated mutation must refresh immediately."""

    async def test_no_mutation_path_uses_the_debounced_refresh(self):
        import inspect

        from custom_components.simple_chores import coordinator as coordinator_module

        source = inspect.getsource(coordinator_module)
        assert "await self.async_request_refresh()" not in source, (
            "async_request_refresh() is debounced by 10s - use _async_refresh_now()"
        )

    @pytest.mark.parametrize(
        "action",
        [
            "complete",
            "skip",
            "snooze",
            "add_chore",
            "update_chore",
            "remove_chore",
            "toggle_step",
            "undo",
            "add_room",
            "add_user",
        ],
    )
    async def test_every_mutation_refreshes_immediately(self, coordinator, store, action):
        chore = store.add_chore("Vacuum", "area_kitchen", "weekly", start_date=TODAY, steps=["a"])
        await coordinator._async_update_data()
        coordinator.refresh_calls = 0

        if action == "complete":
            await coordinator.async_complete_chore(chore["id"], "u1")
        elif action == "skip":
            await coordinator.async_skip_chore(chore["id"])
        elif action == "snooze":
            await coordinator.async_snooze_chore(chore["id"])
        elif action == "add_chore":
            await coordinator.async_add_chore("New", "area_kitchen", "daily")
        elif action == "update_chore":
            await coordinator.async_update_chore(chore["id"], name="Renamed")
        elif action == "remove_chore":
            await coordinator.async_remove_chore(chore["id"])
        elif action == "toggle_step":
            await coordinator.async_toggle_chore_step(chore["id"], 0)
        elif action == "undo":
            store.complete_chore(chore["id"], "u1", "Nate", next_due=TODAY)
            coordinator.refresh_calls = 0
            await coordinator.async_undo_completion(chore_id=chore["id"])
        elif action == "add_room":
            await coordinator.async_add_room("Garage")
        elif action == "add_user":
            await coordinator.async_add_user("Alice")

        assert coordinator.refresh_calls == 1, f"{action} did not refresh the UI"

    async def test_back_to_back_edits_each_refresh(self, coordinator, store):
        # The reported symptom: several quick edits, only the first showing up
        chore = store.add_chore("Vacuum", "area_kitchen", "weekly", start_date=TODAY)
        coordinator.refresh_calls = 0
        for name in ("One", "Two", "Three", "Four"):
            await coordinator.async_update_chore(chore["id"], name=name)
        assert coordinator.refresh_calls == 4

    async def test_data_is_current_when_the_call_returns(self, coordinator, store):
        # The card re-fetches as soon as the service call resolves, so the
        # coordinator must already hold the new state by then
        chore = store.add_chore("Vacuum", "area_kitchen", "weekly", start_date=TODAY)
        await coordinator.async_update_chore(chore["id"], name="Renamed")
        assert coordinator.data["chores"][0]["name"] == "Renamed"

    async def test_revision_is_current_when_the_call_returns(self, coordinator, store):
        chore = store.add_chore("Vacuum", "area_kitchen", "weekly", start_date=TODAY)
        before = (await coordinator._async_update_data())["revision"]
        await coordinator.async_update_chore(chore["id"], estimated_minutes=5)
        assert coordinator.data["revision"] != before


class TestAreaRegistryListener:
    """Area names are cached (see _get_room_name), and the cache used to be
    rebuilt only by custom-room mutations, so renaming an area in HA left the
    old name on every chore until someone edited a room."""

    def _area_listener(self, hass):
        listeners = [fn for event_type, fn in hass.bus.listeners if event_type == "area_registry_updated"]
        assert len(listeners) == 1, hass.bus.listeners
        return listeners[0]

    async def test_subscribes_to_area_registry_updates(self, coordinator, hass):
        coordinator.async_setup_listeners()
        listener = self._area_listener(hass)
        assert listener == coordinator._async_on_area_registry_updated

    async def test_rename_shows_up_after_the_event(self, coordinator, hass, store):
        coordinator.async_setup_listeners()
        store.add_chore("Dishes", "area_kitchen", "daily", start_date=TODAY)
        await coordinator.async_refresh()
        assert coordinator.data["chores"][0]["room_name"] == "Kitchen"

        hass.area_registry.areas[0].name = "Chef Kitchen"
        # The cache alone would keep serving the old name on a routine poll
        await coordinator.async_refresh()
        assert coordinator.data["chores"][0]["room_name"] == "Kitchen"

        coordinator.refresh_calls = 0
        event = SimpleNamespace(event_type="area_registry_updated", data={"action": "update", "area_id": "kitchen"})
        await self._area_listener(hass)(event)

        assert coordinator.refresh_calls == 1, "the rename must refresh immediately"
        assert coordinator.data["chores"][0]["room_name"] == "Chef Kitchen"
        assert {r["name"] for r in coordinator.data["rooms"]} >= {"Chef Kitchen", "Living Room"}

    async def test_new_area_is_named_after_the_event(self, coordinator, hass, store):
        # A chore moved into an area created after the cache was built used to
        # read "Unknown Room"
        coordinator.async_setup_listeners()
        await coordinator.async_refresh()
        hass.area_registry.areas.append(FakeArea(id="garage", name="Garage", icon=None))
        await self._area_listener(hass)(SimpleNamespace(data={"action": "create", "area_id": "garage"}))

        chore = await coordinator.async_add_chore("Sweep", "area_garage", "weekly")
        assert next(c for c in coordinator.data["chores"] if c["id"] == chore["id"])["room_name"] == "Garage"

    async def test_unsubscribes_on_unload(self, coordinator, hass):
        coordinator.async_setup_listeners()
        assert len(hass.bus.listeners) == 1
        for unsub in coordinator.config_entry.on_unload:
            unsub()
        assert hass.bus.listeners == []


class TestMidnightRollover:
    """Due windows only move at local midnight, but the coordinator polls every
    15 minutes, so the wall display could show yesterday's list for up to a
    quarter of an hour after the date changed."""

    def _midnight_listener(self, hass):
        assert len(hass.time_change_listeners) == 1, hass.time_change_listeners
        return hass.time_change_listeners[0]

    async def test_tracks_local_midnight(self, coordinator, hass):
        coordinator.async_setup_listeners()
        listener = self._midnight_listener(hass)
        assert (listener.hour, listener.minute, listener.second) == (0, 0, 0)
        assert listener.action == coordinator._async_on_midnight

    async def test_keeps_the_periodic_poll_as_a_safety_net(self, coordinator):
        assert coordinator.update_interval is not None

    async def test_midnight_refresh_moves_the_due_windows(self, coordinator, hass, store, monkeypatch):
        coordinator.async_setup_listeners()
        tomorrow = store.add_chore("Tomorrow", "area_kitchen", "daily", start_date=date(2024, 6, 16))
        await coordinator.async_refresh()
        assert coordinator.data["today"] == "2024-06-15"
        assert tomorrow["id"] not in {c["id"] for c in coordinator.data["due_today"]}

        midnight = datetime(2024, 6, 16, 0, 0, 0, tzinfo=UTC)
        monkeypatch.setattr(dt_util, "now", lambda: midnight)
        coordinator.refresh_calls = 0
        await self._midnight_listener(hass).action(midnight)

        assert coordinator.refresh_calls == 1, "midnight must refresh immediately, not wait for the poll"
        assert coordinator.data["today"] == "2024-06-16"
        assert tomorrow["id"] in {c["id"] for c in coordinator.data["due_today"]}

    async def test_removed_on_unload(self, coordinator, hass):
        coordinator.async_setup_listeners()
        assert len(hass.time_change_listeners) == 1
        for unsub in coordinator.config_entry.on_unload:
            unsub()
        assert hass.time_change_listeners == []
