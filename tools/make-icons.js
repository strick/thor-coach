// Draws the home-screen icons (a gold bolt on Thor's background) as PNGs with
// no dependencies: a supersampled polygon fill + a minimal PNG encoder.
//   node tools/make-icons.js   → public/icons/*.png
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), "public", "icons");
const BG = [0x0b, 0x0f, 0x17];
const BOLT = [0xff, 0xb0, 0x2e];
// The bolt, in a unit box.
const SHAPE = [[0.6, 0.04], [0.2, 0.55], [0.46, 0.55], [0.38, 0.96], [0.8, 0.42], [0.54, 0.42], [0.66, 0.04]];

function inside(x, y, pts) {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** size px square; scale = share of the side the bolt's box takes (padding for maskable). */
function draw(size, scale) {
  const off = (1 - scale) / 2;
  const pts = SHAPE.map(([x, y]) => [(off + x * scale) * size, (off + y * scale) * size]);
  const SS = 4;
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3); // filter byte 0 + RGB
    for (let x = 0; x < size; x++) {
      let cover = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        if (inside(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS, pts)) cover++;
      }
      const a = cover / (SS * SS);
      for (let c = 0; c < 3; c++) row[1 + x * 3 + c] = Math.round(BG[c] * (1 - a) + BOLT[c] * a);
    }
    rows.push(row);
  }
  return png(size, size, Buffer.concat(rows));
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(w, h, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor RGB, no alpha (iOS wants opaque touch icons)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
const icons = [
  ["apple-touch-icon.png", 180, 0.68],
  ["icon-192.png", 192, 0.72],
  ["icon-512.png", 512, 0.72],
  ["icon-maskable-512.png", 512, 0.54], // inside the maskable safe zone
];
for (const [name, size, scale] of icons) {
  writeFileSync(path.join(OUT, name), draw(size, scale));
  console.log(`wrote public/icons/${name}`);
}
