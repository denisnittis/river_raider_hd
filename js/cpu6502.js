// NMOS 6502 / 6507 core. Cycle counts per instruction; bus.clockAt is set to the
// CPU cycle at which the instruction completes, so TIA/RIOT accesses are timed.

const CYC = [
  7,6,2,8,3,3,5,5,3,2,2,2,4,4,6,6, 2,5,2,8,4,4,6,6,2,4,2,7,4,4,7,7,
  6,6,2,8,3,3,5,5,4,2,2,2,4,4,6,6, 2,5,2,8,4,4,6,6,2,4,2,7,4,4,7,7,
  6,6,2,8,3,3,5,5,3,2,2,2,3,4,6,6, 2,5,2,8,4,4,6,6,2,4,2,7,4,4,7,7,
  6,6,2,8,3,3,5,5,4,2,2,2,5,4,6,6, 2,5,2,8,4,4,6,6,2,4,2,7,4,4,7,7,
  2,6,2,6,3,3,3,3,2,2,2,2,4,4,4,4, 2,6,2,6,4,4,4,4,2,5,2,5,5,5,5,5,
  2,6,2,6,3,3,3,3,2,2,2,2,4,4,4,4, 2,5,2,5,4,4,4,4,2,4,2,4,4,4,4,4,
  2,6,2,8,3,3,5,5,2,2,2,2,4,4,6,6, 2,5,2,8,4,4,6,6,2,4,2,7,4,4,7,7,
  2,6,2,8,3,3,5,5,2,2,2,2,4,4,6,6, 2,5,2,8,4,4,6,6,2,4,2,7,4,4,7,7,
];

const C = 0x01, Z = 0x02, I = 0x04, D = 0x08, B = 0x10, U = 0x20, V = 0x40, N = 0x80;

export class CPU6502 {
  constructor(bus) {
    this.bus = bus;
    this.a = 0; this.x = 0; this.y = 0; this.sp = 0xFD; this.p = U | I; this.pc = 0;
    this.cycles = 0;
    this.extra = 0;
    this.jammed = false;
  }

  reset() {
    this.sp = 0xFD; this.p = U | I; this.jammed = false;
    this.pc = this.rd(0xFFFC) | (this.rd(0xFFFD) << 8);
  }

  rd(a) { return this.bus.read(a & 0xFFFF); }
  wr(a, v) { this.bus.write(a & 0xFFFF, v & 0xFF); }

  fetch() { const v = this.rd(this.pc); this.pc = (this.pc + 1) & 0xFFFF; return v; }
  fetch16() { const lo = this.fetch(); return lo | (this.fetch() << 8); }

  // --- addressing ---
  zp() { return this.fetch(); }
  zpx() { return (this.fetch() + this.x) & 0xFF; }
  zpy() { return (this.fetch() + this.y) & 0xFF; }
  abs() { return this.fetch16(); }
  cross(base, addr, pen) {
    if (pen && ((base ^ addr) & 0xFF00)) { this.extra++; this.bus.clockAt++; }
    return addr;
  }
  absx(pen) { const b = this.fetch16(); return this.cross(b, (b + this.x) & 0xFFFF, pen); }
  absy(pen) { const b = this.fetch16(); return this.cross(b, (b + this.y) & 0xFFFF, pen); }
  indx() { const z = (this.fetch() + this.x) & 0xFF; return this.rd(z) | (this.rd((z + 1) & 0xFF) << 8); }
  indy(pen) {
    const z = this.fetch();
    const b = this.rd(z) | (this.rd((z + 1) & 0xFF) << 8);
    return this.cross(b, (b + this.y) & 0xFFFF, pen);
  }

  // --- flags ---
  nz(v) { this.p = (this.p & ~(N | Z)) | (v & N) | (v ? 0 : Z); return v; }
  setC(b) { this.p = b ? (this.p | C) : (this.p & ~C); }
  setV(b) { this.p = b ? (this.p | V) : (this.p & ~V); }

