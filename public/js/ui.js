// Shared UI helpers: API client, nav, toast, mini markdown renderer, dates.

function pinHeaders() {
  const pin = localStorage.getItem("thor_pin");
  return pin ? { "X-Thor-Pin": pin } : {};
}

// A single shared PIN prompt: when the page fires many calls at once and they
// all 401, only one prompt appears and every caller waits on it (instead of a
// stack of dialogs the browser suppresses, leaving the page blank).
let pinPrompt = null;
function askPin() {
  if (!pinPrompt) {
    pinPrompt = new Promise((resolve) => {
      const pin = prompt("🔒 Enter your Thor PIN:");
      if (pin) localStorage.setItem("thor_pin", pin.trim());
      resolve(Boolean(pin));
    }).finally(() => { pinPrompt = null; });
  }
  return pinPrompt;
}

export async function api(path, options = {}, retried = false) {
  const opts = { ...options, headers: { ...pinHeaders(), ...(options.headers || {}) } };
  // Plain objects go as JSON; files/blobs (uploads) are sent as-is.
  if (opts.body && typeof opts.body !== "string" && !(opts.body instanceof Blob) && !(opts.body instanceof ArrayBuffer)) {
    opts.body = JSON.stringify(opts.body);
    opts.headers["Content-Type"] = "application/json";
  }
  const resp = await fetch(path, opts);
  const data = await resp.json().catch(() => ({}));
  if (resp.status === 401) {
    // Microsoft sign-in mode: bounce to the login page (and come back here).
    if (data.login) {
      location.href = `/login.html?next=${encodeURIComponent(location.pathname + location.search)}`;
      return new Promise(() => {}); // navigating away — never settle
    }
    if (!retried && (await askPin())) return api(path, options, true);
  }
  if (!resp.ok) throw new Error(data.error || `${resp.status} ${resp.statusText}`);
  return data;
}

/** Download an API resource as a file (carries the PIN header, unlike a plain link). */
export async function downloadFile(path, filename) {
  const resp = await fetch(path, { headers: pinHeaders() });
  if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
  const blob = await resp.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

let toastTimer;
export function toast(message, isError = false) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = "show" + (isError ? " error" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = ""), isError ? 5000 : 2800);
}

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/**
 * Tiny markdown renderer: headings, bold, italics, bullet and numbered lists,
 * "> " callouts, paragraphs. Text is escaped first — no raw HTML or links.
 */
export function renderMarkdown(md) {
  const lines = String(md || "").split(/\r?\n/);
  const out = [];
  let list = null; // "ul" | "ol" while inside a list
  let quote = false;
  const inline = (s) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  const closeQuote = () => {
    if (quote) out.push("</blockquote>");
    quote = false;
  };
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith(">")) {
      closeList();
      if (!quote) { out.push("<blockquote>"); quote = true; }
      const body = t.replace(/^>\s?/, "");
      if (body) out.push(`<p>${inline(body)}</p>`);
      continue;
    }
    closeQuote();
    const bullet = /^[-*] /.test(t);
    const numbered = /^\d+[.)] /.test(t);
    if (bullet || numbered) {
      const kind = bullet ? "ul" : "ol";
      if (list !== kind) { closeList(); out.push(`<${kind}>`); list = kind; }
      out.push(`<li>${inline(bullet ? t.slice(2) : t.replace(/^\d+[.)] /, ""))}</li>`);
      continue;
    }
    closeList();
    if (t.startsWith("### ")) out.push(`<h3>${inline(t.slice(4))}</h3>`);
    else if (t.startsWith("## ")) out.push(`<h2>${inline(t.slice(3))}</h2>`);
    else if (t.startsWith("# ")) out.push(`<h2>${inline(t.slice(2))}</h2>`);
    else if (t) out.push(`<p>${inline(t)}</p>`);
  }
  closeList();
  closeQuote();
  return out.join("\n");
}

