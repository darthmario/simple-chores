"""DataUpdateCoordinator for the Simple Chores integration."""
from __future__ import annotations

import calendar
import logging
from datetime import date, datetime, timedelta
from typing import TYPE_CHECKING, Any

from dateutil.relativedelta import relativedelta

from homeassistant.config_entries import ConfigEntry
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator

from .const import (
    DOMAIN,
    FREQUENCY_BIANNUAL,
    FREQUENCY_BIMONTHLY,
    FREQUENCY_BIWEEKLY,
    FREQUENCY_DAILY,
    FREQUENCY_MONTHLY,
    FREQUENCY_ONCE,
    FREQUENCY_QUARTERLY,
    FREQUENCY_WEEKLY,
    FREQUENCY_YEARLY,
    ROOM_PREFIX_AREA,
    RECURRENCE_ANCHORED,
    RECURRENCE_INTERVAL,
    ANCHOR_DAY_OF_MONTH,
    ANCHOR_WEEK_PATTERN,
    WEEK_LAST,
)
from .store import SimpleChoresStore

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant
    from homeassistant.helpers.area_registry import AreaRegistry

_LOGGER = logging.getLogger(__name__)


def calculate_next_due(from_date: date, frequency: str) -> date | None:
    """Calculate the next due date based on frequency.

    Returns None for one-off chores (frequency='once'), indicating they should not be rescheduled.
    """
    if frequency == FREQUENCY_ONCE:
        return None  # One-off chores don't get rescheduled
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
    """Get the start (Sunday) and end (Saturday) of the week containing the given date."""
    # Python weekday: Monday=0, Sunday=6
    # We want Sunday=0, so adjust
    days_since_sunday = (for_date.weekday() + 1) % 7
    week_start = for_date - timedelta(days=days_since_sunday)
    week_end = week_start + timedelta(days=6)
    return week_start, week_end


def get_nth_weekday_of_month(year: int, month: int, weekday: int, n: int) -> date | None:
    """Get the nth occurrence of a weekday in a month.

    Args:
        year: The year
        month: The month (1-12)
        weekday: Day of week (0=Sunday, 6=Saturday) - Note: uses our Sunday=0 convention
        n: Which occurrence (1-4, or 5 for last)

    Returns:
        The date of the nth weekday, or None if it doesn't exist
    """
    # Convert our weekday (Sunday=0) to Python's weekday (Monday=0)
    python_weekday = (weekday - 1) % 7  # Sunday(0)->6, Monday(1)->0, etc.

    # Get first day of month and number of days in month
    first_day = date(year, month, 1)
    days_in_month = calendar.monthrange(year, month)[1]

    if n == WEEK_LAST:
        # Find last occurrence - start from end of month
        last_day = date(year, month, days_in_month)
        days_back = (last_day.weekday() - python_weekday) % 7
        result = last_day - timedelta(days=days_back)
        return result

    # Find first occurrence of this weekday
    days_ahead = (python_weekday - first_day.weekday()) % 7
    first_occurrence = first_day + timedelta(days=days_ahead)

    # Calculate nth occurrence
    result = first_occurrence + timedelta(weeks=n - 1)

    # Check if still in same month
    if result.month != month:
        return None

    return result


