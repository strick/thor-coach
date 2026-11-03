// Safety messages that must stay visible until you dismiss them: "get care now"
// for a headache logged with warning signs (last 3 days), and critical lab
// values (reports from the last 30 days). Dismissals live in app_settings, so
// they hold across devices and the installed app.
import { db, getSetting, setSetting } from "../db.js";
import { DEFAULT_USER_ID, todayISO } from "../config.js";
import { HttpError } from "../http.js";
import { addDays } from "../util.js";
import { RED_FLAGS, SEEK_CARE_MESSAGE } from "./headaches.js";

const DISMISSED_KEY = "alerts.dismissed";
const KEY_RE = /^(headache|lab):[A-Za-z0-9_-]{1,80}$/;

function dismissedSet() {
  try {
    return new Set(JSON.parse(getSetting(DISMISSED_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

const parse = (s) => {
  try {
    return JSON.parse(s || "[]");
  } catch {
    return [];
  }
};

export function activeAlerts(userId = DEFAULT_USER_ID, today = todayISO()) {
  const gone = dismissedSet();
  const alerts = [];

  const headaches = db
    .prepare(
      `SELECT id, date, started_at, red_flags FROM headaches
       WHERE user_id = ? AND date >= ? AND red_flags IS NOT NULL AND red_flags NOT IN ('', '[]')
       ORDER BY date DESC, COALESCE(started_at, created_at) DESC`
    )
    .all(userId, addDays(today, -2));
  for (const h of headaches) {
    const key = `headache:${h.id}`;
    const flags = parse(h.red_flags);
    if (gone.has(key) || !flags.length) continue;
    alerts.push({
      key,
      kind: "headache_red_flags",
      title: "Please get care now",
      message: SEEK_CARE_MESSAGE,
      items: flags.map((k) => RED_FLAGS.find(([x]) => x === k)?.[1] || k),
      dismiss_label: "Dismiss",
      href: `health.html?edit=${h.id}#headaches`,
      date: h.date,
    });
  }

  const critical = db
    .prepare(
      `SELECT r.id AS report_id, r.collected_on, x.name_on_report, x.value_num, x.value_text, x.unit
       FROM lab_results x JOIN lab_reports r ON r.id = x.report_id
       WHERE r.user_id = ? AND x.flag IN ('critical_low', 'critical_high')
         AND COALESCE(r.collected_on, substr(r.created_at, 1, 10)) >= ?
       ORDER BY r.created_at DESC, x.sort_order`
    )
    .all(userId, addDays(today, -30));
  const byReport = new Map();
  for (const row of critical) {
    if (!byReport.has(row.report_id)) byReport.set(row.report_id, []);
    byReport.get(row.report_id).push(row);
  }
  for (const [reportId, rows] of byReport) {
    const key = `lab:${reportId}`;
    if (gone.has(key)) continue;
    const values = rows.map((r) => `${r.name_on_report} ${r.value_num ?? r.value_text ?? ""} ${r.unit ?? ""}`.replace(/\s+/g, " ").trim());
    alerts.push({
      key,
      kind: "critical_lab",
      title: "Critical result: contact your doctor",
      message: `${values.join(", ")}. Contact your doctor promptly if you haven't heard from them.`,
      items: [],
      dismiss_label: "I've contacted my doctor",
      href: `labs.html#report-${reportId}`,
      date: rows[0].collected_on,
      report_id: reportId,
    });
  }
  return { alerts };
}

export function dismissAlert(key) {
  if (!KEY_RE.test(String(key || ""))) throw new HttpError(400, "Unknown alert");
  const set = dismissedSet();
  set.add(key);
  setSetting(DISMISSED_KEY, JSON.stringify([...set].slice(-300)));
  return { dismissed: key };
}
