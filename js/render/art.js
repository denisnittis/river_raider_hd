// HD art for each named shape. Every function draws inside the sprite's
// original box (W x H in HD pixels); art may spill a little into the padding.
// A PNG in assets/sprites/<name>.png (listed in manifest.json) overrides it.

export const PAD = 24;

const lin = (ctx, x0, y0, x1, y1, stops) => {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
};
const rad = (ctx, x, y, r, stops) => {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
};
function poly(ctx, pts, fill, stroke, lw = 1.5) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// --- player fighter, top view, nose up. bank: -1 left, 0 level, 1 right
function player(ctx, W, H, bank) {
  const cx = bank === 0 ? 36 : bank < 0 ? 28 : 36;   // shape centre column
  const L = bank < 0 ? 0.55 : 1, R = bank > 0 ? 0.55 : 1;   // wing span factors
  const span = 28;
  const body = lin(ctx, cx - 8, 0, cx + 8, 0, [[0, '#a8761c'], [0.45, '#ffe58a'], [0.6, '#f6cf55'], [1, '#9c6a14']]);
  const wing = lin(ctx, 0, H * 0.35, 0, H * 0.65, [[0, '#f2c94c'], [1, '#b88320']]);
  // main wings
  poly(ctx, [[cx - 3, H * 0.30], [cx - span * L, H * 0.56], [cx - span * L, H * 0.66], [cx - 4, H * 0.60]], wing, '#5a3d08');
  poly(ctx, [[cx + 3, H * 0.30], [cx + span * R, H * 0.56], [cx + span * R, H * 0.66], [cx + 4, H * 0.60]], wing, '#5a3d08');
  // wing stripes
  ctx.fillStyle = 'rgba(180,40,30,0.85)';
  poly(ctx, [[cx - span * L * 0.72, H * 0.48], [cx - span * L * 0.86, H * 0.53], [cx - span * L * 0.86, H * 0.63], [cx - span * L * 0.72, H * 0.62]], 'rgba(190,45,30,0.9)');
  poly(ctx, [[cx + span * R * 0.72, H * 0.48], [cx + span * R * 0.86, H * 0.53], [cx + span * R * 0.86, H * 0.63], [cx + span * R * 0.72, H * 0.62]], 'rgba(190,45,30,0.9)');
  // tail planes
  poly(ctx, [[cx - 2, H * 0.78], [cx - 15 * L, H * 0.92], [cx - 15 * L, H * 0.99], [cx - 2, H * 0.95]], wing, '#5a3d08');
  poly(ctx, [[cx + 2, H * 0.78], [cx + 15 * R, H * 0.92], [cx + 15 * R, H * 0.99], [cx + 2, H * 0.95]], wing, '#5a3d08');
  // fuselage
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.bezierCurveTo(cx + 4, H * 0.12, cx + 6, H * 0.25, cx + 6, H * 0.42);
  ctx.lineTo(cx + 5, H * 0.96); ctx.lineTo(cx - 5, H * 0.96); ctx.lineTo(cx - 6, H * 0.42);
  ctx.bezierCurveTo(cx - 6, H * 0.25, cx - 4, H * 0.12, cx, 0);
  ctx.fillStyle = body; ctx.fill(); ctx.strokeStyle = '#5a3d08'; ctx.lineWidth = 1.5; ctx.stroke();
  // canopy
  ctx.beginPath(); ctx.ellipse(cx, H * 0.30, 3.6, 7, 0, 0, Math.PI * 2);
  ctx.fillStyle = lin(ctx, cx - 4, 0, cx + 4, 0, [[0, '#0b2a4a'], [0.5, '#4fb6ff'], [1, '#0b2a4a']]); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(cx - 1.5, H * 0.22, 1.5, 5);
  // engine glow
  ctx.fillStyle = rad(ctx, cx, H * 0.98, 9, [[0, 'rgba(255,255,220,1)'], [0.4, 'rgba(255,170,40,0.9)'], [1, 'rgba(255,80,0,0)']]);
  ctx.beginPath(); ctx.arc(cx, H * 0.98, 9, 0, Math.PI * 2); ctx.fill();
}

