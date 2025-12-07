# Simple Chores

A Home Assistant custom integration for tracking simple chores with room organization, multiple frequencies, user attribution, and automatic rescheduling.

[![HACS Validation](https://github.com/darthmario/simple-chores/actions/workflows/hacs.yaml/badge.svg)](https://github.com/darthmario/simple-chores/actions/workflows/hacs.yaml)
[![Hassfest Validation](https://github.com/darthmario/simple-chores/actions/workflows/hassfest.yaml/badge.svg)](https://github.com/darthmario/simple-chores/actions/workflows/hassfest.yaml)

## Features

- **Rooms**: Use existing Home Assistant Areas or create custom rooms
- **Chores**: Assign chores to rooms with configurable frequencies
- **Frequencies**: Daily, weekly, monthly, quarterly, yearly
- **Weekly View**: See chores due this week (Sunday start)
- **Auto-reschedule**: When marked complete, automatically schedule next occurrence
- **User Attribution**: Track who completed each chore (defaults to logged-in user)
- **Completion History**: Full history of who completed what and when
- **Notifications**: Push notifications when tasks are due (works with HA mobile apps)
- **Calendar**: Visual calendar view of scheduled chores
- **Custom Lovelace Card**: Beautiful UI for managing and completing chores

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
| `sensor.simple_chores_due_today` | Sensor | Count of chores due today |
| `sensor.simple_chores_due_this_week` | Sensor | Count of chores due this week |
| `sensor.simple_chores_overdue` | Sensor | Count of overdue chores |
| `sensor.simple_chores_total` | Sensor | Total number of chores |
| `binary_sensor.simple_chores_has_overdue` | Binary Sensor | True if any overdue chores |
| `calendar.simple_chores` | Calendar | Calendar view of all chores |

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
Create a new chore.

```yaml
service: simple_chores.add_chore
data:
  name: "Clean counters"
  room_id: "area_kitchen"  # Use HA Area ID or custom room ID
  frequency: "weekly"
  start_date: "2024-01-15"  # Optional, defaults to today
```

### `simple_chores.complete_chore`
Mark a chore as completed and schedule the next occurrence.

```yaml
service: simple_chores.complete_chore
data:
  chore_id: "abc123"
  user_id: "user-uuid"  # Optional, defaults to current user
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

### ✨ Fully Automatic Installation

The Simple Chores card is **automatically loaded** when you install the integration. No manual steps required!

1. **Install the integration** (via HACS or manually)
2. **Restart Home Assistant** 
3. **Add the card** using either method:

   **Method A: Visual Picker** 🎨
   - Edit any dashboard → Add Card
   - Search for "**Simple Chores Card**" in the picker
   - Click to add automatically!

   **Method B: Manual YAML** ⌨️
   ```yaml
   type: custom:simple-chores-card
   show_completed: false
   default_room: all
   ```

**That's it!** The card appears in the visual card picker just like built-in cards.

### 🔧 Manual Installation (Fallback)

If automatic registration doesn't work on your Home Assistant version:

1. **Check the logs** - the integration will tell you if manual setup is needed
2. **Add the resource manually**:
   - Go to **Settings** → **Dashboards** → **Resources** (⋮ menu)  
   - Add: `/simple_chores/simple-chores-card.js` (JavaScript Module)
3. **Add the card** as shown above

### 📁 Copy Method (Last Resort)

If neither method works:
1. Copy `custom_components/simple_chores/www/simple-chores-card.js` to your `www` folder
2. Add resource: `/local/simple-chores-card.js`

### Card Features

- Weekly view with chores grouped by day
- Room filtering
- Quick complete via checkbox
- User selector for attribution on shared devices
- Add chore/room forms
- Overdue highlighting
- Skip to next occurrence

## Room Types

The integration supports two types of rooms:

1. **Home Assistant Areas**: Automatically detected from your HA setup. No configuration needed.
2. **Custom Rooms**: Create additional rooms via the service or Lovelace card.

When adding a chore, you can assign it to either type:
- HA Areas: Use `area_<area_id>` (e.g., `area_kitchen`)
- Custom rooms: Use the room ID returned when creating (e.g., `custom_abc123`)

## Notifications

The integration can send daily push notifications to your mobile devices via the Home Assistant Companion App.

Notifications include:
- List of chores due today
- Room information for each chore
- Tap to open Home Assistant

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

## License

MIT License - see [LICENSE](LICENSE) for details.
