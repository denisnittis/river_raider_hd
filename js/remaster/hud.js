// Reads score / lives / fuel from what the game draws in its bottom panel
// (nothing is read from or written to the game's memory), and draws the
// remastered instrument panel.
import { OBJ_P0, OBJ_P1, OBJ_BL } from '../tia.js';
import { groupSprites } from '../sprites.js';
import { ART } from '../render/art.js';

const FUEL_EMPTY_X = 68, FUEL_FULL_X = 99;   // ball position range inside the gauge

export class HudReader {
  constructor(rom) {
    // digit glyphs live at $B00, 8 bytes each, stored bottom-up
    this.glyphs = new Map();
    const base = rom.length === 4096 ? 0xB00 : 0x300;
    for (let d = 0; d < 10; d++) {
      const rows = [];
      for (let i = 7; i >= 0; i--) rows.push(rom[base + d * 8 + i]);
      this.glyphs.set(rows.map(r => r.toString(16).padStart(2, '0')).join(''), d);
    }
  }

  read(log, hudTop) {
    const ent = log.filter(e => (e.o === OBJ_P0 || e.o === OBJ_P1) && e.line >= hudTop);
    const groups = groupSprites(ent, { maxGap: 0, maxDx: 4 });
    const digits = [];
    for (const g of groups) {
      if (g.h !== 8) continue;
      const d = this.glyphs.get(g.rows.map(r => r.toString(16).padStart(2, '0')).join(''));
      if (d !== undefined) digits.push({ d, x: g.xs[0], top: g.top });
    }
    const scoreDigits = digits.filter(d => d.top < hudTop + 6).sort((a, b) => a.x - b.x);
    const livesDigit = digits.find(d => d.top > hudTop + 20);
    const ball = log.find(e => e.o === OBJ_BL && e.line >= hudTop + 10 && e.line <= hudTop + 26);
    return {
      score: scoreDigits.length ? scoreDigits.map(d => d.d).join('') : null,
      lives: livesDigit ? livesDigit.d : null,
      fuel: ball ? Math.max(0, Math.min(1, (ball.x - FUEL_EMPTY_X) / (FUEL_FULL_X - FUEL_EMPTY_X))) : null,
      inGame: !!ball,
    };
  }
}

const rivet = (ctx, x, y) => {
  const g = ctx.createRadialGradient(x - 1.5, y - 1.5, 0, x, y, 6);
  g.addColorStop(0, '#d0d3d6'); g.addColorStop(0.5, '#6d7176'); g.addColorStop(1, '#1d1f22');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
};

function bay(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1; ctx.strokeRect(x + 3.5, y + 3.5, w - 7, h - 7);
}

export class RemasterPanel {
  constructor(width, height) {
    this.w = width; this.h = height;
    this.bg = document.createElement('canvas');
    this.bg.width = width; this.bg.height = height;
    this.panelImg = null;
    this.drawBackground();
    this.jet = document.createElement('canvas');
    this.jet.width = 64; this.jet.height = 52;
    ART.player(this.jet.getContext('2d'), 64, 52);
    this.last = { score: '0', lives: 0, fuel: 1 };
  }

  setPanelImage(img) { this.panelImg = img; this.drawBackground(); }

  setJetImage(img) {
    const x = this.jet.getContext('2d');
    x.clearRect(0, 0, this.jet.width, this.jet.height);
    x.drawImage(img, 0, 0, this.jet.width, this.jet.height);
  }

