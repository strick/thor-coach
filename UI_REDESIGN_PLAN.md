# Thor Logger UI Redesign Plan

## Problems with Current UI
1. **Everything on one page** - Too much scrolling, cognitive overload
2. **Config always visible** - API URL/Plan rarely changed, wastes space
3. **Hidden features in collapsibles** - Poor discoverability
4. **No clear hierarchy** - Everything has similar visual weight
5. **Input form gets prime space** - But isn't always the primary need

## Proposed Solution: Tab-Based Navigation

### Header (Always Visible)
```
💪 Thor Logger              [Connected] ⚙️
AI-powered workout tracking

[🏠 Today] [📖 History] [📊 Progress]
```

### Tab 1: TODAY (Default View)
**Purpose**: Quick daily workflow
```
[← | 2025-11-14 | →]  [Today Button]

┌─────────────────────────────┬─────────────────────────────┐
│ 📋 Today's Plan             │ ✍️ Log Workout             │
│                             │ [🎤 Dictate]               │
│ • Dumbbell Thrusters        │                             │
│   Last: 4x12 @25lbs         │ [Workout Text Area]         │
│ • Renegade Rows (First!)    │                             │
│ • Swings (First!)           │ [Submit] [Clear]            │
└─────────────────────────────┴─────────────────────────────┘

[Result feedback area - only shows after submit]
```

**Benefits**:
- Everything needed for daily logging in one view
- Progressive overload data visible while logging
- Clean, focused interface

### Tab 2: HISTORY
**Purpose**: Review and manage past workouts
```
┌──────────────────────────────────────────────────────────┐
│ Manage Workouts                         [📥 Export Data] │
│                                                          │
│ Select Date: [2025-11-14] [Load]                        │
│                                                          │
│ ┌────────────────────────────────────────────────────┐  │
│ │ Session: 2025-11-14 (Day 5)           [Delete]    │  │
│ │ • Dumbbell Thrusters: 4x12 @25lbs    [Edit]       │  │
│ └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ Track Single Exercise                                    │
│                                                          │
│ Exercise: [Dumbbell Floor Press ▼]                      │
│                                                          │
│ Stats: 42 sessions, 180 sets, Max: 50lbs               │
│                                                          │
│ [History table with dates, sets, reps, weight]         │
└──────────────────────────────────────────────────────────┘
```

**Benefits**:
- Clear separation of concerns
- Edit/delete workflows grouped together
- Exercise tracking gets proper space

### Tab 3: PROGRESS
**Purpose**: Charts, analytics, summaries
```
┌──────────────────────────────────────────────────────────┐
│ 📊 Weekly Report                        [Generate Now]  │
│                                                          │
│ Week of 2025-11-11:                                     │
│ You completed 3 sessions with 45 sets and 12,500 lbs   │
│ volume. That's a 15% increase from last week!          │
│                                                          │
│ [Previous weeks dropdown]                               │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ Progress (last 30 days)                    [Refresh]    │
│                                                          │
│ [Sessions Chart ────────────]  │ Top Exercises:        │
│                                │ 1. Floor Press (42)   │
│                                │ 2. Incline (38)       │
│                                                          │
│ Recent Logs:                                            │
│ [Table with date, exercise, sets, reps, weight]        │
└──────────────────────────────────────────────────────────┘
```

**Benefits**:
- All analytics in one place
- Charts get proper visual space
- Weekly summaries prominent

### Settings Modal (⚙️ Button)
```
┌──────────────────────────┐
│ ⚙️ Settings         [✕]  │
│                          │
│ API URL:                 │
│ [http://localhost:3000]  │
│                          │
│ Workout Plan:            │
│ [Thor (Dumbbell-only) ▼] │
│                          │
│    [Save & Close]        │
└──────────────────────────┘
```

**Benefits**:
- Config hidden until needed
- Cleaner main interface
- Still easily accessible

## Implementation Status

### ✅ Completed
- New header with tab navigation
- Settings modal
- Today tab redesigned
- Tab switching JavaScript
- Better visual hierarchy

### 🚧 In Progress
- History tab content organization
- Progress tab content organization

### 📋 Todo
- Remove old collapsible buttons
- Test tab switching
- Adjust spacing/padding
- Mobile responsiveness check

## Key UX Improvements

1. **Reduced Cognitive Load**: One primary task per tab
2. **Better Discoverability**: No hidden features in collapsed sections
3. **Cleaner Visual Design**: More whitespace, clear hierarchy
4. **Faster Navigation**: Keyboard shortcuts + tabs
5. **Progressive Disclosure**: Advanced features (export, exercise tracking) available but not overwhelming

## Next Steps

1. Test current header + Today tab
2. Finish reorganizing History tab
3. Finish reorganizing Progress tab
4. Remove legacy UI elements
5. Final polish and spacing adjustments
