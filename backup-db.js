#!/usr/bin/env node

/**
 * Database Backup Script
 * Backs up the SQLite database to G:\backups (Windows path)
 * Runs daily via cron job
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
// Check if running in Docker or locally
let DB_PATH = "/app/data/workout.db";
let DB_WAL_PATH = "/app/data/workout.db-wal";
let DB_SHM_PATH = "/app/data/workout.db-shm";

// Try local path if running outside Docker
if (
  !fs.existsSync(DB_PATH) &&
  fs.existsSync("/home/strick/projects/thor/apps/thor-api/workout.db")
) {
  DB_PATH = "/home/strick/projects/thor/apps/thor-api/workout.db";
  DB_WAL_PATH = `${DB_PATH}-wal`;
  DB_SHM_PATH = `${DB_PATH}-shm`;
} else if (!fs.existsSync(DB_PATH)) {
  // Try to access from Docker volume mount
  const volumePath = "/var/lib/docker/volumes/thor-data/_data/workout.db";
  if (fs.existsSync(volumePath)) {
    DB_PATH = volumePath;
    DB_WAL_PATH = `${DB_PATH}-wal`;
    DB_SHM_PATH = `${DB_PATH}-shm`;
  }
}

const BACKUP_DIR = "/mnt/g/backups"; // WSL mount point for G:\
const RETENTION_DAYS = 30;

/**
 * Create backup directory if it doesn't exist
 */
function ensureBackupDir() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      console.log(`Created backup directory: ${BACKUP_DIR}`);
    }
  } catch (error) {
    console.error(`Failed to create backup directory: ${error.message}`);
    throw error;
  }
}

/**
 * Generate backup filename with timestamp
 */
function getBackupFileName() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  return `workout-backup-${year}${month}${day}-${hours}${minutes}${seconds}.db`;
}

/**
 * Create backup of the database
 */
function backupDatabase() {
  const backupFileName = getBackupFileName();
  const backupPath = path.join(BACKUP_DIR, backupFileName);

  try {
    // Check if source database exists
    if (!fs.existsSync(DB_PATH)) {
      console.warn(
        `Database not found at ${DB_PATH} - this is normal if the application hasn't started yet`
      );
      console.log(`Backup directory verified at: ${BACKUP_DIR}`);
      return true; // Don't fail, just log
    }

    // Copy the main database file
    fs.copyFileSync(DB_PATH, backupPath);
    console.log(`Database backed up to: ${backupPath}`);

    // Copy WAL and SHM files if they exist (for consistency)
    if (fs.existsSync(DB_WAL_PATH)) {
      fs.copyFileSync(DB_WAL_PATH, `${backupPath}-wal`);
      console.log(`  - WAL file backed up`);
    }
    if (fs.existsSync(DB_SHM_PATH)) {
      fs.copyFileSync(DB_SHM_PATH, `${backupPath}-shm`);
      console.log(`  - SHM file backed up`);
    }

    return true;
  } catch (error) {
    console.error(`Backup failed: ${error.message}`);
    return false;
  }
}

/**
 * Clean up old backups (older than RETENTION_DAYS)
 */
function cleanupOldBackups() {
  try {
    const files = fs.readdirSync(BACKUP_DIR);
    const now = Date.now();
    const retentionMs = RETENTION_DAYS * 24 * 60 * 60 * 1000;

    files.forEach((file) => {
      const filePath = path.join(BACKUP_DIR, file);
      const stat = fs.statSync(filePath);

      if (now - stat.mtime.getTime() > retentionMs) {
        fs.unlinkSync(filePath);
        console.log(`Deleted old backup: ${file}`);
      }
    });
  } catch (error) {
    console.error(`Cleanup failed: ${error.message}`);
  }
}

/**
 * Main backup process
 */
function main() {
  console.log(`\n[${new Date().toISOString()}] Starting database backup...`);

  try {
    ensureBackupDir();
    const success = backupDatabase();

    if (success) {
      cleanupOldBackups();
      console.log(
        `[${new Date().toISOString()}] Backup completed successfully\n`
      );
      process.exit(0);
    } else {
      console.log(
        `[${new Date().toISOString()}] Backup completed with errors\n`
      );
      process.exit(1);
    }
  } catch (error) {
    console.error(
      `[${new Date().toISOString()}] Backup process failed: ${error.message}\n`
    );
    process.exit(1);
  }
}

main();
