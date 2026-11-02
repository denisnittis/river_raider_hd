// Remaster renderer: rebuilds each emulated frame with realistic terrain and new art,
// using only what the TIA drew (positions, shapes, colors). Game logic is
// untouched — this only decides how the same frame is shown.
import { PALETTE } from '../palette.js';
import { OBJ_P0, OBJ_P1, OBJ_M0, OBJ_M1, OBJ_BL, OBJ_PF } from '../tia.js';
import { groupSprites } from '../sprites.js';
import { SHAPES } from './shapes.js';
import { ART, PAD, FLYING } from './art.js';
import { TerrainGL } from './terrain-gl.js';
import { FS_REMASTER, REMASTER_TEXTURES } from '../remaster/terrain.js';
import { HudReader, RemasterPanel } from '../remaster/hud.js';

export const TOP = 65;        // first visible line
export const PLAY_END = 227;  // first HUD line
export const BOTTOM = 264;    // end of picture
export const SX = 8, SY = 4;  // HD pixels per Atari pixel / scanline
export const WIDTH = 160 * SX, HEIGHT = (BOTTOM - TOP) * SY;
const PLAY_LINES = PLAY_END - TOP;

// sprites that get a spinning propeller / rotor (radius in HD px) when drawn
// from a photo: motion blur does not survive the cut-out
const PROP_X = { player: 13, player_left: 13, player_right: 13, heli_r1: 34, heli_r2: 34, heli_l1: 34, heli_l2: 34 };

const hexRows = rows => rows.map(r => r.toString(16).padStart(2, '0')).join('');

