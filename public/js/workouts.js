import { api, toast, esc, todayISO, addDays, fmtDate, DOW_NAMES, renderNav } from "./ui.js";

renderNav("workouts");
const $ = (id) => document.getElementById(id);
const today = todayISO();

$("ai-date").value = today;
$("m-date").value = today;
$("h-start").value = addDays(today, -90);
$("h-end").value = today;

async function loadExercises() {
  const list = await api("/api/exercises");
  $("m-exercise").innerHTML = list
    .map((e) => `<option value="${e.id}">${esc(e.name)} (${DOW_NAMES[e.day_of_week].slice(0, 3)})</option>`)
    .join("");
}

const fmtReps = (reps) => (Array.isArray(reps) ? reps.join(", ") : reps ?? "—");

async function loadHistory() {
  const sessions = await api(`/api/workouts?start=${$("h-start").value}&end=${$("h-end").value}`);
  $("range-label").textContent = `${sessions.length} sessions`;
  if (!sessions.length) {
    $("history").innerHTML = `<div class="empty">No sessions in this range.</div>`;
    return;
  }
  $("history").innerHTML = sessions.map((s) => `
    <div class="item" style="display:block">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
        <div class="title">${fmtDate(s.session_date)} <span class="pill">${Math.round(s.total_volume).toLocaleString()} lbs</span></div>
        <button class="btn-danger" data-del-session="${s.id}">Delete day</button>
      </div>
      <table class="mt">
        <thead><tr><th>Exercise</th><th>Sets</th><th>Reps</th><th>Weight</th><th>Notes</th><th></th></tr></thead>
        <tbody>${s.logs.map((l) => `
          <tr data-log="${l.id}">
            <td>${esc(l.exercise)}</td>
            <td>${l.sets ?? "—"}</td>
            <td>${fmtReps(l.reps)}</td>
            <td>${l.weight_lbs != null ? l.weight_lbs + " lbs" : "—"}</td>
            <td class="muted small">${esc(l.notes || "")}</td>
            <td style="white-space:nowrap">
              <button class="btn-ghost btn-sm" data-edit="${l.id}">✎</button>
              <button class="btn-danger" data-del-log="${l.id}">✕</button>
            </td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>`).join("");

  $("history").querySelectorAll("[data-del-session]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Delete this whole session?")) return;
      await api(`/api/workouts/${b.dataset.delSession}`, { method: "DELETE" });
      toast("Session deleted");
      loadHistory();
    })
  );
  $("history").querySelectorAll("[data-del-log]").forEach((b) =>
    b.addEventListener("click", async () => {
      await api(`/api/exercise-logs/${b.dataset.delLog}`, { method: "DELETE" });
      toast("Log deleted");
      loadHistory();
    })
  );
  $("history").querySelectorAll("[data-edit]").forEach((b) =>
    b.addEventListener("click", async () => {
      const row = $("history").querySelector(`tr[data-log="${b.dataset.edit}"]`);
      const cells = row.querySelectorAll("td");
      const sets = prompt("Sets:", cells[1].textContent.trim());
      if (sets === null) return;
      const reps = prompt("Reps (12 or 12,10,8):", cells[2].textContent.trim());
      if (reps === null) return;
      const weight = prompt("Weight lbs (blank = none):", cells[3].textContent.replace(" lbs", "").trim());
      if (weight === null) return;
      const notes = prompt("Notes:", cells[4].textContent.trim());
      const repsVal = reps.includes(",") ? reps.split(",").map((n) => Number(n.trim())).filter(Number.isFinite) : reps === "" || reps === "—" ? null : Number(reps);
      await api(`/api/exercise-logs/${b.dataset.edit}`, {
        method: "PATCH",
        body: {
          sets: sets === "" || sets === "—" ? null : Number(sets),
          reps: repsVal,
          weight_lbs: weight === "" || weight === "—" ? null : Number(weight),
          notes: notes || null,
        },
      });
      toast("Updated");
      loadHistory();
    })
  );
}

async function loadProgress() {
  const p = await api(`/api/progress/summary?start=${addDays(today, -56)}&end=${today}`);
  const rows = Object.entries(p.per_exercise)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12)
    .map(([name, x]) => {
      const delta = x.first_weight != null && x.last_weight != null ? x.last_weight - x.first_weight : null;
      const trend = delta == null ? "" : delta > 0 ? `<span class="pill green">+${delta} lbs</span>` : delta < 0 ? `<span class="pill red">${delta} lbs</span>` : `<span class="pill gray">flat</span>`;
      return `<tr><td>${esc(name)}</td><td>${x.count}×</td><td>${x.last_weight != null ? x.last_weight + " lbs" : "BW"}</td><td>${trend}</td></tr>`;
    }).join("");
  $("progress").innerHTML = `
    <div class="row mb">
      <div><div class="stat">${p.total_sessions}</div><div class="stat-label">sessions</div></div>
      <div><div class="stat">${p.total_volume.toLocaleString()}</div><div class="stat-label">total lbs</div></div>
    </div>
    <table><thead><tr><th>Exercise</th><th>Times</th><th>Current</th><th>Trend</th></tr></thead><tbody>${rows || ""}</tbody></table>`;
}

async function loadWeekly() {
  const list = await api("/api/weekly-summaries");
  $("weekly").innerHTML = list.length
    ? list.slice(0, 6).map((w) => `
      <div class="item" style="display:block">
        <div class="title">${fmtDate(w.week_start_date)} – ${fmtDate(w.week_end_date)}
          <span class="pill">${w.total_sessions} sessions</span>
          <span class="pill gold">${Math.round(w.total_volume).toLocaleString()} lbs</span></div>
        <div class="meta mt">${esc(w.summary_text || "")}</div>
      </div>`).join("")
    : `<div class="empty">No weekly summaries yet.</div>`;
}

$("btn-ai").addEventListener("click", async () => {
  const text = $("ai-text").value.trim();
  if (!text) return toast("Describe your workout first", true);
  $("btn-ai").disabled = true;
  try {
    const res = await api("/api/ingest", { method: "POST", body: { text, date: $("ai-date").value } });
    $("ai-results").innerHTML = res.results.map((r) =>
      r.status === "logged"
        ? `<div class="item"><div class="main"><div class="title">✓ ${esc(r.exercise)}</div><div class="meta">${r.sets ?? "?"} sets · ${fmtReps(r.reps)} reps${r.weight_lbs ? ` · ${r.weight_lbs} lbs` : ""}</div></div><span class="pill green">logged</span></div>`
        : `<div class="item"><div class="main"><div class="title">${esc(r.exercise || r.input || "")}</div></div><span class="pill red">${esc(r.status.replaceAll("_", " "))}</span></div>`
    ).join("");
    $("ai-text").value = "";
    toast("Logged");
    loadHistory(); loadProgress();
  } catch (err) { toast(err.message, true); }
  finally { $("btn-ai").disabled = false; }
});

$("btn-manual").addEventListener("click", async () => {
  const repsRaw = $("m-reps").value.trim();
  const reps = repsRaw.includes(",") ? repsRaw.split(",").map((n) => Number(n.trim())).filter(Number.isFinite) : repsRaw ? Number(repsRaw) : null;
  try {
    await api("/api/log-manual", {
      method: "POST",
      body: {
        exercise_id: $("m-exercise").value,
        date: $("m-date").value,
        sets: $("m-sets").value ? Number($("m-sets").value) : null,
        reps,
        weight_lbs: $("m-weight").value ? Number($("m-weight").value) : null,
        notes: $("m-notes").value || null,
      },
    });
    toast("Logged");
    loadHistory(); loadProgress();
  } catch (err) { toast(err.message, true); }
});

$("btn-history").addEventListener("click", () => loadHistory().catch((e) => toast(e.message, true)));
$("btn-weekly").addEventListener("click", async () => {
  $("btn-weekly").disabled = true;
  try {
    await api("/api/weekly-summaries/generate", { method: "POST", body: {} });
    toast("Weekly summary generated");
    loadWeekly();
  } catch (err) { toast(err.message, true); }
  finally { $("btn-weekly").disabled = false; }
});

// --- Plan editor ---

async function loadPlanEditor() {
  const day = Number($("pe-day").value);
  const all = await api("/api/exercises");
  const dayEx = all.filter((e) => e.day_of_week === day);
  $("pe-list").innerHTML = dayEx.length
    ? dayEx.map((e) => `
      <div class="item">
        <div class="main"><div class="title">${esc(e.name)}</div>
          <div class="meta">${JSON.parse(e.aliases || "[]").join(", ") || "no aliases"}</div></div>
        <div style="white-space:nowrap">
          <button class="btn-ghost btn-sm" data-pe-rename="${e.id}">✎</button>
          <select data-pe-move="${e.id}" style="width:auto;display:inline-block;padding:6px 8px;font-size:12px">
            ${[1, 2, 3, 4, 5, 6, 7].map((d) => `<option value="${d}"${d === day ? " selected" : ""}>${DOW_NAMES[d].slice(0, 3)}</option>`).join("")}
          </select>
          <button class="btn-danger" data-pe-del="${e.id}">✕</button>
        </div>
      </div>`).join("")
    : `<div class="empty">Nothing planned for ${DOW_NAMES[day]}.</div>`;

  $("pe-list").querySelectorAll("[data-pe-rename]").forEach((b) =>
    b.addEventListener("click", async () => {
      const ex = dayEx.find((e) => e.id === b.dataset.peRename);
      const name = prompt("Exercise name:", ex.name);
      if (!name?.trim()) return;
      const aliases = prompt("Aliases (comma-separated):", JSON.parse(ex.aliases || "[]").join(", "));
      await api(`/api/exercises/${ex.id}`, {
        method: "PATCH",
        body: { name, aliases: aliases == null ? undefined : aliases.split(",").map((a) => a.trim()).filter(Boolean) },
      });
      toast("Exercise updated");
      loadPlanEditor(); loadExercises();
    })
  );
  $("pe-list").querySelectorAll("[data-pe-move]").forEach((sel) =>
    sel.addEventListener("change", async () => {
      await api(`/api/exercises/${sel.dataset.peMove}`, { method: "PATCH", body: { day_of_week: Number(sel.value) } });
      toast(`Moved to ${DOW_NAMES[Number(sel.value)]}`);
      loadPlanEditor(); loadExercises();
    })
  );
  $("pe-list").querySelectorAll("[data-pe-del]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Delete this exercise from the plan?")) return;
      try {
        await api(`/api/exercises/${b.dataset.peDel}`, { method: "DELETE" });
        toast("Exercise removed");
        loadPlanEditor(); loadExercises();
      } catch (err) { toast(err.message, true); }
    })
  );
}

$("pe-day").value = String(new Date().getDay() === 0 ? 7 : new Date().getDay());
$("pe-day").addEventListener("change", () => loadPlanEditor().catch((e) => toast(e.message, true)));
$("pe-add").addEventListener("click", async () => {
  const name = $("pe-name").value.trim();
  if (!name) return toast("Give the exercise a name", true);
  try {
    await api("/api/exercises", {
      method: "POST",
      body: {
        name,
        day_of_week: Number($("pe-day").value),
        aliases: $("pe-aliases").value.split(",").map((a) => a.trim()).filter(Boolean),
      },
    });
    toast(`"${name}" added`);
    $("pe-name").value = ""; $("pe-aliases").value = "";
    loadPlanEditor(); loadExercises();
  } catch (err) { toast(err.message, true); }
});

loadPlanEditor().catch(() => {});

loadExercises().catch((e) => toast(e.message, true));
loadHistory().catch((e) => toast(e.message, true));
loadProgress().catch(() => {});
loadWeekly().catch(() => {});
