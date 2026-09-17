import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let i = 0; i < 8; i += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function png(size, paint) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * stride;
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = paint(x, y, size);
      const i = row + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function paintPin(x, y, s) {
  const bg = [0, 51, 160, 255];
  const pin = [255, 255, 255, 255];
  const hole = [0, 51, 160, 255];
  const cx = s / 2;
  const cy = s * 0.4;
  const r = s * 0.22;
  const holeR = s * 0.08;
  const dx = x - cx;
  const dy = y - cy;
  if (dx * dx + dy * dy <= holeR * holeR) return hole;
  if (dx * dx + dy * dy <= r * r) return pin;

  const tipY = s * 0.78;
  const half = r * 0.92;
  if (y >= cy && y <= tipY) {
    const t = (y - cy) / (tipY - cy);
    const width = half * (1 - t);
    if (Math.abs(x - cx) <= width) return pin;
  }
  return bg;
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "icon-192.png"), png(192, paintPin));
writeFileSync(join(outDir, "icon-512.png"), png(512, paintPin));
writeFileSync(join(outDir, "apple-touch-icon.png"), png(180, paintPin));
console.log("Wrote icons to", outDir);
