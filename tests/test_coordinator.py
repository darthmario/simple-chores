"""Tests for coordinator date calculation logic.

These tests focus on the pure date calculation functions that don't require
Home Assistant dependencies.
"""
from __future__ import annotations

import calendar
from datetime import date, timedelta
from typing import Any

import pytest
from dateutil.relativedelta import relativedelta

# Constants (copied from const.py to avoid HA import chain)
FREQUENCY_ONCE = "once"
FREQUENCY_DAILY = "daily"
FREQUENCY_WEEKLY = "weekly"
FREQUENCY_BIWEEKLY = "biweekly"
FREQUENCY_MONTHLY = "monthly"
FREQUENCY_BIMONTHLY = "bimonthly"
FREQUENCY_QUARTERLY = "quarterly"
FREQUENCY_BIANNUAL = "biannual"
FREQUENCY_YEARLY = "yearly"

RECURRENCE_INTERVAL = "interval"
RECURRENCE_ANCHORED = "anchored"

ANCHOR_DAY_OF_MONTH = "day_of_month"
ANCHOR_WEEK_PATTERN = "week_pattern"

WEEK_FIRST = 1
WEEK_SECOND = 2
WEEK_THIRD = 3
WEEK_FOURTH = 4
WEEK_LAST = 5

WEEKDAY_SUNDAY = 0
WEEKDAY_MONDAY = 1
WEEKDAY_TUESDAY = 2
WEEKDAY_WEDNESDAY = 3
WEEKDAY_THURSDAY = 4
WEEKDAY_FRIDAY = 5
WEEKDAY_SATURDAY = 6


# Copy the pure functions from coordinator.py to test them without HA imports
def calculate_next_due(from_date: date, frequency: str) -> date | None:
    """Calculate the next due date based on frequency."""
    if frequency == FREQUENCY_ONCE:
        return None
    if frequency == FREQUENCY_DAILY:
        return from_date + timedelta(days=1)
    if frequency == FREQUENCY_WEEKLY:
        return from_date + timedelta(weeks=1)
    if frequency == FREQUENCY_BIWEEKLY:
        return from_date + timedelta(weeks=2)
    if frequency == FREQUENCY_MONTHLY:
        return from_date + relativedelta(months=1)
    if frequency == FREQUENCY_BIMONTHLY:
        return from_date + relativedelta(months=2)
    if frequency == FREQUENCY_QUARTERLY:
        return from_date + relativedelta(months=3)
    if frequency == FREQUENCY_BIANNUAL:
        return from_date + relativedelta(months=6)
    if frequency == FREQUENCY_YEARLY:
        return from_date + relativedelta(years=1)
    return from_date


def get_week_bounds(for_date: date) -> tuple[date, date]:
    """Get the start (Sunday) and end (Saturday) of the week."""
    days_since_sunday = (for_date.weekday() + 1) % 7
    week_start = for_date - timedelta(days=days_since_sunday)
    week_end = week_start + timedelta(days=6)
    return week_start, week_end


def get_nth_weekday_of_month(year: int, month: int, weekday: int, n: int) -> date | None:
    """Get the nth occurrence of a weekday in a month."""
    python_weekday = (weekday - 1) % 7
    first_day = date(year, month, 1)
    days_in_month = calendar.monthrange(year, month)[1]

    if n == WEEK_LAST:
        last_day = date(year, month, days_in_month)
        days_back = (last_day.weekday() - python_weekday) % 7
        return last_day - timedelta(days=days_back)

    days_ahead = (python_weekday - first_day.weekday()) % 7
    first_occurrence = first_day + timedelta(days=days_ahead)
    result = first_occurrence + timedelta(weeks=n - 1)

    if result.month != month:
        return None
    return result


