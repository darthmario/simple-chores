# Simple Chores Roadmap

This document tracks planned features and enhancements for future development.

---

## Advanced Recurrence System

### Problem

The current recurrence system is **interval-based**: it calculates the next due date by adding a fixed interval (7 days, 1 month, etc.) from the completion date. This causes **drift** for chores that should happen on specific days.

**Example:**
- Garbage day is every Tuesday
- Chore is due Tuesday, Jan 7
- User completes it on Wednesday, Jan 8
- Current behavior: next due = Jan 8 + 7 days = **Jan 15 (Wednesday)** - WRONG
- Expected behavior: next due = **Jan 14 (Tuesday)**

### Solution: Day-Anchored Recurrence

Add support for anchoring recurring chores to specific days of the week or month, similar to Outlook/Google Calendar recurrence patterns.

### Data Model Changes

```python
# New fields for chores
{
    "recurrence_type": "interval" | "anchored",  # New field

    # For anchored weekly:
    "anchor_days_of_week": [0, 2, 4],  # Sun=0, Mon=1, Tue=2, etc.

    # For anchored monthly:
    "anchor_type": "day_of_month" | "week_pattern",
    "anchor_day_of_month": 15,  # For "15th of every month"
    "anchor_week": 2,           # For "2nd Tuesday" (1-5, where 5 = last)
    "anchor_weekday": 2,        # Tuesday
}
```

### UI Design (Outlook-style)

The current simple frequency dropdown would gain an "Advanced..." option that opens a recurrence modal:

```
┌─────────────────────────────────────────────────────────┐
│  Recurrence Pattern                                [X]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Frequency:  [Daily ▼] [Weekly ▼] [Monthly ▼] [Yearly ▼]│
│                                                         │
│  ─────────────────────────────────────────────────────  │
│                                                         │
│  WEEKLY OPTIONS:                                        │
│                                                         │
│  Repeat every [ 1 ] week(s) on:                        │
│                                                         │
│  [ ] Sun  [x] Mon  [ ] Tue  [x] Wed  [ ] Thu  [x] Fri  [ ] Sat │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│                                                         │
│  MONTHLY OPTIONS:                                       │
│                                                         │
│  ( ) Day [ 15 ] of every [ 1 ] month(s)                │
│                                                         │
│  (x) The [ 2nd ▼ ] [ Tuesday ▼ ] of every [ 1 ] month(s) │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│                                                         │
│  YEARLY OPTIONS:                                        │
│                                                         │
│  ( ) Every [ March ▼ ] [ 15 ]                          │
│                                                         │
│  (x) The [ 1st ▼ ] [ Monday ▼ ] of [ March ▼ ]         │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                              [ Cancel ]  [ Save ]       │
└─────────────────────────────────────────────────────────┘
```

### Supported Patterns

| Pattern | Example | Storage |
|---------|---------|---------|
| Every N days | Every 3 days | `frequency: "daily", interval: 3` |
| Specific weekdays | Mon, Wed, Fri | `frequency: "weekly", anchor_days_of_week: [1,3,5]` |
| Day of month | 15th of each month | `frequency: "monthly", anchor_day_of_month: 15` |
| Week pattern | 2nd Tuesday | `frequency: "monthly", anchor_week: 2, anchor_weekday: 2` |
| Last weekday | Last Friday of month | `frequency: "monthly", anchor_week: 5, anchor_weekday: 5` |
| Yearly date | March 15 | `frequency: "yearly", anchor_month: 3, anchor_day_of_month: 15` |
| Yearly pattern | 1st Monday of March | `frequency: "yearly", anchor_month: 3, anchor_week: 1, anchor_weekday: 1` |

### Implementation Steps

1. **Backend (`coordinator.py`, `store.py`)**
   - Add new fields to chore data model
   - Create `calculate_next_anchored_due()` function
   - Modify `calculate_next_due()` to handle both types
   - Handle edge cases (e.g., Feb 30 → Feb 28/29)

2. **Frontend (`simple-chores-card.js`)**
   - Create recurrence modal component
   - Add "Advanced..." option to frequency selector
   - Build day-of-week checkbox row
   - Build monthly pattern radio options
   - Validate and serialize recurrence config

3. **Migration**
   - Existing chores default to `recurrence_type: "interval"`
   - No breaking changes to current behavior

4. **Calendar View**
   - Update `_generateFutureOccurrences()` to use anchored logic
   - Projected events should show correct anchor days

### Priority

Medium - Current interval system works for most use cases, but day-anchored is essential for chores tied to external schedules (garbage day, recycling, etc.).

---

## Completed Features

### Advanced Recurrence System
Implemented day-anchored recurrence for chores that happen on specific days (e.g., garbage day every Tuesday, rent on the 1st). Supports weekly day selection and monthly patterns (day of month or nth weekday).

### Advance Notifications
Configurable notifications before due date - can now notify 1 day, 2 days, 3 days, or 1 week before a chore is due. Multiple notification times can be selected (e.g., notify both 1 day before AND on the day of).

---

## Other Future Ideas

### Chore Templates
Pre-built chore sets for common scenarios (weekly cleaning routine, seasonal tasks, etc.)

### Statistics Dashboard
Completion rates, user leaderboards, streak tracking

### Multi-instance Support
Different chore lists for different properties/households

---

*Last updated: 2026-01-17*