  push(v) { this.wr(0x100 | this.sp, v); this.sp = (this.sp - 1) & 0xFF; }
  pull() { this.sp = (this.sp + 1) & 0xFF; return this.rd(0x100 | this.sp); }

  // --- ALU ---
  adc(v) {
    const a = this.a, c = this.p & C;
    if (this.p & D) {
      let t = (a & 0x0F) + (v & 0x0F) + c;
      if (t > 9) t += 6;
      t = t <= 0x0F ? (t & 0x0F) + (a & 0xF0) + (v & 0xF0) : (t & 0x0F) + (a & 0xF0) + (v & 0xF0) + 0x10;
      this.p &= ~(N | Z | V | C);
      if (!((a + v + c) & 0xFF)) this.p |= Z;
      this.p |= t & N;
      if (((a ^ t) & 0x80) && !((a ^ v) & 0x80)) this.p |= V;
      if ((t & 0x1F0) > 0x90) t += 0x60;
      if ((t & 0xFF0) > 0xF0) this.p |= C;
      this.a = t & 0xFF;
    } else {
      const t = a + v + c;
      this.setV(~(a ^ v) & (a ^ t) & 0x80);
      this.setC(t > 0xFF);
      this.a = this.nz(t & 0xFF);
    }
  }
  sbc(v) {
    const a = this.a, bw = (this.p & C) ? 0 : 1;
    const t = a - v - bw;
    this.setV((a ^ v) & (a ^ t) & 0x80);
    this.setC(t >= 0);
    this.nz(t & 0xFF);
    if (this.p & D) {
      let lo = (a & 0x0F) - (v & 0x0F) - bw;
      let hi = (a & 0xF0) - (v & 0xF0);
      if (lo < 0) { lo -= 6; hi -= 0x10; }
      if (hi < 0) hi -= 0x60;
      this.a = ((hi & 0xF0) | (lo & 0x0F)) & 0xFF;
    } else {
      this.a = t & 0xFF;
    }
  }
  cmp(r, v) { const t = r - v; this.setC(t >= 0); this.nz(t & 0xFF); }
  asl(v) { this.setC(v & 0x80); return this.nz((v << 1) & 0xFF); }
  lsr(v) { this.setC(v & 1); return this.nz(v >> 1); }
  rol(v) { const c = this.p & C; this.setC(v & 0x80); return this.nz(((v << 1) | c) & 0xFF); }
  ror(v) { const c = this.p & C; this.setC(v & 1); return this.nz((v >> 1) | (c << 7)); }
  bit(v) { this.p = (this.p & ~(N | V | Z)) | (v & (N | V)) | ((this.a & v) ? 0 : Z); }

  branch(cond) {
    const off = this.fetch();
    if (cond) {
      const rel = off < 0x80 ? off : off - 256;
      const np = (this.pc + rel) & 0xFFFF;
      this.extra += ((np ^ this.pc) & 0xFF00) ? 2 : 1;
      this.pc = np;
    }
  }

  rmw(addr, fn) {
    const v = this.rd(addr);
    this.wr(addr, v);           // dummy write (as real hardware)
    const r = fn.call(this, v);
    this.wr(addr, r);
    return r;
  }

