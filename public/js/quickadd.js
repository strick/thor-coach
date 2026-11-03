// The ＋ Log sheet: one place for every kind of logging, ordered by how often
// it's used, with a context row ("Mark ended" during a headache, "Next set"
// mid-workout). Headache, check-in, weight and note are logged right here.
import {
  api, toast, esc, todayISO, localDateTime, fmtTime, fmtWhen, fmtDate, closeOnBackdrop,
  ongoingHeadache, setLowGlare, announceChange, renderOngoing,
} from "./ui.js";
import { mountCheckin, morningDone, eveningDone } from "./checkin.js";

let sheet = null;
let headacheOptions = null;

function getSheet() {
  if (sheet) return sheet;
  sheet = document.createElement("dialog");
  sheet.className = "sheet";
  sheet.id = "quick-add";
  sheet.setAttribute("aria-label", "Log something");
  document.body.appendChild(sheet);
  closeOnBackdrop(sheet);
  sheet.addEventListener("close", () => {
    sheet.innerHTML = "";
    ongoingHeadache({ fresh: true }).then(setLowGlare);
  });
  return sheet;
}

export function openQuickAdd(view = "home") {
  const s = getSheet();
  if (!s.open) s.showModal();
  if (view === "headache") return headacheView();
  if (view === "checkin") return checkinView();
  return homeView();
}

const head = (title, { back = false, sub = "" } = {}) => `<div class="sheet-head">
    ${back ? '<button type="button" class="btn-link" data-back>‹ Back</button>' : ""}
    <h2>${title}</h2>${sub ? `<span class="sub">${sub}</span>` : ""}
    <button type="button" class="sheet-close" data-close>Close</button></div>`;

function wireHead() {
  sheet.querySelector("[data-close]")?.addEventListener("click", () => sheet.close());
  sheet.querySelector("[data-back]")?.addEventListener("click", () => homeView());
}

const tile = (key, title, sub, href = null) => href
  ? `<a class="tile" href="${href}" data-tile="${key}"><strong>${title}</strong><span data-sub>${sub}</span></a>`
  : `<button type="button" class="tile" data-tile="${key}"><strong>${title}</strong><span data-sub>${sub}</span></button>`;

// --- Home: tiles -------------------------------------------------------------

