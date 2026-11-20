// Gridlock: Quantum City — a lightweight top-down open-city crime sandbox
// with quantum-flavoured mechanics. Plain canvas + WebAudio, no dependencies.
'use strict';
(() => {
// ============================================================ canvas
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
}
addEventListener('resize', resize); resize();

// ============================================================ utils
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const wrapA = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const d2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
const gauss = () => { let u = 0; while (!u) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * Math.random()); };
const fmt = n => '$' + Math.floor(n).toLocaleString('en-US');
let seed = 20261120;
const srnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const spick = a => a[Math.floor(srnd() * a.length)];
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 255) * f, 0, 255) | 0, g = clamp(((n >> 8) & 255) * f, 0, 255) | 0, b = clamp((n & 255) * f, 0, 255) | 0;
  return `rgb(${r},${g},${b})`;
}
function rrect(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  ctx.fill();
}

// ============================================================ world
const T = 32, P = 12, NB = 8, MW = NB * P + 4, MH = MW; // 100x100 tiles
const ROAD = 0, WALK = 1, BUILD = 2, GRASS = 3, WATER = 4, PLAZA = 5;
const map = new Uint8Array(MW * MH);
const tile = (tx, ty) => (tx < 0 || ty < 0 || tx >= MW || ty >= MH) ? WATER : map[ty * MW + tx];
const tileAtP = (x, y) => tile(Math.floor(x / T), Math.floor(y / T));
const solidT = t => t === BUILD || t === WATER;
const solidAt = (x, y) => solidT(tileAtP(x, y));
const circleSolid = (x, y, r) => solidAt(x - r, y - r) || solidAt(x + r, y - r) || solidAt(x - r, y + r) || solidAt(x + r, y + r);
const roadLine = v => v >= 1 && v <= NB * P + 2 && ((v - 1) % P) < 2;
const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1]; // E S W N

const DISTRICTS = [
  { name: 'Harbor Row',   roofs: ['#7a5a48', '#6b4f3f', '#8a6a50', '#5d5348', '#70645a'], h: 0.10 },
  { name: 'Midtown',      roofs: ['#5f6b7a', '#4f5a68', '#6e7c8c', '#7d8590', '#56606b'], h: 0.30 },
  { name: 'Old Quarter',  roofs: ['#8b4d3b', '#9a5e43', '#7b4535', '#a07050', '#86584a'], h: 0.12 },
  { name: 'Neon Heights', roofs: ['#4b3f63', '#5a4a75', '#3e4a6a', '#6a4f6f', '#45506e'], h: 0.22 },
];
const districtAt = (x, y) => {
  const bx = clamp(Math.floor((x / T - 1) / P), 0, NB - 1), by = clamp(Math.floor((y / T - 1) / P), 0, NB - 1);
  return (bx >= NB / 2 ? 1 : 0) + (by >= NB / 2 ? 2 : 0);
};
const buildings = [], trees = [], lots = [], parkSpots = [];

function genMap() {
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    let t;
    if (x === 0 || y === 0 || x > NB * P + 2 || y > NB * P + 2) t = WATER;
    else if (roadLine(x) || roadLine(y)) t = ROAD;
    else {
      const lx = (x - 1) % P, ly = (y - 1) % P;
      t = (lx === 2 || lx === 11 || ly === 2 || ly === 11) ? WALK : GRASS;
    }
    map[y * MW + x] = t;
  }
  const fill = (x, y, w, h, t) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) map[j * MW + i] = t; };
  const addBuilding = (x, y, w, h, dist) => {
    fill(x, y, w, h, BUILD);
    const D = DISTRICTS[dist], color = spick(D.roofs), det = [];
    const n = Math.floor(srnd() * 4);
    for (let i = 0; i < n; i++) det.push([0.15 + srnd() * 0.55, 0.15 + srnd() * 0.55, 0.08 + srnd() * 0.12, 0.08 + srnd() * 0.12]);
    buildings.push({
      x: x * T, y: y * T, w: w * T, h: h * T, ht: D.h + srnd() * 0.22 + (w * h > 20 ? 0.06 : 0),
      color, walls: [0.5, 0.72, 0.6, 0.85].map(f => shade(color, f)), rim: shade(color, 1.18), hi: shade(color, 1.3), det,
    });
  };
  const split = (x, y, w, h, d, dist) => {
    const canH = w >= 4, canV = h >= 4;
    if (d >= 3 || (!canH && !canV) || (d > 0 && srnd() < 0.3)) { addBuilding(x, y, w, h, dist); return; }
    const horiz = canH && (!canV || w > h || (w === h && srnd() < 0.5));
    const L = horiz ? w : h;
    const alley = (L >= 5 && srnd() < 0.45) ? 1 : 0;
    const s = 2 + Math.floor(srnd() * (L - 3 - alley));
    if (horiz) {
      split(x, y, s, h, d + 1, dist);
      if (alley) fill(x + s, y, 1, h, PLAZA);
      split(x + s + alley, y, w - s - alley, h, d + 1, dist);
    } else {
      split(x, y, w, s, d + 1, dist);
      if (alley) fill(x, y + s, w, 1, PLAZA);
      split(x, y + s + alley, w, h - s - alley, d + 1, dist);
    }
  };
  for (let by = 0; by < NB; by++) for (let bx = 0; bx < NB; bx++) {
    const x0 = 1 + bx * P + 3, y0 = 1 + by * P + 3;
    const dist = (bx >= NB / 2 ? 1 : 0) + (by >= NB / 2 ? 2 : 0);
    const r = srnd();
    if (r < 0.1) {
      for (let i = 0; i < 12; i++) trees.push({ x: (x0 + 0.6 + srnd() * 6.8) * T, y: (y0 + 0.6 + srnd() * 6.8) * T, r: 9 + srnd() * 9 });
    } else if (r < 0.2) {
      fill(x0, y0, 8, 8, PLAZA);
      lots.push({ x: x0, y: y0 });
      for (let i = 0; i < 8; i++) {
        parkSpots.push({ x: (x0 + i + 0.5) * T, y: (y0 + 1.1) * T, a: Math.PI / 2 });
        parkSpots.push({ x: (x0 + i + 0.5) * T, y: (y0 + 6.9) * T, a: -Math.PI / 2 });
      }
    } else split(x0, y0, 8, 8, 0, dist);
  }
}
genMap();

function findTileNear(tx, ty, type) {
  for (let r = 0; r < 14; r++)
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (tile(tx + dx, ty + dy) === type) return { tx: tx + dx, ty: ty + dy };
    }
  return { tx, ty };
}
const tileCenter = t => ({ x: (t.tx + 0.5) * T, y: (t.ty + 0.5) * T });
function randomTile(types, cond) {
  for (let i = 0; i < 400; i++) {
    const tx = randi(1, MW - 2), ty = randi(1, MH - 2);
    if (!types.includes(tile(tx, ty))) continue;
    const p = { x: (tx + 0.5) * T, y: (ty + 0.5) * T, tx, ty };
    if (!cond || cond(p)) return p;
  }
  return null;
}
const blockSide = (bx, by) => tileCenter(findTileNear(1 + bx * P + 2, 1 + by * P + 6, WALK));
const HOSPITAL = blockSide(1, 1);
const POLICE_HQ = blockSide(6, 6);
const SPRAYS = [blockSide(3, 5), blockSide(6, 2)];
const BOOTHS = [[0, 4], [2, 1], [4, 3], [5, 6], [7, 1], [2, 7], [7, 4]].map(([bx, by]) => tileCenter(findTileNear(1 + bx * P + 6, 1 + by * P + 2, WALK)));

const mm = document.createElement('canvas'); mm.width = MW; mm.height = MH;
{
  const m = mm.getContext('2d'), img = m.createImageData(MW, MH);
  const C = { [ROAD]: [70, 70, 76], [WALK]: [140, 138, 132], [BUILD]: [35, 35, 40], [GRASS]: [60, 120, 55], [WATER]: [30, 80, 125], [PLAZA]: [100, 96, 90] };
  for (let i = 0; i < MW * MH; i++) { const c = C[map[i]]; img.data.set([c[0], c[1], c[2], 255], i * 4); }
  m.putImageData(img, 0, 0);
}

// ============================================================ lanes (right-hand traffic)
function laneDirs(tx, ty) {
  if (tile(tx, ty) !== ROAD) return 0;
  let m = 0;
  if (roadLine(tx)) m |= ((tx - 1) % P === 0) ? 2 : 8;   // west column southbound, east column northbound
  if (roadLine(ty)) m |= ((ty - 1) % P === 0) ? 4 : 1;   // north row westbound, south row eastbound
  return m;
}

// ============================================================ flow fields (police pathing)
const fq = new Int32Array(MW * MH);
function computeFlowInto(flow, px, py) {
  flow.fill(32767);
  const sx = Math.floor(px / T), sy = Math.floor(py / T);
  if (solidT(tile(sx, sy))) return;
  let h = 0, t = 0; const s = sy * MW + sx; flow[s] = 0; fq[t++] = s;
  while (h < t) {
    const i = fq[h++], x = i % MW, y = (i / MW) | 0, d = flow[i] + 1;
    for (let k = 0; k < 4; k++) {
      const nx = x + DX[k], ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
      const j = ny * MW + nx;
      if (flow[j] > d && !solidT(map[j])) { flow[j] = d; fq[t++] = j; }
    }
  }
}
const flowAt = (f, tx, ty) => (tx < 0 || ty < 0 || tx >= MW || ty >= MH) ? 32767 : f[ty * MW + tx];
function los(x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 12);
  for (let i = 1; i < n; i++) if (solidAt(lerp(x0, x1, i / n), lerp(y0, y1, i / n))) return false;
  return true;
}

// ============================================================ audio
let AC = null, master, noiseBuf, engOsc, engGain, engFilt, sirenOsc, sirenGain, musicGain;
function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = 0.45; master.connect(AC.destination);
    noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    engOsc = AC.createOscillator(); engOsc.type = 'sawtooth';
    engFilt = AC.createBiquadFilter(); engFilt.type = 'lowpass'; engFilt.frequency.value = 380;
    engGain = AC.createGain(); engGain.gain.value = 0;
    engOsc.connect(engFilt).connect(engGain).connect(master); engOsc.start();
    sirenOsc = AC.createOscillator(); sirenOsc.type = 'triangle';
    sirenGain = AC.createGain(); sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain).connect(master); sirenOsc.start();
    musicGain = AC.createGain(); musicGain.gain.value = 0; musicGain.connect(master);
  } catch (e) { AC = null; }
}
function noise(dur, freq, type, vol, q = 1, when = 0, dest = master) {
  if (!AC) return;
  const t = Math.max(AC.currentTime, when || AC.currentTime);
  const s = AC.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = AC.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = AC.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(dest); s.start(t); s.stop(t + dur + 0.02);
}
function tone(freq, dur, type = 'square', vol = 0.1, slideTo = 0, when = 0, dest = master) {
  if (!AC) return;
  const t = Math.max(AC.currentTime, when || AC.currentTime);
  const o = AC.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = AC.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.02);
}
const now = () => AC ? AC.currentTime : 0;
const sfx = {
  shot: () => noise(0.13, 2200, 'bandpass', 0.6, 0.6),
  smg: () => noise(0.07, 3000, 'bandpass', 0.4, 0.8),
  rocket: () => noise(0.4, 900, 'bandpass', 0.4, 0.5),
  boom: () => { noise(1.3, 260, 'lowpass', 1.0); tone(90, 0.7, 'sine', 0.6, 30); },
  crash: () => noise(0.25, 650, 'lowpass', 0.55),
  splat: () => noise(0.16, 380, 'lowpass', 0.6),
  punch: () => noise(0.06, 900, 'lowpass', 0.5),
  pickup: () => { tone(660, 0.08, 'square', 0.07); tone(990, 0.12, 'square', 0.07, 0, now() + 0.08); },
  ring: () => { tone(1250, 0.07, 'square', 0.05); tone(1550, 0.07, 'square', 0.05, 0, now() + 0.1); },
  horn: () => { tone(340, 0.28, 'square', 0.05); tone(430, 0.28, 'square', 0.04); },
  good: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'square', 0.07, 0, now() + i * 0.09)),
  bad: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.25, 'sawtooth', 0.06, 0, now() + i * 0.12)),
  spray: () => noise(1.0, 5000, 'highpass', 0.25),
  quantum: () => { tone(220, 0.6, 'sine', 0.15, 1760); tone(330, 0.6, 'sine', 0.1, 2640, now() + 0.05); },
  collapse: () => { tone(1800, 0.35, 'sine', 0.15, 120); noise(0.2, 3000, 'bandpass', 0.2, 2); },
  tunnel: () => { tone(80, 0.5, 'sine', 0.2, 900); tone(1200, 0.4, 'triangle', 0.08, 300, now() + 0.1); },
};

// ---- car radio: tiny procedural stations
const STATIONS = [null,
  { name: 'GRID FM · synthwave',    bpm: 112, root: 45, scale: [0, 3, 5, 7, 10],    bass: 'sawtooth', lead: 'square',   prog: [0, -4, 3, -2], seed: 7 },
  { name: 'KRUNCH 101 · breakbeat', bpm: 134, root: 40, scale: [0, 2, 3, 7, 8],     bass: 'square',   lead: 'triangle', prog: [0, 0, 5, 3],   seed: 21 },
  { name: 'SLOWROLL 88 · lowrider', bpm: 92,  root: 43, scale: [0, 3, 5, 6, 7, 10], bass: 'triangle', lead: 'sawtooth', prog: [0, 5, 0, 7],   seed: 99 },
];
for (const st of STATIONS) {
  if (!st) continue;
  let s = st.seed; const r = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; };
  st.kick = Array.from({ length: 16 }, (_, i) => i % 4 === 0 || (i % 2 === 0 && r() < 0.2));
  st.snare = Array.from({ length: 16 }, (_, i) => i % 8 === 4 || (i === 15 && r() < 0.5));
  st.hat = Array.from({ length: 16 }, (_, i) => i % 2 === 1 || r() < 0.25);
  st.bassP = Array.from({ length: 16 }, (_, i) => (i % 4 === 0 || r() < 0.3) ? Math.floor(r() * 3) : null);
  st.leadP = Array.from({ length: 64 }, () => r() < 0.28 ? Math.floor(r() * st.scale.length * 2) : null);
}
let radio = 1, nextNote = 0, step = 0;
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
function musicTick(on) {
  if (!AC) return;
  musicGain.gain.setTargetAtTime(on ? 0.22 : 0, AC.currentTime, 0.15);
  if (!on) { nextNote = AC.currentTime + 0.05; return; }
  const st = STATIONS[radio], spb = 60 / st.bpm / 4;
  if (nextNote < AC.currentTime) nextNote = AC.currentTime + 0.05;
  while (nextNote < AC.currentTime + 0.15) {
    const i = step % 16, bar = (step >> 4) % 4, t = nextNote, root = st.root + st.prog[bar];
    if (st.kick[i]) tone(150, 0.16, 'sine', 0.9, 40, t, musicGain);
    if (st.snare[i]) noise(0.13, 1800, 'bandpass', 0.5, 0.8, t, musicGain);
    if (st.hat[i]) noise(0.04, 8000, 'highpass', 0.18, 1, t, musicGain);
    const b = st.bassP[i];
    if (b !== null) tone(mtof(root + st.scale[b % st.scale.length]), spb * 1.7, st.bass, 0.22, 0, t, musicGain);
    const l = st.leadP[step % 64];
    if (l !== null) tone(mtof(root + 24 + st.scale[l % st.scale.length] + 12 * Math.floor(l / st.scale.length)), spb * 1.4, st.lead, 0.06, 0, t, musicGain);
    step++; nextNote += spb;
  }
}

