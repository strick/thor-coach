// Shared UI helpers: API client, navigation (top bar + bottom tab bar + sheets),
// live-region toasts with Undo, a mini markdown renderer and reader, dates, charts.

// --- API ---------------------------------------------------------------------

function pinHeaders() {
  let pin = null;
  try { pin = localStorage.getItem("thor_pin"); } catch { /* storage blocked */ }
  return pin ? { "X-Thor-Pin": pin } : {};
}

// A single shared PIN prompt: when the page fires many calls at once and they
// all 401, only one prompt appears and every caller waits on it.
let pinPrompt = null;
function askPin() {
  if (!pinPrompt) {
    pinPrompt = askText({ title: "Enter your Thor PIN", label: "PIN", type: "password", ok: "Unlock" })
      .then((pin) => {
        if (pin) {
          try { localStorage.setItem("thor_pin", pin.trim()); } catch { /* storage blocked */ }
        }
        return Boolean(pin);
      })
      .finally(() => { pinPrompt = null; });
  }
  return pinPrompt;
}

const FRIENDLY_ERROR = "Thor couldn't finish that just now. Nothing was lost. Try again in a minute.";

export async function api(path, options = {}, retried = false) {
  const opts = { ...options, headers: { ...pinHeaders(), ...(options.headers || {}) } };
  // Plain objects go as JSON; files/blobs (uploads) are sent as-is.
  if (opts.body && typeof opts.body !== "string" && !(opts.body instanceof Blob) && !(opts.body instanceof ArrayBuffer)) {
    opts.body = JSON.stringify(opts.body);
    opts.headers["Content-Type"] = "application/json";
  }
  let resp;
  try {
    resp = await fetch(path, opts);
  } catch (e) {
    const err = new Error("Thor couldn't reach the server. Nothing was lost — try again when you're connected.");
    err.details = e.message;
    throw err;
  }
  const data = await resp.json().catch(() => ({}));
  if (resp.status === 401) {
    // Microsoft sign-in mode: bounce to the login page (and come back here).
    if (data.login) {
      location.href = `/login.html?next=${encodeURIComponent(location.pathname + location.search)}`;
      return new Promise(() => {}); // navigating away — never settle
    }
    if (!retried && (await askPin())) return api(path, options, true);
  }
  if (!resp.ok) {
    const raw = data.error || `${resp.status} ${resp.statusText}`;
    // Server and model failures get plain words; validation messages stay specific.
    const err = new Error(resp.status >= 500 ? FRIENDLY_ERROR : raw);
    err.details = raw;
    err.status = resp.status;
    throw err;
  }
  return data;
}

/** Fetch an API resource as a Blob (carries the PIN header, unlike a plain link). */
export async function fetchBlob(path) {
  const resp = await fetch(path, { headers: pinHeaders() });
  if (!resp.ok) throw new Error(`Couldn't open the file (${resp.status})`);
  return resp.blob();
}

/** Download an API resource as a file. */
export async function downloadFile(path, filename) {
  const blob = await fetchBlob(path);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export const hasPin = () => Object.keys(pinHeaders()).length > 0;

// --- Toasts: two live regions (status for confirmations, alert for errors) ----

let toastTimer;
function toastRegion(kind) {
  const id = kind === "alert" ? "toast-alert" : "toast-status";
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("div");
    el.id = id;
    el.className = "toast";
    el.setAttribute("role", kind);
    el.setAttribute("aria-live", kind === "alert" ? "assertive" : "polite");
    document.body.appendChild(el);
  }
  return el;
}

/**
 * toast("Saved") · toast(err, true) · toast("Deleted", false, { action: "Undo", onAction })
 * An Error with `.details` gets a Details button.
 */
