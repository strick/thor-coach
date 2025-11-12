import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IngestReq } from "../models.js";
import { handleIngest } from "../services/ingest.js";
import { getDayExercises } from "../services/plans.js";
import { db } from "../db.js";
import { THOR_PLAN_ID } from "../config.js";
import { USE_OLLAMA, OLLAMA_MODEL, OLLAMA_URL, OPENAI_API_KEY } from "../config.js";
import { getWeeklySummaries, getWeeklySummary } from "../services/weekly-summary.js";
import { triggerWeeklySummary } from "../services/cron.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const router = express.Router();

router.post("/ingest", async (req, res) => {
  const parsed = IngestReq.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  try {
    const out = await handleIngest(parsed.data.text, parsed.data.date, parsed.data.planId);
    res.json(out);
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message || "ingest_failed" });
  }
});

router.get("/day/:dow", (req, res) => {
  const dow = parseInt(req.params.dow, 10);
  if (Number.isNaN(dow) || dow < 1 || dow > 7) return res.status(400).json({ error: "dow must be 1..7" });
  const rows = getDayExercises(THOR_PLAN_ID, dow).map((r: any) => {
    // Get last session data for this exercise
    const lastSession = db.prepare(`
      SELECT l.sets, l.reps_per_set, l.weight_lbs, s.session_date
      FROM exercise_logs l
      JOIN workout_sessions s ON s.id = l.session_id
      WHERE l.exercise_id = ?
      ORDER BY s.session_date DESC
      LIMIT 1
    `).get(r.id);

    return {
      id: r.id,
      name: r.name,
      aliases: JSON.parse(r.aliases || "[]"),
      lastSession: lastSession || null
    };
  });
  res.json({ planId: THOR_PLAN_ID, dow, exercises: rows });
});

router.get("/progress/summary", (req, res) => {
  const from = (req.query.from as string) || "1970-01-01";
  const to = (req.query.to as string) || "2999-12-31";

  const sessions = db.prepare(`
    SELECT session_date, COUNT(*) AS logs
    FROM workout_sessions s
    JOIN exercise_logs l ON l.session_id = s.id
    WHERE s.session_date BETWEEN ? AND ?
    GROUP BY session_date
    ORDER BY session_date DESC
  `).all(from, to);

  const topLifts = db.prepare(`
    SELECT e.name, COUNT(*) AS cnt
    FROM exercise_logs l
    JOIN workout_sessions s ON s.id = l.session_id
    JOIN exercises e ON e.id = l.exercise_id
    WHERE s.session_date BETWEEN ? AND ?
    GROUP BY e.name
    ORDER BY cnt DESC
    LIMIT 10
  `).all(from, to);

  const recent = db.prepare(`
    SELECT s.session_date, e.name, l.sets, l.reps_per_set, l.weight_lbs
    FROM exercise_logs l
    JOIN workout_sessions s ON s.id = l.session_id
    JOIN exercises e ON e.id = l.exercise_id
    WHERE s.session_date BETWEEN ? AND ?
    ORDER BY s.session_date DESC
    LIMIT 50
  `).all(from, to);

  res.json({ sessions, topLifts, recent });
});

// ...

// Healthcheck
router.get("/health", (req, res) => {
  try {
    // cheap DB ping
    db.prepare("select 1").get();
    res.json({ status: "ok" });
  } catch (e: any) {
    res.status(500).json({ status: "error", error: e?.message || "db_unavailable" });
  }
});

// Runtime config (safe subset)
router.get("/config", (req, res) => {
  res.json({
    llm: USE_OLLAMA ? "ollama" : (OPENAI_API_KEY ? "openai" : "none"),
    ollama: USE_OLLAMA ? { model: OLLAMA_MODEL, url: OLLAMA_URL } : null,
    openai: OPENAI_API_KEY ? { enabled: true } : null,
    port: req.app.get("port") ?? undefined
  });
});

// Get available Ollama models
router.get("/ollama/models", async (req, res) => {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!response.ok) {
      return res.status(500).json({ error: "Failed to fetch Ollama models" });
    }
    const data = await response.json();
    res.json({ models: data.models || [] });
  } catch (e: any) {
    console.error("Failed to fetch Ollama models:", e);
    res.status(500).json({ error: e.message || "Failed to connect to Ollama" });
  }
});

// in routes/index.ts
// Get workouts by date
router.get("/workouts", (req, res) => {
  const date = (req.query.date as string);

  if (date) {
    // Get workouts for specific date
    const sessions = db.prepare(`
      SELECT s.id, s.session_date, s.day_of_week, s.created_at
      FROM workout_sessions s
      WHERE s.session_date = ?
      ORDER BY s.created_at DESC
    `).all(date);

    const workouts = sessions.map((session: any) => {
      const logs = db.prepare(`
        SELECT l.id, e.name as exercise, l.sets, l.reps_per_set, l.weight_lbs, l.notes
        FROM exercise_logs l
        JOIN exercises e ON e.id = l.exercise_id
        WHERE l.session_id = ?
      `).all(session.id);

      return { ...session, exercises: logs };
    });

    res.json({ date, workouts });
  } else {
    // Get recent workouts (last 30 days)
    const from = new Date(Date.now() - 29*24*60*60*1000).toISOString().slice(0,10);
    const to = new Date().toISOString().slice(0,10);

    const sessions = db.prepare(`
      SELECT s.id, s.session_date, s.day_of_week, COUNT(l.id) as exercise_count
      FROM workout_sessions s
      LEFT JOIN exercise_logs l ON l.session_id = s.id
      WHERE s.session_date BETWEEN ? AND ?
      GROUP BY s.id
      ORDER BY s.session_date DESC
    `).all(from, to);

    res.json({ from, to, sessions });
  }
});

