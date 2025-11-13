/**
 * Parsed workout log entry
 */
export type ParsedLog = {
  exercise: string;
  sets?: number;
  reps?: number;
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
