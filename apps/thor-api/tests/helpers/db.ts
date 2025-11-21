/**
 * Database test helper
 * Provides in-memory SQLite database for testing
 */

import Database from 'better-sqlite3';
import { initializeDatabase, seedDatabase } from '../../src/seed.js';

export interface TestDatabase {
  db: Database.Database;
  cleanup: () => void;
}

/**
 * Create an in-memory test database
 */
export function setupTestDb(): TestDatabase {
  const db = new Database(':memory:');

  // Initialize schema
  initializeDatabase(db);

  // Seed with test data
  seedDatabase(db);

  return {
    db,
    cleanup: () => {
      db.close();
    },
  };
}

/**
 * Clear all data from tables (except seed data)
 */
export function clearTestData(db: Database.Database): void {
  db.prepare('DELETE FROM weekly_summaries').run();
  db.prepare('DELETE FROM exercise_logs').run();
  db.prepare('DELETE FROM workout_sessions').run();
  db.prepare('DELETE FROM health_events').run();
}

/**
 * Get count of records in a table
 */
export function getTableCount(db: Database.Database, tableName: string): number {
  const result = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get() as { count: number };
  return result.count;
}

/**
 * Insert a test workout session
 */
export function insertTestWorkoutSession(db: Database.Database, data: {
  planId?: string;
  sessionDate?: string;
  dayOfWeek?: number;
  llmProvider?: string;
  llmModel?: string;
}): number {
  const {
    planId = 'thor',
    sessionDate = new Date().toISOString().split('T')[0],
    dayOfWeek = new Date().getDay() || 7,
    llmProvider = 'test',
    llmModel = 'test-model',
  } = data;

  const result = db.prepare(`
    INSERT INTO workout_sessions (plan_id, session_date, day_of_week, llm_provider, llm_model)
    VALUES (?, ?, ?, ?, ?)
  `).run(planId, sessionDate, dayOfWeek, llmProvider, llmModel);

  return result.lastInsertRowid as number;
}

/**
 * Insert a test exercise log
 */
export function insertTestExerciseLog(db: Database.Database, data: {
  sessionId: number;
  exerciseId: number;
  sets?: number;
  reps?: string;
  weight?: number;
  notes?: string;
}): number {
  const {
    sessionId,
    exerciseId,
    sets = 4,
    reps = '12',
    weight = 45,
    notes = null,
  } = data;

  const result = db.prepare(`
    INSERT INTO exercise_logs (session_id, exercise_id, sets, reps, weight_lbs, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(sessionId, exerciseId, sets, reps, weight, notes);

  return result.lastInsertRowid as number;
}

/**
 * Insert a test health event
 */
export function insertTestHealthEvent(db: Database.Database, data: {
  eventDate?: string;
  category?: string;
  durationMinutes?: number | null;
  intensity?: number | null;
  notes?: string | null;
}): number {
  const {
    eventDate = new Date().toISOString().split('T')[0],
    category = 'sleep',
    durationMinutes = 480,
    intensity = null,
    notes = null,
  } = data;

  const result = db.prepare(`
    INSERT INTO health_events (event_date, category, duration_minutes, intensity, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(eventDate, category, durationMinutes, intensity, notes);

  return result.lastInsertRowid as number;
}
