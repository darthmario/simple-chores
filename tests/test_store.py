"""Tests for SimpleChoresStore.

These run against the real store.py using the lightweight Home Assistant
stubs installed by conftest.py (fixed "now" of 2024-06-15, a Saturday).
"""
from __future__ import annotations

from datetime import date

import pytest

from custom_components.simple_chores.const import (
    MAX_CHORE_NAME_LENGTH,
    MAX_ESTIMATED_MINUTES,
    MAX_HISTORY_ENTRIES,
    MAX_ROOM_NAME_LENGTH,
    MAX_STEP_LENGTH,
    MAX_STEPS_PER_CHORE,
)
from custom_components.simple_chores.store import SimpleChoresStore

TODAY = date(2024, 6, 15)


@pytest.fixture
def store():
    """Return a store backed by the stub HA Store."""
    return SimpleChoresStore(hass=object())


def _add_basic_chore(store, **overrides):
    """Add a simple weekly chore and return it."""
    kwargs = {
        "name": "Vacuum",
        "room_id": "area_living_room",
        "frequency": "weekly",
    }
    kwargs.update(overrides)
    return store.add_chore(**kwargs)


class TestRooms:
    def test_add_room_defaults(self, store):
        room = store.add_room("Garage")
        assert room["id"].startswith("custom_")
        assert room["name"] == "Garage"
        assert room["icon"] == "mdi:home"
        assert room["is_custom"] is True
        assert store.rooms[room["id"]] == room

    def test_add_room_custom_icon(self, store):
        room = store.add_room("Garage", icon="mdi:garage")
        assert room["icon"] == "mdi:garage"

    def test_add_room_empty_name_raises(self, store):
        with pytest.raises(ValueError, match="cannot be empty"):
            store.add_room("")

    def test_add_room_whitespace_name_raises(self, store):
        with pytest.raises(ValueError, match="cannot be empty"):
            store.add_room("   ")

    def test_add_room_name_too_long_raises(self, store):
        with pytest.raises(ValueError, match="too long"):
            store.add_room("x" * (MAX_ROOM_NAME_LENGTH + 1))

    def test_update_room(self, store):
        room = store.add_room("Garage")
        updated = store.update_room(room["id"], name="  Workshop  ", icon="mdi:tools")
        assert updated["name"] == "Workshop"  # stripped
        assert updated["icon"] == "mdi:tools"

    def test_update_room_unknown_returns_none(self, store):
        assert store.update_room("custom_missing", name="X") is None

    def test_update_room_empty_name_raises(self, store):
        room = store.add_room("Garage")
        with pytest.raises(ValueError, match="cannot be empty"):
            store.update_room(room["id"], name="  ")

    def test_update_room_name_too_long_raises(self, store):
        room = store.add_room("Garage")
        with pytest.raises(ValueError, match="too long"):
            store.update_room(room["id"], name="x" * (MAX_ROOM_NAME_LENGTH + 1))

    def test_remove_room_deletes_its_chores(self, store):
        room = store.add_room("Garage")
        kept = _add_basic_chore(store, name="Keep me", room_id="area_kitchen")
        doomed = _add_basic_chore(store, name="Sweep garage", room_id=room["id"])

        assert store.remove_room(room["id"]) is True
        assert room["id"] not in store.rooms
        assert doomed["id"] not in store.chores
        assert kept["id"] in store.chores

    def test_remove_room_unknown_returns_false(self, store):
        assert store.remove_room("custom_missing") is False


