// Groups the TIA object log of a frame into sprites (vertical runs of a
// player copy) and gives each one a shape signature.
import { OBJ_P0, OBJ_P1 } from './tia.js';

const REV = new Uint8Array(256);
for (let i = 0; i < 256; i++) { let r = 0; for (let b = 0; b < 8; b++) if (i & (1 << b)) r |= 0x80 >> b; REV[i] = r; }

export function groupSprites(log, { maxGap = 2, maxDx = 8 } = {}) {
  const groups = [];
  const open = [];
  for (const e of log) {
    if (e.o !== OBJ_P0 && e.o !== OBJ_P1) continue;
    let best = null;
    for (const g of open) {
      if (g.o !== e.o || g.s !== e.s) continue;
      const gap = e.line - g.last;
      if (gap < 1 || gap > maxGap + 1) continue;
      if (Math.abs(g.lastX - e.x) > maxDx) continue;
      best = g; break;
    }
    if (!best) {
      best = { o: e.o, s: e.s, top: e.line, last: e.line - 1, lastX: e.x, rows: [], xs: [], cols: [], refl: e.r };
      groups.push(best); open.push(best);
    }
    while (best.last < e.line - 1) { best.rows.push(0); best.xs.push(best.lastX); best.cols.push(0); best.last++; }
    best.rows.push(e.r ? REV[e.g] : e.g);
    best.xs.push(e.x); best.cols.push(e.c);
    best.last = e.line; best.lastX = e.x; best.refl = e.r;
    // drop groups that can no longer continue
    for (let i = open.length - 1; i >= 0; i--) if (e.line - open[i].last > maxGap + 1) open.splice(i, 1);
  }
  for (const g of groups) {
    g.x = Math.min(...g.xs);
    g.h = g.rows.length;
    g.sig = g.s + ':' + g.rows.map(r => r.toString(16).padStart(2, '0')).join('');
  }
  return groups;
}

export { REV };
