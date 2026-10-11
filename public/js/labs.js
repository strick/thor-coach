import { api, toast, esc, renderNav, renderMarkdown, fmtDate, todayISO, downloadFile, rangeBar, chartLine } from "./ui.js";

renderNav("labs");
const $ = (id) => document.getElementById(id);

let markers = [];
let current = null; // report open in the review table

const fmtNum = (v) => {
  if (v == null) return "";
  const a = Math.abs(v);
  const d = a >= 100 ? 0 : a >= 10 ? 1 : 2;
  return String(Math.round(v * 10 ** d) / 10 ** d);
};
const FLAG_LABEL = { low: "low", high: "high", abnormal: "abnormal", normal: "", critical_low: "critical low", critical_high: "critical high" };
const flagPill = (flag) => {
  if (!flag || flag === "normal") return flag === "normal" ? '<span class="pill green">ok</span>' : "";
  return `<span class="pill ${flag.startsWith("critical") ? "red" : "gold"}">${FLAG_LABEL[flag] || esc(flag)}</span>`;
};

// --- Add results ----------------------------------------------------------------

document.querySelectorAll("#add-tabs button").forEach((b) =>
  b.addEventListener("click", () => {
    document.querySelectorAll("#add-tabs button").forEach((x) => x.classList.toggle("on", x === b));
    document.querySelectorAll("[data-pane]").forEach((p) => (p.hidden = p.dataset.pane !== b.dataset.tab));
  })
);

/** Shrink phone photos before upload (long edge ≤ 2000 px, JPEG). PDFs go as-is. */
async function prepare(file) {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob || file;
  } catch {
    return file; // e.g. HEIC the browser can't decode — the server explains what to do
  }
}

function upload(reportId, file, blob) {
  return api(`/api/labs/reports/${reportId}/files`, {
    method: "POST",
    body: blob,
    headers: { "Content-Type": blob.type || "application/octet-stream", "X-Filename": encodeURIComponent(file.name) },
  });
}

async function readReport(reportId, statusEl) {
  statusEl.innerHTML = '<span class="spin">⚡</span> Reading your report — this can take up to a minute…';
  try {
    const report = await api(`/api/labs/reports/${reportId}/extract`, { method: "POST" });
    openReview(report);
    toast(`Found ${report.results.length} results — please review them`);
  } catch (err) {
    toast(err.message, true);
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
      const res = await upload(report.id, f, await prepare(f));
      if (res.duplicate_of) toast(`${f.name} looks like the report from ${fmtDate(res.duplicate_of.collected_on)} you already confirmed`, true);
    }
    $("files").value = "";
    await readReport(report.id, $("upload-status"));
  } catch (err) {
    toast(err.message, true);
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
    toast(err.message, true);
  } finally {
    $("btn-paste").disabled = false;
  }
});

$("btn-manual").addEventListener("click", async () => {
  try {
    const report = await api("/api/labs/reports", { method: "POST", body: { source: "manual", collected_on: todayISO() } });
    openReview(report);
    addRow();
    loadReports();
  } catch (err) { toast(err.message, true); }
});

// --- Review table ---------------------------------------------------------------

function markerOptions(selected) {
  const panels = [...new Set(markers.map((m) => m.panel))];
  return `<option value="">— not matched —</option>` + panels.map((p) =>
    `<optgroup label="${esc(p)}">${markers.filter((m) => m.panel === p)
      .map((m) => `<option value="${m.key}"${m.key === selected ? " selected" : ""}>${esc(m.name)}</option>`).join("")}</optgroup>`
  ).join("");
}

