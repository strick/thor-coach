import {
  api, toast, esc, renderNav, fmtDate, todayISO, rangeBar, chartLine, segnav, HEALTH_SEGS, waiting,
  renderReader, wireReader, readingTime, menuButton, wireMenu, undoable, fetchBlob, hasPin, shrinkImage, plural,
  closeOnBackdrop,
} from "./ui.js";

renderNav("labs");
const $ = (id) => document.getElementById(id);
$("segs").innerHTML = segnav("Health", HEALTH_SEGS, "labs");

let markers = [];
let current = null; // report open in review
let shown = null; // confirmed report whose explainer is showing
const phone = () => matchMedia("(max-width: 640px)").matches;

const fmtNum = (v) => {
  if (v == null) return "";
  const a = Math.abs(v);
  const d = a >= 100 ? 0 : a >= 10 ? 1 : 2;
  return String(Math.round(v * 10 ** d) / 10 ** d);
};
const shortMonth = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", year: iso.slice(0, 4) === todayISO().slice(0, 4) ? undefined : "numeric" });

// Status in words and shapes; colour is a bonus.
const FLAG = {
  high: ["▲ High", "out"], low: ["▼ Low", "out"], abnormal: ["◆ Abnormal", "out"],
  critical_high: ["‼ Critical high", "crit"], critical_low: ["‼ Critical low", "crit"], normal: ["Normal", "ok"],
};
const status = (flag) => {
  if (!flag) return "";
  const [word, cls] = FLAG[flag] || [esc(flag), "out"];
  return `<span class="status ${cls}">${word}</span>`;
};
const inRange = (flag) => !flag || flag === "normal";

// --- Focus views (review, explainer): full screen on phones, with Back ----------------

function focusView(el, hash) {
  ["review", "explainer-card"].forEach((id) => $(id).classList.toggle("reader-host", $(id) === el));
  el.hidden = false;
  document.body.classList.add("reading");
  if (location.hash !== hash) history.pushState({ focus: el.id }, "", hash);
  if (matchMedia("(max-width: 899px)").matches) scrollTo(0, 0);
  else el.scrollIntoView({ block: "start" });
}
function clearFocus() {
  document.body.classList.remove("reading");
  $("review").hidden = true;
  current = null;
}
function closeFocus() {
  if (history.state?.focus) history.back();
  else {
    history.replaceState(null, "", "labs.html");
    clearFocus();
  }
}
addEventListener("popstate", () => {
  if (!history.state?.focus) {
    clearFocus();
    $("explainer-card").hidden = !shown || matchMedia("(max-width: 899px)").matches;
  }
});
document.querySelectorAll("[data-back]").forEach((b) => b.addEventListener("click", closeFocus));

// --- Critical results: kept here and on Today until acknowledged -----------------------

async function loadAlerts() {
  const { alerts } = await api("/api/alerts");
  const crit = alerts.filter((a) => a.kind === "critical_lab");
  $("lab-alerts").innerHTML = crit.map((a) => `
    <div class="care-now" role="region" aria-label="${esc(a.title)}" data-alert="${esc(a.key)}">
      <strong>${esc(a.title)}</strong><p>${esc(a.message)}</p>
      <div class="btn-row">
        <button type="button" class="care-call" data-view="${esc(a.report_id)}">View the report</button>
        <button type="button" class="care-ack" data-dismiss="${esc(a.key)}">I've contacted my doctor</button>
      </div></div>`).join("");
  $("lab-alerts").querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => showReport(b.dataset.view).catch((e) => toast(e, true))));
  $("lab-alerts").querySelectorAll("[data-dismiss]").forEach((b) =>
    b.addEventListener("click", async () => {
      try {
        await api("/api/alerts/dismiss", { method: "POST", body: { key: b.dataset.dismiss } });
        b.closest("[data-alert]").remove();
        loadReports();
      } catch (err) { toast(err, true); }
    })
  );
}

// --- Add results -------------------------------------------------------------------

