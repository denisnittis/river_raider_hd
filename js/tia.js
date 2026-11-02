// TIA: video (per color clock) + audio. Besides the plain picture it records,
// for every frame, which object produced each pixel and a log of every
// player/missile/ball copy drawn — the HD layer works from that.

export const MAX_LINES = 320;
export const OBJ_P0 = 1, OBJ_P1 = 2, OBJ_M0 = 4, OBJ_M1 = 8, OBJ_BL = 16, OBJ_PF = 32;

// collision pairs -> 16-bit latch (bit r*2+1 = D7 of CX register r, bit r*2 = D6)
const CX_PAIRS = [
  [OBJ_M0, OBJ_P1, 1], [OBJ_M0, OBJ_P0, 0],
  [OBJ_M1, OBJ_P0, 3], [OBJ_M1, OBJ_P1, 2],
  [OBJ_P0, OBJ_PF, 5], [OBJ_P0, OBJ_BL, 4],
  [OBJ_P1, OBJ_PF, 7], [OBJ_P1, OBJ_BL, 6],
  [OBJ_M0, OBJ_PF, 9], [OBJ_M0, OBJ_BL, 8],
  [OBJ_M1, OBJ_PF, 11], [OBJ_M1, OBJ_BL, 10],
  [OBJ_BL, OBJ_PF, 13],
  [OBJ_P0, OBJ_P1, 15], [OBJ_M0, OBJ_M1, 14],
];
const CX_TABLE = new Uint16Array(64);
for (let m = 0; m < 64; m++) {
  let bits = 0;
  for (const [a, b, bit] of CX_PAIRS) if ((m & a) && (m & b)) bits |= 1 << bit;
  CX_TABLE[m] = bits;
}

// NUSIZ copy offsets and scale
const COPIES = [[0], [0, 16], [0, 32], [0, 16, 32], [0, 64], [0], [0, 32, 64], [0]];
const SCALE = [1, 1, 1, 1, 1, 2, 1, 4];

function poly(bits, taps, len) {
  const out = new Uint8Array(len);
  let r = (1 << bits) - 1;
  for (let i = 0; i < len; i++) {
    out[i] = r & 1;
    const fb = ((r >> taps[0]) ^ (r >> taps[1])) & 1;
    r = (r >> 1) | (fb << (bits - 1));
  }
  return out;
}
const POLY4 = poly(4, [0, 1], 15);
const POLY5 = poly(5, [0, 2], 31);
const POLY9 = poly(9, [0, 4], 511);
const DIV31 = new Uint8Array(31); DIV31[0] = 1; DIV31[18] = 1;

class AudioChannel {
  constructor() { this.c = 0; this.f = 0; this.v = 0; this.cnt = 0; this.max = 0; this.p4 = 0; this.p5 = 0; this.p9 = 0; this.out = 0; }
  update() {
    let nv;
    if (this.c === 0x00 || this.c === 0x0B) { nv = 0; this.out = this.v; }
    else { nv = this.f + 1; if ((this.c & 0x0C) === 0x0C) nv *= 3; }
    if (nv !== this.max) { this.max = nv; if (this.cnt === 0 || nv === 0) this.cnt = nv; }
  }
  tick() {
    if (this.cnt > 1) { this.cnt--; return; }
    if (this.cnt !== 1) return;
    this.cnt = this.max;
    const c = this.c;
    if (++this.p5 === 31) this.p5 = 0;
    if (!(c & 0x02) || (!(c & 0x01) && DIV31[this.p5]) || ((c & 0x01) && POLY5[this.p5])) {
      if (c & 0x04) this.out = this.out ? 0 : this.v;
      else if (c & 0x08) {
        if (c === 0x08) { if (++this.p9 === 511) this.p9 = 0; this.out = POLY9[this.p9] ? this.v : 0; }
        else this.out = POLY5[this.p5] ? this.v : 0;
      } else { if (++this.p4 === 15) this.p4 = 0; this.out = POLY4[this.p4] ? this.v : 0; }
    }
  }
}

