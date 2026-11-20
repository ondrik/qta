// Quant Theft Auto — a lightweight top-down open-city crime sandbox
// with quantum-flavoured mechanics. Plain canvas + WebAudio, no dependencies.
'use strict';
(() => {
// ============================================================ canvas
const cv = document.getElementById('c');
let ctx = cv.getContext('2d'); // reassigned briefly while ground chunks are rendered
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
const T = 32, MW = 100, MH = 100; // tiles
const ROAD = 0, WALK = 1, BUILD = 2, GRASS = 3, WATER = 4, PLAZA = 5;
const map = new Uint8Array(MW * MH);
const tile = (tx, ty) => (tx < 0 || ty < 0 || tx >= MW || ty >= MH) ? WATER : map[ty * MW + tx];
const tileAtP = (x, y) => tile(Math.floor(x / T), Math.floor(y / T));
const solidT = t => t === BUILD || t === WATER;
const solidAt = (x, y) => solidT(tileAtP(x, y));
const circleSolid = (x, y, r) => solidAt(x - r, y - r) || solidAt(x + r, y - r) || solidAt(x - r, y + r) || solidAt(x + r, y + r);
const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1]; // E S W N

const DISTRICTS = [
  { name: 'Harbor Row',   roofs: ['#7a5a48', '#6b4f3f', '#8a6a50', '#5d5348', '#70645a'], h: 0.10 },
  { name: 'Midtown',      roofs: ['#5f6b7a', '#4f5a68', '#6e7c8c', '#7d8590', '#56606b'], h: 0.30 },
  { name: 'Old Quarter',  roofs: ['#8b4d3b', '#9a5e43', '#7b4535', '#a07050', '#86584a'], h: 0.12 },
  { name: 'Neon Heights', roofs: ['#4b3f63', '#5a4a75', '#3e4a6a', '#6a4f6f', '#45506e'], h: 0.22 },
];
// smooth curve through control points (Catmull-Rom), used for the river and winding streets
function catmull(ctrl, step = 0.5) {
  const out = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map(j => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  out.push(ctrl[ctrl.length - 1].slice());
  return out;
}
// the Copper River meanders across the middle of the city (tile units)
const RIVER = catmull([[-3, 40], [12, 38], [26, 44], [40, 48], [50, 46], [62, 41], [74, 40], [86, 45], [103, 47]], 0.25);
const RIVER_HW = 3.4;
function riverY(x) {
  for (let i = 1; i < RIVER.length; i++) if (RIVER[i][0] >= x) { const a = RIVER[i - 1], b = RIVER[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / ((b[0] - a[0]) || 1); }
  return RIVER[RIVER.length - 1][1];
}
const districtAt = (x, y) => (x / T >= 50 ? 1 : 0) + (y / T >= riverY(x / T) ? 2 : 0);
const buildings = [], trees = [], parkSpots = [], props = [], fixedParked = [], SITES = [], extraLamps = [], DOORS = [];
const HC = 320; // building heights are fractions of the camera height; HC converts them to pixels for shadows and roof slopes
const bridge = new Uint8Array(MW * MH), hwT = new Uint8Array(MW * MH);
const AIRPORT = { x0: 76 * T, y0: 76 * T, x1: 97 * T, y1: 97 * T, ry0: 78 * T, ry1: 81 * T, rx0: 76 * T, rx1: 96 * T };
const PLANES = [{ x: 80 * T, y: 85.5 * T, a: 0 }, { x: 88 * T, y: 85.5 * T, a: Math.PI }];
let STADIUM = { x0: 64, y0: 64 };
const isHighway = (tx, ty) => tile(tx, ty) === ROAD && hwT[ty * MW + tx] === 1;

// ============================================================ the road network
// Roads are polylines (in tiles). Crossings and T-junctions are found automatically and become graph nodes.
const NETDEF = [];
const road = (name, pts, o = {}) => NETDEF.push(Object.assign({ name, pts }, o));
const arcPts = (cx, cy, r, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
const alongX = (x0, x1, f, step = 1.7) => { const p = []; for (let x = x0; x < x1 - 0.5; x += step) p.push([x, f(x)]); p.push([x1, f(x1)]); return p; };
const RB = { x: 50, y: 62, r: 5 }, rbPt = a => [RB.x + Math.cos(a) * RB.r, RB.y + Math.sin(a) * RB.r];
road('Ring Expressway', [[10, 2], [90, 2], ...arcPts(90, 10, 8, -Math.PI / 2, 0, 8).slice(1), [98, 90], ...arcPts(90, 90, 8, 0, Math.PI / 2, 8).slice(1),
  [10, 98], ...arcPts(10, 90, 8, Math.PI / 2, Math.PI, 8).slice(1), [2, 10], ...arcPts(10, 10, 8, Math.PI, Math.PI * 1.5, 8).slice(1)], { hw: true, closed: true });
road('North Embankment', alongX(2, 98, x => riverY(x) - 6.5));
road('South Embankment', alongX(2, 98, x => riverY(x) + 6.5));
// a roundabout, circulating counter-clockwise on screen
road('Superposition Circus', arcPts(RB.x, RB.y, RB.r, 0, -Math.PI * 2, 36), { oneway: true, closed: true });
road('Grand Avenue', [[50, 2], rbPt(-Math.PI / 2)]);
road('Grand Avenue', [rbPt(Math.PI / 2), [50, 98]]);
road('Planck Boulevard', [rbPt(-Math.PI / 4), [85, 30]]);
road('Planck Boulevard', [rbPt(Math.PI * 0.75), [20, 98]]);
road('Old Street', catmull([rbPt(Math.PI), [38, 62.5], [30, 61], [22, 64], [12, 63], [2, 65]], 0.7));
road('Neon Strip', [rbPt(0), [98, 62]]);
// north of the river: long harbour blocks, streets that jog across Grand Avenue
road('Harbor Street', [[2, 14], [98, 14]]);
road('Dock Street', [[2, 28], [50, 28]]);
road('Market Street', [[50, 22], [98, 22]]);
road('Lighthouse Lane', [[14, 2], [14, 14]]);
road('Bohr Street', [[26, 2], [26, riverY(26) + 6.5]]);
road('Rope Walk', [[38, 14], [38, riverY(38) - 6.5]]);
road('Pauli Avenue', [[60, 2], [60, riverY(60) - 6.5]]);
road('Dirac Avenue', [[72, 2], [72, riverY(72) - 6.5]]);
road('Fermi Avenue', [[85, 2], [85, riverY(85) - 6.5]]);
// Old Quarter: winding lanes
road('Church Lane', catmull([[14, 74], [19, 79], [26, 78], [31, 75], [35, 74]], 0.7));
road('Cobbler Row', [[14, riverY(14) + 6.5], [14, 98]]);
road('Mill Street', [[35, riverY(35) + 6.5], [35, 98]]);
road('Tanners Lane', [[2, 88], [14, 88]]);
road('Lamp Street', [[35, 87], [74, 87]]);
// Neon Heights
road('Volt Street', [[62, 62], [62, 74]]);
road('Runway Road', [[74, riverY(74) + 6.5], [74, 98]]);
road('Arc Street', [[86, riverY(86) + 6.5], [86, 74]]);
road('Airport Way', [[50, 74], [98, 74]]);

const NODES = [], EDGES = [], LANES = [], LIGHT_NODES = [], BUS_STOPS = [];
const LSTEP = 8, LGRID = new Map();
let HOP = null;
function closestOnSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
  const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2, 0, 1), x = a[0] + dx * t, y = a[1] + dy * t;
  return { t, x, y, d: Math.hypot(p[0] - x, p[1] - y) };
}
const polyLen = pts => { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return l; };
function buildNet() {
  const polys = NETDEF.map(r => ({ ...r, pts: r.pts.map(([x, y]) => [x * T, y * T]), cuts: [] }));
  for (const p of polys) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of p.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    p.bb = [x0 - 60, y0 - 60, x1 + 60, y1 + 60];
  }
  // 1. open ends that stop on another road become T-junctions
  for (const p of polys) if (!p.closed) for (const end of [0, p.pts.length - 1]) {
    const e = p.pts[end]; let best = null;
    for (const q of polys) {
      if (q === p) continue;
      for (let i = 0; i < q.pts.length - 1; i++) { const r = closestOnSeg(e, q.pts[i], q.pts[i + 1]); if (r.d < 48 && (!best || r.d < best.d)) best = { q, i, ...r }; }
    }
    if (best) { e[0] = best.x; e[1] = best.y; best.q.cuts.push(best.i + best.t); }
  }
  // 2. proper crossings (a crossing at a shared vertex is counted once, on the later segment)
  const EPS = 1e-7;
  for (let a = 0; a < polys.length; a++) for (let b = a + 1; b < polys.length; b++) {
    const A = polys[a], B = polys[b];
    if (A.bb[0] > B.bb[2] || B.bb[0] > A.bb[2] || A.bb[1] > B.bb[3] || B.bb[1] > A.bb[3]) continue;
    for (let i = 0; i < A.pts.length - 1; i++) for (let j = 0; j < B.pts.length - 1; j++) {
      const [p1, p2, q1, q2] = [A.pts[i], A.pts[i + 1], B.pts[j], B.pts[j + 1]];
      const rx = p2[0] - p1[0], ry = p2[1] - p1[1], sx = q2[0] - q1[0], sy = q2[1] - q1[1], den = rx * sy - ry * sx;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((q1[0] - p1[0]) * sy - (q1[1] - p1[1]) * sx) / den, u = ((q1[0] - p1[0]) * ry - (q1[1] - p1[1]) * rx) / den;
      if (t < -EPS || t >= 1 - EPS || u < -EPS || u >= 1 - EPS) continue;
      const ta = i + Math.max(0, t), tb = j + Math.max(0, u);
      if ((!A.closed && (ta < 1e-4 || ta > A.pts.length - 1 - 1e-4)) || (!B.closed && (tb < 1e-4 || tb > B.pts.length - 1 - 1e-4))) continue; // ends were handled as T-junctions
      A.cuts.push(ta); B.cuts.push(tb);
    }
  }
  // 3. split into pieces between cuts
  const at = (pts, f) => { const i = Math.min(pts.length - 2, Math.floor(f)), t = f - i; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]; };
  const pieces = [];
  for (const p of polys) {
    const cs = [0, ...p.cuts.sort((a, b) => a - b), p.pts.length - 1];
    for (let k = 0; k < cs.length - 1; k++) {
      const f0 = cs[k], f1 = cs[k + 1];
      if (f1 - f0 < 1e-6) continue;
      const pts = [at(p.pts, f0)];
      for (let i = Math.floor(f0) + 1; i < f1; i++) pts.push(p.pts[i].slice());
      pts.push(at(p.pts, f1));
      if (polyLen(pts) > 6) pieces.push({ pts, name: p.name, hw: !!p.hw, oneway: !!p.oneway });
    }
  }
  // 4. nodes and edges
  const nodeAt = (x, y) => {
    for (const n of NODES) if (Math.hypot(n.x - x, n.y - y) < 22) return n;
    const n = { id: NODES.length, x, y, edges: [] }; NODES.push(n); return n;
  };
  for (const pc of pieces) {
    const A = nodeAt(...pc.pts[0]), B = nodeAt(...pc.pts[pc.pts.length - 1]);
    if (A === B && polyLen(pc.pts) < 60) continue;
    pc.pts[0] = [A.x, A.y]; pc.pts[pc.pts.length - 1] = [B.x, B.y];
    const e = { id: EDGES.length, a: A.id, b: B.id, pts: pc.pts, len: polyLen(pc.pts), hw: pc.hw, oneway: pc.oneway, name: pc.name };
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of e.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    e.bb = [x0 - 70, y0 - 70, x1 + 70, y1 + 70];
    EDGES.push(e); A.edges.push(e); if (B !== A) B.edges.push(e);
  }
  // direction of an edge leaving a node
  for (const n of NODES) {
    n.dirs = new Map();
    for (const e of n.edges) {
      const pts = e.a === n.id ? e.pts : e.pts.slice().reverse();
      let k = 1; while (k < pts.length - 1 && Math.hypot(pts[k][0] - n.x, pts[k][1] - n.y) < 24) k++;
      const dx = pts[k][0] - n.x, dy = pts[k][1] - n.y, l = Math.hypot(dx, dy) || 1;
      n.dirs.set(e.id, [dx / l, dy / l]);
    }
    n.hw = n.edges.some(e => e.hw); n.ring = n.edges.some(e => e.oneway);
    n.light = n.edges.length >= 3 && !n.hw && !n.ring;
    n.clr = n.light ? 72 : n.edges.length >= 3 ? 40 : 0;
    if (n.light) {
      // two signal groups: the approaches closest to each of the two most different axes
      const ax = n.edges.map(e => { const [dx, dy] = n.dirs.get(e.id); return ((Math.atan2(dy, dx) % Math.PI) + Math.PI) % Math.PI; });
      const ad = (a, b) => { const d = Math.abs(a - b) % Math.PI; return Math.min(d, Math.PI - d); };
      let s1 = 0; for (let i = 1; i < ax.length; i++) if (ad(ax[i], ax[0]) > ad(ax[s1], ax[0])) s1 = i;
      n.grp = new Map(n.edges.map((e, i) => [e.id, ad(ax[i], ax[0]) <= ad(ax[i], ax[s1]) ? 0 : 1]));
      n.off = (n.id * 7) % 9 * 2;
      LIGHT_NODES.push(n);
    }
  }
  // 5. lanes: right-hand traffic, one lane each way (the roundabout is one-way), trimmed back from junctions
  const OUT = NODES.map(() => []);
  for (const e of EDGES) for (const dir of e.oneway ? [1] : [1, -1]) {
    const pts = dir > 0 ? e.pts : e.pts.slice().reverse(), off = e.oneway ? 0 : 16;
    const from = NODES[dir > 0 ? e.a : e.b], to = NODES[dir > 0 ? e.b : e.a];
    // offset to the right of travel
    const op = pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      return [p[0] - dy / l * off, p[1] + dx / l * off];
    });
    const cum = [0]; for (let i = 1; i < op.length; i++) cum.push(cum[i - 1] + Math.hypot(op[i][0] - op[i - 1][0], op[i][1] - op[i - 1][1]));
    const total = cum[cum.length - 1];
    let s0 = from.clr, s1 = total - to.clr;
    if (s1 - s0 < 24) { const m = Math.max(0, (total - 24) / 2); s0 = Math.min(from.clr, m); s1 = total - Math.min(to.clr, m); }
    const L = { id: LANES.length, e, dir, from: from.id, to: to.id, x: [], y: [], h: [], hw: e.hw, next: [] };
    let k = 0;
    const sample = s => {
      while (k < cum.length - 2 && cum[k + 1] < s) k++;
      const t = (s - cum[k]) / ((cum[k + 1] - cum[k]) || 1), x = op[k][0] + (op[k + 1][0] - op[k][0]) * t, y = op[k][1] + (op[k + 1][1] - op[k][1]) * t;
      L.x.push(x); L.y.push(y); L.h.push(Math.atan2(op[k + 1][1] - op[k][1], op[k + 1][0] - op[k][0]));
    };
    for (let s = s0; s < s1; s += LSTEP) sample(s);
    sample(s1);
    L.n = L.x.length; L.len = (L.n - 2) * LSTEP + Math.hypot(L.x[L.n - 1] - L.x[L.n - 2], L.y[L.n - 1] - L.y[L.n - 2]);
    L.light = to.light ? to : null; L.grp = to.light ? to.grp.get(e.id) : 0;
    LANES.push(L); OUT[from.id].push(L);
  }
  for (const L of LANES) {
    const outs = OUT[L.to].filter(o => o.e !== L.e);
    L.next = outs.length ? outs : OUT[L.to]; // U-turn only at a dead end
  }
  // routing table: for every goal node, the best lane to take from every node (Dijkstra on the lane graph)
  const N = NODES.length; HOP = new Int16Array(N * N).fill(-1);
  for (let g = 0; g < N; g++) {
    const dist = new Float64Array(N).fill(Infinity), done = new Uint8Array(N); dist[g] = 0;
    for (;;) {
      let u = -1, best = Infinity;
      for (let i = 0; i < N; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0) break;
      done[u] = 1;
      for (const L of LANES) if (L.to === u) { const d = dist[u] + L.len + 60; if (d < dist[L.from]) { dist[L.from] = d; HOP[g * N + L.from] = L.id; } }
    }
  }
  // spatial index of lane samples
  for (const L of LANES) for (let i = 0; i < L.n; i += 2) {
    const key = Math.floor(L.x[i] / 128) + Math.floor(L.y[i] / 128) * 64;
    if (!LGRID.has(key)) LGRID.set(key, []);
    LGRID.get(key).push({ L, s: i * LSTEP, x: L.x[i], y: L.y[i], h: L.h[i] });
  }
}
// the lane sample nearest to (x, y), preferring lanes heading the same way as `ang`
function nearestLanePt(x, y, ang, maxD = 96) {
  let best = null, bs = 1e9;
  const cx = Math.floor(x / 128), cy = Math.floor(y / 128), R = Math.ceil(maxD / 128);
  for (let j = cy - R; j <= cy + R; j++) for (let i = cx - R; i <= cx + R; i++) {
    const cell = LGRID.get(i + j * 64); if (!cell) continue;
    for (const p of cell) {
      const d = Math.hypot(p.x - x, p.y - y); if (d > maxD) continue;
      const sc = d + (ang == null ? 0 : 70 * (1 - Math.cos(wrapA(p.h - ang))));
      if (sc < bs) { bs = sc; best = p; }
    }
  }
  return best;
}
function lanePt(L, s) {
  if (s <= 0) return [L.x[0], L.y[0], L.h[0]];
  if (s >= L.len) return [L.x[L.n - 1], L.y[L.n - 1], L.h[L.n - 1]];
  const i = Math.min(L.n - 2, Math.floor(s / LSTEP)), seg = i === L.n - 2 ? L.len - i * LSTEP : LSTEP, f = (s - i * LSTEP) / (seg || 1);
  return [L.x[i] + (L.x[i + 1] - L.x[i]) * f, L.y[i] + (L.y[i + 1] - L.y[i]) * f, L.h[i]];
}
const gapLen = (L, nx) => nx ? Math.hypot(nx.x[0] - L.x[L.n - 1], nx.y[0] - L.y[L.n - 1]) : 0;
// a point at distance s along lane L, continuing straight across the junction into nx
function pathPt(L, nx, s) {
  if (s <= L.len || !nx) return lanePt(L, s);
  const g = gapLen(L, nx), e = s - L.len;
  if (e <= g) { const ex = L.x[L.n - 1], ey = L.y[L.n - 1], f = e / (g || 1); return [ex + (nx.x[0] - ex) * f, ey + (nx.y[0] - ey) * f, Math.atan2(nx.y[0] - ey, nx.x[0] - ex)]; }
  return lanePt(nx, e - g);
}

