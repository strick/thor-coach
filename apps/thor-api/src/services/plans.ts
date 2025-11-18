import { db } from "../db.js";
import type { ExRow } from "../models.js";

export function getDayExercises(planId: string, dow: number) {
  return db.prepare<unknown[], ExRow>(`SELECT * FROM exercises WHERE plan_id=? AND day_of_week=?`).all(planId, dow);
}

export function normalizeExercise(input: string, candidates: ExRow[]): { match?: ExRow; normalized?: string } {
  const needle = input.toLowerCase().trim();
  for (const c of candidates) if (c.name.toLowerCase() === needle) return { match: c, normalized: c.name };
  for (const c of candidates) {
    const aliases: string[] = JSON.parse(c.aliases || "[]");
    if (aliases.some(a => a.toLowerCase() === needle)) return { match: c, normalized: c.name };
  }
  for (const c of candidates) {
    if (c.name.toLowerCase().includes(needle)) return { match: c, normalized: c.name };
  }
  return {};
}

export const toISODate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
export const getDOW = (d: Date) => (d.getDay() === 0 ? 7 : d.getDay()); // 1..7