// ============================================================ input
const keys = { up: 0, down: 0, left: 0, right: 0, fire: 0 };
const pressed = {};
const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'fire' };
addEventListener('keydown', e => {
  const k = KEYMAP[e.code];
  if (k) { keys[k] = 1; e.preventDefault(); }
  if (e.code === 'Tab') e.preventDefault();
  if (!e.repeat) pressed[e.code] = true;
  initAudio();
});
addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) keys[k] = 0; });
addEventListener('blur', () => { for (const k in keys) keys[k] = 0; });
const hit = (...codes) => codes.some(c => pressed[c]);
const touchEl = document.getElementById('touch');
if (matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window) touchEl.classList.add('on');
const touchOn = () => touchEl.classList.contains('on');
for (const b of touchEl.querySelectorAll('.tb')) {
  const down = e => { e.preventDefault(); initAudio(); b.classList.add('down'); if (b.dataset.k) keys[b.dataset.k] = 1; if (b.dataset.p) pressed[b.dataset.p] = true; };
  const up = e => { e.preventDefault(); b.classList.remove('down'); if (b.dataset.k) keys[b.dataset.k] = 0; };
  b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up);
  b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
}
cv.addEventListener('pointerdown', () => { initAudio(); pressed.Tap = true; });

// ============================================================ entities
const CT = {
  compact: { label: 'Hatchback',      w: 14, l: 27, max: 290, acc: 250, turn: 3.0, hp: 70,  mass: 0.8, colors: ['#c0392b', '#2e86c1', '#27ae60', '#d35400', '#8e44ad', '#bdc3c7'] },
  sedan:   { label: 'Sedan',          w: 16, l: 32, max: 320, acc: 230, turn: 2.7, hp: 100, mass: 1.0, colors: ['#34495e', '#7f8c8d', '#922b21', '#1f618d', '#196f3d', '#ecf0f1', '#5d4037'] },
  sports:  { label: 'Sports Coupe',   w: 16, l: 31, max: 450, acc: 420, turn: 3.2, hp: 80,  mass: 0.9, colors: ['#e74c3c', '#f1c40f', '#ff6f00', '#00bcd4', '#e91e63'] },
  truck:   { label: 'Box Truck',      w: 20, l: 46, max: 230, acc: 150, turn: 1.9, hp: 220, mass: 2.2, colors: ['#6d4c41', '#455a64', '#827717', '#37474f'] },
  taxi:    { label: 'Taxi',           w: 16, l: 32, max: 330, acc: 250, turn: 2.8, hp: 100, mass: 1.0, colors: ['#f4d03f'] },
  police:  { label: 'Police Cruiser', w: 16, l: 33, max: 410, acc: 350, turn: 3.0, hp: 160, mass: 1.3, colors: ['#f2f2f2'] },
};
const CIV = ['compact', 'compact', 'sedan', 'sedan', 'sedan', 'sports', 'truck', 'taxi'];
const WEAPONS = {
  pistol: { name: 'Pistol',          rate: 0.30, dmg: 34, spd: 900, spread: 0.03, life: 0.7 },
  smg:    { name: 'Machine Gun',     rate: 0.085, dmg: 16, spd: 950, spread: 0.09, life: 0.6 },
  rocket: { name: 'Rocket Launcher', rate: 1.1, dmg: 0, spd: 430, spread: 0, life: 2, rocket: true },
};
const WORDER = ['pistol', 'smg', 'rocket'];
const SHIRTS = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#f39c12', '#16a085', '#7f8c8d', '#d35400', '#ecf0f1', '#2c3e50'];
const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];

let cars = [], peds = [], bullets = [], parts = [], decals = [], pickups = [];
const player = { x: 0, y: 0, vx: 0, vy: 0, angle: 0, hp: 100, car: null, weapons: {}, weapon: null, cash: 0, lives: 5, mult: 1,
  anim: 0, moving: false, shootCd: 0, bust: 0, down: 0, downKind: null, hidden: true,
  shirt: '#ff7a1a', skin: '#e0ac69', hair: '#1a1a1a', pants: '#1e2a3a' };
let state = 'title', time = 0, heat = 0, lastCrime = -99, shake = 0, overlay = null, msgs = [];
let showMap = true, helpPage = 0, won = false, mission = null, ringing = null, ringCd = 4, ringBeep = 0;
let spawnT = 0, policeCd = 0, heatCd = 0, curDistrict = -1, sprayCd = 0;
let best = 0; try { best = +localStorage.getItem('gridlock.best') || 0; } catch (e) { /* storage unavailable */ }
const cam = { x: 0, y: 0, zoom: 1 };
const GOAL = 100000;

// ---- quantum state
const Q = { psi: 1, tun: 2, branches: null, supT: 0, grace: 0, obsT: 0, tinfo: null, notes: new Set(), note: null };
// what the police believe about your position: a spreading cloud
const belief = { x: 0, y: 0, vx: 0, vy: 0, sig: 0, seen: false, seeT: 0 };

const pp = () => player.car || player;
function msg(text, t = 4) { msgs.push({ text, t }); if (msgs.length > 4) msgs.shift(); }
function bigText(text, color, t = 2.5, sub = '') { overlay = { text, color, t, max: t, sub }; }

function makeCar(type, x, y, angle, driver) {
  const t = CT[type];
  const c = { type, x, y, angle, vx: 0, vy: 0, speed: 0, hp: t.hp, color: pick(t.colors), driver,
    ai: { tx: -99, ty: -99, dir: 0, jt: false, cruise: rand(95, 135), blocked: 0, stuck: 0, rev: 0, horn: 0 },
    fire: 0, dead: false, chase: false, copCd: 0, shootCd: rand(1, 2), lastHit: null, mission: false, parked: false };
  cars.push(c); return c;
}
function makePed(x, y, opt = {}) {
  const p = { x, y, angle: rand(TAU), hp: opt.cop ? 60 : 30, cop: !!opt.cop, dead: false, deadT: 0,
    speed: rand(26, 40), tx: Math.floor(x / T), ty: Math.floor(y / T), dir: randi(0, 3), ox: rand(-9, 9), oy: rand(-9, 9),
    anim: rand(10), moving: true, flee: 0, fx: 0, fy: 0, shootCd: rand(1, 2), target: !!opt.target,
    shirt: opt.cop ? '#1f3a93' : opt.target ? '#ff2bd6' : pick(SHIRTS), skin: pick(SKINS), hair: pick(['#222', '#4a2f1b', '#7a5230', '#ddd', '#111']) };
  peds.push(p); return p;
}

// ============================================================ quantum notes (education)
const NOTES = {
  superposition: {
    title: 'Superposition & the Born rule',
    body: 'A quantum system can be in a superposition of several states at once. Each branch has an amplitude, and a measurement gives one outcome with probability |amplitude|². That is the Born rule. Your ghost cars are branches. When a branch touches anything (a car, a person) it leaks information to the environment, which is decoherence, and its amplitude drops. Crashing the real car shrinks its own branch.',
    lib: 'Game liberty: real cars can\'t stay in superposition. Constant interaction with air, light and road (decoherence) destroys it in a tiny fraction of a second.',
  },
  measurement: {
    title: 'Measurement & collapse',
    body: 'Any interaction that records which branch you are in counts as a measurement. Here a cop seeing any of your branches is that measurement, and you snap into one of them at random, weighted by the Born rule.',
    lib: 'What "collapse" really is remains an open question. Copenhagen, many-worlds and decoherence-based views describe it differently.',
  },
  uncertainty: {
    title: 'The uncertainty principle',
    body: 'Heisenberg: position and momentum can\'t both be known exactly; Δx·Δp ≥ ħ/2. Once the cops lose sight of you they know your last momentum, so their position guess keeps spreading. Change direction out of sight and their guess drifts the wrong way.',
    lib: 'Game liberty: the police cloud is just classical missing information, a loose analogy. Heisenberg\'s limit is built into nature and would hold even with perfect instruments.',
  },
  tunnel: {
    title: 'Quantum tunnelling',
    body: 'A particle can cross a barrier it classically can\'t get over. The chance falls off exponentially with the barrier\'s width, roughly e^(−2κd). Tunnelling lets fusion run in the Sun, and flash memory and scanning tunnelling microscopes depend on it.',
    lib: 'Game liberty: for anything as big as a car the chance is so small (around 10^(−10^30)) that it never happens in practice.',
  },
  entangle: {
    title: 'Entanglement',
    body: 'Entangled particles give correlated measurement results however far apart they are. Einstein called it "spooky action at a distance", and Bell-test experiments (Nobel Prize 2022) confirmed the correlations are real.',
    lib: 'Game liberty: entanglement cannot send any effect from one place to another (the no-signalling theorem). Wrecking one twin would never wreck the other.',
  },
  schrodinger: {
    title: 'Schrödinger\'s cat',
    body: 'In 1935 Schrödinger described a cat in a box that is "both alive and dead" until someone looks. He meant it to show how absurd it is to apply superposition to everyday objects. Your briefcase is "cash" or "bomb" until it gets delivered.',
    lib: 'Game liberty: rough driving changing the odds is just a game rule, not real physics.',
  },
};
function note(k) {
  if (Q.notes.has(k)) return;
  Q.notes.add(k); Q.note = { k, t: 14 };
}

// ============================================================ car physics
function applyControls(c, throttle, steer, hand, dt) {
  const t = CT[c.type];
  if (c.dead) { throttle = 0; steer = 0; hand = true; }
  if (throttle > 0) c.speed += t.acc * dt * (c.speed < 0 ? 2.2 : 1);
  else if (throttle < 0) c.speed -= (c.speed > 0 ? t.acc * 1.7 : t.acc * 0.6) * dt;
  else c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), 90 * dt);
  if (hand) c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), 200 * dt);
  const maxF = t.max * (c.hp < t.hp * 0.3 ? 0.7 : 1);
  c.speed = clamp(c.speed, -t.max * 0.35, maxF);
  const sf = clamp(Math.abs(c.speed) / 50, 0, 1) * (c.speed >= 0 ? 1 : -1);
  const pa = c.angle;
  c.angle += steer * t.turn * sf * dt * (hand ? 1.6 : 1);
  if (carHitsWall(c, c.x, c.y, c.angle)) c.angle = pa;
  const hx = Math.cos(c.angle), hy = Math.sin(c.angle);
  const k = Math.min(1, (hand ? 1.6 : 8) * dt);
  c.vx += (hx * c.speed - c.vx) * k; c.vy += (hy * c.speed - c.vy) * k;
  if (!c.ghost && Math.abs(-hy * c.vx + hx * c.vy) > 70 && Math.random() < 0.7) skid(c);
}
function carCorners(c, x, y, a, pad = 1) {
  const t = CT[c.type], hl = t.l / 2 - pad, hw = t.w / 2 - pad, ca = Math.cos(a), sa = Math.sin(a);
  return [[hl, hw], [hl, -hw], [-hl, hw], [-hl, -hw], [0, hw], [0, -hw]].map(([lx, ly]) => [x + ca * lx - sa * ly, y + sa * lx + ca * ly]);
}
function carHitsWall(c, x, y, a) {
  for (const [px, py] of carCorners(c, x, y, a)) if (solidAt(px, py)) return true;
  return false;
}
// returns impact speed if a wall was hit, else 0
function wallMove(c, dt) {
  const nx = c.x + c.vx * dt, ny = c.y + c.vy * dt;
  if (!carHitsWall(c, nx, ny, c.angle)) { c.x = nx; c.y = ny; return 0; }
  const impact = Math.hypot(c.vx, c.vy);
  if (!carHitsWall(c, nx, c.y, c.angle)) { c.x = nx; c.vy *= -0.25; c.vx *= 0.8; }
  else if (!carHitsWall(c, c.x, ny, c.angle)) { c.y = ny; c.vx *= -0.25; c.vy *= 0.8; }
  else { c.vx *= -0.3; c.vy *= -0.3; }
  c.speed = c.vx * Math.cos(c.angle) + c.vy * Math.sin(c.angle);
  return impact;
}
function moveCar(c, dt) {
  const impact = wallMove(c, dt);
  if (impact > 130) {
    damageCar(c, (impact - 130) * 0.14, c.driver === 'player' ? 'player' : null);
    if (onScreen(c.x, c.y)) sfx.crash();
    if (c === player.car) { shake = Math.min(1, impact / 500); hardKnock(); }
    for (let i = 0; i < 5; i++) addPart(c.x, c.y, rand(-80, 80), rand(-80, 80), 0.3, 2, '#ffd27a');
  }
}
// a hard knock to the player's car shrinks its branch amplitude and rattles Schrödinger's briefcase
function hardKnock() {
  if (Q.branches && player.car) player.car.amp *= 0.55;
  if (mission && mission.type === 'deliver' && mission.stage === 1) {
    mission.bomb = Math.min(0.9, mission.bomb + 0.07);
    msg(`The case rattles… P(bomb) = ${Math.round(mission.bomb * 100)}%`, 1.5);
  }
}
function skid(c) {
  const t = CT[c.type], ca = Math.cos(c.angle), sa = Math.sin(c.angle), hl = t.l / 2 - 4, hw = t.w / 2 - 2;
  for (const s of [-1, 1]) addDecal({ k: 'skid', x: c.x - ca * hl - sa * hw * s, y: c.y - sa * hl + ca * hw * s, a: c.angle });
}
let mirroring = false;
function damageCar(c, amt, src) {
  if (c.dead || amt <= 0) return;
  c.hp -= amt;
  if (src === 'player') {
    c.lastHit = 'player';
    if (c.type === 'police' && heatCd <= 0) { addHeat(0.5); heatCd = 1.5; }
  }
  if (c.hp <= 0 && !c.fire) { c.fire = 2.6; ejectDriver(c, true); }
  // entangled twin takes the same hit
  if (c.twin && !mirroring) { mirroring = true; damageCar(c.twin, amt, src); mirroring = false; }
}
function ejectDriver(c, panic) {
  if (c.driver !== 'ai' && c.driver !== 'police') return null;
  const cop = c.driver === 'police';
  c.driver = null;
  const s = sideSpot(c);
  if (!s) return null;
  const p = makePed(s.x, s.y, { cop });
  if (!cop || panic) { p.flee = 6; p.fx = c.x; p.fy = c.y; }
  return p;
}
function sideSpot(c) {
  const t = CT[c.type], ca = Math.cos(c.angle), sa = Math.sin(c.angle);
  for (const [lx, ly] of [[0, -(t.w / 2 + 9)], [0, t.w / 2 + 9], [-(t.l / 2 + 9), 0], [t.l / 2 + 9, 0]]) {
    const x = c.x + ca * lx - sa * ly, y = c.y + sa * lx + ca * ly;
    if (!circleSolid(x, y, 5)) return { x, y };
  }
  return null;
}
function explodeCar(c) {
  c.dead = true; c.fire = 0; c.hp = 0; c.speed = 0;
  if (c.lastHit === 'player') {
    earn(c.type === 'police' ? 250 : 100);
    addHeat(c.type === 'police' ? 1 : 0.35);
    if (mission && mission.type === 'wreck') { mission.count++; if (mission.count >= mission.need) completeMission(); else msg(`${mission.need - mission.count} more to go.`, 2); }
  }
  if (mission && mission.type === 'steal' && mission.car === c) failMission('The car got torched.');
  if (mission && mission.type === 'entangle' && mission.b === c) { msg('Spooky action at a distance!', 3); completeMission(); }
  if (c.twin && !c.twin.dead && !c.twin.fire) { c.twin.fire = 0.3; }
  explode(c.x, c.y, 75, c.lastHit);
  if (player.car === c) killPlayer();
}