export class TIA {
  constructor() {
    this.clock = 0;           // absolute color clock rendered so far
    this.hpos = 0;
    this.line = 0;
    this.frameReady = false;
    this.frameCount = 0;

    // per-frame output being drawn
    this.color = new Uint8Array(160 * MAX_LINES);  // final pixel color (TIA color byte)
    this.objs = new Uint8Array(160 * MAX_LINES);   // bitmask of objects present at pixel
    this.base = new Uint8Array(160 * MAX_LINES);   // PF/background color under the objects
    this.vblankLine = new Uint8Array(MAX_LINES);
    this.log = [];                                 // object copies drawn: {line,o,x,g,r,c,w}
    // last finished frame
    this.out = { color: new Uint8Array(160 * MAX_LINES), objs: new Uint8Array(160 * MAX_LINES),
                 base: new Uint8Array(160 * MAX_LINES), vblankLine: new Uint8Array(MAX_LINES),
                 log: [], lines: 0 };

    this.vsync = 0; this.vblank = 0;
    this.nusiz0 = 0; this.nusiz1 = 0;
    this.colup0 = 0; this.colup1 = 0; this.colupf = 0; this.colubk = 0;
    this.ctrlpf = 0; this.refp0 = 0; this.refp1 = 0;
    this.pf0 = 0; this.pf1 = 0; this.pf2 = 0; this.pfMask = 0;
    this.posP0 = 0; this.posP1 = 0; this.posM0 = 0; this.posM1 = 0; this.posBL = 0;
    this.grp0 = 0; this.grp0old = 0; this.grp1 = 0; this.grp1old = 0;
    this.enam0 = 0; this.enam1 = 0; this.enabl = 0; this.enablOld = 0;
    this.hmp0 = 0; this.hmp1 = 0; this.hmm0 = 0; this.hmm1 = 0; this.hmbl = 0;
    this.vdelp0 = 0; this.vdelp1 = 0; this.vdelbl = 0;
    this.resmp0 = 0; this.resmp1 = 0;
    this.cx = 0;
    this.hmoveBlank = false;

    this.inpt4 = 0x80; this.inpt5 = 0x80;

    this.ch0 = new AudioChannel(); this.ch1 = new AudioChannel();
    this.audio = new Float32Array(4096); this.audioLen = 0;
  }

  catchUp(target) {
    while (this.clock < target) {
      const hp = this.hpos;
      if (hp >= 68) this.pixel(hp - 68);
      if (hp === 0 || hp === 114) this.audioTick();
      this.clock++;
      if (++this.hpos === 228) {
        this.hpos = 0;
        this.hmoveBlank = false;
        if (this.line < MAX_LINES) this.vblankLine[this.line] = this.vblank & 2 ? 1 : 0;
        this.line++;
        if (this.line >= MAX_LINES + 40) this.endFrame();  // no VSYNC: force a frame
      }
    }
  }

  audioTick() {
    this.ch0.tick(); this.ch1.tick();
    if (this.audioLen >= this.audio.length) {
      const n = new Float32Array(this.audio.length * 2); n.set(this.audio); this.audio = n;
    }
    this.audio[this.audioLen++] = (this.ch0.out + this.ch1.out) / 30;
  }

  endFrame() {
    const o = this.out;
    const n = Math.min(this.line, MAX_LINES);
    o.color.set(this.color); o.objs.set(this.objs); o.base.set(this.base);
    o.vblankLine.set(this.vblankLine);
    o.log = this.log; o.lines = n;
    this.log = [];
    this.color.fill(0); this.objs.fill(0); this.base.fill(0);
    this.line = 0;
    this.frameReady = true;
    this.frameCount++;
  }

  playerBit(x, pos, g, ref, nusiz, obj, col) {
    if (!g) return 0;
    const m = nusiz & 7, s = SCALE[m], cp = COPIES[m];
    let dx = x - pos; if (dx < 0) dx += 160;
    if (s > 1) { dx -= 1; if (dx < 0) dx += 160; }
    for (let i = 0; i < cp.length; i++) {
      const d = dx - cp[i];
      if (d >= 0 && d < 8 * s) {
        if (d === 0) this.log.push({ line: this.line, o: obj, x, g, r: ref ? 1 : 0, c: col, w: 8 * s, s });
        const b = (d / s) | 0;
        return ref ? (g >> b) & 1 : (g >> (7 - b)) & 1;
      }
    }
    return 0;
  }

