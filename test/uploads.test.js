// Raw-body uploads and file downloads through the router (PIN-protected app).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { setupTestEnv } from "./helpers/env.js";

const env = await setupTestEnv({ env: { THOR_PIN: "4321" } });
after(() => env.close());
const PIN = { "X-Thor-Pin": "4321" };
const PDF = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from("fake lab report body ✓")]);

async function newReport() {
  const r = await env.request("/api/labs/reports", { method: "POST", body: { source: "upload" }, headers: PIN });
  assert.equal(r.status, 200);
  return r.json.id;
}
const uploadTo = (id, buf, headers = {}) =>
  env.request(`/api/labs/reports/${id}/files`, { method: "POST", body: buf, headers: { ...PIN, "Content-Type": "application/pdf", ...headers } });

test("PIN gate still applies to uploads", async () => {
  const id = await newReport();
  const r = await env.request(`/api/labs/reports/${id}/files`, { method: "POST", body: PDF, headers: { "Content-Type": "application/pdf" } });
  assert.equal(r.status, 401);
});

test("PDF upload is stored under the data dir and downloads byte-for-byte", async () => {
  const id = await newReport();
  const up = await uploadTo(id, PDF, { "X-Filename": encodeURIComponent("Quest résults.pdf") });
  assert.equal(up.status, 200);
  assert.equal(up.json.file.mime_type, "application/pdf");
  assert.equal(up.json.file.original_filename, "Quest résults.pdf");
  assert.equal(up.json.duplicate_of, null);

  const stored = env.db.prepare("SELECT stored_name FROM lab_report_files WHERE id = ?").get(up.json.file.id).stored_name;
  const onDisk = path.join(env.dir, "uploads", "labs", stored);
  assert.ok(existsSync(onDisk));
  assert.deepEqual(readFileSync(onDisk), PDF);

  const dl = await env.request(`/api/labs/files/${up.json.file.id}`, { headers: PIN });
  assert.equal(dl.status, 200);
  assert.equal(dl.headers.get("content-type"), "application/pdf");
  assert.match(dl.headers.get("content-disposition"), /^attachment; filename="Quest r_sults.pdf"; filename\*=UTF-8''Quest%20r%C3%A9sults\.pdf$/);
  assert.equal(dl.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(dl.buffer, PDF);

  const report = (await env.request(`/api/labs/reports/${id}`, { headers: PIN })).json;
  assert.equal(report.files.length, 1);
  assert.equal(report.source, "upload");
});

test("file type comes from the bytes, not the Content-Type", async () => {
  const id = await newReport();
  const notPdf = await uploadTo(id, Buffer.from("MZ this is an exe"));
  assert.equal(notPdf.status, 415);
  const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(20)]);
  const h = await uploadTo(id, heic, { "Content-Type": "image/heic" });
  assert.equal(h.status, 415);
  assert.match(h.json.error, /HEIC/);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]);
  const p = await uploadTo(id, png, { "Content-Type": "application/octet-stream" });
  assert.equal(p.status, 200);
  assert.equal(p.json.file.mime_type, "image/png");
});

test("an oversized upload is refused from its Content-Length, before the body is read", async () => {
  const id = await newReport();
  const { status, connection } = await new Promise((resolve, reject) => {
    const req = http.request(
      `${env.base}/api/labs/reports/${id}/files`,
      { method: "POST", headers: { ...PIN, "Content-Type": "application/pdf", "Content-Length": 16 * 1024 * 1024 } },
      (res) => {
        res.resume();
        resolve({ status: res.statusCode, connection: res.headers.connection });
        req.destroy();
      }
    );
    req.on("error", (e) => (e.code === "ECONNRESET" || e.code === "EPIPE" ? null : reject(e)));
    req.write(Buffer.from("%PDF-1.4\n")); // only a few bytes of the promised 16 MB
  });
  assert.equal(status, 413);
  assert.equal(connection, "close");
});

test("can't add files to a confirmed report; drafts can drop a file", async () => {
  const id = await newReport();
  const up = await uploadTo(id, PDF);
  assert.equal((await env.request(`/api/labs/files/${up.json.file.id}`, { method: "DELETE", headers: PIN })).status, 200);
  await env.request(`/api/labs/reports/${id}`, {
    method: "PUT", headers: PIN,
    body: { collected_on: "2026-09-01", results: [{ name_on_report: "LDL", value: 100, unit: "mg/dL" }], confirm: true },
  });
  assert.equal((await uploadTo(id, PDF)).status, 409);
});

test("re-uploading a file from a confirmed report is flagged as a duplicate", async () => {
  const first = await newReport();
  const same = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.from("duplicate me")]);
  await uploadTo(first, same);
  await env.request(`/api/labs/reports/${first}`, {
    method: "PUT", headers: PIN,
    body: { collected_on: "2026-08-01", results: [{ name_on_report: "HDL", value: 50, unit: "mg/dL" }], confirm: true },
  });
  const second = await newReport();
  const r = await uploadTo(second, same);
  assert.equal(r.status, 200);
  assert.equal(r.json.duplicate_of.id, first);
});
