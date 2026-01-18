/**
 * Migration: Reorder Friday exercises
 * New order: Squat Jumps, Burpees, Mountain Climbers
 * 
 * Run with: docker exec -e NODE_ENV=production thor-api node /app/migrations/002-reorder-friday-exercises.js
 */

import Database from 'better-sqlite3';

const dbPath = process.env.NODE_ENV === 'production' 
  ? '/app/data/workout.db' 
  : 'workout.db';

const db = new Database(dbPath);

try {
  const THOR_PLAN_ID = 'thor';

  // Get the IDs of the three exercises we need to reorder
  const getExercises = db.prepare(`
    SELECT id, name FROM exercises 
    WHERE plan_id = ? AND name IN ('Squat Jumps', 'Burpees', 'Mountain Climbers')
  `);
  
  const exercises = getExercises.all(THOR_PLAN_ID);
  
  if (exercises.length !== 3) {
    console.log('✗ Could not find all three exercises to reorder');
    process.exit(1);
  }

  // Delete the three exercises in their old order
  const deleteStmt = db.prepare(`DELETE FROM exercises WHERE id = ?`);
  for (const ex of exercises) {
    deleteStmt.run(ex.id);
  }
  console.log('✓ Deleted exercises for re-insertion');

  // Re-insert in the new order: Squat Jumps, Burpees, Mountain Climbers
  const insertStmt = db.prepare(`
    INSERT INTO exercises (id, plan_id, name, day_of_week, aliases) 
    VALUES (?, ?, ?, ?, ?)
  `);

  const newOrder = [
    { id: exercises.find(e => e.name === 'Squat Jumps').id, name: 'Squat Jumps', aliases: '["squat jump","jump squat"]' },
    { id: exercises.find(e => e.name === 'Burpees').id, name: 'Burpees', aliases: '["burpee"]' },
    { id: exercises.find(e => e.name === 'Mountain Climbers').id, name: 'Mountain Climbers', aliases: '["mountain climber"]' }
  ];

  for (const ex of newOrder) {
    insertStmt.run(ex.id, THOR_PLAN_ID, ex.name, 5, ex.aliases);
    console.log(`✓ Re-inserted: ${ex.name}`);
  }

  console.log('\n✓ Migration completed successfully!');
  console.log('Friday exercises reordered: Thrusters → Renegade Rows → Swings → Squat Jumps → Burpees → Mountain Climbers');
  
  process.exit(0);
} catch (error) {
  console.error('✗ Migration failed:', error);
  process.exit(1);
}