  missileBit(x, pos, en, nusiz, obj, col) {
    if (!en) return 0;
    const m = nusiz & 7, w = 1 << ((nusiz >> 4) & 3);
    const cp = (m === 5 || m === 7) ? COPIES[0] : COPIES[m];
    let dx = x - pos; if (dx < 0) dx += 160;
    for (let i = 0; i < cp.length; i++) {
      const d = dx - cp[i];
      if (d >= 0 && d < w) {
        if (d === 0) this.log.push({ line: this.line, o: obj, x, g: 0, r: 0, c: col, w, s: 1 });
        return 1;
      }
    }
    return 0;
  }

  pixel(x) {
    const line = this.line;
    if (line >= MAX_LINES) return;
    const idx = line * 160 + x;
    if ((this.vblank & 2) || (this.hmoveBlank && x < 8)) {
      this.color[idx] = 0; this.base[idx] = 0; this.objs[idx] = 0;
      return;
    }
    const ctrl = this.ctrlpf;
    // playfield
    const pi = x >> 2;
    const pfb = pi < 20 ? (this.pfMask >> pi) & 1 : (this.pfMask >> ((ctrl & 1) ? 39 - pi : pi - 20)) & 1;
    // ball
    let bl = 0;
    if (this.vdelbl ? this.enablOld : this.enabl) {
      let dx = x - this.posBL; if (dx < 0) dx += 160;
      if (dx < (1 << ((ctrl >> 4) & 3))) {
        bl = 1;
        if (dx === 0) this.log.push({ line, o: OBJ_BL, x, g: 0, r: 0, c: this.colupf, w: 1 << ((ctrl >> 4) & 3), s: 1 });
      }
    }
    const p0 = this.playerBit(x, this.posP0, this.vdelp0 ? this.grp0old : this.grp0, this.refp0, this.nusiz0, OBJ_P0, this.colup0);
    const p1 = this.playerBit(x, this.posP1, this.vdelp1 ? this.grp1old : this.grp1, this.refp1, this.nusiz1, OBJ_P1, this.colup1);
    const m0 = this.resmp0 ? 0 : this.missileBit(x, this.posM0, this.enam0, this.nusiz0, OBJ_M0, this.colup0);
    const m1 = this.resmp1 ? 0 : this.missileBit(x, this.posM1, this.enam1, this.nusiz1, OBJ_M1, this.colup1);

    const mask = p0 | (p1 << 1) | (m0 << 2) | (m1 << 3) | (bl << 4) | (pfb << 5);
    this.cx |= CX_TABLE[mask];
    this.objs[idx] = mask;

    const pfCol = (ctrl & 2) ? (x < 80 ? this.colup0 : this.colup1) : this.colupf;
    const baseCol = pfb ? pfCol : (bl ? this.colupf : this.colubk);
    this.base[idx] = pfb || bl ? baseCol : this.colubk;

    let col;
    if (ctrl & 4) {
      if (pfb || bl) col = pfb ? this.colupf : this.colupf;
      else if (p0 | m0) col = this.colup0;
      else if (p1 | m1) col = this.colup1;
      else col = this.colubk;
    } else {
      if (p0 | m0) col = this.colup0;
      else if (p1 | m1) col = this.colup1;
      else col = baseCol;
    }
    this.color[idx] = col;
  }

  read(a) {
    const r = a & 0x0F;
    if (r < 8) return ((this.cx >> (r * 2)) & 3) << 6;
    if (r === 0x0C) return this.inpt4;
    if (r === 0x0D) return this.inpt5;
    return 0;
  }

