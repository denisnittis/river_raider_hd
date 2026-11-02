// Plays the game with semi-random input and catalogs every sprite shape seen.
// node tools/catalog.mjs <frames> <out-dir>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Atari2600 } from '../js/atari.js';
import { groupSprites } from '../js/sprites.js';
import { PALETTE } from '../js/palette.js';
import { writePNG } from './png.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const rom = new Uint8Array(fs.readFileSync(path.join(here, '../roms/riverraid.a26')));
const frames = +(process.argv[2] || 20000);
const outDir = process.argv[3] || '.';

const m = new Atari2600(rom);
if (process.env.NOCOLLIDE) { const rd = m.tia.read.bind(m.tia); m.tia.read = a => ((a & 0x0F) < 8 ? 0 : rd(a)); }
const seen = new Map();
let dir = 0, dirLeft = 0;
for (let f = 0; f < frames; f++) {
  if (--dirLeft <= 0) { dir = (Math.random() * 3) | 0; dirLeft = 10 + ((Math.random() * 40) | 0); }
  const inp = { fire: (f % 20) < 10, up: process.env.NOCOLLIDE ? true : Math.random() < 0.3, left: dir === 1, right: dir === 2, reset: f % 3000 < 5 };
  m.setInput(inp);
  m.runFrame(); m.takeAudio();
  const o = m.tia.out;
  for (const g of groupSprites(o.log)) {
    let s = seen.get(g.sig);
    if (!s) { s = { sig: g.sig, o: g.o, s: g.s, rows: g.rows, cols: g.cols, count: 0, tops: new Set() }; seen.set(g.sig, s); }
    s.count++; s.tops.add(g.top);
  }
}

// drop shapes that are vertical sub-slices (clipped) of a bigger shape
const all = [...seen.values()].sort((a, b) => b.rows.length - a.rows.length);
const hex = s => s.sig.split(':')[1];
const kept = [];
for (const s of all) {
  if (kept.some(k => k.s === s.s && hex(k).length > hex(s).length && hex(k).includes(hex(s)) && (hex(k).indexOf(hex(s)) % 2 === 0))) continue;
  kept.push(s);
}
kept.sort((a, b) => a.o - b.o || b.count - a.count);
console.log('unique', all.length, 'after clip-dedupe', kept.length);

// atlas: each sprite drawn at 4x, in rows
const cell = 8 * 4 * 4 + 8, W = cell * 10;
const rowsH = [];
for (let i = 0; i < kept.length; i += 10) rowsH.push(Math.max(...kept.slice(i, i + 10).map(k => k.rows.length)) * 3 + 14);
const H = rowsH.reduce((a, b) => a + b, 0) + 4;
const px = new Uint32Array(W * H).fill(0x202020);
let y0 = 2;
kept.forEach((k, i) => {
  const cx = (i % 10) * cell + 4;
  if (i % 10 === 0 && i) y0 += rowsH[i / 10 - 1];
  // index marker: small bar of i's bits
  for (let b = 0; b < 8; b++) for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 3; xx++)
    px[(y0 + yy) * W + cx + b * 4 + xx] = (i >> (7 - b)) & 1 ? 0xffffff : 0x505050;
  k.rows.forEach((r, ry) => {
    for (let b = 0; b < 8; b++) if (r & (0x80 >> b)) {
      const col = PALETTE[k.cols[ry]] || 0xffffff;
      for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < 4 * k.s; xx++)
        px[(y0 + 8 + ry * 3 + yy) * W + cx + b * 4 * k.s + xx] = col;
    }
  });
});
writePNG(path.join(outDir, 'atlas.png'), W, H, px);
fs.writeFileSync(path.join(outDir, 'catalog.json'), JSON.stringify(kept.map((k, i) => ({
  i, obj: k.o === 1 ? 'P0' : 'P1', scale: k.s, h: k.rows.length, count: k.count, sig: k.sig,
  cols: [...new Set(k.cols)].map(c => c.toString(16)), tops: [Math.min(...k.tops), Math.max(...k.tops)],
  art: k.rows.map(r => r.toString(2).padStart(8, '0').replace(/0/g, '.').replace(/1/g, '#')),
})), null, 1));
