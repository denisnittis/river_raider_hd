// Atari 2600 machine: 6507 + TIA + RIOT (RAM, timer, I/O) + 2K/4K cartridge.
import { CPU6502 } from './cpu6502.js';
import { TIA } from './tia.js';

export class Atari2600 {
  constructor(rom) {
    if (rom.length !== 2048 && rom.length !== 4096) throw new Error('Only 2K/4K cartridges are supported');
    this.rom = rom;
    this.romMask = rom.length - 1;
    this.ram = new Uint8Array(128);
    this.tia = new TIA();
    this.cpu = new CPU6502(this);
    this.clockAt = 0;
    this.wsync = false;

    // RIOT
    this.swcha = 0xFF;        // joystick bits (0 = pressed): P0 R L D U in bits 7..4
    this.swchb = 0x0B;        // console: color, no reset/select, difficulty A=0
    this.timerValue = 0xFF; this.timerInterval = 1024; this.timerSet = 0; this.timint = 0;
    for (let i = 0; i < 128; i++) this.ram[i] = (Math.random() * 256) | 0;
    this.cpu.reset();
  }

  sync() { this.tia.catchUp(this.clockAt * 3); }

  read(a) {
    if (a & 0x1000) return this.rom[a & this.romMask];
    if (!(a & 0x80)) { this.sync(); return this.tia.read(a); }
    if (!(a & 0x200)) return this.ram[a & 0x7F];
    switch (a & 0x07) {
      case 0: return this.swcha;
      case 2: return this.swchb;
      case 4: case 6: return this.readTimer();
      case 5: case 7: { this.readTimer(); const f = this.timint; this.timint &= 0x7F; return f; }
    }
    return 0;
  }

  write(a, v) {
    if (a & 0x1000) return;
    if (!(a & 0x80)) {
      this.sync();
      if (this.tia.write(a, v)) this.wsync = true;
      return;
    }
    if (!(a & 0x200)) { this.ram[a & 0x7F] = v; return; }
    if ((a & 0x14) === 0x14) {
      this.timerInterval = [1, 8, 64, 1024][a & 3];
      this.timerValue = v; this.timerSet = this.clockAt; this.timint = 0;
    }
  }

  readTimer() {
    const el = Math.max(0, this.clockAt - this.timerSet);
    const v = this.timerValue - Math.floor(el / this.timerInterval);
    if (v >= 0) return v;
    // underflow: counts down once per cycle afterwards
    this.timint = 0xC0;
    const after = el - (this.timerValue + 1) * this.timerInterval;
    return (0xFF - after) & 0xFF;
  }

  // run until the TIA reports a finished frame (VSYNC)
  runFrame() {
    const tia = this.tia, cpu = this.cpu;
    tia.frameReady = false;
    const limit = cpu.cycles + 76 * 400;
    while (!tia.frameReady && cpu.cycles < limit) {
      cpu.step();
      if (this.wsync) {
        this.wsync = false;
        const r = cpu.cycles % 76;
        if (r) cpu.cycles += 76 - r;
      }
      tia.catchUp(cpu.cycles * 3);
    }
  }

  setInput({ up, down, left, right, fire, reset, select }) {
    let a = 0xFF;
    if (right) a &= ~0x80; if (left) a &= ~0x40; if (down) a &= ~0x20; if (up) a &= ~0x10;
    this.swcha = a;
    this.tia.inpt4 = fire ? 0x00 : 0x80;
    let b = this.swchb | 0x03;
    if (reset) b &= ~0x01; if (select) b &= ~0x02;
    this.swchb = b;
  }

  takeAudio() {
    const t = this.tia, s = t.audio.slice(0, t.audioLen);
    t.audioLen = 0;
    return s;
  }
}
