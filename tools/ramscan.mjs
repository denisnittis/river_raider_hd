// Finds RAM bytes for score (BCD), lives and fuel by watching a played game.
import fs from 'node:fs';
import { Atari2600 } from '../js/atari.js';
const m = new Atari2600(new Uint8Array(fs.readFileSync(new URL('../roms/riverraid.a26', import.meta.url))));
const script = (f) => ({ reset: f >= 60 && f < 65, fire: (f >= 120 && f < 125) || (f >= 200 && f < 300), up: f >= 150 && f < 300, left: f >= 220 && f < 240 });
const snaps = [];
for (let f = 0; f < 420; f++) { m.setInput(script(f)); m.runFrame(); snaps.push(Uint8Array.from(m.ram)); }
const hex = v => v.toString(16).padStart(2, '0');
// RAM at frames: before start, after start, f300 (score 90, lives 3 shown)
for (const f of [100, 140, 299]) console.log(f, [...snaps[f]].map(hex).join(' '));
// candidates: byte == 0x90 at 299
console.log('0x90 at f299:', [...snaps[299]].map((v, i) => v === 0x90 ? (0x80 + i).toString(16) : null).filter(Boolean));
// slowly decreasing bytes between 160..260 (fuel)
const dec = [];
for (let i = 0; i < 128; i++) {
  let downs = 0, ups = 0;
  for (let f = 161; f < 260; f++) { if (snaps[f][i] < snaps[f - 1][i]) downs++; if (snaps[f][i] > snaps[f - 1][i]) ups++; }
  if (downs >= 3 && ups <= 1) dec.push((0x80 + i).toString(16) + ` d${downs} u${ups} ${snaps[161][i]}->${snaps[259][i]}`);
}
console.log('decreasing:', dec);
