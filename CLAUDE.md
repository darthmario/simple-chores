# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Home Assistant custom integration called "Simple Chores" that helps users track and manage household chores with room organization, multiple frequencies, user attribution, and automatic rescheduling.

## Development and Testing Commands

Since this is a Home Assistant custom integration (Python-based), there are no build commands. Testing is done by:

1. **Local testing in Home Assistant**:
   ```bash
   # Copy integration to HA config directory
   cp -r custom_components/simple_chores /path/to/homeassistant/config/custom_components/
   
   # Copy Lovelace card to www folder
   cp household-tasks-card/household-tasks-card.js /path/to/homeassistant/config/www/
   
   # Restart Home Assistant and add integration via UI
   ```

2. **Test services in HA Developer Tools → Services**:
   ```yaml
   # Example service calls
   service: simple_chores.add_room
   data:
     name: "Garage"
     icon: "mdi:garage"
   
   service: simple_chores.add_chore
   data:
     name: "Vacuum floors"
     room_id: "area_living_room"
     frequency: "weekly"
   ```

3. **Check sensor states in Developer Tools → States**:
   - `sensor.simple_chores_due_today`
   - `sensor.simple_chores_due_this_week` 
   - `sensor.simple_chores_total`

## Architecture

### Core Components

- **Store (`store.py`)**: Persistent data storage using Home Assistant's storage API. Manages rooms, chores, and completion history with automatic saving.

- **Coordinator (`coordinator.py`)**: DataUpdateCoordinator that processes due dates, categorizes chores (due today, this week, overdue), and combines HA Areas with custom rooms. Updates every 15 minutes.

- **Services**: 11 services for managing rooms/chores defined in `__init__.py`:
  - Room management: add, remove, update
  - Chore management: add, remove, update, complete, skip
  - Data retrieval: history, user stats, manual notifications

### Entity Types

- **Sensors**: Count entities for due today, due this week, overdue, total chores
- **Binary Sensor**: `has_overdue` status
- **Calendar**: Visual calendar view of scheduled chores

### Data Model

**Rooms**: Two types supported
- HA Areas: Prefixed with `area_` (e.g., `area_kitchen`)
- Custom rooms: Prefixed with `custom_` (e.g., `custom_abc123`)

**Chores**: Core entity with frequency-based scheduling
- Frequencies: daily, weekly, monthly, quarterly, yearly  
- Next due date calculation using `dateutil.relativedelta`
- Week bounds: Sunday (start) to Saturday (end)

**History**: Completion tracking with user attribution and statistics

### Key Features

- **Auto-rescheduling**: When completed, chores automatically schedule next occurrence based on frequency
- **User attribution**: Tracks who completed each chore (defaults to logged-in user)
- **Notifications**: Daily push notifications to mobile devices at configurable time
- **Config flow**: Single instance with notification settings (enabled, time, targets)

### Dependencies

- `python-dateutil>=2.8.0` for date calculations
- Home Assistant 2024.1.0+

### File Structure

```
custom_components/simple_chores/
├── __init__.py          # Main integration setup & services
├── const.py            # Constants & configuration keys  
├── coordinator.py      # Data coordination & business logic
├── store.py           # Persistent storage management
├── config_flow.py     # Configuration UI flow
├── sensor.py          # Count sensors
├── binary_sensor.py   # Has overdue binary sensor
├── calendar.py        # Calendar entity
├── services.yaml      # Service definitions
├── strings.json       # UI strings
└── translations/      # Localization files

household-tasks-card/
└── household-tasks-card.js  # Custom Lovelace card
```

The integration follows Home Assistant patterns with proper async handling, storage management, and entity lifecycle.