// Patterns must not count days before you started using Thor as "no headache" days.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { setupTestEnv } from "./helpers/env.js";

const env = await setupTestEnv();
after(() => env.close());
const { todayISO } = await import("../src/config.js");
const { addDays } = await import("../src/util.js");
const today = todayISO();

test("analysis window starts at the first logged day", async () => {
  for (let i = 0; i < 10; i += 1) {
    await env.request("/api/checkins", { method: "PUT", body: { date: addDays(today, -i), sleep_hours: 7 } });
  }
  const r = (await env.request("/api/headache-insights?days=90")).json;
  assert.equal(r.window.start, addDays(today, -9));
  assert.equal(r.coverage.days, 10);
  assert.equal(r.coverage.headache_days, 0);
});

test("headache context is absent until a headache is ever logged", async () => {
  const { buildHealthContext } = await import("../src/services/healthContext.js");
  assert.equal(buildHealthContext({ sections: ["headaches_90d"] }).headaches_90d, undefined);
  assert.match(buildHealthContext({ sections: ["checkins_14d"] }).checkins_14d.days_checked_in, /10 of 14/);
});
