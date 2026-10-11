// Headache pattern analysis — pure functions, no I/O (the DB loader lives in
// headaches.js). The math is deliberately simple and conservative: per factor,
// compare the headache-day rate on days with vs. without it, with minimum-
// sample guards and a one-sided Fisher exact test. The LLM only narrates this.
import { median, quantile, isHardRun, addDays, round } from "../util.js";
import { classifyMed, OVERUSE_CLASSES, classLabel } from "../data/headacheMeds.js";

export const MIN_EXPOSED = 5;
export const MIN_UNEXPOSED = 5;
export const MIN_HEADACHE_DAYS = 3;

export const CAVEAT =
  "These are associations in your own logs, not proof of cause. With many factors checked at once, some links will show up by chance — trust the ones that keep holding up over time.";

/** Parse a logged meal time ("07:42 AM", "7:42pm", "21:45") to minutes after midnight. */
export function parseMealTime(t) {
  const m = String(t || "").trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ampm = m[3]?.toLowerCase().replace(/\./g, "");
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// --- Fisher exact test (one-sided: exposure raises headache risk) ---------

const logFact = (() => {
  const cache = [0];
  return (n) => {
    for (let i = cache.length; i <= n; i += 1) cache[i] = cache[i - 1] + Math.log(i);
    return cache[n];
  };
})();
const logChoose = (n, k) => logFact(n) - logFact(k) - logFact(n - k);

/**
 * P(X >= a) for the 2x2 table [[a, b], [c, d]] under the hypergeometric null
 * (a = exposed & headache, b = exposed & none, c = unexposed & headache, d = unexposed & none).
 */
export function fisherOneSided(a, b, c, d) {
  const n = a + b; // exposed days
  const K = a + c; // headache days
  const N = a + b + c + d;
  const denom = logChoose(N, n);
  let p = 0;
  for (let x = a; x <= Math.min(n, K); x += 1) {
    if (n - x > N - K) continue;
    p += Math.exp(logChoose(K, x) + logChoose(N - K, n - x) - denom);
  }
  return Math.min(1, p);
}

/** Relative risk with a Haldane (+0.5) correction when any cell is zero. */
export function relativeRisk(a, b, c, d) {
  const k = a && b && c && d ? 0 : 0.5;
  const exposedRate = (a + k) / (a + b + 2 * k);
  const unexposedRate = (c + k) / (c + d + 2 * k);
  return unexposedRate > 0 ? exposedRate / unexposedRate : null;
}

// --- Factors ---------------------------------------------------------------

/**
 * Each factor says on which days it's "known" (tracked) and "exposed".
 * Day records come from headaches.loadDayRecords(); see that for the shape.
 */
export const FACTORS = [
  {
    key: "short_sleep",
    label: "Short sleep (under 6.5 h)",
    source: "check-ins",
    known: (r) => r.sleep_hours != null,
    exposed: (r) => r.sleep_hours < 6.5,
  },
  {
    key: "poor_sleep_quality",
    label: "Poor sleep quality",
    source: "check-ins",
    known: (r) => r.sleep_quality != null,
    exposed: (r) => r.sleep_quality <= 2,
  },
  {
    key: "high_stress",
    label: "High stress (that day or the day before)",
    source: "check-ins",
    known: (r) => r.stress != null || r.prev_stress != null,
    exposed: (r) => r.stress >= 4 || r.prev_stress >= 4,
  },
  {
    key: "caffeine_above_baseline",
    label: "More caffeine than usual",
    source: "check-ins",
    known: (r, ctx) => r.caffeine != null && ctx.caffeineBaseline != null,
    exposed: (r, ctx) => r.caffeine >= ctx.caffeineBaseline + 1.5,
  },
  {
    key: "caffeine_below_baseline",
    label: "Less caffeine than usual (withdrawal)",
    source: "check-ins",
    known: (r, ctx) => r.caffeine != null && ctx.caffeineBaseline != null && ctx.caffeineBaseline >= 1,
    exposed: (r, ctx) => r.caffeine <= ctx.caffeineBaseline - 1,
  },
  {
    key: "alcohol_prior_day",
    label: "2+ drinks the day before",
    source: "check-ins",
    known: (r) => r.prev_alcohol != null,
    exposed: (r) => r.prev_alcohol >= 2,
  },
  {
    key: "sodium_over_target",
    label: "Sodium over your limit (that day or the day before)",
    source: "food logs",
    known: (r) => r.sodium_over != null || r.prev_sodium_over != null,
    exposed: (r) => r.sodium_over === true || r.prev_sodium_over === true,
  },
  {
    key: "water_under_goal",
    label: "Water under 75% of goal",
    source: "water logs",
    known: (r) => r.water_ratio != null,
    exposed: (r) => r.water_ratio < 0.75,
  },
  {
    key: "skipped_or_late_first_meal",
    label: "No breakfast, or first meal after 11:00",
    source: "food logs",
    lowConfidence: "Based on when meals were logged, not when you ate.",
    known: (r) => r.meals_logged >= 2,
    exposed: (r) => !r.has_breakfast || (r.first_meal_minutes != null && r.first_meal_minutes >= 660),
  },
  {
    key: "heavy_lifting_day",
    label: "Heavy lifting day (top 25% volume)",
    source: "workouts",
    known: () => true,
    exposed: (r, ctx) => r.lifting_volume != null && ctx.liftingP75 != null && r.lifting_volume >= ctx.liftingP75,
  },
  {
    key: "long_or_hard_run",
    label: "Long or hard run",
    source: "runs",
    known: () => true,
    exposed: (r, ctx) =>
      (r.runs || []).some(
        (run) =>
          (ctx.longRunMiles != null && run.distance_miles >= ctx.longRunMiles) ||
          isHardRun(run, { hrMax: ctx.hrMax, medianPace: ctx.medianPace })
      ),
  },
];

const STRENGTH_ORDER = { strong: 0, possible: 1, no_clear_link: 2, insufficient: 3 };

/**
 * @param {object[]} records one per day in the window (see headaches.loadDayRecords)
 * @param {{ hrMax?: number }} [opts]
 */
export function analyzeHeadacheFactors(records, { hrMax = null } = {}) {
  const caffeineDays = records.map((r) => r.caffeine).filter((x) => x != null);
  const allRuns = records.flatMap((r) => r.runs || []);
  const medianRun = median(allRuns.map((r) => r.distance_miles));
  const ctx = {
    caffeineBaseline: caffeineDays.length >= 10 ? median(caffeineDays) : null,
    liftingP75: quantile(records.map((r) => r.lifting_volume).filter((v) => v > 0), 0.75),
    longRunMiles: medianRun != null ? Math.max(1.5 * medianRun, 6) : null,
    medianPace: median(allRuns.map((r) => r.pace_min_per_mile)),
    hrMax,
  };

  const factors = FACTORS.map((f) => {
    let a = 0, b = 0, c = 0, d = 0;
    for (const r of records) {
      if (!f.known(r, ctx)) continue;
      const exposed = Boolean(f.exposed(r, ctx));
      if (exposed && r.headache) a += 1;
      else if (exposed) b += 1;
      else if (r.headache) c += 1;
      else d += 1;
    }
    const exposedDays = a + b;
    const unexposedDays = c + d;
    const headacheDays = a + c;
    const base = {
      key: f.key,
      label: f.label,
      source: f.source,
      low_confidence: f.lowConfidence,
      exposed: { days: exposedDays, headache_days: a, rate: exposedDays ? round(a / exposedDays, 3) : null },
      unexposed: { days: unexposedDays, headache_days: c, rate: unexposedDays ? round(c / unexposedDays, 3) : null },
    };
    if (exposedDays < MIN_EXPOSED || unexposedDays < MIN_UNEXPOSED || headacheDays < MIN_HEADACHE_DAYS) {
      return {
        ...base,
        strength: "insufficient",
        needs:
          `Needs more ${f.source}: at least ${MIN_EXPOSED} days with it, ${MIN_UNEXPOSED} without, ` +
          `and ${MIN_HEADACHE_DAYS} headache days among them (now ${exposedDays} / ${unexposedDays} / ${headacheDays}).`,
      };
    }
    const rr = relativeRisk(a, b, c, d);
    const p = fisherOneSided(a, b, c, d);
    const strength = rr >= 2 && p < 0.05 ? "strong" : rr >= 1.5 && p < 0.2 ? "possible" : "no_clear_link";
    return { ...base, strength, relative_risk: round(rr, 2), p_value: round(p, 3) };
  }).sort((x, y) => STRENGTH_ORDER[x.strength] - STRENGTH_ORDER[y.strength] || (y.relative_risk ?? 0) - (x.relative_risk ?? 0));

  return {
    days: records.length,
    headache_days: records.filter((r) => r.headache).length,
    factors,
    caveat: CAVEAT,
  };
}

// --- Medication overuse (ICHD-3 8.2) --------------------------------------

const SPECIFIC = ["triptan", "ergot", "opioid", "combination"];
const LIMITS = { warn: { specific: 10, simple: 15, mixed: 10 }, watch: { specific: 8, simple: 12, mixed: 8 } };

function classDays(headaches, start, end) {
  const days = {}; // class -> Set(date)
  for (const h of headaches) {
    for (const m of h.meds || []) {
      const cls = classifyMed(m.name);
      const when = /^\d{4}-\d{2}-\d{2}/.test(m.time || "") ? m.time.slice(0, 10) : h.date;
      if (when < start || when > end) continue;
      (days[cls] ??= new Set()).add(when);
    }
  }
  return days;
}

/** Per-class day counts plus days on which any overuse-class medicine was taken. */
function tally(days, divisor = 1) {
  const counts = Object.fromEntries(Object.entries(days).map(([k, s]) => [k, Math.round(s.size / divisor)]));
  const used = OVERUSE_CLASSES.filter((k) => days[k]?.size);
  const anyDays = Math.round(new Set(used.flatMap((k) => [...days[k]])).size / divisor);
  return { counts, used: used.length, anyDays };
}

function levelFor({ counts, used, anyDays }, limits) {
  const count = (k) => counts[k] || 0;
  const reasons = [];
  for (const k of SPECIFIC) if (count(k) >= limits.specific) reasons.push(`${classLabel(k)} on ${count(k)} days`);
  if (count("simple") >= limits.simple) reasons.push(`${classLabel("simple")} on ${count("simple")} days`);
  if (!reasons.length && used >= 2 && anyDays >= limits.mixed) reasons.push(`a mix of ${used} kinds on ${anyDays} days`);
  return { hit: reasons.length > 0, reasons };
}

/**
 * @param {object[]} headaches entries with parsed `meds` arrays and `date`
 * @param {string} end last day of the window (YYYY-MM-DD)
 */
export function analyzeMedicationOveruse(headaches, end) {
  const start30 = addDays(end, -29);
  const last30 = tally(classDays(headaches, start30, end));
  const warn = levelFor(last30, LIMITS.warn);
  const watch = levelFor(last30, LIMITS.watch);
  // "Sustained": the 90-day monthly average is over the line too.
  const sustained = levelFor(tally(classDays(headaches, addDays(end, -89), end), 3), LIMITS.warn).hit;

  const status = warn.hit ? "warn" : watch.hit ? "watch" : "ok";
  const n = last30.anyDays;
  const message =
    status === "warn"
      ? `You've taken acute headache medicine on ${n} of the last 30 days (${warn.reasons.join("; ")}). Using these medicines this often can itself keep headaches going (medication-overuse headache). This is worth discussing with your doctor — don't stop a prescribed medicine on your own.`
      : status === "watch"
        ? `Acute headache medicine on ${n} of the last 30 days — getting close to the range where medication-overuse headache becomes a concern. Worth keeping an eye on.`
        : null;
  return {
    status,
    message,
    sustained: status === "warn" ? sustained : false,
    window: `${start30}..${end}`,
    acute_med_days_30d: n,
    days_by_class_30d: last30.counts,
  };
}

/** Headache days per Monday-start week for the last `weeks` weeks ending at `end`. */
export function headacheDaysByWeek(headacheDates, end, weeks = 12) {
  const set = new Set(headacheDates);
  const out = [];
  const lastMonday = addDays(end, -((new Date(end + "T12:00:00").getDay() || 7) - 1));
  for (let w = weeks - 1; w >= 0; w -= 1) {
    const start = addDays(lastMonday, -7 * w);
    let n = 0;
    for (let i = 0; i < 7; i += 1) {
      const day = addDays(start, i);
      if (day > end) break;
      if (set.has(day)) n += 1;
    }
    out.push({ week_of: start, headache_days: n });
  }
  return out;
}
