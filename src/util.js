// Small pure helpers shared by services (dates, stats, run effort). No I/O.
import { todayISO } from "./config.js";

export const addDays = (iso, n) => {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return todayISO(d);
};

/** Monday of the week containing `iso`. */
export function weekStartOf(iso) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() - ((d.getDay() || 7) - 1));
  return todayISO(d);
}

/** Whole days from a to b (b - a). */
export const daysBetween = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86_400_000);

export const round = (n, digits = 0) => {
  if (n == null || !Number.isFinite(Number(n))) return null;
  const f = 10 ** digits;
  return Math.round(Number(n) * f) / f;
};

export const avg = (values) => {
  const v = values.filter((x) => x != null && Number.isFinite(Number(x))).map(Number);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

export function median(values) {
  return quantile(values, 0.5);
}

export function quantile(values, q) {
  const v = values.filter((x) => x != null && Number.isFinite(Number(x))).map(Number).sort((a, b) => a - b);
  if (!v.length) return null;
  const pos = (v.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}

/**
 * Strava never sets effort_level, so "hard" comes from heart rate (avg ≥ 85%
 * of max) or, without HR, pace at least 8% faster than the runner's median.
 */
export function isHardRun(run, { hrMax, medianPace } = {}) {
  if (run.effort_level) return ["hard", "tempo"].includes(run.effort_level);
  if (hrMax && run.avg_heart_rate) return run.avg_heart_rate >= 0.85 * hrMax;
  if (medianPace && run.pace_min_per_mile) return run.pace_min_per_mile <= medianPace * 0.92;
  return false;
}

/** Local "YYYY-MM-DDTHH:MM" for a Date. */
export function localDateTime(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${todayISO(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Minutes between two local "YYYY-MM-DDTHH:MM" strings (b - a), or null. */
export function minutesBetween(a, b) {
  if (!a || !b) return null;
  const ms = new Date(b) - new Date(a);
  return Number.isFinite(ms) ? Math.round(ms / 60_000) : null;
}
