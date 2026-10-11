// Minimal HTTP router + static file server on top of node:http. No dependencies.
import http from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".pdf": "application/pdf",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const sha = (s) => createHash("sha256").update(String(s)).digest();
const pinMatches = (given, expected) => timingSafeEqual(sha(given), sha(expected));

export function createApp({ staticDir, pin = "", auth = null }) {
  const routes = [];

  /**
   * opts.raw: hand the handler the request body as a Buffer (file uploads)
   * instead of parsed JSON; opts.maxBytes caps it (default: the JSON cap).
   */
  function add(method, pattern, handler, opts = {}) {
    const keys = [];
    const regex = new RegExp(
      "^" +
        pattern.replace(/:[^/]+/g, (m) => {
          keys.push(m.slice(1));
          return "([^/]+)";
        }) +
        "/?$"
    );
    routes.push({ method, regex, keys, handler, opts });
  }

  const app = {
    get: (p, h, o) => add("GET", p, h, o),
    post: (p, h, o) => add("POST", p, h, o),
    put: (p, h, o) => add("PUT", p, h, o),
    patch: (p, h, o) => add("PATCH", p, h, o),
    delete: (p, h, o) => add("DELETE", p, h, o),
    listen: (port, host, cb) => server.listen(port, host, cb),
  };

  const MAX_BODY = 1024 * 1024; // 1 MB

  async function readRaw(req, limit) {
    const tooBig = () => new HttpError(413, `File too large (max ${Math.round(limit / 1048576)} MB)`);
    if (Number(req.headers["content-length"] || 0) > limit) throw tooBig();
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) throw tooBig();
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async function readBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY) throw new HttpError(413, "Request body too large");
      chunks.push(chunk);
    }
    if (!chunks.length) return {};
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
    } catch {
      throw new HttpError(400, "Invalid JSON body");
    }
  }

  async function serveStatic(res, urlPath) {
    let rel = decodeURIComponent(urlPath);
    if (rel === "/") rel = "/index.html";
    const file = path.join(staticDir, path.normalize(rel));
    if (!file.startsWith(staticDir)) return false;
    try {
      const st = await stat(file);
      if (!st.isFile()) return false;
      const data = await readFile(file);
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
      res.end(data);
      return true;
    } catch {
      return false;
    }
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    // Browsers only honor HSTS over TLS, so this is inert for plain-http LAN use.
    res.setHeader("Strict-Transport-Security", "max-age=31536000");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self'"
    );
    try {
      // API gate: a Microsoft session cookie or the shared PIN, whichever is
      // configured (both count when both are). /api/health stays open for
      // uptime checks; /api/auth/me is what the UI asks *whether* to sign in.
      const OPEN_API = url.pathname === "/api/health" || url.pathname === "/api/auth/me";
      if ((pin || auth?.enabled) && url.pathname.startsWith("/api/") && !OPEN_API) {
        const sessionOk = auth?.enabled ? Boolean(auth.getSession(req)) : false;
        const pinOk = pin ? pinMatches(req.headers["x-thor-pin"] || "", pin) : false;
        if (!sessionOk && !pinOk) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify(auth?.enabled ? { error: "Sign-in required", login: "/auth/login" } : { error: "PIN required" })
          );
          return;
        }
      }
      // Page gate: with sign-in active, HTML navigations go to the login page
      // until there's a session (assets stay open — they contain no data).
      if (
        auth?.enabled &&
        req.method === "GET" &&
        (url.pathname === "/" || url.pathname.endsWith(".html")) &&
        url.pathname !== "/login.html" &&
        !auth.getSession(req)
      ) {
        res.writeHead(302, { Location: `/login.html?next=${encodeURIComponent(url.pathname + url.search)}` });
        res.end();
        return;
      }
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = url.pathname.match(r.regex);
        if (!m) continue;
        const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        const query = Object.fromEntries(url.searchParams);
        const hasBody = ["POST", "PUT", "PATCH"].includes(req.method);
        const body = !hasBody ? {} : r.opts.raw ? await readRaw(req, r.opts.maxBytes ?? MAX_BODY) : await readBody(req);
        const result = await r.handler({ req, res, params, query, body });
        // Handlers that wrote their own response (files, CSV, redirects) are done.
        if (!res.headersSent) {
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify(result ?? { ok: true }));
        } else if (!res.writableEnded) {
          res.end();
        }
        return;
      }
      if (req.method === "GET" && (await serveStatic(res, url.pathname))) return;
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(`[${req.method} ${url.pathname}]`, err);
      if (!res.headersSent) {
        // An oversized upload may still be streaming in; don't keep reading it.
        const headers = { "Content-Type": "application/json" };
        if (status === 413) headers.Connection = "close";
        res.writeHead(status, headers);
        res.end(JSON.stringify({ error: err.message || "Internal error" }));
      } else {
        res.destroy();
      }
    }
  });

  return app;
}
