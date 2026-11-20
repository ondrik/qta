// Quant Theft Auto — a lightweight top-down open-city crime sandbox
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
// landmarks: a river with bridges, the airport, a stadium and the outer expressway ring
const bridge = new Uint8Array(MW * MH);
const RIVER_BY = 3, AX0 = 1 + 6 * P + 2, AX1 = 1 + 7 * P + 11;
const AIRPORT = { x0: AX0 * T, y0: AX0 * T, x1: (AX1 + 1) * T, y1: (AX1 + 1) * T, ry0: 78 * T, ry1: 81 * T, rx0: 76 * T, rx1: 96 * T };
const PLANES = [{ x: 80 * T, y: 85.5 * T, a: 0 }, { x: 88 * T, y: 85.5 * T, a: Math.PI }];
const STADIUM = { x0: 1 + 4 * P + 3, y0: 1 + 5 * P + 3 };
const isHighway = (tx, ty) => tile(tx, ty) === ROAD && ((roadLine(tx) && (tx <= 2 || tx >= NB * P + 1)) || (roadLine(ty) && (ty <= 2 || ty >= NB * P + 1)));
function paint(b, color) {
  b.color = color; b.walls = [0.5, 0.72, 0.6, 0.85].map(f => shade(color, f)); b.rim = shade(color, 1.18); b.hi = shade(color, 1.3);
}

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
    const b = { x: x * T, y: y * T, w: w * T, h: h * T, ht: D.h + srnd() * 0.22 + (w * h > 20 ? 0.06 : 0), det };
    paint(b, color); buildings.push(b); return b;
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
  // river: one band of blocks becomes water; some avenues cross it on bridges
  for (let y = 1 + RIVER_BY * P + 2; y <= 1 + RIVER_BY * P + 11; y++) for (let x = 1; x <= NB * P + 2; x++) {
    const k = Math.floor((x - 1) / P);
    if (roadLine(x) && (k % 2 === 1 || k === 0 || k === NB)) bridge[y * MW + x] = 1;
    else map[y * MW + x] = WATER;
  }
  // airport: 2x2 blocks merged into tarmac
  fill(AX0, AX0, AX1 - AX0 + 1, AX1 - AX0 + 1, PLAZA);
  const special = (x, y, w, h, color, ht) => { const b = addBuilding(x, y, w, h, 0); paint(b, color); b.ht = ht; b.det = []; return b; };
  special(76, 89, 8, 6, '#9aa7b4', 0.14);              // terminal
  special(84, 89, 2, 2, '#c8d0d8', 0.55);              // control tower
  special(87, 89, 4, 6, '#7d8a6a', 0.1); special(92, 89, 4, 6, '#7d8a6a', 0.1); // hangars
  special(STADIUM.x0, STADIUM.y0, 8, 8, '#8d939a', 0.16).stadium = true;
  for (let by = 0; by < NB; by++) for (let bx = 0; bx < NB; bx++) {
    const x0 = 1 + bx * P + 3, y0 = 1 + by * P + 3;
    if (by === RIVER_BY || (bx >= 6 && by >= 6) || (bx === 4 && by === 5)) continue;
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
const POLICE_HQ = blockSide(5, 5);
const SPRAYS = [blockSide(3, 5), blockSide(6, 2)];
const BOOTHS = [[0, 4], [2, 1], [5, 2], [5, 6], [7, 1], [2, 7], [7, 4]].map(([bx, by]) => tileCenter(findTileNear(1 + bx * P + 6, 1 + by * P + 2, WALK)));

// street lamps at block corners, on bridges, and runway lights
const lamps = [];
for (let ty = 1; ty < MH - 1; ty++) for (let tx = 1; tx < MW - 1; tx++) {
  const t = map[ty * MW + tx], lx = (tx - 1) % P, ly = (ty - 1) % P;
  if (t === WALK && (lx === 2 || lx === 11) && (ly === 2 || ly === 11)) lamps.push({ x: (tx + 0.5) * T + (lx === 2 ? -10 : 10), y: (ty + 0.5) * T + (ly === 2 ? -10 : 10), r: 85 });
  else if (bridge[ty * MW + tx] && ty % 3 === 0 && (tile(tx - 1, ty) === WATER || tile(tx + 1, ty) === WATER)) lamps.push({ x: (tx + 0.5) * T + (tile(tx - 1, ty) === WATER ? -13 : 13), y: (ty + 0.5) * T, r: 65 });
}
for (let x = AIRPORT.rx0; x <= AIRPORT.rx1; x += 64) { lamps.push({ x, y: AIRPORT.ry0 + 4, r: 28, c: 'rgba(150,210,255,.95)' }); lamps.push({ x, y: AIRPORT.ry1 - 4, r: 28, c: 'rgba(150,210,255,.95)' }); }
const LANDMARKS = [
  { name: 'Gridlock International Airport', x0: AX0, y0: AX0, x1: AX1, y1: AX1 },
  { name: 'Quantum Stadium', x0: STADIUM.x0 - 1, y0: STADIUM.y0 - 1, x1: STADIUM.x0 + 8, y1: STADIUM.y0 + 8 },
  { name: 'Copper River', x0: 1, y0: 1 + RIVER_BY * P + 2, x1: NB * P + 2, y1: 1 + RIVER_BY * P + 11 },
];
function placeName(x, y) {
  const tx = Math.floor(x / T), ty = Math.floor(y / T);
  for (const l of LANDMARKS) if (tx >= l.x0 && tx <= l.x1 && ty >= l.y0 && ty <= l.y1) return l.name;
  if (isHighway(tx, ty)) return 'Ring Expressway';
  return DISTRICTS[districtAt(x, y)].name;
}

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
cv.addEventListener('pointerdown', e => { initAudio(); pressed.Tap = true; tapAt = { x: e.clientX, y: e.clientY }; });

// ============================================================ entities
const CT = {
  compact: { label: 'Hatchback',      w: 14, l: 27, max: 290, acc: 250, turn: 3.0, hp: 70,  mass: 0.8, colors: ['#c0392b', '#2e86c1', '#27ae60', '#d35400', '#8e44ad', '#bdc3c7'] },
  sedan:   { label: 'Sedan',          w: 16, l: 32, max: 320, acc: 230, turn: 2.7, hp: 100, mass: 1.0, colors: ['#34495e', '#7f8c8d', '#922b21', '#1f618d', '#196f3d', '#ecf0f1', '#5d4037'] },
  sports:  { label: 'Sports Coupe',   w: 16, l: 31, max: 450, acc: 420, turn: 3.2, hp: 80,  mass: 0.9, colors: ['#e74c3c', '#f1c40f', '#ff6f00', '#00bcd4', '#e91e63'] },
  truck:   { label: 'Box Truck',      w: 20, l: 46, max: 230, acc: 150, turn: 1.9, hp: 220, mass: 2.2, colors: ['#6d4c41', '#455a64', '#827717', '#37474f'] },
  taxi:    { label: 'Taxi',           w: 16, l: 32, max: 330, acc: 250, turn: 2.8, hp: 100, mass: 1.0, colors: ['#f4d03f'] },
  police:  { label: 'Police Cruiser', w: 16, l: 33, max: 410, acc: 350, turn: 3.0, hp: 160, mass: 1.3, colors: ['#f2f2f2'] },
  bike:    { label: 'Motorbike',      w: 8,  l: 20, max: 470, acc: 480, turn: 3.6, hp: 45,  mass: 0.4, colors: ['#111', '#c0392b', '#f1c40f', '#2e86c1'], bike: true },
  bus:     { label: 'City Bus',       w: 22, l: 60, max: 210, acc: 120, turn: 1.6, hp: 300, mass: 3.2, colors: ['#e67e22', '#2471a3', '#c0392b'] },
  tank:    { label: 'Tank',           w: 26, l: 44, max: 190, acc: 160, turn: 1.7, hp: 900, mass: 7.0, colors: ['#556b2f'] },
  ambulance: { label: 'Ambulance',    w: 18, l: 38, max: 330, acc: 260, turn: 2.6, hp: 150, mass: 1.4, colors: ['#f4f6f7'] },
  firetruck: { label: 'Fire Truck',   w: 20, l: 50, max: 280, acc: 200, turn: 2.0, hp: 260, mass: 2.6, colors: ['#c0392b'] },
};
const CIV = ['compact', 'compact', 'sedan', 'sedan', 'sedan', 'sports', 'truck', 'taxi', 'bike', 'bike', 'bus'];
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
let spawnT = 0, policeCd = 0, heatCd = 0, curDistrict = -1, sprayCd = 0, serviceCd = 0;
let dayT = 17 / 24, tapAt = null, lab = null, labFlags = {}, labCars = [], labRect = null;
const DAY_LEN = 480; // seconds per in-game day
const flight = { t: 8, x: 0, v: 0, alt: 0, on: false };
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
  bb84: {
    title: 'Quantum key distribution (BB84)',
    body: 'Alice sends qubits, each prepared in one of two bases (+ or ×). Bob measures each one in a random basis. They then compare bases publicly and keep only the bits where the bases matched (sifting). An eavesdropper has to measure too, and she can\'t copy qubits (the no-cloning theorem). Measuring in the wrong basis disturbs them and leaves about 25% errors in the kept key. Above roughly 11% errors the key is thrown away.',
    lib: 'This is real: BB84 (Bennett & Brassard, 1984) runs on commercial fibre links today. Game liberty: real systems send millions of photons, not 24, and they correct small errors caused by noise before using the key.',
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
    if (c === player.car) { shake = Math.min(1, impact / 500); hardKnock(); if (CT[c.type].bike && impact > 200) bikeThrow(); }
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
function bikeThrow() {
  const c = player.car;
  if (!c) return;
  if (Q.branches) collapse('you fell off');
  c.driver = null; player.car = null;
  const s = sideSpot(c) || c; player.x = s.x; player.y = s.y; player.angle = c.angle;
  msg('You got thrown off the bike!', 2); hurtPlayer(18);
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
  if (!c.driver || c.driver === 'player') return null;
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
  let target = a.cruise * (1 - Math.min(diff, 1) * 0.65) * (isHighway(a.tx, a.ty) ? 1.7 : 1);
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
// drive along a flow field toward a goal (shared by police, Eve and emergency vehicles)
function navTo(c, gx, gy, sp, dt) {
  c.flowT = (c.flowT || 0) - dt;
  if (c.flowT <= 0 || c.fgx === undefined || d2(c.fgx, c.fgy, gx, gy) > 48 * 48) {
    c.flow = c.flow || new Int16Array(MW * MH); computeFlowInto(c.flow, gx, gy); c.fgx = gx; c.fgy = gy; c.flowT = 1;
  }
  let bx = Math.floor(c.x / T), by = Math.floor(c.y / T);
  for (let s = 0; s < 2; s++) {
    let bv = flowAt(c.flow, bx, by), nb = -1;
    for (let k = 0; k < 4; k++) { const v = flowAt(c.flow, bx + DX[k], by + DY[k]); if (v < bv) { bv = v; nb = k; } }
    if (nb < 0) break;
    bx += DX[nb]; by += DY[nb];
  }
  const ok = flowAt(c.flow, bx, by) < 32767;
  driveToward(c, ok ? (bx + 0.5) * T : gx, ok ? (by + 0.5) * T : gy, sp, dt);
}
function aiPolice(c, dt) {
  if (heat < 1 || player.down || player.hidden) { c.chase = false; aiTraffic(c, dt); return; }
  c.chase = true;
  const P0 = pp(), d = Math.hypot(P0.x - c.x, P0.y - c.y), tank = c.type === 'tank';
  const see = !Q.branches && d < (tank ? 320 : 160) && los(c.x, c.y, P0.x, P0.y);
  c.copCd -= dt; c.shootCd -= dt;
  if (see && !tank && !player.car && d < 110 && Math.abs(c.speed) < 70 && c.copCd <= 0) {
    const s = sideSpot(c);
    if (s) { makePed(s.x, s.y, { cop: true }); c.copCd = 7; }
  }
  if (see) {
    if (tank) { c.turret = Math.atan2(P0.y - c.y, P0.x - c.x); if (c.shootCd <= 0) { c.shootCd = 3; fireShell(c, c.turret, 'cop'); } }
    else if (heat >= 4 && d < 260 && c.shootCd <= 0) { c.shootCd = 1.3; enemyShot(c.x, c.y, P0.x, P0.y, 9, 0.12); }
  }
  if (see && d < 160) { driveToward(c, P0.x, P0.y, !player.car ? (d < 80 ? 0 : 140) : (tank ? 190 : 330), dt); return; }
  // otherwise drive toward this car's own guess, sampled from the police belief cloud
  c.guessT = (c.guessT || 0) - dt;
  if (c.guessT <= 0 || c.gx === undefined || d2(c.x, c.y, c.gx, c.gy) < 50 * 50) {
    const g = Math.min(belief.sig, 700);
    let gx = clamp(belief.x + gauss() * g, T, (MW - 2) * T), gy = clamp(belief.y + gauss() * g, T, (MH - 2) * T);
    if (solidAt(gx, gy)) { gx = belief.x; gy = belief.y; }
    c.gx = gx; c.gy = gy; c.guessT = belief.sig < 40 ? 0.5 : 3;
  }
  navTo(c, c.gx, c.gy, belief.sig > 150 ? 200 : 330, dt);
}
function fireShell(c, a, owner) {
  const l = CT[c.type].l / 2 + 8;
  c.turret = a;
  bullets.push({ x: c.x + Math.cos(a) * l, y: c.y + Math.sin(a) * l, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, life: 1.6, dmg: 0, owner, rocket: true, shooter: c });
  addPart(c.x + Math.cos(a) * l, c.y + Math.sin(a) * l, 0, 0, 0.1, 9, '#fff2a8');
  if (onScreen(c.x, c.y)) sfx.rocket();
}
// Eve, the eavesdropper, tails you during quantum-key jobs
function aiEve(c, dt) {
  const P0 = pp(), d = Math.hypot(P0.x - c.x, P0.y - c.y);
  if (d < 140 && los(c.x, c.y, P0.x, P0.y)) driveToward(c, P0.x, P0.y, d < 50 ? Math.abs(P0.speed || 0) : 320, dt);
  else navTo(c, P0.x, P0.y, 320, dt);
}
// ambulances revive the fallen, fire trucks put out fires and tow wrecks
function aiService(c, dt) {
  const j = c.job;
  const valid = j && (c.type === 'ambulance' ? (j.dead && peds.includes(j)) : (cars.includes(j) && (j.dead || j.fire > 0)));
  if (!valid) { c.job = null; c.driver = 'ai'; c.ai.tx = -99; aiTraffic(c, dt); return; }
  const d = Math.hypot(j.x - c.x, j.y - c.y);
  if (d > 58) { c.workT = 0; navTo(c, j.x, j.y, 260, dt); return; }
  applyControls(c, 0, 0, true, dt);
  c.workT = (c.workT || 0) + dt;
  if (c.type === 'firetruck') sprayWater(c, Math.atan2(j.y - c.y, j.x - c.x), dt);
  else if (Math.random() < 0.3) addPart(j.x + rand(-6, 6), j.y + rand(-6, 6), 0, -20, 0.6, 2.5, '#7dff7a', 0, true);
  if (c.workT > 3) {
    if (c.type === 'ambulance') { Object.assign(j, { dead: false, hp: 30, burnt: false, flee: 6, fx: c.x, fy: c.y, tx: -1 }); if (onScreen(j.x, j.y)) msg('Paramedics patched someone up.', 2); }
    else if (j.fire > 0) { j.fire = 0; j.hp = 5; }
    else if (j !== player.car && !j.mission) cars.splice(cars.indexOf(j), 1);
    c.job = null;
  }
}
function sprayWater(c, a, dt) {
  const l = CT[c.type].l / 2, hx = Math.cos(a), hy = Math.sin(a);
  for (let i = 0; i < 3; i++) { const s = a + rand(-0.12, 0.12), v = rand(300, 380); addPart(c.x + hx * l, c.y + hy * l, Math.cos(s) * v, Math.sin(s) * v, 0.45, 2.5, pick(['#9fd3ff', '#cfe9ff', '#6fb7ff']), 4); }
  const inCone = o => { const dx = o.x - c.x, dy = o.y - c.y, f = dx * hx + dy * hy; return f > 0 && f < 170 && Math.abs(-dx * hy + dy * hx) < 26 + f * 0.15; };
  for (const p of peds) if (!p.dead && inCone(p)) { moveFree(p, hx * 120, hy * 120, dt, 4); if (!p.cop) { p.flee = 3; p.fx = c.x; p.fy = c.y; } }
  for (const o of cars) if (o !== c && inCone(o)) { if (o.fire > 0 && !o.dead) { o.fire = 0; o.hp = Math.max(o.hp, 5); } o.vx += hx * 60 * dt; o.vy += hy * 60 * dt; }
  if (!player.car && !player.hidden && inCone(player)) moveFree(player, hx * 100, hy * 100, dt, 4);
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
  if (p.vip) { p.moving = false; p.angle += Math.sin(time * 2) * dt; return; }
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
  for (const c of cars) if ((c.type === 'police' || c.type === 'tank') && c.driver === 'police' && d2(c.x, c.y, x, y) < r * r) return true;
  return false;
}
// does any cop currently have eyes on point (x, y)?
function copSees(x, y) {
  for (const p of peds) if (p.cop && !p.dead) { const dd = d2(p.x, p.y, x, y); if (dd < 70 * 70 || (dd < 260 * 260 && los(p.x, p.y, x, y))) return true; }
  for (const c of cars) if ((c.type === 'police' || c.type === 'tank') && c.driver === 'police') { const dd = d2(c.x, c.y, x, y); if (dd < 70 * 70 || (dd < 300 * 300 && los(c.x, c.y, x, y))) return true; }
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
  Q.psi--; Q.supT = 10; Q.grace = 0.8; c.amp = 1; c.phase = 0; Q.branches = [];
  for (let i = 0; i < 2; i++) {
    const g = { ghost: true, type: c.type, x: c.x, y: c.y, angle: c.angle, vx: c.vx, vy: c.vy, speed: c.speed, hp: 1e9, dead: false,
      color: c.color, amp: 1, phase: 0, tint: i ? '#4dd0e1' : '#b388ff', pref: i,
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
  c.phase = (c.phase || 0) + Math.abs(c.speed) * dt / 40;
  for (const g of Q.branches) {
    g.phase += v * dt / 40;
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
  labFlags.collapsed = true; if (reason === 'a cop saw you') labFlags.observed = true;
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
    sfx.tunnel(); labFlags.tunnels = (labFlags.tunnels || 0) + 1;
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
  if (c.driver && c.driver !== 'player') {
    const wasCop = c.driver === 'police';
    const p = ejectDriver(c, false);
    if (p && !wasCop) { p.flee = 6; p.fx = player.x; p.fy = player.y; }
    if (copNear(c.x, c.y, 380) || wasCop) addHeat(wasCop ? 1.2 : 0.6);
    msg(wasCop ? 'You jacked a cop car. Bold.' : `Carjacked a ${CT[c.type].label}!`, 2);
  } else if (c.type === 'police') addHeat(1);
  c.driver = 'player'; player.car = c; c.parked = false; c.job = null;
  if (c.type === 'ambulance' && player.hp < 100) { player.hp = 100; msg('Ambulance first-aid kit: health restored.', 2); }
  if (c.type === 'tank') msg('TANK! Space fires the cannon.', 3);
  if (c.type === 'firetruck') msg('Fire truck: Space sprays water.', 3);
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
  if (!lab) player.lives--;
  bigText('WASTED', '#e74c3c', 4, lab ? 'the lesson restarts' : player.lives > 0 ? `${player.lives} ${player.lives === 1 ? 'life' : 'lives'} left` : '');
  addDecal({ k: 'blood', x: player.x, y: player.y, r: 12 });
  if (mission && !lab) failMission('You got wasted.');
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
  if (mission && !lab) failMission('You got busted.');
  sfx.bad();
}
function respawn() {
  if (lab) { player.down = 0; setupLesson(lab.i); return; }
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
    const c = player.car, special = c.type === 'tank' || c.type === 'firetruck';
    applyControls(c, keys.up ? 1 : keys.down ? -1 : 0, keys.right - keys.left, !special && !!keys.fire, dt);
    c.shootCd = (c.shootCd || 0) - dt;
    if (keys.fire && c.type === 'tank' && c.shootCd <= 0) { c.shootCd = 1.2; fireShell(c, c.angle, 'player'); if (copNear(c.x, c.y, 500)) addHeat(0.3); }
    if (keys.fire && c.type === 'firetruck') sprayWater(c, c.angle, dt);
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
        const thr = a.type === 'tank' || b.type === 'tank' ? 25 : 70;
        if (-vn > thr) {
          const dmg = (-vn - thr) * 0.12;
          damageCar(a, dmg * clamp(mb / ma, 0.3, 5), b.driver === 'player' ? 'player' : null);
          damageCar(b, dmg * clamp(ma / mb, 0.3, 5), a.driver === 'player' ? 'player' : null);
          if (onScreen(a.x, a.y)) sfx.crash();
          if (a === player.car || b === player.car) { shake = Math.min(1, -vn / 400); if (-vn > 130) hardKnock(); if (player.car && CT[player.car.type].bike && -vn > 150) bikeThrow(); }
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
        if ((b.owner === 'player' && c === player.car) || b.shooter === c) continue;
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
      if (b.rocket) explode(b.x, b.y, 70, b.owner === 'player' ? 'player' : null);
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
const ARCS = [
  { name: 'The Dockside Syndicate', jobs: ['deliver', 'steal', 'escort'], lines: ['The Syndicate wants to see if you can carry things.', 'Now they want wheels. Fast ones.', 'Their accountant needs a ride. Keep him in one piece.'] },
  { name: 'Midtown Money', jobs: ['race', 'qkd', 'getaway'], lines: ['A banker needs a courier who drives like a lunatic.', 'Move the bank\'s quantum keys. Someone is listening.', 'The big bank job is on. Get away clean.'] },
  { name: 'Old Quarter Vendetta', jobs: ['hit', 'entangle', 'wreck'], lines: ['The old families want a snitch silenced.', 'A rival\'s car is entangled with a decoy. Use it.', 'Time to send the whole Quarter a message.'] },
  { name: 'Neon Nights', jobs: ['escort', 'qkd', 'getaway'], lines: ['A club owner needs a discreet driver.', 'The club\'s ledger travels as qubits tonight.', 'The heist went loud. Vanish into the neon.'] },
];
let arcProg = [0, 0, 0, 0];
function startMission(forced, booth) {
  ringing = null;
  let type = forced || null, arc = null;
  if (!type && booth) {
    const d = districtAt(booth.x, booth.y);
    if (arcProg[d] < 3) { arc = d; type = ARCS[d].jobs[arcProg[d]]; msg(`${ARCS[d].name} (${arcProg[d] + 1}/3): ${ARCS[d].lines[arcProg[d]]}`, 6); }
  }
  if (!type) type = pick(['deliver', 'steal', 'hit', 'race', 'wreck', 'entangle', 'escort', 'getaway', 'qkd']);
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
  } else if (type === 'entangle') {
    const sa = freeSpot(300, 900), sb = freeSpot(1600, 3200);
    const a = makeCar('sedan', sa.x, sa.y, sa.a, null), b = makeCar('sedan', sb.x, sb.y, sb.a, null);
    for (const c of [a, b]) { c.mission = true; c.parked = true; c.color = '#3cf0ff'; c.hp = 140; }
    a.twin = b; b.twin = a;
    mission = { type, stage: 0, a, b, reward: reward + 1200, timer: 120 };
    msg('Job: a rival\'s cyan car is parked across town. Its twin nearby is entangled with it. Wreck the near one.', 6);
    note('entangle');
  } else if (type === 'escort') {
    const t = farTile(400, 1100);
    const p = makePed(t.x, t.y);
    Object.assign(p, { vip: true, shirt: '#d4ac0d', hair: '#ddd', hp: 40 });
    mission = { type, stage: 0, ped: p, reward: reward + 1200, timer: 0 };
    msg('Job: pick up the VIP in gold. Bring a car and stop right next to him.', 5);
  } else if (type === 'getaway') {
    const t = farTile(1200, 2400);
    mission = { type, stage: 1, x: t.x, y: t.y, reward: reward + 2000, timer: 150 };
    heat = Math.max(heat, 3); addHeat(0);
    msg('Job: the alarm just went off! Reach the safehouse, and don\'t let them see you go in.', 5);
  } else {
    const t = farTile(1000, 2200);
    mission = { type: 'qkd', stage: 1, x: t.x, y: t.y, reward: reward + 1800, timer: 40 + Math.hypot(t.x - P0.x, t.y - P0.y) / 140, eveT: 0, tapped: false, eve: null };
    msg('Job: carry the bank\'s qubits to the marker. Eve (the dark purple car) will try to listen in.', 5);
    note('bb84');
  }
  mission.arc = arc;
  sfx.pickup();
}
// BB84 between Alice (you) and Bob (the drop point), with an optional intercept-resend Eve
function bb84(tapped) {
  const n = 32, rows = []; let sift = 0, err = 0;
  const basis = () => Math.random() < 0.5 ? '+' : '×', bit = () => Math.random() < 0.5 ? 1 : 0;
  for (let i = 0; i < n; i++) {
    const ab = basis(), a = bit();
    let sb = ab, sv = a, eb = null;
    if (tapped) { eb = basis(); if (eb !== sb) sv = bit(); sb = eb; } // Eve measures and resends in her basis
    const bb = basis();
    let b = bb === sb ? sv : bit();
    if (Math.random() < 0.01) b ^= 1; // a little channel noise
    const keep = ab === bb;
    if (keep) { sift++; if (b !== a) err++; }
    rows.push({ a, ab, eb, bb, b, keep });
  }
  const qber = sift ? err / sift : 0;
  return { rows, sift, err, qber, secure: qber <= 0.11, tapped };
}
function advanceSteal() {
  const g = farTile(700, 1800);
  mission.stage = 1; mission.x = g.x; mission.y = g.y; mission.timer = 50 + Math.hypot(g.x - player.x, g.y - player.y) / 160;
  msg('Nice wheels. Get it to the garage, and keep it in one piece.', 4);
}
function missionTarget() {
  if (!mission) return lab ? lab.target : ringing;
  switch (mission.type) {
    case 'steal': return mission.stage === 0 ? mission.car : mission;
    case 'hit': return mission.ped;
    case 'escort': return mission.stage === 0 ? mission.ped : mission;
    case 'race': return mission.pts[mission.stage];
    case 'wreck': return null;
    case 'entangle': return mission.a.dead ? mission.b : mission.a;
    default: return mission;
  }
}
function completeMission(factor = 1, title = 'JOB DONE') {
  if (!mission) return;
  const m = mission;
  const r = Math.round(m.reward * player.mult * factor);
  earn(r);
  bigText(title, factor < 1 ? '#e67e22' : '#2ecc71', 2.5, `+${fmt(r)} · multiplier x${Math.min(9, player.mult + 1)}`);
  player.mult = Math.min(9, player.mult + 1);
  if (m.type === 'steal' && m.car) {
    const c = m.car;
    if (player.car === c) { if (Q.branches) Q.branches = null; player.car = null; const s = sideSpot(c) || c; player.x = s.x; player.y = s.y; }
    cars.splice(cars.indexOf(c), 1);
  }
  cleanupMission(m);
  if (m.type === 'hit') addHeat(0.6);
  if (m.type === 'getaway') heat = 0;
  mission = null; ringCd = 6; sfx.good();
  if (lab) labFlags.missionDone = true;
  if (m.arc !== null && m.arc !== undefined && !lab) {
    arcProg[m.arc]++;
    if (arcProg[m.arc] >= 3) { earn(10000); bigText('ARC COMPLETE', '#f1c40f', 3.5, `${ARCS[m.arc].name} · bonus ${fmt(10000)}`); }
    else {
      // chained job: the same contact calls straight back from a booth in their district
      const bs = BOOTHS.filter(b => districtAt(b.x, b.y) === m.arc);
      ringing = pick(bs.filter(b => d2(b.x, b.y, player.x, player.y) > 250 * 250)) || pick(bs);
      msg('Your contact is calling back…', 4);
    }
  }
}
function cleanupMission(m) {
  if (m.type === 'steal' && m.car) m.car.mission = false;
  if (m.type === 'hit' && m.ped) m.ped.target = false;
  if (m.type === 'entangle') { m.a.mission = false; m.b.mission = false; }
  if (m.type === 'escort' && m.ped) m.ped.vip = false;
  if (m.type === 'qkd' && m.eve) { m.eve.mission = false; if (m.eve.driver === 'eve') { m.eve.driver = 'ai'; m.eve.ai.tx = -99; } }
}
function failMission(why) {
  if (!mission) return;
  cleanupMission(mission);
  mission = null; ringCd = 8;
  if (lab) labFlags.missionDone = true;
  if (why) bigText('JOB FAILED', '#e67e22', 2.5, why);
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
      if (!player.down && slow && d2(ringing.x, ringing.y, P0.x, P0.y) < 24 * 24) startMission(null, ringing);
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
    } else if (m.type === 'escort') {
      if (m.stage === 0) {
        if (m.ped.dead) { failMission('The VIP is dead.'); return; }
        if (player.car && near(m.ped, 46) && Math.abs(player.car.speed) < 40) {
          peds.splice(peds.indexOf(m.ped), 1);
          const t = farTile(900, 2200);
          Object.assign(m, { stage: 1, car: player.car, carHp: player.car.hp, x: t.x, y: t.y, timer: 30 + Math.hypot(t.x - P0.x, t.y - P0.y) / 140 });
          msg('The VIP is in. Smooth ride, please: he bails if the car gets wrecked.', 4); sfx.pickup();
        }
      } else if (player.car !== m.car) failMission('You left the VIP behind.');
      else if (m.car.hp < m.carHp - CT[m.car.type].hp * 0.45) failMission('The VIP jumped out of your wreck.');
      else if (near(m, 40)) completeMission();
    } else if (m.type === 'getaway') {
      if (near(m, 40)) {
        if (belief.seen && heat >= 1) { if (!m.warned) { msg('They\'re watching you! Lose them before you go in.', 2.5); m.warned = true; } }
        else completeMission();
      } else m.warned = false;
    } else if (m.type === 'qkd') {
      if (!m.eve || !cars.includes(m.eve)) {
        if (!m.eveGone) { const e = spawnTraffic('sports', 'eve'); if (e) { e.color = '#5b2c6f'; e.mission = true; e.hp = 120; m.eve = e; } }
      } else if (m.eve.dead || m.eve.driver !== 'eve') {
        if (!m.eveGone) { m.eveGone = true; m.eve.mission = false; msg('Eve is out of the game.', 2); }
      } else if (!m.tapped && d2(m.eve.x, m.eve.y, P0.x, P0.y) < 80 * 80) {
        m.eveT += dt;
        if (m.eveT > 1.5) { m.tapped = true; msg('Eve tapped the channel. She measured your qubits!', 3); }
      }
      if (near(m, 40)) {
        const r = bb84(m.tapped); Q.bb = { r, t: 18 };
        completeMission(r.secure ? 1 : 0.4, r.secure ? 'KEY SECURE' : 'EAVESDROPPER DETECTED');
      }
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
  spawnT -= dt; policeCd -= dt; serviceCd -= dt;
  if (spawnT > 0) return;
  if (serviceCd <= 0 && !player.hidden) {
    serviceCd = 4;
    const vv = viewRect(300), inV = o => o.x > vv.x0 && o.x < vv.x1 && o.y > vv.y0 && o.y < vv.y1;
    if (!cars.some(c => c.type === 'ambulance' && c.job)) {
      const body = peds.find(p => p.dead && p.deadT > 3 && !p.target && inV(p));
      if (body) { const a = spawnTraffic('ambulance', 'service'); if (a) a.job = body; }
    }
    if (!cars.some(c => c.type === 'firetruck' && c.job)) {
      const wreck = cars.find(c => (c.dead || c.fire > 0) && !c.mission && c !== player.car && inV(c));
      if (wreck) { const f = spawnTraffic('firetruck', 'service'); if (f) f.job = wreck; }
    }
  }
  spawnT = 0.25;
  const far = viewRect(800), farP = viewRect(650);
  const out = (o, r) => o.x < r.x0 || o.x > r.x1 || o.y < r.y0 || o.y > r.y1;
  cars = cars.filter(c => c === player.car || c.mission || c.fire > 0 || !out(c, far) || (c.parked && !c.dead && !c.moved && c.driver === null));
  peds = peds.filter(p => p.target || p.vip || (!out(p, farP) && !(p.dead && p.deadT > 40)));
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
      const tankNow = heat >= 5 && !cars.some(c => c.type === 'tank' && c.driver === 'police');
      const c = spawnTraffic(tankNow ? 'tank' : 'police', 'police');
      if (c) { c.chase = true; c.ai.cruise = 130; if (tankNow) msg('They sent a TANK.', 3); }
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

// ============================================================ physics lab
const LAB_START = blockSide(2, 1);
const LESSONS = [
  { key: 'superposition', title: 'Superposition',
    text: 'Get in the car next to you and drive. Press X to split it into three branches. Press V for slow motion: each branch shows its amplitude as a rotating arrow (a phasor), and the arrow\'s length squared is the probability. Press X again to collapse it.',
    setup() { labCar('sedan'); Q.psi = 99; }, check: () => labFlags.collapsed },
  { key: 'measurement', title: 'Measurement',
    text: 'A police cruiser is parked nearby (follow the arrow). Superpose, then drive into its line of sight. Its look counts as a measurement, so the superposition collapses on its own.',
    setup() {
      labCar('sports'); Q.psi = 99;
      const t = randomTile([ROAD], p => { const d = Math.hypot(p.x - player.x, p.y - player.y); return d > 350 && d < 650 && laneDirs(p.tx, p.ty); });
      if (t) { const c = makeCar('police', t.x, t.y, 0, 'police'); c.labStatic = true; c.mission = true; labCars.push(c); lab.target = c; }
    }, check: () => labFlags.observed },
  { key: 'uncertainty', title: 'Uncertainty',
    text: 'You are wanted. Break line of sight and turn a corner or two. The blue cloud is everything the police think they know about where you are. Grow it past 9 tiles (Δx in the HUD).',
    setup() { labCar('sports'); heat = 1.6; addHeat(0); }, check: () => heat >= 1 && belief.sig > 290 },
  { key: 'tunnel', title: 'Tunnelling',
    text: 'Face a wall up close, on foot or in the car, and press T. The odds shown are e^(−d/λ): thin walls are easy, thick blocks almost impossible. Tunnel through twice.',
    setup() { labCar('compact'); Q.tun = 99; }, check: () => labFlags.tunnels >= 2 },
  { key: 'entangle', title: 'Entanglement',
    text: 'Two cyan cars are an entangled pair, and the second one is across town. Blow up the near one with your rockets (Space, on foot). Fire from a safe distance and keep the far twin on the minimap!',
    setup() { give('rocket', 6); player.weapon = 'rocket'; startMission('entangle'); }, check: () => labFlags.missionDone },
  { key: 'schrodinger', title: 'Schrödinger\'s briefcase',
    text: 'Pick up the case and deliver it. What\'s inside is undecided until delivery, and every hard knock raises P(bomb). Drive gently!',
    setup() { labCar('sedan'); startMission('deliver'); }, check: () => labFlags.missionDone },
  { key: 'bb84', title: 'Quantum key distribution',
    text: 'Carry the qubits to the marker. Eve (the dark purple car) will try to tap them by measuring. Let her get close or shake her off, then compare the error rate in the BB84 report at the end.',
    setup() { labCar('sports'); startMission('qkd'); }, check: () => labFlags.missionDone },
];
function labCar(type) {
  const t = findTileNear(Math.floor(player.x / T), Math.floor(player.y / T), ROAD);
  const m = laneDirs(t.tx, t.ty), d = [0, 1, 2, 3].find(k => m & (1 << k)) ?? 0;
  const c = makeCar(type, (t.tx + 0.5) * T, (t.ty + 0.5) * T, d * Math.PI / 2, null);
  c.mission = true; labCars.push(c); return c;
}
function setupLesson(i) {
  if (mission) { failMission(''); }
  for (const c of labCars) { const k = cars.indexOf(c); if (k >= 0) cars.splice(k, 1); }
  labCars = []; Q.branches = null; Q.slow = false; Q.bb = null;
  Object.assign(player, { car: null, x: LAB_START.x, y: LAB_START.y, angle: 0, hp: 100, down: 0, bust: 0, weapons: {}, weapon: null });
  heat = 0; belief.sig = 0; ringing = null; ringCd = 1e9; overlay = null;
  labFlags = { collapsed: false, observed: false, tunnels: 0, missionDone: false };
  lab.i = i; lab.done = false; lab.target = null;
  Q.notes.delete(LESSONS[i].key);
  LESSONS[i].setup();
  note(LESSONS[i].key);
  updateCamera(0, true);
}
function startLab() {
  newGame(); msgs = [];
  lab = { i: 0, done: false, target: null };
  setupLesson(0);
}
function updateLab() {
  if (!lab.done && LESSONS[lab.i].check()) {
    lab.done = true; sfx.good();
    msg(lab.i < LESSONS.length - 1 ? 'Lesson complete! Press N (or tap the lesson card) for the next one.' : 'Lab complete! Press N (or tap the card) to play the real game.', 8);
  }
  const tapCard = tapAt && labRect && tapAt.x > labRect.x && tapAt.x < labRect.x + labRect.w && tapAt.y > labRect.y && tapAt.y < labRect.y + labRect.h;
  if (lab.done && (hit('KeyN') || tapCard)) {
    if (lab.i + 1 < LESSONS.length) setupLesson(lab.i + 1);
    else { lab = null; newGame(); }
  }
}

// ============================================================ main update
function updateWorld(dt) {
  time += dt;
  heatCd -= dt;
  dayT = (dayT + dt / DAY_LEN) % 1;
  flight.t -= dt;
  if (!flight.on && flight.t <= 0) Object.assign(flight, { on: true, x: AIRPORT.rx0 + 30, v: 0, alt: 0 });
  if (flight.on) {
    flight.v = Math.min(430, flight.v + 75 * dt); flight.x += flight.v * dt;
    if (flight.x > AIRPORT.rx0 + 380) flight.alt += dt * 0.35;
    if (flight.alt > 3) { flight.on = false; flight.t = 40; }
  }
  if (!player.hidden) updatePlayer(dt);
  const v = viewRect(900);
  const active = cars.filter(c => c.x > v.x0 && c.x < v.x1 && c.y > v.y0 && c.y < v.y1);
  for (const c of active) {
    const px = c.x, py = c.y;
    if (c.labStatic) applyControls(c, 0, 0, true, dt);
    else if (c.driver === 'ai') aiTraffic(c, dt);
    else if (c.driver === 'police') aiPolice(c, dt);
    else if (c.driver === 'eve') aiEve(c, dt);
    else if (c.driver === 'service') aiService(c, dt);
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
    const nm = placeName(player.x, player.y);
    if (nm !== curDistrict) { curDistrict = nm; msg(`— ${nm} —`, 2.5); }
    if (Q.bb) { Q.bb.t -= dt; if (Q.bb.t <= 0 || hit('KeyN')) Q.bb = null; }
    if (lab) updateLab();
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
      const vr = roadLine(tx), hr = roadLine(ty), hw = isHighway(tx, ty), br = bridge[ty * MW + tx];
      if (br) {
        ctx.fillStyle = '#4a4a50'; ctx.fillRect(px, py, T + 0.6, T + 0.6); ctx.fillStyle = '#c9c4b8';
        if (tile(tx - 1, ty) === WATER) ctx.fillRect(px, py, 3, T + 0.6);
        if (tile(tx + 1, ty) === WATER) ctx.fillRect(px + T - 3, py, 3, T + 0.6);
      } else if (hw) {
        ctx.fillStyle = '#2d2d32'; ctx.fillRect(px, py, T + 0.6, T + 0.6); ctx.fillStyle = '#e8e8e8';
        if (tile(tx - 1, ty) !== ROAD) ctx.fillRect(px + 2, py, 2, T); if (tile(tx + 1, ty) !== ROAD) ctx.fillRect(px + T - 4, py, 2, T);
        if (tile(tx, ty - 1) !== ROAD) ctx.fillRect(px, py + 2, T, 2); if (tile(tx, ty + 1) !== ROAD) ctx.fillRect(px, py + T - 4, T, 2);
      }
      const dash = hw || br ? '#e8e8e8' : '#d4b23a', zebra = !hw && !br;
      if (vr && !hr) {
        if (zebra && (roadLine(ty + 1) || roadLine(ty - 1))) { ctx.fillStyle = '#d8d8d8'; for (let i = 0; i < 4; i++) ctx.fillRect(px + 3 + i * 8, py + 7, 4, 18); }
        else if ((tx - 1) % P === 0 && ty % 2 === 0) { ctx.fillStyle = dash; ctx.fillRect(px + T - 1, py + 6, 2, T - 12); }
      } else if (hr && !vr) {
        if (zebra && (roadLine(tx + 1) || roadLine(tx - 1))) { ctx.fillStyle = '#d8d8d8'; for (let i = 0; i < 4; i++) ctx.fillRect(px + 7, py + 3 + i * 8, 18, 4); }
        else if ((ty - 1) % P === 0 && tx % 2 === 0) { ctx.fillStyle = dash; ctx.fillRect(px + 6, py + T - 1, T - 12, 2); }
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
  const A = AIRPORT;
  if (A.x1 > v.x0 && A.x0 < v.x1 && A.y1 > v.y0 && A.y0 < v.y1) {
    ctx.fillStyle = '#2a2a2e'; ctx.fillRect(A.rx0, A.ry0, A.rx1 - A.rx0, A.ry1 - A.ry0);
    ctx.fillStyle = '#eee';
    for (let x = A.rx0 + 120; x < A.rx1 - 120; x += 64) ctx.fillRect(x, (A.ry0 + A.ry1) / 2 - 2, 32, 4);
    for (let i = 0; i < 6; i++) { ctx.fillRect(A.rx0 + 12, A.ry0 + 9 + i * 13, 40, 6); ctx.fillRect(A.rx1 - 52, A.ry0 + 9 + i * 13, 40, 6); }
    ctx.font = 'bold 40px sans-serif'; ctx.textAlign = 'center'; ctx.save(); ctx.translate(A.rx0 + 90, (A.ry0 + A.ry1) / 2); ctx.rotate(Math.PI / 2); ctx.fillText('09', 0, 14); ctx.restore();
    ctx.fillStyle = '#d4b23a'; ctx.fillRect(A.rx0, A.ry1 + 40, A.rx1 - A.rx0, 3); ctx.fillRect(A.rx0 + 300, A.ry1, 3, 40);
  }
  ctx.fillStyle = '#2b2b2b';
  for (const l of lamps) if (!l.c && l.x > v.x0 && l.x < v.x1 && l.y > v.y0 && l.y < v.y1) ctx.fillRect(l.x - 2, l.y - 2, 4, 4);
}
function planeShape() {
  ctx.beginPath(); ctx.ellipse(0, 0, 46, 7, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-8, -44); ctx.lineTo(-18, -44); ctx.lineTo(-6, 0); ctx.lineTo(-18, 44); ctx.lineTo(-8, 44); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(-45, -15); ctx.lineTo(-50, -15); ctx.lineTo(-44, 0); ctx.lineTo(-50, 15); ctx.lineTo(-45, 15); ctx.closePath(); ctx.fill();
}
function drawPlane(x, y, a, alt) {
  const s = 1 + alt * 0.5;
  ctx.save(); ctx.translate(x + alt * 45, y + alt * 45); ctx.rotate(a); ctx.fillStyle = 'rgba(0,0,0,.3)'; planeShape(); ctx.restore();
  ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(s, s);
  ctx.fillStyle = '#e8ecf0'; planeShape();
  ctx.fillStyle = '#2e5aa8'; ctx.fillRect(-48, -2, 10, 4); ctx.fillRect(-8, -1, 30, 2);
  ctx.fillStyle = '#1b2631'; ctx.fillRect(36, -3, 5, 6);
  ctx.restore();
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
  if (!c.ghost) { ctx.fillStyle = 'rgba(0,0,0,.35)'; rrect(-l / 2 + 2, -w / 2 + 3, l, w, t.bike ? 3 : 4); }
  if (t.bike) {
    ctx.fillStyle = '#111'; ctx.fillRect(l / 2 - 6, -1.5, 6, 3); ctx.fillRect(-l / 2, -1.5, 6, 3);
    ctx.fillStyle = c.dead ? '#242424' : c.color; ctx.beginPath(); ctx.ellipse(0, 0, l * 0.3, w / 2, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ccc'; ctx.fillRect(l * 0.25, -w / 2 - 1, 1.5, w + 2);
    if (c.driver && !c.dead) {
      ctx.fillStyle = c.driver === 'player' ? player.shirt : '#333'; ctx.beginPath(); ctx.ellipse(-2, 0, 3.5, 5.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = c.driver === 'player' ? '#222' : '#e0e0e0'; ctx.beginPath(); ctx.arc(-1, 0, 3.2, 0, TAU); ctx.fill();
    }
    ctx.restore(); return;
  }
  const dmg = 1 - clamp(c.hp / t.hp, 0, 1);
  ctx.fillStyle = c.dead ? '#242424' : c.color; rrect(-l / 2, -w / 2, l, w, c.type === 'tank' ? 2 : 4);
  if (c.dead) { ctx.fillStyle = '#111'; ctx.fillRect(-l * 0.25, -w / 2 + 2, l * 0.5, w - 4); ctx.restore(); return; }
  if (c.type === 'tank') {
    ctx.fillStyle = '#2b2b22'; ctx.fillRect(-l / 2, -w / 2, l, 6); ctx.fillRect(-l / 2, w / 2 - 6, l, 6);
    ctx.fillStyle = '#4a4a3a'; for (let x = -l / 2 + 2; x < l / 2; x += 5) { ctx.fillRect(x, -w / 2, 2, 6); ctx.fillRect(x, w / 2 - 6, 2, 6); }
    ctx.rotate(wrapA((c.turret ?? c.angle) - c.angle));
    ctx.fillStyle = '#3d4a24'; ctx.fillRect(0, -2.5, l * 0.62, 5);
    ctx.fillStyle = shade(c.color, 1.15); ctx.beginPath(); ctx.arc(0, 0, w * 0.36, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2f3a1c'; ctx.beginPath(); ctx.arc(-2, 0, 3, 0, TAU); ctx.fill();
    ctx.restore(); return;
  }
  if (c.type === 'truck') {
    ctx.fillStyle = shade(c.color, 1.15); ctx.fillRect(-l / 2 + 1, -w / 2 + 1, l * 0.66, w - 2);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 1; i < 5; i++) ctx.fillRect(-l / 2 + i * l * 0.13, -w / 2 + 1, 1, w - 2);
    ctx.fillStyle = '#1b2631'; ctx.fillRect(l * 0.3, -w / 2 + 2, l * 0.1, w - 4);
  } else if (c.type === 'bus') {
    ctx.fillStyle = shade(c.color, 1.2); ctx.fillRect(-l / 2 + 3, -w / 2 + 3, l - 6, w - 6);
    ctx.fillStyle = '#1b2631';
    for (let i = 0; i < 7; i++) { ctx.fillRect(-l / 2 + 5 + i * 7.4, -w / 2 + 0.5, 5, 2.5); ctx.fillRect(-l / 2 + 5 + i * 7.4, w / 2 - 3, 5, 2.5); }
    ctx.fillRect(l / 2 - 4, -w / 2 + 2, 3, w - 4);
  } else {
    if (c.type === 'police') { ctx.fillStyle = '#1b1b1b'; ctx.fillRect(l * 0.22, -w / 2, l * 0.28, w); ctx.fillRect(-l / 2, -w / 2, l * 0.2, w); }
    ctx.fillStyle = '#1b2631'; ctx.fillRect(l * 0.06, -w / 2 + 2, l * 0.16, w - 4);
    ctx.fillStyle = c.type === 'police' ? '#f2f2f2' : shade(c.color, 1.12); ctx.fillRect(-l * 0.2, -w / 2 + 2, l * 0.26, w - 4);
    ctx.fillStyle = '#1b2631'; ctx.fillRect(-l * 0.3, -w / 2 + 2, l * 0.09, w - 4);
    if (c.type === 'sports') { ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(-l / 2 + 1, -1.5, l - 2, 3); }
    if (c.type === 'taxi') { ctx.fillStyle = '#111'; ctx.fillRect(-l * 0.1, -3, 5, 6); ctx.fillStyle = '#fff'; ctx.fillRect(-l * 0.1 + 1, -2, 3, 4); }
    if (c.type === 'ambulance') {
      ctx.fillStyle = '#fafafa'; ctx.fillRect(-l / 2 + 1, -w / 2 + 2, l * 0.62, w - 4);
      ctx.fillStyle = '#d62828'; ctx.fillRect(-l * 0.2 - 5, -1.5, 10, 3); ctx.fillRect(-l * 0.2 - 1.5, -5, 3, 10);
      ctx.fillRect(-l / 2, -w / 2, l, 1.5); ctx.fillRect(-l / 2, w / 2 - 1.5, l, 1.5);
    }
    if (c.type === 'firetruck') {
      ctx.fillStyle = '#bbb'; ctx.fillRect(-l * 0.45, -4, l * 0.62, 1.5); ctx.fillRect(-l * 0.45, 2.5, l * 0.62, 1.5);
      for (let i = 0; i < 7; i++) ctx.fillRect(-l * 0.45 + i * 4.5, -4, 1, 8);
    }
    const lit = c.type === 'police' ? c.chase : (c.type === 'ambulance' || c.type === 'firetruck') ? !!c.job : null;
    if (lit !== null) {
      const on = lit && Math.sin(time * 18) > 0, bx = c.type === 'police' ? -l * 0.05 : l * 0.18;
      ctx.fillStyle = lit ? (on ? '#ff3030' : '#5a0000') : '#7a1d1d'; ctx.fillRect(bx, -w / 2 + 2, 4, (w - 4) / 2);
      ctx.fillStyle = lit ? (!on ? '#3070ff' : '#00105a') : '#1d2f7a'; ctx.fillRect(bx, 0, 4, (w - 4) / 2);
      if (lit) { ctx.fillStyle = on ? 'rgba(255,40,40,.18)' : 'rgba(40,90,255,.18)'; ctx.beginPath(); ctx.arc(0, 0, 26, 0, TAU); ctx.fill(); }
    }
  }
  ctx.fillStyle = '#fff6c8'; ctx.fillRect(l / 2 - 2, -w / 2 + 1.5, 2, 3); ctx.fillRect(l / 2 - 2, w / 2 - 4.5, 2, 3);
  ctx.fillStyle = c.speed < -5 || (c.driver === 'player' && keys.down) ? '#ff4040' : '#a31515';
  ctx.fillRect(-l / 2, -w / 2 + 1.5, 2, 3); ctx.fillRect(-l / 2, w / 2 - 4.5, 2, 3);
  if (dmg > 0.3) { ctx.fillStyle = `rgba(20,20,20,${dmg * 0.5})`; ctx.fillRect(l * 0.25, -w / 2, l * 0.25, w); }
  const steal = c.mission && mission && mission.type === 'steal' && mission.stage === 0;
  if (steal || c.twin || c.driver === 'eve') { ctx.strokeStyle = c.twin ? '#3cf0ff' : c.driver === 'eve' ? '#c39bd3' : '#ff2bd6'; ctx.lineWidth = 2; ctx.strokeRect(-l / 2 - 3, -w / 2 - 3, l + 6, w + 6); }
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
  if (Q.slow || lab) for (const o of all) {
    const n = (o.amp ?? 1) / Math.sqrt(tot), L = 10 + 34 * n, a = o.phase || 0;
    ctx.strokeStyle = o.tint || '#fff'; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(o.x, o.y, L, 0, TAU); ctx.globalAlpha = 0.25; ctx.stroke(); ctx.globalAlpha = 1;
    const ex = o.x + Math.cos(a) * L, ey = o.y + Math.sin(a) * L;
    ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - Math.cos(a - 0.5) * 7, ey - Math.sin(a - 0.5) * 7); ctx.lineTo(ex - Math.cos(a + 0.5) * 7, ey - Math.sin(a + 0.5) * 7); ctx.fill();
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
    if (b.stadium) {
      const ins = 22 * k;
      ctx.fillStyle = '#6c7178'; for (let i = 0; i < 5; i++) ctx.fillRect(rx + 4 * k * i, ry + 4 * k * i, rw - 8 * k * i, rh - 8 * k * i);
      ctx.fillStyle = '#3f8f3a'; ctx.fillRect(rx + ins, ry + ins, rw - 2 * ins, rh - 2 * ins);
      ctx.strokeStyle = '#e8f5e9'; ctx.lineWidth = 2; ctx.strokeRect(rx + ins + 8, ry + ins + 8, rw - 2 * ins - 16, rh - 2 * ins - 16);
      ctx.beginPath(); ctx.moveTo(rx + rw / 2, ry + ins + 8); ctx.lineTo(rx + rw / 2, ry + rh - ins - 8); ctx.stroke();
      ctx.beginPath(); ctx.arc(rx + rw / 2, ry + rh / 2, 22 * k, 0, TAU); ctx.stroke();
      continue;
    }
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
function darkness() {
  const h = dayT * 24;
  const n = h >= 20 || h < 5 ? 1 : h >= 18 ? (h - 18) / 2 : h < 7 ? 1 - (h - 5) / 2 : 0;
  return n * 0.8;
}
const lightCv = document.createElement('canvas'), lctx = lightCv.getContext('2d');
const glowSpr = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c;
})();
const coneSpr = (() => {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 128, 0); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(0, 25); g.lineTo(128, 0); g.lineTo(128, 64); g.lineTo(0, 39); g.closePath(); g.fill(); return c;
})();
// darkness is painted on a half-resolution layer, with lights cut out of it
function drawLighting(v) {
  const dk = darkness();
  if (dk < 0.02) return;
  const lw = Math.ceil(W / 2), lh = Math.ceil(H / 2);
  if (lightCv.width !== lw || lightCv.height !== lh) { lightCv.width = lw; lightCv.height = lh; }
  const l = lctx, z = cam.zoom * 0.5;
  l.globalCompositeOperation = 'source-over'; l.setTransform(1, 0, 0, 1, 0, 0);
  l.clearRect(0, 0, lw, lh); l.fillStyle = `rgba(6,10,32,${dk})`; l.fillRect(0, 0, lw, lh);
  l.globalCompositeOperation = 'destination-out';
  l.setTransform(z, 0, 0, z, lw / 2 - cam.x * z, lh / 2 - cam.y * z);
  const vis = (x, y, m) => x > v.x0 - m && x < v.x1 + m && y > v.y0 - m && y < v.y1 + m;
  for (const p of lamps) if (vis(p.x, p.y, p.r)) l.drawImage(glowSpr, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
  for (const c of cars) {
    if (c.dead || !vis(c.x, c.y, 160)) continue;
    if (c.driver) { l.save(); l.translate(c.x, c.y); l.rotate(c.angle); l.drawImage(coneSpr, CT[c.type].l / 2 - 2, -40, 150, 80); l.restore(); }
    l.drawImage(glowSpr, c.x - 22, c.y - 22, 44, 44);
    if (c.fire > 0) l.drawImage(glowSpr, c.x - 70, c.y - 70, 140, 140);
  }
  if (Q.branches) for (const g of Q.branches) l.drawImage(glowSpr, g.x - 40, g.y - 40, 80, 80);
  for (const q of parts) if (q.grow > 10 && q.life > 0.2 && !q.top) l.drawImage(glowSpr, q.x - 50, q.y - 50, 100, 100);
  if (!player.car && !player.hidden) l.drawImage(glowSpr, player.x - 45, player.y - 45, 90, 90);
  if (flight.on) l.drawImage(glowSpr, flight.x + 30, (AIRPORT.ry0 + AIRPORT.ry1) / 2 - 30, 60, 60);
  ctx.save(); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.drawImage(lightCv, 0, 0, W, H); ctx.restore();
  if (dk > 0.15) { // coloured light sources on top
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = dk;
    for (const p of lamps) if (vis(p.x, p.y, 10)) { ctx.fillStyle = p.c || 'rgba(255,220,140,.9)'; ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, TAU); ctx.fill(); }
    const on = Math.sin(time * 18) > 0;
    for (const c of cars) if ((c.chase || c.job) && vis(c.x, c.y, 40)) { ctx.fillStyle = on ? 'rgba(255,40,40,.4)' : 'rgba(40,90,255,.4)'; ctx.beginPath(); ctx.arc(c.x, c.y, 34, 0, TAU); ctx.fill(); }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
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
  for (const pl of PLANES) if (onScreen(pl.x, pl.y, 80)) drawPlane(pl.x, pl.y, pl.a, 0);
  ctx.fillStyle = '#ffe9a0';
  for (const b of bullets) ctx.fillRect(b.x - 1.5, b.y - 1.5, b.rocket ? 5 : 3, b.rocket ? 5 : 3);
  drawParts(false);
  drawBuildings(v);
  drawTrees(v);
  drawParts(true);
  if (flight.on) drawPlane(flight.x, (AIRPORT.ry0 + AIRPORT.ry1) / 2, 0, flight.alt);
  drawLighting(v);
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
function drawLabCard(small) {
  labRect = null;
  if (!lab) return;
  const L = LESSONS[lab.i], w = Math.min(380, W - 24), x = 12;
  const y = showMap ? 12 + MW * (small ? 1.1 : 1.6) + 44 : 60;
  const lines = wrapLines(L.text, w - 24, '13px system-ui, sans-serif');
  const h = 54 + lines.length * 17 + 26;
  ctx.fillStyle = 'rgba(10,22,18,.92)'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = lab.done ? '#2ecc71' : '#7dff7a'; ctx.lineWidth = lab.done ? 3 : 1.5; ctx.strokeRect(x, y, w, h);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#7dff7a'; ctx.font = 'bold 11px system-ui, sans-serif'; ctx.fillText(`PHYSICS LAB · LESSON ${lab.i + 1}/${LESSONS.length}`, x + 12, y + 18);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 16px system-ui, sans-serif'; ctx.fillText(L.title, x + 12, y + 38);
  ctx.fillStyle = '#ddd'; ctx.font = '13px system-ui, sans-serif'; lines.forEach((s2, i) => ctx.fillText(s2, x + 12, y + 58 + i * 17));
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillStyle = lab.done ? '#2ecc71' : '#999';
  ctx.fillText(lab.done ? '✓ Done! N or tap here: next lesson' : 'In progress… (pause, then L, to leave the lab)', x + 12, y + h - 10);
  labRect = { x, y, w, h };
}
function drawPhasorPanel(by) {
  const c = player.car;
  if (!Q.branches || !c || !(Q.slow || lab)) return;
  const all = [c, ...Q.branches], tot = all.reduce((a, o) => a + (o.amp ?? 1) ** 2, 0);
  const w = 180, h = 214, x = W - w - 12, y = 170;
  ctx.fillStyle = 'rgba(12,10,28,.88)'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = '#b388ff'; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = '#b388ff'; ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('AMPLITUDES (phasors)', x + 10, y + 16);
  const cx = x + w / 2, cy = y + 86, R0 = 58;
  ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.arc(cx, cy, R0, 0, TAU); ctx.stroke();
  all.forEach((o, i) => {
    const n = (o.amp ?? 1) / Math.sqrt(tot), a = o.phase || 0, ex = cx + Math.cos(a) * R0 * n, ey = cy + Math.sin(a) * R0 * n;
    ctx.strokeStyle = o.tint || '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke();
    const p = n * n;
    ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(x + 10, y + 154 + i * 16, w - 60, 10);
    ctx.fillStyle = o.tint || '#fff'; ctx.fillRect(x + 10, y + 154 + i * 16, (w - 60) * p, 10);
    ctx.font = '11px ui-monospace, monospace'; ctx.fillText(`${Math.round(p * 100)}%`, x + w - 44, y + 163 + i * 16);
  });
  ctx.fillStyle = '#aab'; ctx.font = '10px system-ui, sans-serif'; ctx.fillText('arrow = amplitude · P = length²', x + 10, y + h - 8);
}
function drawBB() {
  if (!Q.bb) return;
  const r = Q.bb.r, n = r.rows.length, w = Math.min(760, W - 16), x = (W - w) / 2;
  const labels = ['Alice bit', 'Alice basis', ...(r.tapped ? ['Eve basis'] : []), 'Bob basis', 'Bob bit', 'kept?'];
  const lw = 78, cw = (w - lw - 16) / n, rh = 17, h = 64 + labels.length * rh + 46;
  const y = H / 2 + 50 + h < H - 8 ? H / 2 + 50 : 8; // below the big banner when there is room
  ctx.globalAlpha = clamp(Q.bb.t, 0, 1);
  ctx.fillStyle = 'rgba(12,10,28,.95)'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = r.secure ? '#2ecc71' : '#e74c3c'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
  ctx.textAlign = 'left'; ctx.fillStyle = '#b388ff'; ctx.font = 'bold 12px system-ui, sans-serif'; ctx.fillText(`BB84 REPORT: what happened to your ${n} qubits`, x + 10, y + 20);
  ctx.fillStyle = '#aab'; ctx.font = '11px system-ui, sans-serif';
  ctx.fillText(r.tapped ? 'Eve measured every qubit in a random basis and resent it.' : 'Nobody measured the qubits on the way (Eve didn\'t get close enough).', x + 10, y + 38);
  labels.forEach((lb, j) => {
    const yy = y + 58 + j * rh;
    ctx.fillStyle = '#ccc'; ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(lb, x + 10, yy + 12);
    r.rows.forEach((q, i) => {
      const cx = x + lw + 8 + i * cw;
      if (q.keep) { ctx.fillStyle = q.b !== q.a ? 'rgba(231,76,60,.45)' : 'rgba(46,204,113,.18)'; ctx.fillRect(cx, yy, cw - 1, rh - 1); }
      const v = lb === 'Alice bit' ? q.a : lb === 'Alice basis' ? q.ab : lb === 'Eve basis' ? q.eb : lb === 'Bob basis' ? q.bb : lb === 'Bob bit' ? q.b : (q.keep ? '✓' : '·');
      ctx.fillStyle = '#fff'; ctx.font = `${Math.min(12, Math.floor(cw))}px ui-monospace, monospace`; ctx.textAlign = 'center'; ctx.fillText(String(v), cx + cw / 2, yy + 12);
    });
  });
  ctx.textAlign = 'left'; ctx.font = 'bold 13px system-ui, sans-serif'; ctx.fillStyle = r.secure ? '#2ecc71' : '#ff6b6b';
  ctx.fillText(`Sifted key: ${r.sift} bits · errors: ${r.err} · error rate ${Math.round(r.qber * 100)}% ${r.secure ? '≤' : '>'} 11% → ${r.secure ? 'KEY ACCEPTED' : 'EAVESDROPPER! KEY DISCARDED'}`, x + 10, y + h - 24);
  ctx.fillStyle = '#888'; ctx.font = '11px system-ui, sans-serif'; ctx.fillText('red = a kept bit where Bob disagrees with Alice · N to close', x + 10, y + h - 8);
  ctx.globalAlpha = 1;
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
    txt(placeName(player.x, player.y), mx, my + sz + 16, 12, '#ddd');
    const hh = Math.floor(dayT * 24), mi = Math.floor((dayT * 24 - hh) * 60);
    txt(`${String(hh).padStart(2, '0')}:${String(mi).padStart(2, '0')}`, mx, my + sz + 32, 12, darkness() > 0.3 ? '#9fb7ff' : '#ffe08a');
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
      case 'escort': line = mission.stage ? 'Drive the VIP to the marker' : 'Pick up the VIP in gold'; break;
      case 'getaway': line = belief.seen ? 'Reach the safehouse: lose the cops!' : 'Reach the safehouse unseen'; break;
      case 'qkd': line = `Deliver the qubits${mission.tapped ? ' · Eve tapped in!' : ''}`; break;
    }
    if (mission.arc !== null && mission.arc !== undefined) txt(`${ARCS[mission.arc].name} ${arcProg[mission.arc] + 1}/3`, W - 16, 156 * s, 12 * s, '#c9b3ff', 'right');
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
  drawLabCard(small);
  drawPhasorPanel(by);
  drawBB();
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
  ['V', 'slow motion + amplitude arrows (while superposed)'],
  ['T', 'quantum-tunnel through the wall you face'],
  ['R · M', 'radio station · minimap'],
  ['P / Esc · H', 'pause · help (press H again for quantum notes)'],
  ['L (title screen)', 'Physics Lab: 7 guided quantum lessons'],
];
function drawHelp() {
  const w = Math.min(600, W - 24), h = Math.min(H - 24, 470), x = (W - w) / 2, y = (H - h) / 2;
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
  const big = Math.min(88, W / 10);
  // a "superposed" title: faint offset copies
  for (const [dx, col] of [[-4, 'rgba(179,136,255,.5)'], [4, 'rgba(77,208,225,.5)']]) txt('QUANT THEFT', W / 2 + dx * Math.sin(time * 2), H * 0.28, big, col, 'center', true);
  txt('QUANT THEFT', W / 2, H * 0.28, big, '#ffd54a', 'center', true);
  txt('AUTO', W / 2, H * 0.28 + big * 0.9, big * 0.6, '#b388ff', 'center', true);
  txt('a top-down crime sandbox where the cops can\'t pin you down', W / 2, H * 0.28 + big * 1.3, Math.min(16, W / 40), '#ddd', 'center');
  if (Math.sin(time * 4) > -0.3) txt(touchOn() ? 'TAP LEFT: PLAY · TAP RIGHT: PHYSICS LAB' : 'ENTER: PLAY  ·  L: PHYSICS LAB', W / 2, H * 0.6, Math.min(22, W / 24), '#fff', 'center', true);
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
  Object.assign(Q, { psi: 1, tun: 2, branches: null, note: null, slow: false, bb: null });
  lab = null; labCars = []; labFlags = {}; arcProg = [0, 0, 0, 0]; dayT = 17 / 24;
  heat = 0; belief.sig = 0; mission = null; ringing = null; ringCd = 3; won = false; curDistrict = -1; msgs = []; overlay = null;
  updateCamera(0, true);
  for (let i = 0; i < 30; i++) manageSpawns(1);
  msg('Welcome to Quantum City. Find a ride, any ride.', 5);
  msg('In a car: X superposes it, T tunnels through walls. H for help.', 6);
  state = 'play';
}
function titleInit() {
  resetWorld();
  player.hidden = true; player.car = null; dayT = 21 / 24;
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
    if (hit('KeyL') || (tapAt && touchOn() && tapAt.x > W / 2)) startLab();
    else if (hit('Enter', 'Space', 'Tap', 'NumpadEnter')) newGame();
  } else if (state === 'play') {
    if (hit('KeyP', 'Escape')) state = 'pause';
    if (hit('KeyH')) helpPage = (helpPage + 1) % 3;
    if (hit('KeyM')) showMap = !showMap;
    if (hit('KeyR')) { radio = (radio + 1) % STATIONS.length; msg(radio ? `♪ ${STATIONS[radio].name}` : 'Radio off', 2); }
    if (hit('KeyV')) { Q.slow = !Q.slow; msg(Q.slow ? 'Slow motion + amplitude arrows ON (V)' : 'Slow motion OFF', 2); }
    const sdt = Q.slow ? dt * 0.3 : dt;
    if (!helpPage) { updateWorld(sdt); updateCamera(sdt); }
    else if (hit('Tap')) helpPage = (helpPage + 1) % 3;
  } else if (state === 'pause') {
    if (hit('KeyP', 'Escape', 'Enter')) state = 'play';
    if (lab && hit('KeyL')) { lab = null; titleInit(); state = 'title'; }
    if (hit('Tap')) { if (lab && tapAt && tapAt.y > H * 0.75) { lab = null; titleInit(); state = 'title'; } else { state = 'play'; helpPage = 1; } }
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
      txt(touchOn() ? `tap for help & quantum notes${lab ? ' · tap near the bottom to leave the lab' : ''}` : `P to resume · H for help & quantum notes${lab ? ' · L to leave the lab' : ''}`, W / 2, H / 2 + 36, 14, '#ccc', 'center');
    }
    if (state === 'over') drawOver();
  }
  for (const k in pressed) delete pressed[k];
  tapAt = null;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// debug/test hook
window.__gridlock = { player, Q, belief, get cars() { return cars; }, get peds() { return peds; }, get state() { return state; }, get heat() { return heat; }, set heat(v) { heat = v; }, get mission() { return mission; }, get lab() { return lab; }, get dayT() { return dayT; }, set dayT(v) { dayT = v; },
  newGame, startLab, setupLesson, makeCar, superpose, collapse, tunnel, startMission, bb84, keys, pressed, labFlags: () => labFlags, arcProg: () => arcProg };
})();