// ============================================================ AI driving
function driveToward(c, tx, ty, target, dt) {
  const a = c.ai;
  const diff = wrapA(Math.atan2(ty - c.y, tx - c.x) - c.angle);
  let steer = clamp(diff * 2.5, -1, 1), thr;
  if (a.rev > 0) { a.rev -= dt; thr = -1; steer = -steer; }
  else {
    thr = c.speed < target - 5 ? 1 : (c.speed > target + 25 ? -1 : 0);
    if (target > 30 && Math.abs(c.speed) < 12) { a.stuck += dt; if (a.stuck > 1.1) { a.rev = 0.8; a.stuck = 0; } }
    else a.stuck = Math.max(0, a.stuck - dt);
  }
  applyControls(c, thr, steer, false, dt);
}
function aiNext(c, straightP) {
  const a = c.ai, cur = laneDirs(a.tx, a.ty), rev = (a.dir + 2) & 3;
  const ok = (d, strict) => {
    if (d === rev || !(cur & (1 << d))) return false;
    if (!(laneDirs(a.tx + DX[d], a.ty + DY[d]) & (1 << d))) return false;
    return !(strict && a.jt && d !== a.dir);
  };
  let opts = [0, 1, 2, 3].filter(d => ok(d, true));
  if (!opts.length) opts = [0, 1, 2, 3].filter(d => ok(d, false));
  if (!opts.length) opts = [0, 1, 2, 3].filter(d => tile(a.tx + DX[d], a.ty + DY[d]) === ROAD);
  if (!opts.length) return;
  const turns = opts.filter(d => d !== a.dir);
  let d;
  if (c.pref !== undefined && turns.length) {
    // superposition branches: take the preferred turn (0 = left, 1 = right) at the first chance
    const want = c.pref ? (a.dir + 1) & 3 : (a.dir + 3) & 3;
    if (turns.includes(want)) { d = want; c.pref = undefined; }
    else d = opts.includes(a.dir) ? a.dir : pick(turns);
  } else d = (opts.includes(a.dir) && (Math.random() < straightP || !turns.length)) ? a.dir : pick(turns.length ? turns : opts);
  a.jt = d !== a.dir; a.dir = d; a.tx += DX[d]; a.ty += DY[d];
}
function aiReacquire(c) {
  const cx = Math.floor(c.x / T), cy = Math.floor(c.y / T);
  for (let r = 0; r < 3; r++)
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const m = laneDirs(cx + dx, cy + dy);
      if (!m) continue;
      let bd = -1, ba = 9;
      for (let d = 0; d < 4; d++) if (m & (1 << d)) { const df = Math.abs(wrapA(d * Math.PI / 2 - c.angle)); if (df < ba) { ba = df; bd = d; } }
      Object.assign(c.ai, { tx: cx + dx, ty: cy + dy, dir: bd, jt: false });
      return true;
    }
  return false;
}
function obstacleAhead(c) {
  const t = CT[c.type], hx = Math.cos(c.angle), hy = Math.sin(c.angle);
  const look = t.l / 2 + 16 + Math.abs(c.speed) * 0.25;
  for (const o of cars) {
    if (o === c) continue;
    const dx = o.x - c.x, dy = o.y - c.y, f = dx * hx + dy * hy;
    if (f <= 0 || f > look + CT[o.type].l / 2) continue;
    if (Math.abs(-dx * hy + dy * hx) < 15) return true;
  }
  const chk = p => { const dx = p.x - c.x, dy = p.y - c.y, f = dx * hx + dy * hy; return f > 0 && f < look && Math.abs(-dx * hy + dy * hx) < 13; };
  for (const p of peds) if (!p.dead && chk(p)) return true;
  return !player.car && !player.hidden && !player.down && chk(player);
}
function aiTraffic(c, dt, straightP = 0.65, avoid = true) {
  const a = c.ai;
  let tx = (a.tx + 0.5) * T, ty = (a.ty + 0.5) * T;
  let dd = d2(c.x, c.y, tx, ty);
  if (dd > (3 * T) ** 2) {
    if (!aiReacquire(c)) { applyControls(c, 0, 0, true, dt); return; }
    tx = (a.tx + 0.5) * T; ty = (a.ty + 0.5) * T; dd = d2(c.x, c.y, tx, ty);
  }
  if (dd < 14 * 14) { aiNext(c, straightP); tx = (a.tx + 0.5) * T; ty = (a.ty + 0.5) * T; }
  const diff = Math.abs(wrapA(Math.atan2(ty - c.y, tx - c.x) - c.angle));
  let target = a.cruise * (1 - Math.min(diff, 1) * 0.65);
  a.horn -= dt;
  if (avoid && obstacleAhead(c)) {
    a.blocked += dt;
    if (a.blocked < 2.5) target = 0;
    else if (a.blocked > 4) a.blocked = 0;
    if (a.blocked > 1.2 && a.horn <= 0 && onScreen(c.x, c.y)) { sfx.horn(); a.horn = 4; }
    a.stuck = 0;
  } else a.blocked = Math.max(0, a.blocked - dt * 2);
  driveToward(c, tx, ty, target, dt);
}
function aiPolice(c, dt) {
  if (heat < 1 || player.down || player.hidden) { c.chase = false; aiTraffic(c, dt); return; }
  c.chase = true;
  const P0 = pp(), d = Math.hypot(P0.x - c.x, P0.y - c.y);
  const see = !Q.branches && d < 160 && los(c.x, c.y, P0.x, P0.y);
  let tx, ty, sp = 330;
  if (see) { tx = P0.x; ty = P0.y; if (!player.car) sp = d < 80 ? 0 : 140; }
  else {
    // drive toward this car's own guess, sampled from the police belief cloud
    c.guessT = (c.guessT || 0) - dt;
    if (c.guessT <= 0 || c.gx === undefined || d2(c.x, c.y, c.gx, c.gy) < 50 * 50) {
      const g = Math.min(belief.sig, 700);
      let gx = clamp(belief.x + gauss() * g, T, (MW - 2) * T), gy = clamp(belief.y + gauss() * g, T, (MH - 2) * T);
      if (solidAt(gx, gy)) { gx = belief.x; gy = belief.y; }
      c.gx = gx; c.gy = gy; c.guessT = belief.sig < 40 ? 0.5 : 3; c.flowT = 0;
    }
    c.flowT = (c.flowT || 0) - dt;
    if (c.flowT <= 0) { c.flow = c.flow || new Int16Array(MW * MH); computeFlowInto(c.flow, c.gx, c.gy); c.flowT = 0.6; }
    let bx = Math.floor(c.x / T), by = Math.floor(c.y / T);
    for (let s = 0; s < 2; s++) {
      let bv = flowAt(c.flow, bx, by), nb = -1;
      for (let k = 0; k < 4; k++) { const v = flowAt(c.flow, bx + DX[k], by + DY[k]); if (v < bv) { bv = v; nb = k; } }
      if (nb < 0) break;
      bx += DX[nb]; by += DY[nb];
    }
    if (flowAt(c.flow, bx, by) < 32767) { tx = (bx + 0.5) * T; ty = (by + 0.5) * T; } else { tx = c.gx; ty = c.gy; }
    if (belief.sig > 150) sp = 200;
  }
  c.copCd -= dt; c.shootCd -= dt;
  if (!player.car && see && d < 110 && Math.abs(c.speed) < 70 && c.copCd <= 0) {
    const s = sideSpot(c);
    if (s) { makePed(s.x, s.y, { cop: true }); c.copCd = 7; }
  }
  if (heat >= 4 && see && d < 260 && c.shootCd <= 0) { c.shootCd = 1.3; enemyShot(c.x, c.y, P0.x, P0.y, 9, 0.12); }
  driveToward(c, tx, ty, sp, dt);
}
function enemyShot(x, y, tx, ty, dmg, spread) {
  const a = Math.atan2(ty - y, tx - x) + rand(-spread, spread);
  bullets.push({ x: x + Math.cos(a) * 12, y: y + Math.sin(a) * 12, vx: Math.cos(a) * 650, vy: Math.sin(a) * 650, life: 0.6, dmg, owner: 'cop' });
  if (onScreen(x, y)) sfx.shot();
}

// ============================================================ pedestrians
const walkable = (t, road) => t === WALK || t === PLAZA || t === GRASS || (road && t === ROAD);
function updatePed(p, dt) {
  if (p.dead) { p.deadT += dt; return; }
  p.moving = true;
  const P0 = pp(), pd = Math.hypot(P0.x - p.x, P0.y - p.y);
  if (p.cop && heat >= 1 && !player.down && !player.hidden && pd < 520 && (belief.sig < 80 || (pd < 250 && los(p.x, p.y, P0.x, P0.y)))) {
    const a = Math.atan2(P0.y - p.y, P0.x - p.x);
    p.angle = a;
    const sp = pd < 12 ? 0 : 88;
    moveFree(p, Math.cos(a) * sp, Math.sin(a) * sp, dt, 4);
    p.anim += dt * 14;
    p.shootCd -= dt;
    if (heat >= 2 && pd > 40 && pd < 230 && p.shootCd <= 0 && los(p.x, p.y, P0.x, P0.y)) {
      p.shootCd = rand(0.9, 1.5); enemyShot(p.x, p.y, P0.x, P0.y, 7, 0.14);
    }
    if (!player.car && pd < 14) player.bust += dt * 2;
    else if (player.car && pd < 26 && Math.abs(player.car.speed) < 25) player.bust += dt;
    p.tx = -1;
    return;
  }
  const fleeing = p.flee > 0;
  if (fleeing) p.flee -= dt;
  if (p.tx < 0 || Math.abs((p.tx + 0.5) * T - p.x) > T * 1.5 || Math.abs((p.ty + 0.5) * T - p.y) > T * 1.5) {
    p.tx = Math.floor(p.x / T); p.ty = Math.floor(p.y / T);
    p.ox = clamp(p.x - (p.tx + 0.5) * T, -9, 9); p.oy = clamp(p.y - (p.ty + 0.5) * T, -9, 9);
  }
  const gx = (p.tx + 0.5) * T + p.ox, gy = (p.ty + 0.5) * T + p.oy;
  const dx = gx - p.x, dy = gy - p.y, dist = Math.hypot(dx, dy);
  const sp = fleeing ? 100 : p.speed;
  if (dist < 3) {
    const onRoad = tile(p.tx, p.ty) === ROAD, opts = [];
    for (let k = 0; k < 4; k++) if (walkable(tile(p.tx + DX[k], p.ty + DY[k]), fleeing || onRoad)) opts.push(k);
    if (!fleeing && !onRoad && tile(p.tx + DX[p.dir], p.ty + DY[p.dir]) === ROAD && Math.random() < 0.08) opts.push(p.dir);
    let d;
    if (!opts.length) d = (p.dir + 2) & 3;
    else if (fleeing) {
      let bs = -1e9;
      for (const k of opts) { const s = d2((p.tx + DX[k] + 0.5) * T, (p.ty + DY[k] + 0.5) * T, p.fx, p.fy) + rand(0, 2000); if (s > bs) { bs = s; d = k; } }
    } else if (onRoad && opts.includes(p.dir)) d = p.dir;
    else {
      const fwd = opts.filter(k => k !== ((p.dir + 2) & 3));
      d = (fwd.includes(p.dir) && Math.random() < 0.75) ? p.dir : pick(fwd.length ? fwd : opts);
    }
    if (!solidT(tile(p.tx + DX[d], p.ty + DY[d]))) { p.dir = d; p.tx += DX[d]; p.ty += DY[d]; }
  } else {
    const m = Math.min(dist, sp * dt);
    const nx = p.x + dx / dist * m, ny = p.y + dy / dist * m;
    if (!solidAt(nx, ny)) { p.x = nx; p.y = ny; } else p.tx = -1;
    p.angle = Math.atan2(dy, dx);
    p.anim += dt * (fleeing ? 16 : 9);
  }
  if (p.target && pd < 160 && !fleeing && Math.random() < 0.02) { p.flee = 4; p.fx = P0.x; p.fy = P0.y; }
}
function moveFree(o, vx, vy, dt, r) {
  const nx = o.x + vx * dt, ny = o.y + vy * dt;
  if (!circleSolid(nx, o.y, r)) o.x = nx;
  if (!circleSolid(o.x, ny, r)) o.y = ny;
}
function killPed(p, src, burnt) {
  if (p.dead) return;
  p.dead = true; p.deadT = 0; p.burnt = !!burnt; p.hp = 0;
  addDecal({ k: 'blood', x: p.x + rand(-3, 3), y: p.y + rand(-3, 3), r: rand(7, 12) });
  for (let i = 0; i < 8; i++) addPart(p.x, p.y, rand(-90, 90), rand(-90, 90), 0.35, 2, '#8e0e0e');
  if (onScreen(p.x, p.y)) sfx.splat();
  scare(p.x, p.y, 200);
  if (src === 'player') {
    earn(p.cop ? 50 : 10);
    addHeat(p.cop ? 1.2 : (copNear(p.x, p.y, 600) ? 0.55 : 0.2));
  }
  if (p.target && mission && mission.type === 'hit') completeMission();
}
function scare(x, y, r) {
  for (const p of peds) if (!p.dead && !p.cop && d2(p.x, p.y, x, y) < r * r) { p.flee = rand(4, 7); p.fx = x; p.fy = y; }
}
function copNear(x, y, r) {
  for (const p of peds) if (p.cop && !p.dead && d2(p.x, p.y, x, y) < r * r) return true;
  for (const c of cars) if (c.type === 'police' && c.driver === 'police' && d2(c.x, c.y, x, y) < r * r) return true;
  return false;
}
// does any cop currently have eyes on point (x, y)?
function copSees(x, y) {
  for (const p of peds) if (p.cop && !p.dead) { const dd = d2(p.x, p.y, x, y); if (dd < 70 * 70 || (dd < 260 * 260 && los(p.x, p.y, x, y))) return true; }
  for (const c of cars) if (c.type === 'police' && c.driver === 'police') { const dd = d2(c.x, c.y, x, y); if (dd < 70 * 70 || (dd < 300 * 300 && los(c.x, c.y, x, y))) return true; }
  return false;
}

