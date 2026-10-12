import {
  api, toast, esc, todayISO, addDays, fmtDate, DOW_NAMES, renderNav, renderReader, wireReader, readingTime,
  segnav, TRAINING_SEGS, undoable, waiting, plural,
} from "./ui.js";

renderNav("workouts");
const $ = (id) => document.getElementById(id);
$("segs").innerHTML = segnav("Training", TRAINING_SEGS, "lifting");
const today = todayISO();

$("ai-date").value = today;
$("m-date").value = today;
// Phones get a month of history; computers get three.
$("h-start").value = addDays(today, matchMedia("(max-width: 640px)").matches ? -30 : -90);
$("h-end").value = today;

const parseReps = (raw) => {
  const parts = String(raw).split(/[,/\s]+/).map((n) => Number(n.trim())).filter((n) => Number.isFinite(n) && n > 0);
  return parts.length > 1 ? parts : parts.length ? parts[0] : null;
};
const fmtReps = (reps) => (Array.isArray(reps) ? reps.join(", ") : reps ?? "—");

async function loadExercises() {
  const list = await api("/api/exercises");
  $("m-exercise").innerHTML = list
    .map((e) => `<option value="${e.id}">${esc(e.name)} (${DOW_NAMES[e.day_of_week].slice(0, 3)})</option>`)
    .join("");
}

async function loadWeekHead() {
  const d = new Date();
  const ws = addDays(today, -((d.getDay() || 7) - 1));
  const sessions = await api(`/api/workouts?start=${ws}&end=${today}`);
  const volume = Math.round(sessions.reduce((a, s) => a + s.total_volume, 0));
  $("range-label").textContent = `This week: ${plural(sessions.length, "workout")} · ${volume.toLocaleString()} lbs`;
}

