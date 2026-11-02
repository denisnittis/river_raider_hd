import { Atari2600 } from './atari.js';
import { AudioOut } from './audio.js';
import { RemasterRenderer, renderOriginal, TOP, BOTTOM } from './render/renderer.js';
import { initTouchControls, touchState } from './touch.js';

const FPS = 50;   // PAL cartridge
// River Raid keeps its terrain scroll position (0..31) in RAM $8B; the renderers
// only read it so textures move exactly with the game
const SCROLL_ADDR = 0x0B;
const canvas = document.getElementById('screen');
const statusEl = document.getElementById('status');
const audio = new AudioOut();
const MODES = ['remaster', 'original'];
const LABELS = { remaster: 'Remaster', original: 'Original' };
let machine = null, renderers = {}, mode = 'remaster', paused = false;

const origTmp = document.createElement('canvas');
origTmp.width = 160; origTmp.height = BOTTOM - TOP;
const origImg = origTmp.getContext('2d').createImageData(160, BOTTOM - TOP);

// --- input
const keys = new Set();
const latched = new Map();   // keeps very short taps alive for a few frames

const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  Space: 'fire', KeyZ: 'fire', ControlLeft: 'fire', ControlRight: 'fire',
  Enter: 'reset', Backspace: 'select',
};

addEventListener('keydown', e => {
  audio.start();
  if (KEYMAP[e.code]) { keys.add(KEYMAP[e.code]); latched.set(KEYMAP[e.code], 3); e.preventDefault(); }
  if (e.code === 'KeyH') toggleMode();
  if (e.code === 'KeyP') togglePause();
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'KeyF') toggleFullscreen();
  if (e.code === 'F2' && renderers[mode]) { renderers[mode].debug = !renderers[mode].debug; e.preventDefault(); }
});
addEventListener('keyup', e => { if (KEYMAP[e.code]) keys.delete(KEYMAP[e.code]); });
addEventListener('pointerdown', () => audio.start());

function readInput() {
  const s = { up: false, down: false, left: false, right: false, fire: false, reset: false, select: false };
  for (const k of keys) s[k] = true;
  for (const [k, n] of latched) { s[k] = true; if (n <= 1) latched.delete(k); else latched.set(k, n - 1); }
  
  // Virtual touch controls
  for (const [k, v] of Object.entries(touchState)) {
    if (v) s[k] = true;
  }

  if (window.forceInput) Object.assign(s, window.forceInput);
  for (const gp of navigator.getGamepads ? navigator.getGamepads() : []) {
    if (!gp) continue;
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0, b = i => gp.buttons[i] && gp.buttons[i].pressed;
    s.left ||= ax < -0.4 || b(14); s.right ||= ax > 0.4 || b(15);
    s.up ||= ay < -0.4 || b(12); s.down ||= ay > 0.4 || b(13);
    s.fire ||= b(0) || b(1) || b(2) || b(3);
    s.reset ||= b(9); s.select ||= b(8);
  }
  return s;
}

function toggleMode() {
  mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
  const label = LABELS[mode];
  const btn = document.getElementById('mode');
  if (btn) btn.textContent = label;
  const btnTouch = document.getElementById('btn-mode-touch');
  if (btnTouch) {
    btnTouch.textContent = mode === 'remaster' ? '✨ HD' : '🕹 Retro';
    btnTouch.classList.toggle('active', mode === 'remaster');
  }
  return mode;
}

function togglePause() {
  paused = !paused;
  const btnTouch = document.getElementById('btn-pause-touch');
  if (btnTouch) {
    btnTouch.textContent = paused ? '▶ Continuar' : '⏸ Pausa';
    btnTouch.classList.toggle('active', paused);
  }
  return paused;
}

function toggleMute() {
  audio.muted = !audio.muted;
  const btnTouch = document.getElementById('btn-sound-touch');
  if (btnTouch) {
    btnTouch.textContent = audio.muted ? '🔇 Mudo' : '🔊 Som';
    btnTouch.classList.toggle('muted', audio.muted);
  }
  return audio.muted;
}

function toggleFullscreen() {
  const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  if (isFs) {
    if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  } else {
    const el = document.getElementById('wrap') || document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  }
}

function triggerReset() {
  latched.set('reset', 8);
}

function triggerSelect() {
  latched.set('select', 8);
}

// Setup touch controls
initTouchControls({
  onAudioStart: () => audio.start(),
  onToggleMode: toggleMode,
  onTogglePause: togglePause,
  onToggleMute: toggleMute,
  onToggleFullscreen: toggleFullscreen,
  onReset: triggerReset,
  onSelect: triggerSelect,
});

// Desktop toggle button for touch controls
const toggleTouchBtn = document.getElementById('toggle-touch-btn');
if (toggleTouchBtn) {
  const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  if (!isTouchDevice) {
    toggleTouchBtn.style.display = 'inline-block';
    toggleTouchBtn.addEventListener('click', () => {
      document.body.classList.toggle('hide-touch-ui');
      toggleTouchBtn.textContent = document.body.classList.contains('hide-touch-ui') ? '🎮 Touch: Off' : '🎮 Touch: On';
    });
  }
}

function draw(time) {
  const frame = machine.tia.out;
  frame.scrollPos = machine.ram[SCROLL_ADDR];
  if (renderers[mode]) renderers[mode].render(frame, time);
  else renderOriginal(canvas.getContext('2d'), frame, origImg, origTmp);
}
document.getElementById('mode')?.addEventListener('click', toggleMode);

// --- main loop
let last = performance.now(), acc = 0;
function loop(now) {
  requestAnimationFrame(loop);
  if (!machine) return;
  acc += Math.min(now - last, 100); last = now;
  let ran = false;
  while (acc >= 1000 / FPS) {
    acc -= 1000 / FPS;
    if (paused) continue;
    machine.setInput(readInput());
    machine.runFrame();
    audio.push(machine.takeAudio(), FPS);
    ran = true;
  }
  if (!ran && !paused) return;
  draw(now / 1000);
}

function boot(bytes) {
  const rom = new Uint8Array(bytes);
  machine = new Atari2600(rom);
  renderers = {
    remaster: new RemasterRenderer(canvas, rom),
  };
  const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  statusEl.textContent = isTouch
    ? 'Toque em START para iniciar · D-Pad = pilotar · FIRE = atirar'
    : 'Enter / START = iniciar · Setas / D-Pad = voar · Espaço / FIRE = atirar · H = visual';
  
  const modeBtn = document.getElementById('mode');
  if (modeBtn) modeBtn.textContent = LABELS[mode];
  window.machine = machine; window.renderers = renderers;
}

fetch('roms/riverraid.a26').then(r => {
  if (!r.ok) throw new Error();
  return r.arrayBuffer();
}).then(boot).catch(() => {
  statusEl.textContent = 'Escolha o arquivo da ROM (.a26):';
  document.getElementById('romfile').hidden = false;
});
document.getElementById('romfile')?.addEventListener('change', async e => {
  const f = e.target.files[0];
  if (f) boot(await f.arrayBuffer());
});
requestAnimationFrame(loop);

// test hook: run n frames with a fixed input and render the last one
window.stepFrames = (n, input = {}) => {
  for (let i = 0; i < n; i++) { machine.setInput({ ...input }); machine.runFrame(); machine.takeAudio(); }
  draw(performance.now() / 1000);
};
window.setMode = m => { mode = m; document.getElementById('mode').textContent = LABELS[mode]; };