export function toast(message, isError = false, { action, onAction, duration } = {}) {
  const status = toastRegion("status");
  const alert = toastRegion("alert");
  const el = isError ? alert : status;
  (isError ? status : alert).className = "toast";
  (isError ? status : alert).textContent = "";
  const text = message instanceof Error ? message.message : String(message ?? "");
  const details = message instanceof Error && message.details && message.details !== text ? message.details : null;
  el.innerHTML = `<span class="toast-text">${esc(text)}</span>`;
  const addButton = (label, fn) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", fn);
    el.appendChild(b);
  };
  if (action) addButton(action, () => { hide(); onAction?.(); });
  else if (details) addButton("Details", () => { el.querySelector(".toast-text").textContent = details; restart(10000); });
  el.className = "toast show" + (isError ? " error" : "");
  const hide = () => { el.className = "toast"; };
  const restart = (ms) => { clearTimeout(toastTimer); toastTimer = setTimeout(hide, ms); };
  restart(duration ?? (action ? 6000 : isError ? 6000 : 2800));
}

// Deletes wait a few seconds behind an Undo instead of asking first.
const pendingDeletes = new Set();
/**
 * @param {{ message?: string, hide?: Element[], run: () => Promise<any>, onDone?: () => void, onUndo?: () => void }} o
 *   run() should pass `keepalive: true` to api() so it survives the page closing.
 */
export function undoable({ message = "Deleted", hide = [], run, onDone, onUndo }) {
  hide.forEach((e) => (e.hidden = true));
  let settled = false;
  const job = {
    fire() {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      pendingDeletes.delete(job);
      Promise.resolve()
        .then(run)
        .then(() => onDone?.())
        .catch((err) => {
          hide.forEach((e) => (e.hidden = false));
          toast(err, true);
        });
    },
  };
  const timer = setTimeout(() => job.fire(), 6000);
  pendingDeletes.add(job);
  toast(message, false, {
    action: "Undo",
    duration: 6000,
    onAction: () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      pendingDeletes.delete(job);
      hide.forEach((e) => (e.hidden = false));
      onUndo?.();
    },
  });
}
const inBrowser = typeof window !== "undefined" && typeof document !== "undefined";
if (inBrowser) addEventListener("pagehide", () => pendingDeletes.forEach((j) => j.fire()));

/** A small sheet with one text field — replaces prompt(). Resolves to the text or null. */
export function askText({ title, label = "", value = "", type = "text", ok = "Save", placeholder = "", inputmode = "" } = {}) {
  return new Promise((resolve) => {
    const dlg = document.createElement("dialog");
    dlg.className = "sheet";
    dlg.setAttribute("aria-label", title);
    dlg.innerHTML = `<form method="dialog">
      <div class="sheet-head"><h2>${esc(title)}</h2></div>
      ${label ? `<label for="ask-text-input">${esc(label)}</label>` : ""}
      <input id="ask-text-input" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}"
        ${inputmode ? `inputmode="${inputmode}"` : ""} ${type === "password" ? 'autocomplete="current-password"' : ""} enterkeyhint="done" />
      <div class="btn-row mt"><button type="button" class="btn-ghost" data-cancel>Cancel</button><button value="ok">${esc(ok)}</button></div>
    </form>`;
    document.body.appendChild(dlg);
    const input = dlg.querySelector("input");
    // Settle on submit/cancel directly; "close" (Escape, backdrop) is the fallback.
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
      if (dlg.open) dlg.close();
      setTimeout(() => dlg.remove(), 0);
    };
    dlg.querySelector("form").addEventListener("submit", () => done(input.value));
    dlg.querySelector("[data-cancel]").addEventListener("click", () => done(null));
    closeOnBackdrop(dlg);
    dlg.addEventListener("close", () => done(null));
    dlg.showModal();
    input.focus();
    input.select?.();
  });
}

export function closeOnBackdrop(dlg) {
  dlg.addEventListener("click", (e) => {
    if (e.target !== dlg) return;
    const r = dlg.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dlg.close();
  });
}

// --- Text ----------------------------------------------------------------------

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Decorative emoji: hidden from screen readers (VoiceOver reads ⚡ as "high voltage"). */
export const deco = (e) => `<span aria-hidden="true">${e}</span>`;

/** A quiet waiting state instead of a spinner. */
export const waiting = (text) => `<span class="waiting" role="status"><span class="pulse-dot" aria-hidden="true"></span>${esc(text)}</span>`;

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

