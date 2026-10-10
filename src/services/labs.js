// Blood work: upload (PDF/photo) or paste → AI transcription → you review and
// confirm → trends, latest values, and context for advice. Only confirmed
// results ever feed trends or prompts.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { db, uuid, tx, uploadsDir } from "../db.js";
import { DEFAULT_USER_ID, todayISO } from "../config.js";
import { HttpError } from "../http.js";
import { chatJSON } from "../llm.js";
import { LAB_MARKERS, MARKERS_BY_KEY, PANELS, findMarker, normalizeUnit, toCanonical } from "../data/labMarkers.js";

const LAB_DIR = path.join(uploadsDir, "labs");
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_FILES = 6;
const MAX_REPORT_BYTES = 30 * 1024 * 1024;
const SOURCES = ["upload", "text", "manual"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// --- Files --------------------------------------------------------------------

/** Identify a file by its first bytes — never trust the client's Content-Type. */
export function sniffFile(buf) {
  if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-") return { mime: "application/pdf", ext: "pdf", kind: "pdf" };
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: "jpg", kind: "image" };
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: "image/png", ext: "png", kind: "image" };
  }
  if (buf.length >= 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") {
    return { mime: "image/webp", ext: "webp", kind: "image" };
  }
  return null;
}

const isHeic = (buf) => buf.length >= 12 && buf.subarray(4, 8).toString("latin1") === "ftyp" && /^(hei|hev|mif|msf)/.test(buf.subarray(8, 12).toString("latin1"));

function reportRow(id) {
  const r = db.prepare("SELECT * FROM lab_reports WHERE id = ?").get(id);
  if (!r) throw new HttpError(404, "Lab report not found");
  return r;
}

function filePath(f) {
  return path.join(LAB_DIR, f.stored_name);
}

