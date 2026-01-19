/**
 * Parsed workout log entry
 */
export type ParsedLog = {
  exercise: string;
  sets?: number;
  reps?: number | number[];  // Single value (12) or array per set ([25, 20, 15])
  weight_lbs?: number;
  notes?: string;
};

/**
 * Exercise database row
 */
export type ExRow = {
  id: string;
  plan_id: string;
  name: string;
  day_of_week: number; // 1..7
  aliases: string;     // JSON array
};

/**
 * Meal log entry
 */
export type Meal = {
  id: string;
  date: string;           // YYYY-MM-DD
  meal_type: "breakfast" | "lunch" | "dinner" | "snack";
  description: string;
  calories?: number;
  protein_g?: number;
  fat_g?: number;
  sat_fat_g?: number;
  carbs_g?: number;
  fiber_g?: number;
  sodium_mg?: number;
  cholesterol_mg?: number;
};

/**
 * Health event (migraine, run, sleep, yardwork, etc.)
 */
export type HealthEvent = {
  id: string;
  date: string;           // YYYY-MM-DD
  category: "migraine" | "run" | "sleep" | "yardwork" | "other";
  intensity?: number;     // 1-10 scale
  duration_minutes?: number;
  notes?: string;
};

/**
 * Router classification result
 */
export type RouterResult = {
  target: "WORKOUT" | "NUTRITION" | "HEALTH_LOG" | "OVERVIEW";
  intent: string;        // e.g. "log_workout", "log_meal", "log_event", "get_summary"
  cleaned_text: string;
  confidence?: number;
};

/**
 * Meta-runner request
 */
export type MetaRunnerRequest = {
  text: string;
  mode?: "auto" | "thor" | "nutrition" | "health" | "overview";
  periodDays?: number;    // for overview queries (default 14)
};

/**
 * Meta-runner response
 */
export type MetaRunnerResponse = {
  agent: "thor" | "nutrition" | "health" | "overview";
  intent: string;        // e.g. "log_workout", "log_meal", "log_event", "get_summary"
  actions: string[];     // human-readable description of what was done
  message: string;       // natural-language reply for the user
  model?: string;        // LLM model used (e.g., "llama3.1:8b", "gpt-4-turbo-preview")
  provider?: "ollama" | "openai"; // LLM provider used
  rawToolResults?: any;  // optional debug data
};

/**
 * Daily Summary Types
 */

export type DailySummaryUserProfile = {
  age: number;
  sex: "male" | "female" | "other";
  weight_lbs: number;
  diet: string;
  cholesterolNotes?: string;
  goals: string[];
};

export type DailySummaryNutritionItem = {
  name: string;
  quantity: string;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  sat_fat_g?: number;
  fiber_g?: number;
  sodium_mg?: number;
};

export type DailySummaryMeal = {
  time: string;
  items: DailySummaryNutritionItem[];
  notes?: string;
};

export type DailySummaryNutritionTotals = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sat_fat_g: number;
  fiber_g: number;
  sodium_mg: number;
  water_oz?: number;
};

export type DailySummaryNutrition = {
  meals?: DailySummaryMeal[];
  totals: DailySummaryNutritionTotals;
};

export type DailySummaryExerciseSet = {
  reps?: number;
  weight_lbs_each?: number;
  rpe?: number;
};

export type DailySummaryExercise = {
  name: string;
  sets: DailySummaryExerciseSet[];
  notes?: string;
};

export type DailySummaryWorkout = {
  planName: string;
  day: number;
  title: string;
  exercises: DailySummaryExercise[];
  duration_min: number;
};

export type DailySummaryRun = {
  distance_miles: number;
  pace_min_per_mile?: string;
  avg_hr?: number;
  max_hr?: number;
  duration_min: number;
  conditions?: string;
  notes?: string;
};

export type DailySummaryTraining = {
  workout?: DailySummaryWorkout;
  run?: DailySummaryRun;
};

export type DailySummaryActivity = {
  steps?: number;
  active_minutes?: number;
};

export type DailySummarySleep = {
  duration_hours?: number;
  quality?: string;
};

export type DailySummaryInput = {
  date: string;
  timezone?: string;
  userProfile: DailySummaryUserProfile;
  nutrition: DailySummaryNutrition;
  training?: DailySummaryTraining;
  activity?: DailySummaryActivity;
  sleep?: DailySummarySleep;
  notes?: string;
};

export type DailySummarySections = {
  highlights: string[];
  dashHeartHealthy: string;
  proteinRecovery: string;
  training: string;
  redFlags: string;
  tomorrowPriorities: string;
};

export type DailySummaryOutput = {
  date: string;
  markdown: string;
  sections: DailySummarySections;
  generatedAt: string;
};
