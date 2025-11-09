import express from "express";
import 'dotenv/config';
import Database from "better-sqlite3";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USE_LLM = Boolean(process.env.OPENAI_API_KEY);

// ---------- Config ----------
const PORT = process.env.PORT || 3000;

// ---------- DB ----------
const db = new Database("workout.db");
db.pragma("journal_mode = WAL");

// Schema (idempotent)
db.exec(`
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exercises (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  name TEXT NOT NULL,
  day_of_week INTEGER NOT NULL, -- 1=Mon ... 7=Sun
  aliases TEXT NOT NULL DEFAULT '[]',
  FOREIGN KEY(plan_id) REFERENCES plans(id)
);

CREATE TABLE IF NOT EXISTS workout_sessions (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  session_date TEXT NOT NULL,   -- ISO date "YYYY-MM-DD"
  day_of_week INTEGER NOT NULL, -- 1..7
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(plan_id) REFERENCES plans(id)
);

CREATE TABLE IF NOT EXISTS exercise_logs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  sets INTEGER,
  reps_per_set INTEGER,
  weight_lbs REAL,
  notes TEXT,
  FOREIGN KEY(session_id) REFERENCES workout_sessions(id),
  FOREIGN KEY(exercise_id) REFERENCES exercises(id)
);
`);

// ---------- Seed Thor Plan ----------
type ExSeed = { name: string; day: number; aliases?: string[] };

const THOR_PLAN_ID = "thor";
const thorExists = db.prepare(`SELECT 1 FROM plans WHERE id=?`).get(THOR_PLAN_ID);
if (!thorExists) {
  db.prepare(`INSERT INTO plans (id,name) VALUES (?,?)`).run(THOR_PLAN_ID, "Thor (Dumbbell-only)");
  const D1: ExSeed[] = [
    { name: "Dumbbell Floor Press", day: 1, aliases: ["DB floor press", "floor press"] },
    { name: "Dumbbell Incline Press", day: 1, aliases: ["incline press"] },
    { name: "Dumbbell Flys", day: 1, aliases: ["db fly", "flyes"] },
    { name: "Dumbbell Triceps Overhead Extensions", day: 1, aliases: ["tricep OH", "OH extensions"] },
    { name: "Push-ups", day: 1, aliases: ["pushups", "push ups"] },
    { name: "Leg Raises", day: 1, aliases: ["hanging leg raises", "lying leg raises"] },
  ];
  const D2: ExSeed[] = [
    { name: "Dumbbell Bent-Over Rows", day: 2, aliases: ["db rows", "bent over rows"] },
    { name: "Dumbbell Romanian Deadlifts", day: 2, aliases: ["RDL", "romanian deadlift"] },
    { name: "Dumbbell Reverse Flys", day: 2, aliases: ["reverse fly"] },
    { name: "Dumbbell Bicep Curls", day: 2, aliases: ["db curls", "bicep curl"] },
    { name: "Hammer Curls", day: 2, aliases: ["hammer curl"] },
    { name: "Dumbbell Plank Rows", day: 2, aliases: ["renegade rows", "plank rows"] },
  ];
  const D3: ExSeed[] = [
    { name: "Dumbbell Goblet Squat", day: 3, aliases: ["goblet squat"] },
    { name: "Dumbbell Bulgarian Split Squat", day: 3, aliases: ["bulgarian split", "split squat"] },
    { name: "Dumbbell Step-Ups", day: 3, aliases: ["step ups", "stepups"] },
    { name: "Leg Raises", day: 3, aliases: ["leg raise", "lying leg raises"] },
    { name: "Russian Twists", day: 3, aliases: ["russian twist"] },
    { name: "Dumbbell Goblet Squat (Alt)", day: 3, aliases: ["goblet alt"] },
  ];
  const D4: ExSeed[] = [
    { name: "Dumbbell Shoulder Press", day: 4, aliases: ["db shoulder press", "overhead press"] },
    { name: "Dumbbell Lateral Raises", day: 4, aliases: ["lateral raise", "lat raises"] },
    { name: "Dumbbell Front Raises", day: 4, aliases: ["front raise"] },
    { name: "Dumbbell Shrugs", day: 4, aliases: ["shrugs"] },
    { name: "Dumbbell Skull Crushers", day: 4, aliases: ["skull crushers"] },
    { name: "Dumbbell Curls (Accessory)", day: 4, aliases: ["curls accessory"] },
  ];
  const D5: ExSeed[] = [
    { name: "Dumbbell Thrusters", day: 5, aliases: ["thrusters"] },
    { name: "Dumbbell Renegade Rows", day: 5, aliases: ["renegade rows", "plank rows"] },
    { name: "Dumbbell Swings", day: 5, aliases: ["kettlebell style swings"] },
  ];

  const all: ExSeed[] = [...D1, ...D2, ...D3, ...D4, ...D5];
  const ins = db.prepare(`INSERT INTO exercises (id,plan_id,name,day_of_week,aliases) VALUES (?,?,?,?,?)`);
  const uuid = () => randomUUID();
  for (const e of all) {
    ins.run(uuid(), THOR_PLAN_ID, e.name, e.day, JSON.stringify(e.aliases ?? []));
  }
}