// --- helicopter, side view, nose right. frame toggles the rotor
function heli(ctx, W, H, frame) {
  const bodyG = lin(ctx, 0, H * 0.3, 0, H * 0.8, [[0, '#9bbf5e'], [0.5, '#5f7d32'], [1, '#2f4318']]);
  // tail boom
  poly(ctx, [[2, H * 0.42], [30, H * 0.48], [30, H * 0.62], [4, H * 0.55]], bodyG, '#1e2b0f');
  poly(ctx, [[0, H * 0.30], [6, H * 0.30], [9, H * 0.50], [2, H * 0.52]], '#4b6626', '#1e2b0f');
  // tail rotor
  ctx.strokeStyle = 'rgba(40,40,40,0.8)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(4, H * 0.40, frame ? 2 : 7, frame ? 7 : 2, 0, 0, Math.PI * 2); ctx.stroke();
  // body
  ctx.beginPath(); ctx.ellipse(44, H * 0.56, 20, H * 0.24, 0, 0, Math.PI * 2);
  ctx.fillStyle = bodyG; ctx.fill(); ctx.strokeStyle = '#1e2b0f'; ctx.lineWidth = 1.5; ctx.stroke();
  // cockpit glass
  ctx.beginPath(); ctx.ellipse(54, H * 0.50, 9, H * 0.15, 0.2, -Math.PI * 0.6, Math.PI * 0.55);
  ctx.fillStyle = lin(ctx, 46, H * 0.35, 62, H * 0.65, [[0, '#d7f4ff'], [0.4, '#54a9d6'], [1, '#123c5c']]); ctx.fill();
  // stripe
  ctx.fillStyle = '#f2c230'; ctx.fillRect(28, H * 0.60, 14, 2.5);
  // mast + skids
  ctx.fillStyle = '#2b2b2b'; ctx.fillRect(40, H * 0.18, 4, H * 0.16);
  ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(30, H * 0.95); ctx.lineTo(60, H * 0.95); ctx.quadraticCurveTo(64, H * 0.95, 64, H * 0.88); ctx.stroke();
  ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(36, H * 0.78); ctx.lineTo(34, H * 0.95); ctx.moveTo(52, H * 0.78); ctx.lineTo(54, H * 0.95); ctx.stroke();
  // main rotor (blurred disc + blade)
  ctx.fillStyle = 'rgba(30,30,30,0.18)';
  ctx.beginPath(); ctx.ellipse(42, H * 0.14, 34, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1d1d1d';
  if (frame) ctx.fillRect(8, H * 0.11, 68, 3); else ctx.fillRect(22, H * 0.11, 40, 3);
}

// --- tanker ship, side view, bow right
function ship(ctx, W, H) {
  // wake
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.ellipse(W * 0.5, H * 0.98, W * 0.55, 5, 0, 0, Math.PI * 2); ctx.fill();
  // hull
  poly(ctx, [[0, H * 0.5], [W, H * 0.5], [W * 0.86, H], [W * 0.08, H]],
    lin(ctx, 0, H * 0.5, 0, H, [[0, '#3c3f46'], [0.55, '#25272c'], [0.56, '#a3271f'], [1, '#6b140f']]), '#101114');
  ctx.fillStyle = '#d9d9d9'; ctx.fillRect(4, H * 0.5, W - 10, 2);
  // deck pipes
  ctx.strokeStyle = '#8a8f99'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(W * 0.42, H * 0.46); ctx.lineTo(W * 0.95, H * 0.46); ctx.stroke();
  for (let i = 0; i < 4; i++) { ctx.fillStyle = '#c9ccd2'; ctx.fillRect(W * (0.48 + i * 0.12), H * 0.38, 6, H * 0.1); }
  // superstructure
  poly(ctx, [[W * 0.10, H * 0.5], [W * 0.10, H * 0.30], [W * 0.36, H * 0.30], [W * 0.38, H * 0.5]],
    lin(ctx, 0, H * 0.3, 0, H * 0.5, [[0, '#ffffff'], [1, '#b8bcc4']]), '#4a4d55');
  poly(ctx, [[W * 0.15, H * 0.30], [W * 0.15, H * 0.16], [W * 0.31, H * 0.16], [W * 0.31, H * 0.30]], '#eef0f3', '#4a4d55');
  ctx.fillStyle = '#21374f';
  for (let i = 0; i < 4; i++) ctx.fillRect(W * 0.17 + i * 9, H * 0.21, 6, 3);
  for (let i = 0; i < 6; i++) ctx.fillRect(W * 0.12 + i * 7.5, H * 0.37, 5, 3);
  // funnel + mast
  poly(ctx, [[W * 0.18, H * 0.16], [W * 0.20, 0], [W * 0.27, 0], [W * 0.27, H * 0.16]], '#c0392b', '#5a130d');
  ctx.fillStyle = '#111'; ctx.fillRect(W * 0.20, 0, W * 0.07, 3);
}

// --- enemy jet, side view, nose left
function jet(ctx, W, H) {
  const g = lin(ctx, 0, H * 0.2, 0, H * 0.8, [[0, '#d8e6f5'], [0.5, '#7f9bbb'], [1, '#3f5674']]);
  // tail fin
  poly(ctx, [[W * 0.78, H * 0.45], [W * 0.90, 0], [W, 0], [W, H * 0.5]], '#5f7ea3', '#22334a');
  // fuselage
  ctx.beginPath();
  ctx.moveTo(0, H * 0.48);
  ctx.quadraticCurveTo(W * 0.15, H * 0.28, W * 0.4, H * 0.32);
  ctx.lineTo(W, H * 0.40); ctx.lineTo(W, H * 0.66); ctx.lineTo(W * 0.35, H * 0.70);
  ctx.quadraticCurveTo(W * 0.12, H * 0.66, 0, H * 0.48);
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#22334a'; ctx.lineWidth = 1.5; ctx.stroke();
  // wing
  poly(ctx, [[W * 0.36, H * 0.6], [W * 0.62, H * 0.6], [W * 0.70, H], [W * 0.52, H]], '#4d6a8f', '#22334a');
  // canopy
  ctx.beginPath(); ctx.ellipse(W * 0.27, H * 0.36, 8, 3.5, -0.15, 0, Math.PI * 2);
  ctx.fillStyle = lin(ctx, 0, H * 0.2, 0, H * 0.5, [[0, '#ffe9a8'], [1, '#c07a10']]); ctx.fill();
  // red star / insignia
  ctx.fillStyle = '#d6332a'; ctx.beginPath(); ctx.arc(W * 0.72, H * 0.53, 3, 0, Math.PI * 2); ctx.fill();
  // afterburner
  ctx.fillStyle = rad(ctx, W, H * 0.53, 10, [[0, 'rgba(255,255,210,0.95)'], [0.5, 'rgba(255,140,30,0.6)'], [1, 'rgba(255,60,0,0)']]);
  ctx.beginPath(); ctx.arc(W + 2, H * 0.53, 10, 0, Math.PI * 2); ctx.fill();
}

// --- house with tree (side/front). mirrored for variant b
function house(ctx, W, H) {
  const u = W / 8, r = H / 19;            // shape column / row in HD px
  // tree (rows 9..18, centred on column 5)
  const tx = 5.5 * u, ty = 9 * r;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(tx + 6, H - 2, 2.2 * u, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5b3a1e'; ctx.fillRect(tx - 4, ty + 7 * r, 8, 3 * r);
  const leaf = rad(ctx, tx - u * 0.6, ty + 3.5 * r, 3 * u, [[0, '#7fd35a'], [0.6, '#3c8f2e'], [1, '#1d5419']]);
  ctx.fillStyle = leaf;
  [[0, 2.2, 1.2], [-0.9, 4.2, 1.4], [0.9, 4.2, 1.4], [0, 5.6, 1.6], [0, 3.6, 1.6]].forEach(([dx, dy, rr]) => {
    ctx.beginPath(); ctx.arc(tx + dx * u, ty + dy * r, rr * u, 0, Math.PI * 2); ctx.fill();
  });
  // house (rows 0..6, columns 0..6)
  const hx = 0, hw = 7 * u, roofH = 2 * r, wallY = 2 * r, wallH = 5 * r;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(hx + 8, wallY + 8, hw, wallH);
  ctx.fillStyle = lin(ctx, 0, wallY, 0, wallY + wallH, [[0, '#f4ead7'], [1, '#cbb894']]);
  ctx.fillRect(hx, wallY, hw, wallH);
  ctx.strokeStyle = '#6b5a3e'; ctx.lineWidth = 1.5; ctx.strokeRect(hx, wallY, hw, wallH);
  poly(ctx, [[hx - 6, wallY + 2], [hx + 2 * u, 0], [hx + 5 * u, 0], [hx + hw + 6, wallY + 2]],
    lin(ctx, 0, 0, 0, roofH, [[0, '#e0573c'], [1, '#8e2717']]), '#5a160c');
  ctx.strokeStyle = 'rgba(90,22,12,0.5)'; ctx.lineWidth = 1;
  for (let i = 1; i < 3; i++) { ctx.beginPath(); ctx.moveTo(hx, roofH * i / 3); ctx.lineTo(hx + hw, roofH * i / 3); ctx.stroke(); }
  // windows + door
  ctx.fillStyle = '#2d5b85';
  [1, 3, 5].forEach(c => { ctx.fillRect(c * u + 3, wallY + r * 1.2, u - 6, r * 1.6); });
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  [1, 3, 5].forEach(c => { ctx.fillRect(c * u + 4, wallY + r * 1.3, 3, r * 0.8); });
  ctx.fillStyle = '#6b3d1c'; ctx.fillRect(2 * u + 2, wallY + r * 3.1, u - 4, wallH - r * 3.1);
}

// --- bridge, top view: road crossing left-right over the river
function bridge(ctx, W, H) {
  const r = H / 23;
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(6, r + 8, W, H - 2 * r);
  // girders
  ctx.fillStyle = lin(ctx, 0, 0, 0, H, [[0, '#6d6f74'], [0.1, '#a9acb3'], [0.12, '#55575c'], [0.88, '#55575c'], [0.9, '#a9acb3'], [1, '#6d6f74']]);
  ctx.fillRect(0, r, W, H - 2 * r);
  // asphalt
  ctx.fillStyle = lin(ctx, 0, r * 3, 0, H - r * 3, [[0, '#3a3a3d'], [0.5, '#46464a'], [1, '#333336']]);
  ctx.fillRect(0, r * 3, W, H - r * 6);
  // lane markings
  ctx.fillStyle = '#f1c40f';
  for (let x = 4; x < W; x += 36) ctx.fillRect(x, H / 2 - 2, 20, 4);
  ctx.fillStyle = '#e8e8e8'; ctx.fillRect(0, r * 3.6, W, 2); ctx.fillRect(0, H - r * 3.6 - 2, W, 2);
  // rails and posts
  ctx.fillStyle = '#c9ccd2'; ctx.fillRect(0, r * 0.8, W, 3); ctx.fillRect(0, H - r * 0.8 - 3, W, 3);
  ctx.fillStyle = '#7d8088';
  for (let x = 0; x < W; x += 16) { ctx.fillRect(x, 0, 4, r * 1.6); ctx.fillRect(x, H - r * 1.6, 4, r * 1.6); }
  ctx.fillStyle = '#e3e5e9';
  [1, 6].forEach(c => { ctx.fillRect(c * W / 8, 0, W / 8, r); ctx.fillRect(c * W / 8, H - r, W / 8, r); });
}

// --- fuel depot: striped tank with F U E L
function fuel(ctx, W, H) {
  const w = W * 7 / 8, x0 = 0;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x0 + 8, 10, w, H - 6);
  ctx.save();
  rrect(ctx, x0, 0, w, H, 10); ctx.clip();
  const stripe = H / 8;
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#f2f2f2' : '#d23a2a';
    ctx.fillRect(x0, i * stripe, w, stripe);
  }
  ctx.fillStyle = lin(ctx, x0, 0, x0 + w, 0, [[0, 'rgba(0,0,0,0.45)'], [0.35, 'rgba(255,255,255,0.25)'], [0.55, 'rgba(255,255,255,0.05)'], [1, 'rgba(0,0,0,0.5)']]);
  ctx.fillRect(x0, 0, w, H);
  ctx.restore();
  ctx.strokeStyle = '#4a120c'; ctx.lineWidth = 2; rrect(ctx, x0, 0, w, H, 10); ctx.stroke();
  ctx.font = `bold ${Math.round(stripe * 1.5)}px "Arial Black", Arial, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  'FUEL'.split('').forEach((ch, i) => {
    const y = (i * 2 + 1) * stripe;
    ctx.fillStyle = '#1b1b1b'; ctx.fillText(ch, x0 + w / 2 + 1.5, y + 1.5);
    ctx.fillStyle = '#ffd84a'; ctx.fillText(ch, x0 + w / 2, y);
  });
}

function mirror(fn) {
  return (ctx, W, H, f) => { ctx.translate(W, 0); ctx.scale(-1, 1); fn(ctx, W, H, f); };
}

export const ART = {
  player: (c, W, H) => player(c, W, H, 0),
  player_left: (c, W, H) => player(c, W, H, -1),
  player_right: (c, W, H) => player(c, W, H, 1),
  heli_r1: (c, W, H) => heli(c, W, H, 0),
  heli_r2: (c, W, H) => heli(c, W, H, 1),
  heli_l1: mirror((c, W, H) => heli(c, W, H, 0)),
  heli_l2: mirror((c, W, H) => heli(c, W, H, 1)),
  ship_r: ship,
  ship_l: mirror(ship),
  jet_l: jet,
  jet_r: mirror(jet),
  house_a: house,
  house_b: mirror(house),
  bridge,
  fuel,
};

// objects that fly (get a drop shadow on the ground)
export const FLYING = new Set(['player', 'player_left', 'player_right', 'heli_r1', 'heli_r2', 'heli_l1', 'heli_l2', 'jet_l', 'jet_r']);
