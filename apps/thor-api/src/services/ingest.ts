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

  const parseResult = await parseFreeform(text, planId, dow);

  const insertSession = db.prepare(`
    INSERT INTO workout_sessions (id,plan_id,session_date,day_of_week,llm_provider,llm_model)
    VALUES (@id,@plan_id,@session_date,@day_of_week,@llm_provider,@llm_model)
  `);

  const insertLog = db.prepare(`
    INSERT INTO exercise_logs (id,session_id,exercise_id,sets,reps_per_set,weight_lbs,notes)
    VALUES (@id,@session_id,@exercise_id,@sets,@reps_per_set,@weight_lbs,@notes)
  `);

  // Check if exercise already logged today
  const checkExistingLog = db.prepare(`
    SELECT 1 FROM exercise_logs el
    JOIN workout_sessions ws ON ws.id = el.session_id
    WHERE ws.session_date = ? AND el.exercise_id = ?
    LIMIT 1
  `);

  const sessionId = randomUUID();
  const sessionRow = {
    id: sessionId,
    plan_id: planId,
    session_date: toISODate(date),
    day_of_week: dow,
    llm_provider: parseResult.llm_provider,
    llm_model: parseResult.llm_model
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

      // Check if this exercise was already logged today
      const alreadyLogged = checkExistingLog.get(sessionRow.session_date, match.id);
      if (alreadyLogged) {
        results.push({
          status: "skipped_already_logged_today",
          exercise: normalized,
          message: `${normalized} was already logged today`
        });
        continue;
      }

      // Serialize reps: array → JSON string, number → string, undefined → null
      let repsValue: string | null = null;
      if (item.reps !== undefined && item.reps !== null) {
        repsValue = Array.isArray(item.reps) ? JSON.stringify(item.reps) : String(item.reps);
      }

      const row = {
        id: randomUUID(),
        session_id: sessionId,
        exercise_id: match.id,
        sets: item.sets ?? null,
        reps_per_set: repsValue,
        weight_lbs: item.weight_lbs ?? null,
        notes: item.notes ?? null
      };
      insertLog.run(row);
      results.push({ status: "logged", exercise: normalized, sets: item.sets, reps: item.reps, weight_lbs: item.weight_lbs, notes: item.notes });
    }
  });

  tx(parseResult.items);

  return {
    sessionId,
    date: sessionRow.session_date,
    day_of_week: dow,
    llm_provider: parseResult.llm_provider,
    llm_model: parseResult.llm_model,
    results
  };
}