// ---------- Utilities ----------
const toISODate = (d: Date) => d.toISOString().slice(0,10);
const getDOW = (d: Date) => {
  const js = d.getDay(); // 0..6, Sun=0
  return js === 0 ? 7 : js; // 1..7, Mon..Sun
};

type ParsedLog = {
  exercise: string;
  sets?: number;
  reps?: number;
  weight_lbs?: number;
  notes?: string;
};

const IngestReq = z.object({
  text: z.string().min(3),
  date: z.string().optional(), // YYYY-MM-DD, optional
  planId: z.string().optional().default(THOR_PLAN_ID)
});

// ---------- Day Tool ----------
function getDayExercises(planId: string, dow: number) {
  return db.prepare(`SELECT * FROM exercises WHERE plan_id=? AND day_of_week=?`).all(planId, dow) as any[];
}

function normalizeExercise(input: string, candidates: any[]): { match?: any; normalized?: string } {
  const needle = input.toLowerCase().trim();
  // exact name
  for (const c of candidates) if (c.name.toLowerCase() === needle) return { match: c, normalized: c.name };
  // alias match
  for (const c of candidates) {
    const aliases: string[] = JSON.parse(c.aliases || "[]");
    if (aliases.some(a => a.toLowerCase() === needle)) return { match: c, normalized: c.name };
  }
  // contains
  for (const c of candidates) {
    if (c.name.toLowerCase().includes(needle)) return { match: c, normalized: c.name };
  }
  return {};
}

const USE_OLLAMA = process.env.USE_OLLAMA === "true";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1:8b";

async function parseWithOllama(system: string, user: string) {
  const resp = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      format: "json",           // forces JSON output
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      options: { temperature: 0 }
    })
  });
  
  if (!resp.ok) throw new Error(`ollama ${resp.status}`);
  // Ollama returns {message:{content: "...json..."}} for format:json
  const data = await resp.json();
  const content = data?.message?.content || "{}";
  return JSON.parse(content);
}

// ---------- Parser (Model-only; supports OpenAI or local Ollama) ----------
async function parseFreeform(text: string, planId: string, dow: number): Promise<ParsedLog[]> {
  if (!USE_LLM) throw new Error("Must use LLM parser");

  // Normalize UK currency symbol to lbs for the model
  const normalizedText = text.replace(/£\s*/g, "").replace(/\bpounds?\b/gi, " lbs");

  const USE_OLLAMA = process.env.USE_OLLAMA === "true";
  const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
  const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1:8b";

  const valid = getDayExercises(planId, dow).map(e => e.name);
  const exerciseMatchProp =
    valid.length > 0
      ? { type: "string", enum: valid, description: "Choose the closest from the provided valid list" }
      : { type: "string", description: "Exercise name" };

  const sys = `
You are a precise workout log parser.
Return a JSON object exactly like:
{"items":[{"exercise_free":string,"exercise_match":string,"sets":number,"reps_per_set":number|null,"variable_reps":number[]|null,"weight_lbs":number|null,"notes":string|null}]}
Rules:
- One item per exercise (no merging).
- Map typos to the closest valid exercise from the provided list.
- Understand: "4 * 12 floor press @45", "4x9 with 35 lbs incline", "3x10 with 30 lbs flys",
  "3x12 with 35 lbs trciep overhead", "11, 8, 5 push ups", "12x 3 leg raises".
- If comma reps given, set variable_reps=[...], reps_per_set=rounded average.
- Output ONLY valid JSON (no markdown, no prose).`.trim();

  const user = `
Valid exercises for today (choose closest for exercise_match):
${valid.join("; ")}

Text:
${normalizedText}
`.trim();

  function normalizeItems(items: any[]): ParsedLog[] {
    return (items || []).map((i: any) => {
      let reps = i?.reps_per_set;
      if ((reps === null || reps === undefined) && Array.isArray(i?.variable_reps) && i.variable_reps.length) {
        const sum = i.variable_reps.reduce((a: number, b: number) => a + b, 0);
        reps = Math.round(sum / i.variable_reps.length);
      }
      return {
        exercise: i.exercise_match,
        sets: i.sets ?? undefined,
        reps: reps ?? undefined,
        weight_lbs: i.weight_lbs ?? undefined,
        notes: Array.isArray(i?.variable_reps) && i.variable_reps.length
          ? `reps_per_set=${JSON.stringify(i.variable_reps)}`
          : (i.notes ?? undefined),
      } as ParsedLog;
    });
  }

  if (USE_OLLAMA) {
    // Ask Ollama for a SINGLE JSON object (no streaming)
    const resp = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        format: "json",
        stream: false,                                  // <— critical
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user }
        ],
        options: { temperature: 0 }
      })
    });

    // Some Ollama builds may still return NDJSON; handle both.
    const raw = await resp.text();
    if (!resp.ok) throw new Error(`Ollama ${resp.status}: ${raw}`);

    let parsedContent = "";
    try {
      // Preferred: single JSON payload with message.content
      const data = JSON.parse(raw);
      parsedContent = data?.message?.content || "{}";
    } catch {
      // Fallback: NDJSON — concatenate message.content chunks
      const parts: string[] = [];
      for (const line of raw.split(/\r?\n/)) {
        const t = line.trim();
        if (!t) continue;
        try {
          const j = JSON.parse(t);
          if (j?.message?.content) parts.push(j.message.content);
        } catch { /* ignore non-JSON lines */ }
      }
      parsedContent = parts.join("");
    }

    const parsed = JSON.parse(parsedContent || "{}") as { items?: any[] };
    if (!parsed?.items || !Array.isArray(parsed.items)) {
      throw new Error("Model returned no items (Ollama)");
    }
    return normalizeItems(parsed.items);
  }

  // --- OpenAI path (unchanged, with strict schema then json_object fallback) ---
  const { OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  const schema = {
    name: "workout_parse",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              exercise_free:  { type: "string" },
              exercise_match: exerciseMatchProp,
              sets:           { type: "integer", minimum: 1 },
              reps_per_set:   { type: ["integer", "null"] },
              variable_reps:  { type: ["array", "null"], items: { type: "integer", minimum: 1 } },
              weight_lbs:     { type: ["number", "null"] },
              notes:          { type: ["string", "null"] }
            },
            required: ["exercise_free","exercise_match","sets","reps_per_set","variable_reps","weight_lbs","notes"]
          }
        }
      },
      required: ["items"]
    },
    strict: true
  } as const;

  try {
    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_schema", json_schema: schema },
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      temperature: 0
    });
    const content = resp.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as { items?: any[] };
    if (!parsed?.items || !Array.isArray(parsed.items)) throw new Error("Model returned no items (schema)");
    return normalizeItems(parsed.items);
  } catch {
    const resp2 = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      temperature: 0
    });
    const content2 = resp2.choices[0]?.message?.content ?? "{}";
    const parsed2 = JSON.parse(content2) as { items?: any[] };
    if (!parsed2?.items || !Array.isArray(parsed2.items)) throw new Error("Model returned no items (json_object)");
    return normalizeItems(parsed2.items);
  }
}



