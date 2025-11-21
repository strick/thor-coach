import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { db } from "./db.js";
import { THOR_PLAN_ID } from "./config.js";

type ExSeed = { name: string; day: number; aliases?: string[] };

/**
 * Initialize database schema (for testing - accepts any Database instance)
 */
export function initializeDatabase(database: Database.Database) {
  database.exec(`
  CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS exercises (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL,
    name TEXT NOT NULL,
    day_of_week INTEGER NOT NULL,
    aliases TEXT NOT NULL DEFAULT '[]',
    FOREIGN KEY(plan_id) REFERENCES plans(id)
  );
  CREATE TABLE IF NOT EXISTS workout_sessions (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL,
    session_date TEXT NOT NULL,
    day_of_week INTEGER NOT NULL,
    llm_provider TEXT,
    llm_model TEXT,
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
  CREATE TABLE IF NOT EXISTS weekly_summaries (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL,
    week_start_date TEXT NOT NULL,
    week_end_date TEXT NOT NULL,
    total_sessions INTEGER NOT NULL DEFAULT 0,
    total_volume REAL NOT NULL DEFAULT 0,
    summary_text TEXT,
    metrics_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(plan_id) REFERENCES plans(id)
  );
  CREATE INDEX IF NOT EXISTS idx_weekly_summaries_dates ON weekly_summaries(week_start_date, week_end_date);

  CREATE TABLE IF NOT EXISTS health_events (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('migraine', 'sleep', 'yardwork', 'run', 'other')),
    intensity INTEGER CHECK(intensity BETWEEN 1 AND 10),
    duration_minutes INTEGER,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_health_events_date ON health_events(date);
  CREATE INDEX IF NOT EXISTS idx_health_events_category ON health_events(category);
  `);
}

/**
 * Seed database with thor plan and exercises (for testing - accepts any Database instance)
 */
export function seedDatabase(database: Database.Database) {
  const thorExists = database.prepare(`SELECT 1 FROM plans WHERE id=?`).get(THOR_PLAN_ID);
  if (thorExists) return;

  database.prepare(`INSERT INTO plans (id,name) VALUES (?,?)`).run(THOR_PLAN_ID, "Thor (Dumbbell-only)");

  const D1: ExSeed[] = [
    { name: "Dumbbell Floor Press", day: 1, aliases: ["DB floor press","floor press"] },
    { name: "Dumbbell Incline Press", day: 1, aliases: ["incline press"] },
    { name: "Dumbbell Flys", day: 1, aliases: ["db fly","flyes"] },
    { name: "Dumbbell Triceps Overhead Extensions", day: 1, aliases: ["tricep OH","OH extensions"] },
    { name: "Push-ups", day: 1, aliases: ["pushups","push ups"] },
    { name: "Leg Raises", day: 1, aliases: ["hanging leg raises","lying leg raises"] },
  ];
  const D2: ExSeed[] = [
    { name: "Dumbbell Bent-Over Rows", day: 2, aliases: ["db rows","bent over rows"] },
    { name: "Dumbbell Romanian Deadlifts", day: 2, aliases: ["RDL","romanian deadlift"] },
    { name: "Dumbbell Reverse Flys", day: 2, aliases: ["reverse fly"] },
    { name: "Dumbbell Bicep Curls", day: 2, aliases: ["db curls","bicep curl"] },
    { name: "Hammer Curls", day: 2, aliases: ["hammer curl"] },
    { name: "Dumbbell Plank Rows", day: 2, aliases: ["renegade rows","plank rows"] },
  ];
  const D3: ExSeed[] = [
    { name: "Dumbbell Goblet Squat", day: 3, aliases: ["goblet squat"] },
    { name: "Dumbbell Bulgarian Split Squat", day: 3, aliases: ["bulgarian split","split squat"] },
    { name: "Dumbbell Step-Ups", day: 3, aliases: ["step ups","stepups"] },
    { name: "Leg Raises", day: 3, aliases: ["leg raise","lying leg raises"] },
    { name: "Russian Twists", day: 3, aliases: ["russian twist"] },
    { name: "Dumbbell Goblet Squat (Alt)", day: 3, aliases: ["goblet alt"] },
  ];
  const D4: ExSeed[] = [
    { name: "Dumbbell Shoulder Press", day: 4, aliases: ["db shoulder press","overhead press"] },
    { name: "Dumbbell Lateral Raises", day: 4, aliases: ["lateral raise","lat raises"] },
    { name: "Dumbbell Front Raises", day: 4, aliases: ["front raise"] },
    { name: "Dumbbell Shrugs", day: 4, aliases: ["shrugs"] },
    { name: "Dumbbell Skull Crushers", day: 4, aliases: ["skull crushers"] },
    { name: "Dumbbell Curls (Accessory)", day: 4, aliases: ["curls accessory"] },
  ];
  const D5: ExSeed[] = [
    { name: "Dumbbell Thrusters", day: 5, aliases: ["thrusters"] },
    { name: "Dumbbell Renegade Rows", day: 5, aliases: ["renegade rows","plank rows"] },
    { name: "Dumbbell Swings", day: 5, aliases: ["kettlebell style swings"] },
  ];

  const all = [...D1, ...D2, ...D3, ...D4, ...D5];
  const ins = database.prepare(`INSERT INTO exercises (id,plan_id,name,day_of_week,aliases) VALUES (?,?,?,?,?)`);
  for (const e of all) {
    ins.run(randomUUID(), THOR_PLAN_ID, e.name, e.day, JSON.stringify(e.aliases ?? []));
  }
}