// ============================================================ world generation
const free = new Uint8Array(MW * MH); // unclaimed lot tiles
const dR = new Float32Array(MW * MH), eR = new Int16Array(MW * MH), XW = new Int16Array(MW * MH), XE = new Int16Array(MW * MH);
const pedSpot = new Uint8Array(MW * MH);
function genMap() {
  // sea and river
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++)
    map[y * MW + x] = (x === 0 || y === 0 || x >= MW - 1 || y >= MH - 1 || Math.abs(y + 0.5 - riverY(x + 0.5)) < RIVER_HW) ? WATER : GRASS;
  buildNet();
  // rasterise the network: distance from each tile centre to the nearest road centre line
  dR.fill(1e9); eR.fill(-1);
  for (const e of EDGES) for (let i = 0; i < e.pts.length - 1; i++) {
    const a = e.pts[i], b = e.pts[i + 1];
    const tx0 = Math.max(0, Math.floor(Math.min(a[0], b[0]) / T) - 3), tx1 = Math.min(MW - 1, Math.floor(Math.max(a[0], b[0]) / T) + 3);
    const ty0 = Math.max(0, Math.floor(Math.min(a[1], b[1]) / T) - 3), ty1 = Math.min(MH - 1, Math.floor(Math.max(a[1], b[1]) / T) + 3);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const d = closestOnSeg([(tx + 0.5) * T, (ty + 0.5) * T], a, b).d, k = ty * MW + tx;
      if (d < dR[k]) { dR[k] = d; eR[k] = e.id; }
    }
  }
  for (let k = 0; k < MW * MH; k++) {
    const e = eR[k] >= 0 ? EDGES[eR[k]] : null;
    if (dR[k] < 32) { if (map[k] === WATER) bridge[k] = 1; map[k] = ROAD; hwT[k] = e.hw ? 1 : 0; }
    else if (map[k] === WATER) continue;
    else if (dR[k] < 72) map[k] = e.hw ? GRASS : WALK;
    else free[k] = 1;
  }
  // the roundabout's island
  for (let ty = RB.y - 4; ty <= RB.y + 4; ty++) for (let tx = RB.x - 4; tx <= RB.x + 4; tx++)
    if (Math.hypot(tx + 0.5 - RB.x, ty + 0.5 - RB.y) < RB.r - 2.3) { map[ty * MW + tx] = GRASS; free[ty * MW + tx] = 0; }
  // crosswalks at signalised junctions
  for (const n of LIGHT_NODES) for (const e of n.edges) {
    const [ux, uy] = n.dirs.get(e.id);
    for (let ty = Math.floor(n.y / T) - 3; ty <= Math.floor(n.y / T) + 3; ty++) for (let tx = Math.floor(n.x / T) - 3; tx <= Math.floor(n.x / T) + 3; tx++) {
      const k = ty * MW + tx; if (tile(tx, ty) !== ROAD) continue;
      const px = (tx + 0.5) * T - n.x, py = (ty + 0.5) * T - n.y, al = px * ux + py * uy, lat = -px * uy + py * ux;
      if (al > 34 && al < 66 && Math.abs(lat) < 34) { XW[k] = n.id + 1; XE[k] = e.id; }
    }
  }
  const fill = (x, y, w, h, t) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) map[j * MW + i] = t; };
  const claim = (x, y, w, h) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) free[j * MW + i] = 0; };
  const rectFree = (x, y, w, h) => { if (x < 1 || y < 1 || x + w >= MW || y + h >= MH) return false; for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (!free[j * MW + i]) return false; return true; };
  // a building: the box (walls + roof) plus optional roof caps, setback tiers, domes, antennas and signs
  const mkB = (x, y, w, h, o) => {
    if (!o.canopy) fill(x, y, w, h, BUILD);
    claim(x, y, w, h);
    const b = Object.assign({ x: x * T, y: y * T, w: w * T, h: h * T, ht: 0.15, style: 'flat', win: 'grid', wall: '#8c8f93', roof: '#6e7c8c', sd: (srnd() * 2147483647) | 0 }, o);
    if (!b.det) {
      b.det = [];
      if (b.style === 'flat') { const n = Math.floor(srnd() * 4); for (let i = 0; i < n; i++) b.det.push([0.15 + srnd() * 0.55, 0.15 + srnd() * 0.55, 0.08 + srnd() * 0.12, 0.08 + srnd() * 0.12]); }
    }
    b.top = Math.max(b.ht + (b.capH || 0), ...(b.tiers || []).map(t => t.z), b.dome ? b.ht + b.dome.h : 0);
    buildings.push(b); return b;
  };
  // each district has its own architecture
  const styleFor = dist => {
    const r = srnd();
    if (dist === 0) return r < 0.55
      ? { style: 'ware', win: 'ware', wall: spick(['#7d7466', '#6f6a60', '#8a8174', '#5f6b70']), roof: spick(['#8a9096', '#9a8f80', '#6d7a82', '#a0a4a8']), ht: 0.07 + srnd() * 0.05 }
      : { style: 'flat', wall: spick(['#8a4b3a', '#7b4334', '#94553f', '#6b4f3f']), roof: spick(['#5d5348', '#70645a', '#6b6158']), ht: 0.12 + srnd() * 0.12, tank: srnd() < 0.5 };
    if (dist === 1) {
      if (r < 0.6) {
        const o = { style: 'glass', win: 'ribbon', wall: spick(['#4c6f8a', '#3f5f78', '#5a7f8f', '#46667a', '#5d6f7d']), roof: spick(['#55606b', '#4a535c', '#606a74']), ht: 0.28 + srnd() * 0.26, det: [] };
        if (srnd() < 0.6) o.tiers = [{ i: 16, z: o.ht + 0.07 + srnd() * 0.08 }];
        if (srnd() < 0.35) o.antenna = 0.12;
        return o;
      }
      return { style: 'flat', wall: spick(['#8c8f93', '#9a9a96', '#7d8590', '#a3a09a']), roof: spick(['#6e7c8c', '#7d8590', '#5f6b7a']), ht: 0.2 + srnd() * 0.18 };
    }
    if (dist === 2) return r < 0.75
      ? { style: 'house', wall: spick(['#d9c7a3', '#cfa98a', '#e0cfb1', '#c99c86', '#d8b48c', '#bfb39a']), roof: spick(['#9a4b32', '#a8573a', '#8b4430', '#7a5040', '#6a6a70']), ht: 0.07 + srnd() * 0.05, cap: srnd() < 0.5 ? 'gable' : 'hip', capH: 0.04 + srnd() * 0.03, chimney: srnd() < 0.6, det: [] }
      : { style: 'flat', wall: spick(['#b9a487', '#a88c70']), roof: spick(['#8b4d3b', '#86584a']), ht: 0.1 + srnd() * 0.1 };
    return { style: 'flat', wall: spick(['#3e3a4e', '#463e58', '#35404e', '#4a3f4f']), roof: spick(['#4b3f63', '#3e4a6a', '#45506e', '#55485e']), ht: 0.16 + srnd() * 0.2,
      neon: srnd() < 0.65 ? spick(['#ff3df0', '#3dfcff', '#ffe03d', '#7dff6a', '#ff7a3d']) : null, sign: srnd() < 0.45 ? spick(['BAR', 'HOTEL', 'Ψ', '24/7', 'CLUB', 'ARCADE', 'NOODLES', 'QUBIT', 'DINER']) : null };
  };
  const tree = (x, y, r = 10 + srnd() * 5) => trees.push({ x: x * T, y: y * T, r });
  const prop = (k, x, y, o = {}) => props.push(Object.assign({ k, x: x * T, y: y * T, s: (srnd() * 1e6) | 0 }, o));
  const lamp = (x, y, r = 70, c) => extraLamps.push({ x: x * T, y: y * T, r, c });
  // hand-made sites look for a free 8x8 lot near where they are meant to be
  const site = (name, cx, cy, w = 8, h = 8) => {
    let best = null, bd = 1e9;
    for (let y = Math.round(cy - h / 2) - 7; y <= Math.round(cy - h / 2) + 7; y++) for (let x = Math.round(cx - w / 2) - 7; x <= Math.round(cx - w / 2) + 7; x++) {
      const d = Math.hypot(x + w / 2 - cx, y + h / 2 - cy);
      if (d < bd && rectFree(x, y, w, h)) { bd = d; best = [x, y]; }
    }
    if (!best) { console.warn('no room for', name); return null; }
    claim(best[0], best[1], w, h);
    SITES.push({ name, x0: best[0], y0: best[1], x1: best[0] + w - 1, y1: best[1] + h - 1 });
    return best;
  };
  prop('statue', RB.x, RB.y);
  for (let i = 0; i < 4; i++) tree(RB.x + Math.cos(i * 1.57 + 0.8) * 1.6, RB.y + Math.sin(i * 1.57 + 0.8) * 1.6, 9);
  // airport: tarmac in the south-east corner
  for (let y = 76; y <= 96; y++) for (let x = 76; x <= 96; x++) if (free[y * MW + x]) { map[y * MW + x] = PLAZA; free[y * MW + x] = 0; }
  mkB(76, 89, 8, 6, { style: 'glass', win: 'ribbon', wall: '#7d98ad', roof: '#9aa7b4', ht: 0.14, det: [], mmc: '#9fb6c8' });   // terminal
  mkB(84, 89, 2, 2, { style: 'flat', win: 'ribbon', wall: '#c8d0d8', roof: '#d8dee4', ht: 0.55, det: [], antenna: 0.08 });     // control tower
  for (const hx of [86, 90]) mkB(hx, 89, 3, 5, { style: 'ware', win: 'ware', wall: '#7d8a6a', roof: '#8f9a7c', ht: 0.1 }); // hangars
  {
    const at = site('Quantum Stadium', 68, 68);
    if (at) { STADIUM = { x0: at[0], y0: at[1] }; mkB(at[0], at[1], 8, 8, { kind: 'stadium', style: 'stadium', win: 'none', wall: '#8d939a', roof: '#8d939a', ht: 0.16, det: [] }); }
  }
  let at;
  if ((at = site('Mercy General Hospital', 19.5, 21))) {
    const [x, y] = at;
    fill(x, y, 8, 8, PLAZA);
    mkB(x + 1, y + 1, 6, 3, { kind: 'hospital', win: 'ribbon', wall: '#e4e8ec', roof: '#cfd6dc', ht: 0.3, det: [], heli: true, mmc: '#f4f4f4' });
    mkB(x + 1, y + 4, 3, 2, { kind: 'cross', win: 'ribbon', wall: '#d8dde2', roof: '#c4ccd3', ht: 0.15, det: [] });
    prop('stalls', x + 4.55, y + 6.3, { n: 3, sp: 1.1 });
    prop('paint', x + 5.6, y + 4.7, { text: 'EMERGENCY', c: '#e53935' });
    fixedParked.push({ type: 'ambulance', x: (x + 5.1) * T, y: (y + 6.3) * T, a: -Math.PI / 2 }, { type: 'ambulance', x: (x + 6.2) * T, y: (y + 6.3) * T, a: -Math.PI / 2 });
    tree(x + 0.6, y + 7.3); tree(x + 2.2, y + 7.3); lamp(x + 4, y + 5.5);
  }
  if ((at = site('Police Headquarters', 80, 68))) {
    const [x, y] = at;
    fill(x, y, 8, 8, PLAZA);
    mkB(x, y, 5, 4, { kind: 'police', win: 'ribbon', wall: '#4f6688', roof: '#5c6f8e', ht: 0.26, det: [], heli: true, antenna: 0.2, antXY: [0.1, 0.12], mmc: '#3d6fd8' });
    mkB(x, y + 4, 2, 3, { wall: '#4a5c78', roof: '#56688a', ht: 0.14, det: [[0.3, 0.3, 0.3, 0.2]] });
    for (let i = 0; i < 4; i++) fixedParked.push({ type: 'police', x: (x + 6.4) * T, y: (y + 0.9 + i * 1.6) * T, a: Math.PI });
    prop('stalls', x + 6.4, y + 0.1, { n: 4, sp: 1.6, vert: true });
    prop('flag', x + 3.4, y + 5.6, { c: '#3d6fd8' });
    lamp(x + 4, y + 4.5); lamp(x + 6.4, y + 6.5);
  }
  if ((at = site('Fire Station No. 7', 32, 8))) {
    const [x, y] = at;
    fill(x, y, 8, 8, PLAZA);
    mkB(x, y + 1, 5, 4, { kind: 'fire', win: 'bays', wall: '#a23a2c', roof: '#7d3a30', ht: 0.15, det: [], mmc: '#d84a3a' });
    mkB(x + 6, y, 2, 2, { win: 'grid', wall: '#8c3329', roof: '#5f2a24', ht: 0.42, det: [] }); // drill tower
    prop('hatch', x + 0.1, y + 5.1, { w: 4.8, h: 1.2 });
    fixedParked.push({ type: 'firetruck', x: (x + 1.25) * T, y: (y + 6.6) * T, a: Math.PI / 2 }, { type: 'firetruck', x: (x + 3.75) * T, y: (y + 6.6) * T, a: Math.PI / 2 });
    tree(x + 6.5, y + 3.5); tree(x + 7.2, y + 6.8); lamp(x + 2.5, y + 5.5);
  }
  if ((at = site("St. Planck's Church", 24, 70))) {
    const [x, y] = at;
    const st = { kind: 'church', win: 'tall', wall: '#b9ad98', roof: '#5b6470', ht: 0.13, cap: 'gable', capH: 0.09, det: [] };
    mkB(x + 3, y + 1, 2, 4, { ...st, axis: 'y', mmc: '#d8cfbd' });
    mkB(x + 1, y + 2, 2, 2, { ...st, axis: 'x' });
    mkB(x + 5, y + 2, 2, 2, { ...st, axis: 'x' });
    mkB(x + 3, y + 5, 2, 2, { ...st, ht: 0.34, cap: 'hip', capH: 0.3, cross: true, win: 'slit', mmc: '#d8cfbd' });
    fill(x + 3, y + 7, 2, 1, PLAZA);
    for (const sx of [0.6, 5.4]) for (let i = 0; i < 9; i++) prop('grave', x + sx + (i % 3) * 0.75, y + 4.6 + Math.floor(i / 3) * 1.05);
    tree(x + 0.6, y + 0.7); tree(x + 7.3, y + 0.7); tree(x + 0.5, y + 2.9); tree(x + 7.5, y + 3.1); tree(x + 2.2, y + 0.5, 8);
    lamp(x + 4, y + 7.5, 55);
  }
  if ((at = site('Schrödinger Elementary', 8, 71))) {
    const [x, y] = at;
    const st = { kind: 'school', win: 'ribbon', wall: '#d2a85f', roof: '#8e8a80', ht: 0.13, det: [], solar: true };
    mkB(x, y, 8, 2, { ...st, mmc: '#e0b464' });
    mkB(x, y + 2, 2, 5, { ...st, solar: false });
    fill(x + 2, y + 2, 6, 6, PLAZA);
    prop('court', x + 2.6, y + 2.5, { w: 4.8, h: 2.6 });
    prop('hop', x + 3, y + 6.2);
    prop('flag', x + 2.5, y + 6.9, { c: '#ffd54a' });
    prop('bench', x + 5.5, y + 6.6); prop('bench', x + 6.8, y + 6.6);
    tree(x + 0.6, y + 7.4); tree(x + 1.5, y + 7.5, 8); lamp(x + 5, y + 5.5);
  }
  if ((at = site('Museum of Uncertain History', 66, 8))) {
    const [x, y] = at;
    fill(x, y, 8, 8, PLAZA);
    mkB(x + 1, y + 1, 6, 4, { kind: 'museum', win: 'columns', wall: '#e3dccd', roof: '#bdb5a5', ht: 0.15, cap: 'gable', capH: 0.05, axis: 'x', det: [], mmc: '#efe7d6' });
    prop('fountain', x + 4, y + 6.4, { r: 22 });
    prop('statue', x + 1.5, y + 6.3); prop('statue', x + 6.5, y + 6.3);
    tree(x + 0.5, y + 0.5); tree(x + 7.5, y + 0.5); tree(x + 0.5, y + 7.5); tree(x + 7.5, y + 7.5);
    lamp(x + 2.5, y + 6.5, 55); lamp(x + 5.5, y + 6.5, 55);
  }
  if ((at = site('City Hall', 66, 27.5, 8, 7))) {
    const [x, y] = at;
    fill(x, y, 8, 8, PLAZA);
    mkB(x + 1, y + 1, 6, 4, { kind: 'hall', win: 'tall', wall: '#d6ccb8', roof: '#b4ab98', ht: 0.18, det: [], dome: { r: 46, h: 0.16, c: '#5f9e8f' }, mmc: '#e8dcc0' });
    prop('flag', x + 2.6, y + 6.3, { c: '#c62828' }); prop('flag', x + 5.4, y + 6.3, { c: '#1565c0' });
    prop('fountain', x + 4, y + 6.6, { r: 18 });
    tree(x + 0.5, y + 0.5); tree(x + 7.5, y + 0.5); tree(x + 0.5, y + 5.5); tree(x + 7.5, y + 5.5);
    lamp(x + 4, y + 6, 60);
  }
  if ((at = site('Heisenberg Tower', 79, 8))) {
    const [x, y] = at;
    fill(x, y, 8, 8, PLAZA);
    mkB(x + 1, y + 1, 6, 6, { kind: 'tower', style: 'glass', win: 'ribbon', wall: '#3d6585', roof: '#4a5560', ht: 0.4, tiers: [{ i: 24, z: 0.52 }, { i: 56, z: 0.62 }], antenna: 0.22, det: [], mmc: '#6fa0c8' });
    tree(x + 0.4, y + 0.4, 9); tree(x + 7.6, y + 0.4, 9); tree(x + 0.4, y + 7.6, 9); tree(x + 7.6, y + 7.6, 9);
  }
  if ((at = site('Qubit Gas', 92, 68))) {
    const [x, y] = at;
    fill(x, y, 8, 8, PLAZA);
    mkB(x + 5, y + 5, 3, 3, { kind: 'shop', win: 'ribbon', wall: '#e8e2d4', roof: '#c9302c', ht: 0.08, det: [], sign: '24/7', neon: '#ffe03d' });
    mkB(x + 1, y + 1, 5, 3, { canopy: true, style: 'canopy', win: 'none', wall: '#d32f2f', roof: '#f2f2f2', ht: 0.1, det: [] });
    for (let i = 0; i < 3; i++) prop('pump', x + 2 + i * 1.5, y + 2.5);
    lamp(x + 2.5, y + 2.5, 60, 'rgba(255,255,255,1)'); lamp(x + 4.5, y + 2.5, 60, 'rgba(255,255,255,1)');
  }
  if ((at = site('Dirac Park', 8, 81))) {
    const [x, y] = at;
    fill(x + 3, y, 2, 8, PLAZA); fill(x, y + 3, 8, 2, PLAZA);
    fill(x + 3, y + 3, 2, 2, WATER);
    prop('fountain', x + 4, y + 4, { r: 34, big: true });
    for (const [qx, qy] of [[0, 0], [5, 0], [0, 5], [5, 5]]) {
      for (let i = 0; i < 3; i++) tree(x + qx + 0.5 + srnd() * 2, y + qy + 0.5 + srnd() * 2);
      prop('flowers', x + qx + 1.5, y + qy + 1.5);
    }
    prop('bench', x + 2.6, y + 1.5, { v: true }); prop('bench', x + 5.4, y + 6.5, { v: true });
    prop('bench', x + 1.5, y + 2.6); prop('bench', x + 6.5, y + 5.4);
    lamp(x + 4, y + 1, 55); lamp(x + 4, y + 7, 55); lamp(x + 1, y + 4, 55); lamp(x + 7, y + 4, 55);
  }
  if ((at = site('Superposition Mall', 62, 80, 8, 8))) {
    const [x, y] = at;
    fill(x, y, 8, 8, PLAZA);
    mkB(x, y, 8, 4, { kind: 'mall', win: 'ribbon', wall: '#3a3550', roof: '#4a4560', ht: 0.17, neon: '#ff3df0', sign: 'MALL', det: [[0.08, 0.2, 0.1, 0.18], [0.8, 0.25, 0.1, 0.18], [0.45, 0.65, 0.07, 0.12]], mmc: '#b04ac0' });
    for (const ry of [5.05, 6.95]) {
      prop('stalls', x, y + ry, { n: 8, sp: 1 });
      for (let i = 0; i < 8; i++) parkSpots.push({ x: (x + i + 0.5) * T, y: (y + ry) * T, a: ry < 6 ? Math.PI / 2 : -Math.PI / 2 });
    }
    lamp(x + 2, y + 6, 70); lamp(x + 6, y + 6, 70);
  }
  // the rest of every block: buildings packed into the irregular lots, with the odd park or car park
  const seen = new Uint8Array(MW * MH);
  const isFree = (x, y) => x > 0 && y > 0 && x < MW - 1 && y < MH - 1 && free[y * MW + x] === 1;
  for (let sy = 1; sy < MH - 1; sy++) for (let sx = 1; sx < MW - 1; sx++) {
    if (!isFree(sx, sy) || seen[sy * MW + sx]) continue;
    const reg = [], q = [[sx, sy]]; seen[sy * MW + sx] = 1;
    while (q.length) {
      const [x, y] = q.pop(); reg.push([x, y]);
      for (let d = 0; d < 4; d++) { const nx = x + DX[d], ny = y + DY[d]; if (isFree(nx, ny) && !seen[ny * MW + nx]) { seen[ny * MW + nx] = 1; q.push([nx, ny]); } }
    }
    reg.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    let cx = 0, cy = 0; for (const [x, y] of reg) { cx += x; cy += y; } cx /= reg.length; cy /= reg.length;
    const dist = districtAt((cx + 0.5) * T, (cy + 0.5) * T), r = srnd();
    const nearWalk = (x, y) => [0, 1, 2, 3].some(d => map[(y + DY[d]) * MW + x + DX[d]] === WALK);
    if (reg.length >= 18 && r < 0.09) { // a pocket park
      for (const [x, y] of reg) free[y * MW + x] = 0;
      for (let i = 0; i < reg.length / 5; i++) { const [x, y] = spick(reg); tree(x + 0.2 + srnd() * 0.6, y + 0.2 + srnd() * 0.6); }
      const [bx, by] = spick(reg); prop('bench', bx + 0.5, by + 0.5);
      const [lx, ly] = spick(reg); lamp(lx + 0.5, ly + 0.5, 55);
      if (reg.length > 30) { const [fx, fy] = spick(reg); prop('flowers', fx + 0.5, fy + 0.5); }
      continue;
    }
    if (reg.length >= 18 && r < 0.17) { // a car park
      const inReg = new Set(reg.map(([x, y]) => y * MW + x));
      for (const [x, y] of reg) {
        free[y * MW + x] = 0; map[y * MW + x] = PLAZA;
        const up = !inReg.has((y - 1) * MW + x), down = !inReg.has((y + 1) * MW + x);
        if (up !== down) { const yy = up ? y + 0.62 : y + 0.38; parkSpots.push({ x: (x + 0.5) * T, y: yy * T, a: up ? Math.PI / 2 : -Math.PI / 2 }); prop('stalls', x, yy, { n: 1, sp: 1 }); }
      }
      const [lx, ly] = spick(reg); lamp(lx + 0.5, ly + 0.5, 70);
      continue;
    }
    const [mn, mx] = [[3, 8], [3, 7], [2, 4], [3, 6]][dist];
    for (const [x, y] of reg) {
      if (!isFree(x, y)) continue;
      const maxW = mn + Math.floor(srnd() * (mx - mn + 1)), maxH = mn + Math.floor(srnd() * (mx - mn + 1));
      let w = 1; while (w < maxW && isFree(x + w, y)) w++;
      let h = 1; while (h < maxH) { let ok = true; for (let i = 0; i < w; i++) if (!isFree(x + i, y + h)) { ok = false; break; } if (!ok) break; h++; }
      if (w >= 2 && h >= 2) {
        mkB(x, y, w, h, styleFor(dist));
        if (srnd() < 0.3) { let ok = true; for (let j = 0; j < h; j++) if (!isFree(x + w, y + j)) ok = false; if (ok) for (let j = 0; j < h; j++) { free[(y + j) * MW + x + w] = 0; map[(y + j) * MW + x + w] = PLAZA; } }
      } else {
        free[y * MW + x] = 0;
        if (nearWalk(x, y)) map[y * MW + x] = PLAZA;
        else if (srnd() < 0.35) tree(x + 0.5, y + 0.5, 8 + srnd() * 6);
      }
    }
  }
  // doors: pavement tiles next to a building, where pedestrians come and go
  for (let ty = 1; ty < MH - 1; ty++) for (let tx = 1; tx < MW - 1; tx++) {
    const t = map[ty * MW + tx];
    if (t !== WALK && t !== PLAZA) continue;
    for (let d = 0; d < 4; d++) if (map[(ty + DY[d]) * MW + tx + DX[d]] === BUILD && ((tx * 7 + ty * 13) % 3 === 0)) { DOORS.push({ tx, ty, d }); break; }
  }
  // edges split into land and bridge stretches (for drawing pavements and parapets)
  for (const e of EDGES) {
    e.land = []; e.water = [];
    let cur = null, wet = null;
    const n = Math.max(2, Math.ceil(e.len / 8));
    for (let k = 0; k <= n; k++) {
      const p = edgePt(e, e.len * k / n), w = bridge[Math.floor(p[1] / T) * MW + Math.floor(p[0] / T)] === 1;
      if (w !== wet || !cur) { if (cur) cur.push(p); cur = [p]; (w ? e.water : e.land).push(cur); wet = w; } else cur.push(p);
    }
  }
}
function edgePt(e, s) {
  let acc = 0;
  for (let i = 1; i < e.pts.length; i++) {
    const a = e.pts[i - 1], b = e.pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc + l >= s || i === e.pts.length - 1) { const t = l ? clamp((s - acc) / l, 0, 1) : 0; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(b[1] - a[1], b[0] - a[0])]; }
    acc += l;
  }
  return [e.pts[0][0], e.pts[0][1], 0];
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
const siteRect = name => SITES.find(s => s.name === name);
const besideSite = (name, fx, fy) => { const s = siteRect(name); return tileCenter(findTileNear(Math.round(s ? s.x0 + (s.x1 - s.x0) * fx : 50), Math.round(s ? s.y0 + (s.y1 - s.y0) * fy : 50), WALK)); };
const HOSPITAL = besideSite('Mercy General Hospital', 0.5, 1.2);
const POLICE_HQ = besideSite('Police Headquarters', -0.2, 0.5);
const near = (tx, ty) => tileCenter(findTileNear(tx, ty, WALK));
const SPRAYS = [near(44, 22), near(91, 66)];
const BOOTHS = [[20, 13], [44, 31], [66, 21], [90, 9], [24, 60], [57, 75], [86, 88], [40, 92]].map(([x, y]) => near(x, y));

