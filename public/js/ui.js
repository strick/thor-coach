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
  if (opts.body && typeof opts.body !== "string") {
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

/** Zero-dep SVG line chart. points: [{label, value}]. */
export function chartLine(points, { height = 140, unit = "", color = "var(--accent)" } = {}) {
  if (points.length < 2) return `<div class="empty">Not enough data yet.</div>`;
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const W = 100;
  const xy = points.map((p, i) => [
    (i / (points.length - 1)) * W,
    8 + (1 - (p.value - min) / span) * (height - 34),
  ]);
  const path = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const dots = xy.map(([x, y], i) =>
    `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="1.6" fill="${color}"><title>${esc(points[i].label)}: ${points[i].value}${unit}</title></circle>`
  ).join("");
  const first = points[0], lastP = points[points.length - 1];
  return `<svg viewBox="0 0 ${W} ${height}" width="100%" height="${height}" preserveAspectRatio="none" style="overflow:visible">
    <path d="${path}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>${dots}
    <text x="0" y="${height - 4}" font-size="7" fill="var(--muted)">${esc(first.label)}</text>
    <text x="${W}" y="${height - 4}" font-size="7" fill="var(--muted)" text-anchor="end">${esc(lastP.label)}</text>
  </svg>`;
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
