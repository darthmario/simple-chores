"""Pytest fixtures for Simple Chores tests."""
from __future__ import annotations

import pytest
from datetime import date


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
