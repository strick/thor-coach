import {
  api, toast, esc, renderNav, renderMarkdown, segnav, THOR_SEGS, closeOnBackdrop, undoable, waiting,
  ongoingHeadache, announceChange,
} from "./ui.js";

renderNav("chat");
const $ = (id) => document.getElementById(id);
$("segs").innerHTML = segnav("Thor", THOR_SEGS, "chat");

const WELCOME = "Hi, I'm Thor. Ask me anything, or tell me what to log.";
const STARTERS = [
  "How did my sleep look this week?",
  "How's my protein this week?",
  "What's going on with my LDL?",
  "Log 3x12 goblet squats at 50",
];

// Receipts for things Thor did: "✓ Logged: … · View", linking to where it landed.
const RECEIPTS = {
  log_workout: (a) => [`Logged${a.text ? `: ${a.text}` : " a workout"}`, "workouts.html"],
  log_food: (a) => [`Logged${a.text ? `: ${a.text}` : " food"}`, "nutrition.html"],
  log_headache: (a) => [`Logged a headache${a.peak_severity != null ? ` · ${a.peak_severity}/10` : ""}`, "health.html#headaches"],
  update_headache: () => ["Updated your headache", "health.html#headaches"],
  log_checkin: () => ["Check-in updated", "health.html#checkin"],
  log_weight: (a) => [`Weight: ${a.weight_lbs} lbs`, "trends.html"],
  log_water: (a) => [a.glasses != null ? `Water set to ${a.glasses} glasses` : `Water +${a.delta ?? 1}`, "index.html"],
  log_health_event: (a) => [`Logged ${a.category || "a health event"}`, "health.html#headaches"],
  sync_strava: () => ["Synced Strava", "running.html"],
  remember: (a) => [`Saved to memory${a.content ? `: ${a.content}` : ""}`, "#memory"],
  forget_memory: () => ["Removed from memory", "#memory"],
};

function receipts(calls = []) {
  const seen = new Set();
  const rows = calls
    .filter((c) => !c.error && RECEIPTS[c.name])
    .map((c) => {
      const [text, href] = RECEIPTS[c.name](c.args || {});
      return { text: text.length > 90 ? `${text.slice(0, 88)}…` : text, href };
    })
    .filter((r) => !seen.has(r.text) && seen.add(r.text));
  return rows.length
    ? `<div class="tools">${rows.map((r) => `<div class="receipt"><span>✓ ${esc(r.text)}</span>
        <a href="${r.href}"${r.href === "#memory" ? " data-open-memory" : ""}>View</a></div>`).join("")}</div>`
    : "";
}

const wordCount = (s) => String(s || "").split(/\s+/).filter(Boolean).length;

function append(role, html, { markdown = false, calls = [], text = "" } = {}) {
  const div = document.createElement("div");
  div.className = `msg ${role}${markdown ? " md" : ""}`;
  div.innerHTML = role === "bot" && markdown ? `<div class="msg-body">${html}</div>${receipts(calls)}` : html;
  // Long replies collapse after ~200 words.
  if (markdown && wordCount(text) > 200) {
    div.classList.add("clamped");
    const more = document.createElement("button");
    more.type = "button";
    more.className = "btn-link";
    more.textContent = "Show more";
    more.setAttribute("aria-expanded", "false");
    more.addEventListener("click", () => {
      const open = div.classList.toggle("clamped");
      more.textContent = open ? "Show more" : "Show less";
      more.setAttribute("aria-expanded", String(!open));
    });
    div.querySelector(".msg-body").after(more);
  }
  div.querySelectorAll("[data-open-memory]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); openMemory(); }));
  $("log").appendChild(div);
  $("log").scrollTop = $("log").scrollHeight;
  return div;
}

const appendBot = (text, calls) => append("bot", renderMarkdown(text), { markdown: true, calls, text });

async function loadHistory() {
  const { messages } = await api("/api/chat/history?limit=60");
  $("log").innerHTML = "";
  append("bot", esc(WELCOME));
  for (const m of messages) {
    if (m.role === "user") append("user", esc(m.content));
    else appendBot(m.content, m.tool_calls);
  }
}

async function send(textArg) {
  const text = (textArg ?? $("input").value).trim();
  if (!text) return;
  $("input").value = "";
  grow();
  $("send").disabled = true;
  append("user", esc(text));
  const thinking = append("bot", waiting("Thor is thinking…"));
  try {
    const res = await api("/api/chat", { method: "POST", body: { message: text } });
    thinking.remove();
    appendBot(res.reply, res.tool_calls);
    if (res.memory_saved) loadMemoryCount();
    if ((res.tool_calls || []).some((c) => /^log_|^update_/.test(c.name))) announceChange("chat");
  } catch (err) {
    thinking.innerHTML = "Thor couldn't answer just now. Your message is still in the box.";
    $("input").value = text; // nothing was saved — keep it for a retry
    grow();
    if (err.details) console.warn("chat error:", err.details);
  } finally {
    $("send").disabled = false;
    if (matchMedia("(pointer: fine)").matches) $("input").focus();
  }
}

// Composer: grows to five lines; Enter sends (Shift+Enter for a new line).
function grow() {
  const t = $("input");
  t.style.height = "auto";
  t.style.height = `${t.scrollHeight + 2}px`;
}
$("input").addEventListener("input", grow);
$("composer").addEventListener("submit", (e) => { e.preventDefault(); send(); });
$("input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
});

