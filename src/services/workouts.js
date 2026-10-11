import { db, uuid, tx } from "../db.js";
import { chatJSON } from "../llm.js";
import { THOR_PLAN_ID, todayISO, getDOW } from "../config.js";
import { HttpError } from "../http.js";

export function getDayExercises(dow, planId = THOR_PLAN_ID) {
  return db.prepare("SELECT * FROM exercises WHERE plan_id = ? AND day_of_week = ? ORDER BY rowid").all(planId, dow);
}

export function getAllExercises(planId = THOR_PLAN_ID) {
  return db.prepare("SELECT * FROM exercises WHERE plan_id = ? ORDER BY day_of_week, rowid").all(planId);
}

function normalizeExercise(input, candidates) {
  const needle = String(input || "").toLowerCase().trim();
  for (const c of candidates) if (c.name.toLowerCase() === needle) return c;
  for (const c of candidates) {
    const aliases = JSON.parse(c.aliases || "[]");
    if (aliases.some((a) => a.toLowerCase() === needle)) return c;
  }
  for (const c of candidates) if (c.name.toLowerCase().includes(needle)) return c;
  for (const c of candidates) if (needle.includes(c.name.toLowerCase())) return c;
  return null;
}

const PARSER_SYSTEM = `
You are a precise workout log parser.
Return a JSON object exactly like:
{"items":[{"exercise_free":string,"exercise_match":string,"sets":number,"reps_per_set":number|null,"variable_reps":number[]|null,"weight_lbs":number|null,"notes":string|null}]}
Rules:
- One item per exercise (no merging).
- Use the CLOSEST match from the valid list.
- NOTATION: In "NxM" or "N*M" format, N is SETS and M is REPS_PER_SET.
  Examples: "3x12" means sets=3, reps_per_set=12; "4*10" means sets=4, reps_per_set=10
- Handle: "4*12 floor press @45" (sets=4, reps=12, weight=45)
          "11, 8, 5 push ups" (variable_reps=[11,8,5], reps_per_set=null)
          "3x 25, 20, 15 pushups" (sets=3, variable_reps=[25,20,15], reps_per_set=null)
- BODYWEIGHT EXERCISES (Push-ups, Leg Raises, Burpees, Mountain Climbers, Squat Jumps): ALWAYS use variable_reps array (even if all sets are the same), NEVER include weight_lbs.
- WEIGHTED EXERCISES: Use reps_per_set for consistent reps, variable_reps for varying reps, always include weight_lbs if mentioned.
- Capture any contextual notes, feelings, or comments in the "notes" field ("this was brutal", "felt easy", "PR!").
- Output ONLY valid JSON.`.trim();

export async function parseWorkoutText(text, dow) {
  const valid = getDayExercises(dow).map((e) => e.name);
  const normalizedText = text.replace(/£\s*/g, "").replace(/\bpounds?\b/gi, " lbs");
  const user = `Valid exercises for today (choose closest for exercise_match):\n${valid.join("; ")}\n\nText:\n${normalizedText}`;
  const { data, provider, model } = await chatJSON("workout_parsing", PARSER_SYSTEM, user);
  if (!Array.isArray(data?.items)) throw new HttpError(502, "Workout parser returned no items");

  const items = data.items.map((i) => {
    let reps;
    if (Array.isArray(i?.variable_reps) && i.variable_reps.length) reps = i.variable_reps;
    else if (i?.reps_per_set != null) reps = i.reps_per_set;
    return {
      exercise: i.exercise_match || i.exercise_free,
      sets: i.sets ?? (Array.isArray(reps) ? reps.length : undefined),
      reps,
      weight_lbs: i.weight_lbs ?? undefined,
      notes: i.notes ?? undefined,
    };
  });
  return { items, llm_provider: provider, llm_model: model };
}

