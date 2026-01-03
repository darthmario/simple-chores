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

# Config
CONF_NOTIFICATIONS_ENABLED: Final = "notifications_enabled"
CONF_NOTIFICATION_TIME: Final = "notification_time"
CONF_NOTIFY_TARGETS: Final = "notify_targets"

# Defaults
DEFAULT_NOTIFICATION_TIME: Final = "08:00"
DEFAULT_NOTIFICATIONS_ENABLED: Final = True

# Limits
MAX_ROOM_NAME_LENGTH: Final = 50
MAX_CHORE_NAME_LENGTH: Final = 100
MAX_HISTORY_ENTRIES: Final = 1000
MAX_CALENDAR_EVENTS: Final = 100  # Maximum events to generate per chore in calendar