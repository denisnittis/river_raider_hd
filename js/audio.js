// Plays the TIA samples produced by each emulated frame.
// Each frame's samples are resampled to exactly 1/50 s of output audio.
export class AudioOut {
  constructor() {
    this.ctx = null;
    this.ring = new Float32Array(48000);
    this.r = 0; this.w = 0;
    this.muted = false;
    this.hpX = 0; this.hpY = 0;
  }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    const node = this.ctx.createScriptProcessor(1024, 0, 1);
    node.onaudioprocess = e => {
      const out = e.outputBuffer.getChannelData(0);
      for (let i = 0; i < out.length; i++) {
        if (this.r !== this.w) { out[i] = this.muted ? 0 : this.ring[this.r]; this.r = (this.r + 1) % this.ring.length; }
        else out[i] = 0;
      }
    };
    node.connect(this.ctx.destination);
  }

  get buffered() { return (this.w - this.r + this.ring.length) % this.ring.length; }

  push(samples, fps) {
    if (!this.ctx || !samples.length) return;
    const outN = Math.round(this.ctx.sampleRate / fps);
    if (this.buffered > this.ctx.sampleRate * 0.25) return;   // too far ahead: drop
    for (let i = 0; i < outN; i++) {
      const p = i * samples.length / outN, k = p | 0, f = p - k;
      const v = samples[k] * (1 - f) + (samples[Math.min(k + 1, samples.length - 1)] * f);
      // DC blocker (TIA output is unipolar)
      const y = v - this.hpX + 0.995 * this.hpY;
      this.hpX = v; this.hpY = y;
      this.ring[this.w] = y * 0.8;
      this.w = (this.w + 1) % this.ring.length;
    }
  }
}
