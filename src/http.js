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

export function createApp({ staticDir, pin = "" }) {
  const routes = [];

  function add(method, pattern, handler) {
    const keys = [];
    const regex = new RegExp(
      "^" +
        pattern.replace(/:[^/]+/g, (m) => {
          keys.push(m.slice(1));
          return "([^/]+)";
        }) +
        "/?$"
    );
    routes.push({ method, regex, keys, handler });
  }

  const app = {
    get: (p, h) => add("GET", p, h),
    post: (p, h) => add("POST", p, h),
    put: (p, h) => add("PUT", p, h),
    patch: (p, h) => add("PATCH", p, h),
    delete: (p, h) => add("DELETE", p, h),
    listen: (port, host, cb) => server.listen(port, host, cb),
  };

  const MAX_BODY = 1024 * 1024; // 1 MB

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
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self'"
    );
    try {
      // Shared-PIN gate for the API (static pages stay open; data does not).
      if (pin && url.pathname.startsWith("/api/") && url.pathname !== "/api/health") {
        if (!pinMatches(req.headers["x-thor-pin"] || "", pin)) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "PIN required" }));
          return;
        }
      }
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = url.pathname.match(r.regex);
        if (!m) continue;
        const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        const query = Object.fromEntries(url.searchParams);
        const body = ["POST", "PUT", "PATCH"].includes(req.method) ? await readBody(req) : {};
        const result = await r.handler({ req, res, params, query, body });
        if (!res.writableEnded) {
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify(result ?? { ok: true }));
        }
        return;
      }
      if (req.method === "GET" && (await serveStatic(res, url.pathname))) return;
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(`[${req.method} ${url.pathname}]`, err);
      if (!res.writableEnded) {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message || "Internal error" }));
      }
    }
  });

  return app;
}
