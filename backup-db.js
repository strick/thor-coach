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
const BACKUP_DIR = "/mnt/g/backups"; // WSL mount point for G:\
const RETENTION_DAYS = 30;
const CONTAINER_NAME = "thor-api"; // Docker container name
const DB_CONTAINER_PATH = "/app/data/workout.db";
const DB_LOCAL_PATH = "/home/strick/projects/thor/apps/thor-api/workout.db";

let DB_PATH = null;
let USE_DOCKER = false;

/**
 * Find the actual running container (try different names)
 */
function findRunningContainer() {
  const containerNames = ["thor-api", "thor_api", "thor-api-1", "thor_api_1"];
  
  for (const name of containerNames) {
    try {
      const output = execSync(`docker ps --filter "name=${name}" --format "{{.Names}}"`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
      if (output.length > 0) {
        console.log(`Found Docker container: ${output}`);
        return output;
      }
    } catch (error) {
      // Continue to next name
    }
  }
  
  return null;
}

/**
 * Check if Docker container is running
 */
function isContainerRunning() {
  try {
    const foundContainer = findRunningContainer();
    if (foundContainer) {
      // Update the container name to the actual running one
      module.exports = { CONTAINER_NAME: foundContainer };
      return true;
    }
    return false;
  } catch (error) {
    console.log("Docker check failed:", error.message);
    return false;
  }
}

/**
 * Detect the database path and method (Docker or local)
 */
function detectDatabase() {
  // First, try to find running Docker container
  const container = findRunningContainer();
  if (container) {
    console.log(`Found running Docker container: ${container}`);
    USE_DOCKER = true;
    // Update global container name
    globalThis.ACTUAL_CONTAINER = container;
    return true;
  }

  // Fall back to local database if it exists
  if (fs.existsSync(DB_LOCAL_PATH)) {
    console.log(`Found local database at: ${DB_LOCAL_PATH}`);
    DB_PATH = DB_LOCAL_PATH;
    USE_DOCKER = false;
    return true;
  }

  console.warn(
    `No database found: container not running and no local database at ${DB_LOCAL_PATH}`
  );
  return false;
}

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
 * Generate backup directory name with timestamp
 */
function getBackupDirName() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  return `workout-backup-${year}${month}${day}-${hours}${minutes}${seconds}`;
}

/**
 * Backup database from Docker container using docker cp
 */
