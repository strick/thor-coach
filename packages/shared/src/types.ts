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
  rawToolResults?: any;  // optional debug data
};
