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

  const sessionDate = toISODate(date);

  const getExistingSession = db.prepare(`
    SELECT id, llm_provider, llm_model
    FROM workout_sessions
    WHERE plan_id = ? AND session_date = ?
    LIMIT 1
  `);

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

  const results: any[] = [];

  // Transaction ensures atomicity - check and insert happen together
  const tx = db.transaction((items: ParsedLog[]) => {
    // Check for existing session INSIDE transaction for atomicity
    const existingSession = getExistingSession.get(planId, sessionDate) as { id: string; llm_provider: string; llm_model: string } | undefined;

    // Use existing session if found, otherwise create new one
    let sessionId: string;
    let sessionLlmProvider: string;
    let sessionLlmModel: string;
    let sessionExists: boolean;

    if (existingSession) {
      // Reuse existing session for this day
      sessionId = existingSession.id;
      sessionLlmProvider = existingSession.llm_provider;
      sessionLlmModel = existingSession.llm_model;
      sessionExists = true;
    } else {
      // Create new session
      sessionId = randomUUID();
      sessionLlmProvider = parseResult.llm_provider;
      sessionLlmModel = parseResult.llm_model;
      sessionExists = false;

      // Insert the new session
      insertSession.run({
        id: sessionId,
        plan_id: planId,
        session_date: sessionDate,
        day_of_week: dow,
        llm_provider: sessionLlmProvider,
        llm_model: sessionLlmModel
      });
    }

    for (const item of items) {
      const { match, normalized } = normalizeExercise(item.exercise, dayExercises);
      if (!match) {
        results.push({ status: "skipped_unknown_exercise", input: item.exercise });
        continue;
      }

      // Check if this exercise was already logged today
      const alreadyLogged = checkExistingLog.get(sessionDate, match.id);
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

    // Return session info from transaction
    return { sessionId, sessionLlmProvider, sessionLlmModel, sessionExists };
  });

  const sessionInfo = tx(parseResult.items);

  return {
    sessionId: sessionInfo.sessionId,
    sessionExists: sessionInfo.sessionExists,
    date: sessionDate,
    day_of_week: dow,
    llm_provider: sessionInfo.sessionLlmProvider,
    llm_model: sessionInfo.sessionLlmModel,
    results
  };
}
