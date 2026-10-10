import { api, toast, esc, renderNav } from "./ui.js";

renderNav("health");
const $ = (id) => document.getElementById(id);
const TEXT_FIELDS = ["birth_date", "sex", "diet_style", "goals", "doctor_notes", "conditions", "allergies", "family_history"];

async function loadProfile() {
  const p = await api("/api/profile");
  $("sex").innerHTML = '<option value="">—</option>' + p.options.sexes.map((s) => `<option value="${s}">${s}</option>`).join("");
  $("diet_style").innerHTML = '<option value="">—</option>' + p.options.diet_styles.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
  for (const f of TEXT_FIELDS) $(f).value = p[f] ?? "";
  if (p.height_in) {
    $("height_ft").value = Math.floor(p.height_in / 12);
    $("height_in").value = Math.round((p.height_in % 12) * 2) / 2;
  }
}

$("btn-save").addEventListener("click", async () => {
  const body = Object.fromEntries(TEXT_FIELDS.map((f) => [f, $(f).value]));
  const ft = Number($("height_ft").value || 0), inches = Number($("height_in").value || 0);
  body.height_in = ft || inches ? ft * 12 + inches : null;
  $("btn-save").disabled = true;
  try {
    await api("/api/profile", { method: "PUT", body });
    toast("Profile saved");
    $("save-status").textContent = `Saved ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  } catch (err) {
    toast(err.message, true);
  } finally {
    $("btn-save").disabled = false;
  }
});

// --- Medications & supplements ---

const MED_INPUTS = ["name", "dose", "frequency", "purpose"];

function medRow(m) {
  const tr = document.createElement("tr");
  tr.dataset.id = m.id;
  if (!m.active) tr.style.opacity = "0.55";
  tr.innerHTML = `
    ${MED_INPUTS.slice(0, 3).map((f) => `<td><input class="m-${f}" value="${esc(m[f] ?? "")}" /></td>`).join("")}
    <td><select class="m-kind"><option value="med"${m.kind === "med" ? " selected" : ""}>med</option><option value="supplement"${m.kind === "supplement" ? " selected" : ""}>supplement</option></select></td>
    <td class="center"><input type="checkbox" class="m-as_needed" style="width:auto"${m.as_needed ? " checked" : ""} /></td>
    <td><input class="m-purpose" value="${esc(m.purpose ?? "")}" /></td>
    <td class="center"><input type="checkbox" class="m-active" style="width:auto"${m.active ? " checked" : ""} title="${m.active ? "Taking it" : `Stopped${m.stopped_on ? " " + m.stopped_on : ""}`}" /></td>
    <td style="white-space:nowrap"><button class="btn-ghost btn-sm m-save">Save</button> <button class="btn-danger m-del" title="Delete">✕</button></td>`;
  const read = () => ({
    ...Object.fromEntries(MED_INPUTS.map((f) => [f, tr.querySelector(`.m-${f}`).value])),
    kind: tr.querySelector(".m-kind").value,
    as_needed: tr.querySelector(".m-as_needed").checked,
    active: tr.querySelector(".m-active").checked,
  });
  tr.querySelector(".m-save").addEventListener("click", async () => {
    try {
      await api(`/api/medications/${m.id}`, { method: "PATCH", body: read() });
      toast(`${read().name} saved`);
      loadMeds();
    } catch (err) { toast(err.message, true); }
  });
  tr.querySelector(".m-active").addEventListener("change", () => tr.querySelector(".m-save").click());
  tr.querySelector(".m-del").addEventListener("click", async () => {
    if (!confirm(`Delete ${m.name}? (To keep the history, uncheck Active instead.)`)) return;
    try {
      await api(`/api/medications/${m.id}`, { method: "DELETE" });
      loadMeds();
    } catch (err) { toast(err.message, true); }
  });
  return tr;
}

async function loadMeds() {
  const meds = await api("/api/medications");
  const shown = $("show-stopped").checked ? meds : meds.filter((m) => m.active);
  const body = $("med-rows");
  body.innerHTML = "";
  if (!shown.length) {
    body.innerHTML = `<tr><td colspan="8" class="muted small">Nothing listed yet. Add what you take below, including supplements.</td></tr>`;
  }
  for (const m of shown) body.appendChild(medRow(m));
}

$("show-stopped").addEventListener("change", () => loadMeds().catch((e) => toast(e.message, true)));

$("btn-add-med").addEventListener("click", async () => {
  const row = $("med-new");
  const body = {
    ...Object.fromEntries(MED_INPUTS.map((f) => [f, row.querySelector(`.m-${f}`).value])),
    kind: row.querySelector(".m-kind").value,
    as_needed: row.querySelector(".m-as_needed").checked,
  };
  if (!body.name.trim()) return toast("Enter a name first", true);
  try {
    await api("/api/medications", { method: "POST", body });
    row.querySelectorAll("input").forEach((i) => (i.type === "checkbox" ? (i.checked = false) : (i.value = "")));
    toast(`${body.name} added`);
    loadMeds();
  } catch (err) { toast(err.message, true); }
});

// --- Long-term memory ---

async function loadMemories() {
  const list = await api("/api/memories");
  $("memories").innerHTML = list.length
    ? list.map((m) => `
      <div class="item">
        <div class="main"><div class="title" style="font-weight:600">${esc(m.content)}</div>
          <div class="meta">${m.category ? `${esc(m.category)} · ` : ""}saved ${esc(m.created_at.slice(0, 10))}${m.source === "chat" ? " from chat" : ""}</div></div>
        <button class="btn-danger" data-forget="${m.id}" title="Forget">✕</button>
      </div>`).join("")
    : `<div class="empty">Nothing saved yet.</div>`;
  $("memories").querySelectorAll("[data-forget]").forEach((b) =>
    b.addEventListener("click", async () => {
      await api(`/api/memories/${b.dataset.forget}`, { method: "DELETE" });
      loadMemories();
    })
  );
}

$("btn-memory-add").addEventListener("click", async () => {
  const content = $("memory-new").value.trim();
  if (!content) return;
  try {
    await api("/api/memories", { method: "POST", body: { content } });
    $("memory-new").value = "";
    loadMemories();
  } catch (err) { toast(err.message, true); }
});

loadProfile().catch((e) => toast(e.message, true));
loadMeds().catch((e) => toast(e.message, true));
loadMemories().catch(() => {});