class TestUsers:
    def test_add_user_defaults(self, store):
        user = store.add_user("  Nate  ")
        assert user["id"].startswith("custom_user_")
        assert user["name"] == "Nate"  # stripped
        assert user["avatar"] == "mdi:account"
        assert user["is_custom"] is True
        assert store.users[user["id"]] == user

    def test_add_user_empty_name_raises(self, store):
        with pytest.raises(ValueError, match="cannot be empty"):
            store.add_user(" ")

    def test_add_user_name_too_long_raises(self, store):
        with pytest.raises(ValueError, match="too long"):
            store.add_user("x" * (MAX_ROOM_NAME_LENGTH + 1))

    def test_update_user(self, store):
        user = store.add_user("Nate")
        updated = store.update_user(user["id"], name="Nathan", avatar="mdi:account-cowboy-hat")
        assert updated["name"] == "Nathan"
        assert updated["avatar"] == "mdi:account-cowboy-hat"

    def test_update_user_unknown_returns_none(self, store):
        assert store.update_user("custom_user_missing", name="X") is None

    def test_update_user_empty_name_raises(self, store):
        user = store.add_user("Nate")
        with pytest.raises(ValueError, match="cannot be empty"):
            store.update_user(user["id"], name="")

    def test_update_user_name_too_long_raises(self, store):
        user = store.add_user("Nate")
        with pytest.raises(ValueError, match="too long"):
            store.update_user(user["id"], name="x" * (MAX_ROOM_NAME_LENGTH + 1))

    def test_remove_user(self, store):
        user = store.add_user("Nate")
        assert store.remove_user(user["id"]) is True
        assert user["id"] not in store.users

    def test_remove_user_unknown_returns_false(self, store):
        assert store.remove_user("custom_user_missing") is False


class TestAddChore:
    def test_defaults(self, store):
        chore = _add_basic_chore(store)
        assert chore["next_due"] == TODAY.isoformat()  # defaults to today
        assert chore["is_completed"] is False
        assert chore["interval"] == 1
        assert chore["recurrence_type"] == "interval"
        assert chore["assigned_to"] is None
        assert chore["last_completed"] is None
        assert chore["last_completed_by"] is None
        assert store.chores[chore["id"]] == chore

    def test_explicit_start_date(self, store):
        chore = _add_basic_chore(store, start_date=date(2024, 7, 1))
        assert chore["next_due"] == "2024-07-01"

    def test_frequency_case_insensitive(self, store):
        chore = _add_basic_chore(store, frequency="Weekly")
        assert chore["frequency"] == "weekly"

    def test_empty_name_raises(self, store):
        with pytest.raises(ValueError, match="cannot be empty"):
            _add_basic_chore(store, name="  ")

    def test_name_too_long_raises(self, store):
        with pytest.raises(ValueError, match="too long"):
            _add_basic_chore(store, name="x" * (MAX_CHORE_NAME_LENGTH + 1))

    def test_empty_room_id_raises(self, store):
        with pytest.raises(ValueError, match="Room ID cannot be empty"):
            _add_basic_chore(store, room_id="")

    def test_bad_room_prefix_raises(self, store):
        with pytest.raises(ValueError, match="Invalid room ID format"):
            _add_basic_chore(store, room_id="kitchen")

    def test_bad_frequency_raises(self, store):
        with pytest.raises(ValueError, match="Invalid frequency"):
            _add_basic_chore(store, frequency="fortnightly")

    def test_bad_recurrence_type_raises(self, store):
        with pytest.raises(ValueError, match="Invalid recurrence type"):
            _add_basic_chore(store, recurrence_type="random")

    def test_anchored_weekly_without_days_raises(self, store):
        with pytest.raises(ValueError, match="requires anchor_days_of_week"):
            _add_basic_chore(store, recurrence_type="anchored")

    def test_anchored_weekly_invalid_day_raises(self, store):
        with pytest.raises(ValueError, match="Invalid day of week"):
            _add_basic_chore(store, recurrence_type="anchored", anchor_days_of_week=[7])

    def test_anchored_weekly_valid(self, store):
        chore = _add_basic_chore(store, recurrence_type="anchored", anchor_days_of_week=[1, 4])
        assert chore["anchor_days_of_week"] == [1, 4]

    def test_anchored_monthly_without_anchor_type_raises(self, store):
        with pytest.raises(ValueError, match="requires anchor_type"):
            _add_basic_chore(store, frequency="monthly", recurrence_type="anchored")

    def test_anchored_monthly_bad_anchor_type_raises(self, store):
        with pytest.raises(ValueError, match="Invalid anchor type"):
            _add_basic_chore(store, frequency="monthly", recurrence_type="anchored", anchor_type="bogus")

    def test_anchored_monthly_day_out_of_range_raises(self, store):
        with pytest.raises(ValueError, match="between 1 and 31"):
            _add_basic_chore(
                store,
                frequency="monthly",
                recurrence_type="anchored",
                anchor_type="day_of_month",
                anchor_day_of_month=32,
            )

    def test_anchored_week_pattern_bad_week_raises(self, store):
        with pytest.raises(ValueError, match="Invalid anchor_week"):
            _add_basic_chore(
                store,
                frequency="monthly",
                recurrence_type="anchored",
                anchor_type="week_pattern",
                anchor_week=6,
                anchor_weekday=2,
            )

    def test_anchored_week_pattern_bad_weekday_raises(self, store):
        with pytest.raises(ValueError, match="Invalid anchor_weekday"):
            _add_basic_chore(
                store,
                frequency="monthly",
                recurrence_type="anchored",
                anchor_type="week_pattern",
                anchor_week=2,
                anchor_weekday=9,
            )

    def test_negative_interval_raises(self, store):
        with pytest.raises(ValueError, match="at least 1"):
            _add_basic_chore(store, interval=-1)


