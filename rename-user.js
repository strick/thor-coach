import Database from 'better-sqlite3';

const db = new Database('/app/data/workout.db');
const result = db.prepare('UPDATE users SET name = ? WHERE id = ?').run('ARELCI', '6365e445-593b-4c5f-8787-9c3afd6569f6');
console.log('Updated:', result.changes, 'user(s)');
const user = db.prepare('SELECT * FROM users WHERE id = ?').get('6365e445-593b-4c5f-8787-9c3afd6569f6');
console.log('New user data:', user);