function getOrCreateSession(sessionDate, dow, llm) {
  const existing = db
    .prepare("SELECT id FROM workout_sessions WHERE plan_id = ? AND session_date = ? LIMIT 1")
    .get(THOR_PLAN_ID, sessionDate);
  if (existing) return { id: existing.id, existed: true };
  const id = uuid();
  db.prepare(
    "INSERT INTO workout_sessions (id, plan_id, session_date, day_of_week, llm_provider, llm_model) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, THOR_PLAN_ID, sessionDate, dow, llm?.provider ?? null, llm?.model ?? null);
  return { id, existed: false };
}

function insertLog(sessionId, exerciseId, { sets, reps, weight_lbs, notes }) {
  let repsValue = null;
  if (reps !== undefined && reps !== null) {
    repsValue = Array.isArray(reps) ? JSON.stringify(reps) : String(reps);
  }
  const id = uuid();
  db.prepare(
    "INSERT INTO exercise_logs (id, session_id, exercise_id, sets, reps_per_set, weight_lbs, notes) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, sessionId, exerciseId, sets ?? null, repsValue, weight_lbs ?? null, notes ?? null);
  return id;
}

/** Natural-language ingest: parse with LLM then log each recognized exercise. */
export async function ingestWorkout(text, dateISO) {
  if (!text?.trim()) throw new HttpError(400, "text is required");
  const date = dateISO ? new Date(dateISO + "T12:00:00") : new Date();
  const dow = getDOW(date);
  const sessionDate = todayISO(date);
  const parsed = await parseWorkoutText(text, dow);
  const dayExercises = getDayExercises(dow);

  const results = [];
  const alreadyLogged = db.prepare(
    `SELECT 1 FROM exercise_logs el JOIN workout_sessions ws ON ws.id = el.session_id
     WHERE ws.session_date = ? AND el.exercise_id = ? LIMIT 1`
  );

  const session = tx(() => {
    const s = getOrCreateSession(sessionDate, dow, { provider: parsed.llm_provider, model: parsed.llm_model });
    for (const item of parsed.items) {
      const match = normalizeExercise(item.exercise, dayExercises);
      if (!match) {
        results.push({ status: "skipped_unknown_exercise", input: item.exercise });
        continue;
      }
      if (alreadyLogged.get(sessionDate, match.id)) {
        results.push({ status: "skipped_already_logged_today", exercise: match.name });
        continue;
      }
      insertLog(s.id, match.id, item);
      results.push({ status: "logged", exercise: match.name, sets: item.sets, reps: item.reps, weight_lbs: item.weight_lbs, notes: item.notes });
    }
    return s;
  });

  return { sessionId: session.id, date: sessionDate, day_of_week: dow, llm_provider: parsed.llm_provider, llm_model: parsed.llm_model, results };
}

/** Manual (structured) log without LLM. */
export function logManual({ exercise_id, date, sets, reps, weight_lbs, notes }) {
  if (!exercise_id) throw new HttpError(400, "exercise_id is required");
  const ex = db.prepare("SELECT * FROM exercises WHERE id = ?").get(exercise_id);
  if (!ex) throw new HttpError(404, "Exercise not found");
  const d = date ? new Date(date + "T12:00:00") : new Date();
  const sessionDate = todayISO(d);

  return tx(() => {
    const s = getOrCreateSession(sessionDate, getDOW(d), null);
    const logId = insertLog(s.id, exercise_id, { sets, reps, weight_lbs, notes });
    return { sessionId: s.id, logId, date: sessionDate, exercise: ex.name };
  });
}

function parseReps(repsPerSet) {
  if (repsPerSet == null) return null;
  try {
    const v = JSON.parse(repsPerSet);
    return v;
  } catch {
    const n = Number(repsPerSet);
    return Number.isFinite(n) ? n : repsPerSet;
  }
}

export function logVolume(log) {
  const reps = parseReps(log.reps_per_set);
  const totalReps = Array.isArray(reps) ? reps.reduce((a, b) => a + b, 0) : (log.sets || 0) * (reps || 0);
  return totalReps * (log.weight_lbs || 0);
}

export function getWorkouts(start, end) {
  const s = start || "0000-01-01";
  const e = end || "9999-12-31";
  const sessions = db
    .prepare("SELECT * FROM workout_sessions WHERE session_date BETWEEN ? AND ? ORDER BY session_date DESC")
    .all(s, e);
  const logsStmt = db.prepare(
    `SELECT l.id, l.exercise_id, e.name AS exercise, l.sets, l.reps_per_set, l.weight_lbs, l.notes
     FROM exercise_logs l JOIN exercises e ON e.id = l.exercise_id WHERE l.session_id = ? ORDER BY l.rowid`
  );
  return sessions.map((sess) => {
    const logs = logsStmt.all(sess.id).map((l) => ({ ...l, reps: parseReps(l.reps_per_set), volume: logVolume(l) }));
    return { ...sess, logs, total_volume: logs.reduce((a, l) => a + l.volume, 0) };
  });
}

export function deleteWorkout(id) {
  return tx(() => {
    db.prepare("DELETE FROM exercise_logs WHERE session_id = ?").run(id);
    const r = db.prepare("DELETE FROM workout_sessions WHERE id = ?").run(id);
    if (!r.changes) throw new HttpError(404, "Session not found");
    return { deleted: id };
  });
}

export function updateExerciseLog(id, patch) {
  const log = db.prepare("SELECT * FROM exercise_logs WHERE id = ?").get(id);
  if (!log) throw new HttpError(404, "Log not found");
  const sets = patch.sets !== undefined ? patch.sets : log.sets;
  let reps = log.reps_per_set;
  if (patch.reps !== undefined) {
    reps = patch.reps == null ? null : Array.isArray(patch.reps) ? JSON.stringify(patch.reps) : String(patch.reps);
  }
  const weight = patch.weight_lbs !== undefined ? patch.weight_lbs : log.weight_lbs;
  const notes = patch.notes !== undefined ? patch.notes : log.notes;
  db.prepare("UPDATE exercise_logs SET sets = ?, reps_per_set = ?, weight_lbs = ?, notes = ? WHERE id = ?").run(
    sets, reps, weight, notes, id
  );
  return db.prepare("SELECT * FROM exercise_logs WHERE id = ?").get(id);
}

export function deleteExerciseLog(id) {
  const r = db.prepare("DELETE FROM exercise_logs WHERE id = ?").run(id);
  if (!r.changes) throw new HttpError(404, "Log not found");
  return { deleted: id };
}

/** Today's log (if any) and the most recent previous log for an exercise — powers quick-log prefill. */
export function latestForExercise(exerciseId, date) {
  const shape = (l) => (l ? { ...l, reps: parseReps(l.reps_per_set) } : null);
  const today = db.prepare(
    `SELECT l.*, s.session_date FROM exercise_logs l JOIN workout_sessions s ON s.id = l.session_id
     WHERE l.exercise_id = ? AND s.session_date = ? ORDER BY l.rowid DESC LIMIT 1`
  ).get(exerciseId, date);
  const last = db.prepare(
    `SELECT l.*, s.session_date FROM exercise_logs l JOIN workout_sessions s ON s.id = l.session_id
     WHERE l.exercise_id = ? AND s.session_date < ? ORDER BY s.session_date DESC, l.rowid DESC LIMIT 1`
  ).get(exerciseId, date);

  // Progressive overload nudge: same weight for 3+ recent sessions → suggest a bump.
  let nudge = null;
  const recent = db.prepare(
    `SELECT l.weight_lbs FROM exercise_logs l JOIN workout_sessions s ON s.id = l.session_id
     WHERE l.exercise_id = ? AND s.session_date < ? AND l.weight_lbs IS NOT NULL
     ORDER BY s.session_date DESC, l.rowid DESC LIMIT 6`
  ).all(exerciseId, date);
  if (recent.length >= 3) {
    const current = recent[0].weight_lbs;
    let sessionsAtWeight = 0;
    for (const r of recent) {
      if (r.weight_lbs === current) sessionsAtWeight += 1;
      else break;
    }
    if (sessionsAtWeight >= 3) {
      nudge = { sessions_at_weight: sessionsAtWeight, current, suggest: current + 5 };
    }
  }
  return { today: shape(today), last: shape(last), nudge };
}

// --- Plan editor ---

export function createExercise({ name, day_of_week, aliases }) {
  if (!name?.trim()) throw new HttpError(400, "name is required");
  const day = Number(day_of_week);
  if (!(day >= 1 && day <= 7)) throw new HttpError(400, "day_of_week must be 1-7 (Mon-Sun)");
  const id = uuid();
  db.prepare("INSERT INTO exercises (id, plan_id, name, day_of_week, aliases) VALUES (?, ?, ?, ?, ?)").run(
    id, THOR_PLAN_ID, name.trim(), day, JSON.stringify(aliases || [])
  );
  return db.prepare("SELECT * FROM exercises WHERE id = ?").get(id);
}

export function updateExercise(id, patch) {
  const ex = db.prepare("SELECT * FROM exercises WHERE id = ?").get(id);
  if (!ex) throw new HttpError(404, "Exercise not found");
  const day = patch.day_of_week !== undefined ? Number(patch.day_of_week) : ex.day_of_week;
  if (!(day >= 1 && day <= 7)) throw new HttpError(400, "day_of_week must be 1-7");
  db.prepare("UPDATE exercises SET name = ?, day_of_week = ?, aliases = ? WHERE id = ?").run(
    patch.name?.trim() || ex.name, day,
    patch.aliases !== undefined ? JSON.stringify(patch.aliases) : ex.aliases, id
  );
  return db.prepare("SELECT * FROM exercises WHERE id = ?").get(id);
}

export function deleteExercise(id) {
  const ex = db.prepare("SELECT * FROM exercises WHERE id = ?").get(id);
  if (!ex) throw new HttpError(404, "Exercise not found");
  const logCount = db.prepare("SELECT COUNT(*) AS n FROM exercise_logs WHERE exercise_id = ?").get(id).n;
  if (logCount > 0) {
    throw new HttpError(409, `"${ex.name}" has ${logCount} logged sets — move it to another day instead of deleting, or its history would be orphaned`);
  }
  db.prepare("DELETE FROM exercises WHERE id = ?").run(id);
  return { deleted: id };
}

/** Full history series for one exercise (for progression charts). */
export function exerciseSeries(exerciseId) {
  return db.prepare(
    `SELECT s.session_date AS date, l.sets, l.reps_per_set, l.weight_lbs
     FROM exercise_logs l JOIN workout_sessions s ON s.id = l.session_id
     WHERE l.exercise_id = ? ORDER BY s.session_date`
  ).all(exerciseId).map((l) => ({ date: l.date, weight_lbs: l.weight_lbs, volume: Math.round(logVolume(l)) }));
}

export function progressSummary(start, end) {
  const s = start || "0000-01-01";
  const e = end || "9999-12-31";
  const sessions = getWorkouts(s, e);
  const totalVolume = sessions.reduce((a, x) => a + x.total_volume, 0);
  const totalLogs = sessions.reduce((a, x) => a + x.logs.length, 0);

  // Per-exercise progression: first vs latest weight, best volume
  const perExercise = {};
  for (const sess of [...sessions].reverse()) {
    for (const log of sess.logs) {
      const p = (perExercise[log.exercise] ||= { count: 0, first_weight: null, last_weight: null, max_weight: null, best_volume: 0, last_date: null });
      p.count += 1;
      if (log.weight_lbs != null) {
        if (p.first_weight == null) p.first_weight = log.weight_lbs;
        p.last_weight = log.weight_lbs;
        p.max_weight = Math.max(p.max_weight ?? 0, log.weight_lbs);
      }
      p.best_volume = Math.max(p.best_volume, log.volume);
      p.last_date = sess.session_date;
    }
  }

  // Volume per ISO week
  const weekly = db
    .prepare(
      `SELECT strftime('%Y-W%W', s.session_date) AS week, COUNT(DISTINCT s.id) AS sessions,
              MIN(s.session_date) AS start_date
       FROM workout_sessions s WHERE s.session_date BETWEEN ? AND ?
       GROUP BY week ORDER BY start_date`
    )
    .all(s, e)
    .map((w) => {
      const vol = sessions
        .filter((x) => x.session_date >= w.start_date && x.session_date < addDays(w.start_date, 7))
        .reduce((a, x) => a + x.total_volume, 0);
      return { ...w, volume: Math.round(vol) };
    });

  return { total_sessions: sessions.length, total_logs: totalLogs, total_volume: Math.round(totalVolume), per_exercise: perExercise, weekly };
}

const addDays = (iso, n) => {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return todayISO(d);
};

/** Legacy lifting-only weekly summaries (replaced by the weekly health review in guides.js). */
export function listWeeklySummaries(limit = 12) {
  return db.prepare("SELECT * FROM weekly_summaries ORDER BY week_start_date DESC LIMIT ?").all(limit);
}