// street lamps along the pavements, on bridges, and runway lights
const lamps = [];
for (const e of EDGES) {
  if (e.oneway) continue;
  const step = e.hw ? 200 : 150, off = e.hw ? 44 : 52;
  for (let s = 60; s < e.len - 60; s += step) {
    const [x, y, h] = edgePt(e, s), nx = -Math.sin(h), ny = Math.cos(h);
    for (const sd of [-1, 1]) {
      const onBridge = bridge[Math.floor(y / T) * MW + Math.floor(x / T)];
      const o = onBridge ? 36 : off, lx = x + nx * o * sd, ly = y + ny * o * sd, t = tileAtP(lx, ly);
      if (!onBridge && t !== WALK && !(e.hw && t === GRASS)) continue;
      if (LIGHT_NODES.some(n => Math.hypot(n.x - lx, n.y - ly) < 90)) continue;
      lamps.push({ x: lx, y: ly, r: onBridge ? 65 : 85 });
    }
  }
}
lamps.push(...extraLamps);
for (let x = AIRPORT.rx0; x <= AIRPORT.rx1; x += 64) { lamps.push({ x, y: AIRPORT.ry0 + 4, r: 28, c: 'rgba(150,210,255,.95)' }); lamps.push({ x, y: AIRPORT.ry1 - 4, r: 28, c: 'rgba(150,210,255,.95)' }); }
// traffic lights: group 0 green, amber, all red, group 1 green, amber, all red
const LCYC = 18;
function lightPhase(L) { const t = (time + L.off) % LCYC; return t < 6.5 ? 0 : t < 8 ? 1 : t < 9 ? 4 : t < 15.5 ? 2 : t < 17 ? 3 : 4; }
// bus stops at mid-block on longer streets, with a shelter on the pavement
for (const e of EDGES) {
  if (e.hw || e.oneway || e.len < 420 || srnd() < 0.4) continue;
  const L = LANES.find(l => l.e === e && l.dir === 1); if (!L) continue;
  const s = L.len / 2, [x, y, h] = lanePt(L, s), nx = -Math.sin(h), ny = Math.cos(h);
  const sx = x + nx * 30, sy = y + ny * 30, k = Math.floor((y + ny * 40) / T) * MW + Math.floor((x + nx * 40) / T);
  if (map[k] !== WALK) continue;
  L.stop = s; pedSpot[k] = 2;
  BUS_STOPS.push({ x: sx, y: sy, L, s });
  props.push({ k: 'busstop', x: sx, y: sy, a: h });
}
for (const d of DOORS) if (!pedSpot[d.ty * MW + d.tx]) pedSpot[d.ty * MW + d.tx] = 1;
const LANDMARKS = [
  { name: 'Gridlock International Airport', x0: 76, y0: 76, x1: 96, y1: 96 },
  ...SITES,
];
function placeName(x, y) {
  const tx = Math.floor(x / T), ty = Math.floor(y / T), k = ty * MW + tx;
  for (const l of LANDMARKS) if (tx >= l.x0 && tx <= l.x1 && ty >= l.y0 && ty <= l.y1) return l.name;
  if ((tile(tx, ty) === WATER || bridge[k]) && Math.abs(ty + 0.5 - riverY(tx + 0.5)) < RIVER_HW + 0.6) return 'Copper River';
  if (isHighway(tx, ty)) return 'Ring Expressway';
  return DISTRICTS[districtAt(x, y)].name;
}
// the street you are on, for the HUD
function streetName(x, y) {
  const tx = Math.floor(x / T), ty = Math.floor(y / T), k = ty * MW + tx;
  return tile(tx, ty) === ROAD && eR[k] >= 0 ? EDGES[eR[k]].name : null;
}

