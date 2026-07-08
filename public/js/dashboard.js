import { api, toast, esc, renderMarkdown, todayISO, addDays, fmtDate, renderNav, bar } from "./ui.js";

renderNav("index");

const $ = (id) => document.getElementById(id);
const today = todayISO();

function weekStart() {
  const d = new Date();
  const back = (d.getDay() === 0 ? 7 : d.getDay()) - 1;
  return addDays(today, -back);
}

async function loadStats() {
  const ws = weekStart();
  const [workouts, runStats, nutrition, streak, goals] = await Promise.all([
    api(`/api/workouts?start=${ws}&end=${today}`),
    api(`/api/running/stats?start=${ws}&end=${today}`),
    api(`/api/nutrition/day?date=${today}`),
    api("/api/streak"),
    api("/api/goals"),
  ]);
  const volume = Math.round(workouts.reduce((a, w) => a + w.total_volume, 0));
  const miles = runStats.total_distance || 0;
  $("stat-workouts").textContent = workouts.length;
  $("stat-volume").textContent = volume.toLocaleString();
  $("stat-miles").textContent = miles.toFixed(1);
  $("stat-protein").textContent = Math.round(nutrition.totals?.protein_g || 0);

  // Weekly goal progress under the stat labels
  const goalNote = (el, value, target, unit) => {
    if (!target) return;
    const pct = Math.min(100, (value / target) * 100);
    el.insertAdjacentHTML("beforeend",
      ` <span class="${value >= target ? "pill green" : "pill gray"}" style="font-size:10px;padding:1px 7px">${unit === "mi" ? value.toFixed(1) : value} / ${target}${unit ? " " + unit : ""}</span>`);
  };
  document.querySelectorAll("#stat-cards .goal-note").forEach((n) => n.remove());
  $("stat-workouts").parentElement.querySelector(".stat-label").querySelectorAll(".pill").forEach((p) => p.remove());
  $("stat-volume").parentElement.querySelector(".stat-label").querySelectorAll(".pill").forEach((p) => p.remove());
  $("stat-miles").parentElement.querySelector(".stat-label").querySelectorAll(".pill").forEach((p) => p.remove());
  goalNote($("stat-workouts").parentElement.querySelector(".stat-label"), workouts.length, goals.weekly_workouts, "");
  goalNote($("stat-volume").parentElement.querySelector(".stat-label"), volume, goals.weekly_volume_lbs, "lbs");
  goalNote($("stat-miles").parentElement.querySelector(".stat-label"), miles, goals.weekly_miles, "mi");

  const streakEl = $("streak");
  if (streak.streak > 0) {
    streakEl.innerHTML = `<span class="pill gold">🔥 ${streak.streak}-day streak${streak.today_active ? "" : " — log something to keep it"}</span>`;
  } else {
    streakEl.innerHTML = `<span class="pill gray">No streak — today's a good day to start one</span>`;
  }

  const box = $("nutrition-today");
  if (!nutrition.exists || !nutrition.meals.length) {
    box.innerHTML = `<div class="empty">Nothing logged yet today.</div>`;
  } else {
    const t = nutrition.totals, g = nutrition.targets;
    box.innerHTML =
      bar("Calories", t.calories_kcal, g?.calories_kcal || 2000, "kcal", "limit") +
      bar("Protein", t.protein_g, g?.protein_g, "g", "target") +
      bar("Fiber", t.fiber_g, g?.fiber_g, "g", "target") +
      bar("Sodium", t.sodium_mg, g?.sodium_mg_max, "mg", "limit") +
      bar("Sat fat", t.sat_fat_g, g?.sat_fat_g_max, "g", "limit") +
      `<div class="muted small mt">${nutrition.meals.length} meal(s): ${nutrition.meals.map((m) => m.meal_type).join(", ")}</div>`;
  }
}

// --- Tap-to-log: expand an exercise into a prefilled quick form ---

const fmtReps = (reps) => (Array.isArray(reps) ? reps.join(",") : reps ?? "");
const describe = (l) =>
  `${l.sets ?? "?"}×${Array.isArray(l.reps) ? l.reps.join("/") : l.reps ?? "?"}${l.weight_lbs ? ` @ ${l.weight_lbs} lbs` : ""}`;