class TestUpdateChore:
    def test_basic_field_updates(self, store):
        chore = _add_basic_chore(store)
        updated = store.update_chore(
            chore["id"],
            name="Vacuum upstairs",
            room_id="custom_abc",
            frequency="Monthly",
            next_due=date(2024, 8, 1),
            interval=2,
        )
        assert updated["name"] == "Vacuum upstairs"
        assert updated["room_id"] == "custom_abc"
        assert updated["frequency"] == "monthly"
        assert updated["next_due"] == "2024-08-01"
        assert updated["interval"] == 2

    def test_unknown_chore_returns_none(self, store):
        assert store.update_chore("missing", name="X") is None

    def test_bad_frequency_raises(self, store):
        chore = _add_basic_chore(store)
        with pytest.raises(ValueError, match="Invalid frequency"):
            store.update_chore(chore["id"], frequency="sometimes")

    def test_bad_room_prefix_raises(self, store):
        chore = _add_basic_chore(store)
        with pytest.raises(ValueError, match="Invalid room ID format"):
            store.update_chore(chore["id"], room_id="kitchen")

    def test_bad_recurrence_type_raises(self, store):
        chore = _add_basic_chore(store)
        with pytest.raises(ValueError, match="Invalid recurrence type"):
            store.update_chore(chore["id"], recurrence_type="bogus")

    def test_interval_below_one_raises(self, store):
        chore = _add_basic_chore(store)
        with pytest.raises(ValueError, match="at least 1"):
            store.update_chore(chore["id"], interval=0)

    # --- assigned_to regression ---

    def test_assigned_to_omitted_leaves_assignment_unchanged(self, store):
        chore = _add_basic_chore(store, assigned_to="user1")
        updated = store.update_chore(chore["id"], name="New name")
        assert updated["assigned_to"] == "user1"

    def test_assigned_to_empty_string_clears(self, store):
        chore = _add_basic_chore(store, assigned_to="user1")
        updated = store.update_chore(chore["id"], assigned_to="")
        assert updated["assigned_to"] is None

    def test_assigned_to_new_value_sets(self, store):
        chore = _add_basic_chore(store, assigned_to="user1")
        updated = store.update_chore(chore["id"], assigned_to="user2")
        assert updated["assigned_to"] == "user2"

    def test_assigned_to_missing_key_backfilled_to_none(self, store):
        chore = _add_basic_chore(store)
        del store.chores[chore["id"]]["assigned_to"]
        updated = store.update_chore(chore["id"], name="New name")
        assert updated["assigned_to"] is None

    # --- anchor validation on update ---

    def test_switch_to_anchored_without_anchors_raises(self, store):
        chore = _add_basic_chore(store)
        with pytest.raises(ValueError, match="requires anchor_days_of_week"):
            store.update_chore(chore["id"], recurrence_type="anchored")
        # validation happens before mutation
        assert store.chores[chore["id"]]["recurrence_type"] == "interval"

    def test_switch_to_anchored_with_anchors_succeeds(self, store):
        chore = _add_basic_chore(store)
        updated = store.update_chore(chore["id"], recurrence_type="anchored", anchor_days_of_week=[2])
        assert updated["recurrence_type"] == "anchored"
        assert updated["anchor_days_of_week"] == [2]

    def test_update_other_fields_of_valid_anchored_chore_does_not_raise(self, store):
        chore = _add_basic_chore(store, recurrence_type="anchored", anchor_days_of_week=[1, 4])
        updated = store.update_chore(chore["id"], name="Trash day")
        assert updated["name"] == "Trash day"
        assert updated["anchor_days_of_week"] == [1, 4]  # stored anchors preserved

    def test_update_anchored_monthly_invalid_day_raises(self, store):
        chore = _add_basic_chore(
            store,
            frequency="monthly",
            recurrence_type="anchored",
            anchor_type="day_of_month",
            anchor_day_of_month=15,
        )
        with pytest.raises(ValueError, match="between 1 and 31"):
            store.update_chore(chore["id"], anchor_day_of_month=32)
        assert store.chores[chore["id"]]["anchor_day_of_month"] == 15

    def test_switch_frequency_of_anchored_chore_validates_new_frequency_anchors(self, store):
        # Weekly anchored chore has days-of-week but no anchor_type; switching
        # to monthly while anchored must provide monthly anchor fields.
        chore = _add_basic_chore(store, recurrence_type="anchored", anchor_days_of_week=[1])
        with pytest.raises(ValueError, match="requires anchor_type"):
            store.update_chore(chore["id"], frequency="monthly")