const mm = document.createElement('canvas'); mm.width = MW; mm.height = MH;
{
  const m = mm.getContext('2d'), img = m.createImageData(MW, MH);
  const C = { [ROAD]: [70, 70, 76], [WALK]: [140, 138, 132], [BUILD]: [35, 35, 40], [GRASS]: [60, 120, 55], [WATER]: [30, 80, 125], [PLAZA]: [100, 96, 90] };
  for (let i = 0; i < MW * MH; i++) { const c = C[map[i]]; img.data.set([c[0], c[1], c[2], 255], i * 4); }
  m.putImageData(img, 0, 0);
  for (const b of buildings) if (b.mmc) { m.fillStyle = b.mmc; m.fillRect(b.x / T, b.y / T, b.w / T, b.h / T); }
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
  compact: { label: 'Hatchback',      w: 14, l: 27, max: 270, acc: 190, turn: 3.0, hp: 150,  mass: 0.8, colors: ['#c0392b', '#2e86c1', '#27ae60', '#d35400', '#8e44ad', '#bdc3c7'] },
  sedan:   { label: 'Sedan',          w: 16, l: 32, max: 300, acc: 175, turn: 2.7, hp: 210, mass: 1.0, colors: ['#34495e', '#7f8c8d', '#922b21', '#1f618d', '#196f3d', '#ecf0f1', '#5d4037'] },
  sports:  { label: 'Sports Coupe',   w: 16, l: 31, max: 400, acc: 290, turn: 3.2, hp: 170,  mass: 0.9, colors: ['#e74c3c', '#f1c40f', '#ff6f00', '#00bcd4', '#e91e63'] },
  truck:   { label: 'Box Truck',      w: 20, l: 46, max: 220, acc: 115, turn: 1.9, hp: 420, mass: 2.2, colors: ['#6d4c41', '#455a64', '#827717', '#37474f'] },
  taxi:    { label: 'Taxi',           w: 16, l: 32, max: 305, acc: 185, turn: 2.8, hp: 210, mass: 1.0, colors: ['#f4d03f'] },
  police:  { label: 'Police Cruiser', w: 16, l: 33, max: 380, acc: 255, turn: 3.0, hp: 300, mass: 1.3, colors: ['#f2f2f2'] },
  bike:    { label: 'Motorbike',      w: 8,  l: 20, max: 400, acc: 300, turn: 3.6, hp: 90,  mass: 0.4, colors: ['#111', '#c0392b', '#f1c40f', '#2e86c1'], bike: true },
  bus:     { label: 'City Bus',       w: 22, l: 60, max: 200, acc: 95, turn: 1.6, hp: 560, mass: 3.2, colors: ['#e67e22', '#2471a3', '#c0392b'] },
  tank:    { label: 'Tank',           w: 26, l: 44, max: 180, acc: 130, turn: 1.7, hp: 1300, mass: 7.0, colors: ['#556b2f'] },
  ambulance: { label: 'Ambulance',    w: 18, l: 38, max: 310, acc: 195, turn: 2.6, hp: 300, mass: 1.4, colors: ['#f4f6f7'] },
  firetruck: { label: 'Fire Truck',   w: 20, l: 50, max: 260, acc: 150, turn: 2.0, hp: 480, mass: 2.6, colors: ['#c0392b'] },
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
  // acceleration tapers off toward top speed, so cars build up speed progressively
  if (throttle > 0) c.speed += t.acc * dt * throttle * (c.speed < 0 ? 2.2 : 1 - 0.7 * clamp(c.speed / t.max, 0, 1));
  else if (throttle < 0) c.speed -= (c.speed > 0 ? t.acc * 1.7 : t.acc * 0.6) * dt;
  else c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), 90 * dt);
  if (hand) c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), 200 * dt);
  const maxF = t.max * (c.hp < t.hp * 0.3 ? 0.7 : 1);
  c.speed = clamp(c.speed, -t.max * 0.35, maxF);
  const sf = clamp(Math.abs(c.speed) / 50, 0, 1) * (c.speed >= 0 ? 1 : -1);
  const pa = c.angle;
  // the player's steering is calmer at speed (AI drivers keep their tight cornering)
  const hs = c.driver === 'player' ? 1 / (1 + Math.max(0, c.speed) / 380) : 1;
  c.angle += steer * t.turn * sf * hs * dt * (hand ? 1.6 : 1);
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
    thr = c.speed < target - 5 ? 1 : (c.speed > target + (target < 40 ? 6 : 25) ? -1 : 0);
    if (target > 30 && Math.abs(c.speed) < 12) { a.stuck += dt; if (a.stuck > 1.1) { a.rev = 0.8; a.stuck = 0; } }
    else a.stuck = Math.max(0, a.stuck - dt);
  }
  applyControls(c, thr, steer, !!a.eb && a.rev <= 0, dt);
}
// ============================================================ lane following on the road graph
function straightest(outs, L) {
  let best = outs[0], bv = 9;
  for (const o of outs) { const t = Math.abs(wrapA(o.h[0] - L.h[L.n - 1])); if (t < bv) { bv = t; best = o; } }
  return best;
}
function chooseNext(c, L) {
  const outs = L.next;
  if (!outs.length) return null;
  if (outs.length === 1) return outs[0];
  if (c.pref !== undefined) { // superposition branches take the first left (0) or right (1) turn they can
    let best = null, bv = 0.5;
    for (const o of outs) { const t = wrapA(o.h[0] - L.h[L.n - 1]) * (c.pref ? 1 : -1); if (t > bv) { bv = t; best = o; } }
    if (best) { c.pref = undefined; return best; }
    return straightest(outs, L);
  }
  const a = c.ai;
  if (a && a.goal >= 0 && Math.random() < 0.9) { const h = HOP[a.goal * NODES.length + L.to]; if (h >= 0 && outs.includes(LANES[h])) return LANES[h]; }
  return Math.random() < 0.6 ? straightest(outs, L) : pick(outs);
}
function laneAcquire(c, maxD = 96) {
  const p = nearestLanePt(c.x, c.y, c.angle, maxD);
  if (!p) return false;
  c.ln = { L: p.L, s: p.s, nx: null };
  return true;
}
// how far along its lane (and across the junction gap) the car is, and how far off the lane
function trackLane(c) {
  const ln = c.ln, L = ln.L;
  if (ln.s < L.len - 1) {
    let i = clamp(Math.floor(ln.s / LSTEP), 0, L.n - 1), bd = d2(c.x, c.y, L.x[i], L.y[i]);
    for (let k = i + 1; k < Math.min(L.n, i + 12); k++) { const d = d2(c.x, c.y, L.x[k], L.y[k]); if (d < bd) { bd = d; i = k; } }
    for (let k = i - 1; k >= Math.max(0, i - 3); k--) { const d = d2(c.x, c.y, L.x[k], L.y[k]); if (d < bd) { bd = d; i = k; } }
    let s = i * LSTEP;
    if (i < L.n - 1) {
      const sx = L.x[i + 1] - L.x[i], sy = L.y[i + 1] - L.y[i], l2 = sx * sx + sy * sy || 1;
      s += clamp(((c.x - L.x[i]) * sx + (c.y - L.y[i]) * sy) / l2, 0, 1) * Math.sqrt(l2);
    } else s = L.len + Math.max(0, (c.x - L.x[i]) * Math.cos(L.h[i]) + (c.y - L.y[i]) * Math.sin(L.h[i]));
    ln.s = Math.max(ln.s - 4, s); ln.off = Math.sqrt(bd);
  } else {
    const ex = L.x[L.n - 1], ey = L.y[L.n - 1];
    if (ln.nx) {
      const gx = ln.nx.x[0] - ex, gy = ln.nx.y[0] - ey, g = Math.hypot(gx, gy) || 1;
      ln.s = L.len + Math.max(0, ((c.x - ex) * gx + (c.y - ey) * gy) / g); ln.off = Math.abs(-(c.x - ex) * gy + (c.y - ey) * gx) / g;
    } else { ln.s = L.len; ln.off = Math.hypot(c.x - ex, c.y - ey); }
  }
}
function obstacleAhead(c, ignore) {
  const t = CT[c.type], hx = Math.cos(c.angle), hy = Math.sin(c.angle);
  const look = t.l / 2 + 16 + Math.abs(c.speed) * 0.25;
  for (const o of cars) {
    if (o === c || o === ignore) continue;
    const dx = o.x - c.x, dy = o.y - c.y, f = dx * hx + dy * hy;
    if (f <= 0 || f > look + CT[o.type].l / 2) continue;
    if (Math.abs(-dx * hy + dy * hx) < 15) return o;
  }
  const chk = p => { const dx = p.x - c.x, dy = p.y - c.y, f = dx * hx + dy * hy; return f > 0 && f < look && Math.abs(-dx * hy + dy * hx) < 13; };
  for (const p of peds) if (!p.dead && p !== ignore && chk(p)) return p;
  return !player.car && !player.hidden && !player.down && chk(player) ? player : null;
}
// distance from the car's nose to the stop line of a red light ahead, or -1 if it may go
function redStop(c) {
  const ln = c.ln; if (!ln) return -1;
  const L = ln.L, N = L.light;
  if (!N || ln.s > L.len) return -1; // no signal, or already in the junction
  const ph = lightPhase(N), g = L.grp;
  if (ph === (g ? 2 : 0)) return -1;
  const dist = L.len - ln.s - CT[c.type].l / 2; // nose to the stop line, where the lane ends
  const v2 = Math.max(0, c.speed) ** 2, room = dist + 24; // may overrun onto the crosswalk
  if (room < -12) return -1;                                  // already well into the junction
  if (room >= 0 ? v2 / 900 > room : c.speed > 40) return -1;  // physically can't stop before it
  if (ph === (g ? 3 : 1) && v2 / 500 > dist) return -1;       // amber: go if we can't stop comfortably
  return Math.max(0, dist);
}
// a random destination node for a civilian driver
function pickGoal(c) {
  for (let i = 0; i < 12; i++) { const n = pick(NODES); if (Math.hypot(n.x - c.x, n.y - c.y) > 20 * T) { c.ai.goal = n.id; return; } }
  c.ai.goal = pick(NODES).id;
}
function aiTraffic(c, dt, straightP = 0.65, avoid = true) {
  const a = c.ai;
  a.np = (a.np || 0) + dt; // time since the car last made progress
  if (!c.ln || a.np > 8) {
    if (!laneAcquire(c, a.np > 8 ? 160 : 96)) { applyControls(c, 0, 0, true, dt); return; }
    a.np = Math.min(a.np, 4);
  }
  trackLane(c);
  let ln = c.ln, L = ln.L;
  if (ln.off > 72) { c.ln = null; applyControls(c, 0, 0, true, dt); return; } // knocked off the road: find a lane again
  if (!ln.nx && ln.s > L.len - 160) {
    if (c.driver === 'ai' && !(a.goal >= 0 && L.to !== a.goal)) pickGoal(c);
    ln.nx = chooseNext(c, L);
  }
  let gap = gapLen(L, ln.nx);
  if (ln.nx && ln.s >= L.len + gap - 4) { c.ln = ln = { L: ln.nx, s: Math.max(0, ln.s - L.len - gap), nx: null }; L = ln.L; gap = 0; }
  if (c.ln !== a.pl || ln.s > (a.ps || 0) + 6) { a.np = 0; a.ps = ln.s; a.pl = c.ln; }
  const sp = Math.abs(c.speed);
  let [tx, ty] = pathPt(L, ln.nx, ln.s + 24 + sp * 0.3);
  // slow for bends in the road and for the turn at the next junction
  let turn = Math.abs(wrapA(lanePt(L, Math.min(ln.s + 90, L.len))[2] - lanePt(L, ln.s)[2]));
  if (ln.nx && L.len - ln.s < 110) turn = Math.max(turn, Math.abs(wrapA(ln.nx.h[0] - L.h[L.n - 1])));
  let target = a.cruise * (L.hw ? 1.7 : 1) * (1 - Math.min(1, turn / 1.6) * 0.62);
  target *= 1 - Math.min(Math.abs(wrapA(Math.atan2(ty - c.y, tx - c.x) - c.angle)), 1) * 0.5;
  if (!ln.nx && L.len - ln.s < 30) target = 0; // dead end
  a.horn -= dt; a.stopCd = (a.stopCd || 0) - dt;
  // buses dwell at stops; waiting passengers board
  if (c.type === 'bus' && c.driver === 'ai' && L.stop !== undefined && a.stopCd <= 0 && Math.abs(ln.s - L.stop) < 14) { a.dwell = 3.5; a.stopCd = 12; }
  if (a.dwell > 0) {
    a.dwell -= dt; target = 0;
    if (a.dwell < 2.5 && a.dwell + dt >= 2.5) for (const p of peds) if (p.wait === 'bus' && d2(p.x, p.y, c.x, c.y) < 80 * 80) p.gone = true;
  }
  // traffic lights (police on a chase and the player ignore them)
  const st = c.chase ? -1 : redStop(c), red = st >= 0 ? Math.sqrt(Math.max(0, st - 2) * 380) : 1e9;
  a.eb = st >= 0 && c.speed > red + 20; // brake hard (handbrake) if we came in too fast
  a.queued = st >= 0 && st < 60;
  if (a.queued) a.np = 0;
  if (a.byp > 0) a.byp -= dt;
  const ob = avoid ? obstacleAhead(c, a.byp > 0 ? a.bypObj : null) : null;
  if (ob) {
    // waiting in a queue at a light is not being stuck
    if (ob.ai && (ob.ai.queued || ob.ai.dwell > 0)) { a.queued = true; a.blocked = 0; a.np = 0; }
    else a.blocked += dt;
    // a wreck, a parked or abandoned car, or a long jam: steer around it through the opposite lane
    const still = ob.type && (ob.dead || !ob.driver || ob.parked || (ob.driver === 'player' && Math.abs(ob.speed) < 5));
    if ((still && a.blocked > 1) || a.blocked > 7) { a.byp = 2.2; a.bypObj = ob; a.blocked = 0; }
    else target = 0;
    if (a.blocked > 1.5 && a.horn <= 0 && onScreen(c.x, c.y) && !(ob.ai && ob.ai.blocked > 0.5)) { sfx.horn(); a.horn = 5; }
    a.stuck = 0;
  } else a.blocked = Math.max(0, a.blocked - dt * 2);
  if (a.byp > 0) { // aim one lane to the left of the planned path
    const hx = Math.cos(c.angle), hy = Math.sin(c.angle);
    tx = c.x + hx * 46 + hy * 26; ty = c.y + hy * 46 - hx * 26;
    target = Math.min(target || 70, 70);
  }
  driveToward(c, tx, ty, Math.min(target, red), dt);
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
  if (!valid) { c.job = null; c.driver = 'ai'; c.ln = null; aiTraffic(c, dt); return; }
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
  if (fleeing) { p.flee -= dt; p.path = null; p.idle = 0; p.wait = null; }
  else if (pedPurpose(p, dt)) return;
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
// ---- pedestrians with somewhere to be: BFS over pavements, plazas, parks and crosswalks
const pedWalk = (tx, ty) => { const t = tile(tx, ty); return t === WALK || t === PLAZA || t === GRASS || (t === ROAD && XW[ty * MW + tx] > 0); };
const bfsQ = new Int32Array(MW * MH), bfsPrev = new Int32Array(MW * MH), bfsD = new Int16Array(MW * MH), bfsSeen = new Uint32Array(MW * MH);
let bfsStamp = 0;
function pedPlan(p) {
  const sx = Math.floor(p.x / T), sy = Math.floor(p.y / T);
  if (!pedWalk(sx, sy)) return false;
  const st = ++bfsStamp, s0 = sy * MW + sx, cand = [], spec = [];
  let h = 0, tl = 0; bfsQ[tl++] = s0; bfsSeen[s0] = st; bfsPrev[s0] = -1; bfsD[s0] = 0;
  while (h < tl) {
    const i = bfsQ[h++], d = bfsD[i];
    if (d >= 10) { cand.push(i); if (pedSpot[i] && !(p.cop && pedSpot[i] === 1)) spec.push(i); }
    if (d >= 40) continue;
    const x = i % MW, y = (i / MW) | 0;
    for (let k = 0; k < 4; k++) {
      const nx = x + DX[k], ny = y + DY[k], j = ny * MW + nx;
      if (nx < 0 || ny < 0 || nx >= MW || ny >= MH || bfsSeen[j] === st || !pedWalk(nx, ny)) continue;
      bfsSeen[j] = st; bfsPrev[j] = i; bfsD[j] = d + 1; bfsQ[tl++] = j;
    }
  }
  if (!cand.length) return false;
  let g = (spec.length && Math.random() < 0.65) ? pick(spec) : pick(cand);
  const path = [];
  for (let i = g; i !== s0 && i >= 0; i = bfsPrev[i]) path.push(i);
  path.reverse();
  p.path = path; p.pi = 0; p.goalKind = pedSpot[g] || 0; p.idle = 0; p.wait = null;
  return true;
}
// may a pedestrian step onto this crosswalk now?
function canCross(tx, ty) {
  const k = ty * MW + tx, n = XW[k] - 1;
  if (n >= 0) { // cross while the traffic on this road has red
    const N = NODES[n], g = N.grp.get(XE[k]), ph = lightPhase(N);
    if (ph !== (g ? 0 : 2) && ph !== (g ? 1 : 3)) return false;
  }
  for (const c of cars) if (!c.dead && Math.abs(c.speed) > 15 && d2(c.x, c.y, (tx + 0.5) * T, (ty + 0.5) * T) < 85 * 85) return false;
  return true;
}
// returns true when it has moved the pedestrian
function pedPurpose(p, dt) {
  if (p.idle > 0) {
    p.idle -= dt; p.moving = false;
    if (p.chatWith && !p.chatWith.dead) p.angle = Math.atan2(p.chatWith.y - p.y, p.chatWith.x - p.x);
    if (p.wait === 'bus' && p.idle <= 0) p.idle = 4 + Math.random() * 6; // keep waiting a while
    if (p.wait === 'bus' && Math.random() < dt / 60) p.wait = null;  // give up eventually
    return true;
  }
  if (p.entering) {
    p.entering -= dt; p.moving = true; p.anim += dt * 9;
    moveFree(p, Math.cos(p.angle) * 30, Math.sin(p.angle) * 30, dt, 2);
    if (p.entering <= 0) p.gone = true;
    return true;
  }
  if (!p.path || p.pi >= p.path.length) {
    if (p.path && p.pi >= p.path.length) { // arrived
      const k = p.goalKind; p.path = null;
      if (k === 1 && !p.target && !p.cop && Math.random() < 0.6) {
        const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T);
        for (let d = 0; d < 4; d++) if (tile(tx + DX[d], ty + DY[d]) === BUILD) { p.angle = d * Math.PI / 2; p.entering = 0.7; return true; }
      }
      if (k === 2) { p.wait = 'bus'; p.idle = 6 + Math.random() * 8; p.angle = -Math.PI / 2; return true; }
      p.idle = 1.5 + Math.random() * 4;
      p.chatWith = null;
      for (const o of peds) if (o !== p && !o.dead && !o.cop && d2(o.x, o.y, p.x, p.y) < 40 * 40 && !(o.idle > 0) && !o.vip) {
        o.idle = p.idle = 4 + Math.random() * 5; o.chatWith = p; p.chatWith = o; o.path = null; break;
      }
      return true;
    }
    if (p.planCd > 0) { p.planCd -= dt; return false; }
    if (!pedPlan(p)) { p.planCd = 2; return false; }
  }
  const i = p.path[p.pi], tx = i % MW, ty = (i / MW) | 0;
  const onRoad = tile(Math.floor(p.x / T), Math.floor(p.y / T)) === ROAD;
  if (!onRoad && tile(tx, ty) === ROAD && !canCross(tx, ty)) { // wait at the kerb
    p.moving = false; p.angle = Math.atan2((ty + 0.5) * T - p.y, (tx + 0.5) * T - p.x); return true;
  }
  const road = tile(tx, ty) === ROAD;
  const gx = (tx + 0.5) * T + (road ? p.ox * 0.4 : p.ox), gy = (ty + 0.5) * T + (road ? p.oy * 0.4 : p.oy);
  const dx = gx - p.x, dy = gy - p.y, dist = Math.hypot(dx, dy);
  if (dist < 3) { p.pi++; return true; }
  const sp = (onRoad || road ? 1.5 : 1) * p.speed, m = Math.min(dist, sp * dt);
  const nx = p.x + dx / dist * m, ny = p.y + dy / dist * m;
  if (solidAt(nx, ny)) { p.path = null; p.planCd = 0.5; return false; }
  p.x = nx; p.y = ny; p.moving = true; p.tx = -1;
  p.angle += wrapA(Math.atan2(dy, dx) - p.angle) * Math.min(1, dt * 12);
  p.anim += dt * 9;
  return true;
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
      damageCar(c, f * 260, src);
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
    const lp = nearestLanePt(c.x, c.y, c.angle, 140);
    g.ln = lp ? { L: lp.L, s: lp.s, nx: null } : null;
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
    const ln = g.ln;
    if (ln) {
      if (!ln.nx && ln.s > ln.L.len - 160) ln.nx = chooseNext(g, ln.L);
      ln.s += v * dt;
      const gap = gapLen(ln.L, ln.nx);
      if (ln.nx && ln.s >= ln.L.len + gap) { ln.s -= ln.L.len + gap; ln.L = ln.nx; ln.nx = null; }
      else if (!ln.nx && ln.s > ln.L.len) ln.s = ln.L.len;
      const [x, y, h] = pathPt(ln.L, ln.nx, ln.s);
      g.x = x; g.y = y;
      g.angle += wrapA(h - g.angle) * Math.min(1, dt * 10);
      g.vx = Math.cos(h) * v; g.vy = Math.sin(h) * v; g.speed = v;
    }
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
    // keyboard steering ramps in instead of snapping to full lock
    c.steerIn = (c.steerIn || 0) + ((keys.right - keys.left) - (c.steerIn || 0)) * Math.min(1, dt * 9);
    applyControls(c, keys.up ? 1 : keys.down ? -1 : 0, c.steerIn, !special && !!keys.fire, dt);
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
    c.mission = true; c.parked = true; c.color = '#ff2bd6'; c.hp = 230;
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
  if (m.type === 'qkd' && m.eve) { m.eve.mission = false; if (m.eve.driver === 'eve') { m.eve.driver = 'ai'; m.eve.ln = null; } }
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
        if (!m.eveGone) { const e = spawnTraffic('sports', 'eve'); if (e) { e.color = '#5b2c6f'; e.mission = true; e.hp = 220; m.eve = e; } }
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
  const v = viewRect(48), o = viewRect(420), inV = p => p.x > v.x0 && p.x < v.x1 && p.y > v.y0 && p.y < v.y1;
  for (let i = 0; i < 40; i++) {
    const q = { x: rand(o.x0, o.x1), y: rand(o.y0, o.y1) };
    if (inV(q)) continue;
    const p = nearestLanePt(q.x, q.y, null, 64);
    if (!p || inV(p) || cars.some(c => d2(c.x, c.y, p.x, p.y) < 50 * 50)) continue;
    const c = makeCar(type, p.x, p.y, p.h, driver);
    c.ln = { L: p.L, s: p.s, nx: null };
    c.speed = c.ai.cruise * 0.7; c.vx = Math.cos(c.angle) * c.speed; c.vy = Math.sin(c.angle) * c.speed;
    return c;
  }
  return null;
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
  cars = cars.filter(c => c === player.car || c.mission || c.fire > 0 || (c.driver === 'ai' && c.ai.np > 12 && !onScreen(c.x, c.y, 120) ? false : !out(c, far)) || (c.parked && !c.dead && !c.moved && c.driver === null));
  peds = peds.filter(p => p.target || p.vip || (!p.gone && !out(p, farP) && !(p.dead && p.deadT > 40)));
  const moving = cars.filter(c => c.driver === 'ai' || (c.driver === 'police' && !c.chase)).length;
  if (moving < 30) {
    const cop = Math.random() < 0.07;
    spawnTraffic(cop ? 'police' : pick(CIV), cop ? 'police' : 'ai');
  }
  if (peds.filter(p => !p.dead).length < 55) {
    let p = null;
    if (Math.random() < 0.35) { // someone comes out of a building
      for (let i = 0; i < 20 && !p; i++) {
        const d = pick(DOORS), x = (d.tx + 0.5) * T, y = (d.ty + 0.5) * T;
        if (onScreen(x, y, -20) && !peds.some(o => d2(o.x, o.y, x, y) < 30 * 30)) p = { x: x + DX[d.d] * 10, y: y + DY[d.d] * 10 };
      }
    }
    if (!p) { const q = spawnOutside([WALK, PLAZA]); if (q) p = { x: q.x + rand(-8, 8), y: q.y + rand(-8, 8) }; }
    if (p) makePed(p.x, p.y, { cop: Math.random() < 0.08 });
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
  for (const f of fixedParked) { const c = makeCar(f.type, f.x, f.y, f.a, null); c.parked = true; }
}

// ============================================================ physics lab
const LAB_START = tileCenter(findTileNear(30, 21, WALK));
const LESSONS = [
  { key: 'superposition', title: 'Superposition',
    text: 'Get in the car next to you and drive. Press X to split it into three branches. Press V for slow motion: each branch shows its amplitude as a rotating arrow (a phasor), and the arrow\'s length squared is the probability. Press X again to collapse it.',
    setup() { labCar('sedan'); Q.psi = 99; }, check: () => labFlags.collapsed },
  { key: 'measurement', title: 'Measurement',
    text: 'A police cruiser is parked nearby (follow the arrow). Superpose, then drive into its line of sight. Its look counts as a measurement, so the superposition collapses on its own.',
    setup() {
      labCar('sports'); Q.psi = 99;
      const t = randomTile([ROAD], p => { const d = Math.hypot(p.x - player.x, p.y - player.y); return d > 350 && d < 650 && !bridge[p.ty * MW + p.tx] && !isHighway(p.tx, p.ty); });
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
  const p = nearestLanePt(player.x, player.y, null, 600);
  const c = makeCar(type, p ? p.x : player.x, p ? p.y : player.y, p ? p.h : 0, null);
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
// ---- ground textures: small tiles generated once and used as repeating patterns (anchored to world space)
function mkPat(n, base, fn) {
  const c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, n, n); fn(g, n); return ctx.createPattern(c, 'repeat');
}
const speck = (g, n, k, cols, s = 2) => { for (let i = 0; i < k; i++) { g.fillStyle = pick(cols); g.fillRect(Math.random() * n | 0, Math.random() * n | 0, 1 + (Math.random() * s | 0), 1 + (Math.random() * s | 0)); } };
const PAT = {
  [ROAD]: mkPat(64, '#3b3b40', (g, n) => speck(g, n, 520, ['rgba(255,255,255,.05)', 'rgba(0,0,0,.14)', 'rgba(255,255,255,.03)'])),
  hw: mkPat(64, '#2f2f34', (g, n) => speck(g, n, 520, ['rgba(255,255,255,.05)', 'rgba(0,0,0,.16)'])),
  br: mkPat(32, '#4a4a50', (g, n) => { speck(g, n, 120, ['rgba(255,255,255,.05)', 'rgba(0,0,0,.12)']); g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, 0, n, 1); }),
  [WALK]: mkPat(32, '#8f8b84', (g, n) => {
    speck(g, n, 90, ['rgba(255,255,255,.06)', 'rgba(0,0,0,.07)']);
    g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(0, 0, n, 1); g.fillRect(0, 0, 1, n); g.fillRect(0, 16, n, 1); g.fillRect(16, 0, 1, n);
    g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(1, 1, n - 1, 1); g.fillRect(1, 17, n - 1, 1);
  }),
  [GRASS]: mkPat(64, '#3d7a38', (g, n) => {
    for (let i = 0; i < 26; i++) { g.fillStyle = pick(['rgba(70,140,62,.5)', 'rgba(48,100,44,.5)']); g.beginPath(); g.arc(Math.random() * n, Math.random() * n, 3 + Math.random() * 7, 0, TAU); g.fill(); }
    speck(g, n, 260, ['#468a40', '#356d31', '#4f9446', '#2f6a2b'], 1);
  }),
  [PLAZA]: mkPat(32, '#5d5a56', (g, n) => {
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
      const v = 82 + (Math.random() * 18 | 0);
      g.fillStyle = `rgb(${v + 6},${v + 3},${v})`; g.fillRect(c * 8 - (r % 2) * 4 + 1, r * 8 + 1, 6, 6);
    }
  }),
  [WATER]: mkPat(64, '#1c4e78', (g, n) => {
    g.strokeStyle = 'rgba(70,140,200,.25)'; g.lineWidth = 1.5;
    for (let i = 0; i < 9; i++) { const x = Math.random() * n, y = Math.random() * n; g.beginPath(); g.arc(x, y, 6 + Math.random() * 6, 3.6, 5.8); g.stroke(); }
  }),
  [BUILD]: '#26262a',
  quay: mkPat(32, '#8d877c', (g, n) => { speck(g, n, 80, ['rgba(255,255,255,.06)', 'rgba(0,0,0,.1)']); g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(0, 0, n, 1); g.fillRect(0, 16, n, 1); g.fillRect(0, 0, 1, 16); g.fillRect(16, 16, 1, 16); }),
};
const inRiver = (tx, ty) => tx >= 1 && tx <= MW - 2 && ty >= 1 && ty <= MH - 2 && Math.abs(ty + 0.5 - riverY(tx + 0.5)) < RIVER_HW + 0.5;
const RIVER_PX = RIVER.map(([x, y]) => [x * T, y * T]);
// the static ground is rendered once into cached chunks; only the water animates per frame
const CHK = 8 * T, chunkCache = new Map();
let chunkS = 0;
function groundChunk(cx, cy) {
  const key = cx * 64 + cy;
  let c = chunkCache.get(key);
  if (c) { chunkCache.delete(key); chunkCache.set(key, c); return c; }
  c = document.createElement('canvas'); c.width = c.height = Math.ceil(CHK * chunkS);
  const g = c.getContext('2d'), main = ctx;
  g.setTransform(chunkS, 0, 0, chunkS, -cx * CHK * chunkS, -cy * CHK * chunkS);
  ctx = g;
  try { drawGroundStatic({ x0: cx * CHK - T, y0: cy * CHK - T, x1: (cx + 1) * CHK + T - 1, y1: (cy + 1) * CHK + T - 1 }); } finally { ctx = main; } // 1-tile margin so kerb details cross chunk seams
  chunkCache.set(key, c);
  if (chunkCache.size > 64) chunkCache.delete(chunkCache.keys().next().value);
  return c;
}
function drawGround(v) {
  const S = DPR >= 1.5 ? 2 : 1;
  if (S !== chunkS) { chunkCache.clear(); chunkS = S; }
  ctx.imageSmoothingEnabled = false;
  for (let cy = Math.max(0, Math.floor(v.y0 / CHK)); cy <= Math.min(Math.floor((MH * T - 1) / CHK), Math.floor(v.y1 / CHK)); cy++)
    for (let cx = Math.max(0, Math.floor(v.x0 / CHK)); cx <= Math.min(Math.floor((MW * T - 1) / CHK), Math.floor(v.x1 / CHK)); cx++)
      ctx.drawImage(groundChunk(cx, cy), cx * CHK, cy * CHK, CHK + 0.5, CHK + 0.5);
  ctx.imageSmoothingEnabled = true;
  drawWaterAnim(v);
}
function drawWaterAnim(v) {
  const x0 = Math.max(0, Math.floor(v.x0 / T)), y0 = Math.max(0, Math.floor(v.y0 / T));
  const x1 = Math.min(MW - 1, Math.floor(v.x1 / T)), y1 = Math.min(MH - 1, Math.floor(v.y1 / T));
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (map[ty * MW + tx] !== WATER) continue;
    const px = tx * T, py = ty * T, riv = inRiver(tx, ty);
    if (riv && Math.abs(ty + 0.5 - riverY(tx + 0.5)) > RIVER_HW - 0.9) continue;
    ctx.fillStyle = '#2a6596';
    ctx.fillRect(px + ((time * 12 + tx * 7) % T) * 0.5, py + ((ty * 13) % 20) + 4, 10, 2);
    const w = (dx, dy) => { const n = tile(tx + dx, ty + dy); return n !== WATER && !(n === ROAD && bridge[(ty + dy) * MW + tx + dx]); };
    if (riv || !(w(-1, 0) || w(1, 0) || w(0, -1) || w(0, 1))) continue;
    ctx.fillStyle = 'rgba(210,235,255,.28)';
    const f = 2 + Math.sin(time * 2 + tx + ty) * 1;
    if (w(-1, 0)) ctx.fillRect(px, py, f, T); if (w(1, 0)) ctx.fillRect(px + T - f, py, f, T);
    if (w(0, -1)) ctx.fillRect(px, py, T, f); if (w(0, 1)) ctx.fillRect(px, py + T - f, T, f);
  }
}
// a sub-polyline of an edge between distances s0 and s1
function edgeSub(e, s0, s1) {
  const pts = [], n = Math.max(1, Math.ceil((s1 - s0) / 12));
  for (let k = 0; k <= n; k++) { const p = edgePt(e, s0 + (s1 - s0) * k / n); pts.push(p); }
  return pts;
}
function drawGroundStatic(v) {
  const x0 = Math.max(0, Math.floor(v.x0 / T)), y0 = Math.max(0, Math.floor(v.y0 / T));
  const x1 = Math.min(MW - 1, Math.floor(v.x1 / T)), y1 = Math.min(MH - 1, Math.floor(v.y1 / T));
  // tiles under the roads show what the strokes do not cover: pavement, highway verge, or river under a bridge
  const kind = (tx, ty) => { const k = ty * MW + tx, t = map[k]; return t === WATER ? (inRiver(tx, ty) ? 'quay' : WATER) : t !== ROAD ? t : bridge[k] ? 'quay' : hwT[k] ? GRASS : WALK; };
  for (let ty = y0; ty <= y1; ty++) {
    let s = x0, k = kind(x0, ty);
    for (let tx = x0 + 1; tx <= x1 + 1; tx++) {
      const k2 = tx <= x1 ? kind(tx, ty) : null;
      if (k2 !== k) { ctx.fillStyle = PAT[k]; ctx.fillRect(s * T, ty * T, (tx - s) * T + 0.6, T + 0.6); s = tx; k = k2; }
    }
  }
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const k = ty * MW + tx, h = (tx * 73856093 ^ ty * 19349663) >>> 0;
    if (map[k] === GRASS && h % 7 === 0) { ctx.fillStyle = ['#e8e070', '#f2f2f2', '#d77fb0'][h % 3]; ctx.fillRect(tx * T + h % 27, ty * T + (h >> 6) % 27, 2, 2); ctx.fillRect(tx * T + (h >> 3) % 27, ty * T + (h >> 9) % 27, 2, 2); }
  }
  const path = pts => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); };
  ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
  // the river: a smooth band of water between stone quays
  if (v.y1 > 30 * T && v.y0 < 56 * T) {
    path(RIVER_PX); ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = RIVER_HW * 2 * T + 2; ctx.stroke();
    path(RIVER_PX); ctx.strokeStyle = PAT[WATER]; ctx.lineWidth = RIVER_HW * 2 * T - 6; ctx.stroke();
  }
  // roads are stroked in layers so that junctions merge cleanly: parapets, pavements, kerbs, asphalt, markings
  const E = EDGES.filter(e => e.bb[0] < v.x1 && e.bb[2] > v.x0 && e.bb[1] < v.y1 && e.bb[3] > v.y0);
  ctx.lineCap = 'round';
  for (const e of E) for (const r of e.water) { path(r.map(([x, y]) => [x + 6, y + 9])); ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 72; ctx.stroke(); }
  ctx.lineCap = 'butt';
  for (const e of E) for (const r of e.water) { path(r); ctx.strokeStyle = '#c9c4b8'; ctx.lineWidth = 78; ctx.stroke(); }
  ctx.lineCap = 'round';
  for (const e of E) if (!e.hw) for (const r of e.land) { path(r); ctx.strokeStyle = PAT[WALK]; ctx.lineWidth = 128; ctx.stroke(); }
  for (const e of E) if (!e.hw) { path(e.pts); ctx.strokeStyle = '#bdb8ae'; ctx.lineWidth = 70; ctx.stroke(); }
  for (const e of E) { path(e.pts); ctx.strokeStyle = e.hw ? PAT.hw : PAT[ROAD]; ctx.lineWidth = 64; ctx.stroke(); }
  ctx.lineCap = 'butt';
  for (const e of E) for (const r of e.water) { path(r); ctx.strokeStyle = PAT.br; ctx.lineWidth = 64; ctx.stroke(); }
  // highway edge lines
  for (const e of E) if (e.hw) { path(e.pts); ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 58; ctx.stroke(); path(e.pts); ctx.strokeStyle = PAT.hw; ctx.lineWidth = 54; ctx.stroke(); }
  // centre lines, kept clear of junctions
  ctx.setLineDash([14, 12]); ctx.lineWidth = 2;
  for (const e of E) {
    if (e.oneway) continue;
    const ca = NODES[e.a].clr || 0, cb = NODES[e.b].clr || 0;
    if (e.len - ca - cb < 30) continue;
    path(edgeSub(e, ca + 6, e.len - cb - 6));
    ctx.strokeStyle = e.hw || e.water.length ? '#e8e8e8' : '#d4b23a'; ctx.stroke();
  }
  ctx.setLineDash([]); ctx.lineCap = 'round';
  // the roundabout's island
  if (Math.abs(RB.x * T - (v.x0 + v.x1) / 2) < (v.x1 - v.x0) / 2 + 120 && Math.abs(RB.y * T - (v.y0 + v.y1) / 2) < (v.y1 - v.y0) / 2 + 120) {
    ctx.beginPath(); ctx.arc(RB.x * T, RB.y * T, RB.r * T - 62, 0, TAU);
    ctx.fillStyle = PAT[GRASS]; ctx.fill(); ctx.strokeStyle = '#bdb8ae'; ctx.lineWidth = 4; ctx.stroke();
  }
  // crosswalks and stop lines at signalised junctions
  for (const n of LIGHT_NODES) {
    if (n.x < v.x0 - 100 || n.x > v.x1 + 100 || n.y < v.y0 - 100 || n.y > v.y1 + 100) continue;
    for (const e of n.edges) {
      const [ux, uy] = n.dirs.get(e.id);
      ctx.save(); ctx.translate(n.x, n.y); ctx.rotate(Math.atan2(uy, ux));
      ctx.fillStyle = '#dcdcdc'; for (let k = -3; k <= 3; k++) ctx.fillRect(41, k * 9 - 2.5, 22, 5);
      ctx.fillStyle = '#eeeeee'; ctx.fillRect(69, -31, 3, 30);
      ctx.restore();
    }
  }
  // manholes and oil stains
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const k = ty * MW + tx, h = (tx * 73856093 ^ ty * 19349663) >>> 0;
    if (map[k] !== ROAD || hwT[k] || bridge[k] || XW[k] || dR[k] > 20) continue;
    if (h % 47 === 0) { ctx.fillStyle = '#2a2a2e'; ctx.beginPath(); ctx.arc(tx * T + 16, ty * T + 16, 5, 0, TAU); ctx.fill(); ctx.fillStyle = '#46464c'; ctx.fillRect(tx * T + 13, ty * T + 15, 6, 1); ctx.fillRect(tx * T + 13, ty * T + 17, 6, 1); }
    else if (h % 53 === 0) { ctx.fillStyle = 'rgba(0,0,0,.16)'; ctx.beginPath(); ctx.ellipse(tx * T + 12 + h % 9, ty * T + 16, 7, 4, 0, 0, TAU); ctx.fill(); }
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
  for (const l of lamps) if (!l.c && l.x > v.x0 - 4 && l.x < v.x1 + 4 && l.y > v.y0 - 4 && l.y < v.y1 + 4) { ctx.beginPath(); ctx.arc(l.x, l.y, 2.5, 0, TAU); ctx.fill(); }
}