export const todayISO = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/** Local "YYYY-MM-DDTHH:MM" (the value format of <input type="datetime-local">). */
export const localDateTime = (d = new Date()) =>
  `${todayISO(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** "2:10 PM" from a local "YYYY-MM-DDTHH:MM". */
export const fmtTime = (dt) =>
  dt ? new Date(dt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";

export const addDays = (iso, n) => {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return todayISO(d);
};

export const fmtDate = (iso) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

export const DOW_NAMES = { 1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday", 6: "Saturday", 7: "Sunday" };

/** Render the shared nav; `active` is the page key. */
export function renderNav(active) {
  const pages = [
    ["index", "Today", "index.html"],
    ["workouts", "Workouts", "workouts.html"],
    ["running", "Running", "running.html"],
    ["nutrition", "Nutrition", "nutrition.html"],
    ["health", "Health", "health.html"],
    ["labs", "Labs", "labs.html"],
    ["trends", "Trends", "trends.html"],
    ["chat", "Ask Thor", "chat.html"],
  ];
  const link = ([key, label, href]) => `<a class="link${key === active ? " active" : ""}" href="${href}">${label}</a>`;
  const nav = document.createElement("nav");
  nav.className = "nav";
  nav.innerHTML =
    `<a class="brand" href="index.html"><span class="bolt">⚡</span><span class="brand-text">THOR</span></a>` +
    pages.map(link).join("") +
    `<span class="spacer"></span>` +
    link(["settings", "Settings", "settings.html"]);
  document.body.prepend(nav);
  // On narrow screens the nav scrolls sideways; keep the current page in view.
  nav.querySelector(".link.active")?.scrollIntoView?.({ inline: "center", block: "nearest" });
  // With Microsoft sign-in active, offer a sign-out link (fire-and-forget; the
  // endpoint is public so this never triggers a PIN prompt or redirect).
  fetch("/api/auth/me")
    .then((r) => (r.ok ? r.json() : null))
    .then((me) => {
      if (me?.auth === "microsoft" && me.signed_in) {
        const a = document.createElement("a");
        a.className = "link";
        a.href = "/auth/logout";
        a.textContent = "Sign out";
        nav.appendChild(a);
      }
    })
    .catch(() => {});
}

/**
 * Zero-dep SVG bar chart. data: [{label, value, value2?}] — value2 renders as a
 * thin overlay line (e.g. a target). Returns an HTML string.
 */
export function chartBars(data, { height = 140, unit = "", color = "var(--accent)", targetColor = "var(--gold)" } = {}) {
  if (!data.length) return `<div class="empty">No data yet.</div>`;
  const max = Math.max(...data.map((d) => Math.max(d.value || 0, d.value2 || 0)), 1);
  const bw = 100 / data.length;
  const bars = data.map((d, i) => {
    const h = ((d.value || 0) / max) * (height - 24);
    const x = i * bw + bw * 0.15;
    let out = `<rect x="${x}%" y="${height - 18 - h}" width="${bw * 0.7}%" height="${h}" rx="3" fill="${color}"><title>${esc(d.label)}: ${Math.round(d.value)}${unit}</title></rect>`;
    if (d.value2) {
      const ty = height - 18 - ((d.value2 / max) * (height - 24));
      out += `<line x1="${i * bw + bw * 0.05}%" x2="${(i + 1) * bw - bw * 0.05}%" y1="${ty}" y2="${ty}" stroke="${targetColor}" stroke-width="2" stroke-dasharray="3 2"/>`;
    }
    return out;
  }).join("");
  const labels = data.map((d, i) =>
    (data.length <= 8 || i % Math.ceil(data.length / 8) === 0)
      ? `<text x="${i * bw + bw / 2}%" y="${height - 4}" font-size="9" fill="var(--muted)" text-anchor="middle">${esc(d.label)}</text>`
      : ""
  ).join("");
  return `<svg width="100%" height="${height}" style="overflow:visible">${bars}${labels}</svg>`;
}

/**
 * Zero-dep SVG line chart. points: [{label, value}].
 * band: {low, high} draws the reference range (either side may be null).
 * minPoints: how many points are needed before drawing (default 2).
 */
export function chartLine(points, { height = 140, unit = "", color = "var(--accent)", band = null, minPoints = 2 } = {}) {
  if (points.length < minPoints) return `<div class="empty">Not enough data yet.</div>`;
  const vals = points.map((p) => p.value);
  const bandVals = [band?.low, band?.high].filter((v) => v != null);
  const min = Math.min(...vals, ...bandVals), max = Math.max(...vals, ...bandVals);
  const span = max - min || 1;
  const W = 100;
  const yOf = (v) => 8 + (1 - (v - min) / span) * (height - 34);
  const xy = points.map((p, i) => [points.length > 1 ? (i / (points.length - 1)) * W : W / 2, yOf(p.value)]);
  const path = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const dots = xy.map(([x, y], i) =>
    `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="1.6" fill="${color}"><title>${esc(points[i].label)}: ${points[i].value}${unit}</title></circle>`
  ).join("");
  let bandSvg = "";
  if (band && (band.low != null || band.high != null)) {
    const top = band.high != null ? yOf(band.high) : 8;
    const bottom = band.low != null ? yOf(band.low) : height - 26;
    bandSvg = `<rect x="0" y="${top.toFixed(2)}" width="${W}" height="${Math.max(0, bottom - top).toFixed(2)}" fill="var(--success)" opacity="0.08"/>` +
      bandVals.map((v) => `<line x1="0" x2="${W}" y1="${yOf(v).toFixed(2)}" y2="${yOf(v).toFixed(2)}" stroke="var(--success)" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" opacity="0.6"/>`).join("");
  }
  const first = points[0], lastP = points[points.length - 1];
  // The SVG stretches to the card width, so labels live in HTML (SVG text would distort).
  return `<svg viewBox="0 0 ${W} ${height - 18}" width="100%" height="${height - 18}" preserveAspectRatio="none" style="overflow:visible">
    ${bandSvg}<path d="${path}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>${dots}
  </svg>
  <div class="chart-labels"><span>${esc(first.label)}</span><span>${points.length > 1 ? esc(lastP.label) : ""}</span></div>`;
}