function backupFromDocker() {
  const backupDirName = getBackupDirName();
  const backupDir = path.join(BACKUP_DIR, backupDirName);
  const containerName = globalThis.ACTUAL_CONTAINER || CONTAINER_NAME;

  try {
    // Create backup directory
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
      console.log(`Created backup directory: ${backupDir}`);
    }

    const backupPath = path.join(backupDir, "workout.db");
    const backupWalPath = path.join(backupDir, "workout.db-wal");
    const backupShmPath = path.join(backupDir, "workout.db-shm");

    console.log(`Copying database from Docker container ${containerName}...`);
    console.log(`Source: ${containerName}:${DB_CONTAINER_PATH}`);
    console.log(`Destination: ${backupDir}/`);
    
    // Backup the main database file
    let cmd = `docker cp ${containerName}:${DB_CONTAINER_PATH} ${backupPath}`;
    try {
      execSync(cmd, { encoding: "utf-8", stdio: "pipe" });
    } catch (error) {
      console.log("Retrying with sudo...");
      cmd = `sudo docker cp ${containerName}:${DB_CONTAINER_PATH} ${backupPath}`;
      execSync(cmd, { encoding: "utf-8", stdio: "pipe" });
    }
    
    // Backup WAL file if it exists (contains active transactions)
    const walPath = `${DB_CONTAINER_PATH}-wal`;
    try {
      console.log(`Copying WAL file...`);
      cmd = `docker cp ${containerName}:${walPath} ${backupWalPath}`;
      try {
        execSync(cmd, { encoding: "utf-8", stdio: "pipe" });
      } catch (error) {
        execSync(`sudo docker cp ${containerName}:${walPath} ${backupWalPath}`, { 
          encoding: "utf-8", 
          stdio: "pipe" 
        });
      }
    } catch (error) {
      console.log("WAL file not found or couldn't be copied (this is ok)");
    }
    
    // Backup SHM file if it exists (shared memory)
    const shmPath = `${DB_CONTAINER_PATH}-shm`;
    try {
      console.log(`Copying SHM file...`);
      cmd = `docker cp ${containerName}:${shmPath} ${backupShmPath}`;
      try {
        execSync(cmd, { encoding: "utf-8", stdio: "pipe" });
      } catch (error) {
        execSync(`sudo docker cp ${containerName}:${shmPath} ${backupShmPath}`, { 
          encoding: "utf-8", 
          stdio: "pipe" 
        });
      }
    } catch (error) {
      console.log("SHM file not found or couldn't be copied (this is ok)");
    }
    
    // Verify files were created
    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup file not created at ${backupPath}`);
    }
    
    let totalSize = 0;
    const stats = fs.statSync(backupPath);
    totalSize += stats.size;
    console.log(`  ✓ Main DB: workout.db (${stats.size} bytes)`);
    
    if (fs.existsSync(backupWalPath)) {
      const walStats = fs.statSync(backupWalPath);
      totalSize += walStats.size;
      console.log(`  ✓ WAL file: workout.db-wal (${walStats.size} bytes)`);
    }
    
    if (fs.existsSync(backupShmPath)) {
      const shmStats = fs.statSync(backupShmPath);
      totalSize += shmStats.size;
      console.log(`  ✓ SHM file: workout.db-shm (${shmStats.size} bytes)`);
    }
    
    if (totalSize === 0) {
      throw new Error(`All backup files are empty`);
    }
    
    console.log(`✓ Database backed up to: ${backupDir} (${totalSize} bytes total)`);
    return true;
  } catch (error) {
    console.error(`Docker backup failed: ${error.message}`);
    return false;
  }
}

/**
 * Backup database from local filesystem
 */
function backupFromLocal() {
  const backupDirName = getBackupDirName();
  const backupDir = path.join(BACKUP_DIR, backupDirName);

  try {
    // Create backup directory
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
      console.log(`Created backup directory: ${backupDir}`);
    }

    const backupPath = path.join(backupDir, "workout.db");
    const backupWalPath = path.join(backupDir, "workout.db-wal");
    const backupShmPath = path.join(backupDir, "workout.db-shm");

    console.log(`Copying local database from ${DB_PATH}...`);
    fs.copyFileSync(DB_PATH, backupPath);
    console.log(`✓ Database backed up to: ${backupDir}`);

    // Copy WAL and SHM files if they exist (for consistency)
    if (fs.existsSync(`${DB_PATH}-wal`)) {
      fs.copyFileSync(`${DB_PATH}-wal`, backupWalPath);
      console.log(`  ✓ WAL file backed up`);
    }
    if (fs.existsSync(`${DB_PATH}-shm`)) {
      fs.copyFileSync(`${DB_PATH}-shm`, backupShmPath);
      console.log(`  ✓ SHM file backed up`);
    }

    return true;
  } catch (error) {
    console.error(`Local backup failed: ${error.message}`);
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

      // Check if it's a directory (backup folder)
      if (stat.isDirectory()) {
        if (now - stat.mtime.getTime() > retentionMs) {
          // Remove entire backup directory
          fs.rmSync(filePath, { recursive: true, force: true });
          console.log(`Deleted old backup directory: ${file}`);
        }
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

    // Detect database location and method
    if (!detectDatabase()) {
      console.warn(
        `[${new Date().toISOString()}] No database found - skipping backup`
      );
      process.exit(0);
    }

    // Backup using appropriate method
    const success = USE_DOCKER ? backupFromDocker() : backupFromLocal();

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