export function ensureSchemaAndSeed() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS exercises (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL,
    name TEXT NOT NULL,
    day_of_week INTEGER NOT NULL,
    aliases TEXT NOT NULL DEFAULT '[]',
    FOREIGN KEY(plan_id) REFERENCES plans(id)
  );
  CREATE TABLE IF NOT EXISTS workout_sessions (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL,
    session_date TEXT NOT NULL,
    day_of_week INTEGER NOT NULL,
    llm_provider TEXT,
    llm_model TEXT,
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
  CREATE TABLE IF NOT EXISTS weekly_summaries (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL,
    week_start_date TEXT NOT NULL,
    week_end_date TEXT NOT NULL,
    total_sessions INTEGER NOT NULL DEFAULT 0,
    total_volume REAL NOT NULL DEFAULT 0,
    summary_text TEXT,
    metrics_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(plan_id) REFERENCES plans(id)
  );
  CREATE INDEX IF NOT EXISTS idx_weekly_summaries_dates ON weekly_summaries(week_start_date, week_end_date);

  CREATE TABLE IF NOT EXISTS health_events (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('migraine', 'sleep', 'yardwork', 'run', 'other')),
    intensity INTEGER CHECK(intensity BETWEEN 1 AND 10),
    duration_minutes INTEGER,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_health_events_date ON health_events(date);
  CREATE INDEX IF NOT EXISTS idx_health_events_category ON health_events(category);
  `);

  // Migration: Add LLM tracking columns if they don't exist
  const checkColumn = db.prepare(`PRAGMA table_info(workout_sessions)`).all() as Array<{ name: string }>;
  const hasLlmProvider = checkColumn.some(col => col.name === 'llm_provider');
  if (!hasLlmProvider) {
    db.exec(`
      ALTER TABLE workout_sessions ADD COLUMN llm_provider TEXT;
      ALTER TABLE workout_sessions ADD COLUMN llm_model TEXT;
    `);
  }

  const thorExists = db.prepare(`SELECT 1 FROM plans WHERE id=?`).get(THOR_PLAN_ID);
  if (thorExists) return;

  db.prepare(`INSERT INTO plans (id,name) VALUES (?,?)`).run(THOR_PLAN_ID, "Thor (Dumbbell-only)");

  const D1: ExSeed[] = [
    { name: "Dumbbell Floor Press", day: 1, aliases: ["DB floor press","floor press"] },
    { name: "Dumbbell Incline Press", day: 1, aliases: ["incline press"] },
    { name: "Dumbbell Flys", day: 1, aliases: ["db fly","flyes"] },
    { name: "Dumbbell Triceps Overhead Extensions", day: 1, aliases: ["tricep OH","OH extensions"] },
    { name: "Push-ups", day: 1, aliases: ["pushups","push ups"] },
    { name: "Leg Raises", day: 1, aliases: ["hanging leg raises","lying leg raises"] },
  ];
  const D2: ExSeed[] = [
    { name: "Dumbbell Bent-Over Rows", day: 2, aliases: ["db rows","bent over rows"] },
    { name: "Dumbbell Romanian Deadlifts", day: 2, aliases: ["RDL","romanian deadlift"] },
    { name: "Dumbbell Reverse Flys", day: 2, aliases: ["reverse fly"] },
    { name: "Dumbbell Bicep Curls", day: 2, aliases: ["db curls","bicep curl"] },
    { name: "Hammer Curls", day: 2, aliases: ["hammer curl"] },
    { name: "Dumbbell Plank Rows", day: 2, aliases: ["renegade rows","plank rows"] },
  ];
  const D3: ExSeed[] = [
    { name: "Dumbbell Goblet Squat", day: 3, aliases: ["goblet squat"] },
    { name: "Dumbbell Bulgarian Split Squat", day: 3, aliases: ["bulgarian split","split squat"] },
    { name: "Dumbbell Step-Ups", day: 3, aliases: ["step ups","stepups"] },
    { name: "Leg Raises", day: 3, aliases: ["leg raise","lying leg raises"] },
    { name: "Russian Twists", day: 3, aliases: ["russian twist"] },
    { name: "Dumbbell Goblet Squat (Alt)", day: 3, aliases: ["goblet alt"] },
  ];
  const D4: ExSeed[] = [
    { name: "Dumbbell Shoulder Press", day: 4, aliases: ["db shoulder press","overhead press"] },
    { name: "Dumbbell Lateral Raises", day: 4, aliases: ["lateral raise","lat raises"] },
    { name: "Dumbbell Front Raises", day: 4, aliases: ["front raise"] },
    { name: "Dumbbell Shrugs", day: 4, aliases: ["shrugs"] },
    { name: "Dumbbell Skull Crushers", day: 4, aliases: ["skull crushers"] },
    { name: "Dumbbell Curls (Accessory)", day: 4, aliases: ["curls accessory"] },
  ];
  const D5: ExSeed[] = [
    { name: "Dumbbell Thrusters", day: 5, aliases: ["thrusters"] },
    { name: "Dumbbell Renegade Rows", day: 5, aliases: ["renegade rows","plank rows"] },
    { name: "Dumbbell Swings", day: 5, aliases: ["kettlebell style swings"] },
  ];

  const all = [...D1, ...D2, ...D3, ...D4, ...D5];
  const ins = db.prepare(`INSERT INTO exercises (id,plan_id,name,day_of_week,aliases) VALUES (?,?,?,?,?)`);
  for (const e of all) {
    ins.run(randomUUID(), THOR_PLAN_ID, e.name, e.day, JSON.stringify(e.aliases ?? []));
  }
}
