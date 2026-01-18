/**
 * Migration: Add Mountain Climbers, Burpees, and Squat Jumps to Friday workouts
 * 
 * Run with: node migrations/001-add-friday-exercises.js
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

// Use the same path as the main application
const dbPath = process.env.NODE_ENV === 'production' 
  ? '/app/data/workout.db' 
  : 'workout.db';

const db = new Database(dbPath);

// The three new exercises for Friday (day 5)
const newExercises = [
  {
    name: 'Mountain Climbers',
    day: 5,
    aliases: ['mountain climber']
  },
  {
    name: 'Burpees',
    day: 5,
    aliases: ['burpee']
  },
  {
    name: 'Squat Jumps',
    day: 5,
    aliases: ['squat jump', 'jump squat']
  }
];

try {
  const THOR_PLAN_ID = 'thor';

  // Check if exercises already exist
  const stmt = db.prepare(`
    SELECT COUNT(*) as count FROM exercises 
    WHERE plan_id = ? AND name IN (?, ?, ?)
  `);
  
  const result = stmt.get(THOR_PLAN_ID, ...newExercises.map(e => e.name));
  
  if (result.count > 0) {
    console.log('✓ Exercises already exist, skipping migration');
    process.exit(0);
  }

  // Insert the new exercises
  const insertStmt = db.prepare(`
    INSERT INTO exercises (id, plan_id, name, day_of_week, aliases) 
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const exercise of newExercises) {
    insertStmt.run(
      randomUUID(),
      THOR_PLAN_ID,
      exercise.name,
      exercise.day,
      JSON.stringify(exercise.aliases)
    );
    console.log(`✓ Added: ${exercise.name}`);
  }

  console.log('\n✓ Migration completed successfully!');
  console.log('Friday now has 6 exercises: Thrusters, Renegade Rows, Swings, Mountain Climbers, Burpees, Squat Jumps');
  
  process.exit(0);
} catch (error) {
  console.error('✗ Migration failed:', error);
  process.exit(1);
}