class TestCompleteChore:
    def test_recurring_completion(self, store):
        chore = _add_basic_chore(store)
        result = store.complete_chore(chore["id"], "user1", "Nate", next_due=date(2024, 6, 22))
        assert result["next_due"] == "2024-06-22"
        assert result["is_completed"] is False
        assert result["last_completed"] == TODAY.isoformat()
        assert result["last_completed_by"] == "user1"

        assert len(store.history) == 1
        entry = store.history[0]
        assert entry["chore_id"] == chore["id"]
        assert entry["chore_name"] == chore["name"]
        assert entry["completed_by"] == "user1"
        assert entry["completed_by_name"] == "Nate"

    def test_one_off_completion(self, store):
        chore = _add_basic_chore(store, frequency="once")
        result = store.complete_chore(chore["id"], "user1", "Nate", next_due=None)
        assert result["is_completed"] is True
        assert len(store.history) == 1

    def test_unknown_chore_returns_none(self, store):
        assert store.complete_chore("missing", "user1", "Nate", next_due=TODAY) is None
        assert store.history == []


class TestSkipAndSnooze:
    def test_skip_sets_next_due(self, store):
        chore = _add_basic_chore(store)
        result = store.skip_chore(chore["id"], date(2024, 6, 22))
        assert result["next_due"] == "2024-06-22"

    def test_skip_unknown_returns_none(self, store):
        assert store.skip_chore("missing", TODAY) is None

    def test_snooze_postpones_one_day(self, store):
        chore = _add_basic_chore(store, start_date=date(2024, 6, 15))
        result = store.snooze_chore(chore["id"])
        assert result["next_due"] == "2024-06-16"

    def test_snooze_unknown_returns_none(self, store):
        assert store.snooze_chore("missing") is None