async function homeView() {
  const today = todayISO();
  sheet.innerHTML = `${head("Log something")}
    <div class="ctx-row" id="qa-ctx"></div>
    <div class="tiles">
      ${tile("set", "Set", "Today's plan", "index.html#plan")}
      ${tile("food", "Food", "Type it, pick it or scan it", "nutrition.html#log")}
      ${tile("headache", "Headache", "Three taps")}
      ${tile("checkin", "Check-in", "Sleep, energy, stress")}
      ${tile("water", "Water +1", "Tap to add a glass")}
      ${tile("weight", "Weight", "Weigh-in")}
      ${tile("run", "Run", "Strava syncs on its own", "running.html#log")}
      ${tile("note", "Note", "A line about today")}
    </div>`;
  wireHead();
  const sub = (key, text) => { const el = sheet.querySelector(`[data-tile="${key}"] [data-sub]`); if (el) el.textContent = text; };
  const on = (key, fn) => sheet.querySelector(`[data-tile="${key}"]`)?.addEventListener("click", fn);
  on("set", () => sheet.close());
  on("food", () => sheet.close());
  on("run", () => sheet.close());
  on("headache", () => headacheView());
  on("checkin", () => checkinView());
  on("weight", () => weightView());
  on("note", () => noteView());

  let water = null;
  on("water", async () => {
    const btn = sheet.querySelector('[data-tile="water"]');
    btn.disabled = true;
    try {
      if (!water) water = await api(`/api/water?date=${today}`);
      water = await api("/api/water", { method: "POST", body: { date: today, glasses: water.glasses + 1 } });
      sub("water", `${water.glasses} of ${water.goal} glasses · added ✓`);
      toast(`Water: ${water.glasses} of ${water.goal} glasses`);
      announceChange("water");
    } catch (err) {
      toast(err, true);
    } finally {
      btn.disabled = false;
    }
  });

  // Fill in the context while the tiles are already usable.
  const safe = (p) => p.catch(() => null);
  const [ongoing, w, body, checkin, cfg, logged] = await Promise.all([
    ongoingHeadache({ fresh: true }),
    safe(api(`/api/water?date=${today}`)),
    safe(api(`/api/body?start=${fmtISO(-60)}&end=${today}`)),
    safe(api(`/api/checkins/${today}`)),
    safe(api("/api/config")),
    safe(api(`/api/workouts?start=${today}&end=${today}`)),
  ]);
  if (!sheet.open || !sheet.querySelector("#qa-ctx")) return;
  water = w;
  if (w) sub("water", `${w.glasses} of ${w.goal} glasses`);
  const last = (body || []).filter((r) => r.weight_lbs != null).pop();
  if (last) sub("weight", `Last: ${last.weight_lbs} lbs`);
  if (checkin) {
    const m = morningDone(checkin), e = eveningDone(checkin);
    sub("checkin", `Morning ${m ? "done" : "open"} · evening ${e ? "done" : "open"}`);
  }
  const ctx = sheet.querySelector("#qa-ctx");
  if (ongoing) {
    const box = document.createElement("div");
    ctx.appendChild(box);
    renderOngoing(box, ongoing, { onChange: () => { announceChange("headache"); homeView(); } });
  }
  if (cfg) {
    const plan = await safe(api(`/api/day/${cfg.day_of_week}`));
    if (plan?.length) {
      const done = new Set((logged?.[0]?.logs || []).map((l) => l.exercise));
      const next = plan.find((ex) => !done.has(ex.name));
      sub("set", next ? `Next: ${next.name}` : "All done today ✓");
      if (next && done.size && sheet.open) {
        ctx.insertAdjacentHTML("beforeend",
          `<a class="tile" href="index.html#plan" data-next-set><strong>Next set: ${esc(next.name)}</strong><span>${done.size} of ${plan.length} done</span></a>`);
        ctx.querySelector("[data-next-set]").addEventListener("click", () => sheet.close());
      }
    } else if (plan) {
      sub("set", "Rest day — log anything");
    }
  }
}

const fmtISO = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return todayISO(d);
};

// --- Check-in ----------------------------------------------------------------

function checkinView(mode = new Date().getHours() < 15 ? "morning" : "evening") {
  sheet.innerHTML = `${head("Check-in", { back: true, sub: '<span class="saved-note" data-status></span>' })}
    <div class="segnav" role="group" aria-label="Which check-in">
      <a href="#" data-mode="morning"${mode === "morning" ? ' aria-current="true"' : ""}>Morning</a>
      <a href="#" data-mode="evening"${mode === "evening" ? ' aria-current="true"' : ""}>Evening</a>
    </div>
    <div id="qa-checkin"><p class="muted">Loading…</p></div>
    <button type="button" class="btn-block btn-lg mt" data-close-done>Done</button>`;
  wireHead();
  sheet.querySelectorAll("[data-mode]").forEach((a) =>
    a.addEventListener("click", (e) => { e.preventDefault(); checkinView(a.dataset.mode); })
  );
  sheet.querySelector("[data-close-done]").addEventListener("click", () => sheet.close());
  mountCheckin(sheet.querySelector("#qa-checkin"), {
    date: todayISO(), mode, statusEl: sheet.querySelector("[data-status]"),
  }).catch((err) => toast(err, true));
}

// --- Weight ------------------------------------------------------------------