// ---- props on the ground: graves, benches, fountains, flags...
function drawProps(v) {
  for (const p of props) {
    if (p.x < v.x0 - 120 || p.x > v.x1 + 120 || p.y < v.y0 - 120 || p.y > v.y1 + 120) continue;
    const x = p.x, y = p.y;
    switch (p.k) {
      case 'grave':
        ctx.fillStyle = 'rgba(0,0,0,.25)'; rrect(x - 2, y - 3, 7, 10, 3);
        ctx.fillStyle = '#9a9ca0'; rrect(x - 3.5, y - 5, 7, 10, 3);
        ctx.fillStyle = '#7e8084'; ctx.fillRect(x - 2, y - 2, 4, 1); break;
      case 'bench':
        ctx.save(); ctx.translate(x, y); if (p.v) ctx.rotate(Math.PI / 2);
        ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(-9, -1, 20, 7);
        ctx.fillStyle = '#7a5230'; ctx.fillRect(-10, -3, 20, 6); ctx.fillStyle = '#5c3d22'; ctx.fillRect(-10, -1, 20, 1); ctx.fillRect(-10, 1, 20, 1);
        ctx.restore(); break;
      case 'pump':
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x - 4, y - 6, 11, 15);
        ctx.fillStyle = '#e8e8e8'; ctx.fillRect(x - 6, y - 8, 11, 15); ctx.fillStyle = '#d32f2f'; ctx.fillRect(x - 6, y - 8, 11, 4);
        ctx.fillStyle = '#222'; ctx.fillRect(x - 4, y - 2, 7, 4); break;
      case 'court':
        ctx.fillStyle = '#b5583f'; ctx.fillRect(x, y, p.w * T, p.h * T);
        ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 2; ctx.strokeRect(x + 4, y + 4, p.w * T - 8, p.h * T - 8);
        ctx.beginPath(); ctx.moveTo(x + p.w * T / 2, y + 4); ctx.lineTo(x + p.w * T / 2, y + p.h * T - 4); ctx.stroke();
        ctx.beginPath(); ctx.arc(x + p.w * T / 2, y + p.h * T / 2, 12, 0, TAU); ctx.stroke();
        for (const s of [0, 1]) { const cx = s ? x + p.w * T - 4 : x + 4; ctx.beginPath(); ctx.arc(cx, y + p.h * T / 2, 26, s ? Math.PI / 2 : -Math.PI / 2, s ? Math.PI * 1.5 : Math.PI / 2); ctx.stroke(); }
        break;
      case 'hop':
        ctx.strokeStyle = '#f5f5f5'; ctx.lineWidth = 1.5;
        for (let i = 0; i < 5; i++) ctx.strokeRect(x + i * 11, y - 5, 11, 11);
        ctx.fillStyle = '#ffd54a'; ctx.beginPath(); ctx.arc(x + 70, y, 4, 0, TAU); ctx.fill(); break;
      case 'fountain': {
        const r = p.r;
        ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(x + 3, y + 3, r + 4, 0, TAU); ctx.fill();
        ctx.fillStyle = '#bdb6a8'; ctx.beginPath(); ctx.arc(x, y, r + 4, 0, TAU); ctx.fill();
        ctx.fillStyle = '#2f78ad'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(200,230,255,.5)'; ctx.lineWidth = 1.5;
        for (let i = 0; i < 2; i++) { const rr = ((time * 14 + i * r / 2) % r); ctx.globalAlpha = 1 - rr / r; ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.stroke(); }
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#cfc8ba'; ctx.beginPath(); ctx.arc(x, y, r * 0.22, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(235,248,255,.85)';
        for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + time, d = r * (0.3 + 0.25 * Math.abs(Math.sin(time * 3 + i))); ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 1.6, 0, TAU); ctx.fill(); }
        break;
      }
      case 'statue':
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x - 6, y - 6, 16, 16);
        ctx.fillStyle = '#a49d90'; ctx.fillRect(x - 8, y - 8, 16, 16); ctx.fillStyle = '#5f7a6c'; ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fill();
        ctx.fillStyle = '#7d9a8a'; ctx.beginPath(); ctx.arc(x - 1.5, y - 1.5, 2.5, 0, TAU); ctx.fill(); break;
      case 'flag': {
        const tz = 0.14, k = 1 + tz, tx = cam.x + (x - cam.x) * k, ty = cam.y + (y - cam.y) * k;
        ctx.strokeStyle = '#d0d0d0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.fillStyle = p.c; ctx.beginPath(); ctx.moveTo(tx, ty);
        for (let i = 0; i <= 4; i++) ctx.lineTo(tx + i * 4, ty + Math.sin(time * 6 + i) * 1.5);
        for (let i = 4; i >= 0; i--) ctx.lineTo(tx + i * 4, ty + 8 + Math.sin(time * 6 + i) * 1.5);
        ctx.fill(); break;
      }
      case 'hatch':
        ctx.save(); ctx.beginPath(); ctx.rect(x, y, p.w * T, p.h * T); ctx.clip();
        ctx.fillStyle = '#c62828'; ctx.fillRect(x, y, p.w * T, p.h * T); ctx.fillStyle = '#f0f0f0';
        for (let i = -4; i < p.w * 3 + 4; i++) { ctx.beginPath(); ctx.moveTo(x + i * 12, y); ctx.lineTo(x + i * 12 + 6, y); ctx.lineTo(x + i * 12 + 6 + p.h * T, y + p.h * T); ctx.lineTo(x + i * 12 + p.h * T, y + p.h * T); ctx.fill(); }
        ctx.restore(); break;
      case 'stalls':
        ctx.fillStyle = '#d8d4c8';
        for (let i = 0; i <= p.n; i++) {
          if (p.vert) ctx.fillRect(x - 0.6 * T, y + i * p.sp * T - 1, 1.2 * T, 2);
          else ctx.fillRect(x + i * p.sp * T - 1, y - 0.55 * T, 2, 1.1 * T);
        }
        break;
      case 'paint':
        ctx.fillStyle = p.c; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(p.text, x, y + 4); break;
      case 'busstop':
        ctx.save(); ctx.translate(x, y); ctx.rotate(p.a || 0);
        ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(-11, -2, 26, 9);
        ctx.fillStyle = '#5d7d96'; ctx.fillRect(-13, -4, 26, 8); ctx.fillStyle = '#9fc3d6'; ctx.fillRect(-11, -2, 22, 4);
        ctx.fillStyle = '#f2c230'; ctx.fillRect(15, -7, 4, 4);
        ctx.restore(); break;
      case 'flowers':
        ctx.fillStyle = '#4a3423'; ctx.beginPath(); ctx.ellipse(x, y, 22, 14, 0, 0, TAU); ctx.fill();
        for (let i = 0; i < 26; i++) {
          const h = (p.s * (i + 7) * 2654435761) >>> 0, a = (h % 628) / 100, d = (h >> 10) % 100 / 100;
          ctx.fillStyle = ['#e74c3c', '#f1c40f', '#ecf0f1', '#e84393', '#9b59b6'][h % 5];
          ctx.fillRect(x + Math.cos(a) * 19 * d - 1.5, y + Math.sin(a) * 11 * d - 1.5, 3, 3);
        }
        break;
    }
  }
}

