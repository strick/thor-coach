/**
 * Migration: Add daily_summaries table for Daily Summary AI Report feature
 * 
 * Creates table to store generated daily summaries with markdown and structured sections
 * Run with: node migrations/003-add-daily-summaries-table.js
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use the same path as the main application
const dbPath = process.env.NODE_ENV === 'production' 
  ? '/app/data/workout.db' 
  : path.join(__dirname, '..', 'workout.db');

const db = new Database(dbPath);

try {
  // Check if table already exists
  const tableExists = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='daily_summaries'
  `).get();

  if (tableExists) {
    console.log('✓ daily_summaries table already exists, skipping migration');
    process.exit(0);
  }

  // Create the daily_summaries table
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_summaries (
      date TEXT PRIMARY KEY,
      markdown TEXT NOT NULL,
      sections JSON NOT NULL,
      generated_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_daily_summaries_date ON daily_summaries(date DESC);
  `);

  console.log('✓ Successfully created daily_summaries table');
  process.exit(0);
} catch (error) {
  console.error('✗ Migration failed:', error.message);
  process.exit(1);
} finally {
  db.close();
}
