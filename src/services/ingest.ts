import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { getDayExercises, normalizeExercise, getDOW, toISODate } from "./plans.js";
import type { ParsedLog } from "../models.js";
import { parseFreeform } from "./parser.js";
import { THOR_PLAN_ID } from "../config.js";

export async function handleIngest(text: string, dateISO?: string, planId = THOR_PLAN_ID) {
  const date = dateISO ? new Date(dateISO + "T12:00:00") : new Date();
  const dow = getDOW(date);
  const dayExercises = getDayExercises(planId, dow);

  const parsed = await parseFreeform(text, planId, dow);

  const insertSession = db.prepare(`
    INSERT INTO workout_sessions (id,plan_id,session_date,day_of_week)
    VALUES (@id,@plan_id,@session_date,@day_of_week)
  `);

  const insertLog = db.prepare(`
    INSERT INTO exercise_logs (id,session_id,exercise_id,sets,reps_per_set,weight_lbs,notes)
    VALUES (@id,@session_id,@exercise_id,@sets,@reps_per_set,@weight_lbs,@notes)
  `);

  const sessionId = randomUUID();
  const sessionRow = {
    id: sessionId,
    plan_id: planId,
    session_date: toISODate(date),
    day_of_week: dow
  };

  const results: any[] = [];

  const tx = db.transaction((items: ParsedLog[]) => {
    insertSession.run(sessionRow);

    for (const item of items) {
      const { match, normalized } = normalizeExercise(item.exercise, dayExercises);
      if (!match) {
        results.push({ status: "skipped_unknown_exercise", input: item.exercise });
        continue;
      }
      const row = {
        id: randomUUID(),
        session_id: sessionId,
        exercise_id: match.id,
        sets: item.sets ?? null,
        reps_per_set: item.reps ?? null,
        weight_lbs: item.weight_lbs ?? null,
        notes: item.notes ?? null
      };
      insertLog.run(row);
      results.push({ status: "logged", exercise: normalized, sets: item.sets, reps: item.reps, weight_lbs: item.weight_lbs });
    }
  });

  tx(parsed);

  return { sessionId, date: sessionRow.session_date, day_of_week: dow, results };
}
