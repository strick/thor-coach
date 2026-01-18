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
    reps_per_set TEXT,
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

  CREATE TABLE IF NOT EXISTS nutrition_goals (
    id TEXT PRIMARY KEY,
    daily_protein_target_g INTEGER,
    max_daily_sodium_mg INTEGER,
    max_daily_saturated_fat_g INTEGER,
    min_daily_fiber_g INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS food_logs (
    id TEXT PRIMARY KEY,
    log_date TEXT NOT NULL,
    description TEXT NOT NULL,
    calories INTEGER,
    protein_g REAL,
    sodium_mg REAL,
    saturated_fat_g REAL,
    fiber_g REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_food_logs_date ON food_logs(log_date);
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
    { name: "Squat Jumps", day: 5, aliases: ["squat jump","jump squat"] },
    { name: "Burpees", day: 5, aliases: ["burpee"] },
    { name: "Mountain Climbers", day: 5, aliases: ["mountain climber"] },
  ];

  const all = [...D1, ...D2, ...D3, ...D4, ...D5];
  const ins = database.prepare(`INSERT INTO exercises (id,plan_id,name,day_of_week,aliases) VALUES (?,?,?,?,?)`);
  for (const e of all) {
    ins.run(randomUUID(), THOR_PLAN_ID, e.name, e.day, JSON.stringify(e.aliases ?? []));
  }
}

