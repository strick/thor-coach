import {
  api, toast, esc, todayISO, addDays, fmtDate, fmtTime, localDateTime, renderNav, chartBars, undoable,
  segnav, HEALTH_SEGS, renderOngoing, ongoingHeadache, setLowGlare, openQuickAdd, plural,
} from "./ui.js";
import { mountCheckin } from "./checkin.js";

renderNav("health");
const $ = (id) => document.getElementById(id);
const today = todayISO();
const params = new URLSearchParams(location.search);

let options = null;
let editing = null; // headache being edited, or null when logging a new one
let severity = null;
let stepMode = false;
let step = 0;

// --- Segments: Check-in · Headaches (this page) · Labs --------------------------

const segOf = () => (location.hash === "#checkin" ? "checkin" : "headaches");
function showSeg() {
  const seg = params.has("edit") && location.hash !== "#checkin" ? "headaches" : segOf();
  $("segs").innerHTML = segnav("Health", HEALTH_SEGS, seg);
  document.querySelectorAll("[data-seg]").forEach((s) => (s.hidden = s.dataset.seg !== seg));
}
addEventListener("hashchange", showSeg);
showSeg();

// --- Daily check-in ---------------------------------------------------------------

$("ci-date").value = today;
$("ci-date").max = today;
const loadCheckin = () =>
  mountCheckin($("checkin"), { date: $("ci-date").value || today, mode: "full", statusEl: $("ci-status") })
    .catch((e) => toast(e, true));
$("ci-date").addEventListener("change", loadCheckin);

// --- Headache form ------------------------------------------------------------------

function chips(el, items, selected = []) {
  el.innerHTML = items
    .map((i) => `<button type="button" class="chip" data-key="${esc(i.key)}" aria-pressed="${selected.includes(i.key)}">${esc(i.label)}</button>`)
    .join("");
  el.querySelectorAll(".chip").forEach((c) =>
    c.addEventListener("click", () => c.setAttribute("aria-pressed", String(c.getAttribute("aria-pressed") !== "true")))
  );
}
const chipValues = (el) => [...el.querySelectorAll('.chip[aria-pressed="true"]')].map((c) => c.dataset.key);

function renderSeverity() {
  $("h-sev").innerHTML = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    .map((n) => `<button type="button" data-v="${n}" aria-pressed="${severity === n}">${n}</button>`).join("");
  $("h-sev").querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      const v = Number(b.dataset.v);
      severity = severity === v ? null : v; // tap again to clear
      $("h-sev").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(Number(x.dataset.v) === severity)));
    })
  );
}

let medSeq = 0;
function medRow(m = {}) {
  const row = document.createElement("div");
  const n = ++medSeq;
  row.className = "med-row";
  row.innerHTML = `
    <div><label class="sr-only" for="m-name-${n}">Medicine</label><input id="m-name-${n}" class="m-name" list="med-options" placeholder="Medicine" value="${esc(m.name ?? "")}" /></div>
    <div><label class="sr-only" for="m-dose-${n}">Dose</label><input id="m-dose-${n}" class="m-dose" placeholder="Dose" value="${esc(m.dose ?? "")}" /></div>
    <div><label class="sr-only" for="m-time-${n}">Time taken</label><input id="m-time-${n}" class="m-time" type="time" value="${esc((m.time || "").slice(-5))}" /></div>
    <div><label class="sr-only" for="m-relief-${n}">Relief</label><select id="m-relief-${n}" class="m-relief">
      <option value="">Relief?</option>
      ${options.relief.map((r) => `<option value="${r}"${m.relief === r ? " selected" : ""}>${r === "none" ? "no relief" : `${r} relief`}</option>`).join("")}
    </select></div>
    <button type="button" class="btn-danger" aria-label="Remove this medicine">Remove</button>`;
  row.querySelector(".m-name").addEventListener("change", (e) => {
    const known = options.meds.find((o) => o.name.toLowerCase() === e.target.value.trim().toLowerCase());
    if (known?.dose && !row.querySelector(".m-dose").value) row.querySelector(".m-dose").value = known.dose;
  });
  row.querySelector(".btn-danger").addEventListener("click", () => row.remove());
  $("h-meds").appendChild(row);
}

