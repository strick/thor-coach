import { api, toast, esc, renderNav, renderMarkdown } from "./ui.js";

renderNav("chat");
const $ = (id) => document.getElementById(id);

const WELCOME = `Hi, I'm Thor, your health pal. I know your profile, meds, labs and logs, and I can log things for you. Try:
"how's my protein this week?" · "log 3x12 goblet squats at 50" · "what's going on with my LDL?" · "remember that my doctor wants me under 100 LDL"`;

const TOOL_LABELS = {
  remember: "💾 saved to memory",
  forget_memory: "🗑 removed from memory",
  log_workout: "logged workout", log_food: "logged food", log_headache: "logged headache", update_headache: "updated headache",
  log_checkin: "logged check-in", log_weight: "logged weight", log_water: "logged water", sync_strava: "synced Strava",
};

function append(role, html, { markdown = false } = {}) {
  const div = document.createElement("div");
  div.className = `msg ${role}${markdown ? " md" : ""}`;
  div.innerHTML = html;
  $("log").appendChild(div);
  $("log").scrollTop = $("log").scrollHeight;
  return div;
}

function toolPills(calls = []) {
  const names = [...new Set(calls.filter((c) => !c.error).map((c) => c.name))];
  const pills = names.map((n) => `<span class="pill ${n === "remember" ? "green" : "gray"}">${esc(TOOL_LABELS[n] || `🔧 ${n.replaceAll("_", " ")}`)}</span>`);
  return pills.length ? `<div class="tools">${pills.join("")}</div>` : "";
}

const botHtml = (text, calls) => renderMarkdown(text) + toolPills(calls);

async function loadHistory() {
  const { messages } = await api("/api/chat/history?limit=60");
  $("log").innerHTML = "";
  append("bot", esc(WELCOME));
  for (const m of messages) {
    if (m.role === "user") append("user", esc(m.content));
    else append("bot", botHtml(m.content, m.tool_calls), { markdown: true });
  }
}

async function send() {
  const text = $("input").value.trim();
  if (!text) return;
  $("input").value = "";
  $("send").disabled = true;
  append("user", esc(text));
  const thinking = append("bot", '<span class="spin">⚡</span> thinking…');
  try {
    const res = await api("/api/chat", { method: "POST", body: { message: text } });
    thinking.classList.add("md");
    thinking.innerHTML = botHtml(res.reply, res.tool_calls);
    if (res.memory_saved && !$("memory-card").hidden) loadMemories();
  } catch (err) {
    thinking.innerHTML = `<span class="pill red">${esc(err.message)}</span>`;
    $("input").value = text; // nothing was saved — keep it for a retry
    toast(err.message, true);
  } finally {
    $("send").disabled = false;
    $("input").focus();
  }
}

$("send").addEventListener("click", send);
$("input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
});

$("btn-new").addEventListener("click", async () => {
  await api("/api/chat/new", { method: "POST" });
  await loadHistory();
  toast("New conversation — memories carry over");
  $("input").focus();
});

// --- Memory panel ---

async function loadMemories() {
  const list = await api("/api/memories");
  $("memories").innerHTML = list.length
    ? list.map((m) => `
      <div class="item">
        <div class="main"><div class="title" style="font-weight:600">${esc(m.content)}</div>
          <div class="meta">${m.category ? `${esc(m.category)} · ` : ""}saved ${esc(m.created_at.slice(0, 10))}${m.source === "chat" ? " from chat" : ""}</div></div>
        <button class="btn-danger" data-forget="${m.id}" title="Forget">✕</button>
      </div>`).join("")
    : `<div class="empty">Nothing yet.</div>`;
  $("memories").querySelectorAll("[data-forget]").forEach((b) =>
    b.addEventListener("click", async () => {
      await api(`/api/memories/${b.dataset.forget}`, { method: "DELETE" });
      loadMemories();
    })
  );
}

$("btn-memory").addEventListener("click", () => {
  $("memory-card").hidden = !$("memory-card").hidden;
  if (!$("memory-card").hidden) loadMemories().catch((e) => toast(e.message, true));
});
$("btn-memory-add").addEventListener("click", async () => {
  const content = $("memory-new").value.trim();
  if (!content) return;
  try {
    await api("/api/memories", { method: "POST", body: { content } });
    $("memory-new").value = "";
    loadMemories();
  } catch (err) { toast(err.message, true); }
});

loadHistory().catch((e) => {
  append("bot", esc(WELCOME));
  toast(e.message, true);
});
$("input").focus();
