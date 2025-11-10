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
  const rows = getDayExercises(THOR_PLAN_ID, dow).map((r: any) => ({ id: r.id, name: r.name, aliases: JSON.parse(r.aliases || "[]") }));
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

// in routes/index.ts
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
