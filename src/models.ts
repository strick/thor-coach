import { z } from "zod";

export type ParsedLog = {
  exercise: string;
  sets?: number;
  reps?: number;
  weight_lbs?: number;
  notes?: string;
};

export const IngestReq = z.object({
  text: z.string().min(3),
  date: z.string().optional(), // YYYY-MM-DD
  planId: z.string().optional().default("thor")
});

export type ExRow = {
  id: string;
  plan_id: string;
  name: string;
  day_of_week: number; // 1..7
  aliases: string;     // JSON array
};
