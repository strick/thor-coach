import express from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { exec } from "child_process";
import { promisify } from "util";

type Request = express.Request;
type Response = express.Response;

const execAsync = promisify(exec);

export const runTests = asyncHandler(async (req: Request, res: Response) => {
  try {
    const { stdout, stderr } = await execAsync('npm test 2>&1', {
      cwd: process.cwd(),
      timeout: 120000,
    });

    // Parse the output to extract test results
    const output = stdout + stderr;
    const testsPassed = output.match(/(\d+) passed/)?.[1] || '0';
    const testsFailed = output.match(/(\d+) failed/)?.[1] || '0';
    const duration = output.match(/Duration\s+([\d.]+s)/)?.[1] || 'unknown';

    res.json({
      success: !output.includes('FAIL'),
      passed: parseInt(testsPassed),
      failed: parseInt(testsFailed),
      duration,
      output,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    // Even if tests fail, we want to return the results
    const output = error.stdout + error.stderr;
    const testsPassed = output.match(/(\d+) passed/)?.[1] || '0';
    const testsFailed = output.match(/(\d+) failed/)?.[1] || '0';
    const duration = output.match(/Duration\s+([\d.]+s)/)?.[1] || 'unknown';

    res.json({
      success: false,
      passed: parseInt(testsPassed),
      failed: parseInt(testsFailed),
      duration,
      output,
      timestamp: new Date().toISOString(),
    });
  }
});

export const getTestStatus = asyncHandler(async (req: Request, res: Response) => {
  res.json({
    testsConfigured: true,
    testCommand: 'npm test',
    testFramework: 'vitest',
    lastRun: 'Run /api/tests/run to execute tests',
  });
});