function quickForm(ex, latest) {
  const src = latest.today || latest.last;
  const nudge = latest.nudge;
  const wrap = document.createElement("div");
  wrap.className = "quick-form";
  wrap.innerHTML = `
    ${nudge && !latest.today ? `<button class="qf-nudge btn-gold btn-sm" style="margin-bottom:8px">📈 ${nudge.current} lbs for ${nudge.sessions_at_weight} sessions — load ${nudge.suggest} today</button>` : ""}
    <div class="row">
      <div><label>Sets</label><input type="number" class="qf-sets" min="1" value="${src?.sets ?? 3}" /></div>
      <div><label>Reps</label><input class="qf-reps" placeholder="12 or 12,10,8" value="${esc(fmtReps(src?.reps))}" /></div>
      <div><label>Lbs</label><input type="number" class="qf-weight" step="2.5" value="${src?.weight_lbs ?? ""}" /></div>
    </div>
    <div class="row mt" style="align-items:center">
      <button class="qf-save fit">${latest.today ? "Update today" : "Log it"}</button>
      ${!latest.today && latest.last ? `<button class="qf-same btn-gold fit btn-sm">Same as last (${describe(latest.last)})</button>` : ""}
      ${latest.last ? `<span class="muted small">Last: ${describe(latest.last)} on ${fmtDate(latest.session_date_last || latest.last.session_date)}</span>` : `<span class="muted small">First time — set your baseline.</span>`}
    </div>`;
  wrap.querySelector(".qf-nudge")?.addEventListener("click", () => {
    wrap.querySelector(".qf-weight").value = nudge.suggest;
    toast(`Loaded ${nudge.suggest} lbs — go get it`);
  });

  const parseRepsInput = (raw) =>
    raw.includes(",") ? raw.split(",").map((n) => Number(n.trim())).filter(Number.isFinite) : raw ? Number(raw) : null;

  async function save(body) {
    if (latest.today) {
      await api(`/api/exercise-logs/${latest.today.id}`, { method: "PATCH", body });
    } else {
      await api("/api/log-manual", { method: "POST", body: { exercise_id: ex.id, date: today, ...body } });
    }
    toast(`${ex.name} ${latest.today ? "updated" : "logged"} 💪`);
    startTimer(Number(localStorage.getItem("thor_rest_secs")) || 90);
    loadPlan();
    loadStats();
  }

  wrap.querySelector(".qf-save").addEventListener("click", () =>
    save({
      sets: Number(wrap.querySelector(".qf-sets").value) || null,
      reps: parseRepsInput(wrap.querySelector(".qf-reps").value.trim()),
      weight_lbs: wrap.querySelector(".qf-weight").value ? Number(wrap.querySelector(".qf-weight").value) : null,
    }).catch((e) => toast(e.message, true))
  );
  wrap.querySelector(".qf-same")?.addEventListener("click", () =>
    save({ sets: latest.last.sets, reps: latest.last.reps, weight_lbs: latest.last.weight_lbs }).catch((e) => toast(e.message, true))
  );
  return wrap;
}

async function loadPlan() {
  const cfg = await api("/api/config");
  $("today-label").textContent = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const [plan, logged] = await Promise.all([api(`/api/day/${cfg.day_of_week}`), api(`/api/workouts?start=${today}&end=${today}`)]);
  const todayLogs = new Map((logged[0]?.logs || []).map((l) => [l.exercise, l]));

  const box = $("today-plan");
  if (!plan.length) {
    box.innerHTML = `<div class="empty">Rest day — nothing planned. The AI box above still logs anything.</div>`;
    return;
  }
  box.innerHTML = "";
  for (const ex of plan) {
    const log = todayLogs.get(ex.name);
    const item = document.createElement("div");
    item.className = "item plan-item";
    item.innerHTML = `<div class="main"><div class="title">${esc(ex.name)}</div>
        ${log ? `<div class="meta">${describe(log)}</div>` : ""}</div>
      ${log ? '<span class="pill green">✓ logged</span>' : '<span class="pill">tap to log</span>'}`;
    item.addEventListener("click", async () => {
      const open = item.nextElementSibling?.classList?.contains("quick-form");
      document.querySelectorAll("#today-plan .quick-form").forEach((f) => f.remove());
      if (open) return;
      try {
        const latest = await api(`/api/exercises/${ex.id}/latest?date=${today}`);
        item.after(quickForm(ex, latest));
      } catch (e) { toast(e.message, true); }
    });
    box.appendChild(item);
  }
}

