/**
 * Vitest global setup file
 * Runs before all tests
 */

import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.TZ = 'America/New_York';

// Global test setup
beforeAll(async () => {
  // Global setup logic (if needed)
});

afterAll(async () => {
  // Global cleanup logic (if needed)
});