/** "## " sections of an AI write-up: { intro, sections: [{ title, body }] }. */
export function splitSections(md) {
  const parts = String(md || "").split(/^## /m);
  const intro = parts.shift().trim();
  const sections = parts
    .map((s) => {
      const nl = s.indexOf("\n");
      return { title: (nl < 0 ? s : s.slice(0, nl)).trim(), body: nl < 0 ? "" : s.slice(nl + 1).trim() };
    })
    .filter((s) => s.title);
  return { intro, sections };
}

// Every output contract ends with its action; the reader shows it first.
const ACTION_FIRST = ["Try tomorrow", "Focus for next week", "What to try", "Questions for your doctor"];
const normTitle = (t) => t.toLowerCase().replace(/[^a-z ]/g, "").trim();
export const findAction = (sections) =>
  ACTION_FIRST.map((t) => sections.find((s) => normTitle(s.title) === normTitle(t))).find(Boolean) || null;

export const readingTime = (md) =>
  `${Math.max(1, Math.round(String(md || "").split(/\s+/).filter(Boolean).length / 200))} min read`;

const plain = (md) => String(md || "").replace(/[*_`>#]/g, "").replace(/^\s*(?:[-*]|\d+[.)])\s+/gm, "").replace(/\s+/g, " ").trim();
const peek = (md, n = 90) => {
  const t = plain(md);
  return t.length > n ? `${t.slice(0, n).replace(/\s\S*$/, "")}…` : t;
};

/**
 * Reader layout for AI text: the action section first as a highlighted card,
 * "Jump to" chips, and every other section collapsed to its heading (first open).
 * Call wireReader(container) after inserting it.
 */
export function renderReader(md, { idPrefix = "sec", openFirst = true, jump = true } = {}) {
  const { intro, sections } = splitSections(md);
  if (!sections.length) return `<div class="md">${renderMarkdown(md)}</div>`;
  const action = findAction(sections);
  const rest = sections.filter((s) => s !== action);
  const short = (t) => t.replace(/ & .*$/, "").replace(/ worth .*$/i, "");
  return `<div class="md">${intro ? renderMarkdown(intro) : ""}
    ${action ? `<section class="one-thing"><h3>${esc(action.title)}</h3>${renderMarkdown(action.body)}</section>` : ""}
    ${jump && rest.length > 2 ? `<nav class="jump" aria-label="Jump to a section">${rest
      .map((s, i) => `<button type="button" class="chip" data-jump="${idPrefix}-${i}">${esc(short(s.title))}</button>`).join("")}</nav>` : ""}
    ${rest.map((s, i) => `<details class="sec" id="${idPrefix}-${i}"${openFirst && i === 0 ? " open" : ""}>
        <summary><span>${esc(s.title)}<span class="peek">${esc(peek(s.body))}</span></span></summary>
        ${renderMarkdown(s.body)}</details>`).join("")}</div>`;
}

export function wireReader(root) {
  root.querySelectorAll("[data-jump]").forEach((b) =>
    b.addEventListener("click", () => {
      const d = root.querySelector(`#${b.dataset.jump}`);
      if (!d) return;
      d.open = true;
      d.scrollIntoView({ block: "start" });
      d.querySelector("summary")?.focus({ preventScroll: true });
    })
  );
}

// --- Dates ---------------------------------------------------------------------

export const todayISO = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/** Local "YYYY-MM-DDTHH:MM" (the value format of <input type="datetime-local">). */
export const localDateTime = (d = new Date()) =>
  `${todayISO(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** "2:10 pm" from a local "YYYY-MM-DDTHH:MM". */
export const fmtTime = (dt) =>
  dt ? new Date(dt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(" AM", " am").replace(" PM", " pm") : "";

export const addDays = (iso, n) => {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return todayISO(d);
};

export const fmtDate = (iso) =>
  new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

/** "8:20 am", "8:20 pm yesterday" or "Fri 8:20 pm". */
export function fmtWhen(dt) {
  if (!dt) return "";
  const day = dt.slice(0, 10);
  const today = todayISO();
  if (day === today) return fmtTime(dt);
  if (day === addDays(today, -1)) return `${fmtTime(dt)} yesterday`;
  return `${new Date(day + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" })} ${fmtTime(dt)}`;
}

export const DOW_NAMES = { 1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday", 6: "Saturday", 7: "Sunday" };

export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

// A page left open overnight still thinks it's yesterday: reload when the date
// changes; otherwise tell the page it's back so it can refresh its data.
const loadedOn = todayISO();
if (inBrowser) {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    if (todayISO() !== loadedOn) location.reload();
    else document.dispatchEvent(new CustomEvent("thor:resume"));
  });
}

