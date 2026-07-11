import { api, toast, esc, renderNav, downloadFile, todayISO } from "./ui.js";

renderNav("settings");
const $ = (id) => document.getElementById(id);

let ollamaModels = [];

async function loadConnections() {
  const cfg = await api("/api/config");
  $("version").textContent = `Thor v2 — ${cfg.today}`;
  $("connections").innerHTML = `
    <div class="item"><div class="main"><div class="title">OpenAI</div><div class="meta">chat, parsing, summaries</div></div>
      ${cfg.openai_configured ? '<span class="pill green">configured</span>' : '<span class="pill red">missing OPENAI_API_KEY</span>'}</div>
    <div class="item"><div class="main"><div class="title">Strava</div><div class="meta">run sync${cfg.strava.configured ? ` · token: ${cfg.strava.token_source}` : ""}</div></div>
      ${cfg.strava.configured ? '<span class="pill green">configured</span>' : `<span class="pill red">missing ${esc(cfg.strava.missing.join(", "))}</span>`}</div>
    <div class="item"><div class="main"><div class="title">Ollama</div><div class="meta" id="ollama-meta">checking…</div></div>
      <span class="pill gray" id="ollama-pill">local</span></div>
    <div class="item"><div class="main"><div class="title">Backups</div><div class="meta" id="backup-meta">checking…</div></div>
      <span class="pill gray" id="backup-pill">…</span></div>`;
  api("/api/backups").then((b) => {
    const latest = b.local[0];
    document.getElementById("backup-meta").textContent = latest
      ? `latest: ${latest.file} (${Math.round(latest.bytes / 1024)} KB) · ${b.local.length} local · ${b.mirror.length} on G: mirror`
      : "no backups yet";
    const ok = latest && (b.mirror_available ? b.mirror.length > 0 : true);
    const pill = document.getElementById("backup-pill");
    pill.className = "pill " + (ok ? "green" : latest ? "gold" : "red");
    pill.textContent = ok ? (b.mirror_available ? "local + mirror" : "local only") : latest ? "mirror missing" : "none";
  }).catch(() => {});
  const models = await api("/api/ollama/models");
  ollamaModels = models.models;
  document.getElementById("ollama-meta").textContent = ollamaModels.length
    ? `${ollamaModels.length} models available`
    : "not reachable";
  document.getElementById("ollama-pill").className = "pill " + (ollamaModels.length ? "green" : "gray");
  document.getElementById("ollama-pill").textContent = ollamaModels.length ? "online" : "offline";
}

async function loadLLM() {
  const cfg = await api("/api/config/llm");
  $("llm-rows").innerHTML = Object.entries(cfg).map(([usage, c]) => `
    <tr data-usage="${usage}">
      <td>${esc(usage.replaceAll("_", " "))}</td>
      <td><select class="prov"><option value="openai"${c.provider === "openai" ? " selected" : ""}>openai</option><option value="ollama"${c.provider === "ollama" ? " selected" : ""}>ollama</option></select></td>
      <td><input class="model" value="${esc(c.model)}" list="ollama-list" /></td>
      <td><button class="btn-sm save">Save</button></td>
    </tr>`).join("");
  if (!document.getElementById("ollama-list")) {
    const dl = document.createElement("datalist");
    dl.id = "ollama-list";
    document.body.appendChild(dl);
  }
  document.getElementById("ollama-list").innerHTML = ollamaModels.map((m) => `<option value="${esc(m)}">`).join("");

  $("llm-rows").querySelectorAll("tr").forEach((row) => {
    row.querySelector(".save").addEventListener("click", async () => {
      try {
        await api("/api/config/llm", {
          method: "POST",
          body: { usage: row.dataset.usage, provider: row.querySelector(".prov").value, model: row.querySelector(".model").value },
        });
        toast(`${row.dataset.usage} updated`);
      } catch (err) { toast(err.message, true); }
    });
  });
}

async function loadUsers() {
  const users = await api("/api/users");
  $("users").innerHTML = users.map((u) => `
    <div class="item"><div class="main"><div class="title">${esc(u.name)}</div><div class="meta">${esc(u.id)}</div></div>
      <button class="btn-ghost btn-sm" data-rename="${u.id}">Rename</button></div>`).join("");
  $("users").querySelectorAll("[data-rename]").forEach((b) =>
    b.addEventListener("click", async () => {
      const name = prompt("New name:");
      if (!name) return;
      await api(`/api/users/${b.dataset.rename}`, { method: "PATCH", body: { name } });
      toast("Renamed"); loadUsers();
    })
  );
}

$("btn-user").addEventListener("click", async () => {
  const name = $("new-user").value.trim();
  if (!name) return;
  await api("/api/users", { method: "POST", body: { name } });
  $("new-user").value = "";
  toast("User added"); loadUsers();
});

async function loadGoals() {
  const g = await api("/api/goals");
  $("goal-workouts").value = g.weekly_workouts ?? "";
  $("goal-miles").value = g.weekly_miles ?? "";
  $("goal-volume").value = g.weekly_volume_lbs ?? "";
  $("goal-water").value = g.water_glasses ?? 8;
}

$("btn-goals").addEventListener("click", async () => {
  const num = (id) => ($(id).value === "" ? null : Number($(id).value));
  try {
    await api("/api/goals", {
      method: "POST",
      body: { weekly_workouts: num("goal-workouts"), weekly_miles: num("goal-miles"), weekly_volume_lbs: num("goal-volume"), water_glasses: num("goal-water") },
    });
    toast("Goals saved — dashboard will show progress");
  } catch (err) { toast(err.message, true); }
});

document.querySelectorAll("[data-export]").forEach((b) =>
  b.addEventListener("click", () =>
    downloadFile(`/api/export/csv/${b.dataset.export}`, `thor-${b.dataset.export}-${todayISO()}.csv`).catch((e) => toast(e.message, true))
  )
);
$("btn-export-json").addEventListener("click", async () => {
  try {
    const data = await api("/api/export");
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `thor-export-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) { toast(err.message, true); }
});

loadGoals().catch(() => {});

$("btn-reset").addEventListener("click", async () => {
  await api("/api/config/llm", { method: "POST", body: { reset: true } });
  toast("LLM config reset"); loadLLM();
});

loadConnections().then(loadLLM).catch((e) => toast(e.message, true));
loadUsers().catch(() => {});