def calculate_next_anchored_weekly(
    from_date: date,
    anchor_days: list[int],
    interval: int = 1,
) -> date:
    """Calculate next due date for anchored weekly recurrence."""
    if not anchor_days:
        return from_date + timedelta(weeks=interval)

    sorted_days = sorted(anchor_days)
    current_dow = (from_date.weekday() + 1) % 7

    for day in sorted_days:
        if day > current_dow:
            days_ahead = day - current_dow
            return from_date + timedelta(days=days_ahead)

    first_anchor = sorted_days[0]
    days_until_sunday = (7 - current_dow) % 7 or 7
    days_from_sunday_to_anchor = first_anchor
    extra_weeks = (interval - 1) * 7

    return from_date + timedelta(days=days_until_sunday + days_from_sunday_to_anchor + extra_weeks)


def calculate_next_anchored_monthly(
    from_date: date,
    anchor_type: str,
    anchor_day_of_month: int | None = None,
    anchor_week: int | None = None,
    anchor_weekday: int | None = None,
    months_interval: int = 1,
) -> date:
    """Calculate next due date for anchored monthly recurrence."""
    if anchor_type == ANCHOR_DAY_OF_MONTH:
        target_day = anchor_day_of_month or 1
        year, month = from_date.year, from_date.month
        days_in_month = calendar.monthrange(year, month)[1]
        actual_day = min(target_day, days_in_month)
        target_date = date(year, month, actual_day)

        if target_date > from_date:
            return target_date

        next_month_date = from_date + relativedelta(months=months_interval)
        year, month = next_month_date.year, next_month_date.month
        days_in_month = calendar.monthrange(year, month)[1]
        actual_day = min(target_day, days_in_month)
        return date(year, month, actual_day)

    elif anchor_type == ANCHOR_WEEK_PATTERN:
        if anchor_week is None or anchor_weekday is None:
            return from_date + relativedelta(months=months_interval)

        year, month = from_date.year, from_date.month
        target_date = get_nth_weekday_of_month(year, month, anchor_weekday, anchor_week)

        if target_date and target_date > from_date:
            return target_date

        next_month_date = from_date + relativedelta(months=months_interval)
        year, month = next_month_date.year, next_month_date.month
        target_date = get_nth_weekday_of_month(year, month, anchor_weekday, anchor_week)

        attempts = 0
        while target_date is None and attempts < 12:
            next_month_date = next_month_date + relativedelta(months=1)
            year, month = next_month_date.year, next_month_date.month
            target_date = get_nth_weekday_of_month(year, month, anchor_weekday, anchor_week)
            attempts += 1

        return target_date or from_date + relativedelta(months=months_interval)

    return from_date + relativedelta(months=months_interval)


def calculate_next_due_for_chore(chore: dict[str, Any], from_date: date) -> date | None:
    """Calculate the next due date for a chore based on its recurrence settings."""
    frequency = chore.get("frequency", FREQUENCY_WEEKLY)
    recurrence_type = chore.get("recurrence_type", RECURRENCE_INTERVAL)
    interval = chore.get("interval", 1)

    if frequency == FREQUENCY_ONCE:
        return None

    if recurrence_type != RECURRENCE_ANCHORED:
        return calculate_next_due(from_date, frequency)

    if frequency in (FREQUENCY_WEEKLY, FREQUENCY_BIWEEKLY):
        anchor_days = chore.get("anchor_days_of_week", [])
        week_interval = 2 if frequency == FREQUENCY_BIWEEKLY else interval
        return calculate_next_anchored_weekly(from_date, anchor_days, week_interval)

    elif frequency in (FREQUENCY_MONTHLY, FREQUENCY_BIMONTHLY, FREQUENCY_QUARTERLY, FREQUENCY_BIANNUAL):
        anchor_type = chore.get("anchor_type", ANCHOR_DAY_OF_MONTH)
        months_map = {
            FREQUENCY_MONTHLY: 1,
            FREQUENCY_BIMONTHLY: 2,
            FREQUENCY_QUARTERLY: 3,
            FREQUENCY_BIANNUAL: 6,
        }
        months_interval = months_map.get(frequency, 1) * interval
        return calculate_next_anchored_monthly(
            from_date,
            anchor_type,
            chore.get("anchor_day_of_month"),
            chore.get("anchor_week"),
            chore.get("anchor_weekday"),
            months_interval,
        )

    elif frequency == FREQUENCY_YEARLY:
        anchor_type = chore.get("anchor_type", ANCHOR_DAY_OF_MONTH)
        return calculate_next_anchored_monthly(
            from_date,
            anchor_type,
            chore.get("anchor_day_of_month"),
            chore.get("anchor_week"),
            chore.get("anchor_weekday"),
            12 * interval,
        )

    return calculate_next_due(from_date, frequency)