document.querySelectorAll("#add-tabs button").forEach((b) =>
  b.addEventListener("click", () => {
    document.querySelectorAll("#add-tabs button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    document.querySelectorAll("[data-pane]").forEach((p) => (p.hidden = p.dataset.pane !== b.dataset.tab));
  })
);

function upload(reportId, file, blob) {
  return api(`/api/labs/reports/${reportId}/files`, {
    method: "POST",
    body: blob,
    headers: { "Content-Type": blob.type || "application/octet-stream", "X-Filename": encodeURIComponent(file.name) },
  });
}

async function readReport(reportId, statusEl) {
  statusEl.innerHTML = waiting("Reading your report — this can take up to a minute…");
  try {
    const report = await api(`/api/labs/reports/${reportId}/extract`, { method: "POST" });
    openReview(report);
    toast(`Found ${plural(report.results.length, "result")} — please check them`);
  } catch (err) {
    toast(err, true);
    openReview(await api(`/api/labs/reports/${reportId}`)); // keep the draft; rows can be typed in
  } finally {
    statusEl.textContent = "";
    loadReports();
  }
}

$("btn-upload").addEventListener("click", async () => {
  const files = [...$("files").files];
  if (!files.length) return toast("Choose a PDF or photos first", true);
  $("btn-upload").disabled = true;
  let report;
  try {
    report = await api("/api/labs/reports", { method: "POST", body: { source: "upload" } });
    for (const [i, f] of files.entries()) {
      $("upload-status").textContent = `Uploading ${i + 1} of ${files.length}…`;
      const res = await upload(report.id, f, await shrinkImage(f));
      if (res.duplicate_of) toast(`${f.name} looks like the report from ${fmtDate(res.duplicate_of.collected_on)} you already confirmed`, true);
    }
    $("files").value = "";
    await readReport(report.id, $("upload-status"));
  } catch (err) {
    toast(err, true);
    $("upload-status").textContent = "";
    if (report) await api(`/api/labs/reports/${report.id}`, { method: "DELETE" }).catch(() => {});
  } finally {
    $("btn-upload").disabled = false;
  }
});

$("btn-paste").addEventListener("click", async () => {
  const text = $("paste-text").value.trim();
  if (!text) return toast("Paste the results first", true);
  $("btn-paste").disabled = true;
  try {
    const report = await api("/api/labs/reports", { method: "POST", body: { source: "text", raw_text: text } });
    $("paste-text").value = "";
    await readReport(report.id, $("paste-status"));
  } catch (err) {
    toast(err, true);
  } finally {
    $("btn-paste").disabled = false;
  }
});

$("btn-manual").addEventListener("click", async () => {
  try {
    const report = await api("/api/labs/reports", { method: "POST", body: { source: "manual", collected_on: todayISO() } });
    openReview(report);
    addRow({}, { fresh: true });
    loadReports();
  } catch (err) { toast(err, true); }
});

// --- Review ---------------------------------------------------------------------------

function markerOptions(selected) {
  const panels = [...new Set(markers.map((m) => m.panel))];
  return `<option value="">— not matched —</option>` + panels.map((p) =>
    `<optgroup label="${esc(p)}">${markers.filter((m) => m.panel === p)
      .map((m) => `<option value="${m.key}"${m.key === selected ? " selected" : ""}>${esc(m.name)}</option>`).join("")}</optgroup>`
  ).join("");
}

/** Flagged, critical, unmatched, unit problems and missing values need a look. */
const needsLook = (r) =>
  !inRange(r.flag) || !r.marker_key || (r.value_num == null && !r.value_text) ||
  (r.marker_key && r.value_num != null && r.canonical_value == null);

let rowSeq = 0;
function addRow(r = {}, { fresh = false } = {}) {
  const tr = document.createElement("tr");
  const n = ++rowSeq;
  const flag = r.flag || "";
  const needs = fresh || needsLook(r);
  tr.className = [flag.startsWith("critical") ? "flag-crit" : !inRange(flag) ? "flag-out" : "", needs ? "needs" : "normal", fresh ? "open" : ""].join(" ").trim();
  const name = r.name_on_report || r.marker_name || "this row";
  tr.innerHTML = `
    <td data-label="Matched to"><label class="sr-only" for="rm-${n}">Matched marker</label><select id="rm-${n}" class="r-marker" style="min-width:150px">${markerOptions(r.marker_key)}</select></td>
    <td data-label="As printed on the report"><label class="sr-only" for="rn-${n}">Name on report</label><input id="rn-${n}" class="r-name" value="${esc(r.name_on_report ?? "")}" placeholder="As printed" style="min-width:130px" /></td>
    <td data-label="Value"><input aria-label="Value" class="r-value num" inputmode="decimal" enterkeyhint="next" value="${esc(r.value_num ?? r.value_text ?? "")}" /></td>
    <td data-label="Unit"><input aria-label="Unit" class="r-unit num" enterkeyhint="next" value="${esc(r.unit ?? "")}" /></td>
    <td data-label="Low"><input aria-label="Range low" class="r-low num" inputmode="decimal" enterkeyhint="next" value="${esc(r.ref_low ?? "")}" /></td>
    <td data-label="High"><input aria-label="Range high" class="r-high num" inputmode="decimal" enterkeyhint="done" value="${esc(r.ref_high ?? "")}" /></td>
    <td data-label="Status" class="r-flag">${status(flag)}${r.canonical_value != null && r.canonical_value !== r.value_num ? `<div class="muted small">= ${fmtNum(r.canonical_value)} ${esc(r.canonical_unit)}</div>` : ""}</td>
    <td data-label=""><button type="button" class="btn-danger r-remove" aria-label="Remove ${esc(name)} — not a result">Not a result</button></td>`;
  tr.dataset.refText = r.ref_text ?? "";
  tr.dataset.flag = flag;
  tr.dataset.summary = `${name}|${r.value_num ?? r.value_text ?? ""} ${r.unit ?? ""}|${r.ref_low ?? ""}${r.ref_low != null || r.ref_high != null ? "–" : ""}${r.ref_high ?? ""}`;
  tr.querySelector(".r-remove").addEventListener("click", () => removeRow(tr));
  tr.querySelector(".r-marker").addEventListener("change", (e) => {
    const m = markers.find((x) => x.key === e.target.value);
    const unit = tr.querySelector(".r-unit");
    if (m && !unit.value) unit.value = m.unit;
    if (m && !tr.querySelector(".r-name").value) tr.querySelector(".r-name").value = m.name;
  });
  // Edited ranges replace the printed range text.
  for (const c of [".r-low", ".r-high"]) tr.querySelector(c).addEventListener("change", () => (tr.dataset.refText = ""));
  $("r-rows").appendChild(tr);
  return tr;
}

function readRows() {
  return [...$("r-rows").querySelectorAll("tr")].map((tr) => {
    const raw = tr.querySelector(".r-value").value.trim();
    const n = raw !== "" && Number.isFinite(Number(raw.replace(/,/g, ""))) ? Number(raw.replace(/,/g, "")) : null;
    return {
      marker_key: tr.querySelector(".r-marker").value || null,
      name_on_report: tr.querySelector(".r-name").value.trim() || markers.find((m) => m.key === tr.querySelector(".r-marker").value)?.name || "",
      value: n,
      value_text: n == null && raw ? raw : null,
      unit: tr.querySelector(".r-unit").value.trim() || null,
      ref_low: tr.querySelector(".r-low").value.trim() || null,
      ref_high: tr.querySelector(".r-high").value.trim() || null,
      ref_text: tr.dataset.refText || null,
      flag: tr.dataset.flag && !tr.querySelector(".r-low").value && !tr.querySelector(".r-high").value ? tr.dataset.flag : null,
    };
  }).filter((r) => r.name_on_report);
}

// Phones: step through the rows that need a look, then confirm the normal ones at once.
let queue = [];
let qpos = 0;

function removeRow(tr) {
  const i = queue.indexOf(tr);
  tr.remove();
  if (i >= 0) {
    queue.splice(i, 1);
    if (qpos > i || qpos >= queue.length) qpos = Math.max(0, Math.min(qpos, queue.length));
  }
  updateTriage();
  if (stepping()) renderStep();
  renderNormal();
}

const stepping = () => $("r-table").classList.contains("stepping");

function updateTriage() {
  const rows = [...$("r-rows").querySelectorAll("tr")];
  const needs = rows.filter((tr) => tr.classList.contains("needs")).length;
  $("r-triage").textContent = rows.length
    ? `${needs ? `${needs} need${needs === 1 ? "s" : ""} a look · ` : ""}${plural(rows.length - needs, "result")} look normal`
    : "No rows yet — add one below.";
}

// While stepping, the sticky bar holds "Looks right ✓"; Save and Confirm come back after.
function setStepBar(on) {
  $("r-step-actions").hidden = !on;
  $("r-final-actions").hidden = on;
}

function renderStep() {
  $("r-rows").querySelectorAll("tr.current").forEach((tr) => tr.classList.remove("current"));
  if (!stepping() || !queue.length) { $("r-step").innerHTML = ""; setStepBar(false); return; }
  if (qpos >= queue.length) {
    setStepBar(false);
    $("r-step").innerHTML = `<p class="triage">✓ ${plural(queue.length, "result")} checked</p>
      <button type="button" class="btn-link" data-restart>Look through them again</button>`;
    $("r-step").querySelector("[data-restart]").addEventListener("click", () => { qpos = 0; renderStep(); });
    return;
  }
  setStepBar(true);
  const tr = queue[qpos];
  tr.classList.add("current");
  $("r-step").innerHTML = `<p class="muted small" style="margin:0" aria-live="polite">${qpos + 1} of ${queue.length} that need a look —
    edit any field that doesn't match the report.</p>`;
  $("r-step-actions").querySelector("[data-step-prev]").disabled = qpos === 0;
}

$("r-step-actions").querySelector("[data-step-ok]").addEventListener("click", () => {
  qpos += 1;
  renderStep();
  (queue[qpos] || $("r-step")).scrollIntoView({ block: "start" });
});
$("r-step-actions").querySelector("[data-step-not]").addEventListener("click", () => { if (queue[qpos]) removeRow(queue[qpos]); });
$("r-step-actions").querySelector("[data-step-prev]").addEventListener("click", () => {
  qpos = Math.max(0, qpos - 1);
  renderStep();
  queue[qpos]?.scrollIntoView({ block: "start" });
});

let normalConfirmed = false;
function renderNormal() {
  if (!stepping()) { $("r-normal").innerHTML = ""; return; }
  const normal = [...$("r-rows").querySelectorAll("tr.normal:not(.open)")];
  if (!normal.length) { $("r-normal").innerHTML = ""; return; }
  if (normalConfirmed) {
    $("r-normal").innerHTML = `<p class="triage">✓ ${plural(normal.length, "normal result")} confirmed</p>`;
    return;
  }
  $("r-normal").innerHTML = `<p class="triage">${plural(normal.length, "result")} look normal</p>
    <div class="list normal-list">${normal.map((tr, i) => {
      const [name, value, range] = tr.dataset.summary.split("|");
      return `<button type="button" class="item" data-normal="${i}"><span class="main"><span class="title" style="display:block">${esc(name)}</span>
        <span class="meta" style="display:block">${esc(value.trim())}${range ? ` · range ${esc(range)}` : ""}</span></span><span class="chev" aria-hidden="true">›</span></button>`;
    }).join("")}</div>
    <button type="button" class="btn-block btn-lg mt" data-all-normal>All ${normal.length} match my report ✓</button>`;
  $("r-normal").querySelectorAll("[data-normal]").forEach((b) =>
    b.addEventListener("click", () => {
      const tr = normal[Number(b.dataset.normal)];
      tr.classList.add("open");
      renderNormal();
      tr.scrollIntoView({ block: "center" });
      tr.querySelector(".r-value").focus({ preventScroll: true });
    })
  );
  $("r-normal").querySelector("[data-all-normal]").addEventListener("click", () => { normalConfirmed = true; renderNormal(); });
}

async function viewFile(f) {
  try {
    if (f.mime_type.startsWith("image/")) {
      const blob = await fetchBlob(`/api/labs/files/${f.id}?inline=1`);
      const img = $("lightbox-img");
      if (img.src.startsWith("blob:")) URL.revokeObjectURL(img.src);
      img.src = URL.createObjectURL(blob);
      img.alt = f.original_filename || "Report page";
      $("lightbox").showModal();
    } else if (hasPin()) {
      // PIN mode: the header can't ride along on a new tab, so open the blob.
      const w = window.open("about:blank", "_blank");
      const blob = await fetchBlob(`/api/labs/files/${f.id}?inline=1`);
      if (w) w.location.href = URL.createObjectURL(blob);
    } else {
      window.open(`/api/labs/files/${f.id}?inline=1`, "_blank", "noopener");
    }
  } catch (err) { toast(err, true); }
}
$("lightbox-close").addEventListener("click", () => $("lightbox").close());
closeOnBackdrop($("lightbox"));

function openReview(report) {
  current = report;
  normalConfirmed = false;
  const confirmed = report.status === "confirmed";
  $("review-title").textContent = confirmed
    ? `Edit results · ${fmtDate(report.collected_on)}`
    : `Review · ${report.collected_on ? fmtDate(report.collected_on) : "date not set"}`;
  $("review-status").innerHTML = confirmed ? '<span class="pill green">Confirmed</span>' : '<span class="pill gray">Draft, not counted yet</span>';
  $("r-confirm").textContent = confirmed ? "Save & re-explain" : "Confirm & explain";
  $("r-collected").value = report.collected_on || "";
  $("r-collected").max = todayISO();
  $("r-lab").value = report.lab_name || "";
  $("r-provider").value = report.ordering_provider || "";
  $("r-details").hidden = Boolean(report.collected_on);
  $("review-menu").innerHTML = menuButton("Report options", [
    { act: "details", label: "Edit details (date, lab)" },
    { act: "save", label: "Save draft" },
    { act: "delete", label: "Delete report", danger: true },
  ]);
  wireMenu($("review-menu"), {
    details: () => { $("r-details").hidden = false; $("r-collected").focus(); },
    save: () => $("r-save").click(),
    delete: deleteReport,
  });
  $("r-files").innerHTML = report.files.map((f, i) =>
    `<button type="button" class="btn-ghost btn-sm file-chip" data-file="${i}">View report ${report.files.length > 1 ? `page ${i + 1}` : "page"}</button>`
  ).join("");
  $("r-files").querySelectorAll("[data-file]").forEach((b) => b.addEventListener("click", () => viewFile(report.files[Number(b.dataset.file)])));
  // Critical first, solid, above everything; routine notes after.
  const crit = report.warnings.filter((w) => /^Critical/.test(w));
  $("r-critical").innerHTML = crit.map((w) =>
    `<div class="care-now" role="alert"><strong>Critical result: contact your doctor</strong><p>${esc(w.replace(/^Critical value:\s*/, ""))}</p></div>`).join("");
  $("r-warnings").innerHTML = report.warnings.filter((w) => !/^Critical/.test(w))
    .map((w) => `<div class="banner amber" style="margin-bottom:8px">${esc(w)}</div>`).join("");
  $("r-rows").innerHTML = "";
  report.results.forEach((r) => addRow(r));
  $("r-table").classList.toggle("stepping", phone());
  queue = [...$("r-rows").querySelectorAll("tr.needs")];
  qpos = 0;
  updateTriage();
  renderStep();
  renderNormal();
  focusView($("review"), `#review-${report.id}`);
}

async function saveReview(confirm) {
  if (!current) return null;
  const body = {
    collected_on: $("r-collected").value || null,
    lab_name: $("r-lab").value,
    ordering_provider: $("r-provider").value,
    results: readRows(),
    confirm,
  };
  return api(`/api/labs/reports/${current.id}`, { method: "PUT", body });
}

$("r-add-row").addEventListener("click", () => {
  const tr = addRow({}, { fresh: true });
  updateTriage();
  tr.querySelector(".r-marker").focus();
});
$("r-save").addEventListener("click", async () => {
  try {
    openReview(await saveReview(false));
    toast("Draft saved");
    loadReports();
  } catch (err) { toast(err, true); }
});
$("r-confirm").addEventListener("click", async () => {
  if (!$("r-collected").value) {
    $("r-details").hidden = false;
    $("r-collected").focus();
    return toast("Add the date the blood was drawn first", true);
  }
  $("r-confirm").disabled = true;
  try {
    const report = await saveReview(true);
    toast("Results confirmed");
    loadReports();
    loadLatest();
    loadAlerts().catch(() => {});
    history.replaceState({ focus: "explainer-card" }, "", `#report-${report.id}`);
    await explain(report, { replace: true });
  } catch (err) {
    toast(err, true);
  } finally {
    $("r-confirm").disabled = false;
  }
});

function deleteReport() {
  if (!current) return;
  const id = current.id;
  const row = $("reports").querySelector(`[data-open="${CSS.escape(id)}"]`);
  closeFocus();
  $("explainer-card").hidden = true;
  undoable({
    message: "Report deleted",
    hide: row ? [row] : [],
    run: () => api(`/api/labs/reports/${id}`, { method: "DELETE", keepalive: true }),
    onDone: () => { loadReports(); loadLatest(); loadAlerts().catch(() => {}); },
  });
}

// --- Explainer: action first, sections folded ----------------------------------------------

function renderExplainer(report, markdown) {
  $("explainer-title").textContent = `What your ${fmtDate(report.collected_on)} results mean`;
  $("explainer-meta").textContent = readingTime(markdown);
  $("explainer").innerHTML = renderReader(markdown, { idPrefix: "ex" });
  wireReader($("explainer"));
}

async function explain(report, { replace = false } = {}) {
  shown = report;
  $("review").hidden = true;
  $("explainer-title").textContent = `What your ${fmtDate(report.collected_on)} results mean`;
  $("explainer-meta").textContent = "";
  $("explainer").innerHTML = `<p>${waiting("Thor is reading your results against your profile and recent data. This usually takes under a minute.")}</p>`;
  setExplainerMenu();
  if (!replace) focusView($("explainer-card"), `#report-${report.id}`);
  else focusView($("explainer-card"), location.hash);
  try {
    const g = await api(`/api/labs/reports/${report.id}/explain`, { method: "POST" });
    renderExplainer(report, g.markdown);
    loadReports();
  } catch (err) {
    $("explainer").innerHTML = `<p class="muted">Thor couldn't write the explainer just now. Your results are saved. <button type="button" class="btn-link" data-retry>Try again</button></p>`;
    $("explainer").querySelector("[data-retry]").addEventListener("click", () => explain(report, { replace: true }));
  }
}

function setExplainerMenu() {
  $("explainer-menu").innerHTML = menuButton("Explainer options", [
    { act: "edit", label: "Edit results" },
    { act: "regen", label: "Update with my latest data" },
  ]);
  wireMenu($("explainer-menu"), {
    edit: async () => shown && openReview(await api(`/api/labs/reports/${shown.id}`)),
    regen: () => shown && explain(shown, { replace: true }),
  });
}

async function showReport(id) {
  const report = await api(`/api/labs/reports/${id}`);
  if (report.status === "draft") return openReview(report);
  shown = report;
  if (!report.explainer_id) return explain(report);
  $("review").hidden = true;
  setExplainerMenu();
  const g = await api(`/api/guides/${report.explainer_id}`);
  renderExplainer(report, g.markdown);
  focusView($("explainer-card"), `#report-${report.id}`);
}

// --- Reports list ------------------------------------------------------------------------

function reportPill(r) {
  if (r.critical) return '<span class="pill care">Critical</span>';
  if (r.status === "draft") return '<span class="pill gray">Draft, not counted yet</span>';
  if (r.out_of_range) return `<span class="pill amber">${r.out_of_range} to discuss</span>`;
  return '<span class="pill green">All in range</span>';
}

async function loadReports() {
  const list = await api("/api/labs/reports");
  $("add-card").open = !list.length;
  $("reports").innerHTML = list.length
    ? list.map((r) => `
      <button type="button" class="item" data-open="${r.id}">
        <span class="main">
          <span class="title" style="display:block">${r.collected_on ? fmtDate(r.collected_on) : "Date not set"}${r.lab_name ? ` · ${esc(r.lab_name)}` : ""}</span>
          <span class="meta" style="display:block">${plural(r.result_count, "result")}${r.file_count ? ` · ${plural(r.file_count, "file")}` : ""}</span>
        </span>
        ${reportPill(r)}
      </button>`).join("")
    : `<div class="empty">No lab reports yet. Add your most recent blood work below.</div>`;
  $("reports").querySelectorAll("[data-open]").forEach((el) =>
    el.addEventListener("click", () => showReport(el.dataset.open).catch((e) => toast(e, true)))
  );
}

// --- Overview: what to discuss first, then panels folded ------------------------------------

function deltaHtml(m) {
  if (m.delta == null || m.delta === 0 || !m.previous) return "";
  const good = m.better === "lower" ? m.delta < 0 : m.better === "higher" ? m.delta > 0 : null;
  const cls = good == null ? "" : good ? "good" : "bad";
  const word = good == null ? "" : good ? " · better" : " · worse";
  return `<span class="delta ${cls}">${m.delta > 0 ? "↑" : "↓"} ${fmtNum(Math.abs(m.delta))} since ${shortMonth(m.previous.collected_on)}${word}</span>`;
}

function labRow(m) {
  const l = m.latest;
  return `<button type="button" class="item lab-row" data-key="${m.key}" aria-expanded="false">
    <span class="main"><span class="title" style="display:block">${esc(m.name)}</span>
      <span class="meta" style="display:block">${fmtDate(l.collected_on)}${m.count > 1 ? ` · ${plural(m.count, "result")}` : ""}</span></span>
    <span><span class="val">${l.value != null ? fmtNum(l.value) : esc(l.value_text ?? "")}</span> <span class="muted small">${esc(l.unit ?? "")}</span></span>
    <span class="chev" aria-hidden="true">›</span>
    <span class="rb-wrap">
      <span style="display:flex;gap:10px;flex-wrap:wrap">${status(l.flag || "normal")}${deltaHtml(m)}</span>
      ${rangeBar({ value: l.value, low: l.ref_low, high: l.ref_high, flag: l.flag })}
    </span>
  </button>`;
}

async function toggleTrend(row, key) {
  const next = row.nextElementSibling;
  if (next?.classList.contains("trend")) {
    next.remove();
    row.setAttribute("aria-expanded", "false");
    return;
  }
  const t = await api(`/api/labs/trends?marker=${key}`);
  const div = document.createElement("div");
  div.className = "trend chart-card";
  div.style.padding = "4px 4px 14px";
  div.innerHTML = chartLine(t.points.map((p) => ({ label: p.collected_on, value: p.value })), {
    unit: ` ${t.unit}`, band: t.band, color: "var(--accent)", minPoints: 1,
  }) + (t.points.length < 2 ? '<p class="muted small">One result so far — the trend fills in as you add reports.</p>' : "") +
    (t.note ? `<p class="muted small">${esc(t.note)}</p>` : "");
  row.after(div);
  row.setAttribute("aria-expanded", "true");
}

async function loadLatest() {
  const panels = await api("/api/labs/latest");
  if (!panels.length) {
    $("overview").innerHTML = `<div class="empty">Confirmed results show up here, with what to discuss first and your lab's normal range.</div>`;
    return;
  }
  const all = panels.flatMap((p) => p.markers);
  const discuss = all.filter((m) => !inRange(m.latest.flag));
  const lastDraw = all.map((m) => m.latest.collected_on).sort().pop();
  const flagWord = (f) => (FLAG[f]?.[0] || f).replace(/^[^A-Za-z]+/, "").toLowerCase();
  $("overview").innerHTML = `
    <p class="lab-summary">${discuss.length
      ? `<strong>${discuss.length} to discuss:</strong> ${discuss.map((m) => `${esc(m.name)} ${flagWord(m.latest.flag)}`).join(", ")}. ${all.length - discuss.length} in range.`
      : `<strong>All ${all.length} in range.</strong>`}</p>
    <p class="muted small" style="margin-top:0">Latest draw ${fmtDate(lastDraw)}. Tap a result to see its trend.</p>
    ${discuss.length ? `<div class="list mb">${discuss.map(labRow).join("")}</div>` : ""}
    ${panels.map((p) => {
      const ok = p.markers.filter((m) => inRange(m.latest.flag));
      return ok.length ? `<details class="panel"><summary>${esc(p.panel)} <span class="count">${ok.length} in range ›</span></summary>
        <div class="list">${ok.map(labRow).join("")}</div></details>` : "";
    }).join("")}`;
  $("overview").querySelectorAll("[data-key]").forEach((row) =>
    row.addEventListener("click", () => toggleTrend(row, row.dataset.key).catch((e) => toast(e, true)))
  );
}

(async () => {
  markers = await api("/api/labs/markers");
  await Promise.all([loadReports(), loadLatest(), loadAlerts().catch(() => {})]);
  const m = location.hash.match(/^#(?:report|review)-(.+)$/);
  if (m) {
    history.replaceState(null, "", "labs.html");
    await showReport(decodeURIComponent(m[1]));
  }
})().catch((e) => toast(e, true));