class TestHistory:
    def test_get_chore_history_filters_by_chore(self, store):
        chore_a = _add_basic_chore(store, name="A")
        chore_b = _add_basic_chore(store, name="B")
        store.complete_chore(chore_a["id"], "u1", "Alice", next_due=date(2024, 6, 22))
        store.complete_chore(chore_b["id"], "u2", "Bob", next_due=date(2024, 6, 22))
        store.complete_chore(chore_a["id"], "u2", "Bob", next_due=date(2024, 6, 29))

        history_a = store.get_chore_history(chore_a["id"])
        assert len(history_a) == 2
        assert all(h["chore_id"] == chore_a["id"] for h in history_a)
        assert len(store.get_chore_history(chore_b["id"])) == 1
        assert store.get_chore_history("missing") == []

    def test_get_user_stats_aggregation(self, store):
        chore = _add_basic_chore(store)
        store.complete_chore(chore["id"], "u1", "Alice", next_due=date(2024, 6, 22))
        store.complete_chore(chore["id"], "u1", "Alice", next_due=date(2024, 6, 29))
        store.complete_chore(chore["id"], "u2", "Bob", next_due=date(2024, 7, 6))

        stats = store.get_user_stats()
        assert stats["u1"]["total_completed"] == 2
        assert stats["u1"]["user_name"] == "Alice"
        assert stats["u2"]["total_completed"] == 1
        assert stats["u1"]["last_completed"] is not None

    def test_get_user_stats_empty(self, store):
        assert store.get_user_stats() == {}

    def test_cleanup_history_trims_to_max_keeping_most_recent(self, store):
        # Pre-fill history beyond the limit (entries are chronological)
        store._data["history"] = [
            {"id": str(i), "chore_id": "c", "chore_name": "C", "completed_at": f"t{i:05d}",
             "completed_by": "u1", "completed_by_name": "Alice"}
            for i in range(MAX_HISTORY_ENTRIES + 25)
        ]
        store._cleanup_history()
        assert len(store.history) == MAX_HISTORY_ENTRIES
        # Most recent entries kept (the first 25 trimmed)
        assert store.history[0]["id"] == "25"
        assert store.history[-1]["id"] == str(MAX_HISTORY_ENTRIES + 24)

    def test_cleanup_history_noop_below_limit(self, store):
        chore = _add_basic_chore(store)
        store.complete_chore(chore["id"], "u1", "Alice", next_due=date(2024, 6, 22))
        store._cleanup_history()
        assert len(store.history) == 1


class TestLoadSaveAndMigration:
    async def test_async_load_empty_storage_keeps_defaults(self, store):
        data = await store.async_load()
        assert data == {"rooms": {}, "chores": {}, "history": [], "users": {}}

    async def test_async_load_migrates_legacy_chores(self, store):
        store._store.load_result = {
            "rooms": {},
            "chores": {
                "legacy1": {
                    "id": "legacy1",
                    "name": "Old chore",
                    "room_id": "area_kitchen",
                    "frequency": "weekly",
                    "next_due": "2024-06-15",
                }
            },
            "history": [],
        }
        data = await store.async_load()
        chore = data["chores"]["legacy1"]
        assert data["users"] == {}  # backfilled
        assert chore["recurrence_type"] == "interval"
        assert chore["interval"] == 1
        assert chore["is_completed"] is False
        assert chore["anchor_days_of_week"] is None
        assert chore["anchor_type"] is None
        assert chore["estimated_minutes"] is None
        assert chore["steps"] == []
        assert chore["step_progress"] == []

    async def test_async_save_writes_data(self, store):
        store.add_room("Garage")
        await store.async_save()
        assert store._store.saved_data == store._data

    async def test_debounced_save_writes_after_delay(self, store):
        store.add_room("Garage")
        await store.async_save_debounced(delay=0)
        await store._save_task
        assert store._store.saved_data == store._data
        assert store._dirty is False

    async def test_flush_debounced_save_cancels_pending_and_saves(self, store):
        store.add_room("Garage")
        await store.async_save_debounced(delay=60)
        assert store._dirty is True
        await store.async_flush_debounced_save()
        assert store._store.saved_data == store._data
        assert store._dirty is False

    def test_remove_chore(self, store):
        chore = _add_basic_chore(store)
        assert store.remove_chore(chore["id"]) is True
        assert store.remove_chore(chore["id"]) is False