// The care message sits right under the checklist (where you just tapped), is
// announced, and takes focus, so it can't render off-screen.
function showRedFlagBanner(labels, { focus = false, saved = false } = {}) {
  const box = $("h-alert-inline");
  box.innerHTML = labels.length
    ? `<div class="care-now" role="alert" tabindex="-1">
        <strong>${saved ? "Saved. Please get care now" : "Please get care now"}</strong>
        <p>${esc(options.seek_care_message)}</p>
        <p class="care-flags">${labels.map(esc).join(" · ")}</p>
        <div class="btn-row"><a class="btn care-call" href="tel:911">Call 911</a></div>
        ${saved ? '<p class="fine">This message stays on Today until you dismiss it.</p>' : ""}
      </div>`
    : "";
  const el = box.firstElementChild;
  if (el && focus) {
    el.scrollIntoView({ block: "center" });
    el.focus({ preventScroll: true });
  }
}

function redFlagLabels() {
  return [...$("h-redflags").querySelectorAll("input:checked")].map((i) => options.red_flags.find((r) => r.key === i.value)?.label);
}

function setStill(still) {
  $("h-still").checked = still;
  $("h-end-wrap").hidden = still;
  if (!still && !$("h-end").value) $("h-end").value = localDateTime();
}
$("h-still").addEventListener("change", () => setStill($("h-still").checked));

function fillForm(h = null) {
  editing = h;
  $("h-title").textContent = h ? `Edit headache · ${fmtDate(h.date)}` : "Log a headache";
  $("h-cancel").hidden = !h;
  $("h-delete").hidden = !h;
  $("h-quick-tip").hidden = Boolean(h);
  $("h-start").value = h ? h.started_at || "" : localDateTime();
  $("h-end").value = h?.ended_at || "";
  setStill(!h?.ended_at);
  severity = h?.peak_severity ?? null;
  renderSeverity();
  $("h-type").innerHTML = options.types.map((t) => `<option value="${t}"${(h?.type || "unknown") === t ? " selected" : ""}>${t}</option>`).join("");
  chips($("h-locations"), options.locations, h?.locations || []);
  $("h-aura").checked = Boolean(h?.aura);
  chips($("h-symptoms"), options.symptoms, h?.symptoms || []);
  $("h-meds").innerHTML = "";
  (h?.meds || []).forEach(medRow);
  const knownTriggers = options.triggers.map((t) => t.key);
  chips($("h-triggers"), options.triggers, h?.triggers || []);
  $("h-trigger-other").value = (h?.triggers || []).filter((t) => !knownTriggers.includes(t)).join(", ");
  $("h-redflags").innerHTML = options.red_flags
    .map((r) => `<label class="check-row"><input type="checkbox" value="${r.key}"${h?.red_flags?.includes(r.key) ? " checked" : ""} /> ${esc(r.label)}</label>`)
    .join("");
  $("h-redflags").querySelectorAll("input").forEach((i) =>
    i.addEventListener("change", () => showRedFlagBanner(redFlagLabels(), { focus: i.checked }))
  );
  showRedFlagBanner(h ? redFlagLabels() : []);
  $("h-notes").value = h?.notes || "";
  updateActions();
}

function readForm() {
  const meds = [...$("h-meds").querySelectorAll(".med-row")]
    .map((r) => ({
      name: r.querySelector(".m-name").value.trim(),
      dose: r.querySelector(".m-dose").value.trim() || null,
      time: r.querySelector(".m-time").value || null,
      relief: r.querySelector(".m-relief").value || null,
    }))
    .filter((m) => m.name);
  const other = $("h-trigger-other").value.split(",").map((s) => s.trim()).filter(Boolean);
  const start = $("h-start").value || null;
  return {
    started_at: start,
    ended_at: $("h-still").checked ? null : $("h-end").value || null,
    ...(start ? {} : { date: editing?.date || today }),
    peak_severity: severity,
    type: $("h-type").value,
    locations: chipValues($("h-locations")),
    aura: $("h-aura").checked,
    symptoms: chipValues($("h-symptoms")),
    meds,
    triggers: [...chipValues($("h-triggers")), ...other],
    red_flags: [...$("h-redflags").querySelectorAll("input:checked")].map((i) => i.value),
    notes: $("h-notes").value.trim() || null,
  };
}

// --- "Add details": one short screen per group, each with Skip (phones) -----------------

