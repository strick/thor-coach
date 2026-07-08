import { api, toast, esc, todayISO, fmtDate, renderNav } from "./ui.js";

renderNav("running");
const $ = (id) => document.getElementById(id);
$("sync-date").value = todayISO();
$("r-date").value = todayISO();

const fmtPace = (p) => (p ? `${Math.floor(p)}:${String(Math.round((p % 1) * 60)).padStart(2, "0")}` : "—");

async function loadStatus() {
  const s = await api("/api/running/strava/status");
  $("strava-status").innerHTML = s.configured
    ? `<span class="pill green">Strava connected (${s.token_source})</span>`
    : `<span class="pill red">Strava not configured</span> <span class="muted small">set ${s.missing.join(", ")} in .env</span>`;
  if (!s.configured) { $("btn-sync").disabled = true; $("btn-backfill").disabled = true; }
}

async function loadStats() {
  const s = await api("/api/running/stats");
  $("s-runs").textContent = s.total_sessions;
  $("s-miles").textContent = (s.total_distance || 0).toFixed(1);
  $("s-pace").textContent = fmtPace(s.avg_pace);
  $("s-cal").textContent = (s.total_calories || 0).toLocaleString();
}

async function loadSessions() {
  const list = await api("/api/running/sessions?limit=50");
  $("sessions").innerHTML = list.length
    ? list.map((r) => `
      <div class="item">
        <div class="main">
          <div class="title">${fmtDate(r.session_date)} — ${r.distance_miles} mi in ${r.duration_minutes} min
            <span class="pill">${fmtPace(r.pace_min_per_mile)}/mi</span>
            ${r.avg_heart_rate ? `<span class="pill gold">${r.avg_heart_rate} bpm</span>` : ""}
            ${r.id.startsWith("strava-") ? `<span class="pill">Strava</span>` : ""}</div>
          <div class="meta">${esc(r.notes || "")}${r.calories_burned ? ` · ${r.calories_burned} kcal` : ""}${r.elevation_gain_ft ? ` · ↑${r.elevation_gain_ft} ft` : ""}</div>
        </div>
        <div style="white-space:nowrap">
          ${r.gps_file_url ? `<a class="pill" target="_blank" href="${esc(r.gps_file_url)}">↗</a>` : ""}
          <button class="btn-danger" data-del="${r.id}">✕</button>
        </div>
      </div>`).join("")
    : `<div class="empty">No runs logged.</div>`;

  $("sessions").querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Delete this run?")) return;
      await api(`/api/running/sessions/${b.dataset.del}`, { method: "DELETE" });
      toast("Run deleted");
      loadSessions(); loadStats(); loadWeekly();
    })
  );
}

async function loadWeekly() {
  const weeks = await api("/api/running/stats/weekly");
  if (!weeks.length) { $("weekly").innerHTML = `<div class="empty">No data yet.</div>`; return; }
  const max = Math.max(...weeks.map((w) => w.distance || 0), 1);
  $("weekly").innerHTML = weeks.reverse().map((w) => `
    <div class="bar-wrap">
      <div class="bar-head"><span>wk of ${fmtDate(w.start_date)}</span><span class="val">${w.distance} mi · ${w.sessions} runs</span></div>
      <div class="bar"><span style="width:${((w.distance || 0) / max) * 100}%"></span></div>
    </div>`).join("");
}

async function loadSyncHistory() {
  const runs = await api("/api/running/strava/sync-history");
  $("sync-history").innerHTML = runs.length
    ? runs.map((r) => `<div class="item"><div class="main"><div class="title">${esc(r.sync_date)}</div>
        <div class="meta">${esc(r.started_at)}${r.error ? ` — ${esc(r.error)}` : ""}</div></div>
        <span class="pill ${r.status === "success" ? "green" : r.status === "failed" ? "red" : "gray"}">${r.status}${r.status === "success" ? ` · ${r.activities_synced}` : ""}</span></div>`).join("")
    : `<div class="empty">No syncs yet.</div>`;
}

$("btn-sync").addEventListener("click", async () => {
  $("btn-sync").disabled = true;
  $("sync-result").innerHTML = '<span class="spin">⚡</span> Syncing…';
  try {
    const res = await api("/api/running/sync-strava", { method: "POST", body: { date: $("sync-date").value } });
    $("sync-result").innerHTML = `<span class="pill green">Found ${res.found}, imported ${res.imported}</span>`;
    toast(`Imported ${res.imported} run(s) from Strava`);
    loadSessions(); loadStats(); loadWeekly(); loadSyncHistory();
  } catch (err) {
    $("sync-result").innerHTML = `<span class="pill red">${esc(err.message)}</span>`;
    toast(err.message, true);
  } finally { $("btn-sync").disabled = false; }
});

$("btn-backfill").addEventListener("click", async () => {
  $("btn-backfill").disabled = true;
  $("sync-result").innerHTML = '<span class="spin">⚡</span> Backfilling last 30 days…';
  try {
    const res = await api("/api/running/backfill", { method: "POST", body: {} });
    $("sync-result").innerHTML = `<span class="pill green">${res.range}: found ${res.found}, imported ${res.imported} new</span>`;
    toast(`Backfilled ${res.imported} run(s)`);
    loadSessions(); loadStats(); loadWeekly(); loadSyncHistory();
  } catch (err) {
    $("sync-result").innerHTML = `<span class="pill red">${esc(err.message)}</span>`;
    toast(err.message, true);
  } finally { $("btn-backfill").disabled = false; }
});

$("btn-run").addEventListener("click", async () => {
  try {
    await api("/api/running/sessions", {
      method: "POST",
      body: {
        session_date: $("r-date").value,
        distance_miles: Number($("r-dist").value),
        duration_minutes: Number($("r-dur").value),
        avg_heart_rate: $("r-hr").value ? Number($("r-hr").value) : null,
        effort_level: $("r-effort").value || null,
        surface: $("r-surface").value || null,
        notes: $("r-notes").value || null,
      },
    });
    toast("Run logged 🏃");
    loadSessions(); loadStats(); loadWeekly();
  } catch (err) { toast(err.message, true); }
});

loadStatus().catch(() => {});
loadStats().catch((e) => toast(e.message, true));
loadSessions().catch(() => {});
loadWeekly().catch(() => {});
loadSyncHistory().catch(() => {});