class TestGetRecentHistory:
    """The total sensor publishes this, so it has to stay bounded."""

    @staticmethod
    def _entry(index, completed_at):
        return {
            "id": f"h{index}",
            "chore_id": "c1",
            "chore_name": "Vacuum",
            "completed_at": completed_at,
            "completed_by": "u1",
            "completed_by_name": "Alice",
        }

    def test_keeps_the_id_and_drops_the_undo_snapshot(self, store):
        raw = self._entry(0, "2024-06-15T10:00:00+00:00")
        raw["previous"] = {"next_due": "2024-06-15"}
        store._data["history"] = [raw]
        entry = store.get_recent_history()[0]
        # The history modal undoes a completion by its id
        assert entry["id"] == raw["id"]
        # The snapshot is server-side only
        assert "previous" not in entry
        # Everything the card actually reads survives
        assert entry["chore_id"] == "c1"
        assert entry["chore_name"] == "Vacuum"
        assert entry["completed_at"] == "2024-06-15T10:00:00+00:00"
        assert entry["completed_by"] == "u1"
        assert entry["completed_by_name"] == "Alice"

    def test_caps_entry_count_keeping_the_newest(self, store):
        store._data["history"] = [self._entry(i, "2024-06-15T10:00:00+00:00") for i in range(500)]
        recent = store.get_recent_history(max_entries=10)
        assert len(recent) == 10
        assert [e["chore_id"] for e in recent] == ["c1"] * 10
        # History is chronological, so the tail is the newest
        assert recent[-1]["completed_by_name"] == "Alice"

    def test_drops_entries_older_than_the_window(self, store):
        store._data["history"] = [
            self._entry(0, "2020-01-01T10:00:00+00:00"),  # ancient
            self._entry(1, "2024-06-14T10:00:00+00:00"),  # yesterday
        ]
        recent = store.get_recent_history()
        assert len(recent) == 1
        assert recent[0]["completed_at"] == "2024-06-14T10:00:00+00:00"

    def test_keeps_entries_with_unparseable_dates(self, store):
        store._data["history"] = [self._entry(0, "not-a-timestamp"), self._entry(1, None)]
        assert len(store.get_recent_history()) == 2

    def test_naive_timestamps_are_kept_not_compared(self, store):
        # Comparing naive to aware would raise; these must pass through instead
        store._data["history"] = [self._entry(0, "2020-01-01T10:00:00")]
        assert len(store.get_recent_history()) == 1

    def test_empty_history(self, store):
        assert store.get_recent_history() == []

    def test_does_not_mutate_stored_history(self, store):
        store._data["history"] = [self._entry(0, "2024-06-15T10:00:00+00:00")]
        store.get_recent_history()
        assert store._data["history"][0]["id"] == "h0"
        assert len(store.history) == 1

    def test_default_window_covers_a_full_year_of_stats(self, store):
        from custom_components.simple_chores.const import EXPOSED_HISTORY_DAYS

        # The card's longest stats period is 1 year; the window must not cut into it
        assert EXPOSED_HISTORY_DAYS >= 365


class TestEstimatedMinutes:
    def test_defaults_to_none(self, store):
        assert _add_basic_chore(store)["estimated_minutes"] is None

    def test_accepts_value(self, store):
        assert _add_basic_chore(store, estimated_minutes=5)["estimated_minutes"] == 5

    def test_coerces_numeric_string(self, store):
        assert _add_basic_chore(store, estimated_minutes="15")["estimated_minutes"] == 15

    def test_zero_means_no_estimate(self, store):
        assert _add_basic_chore(store, estimated_minutes=0)["estimated_minutes"] is None

    def test_negative_raises(self, store):
        with pytest.raises(ValueError, match="between 1 and"):
            _add_basic_chore(store, estimated_minutes=-5)

    def test_above_max_raises(self, store):
        with pytest.raises(ValueError, match="between 1 and"):
            _add_basic_chore(store, estimated_minutes=MAX_ESTIMATED_MINUTES + 1)

    def test_non_numeric_raises(self, store):
        with pytest.raises(ValueError, match="whole number of minutes"):
            _add_basic_chore(store, estimated_minutes="soon")

    def test_update_sets_value(self, store):
        chore = _add_basic_chore(store)
        store.update_chore(chore["id"], estimated_minutes=10)
        assert chore["estimated_minutes"] == 10

    def test_update_omitted_leaves_unchanged(self, store):
        chore = _add_basic_chore(store, estimated_minutes=10)
        store.update_chore(chore["id"], name="Renamed")
        assert chore["estimated_minutes"] == 10

    def test_update_zero_clears(self, store):
        chore = _add_basic_chore(store, estimated_minutes=10)
        store.update_chore(chore["id"], estimated_minutes=0)
        assert chore["estimated_minutes"] is None

    def test_update_invalid_leaves_chore_untouched(self, store):
        chore = _add_basic_chore(store, estimated_minutes=10)
        with pytest.raises(ValueError):
            store.update_chore(chore["id"], name="Renamed", estimated_minutes=99999)
        assert chore["estimated_minutes"] == 10
        assert chore["name"] == "Vacuum"