async function loadSummary() {
  const s = await api(`/api/daily-summary/${today}`);
  if (s.markdown) {
    $("daily-summary").innerHTML = renderMarkdown(s.markdown);
    return true;
  }
  // fall back to yesterday's insights until today's exists
  const y = await api(`/api/daily-summary/${addDays(today, -1)}`);
  if (y.markdown) {
    $("daily-summary").innerHTML = `<p class="muted small">Yesterday's summary — generate today's when you're done for the day.</p>` + renderMarkdown(y.markdown);
  }
  return false;
}

async function generateSummary(auto = false) {
  $("btn-summary").disabled = true;
  $("summary-status").innerHTML = '<span class="spin">⚡</span> Coach is reviewing your week…';
  try {
    const s = await api("/api/daily-summary", { method: "POST", body: { date: today } });
    $("daily-summary").innerHTML = renderMarkdown(s.markdown);
    if (!auto) toast("Summary generated");
  } catch (err) {
    if (!auto) toast(err.message, true);
  } finally {
    $("btn-summary").disabled = false;
    $("summary-status").textContent = "";
  }
}

async function loadReflection() {
  const r = await api(`/api/reflections/day?date=${today}`);
  $("reflection").value = r.body || "";
}

async function loadLatestRun() {
  const runs = await api("/api/running/sessions?limit=1");
  if (!runs.length) return;
  const r = runs[0];
  $("latest-run").innerHTML = `<div class="item"><div class="main">
      <div class="title">${r.distance_miles} mi · ${r.duration_minutes} min · ${r.pace_min_per_mile || "?"}/mi</div>
      <div class="meta">${fmtDate(r.session_date)}${r.avg_heart_rate ? ` · ${r.avg_heart_rate} bpm avg` : ""}${esc(r.notes ? " · " + r.notes : "")}</div>
    </div>${r.gps_file_url ? `<a class="pill" href="${esc(r.gps_file_url)}" target="_blank">Strava ↗</a>` : ""}</div>`;
}

async function autoSyncStrava() {
  try {
    const res = await api("/api/running/auto-sync", { method: "POST", body: { date: today } });
    if (res.imported > 0) {
      toast(`🟠 Pulled ${res.imported} run(s) from Strava`);
      loadLatestRun(); loadStats();
    }
  } catch { /* silent — dashboard should never nag about sync */ }
}

$("btn-sync-now").addEventListener("click", async () => {
  $("btn-sync-now").disabled = true;
  try {
    const res = await api("/api/running/sync-strava", { method: "POST", body: { date: today } });
    toast(res.imported > 0 ? `Imported ${res.imported} run(s)` : "No new runs today");
    loadLatestRun(); loadStats();
  } catch (err) { toast(err.message, true); }
  finally { $("btn-sync-now").disabled = false; }
});

$("btn-log").addEventListener("click", async () => {
  const text = $("quick-log").value.trim();
  if (!text) return toast("Type your workout first", true);
  $("btn-log").disabled = true;
  $("log-status").innerHTML = '<span class="spin">⚡</span> Parsing with AI…';
  try {
    const res = await api("/api/ingest", { method: "POST", body: { text } });
    $("log-results").innerHTML = res.results.map((r) => {
      if (r.status === "logged")
        return `<div class="item"><div class="main"><div class="title">✓ ${esc(r.exercise)}</div>
          <div class="meta">${r.sets ?? "?"} sets · ${Array.isArray(r.reps) ? r.reps.join(", ") : r.reps ?? "?"} reps${r.weight_lbs ? ` · ${r.weight_lbs} lbs` : ""}</div></div>
          <span class="pill green">logged</span></div>`;
      return `<div class="item"><div class="main"><div class="title">${esc(r.exercise || r.input || "")}</div></div><span class="pill red">${esc(r.status.replaceAll("_", " "))}</span></div>`;
    }).join("");
    $("quick-log").value = "";
    toast("Workout logged 💪");
    loadStats(); loadPlan();
  } catch (err) {
    toast(err.message, true);
  } finally {
    $("btn-log").disabled = false;
    $("log-status").textContent = "";
  }
});

