# Simple Chores Card

A modern, feature-rich custom Lovelace card for the Simple Chores Home Assistant integration. Provides beautiful UI for managing household chores with room organization, user assignment, and intelligent automation.

## Installation

### Automatic Installation (Recommended)

The card is **automatically installed** with the Simple Chores integration!

1. Install the Simple Chores integration (via HACS or manually)
2. Restart Home Assistant
3. Add the resource **once** in Settings → Dashboards → Resources:
   - **URL**: `/local/community/simple-chores/simple-chores-card.js`
   - **Resource Type**: JavaScript Module

### Manual Installation

If you prefer manual setup:

1. Copy `simple-chores-card.js` to your Home Assistant `www` folder
2. Add the resource in Settings → Dashboards → Resources:
   - **URL**: `/local/simple-chores-card.js`
   - **Resource Type**: JavaScript Module

## Usage

### Adding the Card

**Visual Picker** (Recommended):
1. Edit any dashboard → Add Card
2. Search for "Simple Chores Card"
3. Click to add automatically

**Manual YAML**:
```yaml
type: custom:simple-chores-card
show_completed: false
default_room: all
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `show_completed` | boolean | `false` | Show recently completed chores |
| `default_room` | string | `all` | Default room filter on load (room ID or "all") |

## Features

### Smart Views
- **Due Today**: Immediate action items with urgency indicators
- **Due in Next 7 Days**: Rolling 7-day lookahead (not calendar week)
- **All Active Chores Modal**: Comprehensive view of all chores with bulk management
- **Real-time Stats**: Live counts for due today, overdue, and total chores

### Advanced Chore Management
- **Modal-based Editing**: Clean, focused edit forms with validation
- **Inline Actions**: Quick access to complete, skip, and edit functions
- **Completion History**: View detailed completion records per chore
- **Smart Complete Modal**: Choose who completed and optionally reassign
- **Skip to Next**: Move chores forward without marking complete
- **Due Date Override**: Set custom due dates when editing

### User Assignment & Attribution
- **Assignment Display**: See who's responsible for each chore
- **Completion Attribution**: Track who actually completed each chore
- **User Selection**: Choose from all Home Assistant users
- **Smart Defaults**: Auto-selects current user on completion
- **Flexible Reassignment**: Change assignments during edit or completion
- **Shared Device Support**: Perfect for family tablets with central login

### Room Organization
- **Dual Room System**: Supports both HA Areas and custom rooms
- **Room Filtering**: Focus on specific areas of your home
- **Add Custom Rooms**: Create rooms directly from the card
- **Manage Rooms Modal**: Edit or delete custom rooms
- **Smart Room Resolution**: Automatically maps room IDs to names

### User Experience
- **Unified Form System**: Consistent, validated input handling across all modals
- **Performance Caching**: Fast loading with intelligent data caching
- **Overdue Highlighting**: Visual indicators for past-due tasks
- **Frequency Badges**: Clear labels for daily/weekly/monthly/etc.
- **Responsive Design**: Works great on desktop and mobile
- **Error Handling**: Helpful validation messages and error recovery
- **Keyboard Navigation**: Press ESC to close modals, Enter to submit forms
- **Accessibility**: Full ARIA support and screen reader compatibility
- **Loading States**: Clear visual feedback during all operations

## Modal Workflows

### Complete Chore Modal
When completing a chore, you can:
1. Select who completed it (defaults to current user)
2. Optionally reassign for next occurrence
3. Automatically schedules next due date based on frequency

### Edit Chore Modal
Comprehensive editing with:
- Name and room changes
- Frequency updates
- Custom due date override
- User assignment/reassignment
- Form validation with helpful messages

### All Active Chores Modal
Bulk management interface showing:
- All active chores in one view
- Quick actions (complete, skip, edit)
- Sorting and filtering options
- Performance-optimized rendering

### History Modal
View completion records:
- Who completed each occurrence
- When it was completed
- Full audit trail per chore

## Room Types

The card supports two types of rooms:

1. **Home Assistant Areas**: Automatically detected, prefixed with `area_`
2. **Custom Rooms**: Created via card or services, prefixed with `custom_`

Both types work seamlessly together and can be mixed freely.

## Perfect for Shared Households

The Simple Chores Card is designed for families using shared devices:

- **Shared Tablets**: One device, multiple family members
- **Central Login**: Single HA account shared by household
- **Proper Attribution**: Everyone gets credit for their work
- **Flexible Workflows**: Assign chores to anyone, completed by anyone
- **Accurate Tracking**: Maintain proper completion history

## Requirements

- Home Assistant 2024.1.0 or newer
- Simple Chores integration installed
- Modern browser with JavaScript enabled

## Support

For issues, feature requests, or questions:
- [GitHub Issues](https://github.com/darthmario/simple-chores/issues)
- [Integration Documentation](https://github.com/darthmario/simple-chores)