$("btn-new").addEventListener("click", async () => {
  try {
    await api("/api/chat/new", { method: "POST" });
    await loadHistory();
    toast("New chat — memories carry over");
  } catch (err) { toast(err, true); }
});

// Tappable starters, aware of what's going on (during a headache: log the usual medicine).
async function loadStarters() {
  const starters = [...STARTERS];
  const ongoing = await ongoingHeadache();
  if (ongoing) {
    const opts = await api("/api/headaches/options").catch(() => null);
    const med = opts?.meds?.[0];
    if (med) starters.unshift(`Log ${med.name.toLowerCase()}${med.dose ? ` ${med.dose}` : ""} for my headache now`);
    starters.unshift("My headache is over");
  }
  $("starters").innerHTML = starters.map((s) => `<button type="button" class="chip">${esc(s)}</button>`).join("");
  $("starters").querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => send(c.textContent)));
}

// --- Memory sheet ---

async function loadMemoryCount() {
  const list = await api("/api/memories");
  $("btn-memory").textContent = list.length ? `Memory · ${list.length}` : "Memory";
  return list;
}

async function loadMemories() {
  const list = await loadMemoryCount();
  $("memories").innerHTML = list.length
    ? list.map((m) => `
      <div class="item" data-memory="${m.id}">
        <div class="main"><div class="title" style="font-weight:600">${esc(m.content)}</div>
          <div class="meta">${m.category ? `${esc(m.category)} · ` : ""}saved ${esc(m.created_at.slice(0, 10))}${m.source === "chat" ? " from chat" : ""}</div></div>
        <button class="btn-danger" data-forget="${m.id}" aria-label="Forget: ${esc(m.content.slice(0, 60))}">Forget</button>
      </div>`).join("")
    : `<div class="empty">Nothing yet.</div>`;
  $("memories").querySelectorAll("[data-forget]").forEach((b) =>
    b.addEventListener("click", () =>
      undoable({
        message: "Forgotten",
        hide: [b.closest("[data-memory]")],
        run: () => api(`/api/memories/${b.dataset.forget}`, { method: "DELETE", keepalive: true }),
        onDone: loadMemoryCount,
      })
    )
  );
}

function openMemory() {
  $("memory-sheet").showModal();
  loadMemories().catch((e) => toast(e, true));
}
$("btn-memory").addEventListener("click", openMemory);
$("memory-sheet").querySelector("[data-close]").addEventListener("click", () => $("memory-sheet").close());
closeOnBackdrop($("memory-sheet"));
$("btn-memory-add").addEventListener("click", async () => {
  const content = $("memory-new").value.trim();
  if (!content) return;
  try {
    await api("/api/memories", { method: "POST", body: { content } });
    $("memory-new").value = "";
    loadMemories();
  } catch (err) { toast(err, true); }
});

loadHistory().catch((e) => {
  append("bot", esc(WELCOME));
  toast(e, true);
});
loadStarters().catch(() => {});
loadMemoryCount().catch(() => {});
if (matchMedia("(pointer: fine)").matches) $("input").focus();
