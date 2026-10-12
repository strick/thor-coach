import {
  api, toast, esc, renderNav, fmtDate, segnav, THOR_SEGS, renderReader, wireReader, readingTime,
  menuButton, wireMenu, undoable, waiting,
} from "./ui.js";

renderNav("guides");
const $ = (id) => document.getElementById(id);
$("segs").innerHTML = segnav("Thor", THOR_SEGS, "library");

const KIND = { weekly_review: "Weekly review", lab_explainer: "Lab explainer", deep_dive: "Deep dive" };
let filter = "";
let openId = null;
const narrow = () => matchMedia("(max-width: 899px)").matches;

const created = (g) => new Date(g.created_at.replace(" ", "T") + "Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

async function loadList() {
  const q = filter === "pinned" ? "?pinned=1" : filter ? `?kind=${filter}` : "";
  const list = await api(`/api/guides${q}`);
  $("list").innerHTML = list.length
    ? list.map((g) => `
      <button type="button" class="item" data-id="${g.id}"${g.id === openId ? ' aria-current="true" style="border-color:var(--accent)"' : ""}>
        <span class="main">
          <span class="title" style="display:block">${g.pinned ? '<span class="sr-only">Pinned: </span><span aria-hidden="true">📌</span> ' : ""}${esc(g.title)}</span>
          <span class="meta" style="display:block">${esc(KIND[g.kind])} · ${created(g)}</span>
          <span class="meta" style="display:block">${esc(g.excerpt)}</span>
        </span><span class="chev" aria-hidden="true">›</span>
      </button>`).join("")
    : `<div class="empty">${filter ? "Nothing here yet." : "No guides yet. Ask a question above, write last week's review, or confirm a lab report."}</div>`;
  $("list").querySelectorAll("[data-id]").forEach((el) => el.addEventListener("click", () => openGuide(el.dataset.id).catch((e) => toast(e, true))));
}

// Phones: the reader takes the whole screen, with "‹ Library" and the Back gesture.
function showReader() {
  document.body.classList.add("reading");
  if (narrow()) scrollTo(0, 0);
}
function hideReader() {
  document.body.classList.remove("reading");
  openId = null;
  loadList().catch(() => {});
}
addEventListener("popstate", () => {
  const id = history.state?.guide;
  if (id) openGuide(id, { push: false }).catch(() => {});
  else hideReader();
});

async function openGuide(id, { push = true } = {}) {
  openId = id;
  if (push) {
    if (narrow() && history.state?.guide !== id) history.pushState({ guide: id }, "", `#${id}`);
    else history.replaceState({ guide: id }, "", `#${id}`);
  }
  const g = await api(`/api/guides/${id}`);
  const when = g.kind === "weekly_review" ? `${fmtDate(g.period_start)} – ${fmtDate(g.period_end)}` : `Written ${created(g)}`;
  $("detail").innerHTML = `
    <button type="button" class="back-link" data-back>‹ Library</button>
    <div class="reader-head">
      <span class="pill gray">${KIND[g.kind]}</span>
      ${menuButton("Guide options", [
        { act: "pin", label: g.pinned ? "Unpin" : "Pin to the top" },
        { act: "regen", label: "Update with my latest data" },
        { act: "delete", label: "Delete this guide", danger: true },
      ])}
    </div>
    <h2 style="font-size:1.25rem;margin:12px 0 2px">${esc(g.title)}</h2>
    <p class="read-meta">${esc(when)} · ${readingTime(g.markdown)}${g.topic && g.kind === "deep_dive" ? ` · you asked: “${esc(g.topic)}”` : ""}</p>
    ${g.lab_report_id ? `<p><a href="labs.html#report-${esc(g.lab_report_id)}">Open the lab report ›</a></p>` : ""}
    <div id="reader-body">${renderReader(g.markdown, { idPrefix: "g" })}</div>
    <p class="muted small mt">${g.llm_model ? `Written by ${esc(g.llm_model)}.` : ""}</p>`;
  wireReader($("detail"));
  $("detail").querySelector("[data-back]").addEventListener("click", () => {
    if (history.state?.guide && narrow()) history.back();
    else { history.replaceState(null, "", "#"); hideReader(); }
  });
  wireMenu($("detail"), {
    pin: async () => {
      await api(`/api/guides/${id}`, { method: "PATCH", body: { pinned: !g.pinned } });
      toast(g.pinned ? "Unpinned" : "Pinned");
      openGuide(id, { push: false });
      loadList();
    },
    regen: async () => {
      $("reader-body").innerHTML = `<p>${waiting("Thor is rewriting this with your latest data. This usually takes under a minute.")}</p>`;
      try {
        await api(`/api/guides/${id}/regenerate`, { method: "POST" });
        toast("Updated with your latest data");
        openGuide(id, { push: false });
        loadList();
      } catch (err) {
        toast(err, true);
        openGuide(id, { push: false });
      }
    },
    delete: () => {
      const row = $("list").querySelector(`[data-id="${CSS.escape(id)}"]`);
      $("detail").innerHTML = `<div class="empty">Deleted.</div>`;
      if (history.state?.guide && narrow()) history.back();
      else { history.replaceState(null, "", "#"); hideReader(); }
      undoable({
        message: "Guide deleted",
        hide: row ? [row] : [],
        run: () => api(`/api/guides/${id}`, { method: "DELETE", keepalive: true }),
        onDone: () => loadList(),
        onUndo: () => openGuide(id),
      });
    },
  });
  showReader();
  loadList();
}

async function ask(topic) {
  if (!topic.trim()) return toast("Type a question first", true);
  $("btn-ask").disabled = true;
  $("ask-status").innerHTML = waiting("Thor is reading through your data and writing your guide. This usually takes under a minute.");
  try {
    const g = await api("/api/guides/deep-dive", { method: "POST", body: { topic } });
    $("topic").value = "";
    await openGuide(g.id);
  } catch (err) {
    toast(err, true);
  } finally {
    $("btn-ask").disabled = false;
    $("ask-status").textContent = "";
  }
}

$("btn-ask").addEventListener("click", () => ask($("topic").value));
$("topic").addEventListener("keydown", (e) => { if (e.key === "Enter") ask($("topic").value); });

$("btn-weekly").addEventListener("click", async () => {
  $("btn-weekly").disabled = true;
  $("ask-status").innerHTML = waiting("Thor is reading your week. This usually takes under a minute.");
  try {
    const g = await api("/api/guides/weekly-review", { method: "POST", body: {} });
    await openGuide(g.id);
  } catch (err) {
    toast(err, true);
  } finally {
    $("btn-weekly").disabled = false;
    $("ask-status").textContent = "";
  }
});

document.querySelectorAll("#filters button").forEach((b) =>
  b.addEventListener("click", () => {
    document.querySelectorAll("#filters button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    filter = b.dataset.kind;
    loadList().catch((e) => toast(e, true));
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
  if (id) {
    // Arriving with a guide in the URL: make Back return to the list.
    history.replaceState(null, "", "guides.html");
    openGuide(id).catch(() => {});
  }
}).catch((e) => toast(e, true));
loadSuggestions().catch(() => {});
loadArchive().catch(() => {});
