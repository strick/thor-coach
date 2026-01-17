import Database from 'better-sqlite3';

const db = new Database('/var/lib/docker/volumes/thor-data/_data/workout.db');
db.exec('CREATE TABLE IF NOT EXISTS exercises (id INTEGER PRIMARY KEY, name TEXT)');
db.exec('INSERT INTO exercises (name) VALUES ("Test Exercise")');
console.log('Valid SQLite database created');
db.close();