class TestCalculateNextDue:
    """Tests for the basic calculate_next_due function."""

    def test_once_returns_none(self):
        """One-off chores should not reschedule."""
        result = calculate_next_due(date(2024, 6, 15), FREQUENCY_ONCE)
        assert result is None

    def test_daily(self):
        """Daily chores should be due the next day."""
        result = calculate_next_due(date(2024, 6, 15), FREQUENCY_DAILY)
        assert result == date(2024, 6, 16)

    def test_weekly(self):
        """Weekly chores should be due in 7 days."""
        result = calculate_next_due(date(2024, 6, 15), FREQUENCY_WEEKLY)
        assert result == date(2024, 6, 22)

    def test_biweekly(self):
        """Biweekly chores should be due in 14 days."""
        result = calculate_next_due(date(2024, 6, 15), FREQUENCY_BIWEEKLY)
        assert result == date(2024, 6, 29)

    def test_monthly(self):
        """Monthly chores should be due in 1 month."""
        result = calculate_next_due(date(2024, 6, 15), FREQUENCY_MONTHLY)
        assert result == date(2024, 7, 15)

    def test_monthly_end_of_month(self):
        """Monthly from Jan 31 should go to Feb 29 (leap year) or Feb 28."""
        # 2024 is a leap year
        result = calculate_next_due(date(2024, 1, 31), FREQUENCY_MONTHLY)
        assert result == date(2024, 2, 29)

    def test_bimonthly(self):
        """Bimonthly chores should be due in 2 months."""
        result = calculate_next_due(date(2024, 6, 15), FREQUENCY_BIMONTHLY)
        assert result == date(2024, 8, 15)

    def test_quarterly(self):
        """Quarterly chores should be due in 3 months."""
        result = calculate_next_due(date(2024, 6, 15), FREQUENCY_QUARTERLY)
        assert result == date(2024, 9, 15)

    def test_biannual(self):
        """Biannual chores should be due in 6 months."""
        result = calculate_next_due(date(2024, 6, 15), FREQUENCY_BIANNUAL)
        assert result == date(2024, 12, 15)

    def test_yearly(self):
        """Yearly chores should be due in 1 year."""
        result = calculate_next_due(date(2024, 6, 15), FREQUENCY_YEARLY)
        assert result == date(2025, 6, 15)

    def test_yearly_leap_day(self):
        """Yearly from Feb 29 should go to Feb 28 in non-leap year."""
        result = calculate_next_due(date(2024, 2, 29), FREQUENCY_YEARLY)
        assert result == date(2025, 2, 28)

    def test_unknown_frequency_returns_same_date(self):
        """Unknown frequency should return the same date."""
        result = calculate_next_due(date(2024, 6, 15), "unknown")
        assert result == date(2024, 6, 15)


class TestGetWeekBounds:
    """Tests for week boundary calculation."""

    def test_sunday_is_start_of_week(self):
        """Sunday should be the start of the week."""
        # June 16, 2024 is a Sunday
        start, end = get_week_bounds(date(2024, 6, 16))
        assert start == date(2024, 6, 16)
        assert end == date(2024, 6, 22)

    def test_saturday_is_end_of_week(self):
        """Saturday should be the end of the week."""
        # June 15, 2024 is a Saturday
        start, end = get_week_bounds(date(2024, 6, 15))
        assert start == date(2024, 6, 9)
        assert end == date(2024, 6, 15)

    def test_midweek_date(self):
        """A Wednesday should return correct week bounds."""
        # June 12, 2024 is a Wednesday
        start, end = get_week_bounds(date(2024, 6, 12))
        assert start == date(2024, 6, 9)  # Sunday
        assert end == date(2024, 6, 15)   # Saturday

    def test_monday(self):
        """Monday should be day 2 of the week (after Sunday)."""
        # June 10, 2024 is a Monday
        start, end = get_week_bounds(date(2024, 6, 10))
        assert start == date(2024, 6, 9)  # Previous Sunday
        assert end == date(2024, 6, 15)   # Next Saturday