// ---- sun, shading and night tint shared by buildings and trees
let NIGHT = 0;
const SUN = { x: 0.3, y: 0.55, z: 0.78, sx: 0, sy: -1, len: 1, on: false };
function updateSun() {
  const h = dayT * 24; NIGHT = darkness() / 0.8;
  if (h > 5.5 && h < 18.5) {
    const th = clamp((h - 6) / 12, 0, 1) * Math.PI, e = Math.max(0.16, Math.sin(th) * 1.05);
    let hx = Math.cos(th), hy = Math.sin(th) * 0.6 + 0.4; const n = Math.hypot(hx, hy); hx /= n; hy /= n;
    Object.assign(SUN, { x: hx * Math.cos(e), y: hy * Math.cos(e), z: Math.sin(e), sx: -hx, sy: -hy, len: Math.min(3, 1 / Math.tan(e)), on: true });
  } else Object.assign(SUN, { x: 0.3, y: 0.55, z: 0.78, on: false });
}
const lum = (nx, ny, nz) => 0.55 + 0.5 * Math.max(0, nx * SUN.x + ny * SUN.y + nz * SUN.z);
const rgbCache = new Map(), tintCache = new Map();
function tint(hex, f = 1) {
  const fq = Math.round(f * 40), nq = Math.round(NIGHT * 20), key = hex + fq + '|' + nq;
  let s = tintCache.get(key);
  if (s === undefined) {
    let c = rgbCache.get(hex);
    if (!c) { const n = parseInt(hex.slice(1), 16); c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; rgbCache.set(hex, c); }
    const ff = fq / 40, m = nq / 20 * 0.78, mix = (v, nv) => clamp(v * ff * (1 - m) + nv * m, 0, 255) | 0;
    s = `rgb(${mix(c[0], 6)},${mix(c[1], 10)},${mix(c[2], 32)})`;
    if (tintCache.size > 6000) tintCache.clear();
    tintCache.set(key, s);
  }
  return s;
}
function hull(pts) {
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  up.pop(); lo.pop(); return lo.concat(up);
}
// buildings and trees cast shadows that follow the sun through the day
// traffic signals on the four corners of each crossing; each head shows the N-S and E-W aspects
const SIG = ['#33e06a', '#ffbf2e', '#ff3b30'];
const sigCol = (n, g) => { const ph = lightPhase(n); return g ? (ph === 2 ? 0 : ph === 3 ? 1 : 2) : (ph === 0 ? 0 : ph === 1 ? 1 : 2); };
function forLights(v, fn) {
  for (const n of LIGHT_NODES) {
    if (n.x < v.x0 - 120 || n.x > v.x1 + 120 || n.y < v.y0 - 120 || n.y > v.y1 + 120) continue;
    if (!n.poles) n.poles = n.edges.map(e => { const [ux, uy] = n.dirs.get(e.id); return { x: n.x + ux * 74 + uy * 46, y: n.y + uy * 74 - ux * 46, g: n.grp.get(e.id) }; })
      .filter(p => tileAtP(p.x, p.y) === WALK);
    fn(n, n.poles);
  }
}
function drawSignals(v) {
  forLights(v, (n, poles) => {
    for (const p of poles) {
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(p.x - 3, p.y - 3, 9, 9);
      ctx.fillStyle = '#1d1d20'; ctx.fillRect(p.x - 4.5, p.y - 4.5, 9, 9);
      ctx.fillStyle = SIG[sigCol(n, p.g)]; ctx.beginPath(); ctx.arc(p.x, p.y, 2.8, 0, TAU); ctx.fill();
    }
  });
}
function drawShadows(v) {
  if (!SUN.on) return;
  const h = dayT * 24, a = 0.32 * (1 - NIGHT) * clamp(Math.min(h - 5.5, 18.5 - h), 0, 1);
  if (a < 0.02) return;
  const L = SUN.len * HC, p = new Path2D();
  for (const b of buildings) {
    const ox = SUN.sx * L * b.top, oy = SUN.sy * L * b.top;
    if (b.x + Math.min(0, ox) > v.x1 || b.x + b.w + Math.max(0, ox) < v.x0 || b.y + Math.min(0, oy) > v.y1 || b.y + b.h + Math.max(0, oy) < v.y0) continue;
    const i = b.canopy ? 6 : 0, x0 = b.x + i, y0 = b.y + i, x1 = b.x + b.w - i, y1 = b.y + b.h - i;
    // tall tiers and spires throw a narrower shadow than the base box
    const pts = b.canopy
      ? [[x0 + ox, y0 + oy], [x1 + ox, y0 + oy], [x1 + ox, y1 + oy], [x0 + ox, y1 + oy]]
      : [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0 + ox, y0 + oy], [x1 + ox, y0 + oy], [x1 + ox, y1 + oy], [x0 + ox, y1 + oy]];
    if (!b.canopy && (b.cap === 'hip' || b.dome || b.tiers)) {
      const bx = SUN.sx * L * b.ht, by = SUN.sy * L * b.ht;
      pts.splice(4, 4, [x0 + bx, y0 + by], [x1 + bx, y0 + by], [x1 + bx, y1 + by], [x0 + bx, y1 + by], [(x0 + x1) / 2 + ox, (y0 + y1) / 2 + oy]);
      if (b.tiers) for (const t of b.tiers) { const tx = SUN.sx * L * t.z, ty = SUN.sy * L * t.z; pts.push([x0 + t.i + tx, y0 + t.i + ty], [x1 - t.i + tx, y0 + t.i + ty], [x1 - t.i + tx, y1 - t.i + ty], [x0 + t.i + tx, y1 - t.i + ty]); }
    }
    const hp = hull(pts);
    p.moveTo(hp[0][0], hp[0][1]); for (let k = 1; k < hp.length; k++) p.lineTo(hp[k][0], hp[k][1]); p.closePath();
  }
  const tl = SUN.len * 0.5;
  for (const t of trees) {
    if (t.x < v.x0 - 80 || t.x > v.x1 + 80 || t.y < v.y0 - 80 || t.y > v.y1 + 80) continue;
    p.moveTo(t.x + SUN.sx * t.r * tl * 3 + t.r, t.y + SUN.sy * t.r * tl * 3);
    p.arc(t.x + SUN.sx * t.r * tl * 3, t.y + SUN.sy * t.r * tl * 3, t.r, 0, TAU);
  }
  ctx.fillStyle = `rgba(12,18,40,${a})`; ctx.fill(p);
}

