// Guards the "health pal" voice: none of the old drill-sergeant framing may
// creep back into prompts or UI copy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BANNED = /Goggins|James Cameron|Doing Wrong|earn it|long-distance running|Tell him|go get it|step on the scale|time to push/i;

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(js|html|css)$/.test(name)) yield p;
  }
}

test("no drill-sergeant copy in src/ or public/", () => {
  const hits = [];
  for (const dir of ["src", "public"]) {
    for (const file of files(path.join(root, dir))) {
      readFileSync(file, "utf-8").split("\n").forEach((line, i) => {
        if (BANNED.test(line)) hits.push(`${path.relative(root, file)}:${i + 1}: ${line.trim()}`);
      });
    }
  }
  assert.deepEqual(hits, []);
});