  drawBackground() {
    const { w, h } = this, ctx = this.bg.getContext('2d');
    if (this.panelImg) { ctx.drawImage(this.panelImg, 0, 0, w, h); return; }
    let g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#3b3a36'); g.addColorStop(0.08, '#2a2926'); g.addColorStop(1, '#151513');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // brushed metal streaks + grime
    for (let i = 0; i < 2200; i++) {
      const y = Math.random() * h, x = Math.random() * w, l = 20 + Math.random() * 120;
      ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.05})`;
      ctx.fillRect(x, y, l, 1);
    }
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 10 + Math.random() * 50;
      g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(70,50,25,0.18)'); g.addColorStop(1, 'rgba(70,50,25,0)');
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(0, 0, w, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 2, w, 3);
    const m = 14, bw = 300;
    bay(ctx, m, 14, bw, h - 28);
    bay(ctx, w / 2 - 240, 10, 480, h - 20);
    bay(ctx, w - m - bw, 14, bw, h - 28);
    [[8, 10], [w - 8, 10], [8, h - 10], [w - 8, h - 10], [w / 2 - 252, 12], [w / 2 + 252, 12], [w / 2 - 252, h - 12], [w / 2 + 252, h - 12]]
      .forEach(([x, y]) => rivet(ctx, x, y));
    // right bay: title plate
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'italic 900 40px "Arial Black", Impact, sans-serif';
    const tx = w - m - bw / 2;
    ctx.fillStyle = '#0c0c0b'; ctx.fillText('RIVER RAID', tx + 2, h / 2 - 10 + 2);
    g = ctx.createLinearGradient(0, h / 2 - 30, 0, h / 2 + 10);
    g.addColorStop(0, '#fff1b8'); g.addColorStop(0.5, '#f0b429'); g.addColorStop(1, '#a86512');
    ctx.fillStyle = g; ctx.fillText('RIVER RAID', tx, h / 2 - 10);
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.fillStyle = '#a8a294'; ctx.fillText('R E M A S T E R E D', tx, h / 2 + 28);
    ctx.restore();
  }

  draw(ctx, x0, y0, info, time) {
    const { w, h } = this;
    if (info.score !== null) this.last.score = info.score;
    if (info.lives !== null) this.last.lives = info.lives;
    if (info.fuel !== null) this.last.fuel = info.fuel;
    const { score, lives, fuel } = this.last;
    ctx.save();
    ctx.translate(x0, y0);
    ctx.drawImage(this.bg, 0, 0);

    // lives
    const lx = 14 + 150;
    ctx.drawImage(this.jet, lx - 110, h / 2 - 30, 64 * 1.15, 52 * 1.15);
    ctx.font = '900 54px "Arial Black", Impact, sans-serif';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillStyle = '#000'; ctx.fillText(`× ${lives}`, lx - 22 + 2, h / 2 + 2);
    ctx.fillStyle = '#e9e4d6'; ctx.fillText(`× ${lives}`, lx - 22, h / 2);

    // score display
    const cx = w / 2, sy = 22, sw = 300, sh = 52;
    ctx.fillStyle = '#070807'; ctx.fillRect(cx - sw / 2, sy, sw, sh);
    ctx.strokeStyle = '#55524a'; ctx.lineWidth = 2; ctx.strokeRect(cx - sw / 2, sy, sw, sh);
    ctx.font = 'bold 44px "Consolas", "Courier New", monospace';
    ctx.textAlign = 'right';
    ctx.shadowColor = 'rgba(255,170,40,0.9)'; ctx.shadowBlur = 12;
    ctx.fillStyle = '#ffc04a'; ctx.fillText(score.padStart(6, ' '), cx + sw / 2 - 16, sy + sh / 2 + 2);
    ctx.shadowBlur = 0;

    // fuel gauge
    const gx = cx - 200, gy = sy + sh + 14, gw = 400, gh = 26;
    ctx.fillStyle = '#0b0b0a'; ctx.fillRect(gx, gy, gw, gh);
    const low = fuel < 0.25;
    const fg = ctx.createLinearGradient(gx, 0, gx + gw, 0);
    fg.addColorStop(0, '#d0301f'); fg.addColorStop(0.3, '#f0a020'); fg.addColorStop(1, '#69c23a');
    ctx.fillStyle = fg;
    ctx.globalAlpha = low && Math.floor(time * 4) % 2 ? 0.45 : 1;
    ctx.fillRect(gx + 3, gy + 3, (gw - 6) * fuel, gh - 6);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(gx + 3, gy + 3, (gw - 6) * fuel, 4);
    ctx.strokeStyle = '#6a665c'; ctx.lineWidth = 2; ctx.strokeRect(gx, gy, gw, gh);
    ctx.fillStyle = '#d8d2c2';
    for (let i = 0; i <= 20; i++) {
      const tx = gx + 3 + (gw - 6) * i / 20, th = i % 10 === 0 ? 10 : i % 5 === 0 ? 7 : 4;
      ctx.fillRect(tx - 1, gy - th - 2, 2, th);
    }
    ctx.font = 'bold 16px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('E', gx - 14, gy + 19); ctx.fillText('F', gx + gw + 14, gy + 19); ctx.fillText('½', cx, gy - 14);
    if (low) {
      ctx.fillStyle = Math.floor(time * 4) % 2 ? '#ff4a3a' : '#7a1a12';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText('LOW FUEL', gx + 60, gy - 14);
    }
    ctx.restore();
  }
}