/** Tell the current page something was logged elsewhere (e.g. from the ＋ sheet). */
export const announceChange = (what) => document.dispatchEvent(new CustomEvent("thor:changed", { detail: { what } }));

// --- Navigation ------------------------------------------------------------------

const ICONS = {
  today: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  health: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  thor: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  more: '<circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/>',
};
const icon = (k) =>
  `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg>`;

const TAB_OF = { index: "today", health: "health", labs: "health", profile: "health", chat: "thor", guides: "thor" };

export const HEALTH_SEGS = [["checkin", "Check-in", "health.html#checkin"], ["headaches", "Headaches", "health.html#headaches"], ["labs", "Labs", "labs.html"]];
export const THOR_SEGS = [["chat", "Chat", "chat.html"], ["library", "Library", "guides.html"]];
export const TRAINING_SEGS = [["lifting", "Lifting", "workouts.html"], ["running", "Running", "running.html"]];

/** Segmented links between sibling screens. */
export const segnav = (label, items, current) =>
  `<nav class="segnav" aria-label="${esc(label)}">${items
    .map(([key, text, href]) => `<a href="${href}" data-seg-link="${key}"${key === current ? ' aria-current="page"' : ""}>${text}</a>`)
    .join("")}</nav>`;

let ongoingPromise = null;
/** The headache in progress (or null), fetched once per page. */
export function ongoingHeadache({ fresh = false } = {}) {
  if (!ongoingPromise || fresh) ongoingPromise = api("/api/headaches/ongoing").then((r) => r.ongoing).catch(() => null);
  return ongoingPromise;
}

/** Low-glare palette while a headache is going. */
export const setLowGlare = (on) => document.body.classList.toggle("low-glare", Boolean(on));

export function openQuickAdd(view) {
  return import("./quickadd.js").then((m) => m.openQuickAdd(view)).catch((e) => toast(e, true));
}

let moreSheet = null;
function openMore() {
  if (!moreSheet) {
    moreSheet = document.createElement("dialog");
    moreSheet.className = "sheet";
    moreSheet.id = "more-sheet";
    moreSheet.setAttribute("aria-label", "More");
    const row = (href, title, meta) =>
      `<a href="${href}"><span><strong>${title}</strong><span class="meta">${meta}</span></span><span class="chev" aria-hidden="true">›</span></a>`;
    moreSheet.innerHTML = `
      <div class="sheet-head"><h2>More</h2><button type="button" class="sheet-close" data-close>Close</button></div>
      <nav class="sheet-list" aria-label="More pages">
        ${row("nutrition.html", "Food", "Meals, library, templates, targets")}
        ${row("workouts.html", "Training", "Lifting history, plan editor, runs, Strava")}
        ${row("trends.html", "Trends", "Every chart; roomier on a computer")}
        ${row("profile.html", "Profile &amp; meds", "About you, conditions, medications")}
        ${row("settings.html", "Settings", "Connections, goals, exports, AI models")}
      </nav>`;
    document.body.appendChild(moreSheet);
    moreSheet.querySelector("[data-close]").addEventListener("click", () => moreSheet.close());
    closeOnBackdrop(moreSheet);
    signOutLink().then((a) => {
      if (a) moreSheet.querySelector(".sheet-list").insertAdjacentHTML("beforeend",
        `<a href="/auth/logout"><span><strong>Sign out</strong><span class="meta">Microsoft account</span></span></a>`);
    });
  }
  moreSheet.showModal();
}