// ============================================================ particles & decals
function addPart(x, y, vx, vy, life, size, color, grow = 0, top = false) {
  if (parts.length > 700) parts.shift();
  parts.push({ x, y, vx, vy, life, max: life, size, color, grow, top });
}
function addDecal(d) { decals.push(d); if (decals.length > 500) decals.shift(); }
function qburst(x, y, color, n = 24) {
  for (let i = 0; i < n; i++) { const a = i / n * TAU; addPart(x, y, Math.cos(a) * 140, Math.sin(a) * 140, 0.5, 2.5, color, 0, true); }
}
function explode(x, y, r, src) {
  if (onScreen(x, y, 200)) { sfx.boom(); shake = 1; }
  addDecal({ k: 'scorch', x, y, r: r * 0.55 });
  for (let i = 0; i < 30; i++) { const a = rand(TAU), s = rand(30, 220); addPart(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.3, 0.8), rand(4, 9), pick(['#ffdf6b', '#ff9c2a', '#ff5a1f', '#fff3b0']), 18); }
  for (let i = 0; i < 16; i++) { const a = rand(TAU), s = rand(10, 70); addPart(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(1.2, 2.4), rand(6, 12), pick(['#444', '#555', '#333']), 14, true); }
  for (const c of cars) {
    if (c.dead) continue;
    const d = Math.hypot(c.x - x, c.y - y);
    if (d < r + 20) {
      const f = 1 - d / (r + 20);
      damageCar(c, f * 170, src);
      c.vx += (c.x - x) / (d || 1) * 260 * f; c.vy += (c.y - y) / (d || 1) * 260 * f;
    }
  }
  for (const p of peds) if (!p.dead && Math.hypot(p.x - x, p.y - y) < r) killPed(p, src, true);
  scare(x, y, r * 4);
  if (!player.car && !player.hidden) {
    const d = Math.hypot(player.x - x, player.y - y);
    if (d < r) hurtPlayer((1 - d / r) * 130 + 10);
  }
}

// ============================================================ quantum mechanics
function superpose() {
  const c = player.car;
  if (Q.branches) { collapse('you looked'); return; }
  if (!c) { msg('Superposition needs a car.', 1.5); return; }
  if (Q.psi <= 0) { msg('No ψ charges. Find a ψ pickup.', 2); return; }
  Q.psi--; Q.supT = 10; Q.grace = 0.8; c.amp = 1; Q.branches = [];
  for (let i = 0; i < 2; i++) {
    const g = { ghost: true, type: c.type, x: c.x, y: c.y, angle: c.angle, vx: c.vx, vy: c.vy, speed: c.speed, hp: 1e9, dead: false,
      color: c.color, amp: 1, tint: i ? '#4dd0e1' : '#b388ff', pref: i,
      ai: { tx: -99, ty: -99, dir: 0, jt: false, cruise: 150, blocked: 0, stuck: 0, rev: 0, horn: 0 } };
    aiReacquire(g);
    Q.branches.push(g);
  }
  sfx.quantum(); qburst(c.x, c.y, '#b388ff');
  msg('Superposed: 3 branches for 10 s. Avoid being seen. X collapses.', 3);
  note('superposition');
}
function updateBranches(dt) {
  if (!Q.branches) return;
  const c = player.car;
  if (!c) { Q.branches = null; return; }
  Q.supT -= dt; Q.grace -= dt;
  const v = clamp(Math.abs(c.speed), 90, 300);
  for (const g of Q.branches) {
    // ghosts glide along the lanes; they are not solid, so no wall physics
    const a = g.ai;
    let tx = (a.tx + 0.5) * T, ty = (a.ty + 0.5) * T, dist = Math.hypot(tx - g.x, ty - g.y);
    if (dist < 6) { aiNext(g, 0.5); tx = (a.tx + 0.5) * T; ty = (a.ty + 0.5) * T; dist = Math.hypot(tx - g.x, ty - g.y); }
    const m = Math.min(dist, v * dt), ux = (tx - g.x) / (dist || 1), uy = (ty - g.y) / (dist || 1);
    g.x += ux * m; g.y += uy * m;
    g.angle += wrapA(Math.atan2(uy, ux) - g.angle) * Math.min(1, dt * 10);
    g.vx = ux * v; g.vy = uy * v; g.speed = v;
    // any interaction with the environment leaks "which-branch" information: decoherence
    g.hitCd = (g.hitCd || 0) - dt;
    if (g.hitCd <= 0) {
      let touched = false;
      for (const o of cars) if (o !== c && d2(o.x, o.y, g.x, g.y) < 20 * 20) { touched = true; break; }
      if (!touched) for (const p of peds) if (!p.dead && d2(p.x, p.y, g.x, g.y) < 12 * 12) { touched = true; break; }
      if (touched) { g.amp *= 0.7; g.hitCd = 0.6; for (let i = 0; i < 6; i++) addPart(g.x, g.y, rand(-60, 60), rand(-60, 60), 0.4, 2, g.tint, 0, true); }
    }
  }
  // branches whose amplitude has dwindled decohere away
  Q.branches = Q.branches.filter(g => { if (g.amp < 0.12) { qburst(g.x, g.y, g.tint, 12); return false; } return true; });
  Q.obsT -= dt;
  if (Q.grace <= 0 && Q.obsT <= 0) {
    Q.obsT = 0.2;
    for (const o of [c, ...Q.branches]) if (copSees(o.x, o.y)) { collapse('a cop saw you'); note('measurement'); return; }
  }
  if (Q.supT <= 0) collapse('time ran out');
}
function collapse(reason) {
  const c = player.car, br = Q.branches;
  Q.branches = null;
  if (!c || !br) return;
  const all = [c, ...br], w = all.map(o => (o.amp ?? 1) ** 2), tot = w.reduce((a, b) => a + b, 0);
  let r = rand(tot), k = 0;
  while (k < all.length - 1 && r > w[k]) { r -= w[k]; k++; }
  const ch = all[k];
  for (const o of all) if (o !== ch) qburst(o.x, o.y, '#888', 10);
  if (ch !== c) {
    Object.assign(c, { x: ch.x, y: ch.y, angle: ch.angle, vx: ch.vx, vy: ch.vy, speed: ch.speed });
    player.x = c.x; player.y = c.y;
  }
  qburst(c.x, c.y, '#fff', 30); sfx.collapse();
  delete c.amp;
  msg(`Collapsed (${reason}): branch ${k + 1}, p = ${Math.round(w[k] / tot * 100)}%`, 3);
}
function tunnelInfo() {
  if (player.down || player.hidden) return null;
  const o = pp(), car = player.car, a = car ? car.angle : player.angle;
  const front = car ? CT[car.type].l / 2 : 5, hx = Math.cos(a), hy = Math.sin(a);
  let inside = false, start = 0;
  for (let s = front; s < front + 700; s += 4) {
    const sol = solidAt(o.x + hx * s, o.y + hy * s);
    if (!inside) { if (sol) { inside = true; start = s; } else if (s > front + 44) return null; }
    else if (!sol) {
      const cx = o.x + hx * (s + front + 4), cy = o.y + hy * (s + front + 4);
      if (car ? carHitsWall(car, cx, cy, a) : circleSolid(cx, cy, 5)) continue;
      const d = s - start;
      return { x: cx, y: cy, d, p: Math.exp(-d / 70) };
    }
  }
  return null;
}
function tunnel() {
  if (Q.tun <= 0) { msg('No tunnel charges. Find a T pickup.', 2); return; }
  const info = Q.tinfo || tunnelInfo();
  if (!info) { msg('Face a wall up close to try tunnelling.', 1.5); return; }
  Q.tun--;
  const o = pp();
  note('tunnel');
  if (Math.random() < info.p) {
    qburst(o.x, o.y, '#4dd0e1');
    o.x = info.x; o.y = info.y;
    if (player.car) { player.x = o.x; player.y = o.y; }
    qburst(o.x, o.y, '#4dd0e1');
    sfx.tunnel();
    msg(`Tunnelled through ${Math.round(info.d / T * 10) / 10} tiles of wall (p was ${Math.round(info.p * 100)}%)`, 3);
  } else {
    sfx.crash(); shake = 0.6;
    if (player.car) { damageCar(player.car, 25, null); player.car.vx *= -0.4; player.car.vy *= -0.4; player.car.speed *= -0.4; }
    else hurtPlayer(15);
    msg(`Bounced off the barrier (p was ${Math.round(info.p * 100)}%)`, 3);
  }
}
function updateBelief(dt) {
  if (heat < 1 || player.hidden) { belief.sig = 0; belief.seen = false; return; }
  belief.seeT -= dt;
  if (belief.seeT <= 0) { belief.seeT = 0.2; belief.seen = !Q.branches && copSees(player.x, player.y); }
  const o = pp();
  if (belief.seen) { belief.x = o.x; belief.y = o.y; belief.vx = o.vx || 0; belief.vy = o.vy || 0; belief.sig = 0; }
  else {
    // the police know your last momentum: the guess moves along it and spreads out
    belief.x = clamp(belief.x + belief.vx * dt, T, (MW - 2) * T);
    belief.y = clamp(belief.y + belief.vy * dt, T, (MH - 2) * T);
    const f = Math.exp(-dt * 0.25); belief.vx *= f; belief.vy *= f;
    belief.sig = Math.min(900, belief.sig + dt * (35 + 0.1 * Math.hypot(belief.vx, belief.vy)));
    if (belief.sig > 150) note('uncertainty');
  }
}
function revealPlayer() {
  const o = pp(); belief.x = o.x; belief.y = o.y; belief.vx = o.vx || 0; belief.vy = o.vy || 0; belief.sig = 0;
}

// ============================================================ player
function owned() { return WORDER.filter(k => player.weapons[k] > 0); }
function cycleWeapon() {
  const o = [null, ...owned()];
  player.weapon = o[(o.indexOf(player.weapon) + 1) % o.length];
}
function fire() {
  const w = player.weapon;
  if (!w || !(player.weapons[w] > 0)) {
    player.shootCd = 0.4; sfx.punch();
    const fx = player.x + Math.cos(player.angle) * 10, fy = player.y + Math.sin(player.angle) * 10;
    for (const p of peds) if (!p.dead && d2(p.x, p.y, fx, fy) < 12 * 12) {
      p.hp -= 12; p.x += Math.cos(player.angle) * 6; p.y += Math.sin(player.angle) * 6;
      if (p.hp <= 0) killPed(p, 'player'); else { p.flee = 5; p.fx = player.x; p.fy = player.y; if (p.cop) addHeat(0.5); }
      break;
    }
    return;
  }
  const wd = WEAPONS[w];
  player.shootCd = wd.rate;
  player.weapons[w]--;
  const a = player.angle + rand(-wd.spread, wd.spread);
  const mx = player.x + Math.cos(player.angle) * 11, my = player.y + Math.sin(player.angle) * 11;
  bullets.push({ x: mx, y: my, vx: Math.cos(a) * wd.spd, vy: Math.sin(a) * wd.spd, life: wd.life, dmg: wd.dmg, owner: 'player', rocket: !!wd.rocket });
  addPart(mx, my, 0, 0, 0.06, 5, '#fff2a8');
  (w === 'smg' ? sfx.smg : w === 'rocket' ? sfx.rocket : sfx.shot)();
  scare(player.x, player.y, 320);
  if (copNear(player.x, player.y, 420) && heatCd <= 0) { addHeat(0.25); heatCd = 1; }
  if (player.weapons[w] <= 0) { delete player.weapons[w]; player.weapon = owned()[0] || null; }
}
function enterExit() {
  if (player.car) {
    const c = player.car;
    if (Math.abs(c.speed) > 90) { msg('Slow down to bail out!', 1.5); return; }
    if (Q.branches) collapse('you stepped out');
    const s = sideSpot(c);
    if (!s) return;
    player.x = s.x; player.y = s.y; player.angle = c.angle; player.car = null; c.driver = null;
    return;
  }
  let bestC = null, bd = 42 * 42;
  for (const c of cars) {
    if (c.dead || c.fire > 0) continue;
    const d = d2(c.x, c.y, player.x, player.y);
    if (d < bd) { bd = d; bestC = c; }
  }
  if (!bestC) return;
  const c = bestC;
  if (c.driver === 'ai' || c.driver === 'police') {
    const wasCop = c.driver === 'police';
    const p = ejectDriver(c, false);
    if (p && !wasCop) { p.flee = 6; p.fx = player.x; p.fy = player.y; }
    if (copNear(c.x, c.y, 380) || wasCop) addHeat(wasCop ? 1.2 : 0.6);
    msg(wasCop ? 'You jacked a cop car. Bold.' : `Carjacked a ${CT[c.type].label}!`, 2);
  } else if (c.type === 'police') addHeat(1);
  c.driver = 'player'; player.car = c; c.parked = false;
  if (mission && mission.type === 'steal' && mission.car === c && mission.stage === 0) advanceSteal();
}
function hurtPlayer(dmg) {
  if (player.down || player.hidden) return;
  player.hp -= dmg;
  addDecal({ k: 'blood', x: player.x, y: player.y, r: 4 });
  if (player.hp <= 0) killPlayer();
}
function killPlayer() {
  if (player.down) return;
  Q.branches = null;
  if (player.car) { const c = player.car; c.driver = null; player.x = c.x; player.y = c.y; player.car = null; }
  player.hp = 0; player.down = 4; player.downKind = 'wasted';
  player.lives--;
  bigText('WASTED', '#e74c3c', 4, player.lives > 0 ? `${player.lives} ${player.lives === 1 ? 'life' : 'lives'} left` : '');
  addDecal({ k: 'blood', x: player.x, y: player.y, r: 12 });
  if (mission) failMission('You got wasted.');
  sfx.bad();
}
function bustPlayer() {
  if (player.down) return;
  Q.branches = null;
  if (player.car) { player.car.driver = null; player.car = null; }
  player.down = 4; player.downKind = 'busted';
  const fine = Math.floor(player.cash * 0.1);
  player.cash -= fine; player.weapons = {}; player.weapon = null;
  bigText('BUSTED', '#3498db', 4, `Fine ${fmt(fine)} · weapons confiscated`);
  if (mission) failMission('You got busted.');
  sfx.bad();
}
function respawn() {
  const where = player.downKind === 'busted' ? POLICE_HQ : HOSPITAL;
  player.down = 0; player.hp = 100; player.bust = 0; player.car = null;
  player.x = where.x; player.y = where.y; player.angle = 0;
  heat = 0; player.mult = Math.max(1, player.mult - 1);
  if (player.lives <= 0) { state = 'over'; saveBest(); }
}
function earn(v) {
  player.cash += v;
  if (!won && player.cash >= GOAL) { won = true; bigText('CITY CONQUERED', '#f1c40f', 5, `You hit ${fmt(GOAL)}. Keep playing!`); sfx.good(); }
  if (player.cash > best) saveBest();
}
function saveBest() { best = Math.max(best, player.cash); try { localStorage.setItem('gridlock.best', String(best)); } catch (e) { /* ignore */ } }
function addHeat(v) { heat = Math.min(5.99, heat + v); lastCrime = time; if (heat >= 1) revealPlayer(); }

function updatePlayer(dt) {
  if (player.down) {
    player.down -= dt;
    if (player.down <= 0) respawn();
    return;
  }
  if (hit('Enter', 'KeyF', 'KeyE')) enterExit();
  if (hit('KeyQ', 'Tab')) { cycleWeapon(); msg(player.weapon ? WEAPONS[player.weapon].name : 'Fists', 1.2); }
  if (hit('KeyX')) superpose();
  if (hit('KeyT')) tunnel();
  if (player.car) {
    const c = player.car;
    applyControls(c, keys.up ? 1 : keys.down ? -1 : 0, keys.right - keys.left, !!keys.fire, dt);
    if (c.fire > 0 && Math.random() < 0.02) msg('Your car is on fire. Get out!', 1.5);
  } else {
    const px = player.x, py = player.y;
    player.angle += (keys.right - keys.left) * 4.2 * dt;
    const mv = keys.up ? 100 : keys.down ? -45 : 0;
    moveFree(player, Math.cos(player.angle) * mv, Math.sin(player.angle) * mv, dt, 4);
    player.vx = (player.x - px) / dt; player.vy = (player.y - py) / dt;
    player.moving = mv !== 0;
    if (mv) player.anim += dt * 15;
    player.shootCd -= dt;
    if (keys.fire && player.shootCd <= 0) fire();
  }
  if (heat >= 1) {
    if (!player.car) {
      for (const c of cars) if (c.type === 'police' && c.driver === 'police' && Math.abs(c.speed) < 40 && d2(c.x, c.y, player.x, player.y) < 30 * 30) player.bust += dt;
    } else if (Math.abs(player.car.speed) < 25) {
      for (const c of cars) if (c.type === 'police' && c.driver === 'police' && d2(c.x, c.y, player.x, player.y) < 42 * 42) player.bust += dt * 0.6;
    }
  }
  player.bust = Math.max(0, player.bust - dt * 0.5);
  if (player.bust > 1.4) bustPlayer();
}

