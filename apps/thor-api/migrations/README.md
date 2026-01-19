# Database Migrations

This directory contains all database schema migrations for the Thor API.

## Running Migrations

### Local Development

```bash
# Run a specific migration
node migrations/003-add-daily-summaries-table.js

# Or use the provided helper script
./run-migration.sh thor-api migrations/003-add-daily-summaries-table.js
```

### Docker

```bash
# Run migration inside running container
docker exec thor-api node migrations/003-add-daily-summaries-table.js
```

## Available Migrations

### 001-add-friday-exercises.js
Adds Mountain Climbers, Burpees, and Squat Jumps to Friday workouts.

### 002-reorder-friday-exercises.js
Reorders Friday exercises for optimal workout flow.

### 003-add-daily-summaries-table.js
Creates the `daily_summaries` table for storing generated daily AI summaries.

**Schema:**
```sql
CREATE TABLE daily_summaries (
  date TEXT PRIMARY KEY,
  markdown TEXT NOT NULL,
  sections JSON NOT NULL,
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_daily_summaries_date ON daily_summaries(date DESC);
```

## Migration Best Practices

1. **Idempotent**: All migrations check if the change already exists before applying
2. **Reversible**: Consider how to reverse the migration if needed
3. **Tested**: Run migrations locally before deploying to production
4. **Documented**: Include a description of what the migration does

## Adding New Migrations

When adding a new migration:

1. Create a new file: `NNN-description.js` (increment the number)
2. Follow the pattern from existing migrations
3. Include error handling and idempotency checks
4. Test locally: `node migrations/NNN-description.js`
5. Document in this file
