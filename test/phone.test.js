// Backend support for the phone-first UI: care alerts that stay until dismissed,
// critical counts, inline lab files, pattern minimums, chat receipts, barcode
// photos, and the home-screen files.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { setupTestEnv } from "./helpers/env.js";

const env = await setupTestEnv();
after(() => env.close());
const { todayISO } = await import("../src/config.js");

test("a headache with warning signs stays on Today until dismissed", async () => {
  const h = (await env.request("/api/headaches", {
    method: "POST",
    body: { started_at: `${todayISO()}T09:00`, peak_severity: 9, red_flags: ["thunderclap"] },
  })).json;
  let { alerts } = (await env.request("/api/alerts")).json;
  const a = alerts.find((x) => x.key === `headache:${h.id}`);
  assert.ok(a, "alert listed");
  assert.equal(a.kind, "headache_red_flags");
  assert.match(a.message, /get medical care now/);
  assert.deepEqual(a.items, ["Sudden, severe onset — the worst headache of my life"]);

  const d = await env.request("/api/alerts/dismiss", { method: "POST", body: { key: a.key } });
  assert.equal(d.status, 200);
  ({ alerts } = (await env.request("/api/alerts")).json);
  assert.ok(!alerts.some((x) => x.key === a.key), "dismissed alert is gone");

  const bad = await env.request("/api/alerts/dismiss", { method: "POST", body: { key: "nope; drop table" } });
  assert.equal(bad.status, 400);
});

test("headaches without warning signs, or older than three days, raise no alert", async () => {
  await env.request("/api/headaches", { method: "POST", body: { started_at: `${todayISO()}T07:00`, peak_severity: 4 } });
  const old = new Date();
  old.setDate(old.getDate() - 5);
  await env.request("/api/headaches", { method: "POST", body: { date: todayISO(old), red_flags: ["head_injury"] } });
  const { alerts } = (await env.request("/api/alerts")).json;
  assert.equal(alerts.filter((x) => x.kind === "headache_red_flags").length, 0);
});

let labId;
test("critical lab values: listed first, counted, and kept on Today until acknowledged", async () => {
  labId = (await env.request("/api/labs/reports", { method: "POST", body: { source: "manual" } })).json.id;
  const saved = await env.request(`/api/labs/reports/${labId}`, {
    method: "PUT",
    body: {
      collected_on: todayISO(),
      results: [
        { name_on_report: "Mystery", value: 3 },
        { name_on_report: "Potassium", marker_key: "potassium", value: 6.8, unit: "mmol/L", ref_low: 3.5, ref_high: 5.1 },
      ],
      confirm: false,
    },
  });
  assert.equal(saved.status, 200, saved.text);
  assert.match(saved.json.warnings[0], /^Critical value: Potassium 6.8/, "the critical warning comes first");

  const list = (await env.request("/api/labs/reports")).json;
  assert.equal(list.find((r) => r.id === labId).critical, 1);

  const { alerts } = (await env.request("/api/alerts")).json;
  const a = alerts.find((x) => x.key === `lab:${labId}`);
  assert.ok(a, "critical lab alert listed");
  assert.equal(a.title, "Critical result: contact your doctor");
  assert.match(a.message, /Potassium 6\.8 mmol\/L/);
  assert.equal(a.dismiss_label, "I've contacted my doctor");

  await env.request("/api/alerts/dismiss", { method: "POST", body: { key: a.key } });
  assert.ok(!(await env.request("/api/alerts")).json.alerts.some((x) => x.key === a.key));
});

test("lab files open inline on request, and download otherwise", async () => {
  const id = (await env.request("/api/labs/reports", { method: "POST", body: { source: "upload" } })).json.id;
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
  const up = (await env.request(`/api/labs/reports/${id}/files`, { method: "POST", body: jpeg, headers: { "Content-Type": "image/jpeg" } })).json;
  const inline = await env.request(`/api/labs/files/${up.file.id}?inline=1`);
  assert.equal(inline.status, 200);
  assert.match(inline.headers.get("content-disposition"), /^inline;/);
  assert.equal(inline.headers.get("content-type"), "image/jpeg");
  const dl = await env.request(`/api/labs/files/${up.file.id}`);
  assert.match(dl.headers.get("content-disposition"), /^attachment;/);
});

test("pattern insights say what each factor still needs", async () => {
  const r = (await env.request("/api/headache-insights?days=90")).json;
  assert.deepEqual(r.minimums, { exposed_days: 5, unexposed_days: 5, headache_days: 3 });
});

test("chat keeps the arguments of logging tools for receipts, not of lookups", async () => {
  env.stub.reset();
  env.stub.replyToolCalls([
    { name: "log_water", args: { delta: 1 } },
    { name: "get_water", args: {} },
  ]);
  env.stub.reply("Added a glass.");
  const r = await env.request("/api/chat", { method: "POST", body: { message: "log a glass of water" } });
  assert.equal(r.status, 200, r.text);
  const { messages } = (await env.request("/api/chat/history")).json;
  const last = messages.at(-1);
  assert.equal(last.role, "assistant");
  const byName = Object.fromEntries(last.tool_calls.map((c) => [c.name, c]));
  assert.deepEqual(byName.log_water.args, { delta: 1 });
  assert.equal(byName.get_water.args, undefined);
});

test("barcode photos: non-images are refused; unreadable digits say so", async () => {
  const notImage = await env.request("/api/foods/barcode-photo", { method: "POST", body: Buffer.from("hello"), headers: { "Content-Type": "image/jpeg" } });
  assert.equal(notImage.status, 400);

  env.stub.reset();
  env.stub.replyJSON({ digits: null });
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
  const r = await env.request("/api/foods/barcode-photo", { method: "POST", body: png, headers: { "Content-Type": "image/png" } });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json, { found: false, code: null, unreadable: true });
  const parts = env.stub.last.messages[1].content;
  assert.equal(parts[1].type, "image_url");
  assert.match(parts[1].image_url.url, /^data:image\/png;base64,/);
});

test("home-screen files are served with the right types", async () => {
  const m = await env.request("/manifest.webmanifest");
  assert.equal(m.status, 200);
  assert.match(m.headers.get("content-type"), /application\/manifest\+json/);
  assert.equal(m.json.display, "standalone");
  const sw = await env.request("/sw.js");
  assert.match(sw.headers.get("content-type"), /javascript/);
  for (const icon of ["apple-touch-icon.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png"]) {
    const r = await env.request(`/icons/${icon}`);
    assert.equal(r.status, 200, icon);
    assert.equal(r.headers.get("content-type"), "image/png");
  }
});

test("the reader puts the action section first", async () => {
  const { renderReader, splitSections, findAction } = await import("../public/js/ui.js");
  const md = "## Today at a glance\nA steady day.\n\n## Wins\n- Trained\n\n## Try tomorrow\n1. Lights-out by 10:30.";
  assert.equal(findAction(splitSections(md).sections).title, "Try tomorrow");
  const html = renderReader(md);
  assert.ok(html.indexOf("one-thing") < html.indexOf("Today at a glance"), "action card renders before the other sections");
  assert.match(html, /<details class="sec" id="sec-0" open>/);
});