$("btn-summary").addEventListener("click", () => generateSummary(false));

$("btn-reflection").addEventListener("click", async () => {
  try {
    await api("/api/reflections/day", { method: "PUT", body: { date: today, body: $("reflection").value } });
    toast("Reflection saved");
  } catch (err) {
    toast(err.message, true);
  }
});

// --- Rest timer with beep ---

let timerHandle = null;
let timerEnds = 0;

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25, 0.5].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain).connect(ctx.destination);
      osc.frequency.value = i === 2 ? 1320 : 880;
      gain.gain.setValueAtTime(0.25, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.2);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.22);
    });
  } catch { /* no audio available */ }
}

function renderTimer() {
  const left = Math.max(0, Math.round((timerEnds - Date.now()) / 1000));
  const disp = $("timer-display");
  disp.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  disp.className = "pill fit " + (left <= 10 ? "red" : "gold");
  disp.style.cssText = "font-size:16px;min-width:64px;justify-content:center";
  if (left <= 0) {
    stopTimer();
    disp.textContent = "GO!";
    disp.className = "pill green fit";
    disp.style.cssText = "font-size:16px;min-width:64px;justify-content:center";
    beep();
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  }
}

function startTimer(secs) {
  localStorage.setItem("thor_rest_secs", secs);
  stopTimer();
  timerEnds = Date.now() + secs * 1000;
  $("timer-stop").style.display = "";
  renderTimer();
  timerHandle = setInterval(renderTimer, 500);
}

function stopTimer() {
  if (timerHandle) clearInterval(timerHandle);
  timerHandle = null;
  $("timer-stop").style.display = "none";
}

document.querySelectorAll("[data-timer]").forEach((b) =>
  b.addEventListener("click", () => startTimer(Number(b.dataset.timer)))
);
$("timer-stop").addEventListener("click", () => {
  stopTimer();
  $("timer-display").textContent = "—";
  $("timer-display").className = "pill gray fit";
  $("timer-display").style.cssText = "font-size:16px;min-width:64px;justify-content:center";
});

// --- Weigh-in ---

async function loadWeight() {
  const rows = await api(`/api/body?start=${addDays(today, -45)}&end=${today}`);
  const withWeight = rows.filter((r) => r.weight_lbs != null);
  if (!withWeight.length) {
    $("weight-trend").textContent = "No weigh-ins yet — step on the scale.";
    return;
  }
  const latest = withWeight[withWeight.length - 1];
  if (latest.date === today) $("weigh-in").value = latest.weight_lbs;
  const ago = withWeight.filter((r) => r.date <= addDays(today, -6));
  const ref = ago[ago.length - 1];
  const delta = ref ? (latest.weight_lbs - ref.weight_lbs).toFixed(1) : null;
  $("weight-trend").innerHTML =
    `${latest.weight_lbs} lbs (${latest.date === today ? "today" : fmtDate(latest.date)})` +
    (delta != null ? ` · <span class="${delta <= 0 ? "pill green" : "pill gold"}">${delta > 0 ? "+" : ""}${delta} lbs / 7d</span>` : "");
}

$("btn-weight").addEventListener("click", async () => {
  const w = Number($("weigh-in").value);
  if (!w) return toast("Enter your weight first", true);
  try {
    await api("/api/body", { method: "PUT", body: { date: today, weight_lbs: w } });
    toast(`Weighed in at ${w} lbs`);
    loadWeight();
  } catch (err) { toast(err.message, true); }
});

const hour = new Date().getHours();
$("greeting").textContent = hour < 12 ? "Morning. Go earn it." : hour < 17 ? "Afternoon check-in" : "Evening review";

loadStats().catch((e) => toast(e.message, true));
loadPlan().catch(() => {});
loadSummary().then((hasToday) => {
  // evening auto-insights: once per day, only if not generated yet
  if (!hasToday && hour >= 18) generateSummary(true);
}).catch(() => {});
loadReflection().catch(() => {});
loadLatestRun().catch(() => {});
loadWeight().catch(() => {});
autoSyncStrava();