async function loadHistory() {
  const sessions = await api(`/api/workouts?start=${$("h-start").value}&end=${$("h-end").value}`);
  if (!sessions.length) {
    $("history").innerHTML = `<div class="empty">No sessions in this range.</div>`;
    return;
  }
  $("history").innerHTML = sessions.map((s) => `
    <div class="item" style="display:block" data-session="${s.id}">
      <div class="title">${fmtDate(s.session_date)} <span class="pill gray">${Math.round(s.total_volume).toLocaleString()} lbs</span></div>
      <div class="table-scroll"><table class="mt meal-table">
        <thead><tr><th>Exercise</th><th>Sets</th><th>Reps</th><th>Weight</th><th>Notes</th><th><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>${s.logs.map((l) => `
          <tr data-log="${l.id}">
            <td>${esc(l.exercise)}</td>
            <td class="num-cell">${l.sets ?? "—"} sets</td>
            <td class="num-cell">${fmtReps(l.reps)} reps</td>
            <td class="num-cell">${l.weight_lbs != null ? l.weight_lbs + " lbs" : "bodyweight"}</td>
            <td class="num-cell muted small">${esc(l.notes || "")}</td>
            <td class="row-actions" style="white-space:nowrap">
              <button class="btn-ghost btn-sm" data-edit="${l.id}" aria-label="Edit ${esc(l.exercise)}">Edit</button>
              <button class="btn-danger" data-del-log="${l.id}" aria-label="Remove ${esc(l.exercise)}">Remove</button>
            </td>
          </tr>`).join("")}
        </tbody>
      </table></div>
      <button class="btn-link" data-del-session="${s.id}">Delete this workout</button>
    </div>`).join("");

  const logById = new Map(sessions.flatMap((s) => s.logs).map((l) => [l.id, l]));
  $("history").querySelectorAll("[data-del-session]").forEach((b) =>
    b.addEventListener("click", () =>
      undoable({
        message: "Workout deleted",
        hide: [b.closest("[data-session]")],
        run: () => api(`/api/workouts/${b.dataset.delSession}`, { method: "DELETE", keepalive: true }),
        onDone: () => { loadProgress(); loadWeekHead(); },
      })
    )
  );
  $("history").querySelectorAll("[data-del-log]").forEach((b) =>
    b.addEventListener("click", () =>
      undoable({
        message: "Set removed",
        hide: [b.closest("tr")],
        run: () => api(`/api/exercise-logs/${b.dataset.delLog}`, { method: "DELETE", keepalive: true }),
        onDone: () => { loadProgress(); loadWeekHead(); },
      })
    )
  );
  // Edit in place — one small form, not four prompts in a row.
  $("history").querySelectorAll("[data-edit]").forEach((b) =>
    b.addEventListener("click", () => {
      const l = logById.get(b.dataset.edit);
      const row = b.closest("tr");
      const id = `ed-${l.id}`;
      row.innerHTML = `
        <td>${esc(l.exercise)}</td>
        <td class="num-cell"><label class="sr-only" for="${id}-s">Sets</label><input id="${id}-s" type="number" inputmode="numeric" value="${l.sets ?? ""}" style="width:72px" /></td>
        <td class="num-cell"><label class="sr-only" for="${id}-r">Reps</label><input id="${id}-r" value="${esc(Array.isArray(l.reps) ? l.reps.join(",") : l.reps ?? "")}" style="width:96px" /></td>
        <td class="num-cell"><label class="sr-only" for="${id}-w">Weight in pounds</label><input id="${id}-w" type="number" inputmode="decimal" step="2.5" value="${l.weight_lbs ?? ""}" style="width:84px" /></td>
        <td class="num-cell"><label class="sr-only" for="${id}-n">Notes</label><input id="${id}-n" value="${esc(l.notes || "")}" placeholder="Notes" /></td>
        <td class="row-actions" style="white-space:nowrap"><button class="btn-sm" data-save>Save</button> <button class="btn-ghost btn-sm" data-cancel>Cancel</button></td>`;
      row.querySelector(`#${id}-s`).focus();
      row.querySelector("[data-cancel]").addEventListener("click", () => loadHistory());
      row.querySelector("[data-save]").addEventListener("click", async () => {
        const v = (k) => row.querySelector(`#${id}-${k}`).value.trim();
        try {
          await api(`/api/exercise-logs/${l.id}`, {
            method: "PATCH",
            body: {
              sets: v("s") === "" ? null : Number(v("s")),
              reps: parseReps(v("r")),
              weight_lbs: v("w") === "" ? null : Number(v("w")),
              notes: v("n") || null,
            },
          });
          toast("Updated");
          loadHistory(); loadProgress(); loadWeekHead();
        } catch (err) { toast(err, true); }
      });
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
      const trend = delta == null ? "" : delta > 0 ? `<span class="pill green">↑ ${delta} lbs</span>` : delta < 0 ? `<span class="pill gray">↓ ${Math.abs(delta)} lbs</span>` : `<span class="pill gray">steady</span>`;
      return `<tr><td>${esc(name)}</td><td>${x.count}×</td><td>${x.last_weight != null ? x.last_weight + " lbs" : "bodyweight"}</td><td>${trend}</td></tr>`;
    }).join("");
  $("progress").innerHTML = `
    <div class="row mb">
      <div><div class="stat">${p.total_sessions}</div><div class="stat-label">sessions</div></div>
      <div><div class="stat">${p.total_volume.toLocaleString()}</div><div class="stat-label">total lbs</div></div>
    </div>
    <div class="table-scroll"><table><thead><tr><th>Exercise</th><th>Times</th><th>Current</th><th>Trend</th></tr></thead><tbody>${rows || ""}</tbody></table></div>`;
}

async function loadWeekly() {
  const [latest] = await api("/api/guides?kind=weekly_review&limit=1");
  if (!latest) {
    $("weekly").innerHTML = `<div class="empty">No weekly reviews yet.</div>`;
    return;
  }
  const g = await api(`/api/guides/${latest.id}`);
  $("weekly").innerHTML = `<h3 style="margin:0">${esc(g.title)}</h3><p class="read-meta">${readingTime(g.markdown)}</p>` +
    renderReader(g.markdown, { idPrefix: "wk", jump: false }) +
    `<a class="btn btn-ghost btn-sm mt" href="guides.html#${g.id}">Open in the Library ›</a>`;
  wireReader($("weekly"));
}

$("btn-ai").addEventListener("click", async () => {
  const text = $("ai-text").value.trim();
  if (!text) return toast("Describe your workout first", true);
  $("btn-ai").disabled = true;
  $("ai-status").innerHTML = waiting("Reading your note…");
  try {
    const res = await api("/api/ingest", { method: "POST", body: { text, date: $("ai-date").value } });
    $("ai-results").innerHTML = res.results.map((r) =>
      r.status === "logged"
        ? `<div class="item"><div class="main"><div class="title">✓ ${esc(r.exercise)}</div><div class="meta">${r.sets ?? "?"} sets · ${fmtReps(r.reps)} reps${r.weight_lbs ? ` · ${r.weight_lbs} lbs` : ""}</div></div><span class="pill green">Logged</span></div>`
        : `<div class="item"><div class="main"><div class="title">${esc(r.exercise || r.input || "")}</div></div><span class="pill amber">${esc(r.status.replaceAll("_", " "))}</span></div>`
    ).join("");
    $("ai-text").value = "";
    toast("Logged");
    loadHistory(); loadProgress(); loadWeekHead();
  } catch (err) { toast(err, true); }
  finally { $("btn-ai").disabled = false; $("ai-status").textContent = ""; }
});

$("btn-manual").addEventListener("click", async () => {
  try {
    await api("/api/log-manual", {
      method: "POST",
      body: {
        exercise_id: $("m-exercise").value,
        date: $("m-date").value,
        sets: $("m-sets").value ? Number($("m-sets").value) : null,
        reps: parseReps($("m-reps").value.trim()),
        weight_lbs: $("m-weight").value ? Number($("m-weight").value) : null,
        notes: $("m-notes").value || null,
      },
    });
    toast("Logged");
    loadHistory(); loadProgress(); loadWeekHead();
  } catch (err) { toast(err, true); }
});

$("btn-history").addEventListener("click", () => loadHistory().catch((e) => toast(e, true)));
$("btn-weekly").addEventListener("click", async () => {
  $("btn-weekly").disabled = true;
  $("weekly").innerHTML = `<p>${waiting("Thor is reading your week. This usually takes under a minute.")}</p>`;
  try {
    await api("/api/guides/weekly-review", { method: "POST", body: {} });
    toast("Weekly review ready");
  } catch (err) { toast(err, true); }
  finally {
    $("btn-weekly").disabled = false;
    loadWeekly().catch(() => {});
  }
});

// --- Plan editor ---

async function loadPlanEditor() {
  const day = Number($("pe-day").value);
  const all = await api("/api/exercises");
  const dayEx = all.filter((e) => e.day_of_week === day);
  const aliasesOf = (e) => { try { return JSON.parse(e.aliases || "[]"); } catch { return []; } };
  $("pe-list").innerHTML = dayEx.length
    ? dayEx.map((e) => `
      <div class="item" data-pe="${e.id}">
        <div class="main"><div class="title">${esc(e.name)}</div>
          <div class="meta">${esc(aliasesOf(e).join(", ")) || "no other names"}</div></div>
        <div class="btn-row fit" style="flex:0 0 auto;align-items:center">
          <button class="btn-ghost btn-sm" data-pe-rename="${e.id}" aria-label="Rename ${esc(e.name)}">Rename</button>
          <label class="sr-only" for="pe-move-${e.id}">Move ${esc(e.name)} to</label>
          <select id="pe-move-${e.id}" data-pe-move="${e.id}" style="width:auto">
            ${[1, 2, 3, 4, 5, 6, 7].map((d) => `<option value="${d}"${d === day ? " selected" : ""}>${DOW_NAMES[d].slice(0, 3)}</option>`).join("")}
          </select>
        </div>
      </div>`).join("")
    : `<div class="empty">Nothing planned for ${DOW_NAMES[day]}.</div>`;

  $("pe-list").querySelectorAll("[data-pe-rename]").forEach((b) =>
    b.addEventListener("click", () => {
      const ex = dayEx.find((e) => e.id === b.dataset.peRename);
      const item = b.closest("[data-pe]");
      item.style.display = "block";
      item.innerHTML = `
        <div class="row">
          <div><label for="pr-n-${ex.id}">Name</label><input id="pr-n-${ex.id}" value="${esc(ex.name)}" /></div>
          <div><label for="pr-a-${ex.id}">Other names (comma separated)</label><input id="pr-a-${ex.id}" value="${esc(aliasesOf(ex).join(", "))}" /></div>
        </div>
        <div class="btn-row mt"><button class="btn-sm fit" data-save>Save</button><button class="btn-ghost btn-sm fit" data-cancel>Cancel</button></div>
        <button class="btn-link" data-remove>Remove from the plan</button>`;
      item.querySelector("input").focus();
      item.querySelector("[data-cancel]").addEventListener("click", () => loadPlanEditor());
      item.querySelector("[data-save]").addEventListener("click", async () => {
        const name = item.querySelector(`#pr-n-${ex.id}`).value.trim();
        if (!name) return toast("Give the exercise a name", true);
        try {
          await api(`/api/exercises/${ex.id}`, {
            method: "PATCH",
            body: { name, aliases: item.querySelector(`#pr-a-${ex.id}`).value.split(",").map((a) => a.trim()).filter(Boolean) },
          });
          toast("Exercise updated");
          loadPlanEditor(); loadExercises();
        } catch (err) { toast(err, true); }
      });
      item.querySelector("[data-remove]").addEventListener("click", () =>
        undoable({
          message: `${ex.name} removed from the plan`,
          hide: [item],
          run: () => api(`/api/exercises/${ex.id}`, { method: "DELETE", keepalive: true }),
          onDone: () => { loadPlanEditor(); loadExercises(); },
        })
      );
    })
  );
  $("pe-list").querySelectorAll("[data-pe-move]").forEach((sel) =>
    sel.addEventListener("change", async () => {
      try {
        await api(`/api/exercises/${sel.dataset.peMove}`, { method: "PATCH", body: { day_of_week: Number(sel.value) } });
        toast(`Moved to ${DOW_NAMES[Number(sel.value)]}`);
        loadPlanEditor(); loadExercises();
      } catch (err) { toast(err, true); }
    })
  );
}

$("pe-day").value = String(new Date().getDay() === 0 ? 7 : new Date().getDay());
$("pe-day").addEventListener("change", () => loadPlanEditor().catch((e) => toast(e, true)));
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
  } catch (err) { toast(err, true); }
});

loadPlanEditor().catch(() => {});
loadExercises().catch((e) => toast(e, true));
loadHistory().catch((e) => toast(e, true));
loadProgress().catch(() => {});
loadWeekly().catch(() => {});
loadWeekHead().catch(() => {});
