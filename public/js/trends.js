import { api, toast, esc, todayISO, addDays, renderNav, chartBars, chartLine } from "./ui.js";

renderNav("trends");
const $ = (id) => document.getElementById(id);
const today = todayISO();
const shortDate = (iso) => iso.slice(5).replace("-", "/");

async function loadVolume() {
  const p = await api(`/api/progress/summary?start=${addDays(today, -84)}&end=${today}`);
  $("c-volume").innerHTML = chartBars(
    p.weekly.map((w) => ({ label: shortDate(w.start_date), value: w.volume })),
    { unit: " lbs" }
  );
  $("headline").textContent = `${p.total_sessions} sessions · ${p.total_volume.toLocaleString()} lbs moved in 12 weeks`;
  return p;
}

async function loadExercises(progress) {
  const all = await api("/api/exercises");
  // order by how often they're actually trained
  const counts = progress.per_exercise;
  const trained = all
    .filter((e) => counts[e.name])
    .sort((a, b) => (counts[b.name]?.count || 0) - (counts[a.name]?.count || 0));
  const list = trained.length ? trained : all;
  $("ex-select").innerHTML = list.map((e) => `<option value="${e.id}">${esc(e.name)}</option>`).join("");
  await loadExerciseSeries();
  $("ex-select").addEventListener("change", () => loadExerciseSeries().catch((e) => toast(e.message, true)));
}

async function loadExerciseSeries() {
  const id = $("ex-select").value;
  if (!id) return;
  const series = await api(`/api/progress/exercise/${id}`);
  const weighted = series.filter((s) => s.weight_lbs != null);
  if (weighted.length >= 2) {
    $("c-exercise").innerHTML = chartLine(
      weighted.map((s) => ({ label: shortDate(s.date), value: s.weight_lbs })),
      { unit: " lbs", color: "var(--gold)" }
    );
    const first = weighted[0].weight_lbs, last = weighted[weighted.length - 1].weight_lbs;
    const delta = last - first;
    $("ex-meta").innerHTML = `Weight: ${first} → ${last} lbs ` +
      (delta > 0 ? `<span class="pill green">+${delta} lbs 📈</span>` : delta < 0 ? `<span class="pill red">${delta} lbs</span>` : `<span class="pill gray">flat — time to push?</span>`);
  } else if (series.length >= 2) {
    $("c-exercise").innerHTML = chartLine(
      series.map((s) => ({ label: shortDate(s.date), value: s.volume })),
      { unit: " reps·lbs", color: "var(--gold)" }
    );
    $("ex-meta").textContent = "Bodyweight — showing total volume per session.";
  } else {
    $("c-exercise").innerHTML = `<div class="empty">Logged ${series.length} time(s) — need 2+ for a trend.</div>`;
    $("ex-meta").textContent = "";
  }
}

async function loadRunning() {
  const weeks = (await api("/api/running/stats/weekly")).reverse();
  $("c-miles").innerHTML = chartBars(
    weeks.map((w) => ({ label: shortDate(w.start_date), value: w.distance || 0 })),
    { unit: " mi", color: "var(--success)" }
  );
  const runs = (await api("/api/running/sessions?limit=30")).reverse().filter((r) => r.pace_min_per_mile);
  $("c-pace").innerHTML = chartLine(
    runs.map((r) => ({ label: shortDate(r.session_date), value: r.pace_min_per_mile })),
    { unit: " min/mi", color: "var(--success)" }
  );
}

async function loadNutrition() {
  const [days, goals] = await Promise.all([
    api(`/api/nutrition/summary?start=${addDays(today, -60)}&end=${today}`),
    api("/api/nutrition/goals"),
  ]);
  const recent = days.slice(-14);
  const target = goals?.daily_protein_target_g || 150;
  $("c-protein").innerHTML =
    chartBars(recent.map((d) => ({ label: shortDate(d.date_local), value: d.protein_g, value2: target })), { unit: "g" }) +
    `<div class="muted small mt">Gold line = ${target}g target · hit ${recent.filter((d) => d.protein_g >= target).length}/${recent.length} days</div>`;
  $("c-cal").innerHTML = chartBars(
    recent.map((d) => ({ label: shortDate(d.date_local), value: d.calories_kcal })),
    { unit: " kcal", color: "var(--gold)" }
  );
}

async function loadWeight() {
  const rows = (await api(`/api/body?start=${addDays(today, -60)}&end=${today}`)).filter((r) => r.weight_lbs != null);
  if (rows.length < 2) {
    $("c-weight").innerHTML = `<div class="empty">${rows.length ? "One weigh-in so far — need 2+ for a trend." : "No weigh-ins yet — log one on the dashboard."}</div>`;
    return;
  }
  $("c-weight").innerHTML = chartLine(
    rows.map((r) => ({ label: shortDate(r.date), value: r.weight_lbs })),
    { unit: " lbs", color: "var(--danger)" }
  );
  const delta = (rows[rows.length - 1].weight_lbs - rows[0].weight_lbs).toFixed(1);
  $("weight-meta").innerHTML = `${rows[0].weight_lbs} → ${rows[rows.length - 1].weight_lbs} lbs ` +
    `<span class="pill ${delta <= 0 ? "green" : "gold"}">${delta > 0 ? "+" : ""}${delta} lbs</span> over ${rows.length} weigh-ins`;
}

loadVolume()
  .then((p) => loadExercises(p))
  .catch((e) => toast(e.message, true));
loadRunning().catch(() => {});
loadNutrition().catch(() => {});
loadWeight().catch(() => {});
