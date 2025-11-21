/**
 * Database initialization tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDb, type TestDatabase } from '../helpers/db.js';

describe('Database Initialization', () => {
  let testDb: TestDatabase;

  beforeEach(() => {
    testDb = setupTestDb();
  });

  afterEach(() => {
    testDb.cleanup();
  });

  it('should create plans table', () => {
    const tables = testDb.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='plans'
    `).all();

    expect(tables).toHaveLength(1);
  });

  it('should create exercises table', () => {
    const tables = testDb.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='exercises'
    `).all();

    expect(tables).toHaveLength(1);
  });

  it('should create workout_sessions table', () => {
    const tables = testDb.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='workout_sessions'
    `).all();

    expect(tables).toHaveLength(1);
  });

  it('should create exercise_logs table', () => {
    const tables = testDb.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='exercise_logs'
    `).all();

    expect(tables).toHaveLength(1);
  });

  it('should create health_events table', () => {
    const tables = testDb.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='health_events'
    `).all();

    expect(tables).toHaveLength(1);
  });

  it('should create weekly_summaries table', () => {
    const tables = testDb.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='weekly_summaries'
    `).all();

    expect(tables).toHaveLength(1);
  });

  it('should have foreign key constraints on exercise_logs', () => {
    const foreignKeys = testDb.db.prepare(`
      PRAGMA foreign_key_list(exercise_logs)
    `).all();

    expect(foreignKeys.length).toBeGreaterThan(0);
  });

  it('should have default values for timestamps', () => {
    const testId = 'test-session-' + Date.now();
    testDb.db.prepare(`
      INSERT INTO workout_sessions (id, plan_id, session_date, day_of_week)
      VALUES (?, 'thor', '2025-11-19', 2)
    `).run(testId);

    const session = testDb.db.prepare(`
      SELECT created_at FROM workout_sessions WHERE id = ?
    `).get(testId) as { created_at: string };

    expect(session).toBeTruthy();
    expect(session.created_at).toBeTruthy();
  });
});
