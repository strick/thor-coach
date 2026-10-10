import { api, toast, esc, renderNav, renderMarkdown, fmtDate } from "./ui.js";

renderNav("guides");
const $ = (id) => document.getElementById(id);

const KIND = { weekly_review: ["Weekly review", "gold"], lab_explainer: ["Labs", "red"], deep_dive: ["Deep dive", ""] };
let filter = "";
let openId = null;

const created = (g) => new Date(g.created_at.replace(" ", "T") + "Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

async function loadList() {
  const q = filter === "pinned" ? "?pinned=1" : filter ? `?kind=${filter}` : "";
  const list = await api(`/api/guides${q}`);
  $("list").innerHTML = list.length
    ? list.map((g) => `
      <div class="item" style="cursor:pointer;${g.id === openId ? "border-color:var(--accent)" : ""}" data-id="${g.id}">
        <div class="main">
          <div class="title">${g.pinned ? "📌 " : ""}${esc(g.title)}</div>
          <div class="meta">${esc(g.excerpt)}</div>
        </div>
        <div style="text-align:right">
          <span class="pill ${KIND[g.kind][1]}">${KIND[g.kind][0]}</span>
          <div class="muted small" style="margin-top:4px">${created(g)}</div>
        </div>
      </div>`).join("")
    : `<div class="empty">${filter ? "Nothing here yet." : "No guides yet. Ask a question above, write last week's review, or confirm a lab report."}</div>`;
  $("list").querySelectorAll("[data-id]").forEach((el) => el.addEventListener("click", () => openGuide(el.dataset.id)));
}

async function openGuide(id) {
  openId = id;
  history.replaceState(null, "", `#${id}`);
  const g = await api(`/api/guides/${id}`);
  const when = g.kind === "weekly_review" ? `${fmtDate(g.period_start)} – ${fmtDate(g.period_end)}` : `Written ${created(g)}`;
  $("detail").innerHTML = `
    <div class="row-between">
      <span class="pill ${KIND[g.kind][1]}">${KIND[g.kind][0]}</span>
      <div class="row fit" style="gap:6px">
        <button class="btn-ghost btn-sm fit" id="g-pin">${g.pinned ? "Unpin" : "📌 Pin"}</button>
        <button class="btn-ghost btn-sm fit" id="g-regen">Refresh with new data</button>
        <button class="btn-danger fit" id="g-del" title="Delete">✕</button>
      </div>
    </div>
    <h2 style="text-transform:none;letter-spacing:0;color:var(--text);font-size:19px;margin:12px 0 2px">${esc(g.title)}</h2>
    <div class="muted small">${esc(when)}${g.topic && g.kind === "deep_dive" ? ` · you asked: “${esc(g.topic)}”` : ""}${g.llm_model ? ` · ${esc(g.llm_model)}` : ""}</div>
    ${g.lab_report_id ? `<a class="btn btn-ghost btn-sm mt" href="labs.html">Open the lab report →</a>` : ""}
    <div class="md mt">${renderMarkdown(g.markdown)}</div>`;
  $("g-pin").addEventListener("click", async () => {
    await api(`/api/guides/${id}`, { method: "PATCH", body: { pinned: !g.pinned } });
    openGuide(id);
    loadList();
  });
  $("g-regen").addEventListener("click", async () => {
    $("g-regen").disabled = true;
    $("g-regen").innerHTML = '<span class="spin">⚡</span> Rewriting…';
    try {
      await api(`/api/guides/${id}/regenerate`, { method: "POST" });
      toast("Updated with your latest data");
      openGuide(id);
      loadList();
    } catch (err) {
      toast(err.message, true);
      $("g-regen").disabled = false;
      $("g-regen").textContent = "Refresh with new data";
    }
  });
  $("g-del").addEventListener("click", async () => {
    if (!confirm("Delete this guide?")) return;
    await api(`/api/guides/${id}`, { method: "DELETE" });
    openId = null;
    history.replaceState(null, "", "#");
    $("detail").innerHTML = `<div class="empty">Deleted.</div>`;
    loadList();
  });
  loadList();
  if (window.innerWidth < 640) $("detail-card").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function ask(topic) {
  if (!topic.trim()) return toast("Type a question first", true);
  $("btn-ask").disabled = true;
  $("ask-status").innerHTML = '<span class="spin">⚡</span> Reading through your data and writing your guide — usually under a minute…';
  try {
    const g = await api("/api/guides/deep-dive", { method: "POST", body: { topic } });
    $("topic").value = "";
    await openGuide(g.id);
  } catch (err) {
    toast(err.message, true);
  } finally {
    $("btn-ask").disabled = false;
    $("ask-status").textContent = "";
  }
}

$("btn-ask").addEventListener("click", () => ask($("topic").value));
$("topic").addEventListener("keydown", (e) => { if (e.key === "Enter") ask($("topic").value); });

$("btn-weekly").addEventListener("click", async () => {
  $("btn-weekly").disabled = true;
  $("btn-weekly").innerHTML = '<span class="spin">⚡</span> Writing…';
  try {
    const g = await api("/api/guides/weekly-review", { method: "POST", body: {} });
    await openGuide(g.id);
  } catch (err) {
    toast(err.message, true);
  } finally {
    $("btn-weekly").disabled = false;
    $("btn-weekly").textContent = "Write last week's review";
  }
});

document.querySelectorAll("#filters button").forEach((b) =>
  b.addEventListener("click", () => {
    document.querySelectorAll("#filters button").forEach((x) => x.classList.toggle("on", x === b));
    filter = b.dataset.kind;
    loadList().catch((e) => toast(e.message, true));
  })
);

async function loadSuggestions() {
  const { topics } = await api("/api/guides/suggestions");
  $("suggestions").innerHTML = topics.map((t) => `<button type="button" class="chip">${esc(t)}</button>`).join("");
  $("suggestions").querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => { $("topic").value = c.textContent; ask(c.textContent); }));
}

async function loadArchive() {
  const rows = await api("/api/guides/archive");
  if (!rows.length) return ($("archive-wrap").hidden = true);
  $("archive").innerHTML = rows.map((s) => `
    <div class="item"><div class="main">
      <div class="title">Week of ${fmtDate(s.week_start_date)}</div>
      <div class="meta">${s.total_sessions} sessions · ${Math.round(s.total_volume).toLocaleString()} lbs</div>
      <div class="small mt">${esc(s.summary_text || "")}</div>
    </div></div>`).join("");
}

loadList().then(() => {
  const id = location.hash.slice(1);
  if (id) openGuide(id).catch(() => {});
}).catch((e) => toast(e.message, true));
loadSuggestions().catch(() => {});
loadArchive().catch(() => {});