export function addFile(reportId, buffer, originalName) {
  const report = reportRow(reportId);
  if (report.status !== "draft") throw new HttpError(409, "This report is confirmed — start a new one to add files");
  if (!buffer?.length) throw new HttpError(400, "Empty file");
  if (buffer.length > MAX_FILE_BYTES) throw new HttpError(413, `File too large (max ${MAX_FILE_BYTES / 1048576} MB)`);
  const existing = db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(bytes), 0) AS bytes FROM lab_report_files WHERE report_id = ?").get(reportId);
  if (existing.n >= MAX_FILES) throw new HttpError(400, `At most ${MAX_FILES} files per report`);
  if (existing.bytes + buffer.length > MAX_REPORT_BYTES) throw new HttpError(413, "Files for this report are too large in total (max 30 MB)");
  const type = sniffFile(buffer);
  if (!type) {
    throw new HttpError(
      415,
      isHeic(buffer)
        ? "HEIC photos aren't supported — export the photo as JPEG (on iPhone: Settings → Camera → Formats → Most Compatible) or upload a screenshot."
        : "Upload a PDF or a JPEG/PNG/WebP photo of the report."
    );
  }
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const id = uuid();
  const storedName = `${id}.${type.ext}`;
  mkdirSync(LAB_DIR, { recursive: true });
  writeFileSync(path.join(LAB_DIR, storedName), buffer);
  const name = String(originalName || `report.${type.ext}`).replace(/[\\/\r\n]/g, "_").slice(0, 200);
  db.prepare(
    `INSERT INTO lab_report_files (id, user_id, report_id, stored_name, original_filename, mime_type, bytes, sha256, page_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, report.user_id, reportId, storedName, name, type.mime, buffer.length, sha256, existing.n);
  db.prepare("UPDATE lab_reports SET source = 'upload', updated_at = datetime('now') WHERE id = ?").run(reportId);
  const duplicate = db.prepare(
    `SELECT r.id, r.collected_on FROM lab_report_files f JOIN lab_reports r ON r.id = f.report_id
     WHERE f.sha256 = ? AND r.status = 'confirmed' AND r.id != ? LIMIT 1`
  ).get(sha256, reportId);
  return { file: fileMeta(db.prepare("SELECT * FROM lab_report_files WHERE id = ?").get(id)), duplicate_of: duplicate || null };
}

const fileMeta = (f) => ({ id: f.id, original_filename: f.original_filename, mime_type: f.mime_type, bytes: f.bytes, created_at: f.created_at });

export function getFile(fileId) {
  const f = db.prepare("SELECT * FROM lab_report_files WHERE id = ?").get(fileId);
  if (!f) throw new HttpError(404, "File not found");
  try {
    return { meta: f, data: readFileSync(filePath(f)) };
  } catch {
    throw new HttpError(404, "File is missing from storage");
  }
}

export function deleteFile(fileId) {
  const f = db.prepare("SELECT * FROM lab_report_files WHERE id = ?").get(fileId);
  if (!f) throw new HttpError(404, "File not found");
  db.prepare("DELETE FROM lab_report_files WHERE id = ?").run(fileId);
  rmSync(filePath(f), { force: true });
  return { deleted: fileId };
}

// --- Reports ------------------------------------------------------------------

export function createReport(body = {}, userId = DEFAULT_USER_ID) {
  const source = body.source || "upload";
  if (!SOURCES.includes(source)) throw new HttpError(400, `source must be one of ${SOURCES.join(", ")}`);
  const rawText = body.raw_text ? String(body.raw_text).slice(0, 200_000) : null;
  if (source === "text" && !rawText?.trim()) throw new HttpError(400, "Paste the report text first");
  if (body.collected_on && !ISO_DATE.test(body.collected_on)) throw new HttpError(400, "collected_on must be YYYY-MM-DD");
  const id = uuid();
  db.prepare("INSERT INTO lab_reports (id, user_id, source, raw_text, collected_on, lab_name) VALUES (?, ?, ?, ?, ?, ?)").run(
    id, userId, source, rawText, body.collected_on || null, body.lab_name || null
  );
  return getReport(id);
}

export function listReports(userId = DEFAULT_USER_ID) {
  return db.prepare(
    `SELECT r.id, r.collected_on, r.lab_name, r.source, r.status, r.created_at, r.confirmed_at,
       (SELECT COUNT(*) FROM lab_results x WHERE x.report_id = r.id) AS result_count,
       (SELECT COUNT(*) FROM lab_results x WHERE x.report_id = r.id AND x.flag IN ('low','high','abnormal','critical_low','critical_high')) AS out_of_range,
       (SELECT COUNT(*) FROM lab_report_files f WHERE f.report_id = r.id) AS file_count,
       (SELECT g.id FROM guides g WHERE g.lab_report_id = r.id AND g.kind = 'lab_explainer' LIMIT 1) AS explainer_id
     FROM lab_reports r WHERE r.user_id = ?
     ORDER BY CASE r.status WHEN 'draft' THEN 0 ELSE 1 END, COALESCE(r.collected_on, r.created_at) DESC`
  ).all(userId);
}

const presentResult = (r) => ({
  ...r,
  marker_name: r.marker_key ? MARKERS_BY_KEY[r.marker_key]?.name : null,
  panel: r.marker_key ? MARKERS_BY_KEY[r.marker_key]?.panel : null,
  critical: r.flag === "critical_low" || r.flag === "critical_high",
});

function warningsFor(report, results) {
  const w = [];
  if (!report.collected_on) w.push("Add the collection date — results can't be trended without it.");
  const unmapped = results.filter((r) => !r.marker_key);
  if (unmapped.length) w.push(`${unmapped.length} row(s) aren't matched to a known marker (${unmapped.slice(0, 4).map((r) => r.name_on_report).join(", ")}${unmapped.length > 4 ? ", …" : ""}). They're kept, but won't trend.`);
  for (const r of results) {
    if (r.marker_key && r.value_num != null && r.canonical_value == null) {
      const m = MARKERS_BY_KEY[r.marker_key];
      w.push(m?.keepAsReported
        ? `${m.name}: unit "${r.unit ?? "missing"}" isn't one of ${m.keepAsReported.join(" / ")}.`
        : `${r.name_on_report}: can't convert "${r.unit ?? "no unit"}" to ${m?.unit} — check the unit.`);
    }
  }
  const crit = results.filter((r) => r.flag === "critical_low" || r.flag === "critical_high");
  if (crit.length) w.push(`Critical value: ${crit.map((r) => `${r.name_on_report} ${r.value_num ?? r.value_text} ${r.unit ?? ""}`.trim()).join(", ")}. Contact your doctor promptly if you haven't heard from them.`);
  return w;
}

