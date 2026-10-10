import { test, after } from "node:test";
import assert from "node:assert/strict";
import { setupTestEnv } from "./helpers/env.js";

const env = await setupTestEnv();
after(() => env.close());

test("schema + seeds are idempotent across boots", async () => {
  const { ensureSchemaAndSeed } = await import("../src/db.js");
  const count = () => env.db.prepare("SELECT COUNT(*) AS n FROM exercises").get().n;
  const before = count();
  ensureSchemaAndSeed();
  ensureSchemaAndSeed();
  assert.equal(count(), before);
  assert.equal(env.db.prepare("SELECT COUNT(*) AS n FROM users").get().n, 1);
  assert.equal(env.db.prepare("SELECT COUNT(*) AS n FROM health_profile").get().n, 1);
});

test("health endpoint responds", async () => {
  const r = await env.request("/api/health");
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
});

test("JSON bodies still parse", async () => {
  const r = await env.request("/api/body", { method: "PUT", body: { date: "2026-01-02", weight_lbs: 190 } });
  assert.equal(r.status, 200);
  assert.equal(r.json.weight_lbs, 190);
});

test("JSON bodies over 1 MB are rejected", async () => {
  const big = JSON.stringify({ notes: "x".repeat(1024 * 1024 + 10) });
  let status;
  try {
    status = (await env.request("/api/body", { method: "PUT", body: big, headers: { "Content-Type": "application/json" } })).status;
  } catch {
    status = 413; // the server may close the socket before the client finishes sending
  }
  assert.equal(status, 413);
});

test("export includes every table", async () => {
  const r = await env.request("/api/export");
  assert.equal(r.status, 200);
  const exported = new Set(Object.keys(r.json.tables));
  const skip = new Set(["app_settings", "strava_sync_runs", "food_logs"]); // secrets / ops logs / dead legacy table
  const tables = env.db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((t) => t.name)
    .filter((t) => !skip.has(t));
  for (const t of tables) assert.ok(exported.has(t), `export is missing table ${t}`);
});

test("markdown renderer is importable outside the browser", async () => {
  const { renderMarkdown } = await import("../public/js/ui.js");
  assert.match(renderMarkdown("## Hi\n- one"), /<h2>Hi<\/h2>/);
});