// ============================================================ collisions
function carCircles(c) {
  const t = CT[c.type], o = t.l / 4, ca = Math.cos(c.angle), sa = Math.sin(c.angle);
  return [[c.x + ca * o, c.y + sa * o], [c.x - ca * o, c.y - sa * o], t.w / 2 + 1];
}
function collideCars(active) {
  const C = active.map(carCircles);
  for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) {
    const a = active[i], b = active[j];
    if (d2(a.x, a.y, b.x, b.y) > 60 * 60) continue;
    const ca = C[i], cb = C[j], r = ca[2] + cb[2];
    let hitOnce = false;
    for (let u = 0; u < 2 && !hitOnce; u++) for (let v = 0; v < 2 && !hitOnce; v++) {
      const dx = cb[v][0] - ca[u][0], dy = cb[v][1] - ca[u][1], dd = dx * dx + dy * dy;
      if (dd >= r * r || dd === 0) continue;
      hitOnce = true;
      const d = Math.sqrt(dd), nx = dx / d, ny = dy / d, ov = r - d;
      const ma = CT[a.type].mass, mb = CT[b.type].mass, sa = mb / (ma + mb), sb = ma / (ma + mb);
      const ax = a.x - nx * ov * sa, ay = a.y - ny * ov * sa, bx = b.x + nx * ov * sb, by = b.y + ny * ov * sb;
      if (!carHitsWall(a, ax, ay, a.angle)) { a.x = ax; a.y = ay; }
      if (!carHitsWall(b, bx, by, b.angle)) { b.x = bx; b.y = by; }
      const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (vn < 0) {
        const jj = -1.3 * vn / (1 / ma + 1 / mb);
        a.vx -= jj / ma * nx; a.vy -= jj / ma * ny; b.vx += jj / mb * nx; b.vy += jj / mb * ny;
        a.speed = a.vx * Math.cos(a.angle) + a.vy * Math.sin(a.angle);
        b.speed = b.vx * Math.cos(b.angle) + b.vy * Math.sin(b.angle);
        if (-vn > 70) {
          const dmg = (-vn - 70) * 0.12;
          damageCar(a, dmg, b.driver === 'player' ? 'player' : null);
          damageCar(b, dmg, a.driver === 'player' ? 'player' : null);
          if (onScreen(a.x, a.y)) sfx.crash();
          if (a === player.car || b === player.car) { shake = Math.min(1, -vn / 400); if (-vn > 130) hardKnock(); }
          for (let k = 0; k < 4; k++) addPart(ca[u][0] + nx * ca[2], ca[u][1] + ny * ca[2], rand(-60, 60), rand(-60, 60), 0.3, 2, '#ffd27a');
        }
      }
    }
  }
}
function collideCarPeds(active) {
  for (const c of active) {
    const t = CT[c.type], v = Math.hypot(c.vx, c.vy), ca = Math.cos(c.angle), sa = Math.sin(c.angle);
    const test = (p, isPlayer) => {
      const dx = p.x - c.x, dy = p.y - c.y;
      if (dx * dx + dy * dy > (t.l / 2 + 8) ** 2) return;
      const lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca;
      if (Math.abs(lx) > t.l / 2 + 4 || Math.abs(ly) > t.w / 2 + 4) return;
      if (v > 75) {
        if (isPlayer) { hurtPlayer(v * 0.12); shove(p, lx, ly, t, ca, sa, 8); }
        else killPed(p, c.driver === 'player' ? 'player' : null);
        c.vx *= 0.93; c.vy *= 0.93;
      } else {
        shove(p, lx, ly, t, ca, sa, 1);
        if (!isPlayer && !p.flee && v > 20) { p.flee = 3; p.fx = c.x; p.fy = c.y; }
      }
    };
    for (const p of peds) if (!p.dead) test(p, false);
    if (!player.car && !player.down && !player.hidden) test(player, true);
  }
}
function shove(p, lx, ly, t, ca, sa, extra) {
  let nlx = lx, nly = ly;
  if (Math.abs(lx) / (t.l / 2) > Math.abs(ly) / (t.w / 2)) nlx = Math.sign(lx || 1) * (t.l / 2 + 5 + extra);
  else nly = Math.sign(ly || 1) * (t.w / 2 + 5 + extra);
  const cx = p.x - (lx * ca - ly * sa), cy = p.y - (lx * sa + ly * ca);
  const nx = cx + nlx * ca - nly * sa, ny = cy + nlx * sa + nly * ca;
  if (!circleSolid(nx, ny, 3)) { p.x = nx; p.y = ny; }
}

// ============================================================ bullets
function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    let done = false;
    for (let s = 0; s < 3 && !done; s++) {
      b.x += b.vx * dt / 3; b.y += b.vy * dt / 3;
      if (b.rocket && Math.random() < 0.5) addPart(b.x, b.y, rand(-15, 15), rand(-15, 15), 0.6, 3, '#aaa', 8, true);
      if (solidAt(b.x, b.y)) { done = true; if (!b.rocket) for (let k = 0; k < 3; k++) addPart(b.x, b.y, rand(-60, 60), rand(-60, 60), 0.2, 1.5, '#ffe08a'); break; }
      for (const c of cars) {
        if (c.dead && !b.rocket) continue;
        if (b.owner === 'player' && c === player.car) continue;
        const t = CT[c.type], dx = b.x - c.x, dy = b.y - c.y;
        if (dx * dx + dy * dy > (t.l / 2) ** 2) continue;
        const lx = dx * Math.cos(c.angle) + dy * Math.sin(c.angle), ly = -dx * Math.sin(c.angle) + dy * Math.cos(c.angle);
        if (Math.abs(lx) < t.l / 2 && Math.abs(ly) < t.w / 2) {
          if (b.owner === 'cop' && c !== player.car) { done = true; break; }
          if (!b.rocket) damageCar(c, b.dmg * (c === player.car ? 0.9 : 0.6), b.owner === 'player' ? 'player' : null);
          if (c === player.car && b.owner === 'cop' && mission && mission.type === 'deliver' && mission.stage === 1) mission.bomb = Math.min(0.9, mission.bomb + 0.02);
          if (c.driver === 'ai' && b.owner === 'player' && Math.random() < 0.3) ejectDriver(c, true);
          addPart(b.x, b.y, rand(-50, 50), rand(-50, 50), 0.2, 1.5, '#ffe08a');
          done = true; break;
        }
      }
      if (done) break;
      if (b.owner === 'player') {
        for (const p of peds) {
          if (p.dead || d2(p.x, p.y, b.x, b.y) > 7 * 7) continue;
          if (!b.rocket) {
            p.hp -= b.dmg;
            for (let k = 0; k < 3; k++) addPart(b.x, b.y, rand(-40, 40), rand(-40, 40), 0.3, 1.5, '#a01010');
            if (p.hp <= 0) killPed(p, 'player'); else { p.flee = 6; p.fx = player.x; p.fy = player.y; if (p.cop) addHeat(0.4); }
          }
          done = true; break;
        }
      } else if (!player.car && !player.down && d2(player.x, player.y, b.x, b.y) < 7 * 7) {
        hurtPlayer(b.dmg); done = true;
      }
    }
    b.life -= dt;
    if (done || b.life <= 0) {
      if (b.rocket) explode(b.x, b.y, 70, 'player');
      bullets.splice(i, 1);
    }
  }
}

// ============================================================ pickups
const PK = {
  pistol: { c: '#bdc3c7', l: 'P', label: 'Pistol +30', give: () => give('pistol', 30) },
  smg:    { c: '#95a5a6', l: 'M', label: 'Machine Gun +120', give: () => give('smg', 120) },
  rocket: { c: '#e74c3c', l: 'R', label: 'Rocket Launcher +5', give: () => give('rocket', 5) },
  health: { c: '#2ecc71', l: '+', label: 'Health', give: () => { player.hp = 100; } },
  bribe:  { c: '#f1c40f', l: '★', label: 'Bribe: -1 wanted', give: () => { heat = Math.max(0, heat - 1); } },
  cash:   { c: '#1e8449', l: '$', label: 'Cash +$250', give: () => earn(250) },
  psi:    { c: '#b388ff', l: 'ψ', label: 'Superposition charge +1 (press X in a car)', give: () => { Q.psi++; } },
  tun:    { c: '#4dd0e1', l: 'T', label: 'Tunnel charges +2 (press T facing a wall)', give: () => { Q.tun += 2; } },
};
function give(w, n) { player.weapons[w] = (player.weapons[w] || 0) + n; if (!player.weapon) player.weapon = w; }
function placePickups() {
  pickups = [];
  const kinds = ['pistol', 'pistol', 'pistol', 'pistol', 'smg', 'smg', 'smg', 'rocket', 'rocket', 'health', 'health', 'health', 'health',
    'bribe', 'bribe', 'bribe', 'cash', 'cash', 'cash', 'cash', 'cash', 'psi', 'psi', 'psi', 'psi', 'psi', 'tun', 'tun', 'tun', 'tun', 'tun'];
  for (const k of kinds) {
    const t = randomTile([WALK, PLAZA, GRASS]);
    if (t) pickups.push({ x: t.x, y: t.y, k, cd: 0 });
  }
}
function updatePickups(dt) {
  const P0 = pp();
  for (const u of pickups) {
    if (u.cd > 0) { u.cd -= dt; continue; }
    if (!player.down && d2(u.x, u.y, P0.x, P0.y) < 20 * 20) { PK[u.k].give(); msg(PK[u.k].label, 2); sfx.pickup(); u.cd = 45; }
  }
}

// ============================================================ missions
function farTile(min, max, types = [WALK]) {
  const P0 = pp();
  return randomTile(types, p => { const d = Math.hypot(p.x - P0.x, p.y - P0.y); return d > min && d < max; }) || randomTile(types);
}
function freeSpot(min, max) {
  const P0 = pp();
  const free = parkSpots.filter(s => { const d = Math.hypot(s.x - P0.x, s.y - P0.y); return d > min && d < max && !cars.some(c => d2(c.x, c.y, s.x, s.y) < 20 * 20); });
  if (free.length) return pick(free);
  const t = farTile(min, max, [PLAZA, WALK]); return { x: t.x, y: t.y, a: 0 };
}
function startMission() {
  ringing = null;
  const type = pick(['deliver', 'steal', 'hit', 'race', 'wreck', 'entangle', 'deliver', 'entangle']);
  const reward = 2000 + randi(0, 6) * 250;
  const P0 = pp();
  if (type === 'deliver') {
    const a = farTile(500, 1400);
    mission = { type, stage: 0, x: a.x, y: a.y, reward, timer: 0, bomb: 0.15 };
    msg('Job: a briefcase needs moving. Nobody knows what\'s inside. Grab it at the marker.', 5);
  } else if (type === 'steal') {
    const spot = freeSpot(600, 2200);
    const c = makeCar('sports', spot.x, spot.y, spot.a, null);
    c.mission = true; c.parked = true; c.color = '#ff2bd6'; c.hp = 120;
    mission = { type, stage: 0, car: c, reward: reward + 1000, timer: 0 };
    msg('Job: boost the pink Sports Coupe and bring it to the garage.', 5);
  } else if (type === 'hit') {
    const t = farTile(600, 1600);
    const p = makePed(t.x, t.y, { target: true });
    p.hp = 60; p.speed = 34;
    mission = { type, stage: 0, ped: p, reward: reward + 500, timer: 120 };
    msg('Job: a snitch is talking. Take out the guy in pink. 2 minutes.', 5);
  } else if (type === 'race') {
    const pts = []; let last = P0;
    for (let i = 0; i < 6; i++) {
      const t = randomTile([ROAD], p => { const d = Math.hypot(p.x - last.x, p.y - last.y); return d > 450 && d < 900; }) || randomTile([ROAD]);
      pts.push(t); last = t;
    }
    mission = { type, stage: 0, pts, reward: reward + 1500, timer: 30 };
    msg('Job: courier run. Hit 6 checkpoints before the clock runs out.', 5);
  } else if (type === 'wreck') {
    mission = { type, stage: 0, need: 4, count: 0, reward: reward + 1000, timer: 75 };
    msg('Job: send a message. Wreck 4 cars in 75 seconds.', 5);
  } else {
    const sa = freeSpot(300, 900), sb = freeSpot(1600, 3200);
    const a = makeCar('sedan', sa.x, sa.y, sa.a, null), b = makeCar('sedan', sb.x, sb.y, sb.a, null);
    for (const c of [a, b]) { c.mission = true; c.parked = true; c.color = '#3cf0ff'; c.hp = 140; }
    a.twin = b; b.twin = a;
    mission = { type, stage: 0, a, b, reward: reward + 1200, timer: 120 };
    msg('Job: a rival\'s cyan car is parked across town. Its twin nearby is entangled with it. Wreck the near one.', 6);
    note('entangle');
  }
  sfx.pickup();
}
function advanceSteal() {
  const g = farTile(700, 1800);
  mission.stage = 1; mission.x = g.x; mission.y = g.y; mission.timer = 50 + Math.hypot(g.x - player.x, g.y - player.y) / 160;
  msg('Nice wheels. Get it to the garage, and keep it in one piece.', 4);
}
function missionTarget() {
  if (!mission) return ringing;
  switch (mission.type) {
    case 'steal': return mission.stage === 0 ? mission.car : mission;
    case 'hit': return mission.ped;
    case 'race': return mission.pts[mission.stage];
    case 'wreck': return null;
    case 'entangle': return mission.a.dead ? mission.b : mission.a;
    default: return mission;
  }
}
function completeMission(factor = 1, title = 'JOB DONE') {
  if (!mission) return;
  const r = Math.round(mission.reward * player.mult * factor);
  earn(r);
  bigText(title, factor < 1 ? '#e67e22' : '#2ecc71', 2.5, `+${fmt(r)} · multiplier x${Math.min(9, player.mult + 1)}`);
  player.mult = Math.min(9, player.mult + 1);
  if (mission.type === 'steal' && mission.car) {
    const c = mission.car;
    if (player.car === c) { if (Q.branches) Q.branches = null; player.car = null; const s = sideSpot(c) || c; player.x = s.x; player.y = s.y; }
    cars.splice(cars.indexOf(c), 1);
  }
  if (mission.type === 'entangle') { mission.a.mission = false; mission.b.mission = false; }
  if (mission.type === 'hit') addHeat(0.6);
  mission = null; ringCd = 6; sfx.good();
}
function failMission(why) {
  if (!mission) return;
  if (mission.type === 'steal' && mission.car) mission.car.mission = false;
  if (mission.type === 'hit' && mission.ped) mission.ped.target = false;
  if (mission.type === 'entangle') { mission.a.mission = false; mission.b.mission = false; }
  mission = null; ringCd = 8;
  bigText('JOB FAILED', '#e67e22', 2.5, why);
}
function updateMissions(dt) {
  sprayCd -= dt;
  const P0 = pp();
  if (!mission) {
    ringCd -= dt;
    if (!ringing && ringCd <= 0) {
      ringing = pick(BOOTHS.filter(b => d2(b.x, b.y, P0.x, P0.y) > 300 * 300)) || pick(BOOTHS);
      msg('A payphone is ringing. Follow the arrow.', 4);
    }
    if (ringing) {
      ringBeep -= dt;
      if (ringBeep <= 0 && d2(ringing.x, ringing.y, P0.x, P0.y) < 500 * 500) { sfx.ring(); ringBeep = 1.2; }
      const slow = !player.car || Math.abs(player.car.speed) < 60;
      if (!player.down && slow && d2(ringing.x, ringing.y, P0.x, P0.y) < 24 * 24) startMission();
    }
  } else {
    const m = mission;
    if (m.timer > 0) { m.timer -= dt; if (m.timer <= 0) { failMission('Out of time.'); return; } }
    if (player.down) return;
    const near = (o, r = 28) => d2(o.x, o.y, P0.x, P0.y) < r * r;
    if (m.type === 'deliver') {
      if (m.stage === 0 && near(m)) {
        const t = farTile(900, 2200);
        m.stage = 1; m.x = t.x; m.y = t.y; m.timer = 25 + Math.hypot(t.x - P0.x, t.y - P0.y) / 150;
        msg('Got the case. Until delivery it\'s cash AND a bomb. Drive gently!', 4); sfx.pickup();
        note('schrodinger');
      } else if (m.stage === 1 && near(m)) {
        if (Math.random() < m.bomb) {
          const x = m.x, y = m.y;
          completeMission(0.25, 'IT WAS A BOMB');
          explode(x, y, 60, null);
        } else completeMission(1, 'IT WAS CASH');
      }
    } else if (m.type === 'steal') {
      if (m.stage === 1 && player.car === m.car && near(m, 40)) completeMission();
    } else if (m.type === 'hit') {
      if (!peds.includes(m.ped)) failMission('The target slipped away.');
    } else if (m.type === 'race') {
      if (near(m.pts[m.stage], 40)) {
        m.stage++; sfx.pickup();
        if (m.stage >= m.pts.length) completeMission();
        else { m.timer += 11; msg(`Checkpoint ${m.stage}/${m.pts.length}`, 1.5); }
      }
    }
  }
  if (player.car && sprayCd <= 0) for (const s of SPRAYS) {
    if (d2(s.x, s.y, player.x, player.y) > 30 * 30) continue;
    sprayCd = 4;
    if (heat < 1) { msg('Spray shop: you\'re not wanted. Come back when you are.', 2); break; }
    if (player.cash < 500) { msg('Spray shop: a respray costs $500. Come back with cash.', 2); break; }
    player.cash -= 500; heat = 0; player.car.color = pick(SHIRTS);
    if (player.car.type === 'police') player.car.type = 'sedan';
    sfx.spray(); msg('Fresh paint, new plates. The cops lost you. (-$500)', 3);
    break;
  }
}