export function getReport(id) {
  const report = reportRow(id);
  const results = db.prepare("SELECT * FROM lab_results WHERE report_id = ? ORDER BY sort_order, rowid").all(id).map(presentResult);
  const files = db.prepare("SELECT * FROM lab_report_files WHERE report_id = ? ORDER BY page_order").all(id).map(fileMeta);
  const explainer = db.prepare("SELECT id, updated_at FROM guides WHERE lab_report_id = ? AND kind = 'lab_explainer' LIMIT 1").get(id);
  const { extraction_json, raw_text, ...rest } = report;
  return { ...rest, has_text: Boolean(raw_text), files, results, warnings: warningsFor(report, results), explainer_id: explainer?.id || null };
}

export function deleteReport(id) {
  reportRow(id);
  const files = db.prepare("SELECT * FROM lab_report_files WHERE report_id = ?").all(id);
  tx(() => {
    db.prepare("DELETE FROM guides WHERE lab_report_id = ? AND kind = 'lab_explainer'").run(id);
    db.prepare("DELETE FROM lab_results WHERE report_id = ?").run(id);
    db.prepare("DELETE FROM lab_report_files WHERE report_id = ?").run(id);
    db.prepare("DELETE FROM lab_reports WHERE id = ?").run(id);
  });
  for (const f of files) rmSync(filePath(f), { force: true });
  return { deleted: id };
}

// --- Rows: normalization shared by extraction and review --------------------

const num = (v) => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
};

