# Simple Chores

A comprehensive Home Assistant custom integration for tracking household chores with advanced room organization, flexible scheduling, user assignment & attribution, and intelligent automation.

[![CI](https://github.com/darthmario/simple-chores/actions/workflows/ci.yaml/badge.svg)](https://github.com/darthmario/simple-chores/actions/workflows/ci.yaml)
[![HACS Validation](https://github.com/darthmario/simple-chores/actions/workflows/hacs.yaml/badge.svg)](https://github.com/darthmario/simple-chores/actions/workflows/hacs.yaml)
[![Hassfest Validation](https://github.com/darthmario/simple-chores/actions/workflows/hassfest.yaml/badge.svg)](https://github.com/darthmario/simple-chores/actions/workflows/hassfest.yaml)

## Features

### 🏠 **Room Management**
- **Dual Room System**: Use existing Home Assistant Areas or create custom rooms
- **Room Icons**: Visual icons for easy identification
- **Room-based Organization**: Filter and organize chores by location
- **Mixed Room Types**: Seamlessly combine HA Areas with custom spaces

### 📋 **Advanced Chore Management**
- **Flexible Frequencies**: Daily, weekly, monthly, quarterly, yearly scheduling
- **Rolling 7-Day View**: Dynamic "Due in Next 7 Days" instead of static weekly view
- **Smart Auto-reschedule**: Automatically calculate and schedule next occurrence
- **Due Date Override**: Set custom start dates for any chore
- **Bulk Management**: "All Active Chores" modal for comprehensive oversight

### 👥 **User Assignment & Attribution**
- **Pre-assignment**: Assign chores to specific users before they're due
- **Completion Attribution**: Track who actually completed each chore
- **Smart Completion Modal**: Select completion user and optionally reassign for next time
- **Shared Device Support**: Perfect for shared tablets/displays with central login
- **User Detection**: Automatically detects current Home Assistant user as default
- **Flexible Reassignment**: Change assignments during completion workflow

### 📊 **Comprehensive Tracking**
- **Real-time Sensors**: Due today, next 7 days, overdue, and total counts
- **Completion History**: Full audit trail of who completed what and when
- **User Statistics**: Performance tracking per user
- **Assignment Display**: See who's assigned to each chore in all views

### 🔔 **Smart Notifications**
- **Daily Summaries**: Push notifications with chore details and room info
- **Configurable Timing**: Set notification time to your preference
- **Multi-device Support**: Target specific mobile devices
- **Urgency Indicators**: Distinguish between due and overdue tasks

### 📅 **Calendar Integration**
- **Visual Calendar**: See all scheduled chores in Home Assistant calendar
- **Timeline View**: Plan ahead with future due dates
- **Calendar Events**: Each chore creates calendar entries

### 🎨 **Modern UI & UX**
- **Custom Lovelace Card**: Beautiful, responsive interface
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
- **Notify targets**: Which mobile devices should receive notifications

These can be changed later in the integration options.

## Entities

The integration creates the following entities:

| Entity | Type | Description |
|--------|------|-------------|
| `sensor.chores_due_today` | Sensor | Count of chores due today |
| `sensor.chores_due_next_7_days` | Sensor | Count of chores due in next 7 days (rolling) |
| `sensor.overdue_chores` | Sensor | Count of overdue chores |
| `sensor.total_chores` | Sensor | Total number of chores |
| `binary_sensor.simple_chores_has_overdue` | Binary Sensor | True if any overdue chores |
| `calendar.simple_chores` | Calendar | Calendar view of all chores |

> **Note:** Sensor entity IDs are defined in `const.py` and used consistently by both the backend and the Lovelace card.

## Services

### `simple_chores.add_room`
Create a custom room for organizing chores.

```yaml
service: simple_chores.add_room
data:
  name: "Garage"
  icon: "mdi:garage"
```

### `simple_chores.add_chore`
Create a new chore with optional user assignment.

```yaml
service: simple_chores.add_chore
data:
  name: "Clean counters"
  room_id: "area_kitchen"  # Use HA Area ID or custom room ID
  frequency: "weekly"
  start_date: "2024-01-15"  # Optional, defaults to today
  assigned_to: "user-uuid"  # Optional, assign to specific user
```

### `simple_chores.complete_chore`
Mark a chore as completed and schedule the next occurrence.

```yaml
service: simple_chores.complete_chore
data:
  chore_id: "abc123"
  user_id: "user-uuid"  # Optional, defaults to current user
```

### `simple_chores.update_chore`
Update an existing chore's details, including reassignment.

```yaml
service: simple_chores.update_chore
data:
  chore_id: "abc123"
  name: "Deep clean counters"  # Optional
  room_id: "area_kitchen"      # Optional
  frequency: "monthly"         # Optional
  next_due: "2024-02-01"       # Optional
  assigned_to: "user-uuid"     # Optional, use null to unassign
```

### `simple_chores.skip_chore`
Skip a chore to the next occurrence without marking complete.

```yaml
service: simple_chores.skip_chore
data:
  chore_id: "abc123"
```

### `simple_chores.send_due_notification`
Manually trigger a notification with chores due today.

```yaml
service: simple_chores.send_due_notification
```

## Custom Lovelace Card

A beautiful custom card is **completely automatically installed** with the integration! 🎉

### ✨ Easy Installation with Automatic File Setup

The Simple Chores card is **automatically copied to the correct location** when you install the integration!

1. **Install the integration** (via HACS or manually)
2. **Restart Home Assistant** 
3. **Add the resource** (one-time setup):
   - Go to **Settings** → **Dashboards** → **Resources** (⋮ menu)
   - Click **"+ Add Resource"**
   - **URL**: `/local/community/simple-chores/simple-chores-card.js`
   - **Resource Type**: **JavaScript Module**
   - Click **"Create"**
4. **Add the card** using either method:

   **Method A: Visual Picker** 🎨
   - Edit any dashboard → Add Card
   - Search for "**Simple Chores Card**" in the picker
   - Click to add automatically!

   **Method B: Manual YAML** ⌨️
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
| `title` | string | `"Simple Chores"` | Custom card title (e.g., "Family Tasks", "House Chores") |
| `default_view` | string | `"list"` | Default view on load: `"list"` or `"calendar"` |
| `full_width` | boolean | `false` | Make card span full column width (great for calendar view) |
| `compact_mode` | boolean | `false` | Reduced padding/spacing for smaller displays or sidebars |
| `hide_stats` | boolean | `false` | Hide the stats bar (Due Today, Overdue, Total counts) |
| `my_chores_default` | boolean | `false` | Start with "My Chores" filter enabled |
| `show_completed` | boolean | `false` | Show completed one-off chores |
| `default_room` | string | `"all"` | Default room filter on load |

#### Display Modes

**Full Width Mode**: Set `full_width: true` to make the card span the entire width of your dashboard column. Perfect for the calendar view.

**Compact Mode**: Set `compact_mode: true` to reduce padding and spacing throughout the card. Ideal for sidebar placements or smaller dashboard panels.

**Calendar Default**: Set `default_view: "calendar"` to open the card in calendar view by default, great for planning ahead.

### 🔄 Automatic Cache Busting

The card automatically busts the browser cache when you update to a new version via HACS. The integration appends the version number to the resource URL (e.g., `?v=1.0.0`), so when you update, browsers fetch the new version automatically.

**Manual cache clearing (if needed):**
- **Browser**: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
- **iOS App**: Settings → Companion App → Debugging → Reset frontend cache
- **Android App**: App Info → Storage → Clear Cache

### 🔧 Manual Installation (Alternative Method)

If you prefer to copy the file manually:

1. **Check the logs** - the integration will tell you if manual setup is needed
2. **Copy the card file**:
   ```bash
   mkdir -p /config/www/community/simple-chores
   cp /config/custom_components/simple_chores/www/simple-chores-card.js /config/www/community/simple-chores/
   ```
3. **Add the resource manually**:
   - Go to **Settings** → **Dashboards** → **Resources** (⋮ menu)  
   - Add: `/local/community/simple-chores/simple-chores-card.js` (JavaScript Module)
4. **Add the card** as shown above

### 📁 Alternative Method (Non-HACS)

If you prefer the simple approach:
1. Copy `custom_components/simple_chores/www/simple-chores-card.js` to your `www` folder
2. Add resource: `/local/simple-chores-card.js`

### Card Features

#### 📊 **Smart Views**
- **Due Today**: Immediate action items with urgency indicators
- **Due in Next 7 Days**: Rolling 7-day lookahead for planning
- **All Active Chores**: Comprehensive modal with all chores and actions
- **Room Filtering**: Focus on specific areas of your home

#### ⚡ **Quick Actions**
- **Smart Complete**: Modal workflow to select who completed and optionally reassign
- **Inline Edit**: Direct editing of chore details with pre-populated forms
- **Skip to Next**: Move chores to next occurrence without marking complete
- **Bulk Management**: Manage multiple chores from unified interface

#### 👥 **User Management**
- **Assignment Display**: See who's responsible for each chore
- **User Selection**: Choose completion user on shared devices
- **Flexible Reassignment**: Change assignments during completion
- **Auto-detection**: Automatically selects current user as default

#### 🎨 **Enhanced UX**
- **Unified Form System**: Consistent, validated input handling
- **Performance Caching**: Fast loading with intelligent data caching
- **Modal Workflows**: Clean, focused editing experiences
- **Error Handling**: Helpful validation messages and error recovery
- **Room Name Resolution**: Intelligent room ID to name mapping
- **Keyboard Navigation**: Full keyboard support with ESC to close, Enter to submit
- **Accessibility**: Complete ARIA labels and screen reader support
- **Loading States**: Visual feedback during all async operations

## Room Types

The integration supports two types of rooms:

1. **Home Assistant Areas**: Automatically detected from your HA setup. No configuration needed.
2. **Custom Rooms**: Create additional rooms via the service or Lovelace card.

When adding a chore, you can assign it to either type:
- HA Areas: Use `area_<area_id>` (e.g., `area_kitchen`)
- Custom rooms: Use the room ID returned when creating (e.g., `custom_abc123`)

## Smart Completion Workflow

The Simple Chores integration features an intelligent completion system designed for households with shared devices and multiple users:

### 🎢 **Completion Modal**
When you click "✓ Complete" on any chore:

1. **Smart User Detection**: Automatically detects and pre-selects the current Home Assistant user
2. **Flexible Attribution**: Choose who actually completed the chore (perfect for shared tablets/displays)
3. **Optional Reassignment**: Optionally change who the chore is assigned to for next time
4. **Clear Validation**: Ensures proper completion attribution with helpful error messages

### 👥 **Perfect for Shared Households**
- **Shared Displays**: Family members can properly credit who did the work
- **Central Login**: Works great with one HA account used by multiple people
- **Flexible Workflows**: Assign chores to one person, but allow anyone to complete them
- **Accurate History**: Maintain proper completion records for all family members

### ⚡ **Example Workflows**

**Scenario 1: Assigned Chore**
- Chore assigned to "Alice"
- Bob completes it using shared tablet
- Modal opens → Bob selects himself as completer
- Optionally reassigns to "Charlie" for next occurrence

**Scenario 2: Unassigned Chore**
- Chore has no specific assignment
- Anyone can complete it
- Current user automatically selected
- Can assign to specific person for next time

**Scenario 3: Quick Personal Use**
- Alice using her own device
- Completes her assigned chore
- Modal auto-selects Alice, keeps assignment the same
- One-click completion with smart defaults

## Assignment System

The integration provides a comprehensive user assignment system:

### 🎡 **Assignment Types**
- **Pre-assignment**: Assign chores to users when creating or editing
- **Completion Attribution**: Track who actually completed each chore
- **Flexible Reassignment**: Change assignments during completion or editing

### 📊 **User Data Sources**
The integration intelligently sources user information from:
1. **Integration Sensors**: Custom user lists from sensor attributes
2. **Home Assistant Users**: Fallback to HA person entities
3. **Default Fallback**: Basic user entries for system reliability

### 📈 **Performance Features**
- **Smart Caching**: User and room data cached for improved performance
- **Efficient Lookups**: Optimized room name resolution
- **Real-time Updates**: Changes reflect immediately across all interfaces

## Notifications

The integration can send daily push notifications to your mobile devices via the Home Assistant Companion App.

Notifications include:
- **Detailed Chore List**: Each chore with room and assignment info
- **Urgency Indicators**: Visual distinction between due and overdue
- **User Assignments**: See who's responsible for each task
- **Interactive Actions**: Tap to open Home Assistant for quick completion
- **Smart Summaries**: Concise but informative daily overviews

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
          message: "You have {{ states('sensor.simple_chores_overdue') }} overdue chore(s)"
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
- **HACS Validation** - HACS integration requirements
- **Hassfest Validation** - Home Assistant manifest requirements

#### Setting Up Branch Protection (Maintainers)

1. Go to **Settings** → **Branches** → **Add branch protection rule**
2. Branch name pattern: `main`
3. Enable:
   - ✅ Require a pull request before merging
   - ✅ Require status checks to pass before merging
   - ✅ Require branches to be up to date before merging
4. Add required status checks:
   - `Lint`
   - `Type Check`
   - `Test`
   - `HACS Validation`
   - `Hassfest Validation`
5. Click **Create** or **Save changes**

## License

MIT License - see [LICENSE](LICENSE) for details.