let mePromise = null;
const signOutLink = () => {
  // Public endpoint: never triggers a PIN prompt or redirect.
  mePromise ??= fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).catch(() => null)
    .then((me) => Boolean(me?.auth === "microsoft" && me.signed_in));
  return mePromise;
};

/** Render the shared navigation; `active` is the page key. */
export function renderNav(active) {
  // Top bar — 900px and wider.
  const pages = [
    ["index", "Today", "index.html"],
    ["health", "Health", "health.html"],
    ["labs", "Labs", "labs.html"],
    ["chat", "Thor", "chat.html"],
    ["guides", "Library", "guides.html"],
    ["nutrition", "Food", "nutrition.html"],
    ["training", "Training", "workouts.html"],
    ["trends", "Trends", "trends.html"],
  ];
  const activeKey = active === "workouts" || active === "running" ? "training" : active === "profile" ? "health" : active;
  const link = ([key, label, href]) =>
    `<a class="link${key === activeKey ? " active" : ""}" href="${href}"${key === activeKey ? ' aria-current="page"' : ""}>${label}</a>`;
  const nav = document.createElement("nav");
  nav.className = "nav";
  nav.setAttribute("aria-label", "Main");
  nav.innerHTML =
    `<a class="brand" href="index.html"><span class="bolt" aria-hidden="true">⚡</span><span class="brand-text">THOR</span></a>` +
    pages.map(link).join("") +
    `<button type="button" class="link add" data-quick-add aria-haspopup="dialog">＋ Log</button>` +
    `<span class="spacer"></span>` +
    link(["settings", "Settings", "settings.html"]);
  document.body.prepend(nav);
  signOutLink().then((yes) => {
    if (!yes) return;
    const a = document.createElement("a");
    a.className = "link";
    a.href = "/auth/logout";
    a.textContent = "Sign out";
    nav.appendChild(a);
  });

  // Bottom tab bar — phones.
  const tab = TAB_OF[active] || "more";
  const cur = (k) => (k === tab ? ' aria-current="page"' : "");
  const bar = document.createElement("nav");
  bar.className = "tabbar";
  bar.setAttribute("aria-label", "Main");
  bar.innerHTML = `
    <a href="index.html"${cur("today")}>${icon("today")}Today</a>
    <a href="health.html"${cur("health")}>${icon("health")}Health</a>
    <button type="button" class="add" data-quick-add aria-haspopup="dialog">${icon("add")}Log</button>
    <a href="chat.html"${cur("thor")}>${icon("thor")}Thor</a>
    <button type="button" class="more" aria-haspopup="dialog"${tab === "more" ? ' aria-current="page"' : ""}>${icon("more")}More</button>`;
  document.body.appendChild(bar);
  document.querySelectorAll("[data-quick-add]").forEach((b) => b.addEventListener("click", () => openQuickAdd()));
  bar.querySelector(".more").addEventListener("click", openMore);

  ongoingHeadache().then(setLowGlare);
  enhanceForms(document);
  new MutationObserver((records) => {
    for (const r of records) r.addedNodes.forEach((n) => { if (n.nodeType === 1) enhanceForms(n); });
  }).observe(document.body, { childList: true, subtree: true });
}

// Every number field gets the right keypad (iOS shows the full keyboard on
// type="number" alone), and a bare <label> is tied to the field after it.
let fieldSeq = 0;
function enhanceForms(root) {
  const nums = root.matches?.('input[type="number"]') ? [root] : [...root.querySelectorAll('input[type="number"]')];
  for (const i of nums) {
    if (!i.hasAttribute("inputmode")) {
      const step = i.getAttribute("step");
      i.setAttribute("inputmode", step && Number.isInteger(Number(step)) ? "numeric" : "decimal");
    }
    if (!i.hasAttribute("enterkeyhint")) i.setAttribute("enterkeyhint", "done");
  }
  for (const l of root.querySelectorAll?.("label:not([for])") || []) {
    if (l.querySelector("input, select, textarea")) continue;
    const next = l.nextElementSibling;
    if (!next || !/^(INPUT|SELECT|TEXTAREA)$/.test(next.tagName)) continue;
    if (!next.id) next.id = `field-${++fieldSeq}`;
    l.htmlFor = next.id;
  }
  // Decorative emoji in card titles stay out of screen readers.
  for (const s of root.querySelectorAll?.(".card h2 .accent") || []) s.setAttribute("aria-hidden", "true");
}