class TestGetNthWeekdayOfMonth:
    """Tests for finding the nth weekday of a month."""

    def test_first_monday_of_june_2024(self):
        """First Monday of June 2024 is June 3."""
        result = get_nth_weekday_of_month(2024, 6, WEEKDAY_MONDAY, WEEK_FIRST)
        assert result == date(2024, 6, 3)

    def test_second_tuesday_of_june_2024(self):
        """Second Tuesday of June 2024 is June 11."""
        result = get_nth_weekday_of_month(2024, 6, WEEKDAY_TUESDAY, WEEK_SECOND)
        assert result == date(2024, 6, 11)

    def test_last_saturday_of_june_2024(self):
        """Last Saturday of June 2024 is June 29."""
        result = get_nth_weekday_of_month(2024, 6, WEEKDAY_SATURDAY, WEEK_LAST)
        assert result == date(2024, 6, 29)

    def test_last_sunday_of_june_2024(self):
        """Last Sunday of June 2024 is June 30."""
        result = get_nth_weekday_of_month(2024, 6, WEEKDAY_SUNDAY, WEEK_LAST)
        assert result == date(2024, 6, 30)

    def test_week_last_equals_5_returns_last_occurrence(self):
        """When n=5 (WEEK_LAST), return the last occurrence of that weekday."""
        # WEEK_LAST = 5, so n=5 means "last Monday" not "5th Monday"
        # Last Monday of June 2024 is June 24 (4th Monday)
        result = get_nth_weekday_of_month(2024, 6, WEEKDAY_MONDAY, WEEK_LAST)
        assert result == date(2024, 6, 24)

    def test_fourth_occurrence_at_boundary(self):
        """4th occurrence that exists should return correctly."""
        # 4th Monday of June 2024 is June 24
        result = get_nth_weekday_of_month(2024, 6, WEEKDAY_MONDAY, WEEK_FOURTH)
        assert result == date(2024, 6, 24)

    def test_first_sunday_of_month(self):
        """First Sunday of June 2024 is June 2."""
        result = get_nth_weekday_of_month(2024, 6, WEEKDAY_SUNDAY, WEEK_FIRST)
        assert result == date(2024, 6, 2)