function addRow(r = {}) {
  const tr = document.createElement("tr");
  const flag = r.flag || "";
  tr.className = flag.startsWith("critical") ? "flag-crit" : flag && flag !== "normal" ? "flag-out" : "";
  tr.innerHTML = `
    <td><select class="r-marker" style="min-width:150px">${markerOptions(r.marker_key)}</select></td>
    <td><input class="r-name" value="${esc(r.name_on_report ?? "")}" placeholder="As printed" style="min-width:130px" /></td>
    <td><input class="r-value num" value="${esc(r.value_num ?? r.value_text ?? "")}" /></td>
    <td><input class="r-unit num" value="${esc(r.unit ?? "")}" /></td>
    <td><input class="r-low num" value="${esc(r.ref_low ?? "")}" /></td>
    <td><input class="r-high num" value="${esc(r.ref_high ?? "")}" /></td>
    <td class="r-flag">${flagPill(flag)}${r.canonical_value != null && r.canonical_value !== r.value_num ? `<div class="muted small">= ${fmtNum(r.canonical_value)} ${esc(r.canonical_unit)}</div>` : ""}</td>
    <td><button type="button" class="btn-danger" title="Remove row">✕</button></td>`;
  tr.dataset.refText = r.ref_text ?? "";
  tr.dataset.flag = flag;
  tr.querySelector(".btn-danger").addEventListener("click", () => tr.remove());
  tr.querySelector(".r-marker").addEventListener("change", (e) => {
    const m = markers.find((x) => x.key === e.target.value);
    const unit = tr.querySelector(".r-unit");
    if (m && !unit.value) unit.value = m.unit;
    if (m && !tr.querySelector(".r-name").value) tr.querySelector(".r-name").value = m.name;
  });
  // Edited ranges replace the printed range text.
  for (const c of [".r-low", ".r-high"]) tr.querySelector(c).addEventListener("change", () => (tr.dataset.refText = ""));
  $("r-rows").appendChild(tr);
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

function openReview(report) {
  current = report;
  $("review").hidden = false;
  $("review-title").textContent = report.status === "confirmed" ? `Edit results · ${fmtDate(report.collected_on)}` : "Review results";
  $("review-status").innerHTML = report.status === "confirmed" ? '<span class="pill green">confirmed</span>' : '<span class="pill gold">draft — not counted yet</span>';
  $("r-confirm").textContent = report.status === "confirmed" ? "Save & re-explain" : "Confirm & explain";
  $("r-collected").value = report.collected_on || "";
  $("r-collected").max = todayISO();
  $("r-lab").value = report.lab_name || "";
  $("r-provider").value = report.ordering_provider || "";
  $("r-files").innerHTML = report.files.map((f) =>
    `<button type="button" class="btn-ghost btn-sm fit file-chip" data-file="${f.id}" data-name="${esc(f.original_filename)}">📄 ${esc(f.original_filename)} · ${Math.round(f.bytes / 1024)} KB</button>`
  ).join("");
  $("r-files").querySelectorAll("[data-file]").forEach((b) =>
    b.addEventListener("click", () => downloadFile(`/api/labs/files/${b.dataset.file}`, b.dataset.name).catch((e) => toast(e.message, true)))
  );
  $("r-warnings").innerHTML = report.warnings.map((w) => `<div class="banner ${/^Critical/.test(w) ? "red" : "gold"}" style="margin-bottom:8px">${esc(w)}</div>`).join("");
  $("r-rows").innerHTML = "";
  report.results.forEach(addRow);
  $("review").scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeReview() {
  current = null;
  $("review").hidden = true;
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

$("r-add-row").addEventListener("click", () => addRow());
$("r-close").addEventListener("click", closeReview);
$("r-save").addEventListener("click", async () => {
  try {
    openReview(await saveReview(false));
    toast("Draft saved");
    loadReports();
  } catch (err) { toast(err.message, true); }
});
$("r-confirm").addEventListener("click", async () => {
  $("r-confirm").disabled = true;
  try {
    const report = await saveReview(true);
    closeReview();
    toast("Results confirmed");
    loadReports();
    loadLatest();
    await explain(report);
  } catch (err) {
    toast(err.message, true);
  } finally {
    $("r-confirm").disabled = false;
  }
});
$("r-delete").addEventListener("click", async () => {
  if (!current || !confirm("Delete this report, its files and its explainer?")) return;
  try {
    await api(`/api/labs/reports/${current.id}`, { method: "DELETE" });
    closeReview();
    $("explainer-card").hidden = true;
    toast("Report deleted");
    loadReports();
    loadLatest();
  } catch (err) { toast(err.message, true); }
});

// --- Explainer --------------------------------------------------------------------

let shown = null; // confirmed report whose explainer is showing

async function explain(report) {
  shown = report;
  $("explainer-card").hidden = false;
  $("explainer-title").textContent = `What your ${fmtDate(report.collected_on)} results mean`;
  $("explainer").innerHTML = '<p class="muted"><span class="spin">⚡</span> Reading your results against your profile and recent data…</p>';
  $("explainer-card").scrollIntoView({ behavior: "smooth", block: "start" });
  try {
    const g = await api(`/api/labs/reports/${report.id}/explain`, { method: "POST" });
    $("explainer").innerHTML = renderMarkdown(g.markdown);
    loadReports();
  } catch (err) {
    $("explainer").innerHTML = `<p class="muted">Couldn't write the explainer: ${esc(err.message)}</p>`;
  }
}

async function showReport(id) {
  const report = await api(`/api/labs/reports/${id}`);
  if (report.status === "draft") return openReview(report);
  shown = report;
  $("explainer-card").hidden = false;
  $("explainer-title").textContent = `What your ${fmtDate(report.collected_on)} results mean`;
  if (!report.explainer_id) return explain(report);
  const g = await api(`/api/guides/${report.explainer_id}`);
  $("explainer").innerHTML = renderMarkdown(g.markdown);
  $("explainer-card").scrollIntoView({ behavior: "smooth", block: "start" });
}

$("btn-regen").addEventListener("click", () => shown && explain(shown));
$("btn-edit-report").addEventListener("click", async () => shown && openReview(await api(`/api/labs/reports/${shown.id}`)));

// --- Reports list -----------------------------------------------------------------

async function loadReports() {
  const list = await api("/api/labs/reports");
  $("reports").innerHTML = list.length
    ? list.map((r) => `
      <div class="item" style="cursor:pointer" data-open="${r.id}">
        <div class="main">
          <div class="title">${r.collected_on ? fmtDate(r.collected_on) : "Date not set"}${r.lab_name ? ` · ${esc(r.lab_name)}` : ""}</div>
          <div class="meta">${r.result_count} results${r.out_of_range ? ` · ${r.out_of_range} out of range` : ""}${r.file_count ? ` · ${r.file_count} file${r.file_count > 1 ? "s" : ""}` : ""}</div>
        </div>
        ${r.status === "draft" ? '<span class="pill gold">unfinished</span>' : r.out_of_range ? '<span class="pill gold">review</span>' : '<span class="pill green">all in range</span>'}
      </div>`).join("")
    : `<div class="empty">No lab reports yet. Add your most recent blood work to get started.</div>`;
  $("reports").querySelectorAll("[data-open]").forEach((el) =>
    el.addEventListener("click", () => showReport(el.dataset.open).catch((e) => toast(e.message, true)))
  );
}

// --- Latest results + trends -----------------------------------------------------

function deltaHtml(m) {
  if (m.delta == null || m.delta === 0) return "";
  const good = m.better === "lower" ? m.delta < 0 : m.better === "higher" ? m.delta > 0 : null;
  const cls = good == null ? "muted" : good ? "good" : "bad";
  return `<span class="delta ${cls}" title="vs ${m.previous.collected_on}">${m.delta > 0 ? "▲" : "▼"} ${fmtNum(Math.abs(m.delta))}</span>`;
}

async function toggleTrend(row, key) {
  const next = row.nextElementSibling;
  if (next?.classList.contains("trend")) return next.remove();
  const t = await api(`/api/labs/trends?marker=${key}`);
  const div = document.createElement("div");
  div.className = "trend chart-card";
  div.style.padding = "4px 0 14px";
  div.innerHTML = chartLine(t.points.map((p) => ({ label: p.collected_on, value: p.value })), {
    unit: ` ${t.unit}`, band: t.band, color: "var(--gold)", minPoints: 1,
  }) + (t.points.length < 2 ? '<p class="muted small">One result so far — the trend fills in as you add reports.</p>' : "") +
    (t.note ? `<p class="muted small">${esc(t.note)}</p>` : "");
  row.after(div);
}

async function loadLatest() {
  const panels = await api("/api/labs/latest");
  if (!panels.length) {
    $("latest").innerHTML = `<div class="empty">Confirmed results show up here, grouped by panel, with your lab's normal range.</div>`;
    return;
  }
  $("latest").innerHTML = panels.map((p) => `
    <h3 class="mt" style="margin-bottom:4px">${esc(p.panel)}</h3>
    ${p.markers.map((m) => `
      <div class="item lab-marker" style="margin-bottom:6px" data-key="${m.key}">
        <div><div class="title">${esc(m.name)}</div><div class="meta">${fmtDate(m.latest.collected_on)}${m.count > 1 ? ` · ${m.count} results` : ""}</div></div>
        <div><span class="val">${m.latest.value != null ? fmtNum(m.latest.value) : esc(m.latest.value_text ?? "")}</span>
          <span class="muted small">${esc(m.latest.unit ?? "")}</span>${deltaHtml(m)} ${m.latest.flag && m.latest.flag !== "normal" ? flagPill(m.latest.flag) : ""}</div>
        <div>${rangeBar({ value: m.latest.value, low: m.latest.ref_low, high: m.latest.ref_high, flag: m.latest.flag })}
          <div class="muted small">${m.latest.ref_low != null || m.latest.ref_high != null ? `range ${m.latest.ref_low ?? ""}${m.latest.ref_low != null && m.latest.ref_high != null ? "–" : m.latest.ref_low != null ? "+" : "<"}${m.latest.ref_high ?? ""}` : ""}</div></div>
      </div>`).join("")}`).join("");
  $("latest").querySelectorAll("[data-key]").forEach((row) =>
    row.addEventListener("click", () => toggleTrend(row, row.dataset.key).catch((e) => toast(e.message, true)))
  );
}

(async () => {
  markers = await api("/api/labs/markers");
  await Promise.all([loadReports(), loadLatest()]);
})().catch((e) => toast(e.message, true));