class TestSteps:
    def test_defaults_to_empty(self, store):
        chore = _add_basic_chore(store)
        assert chore["steps"] == []
        assert chore["step_progress"] == []

    def test_accepts_steps(self, store):
        chore = _add_basic_chore(store, steps=["Clear counter", "Rinse", "Start it"])
        assert chore["steps"] == ["Clear counter", "Rinse", "Start it"]

    def test_strips_and_drops_blanks(self, store):
        chore = _add_basic_chore(store, steps=["  Rinse  ", "", "   ", "Start"])
        assert chore["steps"] == ["Rinse", "Start"]

    def test_bare_string_raises(self, store):
        with pytest.raises(ValueError, match="list of short text steps"):
            _add_basic_chore(store, steps="Rinse")

    def test_too_many_raises(self, store):
        with pytest.raises(ValueError, match="Too many steps"):
            _add_basic_chore(store, steps=[f"Step {i}" for i in range(MAX_STEPS_PER_CHORE + 1)])

    def test_step_too_long_raises(self, store):
        with pytest.raises(ValueError, match="Step text too long"):
            _add_basic_chore(store, steps=["x" * (MAX_STEP_LENGTH + 1)])

    def test_update_replaces_steps(self, store):
        chore = _add_basic_chore(store, steps=["a", "b"])
        store.update_chore(chore["id"], steps=["c"])
        assert chore["steps"] == ["c"]

    def test_update_empty_list_clears(self, store):
        chore = _add_basic_chore(store, steps=["a", "b"])
        store.update_chore(chore["id"], steps=[])
        assert chore["steps"] == []

    def test_update_omitted_leaves_unchanged(self, store):
        chore = _add_basic_chore(store, steps=["a", "b"])
        store.update_chore(chore["id"], name="Renamed")
        assert chore["steps"] == ["a", "b"]

    def test_shrinking_steps_drops_out_of_range_progress(self, store):
        chore = _add_basic_chore(store, steps=["a", "b", "c"])
        store.toggle_chore_step(chore["id"], 0)
        store.toggle_chore_step(chore["id"], 2)
        store.update_chore(chore["id"], steps=["a"])
        assert chore["step_progress"] == [0]

    def test_growing_steps_keeps_progress(self, store):
        chore = _add_basic_chore(store, steps=["a", "b"])
        store.toggle_chore_step(chore["id"], 1)
        store.update_chore(chore["id"], steps=["a", "b", "c"])
        assert chore["step_progress"] == [1]


class TestToggleChoreStep:
    def test_toggle_marks_done_then_undone(self, store):
        chore = _add_basic_chore(store, steps=["a", "b"])
        store.toggle_chore_step(chore["id"], 0)
        assert chore["step_progress"] == [0]
        store.toggle_chore_step(chore["id"], 0)
        assert chore["step_progress"] == []

    def test_explicit_completed_is_idempotent(self, store):
        chore = _add_basic_chore(store, steps=["a", "b"])
        store.toggle_chore_step(chore["id"], 1, completed=True)
        store.toggle_chore_step(chore["id"], 1, completed=True)
        assert chore["step_progress"] == [1]

    def test_progress_stays_sorted(self, store):
        chore = _add_basic_chore(store, steps=["a", "b", "c"])
        for index in (2, 0, 1):
            store.toggle_chore_step(chore["id"], index)
        assert chore["step_progress"] == [0, 1, 2]

    def test_unknown_chore_returns_none(self, store):
        assert store.toggle_chore_step("nope", 0) is None

    def test_index_out_of_range_raises(self, store):
        chore = _add_basic_chore(store, steps=["a"])
        with pytest.raises(ValueError, match="out of range"):
            store.toggle_chore_step(chore["id"], 5)

    def test_chore_without_steps_raises(self, store):
        chore = _add_basic_chore(store)
        with pytest.raises(ValueError, match="out of range"):
            store.toggle_chore_step(chore["id"], 0)

    def test_completing_chore_resets_progress(self, store):
        chore = _add_basic_chore(store, steps=["a", "b"])
        store.toggle_chore_step(chore["id"], 0)
        store.complete_chore(chore["id"], "u1", "User One", date(2024, 6, 22))
        assert chore["step_progress"] == []

    def test_skipping_chore_resets_progress(self, store):
        chore = _add_basic_chore(store, steps=["a", "b"])
        store.toggle_chore_step(chore["id"], 0)
        store.skip_chore(chore["id"], date(2024, 6, 22))
        assert chore["step_progress"] == []

    def test_snoozing_chore_keeps_progress(self, store):
        chore = _add_basic_chore(store, steps=["a", "b"])
        store.toggle_chore_step(chore["id"], 0)
        store.snooze_chore(chore["id"])
        assert chore["step_progress"] == [0]