def calculate_next_anchored_weekly(
    from_date: date,
    anchor_days: list[int],
    interval: int = 1,
) -> date:
    """Calculate next due date for anchored weekly recurrence.

    Args:
        from_date: The date to calculate from (usually today or completion date)
        anchor_days: List of weekdays (0=Sunday, 6=Saturday)
        interval: Number of weeks between occurrences (default 1)

    Returns:
        The next due date
    """
    if not anchor_days:
        return from_date + timedelta(weeks=interval)

    # Sort anchor days
    sorted_days = sorted(anchor_days)

    # Get current day of week (convert Python's Monday=0 to our Sunday=0)
    current_dow = (from_date.weekday() + 1) % 7

    # Find next anchor day in current week
    for day in sorted_days:
        if day > current_dow:
            # Found a day later this week
            days_ahead = day - current_dow
            return from_date + timedelta(days=days_ahead)

    # No more days this week - go to first anchor day of next interval
    # Calculate days until next week's first anchor day
    first_anchor = sorted_days[0]
    days_until_sunday = (7 - current_dow) % 7 or 7  # Days until next Sunday
    days_from_sunday_to_anchor = first_anchor

    # If interval > 1, skip additional weeks
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
    """Calculate next due date for anchored monthly recurrence.

    Args:
        from_date: The date to calculate from
        anchor_type: 'day_of_month' or 'week_pattern'
        anchor_day_of_month: Day of month (1-31) for day_of_month type
        anchor_week: Week ordinal (1-5, 5=last) for week_pattern type
        anchor_weekday: Weekday (0-6, 0=Sunday) for week_pattern type
        months_interval: Number of months between occurrences

    Returns:
        The next due date
    """
    if anchor_type == ANCHOR_DAY_OF_MONTH:
        # Simple day of month (e.g., 15th of every month)
        target_day = anchor_day_of_month or 1

        # Try current month first
        year, month = from_date.year, from_date.month
        days_in_month = calendar.monthrange(year, month)[1]
        actual_day = min(target_day, days_in_month)
        target_date = date(year, month, actual_day)

        if target_date > from_date:
            return target_date

        # Move to next month interval
        next_month_date = from_date + relativedelta(months=months_interval)
        year, month = next_month_date.year, next_month_date.month
        days_in_month = calendar.monthrange(year, month)[1]
        actual_day = min(target_day, days_in_month)
        return date(year, month, actual_day)

    elif anchor_type == ANCHOR_WEEK_PATTERN:
        # Week pattern (e.g., 2nd Tuesday of every month)
        if anchor_week is None or anchor_weekday is None:
            return from_date + relativedelta(months=months_interval)

        # Try current month first
        year, month = from_date.year, from_date.month
        target_date = get_nth_weekday_of_month(year, month, anchor_weekday, anchor_week)

        if target_date and target_date > from_date:
            return target_date

        # Move to next month interval
        next_month_date = from_date + relativedelta(months=months_interval)
        year, month = next_month_date.year, next_month_date.month
        target_date = get_nth_weekday_of_month(year, month, anchor_weekday, anchor_week)

        # If pattern doesn't exist in target month (e.g., 5th Monday doesn't exist),
        # keep trying subsequent months
        attempts = 0
        while target_date is None and attempts < 12:
            next_month_date = next_month_date + relativedelta(months=1)
            year, month = next_month_date.year, next_month_date.month
            target_date = get_nth_weekday_of_month(year, month, anchor_weekday, anchor_week)
            attempts += 1

        return target_date or from_date + relativedelta(months=months_interval)

    return from_date + relativedelta(months=months_interval)


def calculate_next_due_for_chore(chore: dict[str, Any], from_date: date) -> date | None:
    """Calculate the next due date for a chore based on its recurrence settings.

    This is the main entry point for due date calculation that handles both
    interval-based and anchored recurrence.

    Args:
        chore: The chore dictionary with recurrence settings
        from_date: The date to calculate from (usually completion date)

    Returns:
        The next due date, or None for one-off chores
    """
    frequency = chore.get("frequency", FREQUENCY_WEEKLY)
    recurrence_type = chore.get("recurrence_type", RECURRENCE_INTERVAL)
    interval = chore.get("interval", 1)

    # One-off chores don't recur
    if frequency == FREQUENCY_ONCE:
        return None

    # Use interval-based calculation for backward compatibility
    if recurrence_type != RECURRENCE_ANCHORED:
        return calculate_next_due(from_date, frequency)

    # Anchored recurrence
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
        # For yearly, use the anchor month from the original due date
        # and apply the monthly anchor logic
        anchor_type = chore.get("anchor_type", ANCHOR_DAY_OF_MONTH)
        return calculate_next_anchored_monthly(
            from_date,
            anchor_type,
            chore.get("anchor_day_of_month"),
            chore.get("anchor_week"),
            chore.get("anchor_weekday"),
            12 * interval,  # 12 months = 1 year
        )

    # Fallback to interval-based
    return calculate_next_due(from_date, frequency)


class SimpleChoresCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Coordinator to manage simple chores data."""

    config_entry: ConfigEntry

    def __init__(
        self,
        hass: HomeAssistant,
        store: SimpleChoresStore,
        config_entry: ConfigEntry,
    ) -> None:
        """Initialize the coordinator."""
        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=timedelta(minutes=15),
        )
        self.store = store
        self.config_entry = config_entry
        self._room_name_cache: dict[str, str] | None = {}

    async def _async_update_data(self) -> dict[str, Any]:
        """Calculate due chores and prepare data for entities."""
        today = date.today()
        # Use rolling 7-day window instead of calendar week
        next_seven_days = today + timedelta(days=7)

        # Get all rooms (HA Areas + custom)
        # Cache is only cleared when rooms are modified, not on every update
        all_rooms = await self._get_all_rooms()
        _LOGGER.debug("Available rooms: %s", [(room["id"], room["name"]) for room in all_rooms])

        # Categorize chores
        due_today: list[dict[str, Any]] = []
        due_this_week: list[dict[str, Any]] = []
        overdue: list[dict[str, Any]] = []
        all_active_chores: list[dict[str, Any]] = []
        by_room: dict[str, list[dict[str, Any]]] = {room["id"]: [] for room in all_rooms}

        for chore in self.store.chores.values():
            # Skip completed one-off chores
            if chore.get("is_completed", False):
                continue

            next_due = date.fromisoformat(chore["next_due"])
            room_name = self._get_room_name(chore["room_id"], all_rooms)
            chore_with_room = {
                **chore,
                "room_name": room_name,
            }

            # Add to all active chores list (with room_name)
            all_active_chores.append(chore_with_room)

            # Debug logging for troubleshooting
            _LOGGER.debug("Chore: %s, Room ID: %s, Room Name: %s, Next Due: %s, Assigned To: %s",
                         chore["name"], chore["room_id"], room_name, chore["next_due"], chore.get("assigned_to"))

            # Categorize by due date
            if next_due < today:
                overdue.append(chore_with_room)
                # Overdue items are also due today
                due_today.append(chore_with_room)
            elif next_due == today:
                due_today.append(chore_with_room)

            # Due in next 7 days (rolling window, not calendar week)
            if today < next_due <= next_seven_days:
                due_this_week.append(chore_with_room)

            # Group by room
            room_id = chore["room_id"]
            if room_id in by_room:
                by_room[room_id].append(chore_with_room)

        # Get all users (HA + custom)
        all_users = await self.async_get_users()

        result = {
            "today": today.isoformat(),
            "seven_days_from_today": next_seven_days.isoformat(),
            "due_today": due_today,
            "due_today_count": len(due_today),
            "due_this_week": due_this_week,
            "due_this_week_count": len(due_this_week),
            "overdue": overdue,
            "overdue_count": len(overdue),
            "has_overdue": bool(overdue),
            "by_room": by_room,
            "rooms": all_rooms,
            "users": all_users,
            "chores": all_active_chores,
            "total_chores": len(all_active_chores),
        }
        
        _LOGGER.debug("Data update complete. Total chores: %d, Due today: %d, Due this week: %d, Overdue: %d", 
                     len(self.store.chores), len(due_today), len(due_this_week), len(overdue))
        
        return result

    async def _get_all_rooms(self) -> list[dict[str, Any]]:
        """Get all rooms from HA Area Registry and custom rooms."""
        rooms: list[dict[str, Any]] = []

        # Get HA Areas
        from homeassistant.helpers import area_registry as ar
        area_registry: AreaRegistry = ar.async_get(self.hass)
        for area in area_registry.async_list_areas():
            rooms.append(
                {
                    "id": f"{ROOM_PREFIX_AREA}{area.id}",
                    "name": area.name,
                    "icon": area.icon or "mdi:home",
                    "is_custom": False,
                }
            )

        # Add custom rooms
        for room in self.store.rooms.values():
            rooms.append(room)

        return rooms

    def _invalidate_room_cache(self) -> None:
        """Invalidate the room name cache when rooms are modified."""
        self._room_name_cache = None

    def _get_room_name(
        self, room_id: str, all_rooms: list[dict[str, Any]]
    ) -> str:
        """Get the display name for a room."""
        # Build cache once if empty or invalidated
        if not self._room_name_cache:
            self._room_name_cache = {room["id"]: room["name"] for room in all_rooms}
        return self._room_name_cache.get(room_id, "Unknown Room")

    async def async_get_users(self) -> list[dict[str, Any]]:
        """Get all users (HA users + custom users)."""
        users = []

        # Get Home Assistant users (filter out system-generated accounts)
        ha_users = await self.hass.auth.async_get_users()
        for user in ha_users:
            # Skip system-generated users (Supervisor, Home Assistant Cloud, etc.)
            if user.system_generated:
                continue
            if user.is_active:
                users.append({
                    "id": user.id,
                    "name": user.name or user.id,
                    "is_custom": False,
                    "is_active": True,
                })

        # Add custom users
        for user in self.store.users.values():
            users.append(user)

        return users

    async def async_get_user_name(self, user_id: str) -> str:
        """Get a user's display name by ID (checks both HA users and custom users)."""
        # Check custom users first
        if user_id in self.store.users:
            return self.store.users[user_id]["name"]

        # Check HA users
        users = await self.hass.auth.async_get_users()
        for user in users:
            if user.id == user_id:
                return user.name or user_id
        return user_id

    async def async_complete_chore(
        self, chore_id: str, user_id: str | None = None
    ) -> dict[str, Any] | None:
        """Complete a chore and reschedule it."""
        if chore_id not in self.store.chores:
            return None

        chore = self.store.chores[chore_id]
        today = date.today()
        # Use the new anchored-aware calculation
        next_due = calculate_next_due_for_chore(chore, today)

        # Get user info
        if user_id is None:
            user_id = "unknown"
        user_name = await self.async_get_user_name(user_id)

        result = self.store.complete_chore(chore_id, user_id, user_name, next_due)
        if result:
            await self.store.async_save()
            await self.async_request_refresh()
        return result

    async def async_skip_chore(self, chore_id: str) -> dict[str, Any] | None:
        """Skip a chore to the next occurrence."""
        if chore_id not in self.store.chores:
            return None

        chore = self.store.chores[chore_id]
        current_due = date.fromisoformat(chore["next_due"])
        # Use the new anchored-aware calculation
        next_due = calculate_next_due_for_chore(chore, current_due)

        result = self.store.skip_chore(chore_id, next_due)
        if result:
            await self.store.async_save()
            await self.async_request_refresh()
        return result

    async def async_snooze_chore(self, chore_id: str) -> dict[str, Any] | None:
        """Snooze a chore by postponing it 1 day."""
        if chore_id not in self.store.chores:
            return None

        result = self.store.snooze_chore(chore_id)
        if result:
            await self.store.async_save()
            await self.async_request_refresh()
        return result

    async def async_add_room(
        self, name: str, icon: str | None = None
    ) -> dict[str, Any]:
        """Add a custom room."""
        room = self.store.add_room(name, icon)
        self._invalidate_room_cache()  # Cache must be refreshed
        await self.store.async_save()
        await self.async_request_refresh()
        return room

    async def async_update_room(
        self, room_id: str, name: str | None = None, icon: str | None = None
    ) -> dict[str, Any] | None:
        """Update a custom room."""
        room = self.store.update_room(room_id, name, icon)
        if room:
            self._invalidate_room_cache()  # Cache must be refreshed
            await self.store.async_save()
            await self.async_request_refresh()
        return room

    async def async_remove_room(self, room_id: str) -> bool:
        """Remove a custom room."""
        result = self.store.remove_room(room_id)
        if result:
            self._invalidate_room_cache()  # Cache must be refreshed
            await self.store.async_save()
            await self.async_request_refresh()
        return result

    async def async_add_user(
        self, name: str, avatar: str | None = None
    ) -> dict[str, Any]:
        """Add a custom user."""
        user = self.store.add_user(name, avatar)
        await self.store.async_save()
        await self.async_request_refresh()
        return user

    async def async_update_user(
        self, user_id: str, name: str | None = None, avatar: str | None = None
    ) -> dict[str, Any] | None:
        """Update a custom user."""
        user = self.store.update_user(user_id, name, avatar)
        if user:
            await self.store.async_save()
            await self.async_request_refresh()
        return user

    async def async_remove_user(self, user_id: str) -> bool:
        """Remove a custom user."""
        result = self.store.remove_user(user_id)
        if result:
            await self.store.async_save()
            await self.async_request_refresh()
        return result

    async def async_add_chore(
        self,
        name: str,
        room_id: str,
        frequency: str,
        start_date: date | None = None,
        assigned_to: str | None = None,
        recurrence_type: str | None = None,
        anchor_days_of_week: list[int] | None = None,
        anchor_type: str | None = None,
        anchor_day_of_month: int | None = None,
        anchor_week: int | None = None,
        anchor_weekday: int | None = None,
        interval: int | None = None,
    ) -> dict[str, Any]:
        """Add a new chore."""
        # Validate room exists before creating chore
        all_rooms = await self._get_all_rooms()
        valid_room_ids = {room["id"] for room in all_rooms}
        if room_id not in valid_room_ids:
            raise ValueError(
                f"Invalid room ID: {room_id}. Room does not exist. "
                f"Please create the room first or use an existing HA Area."
            )

        _LOGGER.info("Coordinator: Adding chore '%s' with recurrence_type: %s, assigned_to: %s",
                    name, recurrence_type, assigned_to)
        chore = self.store.add_chore(
            name, room_id, frequency, start_date, assigned_to,
            recurrence_type, anchor_days_of_week, anchor_type,
            anchor_day_of_month, anchor_week, anchor_weekday, interval
        )
        _LOGGER.info("Coordinator: Created chore data: %s", chore)
        await self.store.async_save_debounced()  # Use debounced save for performance
        await self.async_request_refresh()
        return chore

    async def async_update_chore(
        self,
        chore_id: str,
        name: str | None = None,
        room_id: str | None = None,
        frequency: str | None = None,
        next_due: date | None = None,
        assigned_to: str | None = None,
        recurrence_type: str | None = None,
        anchor_days_of_week: list[int] | None = None,
        anchor_type: str | None = None,
        anchor_day_of_month: int | None = None,
        anchor_week: int | None = None,
        anchor_weekday: int | None = None,
        interval: int | None = None,
    ) -> dict[str, Any] | None:
        """Update an existing chore."""
        # Validate room exists if room_id is being updated
        if room_id is not None:
            all_rooms = await self._get_all_rooms()
            valid_room_ids = {room["id"] for room in all_rooms}
            if room_id not in valid_room_ids:
                raise ValueError(
                    f"Invalid room ID: {room_id}. Room does not exist. "
                    f"Please create the room first or use an existing HA Area."
                )

        chore = self.store.update_chore(
            chore_id, name, room_id, frequency, next_due, assigned_to,
            recurrence_type, anchor_days_of_week, anchor_type,
            anchor_day_of_month, anchor_week, anchor_weekday, interval
        )
        if chore:
            await self.store.async_save_debounced()  # Use debounced save for performance
            await self.async_request_refresh()
        return chore

    async def async_remove_chore(self, chore_id: str) -> bool:
        """Remove a chore."""
        result = self.store.remove_chore(chore_id)
        if result:
            await self.store.async_save()  # Use immediate save for deletions
            await self.async_request_refresh()
        return result