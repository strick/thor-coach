import { api, toast, esc, todayISO, addDays, fmtDate, fmtTime, localDateTime, renderNav, chartBars } from "./ui.js";
import { mountCheckin } from "./checkin.js";

renderNav("health");
const $ = (id) => document.getElementById(id);
const today = todayISO();

let options = null;
let editing = null; // headache being edited, or null when logging a new one

// --- Daily check-in ---------------------------------------------------------

$("ci-date").value = today;
$("ci-date").max = today;
const loadCheckin = () => mountCheckin($("checkin"), { date: $("ci-date").value || today }).catch((e) => toast(e.message, true));
$("ci-date").addEventListener("change", loadCheckin);

// --- Headache form ----------------------------------------------------------

function chips(el, items, selected = []) {
  el.innerHTML = items
    .map((i) => `<button type="button" class="chip${selected.includes(i.key) ? " on" : ""}" data-key="${esc(i.key)}">${esc(i.label)}</button>`)
    .join("");
  el.querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => c.classList.toggle("on")));
}
const chipValues = (el) => [...el.querySelectorAll(".chip.on")].map((c) => c.dataset.key);

function medRow(m = {}) {
  const row = document.createElement("div");
  row.className = "med-row";
  row.innerHTML = `
    <input class="m-name" list="med-options" placeholder="Medicine" value="${esc(m.name ?? "")}" />
    <input class="m-dose" placeholder="Dose" value="${esc(m.dose ?? "")}" />
    <input class="m-time" type="time" value="${esc((m.time || "").slice(-5))}" title="Time taken" />
    <select class="m-relief">
      <option value="">Relief?</option>
      ${options.relief.map((r) => `<option value="${r}"${m.relief === r ? " selected" : ""}>${r === "none" ? "no relief" : `${r} relief`}</option>`).join("")}
    </select>
    <button type="button" class="btn-danger" title="Remove">✕</button>`;
  row.querySelector(".m-name").addEventListener("change", (e) => {
    const known = options.meds.find((o) => o.name.toLowerCase() === e.target.value.trim().toLowerCase());
    if (known?.dose && !row.querySelector(".m-dose").value) row.querySelector(".m-dose").value = known.dose;
  });
  row.querySelector(".btn-danger").addEventListener("click", () => row.remove());
  $("h-meds").appendChild(row);
}

function showRedFlagBanner(labels) {
  $("h-alert").innerHTML = labels.length
    ? `<div class="banner red"><strong>Please get care now</strong>${esc(options.seek_care_message)}<div class="small mt">${labels.map(esc).join(" · ")}</div></div>`
    : "";
}

function redFlagLabels() {
  return [...$("h-redflags").querySelectorAll("input:checked")].map((i) => options.red_flags.find((r) => r.key === i.value)?.label);
}