const groups = () => [...document.querySelectorAll(".hgroup")];
function setStepMode(on) {
  stepMode = on;
  step = 0;
  $("h-form").classList.toggle("step-mode", on);
  showStep();
}
function showStep() {
  groups().forEach((g, i) => g.classList.toggle("current", i === step));
  $("h-progress").hidden = !stepMode;
  if (stepMode) $("h-progress").textContent = `Step ${step + 1} of ${groups().length} · ${groups()[step].dataset.name}`;
  updateActions();
}
function updateActions() {
  const last = step >= groups().length - 1;
  $("h-skip").hidden = !stepMode || last;
  $("h-save").textContent = stepMode ? (last ? "Save" : "Save & next") : editing ? "Save changes" : "Save headache";
}
$("h-skip").addEventListener("click", () => {
  step = Math.min(step + 1, groups().length - 1);
  showStep();
  $("headache").scrollIntoView({ block: "start" });
});

renderSeverity();
$("h-quick").addEventListener("click", () => openQuickAdd("headache"));
$("h-add-med").addEventListener("click", () => medRow());
$("h-cancel").addEventListener("click", () => {
  setStepMode(false);
  fillForm(null);
  history.replaceState(null, "", "health.html#headaches");
});
$("h-save").addEventListener("click", async () => {
  $("h-save").disabled = true;
  try {
    const body = readForm();
    const saved = editing
      ? await api(`/api/headaches/${editing.id}`, { method: "PATCH", body })
      : await api("/api/headaches", { method: "POST", body });
    if (stepMode && step < groups().length - 1) {
      editing = saved;
      step += 1;
      showStep();
      $("headache").scrollIntoView({ block: "start" });
    } else {
      toast(editing ? "Headache updated" : "Headache logged");
      if (stepMode) setStepMode(false);
      if (saved.alert) {
        // Keep the entry and the care message on screen instead of resetting the form.
        fillForm(saved);
        showRedFlagBanner(saved.alert.red_flags, { focus: true, saved: true });
      } else {
        fillForm(null);
        history.replaceState(null, "", "health.html#headaches");
      }
    }
    refresh();
  } catch (err) {
    toast(err, true);
  } finally {
    $("h-save").disabled = false;
  }
});
$("h-delete").addEventListener("click", () => {
  if (!editing) return;
  const id = editing.id;
  const row = $("history").querySelector(`[data-edit="${CSS.escape(id)}"]`);
  setStepMode(false);
  fillForm(null);
  history.replaceState(null, "", "health.html#headaches");
  undoable({
    message: "Headache deleted",
    hide: row ? [row] : [],
    run: () => api(`/api/headaches/${id}`, { method: "DELETE", keepalive: true }),
    onDone: refresh,
  });
});

// --- Ongoing banner, history, patterns ------------------------------------------------

function describe(h) {
  const parts = [];
  if (h.started_at) parts.push(`${fmtTime(h.started_at)}${h.ended_at ? `–${fmtTime(h.ended_at)}` : " → still going"}`);
  else if (h.duration_minutes) parts.push(`${h.duration_minutes} min`);
  const where = h.locations.map((k) => options.locations.find((l) => l.key === k)?.label || k);
  if (where.length) parts.push(where.join(", "));
  if (h.aura) parts.push("aura");
  if (h.meds.length) parts.push(h.meds.map((m) => `${m.name}${m.dose ? ` ${m.dose}` : ""}${m.relief ? ` (${m.relief} relief)` : ""}`).join(", "));
  if (h.triggers.length) parts.push(`triggers: ${h.triggers.map((t) => options.triggers.find((o) => o.key === t)?.label.toLowerCase() || t).join(", ")}`);
  return parts.join(" · ");
}

const durText = (m) => (m == null ? "" : m >= 90 ? `${Math.round((m / 60) * 10) / 10} h` : `${m} min`);

