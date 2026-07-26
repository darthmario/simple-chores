"""Tests for the server-side completion statistics.

These summaries replaced equivalent logic in the Lovelace card, so the shapes
here are what the card's stats dashboard and focus view render from.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

import pytest

from custom_components.simple_chores.const import STATS_PERIODS, TOP_CHORES_LIMIT
from custom_components.simple_chores.statistics import build_statistics

TODAY = date(2024, 6, 15)  # Saturday


def entry(chore_id="c1", name="Vacuum", days_ago=0, user="u1", user_name="Alice", hour=12):
    """Build a history entry `days_ago` days before TODAY."""
    when = datetime(TODAY.year, TODAY.month, TODAY.day, hour, 0, 0) - timedelta(days=days_ago)
    return {
        "id": f"h{days_ago}{chore_id}{user}",
        "chore_id": chore_id,
        "chore_name": name,
        "completed_at": when.isoformat() + "+00:00",
        "completed_by": user,
        "completed_by_name": user_name,
    }


CHORES = [
    {"id": "c1", "name": "Vacuum", "room_id": "area_living"},
    {"id": "c2", "name": "Dishes", "room_id": "area_kitchen"},
    {"id": "c3", "name": "Bins", "room_id": "area_kitchen"},
]
ROOMS = [
    {"id": "area_living", "name": "Living Room", "icon": "mdi:sofa"},
    {"id": "area_kitchen", "name": "Kitchen", "icon": "mdi:silverware-fork-knife"},
    {"id": "area_garage", "name": "Garage", "icon": "mdi:garage"},
]


def build(history):
    return build_statistics(history, CHORES, ROOMS, today=TODAY)


class TestShape:
    def test_empty_history_is_still_well_formed(self):
        stats = build([])
        assert stats["done_today"] == 0
        assert stats["streak_days"] == 0
        assert stats["total_completions"] == 0
        assert stats["top_chores"] == {"most_completed": [], "least_completed": []}
        assert stats["by_room"] == []
        assert stats["by_user"] == []
        # The chart still needs its full set of empty bars
        assert [b["count"] for b in stats["by_period"]["7d"]] == [0] * 7

    def test_every_configured_period_is_present(self):
        stats = build([entry()])
        assert set(stats["by_period"]) == set(STATS_PERIODS)
        for key, spec in STATS_PERIODS.items():
            assert len(stats["by_period"][key]) == spec["buckets"], key

    def test_payload_stays_small(self):
        import json

        # 400 completions across 3 chores and 2 users
        history = [entry(chore_id=f"c{i % 3 + 1}", days_ago=i % 300, user=f"u{i % 2}") for i in range(400)]
        published = json.dumps(build(history), separators=(",", ":"))
        # The whole point of this module: bounded regardless of history size
        assert len(published) < 3000, f"statistics payload grew to {len(published)} bytes"


class TestDoneToday:
    def test_counts_only_today(self):
        stats = build([entry(days_ago=0), entry(days_ago=0), entry(days_ago=1)])
        assert stats["done_today"] == 2

    def test_ignores_unparseable_entries(self):
        stats = build([{"completed_at": "nonsense"}, {}, entry(days_ago=0)])
        assert stats["done_today"] == 1


class TestStreak:
    def test_consecutive_days_ending_today(self):
        stats = build([entry(days_ago=n) for n in (0, 1, 2)])
        assert stats["streak_days"] == 3

    def test_survives_a_today_with_nothing_done(self):
        stats = build([entry(days_ago=n) for n in (1, 2)])
        assert stats["streak_days"] == 2

    def test_breaks_on_a_fully_empty_day(self):
        stats = build([entry(days_ago=n) for n in (1, 3, 4)])
        assert stats["streak_days"] == 1

    def test_multiple_completions_same_day_count_once(self):
        stats = build([entry(days_ago=0), entry(days_ago=0), entry(days_ago=1)])
        assert stats["streak_days"] == 2

    def test_no_streak_when_the_last_completion_is_old(self):
        assert build([entry(days_ago=10)])["streak_days"] == 0


class TestPeriodBuckets:
    def test_daily_buckets_are_chronological_and_end_today(self):
        buckets = build([entry(days_ago=0)])["by_period"]["7d"]
        starts = [b["start"] for b in buckets]
        assert starts == sorted(starts)
        assert buckets[-1]["start"] == TODAY.isoformat()

    def test_a_completion_lands_in_the_right_daily_bucket(self):
        buckets = build([entry(days_ago=2)])["by_period"]["7d"]
        by_start = {b["start"]: b["count"] for b in buckets}
        assert by_start[(TODAY - timedelta(days=2)).isoformat()] == 1
        assert sum(b["count"] for b in buckets) == 1

    def test_completions_outside_the_window_are_excluded(self):
        buckets = build([entry(days_ago=30)])["by_period"]["7d"]
        assert sum(b["count"] for b in buckets) == 0

    def test_weekly_buckets_start_on_mondays(self):
        for bucket in build([entry()])["by_period"]["4w"]:
            assert date.fromisoformat(bucket["start"]).weekday() == 0

    def test_weekly_bucketing_groups_a_week_together(self):
        # TODAY is a Saturday, so 0-5 days back are all the same ISO week
        buckets = build([entry(days_ago=n) for n in (0, 1, 2)])["by_period"]["4w"]
        assert buckets[-1]["count"] == 3

    def test_monthly_buckets_start_on_the_first(self):
        for bucket in build([entry()])["by_period"]["1y"]:
            assert date.fromisoformat(bucket["start"]).day == 1

    def test_monthly_buckets_span_a_year_without_repeating(self):
        starts = [b["start"] for b in build([entry()])["by_period"]["1y"]]
        assert len(set(starts)) == 12
        assert starts[-1] == TODAY.replace(day=1).isoformat()

    def test_month_bucketing_crosses_the_year_boundary(self):
        stats = build_statistics([entry(days_ago=0)], CHORES, ROOMS, today=date(2024, 1, 15))
        starts = [b["start"] for b in stats["by_period"]["1y"]]
        assert starts[0] == "2023-02-01"
        assert starts[-1] == "2024-01-01"


class TestTopChores:
    def test_ranks_by_count(self):
        history = [entry(chore_id="c1", name="Vacuum")] * 3 + [entry(chore_id="c2", name="Dishes")]
        top = build(history)["top_chores"]["most_completed"]
        assert top[0] == {"name": "Vacuum", "count": 3}
        assert top[1] == {"name": "Dishes", "count": 1}

    def test_caps_the_list(self):
        history = [entry(chore_id=f"c{i}", name=f"Chore {i}") for i in range(20)]
        assert len(build(history)["top_chores"]["most_completed"]) == TOP_CHORES_LIMIT

    def test_least_completed_only_once_there_are_enough(self):
        few = [entry(chore_id=f"c{i}", name=f"Chore {i}") for i in range(3)]
        assert build(few)["top_chores"]["least_completed"] == []

        many = [entry(chore_id=f"c{i}", name=f"Chore {i}") for i in range(8)]
        assert len(build(many)["top_chores"]["least_completed"]) == TOP_CHORES_LIMIT


class TestByRoom:
    def test_counts_via_the_chore_to_room_mapping(self):
        history = [entry(chore_id="c2"), entry(chore_id="c3"), entry(chore_id="c1")]
        by_room = {r["id"]: r["completions"] for r in build(history)["by_room"]}
        assert by_room == {"area_kitchen": 2, "area_living": 1}

    def test_rooms_with_no_completions_are_omitted(self):
        assert "area_garage" not in {r["id"] for r in build([entry()])["by_room"]}

    def test_sorted_busiest_first(self):
        history = [entry(chore_id="c2"), entry(chore_id="c3"), entry(chore_id="c1")]
        rooms = build(history)["by_room"]
        assert [r["completions"] for r in rooms] == sorted(
            [r["completions"] for r in rooms], reverse=True
        )

    def test_includes_display_fields(self):
        room = build([entry(chore_id="c1")])["by_room"][0]
        assert room["name"] == "Living Room"
        assert room["icon"] == "mdi:sofa"

    def test_completions_of_deleted_chores_are_skipped(self):
        # A chore removed since it was completed no longer maps to a room
        assert build([entry(chore_id="gone")])["by_room"] == []


class TestByUser:
    def test_counts_and_sorts(self):
        history = [entry(user="u1", user_name="Alice")] * 2 + [entry(user="u2", user_name="Bob")]
        users = build(history)["by_user"]
        assert users[0] == {"id": "u1", "name": "Alice", "count": 2}
        assert users[1] == {"id": "u2", "name": "Bob", "count": 1}

    def test_uses_the_most_recent_name_for_a_user(self):
        history = [
            entry(days_ago=5, user="u1", user_name="Old Name"),
            entry(days_ago=0, user="u1", user_name="New Name"),
        ]
        assert build(history)["by_user"][0]["name"] == "New Name"

    def test_entries_without_a_user_are_skipped(self):
        assert build([{"completed_at": entry()["completed_at"], "chore_id": "c1"}])["by_user"] == []


class TestRobustness:
    @pytest.mark.parametrize(
        "bad",
        [None, "string", 42, [], {"completed_at": None}, {"completed_at": ""}, {"completed_at": "tomorrow"}],
    )
    def test_malformed_entries_do_not_raise(self, bad):
        stats = build([bad, entry(days_ago=0)])
        assert stats["done_today"] == 1

    def test_naive_timestamps_are_accepted(self):
        naive = {**entry(days_ago=0), "completed_at": "2024-06-15T12:00:00"}
        assert build([naive])["done_today"] == 1

    def test_total_completions_counts_every_entry(self):
        # Including ones too old or malformed to appear in any bucket
        history = [entry(days_ago=400), {"completed_at": "junk"}, entry(days_ago=0)]
        assert build(history)["total_completions"] == 3