function fillForm(h = null) {
  editing = h;
  $("h-title").textContent = h ? `Edit headache · ${fmtDate(h.date)}` : "Log a headache";
  $("h-cancel").style.display = h ? "" : "none";
  $("h-save").textContent = h ? "Save changes" : "Save headache";
  $("h-start").value = h ? h.started_at || "" : localDateTime();
  $("h-end").value = h?.ended_at || "";
  $("h-sev").value = h?.peak_severity ?? 5;
  $("h-sev-val").textContent = `(${$("h-sev").value} / 10)`;
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
  $("h-redflags").querySelectorAll("input").forEach((i) => i.addEventListener("change", () => showRedFlagBanner(redFlagLabels())));
  $("h-redflags-wrap").open = Boolean(h?.red_flags?.length);
  showRedFlagBanner(h ? redFlagLabels() : []);
  $("h-notes").value = h?.notes || "";
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
    ended_at: $("h-end").value || null,
    ...(start ? {} : { date: editing?.date || today }),
    peak_severity: Number($("h-sev").value),
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

$("h-sev").addEventListener("input", () => ($("h-sev-val").textContent = `(${$("h-sev").value} / 10)`));
$("h-add-med").addEventListener("click", () => medRow());
$("h-cancel").addEventListener("click", () => fillForm(null));
$("h-save").addEventListener("click", async () => {
  $("h-save").disabled = true;
  try {
    const body = readForm();
    const saved = editing
      ? await api(`/api/headaches/${editing.id}`, { method: "PATCH", body })
      : await api("/api/headaches", { method: "POST", body });
    toast(editing ? "Headache updated" : "Headache logged");
    fillForm(null);
    if (saved.alert) showRedFlagBanner(saved.alert.red_flags);
    refresh();
  } catch (err) {
    toast(err.message, true);
  } finally {
    $("h-save").disabled = false;
  }
});

// --- Ongoing banner, history, patterns --------------------------------------

async function endNow(id) {
  await api(`/api/headaches/${id}`, { method: "PATCH", body: { ended_at: localDateTime() } });
  toast("Marked as ended");
  refresh();
}

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

const sevClass = (s) => (s == null ? "gray" : s >= 7 ? "red" : s >= 4 ? "gold" : "green");
const durText = (m) => (m == null ? "" : m >= 90 ? `${Math.round((m / 60) * 10) / 10} h` : `${m} min`);

async function loadHistory() {
  const list = await api(`/api/headaches?start=${addDays(today, -180)}&end=${today}`);
  const ongoing = list.find((h) => h.ongoing);
  $("ongoing").innerHTML = ongoing
    ? `<div class="banner blue"><strong>Headache still going</strong>Started ${fmtTime(ongoing.started_at)}${ongoing.date !== today ? ` on ${fmtDate(ongoing.date)}` : ""} · worst pain ${ongoing.peak_severity ?? "?"}/10
        <div class="row"><button class="btn-sm fit" data-end="${ongoing.id}">It's over — end it now</button>
        <button class="btn-ghost btn-sm fit" data-edit="${ongoing.id}">Update</button></div></div>`
    : "";
  $("history").innerHTML = list.length
    ? list.slice(0, 40).map((h) => `
      <div class="item">
        <div class="main">
          <div class="title">${fmtDate(h.date)} · ${esc(h.type)}
            ${h.peak_severity != null ? `<span class="pill ${sevClass(h.peak_severity)}">${h.peak_severity}/10</span>` : ""}
            ${h.ongoing ? '<span class="pill">ongoing</span>' : h.duration_minutes != null ? `<span class="pill gray">${durText(h.duration_minutes)}</span>` : ""}
            ${h.red_flags.length ? '<span class="pill red">warning signs</span>' : ""}</div>
          <div class="meta">${esc(describe(h))}${h.notes ? ` — ${esc(h.notes)}` : ""}</div>
        </div>
        <div class="row fit" style="gap:6px;flex-wrap:nowrap">
          ${h.ongoing ? `<button class="btn-sm fit" data-end="${h.id}">End now</button>` : ""}
          <button class="btn-ghost btn-sm fit" data-edit="${h.id}">Edit</button>
          <button class="btn-danger fit" data-del="${h.id}" title="Delete">✕</button>
        </div>
      </div>`).join("")
    : `<div class="empty">No headaches logged yet. When one hits, log it above — even just the start time and how bad it is.</div>`;

  const byId = new Map(list.map((h) => [h.id, h]));
  document.querySelectorAll("[data-end]").forEach((b) => b.addEventListener("click", () => endNow(b.dataset.end).catch((e) => toast(e.message, true))));
  document.querySelectorAll("[data-edit]").forEach((b) =>
    b.addEventListener("click", () => {
      fillForm(byId.get(b.dataset.edit));
      $("headache").scrollIntoView({ behavior: "smooth", block: "start" });
    })
  );
  $("history").querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Delete this headache entry?")) return;
      await api(`/api/headaches/${b.dataset.del}`, { method: "DELETE" });
      toast("Deleted");
      refresh();
    })
  );
}

const STRENGTH = {
  strong: ["red", "Strong link"],
  possible: ["gold", "Possible link"],
  no_clear_link: ["gray", "No clear link"],
  insufficient: ["gray", "Not enough data yet"],
};

