# Simple Chores

A comprehensive Home Assistant custom integration for tracking household chores with advanced room organization, flexible scheduling, user assignment & attribution, and intelligent automation.

[![CI](https://github.com/darthmario/simple-chores/actions/workflows/ci.yaml/badge.svg)](https://github.com/darthmario/simple-chores/actions/workflows/ci.yaml)
[![Hassfest Validation](https://github.com/darthmario/simple-chores/actions/workflows/hassfest.yaml/badge.svg)](https://github.com/darthmario/simple-chores/actions/workflows/hassfest.yaml)

## Features

### **Room Management**
- **Dual Room System**: Use existing Home Assistant Areas or create custom rooms
- **Room Icons**: Visual icons for easy identification
- **Room-based Organization**: Filter and organize chores by location
- **Mixed Room Types**: Seamlessly combine HA Areas with custom spaces

### **Advanced Chore Management**
- **Flexible Frequencies**: Once (one-time), daily, weekly, bi-weekly, monthly, bi-monthly, quarterly, bi-annual, and yearly scheduling
- **One-Off Chores**: Create single-occurrence tasks that are marked complete permanently
- **Rolling 7-Day View**: Dynamic "Due in Next 7 Days" instead of static weekly view
- **Smart Auto-reschedule**: Automatically calculate and schedule next occurrence
- **Due Date Override**: Set custom start dates for any chore
- **Snooze Feature**: Postpone any chore by 1 day without skipping
- **Bulk Management**: "All Active Chores" modal for comprehensive oversight

### **Advanced Recurrence System**
- **Interval-Based**: Traditional recurrence from completion date (e.g., "every 2 weeks from when I finish")
- **Anchored Recurrence**: Fixed schedule patterns that don't drift
  - **Weekly Anchored**: Specific days of week (e.g., "every Monday and Thursday")
  - **Monthly Anchored**: Day of month (e.g., "15th of every month") or week pattern (e.g., "2nd Tuesday of every month")
  - **Custom Intervals**: Multiply any frequency (e.g., "every 3 months" or "every 2 weeks")

### **User Management**
- **Home Assistant Users**: Automatically detects HA users for assignment
- **Custom Users**: Create users without HA accounts (perfect for family members without logins)
- **Pre-assignment**: Assign chores to specific users before they're due
- **Completion Attribution**: Track who actually completed each chore
- **Smart Completion Modal**: Select completion user and optionally reassign for next time
- **Shared Device Support**: Perfect for shared tablets/displays with central login
- **Flexible Reassignment**: Change assignments during completion workflow

### **Comprehensive Tracking**
- **Real-time Sensors**: Due today, next 7 days, overdue, and total counts
- **Completion History**: Full audit trail of who completed what and when
- **User Statistics**: Performance tracking per user
- **Assignment Display**: See who's assigned to each chore in all views

### **Smart Notifications**
- **Configurable Timing**: Choose when to be notified - day of, 1 day before, 2 days before, 3 days before, or 1 week before
- **Multiple Notification Days**: Get reminded on multiple days (e.g., 1 week before AND day of)
- **Targeted Notifications**: Assigned chores notify the assigned user's mobile app
- **Broadcast Notifications**: Unassigned chores notify all configured targets
- **Daily Summaries**: Push notifications with chore details and room info
- **Multi-device Support**: Target specific mobile devices

### **Calendar Integration**
- **Visual Calendar**: See all scheduled chores in Home Assistant calendar
- **Timeline View**: Plan ahead with future due dates
- **Calendar Events**: Each chore creates calendar entries with room and frequency info
- **Edit from Calendar**: Click calendar events to edit chore details

### **Modern UI & UX**
- **Custom Lovelace Card**: Beautiful, responsive interface
- **Calendar View**: Visual calendar with agenda sidebar
- **Modal-based Workflows**: Clean, focused editing experiences
- **Form Validation**: Intelligent input validation with helpful messages
- **Performance Optimized**: Caching system for fast loading
- **Intuitive Design**: Easy-to-use interface for all family members

## Installation

### HACS (Recommended)

1. Make sure [HACS](https://hacs.xyz/) is installed
2. Add this repository as a custom repository in HACS:
   - Go to HACS → Integrations → ⋮ (three dots) → Custom repositories
   - Add URL: `https://github.com/darthmario/simple-chores`
   - Category: Integration
3. Click "Install"
4. Restart Home Assistant
5. Go to Settings → Devices & Services → Add Integration → "Simple Chores"

### Manual Installation

1. Download the `custom_components/simple_chores` folder
2. Copy it to your `config/custom_components/` directory
3. Restart Home Assistant
4. Go to Settings → Devices & Services → Add Integration → "Simple Chores"

## Configuration

During setup, you can configure:

- **Enable notifications**: Get daily push notifications for due chores
- **Notification time**: When to send the daily notification (default: 8:00 AM)

After setup, in integration options you can also configure:

- **Notification days**: When to notify - day of, 1/2/3 days before, or 1 week before (can select multiple)
- **Notify targets**: Which mobile devices should receive notifications

## Entities

The integration creates the following entities:

| Entity | Type | Description |
|--------|------|-------------|
| `sensor.chores_due_today` | Sensor | Count of chores due today |
| `sensor.chores_due_next_7_days` | Sensor | Count of chores due in next 7 days (rolling) |
| `sensor.overdue_chores` | Sensor | Count of overdue chores |
| `sensor.total_chores` | Sensor | Total number of active chores |
| `binary_sensor.simple_chores_has_overdue` | Binary Sensor | True if any overdue chores |
| `calendar.simple_chores` | Calendar | Calendar view of all chores |

> **Note:** Sensor entity IDs are defined in `const.py` and used consistently by both the backend and the Lovelace card.

## Services

### Room Services

#### `simple_chores.add_room`
Create a custom room for organizing chores.

```yaml
service: simple_chores.add_room
data:
  name: "Garage"
  icon: "mdi:garage"
```

#### `simple_chores.update_room`
Update a custom room's details.

```yaml
service: simple_chores.update_room
data:
  room_id: "custom_abc123"
  name: "Workshop"
  icon: "mdi:tools"
```

#### `simple_chores.remove_room`
Delete a custom room (also removes all chores in that room).

```yaml
service: simple_chores.remove_room
data:
  room_id: "custom_abc123"
```

### User Services

#### `simple_chores.add_user`
Create a custom user (no Home Assistant login required).

```yaml
service: simple_chores.add_user
data:
  name: "Kids"
  avatar: "mdi:account-child"
```

#### `simple_chores.update_user`
Update a custom user's details.

```yaml
service: simple_chores.update_user
data:
  user_id: "custom_user_abc123"
  name: "Children"
  avatar: "mdi:account-group"
```

#### `simple_chores.remove_user`
Delete a custom user.

```yaml
service: simple_chores.remove_user
data:
  user_id: "custom_user_abc123"
```

### Chore Services

#### `simple_chores.add_chore`
Create a new chore with optional user assignment and advanced recurrence.

```yaml
# Simple interval-based chore
service: simple_chores.add_chore
data:
  name: "Clean counters"
  room_id: "area_kitchen"
  frequency: "weekly"
  start_date: "2024-01-15"
  assigned_to: "user-uuid"

# One-off chore (single occurrence)
service: simple_chores.add_chore
data:
  name: "Replace smoke detector batteries"
  room_id: "area_hallway"
  frequency: "once"

# Anchored weekly - specific days
service: simple_chores.add_chore
data:
  name: "Take out trash"
  room_id: "area_kitchen"
  frequency: "weekly"
  recurrence_type: "anchored"
  anchor_days_of_week: [1, 4]  # Monday and Thursday (0=Sunday)

# Anchored monthly - day of month
service: simple_chores.add_chore
data:
  name: "Pay rent"
  room_id: "custom_office"
  frequency: "monthly"
  recurrence_type: "anchored"
  anchor_type: "day_of_month"
  anchor_day_of_month: 1

# Anchored monthly - week pattern
service: simple_chores.add_chore
data:
  name: "Team meeting prep"
  room_id: "custom_office"
  frequency: "monthly"
  recurrence_type: "anchored"
  anchor_type: "week_pattern"
  anchor_week: 2  # 2nd week (1-4, or 5 for last)
  anchor_weekday: 2  # Tuesday (0=Sunday)
```

#### `simple_chores.update_chore`
Update an existing chore's details.

```yaml
service: simple_chores.update_chore
data:
  chore_id: "abc123"
  name: "Deep clean counters"
  room_id: "area_kitchen"
  frequency: "monthly"
  next_due: "2024-02-01"
  assigned_to: "user-uuid"  # Use null to unassign
  recurrence_type: "anchored"
  anchor_type: "day_of_month"
  anchor_day_of_month: 15
```

#### `simple_chores.complete_chore`
Mark a chore as completed and schedule the next occurrence.

```yaml
service: simple_chores.complete_chore
data:
  chore_id: "abc123"
  user_id: "user-uuid"  # Optional, defaults to current user
```

#### `simple_chores.skip_chore`
Skip a chore to the next occurrence without marking complete.

```yaml
service: simple_chores.skip_chore
data:
  chore_id: "abc123"
```

#### `simple_chores.snooze_chore`
Postpone a chore by 1 day without marking complete.

```yaml
service: simple_chores.snooze_chore
data:
  chore_id: "abc123"
```

#### `simple_chores.remove_chore`
Delete a chore.

```yaml
service: simple_chores.remove_chore
data:
  chore_id: "abc123"
```

### Data Services

#### `simple_chores.get_history`
Get completion history for a specific chore.

```yaml
service: simple_chores.get_history
data:
  chore_id: "abc123"
```

#### `simple_chores.get_user_stats`
Get completion statistics for all users.

```yaml
service: simple_chores.get_user_stats
```

#### `simple_chores.send_due_notification`
Manually trigger a notification with chores due today.

```yaml
service: simple_chores.send_due_notification
```

## Custom Lovelace Card

A beautiful custom card is **automatically installed** with the integration!

### Easy Installation

1. **Install the integration** (via HACS or manually)
2. **Restart Home Assistant**
3. **Add the resource** (one-time setup):
   - Go to **Settings** → **Dashboards** → **Resources** (⋮ menu)
   - Click **"+ Add Resource"**
   - **URL**: `/local/community/simple_chores/simple-chores-card.js`
   - **Resource Type**: **JavaScript Module**
   - Click **"Create"**
4. **Add the card** using either method:

   **Method A: Visual Picker**
   - Edit any dashboard → Add Card
   - Search for "**Simple Chores Card**" in the picker
   - Click to add automatically!

   **Method B: Manual YAML**
   ```yaml
   type: custom:simple-chores-card
   title: "Family Chores"
   default_view: calendar
   full_width: true
   compact_mode: false
   hide_stats: false
   my_chores_default: false
   show_completed: false
   ```

### Card Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `title` | string | `"Simple Chores"` | Custom card title |
| `default_view` | string | `"list"` | Default view: `"list"` or `"calendar"` |
| `full_width` | boolean | `false` | Make card span full column width |
| `compact_mode` | boolean | `false` | Reduced padding for smaller displays |
| `hide_stats` | boolean | `false` | Hide the stats bar |
| `my_chores_default` | boolean | `false` | Start with "My Chores" filter enabled |
| `show_completed` | boolean | `false` | Show completed one-off chores |
| `default_room` | string | `"all"` | Default room filter on load |

### Card Features

#### **Smart Views**
- **List View**: Traditional list grouped by due date
- **Calendar View**: Monthly calendar with agenda sidebar
- **Due Today**: Immediate action items with urgency indicators
- **Due in Next 7 Days**: Rolling 7-day lookahead for planning
- **All Active Chores**: Comprehensive modal with all chores and actions
- **Room Filtering**: Focus on specific areas of your home
- **My Chores Filter**: Show only chores assigned to current user

#### **Quick Actions**
- **Complete**: Mark chores done with user attribution
- **Skip**: Move to next occurrence without completing
- **Snooze**: Postpone by 1 day
- **Edit**: Inline editing with pre-populated forms
- **Delete**: Remove chores with confirmation

#### **Calendar Features**
- **Month Navigation**: Browse past and future months
- **Due Date Indicators**: Visual dots showing chores due on each day
- **Agenda Sidebar**: List of chores due on selected date
- **Click to Edit**: Select calendar events to edit chore details

### Automatic Cache Busting

The card automatically busts the browser cache when you update to a new version. The integration appends the version number to the resource URL (e.g., `?v=1.0.0`).

**Manual cache clearing (if needed):**
- **Browser**: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
- **iOS App**: Settings → Companion App → Debugging → Reset frontend cache
- **Android App**: App Info → Storage → Clear Cache

## Room Types

The integration supports two types of rooms:

1. **Home Assistant Areas**: Automatically detected from your HA setup
2. **Custom Rooms**: Create additional rooms via service or Lovelace card

When adding a chore, you can assign it to either type:
- HA Areas: Use `area_<area_id>` (e.g., `area_kitchen`)
- Custom rooms: Use the room ID returned when creating (e.g., `custom_abc123`)

## Recurrence Types Explained

### Interval-Based (Default)
The next due date is calculated from when you complete the chore.

- Complete a weekly chore on Wednesday → next due is next Wednesday
- Complete a monthly chore on the 10th → next due is the 10th of next month

**Best for**: Chores where timing is flexible and regularity matters more than specific days.

### Anchored Recurrence
The due dates follow a fixed schedule regardless of when you complete.

**Weekly Anchored**: Specific days of the week
- "Every Monday and Thursday" stays Monday and Thursday even if you complete late

**Monthly Anchored - Day of Month**: Specific day each month
- "Every 15th" stays the 15th even if you complete on the 20th

**Monthly Anchored - Week Pattern**: Specific weekday pattern
- "2nd Tuesday of every month" follows that pattern consistently

**Best for**: Chores tied to specific schedules (trash day, rent, recurring appointments).

## Automations

You can create automations based on the sensor states:

```yaml
automation:
  - alias: "Notify overdue chores"
    trigger:
      - platform: state
        entity_id: binary_sensor.simple_chores_has_overdue
        to: "on"
    action:
      - service: notify.mobile_app_phone
        data:
          title: "Overdue Chores!"
          message: "You have {{ states('sensor.overdue_chores') }} overdue chore(s)"

  - alias: "Weekly chore summary"
    trigger:
      - platform: time
        at: "09:00:00"
    condition:
      - condition: time
        weekday:
          - sun
    action:
      - service: notify.mobile_app_phone
        data:
          title: "Weekly Chore Summary"
          message: >
            This week: {{ states('sensor.chores_due_next_7_days') }} chores due.
            {{ states('sensor.overdue_chores') }} overdue.
```

## Contributing

### Development Setup

1. Clone the repository
2. Install dev dependencies:
   ```bash
   pip install -r requirements_dev.txt
   ```
3. Set up pre-commit hooks:
   ```bash
   pip install pre-commit
   pre-commit install
   ```

### Running Tests

```bash
# Run all tests
pytest tests/ -v

# Run with coverage
pytest tests/ --cov=custom_components/simple_chores --cov-report=term-missing
```

### Code Quality

```bash
# Lint code
ruff check custom_components/simple_chores

# Format code
ruff format custom_components/simple_chores

# Type check
mypy custom_components/simple_chores
```

### Branch Protection

This repository uses branch protection on `main`. All PRs must pass:

- **CI** - Linting (ruff), type checking (mypy), and tests (pytest)
- **Hassfest Validation** - Home Assistant manifest requirements

## License

MIT License - see [LICENSE](LICENSE) for details.