/** "<100" → {high:100}; ">39" → {low:39}; "3.5-5.1" → {low, high}. */
export function parseRange(text) {
  const t = String(text || "").replace(/,/g, "").trim();
  let m = t.match(/^(-?\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(-?\d+(?:\.\d+)?)/i);
  if (m) return { low: Number(m[1]), high: Number(m[2]) };
  m = t.match(/^(?:<|≤|<=|less than|under)\s*=?\s*(\d+(?:\.\d+)?)/i);
  if (m) return { low: null, high: Number(m[1]) };
  m = t.match(/^(?:>|≥|>=|greater than|over)\s*=?\s*(\d+(?:\.\d+)?)/i);
  if (m) return { low: Number(m[1]), high: null };
  return { low: null, high: null };
}

const PRINTED_FLAGS = { h: "high", high: "high", hi: "high", l: "low", low: "low", lo: "low", a: "abnormal", abnormal: "abnormal", n: "normal", normal: "normal" };

/**
 * Turn an extracted or user-edited row into a lab_results row.
 * @param {object} raw
 * @param {{ trustMarkerKey?: boolean }} opts trustMarkerKey: the user picked marker_key in review
 */
export function normalizeRow(raw, { trustMarkerKey = false } = {}) {
  const name = String(raw.name_on_report ?? raw.name ?? "").trim().slice(0, 120);
  if (!name) return null;
  let marker = null;
  if (trustMarkerKey && "marker_key" in raw) marker = raw.marker_key ? MARKERS_BY_KEY[raw.marker_key] || null : null;
  else marker = findMarker(name) || (raw.marker_key && MARKERS_BY_KEY[raw.marker_key]) || null;

  const valueNum = num(raw.value_num ?? raw.value);
  let valueText = raw.value_text != null && String(raw.value_text).trim() ? String(raw.value_text).trim().slice(0, 60) : null;
  if (valueNum == null && valueText == null && raw.value != null && String(raw.value).trim()) valueText = String(raw.value).trim().slice(0, 60);
  const unit = normalizeUnit(raw.unit);
  const refText = raw.ref_text != null && String(raw.ref_text).trim() ? String(raw.ref_text).trim().slice(0, 80) : null;
  let refLow = num(raw.ref_low);
  let refHigh = num(raw.ref_high);
  if (refLow == null && refHigh == null && refText) ({ low: refLow, high: refHigh } = parseRange(refText));

  const canonical = marker && valueNum != null ? toCanonical(marker.key, valueNum, unit) : null;
  const refConv = (v) => (v == null || !marker ? null : toCanonical(marker.key, v, unit)?.value ?? null);

  let flag = null;
  if (valueNum != null && (refLow != null || refHigh != null)) {
    flag = refLow != null && valueNum < refLow ? "low" : refHigh != null && valueNum > refHigh ? "high" : "normal";
  } else if (raw.flag) {
    flag = PRINTED_FLAGS[String(raw.flag).trim().toLowerCase()] || null;
  }
  const crit = marker?.critical;
  if (crit && canonical) {
    if (crit.low != null && canonical.value < crit.low) flag = "critical_low";
    else if (crit.high != null && canonical.value > crit.high) flag = "critical_high";
  }

  return {
    marker_key: marker?.key || null,
    name_on_report: name,
    value_num: valueNum,
    value_text: valueText,
    unit,
    ref_low: refLow,
    ref_high: refHigh,
    ref_text: refText,
    flag,
    canonical_value: canonical?.value ?? null,
    canonical_unit: canonical?.unit ?? null,
    canonical_ref_low: refConv(refLow),
    canonical_ref_high: refConv(refHigh),
    notes: raw.notes ? String(raw.notes).slice(0, 300) : null,
  };
}

function replaceResults(report, rows) {
  const ins = db.prepare(
    `INSERT INTO lab_results (id, user_id, report_id, marker_key, name_on_report, value_num, value_text, unit, ref_low, ref_high,
       ref_text, flag, canonical_value, canonical_unit, canonical_ref_low, canonical_ref_high, collected_on, sort_order, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  db.prepare("DELETE FROM lab_results WHERE report_id = ?").run(report.id);
  rows.forEach((r, i) =>
    ins.run(
      uuid(), report.user_id, report.id, r.marker_key, r.name_on_report, r.value_num, r.value_text, r.unit, r.ref_low, r.ref_high,
      r.ref_text, r.flag, r.canonical_value, r.canonical_unit, r.canonical_ref_low, r.canonical_ref_high, report.collected_on, i, r.notes
    )
  );
}

const HEADER_FIELDS = ["collected_on", "reported_on", "lab_name", "ordering_provider", "notes"];

/** Save the review table (replaces all rows). confirm=true makes it count. */
export function saveReview(id, body = {}) {
  const current = reportRow(id);
  const header = {};
  for (const f of HEADER_FIELDS) {
    if (!(f in body)) continue;
    const v = body[f] == null || String(body[f]).trim() === "" ? null : String(body[f]).trim().slice(0, 300);
    if (v && (f === "collected_on" || f === "reported_on") && !ISO_DATE.test(v)) throw new HttpError(400, `${f} must be YYYY-MM-DD`);
    header[f] = v;
  }
  const merged = { ...current, ...header };
  if (body.confirm && !merged.collected_on) throw new HttpError(400, "Add the collection date before confirming");
  if (merged.collected_on && merged.collected_on > todayISO()) throw new HttpError(400, "collected_on is in the future");
  const rows = Array.isArray(body.results) ? body.results.map((r) => normalizeRow(r, { trustMarkerKey: true })).filter(Boolean) : null;
  if (body.confirm && !(rows ?? []).length && !db.prepare("SELECT 1 FROM lab_results WHERE report_id = ?").get(id)) {
    throw new HttpError(400, "There are no results to confirm");
  }

  tx(() => {
    const keys = Object.keys(header);
    if (keys.length) db.prepare(`UPDATE lab_reports SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`).run(...keys.map((k) => header[k]), id);
    if (rows) replaceResults(merged, rows);
    else if ("collected_on" in header) db.prepare("UPDATE lab_results SET collected_on = ? WHERE report_id = ?").run(merged.collected_on, id);
    if (body.confirm) db.prepare("UPDATE lab_reports SET status = 'confirmed', confirmed_at = COALESCE(confirmed_at, datetime('now')) WHERE id = ?").run(id);
    db.prepare("UPDATE lab_reports SET updated_at = datetime('now') WHERE id = ?").run(id);
  });
  return getReport(id);
}

// --- AI extraction ------------------------------------------------------------

const EXTRACT_SYSTEM = `You transcribe laboratory reports into structured JSON. Return a JSON object:
{"report": {"collected_on": "YYYY-MM-DD" or null, "reported_on": "YYYY-MM-DD" or null, "lab_name": string or null, "ordering_provider": string or null},
 "results": [{"name_on_report": string, "value": number or null, "value_text": string or null, "unit": string or null,
   "ref_low": number or null, "ref_high": number or null, "ref_text": string or null, "flag": "high" | "low" | "abnormal" | null, "marker_key": string or null}]}
Rules:
- One entry per analyte result. Copy names, values, units and reference ranges exactly as printed.
- Use only the current result. Ignore "previous result", "prior value" or other historical columns.
- value is the number only. If the result isn't a plain number (e.g. "<0.5", "Negative", "See note"), put it in value_text and set value to null.
- ref_low / ref_high are the numeric bounds of the printed reference range. For one-sided ranges like "<100" set only ref_high (">39" → only ref_low). Put the printed range in ref_text.
- flag: only if the report prints one (H, L, A, High, Low, Abnormal); otherwise null.
- marker_key: the matching key from the allowed list, or null if none clearly matches. Don't guess.
- Never compute, convert, or infer values that aren't printed.
- collected_on is the specimen collection date (not the report or print date).
- Leave out patient identifiers (name, date of birth, MRN, address, phone), comments and interpretive paragraphs.`;

const markerList = () => LAB_MARKERS.map((m) => `${m.key}: ${m.name}`).join("\n");

export async function extractReport(id) {
  const report = reportRow(id);
  if (report.status !== "draft") throw new HttpError(409, "This report is already confirmed");
  const files = db.prepare("SELECT * FROM lab_report_files WHERE report_id = ? ORDER BY page_order").all(id);
  const intro = `Allowed marker_key values:\n${markerList()}`;
  let user;
  if (files.length) {
    user = [{ type: "text", text: `${intro}\n\nTranscribe the attached lab report (${files.length} file${files.length > 1 ? "s" : ""}, in page order).` }];
    for (const f of files) {
      const b64 = readFileSync(filePath(f)).toString("base64");
      user.push(
        f.mime_type === "application/pdf"
          ? { type: "file", file: { filename: f.original_filename || "report.pdf", file_data: `data:application/pdf;base64,${b64}` } }
          : { type: "image_url", image_url: { url: `data:${f.mime_type};base64,${b64}`, detail: "high" } }
      );
    }
  } else if (report.raw_text?.trim()) {
    user = `${intro}\n\nLab report text:\n"""\n${report.raw_text}\n"""`;
  } else {
    throw new HttpError(400, "Nothing to read yet — attach the report or paste its text first");
  }

  const { data, provider, model } = await chatJSON("lab_extraction", EXTRACT_SYSTEM, user);
  const header = data?.report || {};
  const rows = (Array.isArray(data?.results) ? data.results : []).map((r) => normalizeRow(r)).filter(Boolean);
  if (!rows.length) throw new HttpError(502, "Couldn't find any lab results in that report. Check the file or paste the text instead.");

  tx(() => {
    const set = {};
    for (const f of ["collected_on", "reported_on", "lab_name", "ordering_provider"]) {
      const v = header[f];
      if (report[f] || v == null || v === "") continue;
      if ((f === "collected_on" || f === "reported_on") && !ISO_DATE.test(v)) continue;
      set[f] = String(v).slice(0, 200);
    }
    const keys = Object.keys(set);
    db.prepare(
      `UPDATE lab_reports SET ${[...keys.map((k) => `${k} = ?`), "extraction_json = ?", "llm_provider = ?", "llm_model = ?", "updated_at = datetime('now')"].join(", ")} WHERE id = ?`
    ).run(...keys.map((k) => set[k]), JSON.stringify(data), provider, model, id);
    replaceResults({ ...report, ...set }, rows);
  });
  return getReport(id);
}

// --- Reading confirmed results ------------------------------------------------

function confirmedRows(userId, markerKey) {
  return db.prepare(
    `SELECT x.*, r.lab_name FROM lab_results x JOIN lab_reports r ON r.id = x.report_id
     WHERE r.status = 'confirmed' AND x.user_id = ? AND x.marker_key IS NOT NULL ${markerKey ? "AND x.marker_key = ?" : ""}
     ORDER BY x.marker_key, x.collected_on DESC, x.rowid DESC`
  ).all(...(markerKey ? [userId, markerKey] : [userId]));
}

const point = (r) =>
  r && {
    value: r.canonical_value ?? r.value_num,
    value_text: r.value_text,
    unit: r.canonical_unit ?? r.unit,
    ref_low: r.canonical_value != null ? r.canonical_ref_low : r.ref_low,
    ref_high: r.canonical_value != null ? r.canonical_ref_high : r.ref_high,
    flag: r.flag,
    collected_on: r.collected_on,
    report_id: r.report_id,
  };

const OUT = new Set(["low", "high", "abnormal", "critical_low", "critical_high"]);

/** Latest confirmed value per marker (plus the previous one), grouped by panel. */
export function latestResults(userId = DEFAULT_USER_ID) {
  const byMarker = new Map();
  for (const r of confirmedRows(userId)) {
    if (!byMarker.has(r.marker_key)) byMarker.set(r.marker_key, []);
    byMarker.get(r.marker_key).push(r);
  }
  const markers = [...byMarker.entries()].map(([key, rows]) => {
    const m = MARKERS_BY_KEY[key];
    const latest = point(rows[0]);
    const previous = point(rows.find((r) => r.collected_on < rows[0].collected_on));
    const delta = latest?.value != null && previous?.value != null && latest.unit === previous.unit ? Math.round((latest.value - previous.value) * 100) / 100 : null;
    return {
      key, name: m.name, panel: m.panel, better: m.better || null,
      latest, previous, delta, out_of_range: OUT.has(rows[0].flag), count: rows.length,
    };
  });
  return PANELS.map((panel) => ({ panel, markers: markers.filter((x) => x.panel === panel) })).filter((p) => p.markers.length);
}

/** Confirmed series for one marker (canonical units where convertible). */
export function trend(markerKey, userId = DEFAULT_USER_ID) {
  const m = MARKERS_BY_KEY[markerKey];
  if (!m) throw new HttpError(404, "Unknown marker");
  const rows = confirmedRows(userId, markerKey).reverse();
  const points = rows.map(point).filter((p) => p.value != null);
  const last = points.at(-1);
  return { key: m.key, name: m.name, unit: last?.unit || m.unit, better: m.better || null, note: m.note || null, points, band: last ? { low: last.ref_low, high: last.ref_high } : null };
}

/** Markers for the review table's picker. */
export function markerCatalog() {
  return LAB_MARKERS.map((m) => ({ key: m.key, name: m.name, panel: m.panel, unit: m.unit }));
}

/** Context section: latest confirmed values, out-of-range first. */
export function labsContext(userId = DEFAULT_USER_ID) {
  const all = latestResults(userId).flatMap((p) => p.markers);
  if (!all.length) return null;
  all.sort((a, b) => Number(b.out_of_range) - Number(a.out_of_range));
  const lastReport = db.prepare("SELECT MAX(collected_on) AS d FROM lab_reports WHERE user_id = ? AND status = 'confirmed'").get(userId)?.d;
  return {
    most_recent_draw: lastReport,
    results: all.slice(0, 25).map((x) => ({
      marker: x.name,
      value: x.latest.value ?? x.latest.value_text,
      unit: x.latest.unit,
      range: [x.latest.ref_low, x.latest.ref_high].some((v) => v != null) ? `${x.latest.ref_low ?? ""}–${x.latest.ref_high ?? ""}` : undefined,
      flag: x.latest.flag && x.latest.flag !== "normal" ? x.latest.flag : undefined,
      drawn: x.latest.collected_on,
      previous: x.previous ? `${x.previous.value ?? x.previous.value_text} on ${x.previous.collected_on}` : undefined,
    })),
    more_markers_not_shown: all.length > 25 ? all.length - 25 : undefined,
  };
}

/** Rows + prior values for one confirmed report — what the explainer reads (never raw report text). */
export function explainerInput(id) {
  const report = getReport(id);
  if (report.status !== "confirmed") throw new HttpError(409, "Confirm the report before generating an explainer");
  const prior = (key) =>
    key
      ? db.prepare(
          `SELECT x.canonical_value, x.value_num, x.value_text, x.canonical_unit, x.unit, x.collected_on FROM lab_results x
           JOIN lab_reports r ON r.id = x.report_id
           WHERE r.status = 'confirmed' AND x.marker_key = ? AND x.collected_on < ? ORDER BY x.collected_on DESC LIMIT 1`
        ).get(key, report.collected_on)
      : null;
  const results = report.results.map((r) => {
    const p = prior(r.marker_key);
    return {
      marker: r.marker_name || r.name_on_report,
      value: r.canonical_value ?? r.value_num ?? r.value_text,
      unit: r.canonical_unit ?? r.unit,
      range: r.ref_text || ([r.ref_low, r.ref_high].some((v) => v != null) ? `${r.ref_low ?? ""}–${r.ref_high ?? ""} ${r.unit ?? ""}`.trim() : null),
      flag: r.flag,
      previous: p ? { value: p.canonical_value ?? p.value_num ?? p.value_text, unit: p.canonical_unit ?? p.unit, collected_on: p.collected_on } : undefined,
    };
  });
  const notes = [...new Set(report.results.map((r) => r.marker_key).filter(Boolean))]
    .map((k) => MARKERS_BY_KEY[k])
    .filter((m) => m.note)
    .map((m) => `${m.name}: ${m.note}`);
  const critical = report.results.filter((r) => r.critical).map((r) => `${r.marker_name || r.name_on_report} ${r.value_num ?? r.value_text} ${r.unit ?? ""}`.trim());
  return { report, results, notes, critical };
}
