"""Completion statistics for the Simple Chores integration.

These summaries used to be computed in the Lovelace card, which meant shipping
the raw completion history in a state attribute to every connected client on
every update. That payload grew without bound and pushed
``sensor.total_chores`` past Home Assistant's 16 KB recorder limit.

Computing them here instead keeps the attribute small and constant-sized, and
means a wall display isn't re-deriving the same numbers from hundreds of
entries on every render. Raw history is still available on demand over the
websocket API - see websocket.py.
"""

from __future__ import annotations

import logging
from collections import Counter
from datetime import date, timedelta
from typing import Any

from homeassistant.util import dt as dt_util

from .const import STATS_PERIODS, TOP_CHORES_LIMIT

_LOGGER = logging.getLogger(__name__)


def build_statistics(
    history: list[dict[str, Any]],
    chores: list[dict[str, Any]],
    rooms: list[dict[str, Any]],
    today: date | None = None,
) -> dict[str, Any]:
    """Summarise completion history into a compact, fixed-size payload.

    Args:
        history: Full completion history, oldest first.
        chores: Active chores, used to map completions back to rooms.
        rooms: Known rooms, used for display names and icons.
        today: Local "today"; defaults to now. Injectable for testing.

    Returns:
        A dict small enough to publish as a state attribute.
    """
    if today is None:
        today = dt_util.now().date()

    completed_days = [day for day in (_entry_date(entry) for entry in history) if day is not None]

    return {
        "done_today": sum(1 for day in completed_days if day == today),
        "streak_days": _streak_days(completed_days, today),
        "total_completions": len(history),
        "by_period": {
            key: _completions_by_period(completed_days, today, spec["group_by"], spec["buckets"])
            for key, spec in STATS_PERIODS.items()
        },
        "top_chores": _top_chores(history),
        "by_room": _by_room(history, chores, rooms),
        "by_user": _by_user(history),
    }


def _entry_date(entry: Any) -> date | None:
    """Return the local calendar date of a history entry, or None if unusable."""
    if not isinstance(entry, dict):
        return None
    raw = entry.get("completed_at")
    if not raw:
        return None

    parsed = dt_util.parse_datetime(raw)
    if parsed is None:
        return None
    # Entries are written with a timezone; convert so bucketing matches what
    # the household actually experienced as "that day"
    if parsed.tzinfo is not None:
        parsed = dt_util.as_local(parsed)
    return parsed.date()


def _streak_days(completed_days: list[date], today: date) -> int:
    """Count consecutive days ending today with at least one completion.

    A day with nothing done yet doesn't break the streak - only a full empty
    day does. This matches what the focus view used to compute client-side.
    """
    days = set(completed_days)
    if not days:
        return 0

    cursor = today
    if cursor not in days:
        cursor -= timedelta(days=1)

    streak = 0
    while cursor in days:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def _shift_months(day: date, months: int) -> date:
    """Return the first of the month `months` away from `day`."""
    total = day.year * 12 + (day.month - 1) + months
    return date(total // 12, total % 12 + 1, 1)


def _bucket_key(day: date, group_by: str) -> str:
    """Stable key identifying which bucket a date falls into."""
    if group_by == "day":
        return day.isoformat()
    if group_by == "week":
        iso_year, iso_week, _ = day.isocalendar()
        return f"{iso_year}-W{iso_week:02d}"
    return f"{day.year}-{day.month:02d}"


def _bucket_starts(today: date, group_by: str, buckets: int) -> list[date]:
    """Bucket start dates, oldest first, with the newest covering today."""
    starts: list[date] = []
    for offset in range(buckets - 1, -1, -1):
        if group_by == "day":
            starts.append(today - timedelta(days=offset))
        elif group_by == "week":
            in_week = today - timedelta(weeks=offset)
            starts.append(in_week - timedelta(days=in_week.weekday()))  # Monday
        else:
            starts.append(_shift_months(today, -offset))
    return starts


def _completions_by_period(
    completed_days: list[date],
    today: date,
    group_by: str,
    buckets: int,
) -> list[dict[str, Any]]:
    """Bucket completions into a fixed-length series, oldest first.

    Empty buckets are kept so the card's chart always has the same number of
    bars regardless of activity.
    """
    starts = _bucket_starts(today, group_by, buckets)
    position = {_bucket_key(start, group_by): index for index, start in enumerate(starts)}

    counts = [0] * len(starts)
    for day in completed_days:
        index = position.get(_bucket_key(day, group_by))
        if index is not None:
            counts[index] += 1

    return [{"start": start.isoformat(), "count": count} for start, count in zip(starts, counts, strict=True)]


def _top_chores(history: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Most and least completed chores, by name."""
    counts = Counter(entry["chore_name"] for entry in history if isinstance(entry, dict) and entry.get("chore_name"))
    ranked = [{"name": name, "count": count} for name, count in counts.most_common()]

    return {
        "most_completed": ranked[:TOP_CHORES_LIMIT],
        # Only worth showing a "least completed" list once there are enough to
        # make the comparison meaningful
        "least_completed": list(reversed(ranked[-TOP_CHORES_LIMIT:])) if len(ranked) > TOP_CHORES_LIMIT else [],
    }


def _by_room(
    history: list[dict[str, Any]],
    chores: list[dict[str, Any]],
    rooms: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Completions per room, busiest first, omitting rooms with none."""
    chore_rooms = {chore["id"]: chore.get("room_id") for chore in chores if isinstance(chore, dict) and chore.get("id")}

    counts: Counter[str] = Counter()
    for entry in history:
        if not isinstance(entry, dict):
            continue
        room_id = chore_rooms.get(entry.get("chore_id"))
        if room_id:
            counts[room_id] += 1

    stats = [
        {
            "id": room["id"],
            "name": room.get("name", "Unknown"),
            "icon": room.get("icon", "mdi:home"),
            "completions": counts[room["id"]],
        }
        for room in rooms
        if counts.get(room["id"])
    ]
    stats.sort(key=lambda room: int(room["completions"]), reverse=True)
    return stats


def _by_user(history: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Completions per user, busiest first."""
    counts: Counter[str] = Counter()
    names: dict[str, str] = {}

    for entry in history:
        if not isinstance(entry, dict):
            continue
        user_id = entry.get("completed_by")
        if not user_id:
            continue
        counts[user_id] += 1
        # Last name seen wins, so a renamed user shows their current name
        names[user_id] = entry.get("completed_by_name") or "Unknown"

    stats: list[dict[str, Any]] = [
        {"id": user_id, "name": names[user_id], "count": count} for user_id, count in counts.items()
    ]
    stats.sort(key=lambda user: int(user["count"]), reverse=True)
    return stats