class TestCalculateNextAnchoredWeekly:
    """Tests for anchored weekly recurrence."""

    def test_single_anchor_day_later_this_week(self):
        """If anchor day is later this week, return that day."""
        # June 10, 2024 is Monday (weekday 1 in our system)
        # Anchor on Thursday (weekday 4)
        result = calculate_next_anchored_weekly(
            date(2024, 6, 10),
            anchor_days=[WEEKDAY_THURSDAY],
            interval=1
        )
        assert result == date(2024, 6, 13)  # Thursday

    def test_single_anchor_day_next_week(self):
        """If anchor day passed this week, go to next week."""
        # June 14, 2024 is Friday (weekday 6 in our system)
        # Anchor on Monday (weekday 1)
        result = calculate_next_anchored_weekly(
            date(2024, 6, 14),
            anchor_days=[WEEKDAY_MONDAY],
            interval=1
        )
        assert result == date(2024, 6, 17)  # Next Monday

    def test_multiple_anchor_days_pick_next(self):
        """With multiple anchor days, pick the next one."""
        # June 11, 2024 is Tuesday (weekday 2)
        # Anchors on Monday (1) and Thursday (4)
        result = calculate_next_anchored_weekly(
            date(2024, 6, 11),
            anchor_days=[WEEKDAY_MONDAY, WEEKDAY_THURSDAY],
            interval=1
        )
        assert result == date(2024, 6, 13)  # Thursday (next anchor after Tuesday)

    def test_multiple_anchor_days_wrap_to_next_week(self):
        """If past all anchor days, wrap to next week's first anchor."""
        # June 14, 2024 is Friday (weekday 6)
        # Anchors on Monday (1) and Thursday (4) - both passed
        result = calculate_next_anchored_weekly(
            date(2024, 6, 14),
            anchor_days=[WEEKDAY_MONDAY, WEEKDAY_THURSDAY],
            interval=1
        )
        assert result == date(2024, 6, 17)  # Next Monday

    def test_biweekly_interval(self):
        """Biweekly should skip a week."""
        # June 14, 2024 is Friday
        # Anchor on Monday, interval=2
        result = calculate_next_anchored_weekly(
            date(2024, 6, 14),
            anchor_days=[WEEKDAY_MONDAY],
            interval=2
        )
        assert result == date(2024, 6, 24)  # Monday in 2 weeks

    def test_empty_anchor_days(self):
        """Empty anchor days should fall back to interval weeks."""
        result = calculate_next_anchored_weekly(
            date(2024, 6, 15),
            anchor_days=[],
            interval=1
        )
        assert result == date(2024, 6, 22)


class TestCalculateNextAnchoredMonthly:
    """Tests for anchored monthly recurrence."""

    def test_day_of_month_later_this_month(self):
        """If target day is later this month, use it."""
        # June 10, anchor on 15th
        result = calculate_next_anchored_monthly(
            date(2024, 6, 10),
            anchor_type=ANCHOR_DAY_OF_MONTH,
            anchor_day_of_month=15,
            months_interval=1
        )
        assert result == date(2024, 6, 15)

    def test_day_of_month_next_month(self):
        """If target day passed, go to next month."""
        # June 20, anchor on 15th
        result = calculate_next_anchored_monthly(
            date(2024, 6, 20),
            anchor_type=ANCHOR_DAY_OF_MONTH,
            anchor_day_of_month=15,
            months_interval=1
        )
        assert result == date(2024, 7, 15)

    def test_day_of_month_31_in_short_month(self):
        """Day 31 in a 30-day month should use day 30."""
        # June has 30 days
        result = calculate_next_anchored_monthly(
            date(2024, 6, 1),
            anchor_type=ANCHOR_DAY_OF_MONTH,
            anchor_day_of_month=31,
            months_interval=1
        )
        assert result == date(2024, 6, 30)

    def test_quarterly_interval(self):
        """Quarterly should skip 3 months."""
        result = calculate_next_anchored_monthly(
            date(2024, 6, 20),
            anchor_type=ANCHOR_DAY_OF_MONTH,
            anchor_day_of_month=15,
            months_interval=3
        )
        assert result == date(2024, 9, 15)

    def test_week_pattern_later_this_month(self):
        """Week pattern: 2nd Tuesday later this month."""
        # June 1, 2024 - 2nd Tuesday is June 11
        result = calculate_next_anchored_monthly(
            date(2024, 6, 1),
            anchor_type=ANCHOR_WEEK_PATTERN,
            anchor_week=WEEK_SECOND,
            anchor_weekday=WEEKDAY_TUESDAY,
            months_interval=1
        )
        assert result == date(2024, 6, 11)

    def test_week_pattern_next_month(self):
        """Week pattern: 2nd Tuesday when past this month's occurrence."""
        # June 15, 2024 - 2nd Tuesday (June 11) already passed
        result = calculate_next_anchored_monthly(
            date(2024, 6, 15),
            anchor_type=ANCHOR_WEEK_PATTERN,
            anchor_week=WEEK_SECOND,
            anchor_weekday=WEEKDAY_TUESDAY,
            months_interval=1
        )
        assert result == date(2024, 7, 9)  # 2nd Tuesday of July

    def test_week_pattern_last_friday(self):
        """Week pattern: Last Friday of the month."""
        result = calculate_next_anchored_monthly(
            date(2024, 6, 1),
            anchor_type=ANCHOR_WEEK_PATTERN,
            anchor_week=WEEK_LAST,
            anchor_weekday=5,  # Friday
            months_interval=1
        )
        assert result == date(2024, 6, 28)  # Last Friday of June


