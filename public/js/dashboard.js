import {
  api, toast, esc, todayISO, addDays, fmtDate, renderNav, bar, renderOngoing, ongoingHeadache, setLowGlare,
  splitSections, findAction, renderMarkdown, renderReader, wireReader, readingTime, waiting, plural,
} from "./ui.js";
import { mountCheckin, morningDone } from "./checkin.js";

renderNav("index");

const $ = (id) => document.getElementById(id);
const today = todayISO();
const hour = new Date().getHours();

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
};

function weekStart() {
  const d = new Date();
  const back = (d.getDay() === 0 ? 7 : d.getDay()) - 1;
  return addDays(today, -back);
}

// --- Needs action: care messages and critical labs (kept until dismissed) -------

async function loadAlerts() {
  const { alerts } = await api("/api/alerts");
  $("alerts").innerHTML = alerts.map((a) => `
    <div class="care-now" role="${a.kind === "headache_red_flags" ? "alert" : "region"}" aria-label="${esc(a.title)}" data-alert="${esc(a.key)}">
      <strong>${esc(a.title)}</strong>
      <p>${esc(a.message)}</p>
      ${a.items?.length ? `<ul>${a.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : ""}
      <div class="btn-row">
        ${a.kind === "headache_red_flags"
          ? '<a class="btn care-call" href="tel:911">Call 911</a>'
          : `<a class="btn care-call" href="${esc(a.href || "labs.html")}">View result</a>`}
        <button type="button" class="care-ack" data-dismiss="${esc(a.key)}">${esc(a.dismiss_label || "Dismiss")}</button>
      </div>
    </div>`).join("");
  $("alerts").querySelectorAll("[data-dismiss]").forEach((b) =>
    b.addEventListener("click", async () => {
      try {
        await api("/api/alerts/dismiss", { method: "POST", body: { key: b.dataset.dismiss } });
        b.closest("[data-alert]").remove();
      } catch (err) { toast(err, true); }
    })
  );
}

// --- Headache in progress ----------------------------------------------------------

async function loadOngoingHeadache() {
  const ongoing = await ongoingHeadache({ fresh: true });
  setLowGlare(ongoing);
  renderOngoing($("ongoing-headache"), ongoing, { onChange: () => { loadOngoingHeadache(); loadAlerts().catch(() => {}); } });
  return ongoing;
}

// --- Weekly review: written Sunday evening, or Monday if it's still missing ----------

async function loadWeeklyReview() {
  const [latest] = await api("/api/guides?kind=weekly_review&limit=1");
  const dow = new Date().getDay(); // 0 = Sunday
  const reviewWeek = dow === 0 ? weekStart() : addDays(weekStart(), -7);
  const due = (dow === 0 && hour >= 18) || dow === 1;
  if (!due) return;
  let review = latest;
  if (!latest || latest.period_start < reviewWeek) {
    try {
      review = await api("/api/guides/weekly-review", { method: "POST", body: {} });
    } catch { /* silent — the Library button still works */ }
  }
  if (review && review.period_start >= reviewWeek) {
    $("weekly-review-link").innerHTML = `<a class="item" href="guides.html#${esc(review.id)}">
      <span class="main"><span class="title">Your weekly review is ready</span>
      <span class="meta" style="display:block">${esc(review.title)}</span></span><span class="chev" aria-hidden="true">›</span></a>`;
  }
}

// --- Check-in: morning half, and the evening wrap-up --------------------------------

let checkinState = null;
async function loadCheckin() {
  const widget = await mountCheckin($("checkin"), {
    date: today, mode: "morning", collapse: true, statusEl: $("checkin-status"),
    onChange: (s) => { checkinState = s; },
  });
  checkinState = widget.state;
  return widget.state;
}

async function loadWrapup() {
  const state = checkinState || (await api(`/api/checkins/${today}`));
  const started = state.stress != null || state.caffeine_servings != null || state.alcohol_drinks != null;
  if (hour < 16 && !started) return;
  $("wrapup-card").hidden = false;
  await mountCheckin($("wrapup"), { date: today, mode: "evening", collapse: true, statusEl: $("wrapup-status") });
}

// --- Today's plan: tap-to-log, "same as last" as the big button ------------------------

const describe = (l) =>
  `${l.sets ?? "?"}×${Array.isArray(l.reps) ? l.reps.join("/") : l.reps ?? "?"}${l.weight_lbs ? ` · ${l.weight_lbs} lbs` : ""}`;
const describeShort = (l) =>
  `${l.sets ?? "?"}×${Array.isArray(l.reps) ? l.reps.join("/") : l.reps ?? "?"}${l.weight_lbs ? ` at ${l.weight_lbs} lbs` : ""}`;
const parseReps = (raw) => {
  const parts = raw.split(/[,/\s]+/).map((n) => Number(n.trim())).filter((n) => Number.isFinite(n) && n > 0);
  return parts.length > 1 ? parts : parts.length ? parts[0] : null;
};

let plan = [];
let todayLogs = new Map();

async function loadPlan() {
  const cfg = await api("/api/config");
  const [p, logged] = await Promise.all([api(`/api/day/${cfg.day_of_week}`), api(`/api/workouts?start=${today}&end=${today}`)]);
  plan = p;
  todayLogs = new Map((logged[0]?.logs || []).map((l) => [l.exercise, l]));
  renderPlan();
  return {
    hasPlan: plan.length > 0,
    exercisesLeft: plan.filter((ex) => !todayLogs.has(ex.name)).length,
    loggedToday: todayLogs.size,
  };
}

function renderPlan() {
  const box = $("today-plan");
  if (!plan.length) {
    $("plan-progress").textContent = "";
    box.innerHTML = `<div class="empty">Rest day. Anything you did still counts; log it with ＋.</div>`;
    return;
  }
  const done = plan.filter((ex) => todayLogs.has(ex.name)).length;
  $("plan-progress").textContent = `${done} of ${plan.length} done`;
  box.innerHTML = "";
  for (const ex of plan) {
    const log = todayLogs.get(ex.name);
    const row = document.createElement("button");
    row.type = "button";
    row.className = `plan-row${log ? " done" : ""}`;
    row.dataset.ex = ex.id;
    row.setAttribute("aria-expanded", "false");
    row.innerHTML = `<span class="main"><span class="title">${esc(ex.name)}</span>${log ? `<span class="meta">${describe(log)}</span>` : ""}</span>
      <span class="state">${log ? "✓ Done" : "Log ›"}</span>`;
    row.addEventListener("click", () => toggleForm(ex, row).catch((e) => toast(e, true)));
    box.appendChild(row);
  }
}

async function toggleForm(ex, row, { focus = true } = {}) {
  const wasOpen = row.getAttribute("aria-expanded") === "true";
  $("today-plan").querySelectorAll(".quick-form").forEach((f) => f.remove());
  $("today-plan").querySelectorAll(".plan-row").forEach((r) => r.setAttribute("aria-expanded", "false"));
  if (wasOpen) return;
  const latest = await api(`/api/exercises/${ex.id}/latest?date=${today}`);
  row.setAttribute("aria-expanded", "true");
  const form = quickForm(ex, latest);
  row.after(form);
  if (focus) form.querySelector("button, input")?.focus({ preventScroll: true });
}

/** Open the next exercise not yet logged (mid-workout, and ＋ → Set). */
function openNext({ scroll = true } = {}) {
  const next = plan.find((ex) => !todayLogs.has(ex.name));
  if (!next) return;
  const row = $("today-plan").querySelector(`[data-ex="${CSS.escape(next.id)}"]`);
  if (!row) return;
  toggleForm(next, row, { focus: false })
    .then(() => { if (scroll) row.scrollIntoView({ block: "start" }); })
    .catch(() => {});
}

function quickForm(ex, latest) {
  const src = latest.today || latest.last;
  const nudge = latest.nudge;
  const id = `qf-${ex.id}`;
  const showFields = !latest.today && !latest.last;
  const wrap = document.createElement("div");
  wrap.className = "quick-form";
  wrap.innerHTML = `
    <p class="muted small" style="margin-top:0">${latest.today
      ? `Logged today: ${describe(latest.today)}`
      : latest.last ? `Last time: ${describe(latest.last)} · ${fmtDate(latest.session_date_last || latest.last.session_date)}`
      : "First time — set your baseline."}</p>
    ${!latest.today && latest.last ? `<button type="button" class="btn-block btn-lg qf-same">Log ${describeShort(latest.last)}</button>` : ""}
    ${!showFields ? `<div class="btn-row mt">
      <button type="button" class="btn-ghost qf-change" aria-expanded="false" aria-controls="${id}-fields">Change numbers</button>
      ${nudge && !latest.today ? `<button type="button" class="btn-ghost qf-nudge">Try ${nudge.suggest} lbs</button>` : ""}
    </div>` : ""}
    <div class="qf-fields" id="${id}-fields"${showFields ? "" : " hidden"}>
      <div class="row">
        <div><label for="${id}-sets">Sets</label><input id="${id}-sets" class="qf-sets" type="number" inputmode="numeric" enterkeyhint="next" min="1" value="${src?.sets ?? 3}" /></div>
        <div><label for="${id}-reps">Reps</label><input id="${id}-reps" class="qf-reps" enterkeyhint="next" autocomplete="off" placeholder="12 or 12,10,8" value="${esc(Array.isArray(src?.reps) ? src.reps.join(",") : src?.reps ?? "")}" /></div>
        <div><label for="${id}-lbs">Lbs</label><input id="${id}-lbs" class="qf-weight" type="number" inputmode="decimal" enterkeyhint="done" step="2.5" value="${src?.weight_lbs ?? ""}" /></div>
      </div>
      <button type="button" class="btn-block mt qf-save">${latest.today ? "Update today" : "Log it"}</button>
    </div>
    ${nudge && !latest.today ? `<p class="muted small">${nudge.current} lbs for ${nudge.sessions_at_weight} sessions — ${nudge.suggest} lbs might be ready.</p>` : ""}`;

  const fields = wrap.querySelector(".qf-fields");
  const showNumbers = () => {
    fields.hidden = false;
    wrap.querySelector(".qf-change")?.setAttribute("aria-expanded", "true");
  };
  wrap.querySelector(".qf-change")?.addEventListener("click", () => { showNumbers(); wrap.querySelector(".qf-sets").focus(); });
  wrap.querySelector(".qf-nudge")?.addEventListener("click", () => {
    showNumbers();
    wrap.querySelector(".qf-weight").value = nudge.suggest;
    wrap.querySelector(".qf-weight").focus();
  });

  async function save(body, btn) {
    unlockAudio(); // inside the tap, so Safari lets the end-of-rest beep play
    btn.disabled = true;
    try {
      if (latest.today) await api(`/api/exercise-logs/${latest.today.id}`, { method: "PATCH", body });
      else await api("/api/log-manual", { method: "POST", body: { exercise_id: ex.id, date: today, ...body } });
      toast(`${ex.name} ${latest.today ? "updated" : "logged"}`);
      startTimer(restSecs());
      workoutActive = true;
      keepAwake();
      const r = await loadPlan();
      if (r.exercisesLeft > 0) openNext({ scroll: false });
      else { workoutActive = false; releaseWake(); }
      loadWeek().catch(() => {});
    } catch (err) {
      toast(err, true);
      btn.disabled = false;
    }
  }

  wrap.querySelector(".qf-save").addEventListener("click", (e) =>
    save({
      sets: Number(wrap.querySelector(".qf-sets").value) || null,
      reps: parseReps(wrap.querySelector(".qf-reps").value.trim()),
      weight_lbs: wrap.querySelector(".qf-weight").value ? Number(wrap.querySelector(".qf-weight").value) : null,
    }, e.currentTarget)
  );
  wrap.querySelector(".qf-same")?.addEventListener("click", (e) =>
    save({ sets: latest.last.sets, reps: latest.last.reps, weight_lbs: latest.last.weight_lbs }, e.currentTarget)
  );
  return wrap;
}

$("btn-log").addEventListener("click", async () => {
  const text = $("quick-log").value.trim();
  if (!text) return toast("Type your workout first", true);
  $("btn-log").disabled = true;
  $("log-status").innerHTML = waiting("Reading your note…");
  try {
    const res = await api("/api/ingest", { method: "POST", body: { text } });
    $("log-results").innerHTML = res.results.map((r) => {
      if (r.status === "logged")
        return `<div class="item"><div class="main"><div class="title">✓ ${esc(r.exercise)}</div>
          <div class="meta">${r.sets ?? "?"} sets · ${Array.isArray(r.reps) ? r.reps.join(", ") : r.reps ?? "?"} reps${r.weight_lbs ? ` · ${r.weight_lbs} lbs` : ""}</div></div>
          <span class="pill green">Logged</span></div>`;
      return `<div class="item"><div class="main"><div class="title">${esc(r.exercise || r.input || "")}</div></div><span class="pill amber">${esc(r.status.replaceAll("_", " "))}</span></div>`;
    }).join("");
    $("quick-log").value = "";
    toast("Workout logged");
    loadWeek().catch(() => {});
    loadPlan().catch(() => {});
  } catch (err) {
    toast(err, true);
  } finally {
    $("btn-log").disabled = false;
    $("log-status").textContent = "";
  }
});

// --- Rest timer: docked at the bottom while it runs ---------------------------------------

let audio = null;
let wake = null;
let workoutActive = false;
let timerHandle = null;
let timerEnds = 0;
let timerTotal = 0;
let hideDock = null;

const restSecs = () => Number(store.get("thor_rest_secs")) || 90;

function unlockAudio() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume?.();
  } catch { /* no audio */ }
}

function beep() {
  if (!audio) return;
  try {
    [0, 0.25, 0.5].forEach((delay, i) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.connect(gain).connect(audio.destination);
      osc.frequency.value = i === 2 ? 1320 : 880;
      gain.gain.setValueAtTime(0.25, audio.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + delay + 0.2);
      osc.start(audio.currentTime + delay);
      osc.stop(audio.currentTime + delay + 0.22);
    });
  } catch { /* no audio */ }
}

// Keep the screen on during a workout (Safari 16.4+; Home Screen apps from iOS 18.4).
async function keepAwake() {
  try {
    if (!wake || wake.released) wake = await navigator.wakeLock?.request("screen");
  } catch { /* not granted */ }
}
function releaseWake() {
  wake?.release?.().catch(() => {});
  wake = null;
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && (workoutActive || timerHandle)) keepAwake(); // the lock drops when you leave
});

const fmtLeft = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function renderTimer() {
  const left = Math.max(0, Math.ceil((timerEnds - Date.now()) / 1000));
  $("timer-time").textContent = fmtLeft(left);
  $("timer-fill").style.width = `${Math.min(100, (1 - left / timerTotal) * 100)}%`;
  if (left <= 0) {
    clearInterval(timerHandle);
    timerHandle = null;
    $("timer-dock").classList.add("done");
    $("timer-label").textContent = "Rest done";
    $("timer-time").textContent = "✓";
    $("timer-add").hidden = true;
    $("timer-skip").textContent = "Close";
    beep();
    navigator.vibrate?.([200, 100, 200]);
    toast("Rest done");
    hideDock = setTimeout(stopTimer, 15000);
  }
}

function startTimer(secs) {
  clearTimeout(hideDock);
  clearInterval(timerHandle);
  timerTotal = secs;
  timerEnds = Date.now() + secs * 1000;
  $("timer-dock").hidden = false;
  $("timer-dock").classList.remove("done");
  $("timer-label").textContent = "Rest";
  $("timer-add").hidden = false;
  $("timer-skip").textContent = "Skip";
  document.body.classList.add("has-dock");
  renderTimer();
  timerHandle = setInterval(renderTimer, 250);
}

function stopTimer() {
  clearTimeout(hideDock);
  clearInterval(timerHandle);
  timerHandle = null;
  $("timer-dock").hidden = true;
  document.body.classList.remove("has-dock");
}

$("timer-add").addEventListener("click", () => { timerEnds += 30_000; timerTotal += 30; renderTimer(); });
$("timer-skip").addEventListener("click", stopTimer);

function syncRestPick() {
  document.querySelectorAll("[data-timer]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.timer) === restSecs())));
}
document.querySelectorAll("[data-timer]").forEach((b) =>
  b.addEventListener("click", () => {
    unlockAudio();
    store.set("thor_rest_secs", b.dataset.timer);
    syncRestPick();
    startTimer(Number(b.dataset.timer));
  })
);
syncRestPick();

// --- Daily summary: the action first, then "at a glance" -----------------------------------

let hasTodaySummary = false;

function renderSummary(md, which) {
  const { sections } = splitSections(md);
  const action = findAction(sections);
  const glance = sections.find((s) => /at a glance/i.test(s.title));
  const rest = sections.filter((s) => s !== action && s !== glance);
  const restMd = rest.map((s) => `## ${s.title}\n${s.body}`).join("\n\n");
  const yesterday = which === "yesterday";
  $("summary-h").textContent = yesterday ? "From last night's summary" : "Today at a glance";
  $("summary-meta").textContent = readingTime(md);
  $("daily-summary").innerHTML = `
    ${yesterday ? `<p class="muted small" style="margin-top:0">This is yesterday's summary. Today's will be ready this evening.</p>` : ""}
    ${action ? `<section class="one-thing"><h3>${yesterday && /tomorrow/i.test(action.title) ? "Try today" : esc(action.title)}</h3><div class="md">${renderMarkdown(action.body)}</div></section>` : ""}
    ${glance && !yesterday ? `<div class="md">${renderMarkdown(glance.body)}</div>` : ""}
    ${rest.length || (yesterday && glance) ? `<details class="more"><summary>Read the full summary · ${readingTime(md)}</summary>
      ${renderReader((yesterday && glance ? `## ${glance.title}\n${glance.body}\n\n` : "") + restMd, { idPrefix: "sum", jump: false })}</details>` : ""}`;
  wireReader($("daily-summary"));
}

async function loadSummary() {
  const s = await api(`/api/daily-summary/${today}`);
  if (s.markdown) {
    hasTodaySummary = true;
    renderSummary(s.markdown, "today");
    $("btn-summary").textContent = "Update with my latest data";
    return true;
  }
  // Until today's exists, yesterday's "Try tomorrow" is today's suggestion
  // (skipping summaries written in the old coach voice, which used "## Your Day").
  const y = await api(`/api/daily-summary/${addDays(today, -1)}`);
  if (y.markdown && !y.markdown.startsWith("## Your Day")) renderSummary(y.markdown, "yesterday");
  else $("daily-summary").innerHTML = `<p class="muted" style="margin:0">Your summary writes itself after 6 pm. You can also write it now.</p>`;
  return false;
}

async function generateSummary(auto = false) {
  $("btn-summary").disabled = true;
  $("summary-status").innerHTML = waiting("Thor is reading your day. This usually takes under a minute.");
  try {
    const s = await api("/api/daily-summary", { method: "POST", body: { date: today } });
    hasTodaySummary = true;
    renderSummary(s.markdown, "today");
    $("btn-summary").textContent = "Update with my latest data";
    if (!auto) toast("Summary ready");
  } catch (err) {
    if (!auto) toast(err, true);
  } finally {
    $("btn-summary").disabled = false;
    $("summary-status").textContent = "";
  }
}
$("btn-summary").addEventListener("click", () => generateSummary(false));

// --- This week in one row, plus the folded details -------------------------------------------

let waterState = { glasses: 0, goal: 8 };

async function loadWeek() {
  const ws = weekStart();
  const [workouts, runStats, nutrition, goals, water] = await Promise.all([
    api(`/api/workouts?start=${ws}&end=${today}`),
    api(`/api/running/stats?start=${ws}&end=${today}`),
    api(`/api/nutrition/day?date=${today}`),
    api("/api/goals"),
    api(`/api/water?date=${today}`),
  ]);
  waterState = water;
  const miles = runStats.total_distance || 0;
  const protein = Math.round(nutrition.totals?.protein_g || 0);
  const proteinTarget = nutrition.targets?.protein_g;
  $("week-row").innerHTML = `
    <a class="wk" href="workouts.html"><strong>${workouts.length}${goals.weekly_workouts ? `/${goals.weekly_workouts}` : ""}</strong><span>workouts this week</span></a>
    <a class="wk" href="running.html"><strong>${miles.toFixed(1)}</strong><span>${goals.weekly_miles ? `of ${goals.weekly_miles} miles` : "miles this week"}</span></a>
    <a class="wk" href="nutrition.html"><strong>${protein} g</strong><span>${proteinTarget ? `of ${Math.round(proteinTarget)} g protein` : "protein today"}</span></a>
    <button type="button" class="wk" id="wk-water" aria-label="Water: ${water.glasses} of ${water.goal} glasses. Add a glass."><strong>${water.glasses}/${water.goal}</strong><span>water · tap +1</span></button>`;
  $("wk-water").addEventListener("click", () => setWater(waterState.glasses + 1));
  renderWater();

  const box = $("nutrition-today");
  if (!nutrition.exists || !nutrition.meals.length) {
    box.innerHTML = `<p class="muted" style="margin:0 0 10px">Nothing logged yet today.</p>`;
  } else {
    const t = nutrition.totals, g = nutrition.targets;
    box.innerHTML =
      bar("Calories", t.calories_kcal, g?.calories_kcal || 2000, "kcal", "limit") +
      bar("Protein", t.protein_g, g?.protein_g, "g", "target") +
      bar("Fiber", t.fiber_g, g?.fiber_g, "g", "target") +
      bar("Sodium", t.sodium_mg, g?.sodium_mg_max, "mg", "limit") +
      bar("Sat fat", t.sat_fat_g, g?.sat_fat_g_max, "g", "limit") +
      `<p class="muted small">${plural(nutrition.meals.length, "meal")}: ${nutrition.meals.map((m) => esc(m.meal_type)).join(", ")}</p>`;
  }
}

function renderWater() {
  const { glasses, goal } = waterState;
  const cells = Math.max(goal, glasses);
  let html = "";
  for (let i = 1; i <= cells; i += 1) {
    const cls = i <= glasses ? (i > goal ? "over" : "full") : "";
    html += `<button type="button" class="glass ${cls}" data-set="${i}" aria-label="${plural(i, "glass", "glasses")}" aria-pressed="${i <= glasses}"></button>`;
  }
  $("water-glasses").innerHTML = html;
  $("water-label").textContent = `${glasses} of ${goal} glasses · ${glasses * 8} oz${glasses >= goal ? " · goal reached ✓" : ""}`;
  $("water-glasses").querySelectorAll("[data-set]").forEach((g) =>
    g.addEventListener("click", () => {
      // tapping the current level clears it back one; otherwise set to tapped level
      const n = Number(g.dataset.set);
      setWater(n === waterState.glasses ? n - 1 : n);
    })
  );
  const wk = $("wk-water");
  if (wk) {
    wk.querySelector("strong").textContent = `${glasses}/${goal}`;
    wk.setAttribute("aria-label", `Water: ${glasses} of ${goal} glasses. Add a glass.`);
  }
}

async function setWater(glasses) {
  const prev = waterState;
  waterState = { ...waterState, glasses: Math.max(0, glasses) };
  renderWater();
  try {
    waterState = await api("/api/water", { method: "POST", body: { date: today, glasses: Math.max(0, glasses) } });
    renderWater();
  } catch (err) {
    waterState = prev;
    renderWater();
    toast(err, true);
  }
}

async function loadLatestRun() {
  const runs = await api("/api/running/sessions?limit=1");
  if (!runs.length) return;
  const r = runs[0];
  $("latest-run").innerHTML = `<div class="item"><div class="main">
      <div class="title">${r.distance_miles} mi · ${r.duration_minutes} min · ${r.pace_min_per_mile || "?"}/mi</div>
      <div class="meta">${fmtDate(r.session_date)}${r.avg_heart_rate ? ` · ${r.avg_heart_rate} bpm avg` : ""}${esc(r.notes ? " · " + r.notes : "")}</div>
    </div>${r.gps_file_url ? `<a class="pill" href="${esc(r.gps_file_url)}" target="_blank" rel="noopener">Strava ↗</a>` : ""}</div>`;
}

async function autoSyncStrava() {
  try {
    const res = await api("/api/running/auto-sync", { method: "POST", body: { date: today } });
    if (res.imported > 0) {
      toast(`Pulled ${plural(res.imported, "run")} from Strava`);
      loadLatestRun(); loadWeek();
    }
  } catch { /* silent — Today should never nag about sync */ }
}

async function loadWeight() {
  const rows = await api(`/api/body?start=${addDays(today, -45)}&end=${today}`);
  const withWeight = rows.filter((r) => r.weight_lbs != null);
  if (!withWeight.length) {
    $("weight-trend").textContent = "No weigh-ins yet.";
    return;
  }
  const latest = withWeight[withWeight.length - 1];
  if (latest.date === today) $("weigh-in").value = latest.weight_lbs;
  const ago = withWeight.filter((r) => r.date <= addDays(today, -6));
  const ref = ago[ago.length - 1];
  const delta = ref ? (latest.weight_lbs - ref.weight_lbs).toFixed(1) : null;
  // A weight change isn't a warning: neutral text, no colour.
  $("weight-trend").textContent =
    `${latest.weight_lbs} lbs (${latest.date === today ? "today" : fmtDate(latest.date)})` +
    (delta != null ? ` · ${delta > 0 ? "+" : ""}${delta} lbs this week` : "");
}

$("btn-weight").addEventListener("click", async () => {
  const w = Number($("weigh-in").value);
  if (!w) return toast("Enter your weight first", true);
  try {
    await api("/api/body", { method: "PUT", body: { date: today, weight_lbs: w } });
    toast(`Weighed in at ${w} lbs`);
    loadWeight();
  } catch (err) { toast(err, true); }
});

async function loadStreak() {
  const streak = await api("/api/streak");
  $("streak").textContent = streak.streak > 1 ? `Logged ${streak.streak} days in a row` : "";
}

// --- Order the page by what needs you, then the card for right now ---------------------------

function arrangeToday({ checkedIn, exercisesLeft, loggedToday }) {
  const order = [];
  const push = (id) => { if (!order.includes(id)) order.push(id); };
  // 1. Needs action (each is empty unless true)
  ["alerts", "ongoing-headache", "weekly-review-link"].forEach(push);
  // 2. The card for right now
  if (loggedToday > 0 && exercisesLeft > 0) push("plan-card"); // mid-workout
  if (hour < 11 && !checkedIn) push("checkin-card");
  if (hour >= 17) { push("summary-card"); push("wrapup-card"); }
  if (exercisesLeft > 0 && hour >= 11) push("plan-card");
  if (!checkedIn && hour < 17) push("checkin-card");
  // 3. This week in one row, then everything else
  push("week-row");
  ["plan-card", "summary-card", "checkin-card", "wrapup-card", "more-today", "streak"].forEach(push);
  const flow = $("today-flow");
  order.forEach((id) => flow.appendChild($(id)));
}

// --- Hash targets from the ＋ sheet: #plan opens the next exercise, #checkin scrolls ------------

function handleHash() {
  if (location.hash === "#plan") {
    $("plan-card").scrollIntoView({ block: "start" });
    openNext({ scroll: false });
  } else if (location.hash === "#checkin") {
    $("checkin-card").scrollIntoView({ block: "start" });
  }
}
addEventListener("hashchange", handleHash);

// Something logged from the ＋ sheet, or the app came back to the foreground.
document.addEventListener("thor:changed", (e) => {
  const what = e.detail?.what;
  if (what === "water") loadWeek().catch(() => {});
  if (what === "headache") { loadOngoingHeadache().catch(() => {}); loadAlerts().catch(() => {}); }
  if (what === "weight") loadWeight().catch(() => {});
  if (what === "checkin" && !$("checkin").contains(document.activeElement)) loadCheckin().catch(() => {});
});
document.addEventListener("thor:resume", () => {
  loadWeek().catch(() => {});
  loadOngoingHeadache().catch(() => {});
  loadAlerts().catch(() => {});
});

// --- Boot ------------------------------------------------------------------------------------

$("greeting").textContent = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
$("today-label").textContent = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

loadAlerts().catch(() => {});
loadOngoingHeadache().catch(() => {});
loadWeeklyReview().catch(() => {});
loadWeek().catch((e) => toast(e, true));
loadLatestRun().catch(() => {});
loadWeight().catch(() => {});
loadStreak().catch(() => {});
loadSummary().then((hasToday) => {
  // evening auto-summary: once per day, only if not written yet
  if (!hasToday && hour >= 18) generateSummary(true);
}).catch(() => {});

Promise.all([
  loadCheckin().catch(() => { $("checkin").innerHTML = `<div class="empty">Couldn't load the check-in.</div>`; return null; }),
  loadPlan().catch(() => ({ exercisesLeft: 0, loggedToday: 0 })),
]).then(async ([checkin, planState]) => {
  arrangeToday({ checkedIn: morningDone(checkin), ...planState });
  await loadWrapup().catch(() => {});
  if (planState.loggedToday > 0 && planState.exercisesLeft > 0) { workoutActive = true; openNext({ scroll: false }); }
  handleHash();
});
autoSyncStrava();
