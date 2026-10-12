import { api, toast, esc, todayISO, fmtDate, renderNav, segnav, TRAINING_SEGS, undoable, waiting, plural } from "./ui.js";

renderNav("running");
const $ = (id) => document.getElementById(id);
$("segs").innerHTML = segnav("Training", TRAINING_SEGS, "running");
$("sync-date").value = todayISO();
$("r-date").value = todayISO();

const fmtPace = (p) => (p ? `${Math.floor(p)}:${String(Math.round((p % 1) * 60)).padStart(2, "0")}` : "—");

async function loadStatus() {
  const s = await api("/api/running/strava/status");
  $("strava-status").innerHTML = s.configured
    ? `<span class="pill green">Strava connected</span>`
    : `<span class="pill amber">Strava not connected</span> <span class="muted small">${s.can_connect ? "connect below" : `set ${s.missing.join(", ")} in .env`}</span>`;
  $("btn-strava-connect").disabled = !s.can_connect;
  if (!s.configured) { $("btn-sync").disabled = true; $("btn-backfill").disabled = true; }
}

$("btn-strava-connect").addEventListener("click", async () => {
  $("btn-strava-connect").disabled = true;
  try {
    const { url } = await api("/api/running/strava/connect-url");
    location.href = url;
  } catch (err) {
    toast(err, true);
    $("btn-strava-connect").disabled = false;
  }
});

const connectionParams = new URLSearchParams(location.search);
if (connectionParams.get("strava") === "connected") {
  toast("Strava reconnected — you can sync now");
  history.replaceState({}, "", location.pathname);
} else if (connectionParams.get("strava_error")) {
  toast(connectionParams.get("strava_error"), true);
  history.replaceState({}, "", location.pathname);
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
      <div class="item" data-run="${r.id}">
        <div class="main">
          <div class="title">${fmtDate(r.session_date)} — ${r.distance_miles} mi in ${r.duration_minutes} min
            <span class="pill">${fmtPace(r.pace_min_per_mile)}/mi</span>
            ${r.avg_heart_rate ? `<span class="pill gray">${r.avg_heart_rate} bpm</span>` : ""}
            ${r.id.startsWith("strava-") ? `<span class="pill">Strava</span>` : ""}</div>
          <div class="meta">${esc(r.notes || "")}${r.calories_burned ? ` · ${r.calories_burned} kcal` : ""}${r.elevation_gain_ft ? ` · ↑${r.elevation_gain_ft} ft` : ""}</div>
        </div>
        <div style="white-space:nowrap">
          ${r.gps_file_url ? `<a class="pill" target="_blank" rel="noopener" href="${esc(r.gps_file_url)}">Strava ↗</a>` : ""}
          <button class="btn-danger" data-del="${r.id}" aria-label="Delete the run on ${fmtDate(r.session_date)}">Delete</button>
        </div>
      </div>`).join("")
    : `<div class="empty">No runs logged.</div>`;

  $("sessions").querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", () =>
      undoable({
        message: "Run deleted",
        hide: [b.closest("[data-run]")],
        run: () => api(`/api/running/sessions/${b.dataset.del}`, { method: "DELETE", keepalive: true }),
        onDone: () => { loadStats(); loadWeekly(); },
      })
    )
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
        <span class="pill ${r.status === "success" ? "green" : r.status === "failed" ? "amber" : "gray"}">${r.status}${r.status === "success" ? ` · ${r.activities_synced}` : ""}</span></div>`).join("")
    : `<div class="empty">No syncs yet.</div>`;
}

$("btn-sync").addEventListener("click", async () => {
  $("btn-sync").disabled = true;
  $("sync-result").innerHTML = waiting("Syncing with Strava…");
  try {
    const res = await api("/api/running/sync-strava", { method: "POST", body: { date: $("sync-date").value } });
    $("sync-result").innerHTML = `<span class="pill green">Found ${res.found}, imported ${res.imported}</span>`;
    toast(`Imported ${plural(res.imported, "run")} from Strava`);
    loadSessions(); loadStats(); loadWeekly(); loadSyncHistory();
  } catch (err) {
    $("sync-result").innerHTML = `<span class="pill amber">${esc(err.message)}</span>`;
    toast(err, true);
  } finally { $("btn-sync").disabled = false; }
});

$("btn-backfill").addEventListener("click", async () => {
  $("btn-backfill").disabled = true;
  $("sync-result").innerHTML = waiting("Catching up on the last 30 days…");
  try {
    const res = await api("/api/running/backfill", { method: "POST", body: {} });
    $("sync-result").innerHTML = `<span class="pill green">${res.range}: found ${res.found}, imported ${res.imported} new</span>`;
    toast(`Caught up: ${plural(res.imported, "new run")}`);
    loadSessions(); loadStats(); loadWeekly(); loadSyncHistory();
  } catch (err) {
    $("sync-result").innerHTML = `<span class="pill amber">${esc(err.message)}</span>`;
    toast(err, true);
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
    toast("Run logged");
    loadSessions(); loadStats(); loadWeekly();
  } catch (err) { toast(err, true); }
});

loadStatus().catch(() => {});
loadStats().catch((e) => toast(e, true));
loadSessions().catch(() => {});
loadWeekly().catch(() => {});
loadSyncHistory().catch(() => {});

// ＋ → Run lands on the log form.
if (location.hash === "#log") document.getElementById("log").scrollIntoView({ block: "start" });