async function weightView() {
  const today = todayISO();
  sheet.innerHTML = `${head("Weight", { back: true })}
    <label for="qa-weight">Weight (lbs)</label>
    <input id="qa-weight" type="number" inputmode="decimal" step="0.1" enterkeyhint="done" />
    <p class="muted small" id="qa-weight-last"></p>
    <button type="button" class="btn-block btn-lg mt" id="qa-weight-save">Save weigh-in</button>`;
  wireHead();
  const input = sheet.querySelector("#qa-weight");
  input.focus();
  const rows = (await api(`/api/body?start=${fmtISO(-60)}&end=${today}`).catch(() => [])).filter((r) => r.weight_lbs != null);
  const last = rows[rows.length - 1];
  if (last) {
    if (last.date === today) input.value = last.weight_lbs;
    else input.placeholder = String(last.weight_lbs);
    sheet.querySelector("#qa-weight-last").textContent = `Last: ${last.weight_lbs} lbs (${last.date === today ? "today" : fmtDate(last.date)})`;
  }
  const save = async () => {
    const w = Number(input.value);
    if (!w) return toast("Enter your weight first", true);
    try {
      await api("/api/body", { method: "PUT", body: { date: today, weight_lbs: w } });
      toast(`Weighed in at ${w} lbs`);
      announceChange("weight");
      sheet.close();
    } catch (err) { toast(err, true); }
  };
  sheet.querySelector("#qa-weight-save").addEventListener("click", save);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
}

// --- Note --------------------------------------------------------------------

async function noteView() {
  const today = todayISO();
  sheet.innerHTML = `${head("Note", { back: true })}
    <label for="qa-note">A line about today</label>
    <textarea id="qa-note" rows="3" placeholder="How did today feel?"></textarea>
    <button type="button" class="btn-block btn-lg mt" id="qa-note-save">Save</button>`;
  wireHead();
  const box = sheet.querySelector("#qa-note");
  const r = await api(`/api/reflections/day?date=${today}`).catch(() => ({}));
  if (r.body && !box.value) box.value = r.body;
  box.focus();
  sheet.querySelector("#qa-note-save").addEventListener("click", async () => {
    try {
      await api("/api/reflections/day", { method: "PUT", body: { date: today, body: box.value } });
      toast("Saved");
      announceChange("note");
      sheet.close();
    } catch (err) { toast(err, true); }
  });
}

// --- Headache: three taps ------------------------------------------------------
//
// ＋ → Headache → tap how bad it is. That saves it (start = now unless you pick
// earlier). Optional one-tap extras follow. The warning-sign row is on both
// screens; ticking any sign replaces the sheet with the care panel.

const SHORT_FLAGS = "Sudden worst-ever pain, weakness or numbness on one side, confusion, fever with a stiff neck, head injury, new vision loss";
const EXTRAS = [
  ["light_sensitivity", "Light hurts"],
  ["nausea", "Nausea"],
  ["aura", "Aura"],
  ["sound_sensitivity", "Sound hurts"],
];

async function headacheView() {
  setLowGlare(true);
  sheet.innerHTML = `${head("Headache", { back: true })}<p class="muted">Loading…</p>`;
  wireHead();
  headacheOptions ??= await api("/api/headaches/options").catch((err) => { toast(err, true); return null; });
  if (!headacheOptions) return;
  const ongoing = await ongoingHeadache({ fresh: true });
  severityStep(ongoing);
}

function flagsBox(checked = []) {
  return `<details class="flags-box" data-flags>
    <summary>Any warning signs?<span class="short">${SHORT_FLAGS}</span></summary>
    <fieldset><legend class="sr-only">Warning signs</legend>
    ${headacheOptions.red_flags.map((r) => `<label class="check-row"><input type="checkbox" value="${r.key}"${checked.includes(r.key) ? " checked" : ""} /> ${esc(r.label)}</label>`).join("")}
    </fieldset></details>`;
}

/** Ticking a warning sign saves it (creating the headache if needed) and shows the care panel. */
function wireFlags(getHeadache, setHeadache, startedAt) {
  sheet.querySelectorAll("[data-flags] input").forEach((i) =>
    i.addEventListener("change", async () => {
      const flags = [...sheet.querySelectorAll("[data-flags] input:checked")].map((x) => x.value);
      if (!flags.length) return;
      let h = getHeadache();
      try {
        h = h
          ? await api(`/api/headaches/${h.id}`, { method: "PATCH", body: { red_flags: [...new Set([...(h.red_flags || []), ...flags])] } })
          : await api("/api/headaches", { method: "POST", body: { started_at: startedAt(), red_flags: flags } });
        setHeadache(h);
        announceChange("headache");
      } catch (err) {
        toast(err, true);
      }
      careView(h, flags);
    })
  );
}