// ============================================================ spawning
function viewRect(m = 0) {
  const hw = W / 2 / cam.zoom + m, hh = H / 2 / cam.zoom + m;
  return { x0: cam.x - hw, y0: cam.y - hh, x1: cam.x + hw, y1: cam.y + hh };
}
function onScreen(x, y, m = 40) { const v = viewRect(m); return x > v.x0 && x < v.x1 && y > v.y0 && y < v.y1; }
function spawnOutside(types, check) {
  const v = viewRect(48), o = viewRect(420);
  for (let i = 0; i < 25; i++) {
    const x = rand(o.x0, o.x1), y = rand(o.y0, o.y1);
    if (x > v.x0 && x < v.x1 && y > v.y0 && y < v.y1) continue;
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    if (!types.includes(tile(tx, ty))) continue;
    const p = { x: (tx + 0.5) * T, y: (ty + 0.5) * T, tx, ty };
    if (check && !check(p)) continue;
    return p;
  }
  return null;
}
function spawnTraffic(type, driver) {
  const p = spawnOutside([ROAD], p => laneDirs(p.tx, p.ty) && !cars.some(c => d2(c.x, c.y, p.x, p.y) < 50 * 50));
  if (!p) return null;
  const m = laneDirs(p.tx, p.ty), d = pick([0, 1, 2, 3].filter(k => m & (1 << k)));
  const c = makeCar(type, p.x, p.y, d * Math.PI / 2, driver);
  Object.assign(c.ai, { tx: p.tx, ty: p.ty, dir: d });
  c.speed = c.ai.cruise * 0.7; c.vx = Math.cos(c.angle) * c.speed; c.vy = Math.sin(c.angle) * c.speed;
  return c;
}
function manageSpawns(dt) {
  spawnT -= dt; policeCd -= dt;
  if (spawnT > 0) return;
  spawnT = 0.25;
  const far = viewRect(800), farP = viewRect(650);
  const out = (o, r) => o.x < r.x0 || o.x > r.x1 || o.y < r.y0 || o.y > r.y1;
  cars = cars.filter(c => c === player.car || c.mission || c.fire > 0 || !out(c, far) || (c.parked && !c.dead && !c.moved && c.driver === null));
  peds = peds.filter(p => p.target || (!out(p, farP) && !(p.dead && p.deadT > 40)));
  const moving = cars.filter(c => c.driver === 'ai' || (c.driver === 'police' && !c.chase)).length;
  if (moving < 30) {
    const cop = Math.random() < 0.07;
    spawnTraffic(cop ? 'police' : pick(CIV), cop ? 'police' : 'ai');
  }
  if (peds.filter(p => !p.dead).length < 55) {
    const p = spawnOutside([WALK, PLAZA]);
    if (p) makePed(p.x + rand(-8, 8), p.y + rand(-8, 8), { cop: Math.random() < 0.08 });
  }
  if (heat >= 1 && policeCd <= 0 && !player.down) {
    const want = [0, 1, 2, 4, 5, 7][Math.floor(heat)];
    const chasing = cars.filter(c => c.type === 'police' && c.driver === 'police' && c.chase).length;
    if (chasing < want) {
      const c = spawnTraffic('police', 'police');
      if (c) { c.chase = true; c.ai.cruise = 130; }
      policeCd = 2.2;
    }
  }
}
function placeParked() {
  for (const s of parkSpots) if (srnd() < 0.55) {
    const c = makeCar(spick(['compact', 'sedan', 'sedan', 'sports', 'taxi']), s.x, s.y, s.a, null);
    c.parked = true;
  }
}

// ============================================================ main update
function updateWorld(dt) {
  time += dt;
  heatCd -= dt;
  if (!player.hidden) updatePlayer(dt);
  const v = viewRect(900);
  const active = cars.filter(c => c.x > v.x0 && c.x < v.x1 && c.y > v.y0 && c.y < v.y1);
  for (const c of active) {
    const px = c.x, py = c.y;
    if (c.driver === 'ai') aiTraffic(c, dt);
    else if (c.driver === 'police') aiPolice(c, dt);
    else if (c.driver !== 'player') applyControls(c, 0, 0, true, dt);
    moveCar(c, dt);
    if (c.parked && (Math.abs(c.x - px) > 0.5 || Math.abs(c.y - py) > 0.5)) c.moved = true;
  }
  for (const c of cars) { // fires burn everywhere (entangled twins can be far away)
    if (c.fire > 0) {
      c.fire -= dt;
      if (Math.random() < 0.6) addPart(c.x + rand(-6, 6), c.y + rand(-6, 6), rand(-10, 10), rand(-30, -10), 0.6, rand(3, 6), pick(['#ff9c2a', '#ffdf6b', '#ff5a1f']), 6, true);
      if (c.fire <= 0) explodeCar(c);
    } else if (!c.dead && c.hp < CT[c.type].hp * 0.35 && Math.random() < 0.25) {
      addPart(c.x + Math.cos(c.angle) * CT[c.type].l * 0.35, c.y + Math.sin(c.angle) * CT[c.type].l * 0.35, rand(-8, 8), rand(-20, -5), 1, 4, '#777', 6, true);
    }
  }
  collideCars(active);
  collideCarPeds(active);
  if (player.car) { player.x = player.car.x; player.y = player.car.y; }
  updateBranches(dt);
  for (const p of peds) updatePed(p, dt);
  updateBullets(dt);
  for (let i = parts.length - 1; i >= 0; i--) {
    const q = parts[i];
    q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.94; q.vy *= 0.94; q.size += q.grow * dt; q.life -= dt;
    if (q.life <= 0) parts.splice(i, 1);
  }
  if (!player.hidden) {
    updatePickups(dt);
    updateMissions(dt);
    updateBelief(dt);
    // the wanted level fades once the police have lost track of you
    if (heat > 0 && time - lastCrime > 5 && !belief.seen && (belief.sig > 250 || heat < 1)) heat = Math.max(0, heat - dt * 0.12);
    Q.tinfo = Q.tun > 0 ? tunnelInfo() : null;
    const dI = districtAt(player.x, player.y);
    if (dI !== curDistrict) { curDistrict = dI; msg(`— ${DISTRICTS[dI].name} —`, 2.5); }
    if (Q.note) { Q.note.t -= dt; if (Q.note.t <= 0 || hit('KeyN')) Q.note = null; }
  }
  manageSpawns(dt);
  for (const m of msgs) m.t -= dt;
  msgs = msgs.filter(m => m.t > 0);
  if (overlay) { overlay.t -= dt; if (overlay.t <= 0) overlay = null; }
  shake = Math.max(0, shake - dt * 2.5);
}
function updateCamera(dt, instant) {
  const P0 = pp();
  const spd = player.car ? Math.hypot(player.car.vx, player.car.vy) : 0;
  const base = clamp(Math.min(W, H) / 760, 0.55, 1.6);
  const tz = base * (player.car ? lerp(1.15, 0.66, clamp(spd / 420, 0, 1)) : 1.4);
  const tx = P0.x + (player.car ? player.car.vx * 0.35 : 0), ty = P0.y + (player.car ? player.car.vy * 0.35 : 0);
  const k = instant ? 1 : 1 - Math.exp(-dt * 4);
  cam.zoom = instant ? tz : lerp(cam.zoom, tz, 1 - Math.exp(-dt * 1.3));
  cam.x = lerp(cam.x, tx, k); cam.y = lerp(cam.y, ty, k);
}
function updateAudio() {
  if (!AC) return;
  const t = AC.currentTime, c = player.car;
  if (c && state === 'play') {
    engGain.gain.setTargetAtTime(0.05, t, 0.1);
    engOsc.frequency.setTargetAtTime(38 + Math.abs(c.speed) * 0.28 + (keys.up ? 12 : 0), t, 0.08);
  } else engGain.gain.setTargetAtTime(0, t, 0.1);
  let chase = false;
  if (state === 'play' && heat >= 1) for (const q of cars) if (q.chase && d2(q.x, q.y, player.x, player.y) < 700 * 700) { chase = true; break; }
  sirenGain.gain.setTargetAtTime(chase ? 0.035 : 0, t, 0.2);
  sirenOsc.frequency.setTargetAtTime(Math.sin(time * 5) > 0 ? 960 : 720, t, 0.03);
  musicTick(!!c && radio > 0 && state === 'play');
}

