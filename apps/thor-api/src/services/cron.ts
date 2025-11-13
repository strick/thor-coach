import cron from "node-cron";
import { generateWeeklySummary } from "./weekly-summary.js";
import { THOR_PLAN_ID } from "../config.js";

/**
 * Initialize cron jobs for the application
 */
export function initializeCronJobs() {
  // Weekly summary generation: Every Sunday at 6:00 PM
  // Cron format: second minute hour day-of-month month day-of-week
  // '0 18 * * 0' = At 18:00 (6 PM) on Sunday
  const weeklySummaryCron = cron.schedule('0 18 * * 0', async () => {
    console.log(`[CRON] Running weekly summary generation at ${new Date().toISOString()}`);
    try {
      const summaryId = await generateWeeklySummary(THOR_PLAN_ID);
      console.log(`[CRON] Weekly summary generated successfully: ${summaryId}`);
    } catch (error) {
      console.error('[CRON] Failed to generate weekly summary:', error);
    }
  }, {
    timezone: "America/New_York" // Change this to your timezone
  });

  console.log("✓ Cron jobs initialized");
  console.log("  - Weekly summary: Sundays at 6:00 PM");

  return {
    weeklySummaryCron
  };
}

/**
 * Manually trigger weekly summary generation (useful for testing)
 */
export async function triggerWeeklySummary(planId: string = THOR_PLAN_ID): Promise<string> {
  console.log(`[MANUAL] Generating weekly summary for plan: ${planId}`);
  try {
    const summaryId = await generateWeeklySummary(planId);
    console.log(`[MANUAL] Weekly summary generated successfully: ${summaryId}`);
    return summaryId;
  } catch (error) {
    console.error('[MANUAL] Failed to generate weekly summary:', error);
    throw error;
  }
}