// Update an exercise log (inline editing)
router.patch("/exercise-logs/:logId", (req, res) => {
  const { logId } = req.params;
  const { sets, reps_per_set, weight_lbs, notes } = req.body;

  try {
    const updateStmt = db.prepare(`
      UPDATE exercise_logs
      SET sets = COALESCE(?, sets),
          reps_per_set = COALESCE(?, reps_per_set),
          weight_lbs = COALESCE(?, weight_lbs),
          notes = COALESCE(?, notes)
      WHERE id = ?
    `);

    const result = updateStmt.run(sets, reps_per_set, weight_lbs, notes, logId);

    if (result.changes === 0) {
      return res.status(404).json({ error: "log_not_found" });
    }

    const updated = db.prepare("SELECT * FROM exercise_logs WHERE id = ?").get(logId);
    res.json({ status: "updated", log: updated });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message || "update_failed" });
  }
});

// Delete a specific workout session
router.delete("/workouts/:sessionId", (req, res) => {
  const { sessionId } = req.params;

  try {
    // Delete exercise logs first (foreign key constraint)
    const deleteLogsStmt = db.prepare("DELETE FROM exercise_logs WHERE session_id = ?");
    const deleteSessionStmt = db.prepare("DELETE FROM workout_sessions WHERE id = ?");

    const tx = db.transaction(() => {
      deleteLogsStmt.run(sessionId);
      const result = deleteSessionStmt.run(sessionId);
      return result.changes;
    });

    const changes = tx();

    if (changes === 0) {
      return res.status(404).json({ error: "session_not_found" });
    }

    res.json({ status: "deleted", sessionId });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message || "delete_failed" });
  }
});

// Get exercise history for a specific exercise
router.get("/exercises/:exerciseId/history", (req, res) => {
  const { exerciseId } = req.params;
  const limit = parseInt(req.query.limit as string, 10) || 50;

  try {
    const exercise = db.prepare("SELECT * FROM exercises WHERE id = ?").get(exerciseId);

    if (!exercise) {
      return res.status(404).json({ error: "exercise_not_found" });
    }

    const history = db.prepare(`
      SELECT l.id, l.sets, l.reps_per_set, l.weight_lbs, l.notes, s.session_date, s.day_of_week
      FROM exercise_logs l
      JOIN workout_sessions s ON s.id = l.session_id
      WHERE l.exercise_id = ?
      ORDER BY s.session_date DESC
      LIMIT ?
    `).all(exerciseId, limit);

    // Calculate stats
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_sessions,
        SUM(l.sets) as total_sets,
        MAX(l.weight_lbs) as max_weight,
        AVG(l.weight_lbs) as avg_weight,
        SUM(l.sets * l.reps_per_set * l.weight_lbs) as total_volume
      FROM exercise_logs l
      WHERE l.exercise_id = ?
    `).get(exerciseId);

    res.json({ exercise, history, stats });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message || "fetch_failed" });
  }
});

// Get list of all exercises
router.get("/exercises", (req, res) => {
  const planId = (req.query.planId as string) || THOR_PLAN_ID;
  const dow = req.query.dow ? parseInt(req.query.dow as string, 10) : null;

  let exercises;
  if (dow !== null) {
    exercises = db.prepare("SELECT * FROM exercises WHERE plan_id = ? AND day_of_week = ? ORDER BY name").all(planId, dow);
  } else {
    exercises = db.prepare("SELECT * FROM exercises WHERE plan_id = ? ORDER BY day_of_week, name").all(planId);
  }

  res.json({ planId, exercises });
});

router.post("/admin/clear-logs", (req, res) => {
  db.exec("DELETE FROM exercise_logs; DELETE FROM workout_sessions; VACUUM;");
  res.json({ status: "cleared_logs" });
});

// Weekly summaries
router.get("/weekly-summaries", (req, res) => {
  const planId = (req.query.planId as string) || THOR_PLAN_ID;
  const limit = parseInt(req.query.limit as string, 10) || 10;
  try {
    const summaries = getWeeklySummaries(planId, limit);
    res.json({ planId, summaries });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message || "failed_to_fetch_summaries" });
  }
});

router.get("/weekly-summaries/:id", (req, res) => {
  try {
    const summary = getWeeklySummary(req.params.id);
    if (!summary) {
      return res.status(404).json({ error: "summary_not_found" });
    }
    // Parse metrics_json for better response
    const parsed = {
      ...summary,
      metrics: JSON.parse(summary.metrics_json)
    };
    res.json(parsed);
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message || "failed_to_fetch_summary" });
  }
});

router.post("/weekly-summaries/generate", async (req, res) => {
  const planId = req.body.planId || THOR_PLAN_ID;
  try {
    const summaryId = await triggerWeeklySummary(planId);
    const summary = getWeeklySummary(summaryId);
    res.json({ summaryId, summary });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message || "failed_to_generate_summary" });
  }
});

// Static UI
router.use(express.static(path.join(__dirname, "..", "..", "public")));
