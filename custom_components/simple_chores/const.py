"""Constants for the Simple Chores integration."""

from typing import Final

DOMAIN: Final = "simple_chores"

# Storage
STORAGE_VERSION: Final = 1
STORAGE_KEY: Final = "simple_chores"

# Frequencies
FREQUENCY_ONCE: Final = "once"
FREQUENCY_DAILY: Final = "daily"
FREQUENCY_WEEKLY: Final = "weekly"
FREQUENCY_BIWEEKLY: Final = "biweekly"
FREQUENCY_MONTHLY: Final = "monthly"
FREQUENCY_BIMONTHLY: Final = "bimonthly"
FREQUENCY_QUARTERLY: Final = "quarterly"
FREQUENCY_BIANNUAL: Final = "biannual"
FREQUENCY_YEARLY: Final = "yearly"

FREQUENCIES: Final = [
    FREQUENCY_ONCE,
    FREQUENCY_DAILY,
    FREQUENCY_WEEKLY,
    FREQUENCY_BIWEEKLY,
    FREQUENCY_MONTHLY,
    FREQUENCY_BIMONTHLY,
    FREQUENCY_QUARTERLY,
    FREQUENCY_BIANNUAL,
    FREQUENCY_YEARLY,
]

# Recurrence types
RECURRENCE_INTERVAL: Final = "interval"  # Every N days/weeks/months from completion
RECURRENCE_ANCHORED: Final = "anchored"  # Specific days (every Tuesday, 15th of month, etc.)

RECURRENCE_TYPES: Final = [
    RECURRENCE_INTERVAL,
    RECURRENCE_ANCHORED,
]

# Anchor types for monthly/yearly recurrence
ANCHOR_DAY_OF_MONTH: Final = "day_of_month"  # e.g., 15th of every month
ANCHOR_WEEK_PATTERN: Final = "week_pattern"  # e.g., 2nd Tuesday of every month

ANCHOR_TYPES: Final = [
    ANCHOR_DAY_OF_MONTH,
    ANCHOR_WEEK_PATTERN,
]

# Week ordinals for week_pattern (1st, 2nd, 3rd, 4th, last)
WEEK_FIRST: Final = 1
WEEK_SECOND: Final = 2
WEEK_THIRD: Final = 3
WEEK_FOURTH: Final = 4
WEEK_LAST: Final = 5  # Special value for "last X of month"

WEEK_ORDINALS: Final = [
    WEEK_FIRST,
    WEEK_SECOND,
    WEEK_THIRD,
    WEEK_FOURTH,
    WEEK_LAST,
]

# Days of week (Sunday = 0, Saturday = 6)
WEEKDAY_SUNDAY: Final = 0
WEEKDAY_MONDAY: Final = 1
WEEKDAY_TUESDAY: Final = 2
WEEKDAY_WEDNESDAY: Final = 3
WEEKDAY_THURSDAY: Final = 4
WEEKDAY_FRIDAY: Final = 5
WEEKDAY_SATURDAY: Final = 6

WEEKDAYS: Final = [
    WEEKDAY_SUNDAY,
    WEEKDAY_MONDAY,
    WEEKDAY_TUESDAY,
    WEEKDAY_WEDNESDAY,
    WEEKDAY_THURSDAY,
    WEEKDAY_FRIDAY,
    WEEKDAY_SATURDAY,
]

# Room prefixes
ROOM_PREFIX_AREA: Final = "area_"
ROOM_PREFIX_CUSTOM: Final = "custom_"

# Services
SERVICE_ADD_ROOM: Final = "add_room"
SERVICE_REMOVE_ROOM: Final = "remove_room"
SERVICE_UPDATE_ROOM: Final = "update_room"
SERVICE_ADD_USER: Final = "add_user"
SERVICE_REMOVE_USER: Final = "remove_user"
SERVICE_UPDATE_USER: Final = "update_user"
SERVICE_ADD_CHORE: Final = "add_chore"
SERVICE_REMOVE_CHORE: Final = "remove_chore"
SERVICE_UPDATE_CHORE: Final = "update_chore"
SERVICE_COMPLETE_CHORE: Final = "complete_chore"
SERVICE_SKIP_CHORE: Final = "skip_chore"
SERVICE_SNOOZE_CHORE: Final = "snooze_chore"
SERVICE_TOGGLE_CHORE_STEP: Final = "toggle_chore_step"
SERVICE_UNDO_COMPLETION: Final = "undo_completion"
SERVICE_GET_HISTORY: Final = "get_history"
SERVICE_GET_USER_STATS: Final = "get_user_stats"
SERVICE_SEND_NOTIFICATION: Final = "send_due_notification"