function rateRow(label, side) {
  const pct = side.rate == null ? 0 : Math.round(side.rate * 100);
  return `<div class="rate-row"><span>${label}</span>
    <div class="bar"><span style="width:${pct}%"></span></div>
    <span>${pct}% · ${side.headache_days} of ${side.days} days</span></div>`;
}

function factorHtml(f) {
  const [cls, text] = STRENGTH[f.strength];
  return `<div class="factor">
    <div class="head"><span>${esc(f.label)}</span><span class="pill ${cls}">${text}</span></div>
    ${f.strength === "insufficient"
      ? `<div class="muted small">${esc(f.needs)}</div>`
      : rateRow("With it", f.exposed) + rateRow("Without", f.unexposed)}
    ${f.low_confidence && f.strength !== "insufficient" ? `<div class="muted small">${esc(f.low_confidence)}</div>` : ""}
  </div>`;
}

async function loadPatterns() {
  const r = await api("/api/headache-insights?days=90");
  const c = r.coverage;
  $("coverage").textContent = `${c.days} days · ${c.headache_days} with headaches · ${c.checkin_days} check-ins · ${c.food_days} food days`;
  const o = r.overuse;
  $("overuse").innerHTML = o.status === "ok" ? "" : `<div class="banner ${o.status === "warn" ? "red" : "gold"}">
    <strong>${o.status === "warn" ? "Possible medication-overuse pattern" : "Keep an eye on headache medicine"}</strong>${esc(o.message)}</div>`;
  const shown = r.factors.filter((f) => f.strength !== "insufficient");
  const waiting = r.factors.filter((f) => f.strength === "insufficient");
  $("patterns").innerHTML =
    (shown.length
      ? shown.map(factorHtml).join("")
      : `<p class="muted">Not enough logged days to compare yet. Patterns start showing once you have a few weeks of check-ins and at least 3 headache days.</p>`) +
    (waiting.length
      ? `<details class="mt"><summary>Still collecting data (${waiting.length})</summary>${waiting.map(factorHtml).join("")}</details>`
      : "");
  $("caveat").textContent = r.caveat;
  $("weekly-chart").innerHTML = chartBars(
    r.weekly.map((w) => ({ label: new Date(w.week_of + "T12:00:00").toLocaleDateString("en-US", { month: "numeric", day: "numeric" }), value: w.headache_days })),
    { unit: " days", color: "var(--gold)" }
  );
}

// --- Other health events (legacy categories) ----------------------------------

$("e-date").value = today;
async function loadEvents() {
  const events = await api(`/api/health-events?start=${addDays(today, -90)}&end=${today}`);
  $("events").innerHTML = events.length
    ? events.map((e) => `<div class="item"><div class="main">
        <div class="title">${esc(e.category)} — ${fmtDate(e.date)} ${e.intensity ? `<span class="pill gray">intensity ${e.intensity}</span>` : ""}</div>
        <div class="meta">${esc(e.notes || "")}</div></div>
        <button class="btn-danger" data-del-event="${e.id}">✕</button></div>`).join("")
    : `<div class="empty">No other events in the last 90 days.</div>`;
  $("events").querySelectorAll("[data-del-event]").forEach((b) =>
    b.addEventListener("click", async () => {
      await api(`/api/health-events/${b.dataset.delEvent}`, { method: "DELETE" });
      loadEvents();
    })
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
  } catch (err) { toast(err.message, true); }
});

function refresh() {
  loadHistory().catch((e) => toast(e.message, true));
  loadPatterns().catch((e) => toast(e.message, true));
}

(async () => {
  options = await api("/api/headaches/options");
  $("med-options").innerHTML = options.meds.map((m) => `<option value="${esc(m.name)}">`).join("");
  fillForm(null);
  refresh();
  loadCheckin();
  loadEvents().catch(() => {});
  if (location.hash === "#headache") $("headache").scrollIntoView({ block: "start" });
})().catch((e) => toast(e.message, true));
