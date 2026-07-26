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
   cp custom_components/simple_chores/www/simple-chores-card.js /path/to/homeassistant/config/www/
   
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

### Data Model

**Rooms**: Two types supported
- HA Areas: Prefixed with `area_` (e.g., `area_kitchen`)
- Custom rooms: Prefixed with `custom_` (e.g., `custom_abc123`)

**Chores**: Core entity with frequency-based scheduling
- Frequencies: daily, weekly, monthly, quarterly, yearly  
- Next due date calculation using `dateutil.relativedelta`
- Week bounds: Sunday (start) to Saturday (end)

**History**: Completion tracking with user attribution and statistics