# Attributes
ATTR_ROOM_ID: Final = "room_id"
ATTR_ROOM_NAME: Final = "name"
ATTR_CHORE_ID: Final = "chore_id"
ATTR_CHORE_NAME: Final = "name"
ATTR_FREQUENCY: Final = "frequency"
ATTR_ICON: Final = "icon"
ATTR_USER_ID: Final = "user_id"
ATTR_USER_NAME: Final = "name"
ATTR_AVATAR: Final = "avatar"
ATTR_ASSIGNED_TO: Final = "assigned_to"
ATTR_START_DATE: Final = "start_date"
ATTR_NEXT_DUE: Final = "next_due"
ATTR_HISTORY_ID: Final = "history_id"

# Focus view ("chore book") attributes
ATTR_ESTIMATED_MINUTES: Final = "estimated_minutes"
ATTR_STEPS: Final = "steps"
ATTR_STEP_INDEX: Final = "step_index"
ATTR_COMPLETED: Final = "completed"

# Recurrence attributes
ATTR_RECURRENCE_TYPE: Final = "recurrence_type"
ATTR_ANCHOR_DAYS_OF_WEEK: Final = "anchor_days_of_week"
ATTR_ANCHOR_TYPE: Final = "anchor_type"
ATTR_ANCHOR_DAY_OF_MONTH: Final = "anchor_day_of_month"
ATTR_ANCHOR_WEEK: Final = "anchor_week"
ATTR_ANCHOR_WEEKDAY: Final = "anchor_weekday"
ATTR_INTERVAL: Final = "interval"

# Config
CONF_NOTIFICATIONS_ENABLED: Final = "notifications_enabled"
CONF_NOTIFICATION_TIME: Final = "notification_time"
CONF_NOTIFY_TARGETS: Final = "notify_targets"
CONF_NOTIFY_DAYS_BEFORE: Final = "notify_days_before"

# Defaults
DEFAULT_NOTIFICATION_TIME: Final = "08:00"
DEFAULT_NOTIFICATIONS_ENABLED: Final = True
DEFAULT_NOTIFY_DAYS_BEFORE: Final = [0]  # Default: only notify on due date

# Notification timing options (days before due date)
NOTIFY_DAYS_OPTIONS: Final = [0, 1, 2, 3, 7]  # Today, 1 day, 2 days, 3 days, 1 week

# Limits
MAX_ROOM_NAME_LENGTH: Final = 50
MAX_CHORE_NAME_LENGTH: Final = 100
MAX_HISTORY_ENTRIES: Final = 1000
# Raw history is no longer published as a state attribute - it is served on
# demand over the websocket (see websocket.py) and summarised into the
# "statistics" attribute (see statistics.py). This caps a single fetch.
EXPOSED_HISTORY_ENTRIES: Final = 300
EXPOSED_HISTORY_DAYS: Final = 365

# Statistics periods offered by the card's stats dashboard. Kept in step with
# STATS_PERIODS in simple-chores-card.js; the backend counts the buckets and
# the card formats their labels so date formatting stays locale-aware.
STATS_PERIODS: Final = {
    "7d": {"group_by": "day", "buckets": 7},
    "4w": {"group_by": "week", "buckets": 4},
    "3m": {"group_by": "month", "buckets": 3},
    "1y": {"group_by": "month", "buckets": 12},
}
TOP_CHORES_LIMIT: Final = 5
MAX_CALENDAR_EVENTS: Final = 100  # Maximum events to generate per chore in calendar
MAX_ESTIMATED_MINUTES: Final = 480  # 8 hours - anything longer isn't a single chore
MAX_STEPS_PER_CHORE: Final = 12  # Beyond this a chore should be split up
MAX_STEP_LENGTH: Final = 100

# Sensor Entity IDs (used by both backend and frontend card)
SENSOR_DUE_TODAY: Final = "sensor.chores_due_today"
SENSOR_DUE_NEXT_7_DAYS: Final = "sensor.chores_due_next_7_days"
SENSOR_OVERDUE: Final = "sensor.overdue_chores"
SENSOR_TOTAL: Final = "sensor.total_chores"