// ---- buildings: extruded boxes with windows, roof caps, tiers, domes and spires
const WALLN = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const LIT = ['#ffd27a', '#ffe2a8', '#fff1c9', '#ffc46a'];
function drawBox(b, x0, y0, x1, y1, z0, z1, win, top) {
  const cx = cam.x, cy = cam.y, k0 = 1 + z0, k1 = 1 + z1;
  const C = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const vis = [cy < y0, cx > x1, cy > y1, cx < x0];
  for (let i = 0; i < 4; i++) {
    if (!vis[i]) continue;
    const j = (i + 1) & 3, ax = C[i][0], ay = C[i][1], bx = C[j][0], by = C[j][1];
    const A0x = cx + (ax - cx) * k0, A0y = cy + (ay - cy) * k0, B0x = cx + (bx - cx) * k0, B0y = cy + (by - cy) * k0;
    const A1x = cx + (ax - cx) * k1, A1y = cy + (ay - cy) * k1, B1x = cx + (bx - cx) * k1, B1y = cy + (by - cy) * k1;
    const L = lum(WALLN[i][0], WALLN[i][1], 0) * (i === 0 ? 0.9 : 1);
    ctx.fillStyle = tint(b.wall, L);
    ctx.beginPath(); ctx.moveTo(A0x, A0y); ctx.lineTo(B0x, B0y); ctx.lineTo(B1x, B1y); ctx.lineTo(A1x, A1y); ctx.closePath(); ctx.fill();
    // windows are quads in the wall's (u along, v up) coordinates
    const depth = Math.hypot(A1x - A0x, A1y - A0y), len = Math.hypot(bx - ax, by - ay);
    const P = (u, v) => { const ux0 = A0x + (B0x - A0x) * u, uy0 = A0y + (B0y - A0y) * u; return [ux0 + (A1x + (B1x - A1x) * u - ux0) * v, uy0 + (A1y + (B1y - A1y) * u - uy0) * v]; };
    const pd = new Path2D(), pl = new Path2D(), pe = new Path2D();
    const quad = (path, u0, u1, v0, v1) => { const a = P(u0, v0), b2 = P(u1, v0), c = P(u1, v1), d = P(u0, v1); path.moveTo(a[0], a[1]); path.lineTo(b2[0], b2[1]); path.lineTo(c[0], c[1]); path.lineTo(d[0], d[1]); path.closePath(); };
    if (z0 === 0 && depth > 3) quad(pe, 0, 1, 0, Math.min(0.3, 3 / depth)); // ambient occlusion at the base
    let nf = Math.max(1, Math.round((z1 - z0) / 0.042));
    const ws = win === 'bays' && i !== 2 ? 'grid' : win;
    const litP = NIGHT * (b.kind === 'church' ? 0.6 : 0.45), sd = b.sd + i * 7919;
    const lit = (f, c) => litP > 0.02 && ((Math.imul(sd ^ (f * 131 + c * 31337), 2654435761) >>> 0) % 1000) < litP * 1000;
    const grid = (sp, um, v0, v1, n = nf) => {
      if (depth < 7) return;
      n = Math.min(n, Math.floor(depth / 5)); if (n < 1) return;
      const nc = Math.max(1, Math.min(Math.floor(len / sp), Math.floor(len * k1 / 5)));
      for (let f = 0; f < n; f++) for (let c = 0; c < nc; c++) quad(lit(f, c) ? pl : pd, (c + um) / nc, (c + 1 - um) / nc, (f + v0) / n, (f + v1) / n);
    };
    let extra = null;
    if (ws === 'grid') grid(15, 0.28, 0.3, 0.78);
    else if (ws === 'ribbon') grid(12, 0.07, 0.2, 0.8);
    else if (ws === 'tall') grid(22, 0.4, 0.25, 0.8, 1);
    else if (ws === 'slit') grid(30, 0.4, 0.55, 0.85, 1);
    else if (ws === 'ware') {
      grid(24, 0.3, 0.72, 0.9, 1);
      if (depth > 6 && ((b.sd >> i) & 1)) { extra = '#4a4d52'; const pc = new Path2D(); quad(pc, 0.3, 0.62, 0, 0.62); ctx.fillStyle = tint(extra, L); ctx.fill(pc); }
    } else if (ws === 'bays') {
      const n = Math.max(1, Math.floor(len / 40)), pc = new Path2D();
      for (let c = 0; c < n; c++) quad(pc, (c + 0.12) / n, (c + 0.88) / n, 0, 0.66);
      ctx.fillStyle = tint('#d8d4ca', L); ctx.fill(pc);
      ctx.strokeStyle = tint('#9a968e', L); ctx.lineWidth = 1; ctx.stroke(pc);
    } else if (ws === 'columns') {
      if (depth > 4) {
        const nc = Math.max(2, Math.floor(len / 16)), pc = new Path2D();
        quad(pd, 0.02, 0.98, 0.05, 0.86);
        for (let c = 0; c < nc; c++) quad(pc, (c + 0.3) / nc, (c + 0.7) / nc, 0.03, 0.88);
        ctx.fillStyle = tint('#3a3530', L); ctx.fill(pd);
        ctx.fillStyle = tint('#f3eee3', L); ctx.fill(pc);
        ctx.fillStyle = tint('#000000', 1); ctx.globalAlpha = 0.2; ctx.fill(pe); ctx.globalAlpha = 1;
        continue;
      }
    }
    ctx.fillStyle = tint(b.style === 'glass' ? '#a8cde2' : b.kind === 'church' ? '#2c3a55' : '#28313d', b.style === 'glass' ? L * 0.95 : 1);
    ctx.fill(pd);
    if (litP > 0.02) {
      ctx.fillStyle = b.kind === 'church' ? '#e8a25a' : LIT[b.sd & 3]; ctx.globalAlpha = Math.min(1, NIGHT * (b.kind === 'church' ? 0.8 : 1.4)); ctx.fill(pl); ctx.globalAlpha = 1;
    } else { ctx.fill(pl); }
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fill(pe);
  }
}
const proj = (x, y, z) => { const k = 1 + z; return [cam.x + (x - cam.x) * k, cam.y + (y - cam.y) * k]; };
function polyFill(pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fill(); }
// sloped roofs: gable (ridge plus two triangular end walls) or hip (four slopes; a square hip is a spire)
function drawCap(b, x0, y0, x1, y1, e) {
  const ch = b.capH, r = e + ch, ax = (b.axis || (b.w >= b.h ? 'x' : 'y')) === 'x';
  // work in (u along the ridge, v across it), mapped back to x/y
  const U0 = ax ? x0 : y0, U1 = ax ? x1 : y1, V0 = ax ? y0 : x0, V1 = ax ? y1 : x1, Vm = (V0 + V1) / 2, half = (V1 - V0) / 2;
  const P = (u, v, z) => ax ? [u, v, z] : [v, u, z];
  const N = (nu, nv, nz) => ax ? [nu, nv, nz] : [nv, nu, nz];
  const faces = [];
  const slope = half / HC;
  if (b.cap === 'gable') {
    faces.push({ p: [P(U0, V0, e), P(U1, V0, e), P(U1, Vm, r), P(U0, Vm, r)], n: N(0, -ch, slope), c: b.roof });
    faces.push({ p: [P(U0, V1, e), P(U1, V1, e), P(U1, Vm, r), P(U0, Vm, r)], n: N(0, ch, slope), c: b.roof });
    faces.push({ p: [P(U0, V0, e), P(U0, V1, e), P(U0, Vm, r)], n: N(-1, 0, 0), c: b.wall, wall: true });
    faces.push({ p: [P(U1, V0, e), P(U1, V1, e), P(U1, Vm, r)], n: N(1, 0, 0), c: b.wall, wall: true });
  } else {
    const ua = Math.min(U0 + half, (U0 + U1) / 2), ub = Math.max(U1 - half, (U0 + U1) / 2);
    faces.push({ p: [P(U0, V0, e), P(U1, V0, e), P(ub, Vm, r), P(ua, Vm, r)], n: N(0, -ch, slope), c: b.roof });
    faces.push({ p: [P(U0, V1, e), P(U1, V1, e), P(ub, Vm, r), P(ua, Vm, r)], n: N(0, ch, slope), c: b.roof });
    faces.push({ p: [P(U0, V0, e), P(U0, V1, e), P(ua, Vm, r)], n: N(-ch, 0, (ua - U0) / HC), c: b.roof });
    faces.push({ p: [P(U1, V0, e), P(U1, V1, e), P(ub, Vm, r)], n: N(ch, 0, (U1 - ub) / HC), c: b.roof });
  }
  for (const f of faces) {
    let sx = 0, sy = 0; for (const q of f.p) { sx += q[0]; sy += q[1]; }
    f.d = d2(sx / f.p.length, sy / f.p.length, cam.x, cam.y);
    f.q = f.p.map(q => proj(q[0], q[1], q[2]));
    const m = Math.hypot(f.n[0], f.n[1], f.n[2]) || 1; f.L = lum(f.n[0] / m, f.n[1] / m, f.n[2] / m);
  }
  faces.sort((a, b2) => b2.d - a.d);
  for (const f of faces) {
    if (f.wall) {
      const [nx, ny] = f.n, wx = f.p[0][0], wy = f.p[0][1];
      if ((cam.x - wx) * nx + (cam.y - wy) * ny <= 0) continue; // back-facing end wall
    }
    ctx.fillStyle = tint(f.c, f.L); polyFill(f.q);
    if (!f.wall && f.q.length === 4) { // a few tile courses parallel to the eave
      ctx.strokeStyle = tint(f.c, f.L * 0.82); ctx.lineWidth = 1; ctx.beginPath();
      for (const t of [0.33, 0.66]) {
        const a = [lerp(f.q[0][0], f.q[3][0], t), lerp(f.q[0][1], f.q[3][1], t)], c = [lerp(f.q[1][0], f.q[2][0], t), lerp(f.q[1][1], f.q[2][1], t)];
        ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]);
      }
      ctx.stroke();
    }
  }
  if (b.cross) {
    const cxw = (x0 + x1) / 2, cyw = (y0 + y1) / 2, a = proj(cxw, cyw, r), t = proj(cxw, cyw, r + 0.07), m = proj(cxw, cyw, r + 0.05);
    ctx.strokeStyle = tint('#e0c060', 1.1); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(t[0], t[1]); ctx.moveTo(m[0] - 4, m[1]); ctx.lineTo(m[0] + 4, m[1]); ctx.stroke();
  }
}
function roofText(text, x, y, size, color) {
  ctx.font = `bold ${size}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = color; ctx.fillText(text, x, y); ctx.textBaseline = 'alphabetic';
}
const signSize = (t, rw, rh) => Math.min(Math.min(rw, rh) * 0.2, rw * 0.8 / (t.length * 0.75), 30);
function flatRoof(b, x0, y0, x1, y1, z, top) {
  const k = 1 + z, rx = cam.x + (x0 - cam.x) * k, ry = cam.y + (y0 - cam.y) * k, rw = (x1 - x0) * k, rh = (y1 - y0) * k;
  const L = lum(0, 0, 1) * 1.02, m = Math.min(rw, rh);
  if (b.style === 'glass') {
    ctx.fillStyle = tint(b.roof, L * 1.2); ctx.fillRect(rx, ry, rw, rh);
    ctx.fillStyle = tint(b.roof, L); ctx.fillRect(rx + 2 * k, ry + 2 * k, rw - 4 * k, rh - 4 * k);
  } else {
    ctx.fillStyle = tint(b.roof, L * 1.15); ctx.fillRect(rx, ry, rw, rh);
    ctx.fillStyle = tint(b.roof, L); ctx.fillRect(rx + 3 * k, ry + 3 * k, rw - 6 * k, rh - 6 * k);
  }
  if (!top) return;
  const sx = -SUN.sx * 3, sy = -SUN.sy * 3;
  if (b.style === 'ware') {
    ctx.fillStyle = tint(b.roof, L * 0.82);
    if (rw > rh) for (let x = rx + 6 * k; x < rx + rw - 4; x += 7 * k) ctx.fillRect(x, ry + 3 * k, 1.5 * k, rh - 6 * k);
    else for (let y = ry + 6 * k; y < ry + rh - 4; y += 7 * k) ctx.fillRect(rx + 3 * k, y, rw - 6 * k, 1.5 * k);
    ctx.fillStyle = tint('#a9c9da', L);
    for (let i = 1; i < 3; i++) rw > rh ? ctx.fillRect(rx + rw * i / 3 - 4 * k, ry + rh * 0.3, 8 * k, rh * 0.4) : ctx.fillRect(rx + rw * 0.3, ry + rh * i / 3 - 4 * k, rw * 0.4, 8 * k);
  }
  for (const [u, w2, uw, uh] of b.det) {
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(rx + u * rw - sx, ry + w2 * rh - sy, uw * rw, uh * rh);
    ctx.fillStyle = tint(b.roof, L * 1.32); ctx.fillRect(rx + u * rw, ry + w2 * rh, uw * rw, uh * rh);
    ctx.fillStyle = tint(b.roof, L * 0.9); ctx.beginPath(); ctx.arc(rx + (u + uw / 2) * rw, ry + (w2 + uh / 2) * rh, Math.min(uw * rw, uh * rh) * 0.3, 0, TAU); ctx.fill();
  }
  if (b.tank) {
    const tx = rx + rw * 0.74, ty = ry + rh * 0.3, tr = m * 0.13;
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.arc(tx - sx * 2, ty - sy * 2, tr, 0, TAU); ctx.fill();
    ctx.fillStyle = tint('#6b4a32', L); ctx.beginPath(); ctx.arc(tx, ty, tr, 0, TAU); ctx.fill();
    ctx.fillStyle = tint('#836046', L); ctx.beginPath(); ctx.arc(tx, ty, tr * 0.7, 0, TAU); ctx.fill();
  }
  if (b.solar) {
    ctx.fillStyle = tint('#22355a', L); ctx.strokeStyle = tint('#5a7aa8', L); ctx.lineWidth = 1;
    const n = Math.floor(rw / (14 * k));
    for (let i = 0; i < n; i++) for (const yy of [0.18, 0.55]) { ctx.fillRect(rx + 6 * k + i * 14 * k, ry + rh * yy, 11 * k, rh * 0.28); ctx.strokeRect(rx + 6 * k + i * 14 * k, ry + rh * yy, 11 * k, rh * 0.28); }
  }
  if (b.heli) {
    const hx = rx + rw * (b.kind === 'police' ? 0.72 : 0.5), hy = ry + rh * 0.55, hr = m * 0.32;
    ctx.fillStyle = tint('#3b3f45', L); ctx.beginPath(); ctx.arc(hx, hy, hr, 0, TAU); ctx.fill();
    ctx.strokeStyle = tint('#f2f2f2', L); ctx.lineWidth = 2 * k; ctx.beginPath(); ctx.arc(hx, hy, hr * 0.82, 0, TAU); ctx.stroke();
    roofText('H', hx, hy + 1, hr * 1.0, tint('#f2f2f2', L));
  }
  if (b.kind === 'cross') {
    const cx2 = rx + rw / 2, cy2 = ry + rh / 2, s = m * 0.18;
    ctx.fillStyle = tint('#d62828', L); ctx.fillRect(cx2 - s * 1.5, cy2 - s / 2, s * 3, s); ctx.fillRect(cx2 - s / 2, cy2 - s * 1.5, s, s * 3);
  }
  if (b.kind === 'police') { ctx.fillStyle = tint('#f2f2f2', L); roofText('POLICE', rx + rw * 0.32, ry + rh * 0.3, m * 0.2, tint('#f2f2f2', L)); ctx.fillStyle = tint('#2c4a9a', L); ctx.fillRect(rx + 3 * k, ry + rh - 8 * k, rw - 6 * k, 4 * k); }
  if (b.kind === 'fire') { roofText('7', rx + rw * 0.5, ry + rh * 0.5, m * 0.55, tint('#ffd54a', L)); }
  if (b.kind === 'stadium') {
    const ins = 22 * k;
    ctx.fillStyle = tint('#6c7178', L); for (let i = 0; i < 5; i++) ctx.fillRect(rx + 4 * k * i, ry + 4 * k * i, rw - 8 * k * i, rh - 8 * k * i);
    ctx.fillStyle = tint('#7a8088', L); for (let i = 0; i < 5; i += 2) { ctx.fillRect(rx + 4 * k * i, ry + 4 * k * i, rw - 8 * k * i, 2 * k); }
    ctx.fillStyle = tint('#3f8f3a', L); ctx.fillRect(rx + ins, ry + ins, rw - 2 * ins, rh - 2 * ins);
    ctx.fillStyle = tint('#47a041', L); for (let i = 0; i < 8; i += 2) ctx.fillRect(rx + ins + (rw - 2 * ins) * i / 8, ry + ins, (rw - 2 * ins) / 8, rh - 2 * ins);
    ctx.strokeStyle = tint('#e8f5e9', L); ctx.lineWidth = 2; ctx.strokeRect(rx + ins + 8, ry + ins + 8, rw - 2 * ins - 16, rh - 2 * ins - 16);
    ctx.beginPath(); ctx.moveTo(rx + rw / 2, ry + ins + 8); ctx.lineTo(rx + rw / 2, ry + rh - ins - 8); ctx.stroke();
    ctx.beginPath(); ctx.arc(rx + rw / 2, ry + rh / 2, 22 * k, 0, TAU); ctx.stroke();
  }
  if (b.sign && rw > 30) roofText(b.sign, rx + rw / 2, ry + rh / 2, signSize(b.sign, rw, rh), tint(b.neon || '#ffffff', 0.85));
  b._r = [rx, ry, rw, rh, k];
}
function drawDome(b) {
  const cxw = b.x + b.w / 2, cyw = b.y + b.h / 2, d = b.dome, e = b.ht;
  // drum
  const a = proj(cxw, cyw, e), t = proj(cxw, cyw, e + 0.03);
  ctx.fillStyle = tint(b.wall, 0.85); ctx.beginPath(); ctx.arc(a[0], a[1], d.r * (1 + e), 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.arc(t[0], t[1], d.r * (1 + e + 0.03), 0, TAU); ctx.fill();
  for (let i = 0; i <= 7; i++) {
    const th = i / 8 * Math.PI / 2, z = e + 0.03 + d.h * Math.sin(th), rr = d.r * Math.cos(th) * (1 + z), c = proj(cxw + SUN.x * d.r * 0.15 * i / 7, cyw + SUN.y * d.r * 0.15 * i / 7, z);
    ctx.fillStyle = tint(d.c, 0.7 + 0.08 * i); ctx.beginPath(); ctx.arc(c[0], c[1], rr, 0, TAU); ctx.fill();
  }
  const l = proj(cxw, cyw, e + 0.03 + d.h + 0.02);
  ctx.fillStyle = tint(b.wall, 1.05); ctx.beginPath(); ctx.arc(l[0], l[1], 5 * (1 + e), 0, TAU); ctx.fill();
}
function drawCanopy(b) {
  const z = b.ht, k = 1 + z, x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h;
  ctx.strokeStyle = tint('#bbbbbb', 1); ctx.lineWidth = 3;
  ctx.beginPath();
  for (const [px, py] of [[x0 + 14, y0 + 14], [x1 - 14, y0 + 14], [x1 - 14, y1 - 14], [x0 + 14, y1 - 14]]) { const t = proj(px, py, z); ctx.moveTo(px, py); ctx.lineTo(t[0], t[1]); }
  ctx.stroke();
  const rx = cam.x + (x0 - cam.x) * k, ry = cam.y + (y0 - cam.y) * k, rw = b.w * k, rh = b.h * k, L = lum(0, 0, 1);
  ctx.fillStyle = tint(b.wall, L); ctx.fillRect(rx, ry, rw, rh);
  ctx.fillStyle = tint(b.roof, L); ctx.fillRect(rx + 5 * k, ry + 5 * k, rw - 10 * k, rh - 10 * k);
  roofText('QUBIT', rx + rw / 2, ry + rh / 2, rh * 0.32, tint('#d32f2f', L));
}
function drawBuildings(v) {
  const cx = cam.x, cy = cam.y, list = [];
  for (const b of buildings) if (b.x < v.x1 + 260 && b.x + b.w > v.x0 - 260 && b.y < v.y1 + 260 && b.y + b.h > v.y0 - 260) list.push(b);
  list.sort((a, b) => d2(b.x + b.w / 2, b.y + b.h / 2, cx, cy) - d2(a.x + a.w / 2, a.y + a.h / 2, cx, cy));
  const glow = [];
  for (const b of list) {
    if (b.canopy) { drawCanopy(b); continue; }
    const x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h;
    drawBox(b, x0, y0, x1, y1, 0, b.ht, b.win, !b.tiers);
    if (b.cap) drawCap(b, x0, y0, x1, y1, b.ht);
    else flatRoof(b, x0, y0, x1, y1, b.ht, !b.tiers);
    let z = b.ht;
    if (b.tiers) b.tiers.forEach((t, i) => {
      const last = i === b.tiers.length - 1;
      drawBox(b, x0 + t.i, y0 + t.i, x1 - t.i, y1 - t.i, z, t.z, b.win, last);
      flatRoof(b, x0 + t.i, y0 + t.i, x1 - t.i, y1 - t.i, t.z, last); z = t.z;
    });
    if (b.dome) drawDome(b);
    if (b.chimney) {
      const cxw = x0 + b.w * 0.72, cyw = y0 + b.h * 0.3;
      drawBox(b, cxw - 4, cyw - 4, cxw + 4, cyw + 4, b.ht, b.ht + b.capH * 0.95, 'none');
      const t = proj(cxw - 4, cyw - 4, b.ht + b.capH * 0.95), k = 1 + b.ht + b.capH * 0.95;
      ctx.fillStyle = tint('#3a2a24', 1); ctx.fillRect(t[0], t[1], 8 * k, 8 * k);
    }
    if (b.antenna) {
      const [fx, fy] = b.antXY || [0.5, 0.5], cxw = x0 + b.w * fx, cyw = y0 + b.h * fy, a = proj(cxw, cyw, z), t = proj(cxw, cyw, z + b.antenna);
      ctx.strokeStyle = tint('#9aa0a6', 1); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(t[0], t[1]); ctx.stroke();
      if (Math.sin(time * 3 + b.sd) > 0.3) glow.push([t[0], t[1], 3, '#ff3030', 14]);
    }
    if (NIGHT > 0.1 && (b.neon || b.sign) && b._r) {
      const [rx, ry, rw, rh, k] = b._r;
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = NIGHT;
      if (b.neon) { ctx.strokeStyle = b.neon; ctx.lineWidth = 6 * k; ctx.globalAlpha = NIGHT * 0.25; ctx.strokeRect(rx + 4 * k, ry + 4 * k, rw - 8 * k, rh - 8 * k); ctx.globalAlpha = NIGHT; ctx.lineWidth = 1.5 * k; ctx.strokeRect(rx + 4 * k, ry + 4 * k, rw - 8 * k, rh - 8 * k); }
      if (b.sign && rw > 30) roofText(b.sign, rx + rw / 2, ry + rh / 2, signSize(b.sign, rw, rh), b.neon || '#ffffff');
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }
  }
  if (glow.length) {
    ctx.globalCompositeOperation = 'lighter';
    for (const [x, y, r, c, g] of glow) { ctx.fillStyle = c; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(x, y, g, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
    ctx.globalCompositeOperation = 'source-over';
  }
}
function drawTrees(v) {
  for (const t of trees) {
    if (t.x < v.x0 - 60 || t.x > v.x1 + 60 || t.y < v.y0 - 60 || t.y > v.y1 + 60) continue;
    const x = cam.x + (t.x - cam.x) * 1.12, y = cam.y + (t.y - cam.y) * 1.12, ox = SUN.x * t.r * 0.3, oy = SUN.y * t.r * 0.3;
    ctx.fillStyle = tint('#24521f', 1); ctx.beginPath(); ctx.arc(x, y, t.r, 0, TAU); ctx.fill();
    ctx.fillStyle = tint('#2f6a29', 1); ctx.beginPath(); ctx.arc(x + ox * 0.5, y + oy * 0.5, t.r * 0.8, 0, TAU); ctx.fill();
    ctx.fillStyle = tint('#3f8636', 1); ctx.beginPath(); ctx.arc(x + ox, y + oy, t.r * 0.5, 0, TAU); ctx.fill();
  }
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
    forLights(v, (n, poles) => { for (const p of poles) { ctx.fillStyle = SIG[sigCol(n, p.g)]; ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, TAU); ctx.fill(); } });
    const on = Math.sin(time * 18) > 0;
    for (const c of cars) if ((c.chase || c.job) && vis(c.x, c.y, 40)) { ctx.fillStyle = on ? 'rgba(255,40,40,.4)' : 'rgba(40,90,255,.4)'; ctx.beginPath(); ctx.arc(c.x, c.y, 34, 0, TAU); ctx.fill(); }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
}
function drawWorld() {
  const sx = (Math.random() - 0.5) * shake * 10, sy = (Math.random() - 0.5) * shake * 10;
  ctx.setTransform(DPR * cam.zoom, 0, 0, DPR * cam.zoom, DPR * (W / 2 - cam.x * cam.zoom + sx), DPR * (H / 2 - cam.y * cam.zoom + sy));
  const v = viewRect(8);
  updateSun();
  drawGround(v);
  drawProps(v);
  drawSignals(v);
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
  drawShadows(v);
  drawLighting(v);
  drawBuildings(v);
  drawTrees(v);
  drawParts(true);
  if (flight.on) drawPlane(flight.x, (AIRPORT.ry0 + AIRPORT.ry1) / 2, 0, flight.alt);
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
  grade();
}
// golden-hour tint and a soft vignette, in screen space
const vignette = document.createElement('canvas');
function vignetteFor(w, h) { // rendered at screen size, so drawing it needs no scaling
  if (vignette.width !== w || vignette.height !== h) {
    vignette.width = w; vignette.height = h;
    const g = vignette.getContext('2d'), r = Math.hypot(w, h) / 2;
    const gr = g.createRadialGradient(w / 2, h / 2, r * 0.45, w / 2, h / 2, r);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.4)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }
  return vignette;
}
function grade() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const h = dayT * 24, dusk = Math.max(0, 1 - Math.abs(h - 18.2) / 1.5) + Math.max(0, 1 - Math.abs(h - 6.3) / 1.3);
  if (dusk > 0.01) { ctx.fillStyle = `rgba(255,128,48,${0.12 * dusk})`; ctx.fillRect(0, 0, W, H); }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(vignetteFor(cv.width, cv.height), 0, 0);
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
    txt(streetName(pp().x, pp().y) || placeName(pp().x, pp().y), mx, my + sz + 16, 12, '#ddd');
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
  const start = tileCenter(findTileNear(40, 30, ROAD));
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
window.__gridlock = { map, MW, buildings, redStop, lightPhase, NODES, EDGES, LANES, LIGHT_NODES, BUS_STOPS, SITES, XW, XE, nearestLanePt, get time() { return time; }, player, Q, belief, get cars() { return cars; }, get peds() { return peds; }, get state() { return state; }, get heat() { return heat; }, set heat(v) { heat = v; }, get mission() { return mission; }, get lab() { return lab; }, get dayT() { return dayT; }, set dayT(v) { dayT = v; },
  newGame, startLab, setupLesson, makeCar, superpose, collapse, tunnel, startMission, bb84, keys, pressed, labFlags: () => labFlags, arcProg: () => arcProg };
})();