/**
 * A lab value on its reference range: a track with the normal band shaded and
 * a dot for the value. Handles one-sided ranges ("<100", ">39").
 */
export function rangeBar({ value, low = null, high = null, flag = null }) {
  if (value == null || (low == null && high == null)) return "";
  let lo, hi;
  if (low != null && high != null) {
    const pad = (high - low) * 0.6 || Math.abs(high) * 0.2 || 1;
    lo = low - pad; hi = high + pad;
  } else if (high != null) {
    lo = 0; hi = high * 1.6;
  } else {
    lo = Math.max(0, low * 0.4); hi = low * 2;
  }
  lo = Math.min(lo, value); hi = Math.max(hi, value);
  const pct = (v) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo || 1)) * 100));
  const bandL = pct(low ?? lo), bandR = pct(high ?? hi);
  const cls = flag?.startsWith("critical") ? "crit" : flag && flag !== "normal" ? "out" : "ok";
  return `<div class="rb" title="range ${low ?? "–"} to ${high ?? "–"}">
    <span class="rb-band" style="left:${bandL}%;width:${Math.max(0, bandR - bandL)}%"></span>
    <span class="rb-dot ${cls}" style="left:${pct(value)}%"></span></div>`;
}

/** Macro progress bar HTML. `max` semantics: 'target' (reach it) or 'limit' (stay under). */
export function bar(label, value, max, unit, kind = "target") {
  const v = Number(value) || 0;
  const m = Number(max) || 0;
  const pct = m > 0 ? Math.min(100, (v / m) * 100) : 0;
  let cls = "";
  if (kind === "limit") cls = v > m && m > 0 ? "over" : "good";
  else cls = m > 0 && v >= m ? "good" : "";
  return `<div class="bar-wrap">
    <div class="bar-head"><span>${esc(label)}</span><span class="val">${Math.round(v)}${m ? ` / ${Math.round(m)}` : ""} ${unit}</span></div>
    <div class="bar"><span class="${cls}" style="width:${pct}%"></span></div>
  </div>`;
}
