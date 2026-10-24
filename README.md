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

### **Focus View (ADHD-friendly "chore book")**
- **One at a Time**: A deck showing a single chore, so the list can't overwhelm you
- **Time Budget**: "I have 5 minutes" chips filter to chores that actually fit
- **Shuffle**: A dice button picks one for you when deciding is the hard part
- **Micro-Steps**: Break a chore into small steps and tick them off; progress is shared across devices
- **Built-in Timer**: Tap the time chip to start a countdown on the card
- **Visible Reward**: Confetti on completion, a "done today" bar, and a daily streak
- **Board Layout**: Grid of large touch targets for a shared wall display

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

### How the card gets its data

State attributes are pushed to every connected client on every update, and
Home Assistant caps them at 16 KB. Anything that grows with the number of
chores or completions is therefore served over the websocket instead, and the
sensors carry only fixed-size data:

| | where it lives |
|---|---|
| Counts, rooms, users | state attributes |
| Completion statistics | `statistics` attribute — fixed size (~1.6 KB) |
| Change signal | `revision` attribute — a digest of the chore data |
| The chore list | `simple_chores/chores` websocket command |
| Raw completion history | `simple_chores/history` websocket command |

`sensor.total_chores` is about **1.9 KB regardless of how many chores or
completions you have**. The card fetches the chore list once, then re-fetches
only when `revision` changes.

#### `simple_chores/chores` (websocket)

```js
const data = await hass.callWS({ type: "simple_chores/chores" });
// { revision, chores: [...], due_today: [id], due_this_week: [id],
//   overdue: [id], today, seven_days_from_today }
```

Due windows come back as ID lists rather than repeated chore objects — an
overdue chore appears in three of them, and duplicating the full record three
times is what made this data too large in the first place. Categorising
server-side also keeps a single definition of "due today".

#### `simple_chores/history` (websocket)

```js
const { history, count } = await hass.callWS({
  type: "simple_chores/history",
  limit: 300,   // optional, defaults to EXPOSED_HISTORY_ENTRIES
});
```

Recent completions, newest first, capped by `EXPOSED_HISTORY_ENTRIES` /
`EXPOSED_HISTORY_DAYS` in `const.py`. Storage keeps the full
`MAX_HISTORY_ENTRIES` (1000). Only the calendar and the history modal fetch
this.

#### Rendering at scale

The list view, the All Chores modal and the focus board all page rather than
rendering every chore at once (`DEFAULT_CHORE_LIMIT`, `FOCUS_BOARD_LIMIT` in
the card), so a large chore list doesn't put hundreds of card subtrees on a
wall display.


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

#### `simple_chores.undo_completion`
Reverse a completion marked by mistake. The history entry is removed and the chore goes
back to where it was: due date, checklist progress and one-off flag are restored from a
snapshot saved at completion time, so statistics, streaks and anything derived from
history stay honest. Pass a `history_id` (from the history websocket) or a `chore_id`, in
which case the newest completion of that chore is undone.

```yaml
service: simple_chores.undo_completion
data:
  chore_id: "abc123"
```

The card offers Undo on a toast for ten seconds after every completion, and on entries
from the last 24 hours in the history modal.

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

#### `simple_chores.toggle_chore_step`
Tick or untick one micro-step on a chore. Progress is stored server-side, so a chore
started on a phone shows the same state on the wall display.

```yaml
service: simple_chores.toggle_chore_step
data:
  chore_id: "abc123"
  step_index: 0        # counting from 0
  completed: true      # optional; omit to flip the current value
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
| `default_view` | string | `"list"` | Default view: `"list"`, `"calendar"` or `"focus"` |
| `focus_layout` | string | `"auto"` | Focus view layout: `"auto"`, `"deck"` (one at a time) or `"board"` (grid) |
| `full_width` | boolean | `false` | Make card span full column width |
| `compact_mode` | boolean | `false` | Reduced padding for smaller displays |
| `hide_stats` | boolean | `false` | Hide the stats bar |
| `transparent` | boolean | `false` | Drop the card's own background so a themed scene shows through; rows, tiles and controls float as translucent paper. Meant for a panel dashboard |
| `my_chores_default` | boolean | `false` | Start with "My Chores" filter enabled |
| `show_completed` | boolean | `false` | Show completed one-off chores |
| `default_room` | string | `"all"` | Default room filter on load |

### Card Features

#### **Smart Views**
- **List View**: Traditional list grouped by due date
- **Calendar View**: Monthly calendar with agenda sidebar
- **Focus View**: One chore at a time (deck) or a grid of big cards (board)
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

### Focus View

The focus view is built for the times when a list of chores is the problem rather
than the solution. It shows what's due now (overdue chores included), most overdue
first, then quickest first.

**Layouts** — `deck` shows one chore at a time with Later / Skip / Done buttons and
swipe support (right to finish, left for later). `board` shows every chore as a grid
of large touch targets. With `focus_layout: auto` the card picks based on its own
width: deck under 500px, board above.

**Time budget** — the chip row filters to chores that fit the time you have. Chores
without a time estimate are deliberately excluded from a budget, since an unmeasured
chore can't be promised to fit in five minutes. Any card missing an estimate shows a
**How long?** button that saves one in a tap, so estimates fill in as you use it.

**Micro-steps** — add up to 12 short steps to a chore and they render as a checklist
with a progress bar. Ticks are saved to the backend, so a chore started on one phone
shows as part-done on the display. Progress resets when the chore is completed or
skipped, but survives a snooze.

Steps show up outside the focus view too. List rows (and the All Chores modal) carry a
`2/5 steps` chip that opens the same checklist inline; a checklist opens by itself once any
step is ticked and stays collapsed until then. The Complete Chore modal lists the steps with
their ticks so you can see what was done before you mark the whole chore complete, and the
calendar agenda shows the count.

**Setting it up for a wall display:**

```yaml
type: custom:simple-chores-card
title: Family Chores
full_width: true
default_view: focus
focus_layout: board
```

A ready-made panel dashboard is in [`dashboards/chores-display.yaml`](dashboards/chores-display.yaml).

### Theming

The card has no colours of its own. Everything resolves from the active Home Assistant
theme (`primary-color`, `success-color`, `error-color`, `card-background-color`,
`ha-font-family-heading` and friends), so a themed dashboard restyles the card with no
card config. On a stock theme it falls back to a warm paper look. The bundled chores
dashboard sets `theme: Headwaters Scene`, which paints an illustrated landscape, and
`transparent: true` on the card so the landscape shows between the rows rather than
behind one big cream card. A theme that sets `success-color` and `error-color` also
recolours the done and overdue states.

Add time estimates and steps from the normal Add / Edit Chore forms, or via
`add_chore` / `update_chore`:

```yaml
service: simple_chores.add_chore
data:
  name: "Load the dishwasher"
  room_id: "area_kitchen"
  frequency: "daily"
  estimated_minutes: 5
  steps:
    - "Clear the counter"
    - "Rinse and load"
    - "Start it"
```

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

# Run the Lovelace card tests (no dependencies beyond Node)
node tests/js/focus-view.test.mjs
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