async function loadHistory() {
  const list = await api(`/api/headaches?start=${addDays(today, -180)}&end=${today}`);
  const ongoing = list.find((h) => h.ongoing && h.date >= addDays(today, -2)) || null;
  setLowGlare(ongoing);
  renderOngoing($("ongoing"), ongoing, { onChange: refresh });
  $("history").innerHTML = list.length
    ? list.slice(0, 40).map((h) => `
      <button type="button" class="item" data-edit="${h.id}" aria-label="Edit headache on ${fmtDate(h.date)}">
        <span class="main">
          <span class="title" style="display:block">${fmtDate(h.date)} · ${esc(h.type)}
            ${h.peak_severity != null ? `<span class="pill gray">${h.peak_severity}/10</span>` : ""}
            ${h.ongoing ? '<span class="pill">ongoing</span>' : h.duration_minutes != null ? `<span class="pill gray">${durText(h.duration_minutes)}</span>` : ""}
            ${h.red_flags.length ? '<span class="pill red">warning signs</span>' : ""}</span>
          <span class="meta" style="display:block">${esc(describe(h))}${h.notes ? ` — ${esc(h.notes)}` : ""}</span>
        </span><span class="chev" aria-hidden="true">›</span>
      </button>`).join("")
    : `<div class="empty">No headaches logged yet. When one hits, tap ＋ → Headache — just how bad it is is enough.</div>`;

  const byId = new Map(list.map((h) => [h.id, h]));
  $("history").querySelectorAll("[data-edit]").forEach((b) =>
    b.addEventListener("click", () => {
      fillForm(byId.get(b.dataset.edit));
      $("headache").scrollIntoView({ block: "start" });
      $("h-title").focus?.();
    })
  );
}

// Patterns in your logs, not diagnoses — and red is for emergencies.
const STRENGTH = {
  strong: ["amber", "Clear pattern"],
  possible: ["gray", "Possible pattern"],
  no_clear_link: ["gray", "No pattern so far"],
  insufficient: ["gray", "Still learning"],
};

const meter = (text, ratio) => `<div class="meter"><span>${esc(text)}</span>
  <div class="bar" role="img" aria-label="${Math.round(Math.min(1, ratio) * 100)}% of what's needed"><span style="width:${Math.min(100, ratio * 100)}%"></span></div></div>`;

function needs(f, min) {
  const exp = f.exposed.days, unexp = f.unexposed.days;
  const hd = f.exposed.headache_days + f.unexposed.headache_days;
  if (exp < min.exposed_days) return meter(`Seen on ${exp} of the ${min.exposed_days} days Thor needs.`, exp / min.exposed_days);
  if (unexp < min.unexposed_days) return meter(`Needs ${min.unexposed_days} days without it to compare; has ${unexp}.`, unexp / min.unexposed_days);
  return meter(`Needs ${min.headache_days} headache days among these; has ${hd}.`, hd / min.headache_days);
}

function rateRow(label, side) {
  const pct = side.rate == null ? 0 : Math.round(side.rate * 100);
  return `<div class="rate-row"><span>${label}</span><div class="bar"><span style="width:${pct}%"></span></div></div>`;
}

function factorHtml(f, min) {
  const [cls, text] = STRENGTH[f.strength];
  return `<div class="factor">
    <div class="head"><span>${esc(f.label)}</span><span class="pill ${cls}">${text}</span></div>
    ${f.strength === "insufficient"
      ? needs(f, min)
      : `<p>Headaches came on ${f.exposed.headache_days} of ${plural(f.exposed.days, "day")} with this, and ${f.unexposed.headache_days} of ${f.unexposed.days} other days.</p>
         ${rateRow("With it", f.exposed)}${rateRow("Without", f.unexposed)}`}
    ${f.low_confidence && f.strength !== "insufficient" ? `<div class="muted small">${esc(f.low_confidence)}</div>` : ""}
  </div>`;
}