class TestCalculateNextDueForChore:
    """Tests for the main chore due date calculation function."""

    def test_interval_based_weekly(self):
        """Interval-based weekly should use basic calculation."""
        chore = {
            "frequency": FREQUENCY_WEEKLY,
            "recurrence_type": RECURRENCE_INTERVAL,
        }
        result = calculate_next_due_for_chore(chore, date(2024, 6, 15))
        assert result == date(2024, 6, 22)

    def test_once_returns_none(self):
        """One-off chore should return None."""
        chore = {
            "frequency": FREQUENCY_ONCE,
            "recurrence_type": RECURRENCE_INTERVAL,
        }
        result = calculate_next_due_for_chore(chore, date(2024, 6, 15))
        assert result is None

    def test_anchored_weekly(self):
        """Anchored weekly should use anchored calculation."""
        chore = {
            "frequency": FREQUENCY_WEEKLY,
            "recurrence_type": RECURRENCE_ANCHORED,
            "anchor_days_of_week": [WEEKDAY_MONDAY, WEEKDAY_THURSDAY],
            "interval": 1,
        }
        # June 11 is Tuesday, next anchor is Thursday
        result = calculate_next_due_for_chore(chore, date(2024, 6, 11))
        assert result == date(2024, 6, 13)

    def test_anchored_biweekly(self):
        """Anchored biweekly should use 2-week interval."""
        chore = {
            "frequency": FREQUENCY_BIWEEKLY,
            "recurrence_type": RECURRENCE_ANCHORED,
            "anchor_days_of_week": [WEEKDAY_MONDAY],
            "interval": 1,
        }
        # June 14 is Friday, next Monday + 1 week = June 24
        result = calculate_next_due_for_chore(chore, date(2024, 6, 14))
        assert result == date(2024, 6, 24)

    def test_anchored_monthly_day_of_month(self):
        """Anchored monthly with day_of_month."""
        chore = {
            "frequency": FREQUENCY_MONTHLY,
            "recurrence_type": RECURRENCE_ANCHORED,
            "anchor_type": ANCHOR_DAY_OF_MONTH,
            "anchor_day_of_month": 15,
            "interval": 1,
        }
        result = calculate_next_due_for_chore(chore, date(2024, 6, 20))
        assert result == date(2024, 7, 15)

    def test_anchored_quarterly(self):
        """Anchored quarterly should use 3-month interval."""
        chore = {
            "frequency": FREQUENCY_QUARTERLY,
            "recurrence_type": RECURRENCE_ANCHORED,
            "anchor_type": ANCHOR_DAY_OF_MONTH,
            "anchor_day_of_month": 1,
            "interval": 1,
        }
        result = calculate_next_due_for_chore(chore, date(2024, 6, 5))
        assert result == date(2024, 9, 1)

    def test_anchored_yearly(self):
        """Anchored yearly should use 12-month interval."""
        chore = {
            "frequency": FREQUENCY_YEARLY,
            "recurrence_type": RECURRENCE_ANCHORED,
            "anchor_type": ANCHOR_DAY_OF_MONTH,
            "anchor_day_of_month": 1,
            "interval": 1,
        }
        result = calculate_next_due_for_chore(chore, date(2024, 6, 5))
        assert result == date(2025, 6, 1)

    def test_missing_recurrence_type_defaults_to_interval(self):
        """Missing recurrence_type should default to interval-based."""
        chore = {
            "frequency": FREQUENCY_WEEKLY,
        }
        result = calculate_next_due_for_chore(chore, date(2024, 6, 15))
        assert result == date(2024, 6, 22)