// ============================================================ drawing
const GC = { [ROAD]: '#3a3a3f', [WALK]: '#8f8b84', [BUILD]: '#26262a', [GRASS]: '#3d7a38', [WATER]: '#1c4e78', [PLAZA]: '#5d5a56' };
function drawGround(v) {
  const x0 = Math.max(0, Math.floor(v.x0 / T)), y0 = Math.max(0, Math.floor(v.y0 / T));
  const x1 = Math.min(MW - 1, Math.floor(v.x1 / T)), y1 = Math.min(MH - 1, Math.floor(v.y1 / T));
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const t = map[ty * MW + tx], px = tx * T, py = ty * T;
    ctx.fillStyle = GC[t]; ctx.fillRect(px, py, T + 0.6, T + 0.6);
    if (t === ROAD) {
      const vr = roadLine(tx), hr = roadLine(ty);
      if (vr && !hr) {
        if (roadLine(ty + 1) || roadLine(ty - 1)) { ctx.fillStyle = '#d8d8d8'; for (let i = 0; i < 4; i++) ctx.fillRect(px + 3 + i * 8, py + 7, 4, 18); }
        else if ((tx - 1) % P === 0 && ty % 2 === 0) { ctx.fillStyle = '#d4b23a'; ctx.fillRect(px + T - 1, py + 6, 2, T - 12); }
      } else if (hr && !vr) {
        if (roadLine(tx + 1) || roadLine(tx - 1)) { ctx.fillStyle = '#d8d8d8'; for (let i = 0; i < 4; i++) ctx.fillRect(px + 7, py + 3 + i * 8, 18, 4); }
        else if ((ty - 1) % P === 0 && tx % 2 === 0) { ctx.fillStyle = '#d4b23a'; ctx.fillRect(px + 6, py + T - 1, T - 12, 2); }
      }
    } else if (t === WALK) {
      ctx.fillStyle = '#7f7b75'; ctx.fillRect(px, py, T, 1); ctx.fillRect(px, py, 1, T);
      ctx.fillStyle = '#b5b0a6';
      if (tile(tx - 1, ty) === ROAD) ctx.fillRect(px, py, 2, T);
      if (tile(tx + 1, ty) === ROAD) ctx.fillRect(px + T - 2, py, 2, T);
      if (tile(tx, ty - 1) === ROAD) ctx.fillRect(px, py, T, 2);
      if (tile(tx, ty + 1) === ROAD) ctx.fillRect(px, py + T - 2, T, 2);
    } else if (t === GRASS) {
      const h = (tx * 73856093 ^ ty * 19349663) >>> 0;
      ctx.fillStyle = '#468a40'; ctx.fillRect(px + (h % 23), py + ((h >> 5) % 23), 4, 3); ctx.fillRect(px + ((h >> 9) % 25), py + ((h >> 13) % 25), 3, 3);
    } else if (t === WATER) {
      ctx.fillStyle = '#2a6596';
      ctx.fillRect(px + ((time * 12 + tx * 7) % T) * 0.5, py + ((ty * 13) % 20) + 4, 10, 2);
    }
  }
  ctx.fillStyle = '#c9c4b8';
  for (const l of lots) {
    const lx = l.x * T, ly = l.y * T;
    if (lx > v.x1 || ly > v.y1 || lx + 8 * T < v.x0 || ly + 8 * T < v.y0) continue;
    for (let i = 0; i <= 8; i++) { ctx.fillRect(lx + i * T - 1, ly + 4, 2, T * 1.4); ctx.fillRect(lx + i * T - 1, ly + 8 * T - 4 - T * 1.4, 2, T * 1.4); }
  }
}
function drawDecals(v) {
  for (const d of decals) {
    if (d.x < v.x0 - 30 || d.x > v.x1 + 30 || d.y < v.y0 - 30 || d.y > v.y1 + 30) continue;
    if (d.k === 'skid') { ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.a); ctx.fillStyle = 'rgba(15,15,15,.35)'; ctx.fillRect(-3, -1.5, 6, 3); ctx.restore(); }
    else { ctx.fillStyle = d.k === 'blood' ? 'rgba(120,8,8,.8)' : 'rgba(10,10,10,.5)'; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill(); }
  }
}
function drawMarkers() {
  const pulse = 0.5 + 0.5 * Math.sin(time * 6);
  const mk = (p, color, label) => {
    ctx.fillStyle = color; ctx.globalAlpha = 0.25 + pulse * 0.25;
    ctx.fillRect(p.x - 14, p.y - 14, 28, 28); ctx.globalAlpha = 1;
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.strokeRect(p.x - 14, p.y - 14, 28, 28);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(label, p.x, p.y + 3);
  };
  mk(HOSPITAL, '#e74c3c', 'ER');
  mk(POLICE_HQ, '#3498db', 'PD');
  for (const s of SPRAYS) mk(s, '#9b59b6', 'SPRAY');
  for (const b of BOOTHS) {
    ctx.fillStyle = b === ringing && pulse > 0.5 ? '#ffe14d' : '#1e5d3a'; ctx.fillRect(b.x - 6, b.y - 6, 12, 12);
    ctx.fillStyle = '#fff'; ctx.fillRect(b.x - 3, b.y - 3, 6, 3);
  }
  for (const u of pickups) {
    if (u.cd > 0) continue;
    const pk = PK[u.k], bob = Math.sin(time * 4 + u.x) * 2;
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(u.x - 7, u.y - 4, 14, 12);
    ctx.fillStyle = pk.c; ctx.fillRect(u.x - 8, u.y - 9 + bob, 16, 16);
    ctx.fillStyle = '#111'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(pk.l, u.x, u.y + 3 + bob);
  }
}
function drawPed(p, isPlayer) {
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
  if (p.dead || (isPlayer && player.down && player.downKind === 'wasted')) {
    ctx.fillStyle = p.burnt ? '#222' : p.shirt; ctx.fillRect(-6, -3.5, 11, 7);
    ctx.fillStyle = p.burnt ? '#111' : p.skin; ctx.beginPath(); ctx.arc(7, 0, 3, 0, TAU); ctx.fill();
    ctx.restore(); return;
  }
  const sw = (p.moving ? Math.sin(p.anim) : 0) * 3.5;
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(1.5, 1.5, 4.5, 6, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = p.pants || '#2c3e50';
  ctx.fillRect(sw - 2, -3.5, 4, 2.6); ctx.fillRect(-sw - 2, 1, 4, 2.6);
  ctx.fillStyle = p.shirt; ctx.beginPath(); ctx.ellipse(0, 0, 3.4, 5.6, 0, 0, TAU); ctx.fill();
  if (isPlayer && player.weapon) { ctx.fillStyle = '#111'; ctx.fillRect(3, 1.5, player.weapon === 'rocket' ? 11 : 7, player.weapon === 'rocket' ? 3 : 2); }
  else if (p.cop) { ctx.fillStyle = '#111'; ctx.fillRect(3, 1.5, 6, 2); }
  ctx.fillStyle = p.skin; ctx.beginPath(); ctx.arc(0.5, 0, 3, 0, TAU); ctx.fill();
  ctx.fillStyle = p.hair; ctx.beginPath(); ctx.arc(-0.5, 0, 3, Math.PI * 0.5, Math.PI * 1.5); ctx.fill();
  if (p.cop) { ctx.fillStyle = '#0d1b4a'; ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, TAU); ctx.fill(); }
  ctx.restore();
}
function drawCar(c) {
  const t = CT[c.type], l = t.l, w = t.w;
  ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.angle);
  if (!c.ghost) { ctx.fillStyle = 'rgba(0,0,0,.35)'; rrect(-l / 2 + 2, -w / 2 + 3, l, w, 4); }
  const dmg = 1 - clamp(c.hp / t.hp, 0, 1);
  ctx.fillStyle = c.dead ? '#242424' : c.color; rrect(-l / 2, -w / 2, l, w, 4);
  if (c.dead) { ctx.fillStyle = '#111'; ctx.fillRect(-l * 0.25, -w / 2 + 2, l * 0.5, w - 4); ctx.restore(); return; }
  if (c.type === 'truck') {
    ctx.fillStyle = shade(c.color, 1.15); ctx.fillRect(-l / 2 + 1, -w / 2 + 1, l * 0.66, w - 2);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 1; i < 5; i++) ctx.fillRect(-l / 2 + i * l * 0.13, -w / 2 + 1, 1, w - 2);
    ctx.fillStyle = '#1b2631'; ctx.fillRect(l * 0.3, -w / 2 + 2, l * 0.1, w - 4);
  } else {
    if (c.type === 'police') { ctx.fillStyle = '#1b1b1b'; ctx.fillRect(l * 0.22, -w / 2, l * 0.28, w); ctx.fillRect(-l / 2, -w / 2, l * 0.2, w); }
    ctx.fillStyle = '#1b2631'; ctx.fillRect(l * 0.06, -w / 2 + 2, l * 0.16, w - 4);
    ctx.fillStyle = c.type === 'police' ? '#f2f2f2' : shade(c.color, 1.12); ctx.fillRect(-l * 0.2, -w / 2 + 2, l * 0.26, w - 4);
    ctx.fillStyle = '#1b2631'; ctx.fillRect(-l * 0.3, -w / 2 + 2, l * 0.09, w - 4);
    if (c.type === 'sports') { ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(-l / 2 + 1, -1.5, l - 2, 3); }
    if (c.type === 'taxi') { ctx.fillStyle = '#111'; ctx.fillRect(-l * 0.1, -3, 5, 6); ctx.fillStyle = '#fff'; ctx.fillRect(-l * 0.1 + 1, -2, 3, 4); }
    if (c.type === 'police') {
      const on = c.chase && Math.sin(time * 18) > 0;
      ctx.fillStyle = c.chase ? (on ? '#ff3030' : '#5a0000') : '#7a1d1d'; ctx.fillRect(-l * 0.05, -w / 2 + 2, 4, (w - 4) / 2);
      ctx.fillStyle = c.chase ? (!on ? '#3070ff' : '#00105a') : '#1d2f7a'; ctx.fillRect(-l * 0.05, 0, 4, (w - 4) / 2);
      if (c.chase) { ctx.fillStyle = on ? 'rgba(255,40,40,.18)' : 'rgba(40,90,255,.18)'; ctx.beginPath(); ctx.arc(0, 0, 26, 0, TAU); ctx.fill(); }
    }
  }
  ctx.fillStyle = '#fff6c8'; ctx.fillRect(l / 2 - 2, -w / 2 + 1.5, 2, 3); ctx.fillRect(l / 2 - 2, w / 2 - 4.5, 2, 3);
  ctx.fillStyle = c.speed < -5 || (c.driver === 'player' && keys.down) ? '#ff4040' : '#a31515';
  ctx.fillRect(-l / 2, -w / 2 + 1.5, 2, 3); ctx.fillRect(-l / 2, w / 2 - 4.5, 2, 3);
  if (dmg > 0.3) { ctx.fillStyle = `rgba(20,20,20,${dmg * 0.5})`; ctx.fillRect(l * 0.25, -w / 2, l * 0.25, w); }
  const steal = c.mission && mission && mission.type === 'steal' && mission.stage === 0;
  if (steal || c.twin) { ctx.strokeStyle = c.twin ? '#3cf0ff' : '#ff2bd6'; ctx.lineWidth = 2; ctx.strokeRect(-l / 2 - 3, -w / 2 - 3, l + 6, w + 6); }
  ctx.restore();
}
function drawBranches() {
  const c = player.car;
  if (!Q.branches || !c) return;
  const all = [c, ...Q.branches], tot = all.reduce((a, o) => a + (o.amp ?? 1) ** 2, 0);
  ctx.setLineDash([4, 6]); ctx.lineWidth = 1.5;
  for (const g of Q.branches) { ctx.strokeStyle = g.tint; ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(g.x, g.y); ctx.stroke(); }
  ctx.setLineDash([]);
  for (const g of Q.branches) {
    ctx.globalAlpha = 0.25 + 0.4 * g.amp * (0.8 + 0.2 * Math.sin(time * 12));
    drawCar(g);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = g.tint; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(g.x, g.y, 22, 0, TAU); ctx.stroke();
  }
  ctx.font = 'bold 11px ui-monospace, monospace'; ctx.textAlign = 'center';
  for (const o of all) {
    const p = Math.round((o.amp ?? 1) ** 2 / tot * 100);
    ctx.fillStyle = '#000'; ctx.fillText(`${p}%`, o.x + 1, o.y - 25);
    ctx.fillStyle = o.tint || '#fff'; ctx.fillText(`${p}%`, o.x, o.y - 26);
  }
}
function drawBelief() {
  if (heat < 1 || belief.sig < 15 || player.hidden) return;
  const r = Math.max(40, belief.sig * 1.6);
  const g = ctx.createRadialGradient(belief.x, belief.y, 0, belief.x, belief.y, r);
  g.addColorStop(0, 'rgba(80,140,255,.30)'); g.addColorStop(0.6, 'rgba(80,140,255,.12)'); g.addColorStop(1, 'rgba(80,140,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(belief.x, belief.y, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(120,170,255,.6)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(belief.x, belief.y, belief.sig, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
}
function drawBuildings(v) {
  const cx = cam.x, cy = cam.y, list = [];
  for (const b of buildings) if (b.x < v.x1 + 200 && b.x + b.w > v.x0 - 200 && b.y < v.y1 + 200 && b.y + b.h > v.y0 - 200) list.push(b);
  list.sort((a, b) => d2(b.x + b.w / 2, b.y + b.h / 2, cx, cy) - d2(a.x + a.w / 2, a.y + a.h / 2, cx, cy));
  for (const b of list) {
    const k = 1 + b.ht;
    const B = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];
    const R = B.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) & 3;
      ctx.fillStyle = b.walls[i];
      ctx.beginPath(); ctx.moveTo(B[i][0], B[i][1]); ctx.lineTo(B[j][0], B[j][1]); ctx.lineTo(R[j][0], R[j][1]); ctx.lineTo(R[i][0], R[i][1]); ctx.closePath(); ctx.fill();
    }
    const rx = R[0][0], ry = R[0][1], rw = R[2][0] - rx, rh = R[2][1] - ry;
    ctx.fillStyle = b.rim; ctx.fillRect(rx, ry, rw, rh);
    ctx.fillStyle = b.color; ctx.fillRect(rx + 3 * k, ry + 3 * k, rw - 6 * k, rh - 6 * k);
    for (const [u, w2, uw, uh] of b.det) {
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(rx + u * rw + 2, ry + w2 * rh + 2, uw * rw, uh * rh);
      ctx.fillStyle = b.hi; ctx.fillRect(rx + u * rw, ry + w2 * rh, uw * rw, uh * rh);
    }
  }
}
function drawTrees(v) {
  for (const t of trees) {
    if (t.x < v.x0 - 60 || t.x > v.x1 + 60 || t.y < v.y0 - 60 || t.y > v.y1 + 60) continue;
    const x = cam.x + (t.x - cam.x) * 1.12, y = cam.y + (t.y - cam.y) * 1.12;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(t.x + 3, t.y + 3, t.r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2b5e27'; ctx.beginPath(); ctx.arc(x, y, t.r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3c7d34'; ctx.beginPath(); ctx.arc(x - t.r * 0.25, y - t.r * 0.25, t.r * 0.6, 0, TAU); ctx.fill();
  }
}
function drawParts(top) {
  for (const q of parts) {
    if (q.top !== top) continue;
    ctx.globalAlpha = clamp(q.life / q.max, 0, 1);
    ctx.fillStyle = q.color; ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(0.5, q.size), 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function drawWorld() {
  const sx = (Math.random() - 0.5) * shake * 10, sy = (Math.random() - 0.5) * shake * 10;
  ctx.setTransform(DPR * cam.zoom, 0, 0, DPR * cam.zoom, DPR * (W / 2 - cam.x * cam.zoom + sx), DPR * (H / 2 - cam.y * cam.zoom + sy));
  const v = viewRect(8);
  drawGround(v);
  drawDecals(v);
  drawMarkers();
  for (const p of peds) if (p.dead && onScreen(p.x, p.y)) drawPed(p);
  for (const p of peds) if (!p.dead && onScreen(p.x, p.y)) drawPed(p);
  if (!player.car && !player.hidden && !(player.down && player.downKind === 'busted')) drawPed(player, true);
  for (const c of cars) if (onScreen(c.x, c.y, 60)) drawCar(c);
  drawBranches();
  ctx.fillStyle = '#ffe9a0';
  for (const b of bullets) ctx.fillRect(b.x - 1.5, b.y - 1.5, b.rocket ? 5 : 3, b.rocket ? 5 : 3);
  drawParts(false);
  drawBuildings(v);
  drawTrees(v);
  drawParts(true);
  drawBelief();
  const tg = missionTarget();
  if (tg && !player.hidden) {
    const pulse = Math.sin(time * 5) * 4;
    ctx.strokeStyle = mission ? '#ffe14d' : '#7dff7a'; ctx.lineWidth = 3 / cam.zoom + 1;
    ctx.beginPath(); ctx.arc(tg.x, tg.y, 22 + pulse, 0, TAU); ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath(); ctx.moveTo(tg.x, tg.y - 30 - pulse); ctx.lineTo(tg.x - 8, tg.y - 44 - pulse); ctx.lineTo(tg.x + 8, tg.y - 44 - pulse); ctx.fill();
  }
  if (mission && mission.type === 'entangle' && !mission.a.dead && onScreen(mission.a.x, mission.a.y)) {
    // a hint line toward the far twin
    const a = mission.a, b = mission.b, ang = Math.atan2(b.y - a.y, b.x - a.x);
    ctx.strokeStyle = 'rgba(60,240,255,.5)'; ctx.setLineDash([3, 5]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + Math.cos(ang) * 120, a.y + Math.sin(ang) * 120); ctx.stroke(); ctx.setLineDash([]);
  }
}

// ============================================================ HUD
function txt(s, x, y, size, color, align = 'left', bungee = false) {
  ctx.font = bungee ? `${size}px Bungee, Impact, sans-serif` : `bold ${size}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.textAlign = align; ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size / 6); ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(s, x, y);
  ctx.fillStyle = color; ctx.fillText(s, x, y);
}
function wrapLines(text, maxW, font) {
  ctx.font = font;
  const out = []; let line = '';
  for (const w of text.split(' ')) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}
function star(x, y, r, filled, color) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath();
  if (filled) { ctx.fillStyle = color; ctx.fill(); }
  ctx.lineWidth = 2; ctx.strokeStyle = filled ? '#000' : 'rgba(255,255,255,.35)'; ctx.stroke();
}
function drawNote() {
  if (!Q.note) return;
  const n = NOTES[Q.note.k], w = Math.min(380, W - 24), x = W - w - 12;
  const bodyF = '13px system-ui, sans-serif', libF = 'italic 12px system-ui, sans-serif';
  const body = wrapLines(n.body, w - 24, bodyF), lib = wrapLines(n.lib, w - 24, libF);
  const h = 44 + body.length * 17 + 8 + lib.length * 15 + 22;
  const y = H - h - (touchOn() ? 220 : 16);
  ctx.globalAlpha = clamp(Q.note.t, 0, 1);
  ctx.fillStyle = 'rgba(12,10,28,.92)'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#b388ff'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = '#b388ff'; ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('QUANTUM NOTE', x + 12, y + 18);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 15px system-ui, sans-serif'; ctx.fillText(n.title, x + 12, y + 36);
  ctx.fillStyle = '#ddd'; ctx.font = bodyF; body.forEach((l, i) => ctx.fillText(l, x + 12, y + 56 + i * 17));
  ctx.fillStyle = '#9fa8c8'; ctx.font = libF; lib.forEach((l, i) => ctx.fillText(l, x + 12, y + 60 + body.length * 17 + i * 15));
  ctx.fillStyle = '#777'; ctx.font = '11px system-ui, sans-serif'; ctx.fillText(touchOn() ? 'All notes: pause, then help' : 'N: dismiss · H: all notes', x + 12, y + h - 8);
  ctx.globalAlpha = 1;
}
function drawHUD() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const small = W < 600, s = small ? 0.8 : 1;
  txt(fmt(player.cash), W - 16, 40 * s, 32 * s, '#ffd54a', 'right', true);
  txt(`x${player.mult}  ${'♥'.repeat(Math.max(0, player.lives))}`, W - 16, 64 * s, 16 * s, '#ff8a8a', 'right');
  txt(`ψ×${Q.psi}  T×${Q.tun}`, W - 16, 86 * s, 15 * s, '#c9b3ff', 'right');
  const stars = Math.floor(heat), flash = heat >= 1 && belief.seen && Math.sin(time * 8) > 0;
  for (let i = 0; i < 5; i++) star(W / 2 - 60 + i * 30, 26, 11, i < stars, flash ? '#fff' : '#ffd54a');
  if (heat >= 1) txt(belief.seen ? 'SEEN' : `LOST YOU · Δx ≈ ${Math.round(belief.sig / T)} tiles`, W / 2, 98, 12, belief.seen ? '#ff6b6b' : '#8fb4ff', 'center');
  if (Q.branches) txt(`SUPERPOSED · ${Math.ceil(Q.supT)}s · X to collapse`, W / 2, 118, 13, '#c9b3ff', 'center');
  if (Q.tinfo) txt(`T: tunnel through ${(Q.tinfo.d / T).toFixed(1)} tiles · p = ${Math.round(Q.tinfo.p * 100)}%`, W / 2, H / 2 + 70, 13, '#4dd0e1', 'center');
  const bx = 16, by = H - (touchOn() ? 196 : 40);
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(bx, by, 164, 14);
  ctx.fillStyle = player.hp > 35 ? '#2ecc71' : '#e74c3c'; ctx.fillRect(bx + 2, by + 2, 160 * clamp(player.hp / 100, 0, 1), 10);
  if (player.car) {
    const c = player.car, t = CT[c.type];
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(bx, by - 18, 164, 10);
    ctx.fillStyle = c.fire > 0 ? '#ff5a1f' : '#5dade2'; ctx.fillRect(bx + 2, by - 16, 160 * clamp(c.hp / t.hp, 0, 1), 6);
    txt(`${t.label}${radio ? '  ♪ ' + STATIONS[radio].name : ''}`, bx, by - 26, 13, '#ddd');
  } else {
    const w = player.weapon;
    txt(w ? `${WEAPONS[w].name}  ${player.weapons[w]}` : 'Fists', bx, by - 8, 15, '#fff');
  }
  if (showMap) {
    const ms = small ? 1.1 : 1.6, mx = 12, my = 12, sz = MW * ms;
    ctx.globalAlpha = 0.85; ctx.drawImage(mm, mx, my, sz, sz); ctx.globalAlpha = 1;
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeRect(mx, my, sz, sz);
    const dot = (x, y, c, r = 2.5) => { ctx.fillStyle = c; ctx.fillRect(mx + x / T * ms - r, my + y / T * ms - r, r * 2, r * 2); };
    if (heat >= 1 && belief.sig > 15) {
      ctx.strokeStyle = 'rgba(120,170,255,.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(mx + belief.x / T * ms, my + belief.y / T * ms, Math.max(3, belief.sig / T * ms), 0, TAU); ctx.stroke();
    }
    for (const c of cars) if (c.chase) dot(c.x, c.y, Math.sin(time * 10) > 0 ? '#f33' : '#33f', 2);
    dot(HOSPITAL.x, HOSPITAL.y, '#e74c3c', 2); dot(POLICE_HQ.x, POLICE_HQ.y, '#3498db', 2);
    for (const sp of SPRAYS) dot(sp.x, sp.y, '#c27cf0', 2);
    if (Q.branches) for (const g of Q.branches) dot(g.x, g.y, g.tint, 2);
    const tg = missionTarget(); if (tg) dot(tg.x, tg.y, '#ffe14d', 3.5);
    dot(player.x, player.y, '#fff', 3);
    txt(DISTRICTS[districtAt(player.x, player.y)].name, mx, my + sz + 16, 12, '#ddd');
  }
  const tg = missionTarget();
  if (tg && !player.down) {
    const a = Math.atan2(tg.y - player.y, tg.x - player.x), d = Math.hypot(tg.x - player.x, tg.y - player.y);
    const ax = W / 2, ay = 62;
    ctx.save(); ctx.translate(ax, ay); ctx.rotate(a);
    ctx.fillStyle = mission ? '#ffe14d' : '#7dff7a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-10, -11); ctx.lineTo(-4, 0); ctx.lineTo(-10, 11); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    txt(`${Math.round(d / T)}m`, ax + 40, ay + 5, 12, '#fff', 'left');
  }
  if (mission) {
    let line = '';
    switch (mission.type) {
      case 'deliver': line = mission.stage ? `Deliver the case · P(bomb) ${Math.round(mission.bomb * 100)}%` : 'Pick up the briefcase'; break;
      case 'steal': line = mission.stage ? 'Bring the coupe to the garage' : 'Steal the pink coupe'; break;
      case 'hit': line = 'Take out the man in pink'; break;
      case 'race': line = `Checkpoint ${mission.stage + 1}/${mission.pts.length}`; break;
      case 'wreck': line = `Wreck cars ${mission.count}/${mission.need}`; break;
      case 'entangle': line = 'Wreck the near cyan twin'; break;
    }
    txt(line, W - 16, 110 * s, 15 * s, '#ffe14d', 'right');
    if (mission.timer > 0) txt(`${Math.ceil(mission.timer)}s`, W - 16, 134 * s, 20 * s, mission.timer < 10 ? '#ff6b6b' : '#fff', 'right');
  }
  let my2 = H - (touchOn() ? 230 : 80);
  // keep messages clear of the quantum-note panel on the right
  const mx2 = Q.note && W > 700 ? (W - Math.min(380, W - 24) - 12) / 2 : W / 2;
  for (let i = msgs.length - 1; i >= 0; i--) {
    ctx.globalAlpha = clamp(msgs[i].t, 0, 1);
    txt(msgs[i].text, mx2, my2, small ? 13 : 17, '#fff', 'center');
    my2 -= small ? 20 : 26;
  }
  ctx.globalAlpha = 1;
  drawNote();
  if (overlay) {
    ctx.globalAlpha = clamp(Math.min(overlay.t, overlay.max - overlay.t) * 3, 0, 1);
    txt(overlay.text, W / 2, H / 2 - 10, Math.min(84, W / 9), overlay.color, 'center', true);
    if (overlay.sub) txt(overlay.sub, W / 2, H / 2 + 30, 18, '#fff', 'center');
    ctx.globalAlpha = 1;
  }
  if (helpPage) drawHelp();
}
const HELP = [
  ['Arrows / WASD', 'drive · walk (up = forward, left/right = turn)'],
  ['Space', 'shoot on foot · handbrake in a car'],
  ['Enter / F / E', 'get in or out of cars (occupied ones too)'],
  ['Q / Tab', 'switch weapon'],
  ['X', 'superposition: split your car into 3 branches'],
  ['T', 'quantum-tunnel through the wall you face'],
  ['R · M', 'radio station · minimap'],
  ['P / Esc · H', 'pause · help (press H again for quantum notes)'],
];
function drawHelp() {
  const w = Math.min(600, W - 24), h = Math.min(H - 24, 420), x = (W - w) / 2, y = (H - h) / 2;
  ctx.fillStyle = 'rgba(10,10,14,.94)'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = helpPage === 1 ? '#ffd54a' : '#b388ff'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
  if (helpPage === 1) {
    txt('HOW TO PLAY', W / 2, y + 36, 22, '#ffd54a', 'center', true);
    HELP.forEach(([k, d], i) => { txt(k, x + 16, y + 74 + i * 26, 13, '#ffd54a'); txt(d, x + 160, y + 74 + i * 26, 12, '#ddd'); });
    const lines = wrapLines(`Answer ringing payphones for jobs. Spray shops make the cops forget you. Reach ${fmt(GOAL)} to own the city.`, w - 32, '12px system-ui, sans-serif');
    lines.forEach((l, i) => txt(l, W / 2, y + h - 46 + i * 16, 12, '#aaa', 'center'));
    txt('H: quantum notes', W / 2, y + h - 10, 11, '#777', 'center');
  } else {
    txt('QUANTUM NOTES', W / 2, y + 36, 22, '#b388ff', 'center', true);
    let yy = y + 64;
    for (const k of Object.keys(NOTES)) {
      const n = NOTES[k], seen = Q.notes.has(k);
      ctx.fillStyle = seen ? '#fff' : '#888'; ctx.font = 'bold 13px system-ui, sans-serif'; ctx.textAlign = 'left';
      ctx.fillText((seen ? '● ' : '○ ') + n.title, x + 16, yy);
      const l = wrapLines(n.body, w - 40, '11px system-ui, sans-serif');
      ctx.fillStyle = '#aab'; ctx.font = '11px system-ui, sans-serif';
      l.slice(0, 3).forEach((s2, i) => ctx.fillText(s2, x + 30, yy + 15 + i * 13));
      yy += 18 + Math.min(3, l.length) * 13 + 6;
      if (yy > y + h - 20) break;
    }
    txt('H: close', W / 2, y + h - 8, 11, '#777', 'center');
  }
}
function drawTitle() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(8,8,12,.55)'); g.addColorStop(1, 'rgba(8,8,12,.88)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const big = Math.min(96, W / 7);
  // a "superposed" title: faint offset copies
  for (const [dx, col] of [[-4, 'rgba(179,136,255,.5)'], [4, 'rgba(77,208,225,.5)']]) txt('GRIDLOCK', W / 2 + dx * Math.sin(time * 2), H * 0.28, big, col, 'center', true);
  txt('GRIDLOCK', W / 2, H * 0.28, big, '#ffd54a', 'center', true);
  txt('QUANTUM CITY', W / 2, H * 0.28 + big * 0.8, big * 0.45, '#b388ff', 'center', true);
  txt('a top-down crime sandbox where the cops can\'t pin you down', W / 2, H * 0.28 + big * 1.3, Math.min(16, W / 32), '#ddd', 'center');
  if (Math.sin(time * 4) > -0.3) txt(touchOn() ? 'TAP TO START' : 'PRESS ENTER TO START', W / 2, H * 0.6, 22, '#fff', 'center', true);
  if (W > 560) HELP.slice(0, 6).forEach(([k, d], i) => txt(`${k}  —  ${d}`, W / 2, H * 0.68 + i * 21, 13, '#bbb', 'center'));
  if (best > 0) txt(`Best: ${fmt(best)}`, W / 2, H - 24, 14, '#ffd54a', 'center');
}
function drawOver() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(0, 0, W, H);
  txt('GAME OVER', W / 2, H * 0.4, Math.min(80, W / 8), '#e74c3c', 'center', true);
  txt(`You made ${fmt(player.cash)}   ·   best ${fmt(best)}`, W / 2, H * 0.4 + 50, 18, '#fff', 'center');
  if (Math.sin(time * 4) > -0.3) txt('PRESS ENTER / TAP TO PLAY AGAIN', W / 2, H * 0.62, 20, '#ffd54a', 'center', true);
}

// ============================================================ game flow
function resetWorld() {
  cars = []; peds = []; bullets = []; parts = []; decals = [];
  seed = 4242; placeParked(); placePickups();
}
function newGame() {
  resetWorld();
  Object.assign(player, { hp: 100, car: null, weapons: {}, weapon: null, cash: 0, lives: 5, mult: 1, down: 0, bust: 0, hidden: false, x: HOSPITAL.x, y: HOSPITAL.y, angle: 0 });
  Object.assign(Q, { psi: 1, tun: 2, branches: null, note: null });
  heat = 0; belief.sig = 0; mission = null; ringing = null; ringCd = 3; won = false; curDistrict = -1; msgs = []; overlay = null;
  updateCamera(0, true);
  for (let i = 0; i < 30; i++) manageSpawns(1);
  msg('Welcome to Quantum City. Find a ride, any ride.', 5);
  msg('In a car: X superposes it, T tunnels through walls. H for help.', 6);
  state = 'play';
}
function titleInit() {
  resetWorld();
  player.hidden = true; player.car = null;
  const start = tileCenter(findTileNear(1 + 3 * P, 1 + 3 * P, ROAD));
  player.x = start.x; player.y = start.y;
  updateCamera(0, true);
  for (let i = 0; i < 30; i++) manageSpawns(1);
}
titleInit();

let last = performance.now();
function frame(nowT) {
  const dt = Math.min(0.05, Math.max(0.001, (nowT - last) / 1000)); last = nowT;
  if (state === 'title') {
    player.x += dt * 60; player.y += dt * 25;
    if (player.x > (MW - 10) * T) player.x = 10 * T;
    if (player.y > (MH - 10) * T) player.y = 10 * T;
    updateWorld(dt); updateCamera(dt);
    cam.zoom = clamp(Math.min(W, H) / 760, 0.55, 1.6) * 0.9;
    if (hit('Enter', 'Space', 'Tap', 'NumpadEnter')) newGame();
  } else if (state === 'play') {
    if (hit('KeyP', 'Escape')) state = 'pause';
    if (hit('KeyH')) helpPage = (helpPage + 1) % 3;
    if (hit('KeyM')) showMap = !showMap;
    if (hit('KeyR')) { radio = (radio + 1) % STATIONS.length; msg(radio ? `♪ ${STATIONS[radio].name}` : 'Radio off', 2); }
    if (!helpPage) { updateWorld(dt); updateCamera(dt); }
    else if (hit('Tap')) helpPage = (helpPage + 1) % 3;
  } else if (state === 'pause') {
    if (hit('KeyP', 'Escape', 'Enter')) state = 'play';
    if (hit('Tap')) { state = 'play'; helpPage = 1; }
  } else if (state === 'over') {
    time += dt;
    if (hit('Enter', 'Tap', 'NumpadEnter')) newGame();
  }
  updateAudio();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#111'; ctx.fillRect(0, 0, cv.width, cv.height);
  drawWorld();
  if (state === 'title') drawTitle();
  else {
    drawHUD();
    if (state === 'pause') {
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, 0, W, H);
      txt('PAUSED', W / 2, H / 2, 64, '#fff', 'center', true);
      txt(touchOn() ? 'tap for help & quantum notes' : 'P to resume · H for help & quantum notes', W / 2, H / 2 + 36, 14, '#ccc', 'center');
    }
    if (state === 'over') drawOver();
  }
  for (const k in pressed) delete pressed[k];
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// debug/test hook
window.__gridlock = { player, Q, belief, get cars() { return cars; }, get peds() { return peds; }, get state() { return state; }, get heat() { return heat; }, set heat(v) { heat = v; }, newGame, superpose, collapse, tunnel, startMission, keys, pressed };
})();
