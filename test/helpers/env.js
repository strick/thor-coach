// Boots Thor against a throwaway database with the LLM stubbed out.
//
// Every test file must get src/ modules through this helper (dynamic imports
// after the env is set) — src/db.js opens the database at import time, and
// THOR_TEST=1 makes it refuse to start without a scratch THOR_DB_PATH and
// THOR_BACKUP_MIRROR. Tests never import server.js, so the boot-time backup
// (which mirrors to /mnt/g) never runs.
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { startLLMStub } from "./llmStub.js";

const SCRUB = [
  "OPENAI_API_KEY", "OPENAI_MODEL", "OPENAI_ADVICE_MODEL", "OLLAMA_MODEL", "OLLAMA_ADVICE_MODEL",
  "THOR_PIN", "MS_CLIENT_ID", "MS_CLIENT_SECRET", "THOR_ALLOWED_EMAILS",
  "STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET", "STRAVA_REFRESH_TOKEN", "THOR_SQLITE_JOURNAL",
];

/**
 * @param {{ env?: Record<string,string> }} [opts] extra env (e.g. OPENAI_API_KEY to
 *   exercise the OpenAI path against the stub, or THOR_PIN).
 */
export async function setupTestEnv({ env = {} } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "thor-test-"));
  const stub = await startLLMStub();

  for (const k of SCRUB) delete process.env[k];
  Object.assign(process.env, {
    THOR_TEST: "1",
    THOR_DB_PATH: path.join(dir, "t.db"),
    // Grandparent doesn't exist, so mirrorBackup() is a no-op.
    THOR_BACKUP_MIRROR: path.join(dir, "no-mount", "backups", "thor"),
    LLM_PROVIDER: "ollama",
    OLLAMA_URL: stub.url,
    OPENAI_BASE_URL: `${stub.url}/v1`,
    TZ: "America/New_York",
    ...env,
  });

  const dbModule = await import("../../src/db.js");
  dbModule.ensureSchemaAndSeed();
  const llm = await import("../../src/llm.js");
  llm.initLLMConfig();
  const { createThorApp } = await import("../../src/app.js");
  const app = createThorApp({ pin: process.env.THOR_PIN || "" });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  /** fetch wrapper: JSON-encodes plain-object bodies, returns { status, headers, json, text, buffer }. */
  async function request(urlPath, { method = "GET", body, headers = {} } = {}) {
    const opts = { method, headers: { ...headers } };
    if (body !== undefined) {
      if (typeof body === "string" || body instanceof Uint8Array || body instanceof ArrayBuffer) {
        opts.body = body;
      } else {
        opts.body = JSON.stringify(body);
        opts.headers["Content-Type"] = "application/json";
      }
    }
    const resp = await fetch(base + urlPath, opts);
    const buffer = Buffer.from(await resp.arrayBuffer());
    const text = buffer.toString("utf-8");
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: resp.status, headers: resp.headers, json, text, buffer };
  }

  async function close() {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    await stub.close();
    try {
      dbModule.db.close();
    } catch {}
    rmSync(dir, { recursive: true, force: true });
  }

  return { dir, base, request, stub, db: dbModule.db, close };
}