  step() {
    if (this.jammed) { this.cycles += 2; return 2; }
    const op = this.fetch();
    const base = CYC[op];
    this.extra = 0;
    this.bus.clockAt = this.cycles + base;
    let a, v;
    switch (op) {
      // LDA
      case 0xA9: this.a = this.nz(this.fetch()); break;
      case 0xA5: this.a = this.nz(this.rd(this.zp())); break;
      case 0xB5: this.a = this.nz(this.rd(this.zpx())); break;
      case 0xAD: this.a = this.nz(this.rd(this.abs())); break;
      case 0xBD: this.a = this.nz(this.rd(this.absx(true))); break;
      case 0xB9: this.a = this.nz(this.rd(this.absy(true))); break;
      case 0xA1: this.a = this.nz(this.rd(this.indx())); break;
      case 0xB1: this.a = this.nz(this.rd(this.indy(true))); break;
      // LDX
      case 0xA2: this.x = this.nz(this.fetch()); break;
      case 0xA6: this.x = this.nz(this.rd(this.zp())); break;
      case 0xB6: this.x = this.nz(this.rd(this.zpy())); break;
      case 0xAE: this.x = this.nz(this.rd(this.abs())); break;
      case 0xBE: this.x = this.nz(this.rd(this.absy(true))); break;
      // LDY
      case 0xA0: this.y = this.nz(this.fetch()); break;
      case 0xA4: this.y = this.nz(this.rd(this.zp())); break;
      case 0xB4: this.y = this.nz(this.rd(this.zpx())); break;
      case 0xAC: this.y = this.nz(this.rd(this.abs())); break;
      case 0xBC: this.y = this.nz(this.rd(this.absx(true))); break;
      // STA
      case 0x85: this.wr(this.zp(), this.a); break;
      case 0x95: this.wr(this.zpx(), this.a); break;
      case 0x8D: this.wr(this.abs(), this.a); break;
      case 0x9D: this.wr(this.absx(false), this.a); break;
      case 0x99: this.wr(this.absy(false), this.a); break;
      case 0x81: this.wr(this.indx(), this.a); break;
      case 0x91: this.wr(this.indy(false), this.a); break;
      // STX / STY
      case 0x86: this.wr(this.zp(), this.x); break;
      case 0x96: this.wr(this.zpy(), this.x); break;
      case 0x8E: this.wr(this.abs(), this.x); break;
      case 0x84: this.wr(this.zp(), this.y); break;
      case 0x94: this.wr(this.zpx(), this.y); break;
      case 0x8C: this.wr(this.abs(), this.y); break;
      // transfers
      case 0xAA: this.x = this.nz(this.a); break;
      case 0xA8: this.y = this.nz(this.a); break;
      case 0x8A: this.a = this.nz(this.x); break;
      case 0x98: this.a = this.nz(this.y); break;
      case 0xBA: this.x = this.nz(this.sp); break;
      case 0x9A: this.sp = this.x; break;
      // stack
      case 0x48: this.push(this.a); break;
      case 0x08: this.push(this.p | B | U); break;
      case 0x68: this.a = this.nz(this.pull()); break;
      case 0x28: this.p = (this.pull() & ~B) | U; break;
      // ADC
      case 0x69: this.adc(this.fetch()); break;
      case 0x65: this.adc(this.rd(this.zp())); break;
      case 0x75: this.adc(this.rd(this.zpx())); break;
      case 0x6D: this.adc(this.rd(this.abs())); break;
      case 0x7D: this.adc(this.rd(this.absx(true))); break;
      case 0x79: this.adc(this.rd(this.absy(true))); break;
      case 0x61: this.adc(this.rd(this.indx())); break;
      case 0x71: this.adc(this.rd(this.indy(true))); break;
      // SBC
      case 0xE9: case 0xEB: this.sbc(this.fetch()); break;
      case 0xE5: this.sbc(this.rd(this.zp())); break;
      case 0xF5: this.sbc(this.rd(this.zpx())); break;
      case 0xED: this.sbc(this.rd(this.abs())); break;
      case 0xFD: this.sbc(this.rd(this.absx(true))); break;
      case 0xF9: this.sbc(this.rd(this.absy(true))); break;
      case 0xE1: this.sbc(this.rd(this.indx())); break;
      case 0xF1: this.sbc(this.rd(this.indy(true))); break;
      // AND
      case 0x29: this.a = this.nz(this.a & this.fetch()); break;
      case 0x25: this.a = this.nz(this.a & this.rd(this.zp())); break;
      case 0x35: this.a = this.nz(this.a & this.rd(this.zpx())); break;
      case 0x2D: this.a = this.nz(this.a & this.rd(this.abs())); break;
      case 0x3D: this.a = this.nz(this.a & this.rd(this.absx(true))); break;
      case 0x39: this.a = this.nz(this.a & this.rd(this.absy(true))); break;
      case 0x21: this.a = this.nz(this.a & this.rd(this.indx())); break;
      case 0x31: this.a = this.nz(this.a & this.rd(this.indy(true))); break;
      // ORA
      case 0x09: this.a = this.nz(this.a | this.fetch()); break;
      case 0x05: this.a = this.nz(this.a | this.rd(this.zp())); break;
      case 0x15: this.a = this.nz(this.a | this.rd(this.zpx())); break;
      case 0x0D: this.a = this.nz(this.a | this.rd(this.abs())); break;
      case 0x1D: this.a = this.nz(this.a | this.rd(this.absx(true))); break;
      case 0x19: this.a = this.nz(this.a | this.rd(this.absy(true))); break;
      case 0x01: this.a = this.nz(this.a | this.rd(this.indx())); break;
      case 0x11: this.a = this.nz(this.a | this.rd(this.indy(true))); break;
      // EOR
      case 0x49: this.a = this.nz(this.a ^ this.fetch()); break;
      case 0x45: this.a = this.nz(this.a ^ this.rd(this.zp())); break;
      case 0x55: this.a = this.nz(this.a ^ this.rd(this.zpx())); break;
      case 0x4D: this.a = this.nz(this.a ^ this.rd(this.abs())); break;
      case 0x5D: this.a = this.nz(this.a ^ this.rd(this.absx(true))); break;
      case 0x59: this.a = this.nz(this.a ^ this.rd(this.absy(true))); break;
      case 0x41: this.a = this.nz(this.a ^ this.rd(this.indx())); break;
      case 0x51: this.a = this.nz(this.a ^ this.rd(this.indy(true))); break;
      // CMP / CPX / CPY
      case 0xC9: this.cmp(this.a, this.fetch()); break;
      case 0xC5: this.cmp(this.a, this.rd(this.zp())); break;
      case 0xD5: this.cmp(this.a, this.rd(this.zpx())); break;
      case 0xCD: this.cmp(this.a, this.rd(this.abs())); break;
      case 0xDD: this.cmp(this.a, this.rd(this.absx(true))); break;
      case 0xD9: this.cmp(this.a, this.rd(this.absy(true))); break;
      case 0xC1: this.cmp(this.a, this.rd(this.indx())); break;
      case 0xD1: this.cmp(this.a, this.rd(this.indy(true))); break;
      case 0xE0: this.cmp(this.x, this.fetch()); break;
      case 0xE4: this.cmp(this.x, this.rd(this.zp())); break;
      case 0xEC: this.cmp(this.x, this.rd(this.abs())); break;
      case 0xC0: this.cmp(this.y, this.fetch()); break;
      case 0xC4: this.cmp(this.y, this.rd(this.zp())); break;
      case 0xCC: this.cmp(this.y, this.rd(this.abs())); break;
      // BIT
      case 0x24: this.bit(this.rd(this.zp())); break;
      case 0x2C: this.bit(this.rd(this.abs())); break;
      // INC / DEC
      case 0xE6: this.rmw(this.zp(), v => this.nz((v + 1) & 0xFF)); break;
      case 0xF6: this.rmw(this.zpx(), v => this.nz((v + 1) & 0xFF)); break;
      case 0xEE: this.rmw(this.abs(), v => this.nz((v + 1) & 0xFF)); break;
      case 0xFE: this.rmw(this.absx(false), v => this.nz((v + 1) & 0xFF)); break;
      case 0xC6: this.rmw(this.zp(), v => this.nz((v - 1) & 0xFF)); break;
      case 0xD6: this.rmw(this.zpx(), v => this.nz((v - 1) & 0xFF)); break;
      case 0xCE: this.rmw(this.abs(), v => this.nz((v - 1) & 0xFF)); break;
      case 0xDE: this.rmw(this.absx(false), v => this.nz((v - 1) & 0xFF)); break;
      case 0xE8: this.x = this.nz((this.x + 1) & 0xFF); break;
      case 0xC8: this.y = this.nz((this.y + 1) & 0xFF); break;
      case 0xCA: this.x = this.nz((this.x - 1) & 0xFF); break;
      case 0x88: this.y = this.nz((this.y - 1) & 0xFF); break;
      // shifts
      case 0x0A: this.a = this.asl(this.a); break;
      case 0x06: this.rmw(this.zp(), this.asl); break;
      case 0x16: this.rmw(this.zpx(), this.asl); break;
      case 0x0E: this.rmw(this.abs(), this.asl); break;
      case 0x1E: this.rmw(this.absx(false), this.asl); break;
      case 0x4A: this.a = this.lsr(this.a); break;
      case 0x46: this.rmw(this.zp(), this.lsr); break;
      case 0x56: this.rmw(this.zpx(), this.lsr); break;
      case 0x4E: this.rmw(this.abs(), this.lsr); break;
      case 0x5E: this.rmw(this.absx(false), this.lsr); break;
      case 0x2A: this.a = this.rol(this.a); break;
      case 0x26: this.rmw(this.zp(), this.rol); break;
      case 0x36: this.rmw(this.zpx(), this.rol); break;
      case 0x2E: this.rmw(this.abs(), this.rol); break;
      case 0x3E: this.rmw(this.absx(false), this.rol); break;
      case 0x6A: this.a = this.ror(this.a); break;
      case 0x66: this.rmw(this.zp(), this.ror); break;
      case 0x76: this.rmw(this.zpx(), this.ror); break;
      case 0x6E: this.rmw(this.abs(), this.ror); break;
      case 0x7E: this.rmw(this.absx(false), this.ror); break;
      // jumps
      case 0x4C: this.pc = this.abs(); break;
      case 0x6C: {
        a = this.abs();
        this.pc = this.rd(a) | (this.rd((a & 0xFF00) | ((a + 1) & 0xFF)) << 8);
        break;
      }
      case 0x20: {
        a = this.abs();
        const r = (this.pc - 1) & 0xFFFF;
        this.push(r >> 8); this.push(r & 0xFF);
        this.pc = a;
        break;
      }
      case 0x60: { const lo = this.pull(); this.pc = ((lo | (this.pull() << 8)) + 1) & 0xFFFF; break; }
      case 0x40: {
        this.p = (this.pull() & ~B) | U;
        const lo = this.pull(); this.pc = lo | (this.pull() << 8);
        break;
      }
      case 0x00: {
        this.pc = (this.pc + 1) & 0xFFFF;
        this.push(this.pc >> 8); this.push(this.pc & 0xFF);
        this.push(this.p | B | U);
        this.p |= I;
        this.pc = this.rd(0xFFFE) | (this.rd(0xFFFF) << 8);
        break;
      }
      // branches
      case 0x10: this.branch(!(this.p & N)); break;
      case 0x30: this.branch(this.p & N); break;
      case 0x50: this.branch(!(this.p & V)); break;
      case 0x70: this.branch(this.p & V); break;
      case 0x90: this.branch(!(this.p & C)); break;
      case 0xB0: this.branch(this.p & C); break;
      case 0xD0: this.branch(!(this.p & Z)); break;
      case 0xF0: this.branch(this.p & Z); break;
      // flags
      case 0x18: this.p &= ~C; break;
      case 0x38: this.p |= C; break;
      case 0x58: this.p &= ~I; break;
      case 0x78: this.p |= I; break;
      case 0xB8: this.p &= ~V; break;
      case 0xD8: this.p &= ~D; break;
      case 0xF8: this.p |= D; break;
      case 0xEA: break;

      // --- common undocumented opcodes ---
      case 0x1A: case 0x3A: case 0x5A: case 0x7A: case 0xDA: case 0xFA: break;
      case 0x80: case 0x82: case 0x89: case 0xC2: case 0xE2: this.fetch(); break;
      case 0x04: case 0x44: case 0x64: this.rd(this.zp()); break;
      case 0x14: case 0x34: case 0x54: case 0x74: case 0xD4: case 0xF4: this.rd(this.zpx()); break;
      case 0x0C: this.rd(this.abs()); break;
      case 0x1C: case 0x3C: case 0x5C: case 0x7C: case 0xDC: case 0xFC: this.rd(this.absx(true)); break;
      case 0xA7: this.a = this.x = this.nz(this.rd(this.zp())); break;
      case 0xB7: this.a = this.x = this.nz(this.rd(this.zpy())); break;
      case 0xAF: this.a = this.x = this.nz(this.rd(this.abs())); break;
      case 0xBF: this.a = this.x = this.nz(this.rd(this.absy(true))); break;
      case 0xA3: this.a = this.x = this.nz(this.rd(this.indx())); break;
      case 0xB3: this.a = this.x = this.nz(this.rd(this.indy(true))); break;
      case 0x87: this.wr(this.zp(), this.a & this.x); break;
      case 0x97: this.wr(this.zpy(), this.a & this.x); break;
      case 0x8F: this.wr(this.abs(), this.a & this.x); break;
      case 0x83: this.wr(this.indx(), this.a & this.x); break;
      case 0xC7: case 0xD7: case 0xCF: case 0xDF: case 0xDB: case 0xC3: case 0xD3: {
        a = this.undocAddr(op);
        v = this.rmw(a, x => (x - 1) & 0xFF);
        this.cmp(this.a, v);
        break;
      }
      case 0xE7: case 0xF7: case 0xEF: case 0xFF: case 0xFB: case 0xE3: case 0xF3: {
        a = this.undocAddr(op);
        v = this.rmw(a, x => (x + 1) & 0xFF);
        this.sbc(v);
        break;
      }
      case 0x07: case 0x17: case 0x0F: case 0x1F: case 0x1B: case 0x03: case 0x13:
        v = this.rmw(this.undocAddr(op), this.asl); this.a = this.nz(this.a | v); break;
      case 0x27: case 0x37: case 0x2F: case 0x3F: case 0x3B: case 0x23: case 0x33:
        v = this.rmw(this.undocAddr(op), this.rol); this.a = this.nz(this.a & v); break;
      case 0x47: case 0x57: case 0x4F: case 0x5F: case 0x5B: case 0x43: case 0x53:
        v = this.rmw(this.undocAddr(op), this.lsr); this.a = this.nz(this.a ^ v); break;
      case 0x67: case 0x77: case 0x6F: case 0x7F: case 0x7B: case 0x63: case 0x73:
        v = this.rmw(this.undocAddr(op), this.ror); this.adc(v); break;
      case 0x0B: case 0x2B: this.a = this.nz(this.a & this.fetch()); this.setC(this.a & 0x80); break;
      case 0x4B: this.a = this.lsr(this.a & this.fetch()); break;
      case 0xCB: { const t = (this.a & this.x) - this.fetch(); this.setC(t >= 0); this.x = this.nz(t & 0xFF); break; }

      default:
        this.jammed = true;
        break;
    }
    const total = base + this.extra;
    this.cycles += total;
    return total;
  }

  // addressing mode for the RMW-class undocumented opcodes (column 3/7/B/F)
  undocAddr(op) {
    switch (op & 0x1F) {
      case 0x03: return this.indx();
      case 0x07: return this.zp();
      case 0x0F: return this.abs();
      case 0x13: return this.indy(false);
      case 0x17: return this.zpx();
      case 0x1B: return this.absy(false);
      case 0x1F: return this.absx(false);
    }
    return 0;
  }
}