class TestUndoCompletion:
    """An accidental tap on "done" must be reversible, exactly."""

    def test_completion_records_what_it_overwrote(self, store):
        chore = _add_basic_chore(store, steps=["a", "b"])
        store.toggle_chore_step(chore["id"], 0)
        before_due = chore["next_due"]

        store.complete_chore(chore["id"], "u1", "Nate", next_due=date(2024, 6, 22))

        previous = store.history[-1]["previous"]
        assert previous["next_due"] == before_due
        assert previous["step_progress"] == [0]
        assert previous["is_completed"] is False
        assert previous["last_completed"] is None

    def test_undo_restores_the_chore_and_drops_the_entry(self, store):
        chore = _add_basic_chore(store, steps=["a", "b"])
        store.toggle_chore_step(chore["id"], 1)
        before_due = chore["next_due"]
        store.complete_chore(chore["id"], "u1", "Nate", next_due=date(2024, 6, 22))
        entry_id = store.history[-1]["id"]

        result = store.undo_completion(history_id=entry_id)

        assert result is chore
        assert chore["next_due"] == before_due
        assert chore["step_progress"] == [1]
        assert chore["last_completed"] is None
        assert chore["last_completed_by"] is None
        assert chore["is_completed"] is False
        assert store.history == []

    def test_undo_by_chore_id_takes_the_newest_completion(self, store):
        chore = _add_basic_chore(store)
        store.complete_chore(chore["id"], "u1", "Nate", next_due=date(2024, 6, 22))
        store.complete_chore(chore["id"], "u2", "Nova", next_due=date(2024, 6, 29))

        store.undo_completion(chore_id=chore["id"])

        assert len(store.history) == 1
        assert store.history[0]["completed_by"] == "u1"
        assert chore["next_due"] == "2024-06-22"
        assert chore["last_completed_by"] == "u1"

    def test_undo_brings_back_a_finished_one_off(self, store):
        chore = _add_basic_chore(store, frequency="once")
        store.complete_chore(chore["id"], "u1", "Nate", next_due=None)
        assert chore["is_completed"] is True

        store.undo_completion(chore_id=chore["id"])

        assert chore["is_completed"] is False

    def test_undo_without_a_match_returns_none(self, store):
        chore = _add_basic_chore(store)
        assert store.undo_completion(chore_id=chore["id"]) is None
        assert store.undo_completion(history_id="nope") is None

    def test_undo_needs_a_handle(self, store):
        with pytest.raises(ValueError):
            store.undo_completion()

    def test_undo_of_a_deleted_chore_still_cleans_history(self, store):
        chore = _add_basic_chore(store)
        store.complete_chore(chore["id"], "u1", "Nate", next_due=date(2024, 6, 22))
        store.remove_chore(chore["id"])

        result = store.undo_completion(chore_id=chore["id"])

        assert result["chore_id"] == chore["id"]
        assert store.history == []

    def test_old_entries_without_a_snapshot_are_removed_but_leave_the_chore(self, store):
        chore = _add_basic_chore(store)
        store.complete_chore(chore["id"], "u1", "Nate", next_due=date(2024, 6, 22))
        del store.history[-1]["previous"]

        result = store.undo_completion(chore_id=chore["id"])

        assert result is chore
        assert chore["next_due"] == "2024-06-22", "nothing to restore from, so the chore stays"
        assert store.history == []

    def test_snapshot_stays_out_of_the_published_history(self, store):
        chore = _add_basic_chore(store)
        store.complete_chore(chore["id"], "u1", "Nate", next_due=date(2024, 6, 22))

        entry = store.get_recent_history()[0]

        assert "previous" not in entry
        assert entry["id"] == store.history[0]["id"], "the id is what the history modal undoes by"