// ---------- Main Agent Orchestrator ----------
async function handleIngest(text: string, dateISO?: string, planId = THOR_PLAN_ID) {
  const date = dateISO ? new Date(dateISO + "T12:00:00") : new Date();
  const dow = getDOW(date);
  const dayExercises = getDayExercises(planId, dow);

  const parsed = await parseFreeform(text, planId, dow);

  // create session
  const sessionId = randomUUID();
  db.prepare(`
    INSERT INTO workout_sessions (id,plan_id,session_date,day_of_week)
    VALUES (?,?,?,?)
  `).run(sessionId, planId, toISODate(date), dow);

  const insertLog = db.prepare(`
    INSERT INTO exercise_logs (id,session_id,exercise_id,sets,reps_per_set,weight_lbs,notes)
    VALUES (?,?,?,?,?,?,?)
  `);

  const results: any[] = [];
  for (const item of parsed) {
    const { match, normalized } = normalizeExercise(item.exercise, dayExercises);
    if (!match) {
      results.push({ status: "skipped_unknown_exercise", input: item.exercise });
      continue;
    }
    insertLog.run(
      randomUUID(),
      sessionId,
      match.id,
      item.sets ?? null,
      item.reps ?? null,
      item.weight_lbs ?? null,
      item.notes ?? null
    );
    results.push({ status: "logged", exercise: normalized, sets: item.sets, reps: item.reps, weight_lbs: item.weight_lbs });
  }

  return { sessionId, date: toISODate(date), day_of_week: dow, results };
}

// ---------- API ----------
const app = express();
app.use(express.json());

// Ingest endpoint
app.post("/ingest", async (req, res) => {
  const parsed = IngestReq.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  try {
    const out = await handleIngest(parsed.data.text, parsed.data.date, parsed.data.planId);
    res.json(out);
  } catch (e:any) {
    console.error(e);
    res.status(500).json({ error: e.message || "ingest_failed" });
  }
});

// Get exercises for a DOW
app.get("/day/:dow", (req, res) => {
  const dow = parseInt(req.params.dow, 10);
  if (Number.isNaN(dow) || dow < 1 || dow > 7) return res.status(400).json({ error: "dow must be 1..7" });
  const rows = getDayExercises(THOR_PLAN_ID, dow).map(r => ({ id: r.id, name: r.name, aliases: JSON.parse(r.aliases || "[]") }));
  res.json({ planId: THOR_PLAN_ID, dow, exercises: rows });
});

// Progress summary
app.get("/progress/summary", (req, res) => {
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

app.use(express.static(path.join(__dirname, "..", "public")));

app.listen(PORT, () => {
  console.log(`Workout MVP API listening on http://localhost:${PORT}`);
  console.log(`POST /ingest with { "text": "Incline press 4x12 @25; Flys 3x12", "date": "2025-11-08" }`);
});