function careView(h, flags) {
  const labels = (h?.alert?.red_flags) || flags.map((k) => headacheOptions.red_flags.find((r) => r.key === k)?.label || k);
  sheet.innerHTML = `<div class="care-now" role="alert" tabindex="-1">
      <strong>Please get care now</strong>
      <p>${esc(headacheOptions.seek_care_message)}</p>
      <ul>${labels.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
      <div class="btn-row">
        <a class="btn care-call" href="tel:911">Call 911</a>
        <button type="button" class="care-ack" data-close>I'm getting care</button>
      </div>
      <p class="fine">${h ? "Your headache is saved. This message stays on Today until you dismiss it." : "Please get care now — the headache wasn't saved, but that can wait."}</p>
    </div>`;
  sheet.querySelector("[data-close]").addEventListener("click", () => sheet.close());
  sheet.querySelector(".care-now").focus();
}

function severityStep(ongoing) {
  let headache = ongoing || null;
  let startAt = null; // null = now
  const now = new Date();
  const title = ongoing ? `Headache since ${fmtWhen(ongoing.started_at)}` : "Headache";
  sheet.innerHTML = `${head(esc(title), { back: true, sub: ongoing ? "" : fmtTime(localDateTime(now)) })}
    ${ongoing ? "" : `<fieldset><legend>Started</legend>
      <div class="chips" data-start>
        <button type="button" class="chip" data-ago="0" aria-pressed="true">Now</button>
        <button type="button" class="chip" data-ago="30" aria-pressed="false">30 min ago</button>
        <button type="button" class="chip" data-ago="60" aria-pressed="false">1 h</button>
        <button type="button" class="chip" data-ago="120" aria-pressed="false">2 h</button>
        <button type="button" class="chip" data-pick aria-pressed="false">Pick…</button>
      </div>
      <div data-pick-row hidden><label for="qa-start">Started at</label><input type="datetime-local" id="qa-start" max="${localDateTime(now)}" /></div>
    </fieldset>`}
    <fieldset><legend id="qa-sev-l">How bad is it right now?</legend>
      <div class="rate ten" role="group" aria-labelledby="qa-sev-l">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `<button type="button" data-sev="${n}" aria-pressed="false">${n}</button>`).join("")}
      </div>
      <div class="scale-legend" aria-hidden="true"><span>1 mild</span><span>5 moderate</span><span>10 worst ever</span></div>
    </fieldset>
    <p class="muted small">${ongoing ? "Tapping a number updates it." : "Tapping a number saves it. Add the rest later."}</p>
    ${flagsBox(ongoing?.red_flags || [])}`;
  wireHead();
  const startedAt = () => startAt || localDateTime();
  sheet.querySelectorAll("[data-start] .chip").forEach((c) =>
    c.addEventListener("click", () => {
      sheet.querySelectorAll("[data-start] .chip").forEach((x) => x.setAttribute("aria-pressed", String(x === c)));
      const row = sheet.querySelector("[data-pick-row]");
      if (c.hasAttribute("data-pick")) {
        row.hidden = false;
        const input = row.querySelector("input");
        input.value ||= localDateTime(new Date(Date.now() - 3 * 3600_000));
        startAt = input.value;
        input.addEventListener("change", () => { startAt = input.value || null; });
        input.focus();
      } else {
        row.hidden = true;
        const ago = Number(c.dataset.ago);
        startAt = ago ? localDateTime(new Date(Date.now() - ago * 60_000)) : null;
      }
    })
  );
  sheet.querySelectorAll("[data-sev]").forEach((b) =>
    b.addEventListener("click", async () => {
      const sev = Number(b.dataset.sev);
      sheet.querySelectorAll("[data-sev]").forEach((x) => { x.setAttribute("aria-pressed", String(x === b)); x.disabled = true; });
      try {
        headache = headache
          ? await api(`/api/headaches/${headache.id}`, { method: "PATCH", body: { peak_severity: Math.max(sev, headache.peak_severity ?? 0) } })
          : await api("/api/headaches", { method: "POST", body: { started_at: startedAt(), peak_severity: sev } });
        announceChange("headache");
        extrasStep(headache, sev);
      } catch (err) {
        toast(err, true);
        sheet.querySelectorAll("[data-sev]").forEach((x) => { x.disabled = false; });
      }
    })
  );
  wireFlags(() => headache, (h) => { headache = h; }, startedAt);
}

