/**
 * Daily Summary Storage Layer
 * Handles persisting and retrieving summaries from SQLite
 */

import { db } from "../../db.js";
import type { DailySummaryOutput } from "@thor/shared";

/**
 * Store a daily summary (insert or replace)
 */
export function storeDailySummary(summary: DailySummaryOutput): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO daily_summaries (date, markdown, sections, generated_at)
    VALUES (?, ?, ?, ?)
  `);

  stmt.run(
    summary.date,
    summary.markdown,
    JSON.stringify(summary.sections),
    summary.generatedAt
  );

  console.log(`[Daily Summary] Stored summary for ${summary.date}`);
}

/**
 * Get a daily summary by date
 */
export function getDailySummary(date: string): DailySummaryOutput | null {
  const stmt = db.prepare(`
    SELECT date, markdown, sections, generated_at
    FROM daily_summaries
    WHERE date = ?
  `);

  const row = stmt.get(date) as {
    date: string;
    markdown: string;
    sections: string;
    generated_at: string;
  } | undefined;

  if (!row) {
    return null;
  }

  return {
    date: row.date,
    markdown: row.markdown,
    sections: JSON.parse(row.sections),
    generatedAt: row.generated_at
  };
}

/**
 * Get recent daily summaries
 */
export function getRecentDailySummaries(limit: number = 10): DailySummaryOutput[] {
  const stmt = db.prepare(`
    SELECT date, markdown, sections, generated_at
    FROM daily_summaries
    ORDER BY date DESC
    LIMIT ?
  `);

  const rows = stmt.all(limit) as Array<{
    date: string;
    markdown: string;
    sections: string;
    generated_at: string;
  }>;

  return rows.map((row) => ({
    date: row.date,
    markdown: row.markdown,
    sections: JSON.parse(row.sections),
    generatedAt: row.generated_at
  }));
}

/**
 * Delete a daily summary (for cleanup/privacy)
 */
export function deleteDailySummary(date: string): boolean {
  const stmt = db.prepare("DELETE FROM daily_summaries WHERE date = ?");
  const result = stmt.run(date);
  return (result.changes ?? 0) > 0;
}