const LIB = Object.entries(SHAPES).map(([name, s]) => {
  const rows = s.rows.map(r => parseInt(r.replace(/\./g, '0').replace(/#/g, '1'), 2));
  return { name, o: s.obj === 'P0' ? OBJ_P0 : OBJ_P1, scale: s.scale, rows, hex: hexRows(rows) };
});

// Remaster renderer: realistic terrain, the art in assets/remaster and the
// new instrument panel.
export class RemasterRenderer {
  constructor(canvas, rom) {
    this.canvas = canvas;
    canvas.width = WIDTH; canvas.height = HEIGHT;
    this.ctx = canvas.getContext('2d');
    this.terrain = new TerrainGL(WIDTH, PLAY_LINES * SY, 160, PLAY_LINES, FS_REMASTER, REMASTER_TEXTURES);
    this.hudReader = new HudReader(rom);
    this.panel = new RemasterPanel(WIDTH, (BOTTOM - PLAY_END) * SY);
    this.tex = new Uint8Array(160 * PLAY_LINES * 4);
    this.mask = new Uint8Array(160 * PLAY_LINES);
    this.prevMask = new Uint8Array(160 * PLAY_LINES);
    this.scroll = 0; this.lastDy = 0;
    this.cache = new Map();
    this.images = new Map();     // PNG overrides
    this.unknown = new Map();    // signatures we could not match (debug)
    this.debug = false;
    this.loadOverrides();
  }

  // assets/remaster/manifest.json = { sprites: [...], textures: [...], panel: true }
  async loadOverrides() {
    const load = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
    try {
      const dir = 'assets/remaster';
      const r = await fetch(`${dir}/manifest.json`, { cache: 'no-store' });
      if (!r.ok) return;
      const man = await r.json();
      for (const name of man.sprites || []) {
        const img = await load(`${dir}/sprites/${name}.png`);
        if (img) {
          this.images.set(name, img); this.cache.clear();
          if (name === 'player') this.panel.setJetImage(img);
        }
      }
      for (const name of man.textures || []) {
        const img = await load(`${dir}/textures/${name}.png`);
        if (img) this.terrain.setTexture(name, img);
      }
      if (man.panel) {
        const img = await load(`${dir}/hud/panel.png`);
        if (img) this.panel.setPanelImage(img);
      }
    } catch { /* no overrides */ }
  }

  sprite(name, scale, rows) {
    let c = this.cache.get(name);
    if (c) return c;
    const W = 8 * scale * SX, H = rows * SY;
    c = document.createElement('canvas');
    c.width = W + PAD * 2; c.height = H + PAD * 2;
    const x = c.getContext('2d');
    x.translate(PAD, PAD);
    const img = this.images.get(name);
    if (img) {
      x.drawImage(img, 0, 0, W, H);
      // nose = centre of the first opaque row
      const a = x.getImageData(PAD, PAD, W, H).data;
      for (let yy = 0, found = false; yy < H && !found; yy++) {
        let x0 = -1, x1 = -1;
        for (let xx = 0; xx < W; xx++) if (a[(yy * W + xx) * 4 + 3] > 128) { if (x0 < 0) x0 = xx; x1 = xx; }
        if (x0 >= 0) { c.noseX = (x0 + x1) / 2 / W; c.noseY = yy; found = true; }
      }
    } else ART[name](x, W, H);
    this.cache.set(name, c);
    return c;
  }

  match(g) {
    const gh = hexRows(g.rows);
    const topClip = g.top <= TOP + 4, botClip = g.top + g.h >= PLAY_END - 4;
    let best = null;
    for (const s of LIB) {
      if (s.o !== g.o || s.scale !== g.s) continue;
      if (s.hex === gh) return { s, off: 0 };
      if (!topClip && !botClip) continue;
      let i = s.hex.indexOf(gh);
      while (i >= 0) {
        if (i % 2 === 0) {
          const off = i / 2;
          const okTop = topClip && off + g.h === s.rows.length;
          const okBot = botClip && off === 0;
          if ((okTop || okBot) && !best) best = { s, off };
        }
        i = s.hex.indexOf(gh, i + 1);
      }
    }
    return best;
  }

  estimateScroll() {
    const a = this.mask, b = this.prevMask;
    let bestDy = this.lastDy, bestErr = Infinity;
    for (let dy = 0; dy <= 8; dy++) {
      let err = 0;
      for (let y = 0; y < PLAY_LINES - dy - 4; y += 1) {
        const ra = (y + dy) * 160, rb = y * 160;
        for (let x = 8; x < 160; x += 4) if (a[ra + x] !== b[rb + x]) err++;
      }
      if (err < bestErr || (err === bestErr && dy === this.lastDy)) { bestErr = err; bestDy = dy; }
    }
    if (bestErr < 200) this.lastDy = bestDy;
    this.scroll += this.lastDy;
    this.prevMask.set(a);
  }

  render(frame, time) {
    const { objs, base, log } = frame;
    const ctx = this.ctx;

    // --- terrain texture (play area). Hide the HMOVE comb on the left.
    const tex = this.tex, mask = this.mask;
    for (let y = 0; y < PLAY_LINES; y++) {
      const src = (y + TOP) * 160;
      for (let x = 0; x < 160; x++) {
        const sx = x < 8 ? 8 : x;
        const c = PALETTE[base[src + sx]];
        const land = objs[src + sx] & OBJ_PF ? 255 : 0;
        const o = (y * 160 + x) * 4;
        tex[o] = c >> 16; tex[o + 1] = (c >> 8) & 255; tex[o + 2] = c & 255; tex[o + 3] = land;
        mask[y * 160 + x] = land;
      }
    }
    // exact scroll from the game when the caller provides it (read-only RAM
    // counter, 0..31); otherwise estimate it from how the banks moved
    if (frame.scrollPos !== undefined && this.lastScrollPos !== undefined) {
      this.scroll += (frame.scrollPos - this.lastScrollPos) & 31;
      this.prevMask.set(mask);
    } else this.estimateScroll();
    this.lastScrollPos = frame.scrollPos;
    this.terrain.render(tex, this.scroll, time);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.terrain.canvas, 0, 0);

    // --- sprites
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, WIDTH, PLAY_LINES * SY); ctx.clip();
    const groups = groupSprites(log.filter(e => e.line >= TOP && e.line < PLAY_END));
    const draws = [];
    for (const g of groups) {
      const m = this.match(g);
      if (m) {
        draws.push({ name: m.s.name, scale: m.s.scale, rows: m.s.rows.length, x: g.xs[0], top: g.top - m.off });
      } else {
        this.drawUnknown(g, time);
      }
    }
    // shadows first, then ground objects, then flying ones
    for (const d of draws) if (FLYING.has(d.name)) {
      const w = 8 * d.scale * SX, h = d.rows * SY;
      const far = 1.8;
      ctx.fillStyle = 'rgba(0,10,10,0.38)';
      ctx.beginPath();
      ctx.ellipse(d.x * SX + w / 2 + 18 * far, (d.top - TOP) * SY + h / 2 + 26 * far, w * 0.42, h * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    draws.sort((a, b) => FLYING.has(a.name) - FLYING.has(b.name));
    for (const d of draws) {
      const spr = this.sprite(d.name, d.scale, d.rows);
      ctx.drawImage(spr, d.x * SX - PAD, (d.top - TOP) * SY - PAD);
      if (PROP_X[d.name] && spr.noseX !== undefined) this.drawPropeller(d, spr, time);
    }
    this.drawBullets(log, time);
    ctx.restore();

    this.panel.draw(ctx, 0, PLAY_LINES * SY, this.hudReader.read(log, PLAY_END), time);
    if (this.debug) this.drawDebug(groups);
  }

  // spinning propeller on the nose of a photo plane (the blur does not survive the cut-out)
  drawPropeller(d, spr, time) {
    const ctx = this.ctx, w = 8 * d.scale * SX, R = PROP_X[d.name];
    const cx = d.x * SX + w * spr.noseX, cy = (d.top - TOP) * SY + spr.noseY + 1;
    ctx.save();
    ctx.fillStyle = 'rgba(20,20,20,0.18)';
    ctx.beginPath(); ctx.ellipse(cx, cy, R, R * 0.25, 0, 0, Math.PI * 2); ctx.fill();
    const a = time * (R > 20 ? 25 : 40);
    ctx.strokeStyle = 'rgba(25,25,25,0.75)'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    for (let k = 0; k < 2; k++) {
      const s = Math.cos(a + k * Math.PI) * R;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + s, cy); ctx.stroke();
    }
    ctx.fillStyle = '#c9c9c9'; ctx.beginPath(); ctx.arc(cx, cy, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  drawUnknown(g, time) {
    const ctx = this.ctx;
    let bits = 0;
    for (const r of g.rows) for (let b = 0; b < 8; b++) if (r & (1 << b)) bits++;
    const sparse = bits / (8 * g.h) < 0.3;
    const pw = SX * g.s;
    if (!this.unknown.has(g.sig)) this.unknown.set(g.sig, { o: g.o, s: g.s, top: g.top, rows: g.rows });
    g.rows.forEach((r, i) => {
      const y = (g.top + i - TOP) * SY;
      const x0 = g.xs[i] * SX;
      for (let b = 0; b < 8; b++) if (r & (0x80 >> b)) {
        const cx = x0 + b * pw + pw / 2, cy = y + SY / 2;
        if (sparse) {
          // explosion debris -> glowing fire particles
          const rr = pw * (0.9 + 0.5 * Math.sin(time * 30 + i * 3 + b));
          const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr * 1.6);
          gr.addColorStop(0, 'rgba(255,255,220,1)'); gr.addColorStop(0.35, 'rgba(255,190,60,0.95)');
          gr.addColorStop(0.7, 'rgba(230,70,20,0.6)'); gr.addColorStop(1, 'rgba(80,20,10,0)');
          ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, rr * 1.6, 0, Math.PI * 2); ctx.fill();
        } else {
          const c = PALETTE[g.cols[i]];
          ctx.fillStyle = `rgb(${c >> 16},${(c >> 8) & 255},${c & 255})`;
          ctx.fillRect(x0 + b * pw, y, pw, SY);
        }
      }
    });
  }

  drawBullets(log, time) {
    const ctx = this.ctx;
    const seg = [];
    // the player's shot is missile 0 in River Raid; missile 1 and ball too, just in case
    for (const e of log) {
      if (!(e.o === OBJ_M0 || e.o === OBJ_M1 || e.o === OBJ_BL) || e.line < TOP || e.line >= PLAY_END) continue;
      const last = seg.find(s => s.o === e.o && e.line - s.y1 <= 2 && Math.abs(e.x - s.x) <= 2);
      if (last) last.y1 = e.line;
      else seg.push({ o: e.o, x: e.x, w: e.w, y0: e.line, y1: e.line });
    }
    for (const s of seg) {
      const cx = (s.x + s.w / 2) * SX, y0 = (s.y0 - TOP) * SY, y1 = (s.y1 + 1 - TOP) * SY;
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, 'rgba(255,255,230,1)'); g.addColorStop(1, 'rgba(255,160,40,0.2)');
      ctx.shadowColor = 'rgba(255,200,80,0.9)'; ctx.shadowBlur = 14;
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(cx, (y0 + y1) / 2, 3.5, (y1 - y0) / 2 + 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  drawDebug(groups) {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = '12px monospace'; ctx.lineWidth = 1;
    for (const g of groups) {
      const m = this.match(g);
      ctx.strokeStyle = m ? 'lime' : 'red';
      ctx.strokeRect(g.xs[0] * SX, (g.top - TOP) * SY, 8 * g.s * SX, g.h * SY);
      ctx.fillStyle = m ? 'lime' : 'red';
      ctx.fillText(m ? m.s.name : '?', g.xs[0] * SX, (g.top - TOP) * SY - 3);
    }
    ctx.fillStyle = 'white';
    ctx.fillText(`scroll ${this.scroll} dy ${this.lastDy}`, 10, 16);
    ctx.restore();
  }
}

// plain Atari picture, same size, for side-by-side comparison
export function renderOriginal(ctx, frame, img, tmp) {
  const d = img.data, { color } = frame;
  for (let y = 0; y < BOTTOM - TOP; y++) for (let x = 0; x < 160; x++) {
    const c = PALETTE[color[(y + TOP) * 160 + x]], o = (y * 160 + x) * 4;
    d[o] = c >> 16; d[o + 1] = (c >> 8) & 255; d[o + 2] = c & 255; d[o + 3] = 255;
  }
  tmp.getContext('2d').putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, WIDTH, HEIGHT);
}