function extrasStep(h, sevNow) {
  let headache = h;
  const meds = headacheOptions.meds.slice(0, 3);
  const taken = (m) => (headache.meds || []).some((x) => x.name.toLowerCase() === m.name.toLowerCase());
  const extraOn = ([key]) => (key === "aura" ? headache.aura : (headache.symptoms || []).includes(key));
  sheet.innerHTML = `${head(`Logged · ${esc(fmtTime(headache.started_at))} · ${sevNow}/10`, { back: true })}
    <p class="muted" style="margin-top:-6px">Still going. You'll see it on Today.</p>
    <fieldset><legend>Took something?</legend>
      <div class="chips">
        ${meds.map((m, i) => `<button type="button" class="chip" data-med="${i}" aria-pressed="${taken(m)}">${esc(m.name)}${m.dose ? ` ${esc(m.dose)}` : ""}</button>`).join("")}
        <a class="chip" href="health.html?edit=${encodeURIComponent(headache.id)}#headaches">Other…</a>
      </div></fieldset>
    <fieldset><legend>Anything else right now? (optional)</legend>
      <div class="chips">${EXTRAS.map(([key, label]) => `<button type="button" class="chip" data-extra="${key}" aria-pressed="${extraOn([key])}">${label}</button>`).join("")}</div>
    </fieldset>
    ${flagsBox(headache.red_flags || [])}
    <div class="btn-row mt">
      <a class="btn btn-ghost" href="health.html?edit=${encodeURIComponent(headache.id)}#headaches">Add details</a>
      <button type="button" data-done>Done, details later</button>
    </div>`;
  wireHead();
  sheet.querySelector("[data-done]").addEventListener("click", () => sheet.close());
  const patch = async (body, chip) => {
    const was = chip.getAttribute("aria-pressed");
    chip.setAttribute("aria-pressed", was === "true" ? "false" : "true");
    try {
      headache = await api(`/api/headaches/${headache.id}`, { method: "PATCH", body });
      announceChange("headache");
    } catch (err) {
      chip.setAttribute("aria-pressed", was);
      toast(err, true);
    }
  };
  sheet.querySelectorAll("[data-med]").forEach((c) =>
    c.addEventListener("click", () => {
      const m = meds[Number(c.dataset.med)];
      const current = (headache.meds || []).map(({ name, dose, time, relief, medication_id }) => ({ name, dose, time, relief, medication_id }));
      const next = taken(m)
        ? current.filter((x) => x.name.toLowerCase() !== m.name.toLowerCase())
        : [...current, { name: m.name, dose: m.dose || null, time: localDateTime(), medication_id: m.medication_id || null }];
      patch({ meds: next }, c);
    })
  );
  sheet.querySelectorAll("[data-extra]").forEach((c) =>
    c.addEventListener("click", () => {
      const key = c.dataset.extra;
      if (key === "aura") return patch({ aura: !headache.aura }, c);
      const s = new Set(headache.symptoms || []);
      if (s.has(key)) s.delete(key); else s.add(key);
      patch({ symptoms: [...s] }, c);
    })
  );
  wireFlags(() => headache, (x) => { headache = x; }, () => headache.started_at);
}