export function ensureSchemaAndSeed() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_users_name ON users(name);

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
    reps_per_set TEXT,
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

  CREATE TABLE IF NOT EXISTS nutrition_goals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    daily_protein_target_g INTEGER,
    max_daily_sodium_mg INTEGER,
    max_daily_saturated_fat_g INTEGER,
    min_daily_fiber_g INTEGER,
    max_daily_cholesterol_mg INTEGER,
    max_daily_added_sugar_g INTEGER,
    min_daily_fiber_goal_g INTEGER,
    diet_style TEXT DEFAULT 'DASH',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_nutrition_goals_user ON nutrition_goals(user_id);

  CREATE TABLE IF NOT EXISTS nutrition_days (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    date_local TEXT NOT NULL,
    timezone TEXT DEFAULT 'America/New_York',
    source TEXT DEFAULT 'manual_entry',
    notes TEXT,
    diet_style TEXT DEFAULT 'DASH',
    high_cholesterol BOOLEAN DEFAULT 1,
    high_protein_goal BOOLEAN DEFAULT 1,
    recompute_required BOOLEAN DEFAULT 1,
    last_computed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id),
    UNIQUE(user_id, date_local)
  );
  CREATE INDEX IF NOT EXISTS idx_nutrition_days_date ON nutrition_days(date_local);
  CREATE INDEX IF NOT EXISTS idx_nutrition_days_user ON nutrition_days(user_id);

  CREATE TABLE IF NOT EXISTS nutrition_day_targets (
    id TEXT PRIMARY KEY,
    nutrition_day_id TEXT NOT NULL UNIQUE,
    calories_kcal INTEGER DEFAULT 0,
    protein_g INTEGER,
    fiber_g INTEGER,
    sodium_mg_max INTEGER,
    sat_fat_g_max INTEGER,
    added_sugar_g_max INTEGER,
    cholesterol_mg_max INTEGER,
    FOREIGN KEY(nutrition_day_id) REFERENCES nutrition_days(id)
  );

  CREATE TABLE IF NOT EXISTS nutrition_day_totals (
    id TEXT PRIMARY KEY,
    nutrition_day_id TEXT NOT NULL UNIQUE,
    calories_kcal REAL DEFAULT 0,
    protein_g REAL DEFAULT 0,
    carbs_g REAL DEFAULT 0,
    fat_g REAL DEFAULT 0,
    fiber_g REAL DEFAULT 0,
    sugar_g REAL DEFAULT 0,
    added_sugar_g REAL DEFAULT 0,
    sodium_mg REAL DEFAULT 0,
    sat_fat_g REAL DEFAULT 0,
    cholesterol_mg REAL DEFAULT 0,
    potassium_mg REAL DEFAULT 0,
    calcium_mg REAL DEFAULT 0,
    FOREIGN KEY(nutrition_day_id) REFERENCES nutrition_days(id)
  );

  CREATE TABLE IF NOT EXISTS nutrition_meals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    nutrition_day_id TEXT NOT NULL,
    meal_id TEXT NOT NULL,
    meal_type TEXT NOT NULL CHECK(meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
    time_local TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(nutrition_day_id) REFERENCES nutrition_days(id)
  );
  CREATE INDEX IF NOT EXISTS idx_nutrition_meals_day ON nutrition_meals(nutrition_day_id);
  CREATE INDEX IF NOT EXISTS idx_nutrition_meals_type ON nutrition_meals(meal_type);
  CREATE INDEX IF NOT EXISTS idx_nutrition_meals_user ON nutrition_meals(user_id);

  CREATE TABLE IF NOT EXISTS nutrition_meal_items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    meal_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    food_name TEXT NOT NULL,
    brand TEXT,
    serving_quantity REAL,
    serving_unit TEXT,
    serving_display TEXT,
    calories_kcal REAL DEFAULT 0,
    protein_g REAL DEFAULT 0,
    carbs_g REAL DEFAULT 0,
    fat_g REAL DEFAULT 0,
    fiber_g REAL DEFAULT 0,
    sugar_g REAL DEFAULT 0,
    added_sugar_g REAL DEFAULT 0,
    sodium_mg REAL DEFAULT 0,
    sat_fat_g REAL DEFAULT 0,
    cholesterol_mg REAL DEFAULT 0,
    potassium_mg REAL DEFAULT 0,
    calcium_mg REAL DEFAULT 0,
    high_sodium BOOLEAN DEFAULT 0,
    high_sat_fat BOOLEAN DEFAULT 0,
    processed BOOLEAN DEFAULT 0,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(meal_id) REFERENCES nutrition_meals(id)
  );
  CREATE INDEX IF NOT EXISTS idx_nutrition_meal_items_meal ON nutrition_meal_items(meal_id);
  CREATE INDEX IF NOT EXISTS idx_nutrition_meal_items_user ON nutrition_meal_items(user_id);

  CREATE TABLE IF NOT EXISTS nutrition_meal_totals (
    id TEXT PRIMARY KEY,
    meal_id TEXT NOT NULL UNIQUE,
    calories_kcal REAL DEFAULT 0,
    protein_g REAL DEFAULT 0,
    carbs_g REAL DEFAULT 0,
    fat_g REAL DEFAULT 0,
    fiber_g REAL DEFAULT 0,
    sodium_mg REAL DEFAULT 0,
    sat_fat_g REAL DEFAULT 0,
    cholesterol_mg REAL DEFAULT 0,
    FOREIGN KEY(meal_id) REFERENCES nutrition_meals(id)
  );

  CREATE TABLE IF NOT EXISTS food_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    log_date TEXT NOT NULL,
    description TEXT NOT NULL,
    calories INTEGER,
    protein_g REAL,
    sodium_mg REAL,
    saturated_fat_g REAL,
    fiber_g REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_food_logs_date ON food_logs(log_date);
  CREATE INDEX IF NOT EXISTS idx_food_logs_user ON food_logs(user_id);

  CREATE TABLE IF NOT EXISTS running_sessions (
    id TEXT PRIMARY KEY,
    session_date TEXT NOT NULL,
    start_time TEXT,
    end_time TEXT,
    distance_miles REAL NOT NULL,
    duration_minutes INTEGER NOT NULL,
    pace_min_per_mile REAL,
    elevation_gain_ft INTEGER,
    elevation_loss_ft INTEGER,
    avg_heart_rate INTEGER,
    max_heart_rate INTEGER,
    calories_burned INTEGER,
    weather TEXT,
    surface TEXT CHECK(surface IN ('road', 'trail', 'track', 'treadmill', 'mixed')),
    effort_level TEXT CHECK(effort_level IN ('easy', 'moderate', 'hard', 'tempo')),
    notes TEXT,
    location TEXT,
    gps_file_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_running_sessions_date ON running_sessions(session_date);
  CREATE INDEX IF NOT EXISTS idx_running_sessions_created ON running_sessions(created_at);

  CREATE TABLE IF NOT EXISTS nutrition_templates (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    meal_type TEXT,
    items_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    created_date TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_nutrition_templates_user ON nutrition_templates(user_id);
  `);

  // Initialize default users if they don't exist
  const userCount = db.prepare(`SELECT COUNT(*) as count FROM users`).get() as any;
  if (userCount.count === 0) {
    const mainUserId = 'user-main';
    db.prepare(`INSERT INTO users (id, name, email) VALUES (?, ?, ?)`).run(mainUserId, 'Main User', null);
  }

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
    { name: "Squat Jumps", day: 5, aliases: ["squat jump","jump squat"] },
    { name: "Burpees", day: 5, aliases: ["burpee"] },
    { name: "Mountain Climbers", day: 5, aliases: ["mountain climber"] },
  ];

  const all = [...D1, ...D2, ...D3, ...D4, ...D5];
  const ins = db.prepare(`INSERT INTO exercises (id,plan_id,name,day_of_week,aliases) VALUES (?,?,?,?,?)`);
  for (const e of all) {
    ins.run(randomUUID(), THOR_PLAN_ID, e.name, e.day, JSON.stringify(e.aliases ?? []));
  }
}
