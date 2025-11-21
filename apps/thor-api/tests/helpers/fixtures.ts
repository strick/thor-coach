/**
 * Test fixtures - sample data for tests
 */

export const mockWorkoutText = {
  simple: 'floor press 4x12 @45',
  multiple: 'floor press 4x12 @45, rows 4x10 @35',
  variableReps: 'bench press 11, 8, 5 @135',
  withNotes: 'squats 4x8 @185, felt brutal today',
  pastTense: 'I did floor press 4x12 @45 yesterday',
};

export const mockParsedWorkout = {
  simple: {
    exercises: [
      {
        name: 'floor press',
        sets: 4,
        reps: '12',
        weight: 45,
        notes: null,
      },
    ],
  },
  multiple: {
    exercises: [
      {
        name: 'floor press',
        sets: 4,
        reps: '12',
        weight: 45,
        notes: null,
      },
      {
        name: 'rows',
        sets: 4,
        reps: '10',
        weight: 35,
        notes: null,
      },
    ],
  },
  variableReps: {
    exercises: [
      {
        name: 'bench press',
        sets: 3,
        reps: '11,8,5',
        weight: 135,
        notes: null,
      },
    ],
  },
};

export const mockHealthEvents = {
  sleep: {
    category: 'sleep',
    event_date: '2025-11-19',
    duration_minutes: 480,
    intensity: null,
    notes: 'Good sleep',
  },
  migraine: {
    category: 'migraine',
    event_date: '2025-11-19',
    duration_minutes: null,
    intensity: 7,
    notes: 'Severe headache',
  },
  run: {
    category: 'run',
    event_date: '2025-11-19',
    duration_minutes: 30,
    intensity: null,
    notes: '5 miles',
  },
};

export const mockWeeklySummary = {
  plan_id: 'thor',
  week_start_date: '2025-11-17',
  week_end_date: '2025-11-23',
  total_sessions: 3,
  total_volume: 12500,
  summary_text: 'Great week! You completed 3 workouts with a total volume of 12,500 lbs.',
  metrics_json: JSON.stringify({
    exercises: [
      { name: 'floor press', volume: 5400 },
      { name: 'rows', volume: 4200 },
      { name: 'squats', volume: 2900 },
    ],
    days_trained: 3,
    week_over_week: {
      sessions: 0,
      volume: 1500,
    },
  }),
};

// Exercise IDs from seed data (for reference)
export const exerciseIds = {
  floorPress: 1, // Assuming floor press is first in seed
  rows: 2,
  benchPress: 3,
  squats: 4,
};

// Helper to create a date string (YYYY-MM-DD)
export function createDateString(daysAgo: number = 0): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split('T')[0];
}

// Helper to get day of week (1-7, Sunday=7)
export function getDayOfWeek(date: string): number {
  const day = new Date(date).getDay();
  return day === 0 ? 7 : day;
}
