import { api, toast, esc, renderNav } from "./ui.js";

renderNav("chat");
const $ = (id) => document.getElementById(id);
const history = [];

function append(role, html) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.innerHTML = html;
  $("log").appendChild(div);
  $("log").scrollTop = $("log").scrollHeight;
  return div;
}

async function send() {
  const text = $("input").value.trim();
  if (!text) return;
  $("input").value = "";
  $("send").disabled = true;
  append("user", esc(text));
  history.push({ role: "user", content: text });
  const thinking = append("bot", '<span class="spin">⚡</span> thinking…');
  try {
    const res = await api("/api/chat", { method: "POST", body: { messages: history } });
    history.push({ role: "assistant", content: res.reply });
    const tools = (res.tool_calls || []).map((t) => `<span class="pill gray">🔧 ${esc(t.name)}</span>`).join("");
    thinking.innerHTML = esc(res.reply) + (tools ? `<div class="tools">${tools}</div>` : "");
  } catch (err) {
    thinking.innerHTML = `<span class="pill red">${esc(err.message)}</span>`;
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
$("input").focus();
