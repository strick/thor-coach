import { api, toast, esc, todayISO, addDays, fmtDate, renderNav } from "./ui.js";

renderNav("health");
const $ = (id) => document.getElementById(id);
$("e-date").value = todayISO();

const CAT_ICONS = { migraine: "🤕", sleep: "😴", yardwork: "🌿", run: "🏃", other: "📌" };

async function load() {
  const events = await api(`/api/health-events?start=${addDays(todayISO(), -90)}&end=${todayISO()}`);

  const byCat = {};
  for (const e of events) byCat[e.category] = (byCat[e.category] || 0) + 1;
  $("cat-stats").innerHTML = Object.keys(CAT_ICONS)
    .map((c) => `<div class="bar-head"><span>${CAT_ICONS[c]} ${c}</span><span class="val">${byCat[c] || 0}</span></div>`)
    .join("");

  $("events").innerHTML = events.length
    ? events.map((e) => `
      <div class="item">
        <div class="main">
          <div class="title">${CAT_ICONS[e.category] || ""} ${esc(e.category)} — ${fmtDate(e.date)}
            ${e.intensity ? `<span class="pill ${e.intensity >= 7 ? "red" : e.intensity >= 4 ? "gold" : "green"}">intensity ${e.intensity}</span>` : ""}
            ${e.duration_minutes ? `<span class="pill gray">${e.duration_minutes} min</span>` : ""}</div>
          <div class="meta">${esc(e.notes || "")}</div>
        </div>
        <button class="btn-danger" data-del="${e.id}">✕</button>
      </div>`).join("")
    : `<div class="empty">No health events in the last 90 days.</div>`;

  $("events").querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", async () => {
      await api(`/api/health-events/${b.dataset.del}`, { method: "DELETE" });
      toast("Event deleted");
      load();
    })
  );
}

$("btn-event").addEventListener("click", async () => {
  try {
    await api("/api/health-events", {
      method: "POST",
      body: {
        date: $("e-date").value,
        category: $("e-cat").value,
        intensity: $("e-int").value ? Number($("e-int").value) : null,
        duration_minutes: $("e-dur").value ? Number($("e-dur").value) : null,
        notes: $("e-notes").value || null,
      },
    });
    toast("Event logged");
    $("e-notes").value = ""; $("e-int").value = ""; $("e-dur").value = "";
    load();
  } catch (err) { toast(err.message, true); }
});

load().catch((e) => toast(e.message, true));