// --- Headache in progress: "Mark ended ▾" ------------------------------------------

/**
 * Render the "headache still going" banner into `box`, with Mark ended ▾
 * (Just now · 30 min ago · 1 h ago · Pick a time) and Add details.
 */
export function renderOngoing(box, ongoing, { onChange } = {}) {
  if (!ongoing) {
    box.innerHTML = "";
    return;
  }
  const ago = (min) => localDateTime(new Date(Date.now() - min * 60_000));
  const start = ongoing.started_at;
  const choice = (min, label) =>
    `<button type="button" class="chip" data-ago="${min}"${start && ago(min) < start ? " disabled" : ""}>${label}</button>`;
  box.innerHTML = `<div class="banner blue ongoing">
    <div class="head"><strong>Headache since ${esc(fmtWhen(start) || fmtDate(ongoing.date))}</strong>
      <span>${ongoing.peak_severity != null ? `Worst ${ongoing.peak_severity}/10 · ` : ""}still going?</span></div>
    <div class="btn-row">
      <button type="button" class="btn-sm" data-end-toggle aria-expanded="false">Mark ended ▾</button>
      <a class="btn btn-ghost btn-sm" href="health.html?edit=${encodeURIComponent(ongoing.id)}#headaches">Add details</a>
    </div>
    <div class="end-menu" hidden>
      ${choice(0, "Just now")}${choice(30, "30 min ago")}${choice(60, "1 h ago")}
      <button type="button" class="chip" data-pick>Pick a time</button>
      <div class="row" data-pick-row hidden style="width:100%">
        <div><label for="end-at-${ongoing.id}">Ended at</label><input type="datetime-local" id="end-at-${ongoing.id}" min="${esc(start || "")}" max="${ago(0)}" value="${ago(0)}" /></div>
        <button type="button" class="fit" data-pick-save>Save</button>
      </div>
    </div></div>`;
  const menu = box.querySelector(".end-menu");
  const toggle = box.querySelector("[data-end-toggle]");
  toggle.addEventListener("click", () => {
    menu.hidden = !menu.hidden;
    toggle.setAttribute("aria-expanded", String(!menu.hidden));
  });
  const end = async (endedAt) => {
    try {
      await api(`/api/headaches/${ongoing.id}`, { method: "PATCH", body: { ended_at: endedAt } });
      toast(`Headache marked as ended at ${fmtTime(endedAt)}`);
      setLowGlare(false);
      ongoingHeadache({ fresh: true });
      onChange?.();
    } catch (err) {
      toast(err, true);
    }
  };
  box.querySelectorAll("[data-ago]").forEach((b) => b.addEventListener("click", () => end(ago(Number(b.dataset.ago)))));
  box.querySelector("[data-pick]").addEventListener("click", () => {
    box.querySelector("[data-pick-row]").hidden = false;
    box.querySelector("[data-pick-row] input").focus();
  });
  box.querySelector("[data-pick-save]").addEventListener("click", () => {
    const v = box.querySelector("[data-pick-row] input").value;
    if (v) end(v);
  });
}

// --- ••• menus -----------------------------------------------------------------------

/** items: [{ act, label, danger? }] — wire with wireMenu(root, { act: fn }). */
export const menuButton = (label, items) => `<div class="menu-wrap">
  <button type="button" class="menu-btn" aria-haspopup="true" aria-expanded="false" aria-label="${esc(label)}">•••</button>
  <div class="menu" role="menu" hidden>${items
    .map((i) => `<button type="button" role="menuitem" data-act="${i.act}"${i.danger ? ' class="danger"' : ""}>${esc(i.label)}</button>`)
    .join("")}</div></div>`;

