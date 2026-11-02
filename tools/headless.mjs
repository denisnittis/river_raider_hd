// Headless runner: node tools/headless.mjs <frames> <out.png> [script]
// script: comma list of "frame:key" presses, e.g. "60:reset,200:fire"
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Atari2600 } from '../js/atari.js';
import { PALETTE } from '../js/palette.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const rom = new Uint8Array(fs.readFileSync(path.join(here, '../roms/riverraid.a26')));
const frames = +(process.argv[2] || 120);
const out = process.argv[3] || 'frame.png';
const script = (process.argv[4] || '').split(',').filter(Boolean).map(s => {
  const [f, k, len] = s.split(':'); return { f: +f, k, len: +(len || 10) };
});

const m = new Atari2600(rom);
const t0 = Date.now();
let lineCounts = {};
for (let f = 0; f < frames; f++) {
  const inp = {};
  for (const s of script) if (f >= s.f && f < s.f + s.len) inp[s.k] = true;
  m.setInput(inp);
  m.runFrame();
  m.takeAudio();
  const n = m.tia.out.lines;
  lineCounts[n] = (lineCounts[n] || 0) + 1;
}
console.log('frames', frames, 'ms', Date.now() - t0, 'lines/frame', lineCounts, 'pc', m.cpu.pc.toString(16), 'jam', m.cpu.jammed);

const o = m.tia.out, H = o.lines, W = 320;
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 3 + 1)] = 0;
  for (let x = 0; x < W; x++) {
    const c = PALETTE[o.color[y * 160 + (x >> 1)]];
    const p = y * (W * 3 + 1) + 1 + x * 3;
    raw[p] = c >> 16; raw[p + 1] = (c >> 8) & 255; raw[p + 2] = c & 255;
  }
}
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = b => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, cr]);
};
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
fs.writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));

// object log summary for the frame
const byObj = {};
for (const e of o.log) { const k = e.o; byObj[k] = (byObj[k] || 0) + 1; }
console.log('log entries by object', byObj);
const vb = []; for (let y = 0; y < H; y++) if (!o.vblankLine[y]) vb.push(y);
console.log('visible lines', vb[0], '-', vb[vb.length - 1]);
