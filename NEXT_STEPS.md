# Next Steps for Simple Chores

## 1. Test Locally in Home Assistant

1. Copy the integration to your Home Assistant config:
   ```bash
   cp -r custom_components/simple_chores /path/to/homeassistant/config/custom_components/
   ```

2. Copy the Lovelace card to your www folder:
   ```bash
   cp household-tasks-card/household-tasks-card.js /path/to/homeassistant/config/www/
   ```

3. Restart Home Assistant

4. Add the integration:
   - Go to Settings → Devices & Services → Add Integration
   - Search for "Simple Chores"
   - Configure notification settings

5. Add the Lovelace card resource:
   - Go to Settings → Dashboards → Resources (top right ⋮ menu)
   - Add Resource: `/local/household-tasks-card.js` as JavaScript Module

6. Add the card to a dashboard:
   ```yaml
   type: custom:household-tasks-card
   ```

## 2. Create GitHub Repository

```bash
cd /Users/nathancraddock/Documents/chores
git init
git add .
git commit -m "Initial commit: Simple Chores integration"
git branch -M main
git remote add origin https://github.com/nathancraddock/simple_chores.git
git push -u origin main
```

## 3. Create a Release for HACS

1. Go to your GitHub repository
2. Click "Releases" → "Create a new release"
3. Tag: `v1.0.0`
4. Title: `v1.0.0 - Initial Release`
5. Description: List features
6. Publish release

## 4. Add to HACS (for yourself)

1. Open HACS in Home Assistant
2. Go to Integrations → ⋮ (three dots) → Custom repositories
3. Add your repo URL: `https://github.com/nathancraddock/simple_chores`
4. Category: Integration
5. Click Add, then install from HACS

## 5. Optional: Submit to HACS Default Repository

To make it discoverable by all HACS users:

1. Ensure all GitHub Actions pass (HACS + Hassfest validation)
2. Add an icon to home-assistant/brands repo (optional but recommended)
3. Submit PR to https://github.com/hacs/default
   - Add your repo to the `integration` file alphabetically

## 6. Optional: Create Integration Icon

1. Create a 256x256 PNG icon
2. Create a 512x512 PNG icon (@2x)
3. Submit PR to https://github.com/home-assistant/brands
   - Add to `custom_integrations/simple_chores/`

---

## Quick Test Commands

Test the services in Developer Tools → Services:

```yaml
# Add a custom room
service: simple_chores.add_room
data:
  name: "Garage"
  icon: "mdi:garage"

# Add a chore (use an HA Area ID or custom room ID)
service: simple_chores.add_chore
data:
  name: "Vacuum floors"
  room_id: "area_living_room"
  frequency: "weekly"

# Complete a chore
service: simple_chores.complete_chore
data:
  chore_id: "YOUR_CHORE_ID"

# Send notification manually
service: simple_chores.send_due_notification
```

Check sensor attributes in Developer Tools → States:
- `sensor.simple_chores_due_today`
- `sensor.simple_chores_due_this_week`
- `sensor.simple_chores_total` (has rooms list)