async function loadPatterns() {
  const r = await api("/api/headache-insights?days=90");
  const c = r.coverage;
  const min = r.minimums || { exposed_days: 5, unexposed_days: 5, headache_days: 3 };
  const ready = c.checkin_days >= 21 && c.headache_days >= min.headache_days;
  $("coverage").innerHTML = ready
    ? `<p class="muted small" style="margin-top:0">Last ${plural(c.days, "day")} · ${plural(c.headache_days, "headache day")} · ${plural(c.checkin_days, "check-in")} · ${plural(c.food_days, "food day")}</p>`
    : `<p style="margin-top:0">Patterns need about three weeks of check-ins and three headache days. You have ${plural(c.checkin_days, "check-in day")} and ${plural(c.headache_days, "headache day")}.</p>
       ${meter("Getting there", Math.min(c.checkin_days / 21, 1) * 0.5 + Math.min(c.headache_days / min.headache_days, 1) * 0.5)}`;
  const o = r.overuse;
  $("overuse").innerHTML = o.status === "ok" ? "" : `<div class="banner amber mt">
    <strong>Headache medicine on ${o.acute_med_days_30d} of the last 30 days.</strong>
    ${o.status === "warn" ? "Worth raising with your doctor — don't stop a prescribed medicine on your own." : "Worth keeping an eye on."}
    <details class="mt"><summary>Why this matters</summary><p class="small">${esc(o.message)}</p></details></div>`;
  const shown = r.factors.filter((f) => f.strength !== "insufficient");
  const waiting = r.factors.filter((f) => f.strength === "insufficient");
  $("patterns").innerHTML =
    (shown.length ? shown.map((f) => factorHtml(f, min)).join("") : "") +
    (waiting.length
      ? `<details class="more"${shown.length ? "" : " open"}><summary>Still learning (${waiting.length})</summary>${waiting.map((f) => factorHtml(f, min)).join("")}</details>`
      : "");
  $("caveat").textContent = r.caveat;
  $("weekly-chart").innerHTML = chartBars(
    r.weekly.map((w) => ({ label: new Date(w.week_of + "T12:00:00").toLocaleDateString("en-US", { month: "numeric", day: "numeric" }), value: w.headache_days })),
    { unit: " days", color: "var(--accent)" }
  );
}

// --- Other health events (legacy categories) ----------------------------------------------

$("e-date").value = today;
async function loadEvents() {
  const events = await api(`/api/health-events?start=${addDays(today, -90)}&end=${today}`);
  $("events").innerHTML = events.length
    ? events.map((e) => `<div class="item" data-event="${e.id}"><div class="main">
        <div class="title">${esc(e.category)} — ${fmtDate(e.date)} ${e.intensity ? `<span class="pill gray">intensity ${e.intensity}</span>` : ""}</div>
        <div class="meta">${esc(e.notes || "")}</div></div>
        <button class="btn-danger" data-del-event="${e.id}" aria-label="Delete ${esc(e.category)} on ${fmtDate(e.date)}">Delete</button></div>`).join("")
    : `<div class="empty">No other events in the last 90 days.</div>`;
  $("events").querySelectorAll("[data-del-event]").forEach((b) =>
    b.addEventListener("click", () =>
      undoable({
        message: "Event deleted",
        hide: [b.closest("[data-event]")],
        run: () => api(`/api/health-events/${b.dataset.delEvent}`, { method: "DELETE", keepalive: true }),
      })
    )
  );
}
$("btn-event").addEventListener("click", async () => {
  try {
    await api("/api/health-events", {
      method: "POST",
      body: {
        date: $("e-date").value,
        category: $("e-cat").value,
        intensity: $("e-int").value ? Number($("e-int").value) : null,
        duration_minutes: $("e-dur").value ? Number($("e-dur").value) : null,
        notes: $("e-notes").value || null,
      },
    });
    toast("Event logged");
    $("e-notes").value = ""; $("e-int").value = ""; $("e-dur").value = "";
    loadEvents();
  } catch (err) { toast(err, true); }
});

function refresh() {
  loadHistory().catch((e) => toast(e, true));
  loadPatterns().catch((e) => toast(e, true));
}
document.addEventListener("thor:changed", (e) => {
  if (e.detail?.what === "headache") { ongoingHeadache({ fresh: true }); refresh(); }
  if (e.detail?.what === "checkin" && !$("checkin").contains(document.activeElement)) loadCheckin();
});
document.addEventListener("thor:resume", refresh);

(async () => {
  options = await api("/api/headaches/options");
  $("med-options").innerHTML = options.meds.map((m) => `<option value="${esc(m.name)}">`).join("");
  // Today's "Add details" opens the headache in progress, one short step at a time.
  const editId = params.get("edit");
  const h = editId ? await api(`/api/headaches/${encodeURIComponent(editId)}`).catch(() => null) : null;
  fillForm(h);
  if (h && matchMedia("(max-width: 899px)").matches) setStepMode(true);
  if (h || location.hash === "#headache") $("headache").scrollIntoView({ block: "start" });
  refresh();
  loadCheckin();
  loadEvents().catch(() => {});
})().catch((e) => toast(e, true));