  // returns true when the CPU must be halted until the end of the line (WSYNC)
  write(a, v) {
    const hp = this.hpos;
    switch (a & 0x3F) {
      case 0x00:
        if ((v & 2) && !(this.vsync & 2)) this.endFrame();
        this.vsync = v; break;
      case 0x01: this.vblank = v; break;
      case 0x02: return true;
      case 0x04: this.nusiz0 = v; break;
      case 0x05: this.nusiz1 = v; break;
      case 0x06: this.colup0 = v & 0xFE; break;
      case 0x07: this.colup1 = v & 0xFE; break;
      case 0x08: this.colupf = v & 0xFE; break;
      case 0x09: this.colubk = v & 0xFE; break;
      case 0x0A: this.ctrlpf = v; break;
      case 0x0B: this.refp0 = v & 8; break;
      case 0x0C: this.refp1 = v & 8; break;
      case 0x0D: this.pf0 = v; this.buildPF(); break;
      case 0x0E: this.pf1 = v; this.buildPF(); break;
      case 0x0F: this.pf2 = v; this.buildPF(); break;
      case 0x10: this.posP0 = hp < 68 ? 3 : (hp - 68 + 5) % 160; break;
      case 0x11: this.posP1 = hp < 68 ? 3 : (hp - 68 + 5) % 160; break;
      case 0x12: this.posM0 = hp < 68 ? 2 : (hp - 68 + 4) % 160; break;
      case 0x13: this.posM1 = hp < 68 ? 2 : (hp - 68 + 4) % 160; break;
      case 0x14: this.posBL = hp < 68 ? 2 : (hp - 68 + 4) % 160; break;
      case 0x15: this.ch0.c = v & 0x0F; this.ch0.update(); break;
      case 0x16: this.ch1.c = v & 0x0F; this.ch1.update(); break;
      case 0x17: this.ch0.f = v & 0x1F; this.ch0.update(); break;
      case 0x18: this.ch1.f = v & 0x1F; this.ch1.update(); break;
      case 0x19: this.ch0.v = v & 0x0F; this.ch0.update(); break;
      case 0x1A: this.ch1.v = v & 0x0F; this.ch1.update(); break;
      case 0x1B: this.grp0 = v; this.grp1old = this.grp1; break;
      case 0x1C: this.grp1 = v; this.grp0old = this.grp0; this.enablOld = this.enabl; break;
      case 0x1D: this.enam0 = v & 2; break;
      case 0x1E: this.enam1 = v & 2; break;
      case 0x1F: this.enabl = v & 2; break;
      case 0x20: this.hmp0 = v; break;
      case 0x21: this.hmp1 = v; break;
      case 0x22: this.hmm0 = v; break;
      case 0x23: this.hmm1 = v; break;
      case 0x24: this.hmbl = v; break;
      case 0x25: this.vdelp0 = v & 1; break;
      case 0x26: this.vdelp1 = v & 1; break;
      case 0x27: this.vdelbl = v & 1; break;
      case 0x28:
        if (this.resmp0 && !(v & 2)) this.posM0 = (this.posP0 + 3) % 160;
        this.resmp0 = v & 2; break;
      case 0x29:
        if (this.resmp1 && !(v & 2)) this.posM1 = (this.posP1 + 3) % 160;
        this.resmp1 = v & 2; break;
      case 0x2A: {
        const mv = (pos, hm) => { let d = (hm >> 4) & 0x0F; if (d & 8) d -= 16; return (pos - d + 160) % 160; };
        this.posP0 = mv(this.posP0, this.hmp0); this.posP1 = mv(this.posP1, this.hmp1);
        this.posM0 = mv(this.posM0, this.hmm0); this.posM1 = mv(this.posM1, this.hmm1);
        this.posBL = mv(this.posBL, this.hmbl);
        if (hp < 68) this.hmoveBlank = true;
        break;
      }
      case 0x2B: this.hmp0 = this.hmp1 = this.hmm0 = this.hmm1 = this.hmbl = 0; break;
      case 0x2C: this.cx = 0; break;
    }
    return false;
  }

  buildPF() {
    let m = 0;
    for (let i = 0; i < 4; i++) if (this.pf0 & (0x10 << i)) m |= 1 << i;
    for (let i = 0; i < 8; i++) if (this.pf1 & (0x80 >> i)) m |= 1 << (4 + i);
    for (let i = 0; i < 8; i++) if (this.pf2 & (1 << i)) m |= 1 << (12 + i);
    this.pfMask = m;
  }
}