export function wireMenu(root, handlers) {
  const btn = root.querySelector(".menu-btn");
  const menu = root.querySelector(".menu");
  if (!btn || !menu) return;
  const close = () => {
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    document.removeEventListener("click", outside, true);
  };
  const outside = (e) => { if (!root.querySelector(".menu-wrap").contains(e.target)) close(); };
  btn.addEventListener("click", () => {
    const open = menu.hidden;
    menu.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    if (open) {
      document.addEventListener("click", outside, true);
      menu.querySelector("button")?.focus();
    }
  });
  menu.addEventListener("keydown", (e) => { if (e.key === "Escape") { close(); btn.focus(); } });
  menu.querySelectorAll("[data-act]").forEach((b) =>
    b.addEventListener("click", () => {
      close();
      handlers[b.dataset.act]?.();
    })
  );
}

// --- Images --------------------------------------------------------------------------

/** Shrink phone photos before upload (long edge ≤ maxEdge, JPEG). Non-images pass through. */
export async function shrinkImage(file, maxEdge = 2000) {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
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

// --- Charts ----------------------------------------------------------------------------

/**
 * Zero-dep SVG bar chart. data: [{label, value, value2?}] — value2 renders as a
 * thin overlay line (e.g. a target). Returns an HTML string.
 */
export function chartBars(data, { height = 140, unit = "", color = "var(--accent)", targetColor = "var(--muted-2)" } = {}) {
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
      ? `<text x="${i * bw + bw / 2}%" y="${height - 4}" font-size="9" fill="var(--muted-2)" text-anchor="middle">${esc(d.label)}</text>`
      : ""
  ).join("");
  return `<svg width="100%" height="${height}" style="overflow:visible" role="img" aria-label="Bar chart">${bars}${labels}</svg>`;
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
  return `<svg viewBox="0 0 ${W} ${height - 18}" width="100%" height="${height - 18}" preserveAspectRatio="none" style="overflow:visible" role="img" aria-label="Trend from ${esc(first.label)} to ${esc(lastP.label)}">
    ${bandSvg}<path d="${path}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>${dots}
  </svg>
  <div class="chart-labels"><span>${esc(first.label)}</span><span>${points.length > 1 ? esc(lastP.label) : ""}</span></div>`;
}

const tickNum = (v) => String(Math.round(v * 100) / 100);

/**
 * A lab value on its reference range: a visible track, the normal band, tick
 * marks with the range numbers, and a ringed dot for the value. Handles
 * one-sided ranges ("<100", ">39").
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
  const tick = (v) => v == null ? "" :
    `<span class="rb-tick" style="left:${pct(v)}%"></span><span class="rb-tick-label" style="left:${pct(v)}%">${tickNum(v)}</span>`;
  const range = low != null && high != null ? `${tickNum(low)} to ${tickNum(high)}` : high != null ? `under ${tickNum(high)}` : `over ${tickNum(low)}`;
  return `<span class="rb" role="img" aria-label="Normal range ${range}">
    <span class="rb-band" style="left:${bandL}%;width:${Math.max(0, bandR - bandL)}%"></span>
    ${tick(low)}${tick(high)}
    <span class="rb-dot ${cls}" style="left:${pct(value)}%"></span></span>`;
}

/** Macro progress bar HTML. `max` semantics: 'target' (reach it) or 'limit' (stay under). */
export function bar(label, value, max, unit, kind = "target") {
  const v = Number(value) || 0;
  const m = Number(max) || 0;
  const pct = m > 0 ? Math.min(100, (v / m) * 100) : 0;
  let cls = "";
  if (kind === "limit") cls = v > m && m > 0 ? "over" : "good";
  else cls = m > 0 && v >= m ? "good" : "";
  const note = kind === "limit" && m > 0 && v > m ? " · over" : kind === "target" && m > 0 && v >= m ? " · ✓" : "";
  return `<div class="bar-wrap">
    <div class="bar-head"><span>${esc(label)}</span><span class="val">${Math.round(v)}${m ? ` / ${Math.round(m)}` : ""} ${unit}${note}</span></div>
    <div class="bar"><span class="${cls}" style="width:${pct}%"></span></div>
  </div>`;
}

// --- Home-screen app ---------------------------------------------------------------

if (inBrowser && "serviceWorker" in navigator && window.isSecureContext) {
  addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
