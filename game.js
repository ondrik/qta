// Quant Theft Auto — a lightweight top-down open-city crime sandbox
// with quantum-flavoured mechanics. Plain canvas + WebAudio, no dependencies.
'use strict';
(() => {
// ============================================================ canvas
const cv = document.getElementById('c');
let ctx = cv.getContext('2d'); // reassigned briefly while ground chunks are rendered
let W = 0, H = 0, DPR = 1, QCAP = 2; // (QCAP: at most this many pixels to a CSS pixel; lowered on a slow machine, see qualTick)
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2, QCAP);
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
const hash3 = (x, y, s) => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
// smooth value noise over the plane (not tiling), used for the shape of the countryside
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  const A = hash3(xi, yi, s), B = hash3(xi + 1, yi, s), C = hash3(xi, yi + 1, s), D = hash3(xi + 1, yi + 1, s);
  return A + (B - A) * su + (C - A) * sv + (A - B - C + D) * su * sv;
}
function fbm2(x, y, s, oct = 3) { let t = 0, a = 1, n = 0; for (let o = 0; o < oct; o++, a *= 0.5, x *= 2.03, y *= 2.03) { t += a * vnoise(x, y, s + o * 131); n += a; } return t / n; }
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function rrect(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  ctx.fill();
}

// ============================================================ world
// The island: Quantum City in the north-west corner (tiles 0..99), farmland, a lake, a village, a desert with a
// casino town, a forested mountain, and a tropical coast with a beach town around it.
// Two maps: the island (the default) and inner Brno (brno5: about 5 m a tile, with every street and the real buildings;
// its data comes in brno5_data.js, which index.html loads only for that map). The title screen switches between them
// by reloading the page. (Brno at 15 m a tile, the 'brno' map, is gone: asking for it opens inner Brno.)
const MAP_ID = (() => {
  try {
    const q = new URLSearchParams(location.search).get('map'), m = ['brno', 'island', 'brno5'].includes(q) ? q : localStorage.getItem('qta.map');
    return (m === 'brno5' || m === 'brno') && window.BRNO5_DATA ? 'brno5' : 'island';
  } catch (e) { return 'island'; }
})();
const B5 = MAP_ID === 'brno5', BRNO = B5; // (BRNO: the Brno map at all; B5: its 5 m tiles. They are one map now)
const T = 32, MW = B5 ? window.BRNO5_DATA.mw : 240, MH = B5 ? window.BRNO5_DATA.mh : 208; // tiles
const BK = B5 ? 6 : 1; // Brno's hand-placed coordinates and sizes below are given at 30 m a tile
// On the island the city keeps tiles [0, CW) x [0, CH) with its own look; Brno is built entirely from the general
// terrain-and-districts machinery, so it has no such special corner.
const CW = BRNO ? 0 : 100, CH = BRNO ? 0 : 100;
// Brno is built from OpenStreetMap data (© OpenStreetMap contributors, ODbL): the streets with their names, the rivers,
// railways, land use and district names, projected onto the tiles (see tools/brno5). lc: land use as runs (a class
// digit, then the run length in two base-36 digits).
const BRNO_DATA = B5 ? window.BRNO5_DATA : null;
const GEO = B5 ? BRNO_DATA.bbox : [0, 1, 0, 1]; // west, east, south, north
const geo = (lat, lon) => [(lon - GEO[0]) / (GEO[1] - GEO[0]) * MW, (GEO[3] - lat) / (GEO[3] - GEO[2]) * MH]; // latitude/longitude to tiles
const inMap = (lat, lon) => { const [x, y] = geo(lat, lon); return x > 4 && y > 4 && x < MW - 4 && y < MH - 4; };
const LC_OPEN = 0, LC_FOREST = 1, LC_FARM = 2, LC_VINE = 3, LC_URBAN = 4, LC_INDUS = 5, LC_GREEN = 6, LC_WATER = 7, LC_AIR = 8;
const LC_PLAZA = 9, LC_LOT = 10, LC_RAIL = 11, LC_PITCH = 12; // (the detailed map's squares, car parks, railway land and sports grounds)
const LCG = new Uint8Array(MW * MH); // Brno's land use per tile
if (BRNO) { const r = BRNO_DATA.lc; for (let i = 0, k = 0; i < r.length; i += 3) { const c = parseInt(r[i], 36), n = parseInt(r.substr(i + 1, 2), 36); LCG.fill(c, k, k + n); k += n; } }
const isUrbanT = k => LCG[k] === LC_URBAN || LCG[k] === LC_INDUS || LCG[k] >= LC_PLAZA;
const inCity = (tx, ty) => tx < CW && ty < CH;
const ROAD = 0, WALK = 1, BUILD = 2, GRASS = 3, WATER = 4, PLAZA = 5, SAND = 6, FIELD = 7, ROCK = 8;
const map = new Uint8Array(MW * MH);
const tile = (tx, ty) => (tx < 0 || ty < 0 || tx >= MW || ty >= MH) ? WATER : map[ty * MW + tx];
const tileAtP = (x, y) => tile(Math.floor(x / T), Math.floor(y / T));
const solidT = t => t === BUILD || t === WATER || t === ROCK;
// the detailed map's buildings are real outlines at any angle: a tile whose middle is inside one is BUILD (GU keeps the
// ground it hides), and on a tile an outline crosses (PE) the outline itself decides, point by point
const GU = B5 ? new Uint8Array(MW * MH) : null, PE = B5 ? new Int32Array(MW * MH).fill(-1) : null, PEL = [], PIECES = [];
function inRings(R, x, y) { // even-odd over all the rings (courtyards are holes), each a flat [x0, y0, x1, y1, ...]
  let c = false;
  for (const r of R) for (let i = 0, n = r.length, j = n - 2; i < n; j = i, i += 2) {
    const yi = r[i + 1], yj = r[j + 1];
    if ((yi > y) !== (yj > y) && x < r[i] + (y - yi) * (r[j] - r[i]) / (yj - yi)) c = !c;
  }
  return c;
}
const solidAt = (x, y) => {
  if (PE) {
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    if (tx >= 0 && ty >= 0 && tx < MW && ty < MH) {
      const k = ty * MW + tx, j = PE[k];
      if (j >= 0) { for (const p of PEL[j]) if (inRings(PIECES[p].wr, x, y)) return true; const t = map[k]; return solidT(t === BUILD ? (GU[k] ? GU[k] - 1 : BUILD) : t); } // (outside the outlines: the ground the tile keeps, GU - 1)
    }
  }
  return solidT(tileAtP(x, y));
};
const circleSolid = (x, y, r) => solidAt(x - r, y - r) || solidAt(x + r, y - r) || solidAt(x - r, y + r) || solidAt(x + r, y + r);
const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1]; // E S W N

// districts and regions: kind 'city' (busy), 'town' or 'open' (countryside); woods/fields/beach/flowers say what grows there
const B_STYLE = { 'Staré Město': 'old', Veveří: 'tenement', Ponava: 'tenement', 'Královo Pole': 'tenement', Zábrdovice: 'tenement', Trnitá: 'tenement',
  Štýřice: 'tenement', 'Staré Brno': 'tenement', Husovice: 'tenement', Židenice: 'tenement', Žabovřesky: 'tenement', 'Černá Pole': 'villa', Stránice: 'villa',
  Pisárky: 'villa', Jundrov: 'villa', 'Žlutý kopec': 'villa', 'Kamenná kolonie': 'villa', 'Divišova čtvrť': 'villa', 'Štefánikova čtvrť': 'villa', Juliánov: 'villa',
  Sadová: 'villa', Komín: 'villa', Medlánky: 'villa', Lesná: 'panel', Bystrc: 'panel', Bohunice: 'panel', 'Nový Lískovec': 'panel', 'Starý Lískovec': 'panel',
  Kohoutovice: 'panel', Vinohrady: 'panel', Líšeň: 'panel', 'Na újezdech': 'panel', 'Horní Heršpice': 'industrial', 'Dolní Heršpice': 'industrial',
  Komárov: 'industrial', Slatina: 'industrial', Černovice: 'tenement', Maloměřice: 'tenement' };
const DISTRICTS = BRNO ? BRNO_DATA.places.map(([name]) => ({ name, kind: B_STYLE[name] ? 'city' : 'town', style: B_STYLE[name] || 'village' })).concat([
  { name: 'Brněnská přehrada', kind: 'open' }]) : [
  { name: 'Harbor Row', kind: 'city' }, { name: 'Midtown', kind: 'city' }, { name: 'Old Quarter', kind: 'city' }, { name: 'Neon Heights', kind: 'city' },
  { name: 'Harvest Valley', kind: 'open', fields: true, flowers: true }, { name: "Bell's Crossing", kind: 'town' }, { name: 'Las Ondas', kind: 'town' }, { name: 'Vacuum Flats', kind: 'open' },
  { name: 'Coral Bay', kind: 'town', beach: true }, { name: 'Palm Coast', kind: 'open', beach: true }, { name: 'Hilbert Woods', kind: 'open', woods: true }, { name: 'Mount Eigen', kind: 'open', woods: true },
];
const B_ = Object.fromEntries(DISTRICTS.map((d, i) => [d.name, i])); // region index by name (used by the Brno map)
const R_FARM = 4, R_VILLAGE = 5, R_ONDAS = 6, R_DESERT = 7, R_CORAL = 8, R_COAST = 9, R_WOODS = 10, R_MOUNT = 11;
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
// The Copper River flows out of Lake Bloch, winds through the middle of the city and into the sea (tile units)
const RIVER = catmull([[-3, 40], [12, 38], [26, 44], [40, 48], [50, 46], [62, 41], [74, 40], [86, 45], [100, 47], [110, 50], [118, 54], [125, 57]], 0.25);
const RIVER_HW = 3.4, RIVER_X1 = 124;
const RIVER_LUT = (() => { // y of the river every 1/8 tile, so riverY is a lookup
  const n = (RIVER_X1 + 3) * 8 + 2, out = new Float32Array(n);
  for (let k = 0, i = 1; k < n; k++) {
    const x = -3 + k / 8; while (i < RIVER.length - 1 && RIVER[i][0] < x) i++;
    const a = RIVER[i - 1], b = RIVER[i]; out[k] = a[1] + (b[1] - a[1]) * clamp((x - a[0]) / ((b[0] - a[0]) || 1), 0, 1);
  }
  return out;
})();
function riverY(x) { const f = (clamp(x, -3, RIVER_X1) + 3) * 8, k = Math.min(RIVER_LUT.length - 2, f | 0), t = f - k; return RIVER_LUT[k] + (RIVER_LUT[k + 1] - RIVER_LUT[k]) * t; }
// towns have pavements and blocks of buildings; everywhere else in the countryside is open land
const TOWNS = BRNO ? [] : [ // (Brno's built-up land comes from OpenStreetMap instead)
  { reg: R_VILLAGE, x0: 138, y0: 59, x1: 162, y1: 83 },
  { reg: R_ONDAS, x0: 184, y0: 24, x1: 226, y1: 84 },
  { reg: R_CORAL, x0: 120, y0: 158, x1: 184, y1: MH - 1, beach: true }, // the beach is part of the town; buildings stop at Palm Drive
];
const REGB = new Uint8Array(MW * MH); // Brno: the nearest district name to every tile
if (BRNO) { // (by 8 x 8 cells: only the places that can be nearest to some tile of a cell are tried for its tiles)
  const PL = BRNO_DATA.places, C = 8;
  for (let cy = 0; cy < MH; cy += C) for (let cx = 0; cx < MW; cx += C) {
    const mx = cx + C / 2, my = cy + C / 2, ds = PL.map(([, x, y]) => Math.hypot(x - mx, y - my)), d0 = Math.min(...ds), cand = [];
    for (let i = 0; i < PL.length; i++) if (ds[i] <= d0 + C * 1.5) cand.push(i);
    if (cand.length === 1) { for (let ty = cy; ty < Math.min(MH, cy + C); ty++) REGB.fill(cand[0], ty * MW + cx, ty * MW + Math.min(MW, cx + C)); continue; } // (one name near: the whole cell is its)
    for (let ty = cy; ty < Math.min(MH, cy + C); ty++) for (let tx = cx; tx < Math.min(MW, cx + C); tx++) {
      let b = cand[0], bd = 1e9;
      for (const i of cand) { const d = (PL[i][1] - tx - 0.5) ** 2 + (PL[i][2] - ty - 0.5) ** 2; if (d < bd) { bd = d; b = i; } }
      REGB[ty * MW + tx] = b;
    }
  }
}
const townAt = BRNO ? (tx, ty) => { if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return undefined; const k = ty * MW + tx; return isUrbanT(k) ? { reg: REGB[k] } : undefined; }
  : (tx, ty) => TOWNS.find(t => tx >= t.x0 && tx <= t.x1 && ty >= t.y0 && ty <= t.y1);
const REG = new Uint8Array(MW * MH); // the district or region of every tile
const districtAt = (x, y) => { const tx = Math.floor(x / T), ty = Math.floor(y / T); return !(tx >= 0 && ty >= 0 && tx < MW && ty < MH) ? 0 : REG[ty * MW + tx]; }; // (NaN too)

// ---- the countryside's shape: smooth fields (in tile units) sampled once at every tile corner. Tile types come
// from the tile centres, and the ground renderer interpolates the very same fields, so what you see is what you hit.
const PEAK = { x: 50, y: 147, r: 27 }; // Mount Eigen
const LAKES = [{ x: 129, y: 57, rx: 9, ry: 6.5, name: 'Lake Bloch' }, { x: 88, y: 115.5, rx: 4.6, ry: 3.2, name: 'Pine Lake' }];
const MESAS = [[182, 108, 6], [200, 138, 5], [215, 124, 3.5], [181, 50, 3]];
const coastS = x => 11 + 12 * (fbm2(x * 0.035, 9.1, 37) - 0.5); // how far the south coast lies from the map edge
const coastY = x => MH - coastS(x);
const palmY = x => { let t = 0; for (let k = -12; k <= 12; k += 3) t += coastY(x + k); return t / 9 - 8; }; // Palm Drive follows the beach (smoothly) in Coral Bay
function seaDist(x, y) { // > 0 on land: roughly the distance to the shore, in tiles
  const n = x < CW ? 1 : 1 + sstep(CW, CW + 16, x) * (1.5 + 4 * fbm2(x * 0.06, 3.1, 31));
  const w = y < CH ? 1 : 1 + sstep(CH, CH + 16, y) * (2 + 5 * fbm2(5.3, y * 0.06, 33));
  const e = 3 + 6 * fbm2(7.7, y * 0.05, 35);
  return Math.min(y - n, x - w, MW - x - e, MH - y - coastS(x));
}
const desertW = (x, y) => sstep(166, 180, x + 18 * (fbm2(x * 0.03, y * 0.03, 41) - 0.5)) * (1 - sstep(150, 164, y + 18 * (fbm2(x * 0.03, y * 0.03, 43) - 0.5)));
const tropW = (x, y) => sstep(102, 118, x) * sstep(MH - 60, MH - 46, y + 16 * (fbm2(x * 0.04, y * 0.04, 45) - 0.5));
const woodW = (x, y) => (1 - sstep(102, 116, x + 16 * (fbm2(x * 0.04, y * 0.04, 47) - 0.5))) * sstep(CH + 1, CH + 8, y + 6 * (fbm2(x * 0.05, y * 0.05, 49) - 0.5));
function mountH(x, y) {
  const d = Math.hypot(x - PEAK.x, y - PEAK.y) / PEAK.r; if (d >= 1) return 0;
  const b = 1 - d * d;
  return b ** 1.4 * (0.8 + 0.4 * fbm2(x * 0.07, y * 0.07, 61)) + 0.22 * b * (1 - Math.abs(2 * fbm2(x * 0.045, y * 0.045, 63) - 1));
}
function mesaV(x, y) { // > 0 on a mesa (a flat-topped rock with cliffs all round)
  let v = -9;
  for (const [mx, my, mr] of MESAS) { const d = Math.hypot(x - mx, y - my); if (d < mr + 4) v = Math.max(v, mr - d * (1 + 0.5 * (fbm2(x * 0.3, y * 0.3, 65) - 0.5))); }
  return v;
}
const GW = MW + 1, GH = MH + 1;
// water, rock, desert sand, beach sand, forest floor, dry grass, snow, hill shading; then the region weights
// (inner Brno has no rock, sand, snow, dry grass or desert, and draws its own water and woods: those fields are one shared
// array of -9, or of 0, to save memory on its big grid)
const F = {}; {
  const NIL = B5 && new Float32Array(GW * GH).fill(-9), ZERO = B5 && new Float32Array(GW * GH);
  for (const k of ['wa', 'ro', 'sd', 'sb', 'fo', 'dr', 'sn', 'sh', 'dw', 'tw', 'ww', 'mh'])
    F[k] = B5 && ['ro', 'sd', 'sb', 'dr', 'sn'].includes(k) ? NIL : B5 && ['dw', 'tw', 'ww'].includes(k) ? ZERO : new Float32Array(GW * GH);
}
function terrainIsland() {
  const el = new Float32Array(GW * GH);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const i = y * GW + x;
    if (x < CW - 2 && y < CH - 2) { for (const k of ['wa', 'ro', 'sd', 'sb', 'fo', 'dr', 'sn']) F[k][i] = -9; continue; } // the city draws itself
    const sea = seaDist(x, y), dw = desertW(x, y), tw = tropW(x, y), ww = woodW(x, y), mh = ww > 0.01 ? mountH(x, y) : 0;
    let lake = -9;
    for (const L of LAKES) if (Math.abs(x - L.x) < L.rx + 3 && Math.abs(y - L.y) < L.ry + 3) lake = Math.max(lake, (1 - Math.hypot((x - L.x) / L.rx, (y - L.y) / L.ry)) * Math.min(L.rx, L.ry) + 1.2 * (fbm2(x * 0.2, y * 0.2, 67) - 0.5));
    const river = x >= CW - 3 && x <= RIVER_X1 + 1 ? RIVER_HW - Math.abs(y - riverY(x)) : -9;
    const mesa = mesaV(x, y), n1 = fbm2(x * 0.22, y * 0.22, 51);
    F.wa[i] = Math.max(-sea, lake, river);
    F.ro[i] = Math.max((mh - 0.66) * 8 + 2 * (n1 - 0.5), mesa, dw > 0.05 ? (fbm2(x * 0.25, y * 0.25, 53) - 0.74) * 14 - (1 - dw) * 6 : -9); // crags, mesas, desert boulders
    F.sd[i] = (dw - 0.5) * 6 + 2 * (fbm2(x * 0.12, y * 0.12, 55) - 0.5);
    F.sb[i] = 1.4 + 4 * Math.max(tw, dw) - sea + 0.8 * (n1 - 0.5);
    F.fo[i] = (ww - 0.5) * 5 + 1.5 * (fbm2(x * 0.1, y * 0.1, 57) - 0.5);
    F.dr[i] = Math.max((dw - 0.12) * 5, (1 - ww) * (1 - tw) * (fbm2(x * 0.07, y * 0.07, 59) - 0.62) * 8);
    F.sn[i] = (mh - 1.1) * 14 + 2 * (n1 - 0.5);
    F.dw[i] = dw; F.tw[i] = tw; F.ww[i] = ww; F.mh[i] = mh;
    // height (in tiles, exaggerated) for the hill shading: the mountain, mesas, rolling hills and desert dunes
    const fade = sstep(0, 10, Math.max(x - CW, y - CH));
    el[i] = mh * 16 + sstep(-1.2, 0.4, mesa) * 3 + fade * (3 * fbm2(x * 0.05, y * 0.05, 69) + dw * 0.35 * Math.sin(x * 0.55 + y * 0.2 + 6 * fbm2(x * 0.05, y * 0.05, 71)));
  }
  for (let y = 1; y < GH - 1; y++) for (let x = 1; x < GW - 1; x++) {
    const i = y * GW + x, gx = (el[i + 1] - el[i - 1]) / 2, gy = (el[i + GW] - el[i - GW]) / 2;
    F.sh[i] = clamp(0.707 * (gx + gy), -1.5, 1.5); // > 0 faces the light (from the north-west)
  }
}
// ---- Brno's terrain comes from its land use: water (as a signed distance from the shore), forest and farmland, plus hills
const B_HILLS = BRNO ? [[49.1947, 16.5990, 5, 0.35], [49.1910, 16.6073, 3, 0.2], [49.2040, 16.5850, 6, 0.35], [49.1900, 16.5880, 4, 0.25], [49.1790, 16.5890, 6, 0.35],
  [49.2350, 16.5890, 7, 0.35], [49.2367, 16.5760, 6, 0.3], [49.2226, 16.6741, 13, 0.9], [49.1910, 16.6800, 5, 0.35], [49.2000, 16.5300, 18, 0.6], [49.2420, 16.5550, 12, 0.5],
  [49.2450, 16.6300, 18, 0.6], [49.1600, 16.5400, 14, 0.4]].map(([la, lo, r, h]) => [...geo(la, lo), r * MW / 240, h]) : []; // (radii given at 60 m a tile)
// BUT's faculties: abbreviation, a word of its name to find its grounds by, its colour (the university's visual style),
// and where it is (its main building)
const FACULTIES = [['FIT', 'informačních technologií', '#00a9e0', 49.2266, 16.5957], ['FEKT', 'elektrotechniky a komunikačních', '#003da5', 49.2263, 16.5752],
  ['FSI', 'strojního inženýrství', '#004f71', 49.2246, 16.5758], ['FCH', 'Fakulta chemická', '#00ab8e', 49.2316, 16.5782], ['FP', 'Fakulta podnikatelská', '#8246af', 49.2311, 16.5735],
  ['FAST', 'Fakulta stavební', '#658d1b', 49.2059, 16.5919], ['FA', 'Fakulta architektury', '#7a99ac', 49.1871, 16.5939], ['FaVU', 'výtvarných umění', '#e782a9', 49.1977, 16.5927]];
const RESERVOIR = BRNO ? geo(49.2285, 16.5250) : [0, 0]; // the reservoir lies north-west of this corner
const HARBOUR = BRNO ? geo(49.2290, 16.5150) : [0, 0];
const TRAMS = B5 ? BRNO_DATA.trams.map(f => { const pts = []; for (let i = 0; i < f.length; i += 2) pts.push([f[i] * T, f[i + 1] * T]); return pts; }) : []; // (inner Brno's tram tracks)
// the railway's tracks (drawn only; not in the tunnels): lv 1 up on a bridge over a street (drawn over the street's
// traffic, like the trains on it); RAIL_X: where a track on the ground meets a street on the ground (k 0 a level
// crossing, 1 a road bridge over the railway, 2 the railway over a street that dips under it)
const RAILS = BRNO ? BRNO_DATA.rails.map((f, i) => { const pts = []; for (let i = 0; i < f.length; i += 2) pts.push([f[i] * T, f[i + 1] * T]); pts.lv = (BRNO_DATA.rlv || [])[i] || 0; return pts; }) : [];
const RAIL_X = BRNO && BRNO_DATA.rx ? BRNO_DATA.rx.map(([x, y, k]) => ({ x: x * T, y: y * T, k })) : [];
const WATERLINES = BRNO ? BRNO_DATA.rivers.map(([name, f]) => { const pts = []; for (let i = 0; i < f.length; i += 2) pts.push([f[i], f[i + 1], 3]); return { name, pts }; }) : [];
function lineDist(pts, x, y) { // distance to a polyline and the half-width there
  let best = 1e9, hw = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
    const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / l2, 0, 1), d = Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t);
    if (d < best) { best = d; hw = (a[2] || 0) + ((b[2] || 0) - (a[2] || 0)) * t; }
  }
  return [best, hw];
}
// a two-pass chamfer distance transform over the corner grid: distance (in tiles) to the nearest corner where m is 0
function chamfer(m) {
  const D = new Float32Array(GW * GH);
  for (let i = 0; i < GW * GH; i++) D[i] = m[i] ? 1e4 : 0;
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const i = y * GW + x; if (!D[i]) continue; let v = D[i];
    if (x > 0) v = Math.min(v, D[i - 1] + 1);
    if (y > 0) { v = Math.min(v, D[i - GW] + 1); if (x > 0) v = Math.min(v, D[i - GW - 1] + 1.414); if (x < GW - 1) v = Math.min(v, D[i - GW + 1] + 1.414); }
    D[i] = v;
  }
  for (let y = GH - 1; y >= 0; y--) for (let x = GW - 1; x >= 0; x--) {
    const i = y * GW + x; if (!D[i]) continue; let v = D[i];
    if (x < GW - 1) v = Math.min(v, D[i + 1] + 1);
    if (y < GH - 1) { v = Math.min(v, D[i + GW] + 1); if (x < GW - 1) v = Math.min(v, D[i + GW + 1] + 1.414); if (x > 0) v = Math.min(v, D[i + GW - 1] + 1.414); }
    D[i] = v;
  }
  return D;
}
function terrainBrno() {
  const el = new Float32Array(GW * GH), wet = new Uint8Array(GW * GH), dry = new Uint8Array(GW * GH), fw = new Float32Array(GW * GH);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) { // (how much of the four tiles round each grid point is water, and forest)
    let nw = 0, nf = 0;
    for (let j = y - 1; j <= y; j++) for (let i = x - 1; i <= x; i++) if (i >= 0 && j >= 0 && i < MW && j < MH) { const c = LCG[j * MW + i]; if (c === LC_WATER) nw++; else if (c === LC_FOREST) nf++; }
    const i = y * GW + x, w = nw / 4 >= 0.5; wet[i] = w ? 1 : 0; dry[i] = w ? 0 : 1; fw[i] = nf / 4;
  }
  const dIn = chamfer(wet), dOut = chamfer(dry);
  const HILL = new Float64Array(GW * GH); // (the hills)
  for (const [hx, hy, hr, hh] of B_HILLS) for (let y = Math.max(0, Math.ceil(hy - hr)); y <= Math.min(GH - 1, Math.floor(hy + hr)); y++) for (let x = Math.max(0, Math.ceil(hx - hr)); x <= Math.min(GW - 1, Math.floor(hx + hr)); x++) {
    const d = Math.hypot(x - hx, y - hy) / hr; if (d < 1) HILL[y * GW + x] += hh * (1 - d * d) ** 1.5;
  }
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const i = y * GW + x;
    let f = 0, c = 0;
    for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) { const xx = x + k, yy = y + j; if (xx >= 0 && yy >= 0 && xx < GW && yy < GH) { f += fw[yy * GW + xx]; c++; } }
    f /= c;
    const hill = HILL[i];
    const t = LCG[Math.min(MH - 1, y) * MW + Math.min(MW - 1, x)], urb = t === LC_URBAN || t === LC_INDUS;
    // (the noise only matters near an edge, so it is skipped where it cannot change anything: this map is big)
    F.wa[i] = (wet[i] ? dIn[i] - 0.5 : 0.5 - dOut[i]) + ((wet[i] ? dIn[i] : dOut[i]) < 2.5 ? 0.4 * (fbm2(x * 0.2, y * 0.2, 67) - 0.5) : 0);
    F.ro[i] = -9;
    F.sd[i] = -9; F.sn[i] = -9;
    F.sb[i] = -9;
    F.fo[i] = (f - 0.5) * 5 + (f > 0 && f < 1 ? 1.5 * (fbm2(x * 0.1, y * 0.1, 57) - 0.5) : 0);
    F.dr[i] = urb || f >= 1 || B5 ? -9 : (1 - f) * (fbm2(x * 0.07, y * 0.07, 59) - 0.6) * 8;
    F.dw[i] = 0; F.tw[i] = 0; F.ww[i] = B5 ? 0 : f; F.mh[i] = hill;
    el[i] = (hill * 16 + (B5 ? 0 : 2.5 * fbm2(x * 0.05, y * 0.05, 69))) * BK; // (the same slopes, whatever the tile size)
  }
  for (let y = 1; y < GH - 1; y++) for (let x = 1; x < GW - 1; x++) {
    const i = y * GW + x, gx = (el[i + 1] - el[i - 1]) / 2, gy = (el[i + GW] - el[i - GW]) / 2;
    F.sh[i] = clamp(0.707 * (gx + gy), -1.5, 1.5);
  }
}
(BRNO ? terrainBrno : terrainIsland)();
// small-scale wobble for the field edges, shared by the tile classifier and the renderer
const DET = noiseMap(128, 128, 8, 8, 3, 900);
const detAt = (wx, wy, o) => DET[(((wy >> 2) + o) & 127) * 128 + (((wx >> 2) + o * 3) & 127)];
const cornerAvg = (A, tx, ty) => { const i = ty * GW + tx; return (A[i] + A[i + 1] + A[i + GW] + A[i + GW + 1]) / 4; };
const DETA = { wa: [0.35, 0], ro: [0.9, 17], sd: [1.4, 31], sb: [0.7, 47], fo: [1.4, 61], dr: [1.4, 79], sn: [1.2, 97] };
const fieldAt = (k, tx, ty) => cornerAvg(F[k], tx, ty) + DETA[k][0] * (detAt(tx * T + 16, ty * T + 16, DETA[k][1]) - 0.5);
function countryTile(tx, ty) {
  if (fieldAt('wa', tx, ty) > 0) return WATER;
  if (fieldAt('ro', tx, ty) > 0) return ROCK;
  if (fieldAt('sb', tx, ty) > 0 || fieldAt('sd', tx, ty) > 0) return SAND;
  return GRASS;
}
function regionOf(tx, ty) {
  const t = townAt(tx, ty); if (t) return t.reg;
  if (BRNO) return tx < RESERVOIR[0] && ty < RESERVOIR[1] && LCG[ty * MW + tx] === LC_WATER ? B_['Brněnská přehrada'] : REGB[ty * MW + tx];
  if (cornerAvg(F.dw, tx, ty) > 0.5) return R_DESERT;
  if (cornerAvg(F.tw, tx, ty) > 0.5) return R_COAST;
  if (cornerAvg(F.ww, tx, ty) > 0.5) return cornerAvg(F.mh, tx, ty) > 0.3 ? R_MOUNT : R_WOODS;
  return R_FARM;
}
const buildings = [], trees = [], parkSpots = [], props = [], fixedParked = [], SITES = [], extraLamps = [], DOORS = [], ZONES = [], CONSOLES = [];
const FIELDS = [], CLINICS = [], SHERIFFS = []; // crop fields; clinics and sheriff's offices in the towns (respawn points)
let SITE_PSI = null; // the fenced desert base
let ATOM_LAB = null; // the neutral-atom lab: its storage, entangling and readout zones and the AOD console
const HC = 320; // building heights are fractions of the camera height; HC converts them to pixels for shadows and roof slopes
const bridge = new Uint8Array(MW * MH), hwT = new Uint8Array(MW * MH);
const AIRPORT = BRNO ? { x0: -9e6, y0: -9e6, x1: -9e6, y1: -9e6, ry0: -9e6, ry1: -9e6, rx0: -9e6, rx1: -9e6, name: 'Letiště Brno-Tuřany' } // (none in inner Brno: Tuřany is out of the map)
  : { x0: 76 * T, y0: 76 * T, x1: 97 * T, y1: 97 * T, ry0: 78 * T, ry1: 81 * T, rx0: 76 * T, rx1: 96 * T, name: 'Gridlock International Airport' };
const PLANES = BRNO ? [] : [{ x: 80 * T, y: 85.5 * T, a: 0 }, { x: 88 * T, y: 85.5 * T, a: Math.PI }];
let STADIUM = { x0: 64, y0: 64 };
const isHighway = (tx, ty) => tile(tx, ty) === ROAD && hwT[ty * MW + tx] === 1;

// ============================================================ the road network
// Roads are polylines (in tiles). Crossings and T-junctions are found automatically and become graph nodes.
const NETDEF = [];
const road = (name, pts, o = {}) => NETDEF.push(Object.assign({ name, pts }, o));
const arcPts = (cx, cy, r, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
const alongX = (x0, x1, f, step = 1.7) => { const p = []; for (let x = x0; x < x1 - 0.5; x += step) p.push([x, f(x)]); p.push([x1, f(x1)]); return p; };
const RB = { x: 50, y: 62, r: 5 }, rbPt = a => [RB.x + Math.cos(a) * RB.r, RB.y + Math.sin(a) * RB.r];
// rural roads have no pavements (and no street lamps); dirt tracks lead to farms and quarries
const RU = { rural: true }, HWY = { hw: true, rural: true }, DIRT = { rural: true, dirt: true };
if (!BRNO) {
road('Ring Expressway', [[10, 2], [90, 2], ...arcPts(90, 10, 8, -Math.PI / 2, 0, 8).slice(1), [98, 90], ...arcPts(90, 90, 8, 0, Math.PI / 2, 8).slice(1),
  [10, 98], ...arcPts(10, 90, 8, Math.PI / 2, Math.PI, 8).slice(1), [2, 10], ...arcPts(10, 10, 8, Math.PI, Math.PI * 1.5, 8).slice(1)], { hw: true, closed: true });
road('North Embankment', alongX(2, 98, x => riverY(x) - 6.5));
road('South Embankment', alongX(2, 98, x => riverY(x) + 6.5));
// a roundabout, circulating counter-clockwise on screen
road('Superposition Circus', arcPts(RB.x, RB.y, RB.r, 0, -Math.PI * 2, 36), { oneway: true, closed: true, ring: true });
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
// ---- the countryside
const palmPts = (x0, x1) => alongX(x0, x1, palmY, 2);
road('Valley Interstate', catmull([[98, 30], [112, 31], [126, 28], [140, 30], [156, 34], [170, 36], [186, 37]], 0.8), HWY);
road('Coast Highway', catmull([[26, 98], [24, 108], [16, 120], [11, 136], [12, 152], [17, 168], [28, 180], [44, 187], [64, 189], [86, 188], [104, 187], [120, palmY(120)]], 0.8), HWY);
road('Coast Highway', catmull([[184, palmY(184)], [200, 182], [213, 171], [221, 155], [224, 136], [224, 110], [224, 84]], 0.8), HWY);
road('Old Valley Road', catmull([[98, 74], [110, 77], [124, 74], [138, 71]], 0.8), RU);
road('Old Valley Road', catmull([[162, 71], [172, 68], [180, 64], [186, 63]], 0.8), RU);
road("Bell's Road", [[150, 8], [150, 59]], RU);
road("Bell's Road", catmull([[150, 83], [148, 100], [143, 116], [142, 130], [145, 146], [146, 160]], 0.8), RU);
road('Eigen Pass', catmull([[13, 130], [22, 127], [30, 130], [34, 137], [28, 141], [33, 147], [41, 144], [46, 150], [52, 153], [60, 156], [68, 152],
  [74, 146], [84, 142], [96, 138], [110, 134], [126, 131], [142, 130]], 0.7), RU);
road('Woodland Drive', catmull([[74, 98], [75, 108], [79, 118], [80, 128], [84, 136], [86, 141]], 0.8), RU);
road('Pine Lake Track', [[80, 122], [87, 122.5], [95, 121.5]], DIRT);
road('Psi Road', [[206, 84], [206, 96]], RU);
road('Lookout Point', [[150, 8], [158, 6.5]], DIRT);
// farm tracks
road('Boson Farm Lane', [[116, 76.6], [116, 86]], DIRT);
road('Fermion Farm Road', [[124, 28.3], [124, 18]], DIRT);
road('Higgs Farm Track', [[150, 46], [160, 46]], DIRT);
road('Gluon Farm Track', [[147.6, 100], [136, 100]], DIRT);
// Bell's Crossing: a village crossroads
road('Main Street', [[138, 71], [162, 71]]);
road('Bell Street', [[150, 59], [150, 83]]);
// Las Ondas: the Strip and its casinos in the desert
road('The Strip', [[206, 28], [206, 84]]);
road('Ondas West Avenue', [[186, 28], [186, 70]]);
road('Ondas East Avenue', [[224, 28], [224, 84]]);
road('Fortune Street', [[186, 28], [224, 28]]);
road('Dice Street', [[186, 42], [224, 42]]);
road('Jackpot Road', [[186, 56], [224, 56]]);
road('Mirage Street', [[186, 70], [224, 70]]);
road('Mirage Street', [[206, 84], [224, 84]]);
// Coral Bay: Palm Drive along the beach, Coral Avenue behind it, and a pier
road('Palm Drive', palmPts(120, 184));
road('Coral Avenue', [[130, 166], [176, 166]]);
for (const [nm, x] of [['Shell Street', 130], ['Reef Street', 146], ['Lagoon Street', 162], ['Dune Street', 176]]) road(nm, [[x, x === 146 ? 160 : 166], [x, palmY(x)]]);
road('Coral Pier', [[154, palmY(154)], [154, MH - 3]], RU);
} else { // Brno's main roads from OpenStreetMap: motorways and the city ring are highways, roads out in the country are rural
  for (const [name, rank, rural, f, tun, lf, lb, wd] of BRNO_DATA.roads) { // (tun: 1 a tunnel, 2 or 3 an overpass on that layer + 1;
    // inner Brno: lanes forward and back, none back on a one-way street, and the carriageway's width in px)
    const pts = []; for (let i = 0; i < f.length; i += 2) pts.push([f[i], f[i + 1]]);
    road(name || (rank === 0 ? 'Dálnice' : 'Silnice'), pts, Object.assign({ rank }, rank <= 1 ? HWY : rural ? RU : {}, tun === 1 ? { tunnel: true } : tun > 1 ? { over: tun - 1 } : {},
      wd ? { lf, lb, wd, oneway: lb === 0 } : {}));
  }
}

const NODES = [], EDGES = [], LANES = [], LIGHT_NODES = [], BUS_STOPS = [];
const LSTEP = 8, LGRID = new Map();
let HOP = null, HOP_IN = null; // routing: HOP[g] holds, for every node, the lane to take towards goal node g (-1: none)
// the best lane from every node towards goal node g (Dijkstra on the lane graph), worked out the first time a car heads
// for g: a table for every pair at once is a few seconds' work on the big maps, and most goals are never used
function hopRow(g) {
  let row = HOP[g]; if (row) return row;
  const N = NODES.length; row = HOP[g] = new Int16Array(N).fill(-1);
  if (!HOP_IN) { HOP_IN = NODES.map(() => []); for (const L of LANES) HOP_IN[L.to].push(L); }
  const dist = new Float64Array(N).fill(Infinity), hk = [], hv = []; // a binary heap of (distance, node)
  const push = (k, v) => { let i = hk.length; hk.push(k); hv.push(v); while (i) { const p = (i - 1) >> 1; if (hk[p] <= k) break; hk[i] = hk[p]; hv[i] = hv[p]; i = p; } hk[i] = k; hv[i] = v; };
  const pop = () => {
    const v = hv[0], k = hk.pop(), w = hv.pop(), n = hk.length; if (!n) return v;
    let i = 0; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && hk[c + 1] < hk[c]) c++; if (hk[c] >= k) break; hk[i] = hk[c]; hv[i] = hv[c]; i = c; }
    hk[i] = k; hv[i] = w; return v;
  };
  dist[g] = 0; push(0, g);
  while (hk.length) {
    const d0 = hk[0], u = pop(); if (d0 > dist[u]) continue;
    for (const L of HOP_IN[u]) { const d = d0 + L.len + 60; if (d < dist[L.from]) { dist[L.from] = d; row[L.from] = L.id; push(d, L.from); } }
  }
  return row;
}
// the strongly connected parts of the street graph (a two-way edge runs both ways, a one-way edge from a to b): comp[i] is
// the part node i is in, so that two nodes in one part can each be reached from the other (Tarjan's, without recursion)
function sccOf(n, edges) {
  const adj = Array.from({ length: n }, () => []);
  for (const e of edges) { if (e.a === e.b) continue; adj[e.a].push(e.b); if (!e.oneway) adj[e.b].push(e.a); }
  const idx = new Int32Array(n).fill(-1), low = new Int32Array(n), on = new Uint8Array(n), comp = new Int32Array(n).fill(-1), st = [];
  let t = 0, c = 0;
  for (let s0 = 0; s0 < n; s0++) {
    if (idx[s0] >= 0) continue;
    const call = [[s0, 0]]; idx[s0] = low[s0] = t++; st.push(s0); on[s0] = 1;
    while (call.length) {
      const fr = call[call.length - 1], v = fr[0];
      if (fr[1] < adj[v].length) {
        const w = adj[v][fr[1]++];
        if (idx[w] < 0) { idx[w] = low[w] = t++; st.push(w); on[w] = 1; call.push([w, 0]); }
        else if (on[w]) low[v] = Math.min(low[v], idx[w]);
      } else {
        call.pop();
        if (call.length) { const u = call[call.length - 1][0]; low[u] = Math.min(low[u], low[v]); }
        if (low[v] === idx[v]) { let w; do { w = st.pop(); on[w] = 0; comp[w] = c; } while (w !== v); c++; }
      }
    }
  }
  return comp;
}
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
  // 1. open ends that stop on another road become T-junctions (inner Brno's network is OpenStreetMap's own graph: what
  // meets there shares a point already, and an end near a road it does not meet is a dead end)
  for (const p of B5 ? [] : polys) if (!p.closed) for (const end of [0, p.pts.length - 1]) {
    const e = p.pts[end]; let best = null;
    for (const q of polys) {
      if (q === p || (q.tunnel && !p.tunnel) || (q.over && !p.over)) continue; // (a street that ends above a tunnel, or under an overpass, does not meet it)
      if (e[0] < q.bb[0] || e[0] > q.bb[2] || e[1] < q.bb[1] || e[1] > q.bb[3]) continue;
      for (let i = 0; i < q.pts.length - 1; i++) { const r = closestOnSeg(e, q.pts[i], q.pts[i + 1]); if (r.d < 48 && (!best || r.d < best.d)) best = { q, i, ...r }; }
    }
    if (best) { e[0] = best.x; e[1] = best.y; best.q.cuts.push(best.i + best.t); }
  }
  // 2. proper crossings (a crossing at a shared vertex is counted once, on the later segment)
  const EPS = 1e-7, PG = new Map(), PC = 512, pg = (i, j) => i * 65536 + j; // (the streets' boxes in a grid)
  polys.forEach((q, b) => { for (let j = Math.floor(q.bb[1] / PC); j <= Math.floor(q.bb[3] / PC); j++) for (let i = Math.floor(q.bb[0] / PC); i <= Math.floor(q.bb[2] / PC); i++) { const k = pg(i, j); if (!PG.has(k)) PG.set(k, []); PG.get(k).push(b); } });
  for (let a = 0; a < polys.length; a++) {
    const near = new Set(), Aa = polys[a];
    for (let j = Math.floor(Aa.bb[1] / PC); j <= Math.floor(Aa.bb[3] / PC); j++) for (let i = Math.floor(Aa.bb[0] / PC); i <= Math.floor(Aa.bb[2] / PC); i++) for (const b of PG.get(pg(i, j)) || []) if (b > a) near.add(b);
    for (const b of [...near].sort((x, y) => x - y)) {
    const A = polys[a], B = polys[b];
    if (!!A.tunnel !== !!B.tunnel || (A.over || 0) !== (B.over || 0)) continue; // (the streets pass over the tunnels, and under the overpasses)
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
      if (polyLen(pts) > 6) pieces.push({ pts, name: p.name, hw: !!p.hw, oneway: !!p.oneway, ring: !!p.ring, rural: !!p.rural, dirt: !!p.dirt, tunnel: !!p.tunnel, over: p.over || 0, rank: p.rank, lf: p.lf, lb: p.lb, wd: p.wd });
    }
  }
  // 4. nodes and edges
  const NR = B5 ? 6 : 22, NG = new Map(), ng = (i, j) => i * 65536 + j; // (the nodes in cells as big as the snapping distance)
  const nodeAt = (x, y) => {
    const ci = Math.floor(x / NR), cj = Math.floor(y / NR); let best = null;
    for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) for (const n of NG.get(ng(i, j)) || []) if ((!best || n.id < best.id) && Math.hypot(n.x - x, n.y - y) < NR) best = n;
    if (best) return best;
    const n = { id: NODES.length, x, y, edges: [] }; NODES.push(n);
    const k = ng(ci, cj); if (!NG.has(k)) NG.set(k, []); NG.get(k).push(n); return n;
  };
  for (const pc of pieces) {
    const A = nodeAt(...pc.pts[0]), B = nodeAt(...pc.pts[pc.pts.length - 1]);
    if (A === B && polyLen(pc.pts) < 60) continue;
    pc.pts[0] = [A.x, A.y]; pc.pts[pc.pts.length - 1] = [B.x, B.y];
    const e = { id: EDGES.length, a: A.id, b: B.id, pts: pc.pts, len: polyLen(pc.pts), hw: pc.hw, oneway: pc.oneway, ring: pc.ring, rural: pc.rural, dirt: pc.dirt, name: pc.name, tunnel: pc.tunnel, over: pc.over, rank: pc.rank,
      lf: pc.lf || 1, lb: pc.oneway ? 0 : pc.lb || 1, wd: pc.wd || 64 }; // (lanes along its points and back, the carriageway's width)
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of e.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const m = e.wd / 2 + 38; e.bb = [x0 - m, y0 - m, x1 + m, y1 + m];
    EDGES.push(e); A.edges.push(e); if (B !== A) B.edges.push(e);
  }
  // a one-way street that leads out of a part of the network with no way back (or into one with no way out) takes traffic
  // both ways after all: then every car can get from anywhere it can drive to back again
  for (let pass = 0; pass < 30; pass++) {
    const comp = sccOf(NODES.length, EDGES); let changed = false;
    for (const e of EDGES) if (e.oneway && !e.ring && e.a !== e.b && comp[e.a] !== comp[e.b]) { e.oneway = false; e.lb = Math.max(1, e.lf >> 1); e.lf = Math.max(1, e.lf - e.lb); changed = true; }
    if (!changed) break;
  }
  // inner Brno: a junction of dual carriageways (or with slip roads) is several nodes a few metres apart joined by short
  // pieces; such a cluster is signalled as one, by the roads coming into it (cl: each node's cluster)
  const cl = NODES.map((_, i) => i);
  if (B5) {
    const find = i => { while (cl[i] !== i) i = cl[i] = cl[cl[i]]; return i; };
    for (const e of EDGES) if (e.len < 80 && e.a !== e.b && !e.over && !e.tunnel && NODES[e.a].edges.length >= 3 && NODES[e.b].edges.length >= 3) cl[find(e.a)] = find(e.b);
    for (let i = 0; i < cl.length; i++) cl[i] = find(i);
  }
  const inner = e => cl[e.a] === cl[e.b]; // (a piece within a cluster)
  const clusters = new Map(), sigC = new Set(), members = new Map();
  if (B5 && BRNO_DATA.sig) { // each signal OpenStreetMap maps (at a junction, or at the stop line up to 30 m before it) lights its nearest junction
    const SG = BRNO_DATA.sig;
    for (let i = 0; i < SG.length; i += 2) {
      let best = null, bd = 6 * T;
      for (const n of NODES) if (n.edges.length >= 3) { const d = Math.hypot(SG[i] * T - n.x, SG[i + 1] * T - n.y); if (d < bd) { bd = d; best = n; } }
      if (best) sigC.add(cl[best.id]);
    }
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
    n.hw = n.edges.some(e => e.hw); n.ring = n.edges.some(e => e.ring);
  }
  for (const n of NODES) { // (signals and clearances, once every node knows its directions: a cluster needs its neighbours')
    n.light = n.edges.length >= 3 && !n.ring && (B5 ? false // (inner Brno: by clusters, below)
      : BRNO ? !n.edges.some(e => e.over) && n.edges.every(e => e.len > 200) && (n.hw || !!townAt(Math.floor(n.x / T), Math.floor(n.y / T))) // Brno: the city's crossings, the ring road's too
      : !n.hw && !n.edges.some(e => e.rural)); // the island: no signals on the expressway or out in the country
    if (B5) { // a cluster is signalled where main roads come into it from clearly different directions
      let C = clusters.get(cl[n.id]);
      if (!C) {
        if (!members.size) for (const m of NODES) { if (!members.has(cl[m.id])) members.set(cl[m.id], []); members.get(cl[m.id]).push(m); }
        const mem = members.get(cl[n.id]), ext = [];
        for (const m of mem) for (const e of m.edges) if (!inner(e) && m.dirs.has(e.id)) ext.push([e, m]);
        const ax = ([e, m]) => { const [dx, dy] = m.dirs.get(e.id); return ((Math.atan2(dy, dx) % Math.PI) + Math.PI) % Math.PI; };
        const ad = (a, b) => { const d = Math.abs(a - b) % Math.PI; return Math.min(d, Math.PI - d); };
        const main = ext.filter(([e]) => e.rank <= 4).map(ax);
        const signal = BRNO_DATA.sig ? sigC.has(cl[n.id]) // (traffic signals as mapped; without them, where main roads meet)
          : main.some(a => main.some(b => ad(a, b) > 0.5)) && ext.every(([e]) => e.len > 100);
        const light = ext.length >= 3 && signal && !mem.some(m => m.edges.some(e => e.over || e.tunnel) || m.ring);
        const axs = ext.map(ax); let s1 = 0; for (let i = 1; i < axs.length; i++) if (ad(axs[i], axs[0]) > ad(axs[s1], axs[0])) s1 = i;
        C = { light, grp: new Map(ext.map(([e], i) => [e.id, ad(axs[i], axs[0]) <= ad(axs[i], axs[s1]) ? 0 : 1])), off: (cl[n.id] * 7) % 9 * 2 };
        clusters.set(cl[n.id], C);
      }
      n.light = C.light && n.edges.some(e => !inner(e));
      if (n.light) { n.grp = new Map(n.edges.filter(e => !inner(e)).map(e => [e.id, C.grp.get(e.id)])); n.off = C.off; LIGHT_NODES.push(n); }
    }
    const mw = Math.max(...n.edges.map(e => e.wd)) / 2; // (lanes stop short of the widest street's kerb, crosswalks beyond it)
    n.clr = n.light ? Math.max(72, mw + 40) : n.edges.length >= 3 ? Math.max(B5 ? 0 : 40, mw + 8) : 0;
    if (n.light && !B5) {
      // two signal groups: the approaches closest to each of the two most different axes
      const ax = n.edges.map(e => { const [dx, dy] = n.dirs.get(e.id); return ((Math.atan2(dy, dx) % Math.PI) + Math.PI) % Math.PI; });
      const ad = (a, b) => { const d = Math.abs(a - b) % Math.PI; return Math.min(d, Math.PI - d); };
      let s1 = 0; for (let i = 1; i < ax.length; i++) if (ad(ax[i], ax[0]) > ad(ax[s1], ax[0])) s1 = i;
      n.grp = new Map(n.edges.map((e, i) => [e.id, ad(ax[i], ax[0]) <= ad(ax[i], ax[s1]) ? 0 : 1]));
      n.off = (n.id * 7) % 9 * 2;
      LIGHT_NODES.push(n);
    }
  }
  // 5. lanes: right-hand traffic, as many each way as the street has (a lane each way on the island; one-way streets and
  // the roundabout only one way), side by side across the carriageway, trimmed back from junctions
  const OUT = NODES.map(() => []);
  for (const e of EDGES) for (const dir of e.oneway ? [1] : [1, -1]) for (let li = 0, nl = dir > 0 ? e.lf : e.lb; li < nl; li++) {
    const lw = e.wd / (e.lf + e.lb), dv = (e.lb - e.lf) * lw / 2; // (a lane's width; the line between the two ways, right of the points' way)
    const pts = dir > 0 ? e.pts : e.pts.slice().reverse(), off = (dir > 0 ? dv : -dv) + (li + 0.5) * lw; // (right of travel)
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
    const L = { id: LANES.length, e, dir, from: from.id, to: to.id, x: [], y: [], h: [], hw: e.hw, next: [], off, kerb: e.wd / 2 - off, idx: li };
    let k = 0;
    const sample = s => {
      while (k < cum.length - 2 && cum[k + 1] < s) k++;
      const t = (s - cum[k]) / ((cum[k + 1] - cum[k]) || 1), x = op[k][0] + (op[k + 1][0] - op[k][0]) * t, y = op[k][1] + (op[k + 1][1] - op[k][1]) * t;
      L.x.push(x); L.y.push(y); L.h.push(Math.atan2(op[k + 1][1] - op[k][1], op[k + 1][0] - op[k][0]));
    };
    for (let s = s0; s < s1; s += LSTEP) sample(s);
    sample(s1);
    L.n = L.x.length; L.len = (L.n - 2) * LSTEP + Math.hypot(L.x[L.n - 1] - L.x[L.n - 2], L.y[L.n - 1] - L.y[L.n - 2]);
    L.light = to.light && to.grp.has(e.id) ? to : null; L.grp = L.light ? to.grp.get(e.id) : 0; // (not on a piece within a cluster)
    LANES.push(L); OUT[from.id].push(L);
  }
  const byE = new Map(); for (const L of LANES) { if (!byE.has(L.e)) byE.set(L.e, []); byE.get(L.e).push(L); }
  for (const L of LANES) {
    const outs = OUT[L.to].filter(o => o.e !== L.e);
    L.next = outs.length ? outs : OUT[L.to]; // U-turn only at a dead end
    L.sib = byE.get(L.e).filter(o => o.dir === L.dir); // (the lanes beside it, innermost first)
  }
  // routing: each goal's table is worked out when first needed (hopRow)
  HOP = new Array(NODES.length); HOP_IN = null;
  // spatial index of lane samples
  for (const L of LANES) for (let i = 0; i < L.n; i += 2) {
    const key = Math.floor(L.x[i] / 128) + Math.floor(L.y[i] / 128) * 1024;
    if (!LGRID.has(key)) LGRID.set(key, []);
    LGRID.get(key).push({ L, s: i * LSTEP, x: L.x[i], y: L.y[i], h: L.h[i] });
  }
}
// the lane sample nearest to (x, y), preferring lanes heading the same way as `ang`
function nearestLanePt(x, y, ang, maxD = 96, lay = 0) { // (in a tunnel only the tunnel's lanes count, up on a deck only the deck's)
  let best = null, bs = 1e9;
  const cx = Math.floor(x / 128), cy = Math.floor(y / 128), R = Math.ceil(maxD / 128);
  for (let j = cy - R; j <= cy + R; j++) for (let i = cx - R; i <= cx + R; i++) {
    const cell = LGRID.get(i + j * 1024); if (!cell) continue;
    for (const p of cell) {
      if (lay === 1 ? !p.u : lay === 3 ? !p.o : p.u || (p.o && lay !== 4)) continue;
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
const lotT = new Uint8Array(MW * MH); // car-park tiles: paved with asphalt rather than slabs
const pedSpot = new Uint8Array(MW * MH);
const taken = new Uint8Array(MW * MH); // countryside tiles already used by a farm, a field or a site
// tunnels: 1 under the tunnel (the surface above is the city as usual), 2 on a ramp down to a portal; tE: the tunnel road nearby
const tunT = new Uint8Array(MW * MH), tE = new Int16Array(MW * MH).fill(-1);
const TUNNELS = [], RAMPS = [], RAMP = 128; // (px of a tunnel road that run down from the street at a portal)
// overpasses: a road on a deck over other roads. Its ends (where it meets the streets) rise along ramps, the deck itself
// is a layer of its own (ovT 1, with oE its edge; 2 on the ramps), and the streets underneath carry on as if it weren't there
const ovT = new Uint8Array(MW * MH), oE = new Int16Array(MW * MH).fill(-1);
const OVERS = [], OVRAMPS = [], DECK_H = B5 ? 0.08 : 0.04; // (the deck's height, in building units, per layer)
const smooth01 = u => u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
const deckZ = (e, s) => DECK_H * e.over * Math.min(e.ovA ? smooth01(s / e.ovR) : 1, e.ovB ? smooth01((e.len - s) / e.ovR) : 1);
function overPrep() {
  const bbOf = (pts, m) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return [x0 - m, y0 - m, x1 + m, y1 + m]; };
  for (const e of EDGES) if (e.over) {
    OVERS.push(e);
    const portal = id => NODES[id].edges.some(o => !o.over), r = Math.min(RAMP, e.len / 3);
    e.ovR = r; e.ovA = portal(e.a); e.ovB = portal(e.b); e.obb = bbOf(e.pts, e.wd / 2 + 12);
    if (e.ovA) { const pts = edgeSub(e, 0, r); OVRAMPS.push({ e, pts, land: [pts], water: [], hw: e.hw, rural: e.rural, oneway: true, bb: bbOf(pts, 80) }); }
    if (e.ovB) { const pts = edgeSub(e, e.len - r, e.len).reverse(); OVRAMPS.push({ e, pts, land: [pts], water: [], hw: e.hw, rural: e.rural, oneway: true, bb: bbOf(pts, 80) }); }
  }
  OVERS.sort((a, b) => a.over - b.over);
}
// how far along an edge the point nearest (x, y) is
function edgeS(e, x, y) {
  const P = e.pts; let best = 1e9, sAt = 0, acc = 0;
  for (let i = 0; i < P.length - 1; i++) { const r = closestOnSeg([x, y], P[i], P[i + 1]), L = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]); if (r.d < best) { best = r.d; sAt = acc + r.t * L; } acc += L; }
  return sAt;
}
// where along its overpass a car is, so how high it rides
function carDeckZ(c) {
  const id = oE[Math.floor(c.y / T) * MW + Math.floor(c.x / T)]; if (id < 0) return 0;
  return deckZ(EDGES[id], edgeS(EDGES[id], c.x, c.y));
}
// is the car heading along the overpass here (so going up its ramp, not crossing under it)?
function deckAligned(c, k) {
  if (c.ln && c.driver !== 'player') return !!c.ln.L.e.over; // (a car on a lane is wherever its lane is; yours, wherever you steer it)
  for (const e of OVERS) { // (any deck here that the car is on and heading along: at an interchange they lie close together)
    const b = e.obb; if (c.x < b[0] || c.x > b[2] || c.y < b[1] || c.y > b[3]) continue;
    const P = e.pts, r = e.wd / 2 + 8;
    for (let i = 0; i < P.length - 1; i++) { const q = closestOnSeg([c.x, c.y], P[i], P[i + 1]); if (q.d < r && Math.abs(Math.cos(Math.atan2(P[i + 1][1] - P[i][1], P[i + 1][0] - P[i][0]) - c.angle)) > 0.75) return true; }
  }
  return false;
}
// is car c going down (or up) one of the tunnels' ramps: on it, heading along it? (else it is on a street beside the portal)
function rampAligned(c) {
  if (c.ln && c.driver !== 'player') return !!c.ln.L.e.tunnel;
  for (const r of RAMPS) {
    const b = r.bb; if (c.x < b[0] || c.x > b[2] || c.y < b[1] || c.y > b[3]) continue;
    const P = r.pts, w = r.e.wd / 2 + 8;
    for (let i = 0; i < P.length - 1; i++) { const q = closestOnSeg([c.x, c.y], P[i], P[i + 1]); if (q.d < w && Math.abs(Math.cos(Math.atan2(P[i + 1][1] - P[i][1], P[i + 1][0] - P[i][0]) - c.angle)) > 0.75) return true; }
  }
  return false;
}
function tunnelPrep() {
  const bbOf = (pts, m) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return [x0 - m, y0 - m, x1 + m, y1 + m]; };
  for (const e of EDGES) if (e.tunnel) {
    TUNNELS.push(e);
    const portal = id => NODES[id].edges.some(o => !o.tunnel), r = Math.min(RAMP, e.len / 3);
    if (portal(e.a)) { const pts = edgeSub(e, 0, r); RAMPS.push({ e, pts, land: [pts], water: [], hw: e.hw, rural: e.rural, oneway: true, bb: bbOf(pts, 80) }); }
    if (portal(e.b)) { const pts = edgeSub(e, e.len - r, e.len).reverse(); RAMPS.push({ e, pts, land: [pts], water: [], hw: e.hw, rural: e.rural, oneway: true, bb: bbOf(pts, 80) }); }
  }
}
// distance from each tile centre to the nearest of some polylines (and which), within a few tiles of them
// (a line's offset is how much wider than the standard 64 px its street is, each side: its distances are counted as if
// it were the standard one, so that a tile is road within its real kerbs, pavement just beyond, and so on)
const offW = e => e.wd / 2 - 32;
function rasterLines(lines, D, E) {
  for (const [pts, id, off = 0] of lines) for (let i = 0, pad = 3 + Math.max(0, Math.ceil(off / T)); i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const tx0 = Math.max(0, Math.floor(Math.min(a[0], b[0]) / T) - pad), tx1 = Math.min(MW - 1, Math.floor(Math.max(a[0], b[0]) / T) + pad);
    const ty0 = Math.max(0, Math.floor(Math.min(a[1], b[1]) / T) - pad), ty1 = Math.min(MH - 1, Math.floor(Math.max(a[1], b[1]) / T) + pad);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const d = closestOnSeg([(tx + 0.5) * T, (ty + 0.5) * T], a, b).d - off, k = ty * MW + tx;
      if (d < D[k]) { D[k] = d; if (E) E[k] = id; }
    }
  }
}
// the detailed map's numbers: variable-length base-64 (5 bits a character, the sixth says more follows, the lowest bit
// of a number is its sign), as tools/brno5/export5.py writes them
const B64I = (() => { const t = new Int8Array(128).fill(-1), a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; for (let i = 0; i < 64; i++) t[a.charCodeAt(i)] = i; return t; })();
function vlq(s, i) { let v = 0, sh = 0, d; do { d = B64I[s.charCodeAt(i++)]; v += (d & 31) * 2 ** sh; sh += 5; } while (d & 32); return [v & 1 ? -(v - 1) / 2 : v / 2, i]; }
const B5K = ['yes', 'house', 'flats', 'shed', 'industry', 'shop', 'civic', 'church', 'hospital', 'school', 'station', 'castle', 'sport', 'hotel', 'tower'];
// each building's pieces, as tools/brno5/bld5.py cut them: a turned rectangle, a right-angled outline in its own turned
// frame, or a free polygon (given a frame along its main direction here). A piece keeps its rings in its frame (lr, px
// from the frame's origin; the outer ring runs one way, courtyards the other) and in the world (wr, flat, for collisions)
function b5Frame(rings) { // a free polygon's main direction: its edges' directions folded to a quarter turn, by length
  let sx = 0, sy = 0;
  for (const r of rings) for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), f = 4 * Math.atan2(dy, dx);
    sx += L * Math.cos(f); sy += L * Math.sin(f);
  }
  return Math.atan2(sy, sx) / 4;
}
function b5Piece(a, ox, oy, lr) { // a frame at angle a with its origin at (ox, oy) world px, and rings in it
  const c = Math.cos(a), s = Math.sin(a);
  const wr = lr.map(r => { const f = new Float64Array(r.length * 2); r.forEach(([u, v], i) => { f[2 * i] = ox + u * c - v * s; f[2 * i + 1] = oy + u * s + v * c; }); return f; });
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, u0 = 1e9, v0 = 1e9, u1 = -1e9, v1 = -1e9;
  for (let i = 0; i < wr[0].length; i += 2) { x0 = Math.min(x0, wr[0][i]); x1 = Math.max(x1, wr[0][i]); y0 = Math.min(y0, wr[0][i + 1]); y1 = Math.max(y1, wr[0][i + 1]); }
  for (const [u, v] of lr[0]) { u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  return { fr: { c, s, ox, oy }, lr, wr, bb: [x0, y0, x1, y1], lb: [u0, v0, u1, v1] };
}
function b5Buildings() {
  const s = BRNO_DATA.bld, out = [], nx = () => { const a = vlq(s, i); i = a[1]; return a[0]; };
  let i = 0, px = 0, py = 0;
  const at = () => { px += nx(); py += nx(); return [px * T / 10, py * T / 10]; }, ang = () => (nx() / 10 - 45) * Math.PI / 180;
  while (i < s.length) {
    const k = nx(), lv = nx(), rf = nx() - 1, rh = nx(), gl = nx(), wc = nx(), rc = nx(), nm = nx(), np = nx(), p = [];
    for (let j = 0; j < np; j++) {
      const t = nx();
      if (t === 0) { // a turned rectangle: its corner, its angle, its size
        const [x, y] = at(), a = ang(), w = nx() * T / 10, h = nx() * T / 10;
        p.push(Object.assign(b5Piece(a, x, y, [[[0, 0], [w, 0], [w, h], [0, h]]]), { rect: true }));
      } else if (t === 1) { // right-angled rings: each one's first corner, then steps along and across the frame in turn
        const a = ang(), nr = nx(), c = Math.cos(a), sn = Math.sin(a), lr = [];
        let ox = 0, oy = 0;
        for (let r = 0; r < nr; r++) {
          const [x, y] = at(), n = nx();
          if (!r) { ox = x; oy = y; }
          let u = (x - ox) * c + (y - oy) * sn, v = -(x - ox) * sn + (y - oy) * c; const u0 = u, R = [[u, v]];
          for (let q = 0; q < n; q++) { const d = nx() * T / 10; if (q & 1) v += d; else u += d; R.push([u, v]); }
          R.push([u0, v]); lr.push(R);
        }
        p.push(b5Piece(a, ox, oy, lr));
      } else { // free rings: each one's first corner and its steps
        const nr = nx(), wr = [];
        for (let r = 0; r < nr; r++) { at(); const n = nx(); let X = px, Y = py; const R = [[X * T / 10, Y * T / 10]]; for (let q = 1; q < n; q++) { X += nx(); Y += nx(); R.push([X * T / 10, Y * T / 10]); } wr.push(R); }
        const a = b5Frame(wr), c = Math.cos(a), sn = Math.sin(a), [ox, oy] = wr[0][0];
        p.push(b5Piece(a, ox, oy, wr.map(R => R.map(([x, y]) => [(x - ox) * c + (y - oy) * sn, -(x - ox) * sn + (y - oy) * c]))));
      }
    }
    out.push({ k, lv, rf, rh, gl, wc: wc ? BRNO_DATA.bcols[wc - 1] : null, rc: rc ? BRNO_DATA.bcols[rc - 1] : null, nm: nm ? BRNO_DATA.bnames[nm - 1] : null, p });
  }
  return out;
}
// inner Brno's ground as OpenStreetMap draws it: every kind of area (the built-up land, parks, squares, car parks,
// railway land, woods, fields, pitches, water) as polygons and lines in paint order, so that their edges run where the
// real ones do rather than along the tiles; each one remembers its box, and farmland its crop and the way its rows run
let LAND5 = null;
const LAND5G = new Map();
function b5Land() {
  const s = BRNO_DATA.land || '', out = [], nx = () => { const a = vlq(s, i); i = a[1]; return a[0]; };
  let i = 0, px = 0, py = 0;
  const run = (P, o, close) => { // one ring or line: its first point (from the last first point), then its steps
    px += nx(); py += nx(); const n = nx(); let X = px, Y = py, lx = 0, ly = 0;
    for (let q = 0; q < n; q++) {
      if (q) { X += nx(); Y += nx(); }
      const x = X * T / 10, y = Y * T / 10;
      if (q) { P.lineTo(x, y); const l = (x - lx) ** 2 + (y - ly) ** 2; if (l > o.long) { o.long = l; o.ang = Math.atan2(y - ly, x - lx); } } else P.moveTo(x, y);
      lx = x; ly = y; const b = o.bb; if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
    }
    if (close) P.closePath();
  };
  while (i < s.length) {
    const c = nx(), np = nx(), nl = nx();
    for (let j = 0; j < np; j++) { const o = { c, P: new Path2D(), bb: [1e9, 1e9, -1e9, -1e9], w: 0, long: 0, ang: 0 }, nr = nx(); for (let r = 0; r < nr; r++) run(o.P, o, true); out.push(o); }
    for (let j = 0; j < nl; j++) { const o = { c, P: new Path2D(), bb: [1e9, 1e9, -1e9, -1e9], w: nx() * T / 10, long: 0, ang: 0 }; run(o.P, o, false); for (let q = 0; q < 4; q++) o.bb[q] += q < 2 ? -o.w : o.w; out.push(o); }
  }
  const CR = ['wheat', 'wheat', 'plough', 'green', 'corn', 'rape', 'stubble'];
  out.forEach((o, n) => { if (o.c === LC_FARM || o.c === LC_VINE) o.crop = o.c === LC_VINE ? 'vine' : CR[((n + 7) * 2654435761 >>> 0) % CR.length]; });
  return out;
}
// the polygons that reach into ground chunk (cx, cy), in paint order
function land5At(cx, cy) {
  if (!LAND5) {
    LAND5 = b5Land();
    LAND5.forEach((o, n) => { for (let y = Math.max(0, Math.floor(o.bb[1] / CHK)); y <= Math.floor(o.bb[3] / CHK); y++) for (let x = Math.max(0, Math.floor(o.bb[0] / CHK)); x <= Math.floor(o.bb[2] / CHK); x++) { const k = y * 4096 + x; let a = LAND5G.get(k); if (!a) LAND5G.set(k, a = []); a.push(n); } });
  }
  return LAND5G.get(cy * 4096 + cx);
}
// the Faculty of Informatics of Masaryk University (Botanická 68a) is a circus: its building gives way to a striped big
// top, a smaller tent for the animals and the troupe's wagons (pieces in the same form as the real buildings')
function b5Circus(list) {
  const [ax, ay] = geo(49.21049, 16.59847), [bx, by] = geo(49.20949, 16.59989); // (the faculty's block, NW and SE corners in tiles)
  const inBlock = q => { const x = (q.bb[0] + q.bb[2]) / 2 / T, y = (q.bb[1] + q.bb[3]) / 2 / T; return x > ax && x < bx && y > ay && y < by; };
  const out = list.filter(b => !b.p.some(inBlock)), cx = (ax + bx) / 2 * T, cy = (ay + by) / 2 * T;
  const tent = (dx, dy, r, n, rh, wall, roof, nm) => ({ k: B5K.indexOf('sport'), lv: 1, rf: 4, rh, gl: 0, wc: wall, rc: roof, nm,
    p: [b5Piece(0, cx + dx * T, cy + dy * T, [Array.from({ length: n }, (_, i) => [Math.cos(i / n * TAU) * r * T, Math.sin(i / n * TAU) * r * T])])],
    circus: { stripe: '#f3eee2', rmat: null, mat: null, win: 'none', det: [], kind: 'circus', pennants: true, mmc: wall } });
  out.push(tent(0, 0, 5, 24, 14, '#b52f26', '#c8352c', 'Cirkus'), tent(6.2, 5.6, 2.4, 16, 8, '#26549c', '#2f62b4', null));
  for (const [dx, dy, a, c] of [[-8.5, -8.6, 0.05, '#c0392b'], [-5.6, -8.4, -0.04, '#f1c40f'], [-2.7, -8.7, 0.08, '#2e86c1'], [-9.2, -5.2, 1.52, '#27ae60'], [-9, -1.6, 1.6, '#8e44ad'], [6.8, -8.5, 0.02, '#e67e22']])
    out.push({ k: B5K.indexOf('shed'), lv: 1, rf: 0, rh: 0, gl: 0, wc: c, rc: '#e8e0d0', nm: null, // (a wagon)
      p: [Object.assign(b5Piece(a, cx + dx * T, cy + dy * T, [[[0, 0], [2.2 * T, 0], [2.2 * T, 0.8 * T], [0, 0.8 * T]]]), { rect: true })],
      circus: { win: 'none', det: [], mat: null, ht: 0.05, style: 'flat', mmc: c } });
  return out;
}
// which side of a real building faces the way (ux, uy): front, a side of its box in its own frame (for its sign, mill and
// searchlights), and frontE, the longest wall of its outline that faces that way (for its door)
function frontOf(b, ux, uy) {
  const f = b.fr, lx = ux * f.c + uy * f.s, ly = -ux * f.s + uy * f.c;
  b.front = Math.abs(lx) > Math.abs(ly) ? (lx > 0 ? 1 : 3) : (ly > 0 ? 2 : 0);
  if (b.lp) {
    let best = -1e9; const r = b.lp[0];
    for (let i = 0; i < r.length; i++) {
      const a = r[i], e = r[(i + 1) % r.length], ex = e[0] - a[0], ey = e[1] - a[1], L = Math.hypot(ex, ey) || 1, dt = (ey * lx - ex * ly) / L;
      const sc = dt > 0.7 ? 1000 + L : dt * 100; if (sc > best) { best = sc; b.frontE = i; }
    }
  }
}
// which tiles a piece covers (their middles inside it) and which its outline crosses
function b5Raster(q, inside, edge) {
  const [x0, y0, x1, y1] = q.bb;
  for (let ty = Math.max(0, Math.floor(y0 / T)); ty <= Math.min(MH - 1, Math.floor(y1 / T)); ty++) {
    const yc = (ty + 0.5) * T, xs = [];
    for (const r of q.wr) for (let i = 0, n = r.length, j = n - 2; i < n; j = i, i += 2) {
      const yi = r[i + 1], yj = r[j + 1];
      if ((yi > yc) !== (yj > yc)) xs.push(r[i] + (yc - yi) * (r[j] - r[i]) / (yj - yi));
    }
    xs.sort((a, b) => a - b);
    for (let m = 0; m + 1 < xs.length; m += 2) for (let tx = Math.max(0, Math.ceil(xs[m] / T - 0.5)); tx <= Math.min(MW - 1, Math.floor(xs[m + 1] / T - 0.5)); tx++) inside(ty * MW + tx);
  }
  if (edge) for (const r of q.wr) for (let i = 0, n = r.length, j = n - 2; i < n; j = i, i += 2) {
    const ax = r[j], ay = r[j + 1], dx = r[i] - ax, dy = r[i + 1] - ay, m = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 3));
    for (let t = 0; t <= m; t++) { const x = ax + dx * t / m, y = ay + dy * t / m, tx = Math.floor(x / T), ty = Math.floor(y / T); if (tx >= 0 && ty >= 0 && tx < MW && ty < MH) edge(ty * MW + tx); }
  }
}
function genMap() {
  // the city: sea along its north and west edges and the river through the middle; the countryside from its fields
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const k = y * MW + x;
    if (inCity(x, y)) { map[k] = x === 0 || y === 0 || Math.abs(y + 0.5 - riverY(x + 0.5)) < RIVER_HW ? WATER : GRASS; REG[k] = (x >= 50 ? 1 : 0) + (y + 0.5 >= riverY(x + 0.5) ? 2 : 0); }
    else { map[k] = countryTile(x, y); REG[k] = regionOf(x, y); }
    if (x === 0 || y === 0 || x === MW - 1 || y === MH - 1) map[k] = WATER;
  }
  buildNet();
  tunnelPrep();
  overPrep();
  const B5B = B5 ? b5Circus(b5Buildings()) : null, bmask = B5 ? new Uint8Array(MW * MH) : null;
  if (B5) for (const b of B5B) for (const q of b.p) b5Raster(q, k => { bmask[k] = 1; });
  // rasterise the network: distance from each tile centre to the nearest road centre line (a tunnel only where it
  // runs down to its portals: under the ground the city goes on as usual)
  dR.fill(1e9); eR.fill(-1);
  rasterLines([...EDGES.filter(e => !e.tunnel && !e.over).map(e => [e.pts, e.id, offW(e)]), ...RAMPS.map(r => [r.pts, r.e.id, offW(r.e)]), ...OVRAMPS.map(r => [r.pts, r.e.id, offW(r.e)])], dR, eR);
  if (OVERS.length) { // the decks and their ramps, and which lane points are up on a deck
    const oD = new Float32Array(MW * MH).fill(1e9);
    rasterLines(OVERS.map(e => [e.pts, e.id, offW(e)]), oD, oE);
    for (let k = 0; k < MW * MH; k++) { // (ramp or deck by how far along the overpass the tile is: short bridges have a deck too)
      if (oD[k] > 90) { oE[k] = -1; continue; }
      if (oD[k] >= 48) continue;
      const e = EDGES[oE[k]], sk = edgeS(e, (k % MW + 0.5) * T, (((k / MW) | 0) + 0.5) * T);
      ovT[k] = (e.ovA && sk < e.ovR) || (e.ovB && sk > e.len - e.ovR) ? 2 : 1;
    }
    for (const cell of LGRID.values()) for (const q of cell) if (q.L.e.over && ovT[Math.floor(q.y / T) * MW + Math.floor(q.x / T)] === 1) q.o = 1;
  }
  if (TUNNELS.length) {
    const tD = new Float32Array(MW * MH).fill(1e9), rD = new Float32Array(MW * MH).fill(1e9);
    rasterLines(TUNNELS.map(e => [e.pts, e.id, offW(e)]), tD, tE);
    rasterLines(RAMPS.map(r => [r.pts, r.e.id, offW(r.e)]), rD);
    for (let k = 0; k < MW * MH; k++) { if (tD[k] > 90) tE[k] = -1; tunT[k] = rD[k] < 48 ? 2 : tD[k] < 48 ? 1 : 0; }
    for (const cell of LGRID.values()) for (const q of cell) if (q.L.e.tunnel && tunT[Math.floor(q.y / T) * MW + Math.floor(q.x / T)] === 1) q.u = 1;
  }
  const dry = (tx, ty) => fieldAt('sb', tx, ty) > 0 || fieldAt('sd', tx, ty) > 0 ? SAND : GRASS;
  for (let k = 0; k < MW * MH; k++) {
    const e = eR[k] >= 0 ? EDGES[eR[k]] : null, tx = k % MW, ty = (k / MW) | 0, town = townAt(tx, ty);
    if (dR[k] < 32 || (B5 && map[k] === WATER && dR[k] < 56)) { if (map[k] === WATER) bridge[k] = 1; map[k] = ROAD; hwT[k] = e.hw ? 1 : 0; } // (a bridge reaches past the tiles its carriageway's middle is in)
    else if (map[k] === WATER) continue;
    else if (dR[k] < 72 && !(B5 && bmask[k])) { if (e.rural) { if (map[k] === ROCK) map[k] = dry(tx, ty); } else map[k] = e.hw ? GRASS : WALK; }
    else if (!B5 && (inCity(tx, ty) || (town && map[k] !== ROCK && !(town.beach && ty > palmY(tx) - 1)))) free[k] = 1; // (the detailed map's blocks are its real buildings)
  }
  // rock never crowds a road: clear it (in the fields the renderer reads too) within a few tiles of every road
  if (!BRNO) for (let y = 1; y < GH - 1; y++) for (let x = 1; x < GW - 1; x++) { // (Brno has no rock: its field is -9 everywhere)
    if (x < CW - 2 && y < CH - 2) continue;
    const d = Math.min(dR[(y - 1) * MW + x - 1], dR[(y - 1) * MW + x], dR[y * MW + x - 1], dR[y * MW + x]);
    if (d < 88) F.ro[y * GW + x] = Math.min(F.ro[y * GW + x], -1 - (88 - d) / 40);
  }
  // railway lines keep a clear corridor: nothing is built or planted on the tracks
  for (const R of RAILS) for (let i = 0; i < R.length - 1; i++) {
    const a = R[i], b = R[i + 1];
    for (let ty = Math.floor(Math.min(a[1], b[1]) / T) - 2; ty <= Math.floor(Math.max(a[1], b[1]) / T) + 2; ty++)
      for (let tx = Math.floor(Math.min(a[0], b[0]) / T) - 2; tx <= Math.floor(Math.max(a[0], b[0]) / T) + 2; tx++) {
        if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) continue;
        if (closestOnSeg([(tx + 0.5) * T, (ty + 0.5) * T], a, b).d < 40) { const k = ty * MW + tx; free[k] = 0; taken[k] = 1; if (map[k] === ROCK) map[k] = GRASS; }
      }
  }
  // the roundabout's island
  if (!BRNO) for (let ty = RB.y - 4; ty <= RB.y + 4; ty++) for (let tx = RB.x - 4; tx <= RB.x + 4; tx++)
    if (Math.hypot(tx + 0.5 - RB.x, ty + 0.5 - RB.y) < RB.r - 2.3) { map[ty * MW + tx] = GRASS; free[ty * MW + tx] = 0; }
  // crosswalks at signalised junctions
  for (const n of LIGHT_NODES) for (const e of n.edges) if (n.grp.has(e.id)) {
    const [ux, uy] = n.dirs.get(e.id);
    const R = Math.ceil((n.clr + e.wd / 2) / T) + 1;
    for (let ty = Math.floor(n.y / T) - R; ty <= Math.floor(n.y / T) + R; ty++) for (let tx = Math.floor(n.x / T) - R; tx <= Math.floor(n.x / T) + R; tx++) {
      const k = ty * MW + tx; if (tile(tx, ty) !== ROAD) continue;
      const px = (tx + 0.5) * T - n.x, py = (ty + 0.5) * T - n.y, al = px * ux + py * uy, lat = -px * uy + py * ux;
      if (al > n.clr - 38 && al < n.clr - 6 && Math.abs(lat) < e.wd / 2 + 2) { XW[k] = n.id + 1; XE[k] = e.id; }
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
      b.det = []; b.kit = 1; // (a plain roof: it gets its plant, vents and skylights when first drawn)
      if (b.style === 'flat') { const n = Math.floor(srnd() * 4); for (let i = 0; i < n; i++) b.det.push([0.15 + srnd() * 0.55, 0.15 + srnd() * 0.55, 0.08 + srnd() * 0.12, 0.08 + srnd() * 0.12]); }
    }
    b.top = Math.max(b.ht + (b.capH || 0), ...(b.tiers || []).map(t => t.z), b.dome ? b.ht + b.dome.h : 0);
    buildings.push(b); return b;
  };
  // ---- the detailed map's own buildings: the yards and squares around them are paved, a car park gets its markings,
  // and each OpenStreetMap building is put up as the boxes it was cut into, styled by its kind and district
  const b5Build = (list, bm) => {
    for (let k = 0; k < MW * MH; k++) if (map[k] === GRASS && !bm[k]) {
      const c = LCG[k];
      if (c === LC_URBAN || c === LC_INDUS || c === LC_PLAZA || c === LC_RAIL) map[k] = PLAZA; else if (c === LC_LOT) { map[k] = PLAZA; lotT[k] = 1; }
    }
    let grp = 0;
    const size = q => (q.lb[2] - q.lb[0]) * (q.lb[3] - q.lb[1]);
    for (const b of list) {
      grp++;
      if (!b.p.length) continue;
      const big = b.p.reduce((a, q) => size(q) > size(a) ? q : a), dist = REG[Math.floor((big.bb[1] + big.bb[3]) / 2 / T) * MW + Math.floor((big.bb[0] + big.bb[2]) / 2 / T)];
      const sd = (srnd() * 2147483647) | 0, single = b.p.length === 1;
      for (const q of b.p) {
        const o = b5Style(b, (q.lb[2] - q.lb[0]) / T, (q.lb[3] - q.lb[1]) / T, single, dist, q);
        if (b.circus) Object.assign(o, b.circus);
        o.sd = sd; o.grp = grp; o.bk = B5K[b.k]; o.lv = b.lv;
        if (b.nm && q === big) o.bname = b.nm;
        mkP(q, o);
      }
      if (b.nm && b.nm.length >= 4 && B5K[b.k] !== 'house' && B5K[b.k] !== 'flats' && B5K[b.k] !== 'shed') {
        const x0 = Math.min(...b.p.map(q => q.bb[0])) / T, y0 = Math.min(...b.p.map(q => q.bb[1])) / T, x1 = Math.max(...b.p.map(q => q.bb[2])) / T, y1 = Math.max(...b.p.map(q => q.bb[3])) / T;
        if ((x1 - x0) * (y1 - y0) >= 24) SITES.push({ name: b.nm, x0: Math.floor(x0) - 1, y0: Math.floor(y0) - 1, x1: Math.ceil(x1), y1: Math.ceil(y1), b5: 1 });
      }
    }
    // a tile whose middle a building covers is BUILD (keeping the ground it hides, for the slivers round the outline);
    // the tiles an outline crosses remember which outlines, so that collisions follow the walls exactly
    for (const b of PIECES) b5Raster(b,
      k => { if (map[k] === ROAD || map[k] === WATER) return; GU[k] = 1 + (dR[k] < 72 ? WALK : isUrbanT(k) ? PLAZA : GRASS); map[k] = BUILD; },
      k => { if (PE[k] < 0) { PE[k] = PEL.length; PEL.push([b.pi]); } else { const L = PEL[PE[k]]; if (L[L.length - 1] !== b.pi) L.push(b.pi); } });
    // what the buildings left of their tiles near a street is pavement; the rest of the built-up land is paved yard
    for (let k = 0; k < MW * MH; k++) if (bm[k] && map[k] === GRASS) map[k] = dR[k] < 72 ? WALK : isUrbanT(k) ? PLAZA : GRASS;
  };
  // one piece of a real building: a box in its own turned frame (fr), or an outline (lp) drawn as walls round a roof
  const mkP = (q, o) => {
    const b = Object.assign({ x: q.bb[0], y: q.bb[1], w: q.bb[2] - q.bb[0], h: q.bb[3] - q.bb[1], ht: 0.15, style: 'flat', win: 'grid', wall: '#8c8f93', roof: '#6e7c8c', sd: 0 }, o);
    b.fr = q.fr; b.wr = q.wr; b.lb = q.lb; b.bb = q.bb;
    if (q.rect && !b.hip && !b.pyr) Object.assign(b.fr, { x: 0, y: 0, w: q.lb[2], h: q.lb[3] }); else b.lp = q.lr;
    if (!b.det) { b.det = []; b.kit = 1; }
    if (b.lp) delete b.tiers;
    b.top = Math.max(b.ht + (b.capH || 0) + (b.pyr || 0), ...(b.tiers || []).map(t => t.z), b.dome ? b.ht + b.dome.h : 0);
    b.pi = PIECES.length; PIECES.push(b); buildings.push(b);
    return b;
  };
  const b5Style = (b, w, h, single, dist, q) => {
    const K = B5K[b.k], dst = DISTRICTS[dist] && DISTRICTS[dist].style;
    const st = K === 'house' ? 'villa' : K === 'industry' ? 'industrial' : dst === 'village' || !dst ? (K === 'flats' ? 'tenement' : 'villa') : dst;
    const o = K === 'shed' ? { style: 'flat', wall: spick(['#8a8478', '#9a9488', '#7a6e62', '#a8a094', '#b0aaa0']), roof: spick(['#5a5a5e', '#6a645c', '#7a4a3a', '#4e5256']), det: [] }
      : Object.assign({}, brnoStyle(dist, st));
    delete o.sign; delete o.neon; delete o.chimney; delete o.tiers;
    o.ht = clamp(0.012 + b.lv * 0.042, 0.035, 0.95);
    const m = Math.min(w, h), rz = b.rh * 0.013; // (the roof's own height, where it is mapped)
    const pitched = b.rf === 1 || b.rf === 2 || (b.rf < 0 && (K === 'house' || st === 'old' || st === 'villa' || o.style === 'house')); // (unmapped: as the district builds)
    delete o.cap; delete o.capH; if (o.style === 'house') o.style = 'flat';
    if (b.rf === 4 || (K === 'tower' && b.rf < 0)) { // a spire: a square one comes to a point, any other outline to a pyramid
      const sh = clamp(rz || (m <= 4 ? m * 0.03 + 0.06 : 0.03 + m * 0.006), 0.04, 0.6); // (a tower's spire is tall, an arena's cone low)
      if (q.rect && m <= 4 && Math.max(w, h) < m * 1.35) Object.assign(o, { style: 'house', cap: 'hip', capH: sh }); else o.pyr = sh;
      o.roof = m <= 4 ? '#3f4a46' : '#8a9096'; o.det = [];
    } else if (b.rf === 3) { // a dome or an onion
      o.dome = { r: m * T * 0.42, h: clamp(rz || (m < 4 ? 0.1 + m * 0.02 : m * T * 0.4 / HC), 0.04, 0.45), c: b.rc || '#6a8a7e' }; o.det = []; // (a small one is a tower's onion)
    } else if (pitched && q.rect && Math.min(w, h) <= 7 && Math.max(w, h) <= 14) {
      o.style = 'house'; o.cap = b.rf === 2 || (b.rf < 0 && srnd() < 0.4) ? 'hip' : 'gable'; o.capH = Math.min(0.075, 0.011 * m + 0.012); o.det = [];
      if (K === 'house' && srnd() < 0.5) o.chimney = true;
    } else if (pitched) { // a big or irregular pitched roof: slopes up from every wall (to a ridge, or a flat top on a wide block)
      o.hip = Math.min(0.075, 0.011 * Math.min(m, 6) + 0.012); o.det = [];
      o.roof = spick(['#9a4a34', '#a8503a', '#8a4430', '#7a5040', '#6a6a70']);
    } else if (!single || w * h < 12) o.det = [];
    if (K === 'industry') { o.style = 'ware'; o.win = 'ware'; delete o.cap; }
    else if (K === 'church') Object.assign(o, { kind: 'church', win: 'tall', wall: spick(['#d8d0c0', '#e6dcc4', '#d4cab4']), roof: o.pyr || o.cap === 'hip' ? '#3f4a46' : '#4f5a60', mat: 'stone', mmc: '#d8cfbd' });
    else if (K === 'tower') Object.assign(o, { kind: 'church', tower: 1, win: 'slit', wall: spick(['#d8d0c0', '#e6dcc4']), mat: 'stone', mmc: '#d8cfbd' });
    else if (K === 'castle') Object.assign(o, { kind: 'castle', win: 'slit', wall: '#d4cab4', roof: '#8a4632', mmc: '#d8cfbd' });
    else if (K === 'hospital') Object.assign(o, { kind: 'hospital', win: 'ribbon', wall: '#e4e8ec', roof: '#cfd6dc', mmc: '#f4f4f4' });
    else if (K === 'station') Object.assign(o, { kind: 'station', win: 'tall', wall: '#e0d8c4', roof: '#7a7e84' });
    else if (K === 'school') Object.assign(o, { kind: 'school', win: 'ribbon' });
    else if (K === 'civic') Object.assign(o, { win: 'tall', mat: 'stone' });
    else if (K === 'shop' || K === 'hotel') o.win = 'ribbon';
    else if (K === 'sport') o.win = 'none';
    if (b.gl) Object.assign(o, { style: 'glass', win: 'ribbon', wall: '#5a7a8e', roof: '#55606b', det: [] });
    if (b.wc) o.wall = b.wc; if (b.rc) { o.roof = b.rc; if (o.dome) o.dome.c = b.rc; }
    return o;
  };
  // each district has its own architecture
  const styleFor = (dist, stOver) => {
    if (BRNO) return brnoStyle(dist, stOver);
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
    if (dist === R_VILLAGE) return r < 0.78
      ? { style: 'house', wall: spick(['#efe6d2', '#e2d2b4', '#f4efe2', '#d6c4a4', '#c8d0cf']), roof: spick(['#8a3b2a', '#5a5550', '#7a4a35', '#4d5560', '#6b3a2c']), ht: 0.06 + srnd() * 0.04, cap: srnd() < 0.6 ? 'gable' : 'hip', capH: 0.04 + srnd() * 0.03, chimney: srnd() < 0.5, det: [] }
      : { style: 'flat', wall: spick(['#9a5a44', '#8a6a50', '#a87c5a']), roof: spick(['#5d5348', '#6b6158']), ht: 0.08 + srnd() * 0.05, sign: srnd() < 0.6 ? spick(['FEED', 'STORE', 'BAKERY', 'POST', 'TAVERN', 'BARBER']) : null };
    if (dist === R_ONDAS) {
      if (r < 0.2) return { style: 'flat', win: 'ribbon', wall: spick(['#e8dcc4', '#d8c8a8', '#c9b48a']), roof: spick(['#b9a07e', '#a8946e']), ht: 0.3 + srnd() * 0.22, mat: 'stucco', pool: srnd() < 0.5, neon: spick(['#ff3df0', '#ffe03d', '#3dfcff']), sign: spick(['HOTEL', 'RESORT', 'SUITES', 'SLOTS']) };
      return { style: 'flat', wall: spick(['#c9a27a', '#d8b48c', '#b98b64', '#e0c39a', '#c48a6a', '#d9a882']), roof: spick(['#b9a07e', '#a88c6c', '#c7b08e', '#9c8a70']), ht: 0.06 + srnd() * 0.07, mat: 'stucco',
        neon: srnd() < 0.5 ? spick(['#ff3df0', '#3dfcff', '#ffe03d', '#ff7a3d']) : null, sign: srnd() < 0.45 ? spick(['MOTEL', 'BAR', 'PAWN', '24/7', 'DINER', 'POKER', 'BUFFET', 'LIQUOR', 'BINGO']) : null };
    }
    if (dist === R_CORAL) {
      const pastel = spick(['#f2b8b8', '#a8dcc8', '#f6c9a0', '#a8cce8', '#f4efe2', '#f0e29a', '#d8b8e8']);
      if (r < 0.3) return { style: 'flat', win: 'ribbon', wall: pastel, roof: spick(['#e8e2d8', '#d8d2c8']), ht: 0.18 + srnd() * 0.24, pool: srnd() < 0.7, mat: 'stucco', det: [],
        sign: srnd() < 0.3 ? spick(['HOTEL', 'INN', 'SURF']) : null, neon: srnd() < 0.5 ? spick(['#3dfcff', '#ff7ab8']) : null };
      return srnd() < 0.5 ? { style: 'house', wall: pastel, roof: spick(['#c9a06a', '#d97a5a', '#8fb8c8', '#e8e2d8']), ht: 0.06 + srnd() * 0.04, cap: 'hip', capH: 0.04, mat: 'stucco', det: [] }
        : { style: 'flat', wall: pastel, roof: spick(['#e8e2d8', '#d8d2c8', '#cfc8bc']), ht: 0.06 + srnd() * 0.05, mat: 'stucco', pool: srnd() < 0.25 };
    }
    return { style: 'flat', wall: spick(['#3e3a4e', '#463e58', '#35404e', '#4a3f4f']), roof: spick(['#4b3f63', '#3e4a6a', '#45506e', '#55485e']), ht: 0.16 + srnd() * 0.2,
      neon: srnd() < 0.65 ? spick(['#ff3df0', '#3dfcff', '#ffe03d', '#7dff6a', '#ff7a3d']) : null, sign: srnd() < 0.45 ? spick(['BAR', 'HOTEL', 'Ψ', '24/7', 'CLUB', 'ARCADE', 'NOODLES', 'QUBIT', 'DINER']) : null };
  };
  // Brno: burgher houses in the old town, tenements, villas, panel estates, warehouses, villages
  const brnoStyle = (dist, over) => {
    const st = over || DISTRICTS[dist].style, r = srnd();
    if (st === 'old') return r < 0.8
      ? { style: 'house', wall: spick(['#e8d2a0', '#f0dcb4', '#e8c8b0', '#f2e6cc', '#d8c090', '#e6b8a0', '#f4ecd8', '#d0d8c8']), roof: spick(['#a8503a', '#9a4a34', '#b0583e', '#8a4430', '#6a6a70']), ht: 0.13 + srnd() * 0.07, cap: srnd() < 0.55 ? 'gable' : 'hip', capH: 0.05 + srnd() * 0.03, chimney: srnd() < 0.4, det: [] }
      : { style: 'flat', wall: spick(['#e0d0b0', '#d8c8a8', '#ece0c8']), roof: spick(['#7a6e60', '#8a7e70']), ht: 0.12 + srnd() * 0.06, sign: srnd() < 0.7 ? spick(['KAVÁRNA', 'PIVNICE', 'LÉKÁRNA', 'BISTRO', 'VINÁRNA', 'KNIHY', 'HOSPODA']) : null, neon: srnd() < 0.3 ? '#ffd27a' : null };
    if (st === 'tenement') return r < 0.55
      ? { style: 'house', wall: spick(['#d8ccb4', '#c8bca4', '#e0d0b0', '#bfb7a8', '#d4b89c', '#a8b0b4', '#e4d8c0']), roof: spick(['#9a4a34', '#6a6a70', '#8a5040', '#5a5e66']), ht: 0.15 + srnd() * 0.07, cap: 'hip', capH: 0.04 + srnd() * 0.02, det: [] }
      : { style: 'flat', wall: spick(['#d8ccb4', '#c8c0b0', '#b8b4ac', '#d0c4a8']), roof: spick(['#6e6a64', '#7a766e']), ht: 0.14 + srnd() * 0.1, sign: srnd() < 0.2 ? spick(['POTRAVINY', 'HOSPODA', 'TABÁK', 'PEKAŘSTVÍ', 'PIVO']) : null };
    if (st === 'villa') return { style: 'house', wall: spick(['#f2efe8', '#e8e0d0', '#f0e8d0', '#dcd8d0', '#e8d8c0']), roof: spick(['#a8503a', '#6a6a70', '#8a4430', '#4d5560']), ht: 0.07 + srnd() * 0.04, cap: srnd() < 0.5 ? 'gable' : 'hip', capH: 0.04 + srnd() * 0.02, chimney: srnd() < 0.5, det: [] };
    if (st === 'panel') return { style: 'flat', win: 'grid', wall: spick(['#d8d4cc', '#e0d8c8', '#c8ccd0', '#d0c8b8', '#e8dcc0', '#c8d4c8', '#e0c8b8']), roof: spick(['#7a7e84', '#8a8a88', '#6e7276']), ht: 0.3 + srnd() * 0.22, mat: 'panel', det: [] };
    if (st === 'industrial') return r < 0.65
      ? { style: 'ware', win: 'ware', wall: spick(['#7d7466', '#6f6a60', '#8a8174', '#5f6b70', '#8a8a84']), roof: spick(['#8a9096', '#9a8f80', '#6d7a82', '#a0a4a8']), ht: 0.07 + srnd() * 0.05 }
      : { style: 'flat', wall: spick(['#9a9690', '#8a8680', '#a8a098']), roof: spick(['#6e6a64', '#7a766e']), ht: 0.1 + srnd() * 0.08 };
    return r < 0.8 // a village
      ? { style: 'house', wall: spick(['#efe6d2', '#e2d2b4', '#f4efe2', '#d6c4a4', '#e8d8b0']), roof: spick(['#a8503a', '#9a4a34', '#6a6a70', '#8a4430']), ht: 0.06 + srnd() * 0.04, cap: srnd() < 0.6 ? 'gable' : 'hip', capH: 0.04 + srnd() * 0.03, chimney: srnd() < 0.5, det: [] }
      : { style: 'flat', wall: spick(['#e8dcc0', '#d8c8a8']), roof: '#6e6a64', ht: 0.07 + srnd() * 0.04, sign: srnd() < 0.6 ? spick(['POTRAVINY', 'HOSPODA', 'VINOTÉKA', 'POŠTA']) : null };
  };
  // how each kind of Brno district packs its lots (park and lot are cumulative chances for a whole block)
  // (al: how far apart, in metres, the lanes are that cut up a big block)
  const BSTY = { old: { mn: 2, mx: 4, park: 0.05, lot: 0.08, garden: 0.03 }, tenement: { mn: 3, mx: 6, park: 0.1, lot: 0.16, garden: 0.06, al: 200 },
    villa: { mn: 2, mx: 3, park: 0.12, lot: 0.14, garden: 0.35, gap: 1, al: 150 }, panel: { mn: 2, mx: 3, long: [6, 11], park: 0.18, lot: 0.3, garden: 0.2, gap: 2, al: 260 },
    industrial: { mn: 4, mx: 8, park: 0.04, lot: 0.3, garden: 0.08, al: 300 }, village: { mn: 2, mx: 4, park: 0.12, lot: 0.16, garden: 0.3, al: 150 } };
  const tree = (x, y, r = 10 + srnd() * 5, sp) => trees.push({ x: x * T, y: y * T, r, sp });
  const palm = (x, y) => tree(x, y, 11 + srnd() * 4, 8 + (srnd() * 2 | 0));
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
  const rural = (name, x, y, w, h, ground) => { // claim a w x h patch of open land
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      const k = j * MW + i; taken[k] = 1; free[k] = 0;
      if (map[k] === ROAD) continue;
      if (ground === 'yard' || ground === 'lot') { map[k] = PLAZA; lotT[k] = ground === 'yard' ? 2 : 1; } else if (ground === 'plaza') map[k] = PLAZA; else if (map[k] === ROCK) map[k] = GRASS;
    }
    for (let j = y - 1; j <= y + h + 1; j++) for (let i = x - 1; i <= x + w + 1; i++) if (i >= 0 && j >= 0 && i < GW && j < GH) F.ro[j * GW + i] = Math.min(F.ro[j * GW + i], -1.5);
    if (name) SITES.push({ name, x0: x, y0: y, x1: x + w - 1, y1: y + h - 1 });
  };
  if (B5) b5Build(B5B, bmask);
  // ---- landmark helpers, shared by both maps
  const gasStation = (name, cx, cy, sign = '24/7', brand = BRNO ? 'BENZÍN' : 'QUBIT') => {
    const a = site(name, cx, cy); if (!a) return;
    const [x, y] = a;
    fill(x, y, 8, 8, PLAZA);
    mkB(x + 5, y + 5, 3, 3, { kind: 'shop', win: 'ribbon', wall: '#e8e2d4', roof: '#c9302c', ht: 0.08, det: [], sign, neon: '#ffe03d' });
    mkB(x + 1, y + 1, 5, 3, { canopy: true, style: 'canopy', win: 'none', wall: '#d32f2f', roof: '#f2f2f2', ht: 0.1, det: [], brand });
    for (let i = 0; i < 3; i++) prop('pump', x + 2 + i * 1.5, y + 2.5);
    lamp(x + 2.5, y + 2.5, 60, 'rgba(255,255,255,1)'); lamp(x + 4.5, y + 2.5, 60, 'rgba(255,255,255,1)');
  };
  const clinic = (name, cx, cy) => {
    const a = site(name, cx, cy, 5, 4); if (!a) return;
    fill(a[0], a[1], 5, 4, PLAZA);
    mkB(a[0], a[1], 4, 3, { kind: 'cross', win: 'ribbon', wall: '#e4e8ec', roof: '#cfd6dc', ht: 0.12, det: [], mmc: '#f4f4f4' });
    CLINICS.push(name); lamp(a[0] + 4.5, a[1] + 3.5, 50);
  };
  const sheriff = (name, cx, cy) => {
    const a = site(name, cx, cy, 5, 4); if (!a) return;
    fill(a[0], a[1], 5, 4, PLAZA);
    mkB(a[0], a[1], 4, 3, { kind: 'police', win: 'ribbon', wall: '#5a6f8e', roof: '#64789a', ht: 0.12, det: [], mmc: '#3d6fd8' });
    fixedParked.push({ type: 'police', x: (a[0] + 4.5) * T, y: (a[1] + 1.5) * T, a: Math.PI / 2 });
    SHERIFFS.push(name); lamp(a[0] + 2, a[1] + 3.5, 50);
  };
  const casino = (name, cx, cy, o) => {
    const a = site(name, cx, cy); if (!a) return;
    const [x, y] = a;
    fill(x, y, 8, 8, PLAZA);
    mkB(x + 1, y + 1, 6, 5, Object.assign({ kind: 'casino', win: 'ribbon', det: [], mmc: o.neon }, o));
    prop('fountain', x + 4, y + 7, { r: 16 });
    palm(x + 0.5, y + 7.4); palm(x + 7.5, y + 7.4); palm(x + 0.5, y + 0.6); palm(x + 7.5, y + 0.6);
    lamp(x + 2, y + 7, 60, o.neon); lamp(x + 6, y + 7, 60, o.neon);
  };
  // a strip club on an s x s lot: a bw x bw box at the back with neon under its eaves and chaser bulbs round the roof,
  // and in front (on the side of the lot with the most road along it) its door, a red carpet between velvet ropes,
  // a sports car and a waiting taxi
  const club = (at, s, bw, o) => {
    const [x, y] = at, g = (s - bw) / 2;
    fill(x, y, s, s, PLAZA);
    let front = 2, best = -1;
    for (let f = 0; f < 4; f++) { // 0 north, 1 east, 2 south, 3 west (as drawBox numbers the walls)
      let n = 0;
      for (let t = 0; t < s; t++) for (let d = 1; d <= 4; d++) {
        const i = f === 1 ? x + s - 1 + d : f === 3 ? x - d : x + t, j = f === 2 ? y + s - 1 + d : f === 0 ? y - d : y + t;
        if (i >= 0 && j >= 0 && i < MW && j < MH && map[j * MW + i] === ROAD) { n += 5 - d; break; }
      }
      if (n > best) { best = n; front = f; }
    }
    const [bx, by] = [[x + g, y + s - bw], [x, y + g], [x + g, y], [x + s - bw, y + g]][front];
    mkB(bx, by, bw, bw, Object.assign({ kind: 'club', det: [], front, mmc: o.neon }, o));
    const nx = [0, 1, 0, -1][front], ny = [-1, 0, 1, 0][front], tx = -ny, ty = nx; // out of the door, and along the front
    const cx = x + s / 2 + nx * bw / 2, cy = y + s / 2 + ny * bw / 2, len = s - bw; // the middle of the strip in front
    prop('carpet', cx, cy, { len, nx, ny });
    const fa = Math.atan2(ty, tx);
    fixedParked.push({ type: 'sports', x: (cx + tx * 1.9) * T, y: (cy + ty * 1.9) * T, a: fa }, { type: 'taxi', x: (cx - tx * 1.9) * T, y: (cy - ty * 1.9) * T, a: fa + Math.PI });
    const fx = cx - nx * (len / 2 - 0.3), fy = cy - ny * (len / 2 - 0.3); // just outside the door
    lamp(fx + tx * 0.7, fy + ty * 0.7, 50, o.neon); lamp(fx - tx * 0.7, fy - ty * 0.7, 50, o.neon);
  };
  // the Atom Array Lab, a neutral-atom quantum computer laid out as a 15 x 8 yard, west to east: storage (stalls that fill
  // at random, like a freshly loaded array of traps), the entangling zone under the global Rydberg laser, and the
  // readout bay with its camera, next to the control hut where the AOD console is
  const atomLab = ([x, y]) => {
    fill(x, y, 15, 8, PLAZA);
    const zone = (kind, x0, y0, x1, y1, o) => { const z = Object.assign({ kind, x0: x0 * T, y0: y0 * T, x1: x1 * T, y1: y1 * T }, o); ZONES.push(z); return z; };
    const store = zone('store', x, y, x + 5, y + 8), ent = zone('ent', x + 5, y + 0.5, x + 10, y + 7.5, { period: 15, t: 15 }), read = zone('read', x + 10, y + 2, x + 15, y + 8, { t: 4 });
    const stalls = [];
    for (const [ry, a] of [[1.3, Math.PI / 2], [6.7, -Math.PI / 2]]) {
      prop('stalls', x + 0.3, y + ry, { n: 4, sp: 1.1 });
      for (let i = 0; i < 4; i++) { const sp = { x: (x + 0.3 + (i + 0.5) * 1.1) * T, y: (y + ry) * T, a, store: true }; parkSpots.push(sp); stalls.push(sp); }
    }
    mkB(x + 13, y, 2, 2, { kind: 'lab', win: 'ribbon', wall: '#dfe3ea', roof: '#9aa3ae', ht: 0.08, det: [], sign: 'AOD', neon: '#b388ff', mmc: '#b388ff' });
    const con = { x: (x + 13.5) * T, y: (y + 2.45) * T };
    CONSOLES.push(con);
    prop('mast', x + 12.5, y + 5);
    lamp(x + 7.5, y + 4, 70, '#b388ff'); lamp(x + 2.5, y + 4, 60);
    ATOM_LAB = { store, ent, read, stalls, con };
  };
  if (!BRNO) {
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
    for (let j = y + 4; j < y + 8; j++) for (let i = x; i < x + 8; i++) lotT[j * MW + i] = 1;
    for (const ry of [5.05, 6.95]) {
      prop('stalls', x, y + ry, { n: 8, sp: 1 });
      for (let i = 0; i < 8; i++) parkSpots.push({ x: (x + i + 0.5) * T, y: (y + ry) * T, a: ry < 6 ? Math.PI / 2 : -Math.PI / 2 });
    }
    lamp(x + 2, y + 6, 70); lamp(x + 6, y + 6, 70);
  }
  // the strip club on the Neon Strip, with searchlights sweeping the sky at night
  if ((at = site('The Naked Singularity', 68, 57, 6, 6))) club(at, 6, 4, { wall: '#2c1a3c', roof: '#3a2650', ht: 0.11, win: 'none', mat: 'stucco', neon: '#ff3df0', sign: 'GIRLS', beams: true });
  // ---- the towns' landmarks claim their lots before the blocks fill in
  // Bell's Crossing
  if ((at = site("Bell's Chapel", 142.5, 63.5, 6, 7))) {
    const [x, y] = at, st = { kind: 'church', win: 'tall', wall: '#ece6da', roof: '#5b6470', ht: 0.1, cap: 'gable', capH: 0.07, det: [] };
    mkB(x + 1, y + 1, 2, 4, { ...st, axis: 'y', mmc: '#d8cfbd' });
    mkB(x + 1, y + 5, 2, 2, { ...st, ht: 0.22, cap: 'hip', capH: 0.22, cross: true, win: 'slit' });
    for (let i = 0; i < 6; i++) prop('grave', x + 3.8 + (i % 2) * 0.9, y + 1.5 + Math.floor(i / 2) * 1.2);
    tree(x + 5.4, y + 6.3, 11);
  }
  gasStation('Crossing Gas', 157.5, 63.5, 'GAS');
  clinic('Valley Clinic', 142, 77); sheriff("Sheriff's Office", 142, 81.5);
  if ((at = site('Crossing Diner', 157.5, 77, 5, 4))) { fill(at[0], at[1], 5, 4, PLAZA); mkB(at[0], at[1], 5, 3, { kind: 'shop', win: 'ribbon', wall: '#e8e2d4', roof: '#b8312c', ht: 0.07, det: [], sign: 'DINER', neon: '#ff3df0' }); }
  // Las Ondas
  casino('The Golden Qubit', 199, 35, { style: 'glass', wall: '#c9a54a', roof: '#8a7340', ht: 0.5, tiers: [{ i: 14, z: 0.62 }], antenna: 0.1, neon: '#ffe03d', sign: 'QUBIT' });
  casino('Lucky Electron', 214.5, 35, { wall: '#262b36', roof: '#1d2430', ht: 0.05, cap: 'hip', capH: 0.42, neon: '#3dfcff', mat: 'glass', rmat: null });
  casino("Schrödinger's Palace", 199, 49, { wall: '#e8dcc0', roof: '#c8b890', ht: 0.2, dome: { r: 64, h: 0.2, c: '#d9b44a' }, neon: '#ff3df0' });
  casino('Wavefunction Casino', 214.5, 49, { wall: '#4a2f5a', roof: '#5a3d6e', ht: 0.18, neon: '#ff3df0', sign: 'CASINO', det: [[0.08, 0.15, 0.12, 0.2], [0.78, 0.6, 0.12, 0.2]] });
  if ((at = site('Born Rule Chapel', 192, 62, 4, 4))) { fill(at[0], at[1], 4, 4, PLAZA); mkB(at[0], at[1], 4, 3, { kind: 'shop', win: 'tall', wall: '#f4efe6', roof: '#e2dbcf', ht: 0.08, det: [], sign: 'WEDDINGS', neon: '#ff7ab8' }); }
  gasStation('Desert Rose Gas', 199.5, 63, 'GAS');
  clinic('Ondas Clinic', 212, 61); sheriff('Ondas Police', 218.5, 61);
  // Coral Bay
  if ((at = site('Coral Grand Hotel', 154, 176))) {
    const [x, y] = at;
    fill(x, y, 8, 8, PLAZA);
    mkB(x + 1, y + 1, 6, 5, { kind: 'hotel', win: 'ribbon', wall: '#f2b8b8', roof: '#ece6dc', ht: 0.46, pool: true, det: [], sign: 'HOTEL', neon: '#ff7ab8', mat: 'stucco', mmc: '#f2b8b8' });
    palm(x + 0.5, y + 7.4); palm(x + 7.5, y + 7.4); prop('fountain', x + 4, y + 7, { r: 14 });
  }
  clinic('Coral Bay Clinic', 137, 159); sheriff('Coral Bay Police', 169, 159);
  gasStation('Coral Gas', 124, 175, 'GAS');
  } else { // ---- Brno's landmarks, each near its real position (moved a little if a road is in the way)
    let at;
    const spot = (tx, ty, w, h, nearRail) => { // the nearest w x h patch around (tx, ty) clear of roads, water, buildings and other landmarks
      let best = null, bd = 1e9;
      const R = Math.round(14 * BK);
      for (let y = Math.round(ty - h / 2) - R; y <= Math.round(ty - h / 2) + R; y++) for (let x = Math.round(tx - w / 2) - R; x <= Math.round(tx - w / 2) + R; x++) {
        const d = Math.hypot(x + w / 2 - tx, y + h / 2 - ty); if (d >= bd || x < 2 || y < 2 || x + w > MW - 2 || y + h > MH - 2) continue;
        let ok = true;
        for (let j = y; ok && j < y + h; j++) for (let i = x; i < x + w; i++) { const k = j * MW + i, t = map[k]; if (t === ROAD || t === WATER || t === BUILD || t === ROCK || (taken[k] && !(nearRail && t !== PLAZA))) { ok = false; break; } }
        if (ok) { bd = d; best = [x, y]; }
      }
      return best;
    };
    const place = (name, lat, lon, w, h, ground = 'plaza', nearRail) => { const [gx, gy] = geo(lat, lon), a = spot(gx, gy, w, h, nearRail); if (!a) { console.warn('no room for', name); return null; } rural(name, a[0], a[1], w, h, ground); return a; };
    const stoneW = '#d4cab4', stoneR = '#8a4632';
    if (B5) {
      const near = (tx, ty, ok, R = 24) => { for (let r = 0; r <= R; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const x = tx + dx, y = ty + dy; if (x > 1 && y > 1 && x < MW - 2 && y < MH - 2 && ok(y * MW + x)) return [x, y]; } return null; };
      const atGeo = (lat, lon, ok, R) => { const [gx, gy] = geo(lat, lon); return near(Math.round(gx), Math.round(gy), ok, R); };
      // (the buildings by cell, by group and by name, made the first time they are asked for: none come or go in here)
      let GI = null, GR = null, GN = null;
      const groupOf = g => { if (!GR) { GR = new Map(); for (const b of buildings) { const L = GR.get(b.grp); if (L) L.push(b); else GR.set(b.grp, [b]); } } return GR.get(g).slice(); };
      const byName = nm => { if (!GN) { GN = new Map(); for (const b of buildings) if (!GN.has(b.bname)) GN.set(b.bname, b); } return GN.get(nm); };
      const groupNear = (x, y, r) => { // the whole building (all its boxes) nearest a point
        if (!GI) GI = cellIndex(buildings, b => [b.x, b.y, b.x + b.w, b.y + b.h]);
        let best = null, bd = r * r;
        for (const b of cellQuery(GI, (x - r) * T, (y - r) * T, (x + r) * T, (y + r) * T)) { const dx = Math.max(b.x / T - x, 0, x - (b.x + b.w) / T), dy = Math.max(b.y / T - y, 0, y - (b.y + b.h) / T), d = dx * dx + dy * dy; if (d < bd) { bd = d; best = b; } }
        return best ? groupOf(best.grp) : [];
      };
      const rectOf = bs => ({ x0: Math.min(...bs.map(b => b.x / T)), y0: Math.min(...bs.map(b => b.y / T)), x1: Math.max(...bs.map(b => (b.x + b.w) / T)) - 1, y1: Math.max(...bs.map(b => (b.y + b.h) / T)) - 1 });
      const biggest = bs => bs.reduce((a, b) => b.w * b.h > a.w * a.h ? b : a);
      const paved = k => (map[k] === PLAZA || map[k] === WALK) && !taken[k];
      const park = (bs, type, n) => { const r = rectOf(bs); for (let i = 0; i < n; i++) { const t = near(Math.round((r.x0 + r.x1) / 2) + i * 2, r.y1 + 2, paved, 14); if (t) { taken[t[1] * MW + t[0]] = 1; fixedParked.push({ type, x: (t[0] + 0.5) * T, y: (t[1] + 0.5) * T, a: Math.PI / 2 }); } } };
      // FIT BUT: the old Carthusian monastery and the new wings on Božetěchova
      const [fx, fy] = geo(49.2266, 16.5957), fit = buildings.filter(b => Math.hypot((b.x + b.w / 2) / T - fx, (b.y + b.h / 2) / T - fy) < 26 && b.ht > 0.06 && (b.kind === 'school' || b.kind === 'church'));
      if (fit.length) {
        for (const b of fit) b.mmc = '#00a9e0';
        const flat = fit.filter(b => !b.hip && !b.cap && !b.pyr && !b.dome), fb = biggest(flat.length ? flat : fit); Object.assign(fb, { sign: 'FIT', neon: '#00a9e0', plate: true, det: [], kit: 0 }); // (on its biggest flat roof)
        const r = rectOf(fit); SITES.unshift({ name: 'FIT BUT', x0: Math.floor(r.x0), y0: Math.floor(r.y0), x1: Math.ceil(r.x1), y1: Math.ceil(r.y1) }); // (first: it names the place before its buildings do)
        const cx0 = (fb.x + fb.w / 2) / T, cy0 = (fb.y + fb.h / 2) / T, rt = near(Math.round(cx0), Math.round(cy0), k => map[k] === ROAD, 30);
        if (rt) { // at its door on the street: the faculty's flag, a blue lamp and a bench
          let ux = rt[0] + 0.5 - cx0, uy = rt[1] + 0.5 - cy0; const l = Math.hypot(ux, uy) || 1; ux /= l; uy /= l;
          let d = 0; while (d < 30 && solidAt((cx0 + ux * d) * T, (cy0 + uy * d) * T)) d += 0.25;
          const gx = cx0 + ux * (d + 0.8), gy = cy0 + uy * (d + 0.8);
          if (!solidAt(gx * T, gy * T)) {
            prop('flag', gx - uy * 1.2, gy + ux * 1.2, { c: '#00a9e0' }); lamp(gx + uy * 1.2, gy - ux * 1.2, 60, '#00a9e0'); prop('bench', gx + uy * 2.4, gy - ux * 2.4);
            let a = Math.atan2(uy, ux) + Math.PI / 2; if (Math.cos(a) < 0) a += Math.PI;
            prop('banner', gx + ux * 0.6, gy + uy * 0.6, { a, w: 3.1 * T, text: 'FIT VUT', c: '#00a9e0' }); // (its name over the way in)
          }
        }
      }
      // the squares of the old town
      let at;
      if ((at = atGeo(49.19480, 16.60859, k => map[k] === PLAZA))) { prop('orloj', at[0] + 0.5, at[1] + 0.5); prop('statue', at[0] + 3.5, at[1] - 1.5); lamp(at[0] + 2, at[1] + 2, 55); SITES.unshift({ name: 'Náměstí Svobody', x0: at[0] - 4, y0: at[1] - 4, x1: at[0] + 4, y1: at[1] + 4 }); }
      if ((at = atGeo(49.1922, 16.6089, k => map[k] === PLAZA))) { prop('market', at[0] - 1, at[1] + 0.5); prop('market', at[0] + 2, at[1] + 0.5); prop('fountain', at[0] + 0.5, at[1] + 3, { r: 18 }); }
      // hospitals, police stations and fire stations: the real buildings, with their vehicles outside
      for (const [am, name, px, py] of BRNO_DATA.pois) {
        if (am !== 'hospital' && am !== 'police' && am !== 'fire_station') continue;
        const bs = groupNear(px, py, 8); if (!bs.length) continue;
        const r = rectOf(bs), nm = name || (am === 'hospital' ? 'Nemocnice' : am === 'police' ? 'Policie' : 'Hasiči'), hb = biggest(bs);
        // (an office inside a station, a church or a big block is not the building's whole story: leave those be)
        if (['station', 'church', 'castle'].includes(hb.kind) || bs.reduce((a, b) => a + b.w * b.h, 0) > 600 * T * T) continue;
        const look = am === 'hospital' ? { wall: '#e4e8ec', roof: '#cfd6dc', mmc: '#f4f4f4' } : am === 'police' ? { wall: '#5a6f8e', roof: '#64789a', mmc: '#3d6fd8' } : { wall: '#a23a2c', roof: '#7d3a30', mmc: '#d84a3a' };
        for (const b of bs) Object.assign(b, look, { win: am === 'fire_station' && b === hb ? 'bays' : 'ribbon' });
        hb.kind = am === 'hospital' ? 'hospital' : am === 'police' ? 'police' : 'fire'; // (its sign or helipad on the biggest part only)
        if (am === 'hospital') { if (hb.w * hb.h >= 16 * T * T) { hb.heli = true; hb.det = []; delete hb.kit; } park(bs, 'ambulance', 2); }
        else park(bs, am === 'police' ? 'police' : 'firetruck', am === 'police' ? 2 : 1);
        if (!SITES.some(q => q.name === nm)) SITES.unshift({ name: nm, x0: r.x0 - 1, y0: r.y0 - 1, x1: r.x1 + 1, y1: r.y1 + 1 });
        if (am === 'hospital' && name !== 'Úrazová nemocnice v Brně') CLINICS.push(nm);
        if (am === 'police' && name !== 'Krajské ředitelství Policie Jihomoravského kraje' && SHERIFFS.length < 10 && /Policie/.test(nm)) SHERIFFS.push(nm);
      }
      // the Moulin Rouge: the house on the corner of Slovákova and Kounicova, pink again, with its mill and red carpet
      const mr = (() => { const [x, y] = geo(49.2008, 16.6026); return groupNear(x, y, 10); })();
      if (mr.length) {
        const mb = biggest(mr), r = rectOf(mr);
        for (const b of mr) Object.assign(b, { kind: 'club', wall: '#e48cb2', roof: '#9a4a66', neon: '#ff2a55', win: 'tall', mat: 'stucco', mmc: '#ff2a55', det: [] });
        const cx0 = (mb.x + mb.w / 2) / T, cy0 = (mb.y + mb.h / 2) / T, rt = near(Math.round(cx0), Math.round(cy0), k => map[k] === ROAD, 30); // (it faces the nearest street)
        let ux = 0, uy = 1; if (rt) { ux = rt[0] + 0.5 - cx0; uy = rt[1] + 0.5 - cy0; const l = Math.hypot(ux, uy) || 1; ux /= l; uy /= l; }
        for (const b of mr) frontOf(b, ux, uy);
        Object.assign(mb, { sign: 'MOULIN ROUGE', mill: true });
        SITES.unshift({ name: 'Moulin Rouge', x0: r.x0 - 1, y0: r.y0 - 1, x1: r.x1 + 1, y1: r.y1 + 1 });
        let d = 0; while (d < 30 && solidAt((cx0 + ux * d) * T, (cy0 + uy * d) * T)) d += 0.25; // (the carpet from its door to the kerb)
        const cx = cx0 + ux * (d + 1), cy = cy0 + uy * (d + 1);
        prop('carpet', cx, cy, { len: 2, nx: ux, ny: uy }); lamp(cx - uy * 0.8, cy + ux * 0.8, 50, '#ff2a55'); lamp(cx + uy * 0.8, cy - ux * 0.8, 50, '#ff2a55');
      }
      // the circus where the Faculty of Informatics was: a banner over the way in from Botanická (to the west, where the
      // faculty's door was), coloured bulbs round the big top
      const ct = buildings.find(b => b.bname === 'Cirkus');
      if (ct) {
        const cx0 = (ct.bb[0] + ct.bb[2]) / 2 / T, cy0 = (ct.bb[1] + ct.bb[3]) / 2 / T, R = (ct.bb[2] - ct.bb[0]) / 2 / T;
        const rt = near(Math.round(cx0), Math.round(cy0), k => map[k] === ROAD && k % MW < cx0 - R, 40);
        let ux = 1, uy = 0; if (rt) { ux = rt[0] + 0.5 - cx0; uy = rt[1] + 0.5 - cy0; const l = Math.hypot(ux, uy) || 1; ux /= l; uy /= l; }
        let a = Math.atan2(uy, ux) + Math.PI / 2; if (Math.cos(a) < 0) a += Math.PI; // (its words the right way up)
        prop('banner', cx0 + ux * (R + 1.8), cy0 + uy * (R + 1.8), { a, w: 3.4 * T, text: 'CIRKUS', c: '#c0392b' });
        for (let i = 0; i < 12; i++) { const t = i / 12 * TAU; lamp(cx0 + Math.cos(t) * (R + 0.8), cy0 + Math.sin(t) * (R + 0.8), 44, ['#ff5a5a', '#ffd84d', '#5ab0ff', '#7dff8a'][i % 4]); }
      }
      // ---- the city's landmarks: the real buildings where they stand, made to look like themselves (towers, spires and
      // domes come from OpenStreetMap where it maps them; the Old Town Hall's tower and the churches' other towers are added)
      const named = nm => { const b = byName(nm); return b ? groupOf(b.grp) : []; };
      const nearG = (lat, lon, r = 3) => { const [x, y] = geo(lat, lon); return groupNear(x, y, r); };
      const pieceAt = (lat, lon, r = 3) => { // (the piece the point is in, else the nearest)
        const [x, y] = geo(lat, lon), px = x * T, py = y * T; let best = null, bd = (r * T) ** 2;
        for (const b of buildings) if (b.wr) {
          if (px > b.x && px < b.x + b.w && py > b.y && py < b.y + b.h && inRings(b.wr, px, py)) return b;
          const dx = Math.max(b.x - px, 0, px - b.x - b.w), dy = Math.max(b.y - py, 0, py - b.y - b.h), d = dx * dx + dy * dy; if (d < bd) { bd = d; best = b; }
        }
        return best;
      };
      const look = (bs, o) => { for (const b of bs) Object.assign(b, o); };
      const site5 = (name, bs, pad = 1) => { // (named after its OpenStreetMap name until now: renamed)
        if (!bs.length) return;
        const r = rectOf(bs), nm = new Set(bs.map(b => b.bname).filter(Boolean));
        for (let i = SITES.length - 1; i >= 0; i--) if (SITES[i].b5 && nm.has(SITES[i].name)) SITES.splice(i, 1);
        if (!SITES.some(q => q.name === name)) SITES.unshift({ name, x0: Math.floor(r.x0) - pad, y0: Math.floor(r.y0) - pad, x1: Math.ceil(r.x1) + pad, y1: Math.ceil(r.y1) + pad });
      };
      const loc = (b, x, y) => { const f = b.fr, dx = x - f.ox, dy = y - f.oy; return [dx * f.c + dy * f.s, -dx * f.s + dy * f.c]; };
      const addTower = (b, x, y, s, ht, capH, o = {}) => { const [u, v] = loc(b, x, y); (b.towers || (b.towers = [])).push(Object.assign({ u, v, s, ht, capH }, o)); b.top = Math.max(b.top, ht + capH); };
      const spire = (b, ht, sh) => { if (!b) return; b.ht = ht; if (b.cap) b.capH = sh; else b.pyr = sh; b.top = ht + sh; };
      // BUT's other faculties: their buildings (those standing in the faculty's grounds as OpenStreetMap maps them, else the
      // nearest) in the faculty's colour on the map, its letters on the biggest flat roof, and at its door its flag and a lamp
      for (const [abbr, key, col, lat, lon] of FACULTIES) {
        if (abbr === 'FIT') continue;
        const polys = (BRNO_DATA.unis || []).filter(([n]) => n.includes(key)).map(([, f]) => f.map(v => v * T));
        let bs = buildings.filter(b => b.wr && b.ht > 0.06 && polys.some(r => inRings([r], b.x + b.w / 2, b.y + b.h / 2)));
        if (!bs.length) { const [x, y] = geo(lat, lon); bs = groupNear(x, y, 4); }
        if (!bs.length) continue;
        look(bs, { mmc: col });
        const area = b => b.lp ? b.lp.reduce((a, r) => a + r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2, 0) : b.lb ? (b.lb[2] - b.lb[0]) * (b.lb[3] - b.lb[1]) : b.w * b.h;
        const most = list => list.reduce((a, b) => Math.abs(area(b)) > Math.abs(area(a)) ? b : a); // (by its real footprint, not its box)
        const flat = bs.filter(b => !b.hip && !b.cap && !b.pyr && !b.dome), fb = most(flat.length ? flat : bs); Object.assign(fb, { sign: abbr, neon: col, plate: true, det: [], kit: 0 });
        site5(abbr + ' BUT', bs, 0);
        const cx0 = (fb.x + fb.w / 2) / T, cy0 = (fb.y + fb.h / 2) / T, rt = near(Math.round(cx0), Math.round(cy0), k => map[k] === ROAD, 30);
        if (rt) {
          let ux = rt[0] + 0.5 - cx0, uy = rt[1] + 0.5 - cy0; const l = Math.hypot(ux, uy) || 1; ux /= l; uy /= l;
          let d = 0; while (d < 30 && solidAt((cx0 + ux * d) * T, (cy0 + uy * d) * T)) d += 0.25;
          const gx = cx0 + ux * (d + 0.8), gy = cy0 + uy * (d + 0.8);
          if (!solidAt(gx * T, gy * T)) { // (and its name on a banner over the way in, the right way up)
            prop('flag', gx - uy * 1.2, gy + ux * 1.2, { c: col }); lamp(gx + uy * 1.2, gy - ux * 1.2, 60, col);
            let a = Math.atan2(uy, ux) + Math.PI / 2; if (Math.cos(a) < 0) a += Math.PI;
            prop('banner', gx + ux * 0.6, gy + uy * 0.6, { a, w: ((abbr.length + 4) * 0.3 + 0.8) * T, text: abbr + ' VUT', c: col });
          }
        }
      }
      let g;
      if ((g = named('Stará radnice')).length) { // the Old Town Hall and its tower over the gate on Radnická
        look(g, { wall: '#e8dcc0', win: 'tall', mmc: '#e8dcc0' });
        const [x, y] = geo(49.1929, 16.6080), hb = g.find(b => inRings(b.wr, x * T, y * T)) || biggest(g);
        addTower(hb, x * T, y * T, 1.8 * T, 0.8, 0.26, { roof: '#4f6a5c', wall: '#e4d8bc', cross: false });
        site5('Stará radnice', g);
      }
      if ((g = named('svatý Petr a Pavel')).length) { look(g, { wall: '#d8cdb4', mmc: '#d8cfbd' }); site5('Katedrála sv. Petra a Pavla', g); }
      if ((g = named('sv. Jakub Starší')).length) { site5('Kostel sv. Jakuba', g); const t = pieceAt(49.19649, 16.60792, 1); if (t && t.tower) spire(t, 0.78, 0.5); }
      if ((g = named('svatý Tomáš apoštol')).length) site5('Kostel sv. Tomáše', g);
      if ((g = named('J. A. Komenského')).length) { look(g, { wall: '#9a3e2c', mat: 'brick', mmc: '#b0503a' }); site5('Červený kostel', g); }
      if ((g = nearG(49.1946, 16.5996, 2)).length && g[0].kind === 'castle') { look(g, { wall: '#d6ccb6', mmc: '#d8cfbd' }); site5('Hrad Špilberk', g, 2); }
      if ((g = nearG(49.19114, 16.61307, 1)).length && g[0].kind === 'station') { biggest(g).sign = 'HLAVNÍ NÁDRAŽÍ'; site5('Hlavní nádraží', g); }
      if ((g = nearG(49.17586, 16.60562, 1)).length) { look(g, { style: 'glass', win: 'ribbon', wall: '#5f8aa6', roof: '#4a5560', det: [], kit: 0, mmc: '#6fa0c8' }); Object.assign(biggest(g), { antenna: 0.16, sign: 'AZ', neon: '#6fd0ff' }); site5('AZ Tower', g); }
      let pz = pieceAt(49.18956, 16.57519, 2); // Výstaviště: Pavilion Z's great dome, and Pavilion A's
      if (pz) { Object.assign(pz, { ht: 0.18, dome: { r: 1e4, h: 0.34, c: '#b4c0c8' }, wall: '#dfe3e6', roof: '#c8d0d6', win: 'ribbon', mmc: '#c8d4e0', det: [], kit: 0 }); pz.top = 0.55; site5('Pavilon Z', [pz]); }
      if ((pz = pieceAt(49.18764, 16.5820, 2))) { Object.assign(pz, { dome: { r: 1e4, h: 0.16, c: '#9fb8c8' }, mmc: '#c8d4e0', det: [], kit: 0 }); pz.top = pz.ht + 0.2; site5('Pavilon A', [pz]); }
      if ((g = named('Vila Tugendhat')).length) { look(g, { wall: '#f4f2ec', roof: '#e2e0da', win: 'ribbon', mmc: '#f4f2ec' }); site5('Vila Tugendhat', g); }
      if ((g = named('Mahenovo divadlo')).length) look(g, { win: 'columns', wall: '#e8dcc6' });
      if ((g = named('Janáčkovo divadlo')).length) look(g, { wall: '#ecebe6', win: 'ribbon' });
      if ((g = nearG(49.2040, 16.5838, 4)).length) site5('Hvězdárna a planetárium', g);
      if ((g = named('Winning Group Arena')).length) { look(g, { wall: '#c8ccd0', roof: '#9aa2aa' }); site5('Hala Rondo', g); }
      for (const [nm, sign, neon] of [['Grandhotel Brno', 'GRANDHOTEL', '#ffd27a'], ['International', 'INTERNATIONAL', '#7ad0ff'], ['Vaňkovka', 'VAŇKOVKA', '#3dfcff']])
        if ((g = named(nm)).length) Object.assign(biggest(g), { sign, neon });
      for (const b of [...named('Chladicí věž u Královopolské strojírny'), pieceAt(49.19541, 16.62042, 1)]) if (b) Object.assign(b, { wall: '#b4aea2', roof: '#2a2a2c', win: 'none', det: [], kit: 0 }); // (cooling towers: open at the top)
      // every other big church without a mapped tower gets one over its west front (or its north one, if it runs north and south)
      const towers = buildings.filter(b => b.tower);
      for (const b of buildings) {
        if (!b.wr || b.kind !== 'church' || b.tower || b.towers || b.pyr || b.cap === 'hip') continue;
        const [u0, v0, u1, v1] = b.lb, lu = u1 - u0, lv = v1 - v0, long = Math.max(lu, lv), short = Math.min(lu, lv);
        if (long < 7 * T || short < 3 * T || towers.some(t => t.x < b.x + b.w + T && t.x + t.w > b.x - T && t.y < b.y + b.h + T && t.y + t.h > b.y - T)) continue;
        const f = b.fr, alongU = lu >= lv, dx = alongU ? f.c : -f.s, dy = alongU ? f.s : f.c, s = clamp(short * 0.36, 1.4 * T, 2.6 * T);
        const lo = Math.abs(dx) >= Math.abs(dy) ? dx > 0 : dy > 0, a = (alongU ? (lo ? u0 : u1) : (lo ? v0 : v1)) + (lo ? 1 : -1) * (s / 2 + 3), m = alongU ? (v0 + v1) / 2 : (u0 + u1) / 2;
        const [u, v] = alongU ? [a, m] : [m, a], x = f.ox + u * f.c - v * f.s, y = f.oy + u * f.s + v * f.c;
        if (!inRings(b.wr, x, y)) continue;
        addTower(b, x, y, s, clamp(b.ht + 0.22 + short / T * 0.015, 0.3, 0.9), clamp(s / T * 0.12, 0.14, 0.3), { roof: '#3f4a46', cross: true });
      }
      if ((at = place('Atom Array Lab', 49.2290, 16.5925, 15, 8))) atomLab(at); // (up the hill from FIT BUT)
    }
  }
  // the rest of every block: buildings packed into the irregular lots, with the odd park or car park
  const seen = new Uint8Array(MW * MH);
  const isFree = (x, y) => x > 0 && y > 0 && x < MW - 1 && y < MH - 1 && free[y * MW + x] === 1;
  const flood = (sx, sy, seen) => {
    const reg = [], q = [[sx, sy]]; seen[sy * MW + sx] = 1;
    while (q.length) {
      const [x, y] = q.pop(); reg.push([x, y]);
      for (let d = 0; d < 4; d++) { const nx = x + DX[d], ny = y + DY[d]; if (isFree(nx, ny) && !seen[ny * MW + nx]) { seen[ny * MW + nx] = 1; q.push([nx, ny]); } }
    }
    return reg;
  };
  if (BRNO) { // the blocks between Brno's main roads are big: paved lanes (you can drive down them) cut them into blocks of a real size
    const seen0 = new Uint8Array(MW * MH);
    for (let sy = 1; sy < MH - 1; sy++) for (let sx = 1; sx < MW - 1; sx++) {
      if (!isFree(sx, sy) || seen0[sy * MW + sx]) continue;
      const reg = flood(sx, sy, seen0);
      let cx = 0, cy = 0; for (const [x, y] of reg) { cx += x; cy += y; } cx /= reg.length; cy /= reg.length;
      const ind = LCG[Math.round(cy) * MW + Math.round(cx)] === LC_INDUS;
      const BS = BSTY[ind ? 'industrial' : DISTRICTS[districtAt((cx + 0.5) * T, (cy + 0.5) * T)].style] || BSTY.village;
      const al = BS.al ? Math.round(BS.al * BK / 30) : 0;
      if (al < 5 || reg.length < al * al * 1.5) continue;
      const ox = Math.floor(srnd() * al), oy = Math.floor(srnd() * al), aw = BK >= 2 && BS.al >= 200 ? 2 : 1;
      for (const [x, y] of reg) if ((x + ox) % al < aw || (y + oy) % al < aw) { const k = y * MW + x; free[k] = 0; map[k] = PLAZA; }
    }
  }
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
    const stOv = BRNO && LCG[Math.round(cy) * MW + Math.round(cx)] === LC_INDUS ? 'industrial' : null; // (industrial estates, wherever they are)
    const BS = BRNO ? BSTY[stOv || DISTRICTS[dist].style] || BSTY.village : null;
    const parkP = BS ? BS.park : { [R_CORAL]: 0.2, [R_VILLAGE]: 0.18, [R_ONDAS]: 0.08 }[dist] ?? 0.09, lotP = BS ? BS.lot : parkP + ({ [R_ONDAS]: 0.2 }[dist] ?? 0.08);
    const garden = BS ? BS.garden : { [R_VILLAGE]: 0.3, [R_CORAL]: 0.22, [R_ONDAS]: 0.06 }[dist] || 0; // towns are greener than the city
    if (reg.length >= 18 && r < parkP && (!BRNO || reg.length < 200 * BK * BK)) { // a pocket park
      for (const [x, y] of reg) free[y * MW + x] = 0;
      for (let i = 0; i < reg.length / 5; i++) { const [x, y] = spick(reg); if (!BRNO && (dist === R_ONDAS || dist === R_CORAL)) palm(x + 0.2 + srnd() * 0.6, y + 0.2 + srnd() * 0.6); else tree(x + 0.2 + srnd() * 0.6, y + 0.2 + srnd() * 0.6); }
      const [bx, by] = spick(reg); prop('bench', bx + 0.5, by + 0.5);
      const [lx, ly] = spick(reg); lamp(lx + 0.5, ly + 0.5, 55);
      if (reg.length > 30) { const [fx, fy] = spick(reg); prop('flowers', fx + 0.5, fy + 0.5); }
      continue;
    }
    if (reg.length >= 18 && r < lotP && (!BRNO || reg.length < 120 * BK * BK)) { // a car park
      const inReg = new Set(reg.map(([x, y]) => y * MW + x));
      for (const [x, y] of reg) {
        free[y * MW + x] = 0; map[y * MW + x] = PLAZA; lotT[y * MW + x] = 1;
        const up = !inReg.has((y - 1) * MW + x), down = !inReg.has((y + 1) * MW + x);
        if (up !== down) { const yy = up ? y + 0.62 : y + 0.38; parkSpots.push({ x: (x + 0.5) * T, y: yy * T, a: up ? Math.PI / 2 : -Math.PI / 2 }); prop('stalls', x, yy, { n: 1, sp: 1 }); }
      }
      const [lx, ly] = spick(reg); lamp(lx + 0.5, ly + 0.5, 70);
      continue;
    }
    // Brno's big city blocks are built around their edges: the middle is a courtyard (a yard on an industrial estate,
    // a maze of paved lanes and little squares in the old town)
    const ring = BS === BSTY.old ? 2 : BS === BSTY.tenement ? 4 : BS === BSTY.industrial ? 5 : 0;
    if (ring && reg.length > (ring * 2 + 3) ** 2) {
      const dep = new Map(), qq = [];
      for (const [x, y] of reg) if ([0, 1, 2, 3].some(d => !isFree(x + DX[d], y + DY[d]))) { dep.set(y * MW + x, 1); qq.push(y * MW + x); }
      for (let h = 0; h < qq.length; h++) {
        const k = qq[h], x = k % MW, y = (k / MW) | 0;
        for (let d = 0; d < 4; d++) { const nk = (y + DY[d]) * MW + x + DX[d]; if (isFree(x + DX[d], y + DY[d]) && !dep.has(nk)) { dep.set(nk, dep.get(k) + 1); qq.push(nk); } }
      }
      for (const [x, y] of reg) {
        const k = y * MW + x; if (!(dep.get(k) > ring)) continue;
        if (BS === BSTY.old) { if ((x + 3 * Math.floor(y / 9)) % 7 === 0 || y % 6 === 0) { free[k] = 0; map[k] = PLAZA; } continue; }
        free[k] = 0;
        if (BS === BSTY.industrial) map[k] = PLAZA;
        else if (srnd() < 0.14) tree(x + 0.2 + srnd() * 0.6, y + 0.2 + srnd() * 0.6, 9 + srnd() * 5);
      }
    }
    const [mn, mx] = BS ? [BS.mn, BS.mx] : { 0: [3, 8], 1: [3, 7], 2: [2, 4], 3: [3, 6], [R_VILLAGE]: [2, 4], [R_ONDAS]: [3, 7], [R_CORAL]: [2, 5] }[dist] || [3, 6];
    for (const [x, y] of reg) {
      if (!isFree(x, y)) continue;
      if (garden && srnd() < garden) { // a garden: grass and maybe a tree (a palm by the sea, a cactus in the desert)
        free[y * MW + x] = 0;
        if (srnd() < 0.35) { if (!BRNO && dist === R_CORAL) palm(x + 0.5, y + 0.5); else if (!BRNO && dist === R_ONDAS) tree(x + 0.5, y + 0.5, 6, 10 + (srnd() * 2 | 0)); else tree(x + 0.5, y + 0.5, 9 + srnd() * 5); }
        continue;
      }
      let maxW = mn + Math.floor(srnd() * (mx - mn + 1)), maxH = mn + Math.floor(srnd() * (mx - mn + 1));
      if (BS && BS.long) { const L = BS.long[0] + Math.floor(srnd() * (BS.long[1] - BS.long[0] + 1)); if (srnd() < 0.5) maxW = L; else maxH = L; } // panel slabs
      let w = 1; while (w < maxW && isFree(x + w, y)) w++;
      let h = 1; while (h < maxH) { let ok = true; for (let i = 0; i < w; i++) if (!isFree(x + i, y + h)) { ok = false; break; } if (!ok) break; h++; }
      if (w >= 2 && h >= 2) {
        mkB(x, y, w, h, styleFor(dist, stOv));
        if (BS && BS.gap) for (let j = y - BS.gap; j < y + h + BS.gap; j++) for (let i = x - BS.gap; i < x + w + BS.gap; i++) if (isFree(i, j)) free[j * MW + i] = 0; // lawns between the blocks
        if (srnd() < 0.3) { let ok = true; for (let j = 0; j < h; j++) if (!isFree(x + w, y + j)) ok = false; if (ok) for (let j = 0; j < h; j++) { free[(y + j) * MW + x + w] = 0; map[(y + j) * MW + x + w] = PLAZA; } }
      } else {
        free[y * MW + x] = 0;
        if (nearWalk(x, y)) map[y * MW + x] = PLAZA;
        else if (srnd() < 0.35) tree(x + 0.5, y + 0.5, 8 + srnd() * 6);
      }
    }
  }
  if (!BRNO) { // ---- the countryside: farms, fields, a mountain observatory, a fenced desert base, cabins, wind turbines, beaches
  const farm = (name, x, y) => { // a farmyard: house, barn, silo, hay and a tractor
    rural(name, x, y, 11, 8, 'yard');
    mkB(x + 1, y + 1, 4, 3, { kind: 'farmhouse', style: 'house', wall: spick(['#efe6d2', '#e2d6bc', '#f2ede0']), roof: spick(['#8a3b2a', '#5a5550', '#6e4030']), ht: 0.075, cap: 'gable', capH: 0.05, chimney: true, axis: 'x', det: [], mat: 'siding' });
    mkB(x + 6, y + 1, 4, 5, { kind: 'barn', style: 'house', win: 'none', wall: '#9a3324', roof: '#55504a', ht: 0.1, cap: 'gable', capH: 0.07, axis: 'y', det: [], mat: 'siding', mmc: '#a0402e' });
    mkB(x + 1, y + 5, 2, 2, { kind: 'silo', win: 'none', wall: '#b9bcc0', roof: '#c9ccd0', ht: 0.3, dome: { r: 27, h: 0.06, c: '#d4d7db' }, det: [], mat: 'metal' });
    for (let i = 0; i < 4; i++) prop('bale', x + 3.6 + srnd() * 1.8, y + 5.2 + srnd() * 2.2);
    fixedParked.push({ type: 'tractor', x: (x + 4.5) * T, y: (y + 4.6) * T, a: Math.PI / 2 });
    lamp(x + 5.5, y + 4, 60);
  };
  farm('Boson Farm', 111, 86); farm('Fermion Farm', 119, 9); farm('Higgs Farm', 160, 42); farm('Gluon Farm', 125, 97);
  // the observatory and radio mast on the summit of Mount Eigen
  rural('Eigen Observatory', 47, 141, 7, 6, 'plaza');
  mkB(48, 142, 4, 4, { kind: 'observatory', win: 'slit', wall: '#e6e6e2', roof: '#cfcfcb', ht: 0.1, dome: { r: 52, h: 0.13, c: '#eef0f2' }, det: [], mmc: '#ffffff' });
  mkB(52, 145, 1, 1, { win: 'none', wall: '#9aa0a6', roof: '#b0b6bc', ht: 0.04, antenna: 0.55, det: [] });
  lamp(50, 146.5, 50);
  // Site Ψ: hangars, a lab, a tower and radar dishes behind a fence. The guards don't like visitors.
  rural('Atom Array Lab', 189, 87, 15, 8, 'plaza'); atomLab([189, 87]); // (by the road to Site Ψ, outside its fence)
  rural('Site Ψ', 197, 96, 19, 13, 'lot');
  SITE_PSI = { x0: 197 * T, y0: 96 * T, x1: 216 * T, y1: 109 * T };
  mkB(199, 99, 6, 4, { style: 'ware', win: 'ware', wall: '#5f6a5a', roof: '#6f7a6a', ht: 0.11 });
  mkB(208, 99, 6, 4, { style: 'ware', win: 'ware', wall: '#5f6a5a', roof: '#6f7a6a', ht: 0.11 });
  mkB(199, 104, 5, 3, { kind: 'lab', win: 'ribbon', wall: '#d8dce0', roof: '#b8bcc0', ht: 0.12, det: [[0.2, 0.2, 0.2, 0.3], [0.6, 0.3, 0.15, 0.25]], mmc: '#c8d4e0' });
  mkB(213, 105, 2, 2, { win: 'ribbon', wall: '#c8ccd0', roof: '#d8dce0', ht: 0.4, antenna: 0.15, det: [] });
  prop('dish', 207.5, 106.4, { r: 30, a: -0.7 }); prop('dish', 211, 106.8, { r: 18, a: -1.2 });
  { // the fence, in short runs (so each one is drawn whenever it is near the view), open at the gate
    const X0 = 197.2, Y0 = 96.2, X1 = 215.8, Y1 = 108.8, run = (ax, ay, bx, by) => {
      const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 3);
      for (let i = 0; i < n; i++) { const a = i / n, b = (i + 1) / n; prop('fence', (ax + (bx - ax) * (a + b) / 2), (ay + (by - ay) * (a + b) / 2), { a: [(ax + (bx - ax) * a) * T, (ay + (by - ay) * a) * T], b: [(ax + (bx - ax) * b) * T, (ay + (by - ay) * b) * T] }); }
    };
    run(X0, Y0, 205, Y0); run(207, Y0, X1, Y0); run(X1, Y0, X1, Y1); run(X1, Y1, X0, Y1); run(X0, Y1, X0, Y0);
  }
  prop('sign', 204.6, 95.4, { text: 'RESTRICTED' }); prop('sign', 207.4, 95.4, { text: 'SITE Ψ' });
  for (const [lx, ly] of [[198, 97], [215, 97], [198, 108], [215, 108]]) lamp(lx, ly, 80, 'rgba(255,255,255,1)');
  // cabins by Pine Lake, with a jetty and a rowing boat
  for (const [x, y] of [[82, 124], [86, 125], [90, 124], [93, 125]]) {
    rural(null, x, y, 2, 2);
    mkB(x, y, 2, 2, { kind: 'cabin', style: 'house', wall: '#7a5236', roof: '#4d5045', ht: 0.06, cap: 'gable', capH: 0.04, chimney: true, det: [], mat: 'siding' });
  }
  prop('jetty', 87.4, 116.4, { w: 0.8, h: 3.2 }); prop('boat', 89.6, 116.2, { a: 1.2, c: '#a0522d', row: true });
  // wind turbines on the hills north of the valley
  for (const [x, y] of [[134, 16], [140, 14.5], [145, 17], [156, 16], [162, 14.5], [168, 17]]) { rural(null, Math.floor(x), Math.floor(y), 1, 1); prop('turbine', x, y, { ph: srnd() * TAU }); }
  // crop fields: an irregular grid over the farmland, each field shrunk until it fits between the roads, farms and water
  const fieldOk = (i, j) => i > 0 && j > 0 && i < MW - 1 && j < MH - 1 && !inCity(i, j) && REG[j * MW + i] === R_FARM && map[j * MW + i] === GRASS && !taken[j * MW + i] && dR[j * MW + i] > 60 && fieldAt('wa', i, j) < -1;
  const CROPS = ['wheat', 'wheat', 'wheat', 'plough', 'plough', 'green', 'green', 'corn', 'corn', 'rape'];
  for (let gy = 4; gy < MH - 20;) {
    const ch = 8 + Math.floor(srnd() * 5);
    for (let gx = CW + 1; gx < 178;) {
      const cw = 9 + Math.floor(srnd() * 7);
      let x0 = gx + 1, y0 = gy + 1, x1 = gx + cw - 1, y1 = gy + ch - 1;
      for (let it = 0; it < 40 && x1 - x0 >= 3 && y1 - y0 >= 2; it++) {
        let bad = null;
        for (let j = y0; j <= y1 && !bad; j++) for (let i = x0; i <= x1; i++) if (!fieldOk(i, j)) { bad = [i, j]; break; }
        if (!bad) break;
        const [bi, bj] = bad, cut = [bi - x0, x1 - bi, bj - y0, y1 - bj], m = cut.indexOf(Math.min(...cut));
        if (m === 0) x0 = bi + 1; else if (m === 1) x1 = bi - 1; else if (m === 2) y0 = bj + 1; else y1 = bj - 1;
      }
      let ok = x1 - x0 >= 3 && y1 - y0 >= 2 && (x1 - x0 + 1) * (y1 - y0 + 1) >= 16;
      for (let j = y0; ok && j <= y1; j++) for (let i = x0; i <= x1; i++) if (!fieldOk(i, j)) { ok = false; break; }
      if (ok) {
        const crop = spick(CROPS), f = { x0, y0, x1, y1, crop, rot: srnd() < 0.5 };
        FIELDS.push(f);
        for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) { map[j * MW + i] = FIELD; taken[j * MW + i] = 1; }
        if (crop === 'wheat' && srnd() < 0.4) { f.cut = true; for (let i = 0; i < (x1 - x0 + 1) * (y1 - y0 + 1) / 8; i++) prop('bale', x0 + 0.5 + srnd() * (x1 - x0), y0 + 0.5 + srnd() * (y1 - y0)); }
        // a hedgerow along some of the edges
        for (let i = x0 - 1; i <= x1 + 1; i++) for (const j of [y0 - 1, y1 + 1]) if (srnd() < 0.22 && fieldOk(i, j)) tree(i + 0.5, j + 0.5, 7 + srnd() * 3);
        for (let j = y0; j <= y1; j++) for (const i of [x0 - 1, x1 + 1]) if (srnd() < 0.22 && fieldOk(i, j)) tree(i + 0.5, j + 0.5, 7 + srnd() * 3);
      }
      gx += cw;
    }
    gy += ch;
  }
  // trees, palms, cacti and scrub, by region
  for (let ty = 1; ty < MH - 1; ty++) for (let tx = 1; tx < MW - 1; tx++) {
    if (inCity(tx, ty)) continue;
    const k = ty * MW + tx, t = map[k], rg = REG[k], town = townAt(tx, ty);
    if ((t !== GRASS && t !== SAND) || taken[k] || dR[k] < 60 || (town && !(town.beach && ty > palmY(tx) + 1))) continue;
    const r = srnd(), jx = () => tx + 0.15 + srnd() * 0.7, jy = () => ty + 0.15 + srnd() * 0.7, sea = seaDist(tx + 0.5, ty + 0.5);
    if (rg === R_WOODS || rg === R_MOUNT) {
      const mh = cornerAvg(F.mh, tx, ty), p = clamp(0.22 + fieldAt('fo', tx, ty) * 0.18, 0.08, 0.5) * (1 - sstep(0.55, 0.9, mh));
      const con = mh > 0.15 ? 0.85 : 0.6;
      if (t === GRASS && r < p) tree(jx(), jy(), 12 + srnd() * 6, srnd() < con ? 6 + (srnd() * 2 | 0) : (srnd() * 6 | 0));
      if (t === GRASS && r < p * 0.45) tree(jx(), jy(), 11 + srnd() * 5, srnd() < con ? 6 + (srnd() * 2 | 0) : (srnd() * 6 | 0));
    } else if (rg === R_DESERT || (rg === R_ONDAS && !town)) {
      if (t === SAND && r < 0.018) tree(jx(), jy(), 5 + srnd() * 2.5, 10 + (srnd() * 2 | 0));
      else if (r < (t === SAND ? 0.045 : 0.08)) tree(jx(), jy(), 5 + srnd() * 3, 12 + (srnd() * 2 | 0));
    } else if (rg === R_COAST || rg === R_CORAL) {
      if (sea > 2 && r < (t === SAND ? 0.045 : 0.06)) palm(jx(), jy());
      else if (t === GRASS && r < 0.08) tree(jx(), jy(), 9 + srnd() * 5, srnd() < 0.5 ? 12 : srnd() * 6 | 0);
    } else if (rg === R_FARM && t === GRASS && r < 0.012) tree(jx(), jy(), 11 + srnd() * 5, srnd() * 6 | 0);
  }
  // palms along the streets of Las Ondas and Coral Bay
  for (const e of EDGES) {
    if (e.rural || e.hw) continue;
    const town = townAt(Math.floor(e.pts[0][0] / T), Math.floor(e.pts[0][1] / T));
    if (!town || town.reg === R_VILLAGE) continue;
    const at = edgeWalk(e);
    for (let s0 = 80; s0 < e.len - 80; s0 += 110) {
      const [x, y, h] = at(s0), nx = -Math.sin(h), ny = Math.cos(h);
      for (const sd of [-1, 1]) { const px = x + nx * 58 * sd, py = y + ny * 58 * sd; if (tileAtP(px, py) === WALK) palm(px / T, py / T); }
    }
  }
  // the beaches: umbrellas and towels, lifeguard towers, boats offshore
  for (let tx = 104; tx < MW - 2; tx++) for (let ty = Math.floor(coastY(tx)) - 9; ty < MH - 1; ty++) {
    const k = ty * MW + tx; if (map[k] !== SAND || taken[k] || dR[k] < 56) continue;
    const sea = seaDist(tx + 0.5, ty + 0.5), rg = REG[k];
    if (sea < 1 || sea > 4.5 || (rg !== R_CORAL && rg !== R_COAST)) continue;
    if (srnd() < (rg === R_CORAL ? 0.09 : 0.02)) {
      prop('umb', tx + 0.5, ty + 0.5, { c: spick(['#e53935', '#1e88e5', '#fdd835', '#43a047', '#fb8c00', '#ec407a']) });
      for (let i = 0; i < 1 + (srnd() * 2 | 0); i++) prop('towel', tx + 0.1 + srnd() * 0.8, ty + 0.7 + srnd() * 0.5, { c: spick(['#e53935', '#1e88e5', '#fdd835', '#ffffff', '#8e24aa']), a: (srnd() - 0.5) * 0.6 });
    }
  }
  for (const x of [126, 139, 168, 181]) { const y = Math.floor(coastY(x) - 3.5); if (map[y * MW + x] === SAND) prop('guard', x + 0.5, y + 0.5); }
  for (const [x, y, a, c] of [[148, MH - 6, 0.4, '#f4f4f4'], [161, MH - 4.5, -0.3, '#1e5aa8'], [127, 56, 0.9, '#c0392b'], [132, 59.5, -0.5, '#f4f4f4']])
    if (map[Math.floor(y) * MW + Math.floor(x)] === WATER) prop('boat', x, y, { a, c });
  } else { // ---- around Brno: boats on the reservoir, fields and vineyards, forests, parks and tree-lined streets
    for (let i = 0; i < 900; i++) { // inner Brno's corner of the reservoir: motorboats and rowing boats, out from the banks
      const tx = 2 + Math.floor(srnd() * (RESERVOIR[0] - 2)), ty = 2 + Math.floor(srnd() * (RESERVOIR[1] - 2)), k = ty * MW + tx;
      if (tx > 0 && ty > 0 && tx < MW && ty < MH && map[k] === WATER && fieldAt('wa', tx, ty) > 5 && srnd() < 0.2)
        prop('boat', tx + 0.5, ty + 0.5, { a: srnd() * TAU, row: srnd() < 0.4, c: spick(['#f4f4f4', '#1e5aa8', '#c0392b', '#f4f4f4']) });
    }
    const TS = 1.6; // (trees are bigger next to 5 m tiles)
    // how far (x, y) is outside the kerb of street id: a street tree's trunk stands on the pavement, not in a lane
    const offKerb = (x, y, id) => { if (id < 0) return 1e9; const e = EDGES[id], P = e.pts; let d = 1e9; for (let i = 0; i < P.length - 1; i++) d = Math.min(d, closestOnSeg([x, y], P[i], P[i + 1]).d); return d - e.wd / 2; };
    if (B5) { // the trees OpenStreetMap knows, on the streets and in the parks
      const r = BRNO_DATA.trees; let x = 0, y = 0;
      for (let i = 0; i < r.length;) { const a = vlq(r, i); i = a[1]; const b = vlq(r, i); i = b[1]; x += a[0]; y += b[0]; const k = (y >> 2) * MW + (x >> 2); if (map[k] !== BUILD && map[k] !== ROAD && map[k] !== WATER && dR[k] > 40 && tunT[k] !== 2 && ovT[k] !== 2 && !solidAt(x / 4 * T, y / 4 * T) && offKerb(x / 4 * T, y / 4 * T, eR[k]) > 10) { tree(x / 4, y / 4, (10 + srnd() * 6) * TS, srnd() * 6 | 0); taken[k] = 1; } }
    }
    // crop fields: inner Brno's are its real farmland, drawn as polygons (the tiles only slow you down)
    for (let k = 0; k < MW * MH; k++) if ((LCG[k] === LC_FARM || LCG[k] === LC_VINE) && map[k] === GRASS) map[k] = FIELD;
    // (the random numbers the 15 m map's rectangular fields used to take here: drawn all the same, so that the trees and
    // the bus stops placed after this stay where they have always been)
    for (let gy = 2; gy < MH - 2;) { const ch = 6 + Math.floor(srnd() * 4); for (let gx = 2; gx < MW - 2;) gx += 7 + Math.floor(srnd() * 5); gy += ch; }
    for (let ty = 1; ty < MH - 1; ty++) for (let tx = 1; tx < MW - 1; tx++) { // forests, parks, cemeteries, lone trees
      const k = ty * MW + tx, t = map[k], lc = LCG[k];
      if (t !== GRASS || taken[k] || dR[k] < 60 || lc === LC_URBAN || lc === LC_INDUS || lc === LC_AIR || lc === LC_PITCH) continue;
      const r = srnd(), jx = () => tx + 0.15 + srnd() * 0.7, jy = () => ty + 0.15 + srnd() * 0.7, dn = 0.3; // (density: a 5 m tile is small)
      if (lc === LC_FOREST) {
        const p = clamp(0.22 + fieldAt('fo', tx, ty) * 0.18, 0.08, 0.5) * 0.5, con = cornerAvg(F.mh, tx, ty) > 0.3 ? 0.6 : 0.3;
        if (r < p) tree(jx(), jy(), (12 + srnd() * 6) * TS, srnd() < con ? 6 + (srnd() * 2 | 0) : (srnd() * 6 | 0));
      } else if (lc === LC_GREEN) { if (r < 0.2 * dn) tree(jx(), jy(), (10 + srnd() * 6) * TS, srnd() * 6 | 0); }
      else if (r < 0.015 * dn) tree(jx(), jy(), (11 + srnd() * 5) * TS, srnd() * 6 | 0);
    }
    for (const e of EDGES) { // tree-lined streets outside the old town
      if (e.rural || e.hw) continue;
      const tw = townAt(Math.floor(e.pts[0][0] / T), Math.floor(e.pts[0][1] / T));
      if (!tw || DISTRICTS[tw.reg].style === 'old' || DISTRICTS[tw.reg].style === 'industrial') continue;
      const at = edgeWalk(e);
      for (let s0 = 110; s0 < e.len - 110; s0 += B5 ? 170 : 110) {
        const [x, y, h] = at(s0), nx = -Math.sin(h), ny = Math.cos(h);
        // (on the pavement: not in the median of a dual carriageway, nor in its other half)
        for (const sd of [-1, 1]) { const o = e.wd / 2 + 26, px = x + nx * o * sd, py = y + ny * o * sd, k = Math.floor(py / T) * MW + Math.floor(px / T); if (tileAtP(px, py) === WALK && !taken[k] && offKerb(px, py, eR[k]) > 10) tree(px / T, py / T, (9 + srnd() * 3) * TS); }
      }
    }
  }
  // doors: pavement tiles next to a building, where pedestrians come and go
  for (let ty = 1; ty < MH - 1; ty++) for (let tx = 1; tx < MW - 1; tx++) {
    const t = map[ty * MW + tx];
    if (t !== WALK && t !== PLAZA) continue;
    for (let d = 0; d < 4; d++) if (map[(ty + DY[d]) * MW + tx + DX[d]] === BUILD && ((tx * 7 + ty * 13) % 3 === 0)) { DOORS.push({ tx, ty, d }); break; }
  }
  // where a street bridges the railway: that stretch of it (over all the tracks side by side) is a bridge like one over water
  for (const X of RAIL_X) {
    let e = null, bd = 2 * T, s = 0, ex = 0, ey = 0;
    for (const q of EDGES) {
      if (q.tunnel || q.over || q.bb[0] > X.x + bd || q.bb[2] < X.x - bd || q.bb[1] > X.y + bd || q.bb[3] < X.y - bd) continue;
      let acc = 0;
      for (let i = 1; i < q.pts.length; i++) { const a = q.pts[i - 1], b = q.pts[i], c = closestOnSeg([X.x, X.y], a, b), l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (c.d < bd) { bd = c.d; e = q; s = acc + Math.hypot(c.x - a[0], c.y - a[1]); ex = (b[0] - a[0]) / (l || 1); ey = (b[1] - a[1]) / (l || 1); } acc += l; }
    }
    X.e = e; if (!e) continue;
    let rd = 1e9, rx = 1, ry = 0; // (the track's direction there)
    for (const R of RAILS) if (!R.lv) for (let i = 1; i < R.length; i++) { const a = R[i - 1], b = R[i], c = closestOnSeg([X.x, X.y], a, b); if (c.d < rd) { rd = c.d; const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; rx = (b[0] - a[0]) / l; ry = (b[1] - a[1]) / l; } }
    X.s = s; X.ux = ex; X.uy = ey; X.rx = rx; X.ry = ry; X.sin = Math.max(0.3, Math.abs(ex * ry - ey * rx));
    if (X.k === 1) (e.rbr || (e.rbr = [])).push([s - 26 / X.sin - 12, s + 26 / X.sin + 12]);
    if (X.k === 2) { const h = (e.wd / 2 + 18) / X.sin; X.deck = [[X.x - rx * h, X.y - ry * h], [X.x + rx * h, X.y + ry * h]]; } // (a short bridge carries the track over the street)
  }
  // edges split into land and bridge stretches (for drawing pavements and parapets)
  for (const e of EDGES) {
    e.land = []; e.water = [];
    let cur = null, wet = null;
    const n = Math.max(2, Math.ceil(e.len / 8)), at = edgeWalk(e);
    for (let k = 0; k <= n; k++) {
      const s = e.len * k / n, p = at(s), wt = bridge[Math.floor(p[1] / T) * MW + Math.floor(p[0] / T)] === 1, w = wt || !!(e.rbr && e.rbr.some(([a, b]) => s >= a && s <= b));
      if (wt) e.wet = true; // (over the water itself)
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
// edgePt for points taken in order along an edge (s never going back): it carries on from the segment it stopped at,
// with the same sums, so each point is just what edgePt gives, without walking the whole way from the start each time
function edgeWalk(e) {
  let i = 1, acc = 0;
  return s => {
    const P = e.pts;
    for (; i < P.length; i++) {
      const a = P[i - 1], b = P[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (acc + l >= s || i === P.length - 1) { const t = l ? clamp((s - acc) / l, 0, 1) : 0; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(b[1] - a[1], b[0] - a[0])]; }
      acc += l;
    }
    return [P[0][0], P[0][1], 0];
  };
}
genMap();

// tiles you can walk to a road from, clear of tree trunks: a start or a respawn spot must never wall you in
let OPEN_T = null;
function openTiles() {
  if (OPEN_T) return OPEN_T;
  const R = new Uint8Array(MW * MH), q = new Int32Array(MW * MH); let h = 0, n = 0;
  for (let k = 0; k < MW * MH; k++) if (map[k] === ROAD) { R[k] = 1; q[n++] = k; }
  while (h < n) {
    const k = q[h++], x = k % MW, y = (k / MW) | 0;
    for (let d = 0; d < 4; d++) { const nx = x + DX[d], ny = y + DY[d], j = ny * MW + nx; if (nx >= 0 && ny >= 0 && nx < MW && ny < MH && !R[j] && !solidT(map[j])) { R[j] = 1; q[n++] = j; } }
  }
  for (const t of trees) { // (a spot whose middle is within reach of a trunk is not clear)
    const r = trunkR(t) + 14; if (r <= 14) continue;
    for (let y = Math.floor((t.y - r) / T); y <= Math.floor((t.y + r) / T); y++) for (let x = Math.floor((t.x - r) / T); x <= Math.floor((t.x + r) / T); x++)
      if (x >= 0 && y >= 0 && x < MW && y < MH && Math.hypot((x + 0.5) * T - t.x, (y + 0.5) * T - t.y) < r) R[y * MW + x] = 0;
  }
  return (OPEN_T = R);
}
function findTileNear(tx, ty, type) {
  const O = openTiles(), ok = (x, y, any) => x >= 0 && y >= 0 && x < MW && y < MH && O[y * MW + x] && (any || tile(x, y) === type);
  for (const any of [false, true]) // (any open tile will do when there is no open tile of the type nearby)
    for (let r = 0; r < 14 * BK; r++)
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (ok(tx + dx, ty + dy, any)) return { tx: tx + dx, ty: ty + dy };
      }
  return { tx, ty };
}
const tileCenter = t => ({ x: (t.tx + 0.5) * T, y: (t.ty + 0.5) * T });
// a random tile of one of the types; with `around` ({x, y, min, max}) it is drawn from that ring rather than the whole island
function randomTile(types, cond, around) {
  for (let i = 0; i < 400; i++) {
    let tx, ty;
    if (around) { const a = Math.random() * TAU, d = Math.sqrt(lerp(around.min * around.min, around.max * around.max, Math.random())); tx = Math.floor((around.x + Math.cos(a) * d) / T); ty = Math.floor((around.y + Math.sin(a) * d) / T); if (tx < 1 || ty < 1 || tx > MW - 2 || ty > MH - 2) continue; }
    else { tx = randi(1, MW - 2); ty = randi(1, MH - 2); }
    if (!types.includes(tile(tx, ty))) continue;
    const p = { x: (tx + 0.5) * T, y: (ty + 0.5) * T, tx, ty };
    if (!cond || cond(p)) return p;
  }
  return null;
}
const siteRect = name => SITES.find(s => s.name === name);
const besideSite = (name, fx, fy) => { const s = siteRect(name); return tileCenter(findTileNear(Math.round(s ? s.x0 + (s.x1 - s.x0) * fx : 50), Math.round(s ? s.y0 + (s.y1 - s.y0) * fy : 50), WALK)); };
const HOSPITAL = B5 ? besideSite('Úrazová nemocnice v Brně', 0.5, 1.1) : besideSite('Mercy General Hospital', 0.5, 1.2);
const POLICE_HQ = B5 ? besideSite('Krajské ředitelství Policie Jihomoravského kraje', 0.5, 1.1) : besideSite('Police Headquarters', -0.2, 0.5);
const near = (tx, ty) => tileCenter(findTileNear(tx, ty, WALK));
const placeAt = n => { const p = BRNO_DATA.places.find(q => q[0] === n); return p ? [Math.round(p[1]), Math.round(p[2])] : [-999, -999]; };
const SPRAYS = (B5 ? ['Staré Brno', 'Židenice', 'Žabovřesky', 'Husovice', 'Královo Pole'].map(placeAt) : [[44, 22], [91, 66], [147, 66], [196, 77], [171, 171]]).map(([x, y]) => near(x, y));
const BOOTHS = (B5 ? ['Staré Město', 'Veveří', 'Královo Pole', 'Žabovřesky', 'Ponava', 'Černá Pole', 'Husovice', 'Zábrdovice', 'Trnitá', 'Štýřice', 'Staré Brno', 'Pisárky',
  'Stránice', 'Komárov', 'Židenice', 'Lesná', 'Sadová', 'Žlutý kopec'].map(placeAt).filter(([x, y]) => x > 4 && y > 4 && x < MW - 4 && y < MH - 4) : BRNO ? ['Staré Město', 'Veveří', 'Královo Pole', 'Žabovřesky', 'Bystrc', 'Lesná', 'Židenice', 'Líšeň', 'Bohunice', 'Štýřice', 'Komárov', 'Slatina',
  'Černá Pole', 'Husovice', 'Řečkovice', 'Kohoutovice', 'Trnitá'].map(placeAt)
  : [[20, 13], [44, 31], [66, 21], [90, 9], [24, 60], [57, 75], [86, 88], [40, 92], [146, 67], [155, 77], [196, 45], [218, 67], [139, 171], [167, 182]]).map(([x, y]) => near(x, y));
// every clinic and police post, so you come back near where you fell
const HOSPITALS = [HOSPITAL, ...CLINICS.map(n => besideSite(n, 0.5, 1.4))];
const POLICE_POSTS = [POLICE_HQ, ...SHERIFFS.map(n => besideSite(n, 0.5, 1.4))];
const nearestOf = (list, x, y) => list.reduce((a, b) => d2(a.x, a.y, x, y) <= d2(b.x, b.y, x, y) ? a : b);
// ---- fishing: what bites where (w: s the sea, l a lake or the reservoir, r a river), and the jetties to fish from
const FISH = (BRNO ? [ // [name, Czech name, waters, kg from, kg to, $ a kg, how hard it fights, how common, tag]
  ['Carp', 'kapr', 'lr', 1, 14, 15, 0.6, 30], ['Bream', 'cejn', 'lr', 0.4, 3, 10, 0.3, 22], ['Perch', 'okoun', 'lr', 0.1, 1.2, 24, 0.25, 22],
  ['Zander', 'candát', 'l', 0.8, 9, 28, 0.55, 12], ['Pike', 'štika', 'lr', 1, 12, 22, 0.75, 10], ['Brown trout', 'pstruh', 'r', 0.3, 3, 36, 0.5, 9],
  ['Asp', 'bolen', 'r', 1, 6, 20, 0.7, 6], ['Wels catfish', 'sumec', 'lr', 8, 70, 14, 1, 2.5, 'night'],
  ['Old boot', 'stará bota', 'lr', 0.6, 1.2, 0, 0.08, 5, 'junk'], ['Shopping trolley', 'nákupní vozík', 'r', 9, 14, 0, 0.15, 2, 'junk'],
] : [
  ['Mackerel', '', 's', 0.3, 1.5, 20, 0.35, 28], ['Red snapper', '', 's', 0.8, 6, 28, 0.5, 18], ['Barracuda', '', 's', 2, 14, 18, 0.8, 9],
  ['Bluefin tuna', '', 's', 20, 120, 16, 1, 1.5], ['Quantum squid', '', 's', 0.5, 3, 120, 0.6, 2.5, 'night'],
  ['Perch', '', 'lr', 0.1, 1.2, 24, 0.25, 24], ['Rainbow trout', '', 'lr', 0.3, 3, 32, 0.45, 18], ['Largemouth bass', '', 'l', 0.5, 5, 26, 0.6, 14],
  ['Channel catfish', '', 'lr', 1, 18, 14, 0.8, 6, 'night'], ['Pike', '', 'l', 1, 12, 22, 0.75, 7],
  ['Old boot', '', 'slr', 0.6, 1.2, 0, 0.08, 5, 'junk'], ['Shopping cart', '', 'r', 9, 14, 0, 0.15, 2, 'junk'],
]).map(([name, cz, w, k0, k1, pr, str, n, tag]) => ({ name, cz, w, k0, k1, pr, str, n, tag }));
// each jetty is on the open bank tile nearest its anchor that looks straight out over at least three tiles of open water
// (x, y: the bank, where you walk up; fx, fy: the end of the jetty, where you stand to fish; a: the way it points)
const FISH_SPOTS = (() => {
  const out = [], open = openTiles(), R = Math.round(14 * BK);
  const anchors = B5 ? [[...geo(49.1905, 16.5760), 'r'], [...geo(49.1850, 16.5950), 'r'], [...geo(49.1795, 16.6150), 'r'], [...geo(49.1700, 16.6230), 'r'],
    [...geo(49.2120, 16.6300), 'r'], [...geo(49.1960, 16.6400), 'r'], [...geo(49.2286, 16.5166), 'l'], [...geo(49.2335, 16.5060), 'l']] : BRNO ? [[...geo(49.2286, 16.5166), 'l'], [...geo(49.2335, 16.5060), 'l'], [...geo(49.1905, 16.5760), 'r'], [...geo(49.2060, 16.5560), 'r'],
    [...geo(49.1700, 16.6200), 'r'], [...geo(49.2120, 16.6300), 'r']]
    : [[30, riverY(30), 'r'], [84, riverY(84), 'r'], [LAKES[0].x - LAKES[0].rx, LAKES[0].y, 'l'], [LAKES[1].x, LAKES[1].y + LAKES[1].ry, 'l'], [154.5, MH - 4, 's', true], [100, coastY(100) + 1, 's']];
  for (const [ax0, ay0, w, pier] of anchors) {
    const ax = Math.round(ax0), ay = Math.round(ay0); let best = null, bd = 1e9;
    for (let ty = ay - R; ty <= ay + R; ty++) for (let tx = ax - R; tx <= ax + R; tx++) {
      const dd = (tx - ax) ** 2 + (ty - ay) ** 2, k = ty * MW + tx;
      if (dd >= bd || tx < 4 || ty < 4 || tx >= MW - 4 || ty >= MH - 4 || !open[k] || (!pier && (map[k] === ROAD || bridge[k]))) continue;
      for (let d = 0; d < 4; d++) {
        let ok = true;
        for (let j = 1; j <= 3 && ok; j++) { const q = (ty + DY[d] * j) * MW + tx + DX[d] * j; ok = map[q] === WATER && !bridge[q]; }
        if (ok) { bd = dd; best = [tx, ty, d]; break; }
      }
    }
    if (!best) { console.warn('no bank to fish from near', ax, ay); continue; }
    const [tx, ty, d] = best;
    out.push({ w, a: Math.atan2(DY[d], DX[d]), x: (tx + 0.5) * T, y: (ty + 0.5) * T, fx: (tx + 0.5 + DX[d] * 1.2) * T, fy: (ty + 0.5 + DY[d] * 1.2) * T });
  }
  for (const s of out) props.push({ k: 'jetty', x: s.x, y: s.y, a: s.a, s: 0 });
  return out;
})();
let fishBest = {}; // the heaviest of each kind you have caught, kept between games
try { fishBest = JSON.parse(localStorage.getItem('qta.fish') || '{}') || {}; } catch (e) { /* ignore */ }
// where a new game can start
const geoWalk = (lat, lon) => tileCenter(findTileNear(...geo(lat, lon).map(Math.round), WALK));
const STARTS = B5 ? [
  { name: 'Staré Město', sub: 'the old town, under Špilberk and Petrov', p: besideSite('Náměstí Svobody', 0.5, 1.2) },
  { name: 'FIT BUT', sub: 'the Faculty of Information Technology, Královo Pole', p: besideSite('FIT BUT', 0.5, 1.1) },
  { name: 'Hlavní nádraží', sub: 'the main railway station', p: geoWalk(49.1906, 16.6125) },
  { name: 'Výstaviště', sub: 'the exhibition grounds by the Svratka', p: geoWalk(49.1885, 16.5820) },
  { name: 'Lužánky', sub: 'the park, and the tenements of Černá Pole', p: geoWalk(49.2085, 16.6110) },
] : BRNO ? [
  { name: 'Staré Město', sub: 'the old town, under Špilberk and Petrov', p: besideSite('Náměstí Svobody', 0.5, 1.4) },
  { name: 'FIT BUT', sub: 'the Faculty of Information Technology, Královo Pole', p: besideSite('FIT BUT', 0.5, 1.2) },
  { name: 'Hlavní nádraží', sub: 'the main railway station', p: besideSite('Hlavní nádraží', 0.5, 1.6) },
  { name: 'Brněnská přehrada', sub: 'the reservoir, the zoo and the woods', p: besideSite('Přístaviště Bystrc', 0.5, 1.6) },
  { name: 'Líšeň', sub: 'panel estates on the eastern edge', p: besideSite('Poliklinika Líšeň', 0.5, 1.4) },
] : [
  { name: 'Quantum City', sub: 'the big city: jobs, cops and neon', p: HOSPITAL },
  { name: "Bell's Crossing", sub: 'a farming village in Harvest Valley', p: besideSite('Valley Clinic', 0.5, 1.4) },
  { name: 'Las Ondas', sub: 'casinos on the Strip, out in the desert', p: besideSite('Ondas Clinic', 0.5, 1.4) },
  { name: 'Coral Bay', sub: 'palms and beaches on the tropical coast', p: besideSite('Coral Bay Clinic', 0.5, 1.4) },
  { name: 'Mount Eigen', sub: 'the observatory above the forest', p: tileCenter(findTileNear(50, 148, ROAD)) },
];

// street lamps along the pavements, on bridges, and runway lights
const lamps = [];
const LG = new Map(); for (const n of LIGHT_NODES) { const k = Math.floor(n.x / 90) * 65536 + Math.floor(n.y / 90); if (!LG.has(k)) LG.set(k, []); LG.get(k).push(n); }
const lightNear = (x, y) => { const ci = Math.floor(x / 90), cj = Math.floor(y / 90); for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) for (const n of LG.get(i * 65536 + j) || []) if (Math.hypot(n.x - x, n.y - y) < 90) return true; return false; };
for (const e of EDGES) {
  if (e.ring || e.rural || e.over) continue;
  const step = e.hw ? 200 : 150, off = e.wd / 2 + (e.hw ? 12 : 20); // (on the pavement, just beyond the kerb)
  const at = edgeWalk(e);
  for (let s = 60; s < e.len - 60; s += step) {
    const [x, y, h] = at(s), nx = -Math.sin(h), ny = Math.cos(h);
    for (const sd of [-1, 1]) {
      const onBridge = bridge[Math.floor(y / T) * MW + Math.floor(x / T)];
      const o = onBridge ? 36 : off, lx = x + nx * o * sd, ly = y + ny * o * sd, t = tileAtP(lx, ly);
      if (!onBridge && t !== WALK && !(e.hw && t === GRASS)) continue;
      if (lightNear(lx, ly)) continue;
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
const lanesOf = new Map(); for (const l of LANES) { if (!lanesOf.has(l.e)) lanesOf.set(l.e, []); lanesOf.get(l.e).push(l); }
for (const e of EDGES) {
  if (e.hw || e.ring || e.over || e.tunnel || e.len < 420 || srnd() < 0.4) continue;
  const Ls = (lanesOf.get(e) || []).filter(l => l.dir === 1), L = Ls[Ls.length - 1]; if (!L) continue; // (the kerbside lane)
  const s = L.len / 2, [x, y, h] = lanePt(L, s), nx = -Math.sin(h), ny = Math.cos(h);
  const sx = x + nx * (L.kerb + 14), sy = y + ny * (L.kerb + 14), k = Math.floor((y + ny * (L.kerb + 24)) / T) * MW + Math.floor((x + nx * (L.kerb + 24)) / T);
  if (map[k] !== WALK) continue;
  L.stop = s; pedSpot[k] = 2;
  BUS_STOPS.push({ x: sx, y: sy, L, s });
  props.push({ k: 'busstop', x: sx, y: sy, a: h });
}
// ---- trams (inner Brno at 5 m a tile): OpenStreetMap's tram routes, each along its own track, with its stops. A tram
// keeps its line's spacing, stops at every stop and, where it runs along a street, at the street's red lights; it
// brakes for whatever is on the track, and what it hits is pushed aside (some 40 t of tram). Traffic waits behind it.
const TRAM_W = 16; // (2.5 m: on double track two trams pass with a hand's breadth between them)
const TRAM_MODELS = [ // Brno's fleet: section lengths (px, 6.4 to the metre), the gap at each joint, livery, cabs at both ends
  { name: 'KT8D5', secs: [62, 62, 62], gap: 4, body: '#d3202a', roof: '#ece5d2', two: true, p: 0.35 },
  { name: '13T', secs: [44, 28, 44, 28, 44], gap: 3, body: '#d3202a', roof: '#d9dcdf', two: true, p: 0.3 },
  { name: 'T3', secs: [94, 94], gap: 8, body: '#ece3c6', roof: '#e9e2cc', band: '#c8202a', two: false, p: 0.2 },
  { name: 'VarioLF', secs: [82, 82], gap: 4, body: '#d3202a', roof: '#e7e2d4', two: false, p: 0.15 },
];
const TRAM_V = 105, TRAM_ACC = 45, TRAM_BRK = 70, TRAM_EBRK = 170; // px/s, px/s² (cruising at about 60 km/h)
const TRAM_GAP = 12500; // px of route between one tram of a route and the next (about 2 km)
const TRAM_VAVG = 58; // px/s (what the full simulation averages round the centre)
const TRAM_K = { V: TRAM_V, acc: TRAM_ACC, brk: TRAM_BRK, ebrk: TRAM_EBRK, gap: TRAM_GAP, vavg: TRAM_VAVG, w: TRAM_W };
// Brno's trains (on the detailed map) run on the trams' machinery: along OpenStreetMap's train routes, stopping at the
// stations (S trains at every one, the regional trains at the main ones, the expresses at the main station), through the
// tunnels and over the viaducts (no passenger line in the map crosses a street on the level). Each kind its pace: top speed, acceleration,
// braking (service and emergency), the route between one train and the next, the pace when out of your sector
const TRAIN_W = 19; // (3 m)
const TRAIN_KIND = {
  s: { V: 140, acc: 7, brk: 8, ebrk: 14, gap: 30000, vavg: 95, w: TRAIN_W, col: '#1a5fb4' }, // (about 80 km/h; 0.1 g)
  r: { V: 160, acc: 5.5, brk: 7, ebrk: 13, gap: 45000, vavg: 115, w: TRAIN_W, col: '#c64600' },
  x: { V: 175, acc: 4.5, brk: 6.5, ebrk: 12, gap: 70000, vavg: 130, w: TRAIN_W, col: '#4a4f57' },
};
// the fleet: each car's length (px, 6.4 to the metre), the gap at the couplings, livery; loco: the first car is a
// locomotive; dd: double deck; op: only that operator's
const TRAIN_MODELS = [
  { name: '471 CityElefant', kind: 's', secs: [169, 169, 169], gap: 5, body: '#eceff1', roof: '#8d959c', band: '#1d4fa0', dd: true, p: 0.45 },
  { name: '650 RegioPanter', kind: 's', secs: [138, 138], gap: 4, body: '#f1f3f4', roof: '#959ca2', band: '#2a6ec6', p: 0.3 },
  { name: '640 RegioPanter', kind: 's', secs: [134, 134, 134], gap: 4, body: '#f1f3f4', roof: '#959ca2', band: '#2a6ec6', p: 0.25 },
  { name: '660 InterPanter', kind: 'r', secs: [173, 173, 173, 173, 173], gap: 4, body: '#eceff1', roof: '#8d959c', band: '#1d4fa0', p: 0.45 },
  { name: '362 and coaches', kind: 'r', loco: '#1f4f9e', secs: [108, 169, 169, 169, 169], gap: 6, body: '#2b5aa8', roof: '#7f868c', band: '#e8ecef', p: 0.55 },
  { name: 'RegioJet', kind: 'r', op: 'rj', loco: '#f2c300', secs: [120, 169, 169, 169, 169, 169], gap: 6, body: '#f5c800', roof: '#6b6f73', band: '#262626', p: 1 },
  { name: '380 and EuroCity coaches', kind: 'x', loco: '#2357b0', secs: [120, 169, 169, 169, 169, 169, 169], gap: 6, body: '#2d4f8f', roof: '#7a8187', band: '#e8ecef', p: 0.6 },
  { name: 'railjet', kind: 'x', loco: '#7a1b23', secs: [123, 169, 169, 169, 169, 169, 169, 169], gap: 5, body: '#7a1b23', roof: '#55595e', band: '#d9d9d9', p: 0.4 },
];
const TL = B5 && BRNO_DATA.tl ? BRNO_DATA.tl.map(([ref, col, dest, f, st, lv, next, fl], i) => {
  const pts = [], cs = [0];
  for (let k = 0; k < f.length; k += 2) pts.push([f[k] * T, f[k + 1] * T]);
  for (let k = 1; k < pts.length; k++) cs.push(cs[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  const stops = []; for (let k = 0; k < st.length; k += 2) stops.push({ s: st[k] * T, name: BRNO_DATA.tsn[st[k + 1]] });
  const lvs = []; for (let k = 0; k < lv.length; k += 3) lvs.push([lv[k] * T, lv[k + 1] * T, lv[k + 2]]);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { i, ref, col, dest, pts, cs, len: cs[cs.length - 1], stops, lv: lvs, next, edgeIn: !!(fl & 1), edgeOut: !!(fl & 2), fed: !!(fl & 4), lights: [], bb: [x0, y0, x1, y1], spawnT: 0, K: TRAM_K };
}) : [];
if (B5 && BRNO_DATA.trn) for (const [ref, kind, op, col, dest, f, st, lv, fl] of BRNO_DATA.trn) { // (the trains: see TRAIN_KIND)
  const pts = [], cs = [0];
  for (let k = 0; k < f.length; k += 2) pts.push([f[k] * T, f[k + 1] * T]);
  for (let k = 1; k < pts.length; k++) cs.push(cs[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  const stops = []; for (let k = 0; k < st.length; k += 2) stops.push({ s: st[k] * T, name: BRNO_DATA.trsn[st[k + 1]] });
  const lvs = []; for (let k = 0; k < lv.length; k += 3) lvs.push([lv[k] * T, lv[k + 1] * T, lv[k + 2]]);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  // (where the map's data has a street meet the railway on the level, it is an underpass or a bridge whose level the data
  // doesn't tell: the train goes over the street there, clear of the traffic, a car's length either side)
  const RG = new Map(), RC = 256, rg = (i, j) => i * 65536 + j; // (the route's pieces in a grid: each street piece meets a few)
  for (let k = 1; k < pts.length; k++) { const a = pts[k - 1], b = pts[k];
    for (let j = Math.floor(Math.min(a[1], b[1]) / RC); j <= Math.floor(Math.max(a[1], b[1]) / RC); j++) for (let i = Math.floor(Math.min(a[0], b[0]) / RC); i <= Math.floor(Math.max(a[0], b[0]) / RC); i++) { const q = rg(i, j); if (!RG.has(q)) RG.set(q, []); RG.get(q).push(k); } }
  for (const e of EDGES) {
    if (e.tunnel || e.over) continue;
    const P = e.pts;
    for (let i = 1; i < P.length; i++) {
      const c0 = P[i - 1], c1 = P[i];
      if (Math.max(c0[0], c1[0]) < x0 || Math.min(c0[0], c1[0]) > x1 || Math.max(c0[1], c1[1]) < y0 || Math.min(c0[1], c1[1]) > y1) continue;
      const ks = new Set(); // (the route's pieces in the cells this street piece touches, in their order along the route)
      for (let j = Math.floor(Math.min(c0[1], c1[1]) / RC); j <= Math.floor(Math.max(c0[1], c1[1]) / RC); j++) for (let ii = Math.floor(Math.min(c0[0], c1[0]) / RC); ii <= Math.floor(Math.max(c0[0], c1[0]) / RC); ii++) for (const k of RG.get(rg(ii, j)) || []) ks.add(k);
      for (const k of [...ks].sort((p, q) => p - q)) {
        const a = pts[k - 1], b = pts[k];
        if (Math.max(a[0], b[0]) < Math.min(c0[0], c1[0]) || Math.min(a[0], b[0]) > Math.max(c0[0], c1[0]) || Math.max(a[1], b[1]) < Math.min(c0[1], c1[1]) || Math.min(a[1], b[1]) > Math.max(c0[1], c1[1])) continue;
        const cr = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]), d1 = cr(a, b, c0), d2_ = cr(a, b, c1), d3 = cr(c0, c1, a), d4 = cr(c0, c1, b);
        if (!(d1 * d2_ < 0 && d3 * d4 < 0)) continue;
        const f = d3 / (d3 - d4), s = cs[k - 1] + f * (cs[k] - cs[k - 1]);
        if (lvs.some(([u, w, v]) => v && s >= u && s <= w)) continue;
        const m = (e.wd || 64) / 2 + 100; lvs.push([Math.max(0, s - m), s + m, 1]);
      }
    }
  }
  lvs.sort((a, b) => a[0] - b[0]);
  for (let k = lvs.length - 1; k > 0; k--) if (lvs[k][2] === lvs[k - 1][2] && lvs[k][0] <= lvs[k - 1][1] + 1) { lvs[k - 1][1] = Math.max(lvs[k - 1][1], lvs[k][1]); lvs.splice(k, 1); }
  TL.push({ i: TL.length, ref: ref.split('/')[0], refs: ref, col: col || TRAIN_KIND[kind].col, dest, pts, cs, len: cs[cs.length - 1], stops, lv: lvs, next: [], edgeIn: !!(fl & 1), edgeOut: !!(fl & 2), fed: false,
    lights: [], bb: [x0, y0, x1, y1], spawnT: 0, train: true, kind, op, K: TRAIN_KIND[kind] });
}
// a point on a route at arc length s, and the heading there (straight on beyond either end)
function tramPt(R, s) {
  const cs = R.cs, P = R.pts, n = P.length;
  if (s <= 0 || s >= R.len) {
    const [a, b] = s <= 0 ? [P[0], P[1]] : [P[n - 2], P[n - 1]], h = Math.atan2(b[1] - a[1], b[0] - a[0]), e = s <= 0 ? s : s - R.len, o = s <= 0 ? a : b;
    return [o[0] + Math.cos(h) * e, o[1] + Math.sin(h) * e, h];
  }
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cs[m] <= s) lo = m; else hi = m; }
  const a = P[lo], b = P[hi], f = (s - cs[lo]) / ((cs[hi] - cs[lo]) || 1);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, Math.atan2(b[1] - a[1], b[0] - a[0])];
}
const tramLv = (R, s) => { for (const [a, b, v] of R.lv) if (s >= a && s <= b) return v; return 0; };
for (const R of TL) {
  // the fastest a tram takes each bit of its route (every 8 px): gently round the bends
  R.vmax = new Float32Array(Math.ceil(R.len / 8) + 1);
  for (let k = 0; k < R.vmax.length; k++) {
    const k0 = tramPt(R, k * 8 - 24)[2], k1 = tramPt(R, k * 8 + 24)[2], kap = Math.abs(wrapA(k1 - k0)) / 48;
    R.vmax[k] = kap > 1e-4 ? Math.min(R.K.V, Math.max(R.train ? 40 : 28, Math.sqrt((R.train ? 30 : 38) / kap))) : R.K.V;
  }
  if (R.train) continue; // (a train meets no traffic lights: the level crossings close for it)
  // red lights: where the route comes into a signalised junction along one of its streets, the tram waits at the stop
  // line with that street's traffic (crossing a junction on its own track, it has its own signal: it goes)
  for (const n of LIGHT_NODES) {
    if (n.x < R.bb[0] - 80 || n.x > R.bb[2] + 80 || n.y < R.bb[1] - 80 || n.y > R.bb[3] + 80) continue;
    let s = 0;
    while (s < R.len) {
      const [x, y] = tramPt(R, s), d = Math.hypot(x - n.x, y - n.y);
      if (d > 300) { s += Math.max(8, d - 300); continue; }
      if (d >= 40) { s += 8; continue; }
      let sm = s, dm = d; // (the nearest it comes)
      for (let q = s; q < Math.min(R.len, s + 120); q += 4) { const [qx, qy] = tramPt(R, q), dq = Math.hypot(qx - n.x, qy - n.y); if (dq < dm) { dm = dq; sm = q; } }
      let sa = sm; while (sa > 0) { const [ax, ay] = tramPt(R, sa); if (Math.hypot(ax - n.x, ay - n.y) >= n.clr) break; sa -= 4; }
      const [ax, ay, ah] = tramPt(R, sa), ux = (ax - n.x) / (Math.hypot(ax - n.x, ay - n.y) || 1), uy = (ay - n.y) / (Math.hypot(ax - n.x, ay - n.y) || 1);
      let be = null, bd = 0.85;
      for (const e of n.edges) if (n.grp.has(e.id)) { const [dx, dy] = n.dirs.get(e.id), dt = dx * ux + dy * uy; if (dt > bd && Math.cos(ah) * dx + Math.sin(ah) * dy < -0.7) { bd = dt; be = e; } }
      if (be && sa > 0) R.lights.push({ s: sa - 2, n, g: n.grp.get(be.id) });
      s = sm + 200;
    }
  }
  R.lights.sort((a, b) => a.s - b.s);
}
// a train whose route ends inside the map (at the main station, mostly) would stand on a through track: after its stop it
// runs on, out of service, along a route that goes on from there the same way (over that track, or the next one: it
// crosses over to it at the points), and out over the map's edge
function routeProj(R, x, y) {
  let bs = 0, bd = 1e9;
  for (let k = 1; k < R.pts.length; k++) {
    const [ax, ay] = R.pts[k - 1], [bx, by] = R.pts[k], dx = bx - ax, dy = by - ay, f = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1), d = Math.hypot(ax + dx * f - x, ay + dy * f - y);
    if (d < bd) { bd = d; bs = R.cs[k - 1] + f * (R.cs[k] - R.cs[k - 1]); }
  }
  return [bs, bd];
}
for (const R of TL) {
  if (!R.train || R.edgeOut) continue;
  const [ex, ey, eh] = tramPt(R, R.len);
  for (const Q of TL) {
    if (!Q.train || Q === R || !Q.edgeOut || ex < Q.bb[0] - 10 || ex > Q.bb[2] + 10 || ey < Q.bb[1] - 10 || ey > Q.bb[3] + 10) continue;
    const [sq, d] = routeProj(Q, ex, ey);
    if (d > 60 || Math.cos(tramPt(Q, sq)[2] - eh) < 0.9) continue;
    let ok = true;
    for (let b = 40; b <= 1250 && ok && sq - b > 0 && R.len - b > 0; b += 60) { const [ax, ay] = tramPt(Q, sq - b), [bx, by] = tramPt(R, R.len - b); if (Math.hypot(ax - bx, ay - by) > 60) ok = false; }
    if (ok && (!R.cont || d < R.cont[2] - 4 || (d < R.cont[2] + 4 && Q.len - sq > R.cont[0].len - R.cont[1]))) R.cont = [Q, sq, d];
  }
}
// the stops: a sign on the pavement beside each (people wait there), and the tunnels' portals
const TRAM_STOPS = [], TRAM_PORTALS = [];
// the stations' platforms as OpenStreetMap draws them (outlines, or lines along their middle), in px
const PLATS = B5 && BRNO_DATA.plat ? BRNO_DATA.plat.map(f => { const r = []; for (let k = 0; k < f.length; k += 2) r.push([f[k] * T, f[k + 1] * T]); const xs = r.map(q => q[0]), ys = r.map(q => q[1]);
  return { r, closed: r.length > 3 && Math.hypot(r[0][0] - r[r.length - 1][0], r[0][1] - r[r.length - 1][1]) < 2, bb: [Math.min(...xs) - 8, Math.min(...ys) - 8, Math.max(...xs) + 8, Math.max(...ys) + 8] }; }) : [];
const onPlat = (x, y) => PLATS.some(P => x > P.bb[0] && x < P.bb[2] && y > P.bb[1] && y < P.bb[3] && (P.closed ? inRings([P.r.flat()], x, y) : P.r.some((q, k) => k && segPtD(x, y, P.r[k - 1][0], P.r[k - 1][1], q[0], q[1]) < 7)));
// a train's stop: its middle by the station's point, the platform shared by the trains that stop there on that track
function trainPlat(R, st) {
  const [x, y, h] = tramPt(R, st.s);
  st.pl = TRAM_STOPS.find(o => o.train && o.name === st.name && Math.hypot(o.tx - x, o.ty - y) < 120 && Math.cos(o.a - h) > 0.5);
  if (st.pl) return;
  st.pl = { name: st.name, tx: x, ty: y, x, y, a: h, R, s: st.s, cap: randi(6, 16), last: -rand(60, 400), spots: null, train: true, side: 1 };
  TRAM_STOPS.push(st.pl);
}
for (const R of TL) {
  for (const st of R.stops) {
    if (R.train) { trainPlat(R, st); continue; }
    const [x, y, h] = tramPt(R, st.s), nx = -Math.sin(h), ny = Math.cos(h); // (the right-hand side: the doors open there)
    const same = TRAM_STOPS.find(o => !o.train && o.name === st.name && Math.hypot(o.tx - x, o.ty - y) < 40 && Math.cos(o.a - h) > 0.5);
    if (same) { st.pl = same; continue; }
    let at = null;
    for (let o = 16; o <= 64 && !at; o += 4) { const px = x + nx * o, py = y + ny * o, k = Math.floor(py / T) * MW + Math.floor(px / T); if (px > 0 && py > 0 && px < MW * T && py < MH * T && map[k] === WALK) at = [px, py, k]; }
    st.pl = { name: st.name, tx: x, ty: y, x: at ? at[0] : x + nx * 16, y: at ? at[1] : y + ny * 16, a: h, R, s: st.s, cap: randi(3, 8), last: -rand(40, 200), spots: null };
    TRAM_STOPS.push(st.pl);
    if (at) { pedSpot[at[2]] = 2; props.push({ k: 'tramstop', x: at[0], y: at[1], a: h, name: st.name }); }
  }
  for (const [a, b, v] of R.lv) if (v < 0) for (const [s, into] of [[a, 1], [b, -1]]) {
    if (s < 2 || s > R.len - 2) continue;
    const [x, y, h] = tramPt(R, s);
    if (!TRAM_PORTALS.some(o => Math.hypot(o.x - x, o.y - y) < 12)) TRAM_PORTALS.push({ x, y, a: into > 0 ? h : h + Math.PI, w: R.K.w + 10 });
  }
}
// (no car parked on a tram track, or on the railway)
const RAILT = TL.some(R => R.train) ? new Uint8Array(MW * MH) : null;
if (RAILT) for (const R of TL) if (R.train) for (let s = 0; s < R.len; s += 8) { const [x, y] = tramPt(R, s); for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const tx = Math.floor((x + i * 14) / T), ty = Math.floor((y + j * 14) / T); if (tx >= 0 && ty >= 0 && tx < MW && ty < MH) RAILT[ty * MW + tx] = 1; } }
if (RAILT) for (const arr of [parkSpots, fixedParked]) for (let i = arr.length - 1; i >= 0; i--) { const o = arr[i]; if (RAILT[Math.floor(o.y / T) * MW + Math.floor(o.x / T)]) arr.splice(i, 1); }
if (TL.length) for (const arr of [parkSpots, fixedParked]) for (let i = arr.length - 1; i >= 0; i--) { const o = arr[i]; if (TL.some(R => !R.train && o.x > R.bb[0] - 20 && o.x < R.bb[2] + 20 && o.y > R.bb[1] - 20 && o.y < R.bb[3] + 20 && R.pts.some((q, k) => k && segPtD(o.x, o.y, R.pts[k - 1][0], R.pts[k - 1][1], q[0], q[1]) < 18))) arr.splice(i, 1); }
for (const d of DOORS) if (!pedSpot[d.ty * MW + d.tx]) pedSpot[d.ty * MW + d.tx] = 1;
const LANDMARKS = [
  ...(BRNO ? [] : [{ name: AIRPORT.name, x0: 76, y0: 76, x1: 96, y1: 96 }]),
  ...SITES,
];
function placeName(x, y) {
  const tx = Math.floor(x / T), ty = Math.floor(y / T), k = ty * MW + tx;
  if (!(tx >= 0 && ty >= 0 && tx < MW && ty < MH)) return 'the open sea'; // (also catches a position that went NaN)
  for (const l of LANDMARKS) if (tx >= l.x0 && tx <= l.x1 && ty >= l.y0 && ty <= l.y1) return l.name;
  if (BRNO && (tile(tx, ty) === WATER || bridge[k])) { if (tx < RESERVOIR[0] && ty < RESERVOIR[1]) return 'Brněnská přehrada'; let best = null, bd = 3 * BK; for (const L of WATERLINES) { const [d, hw] = lineDist(L.pts, tx + 0.5, ty + 0.5); if (d - hw < bd) { bd = d - hw; best = L.name; } } if (best) return best; }
  if (!BRNO && (tile(tx, ty) === WATER || bridge[k])) {
    if (tx <= RIVER_X1 - 3 && Math.abs(ty + 0.5 - riverY(tx + 0.5)) < RIVER_HW + 0.6) return 'Copper River';
    for (const L of LAKES) if (Math.hypot((tx + 0.5 - L.x) / L.rx, (ty + 0.5 - L.y) / L.ry) < 1.4) return L.name;
  }
  if (isHighway(tx, ty)) return eR[k] >= 0 ? EDGES[eR[k]].name : 'Ring Expressway';
  return DISTRICTS[REG[k]].name;
}
// the street you are on, for the HUD
function streetName(x, y) {
  const tx = Math.floor(x / T), ty = Math.floor(y / T), k = ty * MW + tx;
  if (player.car && player.car.lay === 1 && tE[k] >= 0) return EDGES[tE[k]].name;
  if (player.car && player.car.lay === 3 && oE[k] >= 0) return EDGES[oE[k]].name;
  return tile(tx, ty) === ROAD && eR[k] >= 0 ? EDGES[eR[k]].name : null;
}

const mm = document.createElement('canvas'); mm.width = MW; mm.height = MH;
{
  const m = mm.getContext('2d'), img = m.createImageData(MW, MH);
  const C = { [ROAD]: [70, 70, 76], [WALK]: [140, 138, 132], [BUILD]: [35, 35, 40], [GRASS]: [60, 120, 55], [WATER]: [30, 80, 125], [PLAZA]: [100, 96, 90],
    [SAND]: [214, 192, 140], [FIELD]: [170, 150, 80], [ROCK]: [122, 116, 108] };
  for (let i = 0; i < MW * MH; i++) {
    let c = C[map[i]];
    if (map[i] === GRASS && (BRNO ? LCG[i] === LC_FOREST : DISTRICTS[REG[i]].woods)) c = [38, 88, 44];
    else if (map[i] === GRASS && BRNO && LCG[i] === LC_GREEN) c = [76, 150, 70];
    else if (map[i] === WATER && !inCity(i % MW, (i / MW) | 0) && F.wa[((i / MW) | 0) * GW + i % MW] < 2.5 && DISTRICTS[REG[i]].beach) c = [40, 140, 150];
    const d = img.data, o = i * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
  }
  m.putImageData(img, 0, 0);
  for (const f of FIELDS) { m.fillStyle = { wheat: '#c8a850', plough: '#8a6a48', green: '#6a9a40', corn: '#4a7a30', rape: '#e0cc40', vine: '#5a7a38' }[f.crop]; m.fillRect(f.x0, f.y0, f.x1 - f.x0 + 1, f.y1 - f.y0 + 1); }
  for (const b of buildings) if (b.mmc) {
    m.fillStyle = b.mmc;
    if (b.wr) { m.beginPath(); for (const r of b.wr) for (let i = 0; i < r.length; i += 2) i ? m.lineTo(r[i] / T, r[i + 1] / T) : m.moveTo(r[i] / T, r[i + 1] / T); m.fill('evenodd'); }
    else m.fillRect(b.x / T, b.y / T, b.w / T, b.h / T);
  }
  m.strokeStyle = '#8a7f74'; m.lineWidth = 0.9; m.setLineDash([2, 1.2]); // railway lines
  for (const R of RAILS) { m.beginPath(); R.forEach(([x, y], i) => i ? m.lineTo(x / T, y / T) : m.moveTo(x / T, y / T)); m.stroke(); }
  m.strokeStyle = '#46464c'; m.lineWidth = 1.6; m.setLineDash([2, 1.5]); // tunnels
  for (const e of TUNNELS) { m.beginPath(); e.pts.forEach(([x, y], i) => i ? m.lineTo(x / T, y / T) : m.moveTo(x / T, y / T)); m.stroke(); }
  m.setLineDash([]); m.strokeStyle = '#8a8a90'; m.lineWidth = 2; // overpasses
  for (const e of OVERS) { m.beginPath(); e.pts.forEach(([x, y], i) => i ? m.lineTo(x / T, y / T) : m.moveTo(x / T, y / T)); m.stroke(); }
}

// ============================================================ flow fields (police pathing)
const fq = new Int32Array(MW * MH);
// a breadth-first flow field toward (px, py); given the follower's position (cx, cy) it stops a margin past it
function computeFlowInto(flow, px, py, cx, cy, water) {
  flow.fill(32767);
  const sx = Math.floor(px / T), sy = Math.floor(py / T);
  if (water ? tile(sx, sy) !== WATER : solidT(tile(sx, sy))) return;
  let h = 0, t = 0, stop = 32767; const s = sy * MW + sx; flow[s] = 0; fq[t++] = s;
  const ck = cx === undefined ? -1 : Math.floor(cy / T) * MW + Math.floor(cx / T);
  while (h < t) {
    const i = fq[h++], x = i % MW, y = (i / MW) | 0, d = flow[i] + 1;
    if (d > stop) break;
    if (i === ck) stop = d + 20;
    for (let k = 0; k < 4; k++) {
      const nx = x + DX[k], ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
      const j = ny * MW + nx;
      if (flow[j] > d && (water ? map[j] === WATER : !solidT(map[j]))) { flow[j] = d; fq[t++] = j; }
    }
  }
}
const flowAt = (f, tx, ty) => (tx < 0 || ty < 0 || tx >= MW || ty >= MH) ? 32767 : f[ty * MW + tx];
function los(x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 12);
  for (let i = 1; i < n; i++) { const x = lerp(x0, x1, i / n), y = lerp(y0, y1, i / n); if (solidAt(x, y) && !seeThrough(x, y)) return false; }
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
  sealion: () => { tone(470, 0.13, 'sawtooth', 0.08, 300); tone(450, 0.13, 'sawtooth', 0.08, 290, now() + 0.22); }, // (ar! ar!)
  panda: () => { noise(0.07, 1300, 'bandpass', 0.25, 3); noise(0.07, 1100, 'bandpass', 0.25, 3, now() + 0.16); }, // (munching bamboo)
  jackal: () => { tone(620, 0.55, 'sine', 0.07, 1000); tone(1000, 0.9, 'sine', 0.06, 640, now() + 0.55); }, // (a howl)
  ring: () => { tone(1250, 0.07, 'square', 0.05); tone(1550, 0.07, 'square', 0.05, 0, now() + 0.1); },
  horn: () => { tone(340, 0.28, 'square', 0.05); tone(430, 0.28, 'square', 0.04); },
  good: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'square', 0.07, 0, now() + i * 0.09)),
  ach: () => [659, 988, 1319, 1976].forEach((f, i) => tone(f, i === 3 ? 0.5 : 0.14, 'triangle', 0.09, 0, now() + i * 0.07)),
  bad: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.25, 'sawtooth', 0.06, 0, now() + i * 0.12)),
  spray: () => noise(1.0, 5000, 'highpass', 0.25),
  quantum: () => { tone(220, 0.6, 'sine', 0.15, 1760); tone(330, 0.6, 'sine', 0.1, 2640, now() + 0.05); },
  collapse: () => { tone(1800, 0.35, 'sine', 0.15, 120); noise(0.2, 3000, 'bandpass', 0.2, 2); },
  swap: () => { tone(80, 0.5, 'sine', 0.2, 900); tone(1200, 0.4, 'triangle', 0.08, 300, now() + 0.1); },
  cast: () => noise(0.3, 1400, 'bandpass', 0.25, 2),
  plop: () => { tone(420, 0.12, 'sine', 0.14, 140); noise(0.12, 900, 'lowpass', 0.15); },
  bite: () => { tone(300, 0.1, 'sine', 0.18, 90); noise(0.2, 700, 'lowpass', 0.3); tone(1400, 0.06, 'square', 0.05, 0, now() + 0.05); },
  drag: () => noise(0.35, 4200, 'bandpass', 0.12, 6),
  snap: () => { noise(0.07, 3000, 'highpass', 0.5); tone(1900, 0.1, 'triangle', 0.08, 600); },
  jet: () => { noise(1.8, 600, 'lowpass', 0.7, 0.7); tone(200, 1.5, 'sawtooth', 0.05, 45); },
  siren: () => [0, 0.32, 0.64].forEach(w => { tone(880, 0.16, 'square', 0.05, 0, now() + w); tone(660, 0.16, 'square', 0.05, 0, now() + w + 0.16); }),
  tram: () => [0, 0.2].forEach(w => { tone(2150, 0.18, 'triangle', 0.06, 0, now() + w); tone(3230, 0.12, 'sine', 0.025, 0, now() + w); }), // (the bell: ding-ding)
  train: () => [[0, 0.55], [0.7, 0.9]].forEach(([w, d]) => { tone(311, d, 'sawtooth', 0.045, 0, now() + w); tone(392, d, 'sawtooth', 0.035, 0, now() + w); tone(466, d, 'square', 0.02, 0, now() + w); }), // (the horn: two blasts)
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
let keys = { up: 0, down: 0, left: 0, right: 0, fire: 0 }; // (let: in online co-op the host swaps in the guest's)
let pressed = {};
const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'fire' };
addEventListener('keydown', e => {
  if (typeof DBG !== 'undefined' && dbgOpen()) return; // (typing into the debug console)
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
cv.addEventListener('pointerdown', e => { initAudio(); pressed.Tap = true; tapAt = { x: e.clientX, y: e.clientY }; if (state === 'aod') aodPointer('down', e.clientX, e.clientY); });
addEventListener('pointermove', e => { if (state === 'aod') aodPointer('move', e.clientX, e.clientY); });
addEventListener('pointerup', e => { if (state === 'aod') aodPointer('up', e.clientX, e.clientY); });

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
  tank:    { label: 'Tank',           w: 26, l: 44, max: 105, acc: 70, turn: 1.4, hp: 1300, mass: 7.0, colors: ['#556b2f'] },
  ambulance: { label: 'Ambulance',    w: 18, l: 38, max: 310, acc: 195, turn: 2.6, hp: 300, mass: 1.4, colors: ['#f4f6f7'] },
  swat:    { label: 'SWAT Van',       w: 20, l: 42, max: 300, acc: 170, turn: 2.2, hp: 650, mass: 2.6, colors: ['#1c2330'] },
  firetruck: { label: 'Fire Truck',   w: 20, l: 50, max: 260, acc: 150, turn: 2.0, hp: 480, mass: 2.6, colors: ['#c0392b'] },
  bureau:  { label: 'Bureau Van',     w: 20, l: 40, max: 330, acc: 210, turn: 2.4, hp: 700, mass: 2.6, colors: ['#15171c'] },
  apc:     { label: 'Armoured Carrier', w: 24, l: 48, max: 270, acc: 150, turn: 2.0, hp: 1500, mass: 6.0, colors: ['#4b5320'] },
  dozer:   { label: 'Armoured Bulldozer', w: 28, l: 46, max: 175, acc: 110, turn: 1.6, hp: 2400, mass: 10, colors: ['#d4a017'] },
  tanker:  { label: 'Fuel Tanker',    w: 20, l: 60, max: 200, acc: 90, turn: 1.6, hp: 400, mass: 3.4, colors: ['#e9ecef'] },
  tram:    { label: 'Tram',           w: 16, l: 62, max: 150, acc: 63, turn: 0, hp: 1500, mass: 40, colors: ['#d3202a'] }, // (only the cab you drive: see the trams)
  train:   { label: 'Train',          w: 19, l: 169, max: 200, acc: 10, turn: 0, hp: 3000, mass: 200, colors: ['#eceff1'] }, // (likewise)
  speedboat: { label: 'Speedboat',   w: 12, l: 34, max: 330, acc: 150, turn: 2.1, hp: 190, mass: 1.0, colors: ['#f4f4f4', '#1e5aa8', '#c0392b', '#f1c40f', '#1b1b1b'], boat: 'motor' },
  rowboat: { label: 'Rowing Boat',    w: 9, l: 20, max: 75, acc: 55, turn: 1.9, hp: 80, mass: 0.4, colors: ['#a0522d', '#8b5a2b', '#2e86c1', '#27ae60'], boat: 'row' },
  sailboat: { label: 'Sailing Dinghy', w: 11, l: 26, max: 150, acc: 50, turn: 1.7, hp: 110, mass: 0.6, colors: ['#f4f4f4', '#e8e0d0', '#1e5aa8'], boat: 'sail' },
  policeboat: { label: 'Police Boat', w: 14, l: 38, max: 340, acc: 170, turn: 2.1, hp: 360, mass: 1.5, colors: ['#f2f2f2'], boat: 'motor' },
  tractor: { label: 'Tractor',        w: 17, l: 27, max: 150, acc: 120, turn: 2.6, hp: 340, mass: 2.0, colors: ['#2e7d32', '#c62828', '#1565c0', '#e0a800'], offroad: true },
  armytruck: { label: 'Army Tatra',   w: 22, l: 54, max: 240, acc: 120, turn: 1.8, hp: 800, mass: 3.2, colors: ['#4b5320'], offroad: true },
  jeep:    { label: 'Army Land Rover', w: 16, l: 30, max: 320, acc: 230, turn: 2.9, hp: 360, mass: 1.5, colors: ['#556b2f'], offroad: true },
};
const CIV_RURAL = ['compact', 'sedan', 'sedan', 'truck', 'truck', 'tractor', 'bike', 'sports', 'taxi'];
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
let trams = [], tramsFar = [], tramId = 1; // (inner Brno's trams, see updateTrams: near you in full, further off only along their lines)
let HQ = hqNew(), tankerCars = [], EPR = null; // (wanted levels 6 to 10, see updateWanted)
let player = { x: 0, y: 0, vx: 0, vy: 0, angle: 0, hp: 100, car: null, weapons: {}, weapon: null, cash: 0, lives: 5, mult: 1,
  anim: 0, moving: false, shootCd: 0, bust: 0, down: 0, downKind: null, hidden: true,
  shirt: '#ff7a1a', skin: '#e0ac69', hair: '#1a1a1a', pants: '#1e2a3a' };
let state = 'title', time = 0, heat = 0, lastCrime = -99, shake = 0, overlay = null, msgs = [];
let showMap = 1, helpPage = 0, won = false, mission = null, ringing = null, ringCd = 4, ringBeep = 0;
let rbCd = 6, spawnT = 0, policeCd = 0, heatCd = 0, curDistrict = -1, sprayCd = 0, serviceCd = 0;
let dayT = 17 / 24, tapAt = null, lab = null, labFlags = {}, labCars = [], labRect = null;
const DAY_LEN = 1440; // seconds per in-game day (24 minutes: an hour of the day a minute)
const flight = { t: 8, x: 0, v: 0, alt: 0, on: false };
let best = 0; try { best = +localStorage.getItem('gridlock.best') || 0; } catch (e) { /* storage unavailable */ }
let cam = { x: 0, y: 0, zoom: 1 };
const GOAL = 100000;

// ---- quantum state
let Q = { psi: 1, ent: 2, link: null, linkT: 0, decoy: null, decoyT: 0, branches: null, supT: 0, grace: 0, obsT: 0, notes: new Set(), note: null };
// what the police believe about your position: a spreading cloud
const belief = { x: 0, y: 0, vx: 0, vy: 0, sig: 0, seen: false, seeT: 0 };

const pp = () => player.car || player;
function msg(text, t = 4) { if (HANTEC_ON) text = hx(text); msgs.push({ text, t }); if (msgs.length > 4) msgs.shift(); }
function bigText(text, color, t = 2.5, sub = '') { if (HANTEC_ON) { text = hx(text); sub = hx(sub); } overlay = { text, color, t, max: t, sub }; }

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
  if (opt.swat) Object.assign(p, { swat: true, hp: 120, shirt: '#252a33', pants: '#1a1d23', speed: 40 });
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
  swap: {
    title: 'Entanglement and long-distance collapse',
    body: 'Measure one particle of an entangled pair and the outcome for its partner is fixed at that same instant, however far apart they are. Quantum teleportation builds on this to move a quantum state from one place to another, and it has been done across more than 1,000 km, from the ground to a satellite.',
    lib: 'Game liberty: teleportation moves a state, never matter, and it needs an ordinary message (no faster than light) to finish. Nothing can be sent faster than light (the no-signalling theorem), so swapping cars, or the police learning anything from your twin, is fiction.',
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
  fishing: {
    title: 'A superposed catch',
    body: 'Now and then a bite is a superposition of two catches, each with its amplitude. Landing it is a measurement: the state collapses to one of them, with the probability shown (the Born rule), and that is what you find on the hook.',
    lib: 'Game liberty: a fish (or a boot) is big, warm and wet, and the water around it measures it all the time (decoherence), so a real catch is never in a superposition you could land.',
  },
  tweezer: {
    title: 'Optical tweezers',
    body: 'A tightly focused laser beam holds a single atom where the light is brightest, like a ball in a bowl (a harmonic trap). Move the beam and the atom follows, but a sudden push sets it sloshing, and with nothing to slow it down the energy stays: it climbs the trap\'s ladder of vibration levels (n̄, the mean number of motional quanta). Smooth, slow moves keep n̄ low; a hard enough kick throws the atom out (atom loss). Neutral-atom quantum computers shuttle their qubits around this way.',
    lib: 'Game liberty: tweezers hold atoms, not cars. They move them micrometres in a few hundred microseconds, the motion is quantised in tiny steps, and atoms are re-cooled with lasers, not by parking.',
  },
  rydberg: {
    title: 'Rydberg blockade & zones',
    body: 'Excite an atom to a huge Rydberg state and it shifts the levels of every atom within a few micrometres, so two close atoms can\'t both be excited: the Rydberg blockade. One laser pulse over the whole entangling zone then gives every close pair a CZ gate at once and leaves lone atoms alone. A third atom within the radius spoils the gate (crosstalk). Qubits wait in a storage zone and are read out in a zone of their own, because the imaging light would disturb any qubit nearby.',
    lib: 'Game liberty: the blockade radius is a few micrometres, and a CZ gate only entangles qubits that start in superpositions. Here a clean pulse simply hands you an entangled pair.',
  },
  tunnel: {
    title: 'Quantum tunnelling',
    body: 'A quantum particle can cross a barrier it hasn\'t the energy to climb. Its wavefunction doesn\'t stop at the wall: it fades away inside it, and if the wall is thin enough a little of it is left on the far side. That little is the chance of finding the particle there. Alpha decay, tunnel diodes, flash memory and the scanning tunnelling microscope all work this way.',
    lib: 'Game liberty: for anything as big as a car the chance is so small that you would wait far longer than the age of the universe, and it doesn\'t grow while you wait. Here it does, so that it happens.',
  },
  aod: {
    title: 'Shuttling with an AOD',
    body: 'An acousto-optic deflector makes a grid of moving tweezers from a set of x and y radio tones: there is a tweezer wherever a chosen row meets a chosen column. Moving a tone moves its whole row or column, so many atoms shuttle in parallel, but every atom at a crossing comes along, and rows and columns can never cross or merge. Planning such moves is a puzzle that compilers for neutral-atom quantum computers solve.',
    lib: 'Game liberty: here a move takes one press. A real one takes hundreds of microseconds, and the moving tweezers travel between the static traps so they don\'t disturb the atoms left behind.',
  },
  teleport: {
    title: 'Quantum teleportation',
    body: 'Teleportation sends a quantum state, not matter. Alice and Bob share an entangled pair. Alice measures her unknown qubit together with her half of the pair in the Bell basis, gets one of four outcomes and tells Bob by an ordinary call. Bob applies one of four corrections to his half, which then is the state Alice had. Hers was destroyed by the measurement, so nothing gets copied.',
    lib: 'Game liberty: what teleports is a qubit\'s state, never a person, and it needs that call, so it is no faster than light. It has been done from a satellite to the ground, over 1,400 km.',
  },
};
function note(k) {
  if (Q.notes.has(k)) return;
  Q.notes.add(k); Q.note = { k, t: 14 };
  if (Object.keys(NOTES).every(n => Q.notes.has(n))) ach('notes');
}

// ============================================================ car physics
function applyControls(c, throttle, steer, hand, dt) {
  const t = CT[c.type];
  if (t.boat) { boatControls(c, throttle, steer, hand, dt); return; }
  if (c.dead) { throttle = 0; steer = 0; hand = true; }
  // acceleration tapers off toward top speed, so cars build up speed progressively
  if (throttle > 0) c.speed += t.acc * dt * throttle * (c.speed < 0 ? 2.2 : 1 - 0.7 * clamp(c.speed / t.max, 0, 1));
  else if (throttle < 0) c.speed -= (c.speed > 0 ? t.acc * 1.7 : t.acc * 0.6) * dt;
  else c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), 90 * dt);
  c.brk = hand || (throttle < 0 && c.speed > 0);
  if (hand) c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), 200 * dt);
  // off the road a car is much slower: sand and ploughed fields bog it down, grass drags (tractors and the tank don't mind;
  // in a tunnel or up on an overpass the car is on its road whatever the ground above or below it is).
  // Traffic only brushes the verge on the bends of its lanes, so it gets off lightly.
  const tl = tileAtP(c.x, c.y), lane = c.driver === 'ai' || c.driver === 'service';
  const surf = c.ghost || t.offroad || c.type === 'tank' || c.lay ? 1 : tl === SAND ? (lane ? 0.62 : 0.36) : tl === FIELD ? (lane ? 0.7 : 0.42) : tl === GRASS ? (lane ? 0.85 : 0.5) : 1;
  const inB = c.type === 'dozer' && tl === BUILD; // (ploughing through a building)
  const maxF = t.max * (c.hp < t.hp * 0.3 ? 0.7 : 1) * (c.spiked ? 0.5 : 1) * (inB ? 0.55 : 1);
  if (c.spiked && Math.abs(c.speed) > 40 && Math.random() < 0.3 && onScreen(c.x, c.y)) addPart(c.x - Math.cos(c.angle) * t.l * 0.3, c.y - Math.sin(c.angle) * t.l * 0.3, rand(-40, 40), rand(-40, 40), 0.25, 1.5, '#ffd27a'); // (on its rims)
  if (inB && Math.abs(c.speed) > 10 && Math.random() < 0.7 && onScreen(c.x, c.y, 60)) addPart(c.x + Math.cos(c.angle) * t.l / 2 + rand(-12, 12), c.y + Math.sin(c.angle) * t.l / 2 + rand(-12, 12), rand(-30, 30), rand(-30, 30), rand(1, 2), rand(6, 12), pick(['#9e9a92', '#8a857c', '#b5b0a6']), 12, true);
  c.speed = clamp(c.speed, -t.max * 0.35, maxF);
  if (c.speed > maxF * surf) c.speed -= (c.speed - maxF * surf) * Math.min(1, 2.5 * dt);
  const tk = Math.floor(c.y / T) * MW + Math.floor(c.x / T);
  if ((tl === SAND || tl === FIELD || (tl === PLAZA && lotT[tk] === 2) || (tl === ROAD && eR[tk] >= 0 && EDGES[eR[tk]].dirt)) && Math.abs(c.speed) > 90 && !c.ghost && Math.random() < 0.6 && onScreen(c.x, c.y)) {
    const bx = c.x - Math.cos(c.angle) * t.l / 2, by = c.y - Math.sin(c.angle) * t.l / 2;
    addPart(bx, by, rand(-20, 20), rand(-20, 20), 0.9, 4, tl === SAND ? 'rgba(214,190,140,.45)' : 'rgba(140,110,76,.4)', 9); // (slow growth: only fire glows at night)
  }
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
  if (CT[c.type].boat) return boatHits(c, x, y, a);
  const dz = c.type === 'dozer' && !c.lay && !c.ghost; // (an armoured bulldozer goes through buildings)
  for (const [px, py] of carCorners(c, x, y, a)) if (c.lay ? layerSolid(c, px, py) : dz ? dozerSolid(px, py) : solidAt(px, py)) return true;
  if (c.lay === 1 || c.lay === 3) return false; // (no trees in a tunnel, or up on a deck)
  if (HQ.rubble.length && !c.ghost && rubbleHit(c, x, y, a)) return true;
  const t = carTrunk(c, x, y, a);
  if (t && c.lay === 2 && tunT[Math.floor(t.y / T) * MW + Math.floor(t.x / T)]) return false; // (down a ramp, in the cutting: the trees are up above)
  if (t) { if ((c.type === 'tank' || c.type === 'dozer') && !c.ghost) { knockTree(t); return false; } return true; }
  return false;
}
// is (x, y) up on a deck: within its carriageway and the parapets (8 px past each kerb)?
function onDeck(x, y) {
  for (const e of OVERS) { const b = e.obb; if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue; const P = e.pts, r = e.wd / 2 + 8; for (let i = 0; i < P.length - 1; i++) if (closestOnSeg([x, y], P[i], P[i + 1]).d < r) return true; }
  return false;
}
// what a car off the street level runs into: up on a deck, anything off the deck; in a tunnel, the walls of its tube (as
// wide as its lanes, with a shoulder each side); on a ramp, the street's walls until the tube begins
function layerSolid(c, x, y) {
  const tx = Math.floor(x / T), ty = Math.floor(y / T); if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return true;
  const k = ty * MW + tx, tz = tunT[k];
  if (c.lay === 3) return !onDeck(x, y); // up on a deck: only the deck is road
  // (in a tunnel only its bore is road, as wide as its lanes; a deck's ramp that passes over one is not in it)
  if (tz === 1 && c.lay !== 4) { // (the tube the car itself is in, not whichever is nearest each corner: twin tubes run close)
    const id = tE[Math.floor(c.y / T) * MW + Math.floor(c.x / T)] >= 0 ? tE[Math.floor(c.y / T) * MW + Math.floor(c.x / T)] : tE[k]; if (id < 0) return true;
    const P = EDGES[id].pts, r = EDGES[id].wd / 2 + 10; for (let i = 0; i < P.length - 1; i++) if (closestOnSeg([x, y], P[i], P[i + 1]).d < r) return false; return true; }
  return tz === 0 && c.lay === 1 ? true : solidAt(x, y);
}
const layersApart = (a, b) => { const p = a.lay || 0, q = b.lay || 0; // (one in a tunnel or up on a deck, the other on the street; ramps meet both)
  return (p === 1 && q !== 1 && q !== 2) || (q === 1 && p !== 1 && p !== 2) || (p === 3 && q !== 3 && q !== 4) || (q === 3 && p !== 3 && p !== 4); };
// ---- tree trunks: every tree but desert scrub has one, sized to the tree; cars and walkers run into them
function trunkR(t) { return t.sp >= 12 ? 0 : t.sp >= 10 ? t.r * 0.45 : t.sp >= 8 ? 2.6 : clamp(t.r * 0.26, 2.2, 4); }
function treeGrid() { if (!TGRID) { trees.forEach((t, i) => { t.i = i; t.tr = trunkR(t); }); TGRID = gridOf(trees); } return TGRID; }
function nearTrees(x, y, rad, fn) {
  const g = treeGrid();
  for (let cy = Math.floor((y - rad) / 256); cy <= Math.floor((y + rad) / 256); cy++) for (let cx = Math.floor((x - rad) / 256); cx <= Math.floor((x + rad) / 256); cx++) {
    const a = g.get(cx + cy * 1024); if (!a) continue;
    for (const t of a) if (t.tr > 0 && !t.down && Math.abs(t.x - x) < rad + t.tr && Math.abs(t.y - y) < rad + t.tr) { const r = fn(t); if (r) return r; }
  }
  return null;
}
function carTrunk(c, x, y, a) {
  const ct = CT[c.type], hl = ct.l / 2, hw = ct.w / 2, ca = Math.cos(a), sa = Math.sin(a);
  return nearTrees(x, y, hl + 6, t => { const dx = t.x - x, dy = t.y - y, lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca; return Math.abs(lx) < hl + t.tr - 1 && Math.abs(ly) < hw + t.tr - 1 ? t : null; });
}
const trunkAt = (x, y, r) => !!nearTrees(x, y, r + 1, t => Math.hypot(t.x - x, t.y - y) < r + t.tr ? t : null);
function knockTree(t) {
  t.down = true;
  if (NET.guest) NET.ev.push(['tree', t.i]);
  if (onScreen(t.x, t.y)) { sfx.crash(); for (let i = 0; i < 14; i++) addPart(t.x, t.y, rand(-70, 70), rand(-70, 70), rand(0.5, 1.1), rand(2, 4), pick(['#3f7a2c', '#2e5e22', '#6a4a2a']), 4); }
  addDecal({ k: 'scorch', x: t.x, y: t.y, r: t.r * 0.5 });
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
  const vx0 = c.vx, vy0 = c.vy, impact = wallMove(c, dt);
  const tun = impact > 60 && !c.lay && !CT[c.type].boat && !c.tram && (c === player.car || (NET.guest && c === NET.guest.player.car)) && carTunnel(c, vx0, vy0);
  if ((TUNNELS.length || OVERS.length) && !CT[c.type].boat) { // the layer the car is on: 0 the street, 1 a tunnel (only down a ramp, 2), 3 an overpass (only up a ramp, 4)
    const k = Math.floor(c.y / T) * MW + Math.floor(c.x / T), tz = tunT[k] || 0, oz = ovT[k] || 0, L0 = c.lay;
    if (tz && !(oz && (L0 === 3 || L0 === 4))) c.lay = L0 === undefined ? (tz === 1 && c.ln && c.ln.L.e.tunnel ? 1 : tz === 2 && rampAligned(c) ? 2 : 0)
      : tz === 2 ? (L0 === 1 || L0 === 2 || rampAligned(c) ? 2 : L0 === 3 || L0 === 4 ? L0 : 0) : L0 === 1 || L0 === 2 ? 1 : L0 === 3 || L0 === 4 ? L0 : 0; // (down a ramp only along it)
    else if (oz) { // (a car that starts out here is up there only if its lane is)
      const up = L0 === undefined ? !!(c.ln && c.ln.L.e.over) : null;
      c.lay = oz === 2 ? (L0 === 3 || L0 === 4 || (up ?? deckAligned(c, k)) ? 4 : 0) : L0 === 3 || (L0 === 4 && deckAligned(c, k)) || up ? 3 : 0;
    }
    else c.lay = (L0 === 3 || L0 === 4) && onDeck(c.x, c.y) ? L0 : 0; // (by the parapet, past the deck's tiles: still up there)
  }
  if (impact > 130 && !tun) {
    damageCar(c, (impact - 130) * 0.14, c.driver === 'player' ? 'player' : null);
    if (onScreen(c.x, c.y)) sfx.crash();
    if (c === player.car) { shake = Math.min(1, impact / 500); hardKnock(); if (CT[c.type].bike && impact > 200) bikeThrow(); }
    for (let i = 0; i < 5; i++) addPart(c.x, c.y, rand(-80, 80), rand(-80, 80), 0.3, 2, '#ffd27a');
  }
}
// ---- quantum tunnelling: hit a wall, in a car or on foot, and now and then you come out on its far side. The chance grows
// the longer it has been since you last did (1 - e^(-t / 2 min): a fifth after 30 s, two fifths after a minute, two
// thirds after two) and starts again from nothing once you have. (Not in the lessons, nor where X and T are blocked.)
const TUN_TAU = 120;
const tunChance = P => 1 - Math.exp(-Math.max(0, time - (P.tunT ?? time)) / TUN_TAU);
const tunOpen = new Map(); // (is a tile out in the open, not in a closed courtyard? a flood fill that stops once it is big)
function openGround(x, y) {
  const k0 = Math.floor(y / T) * MW + Math.floor(x / T); if (tunOpen.has(k0)) return tunOpen.get(k0);
  const seen = new Set([k0]), q = [k0]; let h = 0;
  while (h < q.length && seen.size < 2500) { const k = q[h++], tx = k % MW, ty = (k / MW) | 0; for (let d = 0; d < 4; d++) { const nx = tx + DX[d], ny = ty + DY[d], n = ny * MW + nx; if (nx < 1 || ny < 1 || nx >= MW - 1 || ny >= MH - 1 || seen.has(n) || solidT(map[n])) continue; seen.add(n); q.push(n); } }
  const r = seen.size >= 2500; for (const k of q) tunOpen.set(k, r); return r;
}
// o is the car or you on foot, P whose chance it is; returns the chance it had when it came off
function tryTunnel(o, vx, vy, r, P, car) {
  if (lab || qBlocked() || (P.tunRoll || 0) > time) return 0;
  P.tunRoll = time + 0.6; // (one try a bump)
  const v = Math.hypot(vx, vy), p = tunChance(P);
  if (v < 40 || Math.random() >= p) return 0;
  const ux = vx / v, uy = vy / v;
  let d = 2; while (d < 40 && !solidAt(o.x + ux * d, o.y + uy * d)) d += 2; // (the wall ahead)
  if (d >= 40) return 0;
  while (d < 320 && solidAt(o.x + ux * d, o.y + uy * d)) d += 3; // (and through it)
  const x = o.x + ux * (d + r + 4), y = o.y + uy * (d + r + 4);
  if (d >= 320 || (car ? carHitsWall(o, x, y, o.angle) : circleSolid(x, y, r)) || !openGround(x, y)) return 0;
  qburst(o.x, o.y, '#3cf0ff'); o.x = x; o.y = y; qburst(x, y, '#3cf0ff'); sfx.quantum();
  P.tunT = time;
  const t = `Quantum tunnelling: through the wall! (it had a ${Math.round(p * 100)}% chance; now it starts again from nothing)`;
  if (P === player) { msg(t, 3.5); note('tunnel'); ach('tunnel'); } else asGuest(() => { msg(t, 3.5); note('tunnel'); ach('tunnel'); });
  return p;
}
function carTunnel(c, vx, vy) {
  const P = c === player.car ? player : NET.guest.player;
  if (!tryTunnel(c, vx, vy, CT[c.type].w / 2 + 2, P, true)) return false;
  c.vx = vx; c.vy = vy; c.speed = vx * Math.cos(c.angle) + vy * Math.sin(c.angle); // (and on at the speed it hit the wall)
  return true;
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
  c.hp -= c.driver === 'player' ? amt * 0.7 : amt; // a car you drive holds out longer (about 40% more health)
  if (src === 'player' && c !== player.car) {
    c.lastHit = 'player';
    if ((c.type === 'police' || c.type === 'policeboat') && heatCd <= 0) { addHeat(0.5); heatCd = 1.5; }
  }
  if (c.hp <= 0 && !c.fire) { c.fire = 2.6; ejectDriver(c, true); }
  // entangled twin takes the same hit
  if (c.twin && !mirroring) { mirroring = true; damageCar(c.twin, amt, src); mirroring = false; }
}
function ejectDriver(c, panic) {
  if (!c.driver || c.driver === 'player') return null;
  const cop = c.driver === 'police';
  c.driver = null; c.chase = false; c.job = null;
  const s = sideSpot(c) || { x: c.x, y: c.y }; // (with no room on either side they squeeze out anyway)
  const p = makePed(s.x, s.y, { cop });
  if (!cop || panic) { p.flee = 6; p.fx = c.x; p.fy = c.y; }
  return p;
}
// an officer (or a SWAT trooper) steps out: the car stays put, empty, until the whole crew is back in
function crewOut(c, opt, k = 0) {
  const s = sideSpot(c, k); if (!s) return null;
  const p = makePed(s.x, s.y, opt); p.car = c; c.driver = null;
  return p;
}
function sideSpot(c, k = 0) {
  const t = CT[c.type], ca = Math.cos(c.angle), sa = Math.sin(c.angle);
  const sides = [[0, -(t.w / 2 + 9)], [0, t.w / 2 + 9], [-(t.l / 2 + 9), 0], [t.l / 2 + 9, 0]];
  for (let i = 0; i < 4; i++) {
    const [lx, ly] = sides[(i + k) % 4];
    const x = c.x + ca * lx - sa * ly, y = c.y + sa * lx + ca * ly;
    if (!circleSolid(x, y, 5)) return { x, y };
  }
  return null;
}
function explodeCar(c) {
  c.dead = true; c.fire = 0; c.hp = 0; c.speed = 0; c.chase = false; c.job = null; c.block = false;
  if (c.lastHit === 'player') {
    earn(c.type === 'police' || c.type === 'policeboat' ? 250 : 100);
    const heavy = c.type === 'tank' || c.type === 'apc' || c.type === 'dozer' || c.type === 'bureau';
    addHeat(c.type === 'police' || c.type === 'policeboat' ? 1 : heavy ? 0.6 : 0.35, heavy);
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
// which of a street's lanes to turn into from lane L: the outermost after a right turn, the innermost after a left, else
// the same one (or any, where the street widens)
function laneInto(o, L) {
  const s = o.sib; if (!s || s.length < 2) return o;
  const t = wrapA(o.h[0] - L.h[L.n - 1]);
  return t > 0.5 ? s[s.length - 1] : t < -0.5 ? s[0] : s.length > L.sib.length ? pick(s) : s[Math.min(L.idx, s.length - 1)];
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
  if (a && a.goal >= 0 && Math.random() < 0.9) { const h = hopRow(a.goal)[L.to]; if (h >= 0 && outs.includes(LANES[h])) return laneInto(LANES[h], L); }
  return laneInto(Math.random() < 0.6 ? straightest(outs, L) : pick(outs), L);
}
function laneAcquire(c, maxD = 96) {
  const p = nearestLanePt(c.x, c.y, c.angle, maxD, c.lay || 0);
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
    if (o === c || o === ignore || layersApart(c, o)) continue;
    const dx = o.x - c.x, dy = o.y - c.y, f = dx * hx + dy * hy;
    if (f <= 0 || f > look + CT[o.type].l / 2) continue;
    if (Math.abs(-dx * hy + dy * hx) < 15) return o;
  }
  if (c.lay === 1 || c.lay === 3) return null; // (nobody walks in the tunnels, or up on the decks)
  if (trams.length) { const tr = tramAhead(c, hx, hy, look + 10); if (tr) return tr; }
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
function pickGoal(c) { // somewhere a fair way off, but not across the island (traffic is only simulated near you)
  for (let i = 0; i < 24; i++) { const n = pick(NODES), d = Math.hypot(n.x - c.x, n.y - c.y); if (d > 20 * T && d < 70 * T) { c.ai.goal = n.id; return; } }
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
    c.flow = c.flow || new Int16Array(MW * MH); computeFlowInto(c.flow, gx, gy, c.x, c.y); c.fgx = gx; c.fgy = gy; c.flowT = 1;
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
// Wanted levels: 1 star, only cops who see you come after you, and they tail you to make an arrest.
// 2 stars, the radio calls in nearby cars and they ram. 3 stars, roadblocks and armed officers.
// 4 stars, SWAT vans and the helicopter. 5 stars, the tank.
function aiPolice(c, dt) {
  if (CT[c.type].boat) { aiBoatCop(c, dt); return; }
  if (c.lay === 1 || c.lay === 3) { aiTraffic(c, dt); return; } // (in a tunnel, or up on an overpass, a cruiser can only drive on through)
  const stars = Math.floor(heat);
  if (c.block) { // part of a roadblock: stay put until the alert is over
    if (heat < 1) c.block = false; else { c.chase = true; applyControls(c, 0, 0, true, dt); return; }
  }
  if (heat < 1 || player.down || player.hidden) { c.chase = false; c.lostT = 0; aiTraffic(c, dt); return; }
  const P0 = copTarget(c), d = Math.hypot(P0.x - c.x, P0.y - c.y), tank = c.type === 'tank', swat = c.type === 'swat';
  const heavy = c.type === 'apc' || c.type === 'dozer';
  if ((tank && stars < 5) || (swat && stars < 4) || (c.type === 'bureau' && stars < 6) || (c.type === 'apc' && stars < 7) || (c.type === 'dozer' && stars < 9)) { c.chase = false; c.recall = true; aiTraffic(c, dt); return; } // stood down: head back to base
  const see = !Q.branches && d < (tank ? 320 : 240) && los(c.x, c.y, P0.x, P0.y);
  if (!c.chase) { // patrols join in only when they see you or get the call on the radio
    if (see || d < 200 || (stars >= 2 && d < 1000) || stars >= 3) c.chase = true;
    else { aiTraffic(c, dt); return; }
  }
  c.lostT = see ? 0 : (c.lostT || 0) + dt;
  if (stars < 2 && c.lostT > 14) { c.chase = false; c.lostT = 0; aiTraffic(c, dt); return; } // at one star they give up after a while
  c.copCd -= dt; c.shootCd -= dt;
  const tp = P0 === pp() ? player : NET.guest.player, youStopped = !tp.car || Math.abs(tp.car.speed) < 30;
  // an officer gets out to arrest you when you are on foot or have stopped
  if (see && !tank && !swat && !heavy && d < 120 && Math.abs(c.speed) < 60 && youStopped && c.copCd <= 0) {
    c.copCd = 3;
    if (crewOut(c, { cop: true })) { applyControls(c, 0, 0, true, dt); return; }
  }
  if (swat && see && d < 240 && !c.deployed) { // SWAT vans pull up close and deploy a team
    c.deployed = true;
    for (let k = 0; k < 4; k++) crewOut(c, { cop: true, swat: true }, k);
    if (onScreen(c.x, c.y)) msg('SWAT team deployed!', 2);
    applyControls(c, 0, 0, true, dt); return;
  }
  if (see) {
    if (tank) { c.turret = Math.atan2(P0.y - c.y, P0.x - c.x); if (c.shootCd <= 0) { c.shootCd = 3; fireShell(c, c.turret, 'cop'); } }
    else if (c.type === 'apc') { // the carrier's mounted gun: bursts
      c.turret = Math.atan2(P0.y - c.y, P0.x - c.x);
      if (d < 330 && c.shootCd <= 0) { c.burst = (c.burst || 0) + 1; c.shootCd = c.burst % 6 ? 0.13 : 1.6; enemyShot(c.x + Math.cos(c.turret) * 20, c.y + Math.sin(c.turret) * 20, P0.x, P0.y, 7, 0.1); }
    }
    else if (stars >= 4 && !swat && !heavy && d < 260 && c.shootCd <= 0) { c.shootCd = 1.3; enemyShot(c.x, c.y, P0.x, P0.y, 9, 0.12); }
  }
  if (boatOf(tp.car)) { // you're out on the water: to the bank nearest you, and watch (and shoot) from there
    if (!c.bank || d2(c.bankFor[0], c.bankFor[1], P0.x, P0.y) > 160 * 160) { c.bank = nearOf(P0.x, P0.y, false, 16); c.bankFor = [P0.x, P0.y]; }
    if (!c.bank) { applyControls(c, 0, 0, true, dt); return; }
    if (d2(c.x, c.y, c.bank.x, c.bank.y) < 60 * 60) { applyControls(c, 0, 0, true, dt); return; }
    navTo(c, c.bank.x, c.bank.y, 260, dt); return;
  }
  if (see && d < 170) {
    if (stars < 2 && tp.car) { // one star: tail you rather than ram you, and pull up behind when you stop
      const pc = tp.car, ps = Math.hypot(pc.vx, pc.vy), ha = ps > 20 ? Math.atan2(pc.vy, pc.vx) : pc.angle;
      const tx = pc.x - Math.cos(ha) * 70, ty = pc.y - Math.sin(ha) * 70, dd = Math.hypot(tx - c.x, ty - c.y);
      driveToward(c, tx, ty, clamp(ps + dd * 1.2 - 15, 0, 260), dt); return;
    }
    driveToward(c, P0.x, P0.y, !tp.car ? (d < 80 ? 0 : tank ? 90 : 140) : (tank ? 105 : 330), dt); return;
  }
  // otherwise drive toward this car's own guess, sampled from the police belief cloud
  c.guessT = (c.guessT || 0) - dt;
  if (c.guessT <= 0 || c.gx === undefined || d2(c.x, c.y, c.gx, c.gy) < 50 * 50) {
    const g = Math.min(belief.sig, 700);
    let gx = clamp(belief.x + gauss() * g, T, (MW - 2) * T), gy = clamp(belief.y + gauss() * g, T, (MH - 2) * T);
    if (solidAt(gx, gy)) { gx = belief.x; gy = belief.y; }
    c.gx = gx; c.gy = gy; c.guessT = belief.sig < 40 ? 0.5 : 3;
  }
  navTo(c, c.gx, c.gy, stars < 2 ? 230 : belief.sig > 150 ? 200 : 330, dt);
}
// roadblock: two cruisers parked across the road ahead of you, with officers holding position behind them
function placeRoadblock() {
  const P0 = pp(), sp = Math.hypot(P0.vx || 0, P0.vy || 0);
  if (boatOf(player.car)) return false; // (no roadblocks on the water)
  if (sp < 60) return false;
  const dir = Math.atan2(P0.vy, P0.vx), v = viewRect(0);
  const reach = Math.abs(Math.cos(dir)) * (v.x1 - v.x0) / 2 + Math.abs(Math.sin(dir)) * (v.y1 - v.y0) / 2; // just beyond the screen edge ahead
  const army = heat >= 7, cps = army ? checkpointSpots(P0, dir, reach) : []; // (from seven stars the army's checkpoints: on the bridges and at the tunnel mouths ahead first)
  for (let i = 0; i < 14 + cps.length; i++) {
    const a = dir + rand(-0.4, 0.4), dist = reach + rand(120, 420);
    const p = i < cps.length ? cps[i] : nearestLanePt(P0.x + Math.cos(a) * dist, P0.y + Math.sin(a) * dist, null, 140);
    if (!p || p.L.hw || onScreen(p.x, p.y, 60) || cars.some(c => c.block && d2(c.x, c.y, p.x, p.y) < 400 * 400)) continue;
    const h = p.h, nx = -Math.sin(h), ny = Math.cos(h), cx = p.x - nx * p.L.off, cy = p.y - ny * p.L.off, blk = []; // (from kerb to kerb)
    const W = p.L.e.wd, nb = Math.max(2, Math.round(W / (army ? 44 : 34)));
    for (let i = 0; i < nb; i++) {
      const o = (i - (nb - 1) / 2) * W / nb, sd = o < 0 ? -1 : 1, x = cx + nx * o, y = cy + ny * o, ang = h + Math.PI / 2 + sd * 0.25;
      const c = makeCar(army ? 'apc' : 'police', x, y, ang, null);
      if (carHitsWall(c, x, y, ang)) { cars.splice(cars.indexOf(c), 1); continue; }
      c.block = true; c.chase = true; blk.push(c);
    }
    if (!blk.length) continue;
    const bx = cx + Math.cos(dir) * 36, by = cy + Math.sin(dir) * 36;
    for (const sd of [-1, 1]) {
      const x = bx + nx * sd * (W / 2 - 2), y = by + ny * sd * (W / 2 - 2); if (circleSolid(x, y, 5)) continue;
      const p = army ? soldier(x, y, true) : makePed(x, y, { cop: true }); p.post = true; p.car = blk[sd < 0 ? 0 : blk.length - 1];
    }
    for (const c of blk) if (!peds.some(q => q.car === c)) c.driver = 'police'; // nobody could stand by this one: its driver stays in
    return true;
  }
  return false;
}
// ---- the police helicopter (4 stars and up): circles your last known position and lights you up
let heli = null;
const HELI_Z = 0.45;
function updateHeli(dt) {
  const stars = Math.floor(heat), P0 = pp();
  if (!heli) {
    if (stars >= 4 && !player.down && !player.hidden) {
      const a = rand(TAU);
      heli = { army: stars >= 7, x: P0.x + Math.cos(a) * 1300, y: P0.y + Math.sin(a) * 1300, vx: 0, vy: 0, angle: a + Math.PI, rot: 0, hp: stars >= 7 ? 520 : 260, shootCd: 2, burst: 0, leaveT: 0, orbit: rand(TAU), lx: P0.x, ly: P0.y, snd: 0, dead: false, fall: 0 };
      msg('Police helicopter overhead!', 2.5);
    }
    return;
  }
  const h = heli; h.rot += dt * 38;
  if (!h.dead && !h.army && stars >= 7) { h.army = true; h.hp = Math.max(h.hp, 520); msg('The army\'s attack helicopter takes over the sky.', 2.5); }
  if (AC && onScreen(h.x, h.y, 200) && (h.snd -= dt) <= 0) { h.snd = 0.1; noise(0.07, 150, 'lowpass', h.dead ? 0.1 : 0.2); }
  if (h.dead) { // spinning down
    h.fall += dt; h.angle += dt * 7; h.x += h.vx * dt; h.y += h.vy * dt;
    addPart(h.x, h.y, rand(-20, 20), rand(-20, 20), 0.8, 4, '#444', 10, true);
    if (h.fall > 1.6) { explode(h.x, h.y, 90, 'player'); heli = null; }
    return;
  }
  const leaving = stars < 4 || player.down || player.hidden;
  let tx, ty;
  if (leaving) {
    h.leaveT += dt;
    const a = Math.atan2(h.y - P0.y, h.x - P0.x); tx = h.x + Math.cos(a) * 500; ty = h.y + Math.sin(a) * 500;
    if (h.leaveT > 4 && !onScreen(h.x, h.y, 300)) { heli = null; return; }
  } else {
    h.leaveT = 0;
    const lock = belief.seen;
    const cx = lock ? P0.x : belief.x, cy = lock ? P0.y : belief.y, r = lock ? 70 : Math.min(belief.sig, 400) * 0.6 + 70;
    h.orbit += dt * 0.55; tx = cx + Math.cos(h.orbit) * r; ty = cy + Math.sin(h.orbit) * r;
    // the searchlight swings toward you if you are close to it, otherwise it sweeps the search area
    const near = d2(h.x, h.y, P0.x, P0.y) < 260 * 260, gx = near ? P0.x : cx + Math.cos(time * 0.9) * r * 0.6, gy = near ? P0.y : cy + Math.sin(time * 1.3) * r * 0.6;
    const ldx = gx - h.lx, ldy = gy - h.ly, ld = Math.hypot(ldx, ldy) || 1, step = Math.min(ld, 210 * dt);
    h.lx += ldx / ld * step; h.ly += ldy / ld * step;
  }
  const dx = tx - h.x, dy = ty - h.y, dd = Math.hypot(dx, dy) || 1, sp = Math.min(270, dd * 1.4);
  h.vx += (dx / dd * sp - h.vx) * Math.min(1, dt * 1.2); h.vy += (dy / dd * sp - h.vy) * Math.min(1, dt * 1.2);
  h.x += h.vx * dt; h.y += h.vy * dt;
  const face = Math.hypot(h.vx, h.vy) > 40 ? Math.atan2(h.vy, h.vx) : Math.atan2(P0.y - h.y, P0.x - h.x);
  h.angle += wrapA(face - h.angle) * Math.min(1, dt * 2);
  // at five stars a gunner fires bursts at you from the open door
  h.shootCd -= dt;
  if (!leaving && stars >= 5 && h.shootCd <= 0 && d2(h.lx, h.ly, P0.x, P0.y) < 60 * 60) {
    h.burst++; h.shootCd = h.burst % 5 ? 0.11 : 1.8;
    const a = Math.atan2(P0.y - h.y, P0.x - h.x);
    enemyShot(P0.x - Math.cos(a) * 40, P0.y - Math.sin(a) * 40, P0.x, P0.y, 5, 0.12);
  }
  // the army's helicopter fires rockets: a red ring marks where each will land
  HQ.rocketCd -= dt;
  if (h.army && !leaving && HQ.rocketCd <= 0 && (belief.seen || d2(h.lx, h.ly, P0.x, P0.y) < 140 * 140)) {
    HQ.rocketCd = stars >= 8 ? 2.6 : 4;
    HQ.strikes.push({ x: P0.x + (P0.vx || 0) * 1.1 + rand(-20, 20), y: P0.y + (P0.vy || 0) * 1.1 + rand(-20, 20), t: 1.3, r: 52, k: 'rocket' });
    if (onScreen(h.x, h.y, 300)) sfx.rocket();
  }
}
function drawHeli() {
  const h = heli; if (!h) return;
  const z = h.dead ? HELI_Z * Math.max(0, 1 - h.fall / 1.6) : HELI_Z, k = 1 + z;
  const x = cam.x + (h.x - cam.x) * k, y = cam.y + (h.y - cam.y) * k;
  if (!onScreen(x, y, 120)) return;
  if (!h.dead && !h.leaveT && NIGHT > 0.1) { // the searchlight beam
    const a = Math.atan2(h.ly - y, h.lx - x), r = 90;
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(200,225,255,${0.13 * NIGHT})`;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(h.lx + Math.cos(a + Math.PI / 2) * r, h.ly + Math.sin(a + Math.PI / 2) * r);
    ctx.lineTo(h.lx + Math.cos(a - Math.PI / 2) * r, h.ly + Math.sin(a - Math.PI / 2) * r); ctx.closePath(); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  const nb = 1 + NIGHT * 1.6; // lit by the city below, so it stays readable at night
  ctx.save(); ctx.translate(x, y); ctx.rotate(h.angle); ctx.scale(k * 0.85, k * 0.85);
  const dk = h.army ? '#2b3018' : '#1d2b4a'; // (the army's: olive, with stub wings and rocket pods)
  ctx.fillStyle = tint(dk, nb); ctx.fillRect(-36, -2, 26, 4); ctx.fillRect(-39, -7, 5, 14);
  if (h.army) { ctx.fillStyle = tint('#3a4220', nb); ctx.fillRect(-4, -16, 6, 32); ctx.fillStyle = tint('#1e2212', nb); ctx.fillRect(-6, -17, 10, 4); ctx.fillRect(-6, 13, 10, 4); }
  ctx.fillStyle = tint(h.army ? '#4b5320' : '#e9edf2', nb); ctx.beginPath(); ctx.ellipse(0, 0, 16, 9, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = tint(dk, nb); ctx.fillRect(-12, -9, 6, 18);
  ctx.fillStyle = tint('#7fb3d5', 1.1 * nb); ctx.beginPath(); ctx.ellipse(8, 0, 6, 6.5, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(25,25,25,.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-10, -11); ctx.lineTo(10, -11); ctx.moveTo(-10, 11); ctx.lineTo(10, 11); ctx.stroke();
  ctx.fillStyle = 'rgba(20,20,20,.12)'; ctx.beginPath(); ctx.arc(0, 0, 29, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(25,25,25,.65)'; ctx.lineWidth = 3;
  for (let i = 0; i < 2; i++) { const a = h.rot + i * Math.PI / 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 29, Math.sin(a) * 29); ctx.lineTo(-Math.cos(a) * 29, -Math.sin(a) * 29); ctx.stroke(); }
  ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(-37, 0, 5, 0, TAU); ctx.stroke();
  const on = Math.sin(time * 9) > 0;
  ctx.fillStyle = on ? '#ff3030' : '#3060ff'; ctx.beginPath(); ctx.arc(-4, on ? -7 : 7, 2, 0, TAU); ctx.fill();
  if (NIGHT > 0.1) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = NIGHT * 0.5; ctx.beginPath(); ctx.arc(-4, on ? -7 : 7, 9, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
  ctx.restore();
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
  if (p.held) { p.moving = true; p.anim = (p.anim || 0) + dt * 20; return; } // (being dragged out of a car)
  if (p.vip) { p.moving = false; p.angle += Math.sin(time * 2) * dt; return; }
  if (p.monk && !(p.flee > 0)) { monkStep(p, dt); return; }
  p.moving = true;
  const P0 = pp(), pd = Math.hypot(P0.x - p.x, P0.y - p.y);
  const tg = copTarget(p), tp = tg === P0 ? player : NET.guest.player, td = tg === P0 ? pd : Math.hypot(tg.x - p.x, tg.y - p.y);
  if (p.cop && heat >= 1 && !tp.down && !tp.hidden && !tp.cellar && td < 520 && (belief.sig < 80 || (td < 250 && los(p.x, p.y, tg.x, tg.y)))) {
    const P0 = tg, pd = td, player = tp; // (this officer is after whichever of you is nearer)
    const a = Math.atan2(P0.y - p.y, P0.x - p.x), sees = los(p.x, p.y, P0.x, P0.y);
    p.angle = a; p.path = null; p.idle = 0;
    const hold = (p.post && pd > 300) || (p.swat && pd < 170 && sees);
    const sp = hold || pd < 12 ? 0 : p.swat ? 95 : 88;
    p.moving = sp > 0;
    moveFree(p, Math.cos(a) * sp, Math.sin(a) * sp, dt, 4);
    if (sp) p.anim += dt * 14;
    p.shootCd -= dt;
    if (heat >= 3 && pd > 40 && pd < (p.swat ? 300 : 230) && p.shootCd <= 0 && sees) {
      if (p.swat) { p.burst = (p.burst || 0) + 1; p.shootCd = p.burst % 3 ? 0.15 : rand(1.0, 1.5); enemyShot(p.x, p.y, P0.x, P0.y, 6, 0.09); }
      else { p.shootCd = rand(0.9, 1.5); enemyShot(p.x, p.y, P0.x, P0.y, 7, 0.14); }
    }
    if (!player.car && pd < 14) player.bust += dt * 2;
    else if (player.car && pd < 26 && Math.abs(player.car.speed) < 25) player.bust += dt;
    p.tx = -1;
    return;
  }
  if (p.car) { // an officer whose car is waiting: hold the roadblock while you're wanted, otherwise walk back and drive off
    const c = p.car;
    if (c.dead || c.fire > 0 || c.driver || !cars.includes(c)) p.car = null;
    else if (p.post && heat >= 1) { p.moving = false; return; }
    else {
      p.backT = (p.backT || 0) + dt;
      if (Math.hypot(c.x - p.x, c.y - p.y) < 26) {
        p.gone = true; p.car = null;
        if (!peds.some(q => q.car === c && !q.gone && !q.dead)) { c.driver = 'police'; c.block = false; c.deployed = false; c.ln = null; }
        return;
      }
      if (p.backT > 25) p.car = null; // can't get there: give up on it
      else { const a = Math.atan2(c.y - p.y, c.x - p.x); p.angle = a; p.moving = true; p.anim += dt * 12; moveFree(p, Math.cos(a) * 85, Math.sin(a) * 85, dt, 4); return; }
    }
  }
  const fleeing = p.flee > 0;
  if (fleeing) { p.flee -= dt; p.path = null; p.idle = 0; p.wait = null; p.tp = null; }
  else if (p.tp && platPed(p, dt)) return;
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
      if (p.eg && eggArrive(p)) return true;
      if (k === 1 && !p.target && !p.cop && Math.random() < 0.6) {
        const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T);
        for (let d = 0; d < 4; d++) if (tile(tx + DX[d], ty + DY[d]) === BUILD) { p.angle = d * Math.PI / 2; p.entering = 0.7; return true; }
      }
      if (k === 3 && p.tp) { p.tp.k = 'walk'; p.tp.T = 0; return true; } // (at the platform: to a spot on it)
      if (k === 2) { const pl = TRAM_STOPS.length && !p.cop && !p.target ? platNear(p.x, p.y) : null; if (pl) { p.tp = Object.assign(platSpot(p, pl), { k: 'walk', pl, T: 0 }); return true; }
        p.wait = 'bus'; p.idle = 6 + Math.random() * 8; p.angle = -Math.PI / 2; return true; }
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
  // a step is blocked only if it runs into something: whoever already overlaps a wall or a trunk can always step away
  const nx = o.x + vx * dt, ny = o.y + vy * dt, inWall = circleSolid(o.x, o.y, r);
  if ((inWall || !circleSolid(nx, o.y, r)) && !trunkBlocks(o.x, o.y, nx, o.y, r)) o.x = nx;
  if ((inWall || !circleSolid(o.x, ny, r)) && !trunkBlocks(o.x, o.y, o.x, ny, r)) o.y = ny;
}
const trunkBlocks = (x0, y0, x, y, r) => !!nearTrees(x, y, r + 1, t => { const d = Math.hypot(t.x - x, t.y - y); return d < r + t.tr && d <= Math.hypot(t.x - x0, t.y - y0) ? t : null; });
function killPed(p, src, burnt) {
  if (p.dead) return;
  p.dead = true; p.deadT = 0; p.burnt = !!burnt; p.hp = 0;
  addDecal({ k: 'blood', x: p.x + rand(-3, 3), y: p.y + rand(-3, 3), r: rand(7, 12) });
  for (let i = 0; i < 8; i++) addPart(p.x, p.y, rand(-90, 90), rand(-90, 90), 0.35, 2, '#8e0e0e');
  if (onScreen(p.x, p.y)) sfx.splat();
  scare(p.x, p.y, 200);
  if (src === 'player') {
    earn(p.cop ? 50 : 10);
    if (p.cop) addHeat(1.2); else witnessed(p);
  }
  if (p.target && mission && mission.type === 'hit') completeMission();
}
// a killing in the street: a cop who sees it puts a star on you there and then; a passer-by who sees it phones the police,
// and a few seconds later (unless they're dead by then) that's a star too
let caller = null; // { p, t }: the passer-by on the phone, and when the call gets through
function witnessed(v) {
  if (copSees(v.x, v.y)) { addHeat(heat < 1 ? Math.max(0.55, 1.05 - heat) : 0.55); return; }
  addHeat(copNear(v.x, v.y, 600) ? 0.55 : 0.35);
  if (heat >= 1 || caller || lab) return;
  let w = null, wd = 320 * 320;
  let monk = false; // (a monk who sees it keeps the vow of silence)
  for (const p of peds) if (!p.dead && !p.cop && !p.held && p !== v) { const dd = d2(p.x, p.y, v.x, v.y); if (dd < wd && los(p.x, p.y, v.x, v.y)) { if (p.monk) monk = true; else { wd = dd; w = p; } } }
  if (!w && monk) { msg('A monk saw it, and keeps the vow of silence.', 3); ach('monk'); }
  if (w) { caller = { p: w, t: time + rand(4, 7) }; msg('Someone saw that and is calling the police.', 3); }
}
function scare(x, y, r) {
  for (const p of peds) if (!p.dead && !p.cop && d2(p.x, p.y, x, y) < r * r) { p.flee = rand(4, 7); p.fx = x; p.fy = y; }
}
// in online co-op the police go after whichever player is nearer
function copTarget(o) {
  const a = pp(); if (!NET.guest || NET.guest.player.hidden || NET.guest.player.down) return a;
  const g = NET.guest.player, b = g.car || g;
  return player.hidden || player.down || d2(b.x, b.y, o.x, o.y) < d2(a.x, a.y, o.x, o.y) ? b : a;
}
function copNear(x, y, r) {
  for (const p of peds) if (p.cop && !p.dead && d2(p.x, p.y, x, y) < r * r) return true;
  for (const c of cars) if ((c.type === 'police' || c.type === 'policeboat' || c.type === 'tank' || c.type === 'swat') && c.driver === 'police' && d2(c.x, c.y, x, y) < r * r) return true;
  return false;
}
// does any cop currently have eyes on point (x, y)?
function copSees(x, y) {
  if (player.car && player.car.lay === 1 && d2(player.car.x, player.car.y, x, y) < 40 * 40) return false; // (nobody sees you in a tunnel)
  for (const p of peds) if (p.cop && !p.dead) { const dd = d2(p.x, p.y, x, y); if (dd < 70 * 70 || (dd < 260 * 260 && los(p.x, p.y, x, y))) return true; }
  if (HQ.sweep > 0 || (HQ.drone && HQ.drone.lock && !HQ.drone.fall) || (HQ.carrier && HQ.carrier.see) || HQ.heroes.some(h => h.see)) return true; // (the sweep, the Bureau's drone, the Helicarrier's light, the Collapser)
  for (const c of cars) if ((c.type === 'police' || c.type === 'policeboat' || c.type === 'tank' || c.type === 'swat' || c.type === 'bureau' || c.type === 'apc' || c.type === 'dozer') && c.driver === 'police') { const dd = d2(c.x, c.y, x, y); if (dd < 70 * 70 || (dd < 300 * 300 && los(c.x, c.y, x, y))) return true; }
  if (heli && !heli.dead && d2(heli.lx, heli.ly, x, y) < 120 * 120) return true; // the helicopter sees everything under its searchlight
  return false;
}

// ============================================================ particles & decals
function addPart(x, y, vx, vy, life, size, color, grow = 0, top = false) {
  if (parts.length > 700) parts.shift();
  parts.push({ x, y, vx, vy, life, max: life, size, color, grow, top });
}
function addDecal(d) { decals.push(d); if (decals.length > 500) decals.shift(); if (NET.guest && d.k !== 'skid') NET.ev.push(['dec', d]); }
function qburst(x, y, color, n = 24) {
  for (let i = 0; i < n; i++) { const a = i / n * TAU; addPart(x, y, Math.cos(a) * 140, Math.sin(a) * 140, 0.5, 2.5, color, 0, true); }
}
function explode(x, y, r, src) {
  if (NET.guest) NET.ev.push(['boom', x | 0, y | 0, r]);
  if (onScreen(x, y, 200)) { sfx.boom(); shake = 1; }
  if (!seeThrough(x, y)) addDecal({ k: 'scorch', x, y, r: r * 0.55 });
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
  for (const t of trams) for (const S of t.sec) { const d = Math.hypot(S.x - x, S.y - y); if (!S.lv && d < r + S.l / 2) { damageTram(t, (1 - d / (r + S.l / 2)) * 420, src); break; } }
  for (const p of peds) if (!p.dead && Math.hypot(p.x - x, p.y - y) < r) killPed(p, src, true);
  if (src === 'player') heroBlast(x, y, r);
  scare(x, y, r * 4);
  if (!player.car && !player.hidden) {
    const d = Math.hypot(player.x - x, player.y - y);
    if (d < r) hurtPlayer((1 - d / r) * 130 + 10);
  }
  if (NET.guest && !NET.guest.player.car && !NET.guest.player.hidden) {
    const d = Math.hypot(NET.guest.player.x - x, NET.guest.player.y - y);
    if (d < r) asGuest(() => hurtPlayer((1 - d / r) * 130 + 10));
  }
}

// ============================================================ quantum mechanics
function superpose() {
  const c = player.car;
  if (Q.branches) { collapse('you looked'); return; }
  const qb = qBlocked(); if (qb) { msg(qb, 2.5); return; }
  if (!c) { msg('Superposition needs a car.', 1.5); return; }
  if (Q.psi <= 0) { msg('No ψ charges. Find a ψ pickup.', 2); return; }
  if (player.tow) dropTow('The tweezer can only follow one branch: it let go.');
  Q.psi--; Q.supT = 10; Q.grace = 0.8; c.amp = 1; c.phase = 0; Q.branches = []; ach('superpose');
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
// ---- entanglement: link with a car (T), then measure the pair (T again) to swap places with it
function entangle() {
  if (player.down || player.hidden) return;
  if (!player.car && Math.floor(heat) === 7 && Q.ent > 0 && !lab && tunnelJump()) return;
  const qb = qBlocked(); if (qb) { msg(qb, 2.5); return; }
  const L = Q.link;
  if (L && !L.dead && cars.includes(L)) { if (boatOf(L) !== boatOf(player.car)) { msg(boatOf(L) ? 'Your twin is a boat: only from a boat can you swap with it.' : 'Your twin is on land: only from a car can you swap with it.', 2.5); return; } swapWith(L); return; }
  if (Q.ent <= 0) { msg('No ε charges. Find an ε pickup.', 2); return; }
  const o = pp(); let c = null, bd = 130 * 130;
  const wet = boatOf(player.car); // (a boat swaps places only with a boat, a car or you only with a car)
  for (const q of cars) { if (q === player.car || q.dead || q.ghost || boatOf(q) !== wet) continue; const d = d2(q.x, q.y, o.x, o.y); if (d < bd) { bd = d; c = q; } }
  if (!c) { msg(wet ? 'Get close to another boat to entangle with it.' : 'Get close to a car to entangle with it.', 1.5); return; }
  Q.ent--; Q.link = c; Q.linkT = 60; c.linked = true;
  if (c.labGo) { c.driver = 'ai'; c.ln = null; c.labGo = false; }
  qburst(c.x, c.y, '#3cf0ff'); qburst(o.x, o.y, '#3cf0ff'); sfx.quantum();
  msg('Entangled with that car. Press T again to measure the pair and swap places with it.', 3.5);
  note('swap'); labFlags.linked = true;
}
function unlink() { if (Q.link) Q.link.linked = false; Q.link = null; }
function swapWith(c) {
  if (player.tow) dropTow(player.tow.c === c ? '' : 'The jump left the tweezer behind.');
  const o = pp(), me = player.car;
  qburst(o.x, o.y, '#3cf0ff'); qburst(c.x, c.y, '#3cf0ff');
  const A = { x: o.x, y: o.y, angle: me ? me.angle : player.angle, vx: o.vx || 0, vy: o.vy || 0, speed: me ? me.speed : 0 };
  const B = { x: c.x, y: c.y, angle: c.angle, vx: c.vx, vy: c.vy, speed: c.speed };
  Object.assign(c, A); c.ln = null; // your twin takes your place...
  if (!me) { c.speed = 0; c.vx = 0; c.vy = 0; }
  if (me) { Object.assign(me, B); player.x = me.x; player.y = me.y; } // ...and you take its place
  else { player.x = B.x; player.y = B.y; player.angle = B.angle; }
  unlink(); sfx.swap(); shake = 0.3;
  // the police are left looking at the wrong place
  if (heat >= 1 && !copSees(player.x, player.y)) Object.assign(belief, { x: A.x, y: A.y, vx: A.vx, vy: A.vy, sig: 40, seen: false, seeT: 0.6 });
  labFlags.swaps = (labFlags.swaps || 0) + 1;
  msg('Measured! You and your entangled twin swapped places.', 3); ach('swap');
  updateCamera(0, true);
}
function updateLink(dt) {
  if (Q.decoyT > 0) { Q.decoyT -= dt; if (!Q.decoy || Q.decoy.dead || !cars.includes(Q.decoy)) Q.decoyT = 0; if (Q.decoyT <= 0 && Q.decoy) { Q.decoy.decoy = false; Q.decoy = null; } }
  const c = Q.link; if (!c) return;
  if (c.dead || !cars.includes(c)) { unlink(); msg('Your entangled twin is gone: the link decohered.', 2.5); return; }
  Q.linkT -= dt;
  if (Q.linkT <= 0) { unlink(); msg('The entanglement decohered.', 2); return; }
  // the police measure your twin while they have lost you: the pair collapses and they take the twin for you
  Q.obsLT = (Q.obsLT || 0) - dt;
  if (heat >= 1 && !belief.seen && Q.obsLT <= 0) {
    Q.obsLT = 0.3;
    if (copSees(c.x, c.y)) {
      unlink(); Q.decoy = c; Q.decoyT = 20; c.decoy = true;
      Object.assign(belief, { x: c.x, y: c.y, vx: c.vx, vy: c.vy, sig: 0 });
      qburst(c.x, c.y, '#3cf0ff'); sfx.collapse();
      msg('Long-distance collapse: the police measured your twin and think it\'s you!', 3.5);
      note('swap'); labFlags.decoyed = true;
    }
  }
}
function updateBelief(dt) {
  if (heat < 1 || player.hidden) { belief.sig = 0; belief.seen = false; return; }
  belief.seeT -= dt;
  if (belief.seeT <= 0) { belief.seeT = 0.2; belief.seen = !Q.branches && !player.cellar && copSees(player.x, player.y); }
  const o = pp();
  if (!Number.isFinite(belief.x + belief.y + belief.vx + belief.vy)) Object.assign(belief, { x: o.x || 0, y: o.y || 0, vx: 0, vy: 0 }); // (never let a bad value spread)
  if (belief.seen) { belief.x = o.x; belief.y = o.y; belief.vx = o.vx || 0; belief.vy = o.vy || 0; belief.sig = 0; if (Q.decoy) { Q.decoy.decoy = false; Q.decoy = null; Q.decoyT = 0; } }
  else if (Q.decoyT > 0 && Q.decoy) { const d = Q.decoy; belief.x = d.x; belief.y = d.y; belief.vx = d.vx; belief.vy = d.vy; belief.sig = 20; }
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
    if (boatOf(c)) {
      if (Math.abs(c.speed) > 45) { msg('Slow down first.', 1.5); return; }
      const s = boatShore(c);
      if (!s) { // out on the water: climb across into another boat alongside, if there is one
        const o = cars.find(q => q !== c && boatOf(q) && !q.dead && !q.fire && !q.driver && d2(q.x, q.y, c.x, c.y) < (CT[q.type].l / 2 + CT[c.type].l / 2 + 14) ** 2);
        if (o) { c.driver = null; player.car = null; getIn(o, false, true); return; }
        msg('Steer up to a bank to get out.', 1.5); return;
      }
      if (player.tow) dropTow('');
      player.x = s.x; player.y = s.y; player.angle = Math.atan2(s.y - c.y, s.x - c.x); player.car = null; c.driver = null;
      boatLanded(); return;
    }
    if (Math.abs(c.speed) > 90 || (c.tram && Math.abs(c.speed) > 25)) { msg(c.tram ? `Stop the ${c.tram.train ? 'train' : 'tram'} first.` : 'Slow down to bail out!', 1.5); return; }
    if (c.lay === 1) { msg('Not in the tunnel: drive out first.', 1.5); return; }
    if (c.lay === 3) { msg('Not up on the overpass: drive off it first.', 1.5); return; }
    if (player.tow) dropTow();
    if (Q.branches) collapse('you stepped out');
    const s = sideSpot(c);
    if (!s) return;
    player.x = s.x; player.y = s.y; player.angle = c.angle; player.car = null; c.driver = null;
    return;
  }
  if (player.jack) return;
  let bestC = null, bd = 42 * 42;
  for (const c of cars) {
    if (c.dead || c.fire > 0 || c.lay === 1 || c.lay === 3 || c.heldBy) continue;
    const bt = boatOf(c); if (bt && c.driver) continue; // (a boat is boarded from the bank, empty)
    const d = d2(c.x, c.y, player.x, player.y) - (bt ? 900 : 0); // (it lies off the bank: a longer reach)
    if (d < bd) { bd = d; bestC = c; }
  }
  const tc = trams.length ? tramCabNear(player.x, player.y) : null; // (or a tram's cab, up at its front)
  if (tc && (!bestC || tc.d < bd)) { boardTram(tc.t); return; }
  if (!bestC) return;
  const c = bestC, t = CT[c.type];
  // getting in takes a moment: walk round to the driver's door (or the other one, if that side is blocked), open it, drag
  // out whoever is at the wheel, climb in. Bikes, tanks and tractors are open: straight on
  const side = t.bike || t.boat || c.type === 'tank' || c.type === 'tractor' || c.twin ? 0 : [-1, 1].find(sd => { const ca = Math.cos(c.angle), sa = Math.sin(c.angle), ly = sd * (t.w / 2 + 8);
    return !circleSolid(c.x + ca * t.l * 0.02 - sa * ly, c.y + sa * t.l * 0.02 + ca * ly, 5); }) || 0;
  if (!side) { getIn(c); return; }
  player.jack = { c, side, ph: 'walk', t: 0 }; c.jackHold = true; // (a driver at the wheel brakes and waits)
}
// the player at a car door: walk there, open it, pull the driver out, get in (each step a fraction of a second)
function updateJack(dt) {
  const j = player.jack, c = j.c, t = CT[c.type], ca = Math.cos(c.angle), sa = Math.sin(c.angle);
  if (c.dead || c.fire > 0 || !cars.includes(c) || c.heldBy || (c.driver === 'player' && player.car !== c)) { endJack(); return; }
  const at = (lx, ly) => [c.x + ca * lx - sa * ly, c.y + sa * lx + ca * ly]; // (from the car's frame to the world)
  const [dx, dy] = at(t.l * 0.02, j.side * (t.w / 2 + 8)), [sx, sy] = at(t.l * 0.02, j.side * t.w * 0.18); // the door; the seat
  j.t += dt; player.moving = false;
  if (j.ph === 'walk') {
    const d = Math.hypot(dx - player.x, dy - player.y), step = 170 * dt;
    if (d > 160) { endJack(); return; } // (it got away)
    const slow = Math.abs(c.speed) < 30; // (the door opens once the car has all but stopped: until then, keep up with it)
    if (j.t > 1.5 && !slow) { endJack(); return; }
    if (d > step && (j.t < 0.6 || !slow)) { player.x += (dx - player.x) / Math.max(d, step) * Math.min(d, step); player.y += (dy - player.y) / Math.max(d, step) * Math.min(d, step); player.angle = Math.atan2(dy - player.y, dx - player.x); player.moving = true; player.anim += dt * 15; return; }
    if (!slow) { player.x = dx; player.y = dy; return; }
    j.ph = 'open'; j.t = 0; c.doorSide = j.side; c.doorHold = true;
  }
  if (j.ph === 'in') { // climbing in: onto the seat, under the roof
    const f = Math.min(1, j.t / 0.22); player.x = dx + (sx - dx) * f; player.y = dy + (sy - dy) * f; player.angle = c.angle;
    if (f >= 1) { endJack(); getIn(c, j.jacked); }
    return;
  }
  player.x = dx; player.y = dy; player.angle = Math.atan2(sy - dy, sx - dx); // (at the door, facing in)
  if (j.ph === 'open') {
    c.door = Math.min(1, j.t / 0.22);
    if (j.t >= 0.22) { j.t = 0; if (c.driver && c.driver !== 'player') { j.ph = 'pull'; j.ped = pullOut(c, sx, sy); j.jacked = true; } else j.ph = 'in'; }
  } else if (j.ph === 'pull') { // the driver dragged out over the sill and dumped on the road behind the door
    const f = Math.min(1, j.t / 0.45), [ox, oy] = at(-t.l * 0.22, j.side * (t.w / 2 + 16)), p = j.ped;
    if (p && !p.dead) { p.x = sx + (ox - sx) * f; p.y = sy + (oy - sy) * f; p.angle = Math.atan2(dy - p.y, dx - p.x) + Math.sin(j.t * 30) * 0.3; }
    if (f >= 1) { if (p) { p.held = false; if (!p.cop) { p.flee = 6; p.fx = player.x; p.fy = player.y; } } j.ph = 'in'; j.t = 0; }
  }
}
function endJack() {
  const j = player.jack; if (!j) return;
  j.c.jackHold = false; j.c.doorHold = false; if (j.ped) j.ped.held = false;
  player.jack = null;
}
// whoever is at the wheel is pulled out at (x, y), inside the car: a ped, held while the player drags them clear
function pullOut(c, x, y) {
  const wasCop = c.driver === 'police';
  c.driver = null; c.chase = false; c.job = null;
  const p = makePed(x, y, { cop: wasCop }); p.held = true;
  if (copNear(c.x, c.y, 380) || wasCop) addHeat(wasCop ? 1.2 : 0.6);
  msg(wasCop ? 'You jacked a cop car. Bold.' : `Carjacked a ${CT[c.type].label}!`, 2); if (wasCop) ach('copcar');
  return p;
}
// in the driver's seat at last (jacked: its driver was dragged out already)
function getIn(c, jacked, across) {
  if (c.mil && !lab) { // (one of the army's, from the University of Defence)
    c.mil = false; const armour = c.type === 'tank' || c.type === 'apc', want = armour ? 4.05 : 3.05; ach('army');
    if (heat < want) addHeat(want - heat, true);
    msg(armour ? `You took the army's ${c.type === 'tank' ? 'T-72' : 'Pandur'} from the University of Defence. They want it back.` : `You drove off in an army ${CT[c.type].label.replace('Army ', '')}. The military police are on their way.`, 3.5); sfx.bad();
  }
  if (CT[c.type].boat) { // (from the bank: remember where you put out; climbing across from another boat it stays)
    if (!across) player.putOut = { x: player.x, y: player.y };
    if (!c.toldBoat) msg(c.type === 'sailboat' ? `A dinghy: the wind drives it (the red pennant shows where to), never straight into it. ${touchOn() ? '⇄' : 'Enter'} at a bank gets you out.` : `${CT[c.type].label}: ${touchOn() ? '▲ ▼' : '↑ ↓'} throttle and reverse. ${touchOn() ? '⇄' : 'Enter'} at a bank gets you out.`, 4);
    c.toldBoat = true;
  }
  if (c.driver && c.driver !== 'player') {
    const wasCop = c.driver === 'police';
    const p = ejectDriver(c, false);
    if (p && !wasCop) { p.flee = 6; p.fx = player.x; p.fy = player.y; }
    if (copNear(c.x, c.y, 380) || wasCop) addHeat(wasCop ? 1.2 : 0.6);
    msg(wasCop ? 'You jacked a cop car. Bold.' : `Carjacked a ${CT[c.type].label}!`, 2); if (wasCop) ach('copcar');
  } else if ((c.type === 'police' || c.type === 'policeboat') && !jacked) addHeat(1);
  c.driver = 'player'; player.car = c; c.parked = false; c.job = null; c.chase = false; c.block = false; c.recall = false; c.ln = null; // (its last driver's lane is no longer its)
  if (c.type === 'ambulance' && player.hp < 100) { player.hp = 100; msg('Ambulance first-aid kit: health restored.', 2); }
  if (c.type === 'tank') { msg('TANK! Space fires the cannon.', 3); ach('tank'); }
  if (c.type === 'sailboat') ach('sail'); else if (c.type === 'formula') ach('formula');
  if (c.type === 'firetruck') msg('Fire truck: Space sprays water.', 3);
  if (mission && mission.type === 'steal' && mission.car === c && mission.stage === 0) advanceSteal();
  eggGetIn(c);
}
// ---- fishing: walk up to a jetty and press Enter. Hold Space to cast (← → aim), strike when the float goes under,
// then hold Space to reel in, keeping the line's tension out of the red: when the fish runs, ease off or pull the other
// way. What you catch is sold on the spot; dawn and dusk are the best times, and some fish only bite at night.
const fishSpotAt = (x, y) => FISH_SPOTS.find(s => d2(s.x, s.y, x, y) < 26 * 26);
const fishName = sp => BRNO && sp.cz ? `${sp.name} (${sp.cz})` : sp.name;
const castDist = pow => (0.9 + pow * 4.6) * T;
const dawnDusk = () => { const h = dayT * 24; return (h > 5 && h < 8) || (h > 18 && h < 21); };
function startFishing(s) {
  if (player.isGuest) { msg('Fishing is for the host (or a single player) for now.', 2.5); return; }
  if (heat >= 1) { msg('Not with the police after you.', 2); return; }
  player.fish = { s, ph: 'ready', t: 0, aim: 0, pow: 0, held: !!keys.fire };
  player.x = s.fx; player.y = s.fy; player.angle = s.a;
}
function stopFishing(why) {
  const f = player.fish; if (!f) return;
  player.fish = null; player.x = f.s.x; player.y = f.s.y; player.angle = f.s.a + Math.PI;
  if (why) msg(why, 2.5);
}
// what takes the bait: the commoner kinds mostly, the rarer ones more often far out, at dawn and dusk, or at night
function pickFish(w, deep) {
  const night = darkness() > 0.5, dd = dawnDusk(), pool = FISH.filter(q => q.w.includes(w));
  const wt = q => q.n * (q.n < 10 ? 0.6 + deep : 1) * (q.tag === 'night' ? (night ? 2.5 : 0.4) : 1) * (dd && q.n < 10 && q.tag !== 'junk' ? 1.5 : 1);
  let r = Math.random() * pool.reduce((a, q) => a + wt(q), 0);
  const sp = pool.find(q => (r -= wt(q)) <= 0) || pool[0], u = Math.pow(Math.random(), 2.4);
  return { sp, kg: sp.k0 + (sp.k1 - sp.k0) * u, str: sp.str * (0.55 + 0.45 * u) };
}
function updateFishing(dt) {
  const f = player.fish, s = f.s, fire = !!keys.fire, down = fire && !f.held, steer = keys.right - keys.left;
  f.held = fire; f.t += dt;
  player.x = s.fx; player.y = s.fy; player.moving = false; player.vx = player.vy = 0;
  if (hit('Enter', 'KeyF', 'KeyE') || keys.up || keys.down) { stopFishing(f.ph === 'fight' ? 'You cut the line and walk off.' : null); return; }
  if (heat >= 1) { stopFishing('Police! You pack up your rod.'); return; }
  if (f.ph === 'ready' || f.ph === 'charge') { f.aim = clamp(f.aim + steer * 1.1 * dt, -0.7, 0.7); player.angle = s.a + f.aim; }
  if (f.dip) f.dip = Math.max(0, f.dip - dt);
  switch (f.ph) {
    case 'ready': if (down) { f.ph = 'charge'; f.t = 0; } break;
    case 'charge': // the power swings up and down while you hold; let go to cast
      f.pow = 0.5 - 0.5 * Math.cos(f.t * 2.4);
      if (!fire) { const a = s.a + f.aim, d = castDist(f.pow); f.bx = s.fx + Math.cos(a) * d; f.by = s.fy + Math.sin(a) * d; f.ph = 'fly'; f.t = 0; f.fly = 0.35 + f.pow * 0.45; sfx.cast(); }
      break;
    case 'fly':
      if (f.t >= f.fly) {
        const tx = Math.floor(f.bx / T), ty = Math.floor(f.by / T);
        if (tile(tx, ty) !== WATER || bridge[ty * MW + tx]) { f.ph = 'snag'; f.t = 0; msg('Snagged on the bank! Reel in and try again.', 1.6); }
        else { f.ph = 'wait'; f.t = 0; f.bite = rand(2.5, 9) * (dawnDusk() ? 0.6 : 1); f.nib = rand(0.8, 2.2); sfx.plop(); }
      }
      break;
    case 'snag': case 'miss': if (f.t > 1.4) { f.ph = 'ready'; f.t = 0; } break;
    case 'wait':
      if (down) { f.ph = 'ready'; f.t = 0; msg('You reel in. Nothing on the hook.', 1.4); break; }
      f.nib -= dt; if (f.nib <= 0) { f.dip = 0.35; f.nib = rand(0.9, 2.6); } // a nibble: the float bobs, but it isn't a bite
      if (f.t >= f.bite) { f.ph = 'bite'; f.t = 0; f.win = rand(0.55, 0.8); sfx.bite(); }
      break;
    case 'bite': // the float goes under: strike now
      if (down) hookFish(f);
      else if (f.t > f.win) { f.ph = 'miss'; f.t = 0; msg('Too slow. It took the bait and left.', 1.8); }
      break;
    case 'fight': fightFish(f, dt, fire, steer); break;
    case 'caught': if (f.t > 4 || (down && f.t > 0.6)) { f.ph = 'ready'; f.t = 0; f.card = null; } break;
  }
}
function hookFish(f) {
  const deep = clamp(Math.hypot(f.bx - f.s.fx, f.by - f.s.fy) / (4 * T), 0, 1);
  f.fish = pickFish(f.s.w, deep); f.sup = null;
  if (Math.random() < 0.1) { // a superposed bite: two catches at once, until you land it and look
    let g = pickFish(f.s.w, deep);
    for (let i = 0; i < 8 && g.sp === f.fish.sp; i++) g = pickFish(f.s.w, deep);
    if (g.sp !== f.fish.sp) {
      const p = rand(0.3, 0.7);
      f.sup = [[f.fish, p], [g, 1 - p]]; f.fish = { str: f.fish.str * p + g.str * (1 - p) };
      msg(`A superposed bite: ${fishName(f.sup[0][0].sp)} ⊕ ${fishName(g.sp)}. Land it to find out.`, 3.5); sfx.quantum(); note('fishing');
    }
  }
  f.ph = 'fight'; f.t = 0; f.ten = 0.3; f.prog = 0.18; f.run = false; f.rest = rand(0.5, 1.2); f.dir = 1; f.lat = 0; f.over = 0;
}
// the fight: reeling raises the tension, more while the fish runs (less if you pull against its run); the line snaps if
// the tension stays in the red, and the fish gets away if you let it take all the line back
function fightFish(f, dt, fire, steer) {
  const st = f.fish.str;
  if (f.run) { f.runT -= dt; if (f.runT <= 0) { f.run = false; f.rest = rand(1, 2.6) * (1.2 - st * 0.5); } }
  else { f.rest -= dt; if (f.rest <= 0) { f.run = true; f.runT = rand(0.6, 1.5) * (0.5 + st); f.dir = Math.random() < 0.5 ? -1 : 1; if (st > 0.3) sfx.drag(); } }
  const against = f.run && steer === -f.dir, pull = f.run ? st * (against ? 0.45 : 1) : st * 0.12;
  const target = (fire ? 0.32 + pull * 0.9 : pull * 0.35) + 0.06 * Math.sin(f.t * 9);
  f.ten += (target - f.ten) * Math.min(1, dt * 2.2);
  f.prog = Math.min(1, f.prog + (fire ? (f.run ? (against ? 0.03 : -0.03) : 0.15 * (1.15 - st * 0.55)) : (f.run ? -0.09 * st - 0.02 : -0.012)) * dt);
  f.lat = clamp(f.lat + (f.run ? f.dir * (90 + st * 60) : -f.lat * 1.6) * dt, -110, 110);
  if (f.ten >= 1) { f.over += dt; if (f.over > 0.2) { f.ph = 'miss'; f.t = 0; msg('SNAP! The line broke.', 2); sfx.snap(); return; } } else f.over = 0;
  if (f.prog <= 0) { f.ph = 'miss'; f.t = 0; msg('It threw the hook and got away.', 2); return; }
  if (f.prog >= 1) landFish(f);
}
function landFish(f) {
  let c = f.fish;
  if (f.sup) { const [[a, p], [b]] = f.sup; c = Math.random() < p ? a : b; sfx.collapse(); }
  const sp = c.sp, kg = Math.max(0.1, Math.round(c.kg * 10) / 10), v = Math.round(kg * sp.pr), was = fishBest[sp.name];
  const rec = sp.tag === 'junk' ? null : !was ? 'first' : kg > was ? 'record' : null;
  if (rec) { fishBest[sp.name] = kg; try { localStorage.setItem('qta.fish', JSON.stringify(fishBest)); } catch (e) { /* ignore */ } }
  if (v) earn(v);
  f.card = { sp, kg, v, rec, was, sup: !!f.sup }; f.ph = 'caught'; f.t = 0; f.sup = null; f.fish = null;
  if (f.card.sup) ach('schrodinger');
  (sp.tag === 'junk' ? sfx.punch : sfx.good)();
}
// ---- optical tweezers: G picks up the empty car behind yours and holds it in a harmonic trap that rides behind you.
// Nothing damps its motion (an atom in a vacuum), so every sudden start, stop, swerve or bump sets it sloshing, and the
// energy stays: n̄ counts it in motional quanta. Smooth driving moves it adiabatically; shake it hard enough and it
// escapes the trap (atom loss). Heavier cars sit in a softer trap (ω² = k/m).
const TW = { k: 90, lose: 26, q: 1.5 }; // trap stiffness for a mass-1 car, escape distance (px), one quantum's amplitude (px)
const minJerk = u => u * u * u * (10 - 15 * u + 6 * u * u); // the smooth 0 to 1 profile real transport moves follow
function towBase(pc, hc) { // the trap's home, just behind your car
  const d = CT[pc.type].l / 2 + CT[hc.type].l / 2 + 12;
  return [pc.x - Math.cos(pc.angle) * d, pc.y - Math.sin(pc.angle) * d];
}
function grabTow() {
  if (player.tow) { dropTow(); return; }
  const pc = player.car;
  if (!pc) { msg('The tweezer works from a car (G).', 1.5); return; }
  if (player.isGuest) { msg('The tweezer is for the host (or a single player) for now.', 2.5); return; }
  if (Q.branches) { msg('Not while superposed: the trap can only follow one branch.', 2); return; }
  let best = null, bd = 64 * 64;
  for (const c of cars) {
    if (c === pc || c.dead || c.fire > 0 || c.ghost || c.lay === 1 || c.lay === 3) continue;
    const [bx, by] = towBase(pc, c), d = d2(c.x, c.y, bx, by);
    if (d < bd) { bd = d; best = c; }
  }
  if (!best) { msg('Back up to a car to pick it up with the tweezer.', 2); return; }
  if (best.driver) { msg('That car has a driver. The tweezer only takes empty ones.', 2); return; }
  if (Math.hypot(best.vx - pc.vx, best.vy - pc.vy) > 60) { msg('Too fast: stop by it to pick it up.', 1.8); return; }
  // the trap switches on where the car is, then glides it home behind you along a smooth (minimum-jerk) path
  const [bx, by] = towBase(pc, best), ca = Math.cos(pc.angle), sa = Math.sin(pc.angle), ox = best.x - bx, oy = best.y - by;
  player.tow = { c: best, pc, ox: ox * ca + oy * sa, oy: -ox * sa + oy * ca, ramp: 0, n: 0, still: 0, ax: 0, ay: 0, Ax: best.x, Ay: best.y, Avx: best.vx, Avy: best.vy, ux: 0, uy: 0 };
  best.heldBy = pc; best.parked = false; best.moved = true;
  sfx.quantum(); note('tweezer');
  msg('In the tweezer. Smooth driving keeps n̄ low; hard knocks shake it loose. G drops it.', 4);
}
function dropTow(why) {
  const tw = player.tow; if (!tw) return;
  player.tow = null; const c = tw.c; c.heldBy = null; c.lastN = tw.n;
  if (why === '') return; // (quietly: you got out, or changed cars)
  if (why === 'lost') {
    sfx.snap(); msg(`It shook loose: atom loss at n̄ ≈ ${Math.round(tw.n)}!`, 3);
    if (mission && mission.type === 'cz' && mission.q === c) failMission('The qubit fell out of the tweezer (atom loss).');
  } else if (why) msg(why, 2);
  else msg(`Dropped off · n̄ ≈ ${tw.n.toFixed(1)}`, 1.8);
}
function updateTow(dt) {
  const tw = player.tow; if (!tw) return;
  const pc = player.car, c = tw.c;
  if (pc !== tw.pc || !pc || pc.dead || c.dead || !cars.includes(c)) { dropTow(c.dead ? 'The car in the tweezer was wrecked.' : !pc || pc !== tw.pc ? '' : null); return; }
  tw.ramp = Math.min(1, tw.ramp + dt / 1.2);
  const k = 1 - minJerk(tw.ramp), [bx, by] = towBase(pc, c), ca = Math.cos(pc.angle), sa = Math.sin(pc.angle);
  const Ax = bx + (tw.ox * ca - tw.oy * sa) * k, Ay = by + (tw.ox * sa + tw.oy * ca) * k;
  const Avx = (Ax - tw.Ax) / dt, Avy = (Ay - tw.Ay) / dt, f = Math.min(1, dt / 0.08);
  tw.ax += ((Avx - tw.Avx) / dt - tw.ax) * f; tw.ay += ((Avy - tw.Avy) / dt - tw.ay) * f; // (the trap's acceleration, smoothed)
  const w2 = TW.k / CT[c.type].mass;
  c.vx -= w2 * (c.x - Ax) * dt; c.vy -= w2 * (c.y - Ay) * dt; // the trap's pull is the only force: no friction in a vacuum
  if (Math.hypot(pc.vx, pc.vy) < 5) { tw.still += dt; if (tw.still > 1) { const d = Math.exp(-dt * 1.5); c.vx = Avx + (c.vx - Avx) * d; c.vy = Avy + (c.vy - Avy) * d; } } // parked: re-cooled
  else tw.still = 0;
  moveCar(c, dt); // (walls still stop it, hard)
  c.speed = c.vx * Math.cos(c.angle) + c.vy * Math.sin(c.angle);
  let da = pc.angle - c.angle; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
  const na = c.angle + da * Math.min(1, dt * 3); if (!carHitsWall(c, c.x, c.y, na)) c.angle = na;
  // the motion above the smooth (adiabatic) path, in quanta: E = ½|v - v_trap|² + ½ω²|x - (x_trap - a/ω²)|²
  const ex = c.x - (Ax - tw.ax / w2), ey = c.y - (Ay - tw.ay / w2);
  const n = (0.5 * ((c.vx - Avx) ** 2 + (c.vy - Avy) ** 2) + 0.5 * w2 * (ex * ex + ey * ey)) / (0.5 * w2 * TW.q * TW.q);
  tw.n += (n - tw.n) * Math.min(1, dt / 0.3);
  tw.ux = ((c.x - Ax) * ca + (c.y - Ay) * sa) / TW.lose; tw.uy = (-(c.x - Ax) * sa + (c.y - Ay) * ca) / TW.lose; // (for the HUD's little well)
  Object.assign(tw, { Ax, Ay, Avx, Avy });
  if (Math.hypot(c.x - Ax, c.y - Ay) > TW.lose) dropTow('lost');
}
// ---- the Atom Array Lab's zones. The entangling zone's global Rydberg pulse gives every pair of cars within the blockade
// radius of each other a CZ gate: if one of them is you, you come out entangled with the other (T then swaps you). Three
// or more close together is crosstalk, and nobody gets a clean gate. The readout bay's camera flash measures whatever is in it.
const RB_R = 64; // the blockade radius (px)
const inZone = (z, x, y) => x > z.x0 && x < z.x1 && y > z.y0 && y < z.y1;
function updateZones(dt) {
  for (const z of ZONES) {
    if (z.fx > 0) z.fx -= dt;
    if (z.kind === 'ent') { z.t -= dt; if (z.t <= 0) { z.t = z.period; rydbergPulse(z); } }
    else if (z.kind === 'read') { z.t -= dt; if (z.t <= 0) { z.t = 4; readoutFlash(z); } }
  }
}
function rydbergPulse(z) {
  const P = pp(), atoms = cars.filter(c => !c.dead && !c.ghost && c.lay !== 1 && c.lay !== 3 && c !== player.car && inZone(z, c.x, c.y)).map(c => ({ c, x: c.x, y: c.y }));
  if (!player.hidden && !player.down && inZone(z, P.x, P.y)) atoms.push({ me: true, x: P.x, y: P.y });
  const up = atoms.map((_, i) => i), root = i => up[i] === i ? i : (up[i] = root(up[i]));
  const edges = [];
  for (let i = 0; i < atoms.length; i++) for (let j = i + 1; j < atoms.length; j++)
    if (d2(atoms[i].x, atoms[i].y, atoms[j].x, atoms[j].y) < RB_R * RB_R) { edges.push([i, j]); up[root(i)] = root(j); }
  const size = {}; for (let i = 0; i < atoms.length; i++) size[root(i)] = (size[root(i)] || 0) + 1;
  z.fx = 0.7; z.pairs = edges.map(([i, j]) => ({ a: atoms[i], b: atoms[j], ok: size[root(i)] === 2 }));
  if (d2(P.x, P.y, (z.x0 + z.x1) / 2, (z.y0 + z.y1) / 2) < 700 * 700) sfx.quantum();
  const me = atoms.findIndex(a => a.me);
  if (me >= 0) {
    const g = size[root(me)];
    if (g === 2) {
      const o = atoms[edges.find(([i, j]) => i === me || j === me).find(i => i !== me)].c;
      unlink(); Q.link = o; Q.linkT = 60; o.linked = true; labFlags.cz = true;
      qburst(o.x, o.y, '#b388ff'); qburst(P.x, P.y, '#b388ff'); note('rydberg');
      msg('Rydberg pulse: CZ! You and that car are entangled (T swaps you).', 4);
      const m = mission;
      if (m && m.type === 'cz' && m.stage === 1 && o === m.q) { m.stage = 2; m.ng = player.tow && player.tow.c === o ? player.tow.n : o.lastN || 0; msg(`Gate done (n̄ ≈ ${m.ng.toFixed(1)}). Drop the qubit in the readout bay (G), then back out.`, 5); }
    } else if (g > 2) { msg('Crosstalk: three or more in the blockade radius. No clean gate.', 3.5); sfx.bad(); }
  }
  if (mission && mission.type === 'cz' && mission.stage === 1 && me < 0) {
    const qi = atoms.findIndex(a => a.c === mission.q);
    if (qi >= 0 && size[root(qi)] > 1) msg('The qubit got a gate without you: be in the zone with it.', 3);
  }
}
function readoutFlash(z) {
  const P = pp(), meIn = !player.hidden && inZone(z, P.x, P.y), m = mission;
  z.fx = 0.35;
  if (m && m.type === 'cz' && m.stage === 2 && !m.q.heldBy && inZone(z, m.q.x, m.q.y) && Math.hypot(m.q.vx, m.q.vy) < 30) {
    const b = Math.random() < 0.5 ? 0 : 1, F = clamp(Math.exp(-m.ng / 30), 0.35, 1);
    msg(`Readout: the qubit is |${b}⟩, and so is your half.${meIn ? ' The light hit you too.' : ''}`, 5);
    unlink(); completeMission(F * (meIn ? 0.6 : 1), meIn ? 'NOISY READOUT' : 'READ OUT');
    return;
  }
  if (Q.link && (meIn || inZone(z, Q.link.x, Q.link.y))) { unlink(); msg('The readout light measured your pair: the link is gone.', 3); }
}
// the debug console's god mode (yours alone: not your guest's in a two-player game)
function godOn() { return DBG.god && !NET.inGuest; }
function hurtPlayer(dmg) {
  if (player.down || player.hidden || player.cellar || godOn()) return;
  if (player.fish) stopFishing();
  player.hp -= dmg;
  addDecal({ k: 'blood', x: player.x, y: player.y, r: 4 });
  if (player.hp <= 0) killPlayer();
}
function killPlayer() {
  if (player.down) return;
  if (godOn()) { if (player.car) { const c = player.car; c.driver = null; player.x = c.x; player.y = c.y; player.car = null; } return; } // (thrown clear of the wreck)
  Q.branches = null;
  if (player.car) { const c = player.car; c.driver = null; player.x = c.x; player.y = c.y; player.car = null; }
  player.hp = 0; player.down = 4; player.downKind = 'wasted';
  if (!lab) player.lives--;
  ach('wasted'); bigText('WASTED', '#e74c3c', 4, lab ? 'the lesson restarts' : player.lives > 0 ? `${player.lives} ${player.lives === 1 ? 'life' : 'lives'} left` : '');
  addDecal({ k: 'blood', x: player.x, y: player.y, r: 12 });
  if (mission && !lab) failMission('You got wasted.');
  sfx.bad();
}
function bustPlayer() {
  if (player.down || godOn()) return;
  if (player.marble) { player.marble = false; player.bust = 0; player.marbleT = 4; heat = Math.max(0, heat - 1); ach('lucky'); bigText('LUCKY MARBLE', '#9fe8ff', 3, 'The orloj\'s marble: they let you slip away'); sfx.clink(); return; }
  Q.branches = null;
  if (player.car) { player.car.driver = null; player.car = null; }
  player.down = 4; player.downKind = 'busted';
  const fine = Math.floor(player.cash * 0.1);
  player.cash -= fine; player.weapons = {}; player.weapon = null;
  bigText('BUSTED', '#3498db', 4, `Fine ${fmt(fine)} · weapons confiscated`); ach('busted');
  if (mission && !lab) failMission('You got busted.');
  sfx.bad();
}
// the way out from a spot by a building: away from the nearby walls (and water), toward the street
function faceOpen(x, y) {
  const cx = Math.floor(x / T), cy = Math.floor(y / T); let sx = 0, sy = 0;
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
    if (!dx && !dy) continue;
    const t = tile(cx + dx, cy + dy), w = 1 / (dx * dx + dy * dy);
    if (solidT(t)) { sx -= dx * w; sy -= dy * w; } else if (t === ROAD) { sx += dx * w * 0.5; sy += dy * w * 0.5; }
  }
  return sx || sy ? Math.atan2(sy, sx) : 0;
}
function respawn() {
  if (lab) { player.down = 0; setupLesson(lab.i); return; }
  const spil = player.downKind === 'busted' && EA && EA.spil && !player.isGuest; // (in Brno you do your time in Špilberk)
  const where = spil ? EA.spil : nearestOf(player.downKind === 'busted' ? POLICE_POSTS : HOSPITALS, player.x, player.y);
  player.down = 0; player.hp = 100; player.bust = 0; player.car = null; player.fish = null; player.putOut = null; HQ = hqNew(); tankerCars = [];
  player.x = where.x; player.y = where.y; player.angle = faceOpen(where.x, where.y); player.lime = false; player.cellar = null;
  if (spil) { msg('Let out of Špilberk, the old "prison of nations", with a warning.', 4); ach('spilberk'); }
  heat = 0; caller = null; player.mult = Math.max(1, player.mult - 1);
  if (player.lives <= 0) { if (player.isGuest) { player.lives = 5; player.cash = Math.floor(player.cash / 2); msg('Out of lives: half your cash for five more.', 4); } else { state = 'over'; saveBest(); } }
}
function earn(v) {
  player.cash += v;
  if (!won && player.cash >= GOAL) { won = true; bigText('CITY CONQUERED', '#f1c40f', 5, `You hit ${fmt(GOAL)}. Keep playing!`); sfx.good(); ach('conquer'); }
  if (player.cash > best) saveBest();
}
function saveBest() { if (player.isGuest) return; best = Math.max(best, player.cash); try { localStorage.setItem('gridlock.best', String(best)); } catch (e) { /* ignore */ } }
// (past five stars an ordinary crime counts for a tenth: what brings the next level is outlasting this one in plain sight,
// or taking out what the state sends: big)
function addHeat(v, big) { heat = Math.min(lab ? 5.99 : 10.99, heat + (heat >= 5 && !big ? v * 0.1 : v)); lastCrime = time; if (heat >= 1) revealPlayer(); }

function updatePlayer(dt) {
  if (player.down) {
    if (player.jack) endJack();
    player.down -= dt;
    if (player.down <= 0) respawn();
    return;
  }
  if (player.cellar) { player.moving = false; return; } // (under the old town: see updateCellar)
  if (player.fish) { updateFishing(dt); return; }
  if (player.jack) { updateJack(dt); return; }
  if (HQ.bell && !player.isGuest) { updateBell(dt); return; }
  if (player.stun > 0) { player.stun -= dt; player.moving = false; const c = player.car; if (c && !c.tram) applyControls(c, 0, 0, false, dt); return; } // (Agent Spooky's wrist shock: nothing answers for a moment)
  const con = !player.car && CONSOLES.find(c => d2(c.x, c.y, player.x, player.y) < 28 * 28);
  const qpc = !player.car && !player.isGuest && EA && EA.qpc && d2(EA.qpc.x, EA.qpc.y, player.x, player.y) < 26 * 26;
  if (!!qpc !== !!player.qpcHint) { if (qpc) msg(`FIT BUT's quantum computer. ${touchOn() ? '⇄' : 'Enter'}: run Grover's search on it.`, 3); player.qpcHint = qpc; }
  const epr = !player.car && heat >= 8 ? eprPhones().findIndex(e => d2(e.x, e.y, player.x, player.y) < 30 * 30) : -1;
  if (epr !== player.eprHint) { if (epr >= 0) msg(`An entangled payphone. ${touchOn() ? '⇄' : 'Enter'}: a Bell measurement, and you teleport to its twin.`, 3); player.eprHint = epr; }
  if (hit('Enter', 'KeyF', 'KeyE')) { const hz = !player.car && !player.isGuest ? eggHatchAt(player.x, player.y) : -1; if (hz >= 0) { enterCellar(hz); return; } const fs = !player.car && fishSpotAt(player.x, player.y); if (qpc) { qcOpen(); return; } if (con) { aodOpen(); return; } if (epr >= 0) { startBell(epr); return; } if (fs) startFishing(fs); else enterExit(); }
  if (!player.car) { // walking up to a jetty or the AOD console: say what it is for
    const fs = fishSpotAt(player.x, player.y) || con;
    if (fs && fs !== player.fishHint) msg(fs === con ? `The AOD console: plan atom moves. ${touchOn() ? '⇄' : 'Enter'}: sit down.` : `A fishing jetty. ${touchOn() ? '⇄' : 'Enter'}: fish.`, 2.5);
    player.fishHint = fs;
  }
  if (hit('KeyQ', 'Tab')) { cycleWeapon(); msg(player.weapon ? WEAPONS[player.weapon].name : 'Fists', 1.2); }
  if (player.car && player.car.tram) { if (hit('KeyX') || hit('KeyT') || hit('KeyG')) msg(`A ${player.car.tram.train ? 'train' : 'tram'} keeps to its rails: no quantum tricks aboard, and no tweezer.`, 2); }
  else if (boatOf(player.car)) { if (hit('KeyX') || hit('KeyG')) msg('Out on the water the waves keep measuring you: no superposition, and no tweezer. (T still entangles you with another boat.)', 3); if (hit('KeyT')) entangle(); }
  else {
    if (hit('KeyX')) superpose();
    if (hit('KeyT')) entangle();
    if (hit('KeyG')) grabTow();
  }
  if (player.car && player.car.tram) { /* (the tram you drive answers to the keys in updateTrams) */ }
  else if (player.car) {
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
    if (mv) { // (pushing at a wall, or sliding along it: little headway, and the wall right ahead)
      const ux = Math.cos(player.angle) * Math.sign(mv), uy = Math.sin(player.angle) * Math.sign(mv);
      if ((player.x - px) * ux + (player.y - py) * uy < Math.abs(mv) * dt * 0.75 && solidAt(player.x + ux * 9, player.y + uy * 9)) tryTunnel(player, ux * Math.abs(mv), uy * Math.abs(mv), 4, player, false);
    }
    player.vx = (player.x - px) / dt; player.vy = (player.y - py) / dt;
    player.moving = mv !== 0;
    if (mv) player.anim += dt * 15;
    player.shootCd -= dt;
    if (keys.fire && player.shootCd <= 0) fire();
  }
  if (heat >= 1) {
    if (!player.car) {
      for (const c of cars) if ((c.type === 'police' || c.type === 'policeboat') && c.driver === 'police' && Math.abs(c.speed) < 40 && d2(c.x, c.y, player.x, player.y) < 30 * 30) player.bust += dt;
    } else if (Math.abs(player.car.speed) < 25) {
      for (const c of cars) if ((c.type === 'police' || c.type === 'policeboat') && c.driver === 'police' && d2(c.x, c.y, player.x, player.y) < 42 * 42) player.bust += dt * 0.6;
    }
  }
  player.bust = Math.max(0, player.bust - dt * 0.5);
  if (player.marbleT > 0) { player.marbleT -= dt; player.bust = 0; } // (the orloj's luck, for a moment)
  if (player.bust > 1.4) bustPlayer();
}

// ============================================================ collisions
function carCircles(c) {
  const t = CT[c.type], o = t.l / 4, ca = Math.cos(c.angle), sa = Math.sin(c.angle);
  return [[c.x + ca * o, c.y + sa * o], [c.x - ca * o, c.y - sa * o], t.w / 2 + 1];
}
// bumping into a police car is a crime: that cruiser gives chase, and you are wanted (at least one star)
function bumpedCop(cop, by) {
  if (by.driver !== 'player' || cop.driver !== 'police' || cop.dead || lab) return;
  const was = cop.chase; cop.chase = true; cop.lostT = 0;
  if (heat < 1.05) { addHeat(1.05 - heat); if (!was) msg('You hit a police car! They\'re after you.', 2.5); }
  else lastCrime = time;
}
function collideCars(active) {
  const C = active.map(carCircles);
  for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) {
    const a = active[i], b = active[j];
    if (d2(a.x, a.y, b.x, b.y) > 60 * 60 || layersApart(a, b) || a.heldBy === b || b.heldBy === a) continue;
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
        if (-vn > 20) { bumpedCop(a, b); bumpedCop(b, a); }
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
    if (c.lay === 1 || c.lay === 3) continue;
    const t = CT[c.type], v = Math.hypot(c.vx, c.vy), ca = Math.cos(c.angle), sa = Math.sin(c.angle);
    const test = (p, isPlayer) => {
      const dx = p.x - c.x, dy = p.y - c.y;
      if (dx * dx + dy * dy > (t.l / 2 + 8) ** 2) return;
      const lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca;
      if (Math.abs(lx) > t.l / 2 + 4 || Math.abs(ly) > t.w / 2 + 4) return;
      if (v > 75) {
        if (isPlayer) { if (isPlayer === 'guest') asGuest(() => hurtPlayer(v * 0.12)); else hurtPlayer(v * 0.12); shove(p, lx, ly, t, ca, sa, 8); }
        else killPed(p, c.driver === 'player' ? 'player' : null);
        c.vx *= 0.93; c.vy *= 0.93;
      } else {
        shove(p, lx, ly, t, ca, sa, 1);
        if (!isPlayer && !p.flee && v > 20) { p.flee = 3; p.fx = c.x; p.fy = c.y; }
      }
    };
    for (const p of peds) if (!p.dead) test(p, false);
    if (!player.car && !player.down && !player.hidden) test(player, true);
    if (NET.guest) { const g = NET.guest.player; if (!g.car && !g.down && !g.hidden) test(g, 'guest'); }
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
      if (solidAt(b.x, b.y) && !seeThrough(b.x, b.y)) { done = true; if (!b.rocket) for (let k = 0; k < 3; k++) addPart(b.x, b.y, rand(-60, 60), rand(-60, 60), 0.2, 1.5, '#ffe08a'); break; }
      for (const c of cars) {
        if ((c.dead && !b.rocket) || c.lay === 1) continue;
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
      if (!done && trams.length) { // (a tram's side stops a bullet)
        const t = tramHitAt(b.x, b.y);
        if (t && !(b.owner === 'player' && t.cab && player.car === t.cab)) {
          if (!b.rocket) damageTram(t, b.dmg * (t.cab ? 0.5 : 0.15), b.owner === 'player' ? 'player' : null);
          for (let k = 0; k < 3; k++) addPart(b.x, b.y, rand(-50, 50), rand(-50, 50), 0.2, 1.5, '#ffe08a');
          done = true;
        }
      }
      if (done) break;
      if (b.owner === 'player' && heli && !heli.dead) { // shots at the helicopter (aimed at where it appears overhead)
        const k = 1 + HELI_Z, hx = cam.x + (heli.x - cam.x) * k, hy = cam.y + (heli.y - cam.y) * k;
        if (d2(b.x, b.y, hx, hy) < 24 * 24) {
          heli.hp -= b.rocket ? 200 : b.dmg; done = true;
          for (let q = 0; q < 4; q++) addPart(b.x, b.y, rand(-60, 60), rand(-60, 60), 0.25, 1.5, '#ffe08a', 0, true);
          if (heli.hp <= 0) { heli.dead = true; heli.fall = 0; earn(800); addHeat(heli.army ? 0.6 : 1, heli.army); msg('You brought down the helicopter!', 3); if (onScreen(hx, hy)) sfx.boom(); }
          if (!b.rocket) break;
        }
      }
      if (done) break;
      if (b.owner === 'player' && airHit(b)) { done = true; break; } // (the drones, the Helicarrier)
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
      } else if (NET.guest && !NET.guest.player.car && !NET.guest.player.down && d2(NET.guest.player.x, NET.guest.player.y, b.x, b.y) < 7 * 7) {
        asGuest(() => hurtPlayer(b.dmg)); done = true;
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
  ent:    { c: '#3cf0ff', l: 'ε', label: 'ε charges +2 (T: entangle with a car)', give: () => { Q.ent += 2; } },
};
function give(w, n) { player.weapons[w] = (player.weapons[w] || 0) + n; if (!player.weapon) player.weapon = w; }
function placePickups() {
  pickups = [];
  const kinds = ['pistol', 'pistol', 'pistol', 'pistol', 'smg', 'smg', 'smg', 'rocket', 'rocket', 'health', 'health', 'health', 'health',
    'bribe', 'bribe', 'bribe', 'cash', 'cash', 'cash', 'cash', 'cash', 'psi', 'psi', 'psi', 'psi', 'psi', 'ent', 'ent', 'ent', 'ent', 'ent'];
  for (const k of kinds) {
    const t = randomTile([WALK, PLAZA, GRASS], p => inCity(p.tx, p.ty) || (BRNO && DISTRICTS[REG[p.ty * MW + p.tx]].kind === 'city'));
    if (t) pickups.push({ x: t.x, y: t.y, k, cd: 0 });
  }
  for (const k of kinds.slice(0, 24)) { // and out in the countryside
    const t = randomTile([WALK, PLAZA, GRASS, SAND], p => !inCity(p.tx, p.ty) && !taken[p.ty * MW + p.tx] && (!BRNO || DISTRICTS[REG[p.ty * MW + p.tx]].kind !== 'city'));
    if (t) pickups.push({ x: t.x, y: t.y, k, cd: 0 });
  }
  // Site Ψ keeps a rocket launcher and spare quantum gear behind its fence
  if (SITE_PSI) for (const [k, fx, fy] of [['rocket', 0.42, 0.62], ['psi', 0.5, 0.75], ['ent', 0.62, 0.75], ['health', 0.7, 0.6]])
    pickups.push({ x: lerp(SITE_PSI.x0, SITE_PSI.x1, fx), y: lerp(SITE_PSI.y0, SITE_PSI.y1, fy), k, cd: 0 });
  eggPickups(); // (Brno's: the calfskin full of lime, the duck, the Bren gun)
}
function updatePickups(dt) {
  const P0 = pp();
  for (const u of pickups) {
    if (u.cd > 0) { u.cd -= dt; continue; }
    if (u.k === 'ent' && heat >= 8) continue; // (the Observer took them)
    if (!player.down && d2(u.x, u.y, P0.x, P0.y) < 20 * 20 && (!PK[u.k].can || PK[u.k].can())) { PK[u.k].give(); msg(PK[u.k].label, PK[u.k].draw ? 5 : 2); sfx.pickup(); u.cd = PK[u.k].cd ?? 45; }
  }
}
// ---- power-ups that turn up at random around each player, often and several at a time, and go again after a
// minute if nobody takes them: ψ, ε, and a heart (an extra life, only while you have lost one)
const DROP = {
  psi: PK.psi, ent: PK.ent,
  heart: { c: '#ff4d6d', label: 'Extra life ♥', give: () => { player.lives++; }, can: () => player.lives < 5 },
};
const DROP_K = Object.keys(DROP), DROP_LIFE = 60, DROP_NEAR = 8; // (how long one waits; how many at most around a player)
let drops = [], dropId = 0;
const dropShown = u => !(u.k === 'ent' && heat >= 8); // (from eight stars the Observer takes the ε, as with the other pickups)
function dropNear(P0, k, min = 220, max = 850, gap = 130) {
  const t = randomTile([WALK, PLAZA, GRASS, SAND], p => { p.x += rand(-8, 8); p.y += rand(-8, 8); return !circleSolid(p.x, p.y, 10) && !drops.some(u => d2(u.x, u.y, p.x, p.y) < gap * gap); }, { x: P0.x, y: P0.y, min, max });
  if (t) drops.push({ id: ++dropId, x: t.x, y: t.y, k, age: 0 });
}
function updateDrops(dt) { // (for each player: the host runs it again as the guest)
  const P0 = pp();
  player.dropT = (player.dropT ?? rand(1, 3)) - dt;
  if (player.dropT <= 0 && !lab) { // (not in the lessons)
    player.dropT = rand(3, 6);
    if (drops.filter(u => d2(u.x, u.y, P0.x, P0.y) < 1200 * 1200).length < DROP_NEAR) {
      const w = { psi: 1, ent: heat >= 8 ? 0 : 1, heart: player.lives < 5 ? 0.4 : 0 };
      let r = Math.random() * (w.psi + w.ent + w.heart), k = 'psi';
      for (const q of DROP_K) { r -= w[q]; if (r < 0) { k = q; break; } }
      dropNear(P0, k);
    }
  }
  if (player.down) return;
  for (let i = drops.length - 1; i >= 0; i--) {
    const u = drops[i], D = DROP[u.k];
    if (!dropShown(u) || d2(u.x, u.y, P0.x, P0.y) > 20 * 20 || (D.can && !D.can())) continue;
    D.give(); msg(D.label, 2); sfx.pickup(); drops.splice(i, 1);
    if ((player.nDrops = (player.nDrops || 0) + 1) >= 25) ach('drops');
    for (let j = 0; j < 8; j++) addPart(u.x, u.y, rand(-60, 60), rand(-60, 60), 0.4, 2.5, D.c);
  }
}
function ageDrops(dt) { // (once a frame, for everyone: gone after a minute, or when nobody is near)
  const at = allCams();
  for (const u of drops) u.age += dt;
  drops = drops.filter(u => u.age < DROP_LIFE && at.some(m => d2(u.x, u.y, m.x, m.y) < 2000 * 2000));
}

// ============================================================ missions
function farTile(min, max, types = [WALK]) {
  const P0 = pp();
  return randomTile(types, null, { x: P0.x, y: P0.y, min, max }) || randomTile(types);
}
function freeSpot(min, max) {
  const P0 = pp();
  const free = parkSpots.filter(s => { const d = Math.hypot(s.x - P0.x, s.y - P0.y); return d > min && d < max && !cars.some(c => d2(c.x, c.y, s.x, s.y) < 20 * 20); });
  if (free.length) return pick(free);
  const t = farTile(min, max, [PLAZA, WALK]); return { x: t.x, y: t.y, a: 0 };
}
const ARCS = BRNO ? [] : [
  { name: 'The Dockside Syndicate', jobs: ['deliver', 'steal', 'escort'], lines: ['The Syndicate wants to see if you can carry things.', 'Now they want wheels. Fast ones.', 'Their accountant needs a ride. Keep him in one piece.'] },
  { name: 'Midtown Money', jobs: ['race', 'qkd', 'getaway'], lines: ['A banker needs a courier who drives like a lunatic.', 'Move the bank\'s quantum keys. Someone is listening.', 'The big bank job is on. Get away clean.'] },
  { name: 'Old Quarter Vendetta', jobs: ['hit', 'entangle', 'wreck'], lines: ['The old families want a snitch silenced.', 'A rival\'s car is entangled with a decoy. Use it.', 'Time to send the whole Quarter a message.'] },
  { name: 'Neon Nights', jobs: ['escort', 'qkd', 'getaway'], lines: ['A club owner needs a discreet driver.', 'The club\'s ledger travels as qubits tonight.', 'The heist went loud. Vanish into the neon.'] },
];
// the towns have their own arcs (indexed by region, like the city's districts)
if (BRNO) { // Brno's arcs, by district
  ARCS[B_['Staré Město']] = { name: 'The Marble Drop', jobs: ['deliver', 'steal', 'escort'], lines: ['The clock on the square drops a glass marble at eleven. Someone wants a delivery made before it does.', 'A collector wants a car from Joštova. Quietly.', 'A witness needs a ride out of the old town. Keep him breathing.'] };
  ARCS[B_['Královo Pole']] = { name: 'FIT Hackers', jobs: ['qkd', 'race', 'entangle'], lines: ['A FIT BUT lab needs its qubits carried across town. Someone is listening.', 'The faculty bets on the fastest lap through Královo Pole. Checkpoints, now.', 'A rival\'s car is entangled with a decoy. Use what they teach at FIT.'] };
  ARCS[B_['Štýřice']] = { name: 'Tower Money', jobs: ['race', 'qkd', 'getaway'], lines: ['A trader in the AZ Tower needs a courier who drives like a lunatic.', 'The tower\'s keys travel as qubits tonight.', 'The big job went loud. Get away clean.'] };
  ARCS[B_['Líšeň']] = { name: 'Líšeň Nights', jobs: ['wreck', 'getaway', 'hit'], lines: ['Send the rival crew a message. Wreck their cars.', 'The deal went sideways. Lose the police in the estates.', 'Someone talked. Find him.'] };
  ARCS[B_['Bystrc']] = { name: 'Dam Smugglers', jobs: ['deliver', 'escort', 'entangle'], lines: ['A crate from the harbour has to reach the city. Mind the bumps.', 'The boatman needs a lift. Smooth ride.', 'Their courier\'s car is entangled with a decoy. Use it.'] };
} else {
ARCS[R_VILLAGE] = { name: 'Valley Moonshiners', jobs: ['deliver', 'race', 'getaway'], lines: ['The still needs a delivery run. Mind the potholes.', 'Prove you can outrun the sheriff. Checkpoints, now.', 'The barn raid went sideways. Lose the law.'] };
ARCS[R_ONDAS] = { name: 'House Edge', jobs: ['qkd', 'steal', 'hit'], lines: ['The casino moves its keys as qubits. Keep them secret.', 'A high roller\'s car. Bring it round the back.', 'A card counter knows too much.'] };
ARCS[R_CORAL] = { name: 'Tidewater Crew', jobs: ['escort', 'wreck', 'entangle'], lines: ['A smuggler needs a lift along the coast.', 'The rival crew\'s cars are cruising the beach road. Wreck them.', 'Their boss drives a car entangled with a decoy. Use it.'] };
}
let arcProg = DISTRICTS.map(() => 0);
function startMission(forced, booth) {
  ringing = null;
  let type = forced || null, arc = null;
  if (!type && booth) {
    const d = districtAt(booth.x, booth.y);
    if (ARCS[d] && arcProg[d] < 3) { arc = d; type = ARCS[d].jobs[arcProg[d]]; msg(`${ARCS[d].name} (${arcProg[d] + 1}/3): ${ARCS[d].lines[arcProg[d]]}`, 6); }
  }
  if (!type) type = pick(['deliver', 'steal', 'hit', 'race', 'wreck', 'entangle', 'escort', 'getaway', 'qkd', ...(ATOM_LAB && !player.isGuest ? ['cz'] : [])]);
  if (type === 'cz' && !ATOM_LAB) type = 'deliver';
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
      const t = randomTile([ROAD], null, { x: last.x, y: last.y, min: 450, max: 900 }) || randomTile([ROAD]);
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
  } else if (type === 'cz') { // a two-qubit gate at the Atom Array Lab, through all three of its zones
    const L = ATOM_LAB, sp = L.stalls.find(s => !s.c || !cars.includes(s.c)) || L.stalls[0];
    for (const c of cars) if (!c.mission && d2(c.x, c.y, sp.x, sp.y) < 18 * 18) cars.splice(cars.indexOf(c), 1);
    const q = makeCar('compact', sp.x, sp.y, sp.a, null);
    Object.assign(q, { mission: true, parked: true, color: '#a970ff', qubit: true }); sp.c = q; sp.tried = true;
    mission = { type, stage: 0, q, reward: reward + 2500, timer: 0, ng: 0 };
    msg('Job: a two-qubit gate at the Atom Array Lab. Pick up the violet qubit car in storage (G).', 6); note('rydberg');
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
function missionLine() {
  if (!mission) return null;
  let line = '';
  switch (mission.type) {
    case 'deliver': line = mission.stage ? `Deliver the case · P(bomb) ${Math.round(mission.bomb * 100)}%` : 'Pick up the briefcase'; break;
    case 'steal': line = mission.stage ? 'Bring the coupe to the garage' : 'Steal the pink coupe'; break;
    case 'hit': line = 'Take out the man in pink'; break;
    case 'deadline': line = `Get the student to Božetěchova by 23:59 · now ${hhmm(dayT * 24)}`; break;
    case 'race': line = `Checkpoint ${mission.stage + 1}/${mission.pts.length}`; break;
    case 'wreck': line = `Wreck cars ${mission.count}/${mission.need}`; break;
    case 'entangle': line = 'Wreck the near cyan twin'; break;
    case 'escort': line = mission.stage ? 'Drive the VIP to the marker' : 'Pick up the VIP in gold'; break;
    case 'getaway': line = belief.seen ? 'Reach the safehouse: lose the cops!' : 'Reach the safehouse unseen'; break;
    case 'qkd': line = `Deliver the qubits${mission.tapped ? ' · Eve tapped in!' : ''}`; break;
    case 'cz': line = mission.stage === 0 ? 'Pick up the violet qubit (back up to it, G)' : mission.stage === 1 ? `Into the entangling zone with it · pulse in ${Math.ceil(ATOM_LAB.ent.t)} s`
      : 'Drop it in the readout bay (G), then back out'; break;
  }
  return { line, arc: mission.arc !== null && mission.arc !== undefined ? `${ARCS[mission.arc].name} ${arcProg[mission.arc] + 1}/3` : '', timer: mission.timer > 0 ? +mission.timer.toFixed(1) : 0 };
}
function missionTarget() {
  if (NET.role === 'guest') return NET.mt ? { x: NET.mt[0], y: NET.mt[1] } : ringing;
  if (!mission) return lab ? lab.target : eggTarget(true) || ringing || eggTarget();
  switch (mission.type) {
    case 'deadline': return mission;
    case 'steal': return mission.stage === 0 ? mission.car : mission;
    case 'hit': return mission.ped;
    case 'escort': return mission.stage === 0 ? mission.ped : mission;
    case 'race': return mission.pts[mission.stage];
    case 'wreck': return null;
    case 'entangle': return mission.a.dead ? mission.b : mission.a;
    case 'cz': { const z = mission.stage === 1 ? ATOM_LAB.ent : ATOM_LAB.read; return mission.stage === 0 ? mission.q : { x: (z.x0 + z.x1) / 2, y: (z.y0 + z.y1) / 2 }; }
    default: return mission;
  }
}
function completeMission(factor = 1, title = 'JOB DONE') {
  if (!mission) return;
  const m = mission;
  const r = Math.round(m.reward * player.mult * factor);
  earn(r);
  bigText(title, factor < 1 ? '#e67e22' : '#2ecc71', 2.5, `+${fmt(r)} · multiplier x${Math.min(9, player.mult + 1)}`);
  player.mult = Math.min(9, player.mult + 1); ach('job'); if (player.mult >= 9) ach('mult9');
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
    if (arcProg[m.arc] >= 3) { earn(10000); bigText('ARC COMPLETE', '#f1c40f', 3.5, `${ARCS[m.arc].name} · bonus ${fmt(10000)}`); ach('arc'); }
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
  if (m.type === 'escort' && m.ped) {
    m.ped.vip = false;
    if (m.stage === 1 && !peds.includes(m.ped)) { const s = (m.car && sideSpot(m.car)) || pp(); m.ped.x = s.x; m.ped.y = s.y; m.ped.flee = 4; m.ped.fx = s.x; m.ped.fy = s.y; peds.push(m.ped); }
  }
  if (m.type === 'deadline' && m.ped) { m.ped.vip = false; if (!peds.includes(m.ped)) { const s = (m.car && sideSpot(m.car)) || pp(); m.ped.x = s.x; m.ped.y = s.y; peds.push(m.ped); } if (EA && EA.fitDoor && d2(m.ped.x, m.ped.y, EA.fitDoor.x, EA.fitDoor.y) < 80 * 80) pedGo(m.ped, EA.fitDoor.x, EA.fitDoor.y); }
  if (m.type === 'cz' && m.q) { m.q.mission = false; m.q.qubit = false; }
  if (m.type === 'qkd' && m.eve) { m.eve.mission = false; if (m.eve.driver === 'eve') { m.eve.driver = 'ai'; m.eve.ln = null; } }
}
function failMission(why) {
  if (!mission) return;
  if (mission.type === 'entangle') { mission.a.twin = null; mission.b.twin = null; }
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
    } else if (m.type === 'cz') {
      if (m.q.dead || !cars.includes(m.q)) { failMission('The qubit car was wrecked.'); return; }
      const held = player.tow && player.tow.c === m.q;
      if (m.stage === 0 && held) { m.stage = 1; msg('Got it. Into the entangling zone (violet floor) together, for the pulse.', 4); }
      else if (m.stage === 1 && !held && !inZone(ATOM_LAB.ent, m.q.x, m.q.y)) { m.stage = 0; msg('You put the qubit down. Pick it up again (G).', 2.5); }
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
    if (heat >= 6) { msg('Spray shop: with the state after you? Nobody here will touch your car.', 2.5); break; }
    if (player.cash < 500) { msg('Spray shop: a respray costs $500. Come back with cash.', 2); break; }
    player.cash -= 500; heat = 0; player.car.color = pick(SHIRTS);
    if (player.car.type === 'police') player.car.type = 'sedan';
    sfx.spray(); msg('Fresh paint, new plates. The cops lost you. (-$500)', 3);
    break;
  }
}

// ============================================================ spawning
function viewRect(m = 0, c = cam) {
  const hw = W / 2 / c.zoom + m, hh = H / 2 / c.zoom + m;
  return { x0: c.x - hw, y0: c.y - hh, x1: c.x + hw, y1: c.y + hh };
}
// every camera that matters: yours, and in online co-op the guest's too (the host keeps both areas alive)
const allCams = () => NET.guest ? [NET.hostCam, NET.guest.cam] : [cam];
function onScreen(x, y, m = 40) { const v = viewRect(m); return x > v.x0 && x < v.x1 && y > v.y0 && y < v.y1; }
function spawnOutside(types, check, far = 420) {
  const v = viewRect(48), o = viewRect(far);
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
    if (!p || inV(p) || cars.some(c => d2(c.x, c.y, p.x, p.y) < 50 * 50) || (trams.length && tramHitAt(p.x, p.y))) continue;
    const c = makeCar(type, p.x, p.y, p.h, driver);
    c.ln = { L: p.L, s: p.s, nx: null };
    c.speed = c.ai.cruise * 0.7; c.vx = Math.cos(c.angle) * c.speed; c.vy = Math.sin(c.angle) * c.speed;
    return c;
  }
  return null;
}
// where people are in Brno: a map of how many are about, from what the city is built of. Floor space counts by what it is
// for (homes; shops, offices, schools, stations and the like), and so do the squares and pedestrian streets, the parks
// and the tram stops; spread over a couple of hundred metres (people walk), and weighed through the day: by night the
// estates are empty and the centre goes quiet, by day the centre, the campuses and the stations fill
const PD = { cs: 0, gw: 0, gh: 0, home: null, act: null };
const PD_HOME = [0.05, 0.03, 0.03, 0.03, 0.05, 0.15, 0.4, 0.7, 0.6, 0.45, 0.45, 0.5, 0.55, 0.5, 0.5, 0.6, 0.75, 0.85, 0.8, 0.65, 0.5, 0.35, 0.2, 0.1];
const PD_ACT = [0.12, 0.08, 0.05, 0.04, 0.04, 0.08, 0.25, 0.6, 0.85, 0.9, 0.95, 1, 1, 1, 0.95, 0.95, 1, 0.95, 0.8, 0.6, 0.45, 0.35, 0.25, 0.18];
function pdBuild() {
  const mpt = B5 ? 5 : 15, cs = B5 ? 8 : 3, gw = Math.ceil(MW / cs), gh = Math.ceil(MH / cs), m2 = (mpt / T) ** 2; // (m² in a px²)
  const H = new Float32Array(gw * gh), A = new Float32Array(gw * gh);
  const add = (x, y, h, a) => { const i = Math.min(gh - 1, Math.max(0, Math.floor(y / T / cs))) * gw + Math.min(gw - 1, Math.max(0, Math.floor(x / T / cs))); H[i] += h; A[i] += a; };
  // per m² of floor: [home, activity]
  const KW = { yes: [0.6, 0.5], house: [1, 0.05], flats: [1, 0.1], shed: [0, 0], industry: [0, 0.1], shop: [0.05, 1.5], civic: [0, 1.2], church: [0, 0.4],
    hospital: [0.2, 1], school: [0, 1.2], station: [0, 3], castle: [0, 1], sport: [0, 0.5], hotel: [0.5, 0.8], tower: [0, 0] };
  const SK = { old: ['yes', 4, 2], tenement: ['flats', 5, 1.2], panel: ['flats', 9, 1], villa: ['house', 2, 1], industrial: ['industry', 2, 1], village: ['house', 2, 1] }; // (a made-up building: its kind, floors, and the busier streets of the old town)
  for (const b of buildings) {
    if (b.canopy) continue;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, st = (DISTRICTS[REG[Math.floor(cy / T) * MW + Math.floor(cx / T)]] || {}).style;
    const sk = SK[st] || SK.village, kind = b.bk || sk[0], fl = b.bk ? Math.max(1, b.lv) : sk[1];
    const area = (b.lb ? (b.lb[2] - b.lb[0]) * (b.lb[3] - b.lb[1]) : b.w * b.h) * m2 * fl, w = KW[kind] || KW.yes, boost = st === 'old' ? 2 : st === 'tenement' ? 1.2 : 1;
    add(cx, cy, area * w[0] * (b.bk ? 1 : 0.5), area * w[1] * boost); // (the made-up blocks fill more of the ground than the real ones)
  }
  for (let k = 0; k < MW * MH; k++) { // the ground: squares and pedestrian streets, parks, sports grounds
    const c = LCG[k], a = c === LC_PLAZA ? 2.5 : c === LC_GREEN ? 0.08 : c === LC_PITCH ? 0.1 : 0;
    if (a && map[k] !== BUILD && map[k] !== WATER) add((k % MW + 0.5) * T, (((k / MW) | 0) + 0.5) * T, 0, a * mpt * mpt);
  }
  for (const p of TRAM_STOPS) add(p.x, p.y, 0, 2500);
  for (const p of BUS_STOPS) add(p.x, p.y, 0, 800);
  // spread it: three box blurs of about 120 m each way
  const r = Math.max(1, Math.round(120 / (cs * mpt))), tmp = new Float32Array(gw * gh);
  const blur = F => { for (let n = 0; n < 3; n++) {
    for (let y = 0; y < gh; y++) { let s = 0; for (let x = -r; x < gw + r; x++) { if (x + r < gw) s += F[y * gw + x + r]; if (x - r - 1 >= 0) s -= F[y * gw + x - r - 1]; if (x >= 0 && x < gw) tmp[y * gw + x] = s / (2 * r + 1); } }
    for (let x = 0; x < gw; x++) { let s = 0; for (let y = -r; y < gh + r; y++) { if (y + r < gh) s += tmp[(y + r) * gw + x]; if (y - r - 1 >= 0) s -= tmp[(y - r - 1) * gw + x]; if (y >= 0 && y < gh) F[y * gw + x] = s / (2 * r + 1); } }
  } };
  blur(H); blur(A);
  // the busiest places by day (the top 1 % of the cells) come out at about 1
  const D = []; for (let i = 0; i < gw * gh; i++) { const d = 0.5 * H[i] + A[i]; if (d > 0) D.push(d); }
  D.sort((a, b) => a - b); const top = D[Math.floor(D.length * 0.99)] || 1;
  for (let i = 0; i < gw * gh; i++) { H[i] /= top; A[i] /= top; }
  Object.assign(PD, { cs, gw, gh, home: H, act: A });
}
// how busy a spot is now (about 1 in the busiest places at midday; smoothly between cells, and between the hours)
function pedDensity(x, y) {
  if (!PD.home) pdBuild();
  const h = dayT * 24, h0 = Math.floor(h) % 24, h1 = (h0 + 1) % 24, f = h - Math.floor(h);
  const fh = PD_HOME[h0] * (1 - f) + PD_HOME[h1] * f, fa = PD_ACT[h0] * (1 - f) + PD_ACT[h1] * f;
  const gx = clamp(x / T / PD.cs - 0.5, 0, PD.gw - 1.001), gy = clamp(y / T / PD.cs - 0.5, 0, PD.gh - 1.001), ix = gx | 0, iy = gy | 0, u = gx - ix, v = gy - iy, i = iy * PD.gw + ix;
  const at = F => (F[i] * (1 - u) + F[i + 1] * u) * (1 - v) + (F[i + PD.gw] * (1 - u) + F[i + PD.gw + 1] * u) * v;
  return fh * at(PD.home) + fa * at(PD.act) + (EGG.boosts.length ? eggBoost(x, y) : 0); // (and the crowds of the moment: see updateEggs)
}
// how many people there should be round the cameras, and the busiest spot among them (to place newcomers by)
function pedWant() {
  let sum = 0, n = 0, top = 0;
  for (const c of allCams()) { const r = viewRect(300, c); for (let y = r.y0; y <= r.y1; y += 160) for (let x = r.x0; x <= r.x1; x += 160) { const d = pedDensity(x, y); sum += d; n++; if (d > top) top = d; } }
  const m = n ? sum / n : 0;
  return { n: Math.round(clamp((B5 ? 160 : 110) * Math.pow(Math.min(m, 1.2), 0.6), m > 0.004 ? 2 : 0, B5 ? 190 : 130)), top };
}
function manageSpawns(dt) {
  spawnT -= dt; policeCd -= dt; serviceCd -= dt;
  if (spawnT > 0) return;
  if (serviceCd <= 0 && !player.hidden) {
    serviceCd = 4;
    const vv = viewRect(300), inV = o => o.x > vv.x0 && o.x < vv.x1 && o.y > vv.y0 && o.y < vv.y1;
    if (!cars.some(c => c.type === 'ambulance' && c.job && c.driver === 'service')) {
      const body = peds.find(p => p.dead && p.deadT > 3 && !p.target && inV(p));
      if (body) { const a = spawnTraffic('ambulance', 'service'); if (a) a.job = body; }
    }
    if (!cars.some(c => c.type === 'firetruck' && c.job && c.driver === 'service')) {
      const wreck = cars.find(c => (c.dead || c.fire > 0) && !c.mission && c !== player.car && inV(c));
      if (wreck) { const f = spawnTraffic('firetruck', 'service'); if (f) f.job = wreck; }
    }
  }
  spawnT = 0.25;
  const views = m => allCams().map(c => viewRect(m, c)), far = views(800), farP = views(650), farS = views(1300), seen = views(120);
  const out = (o, rs) => rs.every(r => o.x < r.x0 || o.x > r.x1 || o.y < r.y0 || o.y > r.y1);
  cars = cars.filter(c => c === player.car || (c.egg && !c.dead) || c.driver === 'player' || c.mission || c.heldBy || c.jackHold || c.fire > 0 || ((c.driver === 'ai' && c.ai.np > 12) || (c.recall && c.driver === 'police') ? out(c, seen) ? false : !out(c, far) : !out(c, far))
    || (c.parked && !c.dead && !c.moved && c.driver === null && !(c.spot && out(c, farS))));
  peds = peds.filter(p => p.target || p.vip || (!p.gone && !out(p, farP) && !(p.dead && p.deadT > 40)));
  fillSpots(false);
  // the city is busy, the towns less so, the open road quiet
  const P0 = pp(), rg = districtAt(P0.x, P0.y), built = !BRNO || townAt(Math.floor(P0.x / T), Math.floor(P0.y / T)); // (in Brno, out in the fields is quiet)
  const city = built && DISTRICTS[rg].kind === 'city', town = built && DISTRICTS[rg].kind === 'town';
  const moving = cars.filter(c => c.driver === 'ai' || (c.driver === 'police' && !c.chase)).length;
  if (moving < (city ? 30 : town ? 18 : 10)) {
    const cop = Math.random() < (city ? 0.07 : 0.04);
    spawnTraffic(cop ? 'police' : pick(city ? CIV : CIV_RURAL), cop ? 'police' : 'ai');
  }
  // in Brno, as many people as live and work round here at this hour, and more of them where it's busier
  const want = BRNO ? pedWant() : { n: city ? 55 : town ? 34 : 6, top: 0 }, have = peds.filter(p => !p.dead && !p.tp).length;
  for (let k = Math.min(3, Math.ceil((want.n - have) / 12)); k > 0; k--) {
    let p = null;
    for (let tries = 0; tries < (BRNO ? 6 : 1) && !p; tries++) {
      if (Math.random() < 0.35) { // someone comes out of a building
        for (let i = 0; i < 20 && !p; i++) {
          const d = pick(DOORS), x = (d.tx + 0.5) * T, y = (d.ty + 0.5) * T;
          if (onScreen(x, y, -20) && !peds.some(o => d2(o.x, o.y, x, y) < 30 * 30)) p = { x: x + DX[d.d] * 10, y: y + DY[d.d] * 10 };
        }
      }
      if (!p) { const q = spawnOutside(DISTRICTS[rg].beach ? [WALK, PLAZA, SAND] : [WALK, PLAZA], null, BRNO ? 260 : 420); if (q) p = { x: q.x + rand(-8, 8), y: q.y + rand(-8, 8) }; } // (in Brno just round the corner, so that more of them come into view)
      if (p && BRNO && Math.random() * want.top > pedDensity(p.x, p.y)) p = null; // (fewer of them where it's quieter)
    }
    if (p) eggNewPed(makePed(p.x, p.y, { cop: Math.random() < 0.08 }));
  }
  if (BRNO && have > want.n * 1.25 + 3) { // (and as the streets empty, those out of sight go indoors)
    const sv = views(60), q = peds.find(p => !p.dead && !p.tp && !p.cop && !p.target && !p.vip && !p.monk && !p.car && !p.held && !(p.flee > 0) && out(p, sv));
    if (q) q.gone = true;
  }
  if (heat >= 1 && policeCd <= 0 && !player.down) {
    const stars = Math.floor(heat), n = t => cars.filter(c => c.type === t && c.driver === 'police' && c.chase && !c.block).length;
    let c = null;
    if (boatOf(player.car) && n('policeboat') < (stars >= 4 ? 3 : 2)) { c = spawnBoat('policeboat', 'police'); if (c) msg('A police boat is coming for you.', 2); }
    else if (boatOf(player.car)) c = null;
    else if (stars >= 9 && n('dozer') < 2) { c = spawnTraffic('dozer', 'police'); if (c) msg('An armoured bulldozer is coming for you.', 2.5); }
    else if (stars >= 7 && n('apc') < (stars >= 8 ? 3 : 2)) { c = spawnTraffic('apc', 'police'); if (c) msg('An armoured carrier joins the hunt.', 2.5); }
    else if (stars >= 6 && n('bureau') < 2) { c = spawnTraffic('bureau', 'police'); if (c) msg('A Measurement Bureau van: its detector collapses X and T.', 3); }
    else if (stars >= 5 && n('tank') < 1) { c = spawnTraffic('tank', 'police'); if (c) msg('They sent a TANK.', 3); }
    else if (stars >= 4 && n('swat') < (stars >= 5 ? 2 : 1)) { c = spawnTraffic('swat', 'police'); if (c) msg('A SWAT van is on its way.', 2.5); }
    else if (n('police') < [0, 1, 2, 3, 3, 3][stars]) c = spawnTraffic('police', 'police');
    if (c) { c.chase = true; c.ai.cruise = 130; }
    policeCd = stars >= 3 ? 2.2 : 3.5;
  }
  if (cars.filter(c => c.driver === 'boat').length < 3 && Math.random() < 0.2) { const b = spawnBoat(pick(['speedboat', 'sailboat', 'sailboat', 'rowboat']), 'boat'); if (b) b.ai.cruise = rand(110, 160); }
  // roadblocks ahead of you from three stars
  rbCd -= 0.25;
  if (heat >= 3 && player.car && !player.down && rbCd <= 0 && cars.filter(c => c.block).length < (heat >= 4 ? 4 : 2)) rbCd = placeRoadblock() ? (heat >= 4 ? 9 : 13) : 2;
}
// parked cars: the fixed ones (police, ambulances, fire trucks, tractors) always; the bays fill as you come near
// and are tidied away again once you are far off and nobody has touched them
function placeParked() {
  for (const s of parkSpots) { s.c = null; s.tried = false; }
  for (const s of BOAT_SPOTS) { s.c = null; s.tried = false; }
  for (const s of MIL_SPOTS) { s.c = null; s.tried = false; }
  for (const s of EGG_SPOTS) { s.c = null; s.tried = false; }
  for (const f of fixedParked) { const c = makeCar(f.type, f.x, f.y, f.a, null); c.parked = true; }
}
function fillSpots(force) {
  const near = viewRect(900), vis = viewRect(60), farS = viewRect(1300);
  const inR = (o, r) => o.x > r.x0 && o.x < r.x1 && o.y > r.y0 && o.y < r.y1;
  for (const spots of [parkSpots, BOAT_SPOTS, MIL_SPOTS, EGG_SPOTS]) for (const sp of spots) {
    if (sp.c) { if (!inR(sp, farS) && (sp.c.moved || sp.c.dead || sp.c.driver !== null || !cars.includes(sp.c))) { sp.c = null; sp.tried = false; } continue; }
    if (sp.tried || !inR(sp, near) || (!force && inR(sp, vis))) continue;
    sp.tried = true;
    if (Math.random() < (sp.mil || sp.always ? 1 : sp.boat ? 0.8 : 0.55) && !cars.some(c => d2(c.x, c.y, sp.x, sp.y) < 20 * 20)) {
      const c = makeCar(sp.type || pick(['compact', 'sedan', 'sedan', 'sports', 'taxi']), sp.x, sp.y, sp.a, null);
      if (sp.color) c.color = sp.color;
      if (sp.mil) c.mil = true;
      c.parked = true; c.spot = sp; sp.c = c;
      if (!sp.boat && !sp.mil) eggParked(c); // (round Mendel's abbey: his peas' colours)
    }
  }
}

// ============================================================ physics lab
const LAB_START = BRNO ? tileCenter(findTileNear(...geo(49.2067, 16.6089).map(Math.round), WALK)) : tileCenter(findTileNear(30, 21, WALK));
const LESSONS = [
  { key: 'superposition', title: 'Superposition',
    text: 'Get in the car next to you and drive. Press X to split it into three branches. Press V for slow motion: each branch shows its amplitude as a rotating arrow (a phasor), and the arrow\'s length squared is the probability. Press X again to collapse it.',
    setup() { labCar('sedan'); Q.psi = 99; }, check: () => labFlags.collapsed },
  { key: 'measurement', title: 'Measurement',
    text: 'A police cruiser is parked nearby (follow the arrow). Superpose, then drive into its line of sight. Its look counts as a measurement, so the superposition collapses on its own.',
    setup() {
      labCar('sports'); Q.psi = 99;
      const t = randomTile([ROAD], p => !bridge[p.ty * MW + p.tx] && !isHighway(p.tx, p.ty), { x: player.x, y: player.y, min: 350, max: 650 });
      if (t) { const c = makeCar('police', t.x, t.y, 0, 'police'); c.labStatic = true; c.mission = true; labCars.push(c); lab.target = c; }
    }, check: () => labFlags.observed },
  { key: 'uncertainty', title: 'Uncertainty',
    text: 'You are wanted. Break line of sight and turn a corner or two. The blue cloud is everything the police think they know about where you are. Grow it past 9 tiles (Δx in the HUD).',
    setup() { labCar('sports'); heat = 1.6; addHeat(0); }, check: () => heat >= 1 && belief.sig > 290 },
  { key: 'entangle', title: 'Entanglement',
    text: 'Two cyan cars are an entangled pair, and the second one is across town. Blow up the near one with your rockets (Space, on foot). Fire from a safe distance and keep the far twin on the minimap!',
    setup() { give('rocket', 6); player.weapon = 'rocket'; startMission('entangle'); }, check: () => labFlags.missionDone },
  { key: 'swap', title: 'Long-distance collapse',
    text: 'Walk up to the car next to you and press T to entangle with it. Its driver then heads across town. Wait a few seconds, then press T again: measuring the pair swaps your places, however far apart you are.',
    setup() { const c = labCar('sedan'); c.labGo = true; Q.ent = 99; }, check: () => labFlags.swaps >= 1 },
  { key: 'schrodinger', title: 'Schrödinger\'s briefcase',
    text: 'Pick up the case and deliver it. What\'s inside is undecided until delivery, and every hard knock raises P(bomb). Drive gently!',
    setup() { labCar('sedan'); startMission('deliver'); }, check: () => labFlags.missionDone },
  { key: 'bb84', title: 'Quantum key distribution',
    text: 'Carry the qubits to the marker. Eve (the dark purple car) will try to tap them by measuring. Let her get close or shake her off, then compare the error rate in the BB84 report at the end.',
    setup() { labCar('sports'); startMission('qkd'); }, check: () => labFlags.missionDone },
  { key: 'tweezer', title: 'Optical tweezers',
    text: 'Get in the car, then press G: the tweezer picks up the violet car behind you. Carry it to the marker without shaking it loose. Watch n̄ (top right): smooth starts, stops and turns keep it low.',
    setup() { const [me, q] = labPair(); lab.target = labGoal(me, 520); }, check: () => player.tow && player.tow.c.labQ && lab.target && d2(pp().x, pp().y, lab.target.x, lab.target.y) < 70 * 70 },
  { key: 'rydberg', title: 'The Rydberg gate',
    text: 'Pick up the violet car (G) and drive both into the violet zone ahead. When the global Rydberg pulse fires, every close pair inside gets a CZ gate: you come out entangled with the car you carry. A third car inside the blockade radius (the dashed circles) spoils it.',
    setup() {
      const [me] = labPair(), g = labGoal(me, 330);
      ZONES.push({ kind: 'ent', lab: true, x0: g.x - 90, y0: g.y - 90, x1: g.x + 90, y1: g.y + 90, period: 10, t: 10 });
      lab.target = g;
    }, check: () => labFlags.cz },
  { key: 'aod', title: 'Shuttling atoms',
    text: 'The console (follow the arrow, Enter) plans moves for an AOD: a grid of moving tweezers made of row and column tones. Solve the first three arrays.',
    setup() { const p = tileCenter(findTileNear(Math.floor(player.x / T), Math.floor(player.y / T) + 2, WALK)); const c = { x: p.x, y: p.y, lab: true }; CONSOLES.push(c); lab.target = c; aodOpen(0); },
    check: () => [0, 1, 2].every(i => aodSolved.has(i)) && state !== 'aod' },
];
// a car for you on the street, and an empty violet one where your tweezer reaches; a point some way down the street ahead
function labPair() {
  const me = labCar('sedan'), [bx, by] = towBase(me, { type: 'compact' }), q = makeCar('compact', bx, by, me.angle, null);
  Object.assign(q, { mission: true, parked: true, color: '#a970ff', labQ: true }); labCars.push(q);
  return [me, q];
}
function labGoal(me, d) {
  const p = nearestLanePt(me.x + Math.cos(me.angle) * d, me.y + Math.sin(me.angle) * d, null, 400);
  return p ? { x: p.x, y: p.y } : { x: me.x + Math.cos(me.angle) * d, y: me.y + Math.sin(me.angle) * d };
}
function labCar(type) {
  const p = nearestLanePt(player.x, player.y, null, 600);
  const c = makeCar(type, p ? p.x : player.x, p ? p.y : player.y, p ? p.h : 0, null);
  c.mission = true; labCars.push(c); return c;
}
function setupLesson(i) {
  if (mission) { failMission(''); }
  if (player.car) player.car.driver = null;
  for (const c of labCars) { const k = cars.indexOf(c); if (k >= 0) cars.splice(k, 1); }
  if (player.tow) dropTow('');
  for (let i = ZONES.length - 1; i >= 0; i--) if (ZONES[i].lab) ZONES.splice(i, 1);
  for (let i = CONSOLES.length - 1; i >= 0; i--) if (CONSOLES[i].lab) CONSOLES.splice(i, 1);
  aodSolved.clear();
  labCars = []; Q.branches = null; Q.slow = false; Q.bb = null; unlink(); Q.decoy = null; Q.decoyT = 0;
  Object.assign(player, { car: null, x: LAB_START.x, y: LAB_START.y, angle: 0, hp: 100, down: 0, bust: 0, weapons: {}, weapon: null });
  heat = 0; belief.sig = 0; ringing = null; ringCd = 1e9; overlay = null;
  labFlags = { collapsed: false, observed: false, swaps: 0, missionDone: false };
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
    lab.done = true; sfx.good(); if (lab.i === LESSONS.length - 1) ach('lab');
    msg(lab.i < LESSONS.length - 1 ? 'Lesson complete! Press N (or tap the lesson card) for the next one.' : 'Lab complete! Press N (or tap the card) to play the real game.', 8);
  }
  const tapCard = tapAt && labRect && tapAt.x > labRect.x && tapAt.x < labRect.x + labRect.w && tapAt.y > labRect.y && tapAt.y < labRect.y + labRect.h;
  if (lab.done && (hit('KeyN') || tapCard)) {
    if (lab.i + 1 < LESSONS.length) setupLesson(lab.i + 1);
    else { lab = null; newGame(); }
  }
}

// ============================================================ main update
// ============================================================ trams
const trainPool = R => { // (an operator's own trains; on a route shared with another operator's line, both)
  const own = TRAIN_MODELS.filter(q => q.op && q.op === R.op); if (own.length) return own;
  const mine = TRAIN_MODELS.filter(q => q.kind === R.kind && !q.op);
  return /(^|\/)R8(\/|$)/.test(R.refs || '') ? mine.concat(TRAIN_MODELS.filter(q => q.op === 'rj')) : mine;
};
function newTram(R, s, prev, m) {
  if (!m) { const pool = R.train ? trainPool(R) : TRAM_MODELS; let r = Math.random() * pool.reduce((a, q) => a + q.p, 0); m = pool.find(q => (r -= q.p) < 0) || pool[0]; }
  const len = m.secs.reduce((a, b) => a + b, 0) + m.gap * (m.secs.length - 1), hp = R.train ? 3000 : 1500;
  const t = { id: tramId++, R, s, v: 0, prev: prev || null, m, len, si: 0, li: 0, dwell: 0, doors: 0, bell: 0, wait: 0, hp, hp0: hp, dead: false, fire: 0,
    sec: [], cab: null, left: false, gone: false, blockBy: null, endT: 0, w: R.K.w, train: !!R.train, dside: 1 };
  tramIdx(t); placeTram(t); return t;
}
// a train at the end of its route goes on out of service (see R.cont)
function trainOn(t) {
  const R = t.R, [Q, sq] = R.cont, was = t.sec.map(S => [S.x, S.y]);
  t.s = sq + (t.s - R.len); t.R = Q; t.prev = null; t.ns = true; t.si = Q.stops.length; t.li = 0; t.endT = 0; t.pax = null;
  t.sh = null; placeTram(t); if (t.sec.length === was.length) { t.sh = t.sec.map((S, i) => [was[i][0] - S.x, was[i][1] - S.y]); t.shK = 1; placeTram(t); } // (it slides across over a few seconds)
}
const stopAt = (t, st) => t.train ? Math.min(st.s + t.len / 2, t.R.len - 3) : st.s; // (where its front comes to a stop: a train's middle by the platform's)
function tramIdx(t) { // the next stop and the next light from where the tram is
  t.si = t.ns ? -1 : t.R.stops.findIndex(q => stopAt(t, q) > t.s - 4); if (t.si < 0) t.si = t.R.stops.length; // (a train out of service stops nowhere)
  t.li = t.R.lights.findIndex(q => q.s > t.s - 2); if (t.li < 0) t.li = t.R.lights.length;
}
const tramAt = (t, s) => s < 0 && t.prev ? tramPt(t.prev, t.prev.len + s) : tramPt(t.R, s);
// each section a chord between its two bogies, so the tram bends round the curves
function placeTram(t) {
  let o = 0; t.sec.length = 0;
  for (const l of t.m.secs) {
    const sa = t.s - o, sb = sa - l, a = tramAt(t, sa), b = tramAt(t, sb), sm = (sa + sb) / 2;
    const on = sb >= 0 || !t.prev ? t.R : null; // (the run it is on, or null where it straddles two)
    t.sec.push({ x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, a: Math.atan2(a[1] - b[1], a[0] - b[0]), l, sa, sb, on,
      lv: sm < 0 && t.prev ? tramLv(t.prev, t.prev.len + sm) : tramLv(t.R, sm) });
    o += l + t.m.gap;
  }
  if (t.sh) { if (t.shK <= 0) t.sh = null; else t.sec.forEach((S, i) => { const e = t.shK * t.shK * (3 - 2 * t.shK); S.x += t.sh[i][0] * e; S.y += t.sh[i][1] * e; }); }
  const f = t.sec[0]; t.x = f.x; t.y = f.y; t.angle = f.a;
  if (t.cab) Object.assign(t.cab, { x: f.x, y: f.y, angle: f.a, speed: t.v, vx: Math.cos(f.a) * t.v, vy: Math.sin(f.a) * t.v, hp: t.hp });
}
// is the track clear for a new tram from s0 to s1 of route R?
function tramClear(R, s0, s1) {
  for (let s = s0; s <= s1; s += 30) {
    const [x, y] = tramPt(R, s);
    for (const t of trams) if (Math.abs(t.x - x) < 260 && Math.abs(t.y - y) < 260) for (const S of t.sec) if (d2(S.x, S.y, x, y) < (S.l / 2 + 30) ** 2) return false;
  }
  return true;
}
function initTrams() {
  trams = []; tramsFar = [];
  for (const R of TL) {
    const G = R.K.gap; R.spawnT = rand(0, G / R.K.vavg);
    for (let s = (R.train ? 1100 : 230) + rand(0, G); s < R.len - 30; s += G * rand(0.8, 1.2)) tramsFar.push(newTram(R, s));
  }
}
// Only the trams in your sector (round your view, and your friend's) are simulated in full: lights, stops, whatever
// is on the track. The others run on along their lines at a tram's average pace (stops and lights included) and are
// put on the track in full as they come into the sector, where it is clear. (The trains likewise, at theirs.)
const TRAM_IN = 900, TRAM_OUT = 1250; // px round the view: into the full simulation, and out of it again
function tramSectors(m) { return allCams().map(c => viewRect(m, c)); }
const inRects = (rs, x, y) => rs.some(v => x > v.x0 && x < v.x1 && y > v.y0 && y < v.y1);
// is a tram's track free of the trams already simulated, where it would stand?
function tramFree(t) {
  for (const o of trams) {
    if (Math.abs(o.x - t.x) > 420 || Math.abs(o.y - t.y) > 420) continue;
    for (const S of t.sec) for (const Q of o.sec) {
      if ((S.lv < 0) !== (Q.lv < 0)) continue;
      const ca = Math.cos(S.a) * S.l / 2, sa = Math.sin(S.a) * S.l / 2, cb = Math.cos(Q.a) * Q.l / 2, sb = Math.sin(Q.a) * Q.l / 2;
      if (segSegD([S.x + ca, S.y + sa], [S.x - ca, S.y - sa], [Q.x + cb, Q.y + sb], [Q.x - cb, Q.y - sb]) < (t.w + o.w) / 2 + 2) return false;
    }
  }
  return true;
}
function updateFarTrams(dt) {
  const into = tramSectors(TRAM_IN), seen = tramSectors(40);
  for (const t of tramsFar) {
    const R = t.R;
    if (!t.hold) t.s += R.K.vavg * dt;
    if (t.s > R.len) {
      if (R.next.length) { t.prev = R; t.R = TL[pick(R.next)]; t.s -= R.len; }
      else if (R.cont) { trainOn(t); continue; }
      else { t.gone = true; continue; } // (out over the map's edge, or into the depot at the terminus)
    }
    if (t.prev && t.s > t.len + 10) t.prev = null;
    if ((t.chk = (t.chk || 0) - dt) > 0) continue;
    t.chk = 0.25;
    const [x, y] = tramAt(t, t.s - 30); t.x = x; t.y = y;
    if (!inRects(into, x, y)) { t.hold = false; continue; }
    placeTram(t);
    if (!tramFree(t)) { if (t.hold && inRects(seen, x, y)) t.gone = true; else t.hold = true; continue; } // (wait out of sight for the track to clear)
    tramIdx(t); t.hold = false; t.dwell = 0; t.wait = 0; t.blockBy = null; t.endT = 0; t.pax = null;
    const k = Math.round(t.s / 8); t.v = Math.min(R.K.V * 0.75, k >= 0 && k < R.vmax.length ? R.vmax[k] : R.K.V);
    t.real = true; trams.push(t);
  }
  tramsFar = tramsFar.filter(t => !t.gone && !t.real);
  for (const t of trams) t.real = false;
}
// the capsules (axis and radius) of what might be on a tram's track, for its look ahead and for the cars' look ahead
function capsOf(o) {
  if (o.sec) return o.sec.filter(S => S.lv === 0).map(S => { const c = Math.cos(S.a) * S.l / 2, s = Math.sin(S.a) * S.l / 2; return [S.x + c, S.y + s, S.x - c, S.y - s, o.w / 2, o]; });
  if (o.type) { const [a, b, r] = carCircles(o); return [[a[0], a[1], b[0], b[1], r, o]]; }
  return [[o.x, o.y, o.x, o.y, 4, o]];
}
function segPtD(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, f = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
  return Math.hypot(px - ax - dx * f, py - ay - dy * f);
}
function segSegD(a, b, c, d) { // (two segments: [ax, ay], [bx, by] and [cx, cy], [dx, dy])
  const cr = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  if (cr(a, b, c) * cr(a, b, d) < 0 && cr(c, d, a) * cr(c, d, b) < 0) return 0;
  return Math.min(segPtD(a[0], a[1], c[0], c[1], d[0], d[1]), segPtD(b[0], b[1], c[0], c[1], d[0], d[1]), segPtD(c[0], c[1], a[0], a[1], b[0], b[1]), segPtD(d[0], d[1], a[0], a[1], b[0], b[1]));
}
// a car's look ahead: a tram across its way (the car waits for it, as Brno's rules say, also behind one at a stop)
function tramAhead(c, hx, hy, look) {
  const t0 = CT[c.type], a = [c.x + hx * (t0.l / 2 - 4), c.y + hy * (t0.l / 2 - 4)], b = [c.x + hx * look, c.y + hy * look];
  for (const t of trams) {
    if (t.cab || Math.abs(t.x - c.x) > 320 || Math.abs(t.y - c.y) > 320) continue;
    for (const [ax, ay, bx, by] of capsOf(t)) {
      if (segSegD(a, b, [ax, ay], [bx, by]) < t.w / 2 + t0.w / 2 - 1) {
        return t.px || (t.px = { tram: t, get x() { return t.x; }, get y() { return t.y; }, ai: { get queued() { return !(t.left || t.dead); }, dwell: 0 }, get type() { return t.left || t.dead ? 'tram' : undefined; }, get dead() { return t.left || t.dead; }, driver: null });
      }
    }
  }
  return null;
}
// the tram's look ahead along its track: how far its nose is from the first thing in the way (cars, people, other trams)
function tramLook(t, look, cands) {
  for (let d = 0; d <= look; d += 9) {
    const [x, y] = tramAt(t, t.s + d);
    for (const [ax, ay, bx, by, r, o] of cands) if (segPtD(x, y, ax, ay, bx, by) < t.w / 2 + r - 2) return [Math.max(0, d - r), o];
  }
  return null;
}
function tramBell(t) { if (t.bell <= 0 && onScreen(t.x, t.y, 120)) { if (t.train) { sfx.train(); t.bell = 4; } else { sfx.tram(); t.bell = 1.2; } } } // (a train sounds its horn)
function tramStopSay(t) { const st = t.R.stops[t.si]; if (t.cab && st) msg(`Next stop: ${st.name}`, 2.5); }
function updateTrams(dt, active) {
  if (!TL.length) return;
  // new trams where their routes come into the map (or start at a terminus, out of sight)
  for (const R of TL) {
    if (R.fed || (R.spawnT -= dt) > 0) continue;
    const [x, y] = tramPt(R, 0), t = newTram(R, 0), [ex, ey] = tramPt(R, t.len);
    if (!R.edgeIn && (onScreen(x, y, 300) || onScreen(ex, ey, 300))) { R.spawnT = 4; continue; }
    t.s = t.len + 2; tramIdx(t); placeTram(t);
    if (t.train && !R.edgeIn && R.stops.length && R.stops[0].s < t.s + 60) { t.si = 0; t.dwell = rand(15, 45); t.dT = 0; } // (a train starting at a station boards there first)
    const G = R.K.gap / R.K.vavg;
    if (!inRects(tramSectors(TRAM_IN), x, y)) { tramsFar.push(t); R.spawnT = G * rand(0.8, 1.2); }
    else if (tramClear(R, 0, t.len + 60)) { trams.push(t); R.spawnT = G * rand(0.8, 1.2); } else R.spawnT = 5;
  }
  updateFarTrams(dt);
  const outer = tramSectors(TRAM_OUT);
  const vs = allCams().map(c => viewRect(700, c)), near = o => vs.some(v => o.x > v.x0 && o.x < v.x1 && o.y > v.y0 && o.y < v.y1);
  const caps = []; // what is on the street near you: the cars, the people, you
  for (const c of active) if (c.lay !== 1 && c.lay !== 3) caps.push(...capsOf(c));
  for (const p of peds) if (!p.dead && near(p)) caps.push(capsOf(p)[0]);
  if (!player.car && !player.hidden && !player.down) caps.push([player.x, player.y, player.x, player.y, 4, player]);
  const tcaps = trams.map(capsOf);
  for (const t of trams) {
    t.bell -= dt; if (t.sh) t.shK -= dt / 5;
    const K = t.R.K;
    if (t.dead) { t.v = Math.max(0, t.v - K.ebrk * dt); if (t.fire > 0 && Math.random() < 0.5) { const S = pick(t.sec); addPart(S.x + rand(-20, 20), S.y + rand(-6, 6), rand(-10, 10), rand(-30, -10), 0.7, rand(3, 7), pick(['#ff9c2a', '#ffdf6b', '#ff5a1f', '#555']), 6, true); } }
    const isNear = near(t);
    if (t.cab && player.car !== t.cab) { t.cab = null; t.left = true; } // (you got off, or were wasted or busted aboard)
    const R = t.R;
    if (t.cab) { // you drive: ↑ go, ↓ brake (and slowly back), Space the bell
      const c = t.cab, up = keys.up, dn = keys.down;
      if (up) t.v = Math.min(t.train ? K.V * 1.25 : 150, t.v + (t.v < 0 ? K.ebrk : K.acc * (t.train ? 1.8 : 1.4)) * dt);
      else if (dn) t.v = t.v > 0 ? Math.max(0, t.v - K.ebrk * (t.train ? 1.5 : 1) * dt) : Math.max(t.train ? -30 : -40, t.v - (t.train ? 6 : 25) * dt);
      else t.v -= Math.sign(t.v) * Math.min(Math.abs(t.v), (t.train ? 1.5 : 8) * dt);
      if (keys.fire && t.bell <= 0) { if (t.train) { sfx.train(); t.bell = 1.5; scare(t.x, t.y, 260); } else { sfx.tram(); t.bell = 0.6; scare(t.x, t.y, 160); } }
      t.doors = Math.max(0, t.doors - dt * 2);
      c.brk = dn;
    } else if (t.left || t.dead) { t.v = Math.max(0, t.v - K.brk * dt); t.doors = Math.max(0, t.doors - dt); }
    else {
      let target = K.V;
      // round the bends ahead
      const brk = t.v * t.v / (2 * K.brk) + 24;
      for (let d = 0; d <= brk; d += 8) { const k = Math.round((t.s + d) / 8); if (k >= 0 && k < R.vmax.length) target = Math.min(target, Math.sqrt(R.vmax[k] ** 2 + 2 * K.brk * d)); }
      // the next stop: dwell there, doors open, people get on and off, then the bell and away
      const st = R.stops[t.si];
      if (st) {
        const d = stopAt(t, st) - t.s;
        if (t.dwell > 0) {
          t.dwell -= dt; target = 0; t.v = 0;
          t.doors = t.dwell > 0.8 ? Math.min(1, t.doors + dt * 2) : Math.max(0, t.doors - dt * 1.5);
          t.dT = (t.dT || 0) + dt;
          if (isNear) tramPax(t, st, dt);
          if (t.dwell <= 0) { t.si++; tramBell(t); t.wait = 0; t.pax = null; if (st.pl) st.pl.last = time; }
        } else if (d < 3 && t.v < 12) { t.dwell = t.train ? rand(12, 22) : rand(4.5, 7); t.dT = 0; t.v = 0; target = 0; }
        else if (d < -12) t.si++;
        else target = Math.min(target, Math.sqrt(2 * K.brk * Math.max(0, d - 1)));
      }
      if (!(t.dwell > 0)) t.doors = Math.max(0, t.doors - dt * 1.5);
      // red lights
      while (t.li < R.lights.length && R.lights[t.li].s < t.s - 2) t.li++;
      const L = R.lights[t.li];
      if (L && L.s - t.s < 200) {
        const ph = lightPhase(L.n), d = L.s - t.s;
        if (ph !== (L.g ? 2 : 0) && !(ph === (L.g ? 3 : 1) && t.v * t.v / (2 * K.brk) > d - 4)) target = Math.min(target, d < 2 ? 0 : Math.sqrt(2 * K.brk * Math.max(0, d - 2)));
      }
      // the end of the line: on into the route it becomes, or out over the map's edge, or wait at the terminus
      if (!R.next.length && !R.edgeOut && !(R.cont && t.si >= R.stops.length)) target = Math.min(target, Math.sqrt(2 * K.brk * Math.max(0, R.len - t.s - 2)));
      // whatever is on the track: other trams anywhere, and near you the cars and people too (a train sees them only
      // when it is too late: it brakes as hard as it can, and hits them)
      const look = t.v * t.v / (2 * K.brk) + 40, lookO = t.train ? Math.min(look, 240) : look;
      const mine = [];
      for (let j = 0; j < trams.length; j++) { const o = trams[j]; if (o !== t && Math.abs(o.x - t.x) < look + 240 + o.len && Math.abs(o.y - t.y) < look + 240 + o.len && !(o.blockBy === t && t.id < o.id)) mine.push(...tcaps[j]); }
      if (isNear) for (const q of caps) if (Math.abs(q[0] - t.x) < lookO + 60 && Math.abs(q[1] - t.y) < lookO + 60) mine.push(q);
      const hit = tramLook(t, look, mine);
      t.blockBy = null;
      if (hit) {
        const [d, o] = hit, free = d - 10;
        target = Math.min(target, free < 1 ? 0 : Math.sqrt(2 * K.brk * free));
        if (o.sec) t.blockBy = o;
        if (t.train && !o.sec && free < look) tramBell(t);
        if (t.v < 5 && free < 30) {
          t.wait += dt;
          if (t.wait > 1.2 && !o.sec) tramBell(t);
          if (t.wait > 7 && !o.sec && o !== player) target = 22; // (it won't budge: nudge it out of the way)
        }
        if (free < t.v * 0.25 && !o.sec && t.v > 40 && Math.random() < dt * 4) tramBell(t);
      } else t.wait = 0;
      // speed up gently, brake firmly (hard, if something came out right in front)
      if (t.v < target) t.v = Math.min(target, t.v + K.acc * dt);
      else t.v = Math.max(target, t.v - (t.v - target > (t.train ? 12 : 30) ? K.ebrk : K.brk) * dt);
    }
    t.s += t.v * dt;
    if (t.cab && t.s < t.len + 2 && !t.prev) { t.s = t.len + 2; t.v = Math.max(0, t.v); }
    if (t.s > R.len) {
      if (R.next.length) { t.prev = R; t.R = TL[pick(R.next)]; t.s -= t.prev.len; tramIdx(t); tramStopSay(t); }
      else if (t.cab && R.cont) { trainOn(t); t.ns = false; msg(`On along the ${t.R.ref} line's track.`, 2); }
      else if (t.cab) { t.s = R.len; if (t.v > 5) msg(R.edgeOut ? 'The line runs on out of town: this is as far as it goes.' : 'End of the line.', 2); t.v = 0; }
      else if (R.edgeOut) { t.gone = true; continue; }
      else if (R.cont) trainOn(t);
      else t.s = R.len;
    }
    if (t.prev && t.s > t.len + 10) t.prev = null;
    if (t.cab) { const si = t.si; while (t.si < R.stops.length && R.stops[t.si].s < t.s - 4) t.si++; if (t.si !== si) tramStopSay(t); }
    // at a terminus inside the map, or abandoned, or burnt out: gone once out of sight
    if (!t.cab && (t.left || t.dead || (!R.next.length && !R.edgeOut && t.s >= R.len - 4))) { t.endT += dt; if (t.endT > 12 && !near(t) && !t.fire) t.gone = true; }
    placeTram(t);
    if (isNear) tramCollide(t, active, dt);
    if (!t.cab && !(t.train ? t.sec.some(S => inRects(outer, S.x, S.y)) : inRects(outer, t.x, t.y))) { t.gone = true; if (!t.dead && !t.left && !t.fire) { t.chk = 0; t.hold = false; t.dwell = 0; tramsFar.push(t); } }
  }
  trams = trams.filter(t => !t.gone);
  for (const t of tramsFar) t.gone = false;
  updatePlatforms(dt);
}
// what a tram runs into is pushed out of its way: cars bounce off (and get dented), people are knocked down
function tramCollide(t, active, dt) {
  const src = t.cab ? 'player' : null;
  for (const S of t.sec) {
    if (S.lv) continue;
    const ca = Math.cos(S.a), sa = Math.sin(S.a), hl = S.l / 2, hw = t.w / 2, vx = ca * t.v, vy = sa * t.v;
    for (const c of active) {
      if (c.lay === 1 || c.lay === 3 || c.heldBy || Math.abs(c.x - S.x) > hl + 30 || Math.abs(c.y - S.y) > hl + 30) continue;
      for (const q of carCircles(c).slice(0, 2)) {
        const r = CT[c.type].w / 2 + 1, dx = q[0] - S.x, dy = q[1] - S.y, lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca;
        const cx = clamp(lx, -hl, hl), cy = clamp(ly, -hw, hw);
        let ex = lx - cx, ey = ly - cy, d = Math.hypot(ex, ey);
        if (d >= r) continue;
        if (t.wait > 7 && Math.abs(lx) >= hl - 1 && Math.abs(ly) > 1) { ex = 0; ey = Math.sign(ly); d = Math.abs(ly) < hw ? -(hw - Math.abs(ly)) : Math.abs(ly) - hw; } // (nudging: aside, not on ahead)
        else if (d < 1e-6) { if (hl - Math.abs(lx) < hw - Math.abs(ly)) { ex = Math.sign(lx) || 1; ey = 0; d = -(hl - Math.abs(lx)); } else { ex = 0; ey = Math.sign(ly) || 1; d = -(hw - Math.abs(ly)); } }
        else { ex /= d; ey /= d; }
        const nx = ex * ca - ey * sa, ny = ex * sa + ey * ca, ov = r - d;
        if (!carHitsWall(c, c.x + nx * ov, c.y + ny * ov, c.angle)) { c.x += nx * ov; c.y += ny * ov; }
        const vn = (c.vx - vx) * nx + (c.vy - vy) * ny;
        if (vn < 0) {
          c.vx -= 1.3 * vn * nx; c.vy -= 1.3 * vn * ny; c.speed = c.vx * Math.cos(c.angle) + c.vy * Math.sin(c.angle);
          if (-vn > 60) {
            damageCar(c, (-vn - 60) * (t.train ? 1.2 : 0.35), src); // (a train weighs a few hundred tonnes)
            if (onScreen(c.x, c.y)) sfx.crash();
            if (c === player.car) { shake = Math.min(1, -vn / 300); if (-vn > 130) hardKnock(); if (CT[c.type].bike && -vn > 120) bikeThrow(); }
            for (let k = 0; k < 4; k++) addPart(q[0] - nx * r, q[1] - ny * r, rand(-60, 60), rand(-60, 60), 0.3, 2, '#ffd27a');
            if (!t.cab && !t.dead) { t.v *= t.train ? 0.97 : 0.85; tramBell(t); }
          }
          if (c.driver === 'police' && t.cab) bumpedCop(c, { driver: 'player' });
        }
        break;
      }
    }
    const knock = (p, isPlayer) => {
      const dx = p.x - S.x, dy = p.y - S.y; if (dx * dx + dy * dy > (hl + 8) ** 2) return;
      const lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca; if (Math.abs(lx) > hl + 3 || Math.abs(ly) > hw + 4) return;
      const fast = Math.abs(t.v) > 45;
      if (fast && !isPlayer) { if (Math.abs(ly) < hw + 1.5) { killPed(p, src); if (onScreen(p.x, p.y)) sfx.splat(); } } // (only whom it really hits: those beside it are pushed aside)
      else if (fast) hurtPlayer(Math.abs(t.v) * 0.3);
      const side = Math.sign(ly) || 1, nx = p.x - sa * side * (hw + 5 - Math.abs(ly)) * 1, ny = p.y + ca * side * (hw + 5 - Math.abs(ly));
      if (!circleSolid(nx, ny, 3)) { p.x = nx; p.y = ny; }
    };
    for (const p of peds) if (!p.dead && !p.held && !(p.tp && (p.tp.k === 'board' || p.tp.k === 'off') && Math.abs(t.v) < 5)) knock(p, false); // (not those at its doors)
    if (!player.car && !player.hidden && !player.down) knock(player, true);
  }
  if (t.cab) for (const o of trams) { // (you can ram another tram, too)
    if (o === t || Math.abs(o.x - t.x) > 300 || Math.abs(o.y - t.y) > 300) continue;
    const [fx, fy] = tramAt(t, t.s + 2), [bx, by] = tramAt(t, t.s - t.len - 2);
    for (const [ax, ay, cx, cy] of capsOf(o)) for (const [px, py, dir] of [[fx, fy, 1], [bx, by, -1]]) {
      if (segPtD(px, py, ax, ay, cx, cy) < (t.w + o.w) / 2 - 2 && t.v * dir > 0) {
        const v = Math.abs(t.v); t.v = -t.v * 0.25; t.s += t.v * dt * 2;
        if (v > 50) { t.hp -= v * 0.8; o.hp -= v * 0.8; sfx.crash(); shake = Math.min(1, v / 250); hardKnock(); }
      }
    }
  }
  if (t.hp <= 0 && !t.dead) wreckTram(t, src);
}
function wreckTram(t, src) {
  t.dead = true; t.fire = 6; t.hp = 0;
  const S = t.sec[0]; explode(S.x, S.y, 80, src);
  if (src === 'player') { earn(300); addHeat(0.8); }
  if (t.cab && player.car === t.cab) killPlayer();
}
function damageTram(t, amt, src) {
  if (t.dead) return;
  t.hp -= amt;
  if (src === 'player' && !t.cab && copNear(t.x, t.y, 400)) addHeat(0.1);
  if (t.hp <= 0) wreckTram(t, src);
}
// a bullet at (x, y): did it hit a tram's side? (it stops there)
function tramHitAt(x, y) {
  for (const t of trams) {
    if (Math.abs(t.x - x) > 230 + t.len || Math.abs(t.y - y) > 230 + t.len) continue;
    for (const S of t.sec) {
      if (S.lv < 0) continue;
      const dx = x - S.x, dy = y - S.y, lx = dx * Math.cos(S.a) + dy * Math.sin(S.a), ly = -dx * Math.sin(S.a) + dy * Math.cos(S.a);
      if (Math.abs(lx) < S.l / 2 && Math.abs(ly) < t.w / 2) return t;
    }
  }
  return null;
}
// on foot by a tram's front: climb into the cab (its driver is shown the door)
function tramCabNear(x, y) {
  let best = null, bd = 40 * 40;
  for (const t of trams) {
    if (t.dead || Math.abs(t.v) > 30 || NET.role) continue;
    const S = t.sec[0];
    if (S.lv) continue;
    const cx = S.x + Math.cos(S.a) * (S.l / 2 - 12), cy = S.y + Math.sin(S.a) * (S.l / 2 - 12), d = d2(cx, cy, x, y);
    if (d < bd) { bd = d; best = t; }
  }
  return best && { t: best, d: bd };
}
function boardTram(t) {
  const S = t.sec[0], ca = Math.cos(S.a), sa = Math.sin(S.a), R = t.R;
  if (!t.left) { // the driver gets out at the front door, and runs
    const p = makePed(S.x + ca * (S.l / 2 - 14) - sa * (t.w / 2 + 8), S.y + sa * (S.l / 2 - 14) + ca * (t.w / 2 + 8), {});
    p.shirt = '#34495e'; p.pants = '#2c3e50'; p.flee = 6; p.fx = player.x; p.fy = player.y;
    if (copNear(t.x, t.y, 380)) addHeat(0.6);
    msg(t.train ? `You hijacked a train: ${R.ref} to ${R.dest}!` : `You hijacked a tram: line ${R.ref} to ${R.dest}!`, 3); ach(t.train ? 'train' : 'tram');
  }
  t.left = false; t.dwell = 0; t.wait = 0; t.endT = 0; t.doors = 0;
  t.cab = { type: t.train ? 'train' : 'tram', tram: t, x: t.x, y: t.y, angle: t.angle, vx: 0, vy: 0, speed: 0, hp: t.hp, driver: 'player', lay: 0, ai: {}, color: t.m.body, fire: 0 };
  player.car = t.cab; player.x = t.x; player.y = t.y;
  msg(`${touchOn() ? '▲' : '↑'} go, ${touchOn() ? '▼' : '↓'} brake (and back up), Space ${t.train ? 'sounds the horn' : 'rings the bell'}. ${touchOn() ? '⇄' : 'Enter'}: get off.${t.train ? ' A train is heavy: brake early.' : ''}`, 5);
  tramStopSay(t);
  if (t.train) sfx.train(); else sfx.tram();
}
// ---- drawing: each section's roof seen from above, its sides' windows, the joints' bellows, a pantograph on the
// middle section, the line's number up front; the doors on the right open at the stops
// the doors on a stopped tram's right-hand side: [x, y, outward x, outward y] (as drawn: two on a long section, one on a short)
const trainDoorX = (t, k, l) => t.m.loco && k === 0 ? [] : t.m.loco ? [-l * 0.42, l * 0.42] : [-l * 0.27, l * 0.27]; // (a coach's at its ends, a unit's two along each car)
function tramDoors(t) {
  const D = [], sd = t.train ? t.dside : 1;
  t.sec.forEach((S, k) => {
    if (S.lv) return;
    const ca = Math.cos(S.a), sa = Math.sin(S.a), nd = S.l >= 60 ? 2 : 1, o = (t.w / 2 + 3) * sd;
    const xs = t.train ? trainDoorX(t, k, S.l) : nd === 1 ? [0] : [-S.l * 0.24, S.l * 0.24];
    for (const dx of xs) D.push([S.x + ca * dx - sa * o, S.y + sa * dx + ca * o, -sa * sd, ca * sd]);
  });
  return D;
}
function tramPax(t, st, dt) {
  const pl = st.pl; if (!pl || t.cab) return;
  if (!t.pax || t.pax.st !== st) { t.pax = { st, off: Math.random() < 0.3 ? 0 : randi(1, Math.min(t.train ? 14 : 6, pl.cap)), offT: 0.3, on: false }; if (t.train) { if (!pl.spots) platSpots(pl); t.dside = pl.side; } }
  const X = t.pax; if (t.doors < 0.9) return; // (the doors open first)
  const D = tramDoors(t); if (!D.length) return;
  X.offT -= dt;
  if (X.off > 0 && X.offT <= 0) { // someone steps off and onto the platform
    X.off--; X.offT = rand(0.25, 0.7);
    const [x, y, ox, oy] = pick(D);
    if (peds.length < 240 && !circleSolid(x + ox * 6, y + oy * 6, 3)) { const p = makePed(x, y); p.angle = Math.atan2(oy, ox); p.tp = { k: 'off', pl, x: x + ox * rand(16, 26) + oy * rand(-8, 8), y: y + oy * rand(16, 26) - ox * rand(-8, 8), T: 0 }; }
  }
  if (!X.on && (X.off <= 0 || t.dT > 3)) { // and those waiting get on, each at the door nearest them
    X.on = true;
    for (const p of peds) if (p.tp && p.tp.pl === pl && (p.tp.k === 'wait' || p.tp.k === 'walk') && !p.dead && !p.gone) {
      let bi = -1, bd = (t.train ? 420 : 220) ** 2; D.forEach((q, i) => { const dd = d2(q[0], q[1], p.x, p.y); if (dd < bd) { bd = dd; bi = i; } });
      if (bi >= 0) Object.assign(p.tp, { k: 'board', t, door: bi, T: 0 });
    }
  }
  const busy = X.off > 0 || peds.some(p => p.tp && p.tp.k === 'board' && p.tp.t === t && !p.gone && !p.dead);
  if (busy && t.dT < (t.train ? 40 : 25)) t.dwell = Math.max(t.dwell, 1.2);
}
// the people on a platform: where they stand (along where the tram will stop, on the pavement beside the track)
function platSpots(pl) {
  pl.spots = [];
  if (pl.train) { // (on the platform as mapped, either side of the track, along where the train stands; else the paving beside it)
    const n = [0, 0];
    for (const pass of [0, 1]) {
      for (let s = pl.s - 240; s <= pl.s + 240; s += 12) {
        if (s < 0 || s > pl.R.len) continue;
        const [x, y, h] = tramPt(pl.R, s), nx = -Math.sin(h), ny = Math.cos(h);
        for (const sd of [1, -1]) for (let o = 18; o <= (pass ? 34 : 70); o += 4) {
          const px = x + nx * o * sd, py = y + ny * o * sd, tt = tileAtP(px, py);
          if ((pass ? (tt === WALK || tt === PLAZA) : onPlat(px, py)) && !circleSolid(px, py, 4)) {
            pl.spots.push({ x: px, y: py, a: Math.atan2(-ny * sd, -nx * sd), sd }); n[sd > 0 ? 0 : 1]++; break;
          }
        }
      }
      if (pl.spots.length) break;
    }
    pl.side = n[0] >= n[1] ? 1 : -1; pl.spots = pl.spots.filter(q => q.sd === pl.side);
    if (pl.spots.length) { const q = pl.spots[pl.spots.length >> 1]; pl.x = q.x; pl.y = q.y; }
    return;
  }
  for (let s = pl.s - 130; s <= pl.s - 4; s += 9) {
    const [x, y, h] = tramPt(pl.R, s), nx = -Math.sin(h), ny = Math.cos(h);
    for (let o = 22; o <= 50; o += 3) { // (clear of the tram's side, by a step)
      const px = x + nx * o, py = y + ny * o, tt = tileAtP(px, py);
      if ((tt === WALK || tt === PLAZA) && !circleSolid(px, py, 4)) { pl.spots.push({ x: px, y: py, a: Math.atan2(-ny, -nx) }); break; }
    }
  }
}
const platNear = (x, y) => TRAM_STOPS.find(pl => d2(pl.x, pl.y, x, y) < 60 * 60);
function platSpot(p, pl) { if (!pl.spots) platSpots(pl); const s = pl.spots.length ? pick(pl.spots) : { x: pl.x, y: pl.y, a: pl.a + Math.PI / 2 }, j = rand(-4, 4); return { x: s.x - Math.sin(s.a) * j, y: s.y + Math.cos(s.a) * j, a: s.a }; } // (spread along the platform, not toward the track)
// keep each platform near you peopled: more the longer since the last tram (up to what the stop gets), newcomers out of
// sight standing there already, in sight walking up from the street
let platT = 0;
function updatePlatforms(dt) {
  if ((platT -= dt) > 0 || !TRAM_STOPS.length) return;
  platT = 0.5;
  const near = tramSectors(450), vis = tramSectors(30);
  let n = peds.length;
  for (const pl of TRAM_STOPS) {
    if (!inRects(near, pl.x, pl.y)) continue;
    if (!pl.spots) platSpots(pl);
    if (!pl.spots.length) continue;
    let w = 0; for (const p of peds) if (p.tp && p.tp.pl === pl && !p.dead && !p.gone && p.tp.k !== 'off') w++;
    if (w >= Math.min(pl.cap, 1 + Math.floor((time - pl.last) / (pl.train ? 20 : 12))) || n > 230) continue;
    const s = platSpot(null, pl);
    if (!inRects(vis, s.x, s.y)) { const p = makePed(s.x, s.y); p.angle = s.a; p.tp = { k: 'wait', pl, x: s.x, y: s.y, a: s.a }; n++; continue; }
    if (Math.random() > 0.35) continue;
    let q = null, qd = 320 * 320; // (someone in the street nearby heads for the stop)
    for (const p of peds) if (!p.dead && !p.cop && !p.target && !p.vip && !p.tp && !p.car && !p.held && !(p.flee > 0) && !(p.idle > 0)) { const dd = d2(p.x, p.y, s.x, s.y); if (dd < qd) { qd = dd; q = p; } }
    if (q && pedGo(q, s.x, s.y)) q.tp = { k: 'go', pl, x: s.x, y: s.y, a: s.a };
  }
}
// a path over the pavements and crossings to the tile of (x, y), or false
function pedGo(p, x, y) {
  const sx = Math.floor(p.x / T), sy = Math.floor(p.y / T), g = Math.floor(y / T) * MW + Math.floor(x / T);
  if (!pedWalk(sx, sy)) return false;
  const st = ++bfsStamp, s0 = sy * MW + sx; let h = 0, tl = 0; bfsQ[tl++] = s0; bfsSeen[s0] = st; bfsPrev[s0] = -1; bfsD[s0] = 0;
  while (h < tl && bfsSeen[g] !== st) {
    const i = bfsQ[h++], d = bfsD[i]; if (d >= 45) continue;
    const cx = i % MW, cy = (i / MW) | 0;
    for (let k = 0; k < 4; k++) { const nx = cx + DX[k], ny = cy + DY[k], j = ny * MW + nx; if (nx < 0 || ny < 0 || nx >= MW || ny >= MH || bfsSeen[j] === st || !(pedWalk(nx, ny) || j === g)) continue; bfsSeen[j] = st; bfsPrev[j] = i; bfsD[j] = d + 1; bfsQ[tl++] = j; }
  }
  if (bfsSeen[g] !== st) return false;
  const path = []; for (let i = g; i !== s0 && i >= 0; i = bfsPrev[i]) path.push(i);
  path.reverse(); p.path = path; p.pi = 0; p.goalKind = 3; p.idle = 0; p.wait = null; p.chatWith = null;
  return true;
}
// a passenger: walking to a spot on the platform, waiting there (facing the track), to a door and in, or off and away
function platPed(p, dt) {
  const tp = p.tp;
  if (tp.k === 'go') return false; // (on the way there: the path does it)
  if (tp.k === 'wait') { p.moving = false; p.angle += wrapA(tp.a - p.angle) * Math.min(1, dt * 3); if (Math.random() < dt / 300) p.tp = null; return true; }
  let gx = tp.x, gy = tp.y;
  if (tp.k === 'board') {
    const t = tp.t, D = t && !t.dead && t.dwell > 0 && trams.includes(t) ? tramDoors(t) : null;
    if (!D || !D[tp.door]) { Object.assign(tp, platSpot(p, tp.pl), { k: 'walk', T: 0 }); return true; } // (missed it: back to wait for the next)
    gx = D[tp.door][0]; gy = D[tp.door][1];
  }
  const dx = gx - p.x, dy = gy - p.y, d = Math.hypot(dx, dy);
  if (d < 3) {
    if (tp.k === 'board') p.gone = true; // (aboard)
    else if (tp.k === 'off') { p.tp = null; p.path = null; p.planCd = 0; p.tx = -1; } // (and off about their business)
    else { tp.k = 'wait'; if (tp.a === undefined) tp.a = p.angle; }
    return true;
  }
  const sp = p.speed * (tp.k === 'board' ? 1.7 : 1.2), m = Math.min(d, sp * dt);
  const px = p.x, py = p.y; moveFree(p, dx / d * m / dt, dy / d * m / dt, dt, 3);
  p.angle = Math.atan2(dy, dx); p.moving = true; p.anim += dt * 10;
  tp.T = (tp.T || 0) + dt;
  if (tp.T > 9 || (Math.abs(p.x - px) + Math.abs(p.y - py) < 0.01 && tp.T > 2)) { // (stuck: give up)
    if (tp.k === 'board') p.gone = true; else if (tp.k === 'walk') { tp.k = 'wait'; tp.a = tp.a ?? p.angle; } else p.tp = null;
  }
  return true;
}
function drawTramSec(t, S, k) {
  const m = t.m, l = S.l, w = t.w, n = t.sec.length, end = k === 0 || k === n - 1;
  // where it runs into a tunnel, only the part still outside shows
  let x0 = -l / 2, x1 = l / 2;
  if (!S.on && S.lv < 0) return;
  if (S.on && S.on.lv.length) for (const [a, b, v] of S.on.lv) if (v < 0 && b > S.sb && a < S.sa) {
    const sm = (S.sa + S.sb) / 2;
    if (a > S.sb && a < S.sa) x1 = Math.min(x1, a - sm); // (the front is in)
    if (b > S.sb && b < S.sa) x0 = Math.max(x0, b - sm); // (the back is still in)
    if (a <= S.sb && b >= S.sa) return;
  }
  if (x1 - x0 < 2) return;
  ctx.save(); ctx.translate(S.x, S.y); ctx.rotate(S.a);
  if (x0 > -l / 2 || x1 < l / 2) { ctx.beginPath(); ctx.rect(x0, -w, x1 - x0, w * 2); ctx.clip(); }
  if (t.train) { drawTrainCar(t, S, k, l, w, n); ctx.restore(); return; }
  ctx.fillStyle = 'rgba(0,0,0,.35)'; rrect(-l / 2 + 2, -w / 2 + 3, l, w, 3);
  ctx.fillStyle = t.dead ? '#262626' : m.body; rrect(-l / 2, -w / 2, l, w, end ? 5 : 2);
  if (!t.dead) {
    ctx.fillStyle = m.roof; ctx.fillRect(-l / 2 + 3, -w / 2 + 3, l - 6, w - 6);
    if (m.band) { ctx.fillStyle = m.band; ctx.fillRect(-l / 2 + 1, -w / 2, l - 2, 1.4); ctx.fillRect(-l / 2 + 1, w / 2 - 1.4, l - 2, 1.4); }
    ctx.fillStyle = '#1b2631'; // (the side windows)
    for (let x = -l / 2 + 5; x < l / 2 - 9; x += 9) { ctx.fillRect(x, -w / 2 + 1.2, 6.5, 1.8); ctx.fillRect(x, w / 2 - 3, 6.5, 1.8); }
    if (k === 0) { ctx.fillRect(l / 2 - 5, -w / 2 + 2, 3.5, w - 4); }
    if (k === n - 1 && m.two) ctx.fillRect(-l / 2 + 1.5, -w / 2 + 2, 3.5, w - 4);
    ctx.fillStyle = 'rgba(70,74,80,.55)'; // (the roof's equipment)
    if (l > 40) { ctx.fillRect(-l * 0.18, -3.5, l * 0.16, 7); ctx.fillRect(l * 0.08, -2.5, l * 0.1, 5); }
    if (k === (n >> 1)) { // the pantograph: a folded diamond on its frame
      ctx.strokeStyle = '#3a3d42'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(0, -5); ctx.lineTo(9, 0); ctx.lineTo(0, 5); ctx.closePath(); ctx.stroke();
      ctx.fillStyle = '#2b2e33'; ctx.fillRect(-1, -w / 2 + 2, 2, w - 4);
    }
    if (k === 0) { // the line's number on the front, in its colour
      ctx.fillStyle = t.R.col; ctx.fillRect(l / 2 - 15, -4.5, 9, 9);
      ctx.save(); ctx.translate(l / 2 - 10.5, 0); ctx.rotate(-S.a); // (upright)
      ctx.fillStyle = '#fff'; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t.R.ref, 0, 0.5); ctx.textBaseline = 'alphabetic';
      ctx.restore();
    }
    if (t.doors > 0.05) { // the doors on the right, open: the lit vestibule, and the leaves slid out along the side
      const nd = l >= 60 ? 2 : 1;
      for (let i = 0; i < nd; i++) {
        const dx = nd === 1 ? 0 : (i ? l * 0.24 : -l * 0.24), o = 5 * t.doors;
        ctx.fillStyle = `rgba(255,232,160,${0.95 * t.doors})`; ctx.fillRect(dx - 5, w / 2 - 3, 10, 3.5);
        ctx.fillStyle = shade(m.body, 0.8); ctx.fillRect(dx - 5 - o, w / 2 - 0.5, 5, 1.6); ctx.fillRect(dx + o, w / 2 - 0.5, 5, 1.6);
      }
    }
    ctx.fillStyle = carGloss(l, w); rrect(-l / 2, -w / 2, l, w, end ? 5 : 2);
  }
  if (k === 0) { ctx.fillStyle = '#fff6c8'; ctx.fillRect(l / 2 - 1.5, -w / 2 + 1.5, 1.5, 2.5); ctx.fillRect(l / 2 - 1.5, w / 2 - 4, 1.5, 2.5); }
  if (k === n - 1) { ctx.fillStyle = t.v < 3 || (t.cab && keys.down) ? '#ff4040' : '#a31515'; ctx.fillRect(-l / 2, -w / 2 + 1.5, 1.5, 2.5); ctx.fillRect(-l / 2, w / 2 - 4, 1.5, 2.5); }
  ctx.restore();
}
// a train's car from above: the roof (its equipment, a pantograph or two), the side windows, the doors (open on the
// platform's side at a station), the cab's windscreen at either end, the line on the front of a unit
function drawTrainCar(t, S, k, l, w, n) {
  const m = t.m, loco = m.loco && k === 0, front = k === 0, back = k === n - 1, cab = loco || (!m.loco && (front || back)), r = cab ? 6 : 2.5;
  ctx.fillStyle = 'rgba(0,0,0,.35)'; rrect(-l / 2 + 2, -w / 2 + 3, l, w, r);
  const body = t.dead ? '#262626' : loco ? m.loco : m.body;
  ctx.fillStyle = body; rrect(-l / 2, -w / 2, l, w, r);
  if (!t.dead) {
    ctx.fillStyle = m.roof; ctx.fillRect(-l / 2 + (cab ? 8 : 3), -w / 2 + 3, l - (cab ? 16 : 6), w - 6);
    if (m.band) { ctx.fillStyle = m.band; ctx.fillRect(-l / 2 + 2, -w / 2, l - 4, 1.5); ctx.fillRect(-l / 2 + 2, w / 2 - 1.5, l - 4, 1.5); }
    ctx.fillStyle = 'rgba(0,0,0,.18)'; for (let x = -l / 2 + 12; x < l / 2 - 10; x += 14) ctx.fillRect(x, -w / 2 + 3.5, 1, w - 7); // (the roof's ribs)
    if (!loco) { // the side windows (two rows on a double-decker's flank)
      ctx.fillStyle = '#1b2631'; const step = m.loco ? 12 : 10;
      for (let x = -l / 2 + (cab ? 14 : 8); x < l / 2 - (cab ? 18 : 12); x += step) { ctx.fillRect(x, -w / 2 + 1.2, step - 3, 1.9); ctx.fillRect(x, w / 2 - 3.1, step - 3, 1.9); }
      if (m.dd) { ctx.fillStyle = 'rgba(27,38,49,.55)'; ctx.fillRect(-l / 2 + 16, -w / 2 + 3.4, l - 32, 1); ctx.fillRect(-l / 2 + 16, w / 2 - 4.4, l - 32, 1); }
    }
    ctx.fillStyle = 'rgba(70,74,80,.6)'; // (the roof's equipment)
    if (loco) { ctx.fillRect(-l * 0.12, -4, l * 0.24, 8); ctx.fillRect(-l * 0.4, -3, l * 0.12, 6); ctx.fillRect(l * 0.28, -3, l * 0.12, 6); }
    else if (!m.loco) { ctx.fillRect(-l * 0.3, -3.5, l * 0.14, 7); ctx.fillRect(l * 0.16, -3.5, l * 0.14, 7); }
    if (loco || (!m.loco && k === (n >> 1))) for (const px of loco ? [-l * 0.28, l * 0.28] : [0]) { // the pantographs
      ctx.strokeStyle = '#2f3237'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px - 11, 0); ctx.lineTo(px, -6); ctx.lineTo(px + 11, 0); ctx.lineTo(px, 6); ctx.closePath(); ctx.stroke();
      ctx.fillStyle = '#2b2e33'; ctx.fillRect(px - 1, -w / 2 + 2.5, 2, w - 5);
    }
    ctx.fillStyle = '#1b2631'; // the windscreens
    if (loco) { ctx.fillRect(l / 2 - 6, -w / 2 + 2.5, 3.5, w - 5); ctx.fillRect(-l / 2 + 2.5, -w / 2 + 2.5, 3.5, w - 5); }
    else if (cab) { if (front) ctx.fillRect(l / 2 - 7, -w / 2 + 2.5, 4.5, w - 5); if (back) ctx.fillRect(-l / 2 + 2.5, -w / 2 + 2.5, 4.5, w - 5); }
    for (const dx of trainDoorX(t, k, l)) { // the doors: shut, a darker panel each side; open, lit, on the platform's
      ctx.fillStyle = shade(body, 0.75); ctx.fillRect(dx - 4.5, -w / 2, 9, 1.4); ctx.fillRect(dx - 4.5, w / 2 - 1.4, 9, 1.4);
      if (t.doors > 0.05) { const y = t.dside > 0 ? w / 2 - 3 : -w / 2 - 0.5; ctx.fillStyle = `rgba(255,232,160,${0.95 * t.doors})`; ctx.fillRect(dx - 4.5, y, 9, 3.5); }
    }
    if (front && !m.loco && !t.ns) { // the line on the front (none when out of service)
      const tw = Math.max(9, t.R.ref.length * 4.6 + 3);
      ctx.fillStyle = t.R.col; ctx.fillRect(l / 2 - 9 - tw, -4.5, tw, 9);
      ctx.save(); ctx.translate(l / 2 - 9 - tw / 2, 0); ctx.rotate(-S.a);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t.R.ref, 0, 0.5); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      ctx.restore();
    }
    ctx.fillStyle = carGloss(l, w); rrect(-l / 2, -w / 2, l, w, r);
  }
  if (front) { ctx.fillStyle = '#fff6c8'; ctx.fillRect(l / 2 - 1.5, -w / 2 + 2, 1.5, 3); ctx.fillRect(l / 2 - 1.5, w / 2 - 5, 1.5, 3); ctx.fillRect(l / 2 - 1.5, -1.2, 1.5, 2.4); }
  if (back) { ctx.fillStyle = t.v < 3 ? '#ff4040' : '#a31515'; ctx.fillRect(-l / 2, -w / 2 + 2, 1.5, 3); ctx.fillRect(-l / 2, w / 2 - 5, 1.5, 3); }
}
function drawTrams(v, up) {
  for (const t of trams) {
    const mg = 240 + (t.train ? t.len : 0);
    if (t.x < v.x0 - mg || t.x > v.x1 + mg || t.y < v.y0 - mg || t.y > v.y1 + mg) continue;
    const S = t.sec;
    for (let k = 0; k < S.length - 1; k++) { // the bellows at the joints
      const A = S[k], B = S[k + 1];
      if ((A.lv > 0) !== !!up || A.lv < 0 || B.lv < 0) continue;
      const ax = A.x - Math.cos(A.a) * A.l / 2, ay = A.y - Math.sin(A.a) * A.l / 2, bx = B.x + Math.cos(B.a) * B.l / 2, by = B.y + Math.sin(B.a) * B.l / 2;
      ctx.save(); ctx.translate((ax + bx) / 2, (ay + by) / 2); ctx.rotate(Math.atan2(ay - by, ax - bx) || A.a);
      ctx.fillStyle = '#3b3f45'; ctx.fillRect(-t.m.gap / 2 - 3, -t.w / 2 + 2, t.m.gap + 6, t.w - 4);
      ctx.fillStyle = 'rgba(0,0,0,.35)'; for (let i = -1; i <= 1; i++) ctx.fillRect(i * 2 - 0.5, -t.w / 2 + 2, 1, t.w - 4);
      ctx.restore();
    }
    for (let k = S.length - 1; k >= 0; k--) if ((S[k].lv > 0) === !!up) drawTramSec(t, S[k], k); // (in a tunnel: only what is still outside)
  }
  if (!up) for (const p of TRAM_PORTALS) { // the tunnels' mouths
    if (p.x < v.x0 - 60 || p.x > v.x1 + 60 || p.y < v.y0 - 60 || p.y > v.y1 + 60) continue;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
    const h = (p.w || 26) / 2, g = ctx.createLinearGradient(0, 0, 34, 0); g.addColorStop(0, 'rgba(14,14,16,.92)'); g.addColorStop(1, 'rgba(14,14,16,.55)');
    ctx.fillStyle = g; ctx.fillRect(0, -h, 34, h * 2);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(-1, -h - 2, 6, h * 2 + 5);
    ctx.fillStyle = tint('#b5b1a7', 1); ctx.fillRect(-3, -h - 2, 5, h * 2 + 4);
    ctx.restore();
  }
}
// ============================================================ boats
// On the reservoir, and on the island's sea, lakes and river. The boats moored along the banks, and those anchored out
// on the water, can be taken like any car (Enter by one, from the bank); Enter at a bank gets you out, and out on the
// water Enter by another boat climbs across. A boat glides and drifts, a dinghy goes by the wind (never straight into
// it), and only water carries a boat. The police come after you in boats of their own, from the banks they shoot
// across the water, and at ★7 crossing the water to land unseen, far from where you put out, loses the army.
const BOAT_D = 2400; // px from where you put out to where you land, for the ★7 way out across the water
const BIG_WATER = 300; // tiles: a body of water this big has boats on it
let WIND = rand(TAU); // where the wind blows to (it veers slowly)
const boatOf = c => !!(c && CT[c.type] && CT[c.type].boat);
const seeThrough = (x, y) => tileAtP(x, y) === WATER; // (water hides nothing: looks and shots carry across it)
// each tile's body of water (0: dry land) and each body's size (not on the map's very edge: a boat can't leave the map,
// and the detailed map's outermost row is water where its land runs out)
const WB = new Uint16Array(MW * MH), WBN = [0];
for (let k0 = 0; k0 < MW * MH && WBN.length < 65000; k0++) {
  if (map[k0] !== WATER || WB[k0] || k0 < MW || k0 >= MW * (MH - 1) || k0 % MW === 0 || k0 % MW === MW - 1) continue;
  const id = WBN.length, st = [k0]; WB[k0] = id; let n = 0;
  while (st.length) {
    const i = st.pop(), x = i % MW, y = (i / MW) | 0; n++;
    for (let d = 0; d < 4; d++) { const nx = x + DX[d], ny = y + DY[d], j = ny * MW + nx; if (nx > 0 && ny > 0 && nx < MW - 1 && ny < MH - 1 && map[j] === WATER && !WB[j]) { WB[j] = id; st.push(j); } }
  }
  WBN.push(n);
}
const wbAt = (x, y) => { const tx = Math.floor(x / T), ty = Math.floor(y / T); return tx < 0 || ty < 0 || tx >= MW || ty >= MH ? 0 : WB[ty * MW + tx]; };
// the jetties stand out over the water: a boat goes round them
const JETTIES = [];
for (const p of props) {
  if (p.k !== 'jetty') continue;
  if (p.w) JETTIES.push({ x0: p.x - 3, y0: p.y - 3, x1: p.x + p.w * T + 3, y1: p.y + p.h * T + 3 });
  else { const ax = p.x + Math.cos(p.a) * 4, ay = p.y + Math.sin(p.a) * 4, bx = p.x + Math.cos(p.a) * 44, by = p.y + Math.sin(p.a) * 44; JETTIES.push({ ax, ay, bx, by, x0: Math.min(ax, bx) - 12, y0: Math.min(ay, by) - 12, x1: Math.max(ax, bx) + 12, y1: Math.max(ay, by) + 12 }); }
}
const boatSolid = (x, y) => {
  if (!wbAt(x, y)) return true;
  for (const j of JETTIES) if (x > j.x0 && x < j.x1 && y > j.y0 && y < j.y1 && (j.ax === undefined || segPtD(x, y, j.ax, j.ay, j.bx, j.by) < 10)) return true;
  return false;
};
function boatHits(c, x, y, a) { for (const [px, py] of carCorners(c, x, y, a)) if (boatSolid(px, py)) return true; return false; }
// where the boats are: the ones that were drawn out on the water, and more moored along the banks (thicker by the
// harbours and the fishing jetties); each is put there when you come near, like the cars in the parking bays
const BOAT_SPOTS = [];
// ---- the University of Defence (Kounicova): the army's vehicles parked in its yards,
// a T-72, a Pandur, Tatra trucks and Land Rovers, there for the taking. Drive one out and the army wants it back: four
// stars for the armour, three for the rest. Taken, they're back in their places by the time you return
const MIL_SPOTS = [];
if (BRNO) {
  const polys = B5 ? (BRNO_DATA.unis || []).filter(([n]) => n === 'Univerzita obrany').map(([, f]) => f.map(v => v * T)) : [];
  const [gx, gy] = geo(49.2075, 16.5948).map(v => v * T);
  let x0 = gx - 7 * T, y0 = gy - 7 * T, x1 = gx + 7 * T, y1 = gy + 7 * T;
  if (polys.length) { x0 = y0 = 1e9; x1 = y1 = -1e9; for (const f of polys) for (let k = 0; k < f.length; k += 2) { x0 = Math.min(x0, f[k]); x1 = Math.max(x1, f[k]); y0 = Math.min(y0, f[k + 1]); y1 = Math.max(y1, f[k + 1]); } }
  // (in the grounds: a tile the outline doesn't cross is in or out as a whole, so only those it crosses are tested point by point)
  const mx0 = Math.floor(x0 / T) - 1, my0 = Math.floor(y0 / T) - 1, mw = Math.floor(x1 / T) - mx0 + 2, mh = Math.floor(y1 / T) - my0 + 2;
  const gm = polys.length ? new Uint8Array(mw * mh) : null; // (0 out, 1 in, 2 the outline crosses it)
  if (gm) {
    for (const f of polys) for (let k = 0; k < f.length; k += 2) {
      const ax = f[k], ay = f[k + 1], bx = f[(k + 2) % f.length], by = f[(k + 3) % f.length], n = Math.ceil(Math.hypot(bx - ax, by - ay) / (T / 4)) + 1;
      for (let q = 0; q <= n; q++) { const i = Math.floor((ax + (bx - ax) * q / n) / T) - mx0, j = Math.floor((ay + (by - ay) * q / n) / T) - my0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (i + di >= 0 && j + dj >= 0 && i + di < mw && j + dj < mh) gm[(j + dj) * mw + i + di] = 2; }
    }
    for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) if (!gm[j * mw + i] && polys.some(r => inRings([r], (mx0 + i + 0.5) * T, (my0 + j + 0.5) * T))) gm[j * mw + i] = 1;
  }
  const inG = (x, y) => {
    if (!gm) return Math.hypot(x - gx, y - gy) < 7 * T;
    const i = Math.floor(x / T) - mx0, j = Math.floor(y / T) - my0;
    if (i < 0 || j < 0 || i >= mw || j >= mh) return false;
    const g = gm[j * mw + i]; return g === 2 ? polys.some(r => inRings([r], x, y)) : g === 1;
  };
  let a0 = 0, big = 0; // (lined up along the biggest building in the grounds)
  for (const b of buildings) if (b.fr && b.w * b.h > big && inG(b.x + b.w / 2, b.y + b.h / 2)) { big = b.w * b.h; a0 = Math.atan2(b.fr.s, b.fr.c); }
  // (each one clear of the others and of their ways out, facing open ground: the longest clear run ahead wins)
  const taken = []; // (the spots taken so far, with their turn worked out once and how far their box reaches)
  // (each tile's verdict for the tests below, worked out once: 0 fails anywhere in it, 1 passes anywhere in it, 2 depends
  // on the point, where a building's outline or the grounds' crosses it; ov: clear of walls and water, sv: and in the
  // grounds, off the road too)
  const ov = new Uint8Array(mw * mh), sv = new Uint8Array(mw * mh);
  for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) {
    const tx = mx0 + i, ty = my0 + j, w = j * mw + i;
    if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) { ov[w] = sv[w] = 2; continue; }
    const k = ty * MW + tx, t = map[k], pe = PE ? PE[k] : -1, g = gm ? gm[w] : 2;
    ov[w] = t === WATER ? 0 : pe >= 0 ? 2 : solidT(t) ? 0 : 1;
    sv[w] = g === 0 || t === ROAD || ov[w] === 0 ? 0 : ov[w] === 1 && g === 1 ? 1 : 2;
  }
  const cellOf = (px, py) => { const i = Math.floor(px / T) - mx0, j = Math.floor(py / T) - my0; return i < 0 || j < 0 || i >= mw || j >= mh ? -1 : j * mw + i; };
  const okHere = (px, py) => { const w = cellOf(px, py), v = w < 0 ? 2 : ov[w]; return v === 2 ? !solidAt(px, py) && tileAtP(px, py) !== WATER : v === 1; };
  const freeHere = (px, py) => { const w = cellOf(px, py), v = w < 0 ? 2 : sv[w]; return v === 2 ? inG(px, py) && !solidAt(px, py) && tileAtP(px, py) !== WATER && tileAtP(px, py) !== ROAD : v === 1; };
  // (a spot taken can only matter to a test point within its reach: the spots near enough to the whole test, found once)
  const near = (x, y, R) => taken.filter(o => (x - o.x) ** 2 + (y - o.y) ** 2 < (Math.sqrt(o.r2) + R) ** 2);
  const inSome = (L, px, py) => L.length > 0 && L.some(o => { const dx = px - o.x, dy = py - o.y; if (dx * dx + dy * dy > o.r2) return false; const u = dx * o.ca + dy * o.sa, v = -dx * o.sa + dy * o.ca; return u > -o.l / 2 - 9 && u < o.l / 2 + 70 && Math.abs(v) < o.w / 2 + 9; });
  const free = (x, y, a, t) => {
    const ca = Math.cos(a), sa = Math.sin(a), L = near(x, y, Math.hypot(t.l / 2 + 6, t.w / 2 + 6) + 1);
    for (let u = -t.l / 2 - 6; u <= t.l / 2 + 6; u += 5) for (let v = -t.w / 2 - 6; v <= t.w / 2 + 6; v += 5) {
      const px = x + ca * u - sa * v, py = y + sa * u + ca * v;
      if (!freeHere(px, py) || inSome(L, px, py)) return false;
    }
    return true;
  };
  const run = (x, y, a, t) => { // (how far it could drive straight on)
    const ca = Math.cos(a), sa = Math.sin(a), L = near(x, y, Math.hypot(t.l / 2 + 204, t.w / 2) + 1); let d = 0;
    for (; d < 200; d += 6) for (const v of [-t.w / 2, 0, t.w / 2]) { const px = x + ca * (t.l / 2 + 4 + d) - sa * v, py = y + sa * (t.l / 2 + 4 + d) + ca * v; if (!okHere(px, py) || inSome(L, px, py)) return d; }
    return d;
  };
  for (const type of ['tank', 'apc', 'armytruck', 'armytruck', 'jeep', 'jeep', 'jeep']) {
    let at = null, best = 50;
    for (let y = y0 + 12; y < y1 && best < 204; y += 8) for (let x = x0 + 12; x < x1 && best < 204; x += 8) for (let q = 0; q < 4 && best < 204; q++) { // (204: the longest run there is, so nothing after it can win)
      const a = a0 + q * Math.PI / 2;
      if (!free(x, y, a, CT[type])) continue;
      const r = run(x, y, a, CT[type]); if (r > best) { best = r; at = { x, y, a }; }
    }
    if (at) { MIL_SPOTS.push({ x: at.x, y: at.y, a: at.a, type, color: CT[type].colors[0], mil: true, c: null, tried: false });
      const t = CT[type]; taken.push({ x: at.x, y: at.y, ca: Math.cos(at.a), sa: Math.sin(at.a), l: t.l, w: t.w, r2: Math.hypot(t.l / 2 + 70, t.w / 2 + 9) ** 2 + 1 }); }
  }
}
{
  const fits = (type, x, y, a) => boatHits({ type }, x, y, a) ? null : { x, y, a, type, boat: true };
  for (let i = props.length - 1; i >= 0; i--) {
    const p = props[i]; if (p.k !== 'boat') continue;
    props.splice(i, 1);
    const s = fits(p.row ? 'rowboat' : srnd() < 0.3 ? 'sailboat' : 'speedboat', p.x, p.y, p.a);
    if (s) { s.color = p.row ? null : p.c; BOAT_SPOTS.push(s); }
  }
  const open = openTiles(), busy = BRNO ? [HARBOUR, ...FISH_SPOTS.filter(f => f.w === 'l').map(f => [f.x / T, f.y / T])] : [[87.4, 117], ...FISH_SPOTS.filter(f => f.w !== 'r').map(f => [f.x / T, f.y / T])];
  const used = new Set(BOAT_SPOTS.map(s => Math.floor(s.x / T / 3) + Math.floor(s.y / T / 3) * 4096));
  for (let k = 0; k < MW * MH; k++) {
    const id = WB[k]; if (!id || WBN[id] < BIG_WATER) continue;
    const tx = k % MW, ty = (k / MW) | 0;
    let d = 0; for (; d < 4; d++) { const j = (ty + DY[d]) * MW + tx + DX[d]; if (tx + DX[d] >= 0 && ty + DY[d] >= 0 && tx + DX[d] < MW && ty + DY[d] < MH && open[j] && !bridge[j] && map[j] !== WATER) break; }
    if (d === 4) continue; // (a bank you can walk to)
    const hb = busy.some(([bx, by]) => Math.abs(bx - tx) < 14 && Math.abs(by - ty) < 14);
    if (srnd() > (hb ? 0.3 : 0.022)) continue;
    const g = Math.floor(tx / 3) + Math.floor(ty / 3) * 4096; if (used.has(g) || used.has(g + 1) || used.has(g - 1) || used.has(g + 4096) || used.has(g - 4096)) continue;
    const type = srnd() < 0.35 ? 'rowboat' : srnd() < 0.3 ? 'sailboat' : 'speedboat', l = CT[type].l, cx = (tx + 0.5) * T, cy = (ty + 0.5) * T;
    const s = fits(type, cx - DX[d] * 4, cy - DY[d] * 4, Math.atan2(DX[d], -DY[d]) + (srnd() < 0.5 ? Math.PI : 0)) // (alongside the bank)
      || fits(type, cx - DX[d] * (l / 2 - 12), cy - DY[d] * (l / 2 - 12), Math.atan2(-DY[d], -DX[d])); // (or bow out)
    if (s) { BOAT_SPOTS.push(s); used.add(g); }
  }
}
// ---- handling: thrust (the wind's, for a dinghy), the water's drag, a rudder that needs way on, and little grip
function boatControls(c, throttle, steer, hand, dt) {
  const t = CT[c.type], sail = t.boat === 'sail';
  if (c.dead) { throttle = 0; steer = 0; }
  let top = t.max * (c.hp < t.hp * 0.3 ? 0.6 : 1);
  if (sail) { const rel = Math.abs(wrapA(c.angle - WIND)); top *= rel > 2.4 ? 0.08 : 0.55 + 0.45 * Math.sin(Math.min(rel, 2.4) * 0.75 + 0.2); } // (a run, a reach, close-hauled; head to wind it stalls)
  if (throttle > 0) c.speed += t.acc * dt * throttle * (c.speed < 0 ? 2 : 1 - 0.85 * clamp(c.speed / top, 0, 1.2));
  else if (throttle < 0) c.speed -= (c.speed > 0 ? t.acc * 1.1 : t.acc * 0.5) * dt;
  c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), (18 + Math.abs(c.speed) * (throttle ? 0.12 : 0.45)) * dt); // (the water's drag)
  if (c.speed > top) c.speed -= (c.speed - top) * Math.min(1, 1.5 * dt);
  c.speed = clamp(c.speed, -t.max * 0.3, t.max);
  c.brk = throttle < 0 && c.speed > 0;
  const pa = c.angle, way = clamp(Math.abs(c.speed) / 60, 0.25, 1) * (c.speed >= -2 ? 1 : -1); // (a rudder needs water flowing past it)
  c.angle += steer * t.turn * way * (c.driver === 'player' ? 1 / (1 + Math.max(0, c.speed) / 500) : 1) * dt;
  if (boatHits(c, c.x, c.y, c.angle)) c.angle = pa;
  const hx = Math.cos(c.angle), hy = Math.sin(c.angle), k = Math.min(1, 1.9 * dt); // (it drifts on through a turn)
  c.vx += (hx * c.speed - c.vx) * k; c.vy += (hy * c.speed - c.vy) * k;
  c.bob = (c.bob || rand(TAU)) + dt * (1.2 + Math.abs(c.speed) / 120);
  if (Math.abs(c.speed) > 70 && Math.random() < 0.4 && onScreen(c.x, c.y, 60)) { // spray off the bow
    const s = Math.random() < 0.5 ? 1 : -1;
    addPart(c.x + hx * t.l * 0.3 - hy * t.w * 0.5 * s, c.y + hy * t.l * 0.3 + hx * t.w * 0.5 * s, -hy * s * 30 + rand(-10, 10), hx * s * 30 + rand(-10, 10), 0.35, rand(0.8, 1.6), 'rgba(245,250,255,.75)', 1.5);
  }
}
// the nearest spot on a bank by a boat (to get out there), or null
function boatShore(c) {
  const t = CT[c.type]; let best = null, bd = 1e9;
  for (let i = 0; i < 16; i++) {
    const a = c.angle + i / 16 * TAU, ca = Math.cos(a), sa = Math.sin(a), e = Math.abs(Math.cos(i / 16 * TAU)) * t.l / 2 + Math.abs(Math.sin(i / 16 * TAU)) * t.w / 2;
    for (let r = e + 6; r < e + 40; r += 5) {
      const x = c.x + ca * r, y = c.y + sa * r;
      if (seeThrough(x, y)) continue;
      if (!circleSolid(x, y, 5) && r < bd) { bd = r; best = { x, y }; }
      break;
    }
  }
  return best;
}
// a spot on the water near (x, y), or on land near it (for whoever comes after you across the other element)
function nearOf(x, y, water, R = 14) {
  const tx0 = Math.floor(x / T), ty0 = Math.floor(y / T), open = water ? null : openTiles();
  for (let r = 0; r <= R; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const tx = tx0 + dx, ty = ty0 + dy; if (tx < 1 || ty < 1 || tx >= MW - 1 || ty >= MH - 1) continue;
    const k = ty * MW + tx;
    if (water ? WB[k] && WBN[WB[k]] >= 20 : open[k]) return { x: (tx + 0.5) * T, y: (ty + 0.5) * T };
  }
  return null;
}
// a boat on the water out of sight round you: on the body of water you're on, or on any big one near
function spawnBoat(type, driver) {
  const v = viewRect(48), o = viewRect(520), me = boatOf(player.car) ? wbAt(player.car.x, player.car.y) : 0;
  for (let i = 0; i < 30; i++) {
    const x = rand(o.x0, o.x1), y = rand(o.y0, o.y1);
    if (x > v.x0 && x < v.x1 && y > v.y0 && y < v.y1) continue;
    const id = wbAt(x, y); if (!id || WBN[id] < BIG_WATER || (me && id !== me)) continue;
    const a = rand(TAU); if (boatHits({ type }, x, y, a) || cars.some(c => d2(c.x, c.y, x, y) < 60 * 60)) continue;
    const c = makeCar(type, x, y, a, driver); c.speed = 30; return c;
  }
  return null;
}
// is the water clear on a straight line from the boat to (x, y)? (with room for its beam)
function waterLine(c, x, y) {
  const d = Math.hypot(x - c.x, y - c.y), n = Math.ceil(d / 14), w = CT[c.type].w / 2 + 6, ux = (x - c.x) / (d || 1), uy = (y - c.y) / (d || 1);
  for (let i = 1; i <= n; i++) { const px = c.x + ux * d * i / n, py = c.y + uy * d * i / n; if (boatSolid(px, py) || boatSolid(px - uy * w, py + ux * w) || boatSolid(px + uy * w, py - ux * w)) return false; }
  return true;
}
// steer for (x, y), feeling ahead for the bank: turn away from whichever side is shoaling first
function boatSteer(c, x, y, sp, dt) {
  const look = 34 + Math.abs(c.speed) * 0.7, h = c.angle;
  const free = a => { for (let r = 16; r <= look; r += 12) if (boatSolid(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r)) return r; return 1e9; };
  const f0 = free(h);
  if (f0 < look) {
    const fl = free(h - 0.6), fr = free(h + 0.6);
    const tx = c.x + Math.cos(h + (fr >= fl ? 1.1 : -1.1)) * 60, ty = c.y + Math.sin(h + (fr >= fl ? 1.1 : -1.1)) * 60;
    driveToward(c, tx, ty, Math.min(sp, f0 < 40 ? 30 : sp * 0.6), dt); return;
  }
  driveToward(c, x, y, sp, dt);
}
// ---- the boats out on the water: cruise from one clear stretch to another
function aiBoat(c, dt) {
  const a = c.ai, t = CT[c.type];
  a.wt = (a.wt || 0) - dt;
  if (a.gx === undefined || a.wt <= 0 || d2(c.x, c.y, a.gx, a.gy) < 60 * 60) {
    a.wt = 25; a.gx = c.x - Math.cos(c.angle) * 200; a.gy = c.y - Math.sin(c.angle) * 200; // (nowhere to go: come about)
    for (let i = 0; i < 12; i++) {
      const g = c.angle + rand(-1.6, 1.6), r = rand(250, 800), x = c.x + Math.cos(g) * r, y = c.y + Math.sin(g) * r;
      if (wbAt(x, y) === wbAt(c.x, c.y) && waterLine(c, x, y)) { a.gx = x; a.gy = y; break; }
    }
  }
  boatSteer(c, a.gx, a.gy, t.boat === 'motor' ? Math.min(a.cruise * 1.3, 200) : t.boat === 'row' ? 40 : 80, dt);
}
// ---- police boats: they come for you across the water by the shortest way round (one flow field for them all), ram
// you from two stars, shoot from three; when you're ashore they wait off the bank nearest you
const boatFlow = { f: null, gx: 0, gy: 0, t: 0 };
function aiBoatCop(c, dt) {
  const stars = Math.floor(heat);
  if (heat < 1 || player.down || player.hidden) { c.chase = false; aiBoat(c, dt); return; }
  c.chase = true;
  const P0 = copTarget(c), tp = P0 === pp() ? player : NET.guest.player, onW = boatOf(tp.car), d = Math.hypot(P0.x - c.x, P0.y - c.y);
  const see = !Q.branches && d < 380 && los(c.x, c.y, P0.x, P0.y);
  c.shootCd -= dt;
  if (see && stars >= 3 && d < 300 && c.shootCd <= 0) { c.burst = (c.burst || 0) + 1; c.shootCd = stars >= 7 ? (c.burst % 5 ? 0.14 : 1.4) : rand(0.9, 1.4); enemyShot(c.x, c.y, P0.x, P0.y, 8, 0.12); }
  if (onW && see && waterLine(c, P0.x, P0.y)) {
    if (stars < 2) { const pc = tp.car, ha = Math.atan2(pc.vy, pc.vx) || pc.angle, tx = pc.x - Math.cos(ha) * 80, ty = pc.y - Math.sin(ha) * 80; boatSteer(c, tx, ty, clamp(Math.hypot(pc.vx, pc.vy) + Math.hypot(tx - c.x, ty - c.y) - 20, 0, 260), dt); return; }
    const pc = tp.car; boatSteer(c, P0.x + pc.vx * 0.35, P0.y + pc.vy * 0.35, 340, dt); return; // (ram)
  }
  // the goal on the water: you, or the water off the bank nearest you
  let g = onW ? P0 : (c.wg && d2(c.wgFor[0], c.wgFor[1], P0.x, P0.y) < 80 * 80 ? c.wg : null);
  if (!g) { g = nearOf(P0.x, P0.y, true, 12); c.wg = g; c.wgFor = [P0.x, P0.y]; }
  if (!g) { aiBoat(c, dt); return; }
  if (!onW && d2(c.x, c.y, g.x, g.y) < 50 * 50) { applyControls(c, c.speed > 5 ? -1 : 0, 0, false, dt); return; } // (wait off the bank)
  if (waterLine(c, g.x, g.y)) { boatSteer(c, g.x, g.y, onW ? 320 : 220, dt); return; }
  const B = boatFlow;
  if (!B.f) B.f = new Int16Array(MW * MH);
  if (time - B.t > 1 || d2(B.gx, B.gy, g.x, g.y) > 64 * 64) { computeFlowInto(B.f, g.x, g.y, undefined, undefined, true); B.gx = g.x; B.gy = g.y; B.t = time; }
  let bx = Math.floor(c.x / T), by = Math.floor(c.y / T);
  for (let s = 0; s < 3; s++) { let bv = flowAt(B.f, bx, by), nb = -1; for (let k = 0; k < 4; k++) { const v = flowAt(B.f, bx + DX[k], by + DY[k]); if (v < bv) { bv = v; nb = k; } } if (nb < 0) break; bx += DX[nb]; by += DY[nb]; }
  boatSteer(c, (bx + 0.5) * T, (by + 0.5) * T, onW ? 300 : 220, dt);
}
// ---- landing: at ★7, ashore unseen and far enough from where you put out, the army has lost you
function boatLanded() {
  const s = player.putOut; player.putOut = null;
  if (Math.floor(heat) !== 7 || !s || lab) return;
  const d = Math.hypot(player.x - s.x, player.y - s.y);
  if (d < BOAT_D) { msg(`Too close to where you put out: they'll look here (${Math.round(d / BOAT_D * 100)}% of the way).`, 2.5); return; }
  if (belief.seen || copSees(player.x, player.y)) { msg('They saw you come ashore.', 2.5); return; }
  heat = 5.5; HQ.lv = 5; Object.assign(belief, { seen: false, seeT: 1, sig: Math.max(belief.sig, 320) });
  bigText('ACROSS THE WATER', '#9ccc65', 3, 'Ashore unseen, far from where they lost you: five stars'); sfx.good(); ach('ashore');
}
// ---- drawing: the wake behind it, the hull rocking on the water, and what each kind carries
function drawBoat(c) {
  const t = CT[c.type], l = t.l, w = t.w, k = t.boat, al = clamp(1 - (c.sink || 0) / 6, 0, 1);
  if (al <= 0) return;
  // the wake: where the stern has been, two arms of foam spreading out from it and churned water between them, fading
  const tr = c.trail || (c.trail = []), last = tr[tr.length - 1], ca = Math.cos(c.angle), sa = Math.sin(c.angle), sx = c.x - ca * l * 0.45, sy = c.y - sa * l * 0.45;
  if (!last || d2(last[0], last[1], sx, sy) > 18 * 18 || time - last[2] > 0.5) { tr.push([sx, sy, time, Math.abs(c.speed), c.angle]); if (tr.length > 40) tr.shift(); }
  const pts = tr.concat([[sx, sy, time, Math.abs(c.speed), c.angle]]);
  ctx.lineCap = 'round';
  for (let i = pts.length - 1; i > 0; i--) {
    const [x0, y0, t0, , a0] = pts[i - 1], [x1, y1, t1, sp, a1] = pts[i], age = time - t0, f = 1 - age / 2.8;
    if (f <= 0) break;
    if (sp < 20 || Math.hypot(x1 - x0, y1 - y0) > 60) continue;
    const s = Math.min(1, sp / 200), r0 = w * 0.45 + age * 20 * s, r1 = w * 0.45 + (time - t1) * 20 * s;
    ctx.strokeStyle = `rgba(232,244,252,${0.2 * f * s})`; ctx.lineWidth = w * 0.8 + age * 14 * s;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = `rgba(245,250,255,${0.6 * f * s})`; ctx.lineWidth = 1.4 + age * 1.6;
    for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x0 - Math.sin(a0) * r0 * sd, y0 + Math.cos(a0) * r0 * sd); ctx.lineTo(x1 - Math.sin(a1) * r1 * sd, y1 + Math.cos(a1) * r1 * sd); ctx.stroke(); }
  }
  ctx.lineCap = 'butt';
  const bob = c.bob || 0, dead = c.dead;
  ctx.save(); ctx.globalAlpha = al; ctx.translate(c.x, c.y + Math.sin(bob) * 0.8); ctx.rotate(c.angle + Math.sin(bob * 0.8) * 0.035);
  ctx.fillStyle = 'rgba(0,20,40,.28)'; ctx.beginPath(); ctx.ellipse(2.5, 3.5, l / 2 + 1, w / 2 + 1.5, 0, 0, TAU); ctx.fill();
  const hull = () => { ctx.beginPath(); ctx.moveTo(l / 2, 0); ctx.quadraticCurveTo(l / 5, -w / 2 - 0.5, -l / 2, -w / 2 + 1); ctx.lineTo(-l / 2, w / 2 - 1); ctx.quadraticCurveTo(l / 5, w / 2 + 0.5, l / 2, 0); };
  const col = dead ? '#2b2b2b' : k === 'row' ? (c.color || '#a0522d') : c.color;
  ctx.fillStyle = col; hull(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 0.8; ctx.stroke();
  if (!dead) {
    if (k === 'row') {
      ctx.fillStyle = '#8a6a44'; ctx.beginPath(); ctx.ellipse(-1, 0, l * 0.36, w * 0.3, 0, 0, TAU); ctx.fill(); // (inside the hull)
      ctx.fillStyle = '#6a4e30'; for (const x of [-l * 0.22, l * 0.08]) ctx.fillRect(x - 1, -w / 2 + 1.5, 2, w - 3); // (the thwarts)
      if (c.driver) { // the oars, pulling
        const sw = Math.abs(c.speed) > 4 ? Math.sin(time * 5.5) * 0.55 : 0.25;
        ctx.strokeStyle = '#d9c09a'; ctx.lineWidth = 1.2;
        for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-l * 0.05, sd * w * 0.35); ctx.lineTo(-l * 0.05 - Math.sin(sw) * 9, sd * (w / 2 + 8)); ctx.stroke(); }
      }
    } else if (k === 'sail') {
      ctx.fillStyle = '#e9e2d0'; ctx.beginPath(); ctx.ellipse(-1, 0, l * 0.34, w * 0.28, 0, 0, TAU); ctx.fill();
    } else {
      ctx.fillStyle = c.type === 'policeboat' ? '#dfe6ee' : '#e8e0d0'; ctx.fillRect(-l / 2 + 3, -w / 2 + 2.5, l * 0.62, w - 5); // (the deck)
      if (c.type === 'policeboat') { ctx.fillStyle = '#1f3a93'; ctx.fillRect(-l / 2 + 1, -w / 2 + 0.6, l * 0.8, 1.3); ctx.fillRect(-l / 2 + 1, w / 2 - 1.9, l * 0.8, 1.3); }
      ctx.fillStyle = '#5a6a78'; ctx.fillRect(-l * 0.06, -w / 2 + 2.5, l * 0.2, w - 5); // (the windscreen and the cockpit)
      ctx.fillStyle = '#2b2f36'; ctx.fillRect(-l / 2 - 3, -2, 4, 4); // (the outboard)
      if (c.type === 'policeboat' && c.chase) { const on = Math.sin(time * 14) > 0; ctx.fillStyle = on ? '#ff2a2a' : '#2a6bff'; ctx.fillRect(l * 0.02, -3.5, 2.5, 3); ctx.fillStyle = on ? '#2a6bff' : '#ff2a2a'; ctx.fillRect(l * 0.02, 0.5, 2.5, 3); }
    }
    if (c.driver) { // whoever is at the helm
      const hx = k === 'row' ? -l * 0.05 : k === 'sail' ? -l * 0.3 : -l * 0.2;
      ctx.fillStyle = c.driver === 'player' ? player.shirt : c.type === 'policeboat' ? '#1f3a93' : '#445'; ctx.beginPath(); ctx.ellipse(hx, 0, 3, 4.2, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = c.driver === 'player' ? '#222' : '#e0c8a8'; ctx.beginPath(); ctx.arc(hx + 0.5, 0, 2.6, 0, TAU); ctx.fill();
    }
    if (k === 'sail') { // the mast, the boom swung out to leeward, and the sail filling
      const rel = wrapA(WIND - c.angle), boom = -Math.sign(Math.sin(rel) || 1) * clamp((Math.PI - Math.abs(rel)) * 0.5, 0.15, 1.3), bl = l * 0.55, mx = l * 0.12;
      ctx.save(); ctx.translate(mx, 0); ctx.rotate(Math.PI + boom);
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.moveTo(3, 4); ctx.quadraticCurveTo(bl * 0.5 + 3, 4 + Math.sign(boom) * 7, bl + 3, 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = dead ? '#555' : '#fbfaf4'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(bl * 0.5, -Math.sign(boom || 1) * 7, bl, 0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#7a6a55'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(bl, 0); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#5a4a38'; ctx.beginPath(); ctx.arc(mx, 0, 1.6, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#e53935'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(mx, 0); ctx.lineTo(mx + Math.cos(rel) * 7, Math.sin(rel) * 7); ctx.stroke(); // (the masthead pennant shows the wind)
    }
    ctx.fillStyle = carGloss(l, w); hull(); ctx.fill();
  }
  ctx.restore();
  if (dead && c.sink > 0 && Math.random() < 0.3) addPart(c.x + rand(-l / 3, l / 3), c.y + rand(-w / 3, w / 3), 0, 0, 0.6, rand(1.5, 3), 'rgba(220,235,245,.6)', 2); // (bubbles)
}
// ============================================================ wanted levels 6 to 10: past the tank, the state itself
// ★6 the Measurement Bureau: black vans whose detectors collapse superposition and break entanglement near them, a drone
// that keeps you measured (watched, the police's guess never spreads: the Zeno effect), spike strips. ★7 a state of
// emergency: the army's checkpoints at bridges and tunnel mouths, armoured carriers, an attack helicopter's rockets; it
// ends when you lie low for a minute. ★8 the Observer: a measurement sweep every 20 s, no X or T anywhere, jets
// strafing; the way out is quantum teleportation between the entangled payphones. ★9 demolition: bulldozers through
// the buildings, wrecking crews that bring down the one you hide behind, burning tankers across the junctions ahead, a
// wrecking ball; hide in a pedestrian zone. ★10 air assault: kamikaze drone swarms, paratroopers, squads roped down from
// helicopters, a P.L.A.N.C.K. Helicarrier's searchlight and the heroes it sends down; go to ground through two tunnels, unseen at their portals.
// Each comes when you outlast the one below in plain sight (40 s seen) or raise the stakes; from 7 up a level doesn't
// fade by itself: only its way out ends it.
const WL = [null, null, null, null, null, null,
  { name: 'THE MEASUREMENT BUREAU', col: '#b388ff', sub: 'Detector vans collapse X and T · a drone keeps you measured · spike strips' },
  { name: 'STATE OF EMERGENCY', col: '#9ccc65', sub: 'Army checkpoints, armoured carriers, rockets · lie low 60 s unseen, or land unseen across the water' },
  { name: 'THE OBSERVER', col: '#4dd0e1', sub: 'Sweeps every 20 s, jets, no X or T · the entangled payphones (cyan) teleport you out' },
  { name: 'DEMOLITION', col: '#ffb74d', sub: 'Bulldozers, falling buildings, burning tankers · hide 45 s in a pedestrian zone' },
  { name: 'AIR ASSAULT', col: '#ef5350', sub: 'Drones, paratroopers, a P.L.A.N.C.K. Helicarrier and its heroes · go to ground: two tunnels, unseen at the portals' }];
const DRONE_Z = 0.25, KAMI_Z = 0.12, CARRIER_Z = 0.9, JET_Z = 0.55, ROPE_Z = 0.4;
// (plain data only: the host sends it to a co-op guest as it is)
function hqNew() { return { lv: 0, det: false, drone: null, droneCd: 0, spikes: [], spikeCd: 6, strikes: [], rocketCd: 4, jet: null, jetCd: 8,
  sweepT: 12, sweep: 0, low: 0, plaza: 0, hideT: 0, tun: [], tunIn: null, pl: 0, rubble: [], tankerCd: 10, crane: null, craneCd: 14,
  kami: [], kamiCd: 5, paras: [], paraCd: 8, rope: null, ropeCd: 12, carrier: null, bell: null, heroes: [], beat: [] }; }

// the entangled pair of payphones: at the Atom Array Lab, and at FIT BUT in Brno (or, elsewhere, the booth farthest off)
function eprPhones() {
  if (EPR) return EPR;
  if (!ATOM_LAB) return (EPR = []);
  const c = ATOM_LAB.con, A = tileCenter(findTileNear(Math.floor(c.x / T) + 1, Math.floor(c.y / T) + 3, WALK));
  const B = FIT ? tileCenter(findTileNear(Math.floor(FIT.x / T), Math.floor(FIT.y / T) + 4, WALK)) : BOOTHS.reduce((a, b) => d2(a.x, a.y, A.x, A.y) >= d2(b.x, b.y, A.x, A.y) ? a : b);
  return (EPR = [A, { x: B.x, y: B.y }]);
}
// out of sight from above: in a tunnel, under an overpass, under a tree's crown
function hiddenAbove(P) {
  const c = player.car;
  if (c && c.lay === 1) return true;
  const k = Math.floor(P.y / T) * MW + Math.floor(P.x / T);
  if (ovT[k] && !(c && (c.lay === 3 || c.lay === 4))) return true;
  return !!nearTrees(P.x, P.y, 0, t => d2(t.x, t.y, P.x, P.y) < t.r * t.r);
}
// a street point ahead of you, just out of sight (where the state's next surprise waits)
function aheadLanePt(min, max, test) {
  const P0 = pp(), sp = Math.hypot(P0.vx || 0, P0.vy || 0); if (sp < 50) return null;
  const dir = Math.atan2(P0.vy, P0.vx), v = viewRect(0), reach = Math.abs(Math.cos(dir)) * (v.x1 - v.x0) / 2 + Math.abs(Math.sin(dir)) * (v.y1 - v.y0) / 2;
  for (let i = 0; i < 14; i++) {
    const a = dir + rand(-0.35, 0.35), dist = reach + rand(min, max);
    const p = nearestLanePt(P0.x + Math.cos(a) * dist, P0.y + Math.sin(a) * dist, null, 140);
    if (p && !p.L.hw && !p.L.e.over && !p.L.e.tunnel && !onScreen(p.x, p.y, 40) && (!test || test(p))) return p;
  }
  return null;
}
const kerbToKerb = p => { const nx = -Math.sin(p.h), ny = Math.cos(p.h); return { x: p.x - nx * p.L.off, y: p.y - ny * p.L.off, nx, ny, w: p.L.e.wd }; };
function soldier(x, y, post) {
  const p = makePed(x, y, { cop: true, swat: true }); p.army = true; p.shirt = '#556b2f'; p.pants = '#3b4a1f'; if (post) p.post = true; return p;
}
// the bridges and tunnel mouths near you: where the army sets its checkpoints
let BRIDGE_SPOTS = null;
function checkpointSpots(P0, dir, reach) {
  if (!BRIDGE_SPOTS) {
    BRIDGE_SPOTS = []; const seen = new Set();
    for (const e of EDGES) if (!e.over && !e.tunnel) for (let s = 0; s < e.len; s += 48) {
      const [x, y] = edgePt(e, s), k = Math.floor(y / T) * MW + Math.floor(x / T), g = Math.floor(x / 300) + Math.floor(y / 300) * 4096;
      if (bridge[k] && !seen.has(g)) { seen.add(g); BRIDGE_SPOTS.push([x, y]); }
    }
    for (const r of RAMPS) BRIDGE_SPOTS.push(r.pts[0]);
  }
  const out = [];
  for (const [x, y] of BRIDGE_SPOTS) {
    const dx = x - P0.x, dy = y - P0.y, d = Math.hypot(dx, dy);
    if (d < reach + 60 || d > reach + 800 || Math.abs(wrapA(Math.atan2(dy, dx) - dir)) > 0.6 || onScreen(x, y, 60)) continue;
    const p = nearestLanePt(x, y, null, 90); if (p && !p.L.hw && !p.L.e.over && !p.L.e.tunnel) out.push(p);
  }
  return out.sort(() => Math.random() - 0.5);
}
function placeSpikes() {
  const p = aheadLanePt(80, 420); if (!p) return false;
  const k = kerbToKerb(p);
  HQ.spikes.push({ x: k.x, y: k.y, a: p.h, w: k.w, t: 45 });
  return true;
}
function placeTanker() { // jack-knifed across a junction ahead, burning
  const p = aheadLanePt(60, 520); if (!p) return false;
  let n = null, bd = 220 * 220;
  for (const q of NODES) if (q.edges && q.edges.length >= 3 && !q.over) { const d = d2(q.x, q.y, p.x, p.y); if (d < bd && !onScreen(q.x, q.y, 40)) { bd = d; n = q; } }
  if (!n) return false;
  const c = makeCar('tanker', n.x, n.y, p.h + 1.1, null);
  if (carHitsWall(c, c.x, c.y, c.angle)) { cars.splice(cars.indexOf(c), 1); return false; }
  c.burn = 22; c.jk = -0.9; c.mission = true; tankerCars.push(c);
  msg('A fuel tanker jack-knifed across the junction ahead. It\'s burning.', 3);
  return true;
}
function placeCrane() { // a wrecking ball swinging over a main junction ahead
  const P0 = pp(); let n = null, bd = 1e12;
  for (const q of LIGHT_NODES) { const d = d2(q.x, q.y, P0.x, P0.y); if (d > 260 * 260 && d < 1100 * 1100 && d < bd && !onScreen(q.x, q.y, 20)) { bd = d; n = q; } }
  if (!n) return false;
  HQ.crane = { x: n.x, y: n.y, a: rand(TAU), r: 66, t: 80 };
  HQ.rubble.push({ x: n.x, y: n.y, r: 13, crane: 1, s: 0 }); // (the crane's own tower: in the way)
  return true;
}
// the building you hid behind comes down: rubble across the way, dust, and they know roughly where you are
function collapseNear(P0) {
  let wa = null;
  for (let i = 0; i < 16 && wa === null; i++) { const a = i * TAU / 16; if (solidAt(P0.x + Math.cos(a) * 40, P0.y + Math.sin(a) * 40)) wa = a; }
  if (wa === null) return;
  const away = wa + Math.PI;
  for (let i = 0; i < 7; i++) {
    const a = away + rand(-1.3, 1.3), d = rand(10, 75), x = P0.x + Math.cos(wa) * 26 + Math.cos(a) * d, y = P0.y + Math.sin(wa) * 26 + Math.sin(a) * d;
    if (!solidAt(x, y)) HQ.rubble.push({ x, y, r: rand(10, 19), s: (Math.random() * 1e6) | 0 });
  }
  if (HQ.rubble.length > 40) HQ.rubble.splice(0, HQ.rubble.length - 40);
  for (let i = 0; i < 40; i++) { const a = rand(TAU), s = rand(20, 120); addPart(P0.x + Math.cos(wa) * 30, P0.y + Math.sin(wa) * 30, Math.cos(a) * s, Math.sin(a) * s, rand(1.5, 3), rand(8, 16), pick(['#9e9a92', '#8a857c', '#b5b0a6']), 16, true); }
  shake = 1; if (AC) sfx.boom();
  if (player.car) damageCar(player.car, 90); else hurtPlayer(18);
  Object.assign(belief, { x: P0.x, y: P0.y, sig: 90 });
  msg('The wrecking crew brought the building down on you!', 3);
}
function rubbleHit(c, x, y, a) { // (a bulldozer shoves the rubble aside instead)
  const t = CT[c.type], R = t.l / 2 + 20;
  for (let i = 0; i < HQ.rubble.length; i++) {
    const r = HQ.rubble[i]; if (Math.abs(r.x - x) > R + r.r || Math.abs(r.y - y) > R + r.r) continue;
    for (const [px, py] of carCorners(c, x, y, a)) if (d2(px, py, r.x, r.y) < r.r * r.r) {
      if (c.type === 'dozer' && !r.crane) { HQ.rubble.splice(i, 1); for (let k = 0; k < 8; k++) addPart(r.x, r.y, rand(-60, 60), rand(-60, 60), 1, 6, '#9e9a92', 8, true); return false; }
      return true;
    }
  }
  return false;
}
function dozerSolid(x, y) { // a bulldozer goes through buildings: only water and rock stop it
  const tx = Math.floor(x / T), ty = Math.floor(y / T); if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return true;
  const k = ty * MW + tx; let t = map[k]; if (t === BUILD) t = GU && GU[k] ? GU[k] - 1 : GRASS; // (only the detailed map keeps the ground under its buildings)
  return t === WATER || t === ROCK;
}
// ★8's way out: the Bell measurement at an entangled payphone (Space as the arrow crosses the window, two of three)
function startBell(i) {
  if (player.isGuest) { msg('The payphones are entangled with the host\'s line only.', 2); return; }
  HQ.bell = { i, t: 0, round: 0, hits: 0, ang: rand(TAU), win: rand(TAU), fw: true };
  msg('Bell measurement: press Space (●) as the arrow crosses the green window. Two out of three.', 4);
}
function updateBell(dt) {
  const b = HQ.bell; b.t += dt; b.ang = (b.ang + dt * (3.1 + b.round * 0.7)) % TAU; player.moving = false;
  const press = keys.fire && !b.fw; b.fw = !!keys.fire;
  if (press) {
    const ok = Math.abs(wrapA(b.ang - b.win)) < 0.36;
    if (ok) b.hits++; b.round++; b.win = rand(TAU); ok ? sfx.pickup() : sfx.punch();
    if (b.hits >= 2) { teleport(b.i); return; }
    if (b.round - b.hits >= 2) { HQ.bell = null; msg('Decoherence: the pair is spoiled. Try again.', 2.5); sfx.bad(); return; }
  }
  if (b.t > 14 || hit('Enter', 'Escape')) { HQ.bell = null; msg('The entanglement decohered.', 2); }
}
function teleport(i) {
  const E = eprPhones(), from = E[i], to = E[1 - i];
  HQ.bell = null; player.x = to.x; player.y = to.y; player.angle = faceOpen(to.x, to.y);
  heat = 3.5; lastCrime = time; HQ.lv = 3;
  Object.assign(belief, { x: from.x, y: from.y, vx: 0, vy: 0, sig: 0, seen: false, seeT: 1 });
  qburst(from.x, from.y, '#3cf0ff'); qburst(to.x, to.y, '#3cf0ff'); sfx.swap();
  bigText('TELEPORTED', '#3cf0ff', 3.5, 'They measured the wrong qubit: three stars'); ach('teleport');
  note('teleport');
}
function updateWanted(dt) {
  if (lab) return;
  const P0 = pp(), pc = player.car;
  if (caller && time >= caller.t) { const c = caller; caller = null; if (!c.p.dead && !player.down && heat < 1) { addHeat(1.05 - heat); msg('A witness called the police.', 3); sfx.bad(); } }
  // outlast a level in plain sight and the next one comes
  if (heat >= 5 && heat < 10.99 && belief.seen && !player.down) heat = Math.min(10.99, heat + dt / 40);
  const stars = Math.floor(heat);
  if (stars !== HQ.lv) {
    if (stars > HQ.lv && stars >= 6) { const L = WL[stars]; bigText(`${stars} STARS: ${L.name}`, L.col, 4, L.sub); sfx.bad(); ach('wl' + stars); }
    if (stars >= 8 && HQ.lv < 8) note('teleport');
    HQ.lv = stars; HQ.low = HQ.plaza = HQ.hideT = 0; HQ.tun = []; HQ.tunIn = null;
  }
  const hid = hiddenAbove(P0);
  // ★6: the detectors, the drone, the spike strips
  HQ.det = stars >= 6 && cars.some(c => c.type === 'bureau' && c.driver === 'police' && !c.dead && d2(c.x, c.y, P0.x, P0.y) < 260 * 260);
  if (HQ.det || stars >= 8) {
    if (Q.branches) collapse(stars >= 8 ? 'the Observer measured you' : 'the Bureau\'s detector measured you');
    if (Q.link) { unlink(); msg('Your entanglement is broken: they measured your twin.', 2.5); }
  }
  HQ.droneCd -= dt;
  if (stars >= 6 && !HQ.drone && HQ.droneCd <= 0 && !player.down) {
    const a = rand(TAU); HQ.drone = { x: P0.x + Math.cos(a) * 900, y: P0.y + Math.sin(a) * 900, vx: 0, vy: 0, a: 0, rot: 0, hp: 60, lock: false, fall: 0 };
    msg('A Bureau drone is on you. Lose it under trees or an overpass, in a tunnel, or shoot it down.', 3.5);
  }
  const d = HQ.drone;
  if (d) {
    d.rot += dt * 40;
    if (d.fall) { d.fall += dt; d.x += d.vx * dt; d.y += d.vy * dt; d.vx *= 0.97; d.vy *= 0.97; if (d.fall > 1.1) { explode(d.x, d.y, 26, 'player'); HQ.drone = null; HQ.droneCd = 25; } }
    else if (stars < 6 || player.down) { d.lock = false; const a = Math.atan2(d.y - P0.y, d.x - P0.x); d.x += Math.cos(a) * 320 * dt; d.y += Math.sin(a) * 320 * dt; if (!onScreen(d.x, d.y, 500)) HQ.drone = null; }
    else {
      d.lock = !hid && d2(d.x, d.y, P0.x, P0.y) < 300 * 300;
      const r = Math.min(belief.sig, 300) * 0.7, tx = d.lock ? P0.x + (P0.vx || 0) * 0.3 : belief.x + Math.cos(time * 0.8) * r, ty = d.lock ? P0.y + (P0.vy || 0) * 0.3 : belief.y + Math.sin(time * 1.1) * r;
      const dx = tx - d.x, dy = ty - d.y, dd = Math.hypot(dx, dy) || 1, sp = Math.min(d.lock ? 430 : 300, dd * 2.2);
      d.vx += (dx / dd * sp - d.vx) * Math.min(1, dt * 2.5); d.vy += (dy / dd * sp - d.vy) * Math.min(1, dt * 2.5);
      d.x += d.vx * dt; d.y += d.vy * dt; if (Math.hypot(d.vx, d.vy) > 30) d.a = Math.atan2(d.vy, d.vx);
    }
  }
  HQ.spikeCd -= dt;
  if (stars >= 6 && pc && !pc.tram && HQ.spikeCd <= 0) HQ.spikeCd = placeSpikes() ? 16 : 3;
  for (const s of HQ.spikes) s.t -= dt;
  HQ.spikes = HQ.spikes.filter(s => s.t > 0 && d2(s.x, s.y, P0.x, P0.y) < 2500 * 2500);
  for (const c of [pc, NET.guest && NET.guest.player.car]) if (c && !c.spiked && !c.tram && !CT[c.type].bike && !CT[c.type].boat && Math.abs(c.speed) > 20) for (const s of HQ.spikes) {
    const dx = c.x - s.x, dy = c.y - s.y, al = dx * Math.cos(s.a) + dy * Math.sin(s.a), ac = -dx * Math.sin(s.a) + dy * Math.cos(s.a);
    if (Math.abs(al) < CT[c.type].l / 2 && Math.abs(ac) < s.w / 2) { c.spiked = true; sfx.snap(); if (c === pc) msg('Spike strip! Your tyres are shredded: half speed until you swap cars.', 3); break; }
  }
  // ★7: lie low a minute, unseen
  if (stars >= 7 && !belief.seen) HQ.low += dt; else HQ.low = 0;
  if (stars === 7 && HQ.low >= 60) { heat = 5.5; bigText('EMERGENCY LIFTED', '#9ccc65', 3, 'They lost you: five stars'); sfx.good(); ach('lowkey'); }
  for (const s of HQ.strikes) { s.t -= dt; if (s.t <= 0 && !s.cancel) explode(s.x, s.y, s.r, 'cop'); }
  HQ.strikes = HQ.strikes.filter(s => s.t > 0 && !s.cancel);
  // ★8: the sweeps, and jets from 8 up
  if (stars === 8) {
    HQ.sweepT -= dt;
    if (HQ.sweepT <= 0) { HQ.sweepT = 20; HQ.sweep = 1.6; revealPlayer(); belief.seen = true; belief.seeT = 0.3; msg('MEASUREMENT SWEEP: they know exactly where you are.', 2.5); sfx.collapse(); }
  } else HQ.sweepT = 12;
  HQ.sweep = Math.max(0, HQ.sweep - dt);
  HQ.jetCd -= dt;
  if (stars >= 8 && !HQ.jet && HQ.jetCd <= 0 && !player.down) {
    const mv = Math.hypot(P0.vx || 0, P0.vy || 0) > 40, a = mv && Math.random() < 0.6 ? Math.atan2(P0.vy, P0.vx) + pick([0, Math.PI]) + rand(-0.3, 0.3) : rand(TAU);
    HQ.jet = { tx: P0.x + (P0.vx || 0) * 2.2, ty: P0.y + (P0.vy || 0) * 2.2, a, t: 0, warn: 2.4, done: 0, x: 0, y: 0 };
    HQ.jetCd = stars >= 9 ? 12 : 15; sfx.siren();
  }
  const j = HQ.jet;
  if (j) {
    j.t += dt;
    const along = -1500 + (j.t - j.warn) * 1900, ca = Math.cos(j.a), sa = Math.sin(j.a);
    j.x = j.tx + ca * along; j.y = j.ty + sa * along;
    if (j.t > j.warn) {
      if (!j.snd) { j.snd = 1; sfx.jet(); }
      while (j.done <= 10 && j.done * 96 - 480 < along) { const s = j.done * 96 - 480; explode(j.tx + ca * s, j.ty + sa * s, 34, 'cop'); j.done++; }
      if (along > 1500) HQ.jet = null;
    }
  }
  // ★9: wrecking crews, burning tankers, the wrecking ball, and the way out
  if (stars >= 9) {
    let wall = false; for (let i = 0; i < 8 && !wall; i++) wall = solidAt(P0.x + Math.cos(i * TAU / 8) * 42, P0.y + Math.sin(i * TAU / 8) * 42);
    HQ.hideT = !belief.seen && wall ? HQ.hideT + dt : Math.max(Math.min(0, HQ.hideT), HQ.hideT - dt);
    if (HQ.hideT > 9) { HQ.hideT = -6; collapseNear(P0); }
    HQ.tankerCd -= dt; if (pc && HQ.tankerCd <= 0) HQ.tankerCd = placeTanker() ? 22 : 3;
    HQ.craneCd -= dt; if (!HQ.crane && HQ.craneCd <= 0) HQ.craneCd = placeCrane() ? 50 : 5;
  }
  if (stars === 9) {
    if (tileAtP(P0.x, P0.y) === PLAZA && !belief.seen) HQ.plaza += dt; else if (belief.seen) HQ.plaza = 0;
    if (HQ.plaza >= 45) { heat = 5.5; bigText('DEMOLITION CALLED OFF', '#ffb74d', 3, 'They lost you in the crowd: five stars'); sfx.good(); ach('crowd'); }
  }
  for (const c of tankerCars) {
    if (c.dead || !cars.includes(c)) { c.gone = true; c.mission = false; continue; }
    c.burn -= dt;
    if (Math.random() < 0.8 && onScreen(c.x, c.y, 80)) addPart(c.x + rand(-22, 22), c.y + rand(-22, 22), rand(-15, 15), rand(-40, -10), 0.8, rand(5, 10), pick(['#ff9c2a', '#ffdf6b', '#ff5a1f', '#555']), 10, true);
    for (const o of cars) if (o !== c && !o.dead && d2(o.x, o.y, c.x, c.y) < 52 * 52) damageCar(o, 40 * dt);
    if (!player.car && d2(player.x, player.y, c.x, c.y) < 46 * 46) hurtPlayer(30 * dt);
    if (c.burn <= 0) { c.gone = true; c.mission = false; explodeCar(c); explode(c.x, c.y, 110, null); }
  }
  tankerCars = tankerCars.filter(c => !c.gone);
  const cr = HQ.crane;
  if (cr) {
    cr.t -= dt; cr.a += dt * 1.5;
    const bx = cr.x + Math.cos(cr.a) * cr.r, by = cr.y + Math.sin(cr.a) * cr.r, tx = -Math.sin(cr.a), ty = Math.cos(cr.a);
    for (const c of cars) if (!c.dead && c.lay !== 1 && c.lay !== 3 && Math.abs(c.x - bx) < 40 && Math.abs(c.y - by) < 40 && d2(c.x, c.y, bx, by) < (14 + CT[c.type].w / 2) ** 2 && !(c.wbT > time)) {
      c.wbT = time + 0.7; c.vx += tx * 380 + (c.x - bx) * 4; c.vy += ty * 380 + (c.y - by) * 4; c.speed = c.vx * Math.cos(c.angle) + c.vy * Math.sin(c.angle);
      damageCar(c, 80); if (onScreen(c.x, c.y)) sfx.crash(); if (c === player.car) { shake = 1; hardKnock(); }
    }
    if (!player.car && !player.down && d2(player.x, player.y, bx, by) < 18 * 18 && !(HQ.wbP > time)) { HQ.wbP = time + 0.8; hurtPlayer(35); player.x += tx * 30; player.y += ty * 30; }
    if (cr.t <= 0 || d2(cr.x, cr.y, P0.x, P0.y) > 2200 * 2200) { HQ.crane = null; HQ.rubble = HQ.rubble.filter(r => !r.crane); }
  }
  HQ.rubble = HQ.rubble.filter(r => d2(r.x, r.y, P0.x, P0.y) < 3000 * 3000);
  // ★10: the swarms, the paratroopers, the squads roped down ahead, the Helicarrier; and going to ground
  if (stars >= 10 && !player.down) {
    if ((HQ.kamiCd -= dt) <= 0) {
      HQ.kamiCd = 15; const a0 = rand(TAU);
      for (let i = 0; i < 5; i++) { const a = a0 + rand(-0.45, 0.45), r = rand(850, 1050); HQ.kami.push({ x: P0.x + Math.cos(a) * r, y: P0.y + Math.sin(a) * r, vx: 0, vy: 0, life: 30, dive: 0, w: rand(TAU), hp: 1 }); }
      msg('Drone swarm incoming! Shoot them down, or get under cover.', 2.5);
    }
    if ((HQ.paraCd -= dt) <= 0) {
      HQ.paraCd = 14;
      for (let i = 0; i < 4; i++) { const q = randomTile([WALK, PLAZA, GRASS], p => !onScreen(p.x, p.y, -120) || true, { x: P0.x, y: P0.y, min: 140, max: 380 }); if (q) HQ.paras.push({ x: q.x, y: q.y, t: 3 + i * 0.4, dx: rand(-60, 60), dy: rand(-60, 60) }); }
    }
    if (!HQ.rope && (HQ.ropeCd -= dt) <= 0) {
      const p = pc ? aheadLanePt(40, 300) : null;
      if (p) { const k = kerbToKerb(p), a = rand(TAU); HQ.rope = { x: k.x, y: k.y, nx: k.nx, ny: k.ny, w: k.w, hx: k.x + Math.cos(a) * 1200, hy: k.y + Math.sin(a) * 1200, ph: 0, t: 0, n: 0, a: a + Math.PI }; }
      HQ.ropeCd = p ? 24 : 3;
    }
    if (!HQ.carrier) { const a = rand(TAU); HQ.carrier = { x: P0.x + Math.cos(a) * 1500, y: P0.y + Math.sin(a) * 1500, lx: P0.x, ly: P0.y, a: a + Math.PI, orb: a, hp: 12, see: false, fall: 0, sent: 0, sendT: 7 }; HQ.beat = []; msg('A P.L.A.N.C.K. Helicarrier is coming in over the city, its searchlight sweeping for you.', 4); }
  }
  for (const q of HQ.kami) {
    q.life -= dt;
    if (q.dive) { q.dive -= dt; q.x += (q.tx - q.x) * Math.min(1, dt * 4); q.y += (q.ty - q.y) * Math.min(1, dt * 4); if (q.dive <= 0) q.gone = 1; continue; }
    if (stars < 10) { q.gone = 1; continue; }
    const lock = !hid, tx = (lock ? P0.x : belief.x) + Math.cos(time * 3 + q.w) * 40, ty = (lock ? P0.y : belief.y) + Math.sin(time * 3 + q.w) * 40;
    const dx = tx - q.x, dy = ty - q.y, dd = Math.hypot(dx, dy) || 1;
    q.vx += (dx / dd * 290 - q.vx) * Math.min(1, dt * 2); q.vy += (dy / dd * 290 - q.vy) * Math.min(1, dt * 2); q.x += q.vx * dt; q.y += q.vy * dt;
    if (lock && d2(q.x, q.y, P0.x, P0.y) < 130 * 130) {
      q.dive = 0.9; q.tx = P0.x + (P0.vx || 0) * 0.75; q.ty = P0.y + (P0.vy || 0) * 0.75;
      q.st = { x: q.tx, y: q.ty, t: 0.9, r: 40, k: 'kami' }; HQ.strikes.push(q.st);
    }
  }
  HQ.kami = HQ.kami.filter(q => !q.gone && q.life > 0);
  for (const q of HQ.paras) { q.t -= dt; if (q.t <= 0) { const x = q.x + q.dx * 0, y = q.y; if (!circleSolid(x, y, 4)) soldier(x, y, false); q.gone = 1; } }
  HQ.paras = HQ.paras.filter(q => !q.gone);
  const ro = HQ.rope;
  if (ro) {
    ro.t += dt;
    if (ro.ph === 0) { const dx = ro.x - ro.hx, dy = ro.y - ro.hy, dd = Math.hypot(dx, dy); if (dd < 12) { ro.ph = 1; ro.t = 0; } else { const s = Math.min(dd, 460 * dt); ro.hx += dx / dd * s; ro.hy += dy / dd * s; } }
    else if (ro.ph === 1) {
      while (ro.n < 4 && ro.t > 0.5 + ro.n * 0.45) { const o = (ro.n - 1.5) * ro.w / 4.2; soldier(ro.x + ro.nx * o, ro.y + ro.ny * o, true); ro.n++; }
      if (ro.t > 2.8) { ro.ph = 2; ro.t = 0; }
    } else { ro.hx += Math.cos(ro.a) * 420 * dt; ro.hy += Math.sin(ro.a) * 420 * dt; if (ro.t > 3) HQ.rope = null; }
  }
  const bl = HQ.carrier;
  if (bl) {
    if (bl.fall) { bl.fall += dt; if (Math.random() < dt * 30) addPart(bl.x + rand(-90, 90), bl.y + rand(-30, 30), rand(-20, 20), rand(-20, 20), 1.2, 6, pick(['#555', '#777', '#ff8a2a']), 8); if (bl.fall > 4) { explode(bl.x, bl.y, 160, 'player'); HQ.carrier = null; } }
    else if (stars < 10 || player.down) { bl.see = false; const a = Math.atan2(bl.y - P0.y, bl.x - P0.x); bl.a += wrapA(a - bl.a) * Math.min(1, dt * 0.5); bl.x += Math.cos(bl.a) * 140 * dt; bl.y += Math.sin(bl.a) * 140 * dt; if (!onScreen(bl.x, bl.y, 900)) HQ.carrier = null; }
    else {
      // it holds off to one side of you, circling (up there it looks twice as far off: beside you on the screen, not over
      // you), and its searchlight hunts for you
      const tx = belief.seen ? P0.x : belief.x, ty = belief.seen ? P0.y : belief.y;
      bl.orb += dt * 0.1;
      const gx = tx + Math.cos(bl.orb) * 140, gy = ty + Math.sin(bl.orb) * 140, dx = gx - bl.x, dy = gy - bl.y, dd = Math.hypot(dx, dy) || 1, s = Math.min(dd, (dd > 500 ? 170 : 70) * dt);
      bl.x += dx / dd * s; bl.y += dy / dd * s; if (dd > 20) bl.a += wrapA(Math.atan2(dy, dx) - bl.a) * Math.min(1, dt * 0.4);
      const near = d2(bl.x, bl.y, P0.x, P0.y) < 560 * 560, hx = near ? P0.x : belief.x + Math.cos(time * 0.7) * Math.min(belief.sig, 260), hy = near ? P0.y : belief.y + Math.sin(time * 0.9) * Math.min(belief.sig, 260);
      const lx = hx - bl.lx, ly = hy - bl.ly, ld = Math.hypot(lx, ly) || 1, st = Math.min(ld, 190 * dt); bl.lx += lx / ld * st; bl.ly += ly / ld * st;
      bl.see = !hid && d2(bl.lx, bl.ly, P0.x, P0.y) < 140 * 140;
      if (bl.sent < SQUAD.length && (bl.sendT -= dt) <= 0) bl.sendT = launchHero(SQUAD[bl.sent], bl, P0) ? (bl.sent++, 10) : 2; // (its heroes, one after another)
    }
  }
  updateHeroes(dt, stars, P0, hid, pc);
  if (stars >= 10 && TUNNELS.length >= 2) { // through a tunnel from end to end, unseen going in and coming out
    const L = pc ? pc.lay : 0;
    if (L === 1 && HQ.pl !== 1) { const id = tE[Math.floor(pc.y / T) * MW + Math.floor(pc.x / T)], e = id >= 0 ? EDGES[id] : null; HQ.tunIn = e ? { name: e.name || 'tunnel ' + id, x: pc.x, y: pc.y, len: e.len || 300, seen: belief.seen } : null; }
    if (L !== 1 && HQ.pl === 1 && HQ.tunIn) {
      const ti = HQ.tunIn; HQ.tunIn = null;
      if (!ti.seen && !belief.seen && Math.hypot(pc.x - ti.x, pc.y - ti.y) > ti.len * 0.55 && !HQ.tun.includes(ti.name)) { HQ.tun.push(ti.name); if (HQ.tun.length < 2) msg(`Through the ${ti.name} unseen. Now another tunnel.`, 3); }
    }
    HQ.pl = L;
    if (HQ.tun.length >= 2) { heat = 5.5; bigText('AIR ASSAULT CALLED OFF', '#ef5350', 3, 'They lost you underground: five stars'); sfx.good(); ach('ground'); }
  } else if (stars >= 10 && HQ.low >= 75) { heat = 5.5; bigText('AIR ASSAULT CALLED OFF', '#ef5350', 3, 'They lost you: five stars'); sfx.good(); ach('ground'); }
}
// ---- ★10: P.L.A.N.C.K.'s heroes, sent down from the Helicarrier one after another: an armoured flyer whose visor is a
// measurement, a spy entangled with you, a giant who leaps and throws cars, and a man who walks through walls. Beaten,
// each is beamed back up. (All plain data in HQ, so a co-op guest sees them too.)
const HEROES = {
  collapser: { name: 'The Collapser', hp: 240, c: '#7ff6ff', line: 'P.L.A.N.C.K. sends down the Collapser. While his visor sees you, you are seen: shoot him down, or get under cover.' },
  spooky: { name: 'Agent Spooky', hp: 170, c: '#e4e8ee', line: 'Agent Spooky drops from the Helicarrier. She is entangled with you: wherever you go, she can appear beside you.' },
  bigbang: { name: 'Big Bang', hp: 420, c: '#ffcc33', line: 'Big Bang jumps off the Helicarrier. He leaps after you, and he throws cars.' },
  tunneler: { name: 'The Tunneler', hp: 260, c: '#e0b84a', line: 'The Tunneler is down. Walls don\'t stop him: he tunnels straight through them.' },
};
const SQUAD = Object.keys(HEROES), COLL_Z = 0.2;
const heroSpot = (P, min, max) => randomTile([WALK, PLAZA, GRASS, ROAD, SAND], p => !circleSolid(p.x, p.y, 8), { x: P.x, y: P.y, min, max });
function launchHero(k, bl, P0) {
  const q = k === 'collapser' ? { x: P0.x + rand(-150, 150), y: P0.y + rand(-150, 150) } : heroSpot(P0, 110, 220);
  if (!q) return false;
  HQ.heroes.push({ k, x: bl.x, y: bl.y, z: CARRIER_Z, a: Math.atan2(q.y - bl.y, q.x - bl.x), hp: HEROES[k].hp, ph: 'drop', t: 0, sx: bl.x, sy: bl.y, tx: q.x, ty: q.y,
    vx: 0, vy: 0, cd: 2, gun: 1.5, blink: 4, leap: 2, dig: 6, ram: 0, hit: 0, lift: 0, anim: 0, stuck: 0, orb: rand(TAU), see: false, wall: false, beam: null, wave: null, jump: null });
  msg(HEROES[k].line, 4.5); sfx.bad();
  return true;
}
function heroHurt(h, n) {
  if ((h.ph !== 'go' && h.ph !== 'drop') || n <= 0) return;
  h.hp -= n; h.hit = 0.15;
  if (h.hp <= 0) {
    h.ph = 'down'; h.t = 0; h.beam = null; h.jump = null; h.see = false; earn(1500);
    msg(`${HEROES[h.k].name} is down!`, 3); sfx.good();
    if (!HQ.beat.includes(h.k)) HQ.beat.push(h.k);
    if (HQ.beat.length === SQUAD.length) { earn(5000); ach('squad'); bigText('P.L.A.N.C.K.\'S HEROES BEATEN', '#ef5350', 3.5, 'All four, beamed back up to the Helicarrier'); }
  } else if (h.k === 'spooky' && Math.random() < 0.3) heroBlink(h, pp(), 80, 140); // (she doesn't stay where she was hit)
}
function heroBlink(h, P, min, max) { // (spooky action at a distance)
  const q = heroSpot(P, min, max); if (!q) return;
  qburst(h.x, h.y, '#3cf0ff', 14); h.x = q.x; h.y = q.y; qburst(h.x, h.y, '#3cf0ff', 14); if (onScreen(h.x, h.y)) sfx.quantum();
}
function heroBlast(x, y, r) { // (a rocket, or what it set off)
  for (const h of HQ.heroes) if (h.z < 0.05 && !h.wall) { const d = Math.hypot(h.x - x, h.y - y); if (d < r + 12) heroHurt(h, (1 - d / (r + 12)) * 170 + 20); }
}
function heroKnock(h, by) { // (a blow that throws you back)
  const P = player, dx = P.x - h.x, dy = P.y - h.y, d = Math.hypot(dx, dy) || 1, nx = P.x + dx / d * by, ny = P.y + dy / d * by;
  if (!circleSolid(nx, ny, 4)) { P.x = nx; P.y = ny; }
}
// Big Bang lands: a shockwave that flings the cars about and knocks you down
function heroShock(h) {
  const x = h.x, y = h.y; h.wave = { x, y, t: 0 };
  if (onScreen(x, y, 200)) { sfx.boom(); shake = Math.max(shake, 0.9); }
  for (const c of cars) {
    if (c.dead || c.tram || c.lay === 1 || c.lay === 3) continue;
    const dx = c.x - x, dy = c.y - y, d = Math.hypot(dx, dy) || 1;
    if (d < 150) { const f = 1 - d / 150; c.vx += dx / d * 340 * f; c.vy += dy / d * 340 * f; damageCar(c, 50 * f); if (c === player.car) hardKnock(); }
  }
  if (!player.car && !player.down && !player.hidden) { const d = Math.hypot(player.x - x, player.y - y); if (d < 110) { hurtPlayer(6 + 22 * (1 - d / 110)); heroKnock(h, 26); } }
  for (const p of peds) if (!p.dead && d2(p.x, p.y, x, y) < 90 * 90) { p.flee = 4; p.fx = x; p.fy = y; }
  if (!seeThrough(x, y)) addDecal({ k: 'scorch', x, y, r: 16 });
}
// and picks up the nearest car and hurls it at you
function heroThrow(h, P0) {
  let best = null, bd = 75 * 75;
  for (const c of cars) {
    if (c === player.car || c.dead || c.tram || CT[c.type].boat || c.type === 'tank' || (c.driver && c.driver !== 'ai') || c.mission || c.egg || c.heldBy || c.jackHold || c.twin || c.linked || c.decoy || c.thrown > 0 || c.lay === 1 || c.lay === 3) continue;
    const dd = d2(c.x, c.y, h.x, h.y); if (dd < bd) { bd = dd; best = c; }
  }
  if (!best) return false;
  const a = Math.atan2(P0.y + (P0.vy || 0) * 0.4 - best.y, P0.x + (P0.vx || 0) * 0.4 - best.x);
  if (best.driver === 'ai') ejectDriver(best, true);
  best.driver = null; best.thrown = 1.1; best.tvx = Math.cos(a) * 540; best.tvy = Math.sin(a) * 540; best.parked = false; best.moved = true;
  h.a = a; h.lift = 0.35; msg('Big Bang hurls a car at you!', 1.5);
  return true;
}
function heroRammed(h, pc) { // (driving into them)
  const sp = Math.hypot(pc.vx, pc.vy), t = CT[pc.type];
  if (h.ram > 0 || sp < 110 || h.z > 0.02 || h.wall || d2(h.x, h.y, pc.x, pc.y) > (t.l / 2 + 8) ** 2) return;
  h.ram = 0.8;
  if (h.k === 'spooky' && Math.random() < 0.7) { heroBlink(h, pc, 70, 120); return; } // (she isn't there when you arrive)
  if (onScreen(h.x, h.y)) sfx.crash();
  if (h.k === 'bigbang') { damageCar(pc, 40); pc.vx *= -0.35; pc.vy *= -0.35; pc.speed *= -0.35; hardKnock(); shake = 1; heroHurt(h, sp * 0.12); return; } // (like hitting a wall)
  heroHurt(h, sp * 0.3);
  const d = Math.hypot(h.x - pc.x, h.y - pc.y) || 1, nx = h.x + (h.x - pc.x) / d * 30, ny = h.y + (h.y - pc.y) / d * 30;
  if (!circleSolid(nx, ny, 6)) { h.x = nx; h.y = ny; }
}
function updateHeroes(dt, stars, P0, hid, pc) {
  const leave = stars < 10 || player.down, under = pc && pc.lay === 1; // (in a tunnel only the Tunneler gets at you)
  for (const h of HQ.heroes) {
    h.hit = Math.max(0, h.hit - dt); h.ram -= dt; h.cd -= dt;
    if (h.beam && (h.beam.t -= dt) <= 0) h.beam = null;
    if (h.wave && (h.wave.t += dt) > 0.55) h.wave = null;
    if (h.ph === 'up') { h.t += dt; h.z = h.z0 + h.t * 0.6; if (h.t > 1.4) h.gone = 1; continue; }
    if (h.ph === 'down') { h.t += dt; if (h.k === 'collapser') h.z = Math.max(0, COLL_Z * (1 - h.t / 0.8)); if (h.t > 2.5) { h.ph = 'up'; h.t = 0; h.z0 = h.z; qburst(h.x, h.y, '#9fe8ff', 12); } continue; }
    if (leave) { h.ph = 'up'; h.t = 0; h.z0 = h.z; h.see = false; h.beam = null; h.jump = null; continue; }
    if (h.ph === 'drop') { // down from the Helicarrier's deck
      h.t += dt; const f = Math.min(1, h.t / 1.6), e = f * (2 - f);
      h.x = lerp(h.sx, h.tx, e); h.y = lerp(h.sy, h.ty, e); h.z = h.k === 'collapser' ? lerp(CARRIER_Z, COLL_Z, f) : CARRIER_Z * (1 - f);
      if (f >= 1) {
        h.ph = 'go'; h.z = h.k === 'collapser' ? COLL_Z : 0;
        if (h.k === 'bigbang') heroShock(h); else if (h.k === 'spooky') qburst(h.x, h.y, '#3cf0ff', 16);
      }
      continue;
    }
    const dx = P0.x - h.x, dy = P0.y - h.y, d = Math.hypot(dx, dy) || 1;
    if (d > 3200) { h.ph = 'up'; h.t = 0; h.z0 = h.z; continue; } // (they lost you)
    if (h.k === 'collapser') { // circles you, and his visor's beam measures and burns
      h.orb += dt * 0.7;
      const gx = P0.x + Math.cos(h.orb) * 150, gy = P0.y + Math.sin(h.orb) * 150, ex = gx - h.x, ey = gy - h.y, ed = Math.hypot(ex, ey) || 1, sp = Math.min(ed * 2, ed > 600 ? 520 : 300);
      h.vx += (ex / ed * sp - h.vx) * Math.min(1, dt * 2.2); h.vy += (ey / ed * sp - h.vy) * Math.min(1, dt * 2.2);
      h.x += h.vx * dt; h.y += h.vy * dt; if (Math.hypot(h.vx, h.vy) > 40) h.a = Math.atan2(h.vy, h.vx);
      h.see = !hid && d < 380;
      if (h.see && d < 340 && h.cd <= 0) {
        h.cd = 1.6;
        const v = Math.hypot(P0.vx || 0, P0.vy || 0), miss = Math.random() < (pc ? clamp(v / 450, 0.15, 0.7) : 0.25);
        const bx = P0.x + (miss ? rand(-45, 45) : rand(-3, 3)), by = P0.y + (miss ? rand(-45, 45) : rand(-3, 3));
        h.beam = { x: bx, y: by, t: 0.2 }; h.a = Math.atan2(by - h.y, bx - h.x);
        if (!miss) { if (pc) damageCar(pc, 16); else hurtPlayer(9); }
        for (let k = 0; k < 6; k++) addPart(bx, by, rand(-70, 70), rand(-70, 70), 0.3, 2, '#bff8ff', 0, true);
        if (onScreen(h.x, h.y)) sfx.shot();
      }
      continue;
    }
    if (h.k === 'spooky') { // quick on her feet; too far, or stuck, and she is beside you; a wrist shock up close
      h.blink -= dt; h.gun -= dt;
      if ((d > 280 || h.stuck > 1.2) && h.blink <= 0) { heroBlink(h, P0, 60, 110); h.blink = 6; h.stuck = 0; }
      else if (d > 24) { const ox = h.x, oy = h.y; moveFree(h, dx / d * 150, dy / d * 150, dt, 4); h.a = Math.atan2(dy, dx); h.anim += dt * 18; h.stuck = Math.hypot(h.x - ox, h.y - oy) < 150 * dt * 0.3 ? h.stuck + dt : 0; }
      if (!under && d < 30 && h.cd <= 0) {
        h.cd = 4; player.stun = pc ? 1.3 : 1.0; if (pc) damageCar(pc, 10); else hurtPlayer(8);
        for (let k = 0; k < 10; k++) addPart(P0.x, P0.y, rand(-80, 80), rand(-80, 80), 0.3, 2, '#7ff6ff', 0, true);
        msg(pc ? 'Agent Spooky\'s wrist shock stalls your car!' : 'Agent Spooky\'s wrist shock: you can\'t move!', 1.5); sfx.quantum();
      } else if (!under && !hid && d > 70 && d < 260 && h.gun <= 0) {
        h.gun = 1.4; const a = Math.atan2(dy, dx) + rand(-0.06, 0.06); h.a = a;
        bullets.push({ x: h.x + Math.cos(a) * 10, y: h.y + Math.sin(a) * 10, vx: Math.cos(a) * 650, vy: Math.sin(a) * 650, life: 0.6, dmg: 7, owner: 'cop' });
        if (onScreen(h.x, h.y)) sfx.shot();
      }
    } else if (h.k === 'bigbang') { // walks, leaps after you (and lands with a shockwave), throws cars, punches
      h.leap -= dt; h.lift = Math.max(0, h.lift - dt);
      if (h.jump) {
        const j = h.jump; j.t += dt; const f = Math.min(1, j.t / j.dur);
        h.x = lerp(j.sx, j.tx, f); h.y = lerp(j.sy, j.ty, f); h.z = 0.32 * 4 * f * (1 - f);
        if (f >= 1) { h.jump = null; h.z = 0; heroShock(h); }
        continue;
      }
      if (h.leap <= 0 && (d > 150 || Math.random() < 0.35)) {
        let tx = P0.x + (P0.vx || 0) * 1.1 + rand(-40, 40), ty = P0.y + (P0.vy || 0) * 1.1 + rand(-40, 40);
        const jd = Math.hypot(tx - h.x, ty - h.y); if (jd > 560) { tx = h.x + (tx - h.x) / jd * 560; ty = h.y + (ty - h.y) / jd * 560; }
        if (circleSolid(tx, ty, 10)) { const q = heroSpot({ x: tx, y: ty }, 0, 120); tx = q ? q.x : h.x; ty = q ? q.y : h.y; }
        h.jump = { sx: h.x, sy: h.y, tx, ty, t: 0, dur: 1.1 }; h.a = Math.atan2(ty - h.y, tx - h.x); h.leap = rand(4, 6);
      } else if (h.cd <= 0 && d > 60 && d < 320 && !hid && !under && heroThrow(h, P0)) h.cd = 4.5;
      else if (d > 26) { moveFree(h, dx / d * 70, dy / d * 70, dt, 7); h.a = Math.atan2(dy, dx); h.anim += dt * 10; }
      else if (h.cd <= 0 && !under) { h.cd = 2.2; if (pc) { damageCar(pc, 30); hardKnock(); } else { hurtPlayer(18); heroKnock(h, 30); } if (onScreen(h.x, h.y)) sfx.crash(); }
    } else { // the Tunneler: straight at you, through whatever is in the way; far behind, he digs and comes up ahead of you
      h.dig -= dt;
      if (d > 650 && h.dig <= 0) {
        const v = Math.hypot(P0.vx || 0, P0.vy || 0), a = v > 40 ? Math.atan2(P0.vy, P0.vx) : rand(TAU);
        h.x = P0.x + Math.cos(a) * 240 + rand(-40, 40); h.y = P0.y + Math.sin(a) * 240 + rand(-40, 40); h.dig = 8;
        for (let k = 0; k < 14; k++) addPart(h.x + rand(-8, 8), h.y + rand(-8, 8), rand(-50, 50), rand(-50, 50), 0.7, 3.5, '#8d7b63', 6, true);
      } else if (d > 20) { h.x += dx / d * 118 * dt; h.y += dy / d * 118 * dt; h.a = Math.atan2(dy, dx); h.anim += dt * 12; }
      h.wall = solidAt(h.x, h.y);
      if (h.wall && Math.random() < dt * 12) addPart(h.x + rand(-6, 6), h.y + rand(-6, 6), rand(-20, 20), rand(-20, 20), 0.6, 3, '#8d7b63', 4, true); // (the dust of the wall he is in)
      if (d < 24 && h.cd <= 0) {
        h.cd = 2;
        if (pc) { damageCar(pc, 30); pc.vx *= 0.25; pc.vy *= 0.25; pc.speed *= 0.25; hardKnock(); msg('The Tunneler grabs your car!', 1.5); } else { hurtPlayer(14); heroKnock(h, 24); }
        if (onScreen(h.x, h.y)) sfx.crash();
      }
    }
    if (pc) heroRammed(h, pc);
  }
  HQ.heroes = HQ.heroes.filter(h => !h.gone);
  for (const c of cars) if (c.thrown > 0) { // a car in the air, thrown by Big Bang
    c.thrown -= dt; c.x += c.tvx * dt; c.y += c.tvy * dt; c.angle += dt * 9; c.vx = c.tvx; c.vy = c.tvy; c.speed = 0;
    let end = c.thrown <= 0;
    if (!end && solidAt(c.x, c.y)) { end = true; c.x -= c.tvx * dt; c.y -= c.tvy * dt; damageCar(c, 90); }
    else if (!end && !player.car && !player.down && d2(c.x, c.y, player.x, player.y) < 20 * 20) { end = true; hurtPlayer(40); }
    else if (!end && player.car && player.car !== c && d2(c.x, c.y, player.car.x, player.car.y) < 30 * 30) { end = true; damageCar(player.car, 55); player.car.vx += c.tvx * 0.4; player.car.vy += c.tvy * 0.4; hardKnock(); damageCar(c, 60); }
    if (end) { c.thrown = 0; c.vx *= 0.25; c.vy *= 0.25; if (onScreen(c.x, c.y)) sfx.crash(); shake = Math.max(shake, 0.5); }
  }
}
// what the HUD says about the level's way out
function wantedHint() {
  const s = Math.min(10, Math.floor(heat)), left = n => Math.max(0, Math.ceil(n - HQ.low));
  if (s === 6) return HQ.drone && !HQ.drone.fall && HQ.drone.lock ? 'The drone sees you: get under trees or an overpass, into a tunnel, or shoot it down' : 'Lose them, and the Bureau stands down';
  if (s === 7 && boatOf(player.car) && player.putOut) { const d = Math.hypot(player.x - player.putOut.x, player.y - player.putOut.y); return d < BOAT_D ? `Across the water: ${Math.round(d / BOAT_D * 100)}% of the way, then land unseen` : 'Far enough: get out at a bank, unseen'; }
  if (s === 7) return belief.seen ? `Lie low 60 s unseen${Q.ent > 0 ? ' · or T on foot at a wall: tunnel through it (ε)' : ''} · or take a boat across the water` : `Lie low unseen: ${left(60)} s to go`;
  if (s === 8) return `The entangled payphones (cyan on the map): ${touchOn() ? '⇄' : 'Enter'} there to teleport out`;
  if (s === 9) return `Hide in a pedestrian zone, unseen: ${Math.floor(HQ.plaza)} / 45 s`;
  return TUNNELS.length >= 2 ? `Two different tunnels end to end, unseen at the portals: ${HQ.tun.length} / 2` : `Lie low unseen: ${left(75)} s to go`;
}
function qBlocked() {
  if (lab) return null;
  if (heat >= 8) return 'The Observer measures everything: no superposition, no entanglement.';
  if (HQ.det) return 'A Bureau detector is too close: it would measure you at once.';
  return null;
}
// seven stars, on foot at a wall: spend an ε charge to tunnel through it (a quantum particle can cross a barrier it
// could never climb), out of their sight, and the emergency is over
function tunnelJump() {
  const ca = Math.cos(player.angle), sa = Math.sin(player.angle);
  let d = 6; while (d < 34 && !solidAt(player.x + ca * d, player.y + sa * d)) d += 2;
  if (d >= 34) return false;
  while (d < 280 && solidAt(player.x + ca * d, player.y + sa * d)) d += 3;
  const x = player.x + ca * (d + 8), y = player.y + sa * (d + 8);
  if (d >= 280 || circleSolid(x, y, 4)) { msg('Too thick a wall to tunnel through.', 2); return true; }
  qburst(player.x, player.y, '#3cf0ff'); player.x = x; player.y = y; qburst(x, y, '#3cf0ff'); sfx.quantum(); Q.ent--;
  heat = 5.5; HQ.lv = 5; Object.assign(belief, { seen: false, seeT: 1, sig: Math.max(belief.sig, 320) });
  bigText('QUANTUM TUNNELLING', '#3cf0ff', 3, 'Through the wall and out of their sight: five stars'); ach('qtunnel');
  return true;
}
// what flies over gets shot at where it appears (like the helicopter)
function airHit(b) {
  const at = (o, z) => { const k = 1 + z; return [cam.x + (o.x - cam.x) * k, cam.y + (o.y - cam.y) * k]; };
  const d = HQ.drone;
  if (d && !d.fall) { const [x, y] = at(d, DRONE_Z); if (d2(b.x, b.y, x, y) < 13 * 13) { d.hp -= b.rocket ? 99 : b.dmg; if (d.hp <= 0) { d.fall = 0.01; earn(200); addHeat(0.25, true); msg('You shot down the Bureau\'s drone!', 2.5); ach('drone'); } return true; } }
  for (const q of HQ.kami) { const [x, y] = at(q, KAMI_Z); if (d2(b.x, b.y, x, y) < 10 * 10) { q.gone = 1; if (q.st) q.st.cancel = true; for (let k = 0; k < 8; k++) addPart(x, y, rand(-60, 60), rand(-60, 60), 0.4, 3, pick(['#ff9c2a', '#555']), 4, true); earn(40); return true; } }
  for (const h of HQ.heroes) { // (a rocket's blast does the rest, on the ground)
    if ((h.ph !== 'go' && h.ph !== 'drop') || h.wall) continue;
    const [x, y] = at(h, h.z), r = h.k === 'bigbang' ? 11 : 8;
    if (d2(b.x, b.y, x, y) < r * r) { heroHurt(h, b.rocket ? (h.z > 0.05 ? 120 : 0) : b.dmg); for (let k = 0; k < 4; k++) addPart(b.x, b.y, rand(-60, 60), rand(-60, 60), 0.25, 2, '#ffe08a', 0, true); return true; }
  }
  const bl = HQ.carrier; // (only a rocket reaches it: bullets pass under it, at whatever is on the ground)
  if (bl && !bl.fall && b.rocket) { const [x, y] = at(bl, CARRIER_Z), ca = Math.cos(bl.a), sa = Math.sin(bl.a), lx = (b.x - x) * ca + (b.y - y) * sa, ly = -(b.x - x) * sa + (b.y - y) * ca, f = CARRIER_SC * (1 + CARRIER_Z);
    if ((lx / (160 * f)) ** 2 + (ly / (70 * f)) ** 2 < 1) { bl.hp--; for (let k = 0; k < 10; k++) addPart(b.x, b.y, rand(-90, 90), rand(-90, 90), 0.5, 3, pick(['#ff9c2a', '#ffd34d', '#555']), 4, true); if (bl.hp <= 0) { bl.fall = 0.01; earn(10000); addHeat(0.5, true); msg('The Helicarrier is going down!', 3); ach('carrier'); } else if (bl.hp % 4 === 0) msg(`The Helicarrier is hit: ${bl.hp} more rockets.`, 2); return true; } }
  return false;
}
// ---- drawing: on the ground (spike strips, rubble, the crane and its ball, target markers), then what flies
function drawWantedGround(v) {
  const vis = (x, y, m) => x > v.x0 - m && x < v.x1 + m && y > v.y0 - m && y < v.y1 + m;
  for (const s of HQ.spikes) if (vis(s.x, s.y, s.w)) {
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(-2, -s.w / 2 + 2, 6, s.w);
    ctx.fillStyle = '#2b2b2b'; ctx.fillRect(-3, -s.w / 2, 6, s.w);
    ctx.fillStyle = '#c9ccd1'; for (let y = -s.w / 2 + 2; y < s.w / 2 - 1; y += 4) { ctx.fillRect(-4, y, 2, 2); ctx.fillRect(2, y + 2, 2, 2); }
    ctx.fillStyle = '#e0b100'; ctx.fillRect(-3, -s.w / 2, 6, 3); ctx.fillRect(-3, s.w / 2 - 3, 6, 3);
    ctx.restore();
  }
  for (const r of HQ.rubble) if (vis(r.x, r.y, r.r) && !r.crane) {
    let h = r.s | 0; const rn = () => ((h = (h * 1103515245 + 12345) >>> 0) % 1000) / 1000;
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.arc(r.x + 3, r.y + 4, r.r, 0, TAU); ctx.fill();
    for (let i = 0; i < 9; i++) { const a = rn() * TAU, d = rn() * r.r * 0.7, s = r.r * (0.3 + rn() * 0.4); ctx.fillStyle = tint(['#8f8a80', '#a29d93', '#7a6f63', '#b0553d', '#6e6a64'][i % 5], 1); ctx.beginPath(); ctx.arc(r.x + Math.cos(a) * d, r.y + Math.sin(a) * d, s, 0, TAU); ctx.fill(); }
    ctx.fillStyle = tint('#3a3530', 1); for (let i = 0; i < 4; i++) { const a = rn() * TAU, d = rn() * r.r; ctx.fillRect(r.x + Math.cos(a) * d - 3, r.y + Math.sin(a) * d - 1, 7, 2); }
  }
  const cr = HQ.crane;
  if (cr && vis(cr.x, cr.y, 120)) {
    const bx = cr.x + Math.cos(cr.a) * cr.r, by = cr.y + Math.sin(cr.a) * cr.r;
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(cr.x - 11, cr.y - 9, 26, 26); ctx.beginPath(); ctx.arc(bx + 12, by + 14, 12, 0, TAU); ctx.fill();
    ctx.fillStyle = tint('#e0a800', 1); ctx.fillRect(cr.x - 13, cr.y - 13, 26, 26);
    ctx.strokeStyle = tint('#7a5c00', 1); ctx.lineWidth = 1.5; ctx.strokeRect(cr.x - 13, cr.y - 13, 26, 26); ctx.beginPath(); ctx.moveTo(cr.x - 13, cr.y - 13); ctx.lineTo(cr.x + 13, cr.y + 13); ctx.moveTo(cr.x + 13, cr.y - 13); ctx.lineTo(cr.x - 13, cr.y + 13); ctx.stroke();
    ctx.strokeStyle = tint('#e0a800', 1); ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cr.x, cr.y); ctx.lineTo(cr.x + Math.cos(cr.a - 0.25) * (cr.r + 10), cr.y + Math.sin(cr.a - 0.25) * (cr.r + 10)); ctx.stroke();
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(cr.x + Math.cos(cr.a - 0.25) * (cr.r + 10), cr.y + Math.sin(cr.a - 0.25) * (cr.r + 10)); ctx.lineTo(bx, by); ctx.stroke();
    const g = ctx.createRadialGradient(bx - 4, by - 4, 2, bx, by, 13); g.addColorStop(0, '#6d7075'); g.addColorStop(1, '#1c1d20');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, by, 12, 0, TAU); ctx.fill();
  }
  for (const s of HQ.strikes) if (vis(s.x, s.y, s.r)) { // where something is about to land: a red ring that closes in
    const f = clamp(s.t / (s.k === 'kami' ? 0.9 : 1.3), 0, 1), on = Math.sin(time * 22) > 0;
    ctx.strokeStyle = `rgba(255,40,30,${on ? 0.95 : 0.6})`; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r * (0.5 + 0.5 * f), 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s.x - s.r * 0.35, s.y); ctx.lineTo(s.x + s.r * 0.35, s.y); ctx.moveTo(s.x, s.y - s.r * 0.35); ctx.lineTo(s.x, s.y + s.r * 0.35); ctx.stroke();
    ctx.fillStyle = `rgba(255,40,30,${0.12 + 0.2 * (1 - f)})`; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
  }
  const j = HQ.jet;
  if (j && j.t < j.warn) { // the jet's run, announced: a dashed red line across where you are
    const ca = Math.cos(j.a), sa = Math.sin(j.a);
    ctx.save(); ctx.translate(j.tx, j.ty); ctx.rotate(j.a); // (the strip its bombs will hit, and its line)
    ctx.fillStyle = `rgba(255,40,30,${0.1 + 0.08 * (Math.sin(time * 14) > 0)})`; ctx.fillRect(-520, -36, 1040, 72);
    ctx.strokeStyle = 'rgba(255,50,40,.55)'; ctx.lineWidth = 2; ctx.setLineDash([10, 8]); ctx.strokeRect(-520, -36, 1040, 72);
    ctx.strokeStyle = `rgba(255,50,40,${0.5 + 0.4 * (Math.sin(time * 14) > 0)})`; ctx.lineWidth = 4; ctx.setLineDash([18, 10]);
    ctx.beginPath(); ctx.moveTo(-760, 0); ctx.lineTo(760, 0); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
    for (const s of [-1, 1]) { const x = j.tx + ca * 520 * s, y = j.ty + sa * 520 * s; ctx.fillStyle = 'rgba(255,50,40,.8)'; ctx.beginPath(); ctx.moveTo(x + ca * 14, y + sa * 14); ctx.lineTo(x - sa * 9, y + ca * 9); ctx.lineTo(x + sa * 9, y - ca * 9); ctx.fill(); }
  }
  const ro = HQ.rope;
  if (ro && ro.ph === 1) { // the ropes down from the hovering helicopter
    const k = 1 + ROPE_Z, hx = cam.x + (ro.hx - cam.x) * k, hy = cam.y + (ro.hy - cam.y) * k;
    ctx.strokeStyle = 'rgba(30,30,30,.7)'; ctx.lineWidth = 1.2;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(hx + ro.nx * 9 * s, hy + ro.ny * 9 * s); ctx.lineTo(ro.x + ro.nx * ro.w * 0.3 * s, ro.y + ro.ny * ro.w * 0.3 * s); ctx.stroke(); }
  }
}
function drawWantedAir() {
  const P = (o, z) => { const k = 1 + z; return [cam.x + (o.x - cam.x) * k, cam.y + (o.y - cam.y) * k, k]; };
  const nb = 1 + NIGHT * 1.6, on = Math.sin(time * 9) > 0;
  const shadow = (o, rx, ry, a) => { if (!SUN.on) return; ctx.fillStyle = `rgba(12,18,40,${0.22 * (1 - NIGHT)})`; ctx.beginPath(); ctx.ellipse(o.x + SUN.sx * 50, o.y + SUN.sy * 50, rx, ry, a || 0, 0, TAU); ctx.fill(); };
  for (const q of HQ.paras) { // paratroopers: the canopy shrinks as they come down
    const f = clamp(q.t / 3, 0, 1), x = q.x + q.dx * f, y = q.y + q.dy * f, s = 1 + f * 1.2;
    if (!onScreen(x, y, 60)) continue;
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.arc(q.x, q.y, 4, 0, TAU); ctx.fill();
    ctx.fillStyle = tint('#6b7a3a', nb); ctx.beginPath(); ctx.arc(x, y - 4 * s, 9 * s, Math.PI, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(40,40,40,.6)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x - 9 * s, y - 4 * s); ctx.lineTo(x, y + 2 * s); ctx.lineTo(x + 9 * s, y - 4 * s); ctx.stroke();
    ctx.fillStyle = tint('#3b4a1f', nb); ctx.beginPath(); ctx.arc(x, y + 2 * s, 2.5 * s, 0, TAU); ctx.fill();
  }
  for (const q of HQ.kami) { // kamikaze drones: small, black, a red eye
    const [x, y] = P(q, KAMI_Z); if (!onScreen(x, y, 30)) continue;
    const a = Math.atan2(q.vy, q.vx);
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = tint('#202226', nb); ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-6, -6); ctx.lineTo(-3, 0); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = on ? '#ff2a1a' : '#7a0c06'; ctx.beginPath(); ctx.arc(3, 0, 1.6, 0, TAU); ctx.fill();
    ctx.restore();
  }
  const d = HQ.drone;
  if (d) { // the Bureau's quadcopter
    const [x, y, k] = P(d, d.fall ? DRONE_Z * Math.max(0, 1 - d.fall) : DRONE_Z);
    if (onScreen(x, y, 40)) {
      shadow(d, 9, 9);
      ctx.save(); ctx.translate(x, y); ctx.rotate(d.a + (d.fall ? d.fall * 9 : 0)); ctx.scale(k * 0.9, k * 0.9);
      ctx.strokeStyle = tint('#26282e', nb); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-7, -7); ctx.lineTo(7, 7); ctx.moveTo(7, -7); ctx.lineTo(-7, 7); ctx.stroke();
      for (const [sx, sy] of [[-7, -7], [7, 7], [7, -7], [-7, 7]]) { ctx.fillStyle = 'rgba(40,40,46,.35)'; ctx.beginPath(); ctx.arc(sx, sy, 5, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(30,30,30,.6)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(sx + Math.cos(d.rot) * 5, sy + Math.sin(d.rot) * 5); ctx.lineTo(sx - Math.cos(d.rot) * 5, sy - Math.sin(d.rot) * 5); ctx.stroke(); }
      ctx.fillStyle = tint('#1b1d22', nb); rrect(-4, -3.5, 9, 7, 2);
      ctx.fillStyle = d.lock ? (on ? '#ff3030' : '#ff9a9a') : '#3cf0ff'; ctx.beginPath(); ctx.arc(4, 0, 1.6, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }
  const ro = HQ.rope;
  if (ro) { // the army's transport helicopter: two rotors
    const [x, y, k] = P({ x: ro.hx, y: ro.hy }, ROPE_Z);
    if (onScreen(x, y, 120)) {
      shadow({ x: ro.hx, y: ro.hy }, 30, 12, ro.a);
      ctx.save(); ctx.translate(x, y); ctx.rotate(ro.ph === 2 ? ro.a : Math.atan2(ro.y - ro.hy, ro.x - ro.hx) || ro.a); ctx.scale(k * 0.85, k * 0.85);
      ctx.fillStyle = tint('#4b5320', nb); rrect(-28, -8, 56, 16, 6);
      ctx.fillStyle = tint('#7fb3d5', nb); ctx.beginPath(); ctx.ellipse(24, 0, 5, 6, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(25,25,25,.6)'; ctx.lineWidth = 3;
      for (const cx of [-20, 20]) for (let i = 0; i < 3; i++) { const a = time * 38 * (cx > 0 ? 1 : -1) + i * TAU / 3; ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx + Math.cos(a) * 26, Math.sin(a) * 26); ctx.stroke(); }
      ctx.restore();
    }
  }
  const j = HQ.jet;
  if (j && j.t > j.warn) { // the jet: fast, high, grey; its shadow streaks over the ground
    if (SUN.on) { ctx.save(); ctx.translate(j.x + SUN.sx * 120, j.y + SUN.sy * 120); ctx.rotate(j.a); ctx.fillStyle = `rgba(12,18,40,${0.25 * (1 - NIGHT)})`; ctx.beginPath(); ctx.moveTo(24, 0); ctx.lineTo(-16, -20); ctx.lineTo(-10, 0); ctx.lineTo(-16, 20); ctx.closePath(); ctx.fill(); ctx.restore(); }
    const [x, y, k] = P(j, JET_Z);
    if (onScreen(x, y, 80)) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(j.a); ctx.scale(k, k);
      ctx.fillStyle = tint('#8a9099', nb); ctx.beginPath(); ctx.moveTo(26, 0); ctx.lineTo(-14, -22); ctx.lineTo(-8, 0); ctx.lineTo(-14, 22); ctx.closePath(); ctx.fill();
      ctx.fillStyle = tint('#5d636b', nb); ctx.fillRect(-18, -3, 30, 6);
      ctx.fillStyle = 'rgba(255,170,60,.85)'; ctx.beginPath(); ctx.arc(-20, 0, 4, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }
  const bl = HQ.carrier;
  if (bl) { // the Helicarrier and its searchlight
    const [x, y, k] = P(bl, bl.fall ? CARRIER_Z * Math.max(0, 1 - bl.fall / 4) : CARRIER_Z);
    if (!bl.fall && onScreen(bl.lx, bl.ly, 200)) {
      const a = Math.atan2(bl.ly - y, bl.lx - x), r = 120;
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(220,235,255,${0.05 + 0.15 * NIGHT})`;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(bl.lx + Math.cos(a + Math.PI / 2) * r, bl.ly + Math.sin(a + Math.PI / 2) * r); ctx.lineTo(bl.lx + Math.cos(a - Math.PI / 2) * r, bl.ly + Math.sin(a - Math.PI / 2) * r); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(bl.lx, bl.ly, 140, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    if (onScreen(x, y, 520)) {
      shadow(bl, 175 * CARRIER_SC * k, 62 * CARRIER_SC * k, bl.a);
      ctx.save(); ctx.translate(x, y); ctx.rotate(bl.a + (bl.fall ? bl.fall * 0.15 : 0)); ctx.scale(k * CARRIER_SC, k * CARRIER_SC);
      drawCarrier(nb, on, bl.fall);
      ctx.restore();
    }
  }
  drawHeroes(true);
}
// a flying aircraft carrier, seen from above (bow to +x): the hull and its flight deck, the island on the starboard side,
// jets parked on deck, and four lift rotors on outriggers, two each side
const CARRIER_SC = 0.6;
function drawCarrier(nb, on, fall) {
  const c = h => tint(h, nb);
  for (const [rx, ry] of [[90, 1], [-90, 1], [90, -1], [-90, -1]]) { ctx.fillStyle = c('#39404a'); ctx.fillRect(rx - 9, ry * 26, 18, ry * 30); } // (the outriggers)
  ctx.fillStyle = c('#454d58'); ctx.beginPath(); // the hull
  ctx.moveTo(165, 0); ctx.lineTo(128, -32); ctx.lineTo(-150, -32); ctx.lineTo(-165, -20); ctx.lineTo(-165, 20); ctx.lineTo(-150, 32); ctx.lineTo(128, 32); ctx.closePath(); ctx.fill();
  ctx.fillStyle = c('#5b6470'); ctx.beginPath(); // the flight deck
  ctx.moveTo(150, 0); ctx.lineTo(122, -26); ctx.lineTo(-146, -26); ctx.lineTo(-158, -16); ctx.lineTo(-158, 16); ctx.lineTo(-146, 26); ctx.lineTo(122, 26); ctx.closePath(); ctx.fill();
  ctx.save(); ctx.rotate(-0.12); ctx.fillStyle = c('#4e5661'); ctx.fillRect(-150, -18, 250, 22); ctx.restore(); // (the angled runway)
  ctx.fillStyle = c('#e9e9e3'); for (let x = -140; x < 140; x += 22) ctx.fillRect(x, -1, 11, 2); // (its centre line)
  ctx.fillStyle = c('#e2b437'); for (let x = -150; x < 120; x += 14) { ctx.fillRect(x, -25, 7, 1.5); ctx.fillRect(x, 23.5, 7, 1.5); }
  ctx.fillStyle = c('#2c3138'); ctx.fillRect(-60, 10, 14, 12); ctx.fillRect(40, -24, 14, 10); // (the lifts)
  for (const [jx, jy] of [[-128, -14], [-112, -14], [-96, -14], [-128, 14]]) { // jets parked aft
    ctx.fillStyle = c('#8b939c'); ctx.beginPath(); ctx.moveTo(jx + 7, jy); ctx.lineTo(jx - 5, jy - 6); ctx.lineTo(jx - 3, jy); ctx.lineTo(jx - 5, jy + 6); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = c('#2f343b'); ctx.fillRect(4, 19, 54, 13); ctx.fillStyle = c('#7d8792'); ctx.fillRect(8, 21, 46, 9); // the island
  ctx.fillStyle = c('#1d2128'); ctx.fillRect(20, 22, 18, 3); ctx.fillStyle = c('#a8b0b8'); ctx.beginPath(); ctx.arc(46, 25.5, 3, 0, TAU); ctx.fill(); // (its bridge and radar)
  const sp = fall ? 6 : 22;
  for (const [rx, ry] of [[90, 62], [-90, 62], [90, -62], [-90, -62]]) { // the lift rotors, each in its ring
    ctx.fillStyle = c('#2a2f36'); ctx.beginPath(); ctx.arc(rx, ry, 32, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(150,160,175,.18)'; ctx.beginPath(); ctx.arc(rx, ry, 27, 0, TAU); ctx.fill(); // (the blur of the blades)
    ctx.save(); ctx.translate(rx, ry); ctx.rotate(time * sp * (rx > 0 ? 1 : -1));
    ctx.fillStyle = c('#4c535c'); for (let i = 0; i < 3; i++) { ctx.rotate(TAU / 3); ctx.fillRect(-2.5, 0, 5, 26); }
    ctx.restore();
    ctx.fillStyle = c('#5b6470'); ctx.beginPath(); ctx.arc(rx, ry, 6, 0, TAU); ctx.fill();
    ctx.strokeStyle = c('#59616c'); ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(rx, ry, 30, 0, TAU); ctx.stroke();
  }
  ctx.fillStyle = fall ? '#ff5a1f' : on ? '#ff3030' : '#661010'; ctx.beginPath(); ctx.arc(-120, -62 - 34, 3, 0, TAU); ctx.arc(-160, 0, 3, 0, TAU); ctx.fill(); // (port and stern lights)
  ctx.fillStyle = fall ? '#ff5a1f' : on ? '#3dff6e' : '#105f22'; ctx.beginPath(); ctx.arc(-120, 62 + 34, 3, 0, TAU); ctx.fill(); // (starboard)
  ctx.fillStyle = on ? '#ffffff' : '#8a8a8a'; ctx.beginPath(); ctx.arc(165, 0, 2.5, 0, TAU); ctx.fill();
}
// P.L.A.N.C.K.'s heroes: on the ground among the people (air false), or up in the air, and the Tunneler inside a wall,
// over the roofs (air true); seen from above, each facing +x
function drawHeroes(air) {
  if (!HQ.heroes || !HQ.heroes.length) return;
  const nb = air ? 1 + NIGHT * 1.6 : 1, c = h => air ? tint(h, nb) : h;
  for (const h of HQ.heroes) {
    if (!air && h.wave) { const w = h.wave, f = w.t / 0.55; ctx.strokeStyle = `rgba(255,214,120,${0.9 * (1 - f)})`; ctx.lineWidth = 5 * (1 - f) + 1; ctx.beginPath(); ctx.arc(w.x, w.y, 20 + f * 140, 0, TAU); ctx.stroke(); }
    const aloft = h.z > 0.02 || h.ph === 'up' || (h.k === 'tunneler' && h.wall);
    if (aloft !== air) continue;
    const k = 1 + h.z, x = cam.x + (h.x - cam.x) * k, y = cam.y + (h.y - cam.y) * k;
    if (air && h.beam) { // the Collapser's visor beam
      const b = h.beam, f = b.t / 0.2;
      ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(120,235,255,${0.7 * f})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${f})`; ctx.lineWidth = 1.3; ctx.stroke();
      ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'butt';
    }
    if (!onScreen(x, y, 60)) continue;
    const up = h.ph === 'up' ? clamp(1 - h.t / 1.4, 0, 1) : 1;
    if (h.ph === 'up') { ctx.fillStyle = `rgba(120,235,255,${0.35 * up})`; ctx.beginPath(); ctx.arc(h.x, h.y, 14, 0, TAU); ctx.fill(); } // (beamed back up)
    else if (h.z > 0.02) { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(h.x + 2, h.y + 3, h.k === 'bigbang' ? 9 : 6, h.k === 'bigbang' ? 6 : 4, 0, 0, TAU); ctx.fill(); }
    const sc = { collapser: 1.45, spooky: 1.45, bigbang: 1.9, tunneler: 1.4 }[h.k];
    ctx.save(); ctx.translate(x, y); ctx.rotate(h.a + (h.ph === 'down' ? 1.2 : 0)); ctx.scale(k * sc, k * sc);
    ctx.globalAlpha = up * (h.k === 'tunneler' && h.wall ? 0.5 : h.ph === 'down' ? 0.85 : 1);
    const sw = (h.ph === 'go' ? Math.sin(h.anim) : 0) * 3;
    if (h.k === 'collapser') { // grey armour, arms ahead, the lens on his back and the visor glowing cyan; thrusters at his heels
      if (h.ph !== 'down') { ctx.fillStyle = `rgba(160,240,255,${0.55 + 0.3 * Math.sin(time * 40)})`; ctx.beginPath(); ctx.ellipse(-12, -2, 4, 1.5, 0, 0, TAU); ctx.ellipse(-12, 2, 4, 1.5, 0, 0, TAU); ctx.fill(); }
      ctx.fillStyle = c('#4a5563'); ctx.fillRect(-9.5, -3.2, 6.5, 2.2); ctx.fillRect(-9.5, 1, 6.5, 2.2); ctx.fillRect(2, -5.4, 7, 1.8); ctx.fillRect(2, 3.6, 7, 1.8);
      ctx.fillStyle = c('#6f7d8c'); ctx.beginPath(); ctx.ellipse(-1, 0, 5.5, 4.6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = c('#a9b8c6'); ctx.beginPath(); ctx.ellipse(-1, 0, 3.4, 2.8, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#3cf0ff'; ctx.beginPath(); ctx.arc(-1, 0, 1.4, 0, TAU); ctx.fill();
      ctx.fillStyle = c('#8d9bab'); ctx.beginPath(); ctx.arc(6, 0, 3, 0, TAU); ctx.fill();
      ctx.fillStyle = '#7ff6ff'; ctx.fillRect(7.6, -1.7, 1.3, 3.4);
    } else if (h.k === 'spooky') { // a spy in black, silver hair, a cyan ∞ on her back, the shockers at her wrists
      ctx.fillStyle = c('#15151b'); ctx.fillRect(sw - 2, -3, 4, 2.2); ctx.fillRect(-sw - 2, 0.8, 4, 2.2);
      ctx.fillStyle = c('#1d1d26'); ctx.beginPath(); ctx.ellipse(0, 0, 3, 5, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#3cf0ff'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(-1.8, -1.1, 1, 0, TAU); ctx.moveTo(-0.8, 1.1); ctx.arc(-1.8, 1.1, 1, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#7ff6ff'; ctx.beginPath(); ctx.arc(2.6, -4.3, 0.9, 0, TAU); ctx.arc(2.6, 4.3, 0.9, 0, TAU); ctx.fill();
      ctx.fillStyle = c('#e2bfa3'); ctx.beginPath(); ctx.arc(0.6, 0, 2.7, 0, TAU); ctx.fill();
      ctx.fillStyle = c('#d9dde3'); ctx.beginPath(); ctx.arc(-0.2, 0, 3.1, Math.PI * 0.4, Math.PI * 1.6); ctx.fill();
    } else if (h.k === 'bigbang') { // a giant in navy, a burst on his back, his fists up when he lifts a car
      ctx.fillStyle = c('#1e2547'); ctx.fillRect(sw * 0.6 - 2.5, -4, 5, 3); ctx.fillRect(-sw * 0.6 - 2.5, 1, 5, 3);
      const ax = h.lift > 0 ? 4 : 0;
      ctx.fillStyle = c('#26305a'); ctx.fillRect(-1.5 + ax, -8.6, 6, 2.6); ctx.fillRect(-1.5 + ax, 6, 6, 2.6);
      ctx.fillStyle = c('#c68642'); ctx.beginPath(); ctx.arc(5 + ax, -7.3, 1.8, 0, TAU); ctx.arc(5 + ax, 7.3, 1.8, 0, TAU); ctx.fill();
      ctx.fillStyle = c('#26305a'); ctx.beginPath(); ctx.ellipse(0, 0, 4.6, 6.8, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffcc33'; ctx.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, r = i % 2 ? 1.3 : 3.2; ctx.lineTo(-0.8 + Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill();
      ctx.fillStyle = c('#c68642'); ctx.beginPath(); ctx.arc(1.6, 0, 2.9, 0, TAU); ctx.fill();
    } else { // the Tunneler: work clothes, a hard hat with a lamp, a pack on his back; in a wall, ripples round him
      if (h.wall) { ctx.strokeStyle = 'rgba(60,240,255,.7)'; ctx.lineWidth = 0.8; for (let i = 0; i < 2; i++) { const r = 5 + ((time * 14 + i * 6) % 12); ctx.globalAlpha = up * 0.6 * (1 - (r - 5) / 12); ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke(); } ctx.globalAlpha = up * 0.5; }
      ctx.fillStyle = c('#4e4032'); ctx.fillRect(sw - 2, -3.4, 4, 2.4); ctx.fillRect(-sw - 2, 1, 4, 2.4);
      ctx.fillStyle = c('#6d5a45'); ctx.beginPath(); ctx.ellipse(0, 0, 3.6, 5.8, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = c('#3e3328'); ctx.fillRect(-5, -2.8, 3, 5.6); ctx.fillStyle = '#3cf0ff'; ctx.fillRect(-4.2, -0.6, 1.4, 1.2);
      ctx.fillStyle = c('#c9a227'); ctx.beginPath(); ctx.arc(0.6, 0, 3.2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff5c0'; ctx.beginPath(); ctx.arc(3.2, 0, 0.9, 0, TAU); ctx.fill();
    }
    if (h.hit > 0) { ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill(); }
    ctx.restore(); ctx.globalAlpha = 1;
    if (h.ph === 'down') { ctx.fillStyle = '#ffe14d'; for (let i = 0; i < 3; i++) { const a = time * 4 + i * TAU / 3; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 9, y - 12 + Math.sin(a) * 3, 1.4, 0, TAU); ctx.fill(); } } // (seeing stars)
    if (h.ph === 'go' || h.ph === 'drop') { // the name, and the health left once hurt
      const ty = y - 9 * k * sc - 4, H0 = HEROES[h.k];
      ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.strokeText(H0.name, x, ty); ctx.fillStyle = H0.c; ctx.fillText(H0.name, x, ty);
      if (h.hp < H0.hp) { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x - 13, ty + 2, 26, 3.5); ctx.fillStyle = H0.c; ctx.fillRect(x - 12.5, ty + 2.5, 25 * clamp(h.hp / H0.hp, 0, 1), 2.5); }
    }
  }
}
// the sweep (a band of measurement crossing the screen) and the Bell measurement's dial
function drawWantedHUD() {
  if (HQ.sweep > 0) {
    const f = 1 - HQ.sweep / 1.6, x = -120 + f * (W + 240);
    const g = ctx.createLinearGradient(x - 120, 0, x + 20, 0); g.addColorStop(0, 'rgba(60,240,255,0)'); g.addColorStop(0.85, 'rgba(60,240,255,.35)'); g.addColorStop(1, 'rgba(200,255,255,.8)');
    ctx.fillStyle = g; ctx.fillRect(x - 120, 0, 140, H);
    ctx.fillStyle = `rgba(60,240,255,${0.06 * (1 - f)})`; ctx.fillRect(0, 0, W, H);
  }
  const b = HQ.bell;
  if (b) {
    const cx = W / 2, cy = H / 2 - 40, r = 70;
    ctx.fillStyle = 'rgba(8,14,24,.85)'; ctx.fillRect(cx - 130, cy - 110, 260, 230);
    ctx.strokeStyle = '#3cf0ff'; ctx.lineWidth = 2; ctx.strokeRect(cx - 130, cy - 110, 260, 230);
    txt('BELL MEASUREMENT', cx, cy - 86, 15, '#3cf0ff', 'center', true);
    ctx.strokeStyle = 'rgba(60,240,255,.35)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#2ee88a'; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(cx, cy, r, b.win - 0.36, b.win + 0.36); ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(b.ang) * (r + 6), cy + Math.sin(b.ang) * (r + 6)); ctx.stroke();
    for (let i = 0; i < 3; i++) { ctx.fillStyle = i < b.round ? (i < b.hits + (b.round - b.hits) && i >= b.hits ? '#ff6b6b' : '#2ee88a') : '#334'; ctx.beginPath(); ctx.arc(cx - 24 + i * 24, cy + r + 24, 7, 0, TAU); ctx.fill(); }
    txt(`${touchOn() ? '●' : 'Space'}: measure as the arrow crosses the window`, cx, cy + r + 50, 11, '#cfe', 'center');
  }
}
function updateWorld(dt) {
  time += dt;
  heatCd -= dt;
  { const nd = dayT + dt / DAY_LEN; if (nd >= 1) { dayN++; ach('day'); } dayT = nd % 1; } // (and the days go by: see weekday)
  flight.t -= dt;
  if (!flight.on && flight.t <= 0) Object.assign(flight, { on: true, x: AIRPORT.rx0 + 30, v: 0, alt: 0 });
  if (flight.on) {
    flight.v = Math.min(430, flight.v + 75 * dt); flight.x += flight.v * dt;
    if (flight.x > AIRPORT.rx0 + 380) flight.alt += dt * 0.35;
    if (flight.alt > 3) { flight.on = false; flight.t = 40; }
  }
  if (!player.hidden) updatePlayer(dt);
  if (NET.guest) {
    const g = NET.guest; if (performance.now() - (g.lastIn || 0) > 600) for (const k in g.keys) g.keys[k] = 0; // (the guest's tab went quiet)
    asGuest(() => { if (!player.hidden) updatePlayer(dt); });
  }
  const vs = allCams().map(c => viewRect(900, c));
  const active = cars.filter(c => vs.some(v => c.x > v.x0 && c.x < v.x1 && c.y > v.y0 && c.y < v.y1));
  for (const c of active) {
    if (c.heldBy || c.thrown > 0) continue; // (a car in the tweezer moves with the trap, below; one Big Bang threw, in updateHeroes)
    const px = c.x, py = c.y;
    if (c.door && !c.doorHold) c.door = Math.max(0, c.door - dt * 3.5); // (a door swings shut behind whoever got in)
    if ((c.labStatic || c.jackHold) && c.driver !== 'player') applyControls(c, 0, 0, true, dt); // (and a car being jacked stops)
    else if (c.driver === 'ai') aiTraffic(c, dt);
    else if (c.driver === 'police') aiPolice(c, dt);
    else if (c.driver === 'eve') aiEve(c, dt);
    else if (c.driver === 'service') aiService(c, dt);
    else if (c.driver === 'boat') aiBoat(c, dt);
    else if (c.driver !== 'player') applyControls(c, 0, 0, true, dt);
    moveCar(c, dt);
    if (c.parked && (Math.abs(c.x - px) > 0.5 || Math.abs(c.y - py) > 0.5)) c.moved = true;
  }
  WIND += Math.sin(time * 0.05) * dt * 0.01; // (the wind veers a little)
  for (const c of cars) if (c.dead && CT[c.type].boat) c.sink = (c.sink || 0) + dt; // (a wrecked boat goes down)
  if (cars.some(c => c.sink > 7 && c !== player.car)) cars = cars.filter(c => !(c.sink > 7) || c === player.car);
  for (const c of cars) { // fires burn everywhere (entangled twins can be far away)
    if (c.fire > 0) {
      c.fire -= dt;
      if (Math.random() < 0.6) addPart(c.x + rand(-6, 6), c.y + rand(-6, 6), rand(-10, 10), rand(-30, -10), 0.6, rand(3, 6), pick(['#ff9c2a', '#ffdf6b', '#ff5a1f']), 6, true);
      if (c.fire <= 0) explodeCar(c);
    } else if (!c.dead && c.hp < CT[c.type].hp * 0.35 && Math.random() < 0.25) {
      addPart(c.x + Math.cos(c.angle) * CT[c.type].l * 0.35, c.y + Math.sin(c.angle) * CT[c.type].l * 0.35, rand(-8, 8), rand(-20, -5), 1, 4, '#777', 6, true);
    }
  }
  updateTow(dt);
  updateZones(dt);
  collideCars(active);
  collideCarPeds(active);
  updateTrams(dt, active);
  if (player.car) { player.x = player.car.x; player.y = player.car.y; }
  updateBranches(dt);
  if (NET.guest) asGuest(() => { if (player.car) { player.x = player.car.x; player.y = player.car.y; } updateBranches(dt); });
  for (const p of peds) updatePed(p, dt);
  updateBullets(dt);
  updateHeli(dt);
  for (let i = parts.length - 1; i >= 0; i--) {
    const q = parts[i];
    q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.94; q.vy *= 0.94; q.size += q.grow * dt; q.life -= dt;
    if (q.life <= 0) parts.splice(i, 1);
  }
  if (!player.hidden) {
    updatePickups(dt);
    updateDrops(dt);
    updateMissions(dt);
    updateBelief(dt);
    updateWanted(dt);
    // the wanted level fades once the police have lost track of you
    if (heat > 0 && time - lastCrime > 5 && !belief.seen && (belief.sig > 250 || heat < 1 || Q.decoyT > 0)) heat = Math.max(heat >= 7 ? Math.floor(heat) : 0, heat - dt * 0.12); // (from 7 up only the level's way out ends it)
    updateLink(dt);
    const nm = placeName(player.x, player.y);
    if (nm !== curDistrict) { curDistrict = nm; msg(`— ${nm} —`, 2.5); }
    if (SITE_PSI && !lab) { // trespassing at Site Ψ brings the guards
      const P = pp(), inside = P.x > SITE_PSI.x0 && P.x < SITE_PSI.x1 && P.y > SITE_PSI.y0 && P.y < SITE_PSI.y1;
      if (inside && !player.inPsi) { msg('RESTRICTED AREA. The guards open fire.', 3); if (heat < 3) addHeat(3 - heat); sfx.bad(); }
      player.inPsi = inside;
    }
    if (Q.bb) { Q.bb.t -= dt; if (Q.bb.t <= 0 || hit('KeyN')) Q.bb = null; }
    if (lab) updateLab();
    if (Q.note) { Q.note.t -= dt; if (Q.note.t <= 0 || hit('KeyN')) Q.note = null; }
  }
  if (NET.guest) asGuest(() => {
    if (player.hidden) return;
    updatePickups(dt); updateDrops(dt); updateLink(dt);
    const nm = placeName(player.x, player.y);
    if (nm !== curDistrict) { curDistrict = nm; msg(`— ${nm} —`, 2.5); }
    if (Q.note) { Q.note.t -= dt; if (Q.note.t <= 0 || hit('KeyN')) Q.note = null; }
    updateCamera(dt);
  });
  ageDrops(dt);
  if (BRNO) updateEggs(dt);
  manageSpawns(dt);
  if (NET.guest) { asGuest(() => manageSpawns(dt)); for (const k in NET.guest.pressed) delete NET.guest.pressed[k]; } // (each press counts once)
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
  if (state === 'play' && heat >= 1) for (const q of cars) if (q.chase && q.driver === 'police' && !q.dead && d2(q.x, q.y, player.x, player.y) < 700 * 700) { chase = true; break; }
  sirenGain.gain.setTargetAtTime(chase ? 0.035 : 0, t, 0.2);
  sirenOsc.frequency.setTargetAtTime(Math.sin(time * 5) > 0 ? 960 : 720, t, 0.03);
  musicTick(!!c && radio > 0 && state === 'play');
}

// ============================================================ drawing
// ---- procedural textures: seamless noise rendered once into small canvases and used as repeating patterns.
// Everything is generated from fixed seeds, so the city looks the same on every visit.
function prng(s) { return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// fractal value noise over a w x h tile that wraps seamlessly; cx, cy = lattice cells across the tile at the coarsest
// octave. Each field is computed once as a whole array (much faster than per-pixel hashing) and looked up per texel.
function noiseMap(w, h, cx, cy, oct, s) {
  const out = new Float32Array(w * h);
  let tot = 0;
  for (let o = 0, a = 1; o < oct; o++, a *= 0.5) {
    const px = cx << o, py = cy << o, L = new Float32Array(px * py);
    for (let j = 0; j < py; j++) for (let i = 0; i < px; i++) L[j * px + i] = hash3(i, j, s + o * 7919);
    for (let y = 0; y < h; y++) {
      const fy = y * py / h, yi = fy | 0, v = fy - yi, sv = v * v * (3 - 2 * v), r0 = yi * px, r1 = ((yi + 1) % py) * px;
      for (let x = 0; x < w; x++) {
        const fx = x * px / w, xi = fx | 0, u = fx - xi, su = u * u * (3 - 2 * u), x1 = (xi + 1) % px;
        const A = L[r0 + xi], B = L[r0 + x1], C = L[r1 + xi], D = L[r1 + x1];
        out[y * w + x] += a * (A + (B - A) * su + (C - A) * sv + (A - B - C + D) * su * sv);
      }
    }
    tot += a;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
const NM = new Map(); // noise fields while the textures are built (every call site has its own seed)
function fbm(x, y, w, h, cx, cy, oct, s) {
  const k = s * 4096 + w;
  let m = NM.get(k);
  if (!m) { m = noiseMap(w, h, cx, cy, oct, s); NM.set(k, m); }
  return m[y * w + x];
}
// a texture filled pixel by pixel (fn writes r, g, b, a into o), then optionally drawn on (post)
function texCv(w, h, fn, post) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), im = g.createImageData(w, h), d = im.data, o = [0, 0, 0, 255];
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i += 4) { o[3] = 255; fn(x, y, o); d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2]; d[i + 3] = o[3]; }
  g.putImageData(im, 0, 0);
  if (post) post(g, w, h);
  return c;
}
const patOf = c => ctx.createPattern(c, 'repeat');
// strokes drawn at all nine wrap offsets keep a tile seamless
function wrapDraw(g, w, h, fn) { for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { g.save(); g.translate(ox, oy); fn(g); g.restore(); } }
// hairline cracks: jittery random walks, optionally wide and dark like tar-sealed joints
function cracks(g, w, h, rnd, n, len, width, col) {
  g.strokeStyle = col; g.lineWidth = width; g.lineJoin = 'round'; g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    let x = rnd() * w, y = rnd() * h, a = rnd() * TAU;
    const pts = [[x, y]], L = len * (0.5 + rnd());
    for (let s = 0; s < L; s += 3) { a += (rnd() - 0.5) * 0.9; x += Math.cos(a) * 3; y += Math.sin(a) * 3; pts.push([x, y]); }
    wrapDraw(g, w, h, gg => { gg.beginPath(); gg.moveTo(pts[0][0], pts[0][1]); for (const p of pts) gg.lineTo(p[0], p[1]); gg.stroke(); });
  }
}
// a signed overlay texel: s > 0 lightens, s < 0 darkens (A = strength); used for wall and roof detail over tinted colours
const ovl = (o, s, A = 1) => { o[0] = o[1] = o[2] = s > 0 ? 255 : 0; o[3] = Math.min(255, Math.abs(s) * A * 255); };

// ground: 1 texel per world pixel
function asphaltTex(base, seed, wear) {
  return texCv(256, 256, (x, y, o) => {
    const lo = fbm(x, y, 256, 256, 4, 4, 4, seed), mid = fbm(x, y, 256, 256, 32, 32, 2, seed + 1), h = hash3(x, y, seed + 2);
    let v = base + (lo - 0.5) * 22 * wear + (mid - 0.5) * 12 + (h - 0.5) * 12;
    if (h > 0.986) v += 20 + 22 * hash3(y, x, seed + 3);       // pale aggregate showing through
    else if (h < 0.02) v -= 13;                                 // pits
    o[0] = v; o[1] = v; o[2] = v + 4;
  }, (g, w, h) => {
    const rnd = prng(seed);
    cracks(g, w, h, rnd, Math.round(2 * wear), 70, 2.2, 'rgba(12,12,14,.3)');    // tar-sealed cracks
    cracks(g, w, h, rnd, Math.round(4 * wear), 40, 0.8, 'rgba(10,10,12,.45)');   // open hairline cracks
  });
}
const sidewalkTex = () => texCv(128, 128, (x, y, o) => {
  const fx = x & 15, fy = y & 15, slab = (hash3(x >> 4, y >> 4, 40) - 0.5) * 16;
  const st = fbm(x, y, 128, 128, 8, 8, 3, 41), h = hash3(x, y, 42);
  let v = 144 + slab + (st - 0.5) * 18 + (h - 0.5) * 10;
  if (fx === 0 || fy === 0) v -= 34; else if (fx === 1 || fy === 1) v += 9; else if (fx === 15 || fy === 15) v -= 7;
  o[0] = v; o[1] = v - 4; o[2] = v - 11;
}, (g, w, h) => {
  const rnd = prng(43);
  for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(40,38,36,${0.15 + rnd() * 0.25})`; g.beginPath(); g.arc(rnd() * w, rnd() * h, 0.6 + rnd() * 1.1, 0, TAU); g.fill(); } // chewing gum
  cracks(g, w, h, rnd, 3, 14, 0.7, 'rgba(30,28,26,.45)');
});
const grassTex = () => texCv(256, 256, (x, y, o) => {
  const lo = fbm(x, y, 256, 256, 3, 3, 3, 50), mid = fbm(x, y, 256, 256, 16, 16, 3, 51), h = hash3(x, y, 52);
  const dry = clamp((fbm(x, y, 256, 256, 5, 5, 2, 53) - 0.6) * 4, 0, 1);
  const n = (lo - 0.5) * 30 + (mid - 0.5) * 30 + (h - 0.5) * 34;
  o[0] = 58 + n * 0.8 + dry * 46; o[1] = 118 + n + dry * 14; o[2] = 50 + n * 0.45 + dry * 6;
}, (g, w, h) => {
  const rnd = prng(54);
  g.lineWidth = 1; g.lineCap = 'round';
  for (let i = 0; i < 2600; i++) { // blades of grass
    const x = rnd() * w, y = rnd() * h, a = -Math.PI / 2 + (rnd() - 0.5) * 1.4, l = 2 + rnd() * 2.5;
    g.strokeStyle = rnd() < 0.5 ? `rgba(120,180,90,${0.25 + rnd() * 0.3})` : `rgba(20,60,22,${0.25 + rnd() * 0.3})`;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(92,70,44,${0.2 + rnd() * 0.3})`; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2); } // bare earth
});
// paving: 16x8 bricks laid in running bond
const plazaTex = () => texCv(128, 128, (x, y, o) => {
  const row = y >> 3, sh = (row & 1) * 8, col = ((x + sh) >> 4) & 7, fx = (x + sh) & 15, fy = y & 7;
  const t = (hash3(col, row, 60) - 0.5) * 18, wv = fbm(x, y, 128, 128, 4, 4, 3, 61), h = hash3(x, y, 62);
  let v = 116 + t + (wv - 0.5) * 18 + (h - 0.5) * 9;
  if (fx === 0 || fy === 0) v -= 26; else if (fx === 1 || fy === 1) v += 7;
  const warm = hash3(col, row, 63) < 0.25 ? 8 : 0;
  o[0] = v + 6 + warm; o[1] = v + 2; o[2] = v - 3 - warm;
});
const waterTex = () => texCv(256, 256, (x, y, o) => {
  const deep = fbm(x, y, 256, 256, 3, 3, 3, 70), rip = fbm(x, y, 256, 256, 8, 32, 3, 71);
  const glint = Math.max(0, rip - 0.64) * 1.5;
  o[0] = 20 + deep * 14 + glint * 50; o[1] = 60 + deep * 26 + glint * 64; o[2] = 96 + deep * 32 + glint * 60;
});
// stone: blocks of bw x bh with mortar lines, in running bond
const stoneTex = (n, bw, bh, base, seed, joint = 32) => texCv(n, n, (x, y, o) => {
  const row = Math.floor(y / bh), sh = (row & 1) * (bw >> 1), col = Math.floor((x + sh) / bw) % (n / bw), fx = (x + sh) % bw, fy = y % bh;
  const t = (hash3(col, row, seed) - 0.5) * joint * 0.6, wv = fbm(x, y, n, n, 4, 4, 3, seed + 1), h = hash3(x, y, seed + 2);
  let v = base + t + (wv - 0.5) * 16 + (h - 0.5) * 10;
  if (fx === 0 || fy === 0) v -= joint; else if (fx === 1 || fy === 1) v += 6;
  o[0] = v + 4; o[1] = v; o[2] = v - 7;
});
const deckTex = () => texCv(64, 64, (x, y, o) => {
  const v = 76 + (fbm(x, y, 64, 64, 4, 4, 3, 80) - 0.5) * 16 + (hash3(x, y, 81) - 0.5) * 12 - (y === 0 ? 24 : y === 1 ? -8 : 0); // an expansion joint per tile
  o[0] = v; o[1] = v; o[2] = v + 5;
});
// grime: broad dirt and sun-bleached patches laid over all the ground (one texel = 2 world px)
const grimeTex = () => texCv(256, 256, (x, y, o) => {
  const d = fbm(x, y, 256, 256, 5, 5, 4, 90), b = fbm(x, y, 256, 256, 3, 3, 3, 91);
  const dark = clamp((d - 0.5) * 0.65, 0, 0.17), light = clamp((0.36 - b) * 0.4, 0, 0.06);
  if (dark >= light) { o[0] = 24; o[1] = 20; o[2] = 14; o[3] = dark * 255; } else { o[0] = 255; o[1] = 250; o[2] = 236; o[3] = light * 255; }
});
// ---- the countryside's ground: sand, forest floor, dry grass, rock, snow, dirt, and crops planted in rows
const RIP = TAU / 256;
const sandTex = (r, g, b, seed, ripple) => texCv(256, 256, (x, y, o) => {
  const lo = fbm(x, y, 256, 256, 3, 3, 3, seed), mid = fbm(x, y, 256, 256, 24, 24, 2, seed + 1), h = hash3(x, y, seed + 2);
  const rip = Math.sin(x * RIP * 14 + y * RIP * 5 + lo * 9) * 0.5 + 0.5; // wind ripples
  const n = (lo - 0.5) * 26 + (mid - 0.5) * 12 + (h - 0.5) * 16 + (rip - 0.5) * ripple;
  o[0] = r + n; o[1] = g + n * 0.9; o[2] = b + n * 0.75;
  if (h > 0.993) { o[0] -= 46; o[1] -= 44; o[2] -= 40; } else if (h < 0.004) { o[0] += 30; o[1] += 30; o[2] += 34; } // pebbles and shell bits
});
const scrubTex = (r, g, b, seed, needles) => texCv(256, 256, (x, y, o) => {
  const lo = fbm(x, y, 256, 256, 4, 4, 3, seed), mid = fbm(x, y, 256, 256, 20, 20, 2, seed + 1), h = hash3(x, y, seed + 2);
  const n = (lo - 0.5) * 34 + (mid - 0.5) * 18 + (h - 0.5) * 22;
  o[0] = r + n * 0.9; o[1] = g + n; o[2] = b + n * 0.5;
}, (g, w, h) => {
  const rnd = prng(seed + 3); g.lineCap = 'round'; g.lineWidth = 1;
  for (let i = 0; i < 1800; i++) {
    const x = rnd() * w, y = rnd() * h, a = rnd() * TAU, l = needles ? 2 + rnd() * 3 : 2 + rnd() * 2;
    g.strokeStyle = needles ? (rnd() < 0.5 ? `rgba(110,72,40,${0.3 + rnd() * 0.3})` : `rgba(20,40,18,${0.3 + rnd() * 0.3})`) : (rnd() < 0.5 ? `rgba(200,180,110,${0.3 + rnd() * 0.3})` : `rgba(90,80,40,${0.25 + rnd() * 0.3})`);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
});
const rockTex = () => texCv(256, 256, (x, y, o) => {
  const lo = fbm(x, y, 256, 256, 4, 4, 4, 420), mid = fbm(x, y, 256, 256, 16, 16, 3, 421), h = hash3(x, y, 422);
  const strata = Math.sin(y * RIP * 18 + lo * 12) * 0.5 + 0.5, lich = clamp((fbm(x, y, 256, 256, 8, 8, 2, 423) - 0.62) * 5, 0, 1);
  const v = 116 + (lo - 0.5) * 50 + (mid - 0.5) * 26 + (h - 0.5) * 18 + (strata - 0.5) * 14;
  o[0] = v + 6 - lich * 14; o[1] = v + 2 + lich * 8; o[2] = v - 6 - lich * 24;
}, (g, w, h) => { const rnd = prng(424); cracks(g, w, h, rnd, 9, 60, 1.4, 'rgba(30,26,22,.5)'); cracks(g, w, h, rnd, 6, 40, 0.8, 'rgba(230,226,216,.25)'); });
const snowTex = () => texCv(128, 128, (x, y, o) => {
  const lo = fbm(x, y, 128, 128, 4, 4, 3, 430), h = hash3(x, y, 431), v = 230 + (lo - 0.5) * 22 + (h - 0.5) * 8;
  o[0] = v - 6; o[1] = v - 2; o[2] = v + 6;
});
const dirtTex = () => texCv(128, 128, (x, y, o) => {
  const lo = fbm(x, y, 128, 128, 4, 4, 3, 440), mid = fbm(x, y, 128, 128, 16, 16, 2, 441), h = hash3(x, y, 442);
  const v = (lo - 0.5) * 30 + (mid - 0.5) * 16 + (h - 0.5) * 18 - (h > 0.985 ? 30 : 0);
  o[0] = 126 + v; o[1] = 100 + v * 0.9; o[2] = 72 + v * 0.75;
});
// crops: rows run along x (the pattern is turned for fields that run the other way)
const cropTex = (fn, seed) => texCv(128, 128, (x, y, o) => fn(x, y, o, fbm(x, y, 128, 128, 4, 4, 3, seed), fbm(x, y, 128, 128, 4, 32, 2, seed + 1), hash3(x, y, seed + 2)));
const CROP = {
  wheat: patOf(cropTex((x, y, o, lo, st, h) => { const v = (lo - 0.5) * 24 + (st - 0.5) * 22 + (h - 0.5) * 20 - (y % 4 === 0 ? 16 : 0); o[0] = 204 + v; o[1] = 170 + v * 0.95; o[2] = 92 + v * 0.6; }, 450)),
  stubble: patOf(cropTex((x, y, o, lo, st, h) => { const v = (lo - 0.5) * 20 + (h - 0.5) * 26 - (y % 8 < 2 ? 18 : 0); o[0] = 196 + v; o[1] = 178 + v; o[2] = 124 + v * 0.8; }, 453)),
  plough: patOf(cropTex((x, y, o, lo, st, h) => { const f = Math.sin(y * RIP * 2 * 21) * 0.5 + 0.5, v = (lo - 0.5) * 26 + (h - 0.5) * 22 - f * 30; o[0] = 122 + v; o[1] = 92 + v * 0.9; o[2] = 62 + v * 0.7; }, 456)),
  green: patOf(cropTex((x, y, o, lo, st, h) => { const r = y % 8 < 5, v = (lo - 0.5) * 22 + (h - 0.5) * 30 + (st - 0.5) * 16;
    if (r) { o[0] = 78 + v * 0.6; o[1] = 136 + v; o[2] = 52 + v * 0.4; } else { o[0] = 112 + v * 0.6; o[1] = 86 + v * 0.5; o[2] = 60 + v * 0.4; } }, 459)),
  corn: patOf(cropTex((x, y, o, lo, st, h) => { const g2 = y % 8 === 0 ? -30 : y % 8 === 1 ? -14 : 0, v = (lo - 0.5) * 22 + (h - 0.5) * 36 + (st - 0.5) * 20 + g2; o[0] = 62 + v * 0.6; o[1] = 108 + v; o[2] = 40 + v * 0.4; }, 462)),
  vine: patOf(cropTex((x, y, o, lo, st, h) => { // a vineyard: rows of vines on posts, grass between
    const r = y % 10, v = (lo - 0.5) * 22 + (h - 0.5) * 34 + (st - 0.5) * 16;
    if (r < 5) { o[0] = 70 + v * 0.6; o[1] = 112 + v; o[2] = 46 + v * 0.4; if (x % 16 === 0 && r === 2) { o[0] = 90; o[1] = 70; o[2] = 50; } } else { o[0] = 118 + v * 0.5; o[1] = 120 + v * 0.6; o[2] = 70 + v * 0.3; }
  }, 468)),
  rape: patOf(cropTex((x, y, o, lo, st, h) => { const v = (lo - 0.5) * 24 + (h - 0.5) * 30 - (y % 4 === 0 ? 20 : 0); if (h < 0.12) { o[0] = 110 + v; o[1] = 140 + v; o[2] = 50; } else { o[0] = 228 + v * 0.4; o[1] = 206 + v * 0.7; o[2] = 62 + v * 0.3; } }, 465)),
};
const PAT = {
  sand: patOf(sandTex(206, 166, 112, 400, 16)), beach: patOf(sandTex(228, 210, 164, 404, 6)),
  forest: patOf(scrubTex(54, 76, 40, 410, true)), dry: patOf(scrubTex(158, 146, 84, 414, false)),
  rock: patOf(rockTex()), snow: patOf(snowTex()), dirt: patOf(dirtTex()),
  [ROAD]: patOf(asphaltTex(60, 10, 1)),
  hw: patOf(asphaltTex(50, 20, 0.6)),
  patch: patOf(asphaltTex(44, 30, 0.2)),
  get lot() { return this[ROAD]; },
  br: patOf(deckTex()),
  [WALK]: patOf(sidewalkTex()),
  [GRASS]: patOf(grassTex()),
  [PLAZA]: patOf(plazaTex()),
  [WATER]: patOf(waterTex()),
  [BUILD]: '#26262a',
  quay: patOf(stoneTex(64, 32, 16, 140, 100, 16)),
  grime: patOf(grimeTex()),
};
PAT.grime.setTransform({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 });

// walls and roofs: transparent detail drawn over the tinted base colour; 2 texels per world px
const WTEX = {
  brick: patOf(texCv(96, 96, (x, y, o) => {
    const row = (y / 6) | 0, sh = (row & 1) * 8, col = ((x + sh) >> 4) % 6, fx = (x + sh) & 15, fy = y % 6;
    if (fx === 0 || fy === 0) return ovl(o, 0.42);                           // pale mortar
    const t = (hash3(col, row, 200) - 0.5) * 0.36, burnt = hash3(col, row, 201) < 0.1 ? -0.22 : 0;
    ovl(o, t + burnt + (hash3(x, y, 202) - 0.5) * 0.12 + (fy === 5 ? -0.12 : 0));
  })),
  stone: patOf(texCv(96, 96, (x, y, o) => {
    const row = (y / 12) | 0, sh = (row & 1) * 12, col = ((x + sh) / 24 | 0) % 4, fx = (x + sh) % 24, fy = y % 12;
    if (fx === 0 || fy === 0) return ovl(o, -0.3);
    if (fx === 1 || fy === 1) return ovl(o, 0.12);
    const st = Math.max(0, fbm(x, y, 96, 96, 16, 2, 2, 205) - 0.55) * 0.9;     // rain streaks
    ovl(o, (hash3(col, row, 203) - 0.5) * 0.2 + (hash3(x, y, 204) - 0.5) * 0.1 - st);
  })),
  panel: patOf(texCv(128, 128, (x, y, o) => {
    if ((x & 31) === 0) return ovl(o, -0.3);                                  // panel joints
    const st = Math.max(0, fbm(x, y, 128, 128, 24, 2, 3, 206) - 0.5) * 0.7, bl = (fbm(x, y, 128, 128, 4, 4, 3, 207) - 0.5) * 0.18;
    ovl(o, bl - st + (hash3(x, y, 208) - 0.5) * 0.08);
  })),
  stucco: patOf(texCv(128, 128, (x, y, o) => {
    ovl(o, (fbm(x, y, 128, 128, 6, 6, 4, 209) - 0.5) * 0.3 + (hash3(x, y, 210) - 0.5) * 0.14);
  }, (g, w, h) => cracks(g, w, h, prng(211), 2, 20, 0.8, 'rgba(0,0,0,.35)'))),
  siding: patOf(texCv(64, 64, (x, y, o) => {
    const fy = y & 3;
    ovl(o, fy === 3 ? -0.4 : fy === 0 ? 0.16 : (fbm(x, y, 64, 64, 2, 16, 2, 212) - 0.5) * 0.2);
  })),
  metal: patOf(texCv(96, 96, (x, y, o) => {
    const rib = Math.sin(x / 6 * TAU), rust = Math.max(0, fbm(x, y, 96, 96, 12, 2, 3, 213) - 0.6) * 1.2;
    if (rust > 0.05) { o[0] = 120; o[1] = 62; o[2] = 30; o[3] = Math.min(150, rust * 300); return; }
    ovl(o, rib * 0.2 + (hash3(x, y, 214) - 0.5) * 0.06);
  })),
};
const RTEX = {
  gravel: patOf(texCv(128, 128, (x, y, o) => {
    const h = hash3(x, y, 220), b = (fbm(x, y, 128, 128, 4, 4, 3, 221) - 0.5) * 0.3;
    ovl(o, b + (h - 0.5) * 0.5 + (h > 0.97 ? 0.25 : 0));
  })),
  membrane: patOf(texCv(128, 128, (x, y, o) => {
    if (y % 32 === 0) return ovl(o, -0.35);                                   // seams between the sheets
    if (y % 32 === 1) return ovl(o, 0.16);
    ovl(o, (fbm(x, y, 128, 128, 4, 4, 4, 222) - 0.5) * 0.36 + (hash3(x, y, 223) - 0.5) * 0.08);
  }, (g, w, h) => { const rnd = prng(224); for (let i = 0; i < 4; i++) { g.fillStyle = `rgba(0,0,0,${0.1 + rnd() * 0.12})`; g.fillRect(rnd() * w, rnd() * h, 10 + rnd() * 20, 8 + rnd() * 14); } })),
  corr: patOf(texCv(64, 64, (x, y, o) => { ovl(o, Math.sin(x / 8 * TAU) * 0.24 + (fbm(x, y, 64, 64, 2, 8, 2, 225) - 0.5) * 0.2); })),
  // roof tiles: rows of barrel tiles (clay) or flat staggered slates; texel y grows toward the eave
  clay: patOf(texCv(64, 64, (x, y, o) => {
    const row = y >> 3, sh = (row & 1) * 4, fx = (x + sh) & 7, fy = y & 7;
    const barrel = Math.cos((fx + 0.5) / 8 * TAU) * -0.22, edge = fy === 7 ? -0.5 : fy === 6 ? -0.2 : fy < 2 ? -0.12 : 0;
    ovl(o, barrel + edge + (hash3(((x + sh) >> 3) & 7, row, 226) - 0.5) * 0.2);
  })),
  slate: patOf(texCv(64, 64, (x, y, o) => {
    const row = y >> 3, sh = (row & 1) * 8, fx = (x + sh) & 15, fy = y & 7;
    if (fy === 7) return ovl(o, -0.5);
    if (fx === 0) return ovl(o, -0.32);
    ovl(o, (hash3(((x + sh) >> 4) & 3, row, 227) - 0.5) * 0.24 + (hash3(x, y, 228) - 0.5) * 0.08);
  })),
};
NM.clear();
// a reusable matrix for pattern transforms (setTransform takes any {a..f} object)
const PM = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const setPM = (a, b, c, d, e, f) => { PM.a = a; PM.b = b; PM.c = c; PM.d = d; PM.e = e; PM.f = f; return PM; };
// which wall material a building is made of
function wallMat(b) {
  if (b.mat !== undefined) return b.mat;
  const r = (b.sd >>> 7) % 100, n = parseInt(b.wall.slice(1), 16), R = n >> 16, G = (n >> 8) & 255, B = n & 255;
  let m;
  if (b.style === 'glass') m = 'glass';
  else if (b.style === 'canopy' || b.style === 'stadium') m = b.style === 'stadium' ? 'panel' : null;
  else if (b.style === 'ware') m = r < 60 ? 'metal' : 'panel';
  else if (b.style === 'house') m = r < 50 ? 'stucco' : r < 78 ? 'brick' : 'siding';
  else if (b.kind === 'church' || b.kind === 'museum' || b.kind === 'hall') m = 'stone';
  else if (b.kind === 'fire' || b.kind === 'school') m = 'brick';
  else if (R > G + 25 && R > B + 30) m = 'brick';
  else if (R > 150 && R > B + 15 && b.kind !== 'shop') m = 'stone';
  else m = 'panel';
  return (b.mat = m);
}
const inRiver = (tx, ty) => tx >= 1 && tx < CW && ty >= 1 && ty < CH && Math.abs(ty + 0.5 - riverY(tx + 0.5)) < RIVER_HW + 0.5;
const RIVER_PX = RIVER.map(([x, y]) => [x * T, y * T]);
// the static ground is rendered once into cached chunks; only the water animates per frame
const CHK = 8 * T, chunkCache = new Map(), chunkPool = []; let chunkNew = 0; // (chunks drawn this frame)
let chunkS = 0;
// ---- the countryside's ground: the terrain fields are sampled every 4 px and used as soft masks that blend
// grass, forest floor, dry grass, sand, rock, snow and water into each other, then hill shading on top
const TSUB = 4, TSN = CHK / TSUB + 2, TSA = TSN * TSN;
const tsCv = document.createElement('canvas'); tsCv.width = tsCv.height = TSN;
const tsG = tsCv.getContext('2d'), tsIm = tsG.createImageData(TSN, TSN);
const TV = {}; for (const k of ['wa', 'ro', 'sd', 'sb', 'fo', 'dr', 'sn', 'sh', 'tw']) TV[k] = new Float32Array(TSA);
const TA = new Float32Array(TSA);
let scrCv = null, scrG = null;
let TVK = null, TVK5 = null; // (each sampled field: where its samples go, its grid, its fine detail)
function sampleTerrain(x0, y0, shadeOnly) { // (shadeOnly: just the hill shading, all inner Brno's ground uses)
  const K = shadeOnly ? TVK5 || (TVK5 = [[TV.sh, F.sh, DETA.sh]]) : TVK || (TVK = Object.keys(TV).map(k => [TV[k], F[k], DETA[k]])), nk = K.length;
  for (let j = 0, q = 0; j < TSN; j++) for (let i = 0; i < TSN; i++, q++) {
    const wx = x0 + (i - 0.5) * TSUB, wy = y0 + (j - 0.5) * TSUB, u = clamp(wx / T, 0, MW - 0.001), v = clamp(wy / T, 0, MH - 0.001);
    const ix = u | 0, iy = v | 0, fx = u - ix, fy = v - iy, g = iy * GW + ix;
    const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy, X = wx | 0, Y = wy | 0;
    for (let t = 0; t < nk; t++) {
      const e = K[t], A = e[1]; let val = A[g] * w00 + A[g + 1] * w10 + A[g + GW] * w01 + A[g + GW + 1] * w11;
      const d = e[2]; if (d) val += d[0] * (detAt(X, Y, d[1]) - 0.5);
      e[0][q] = val;
    }
  }
}
// one layer: fill (a pattern or a colour) wherever alpha(q) > 0, through a soft mask
function splat(x0, y0, fill, alpha) {
  let mx = 0, mn = 1;
  for (let q = 0; q < TSA; q++) { const a = alpha(q); TA[q] = a; if (a > mx) mx = a; if (a < mn) mn = a; }
  if (mx < 0.01) return;
  if (mn > 0.99) { ctx.fillStyle = fill; ctx.fillRect(x0, y0, CHK, CHK); return; }
  const d = tsIm.data;
  for (let q = 0, p = 0; q < TSA; q++, p += 4) { d[p] = d[p + 1] = d[p + 2] = 255; d[p + 3] = TA[q] * 255; }
  tsG.putImageData(tsIm, 0, 0);
  const n = Math.ceil(CHK * chunkS);
  if (!scrCv || scrCv.width !== n) { scrCv = document.createElement('canvas'); scrCv.width = scrCv.height = n; scrG = scrCv.getContext('2d'); }
  scrG.setTransform(1, 0, 0, 1, 0, 0); scrG.globalCompositeOperation = 'source-over'; scrG.clearRect(0, 0, n, n);
  scrG.setTransform(ctx.getTransform()); scrG.imageSmoothingEnabled = true;
  scrG.drawImage(tsCv, x0 - TSUB, y0 - TSUB, TSN * TSUB, TSN * TSUB);
  scrG.globalCompositeOperation = 'source-in'; scrG.fillStyle = fill; scrG.fillRect(x0, y0, CHK, CHK);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(scrCv, 0, 0); ctx.restore();
}
// a layer of plain colour with its own alpha per sample (shading, shallows, foam)
function tint2(x0, y0, rgba) {
  const d = tsIm.data; let any = false;
  for (let q = 0, p = 0; q < TSA; q++, p += 4) { const c = rgba(q); if (!c) { d[p + 3] = 0; continue; } d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = c[3] * 255; if (c[3] > 0.004) any = true; }
  if (!any) return;
  tsG.putImageData(tsIm, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.drawImage(tsCv, x0 - TSUB, y0 - TSUB, TSN * TSUB, TSN * TSUB);
}
const edge = (v, e = 0.1) => v <= -e ? 0 : v >= e ? 1 : sstep(-e, e, v);
const C4 = [0, 0, 0, 0];
const rgba = (r, g, b, a) => { C4[0] = r; C4[1] = g; C4[2] = b; C4[3] = a; return C4; };
const hasCountry = (cx, cy) => (cx + 1) * CHK > CW * T || (cy + 1) * CHK > CH * T;
function drawTerrain(cx, cy) {
  const x0 = cx * CHK, y0 = cy * CHK;
  sampleTerrain(x0, y0);
  const V = TV;
  ctx.fillStyle = PAT[GRASS]; ctx.fillRect(x0, y0, CHK, CHK);
  splat(x0, y0, PAT.dry, q => edge(V.dr[q], 0.25) * 0.85);
  splat(x0, y0, PAT.forest, q => edge(V.fo[q], 0.3) * 0.92);
  splat(x0, y0, PAT.sand, q => edge(V.sd[q]));
  splat(x0, y0, PAT.beach, q => edge(V.sb[q], 0.12));
  tint2(x0, y0, q => { const w = V.wa[q]; return w > -0.7 && w < 0.05 && V.sb[q] > 0 ? rgba(90, 70, 40, 0.28 * (1 - (w + 0.7) / 0.75)) : null; }); // wet sand
  splat(x0, y0, PAT.rock, q => edge(V.ro[q], 0.08));
  tint2(x0, y0, q => { const r = V.ro[q]; return r > -0.35 && r < 0.12 ? rgba(30, 26, 22, 0.35 * (1 - Math.abs(r + 0.1) / 0.25)) : null; }); // the foot of the cliffs
  splat(x0, y0, PAT.snow, q => edge(V.sn[q], 0.08) * 0.92);
  splat(x0, y0, PAT[WATER], q => edge(V.wa[q], 0.08));
  tint2(x0, y0, q => { // turquoise shallows on the tropical coast, darker deep water further out
    const w = V.wa[q]; if (w <= 0) return null;
    const t = V.tw[q], sh = t * (1 - sstep(0.4, 5, w));
    return sh > 0.02 ? rgba(96, 222, 210, sh * 0.72) : rgba(8, 22, 48, sstep(2, 9, w) * 0.35);
  });
  tint2(x0, y0, q => { const w = V.wa[q]; return w > -0.06 && w < 0.28 ? rgba(240, 248, 250, 0.55 * (1 - Math.abs(w - 0.08) / 0.2)) : null; }); // foam on the shore
}
// inner Brno's ground for one chunk: grass, then each area that reaches into it, in paint order
function drawLand5(cx, cy) {
  const x0 = cx * CHK, y0 = cy * CHK, L = land5At(cx, cy);
  ctx.fillStyle = PAT[GRASS]; ctx.fillRect(x0, y0, CHK, CHK);
  if (!L) return;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const n of L) {
    const o = LAND5[n], c = o.c;
    if (o.crop) { // a field: its crop, rows along its longest side, round a strip of bare earth
      const pat = CROP[o.crop], a = o.ang, ca = Math.cos(a), sa = Math.sin(a);
      pat.setTransform(setPM(ca, sa, -sa, ca, o.bb[0], o.bb[1]));
      ctx.fillStyle = pat; ctx.fill(o.P, 'evenodd');
      ctx.strokeStyle = PAT.dirt; ctx.lineWidth = 9; ctx.stroke(o.P);
      continue;
    }
    const f = c === LC_FOREST ? PAT.forest : c === LC_WATER ? PAT[WATER] : c === LC_LOT ? PAT.lot : c === LC_URBAN || c === LC_INDUS || c === LC_PLAZA || c === LC_RAIL ? PAT[PLAZA] : PAT[GRASS];
    if (o.w) { // a river, a stream or a pedestrian street drawn as a line
      if (c === LC_WATER) { ctx.strokeStyle = 'rgba(48,40,30,.45)'; ctx.lineWidth = o.w + 4; ctx.stroke(o.P); }
      ctx.strokeStyle = f; ctx.lineWidth = o.w; ctx.stroke(o.P);
    } else {
      ctx.fillStyle = f; ctx.fill(o.P, 'evenodd');
      if (c === LC_WATER) { ctx.strokeStyle = 'rgba(48,40,30,.45)'; ctx.lineWidth = 3; ctx.stroke(o.P); } // (its banks)
    }
  }
  ctx.lineCap = 'butt';
}
function hillShade(cx, cy) {
  const x0 = cx * CHK, y0 = cy * CHK, V = TV;
  tint2(x0, y0, q => { const s = V.sh[q]; return s > 0.02 ? rgba(255, 248, 230, Math.min(0.22, s * 0.3)) : s < -0.02 ? rgba(10, 16, 34, Math.min(0.5, -s * 0.42)) : null; });
}
function groundChunk(cx, cy) {
  const key = cx * 256 + cy;
  let c = chunkCache.get(key);
  if (c) { chunkCache.delete(key); chunkCache.set(key, c); return c; }
  chunkNew++;
  const n = Math.ceil(CHK * chunkS); c = chunkPool.pop(); // (a canvas the cache let go of, cleared, costs less than a new one)
  if (!c || c.width !== n) { c = document.createElement('canvas'); c.width = c.height = n; }
  const g = c.getContext('2d'), main = ctx;
  g.save(); g.clearRect(0, 0, n, n); g.beginPath(); // (and its state is put back afterwards: each chunk starts as on a new canvas)
  g.setTransform(chunkS, 0, 0, chunkS, -cx * CHK * chunkS, -cy * CHK * chunkS);
  ctx = g;
  try {
    const country = hasCountry(cx, cy);
    if (B5) { sampleTerrain(cx * CHK, cy * CHK, true); drawLand5(cx, cy); } // (inner Brno: its mapped areas; the terrain only shades)
    else if (country) drawTerrain(cx, cy);
    drawGroundStatic({ x0: cx * CHK - T, y0: cy * CHK - T, x1: (cx + 1) * CHK + T - 1, y1: (cy + 1) * CHK + T - 1 }); // 1-tile margin so kerb details cross chunk seams
    ctx.fillStyle = PAT.grime; ctx.fillRect(cx * CHK, cy * CHK, CHK, CHK); // dirt and bleaching, continuous across chunks
    if (country) hillShade(cx, cy);
  } finally { ctx = main; g.restore(); }
  chunkCache.set(key, c);
  if (chunkCache.size > 80) { const k0 = chunkCache.keys().next().value; chunkPool.push(chunkCache.get(k0)); chunkCache.delete(k0); }
  return c;
}
function drawGround(v) {
  const S = DPR >= 1.5 ? 2 : 1;
  if (S !== chunkS) { chunkCache.clear(); chunkPool.length = 0; chunkS = S; }
  ctx.imageSmoothingEnabled = false; chunkNew = 0;
  for (let cy = Math.max(0, Math.floor(v.y0 / CHK)); cy <= Math.min(Math.floor((MH * T - 1) / CHK), Math.floor(v.y1 / CHK)); cy++)
    for (let cx = Math.max(0, Math.floor(v.x0 / CHK)); cx <= Math.min(Math.floor((MW * T - 1) / CHK), Math.floor(v.x1 / CHK)); cx++)
      ctx.drawImage(groundChunk(cx, cy), cx * CHK, cy * CHK, CHK + 0.5, CHK + 0.5);
  ctx.imageSmoothingEnabled = true;
  if (!chunkNew) chunkAhead(v);
  drawWaterAnim(v);
}
// one chunk of the ring just outside the view, the one furthest along the way the camera moves, is drawn in a frame that
// drew none: driving into a new part of the city then finds its ground ready, instead of drawing a whole row of chunks
// in one frame (a chunk looks the same whenever it is drawn)
const CA = { x: 0, y: 0 };
function chunkAhead(v) {
  const x0 = Math.floor(v.x0 / CHK) - 1, x1 = Math.floor(v.x1 / CHK) + 1, y0 = Math.floor(v.y0 / CHK) - 1, y1 = Math.floor(v.y1 / CHK) + 1;
  const mx = Math.floor((MW * T - 1) / CHK), my = Math.floor((MH * T - 1) / CHK), ax = cam.x + (cam.x - CA.x) * 40, ay = cam.y + (cam.y - CA.y) * 40;
  CA.x = cam.x; CA.y = cam.y;
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > 76) return; // (the view and its ring would not fit in the cache together)
  let best = -1, bd = Infinity;
  for (let cy = Math.max(0, y0); cy <= Math.min(my, y1); cy++) for (let cx = Math.max(0, x0); cx <= Math.min(mx, x1); cx++) {
    if (cx > x0 && cx < x1 && cy > y0 && cy < y1) continue; // (in view: drawn already)
    if (chunkCache.has(cx * 256 + cy)) continue;
    const d = d2((cx + 0.5) * CHK, (cy + 0.5) * CHK, ax, ay); if (d < bd) { bd = d; best = cx * 256 + cy; }
  }
  if (best >= 0) groundChunk(best >> 8, best & 255);
}
function drawWaterAnim(v) {
  const x0 = Math.max(0, Math.floor(v.x0 / T)), y0 = Math.max(0, Math.floor(v.y0 / T));
  const x1 = Math.min(MW - 1, Math.floor(v.x1 / T)), y1 = Math.min(MH - 1, Math.floor(v.y1 / T));
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (map[ty * MW + tx] !== WATER) continue;
    if (B5 && (tile(tx - 1, ty) !== WATER || tile(tx + 1, ty) !== WATER || tile(tx, ty - 1) !== WATER || tile(tx, ty + 1) !== WATER)) continue; // (inner Brno's banks are its real ones: no ripples over them)
    const px = tx * T, py = ty * T, riv = inRiver(tx, ty);
    if (riv && Math.abs(ty + 0.5 - riverY(tx + 0.5)) > RIVER_HW - 0.9) continue;
    ctx.fillStyle = '#2a6596';
    ctx.fillRect(px + ((time * 12 + tx * 7) % T) * 0.5, py + ((ty * 13) % 20) + 4, 10, 2);
    const w = (dx, dy) => { const n = tile(tx + dx, ty + dy); return n !== WATER && !(n === ROAD && bridge[(ty + dy) * MW + tx + dx]); };
    if (riv || !inCity(tx, ty) || !(w(-1, 0) || w(1, 0) || w(0, -1) || w(0, 1))) continue; // (the countryside's shores have their foam drawn in)
    ctx.fillStyle = 'rgba(210,235,255,.28)';
    const f = 2 + Math.sin(time * 2 + tx + ty) * 1;
    if (w(-1, 0)) ctx.fillRect(px, py, f, T); if (w(1, 0)) ctx.fillRect(px + T - f, py, f, T);
    if (w(0, -1)) ctx.fillRect(px, py, T, f); if (w(0, 1)) ctx.fillRect(px, py + T - f, T, f);
  }
}
// a polyline moved sideways by off (to the right of its way)
const offLine = (P, off) => P.map((p, i) => { const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [p[0] - dy / l * off, p[1] + dx / l * off]; });
// a sub-polyline of an edge between distances s0 and s1
function edgeSub(e, s0, s1) {
  const pts = [], n = Math.max(1, Math.ceil((s1 - s0) / 12));
  for (let k = 0; k <= n; k++) { const p = edgePt(e, s0 + (s1 - s0) * k / n); pts.push(p); }
  return pts;
}
function railBB(R) {
  let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const [x, y] of R) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); } R.bb = [a - 40, b - 40, c + 40, d + 40];
  R.off = [-7, 7].map(o => R.map((p, i) => { const q = R[Math.max(0, i - 1)], r = R[Math.min(R.length - 1, i + 1)], dx = r[0] - q[0], dy = r[1] - q[1], l = Math.hypot(dx, dy) || 1; return [p[0] - dy / l * o, p[1] + dx / l * o]; }));
}
// the railway's bridges over the streets: the gloom and the shadow on the street below, the deck between its parapets,
// the ballast, sleepers and rails; drawn over the street's traffic (as the trains on it are), see-through while you are
// under one
function drawRailDecks(v) {
  const P0 = pp(), path = P => { ctx.beginPath(); P.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); };
  const L = SUN.len * HC * 0.9 * DECK_H, sx = SUN.sx * L, sy = SUN.sy * L, up = player.car && player.car.lay >= 2; // (up on a deck yourself: not under it)
  const D = [];
  for (const R of RAILS) {
    if (!R.lv) continue;
    if (!R.bb) railBB(R);
    if (R.bb[0] > v.x1 + 60 || R.bb[2] < v.x0 - 60 || R.bb[1] > v.y1 + 60 || R.bb[3] < v.y0 - 60) continue;
    let under = false;
    if (!up && P0.x > R.bb[0] && P0.x < R.bb[2] && P0.y > R.bb[1] && P0.y < R.bb[3]) for (let i = 1; i < R.length && !under; i++) under = closestOnSeg([P0.x, P0.y], R[i - 1], R[i]).d < 30;
    D.push([R, under ? 0.55 : 1]);
  }
  for (const X of RAIL_X) if (X.deck && X.x > v.x0 - 120 && X.x < v.x1 + 120 && X.y > v.y0 - 120 && X.y < v.y1 + 120) { if (!X.deck.bb) railBB(X.deck); D.push([X.deck, !up && d2(P0.x, P0.y, X.x, X.y) < 60 * 60 ? 0.55 : 1]); }
  if (!D.length) return;
  ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
  // (layer by layer, so that tracks side by side on one viaduct share its deck, with the parapets only along its sides)
  for (const [R] of D) { path(R); ctx.strokeStyle = 'rgba(0,0,0,.16)'; ctx.lineWidth = 56; ctx.stroke(); } // (the gloom right under it)
  if (SUN.on) for (const [R] of D) { path(R.map(([x, y]) => [x + sx, y + sy])); ctx.strokeStyle = `rgba(0,0,0,${0.22 * (1 - NIGHT)})`; ctx.lineWidth = 44; ctx.stroke(); }
  const layer = (c, w, dash) => { ctx.strokeStyle = tint(c); ctx.lineWidth = w; if (dash) ctx.setLineDash(dash); for (const [R, a] of D) { ctx.globalAlpha = a; path(R); ctx.stroke(); } ctx.setLineDash([]); };
  layer('#8f8b82', 46); layer('#b4aea3', 40); layer('#8a8279', 30); layer('#4a3a2c', 24, [4, 6]); // (parapets, deck, ballast, sleepers)
  ctx.strokeStyle = tint('#b8bcc2'); ctx.lineWidth = 2.2;
  for (const [R, a] of D) { ctx.globalAlpha = a; for (const o of R.off) { path(o); ctx.stroke(); } }
  ctx.globalAlpha = 1;
}
// level crossings (on the sidings and industrial spurs): the crossing's panels and rails across the street, and a
// red-and-white cross by the street on each side
function drawLevelCrossings(v) {
  for (const X of RAIL_X) {
    if (X.k !== 0 || !X.e || X.x < v.x0 - 80 || X.x > v.x1 + 80 || X.y < v.y0 - 80 || X.y > v.y1 + 80) continue;
    const hw = X.e.wd / 2, len = (hw + 10) / X.sin; // (along the track, from the middle of the street to past its kerb)
    ctx.save(); ctx.translate(X.x, X.y); ctx.rotate(Math.atan2(X.ry, X.rx));
    ctx.fillStyle = '#5f5d59'; ctx.fillRect(-len, -15, len * 2, 30);
    ctx.fillStyle = 'rgba(255,255,255,.06)'; for (let x = -len; x < len; x += 12) ctx.fillRect(x, -15, 1, 30); // (the panels' joints)
    ctx.fillStyle = '#b8bcc2'; ctx.fillRect(-len, -8.1, len * 2, 2.2); ctx.fillRect(-len, 5.9, len * 2, 2.2);
    ctx.restore();
    for (const sd of [-1, 1]) { // (a cross on each side: by the street's kerb, before the track)
      const a = (22 / X.sin + 8) * sd, n = (hw + 9) * sd, x = X.x + X.ux * a - X.uy * n, y = X.y + X.uy * a + X.ux * n;
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(X.uy, X.ux) + Math.PI / 2);
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(1, -1, 3, 3);
      for (const r of [Math.PI / 4, -Math.PI / 4]) { ctx.save(); ctx.rotate(r); ctx.fillStyle = '#d32f2f'; ctx.fillRect(-7, -2, 14, 4); ctx.fillStyle = '#fff'; ctx.fillRect(-4.5, -2, 3, 4); ctx.fillRect(1.5, -2, 3, 4); ctx.restore(); }
      ctx.restore();
    }
  }
}
// street names, painted along the middle of named streets (one on each block, more on long ones), the right way up
const SN_W = new Map();
// overpasses: the shadow on the ground, the piers, the deck (raised in perspective, see-through while you drive under it),
// then the cars up on it, drawn at its height
function drawDecks(v) {
  if (!OVERS.length) return;
  const pc = player.car, under = pc && !pc.lay && ovT[Math.floor(pc.y / T) * MW + Math.floor(pc.x / T)] === 1;
  const path = P => { ctx.beginPath(); P.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); };
  ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
  for (const e of OVERS) {
    const b = e.obb; if (b[2] < v.x0 - 120 || b[0] > v.x1 + 120 || b[3] < v.y0 - 120 || b[1] > v.y1 + 120) continue;
    if (!e.dk) {
      e.dk = []; const n = Math.max(2, Math.ceil(e.len / 14)); for (let i = 0; i <= n; i++) { const s = e.len * i / n, p = edgePt(e, s); e.dk.push([p[0], p[1], deckZ(e, s)]); }
      const nl = e.lf + e.lb, lw = e.wd / nl, dv = (e.lb - e.lf) * lw / 2, on = off => offLine(e.dk, off).map((p, i) => [p[0], p[1], e.dk[i][2]]);
      e.dkm = []; // (its markings: the line between the two ways, and between lanes going the same way)
      if (e.lf && e.lb) e.dkm.push([on(dv), '#e0c050', [16, 14]]);
      for (let i = 1; i < e.lf; i++) e.dkm.push([on(dv + i * lw), '#e4e4e4', [10, 14]]);
      for (let i = 1; i < e.lb; i++) e.dkm.push([on(dv - i * lw), '#e4e4e4', [10, 14]]);
    }
    const W = e.wd;
    path(e.dk); ctx.strokeStyle = 'rgba(0,0,0,.16)'; ctx.lineWidth = W + 20; ctx.stroke(); // (the gloom right under it)
    if (SUN.on) { const L = SUN.len * HC * 0.9, a = 0.22 * (1 - NIGHT); path(e.dk.map(([x, y, z]) => [x + SUN.sx * L * z, y + SUN.sy * L * z])); ctx.strokeStyle = `rgba(0,0,0,${a})`; ctx.lineWidth = W; ctx.stroke(); }
    ctx.globalAlpha = under ? 0.62 : 1;
    for (let i = 4; i < e.dk.length - 4; i += 9) { const [x, y, z] = e.dk[i]; if (z < DECK_H * 0.7) continue; const t = proj(x, y, z); ctx.strokeStyle = tint('#8e8c86', 0.8); ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(t[0], t[1]); ctx.stroke(); } // (piers)
    const P = e.dk.map(([x, y, z]) => proj(x, y, z)), k = 1 + DECK_H * e.over;
    path(P); ctx.strokeStyle = tint('#9a978f', 1); ctx.lineWidth = (W + 10) * k; ctx.stroke();
    path(P); ctx.strokeStyle = tint('#e8e6e0', 1); ctx.lineWidth = (W - 6) * k; ctx.stroke();
    path(P); ctx.strokeStyle = tint('#3b3c40', 1); ctx.lineWidth = (W - 10) * k; ctx.stroke();
    for (const [Q, c, d] of e.dkm) { path(Q.map(([x, y, z]) => proj(x, y, z))); ctx.strokeStyle = tint(c, 1); ctx.lineWidth = 2.5 * k; ctx.setLineDash(d); ctx.stroke(); }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
  for (const c of cars) if ((c.lay === 3 || c.lay === 4) && onScreen(c.x, c.y, 80)) {
    const k = 1 + carDeckZ(c);
    ctx.save(); ctx.transform(k, 0, 0, k, cam.x * (1 - k), cam.y * (1 - k)); drawCar(c); ctx.restore();
  }
  ctx.lineCap = 'butt';
}
function drawStreetNames(v) {
  const z = cam.zoom; if (z < 0.4) return;
  const fs = Math.min(17, 11.5 / z), gap = 1000 / Math.min(1.3, z);
  ctx.font = `bold ${fs.toFixed(1)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  if (!NGRID) NGRID = cellIndex(EDGES, e => e.pts.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [1e9, 1e9, -1e9, -1e9]));
  for (const e of cellQuery(NGRID, v.x0, v.y0, v.x1, v.y1)) {
    if (!e.name || e.tunnel || e.over) continue;
    const bb = e.nbb || (e.nbb = e.pts.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [1e9, 1e9, -1e9, -1e9]));
    if (bb[2] < v.x0 || bb[0] > v.x1 || bb[3] < v.y0 || bb[1] > v.y1) continue;
    let w = SN_W.get(e.name); if (w === undefined) { ctx.font = 'bold 11.5px system-ui, sans-serif'; w = ctx.measureText(e.name).width; SN_W.set(e.name, w); ctx.font = `bold ${fs.toFixed(1)}px system-ui, sans-serif`; }
    const tw = w * fs / 11.5;
    if (e.len < tw + 110) continue;
    const n = Math.max(1, Math.floor((e.len - 140) / gap));
    for (let i = 0; i < n; i++) {
      const sm = e.len * (i + 0.5) / n, a = edgePt(e, sm - tw / 2 - 6), b = edgePt(e, sm + tw / 2 + 6), m = edgePt(e, sm);
      if (m[0] < v.x0 - 100 || m[0] > v.x1 + 100 || m[1] < v.y0 - 100 || m[1] > v.y1 + 100) continue;
      if (Math.hypot(m[0] - (a[0] + b[0]) / 2, m[1] - (a[1] + b[1]) / 2) > 6) continue; // (only where the street runs straight enough)
      let ang = Math.atan2(b[1] - a[1], b[0] - a[0]); if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
      ctx.save(); ctx.translate(m[0], m[1]); ctx.rotate(ang);
      ctx.lineWidth = fs * 0.28; ctx.strokeStyle = 'rgba(18,20,24,.7)'; ctx.strokeText(e.name, 0, 0);
      ctx.fillStyle = 'rgba(240,238,228,.92)'; ctx.fillText(e.name, 0, 0);
      ctx.restore();
    }
  }
  ctx.textBaseline = 'alphabetic';
}
function drawGroundStatic(v) {
  const x0 = Math.max(0, Math.floor(v.x0 / T)), y0 = Math.max(0, Math.floor(v.y0 / T));
  const x1 = Math.min(MW - 1, Math.floor(v.x1 / T)), y1 = Math.min(MH - 1, Math.floor(v.y1 / T));
  // tiles under the roads show what the strokes do not cover: pavement, highway verge, or river under a bridge
  // (in the countryside the terrain is already there: null leaves it showing)
  const kind = (tx, ty) => {
    const k = ty * MW + tx, t = map[k] === BUILD && GU && GU[k] ? GU[k] - 1 : map[k]; // (round a real building's outline: the ground it stands on)
    if (B5) { // (inner Brno's areas are polygons already: a tile is drawn only where the game paved or planted it itself)
      if (map[k] === BUILD || t === WALK || t === ROAD || t === WATER || t === FIELD || t === SAND || t === ROCK) return null; // (pavements come with the streets; water, banks and the ground round a building from the areas)
      const c = LCG[k], paved = c === LC_URBAN || c === LC_INDUS || c === LC_PLAZA || c === LC_RAIL || c === LC_LOT;
      if (t === GRASS) return paved ? GRASS : null; // (a lawn laid on paved land)
      return t !== PLAZA ? null : lotT[k] === 2 ? 'dirt' : lotT[k] ? (c === LC_LOT ? null : 'lot') : paved ? null : PLAZA; // (a yard, a car park or a dirt lot of its own)
    }
    if (!inCity(tx, ty) && (t === GRASS || t === SAND || t === ROCK || t === WATER || t === FIELD || (t === ROAD && (bridge[k] || (eR[k] >= 0 && EDGES[eR[k]].rural))))) return null;
    return t === WATER ? (inRiver(tx, ty) ? 'quay' : WATER) : t === PLAZA && lotT[k] ? (lotT[k] === 2 ? 'dirt' : 'lot') : t !== ROAD ? t : bridge[k] ? 'quay' : hwT[k] ? GRASS : WALK;
  };
  for (let ty = y0; ty <= y1; ty++) {
    let s = x0, k = kind(x0, ty);
    for (let tx = x0 + 1; tx <= x1 + 1; tx++) {
      const k2 = tx <= x1 ? kind(tx, ty) : undefined;
      if (k2 !== k) { if (k !== null) { ctx.fillStyle = PAT[k]; ctx.fillRect(s * T, ty * T, (tx - s) * T + 0.6, T + 0.6); } s = tx; k = k2; }
    }
  }
  // crop fields, each with its rows turned its own way, and a strip of bare earth round the edge
  for (const f of FIELDS) {
    if (f.x0 * T > v.x1 || (f.x1 + 1) * T < v.x0 || f.y0 * T > v.y1 || (f.y1 + 1) * T < v.y0) continue;
    const pat = CROP[f.cut ? 'stubble' : f.crop], fx = f.x0 * T, fy = f.y0 * T, fw = (f.x1 - f.x0 + 1) * T, fh = (f.y1 - f.y0 + 1) * T;
    pat.setTransform(f.rot ? setPM(0, 1, -1, 0, fx, fy) : setPM(1, 0, 0, 1, fx, fy));
    ctx.fillStyle = PAT.dirt; ctx.fillRect(fx + 3, fy + 3, fw - 6, fh - 6);
    ctx.fillStyle = pat; ctx.fillRect(fx + 7, fy + 7, fw - 14, fh - 14);
    ctx.strokeStyle = 'rgba(40,30,18,.25)'; ctx.lineWidth = 2; ctx.strokeRect(fx + 7, fy + 7, fw - 14, fh - 14);
  }
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const k = ty * MW + tx, h = (tx * 73856093 ^ ty * 19349663) >>> 0;
    if (lotT[k] === 1 && h % 3 === 0) { ctx.fillStyle = 'rgba(8,6,4,.18)'; ctx.beginPath(); ctx.ellipse(tx * T + 16, ty * T + 10 + h % 12, 5 + h % 4, 3.5, 0, 0, TAU); ctx.fill(); } // oil under parked cars
    if (map[k] === GRASS && (inCity(tx, ty) || (BRNO ? LCG[k] === LC_OPEN || LCG[k] === LC_GREEN : DISTRICTS[REG[k]].flowers)) && h % 7 === 0) { ctx.fillStyle = ['#e8e070', '#f2f2f2', '#d77fb0'][h % 3]; ctx.fillRect(tx * T + h % 27, ty * T + (h >> 6) % 27, 2, 2); ctx.fillRect(tx * T + (h >> 3) % 27, ty * T + (h >> 9) % 27, 2, 2); }
  }
  const path = pts => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); };
  ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
  // the river: a smooth band of water between stone quays
  if (v.y1 > 30 * T && v.y0 < 56 * T && v.x0 < CW * T) { // (only through the city: out in the valley it has natural banks)
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, CW * T, CH * T); ctx.clip();
    path(RIVER_PX); ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = RIVER_HW * 2 * T + 2; ctx.stroke();
    path(RIVER_PX); ctx.strokeStyle = PAT[WATER]; ctx.lineWidth = RIVER_HW * 2 * T - 6; ctx.stroke();
    ctx.restore();
  }
  // railway lines: ballast, sleepers and a pair of rails, under the streets (a street crosses on a bridge, or at a level
  // crossing, drawn over the street below; a track up on a bridge over a street is drawn over its traffic, drawRailDecks)
  for (const R of RAILS) {
    if (!R.bb) railBB(R);
    if (R.lv || R.bb[0] > v.x1 || R.bb[2] < v.x0 || R.bb[1] > v.y1 || R.bb[3] < v.y0) continue;
    path(R); ctx.lineCap = 'butt'; ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 38; ctx.stroke();
    path(R); ctx.strokeStyle = PAT.rock; ctx.lineWidth = 32; ctx.stroke();
    path(R); ctx.strokeStyle = '#4a3a2c'; ctx.lineWidth = 24; ctx.setLineDash([4, 6]); ctx.stroke(); ctx.setLineDash([]);
    for (const o of R.off) { path(o); ctx.strokeStyle = '#b8bcc2'; ctx.lineWidth = 2.2; ctx.stroke(); }
  }
  // roads are stroked in layers so that junctions merge cleanly: parapets, pavements, kerbs, asphalt, markings
  const inV = e => e.bb[0] < v.x1 && e.bb[2] > v.x0 && e.bb[1] < v.y1 && e.bb[3] > v.y0;
  if (!EGRID) EGRID = cellIndex(EDGES, e => e.bb);
  const E = cellQuery(EGRID, v.x0, v.y0, v.x1, v.y1).filter(e => !e.tunnel && !e.over && inV(e)).concat(RAMPS.filter(inV), OVRAMPS.filter(inV)); // (of a tunnel, only its ramps show; a deck is drawn above the street's cars)
  const W = o => (o.e ? o.e.wd : o.wd) || 64; // (each street as wide as its carriageway: a ramp as its street)
  ctx.lineCap = 'round';
  for (const e of E) for (const r of e.water) { path(r.map(([x, y]) => [x + 6, y + 9])); ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = W(e) + 8; ctx.stroke(); }
  ctx.lineCap = 'butt';
  for (const e of E) for (const r of e.water) { path(r); ctx.strokeStyle = '#c9c4b8'; ctx.lineWidth = W(e) + 14; ctx.stroke(); }
  ctx.lineCap = 'round';
  for (const e of E) if (!e.hw && !e.rural) for (const r of e.land) { path(r); ctx.strokeStyle = PAT[WALK]; ctx.lineWidth = W(e) + 64; ctx.stroke(); }
  for (const e of E) if (!e.hw && !e.rural) { path(e.pts); ctx.strokeStyle = '#bdb8ae'; ctx.lineWidth = W(e) + 6; ctx.stroke(); }
  for (const e of E) if (e.rural) for (const r of e.land) { path(r); ctx.strokeStyle = e.dirt ? 'rgba(90,70,44,.35)' : 'rgba(120,108,88,.55)'; ctx.lineWidth = W(e) + (e.dirt ? -2 : 16); ctx.stroke(); } // gravel shoulders
  for (const e of E) { path(e.pts); ctx.strokeStyle = e.dirt ? PAT.dirt : e.hw ? PAT.hw : PAT[ROAD]; ctx.lineWidth = W(e) - (e.dirt ? 12 : 0); ctx.stroke(); }
  ctx.lineCap = 'butt';
  for (const e of E) for (const r of e.water) { path(r); ctx.strokeStyle = PAT.br; ctx.lineWidth = W(e); ctx.stroke(); }
  // highway and country-road edge lines
  for (const e of E) if ((e.hw || e.rural) && !e.dirt) { path(e.pts); ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = W(e) - 6; ctx.stroke(); path(e.pts); ctx.strokeStyle = e.hw ? PAT.hw : PAT[ROAD]; ctx.lineWidth = W(e) - 10; ctx.stroke(); }
  // wear: a darker oily stripe down the middle of each lane and rubbed-in wheel tracks, plus drips where cars wait at lights
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const mid = new Path2D(), wheels = new Path2D(), drips = new Path2D();
  if (!LNGRID) LNGRID = cellIndex(LANES, L => { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (let i = 0; i < L.n; i++) { a = Math.min(a, L.x[i]); b = Math.min(b, L.y[i]); c = Math.max(c, L.x[i]); d = Math.max(d, L.y[i]); } return (L.bb = [a - 20, b - 20, c + 20, d + 20]); });
  for (const L of cellQuery(LNGRID, v.x0, v.y0, v.x1, v.y1)) {
    if (L.e.tunnel) continue;
    if (L.bb[0] > v.x1 || L.bb[2] < v.x0 || L.bb[1] > v.y1 || L.bb[3] < v.y0) continue;
    for (const [P, o] of [[mid, 0], [wheels, -6.5], [wheels, 6.5]])
      for (let i = 0; i < L.n; i++) { const x = L.x[i] - Math.sin(L.h[i]) * o, y = L.y[i] + Math.cos(L.h[i]) * o; i ? P.lineTo(x, y) : P.moveTo(x, y); }
    if (L.light && L.n > 10) for (const back of [2, 8]) { const i = L.n - 1 - back; drips.moveTo(L.x[i] + 9 * Math.cos(L.h[i]), L.y[i] + 9 * Math.sin(L.h[i])); drips.ellipse(L.x[i], L.y[i], 9, 4.5, L.h[i], 0, TAU); }
  }
  ctx.strokeStyle = 'rgba(10,8,4,.08)'; ctx.lineWidth = 6; ctx.stroke(mid);
  ctx.strokeStyle = 'rgba(0,0,0,.055)'; ctx.lineWidth = 3.5; ctx.stroke(wheels);
  ctx.fillStyle = 'rgba(6,5,4,.13)'; ctx.fill(drips);
  ctx.lineCap = 'butt';
  // the line between the two ways (dashed; a double line on a street of four lanes or more) and the dashed lines between
  // lanes going the same way, kept clear of junctions (worked out once for each street)
  ctx.lineWidth = 2;
  for (const e of E) {
    if (e.e || e.dirt || e.lf + e.lb < 2) continue; // (not on the ramps, the dirt tracks or a one-lane street)
    const ca = NODES[e.a].clr || 0, cb = NODES[e.b].clr || 0;
    if (e.len - ca - cb < 30) continue;
    if (!e.mk) {
      const sub = edgeSub(e, ca + 6, e.len - cb - 6), n = e.lf + e.lb, lw = e.wd / n, dv = (e.lb - e.lf) * lw / 2, mk = [];
      const mid = e.hw || e.wet ? '#e8e8e8' : '#d4b23a';
      if (e.lf && e.lb) { if (n >= 4) mk.push([offLine(sub, dv - 2.5), mid, []], [offLine(sub, dv + 2.5), mid, []]); else mk.push([offLine(sub, dv), mid, [14, 12]]); }
      for (let i = 1; i < e.lf; i++) mk.push([offLine(sub, dv + i * lw), '#e4e4e4', [10, 14]]);
      for (let i = 1; i < e.lb; i++) mk.push([offLine(sub, dv - i * lw), '#e4e4e4', [10, 14]]);
      e.mk = mk;
    }
    for (const [P, c, d] of e.mk) { path(P); ctx.strokeStyle = c; ctx.setLineDash(d); ctx.stroke(); }
  }
  ctx.setLineDash([]); ctx.lineCap = 'round';
  // tunnel portals: the ramp sinks between retaining walls into the dark mouth of the tube
  for (const r of RAMPS) if (inV(r)) {
    const P = r.pts, n = P.length, [ex, ey] = P[n - 1], [qx, qy] = P[Math.max(0, n - 6)], L = Math.hypot(ex - qx, ey - qy) || 1, ux = (ex - qx) / L, uy = (ey - qy) / L, nx = -uy, ny = ux;
    const m = r.e.wd / 2 + 2, rw = r.e.wd / 2 + 5; // (the mouth as wide as the street, the walls just outside it)
    const g = ctx.createLinearGradient(ex - ux * 70, ey - uy * 70, ex, ey);
    g.addColorStop(0, 'rgba(4,5,8,0)'); g.addColorStop(1, 'rgba(4,5,8,.96)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(ex - ux * 70 + nx * m, ey - uy * 70 + ny * m); ctx.lineTo(ex + nx * m, ey + ny * m); ctx.lineTo(ex - nx * m, ey - ny * m); ctx.lineTo(ex - ux * 70 - nx * m, ey - uy * 70 - ny * m); ctx.fill();
    ctx.fillStyle = 'rgba(4,5,8,.96)'; ctx.beginPath(); ctx.moveTo(ex + nx * m, ey + ny * m); ctx.lineTo(ex + ux * 26 + nx * m, ey + uy * 26 + ny * m); ctx.lineTo(ex + ux * 26 - nx * m, ey + uy * 26 - ny * m); ctx.lineTo(ex - nx * m, ey - ny * m); ctx.fill();
    for (const sd of [-1, 1]) { // retaining walls, rising toward the mouth
      const w = P.slice(Math.floor(n * 0.35)).map(([x, y], i, A) => { const a = A[Math.max(0, i - 1)], b = A[Math.min(A.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [x - dy / l * rw * sd, y + dx / l * rw * sd]; });
      w.push([ex + ux * 26 + nx * rw * sd, ey + uy * 26 + ny * rw * sd]);
      path(w); ctx.strokeStyle = '#8f8b82'; ctx.lineWidth = 7; ctx.stroke(); path(w); ctx.strokeStyle = '#b9b4a8'; ctx.lineWidth = 3; ctx.stroke();
    }
  }
  // the roundabout's island
  if (!BRNO && Math.abs(RB.x * T - (v.x0 + v.x1) / 2) < (v.x1 - v.x0) / 2 + 120 && Math.abs(RB.y * T - (v.y0 + v.y1) / 2) < (v.y1 - v.y0) / 2 + 120) {
    ctx.beginPath(); ctx.arc(RB.x * T, RB.y * T, RB.r * T - 62, 0, TAU);
    ctx.fillStyle = PAT[GRASS]; ctx.fill(); ctx.strokeStyle = '#bdb8ae'; ctx.lineWidth = 4; ctx.stroke();
  }
  drawLevelCrossings(v);
  // tram tracks: two grooved rails, 1435 mm apart (about 9 px at 5 m a tile)
  for (const R of TRAMS) {
    if (!R.bb) { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const [x, y] of R) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); } R.bb = [a - 20, b - 20, c + 20, d + 20];
      R.off = [-4.6, 4.6].map(o => R.map((p, i) => { const q = R[Math.max(0, i - 1)], r = R[Math.min(R.length - 1, i + 1)], dx = r[0] - q[0], dy = r[1] - q[1], l = Math.hypot(dx, dy) || 1; return [p[0] - dy / l * o, p[1] + dx / l * o]; })); }
    if (R.bb[0] > v.x1 || R.bb[2] < v.x0 || R.bb[1] > v.y1 || R.bb[3] < v.y0) continue;
    for (const o of R.off) { path(o); ctx.strokeStyle = 'rgba(30,30,32,.55)'; ctx.lineWidth = 2.6; ctx.stroke(); path(o); ctx.strokeStyle = '#a8acb2'; ctx.lineWidth = 1.2; ctx.stroke(); }
  }
  // crosswalks and stop lines at signalised junctions
  for (const n of LIGHT_NODES) {
    if (n.x < v.x0 - 100 || n.x > v.x1 + 100 || n.y < v.y0 - 100 || n.y > v.y1 + 100) continue;
    for (const e of n.edges) if (n.grp.has(e.id)) { // (stripes across the whole street; the stop line across the lanes coming in)
      const [ux, uy] = n.dirs.get(e.id), h = e.wd / 2, away = e.a === n.id, dv = (e.lb - e.lf) * e.wd / (e.lf + e.lb) / 2, dd = away ? dv : -dv;
      ctx.save(); ctx.translate(n.x, n.y); ctx.rotate(Math.atan2(uy, ux));
      ctx.fillStyle = '#dcdcdc'; for (let k = Math.ceil((3 - h) / 9); k * 9 <= h - 3; k++) ctx.fillRect(n.clr - 31, k * 9 - 2.5, 22, 5);
      if (away ? e.lb : e.lf) { ctx.fillStyle = '#eeeeee'; ctx.fillRect(n.clr - 3, 1 - h, 3, h + dd - 2); }
      ctx.restore();
    }
  }
  // manholes and oil stains
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const k = ty * MW + tx, h = (tx * 73856093 ^ ty * 19349663) >>> 0;
    if (map[k] !== ROAD || hwT[k] || bridge[k] || XW[k] || dR[k] > 20 || EDGES[eR[k]].rural) continue;
    if (h % 47 === 0) { ctx.fillStyle = '#2a2a2e'; ctx.beginPath(); ctx.arc(tx * T + 16, ty * T + 16, 5, 0, TAU); ctx.fill(); ctx.fillStyle = '#46464c'; ctx.fillRect(tx * T + 13, ty * T + 15, 6, 1); ctx.fillRect(tx * T + 13, ty * T + 17, 6, 1); }
    else if (h % 53 === 0) { ctx.fillStyle = 'rgba(0,0,0,.16)'; ctx.beginPath(); ctx.ellipse(tx * T + 12 + h % 9, ty * T + 16, 7, 4, 0, 0, TAU); ctx.fill(); }
    else if (h % 23 === 0 && dR[k] < 12) { // a repaired trench: fresher, darker asphalt with sealed edges
      const pw = 12 + h % 17, ph = 8 + (h >> 5) % 11, px = tx * T + 16 - pw / 2, py = ty * T + 16 - ph / 2;
      ctx.fillStyle = PAT.patch; ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = 'rgba(10,10,12,.4)'; ctx.lineWidth = 1; ctx.strokeRect(px, py, pw, ph);
    }
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
  for (const l of lampsNear(v, 4)) if (!l.c && l.x > v.x0 - 4 && l.x < v.x1 + 4 && l.y > v.y0 - 4 && l.y < v.y1 + 4) { ctx.beginPath(); ctx.arc(l.x, l.y, 2.5, 0, TAU); ctx.fill(); }
}

// ---- props on the ground: graves, benches, fountains, flags...
// trees and props are bucketed by 256 px cell, so drawing only visits what is near the view
function gridOf(list) { const g = new Map(); for (const o of list) { const k = Math.floor(o.x / 256) + Math.floor(o.y / 256) * 1024; let a = g.get(k); if (!a) g.set(k, a = []); a.push(o); } return g; }
function inView(g, v, m, fn) {
  for (let cy = Math.floor((v.y0 - m) / 256); cy <= Math.floor((v.y1 + m) / 256); cy++) for (let cx = Math.floor((v.x0 - m) / 256); cx <= Math.floor((v.x1 + m) / 256); cx++) {
    const a = g.get(cx + cy * 1024); if (!a) continue;
    for (const o of a) if (o.x > v.x0 - m && o.x < v.x1 + m && o.y > v.y0 - m && o.y < v.y1 + m) fn(o);
  }
}
// the same for long lists of things with an extent (inner Brno's 52,000 buildings, 37,000 street lamps, its streets):
// each item is filed under every cell its box touches, and what may be in a rectangle comes back in the list's own
// order, so whatever is then picked out of it is drawn just as from the whole list
function cellIndex(list, box) {
  const C = 256, nx = Math.ceil(MW * T / C) + 1, ny = Math.ceil(MH * T / C) + 1, cells = new Array(nx * ny);
  list.forEach((o, i) => {
    const [x0, y0, x1, y1] = box(o), a = clamp(Math.floor(x0 / C), 0, nx - 1), b = clamp(Math.floor(x1 / C), 0, nx - 1), c = clamp(Math.floor(y0 / C), 0, ny - 1), d = clamp(Math.floor(y1 / C), 0, ny - 1);
    for (let cy = c; cy <= d; cy++) for (let cx = a; cx <= b; cx++) (cells[cy * nx + cx] || (cells[cy * nx + cx] = [])).push(i);
  });
  return { list, C, nx, ny, cells, seen: new Uint32Array(list.length), stamp: 0 };
}
function cellQuery(G, x0, y0, x1, y1) { // (every item whose box overlaps the rectangle, and some near it)
  const { C, nx, ny, cells, seen } = G, st = ++G.stamp, ids = [];
  const a = clamp(Math.floor(x0 / C), 0, nx - 1), b = clamp(Math.floor(x1 / C), 0, nx - 1), c = clamp(Math.floor(y0 / C), 0, ny - 1), d = clamp(Math.floor(y1 / C), 0, ny - 1);
  for (let cy = c; cy <= d; cy++) for (let cx = a; cx <= b; cx++) { const L = cells[cy * nx + cx]; if (L) for (const i of L) if (seen[i] !== st) { seen[i] = st; ids.push(i); } }
  ids.sort((p, q) => p - q);
  return ids.map(i => G.list[i]);
}
let BGRID = null, LAMPG = null, NGRID = null, EGRID = null, LNGRID = null, B_TOP = 0;
const bGrid = () => BGRID || (B_TOP = buildings.reduce((m, b) => Math.max(m, b.top), 0), BGRID = cellIndex(buildings, b => [b.x, b.y, b.x + b.w, b.y + b.h]));
const lGrid = () => LAMPG || (LAMPG = cellIndex(lamps, p => [p.x, p.y, p.x, p.y]));
const lampsNear = (v, m) => cellQuery(lGrid(), v.x0 - m, v.y0 - m, v.x1 + m, v.y1 + m); // (m: at least the margin tested)
let TGRID = null, PGRID = null;
function drawProps(v) {
  if (!PGRID) PGRID = gridOf(props);
  treeGrid();
  inView(PGRID, v, 120, p => {
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
      case 'jetty': { // a little wooden jetty from the bank out over the water, with a bucket at the end
        ctx.save(); ctx.translate(x, y); ctx.rotate(p.a);
        ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(7, -6, 40, 16);
        ctx.fillStyle = '#8a6a44'; ctx.fillRect(4, -8, 40, 16);
        ctx.fillStyle = '#6a4e30'; for (let i = 1; i < 8; i++) ctx.fillRect(4 + i * 5, -8, 1, 16);
        ctx.fillStyle = '#3e2c1a'; for (const [px, py] of [[8, -9], [8, 9], [42, -9], [42, 9]]) { ctx.beginPath(); ctx.arc(px, py, 2, 0, TAU); ctx.fill(); }
        ctx.fillStyle = '#5a7a8a'; ctx.beginPath(); ctx.arc(36, 5, 3.5, 0, TAU); ctx.fill(); ctx.fillStyle = '#2c3e48'; ctx.beginPath(); ctx.arc(36, 5, 2.3, 0, TAU); ctx.fill();
        ctx.restore(); break;
      }
      case 'mast': // the readout camera on its pole
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.arc(x + 4, y + 4, 6, 0, TAU); ctx.fill();
        ctx.fillStyle = '#5a6270'; ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fill();
        ctx.fillStyle = '#1b2030'; ctx.fillRect(x - 5, y - 4, 10, 8); ctx.fillStyle = '#8fd3ff'; ctx.beginPath(); ctx.arc(x, y, 2.2, 0, TAU); ctx.fill();
        break;
      case 'carpet': { // a red carpet from a club's door towards the street, between brass posts and velvet ropes
        const L = p.len * T, hw = 8;
        ctx.save(); ctx.translate(x, y); ctx.transform(p.nx, p.ny, -p.ny, p.nx, 0, 0); // u out of the door, v across
        ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(-L / 2 + 2, -hw + 2, L - 2, hw * 2);
        ctx.fillStyle = '#a3122a'; ctx.fillRect(-L / 2, -hw, L - 2, hw * 2);
        ctx.fillStyle = '#d4af37'; ctx.fillRect(-L / 2, -hw, L - 2, 1.5); ctx.fillRect(-L / 2, hw - 1.5, L - 2, 1.5);
        for (const sv of [-1, 1]) {
          const v = sv * (hw + 6), us = [-L / 2 + 5, -L / 2 + 5 + L * 0.3, -L / 2 + 5 + L * 0.6];
          ctx.strokeStyle = '#6e0c1e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(us[0], v);
          for (let i = 1; i < us.length; i++) ctx.quadraticCurveTo((us[i - 1] + us[i]) / 2, v + sv * 4, us[i], v);
          ctx.stroke();
          for (const u of us) { ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.arc(u + 1.5, v + 1.5, 2.6, 0, TAU); ctx.fill(); ctx.fillStyle = '#d4af37'; ctx.beginPath(); ctx.arc(u, v, 2.6, 0, TAU); ctx.fill(); }
        }
        ctx.restore(); break;
      }
      case 'banner': { // a banner on two poles over a way in, raised a little, its words across it
        const k = 1.1, ca = Math.cos(p.a), sa = Math.sin(p.a), hw = p.w / 2, up = (px, py) => [cam.x + (px - cam.x) * k, cam.y + (py - cam.y) * k];
        const E0 = [x - ca * hw, y - sa * hw], E1 = [x + ca * hw, y + sa * hw], T0 = up(...E0), T1 = up(...E1);
        ctx.strokeStyle = '#d0d0d0'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(...E0); ctx.lineTo(...T0); ctx.moveTo(...E1); ctx.lineTo(...T1); ctx.stroke();
        ctx.save(); ctx.translate((T0[0] + T1[0]) / 2, (T0[1] + T1[1]) / 2); ctx.rotate(p.a);
        ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(-hw * k + 3, -6, hw * 2 * k, 16);
        ctx.fillStyle = p.c; ctx.fillRect(-hw * k, -9, hw * 2 * k, 18); ctx.fillStyle = '#f1c40f'; ctx.fillRect(-hw * k, -9, hw * 2 * k, 2); ctx.fillRect(-hw * k, 7, hw * 2 * k, 2);
        ctx.fillStyle = '#fff3b0'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.text, 0, 0.5); ctx.textBaseline = 'alphabetic';
        ctx.restore(); break;
      }
      case 'tramstop': { // a stop's sign (a tram on a red-edged plate), and its name close up
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x - 3, y - 6, 10, 9);
        ctx.fillStyle = '#5a5f66'; ctx.fillRect(x - 1, y - 1, 2, 2);
        ctx.fillStyle = '#fafafa'; ctx.fillRect(x - 5, y - 10, 10, 8); ctx.strokeStyle = '#c8202a'; ctx.lineWidth = 1.2; ctx.strokeRect(x - 5, y - 10, 10, 8);
        ctx.fillStyle = '#c8202a'; ctx.fillRect(x - 3, y - 8, 6, 3); ctx.fillRect(x - 3, y - 5, 1.2, 1.2); ctx.fillRect(x + 1.8, y - 5, 1.2, 1.2);
        if (cam.zoom > 0.75) { ctx.font = 'bold 8px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.lineJoin = 'round'; ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(18,20,24,.75)'; ctx.strokeText(p.name, x + 7, y - 4); ctx.fillStyle = '#ffe9a0'; ctx.fillText(p.name, x + 7, y - 4); }
        break;
      }
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
      case 'bale': { // a round hay bale, rolled up in a spiral
        ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(x + 3, y + 3, 9, 0, TAU); ctx.fill();
        const gr = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, 9); gr.addColorStop(0, '#e8cf7a'); gr.addColorStop(1, '#b8954a');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(120,90,40,.55)'; ctx.lineWidth = 1; ctx.beginPath();
        for (let a = 0; a < 14; a += 0.3) { const r = a * 0.6; a ? ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : ctx.moveTo(x, y); }
        ctx.stroke(); break;
      }
      case 'umb': { // a beach umbrella, striped, with its shadow on the sand
        ctx.fillStyle = 'rgba(60,40,10,.22)'; ctx.beginPath(); ctx.arc(x + SUN.sx * 6 + 4, y + SUN.sy * 6 + 6, 15, 0, TAU); ctx.fill();
        for (let i = 0; i < 8; i++) { ctx.fillStyle = i & 1 ? '#f4f4f0' : p.c; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, 15, i * TAU / 8, (i + 1) * TAU / 8); ctx.fill(); }
        ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc(x, y, 1.6, 0, TAU); ctx.fill(); break;
      }
      case 'towel':
        ctx.save(); ctx.translate(x, y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-5, -9, 10, 18);
        ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(-5, -5, 10, 2); ctx.fillRect(-5, 3, 10, 2); ctx.restore(); break;
      case 'guard': // a lifeguard tower
        ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x - 8, y - 6, 22, 20);
        ctx.fillStyle = '#e8e2d4'; ctx.fillRect(x - 11, y - 9, 22, 18); ctx.fillStyle = '#d63a2a'; ctx.fillRect(x - 11, y - 9, 22, 6);
        ctx.fillStyle = '#6a4a2a'; ctx.fillRect(x - 3, y + 9, 6, 10); ctx.fillStyle = '#2e5aa8'; ctx.fillRect(x + 7, y - 14, 2, 8); break;
      case 'boat': {
        ctx.save(); ctx.translate(x, y + Math.sin(time * 1.5 + p.s) * 1.2); ctx.rotate(p.a + Math.sin(time * 1.1 + p.s) * 0.04);
        const L = p.row ? 18 : 34, B = p.row ? 7 : 12;
        ctx.fillStyle = 'rgba(0,20,40,.3)'; ctx.beginPath(); ctx.ellipse(3, 4, L / 2 + 2, B / 2 + 2, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = p.c; ctx.beginPath(); ctx.moveTo(L / 2, 0); ctx.quadraticCurveTo(L / 4, -B / 2, -L / 2, -B / 2 + 1); ctx.lineTo(-L / 2, B / 2 - 1); ctx.quadraticCurveTo(L / 4, B / 2, L / 2, 0); ctx.fill();
        ctx.fillStyle = p.row ? '#8a6a44' : '#e8e0d0'; ctx.fillRect(-L / 2 + 3, -B / 2 + 2.5, L * 0.6, B - 5);
        if (!p.row) { ctx.fillStyle = '#5a6a78'; ctx.fillRect(-L * 0.1, -B / 2 + 3, L * 0.25, B - 6); }
        ctx.restore(); break;
      }
      case 'jetty':
        ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(x + 4, y + 4, p.w * T, p.h * T);
        ctx.fillStyle = '#8a6a44'; ctx.fillRect(x, y, p.w * T, p.h * T);
        ctx.fillStyle = 'rgba(40,24,10,.45)'; for (let i = 0; i < p.h * T; i += 5) ctx.fillRect(x, y + i, p.w * T, 1);
        break;
      case 'dish': { // a radar dish on its mount, pointed at the sky
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x + 8, y + 10, p.r, p.r * 0.7, p.a, 0, TAU); ctx.fill();
        const gr = ctx.createRadialGradient(x - p.r * 0.3, y - p.r * 0.3, 2, x, y, p.r); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.8, '#cfd4da'); gr.addColorStop(1, '#9aa2ac');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(x, y, p.r, p.r * 0.82, p.a, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#8a929c'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(p.a) * p.r * 0.6, y + Math.sin(p.a) * p.r * 0.6); ctx.stroke();
        ctx.fillStyle = '#6a727c'; ctx.beginPath(); ctx.arc(x + Math.cos(p.a) * p.r * 0.6, y + Math.sin(p.a) * p.r * 0.6, 2.5, 0, TAU); ctx.fill(); break;
      }
      case 'fence': // a run of chain-link between two posts
        ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.a[0] + 3, p.a[1] + 4); ctx.lineTo(p.b[0] + 3, p.b[1] + 4); ctx.stroke();
        ctx.strokeStyle = 'rgba(205,210,215,.85)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(p.a[0], p.a[1]); ctx.lineTo(p.b[0], p.b[1]); ctx.stroke();
        ctx.fillStyle = '#5a6068'; ctx.fillRect(p.a[0] - 2, p.a[1] - 2, 4, 4); ctx.fillRect(p.b[0] - 2, p.b[1] - 2, 4, 4); break;
      case 'sign':
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x - 15, y - 4, 32, 12);
        ctx.fillStyle = '#e8c43a'; ctx.fillRect(x - 17, y - 6, 32, 12); ctx.fillStyle = '#1a1a1a';
        ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(p.text, x - 1, y + 2); break;
      case 'orloj': { // Brno's astronomical clock: a polished black stone bullet on the square
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x + 6, y + 6, 9, 7, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#0c0d10'; ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.fill(); // (its foot: the stone itself stands six metres tall, drawn with the roofs, see drawOrloj)
        break;
      }
      case 'market': // a row of market stalls under striped awnings
        for (let i = 0; i < 3; i++) {
          const sx = x + i * 18, c = ['#c0392b', '#2e86c1', '#27ae60'][(p.s + i) % 3];
          ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(sx + 3, y + 4, 15, 11);
          for (let k = 0; k < 5; k++) { ctx.fillStyle = k & 1 ? '#f4f0e6' : c; ctx.fillRect(sx + k * 3, y, 3, 11); }
        }
        break;
      case 'platform':
        ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(x + 3, y + 3, p.w * T, 9);
        ctx.fillStyle = '#b8b4ac'; ctx.fillRect(x, y, p.w * T, 9); ctx.fillStyle = '#e8c43a'; ctx.fillRect(x, y + 7, p.w * T, 1.5); break;
      case 'stand': // a grandstand: rows of coloured seats under a roof edge
        ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(x + 4, y + 4, p.w * T, 22);
        ctx.fillStyle = '#8a8e94'; ctx.fillRect(x, y, p.w * T, 22);
        for (let r = 0; r < 4; r++) { ctx.fillStyle = ['#c62828', '#1565c0', '#f9a825', '#2e7d32'][(r + p.s) % 4]; ctx.fillRect(x + 2, y + 3 + r * 4.6, p.w * T - 4, 2.6); }
        ctx.fillStyle = '#e8e8e8'; ctx.fillRect(x, y, p.w * T, 2.5); break;
      case 'animal': // zoo animals, seen from above
        ctx.save(); ctx.translate(x, y); ctx.rotate(p.a + Math.sin(time * 0.4 + p.s) * 0.3);
        ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(2, 2, 8, 4.5, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = p.c; ctx.beginPath(); ctx.ellipse(0, 0, 8, 4.5, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(9, 0, 2.8, 0, TAU); ctx.fill();
        ctx.restore(); break;
      case 'turbine': // the tower's foot; the blades turn high above, in drawTurbines
        ctx.fillStyle = '#9aa0a6'; ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fill(); break;
    }
  });
}
// wind turbines: a tall mast with three blades turning in the breeze, drawn in perspective above everything on the ground
function drawTurbines(v) {
  inView(PGRID, v, 200, p => {
    if (p.k !== 'turbine') return;
    const z = 0.55, k = 1 + z, tx = cam.x + (p.x - cam.x) * k, ty = cam.y + (p.y - cam.y) * k;
    if (SUN.on) { ctx.strokeStyle = `rgba(12,18,40,${0.2 * (1 - NIGHT)})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + SUN.sx * HC * SUN.len * z, p.y + SUN.sy * HC * SUN.len * z); ctx.stroke(); }
    const gr = ctx.createLinearGradient(p.x, p.y, tx, ty); gr.addColorStop(0, tint('#b8bcc0')); gr.addColorStop(1, tint('#f2f4f6'));
    ctx.strokeStyle = gr; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tx, ty); ctx.stroke();
    const a0 = p.ph + time * 1.6;
    ctx.fillStyle = tint('#f4f6f8');
    for (let i = 0; i < 3; i++) {
      const a = a0 + i * TAU / 3, ca = Math.cos(a), sa = Math.sin(a), L = 46;
      ctx.beginPath(); ctx.moveTo(tx - sa * 3, ty + ca * 3); ctx.lineTo(tx + ca * L - sa * 1, ty + sa * L + ca * 1); ctx.lineTo(tx + ca * L * 0.3 + sa * 4, ty + sa * L * 0.3 - ca * 4); ctx.fill();
    }
    ctx.fillStyle = tint('#d8dce0'); ctx.beginPath(); ctx.arc(tx, ty, 4, 0, TAU); ctx.fill();
    if (NIGHT > 0.4 && Math.sin(time * 2 + p.ph) > 0.6) { ctx.fillStyle = '#ff3030'; ctx.beginPath(); ctx.arc(tx, ty, 2.5, 0, TAU); ctx.fill(); } // aviation light
  });
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
    if (!n.poles) n.poles = n.edges.filter(e => n.grp.has(e.id)).map(e => { const [ux, uy] = n.dirs.get(e.id), a = n.clr + 2, o = e.wd / 2 + 14; return { x: n.x + ux * a + uy * o, y: n.y + uy * a - ux * o, g: n.grp.get(e.id) }; })
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
  const G = bGrid(), L = SUN.len * HC, p = new Path2D(), R = B_TOP * L * Math.max(Math.abs(SUN.sx), Math.abs(SUN.sy)) + 1; // (B_TOP: set as the index is made)
  for (const b of cellQuery(G, v.x0 - R, v.y0 - R, v.x1 + R, v.y1 + R)) { // (as far round the view as the tallest one's shadow reaches)
    const ox = SUN.sx * L * b.top, oy = SUN.sy * L * b.top;
    if (b.x + Math.min(0, ox) > v.x1 || b.x + b.w + Math.max(0, ox) < v.x0 || b.y + Math.min(0, oy) > v.y1 || b.y + b.h + Math.max(0, oy) < v.y0) continue;
    if (b.wr) { // a real outline: each wall facing away from the sun swept along the shadow (the rest falls under the building)
      const hz = b.ht + (b.cap === 'gable' ? b.capH * 0.5 : b.hip ? b.hip * 0.5 : 0), hx = SUN.sx * L * hz, hy = SUN.sy * L * hz;
      for (const r of b.wr) for (let i = 0, n = r.length, j = n - 2; i < n; j = i, i += 2) {
        const ax = r[j], ay = r[j + 1], bx = r[i], by = r[i + 1];
        if ((by - ay) * hx - (bx - ax) * hy <= 0) continue;
        p.moveTo(ax, ay); p.lineTo(ax + hx, ay + hy); p.lineTo(bx + hx, by + hy); p.lineTo(bx, by); p.closePath();
      }
      if (b.pyr || b.cap === 'hip' || b.dome) { // (a spire, a hip or a dome: a point above the middle)
        const r = b.wr[0], pts = []; let mx = 0, my = 0;
        for (let i = 0; i < r.length; i += 2) { pts.push([r[i] + hx, r[i + 1] + hy]); mx += r[i]; my += r[i + 1]; }
        mx /= r.length / 2; my /= r.length / 2; pts.push([mx + ox, my + oy]);
        const hp = hull(pts); p.moveTo(hp[0][0], hp[0][1]); for (let k = 1; k < hp.length; k++) p.lineTo(hp[k][0], hp[k][1]); p.closePath();
      }
      continue;
    }
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
  inView(treeGrid(), v, 80, t => {
    if (t.down) return;
    const r = t.sp >= 10 ? t.r * 0.7 : t.sp >= 8 ? t.r * 0.55 : t.r, l = t.sp >= 10 ? tl * 0.5 : t.sp >= 8 ? tl * 1.6 : tl;
    const sx = t.x + SUN.sx * t.r * l * 3, sy = t.y + SUN.sy * t.r * l * 3;
    p.moveTo(sx + r, sy); p.arc(sx, sy, r, 0, TAU);
    if (!(t.sp >= 10)) { // the trunk's shadow, wound the same way as the canopy's so the two merge
      const w = Math.max(1.2, (t.tr || 3) * 0.8), dx = sx - t.x, dy = sy - t.y, L = Math.hypot(dx, dy);
      if (L > 1) {
        const nx = -dy / L * w, ny = dx / L * w, q = [[t.x + nx, t.y + ny], [sx + nx, sy + ny], [sx - nx, sy - ny], [t.x - nx, t.y - ny]];
        let a = 0; for (let i = 0; i < 4; i++) { const [x0, y0] = q[i], [x1, y1] = q[(i + 1) % 4]; a += x0 * y1 - x1 * y0; }
        if (a < 0) q.reverse();
        p.moveTo(q[0][0], q[0][1]); for (let i = 1; i < 4; i++) p.lineTo(q[i][0], q[i][1]); p.closePath();
      }
    }
  });
  ctx.fillStyle = `rgba(12,18,40,${a})`; ctx.fill(p);
}

// ---- buildings: extruded boxes with windows, roof caps, tiers, domes and spires
const WALLN = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const LIT = ['#ffd27a', '#ffe2a8', '#fff1c9', '#ffc46a'];
// a building's walls: the box's four sides that face the camera
function drawBox(b, x0, y0, x1, y1, z0, z1, win, top) {
  const cx = cam.x, cy = cam.y, C = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], vis = [cy < y0, cx > x1, cy > y1, cx < x0];
  for (let i = 0; i < 4; i++) if (vis[i]) { const j = (i + 1) & 3; drawWall(b, C[i][0], C[i][1], C[j][0], C[j][1], WALLN[i][0], WALLN[i][1], i, z0, z1, win, top); }
}
// one wall from (ax, ay) to (bx, by) with its outward normal, from z0 up to z1: its material, windows and the rest
let FRC = 1, FRS = 0; // (the turn of the frame a building is drawn in: its walls know which way is north)
// a wall's dark windows, lit windows and the shade along its foot are gathered as numbers (the four corners of each
// quad) and drawn as one path each: making three Path2D objects for every wall cost more than drawing them
const WQ = [[], [], []];
function fillQuads(A) {
  if (!A.length) return false;
  ctx.beginPath();
  for (let i = 0; i < A.length; i += 8) { ctx.moveTo(A[i], A[i + 1]); ctx.lineTo(A[i + 2], A[i + 3]); ctx.lineTo(A[i + 4], A[i + 5]); ctx.lineTo(A[i + 6], A[i + 7]); } // (a fill closes each quad itself)
  ctx.fill(); return true;
}
function drawWall(b, ax, ay, bx, by, nx, ny, i, z0, z1, win, top) {
  const cx = cam.x, cy = cam.y, k0 = 1 + z0, k1 = 1 + z1;
  const A0x = cx + (ax - cx) * k0, A0y = cy + (ay - cy) * k0, B0x = cx + (bx - cx) * k0, B0y = cy + (by - cy) * k0;
  const A1x = cx + (ax - cx) * k1, A1y = cy + (ay - cy) * k1, B1x = cx + (bx - cx) * k1, B1y = cy + (by - cy) * k1;
  const wny = FRS * nx + FRC * ny, L = lum(nx, ny, 0) * (wny < -0.7 ? 0.9 : 1); // (a wall facing north is a shade darker)
  ctx.fillStyle = tint(b.wall, L);
  const wallPath = () => { ctx.beginPath(); ctx.moveTo(A0x, A0y); ctx.lineTo(B0x, B0y); ctx.lineTo(B1x, B1y); ctx.lineTo(A1x, A1y); ctx.closePath(); };
  wallPath(); ctx.fill();
  // windows are quads in the wall's (u along, v up) coordinates
  const depth = Math.hypot(A1x - A0x, A1y - A0y), len = Math.hypot(bx - ax, by - ay);
  // the wall's material, mapped with u along the wall and v up it (the chimney is the only box drawn without a top flag)
  const mat = top === undefined ? 'brick' : wallMat(b), wt = WTEX[mat];
  if (TEX && wt && depth > 2.5) {
    const hz = (z1 - z0) * HC, ux = (B0x - A0x) / len, uy = (B0y - A0y) / len;
    const vx = (A1x + B1x - A0x - B0x) / (2 * hz), vy = (A1y + B1y - A0y - B0y) / (2 * hz);
    wt.setTransform(setPM(ux / 2, uy / 2, -vx / 2, -vy / 2, A0x, A0y));
    ctx.fillStyle = wt; ctx.globalAlpha = TEXA; ctx.fill(); ctx.globalAlpha = 1;
  }
  const P = (u, v) => { const ux0 = A0x + (B0x - A0x) * u, uy0 = A0y + (B0y - A0y) * u; return [ux0 + (A1x + (B1x - A1x) * u - ux0) * v, uy0 + (A1y + (B1y - A1y) * u - uy0) * v]; };
  const pd = WQ[0], pl = WQ[1], pe = WQ[2]; pd.length = pl.length = pe.length = 0;
  const qn = (A, u0, u1, v0, v1) => { // (a quad's corners into A, worked out just as P does)
    const a0 = A0x + (B0x - A0x) * u0, b0 = A0y + (B0y - A0y) * u0, a1 = A0x + (B0x - A0x) * u1, b1 = A0y + (B0y - A0y) * u1;
    const c0 = A1x + (B1x - A1x) * u0 - a0, d0 = A1y + (B1y - A1y) * u0 - b0, c1 = A1x + (B1x - A1x) * u1 - a1, d1 = A1y + (B1y - A1y) * u1 - b1;
    A.push(a0 + c0 * v0, b0 + d0 * v0, a1 + c1 * v0, b1 + d1 * v0, a1 + c1 * v1, b1 + d1 * v1, a0 + c0 * v1, b0 + d0 * v1);
  };
  const quad = (path, u0, u1, v0, v1) => { const a = P(u0, v0), b2 = P(u1, v0), c = P(u1, v1), d = P(u0, v1); path.moveTo(a[0], a[1]); path.lineTo(b2[0], b2[1]); path.lineTo(c[0], c[1]); path.lineTo(d[0], d[1]); path.closePath(); };
  if (z0 === 0 && depth > 3) qn(pe, 0, 1, 0, Math.min(0.3, 3 / depth)); // ambient occlusion at the base
  let nf = Math.max(1, Math.round((z1 - z0) / 0.042));
  const ws = win === 'bays' && !(wny > 0.7) ? 'grid' : win;
  const litP = NIGHT * (b.kind === 'church' ? 0.6 : 0.45), sd = b.sd + i * 7919;
  const lit = (f, c) => litP > 0.02 && ((Math.imul(sd ^ (f * 131 + c * 31337), 2654435761) >>> 0) % 1000) < litP * 1000;
  // every floor keeps its windows whatever the view (dropping floors as the wall foreshortens made them jump and
  // reshuffled the lit ones); when the floors get too thin to see, the windows fade out instead
  let wa = 1;
  const grid = (sp, um, v0, v1, n = nf) => {
    wa = clamp((depth / n - 1.2) / 2.3, 0, 1); if (wa <= 0) return;
    const nc = Math.max(1, Math.min(Math.floor(len / sp), Math.floor(len * k1 / 5)));
    for (let f = 0; f < n; f++) for (let c = 0; c < nc; c++) qn(lit(f, c) ? pl : pd, (c + um) / nc, (c + 1 - um) / nc, (f + v0) / n, (f + v1) / n);
  };
  let extra = null;
  if (ws === 'grid') grid(15, 0.28, 0.3, 0.78);
  else if (ws === 'ribbon') grid(12, 0.07, 0.2, 0.8);
  else if (ws === 'tall') grid(22, 0.4, 0.25, 0.8, 1);
  else if (ws === 'slit') grid(30, 0.4, 0.55, 0.85, 1);
  else if (ws === 'ware') {
    grid(24, 0.3, 0.72, 0.9, 1);
    if (depth > 6 && ((b.sd >> (i & 15)) & 1)) { extra = '#4a4d52'; const pc = new Path2D(); quad(pc, 0.3, 0.62, 0, 0.62); ctx.fillStyle = tint(extra, L); ctx.fill(pc); }
  } else if (ws === 'bays') {
    const n = Math.max(1, Math.floor(len / 40)), pc = new Path2D();
    for (let c = 0; c < n; c++) quad(pc, (c + 0.12) / n, (c + 0.88) / n, 0, 0.66);
    ctx.fillStyle = tint('#d8d4ca', L); ctx.fill(pc);
    ctx.strokeStyle = tint('#9a968e', L); ctx.lineWidth = 1; ctx.stroke(pc);
  } else if (ws === 'columns') {
    if (depth > 4) {
      const nc = Math.max(2, Math.floor(len / 16)), pc = new Path2D();
      qn(pd, 0.02, 0.98, 0.05, 0.86);
      for (let c = 0; c < nc; c++) quad(pc, (c + 0.3) / nc, (c + 0.7) / nc, 0.03, 0.88);
      ctx.fillStyle = tint('#3a3530', L); fillQuads(pd);
      ctx.fillStyle = tint('#f3eee3', L); ctx.fill(pc);
      ctx.fillStyle = tint('#000000', 1); ctx.globalAlpha = 0.2; fillQuads(pe); ctx.globalAlpha = 1;
      wallPath(); return; // (the wall's own outline is left as the path, as it always was)
    }
  }
  ctx.fillStyle = tint(b.style === 'glass' ? '#a8cde2' : b.kind === 'church' ? '#2c3a55' : '#28313d', b.style === 'glass' ? L * 0.95 : 1);
  ctx.globalAlpha = wa; let drawn = fillQuads(pd);
  if (litP > 0.02) {
    ctx.fillStyle = b.kind === 'church' ? '#e8a25a' : LIT[b.sd & 3]; ctx.globalAlpha = wa * Math.min(1, NIGHT * (b.kind === 'church' ? 0.8 : 1.4)); drawn = fillQuads(pl) || drawn;
  } else drawn = fillQuads(pl) || drawn;
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(0,0,0,.22)'; drawn = fillQuads(pe) || drawn;
  if (drawn) wallPath(); // (the wall's own outline is the path again: the glass below, and whoever comes next, expect it)
  if (b.kind === 'club' && z0 === 0 && depth > 3) { // a club: its door on the front, and a neon tube under the eaves
    const pn = new Path2D(); quad(pn, 0.02, 0.98, 0.84, 0.88);
    if (i === (b.lp ? b.frontE : b.front)) {
      const pc = new Path2D(), dh = Math.min(0.42, 22 / depth); quad(pc, 0.44, 0.56, 0, dh); quad(pn, 0.42, 0.58, dh, dh + 0.04);
      ctx.fillStyle = '#140a12'; ctx.fill(pc);
    }
    ctx.fillStyle = tint(b.neon, NIGHT > 0.1 ? 1 : L * 0.75); ctx.fill(pn);
    if (NIGHT > 0.1) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = NIGHT * 0.3; ctx.strokeStyle = b.neon; ctx.lineWidth = 5; ctx.stroke(pn); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
  }
  // curtain walls reflect the sky: a bright band that glides to and fro across the glass as you move. It follows
  // the facade's place in the world (not on the screen), so every storey of a tower shows it in the same place,
  // and it swings smoothly (it used to wrap round and jump from one edge to the other).
  if (mat === 'glass' && NIGHT < 0.95 && depth > 4) {
    const q = (ax + bx) * 0.00035 + (ay + by) * 0.0002 - cam.x * 0.0011 - cam.y * 0.0007 + i * 0.29, ph = 0.5 + 0.75 * Math.sin(q * Math.PI);
    if (ph > -0.14 && ph < 1.14) {
      const g0 = P(0, 0), g1 = P(1, 1), gr = ctx.createLinearGradient(g0[0], g0[1], g1[0], g1[1]), a = 0.24 * (1 - NIGHT);
      const s0 = clamp(ph - 0.14, 0, 1), s1 = clamp(ph, 0, 1), s2 = clamp(ph + 0.14, 0, 1);
      gr.addColorStop(0, 'rgba(225,240,255,0)'); if (s0 > 0) gr.addColorStop(s0, 'rgba(225,240,255,0)');
      gr.addColorStop(s1, `rgba(235,246,255,${a * (1 - Math.abs(ph - s1) / 0.14)})`);
      if (s2 < 1) gr.addColorStop(s2, 'rgba(225,240,255,0)'); gr.addColorStop(1, 'rgba(225,240,255,0)');
      ctx.fillStyle = gr; ctx.globalAlpha = wa; ctx.fill(); ctx.globalAlpha = 1;
    }
  }
}
let TEXA = 1, TEX = true; // how strongly wall and roof textures show (they fade into the dark at night); TEX: whether they are drawn at all
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
  drawFaces(b, faces);
  if (b.cross) {
    const cxw = (x0 + x1) / 2, cyw = (y0 + y1) / 2, a = proj(cxw, cyw, r), t = proj(cxw, cyw, r + 0.07), m = proj(cxw, cyw, r + 0.05);
    ctx.strokeStyle = tint('#e0c060', 1.1); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(t[0], t[1]); ctx.moveTo(m[0] - 4, m[1]); ctx.lineTo(m[0] + 4, m[1]); ctx.stroke();
  }
}
// sloped faces in 3-D (p: corners, n: normal, c: colour; a wall is skipped when it faces away), far ones first, each
// with its tiles or slates (x along the eave, y down the slope), or the wall's material on a gable end
function drawFaces(b, faces) {
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
    // tiles or slates on the slopes, the wall's material on gable ends: x along the eave, y down the slope
    const tx = f.wall ? WTEX[wallMat(b)] : roofMat(b);
    if (TEX && tx) {
      const p = f.p, q = f.q, n = p.length, top = f.top || (n === 4 ? [(p[2][0] + p[3][0]) / 2, (p[2][1] + p[3][1]) / 2, p[2][2]] : p[2]);
      const qt = f.top ? proj(top[0], top[1], top[2]) : n === 4 ? [(q[2][0] + q[3][0]) / 2, (q[2][1] + q[3][1]) / 2] : q[2];
      const eLen = Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]), sLen = Math.hypot(top[0] - (p[0][0] + p[1][0]) / 2, top[1] - (p[0][1] + p[1][1]) / 2, (top[2] - p[0][2]) * HC);
      if (eLen > 1 && sLen > 1) {
        const X = [(q[1][0] - q[0][0]) / eLen, (q[1][1] - q[0][1]) / eLen], Y = [(qt[0] - (q[0][0] + q[1][0]) / 2) / sLen, (qt[1] - (q[0][1] + q[1][1]) / 2) / sLen];
        tx.setTransform(setPM(X[0] / 2, X[1] / 2, -Y[0] / 2, -Y[1] / 2, q[0][0], q[0][1]));
        ctx.fillStyle = tx; ctx.globalAlpha = TEXA; ctx.fill(); ctx.globalAlpha = 1;
      }
    }
  }
}
// red and brown roofs are clay tiles, grey ones slate
function roofMat(b) {
  if (b.rmat === undefined) { const n = parseInt(b.roof.slice(1), 16); b.rmat = (n >> 16) > (n & 255) + 30 ? RTEX.clay : RTEX.slate; }
  return b.rmat;
}
function roofText(text, x, y, size, color) {
  ctx.font = `bold ${size}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = color; ctx.fillText(text, x, y); ctx.textBaseline = 'alphabetic';
}
// what stands on a plain flat roof, in world px from its corner: a stair hut, air conditioners, skylights, vents,
// drains and rain stains, more of them the bigger the roof (made once per building, from its seed)
function roofKit(b, w, h) {
  const r = prng(b.sd ^ 0x5bd1e995), it = [], used = [], area = w * h / (T * T);
  const fits = (x, y, ww, hh) => x >= 6 && y >= 6 && x + ww <= w - 6 && y + hh <= h - 6 && !used.some(u => x < u[0] + u[2] + 5 && x + ww + 5 > u[0] && y < u[1] + u[3] + 5 && y + hh + 5 > u[1]);
  const put = (kind, ww, hh, x, y) => {
    for (let i = 0; i < 14; i++) {
      const px = x ?? 6 + r() * (w - 12 - ww), py = y ?? 6 + r() * (h - 12 - hh);
      if (fits(px, py, ww, hh)) { used.push([px, py, ww, hh]); it.push([kind, px, py, ww, hh]); return true; }
      if (x !== undefined) return false;
    }
    return false;
  };
  if (b.sign) used.push([w * 0.08, h * 0.28, w * 0.84, h * 0.44]); // (keep clear of what else is up there)
  if (b.pool) used.push([w * 0.2, h * 0.58, w * 0.6, h * 0.4]);
  if (b.tank) used.push([w * 0.55, h * 0.1, w * 0.4, h * 0.4]);
  if (b.solar) used.push([0, 0, w, h]);
  for (let i = Math.round(area / 9 * (0.5 + r())); i > 0; i--) it.push(['stain', 8 + r() * (w - 16), 8 + r() * (h - 16), 10 + r() * 26, 6 + r() * 16]);
  if (area >= 9 && b.style !== 'ware' && w > 40 && h > 40) put('hut', 24, 18);
  if (area >= 14 && r() < 0.55) { // a row of skylights over the stairwell or the atrium
    const n = Math.min(6, Math.floor((w - 24) / 26)), y = 10 + r() * (h - 36);
    for (let i = 0; i < n; i++) put('sky', 18, 13, 12 + i * 26, y);
  }
  for (let i = Math.min(12, Math.round(area / 6 * (0.4 + r()))); i > 0; i--) { const big = r() < 0.3; put(big ? 'ac2' : 'ac', big ? 26 : 14, big ? 13 : 11); }
  for (let i = Math.min(14, Math.round(area / 4 * (0.3 + r()))); i > 0; i--) put('vent', 7, 7);
  for (const [fx, fy] of [[0, 0], [1, 1], [r() < 0.5 ? 0 : 1, r() < 0.5 ? 1 : 0]]) it.push(['drain', fx ? w - 9 : 9, fy ? h - 9 : 9, 0, 0]);
  return it;
}
function drawRoofKit(b, rx, ry, rw, rh, k, L, sx, sy) {
  if (!b.rk || b.rk.w !== rw / k) { b.rk = roofKit(b, rw / k, rh / k); b.rk.w = rw / k; }
  const shade = 0.28 * (1 - NIGHT * 0.6);
  for (const [kind, x, y, w, h] of b.rk) {
    const X = rx + x * k, Y = ry + y * k, Wd = w * k, Hd = h * k;
    if (kind === 'stain') { ctx.fillStyle = 'rgba(20,20,10,.09)'; ctx.beginPath(); ctx.ellipse(X, Y, Wd / 2, Hd / 2, 0, 0, TAU); ctx.fill(); continue; }
    if (kind === 'drain') { ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.arc(X, Y, 2 * k, 0, TAU); ctx.fill(); continue; }
    const hgt = kind === 'hut' ? 3 : kind === 'sky' ? 0.5 : 1; // (how far its shadow reaches)
    ctx.fillStyle = `rgba(0,0,0,${shade})`;
    if (kind === 'vent') { ctx.beginPath(); ctx.arc(X + Wd / 2 - sx * 0.8, Y + Hd / 2 - sy * 0.8, Wd / 2, 0, TAU); ctx.fill(); }
    else ctx.fillRect(X - sx * hgt, Y - sy * hgt, Wd, Hd);
    if (kind === 'hut') { // the stair hut: a box with a door and a vent hood
      ctx.fillStyle = tint(b.roof, L * 1.18); ctx.fillRect(X, Y, Wd, Hd);
      ctx.fillStyle = tint(b.roof, L * 0.95); ctx.fillRect(X + 2 * k, Y + 2 * k, Wd - 4 * k, Hd - 4 * k);
      ctx.fillStyle = tint('#4a4f55', L); ctx.fillRect(X + Wd * 0.3, Y + Hd - 2 * k, Wd * 0.4, 2 * k);
      ctx.fillStyle = tint('#9aa0a6', L); ctx.fillRect(X + Wd - 8 * k, Y + 3 * k, 5 * k, 5 * k);
    } else if (kind === 'sky') { // a skylight: metal frame, glass catching the sky (lit from below at night)
      ctx.fillStyle = tint('#c8ccd0', L); ctx.fillRect(X, Y, Wd, Hd);
      ctx.fillStyle = NIGHT > 0.35 && ((b.sd >> 3) & 1) ? `rgba(255,214,140,${0.45 + 0.4 * NIGHT})` : tint('#6f8fa6', L); ctx.fillRect(X + 2 * k, Y + 2 * k, Wd - 4 * k, Hd - 4 * k);
      ctx.fillStyle = tint('#c8ccd0', L); ctx.fillRect(X + Wd / 2 - 0.5 * k, Y + 2 * k, k, Hd - 4 * k);
      ctx.fillStyle = `rgba(255,255,255,${0.28 * (1 - NIGHT)})`; ctx.fillRect(X + 3 * k, Y + 3 * k, Wd * 0.25, 1.2 * k);
    } else if (kind === 'vent') { // a mushroom vent
      ctx.fillStyle = tint('#a4a9ae', L); ctx.beginPath(); ctx.arc(X + Wd / 2, Y + Hd / 2, Wd / 2, 0, TAU); ctx.fill();
      ctx.fillStyle = tint('#5a5f66', L); ctx.beginPath(); ctx.arc(X + Wd / 2, Y + Hd / 2, Wd / 4, 0, TAU); ctx.fill();
    } else { // an air conditioner: a grey box with one or two fans behind a grille
      ctx.fillStyle = tint('#c9ccd0', L); ctx.fillRect(X, Y, Wd, Hd);
      ctx.fillStyle = tint('#e2e4e6', L); ctx.fillRect(X, Y, Wd, 1.5 * k);
      const nf = kind === 'ac2' ? 2 : 1, fr = Math.min(Wd / nf, Hd) * 0.36;
      for (let f = 0; f < nf; f++) {
        const fx = X + Wd * (f + 0.5) / nf, fy = Y + Hd / 2 + 0.5 * k;
        ctx.fillStyle = tint('#3c4046', L); ctx.beginPath(); ctx.arc(fx, fy, fr, 0, TAU); ctx.fill();
        ctx.strokeStyle = tint('#8a9096', L); ctx.lineWidth = 0.8 * k; ctx.beginPath();
        const a0 = (b.sd & 7) + f + time * (NIGHT > 0.5 ? 0 : 9);
        for (let j = 0; j < 3; j++) { const a = a0 + j * TAU / 3; ctx.moveTo(fx, fy); ctx.lineTo(fx + Math.cos(a) * fr * 0.9, fy + Math.sin(a) * fr * 0.9); }
        ctx.stroke();
      }
    }
  }
}
const signSize = (t, rw, rh) => Math.min(Math.min(rw, rh) * 0.2, rw * 0.8 / (t.length * 0.75), 30);
// a roof's sign: its letters in their colour, or (b.plate: a faculty's) white on a panel of that colour
function signOn(b, x, y, size, color) {
  if (b.plate) {
    ctx.font = `bold ${size}px sans-serif`; const w = ctx.measureText(b.sign).width;
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x - w / 2 - size * 0.3, y - size * 0.62, w + size * 0.75, size * 1.35);
    ctx.fillStyle = color; ctx.fillRect(x - w / 2 - size * 0.4, y - size * 0.7, w + size * 0.8, size * 1.35);
    color = '#ffffff';
  }
  roofText(b.sign, x, y, size, color);
}
function flatRoof(b, x0, y0, x1, y1, z, top, deco) { // (deco: only what stands on it, the roof itself being drawn already)
  const k = 1 + z, rx = cam.x + (x0 - cam.x) * k, ry = cam.y + (y0 - cam.y) * k, rw = (x1 - x0) * k, rh = (y1 - y0) * k;
  const L = lum(0, 0, 1) * 1.02, m = Math.min(rw, rh);
  if (deco) ;
  else if (b.style === 'glass') {
    ctx.fillStyle = tint(b.roof, L * 1.2); ctx.fillRect(rx, ry, rw, rh);
    ctx.fillStyle = tint(b.roof, L); ctx.fillRect(rx + 2 * k, ry + 2 * k, rw - 4 * k, rh - 4 * k);
  } else if (b.seam) { ctx.fillStyle = tint(b.roof, L); ctx.fillRect(rx - 0.5, ry - 0.5, rw + 1, rh + 1); }
  else {
    ctx.fillStyle = tint(b.roof, L * 1.15); ctx.fillRect(rx, ry, rw, rh);
    ctx.fillStyle = tint(b.roof, L); ctx.fillRect(rx + 3 * k, ry + 3 * k, rw - 6 * k, rh - 6 * k);
  }
  if (b.kind !== 'stadium' && !deco && TEX) { // roofing: corrugated sheet, gravel or bitumen membrane, fixed to the building as it sways with parallax
    const ware = b.style === 'ware', rt = ware ? RTEX.corr : !b.kind && b.style === 'flat' && (b.sd & 3) === 0 ? RTEX.gravel : RTEX.membrane;
    const ox = cam.x * (1 - k) + (b.sd % 61) * k, oy = cam.y * (1 - k) + (b.sd % 37) * k, i = b.style === 'glass' ? 2 * k : 3 * k;
    rt.setTransform(ware && rw <= rh ? setPM(0, k / 2, k / 2, 0, ox, oy) : setPM(k / 2, 0, 0, k / 2, ox, oy));
    ctx.fillStyle = rt; ctx.globalAlpha = TEXA * 0.9; ctx.fillRect(rx + i, ry + i, rw - 2 * i, rh - 2 * i); ctx.globalAlpha = 1;
  }
  if (!top) return;
  const sx = -SUN.sx * 3, sy = -SUN.sy * 3;
  if (SUN.on && b.style !== 'glass' && b.kind !== 'stadium' && !b.seam && !deco) { // the parapet's shadow along the inside of the sunny edges
    const i = 3 * k, a = 0.16 * (1 - NIGHT), dx = SUN.sx * Math.min(SUN.len, 2) * 3 * k, dy = SUN.sy * Math.min(SUN.len, 2) * 3 * k;
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    if (dx > 0.3) ctx.fillRect(rx + i, ry + i, dx, rh - 2 * i); else if (dx < -0.3) ctx.fillRect(rx + rw - i + dx, ry + i, -dx, rh - 2 * i);
    if (dy > 0.3) ctx.fillRect(rx + i, ry + i, rw - 2 * i, dy); else if (dy < -0.3) ctx.fillRect(rx + i, ry + rh - i + dy, rw - 2 * i, -dy);
  }
  if (b.kit && b.style !== 'ware') drawRoofKit(b, rx + 3 * k, ry + 3 * k, rw - 6 * k, rh - 6 * k, k, L, sx * k, sy * k);
  if (b.style === 'ware') {
    ctx.fillStyle = tint('#a9c9da', L);
    for (let i = 1; i < 3; i++) rw > rh ? ctx.fillRect(rx + rw * i / 3 - 4 * k, ry + rh * 0.3, 8 * k, rh * 0.4) : ctx.fillRect(rx + rw * 0.3, ry + rh * i / 3 - 4 * k, rw * 0.4, 8 * k);
  }
  if (!b.kit || b.style === 'ware') for (const [u, w2, uw, uh] of b.det) {
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(rx + u * rw - sx, ry + w2 * rh - sy, uw * rw, uh * rh);
    ctx.fillStyle = tint(b.roof, L * 1.32); ctx.fillRect(rx + u * rw, ry + w2 * rh, uw * rw, uh * rh);
    ctx.fillStyle = tint(b.roof, L * 0.9); ctx.beginPath(); ctx.arc(rx + (u + uw / 2) * rw, ry + (w2 + uh / 2) * rh, Math.min(uw * rw, uh * rh) * 0.3, 0, TAU); ctx.fill();
  }
  if (b.pool && rw > 40 && rh > 40) { // a rooftop pool with its deck
    const pw = rw * 0.5, ph = rh * 0.26, px = rx + rw * 0.25, py = ry + rh * 0.64;
    ctx.fillStyle = tint('#ece6dc', L); ctx.fillRect(px - 4 * k, py - 4 * k, pw + 8 * k, ph + 8 * k);
    ctx.fillStyle = tint('#3ec8d8', L); ctx.fillRect(px, py, pw, ph);
    ctx.fillStyle = `rgba(255,255,255,${0.35 * (1 - NIGHT)})`; ctx.fillRect(px + pw * 0.1, py + ph * (0.3 + 0.1 * Math.sin(time * 2)), pw * 0.5, 1.5 * k);
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
  if (b.kind === 'club') { ctx.fillStyle = tint('#e8dcc0', L); chaser(rx, ry, rw, rh, k, false); }
  if (b.sign && rw > 30) signOn(b, rx + rw / 2, ry + rh / 2, signSize(b.sign, rw, rh), tint(b.neon || '#ffffff', 0.85));
  b._r = [rx, ry, rw, rh, k];
}
// a club's bulbs round the edge of its roof; at night two in three are lit, and the gaps run round the roof
function chaser(rx, ry, rw, rh, k, lit) {
  const i = 9 * k, w = rw - 2 * i, h = rh - 2 * i, P = 2 * (w + h), n = Math.max(12, Math.round(P / (9 * k))), ph = Math.floor(time * 8);
  ctx.beginPath();
  for (let j = 0; j < n; j++) {
    if (lit && ((j - ph) % 3 + 3) % 3 === 0) continue;
    let d = j / n * P, x, y;
    if (d < w) { x = rx + i + d; y = ry + i; } else if ((d -= w) < h) { x = rx + i + w; y = ry + i + d; } else if ((d -= h) < w) { x = rx + i + w - d; y = ry + i + h; } else { d -= w; x = rx + i; y = ry + i + h - d; }
    ctx.moveTo(x + 1.6 * k, y); ctx.arc(x, y, 1.6 * k, 0, TAU);
  }
  ctx.fill();
}
// the Moulin Rouge's mill: a red tower on a front corner of the roof under a pointed cap, its four lattice sails turning in a
// plane that leans back from the street (so that they read from straight above too), outlined in red light at night
function drawMill(b) {
  const f = b.front, nx = [0, 1, 0, -1][f], ny = [-1, 0, 1, 0][f], tx = -ny, ty = nx; // out of the front, and along it
  const s = b.w * 0.14, mx = b.x + b.w / 2 + (nx + tx) * (b.w / 2 - s), my = b.y + b.h / 2 + (ny + ty) * (b.h / 2 - s);
  const m = b._mill || (b._mill = { wall: '#b3242e', roof: '#5a161c', sd: b.sd, kind: 'mill', mat: 'brick', cap: 'hip', capH: 0.05 });
  const z1 = b.ht + 0.08;
  drawBox(m, mx - s, my - s, mx + s, my + s, b.ht, z1, 'slit', true);
  drawCap(m, mx - s, my - s, mx + s, my + s, z1);
  const hx = mx + nx * (s + 3), hy = my + ny * (s + 3), hz = z1 - 0.012, R = b.w * 0.36, rot = time * 0.8;
  const P = (u, v) => proj(hx + tx * u - nx * v * 0.64, hy + ty * u - ny * v * 0.64, Math.max(0.004, hz + v * 0.77 / HC));
  const L = lum(0, 0, 1), sails = [];
  for (let j = 0; j < 4; j++) {
    const a = rot + j * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a), w = R * 0.27;
    const at = (r, o) => P(ca * r - sa * o, sa * r + ca * o); // r along the arm, o across it (the sail trails the arm)
    sails.push({ arm: [at(0, 0), at(R, 0)], sail: [at(R * 0.22, 0), at(R, 0), at(R, -w), at(R * 0.22, -w)], bars: [0.42, 0.61, 0.8].map(t => [at(R * t, 0), at(R * t, -w)]), rail: [at(R * 0.22, -w * 0.5), at(R, -w * 0.5)] });
  }
  ctx.lineCap = 'round';
  for (const q of sails) {
    ctx.fillStyle = tint('#f2e4d6', L); ctx.globalAlpha = 0.55; polyFill(q.sail); ctx.globalAlpha = 1;
    ctx.strokeStyle = tint('#8a1a24', L); ctx.lineWidth = 1.2; ctx.beginPath();
    for (const [p0, p1] of [...q.bars, q.rail]) { ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); }
    const s0 = q.sail; ctx.moveTo(s0[1][0], s0[1][1]); ctx.lineTo(s0[2][0], s0[2][1]); ctx.lineTo(s0[3][0], s0[3][1]); ctx.stroke();
    ctx.strokeStyle = tint('#6a141c', L); ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(q.arm[0][0], q.arm[0][1]); ctx.lineTo(q.arm[1][0], q.arm[1][1]); ctx.stroke();
  }
  const c = P(0, 0); ctx.fillStyle = tint('#4a1016', L); ctx.beginPath(); ctx.arc(c[0], c[1], 4 * (1 + hz), 0, TAU); ctx.fill();
  if (NIGHT > 0.1) { // red bulbs along the arms and round the sails
    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = '#ff2a40';
    for (const [lw, al] of [[5, 0.25], [1.4, 1]]) {
      ctx.lineWidth = lw; ctx.globalAlpha = NIGHT * al; ctx.beginPath();
      for (const q of sails) { const [a, b2, c2, d] = q.sail; ctx.moveTo(q.arm[0][0], q.arm[0][1]); ctx.lineTo(b2[0], b2[1]); ctx.lineTo(c2[0], c2[1]); ctx.lineTo(d[0], d[1]); ctx.lineTo(a[0], a[1]); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  ctx.lineCap = 'butt';
}
// two searchlights on the front corners of a club's roof, sweeping to and fro
function drawBeams(b, rx, ry, rw, rh, k) {
  const f = b.front, nx = [0, 1, 0, -1][f], ny = [-1, 0, 1, 0][f], tx = -ny, ty = nx, Lb = 380 * k, w = 0.05;
  for (const sg of [-1, 1]) {
    const ox = rx + rw / 2 + (tx * sg + nx) * 0.4 * rw, oy = ry + rh / 2 + (ty * sg + ny) * 0.4 * rh;
    const a = Math.atan2(ny, nx) + sg * 0.55 + Math.sin(time * 0.55 + (sg + 1) * 1.3) * 0.75;
    const gr = ctx.createLinearGradient(ox, oy, ox + Math.cos(a) * Lb, oy + Math.sin(a) * Lb);
    gr.addColorStop(0, 'rgba(255,225,250,.32)'); gr.addColorStop(1, 'rgba(255,225,250,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(ox, oy);
    ctx.lineTo(ox + Math.cos(a - w) * Lb, oy + Math.sin(a - w) * Lb); ctx.lineTo(ox + Math.cos(a + w) * Lb, oy + Math.sin(a + w) * Lb); ctx.closePath(); ctx.fill();
  }
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
  roofText(b.brand || 'QUBIT', rx + rw / 2, ry + rh / 2, rh * 0.32, tint('#d32f2f', L));
}
function drawBuildings(v) {
  const cx = cam.x, cy = cam.y, list = [];
  TEXA = 1 - 0.55 * NIGHT;
  for (const b of cellQuery(bGrid(), v.x0 - 260, v.y0 - 260, v.x1 + 260, v.y1 + 260)) if (b.x < v.x1 + 260 && b.x + b.w > v.x0 - 260 && b.y < v.y1 + 260 && b.y + b.h > v.y0 - 260) list.push(b);
  list.sort((a, b) => d2(b.x + b.w / 2, b.y + b.h / 2, cx, cy) - d2(a.x + a.w / 2, a.y + a.h / 2, cx, cy));
  const glow = [];
  for (const b of list) {
    if (b.canopy) drawCanopy(b);
    else if (b.fr) drawFramed(b, glow);
    else { drawBody(b); drawTop(b, glow); }
  }
  if (glow.length) {
    ctx.globalCompositeOperation = 'lighter';
    for (const [x, y, r, c, g] of glow) { ctx.fillStyle = c; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(x, y, g, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
    ctx.globalCompositeOperation = 'source-over';
  }
}
// a building's walls and roof (a box with its cap or flat roof, and the tiers set back above it)
function drawBody(b) {
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
}
// what stands on the roof: a dome, a chimney, an antenna, the neon and sign at night, a mill
function drawTop(b, glow) {
  const x0 = b.x, y0 = b.y, z = b.tiers ? b.tiers[b.tiers.length - 1].z : b.ht;
  if (b.dome) drawDome(b);
  if (b.pennants && b.pyr) { // a circus tent: strings of pennants from the king pole down to stakes round it, a flag on top
    const cu = x0 + b.w / 2, cv = y0 + b.h / 2, zt = b.ht + b.pyr, A = proj(cu, cv, zt), F = proj(cu, cv, zt + 0.05), ring = b.lp[0], COL = ['#e74c3c', '#f1c40f', '#3498db', '#2ecc71', '#f4f4f4'];
    for (let i = 0; i < ring.length; i += 2) {
      const sx = cu + (ring[i][0] - cu) * 1.22, sy = cv + (ring[i][1] - cv) * 1.22;
      ctx.strokeStyle = 'rgba(70,60,48,.75)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(sx, sy); ctx.stroke();
      for (let k = 1; k < 7; k++) { const t = k / 7, z = zt * (1 - t), q = proj(cu + (sx - cu) * t, cv + (sy - cv) * t, z * 0.98); ctx.fillStyle = COL[(i + k) % 5]; ctx.beginPath(); ctx.moveTo(q[0] - 3, q[1]); ctx.lineTo(q[0] + 3, q[1]); ctx.lineTo(q[0], q[1] + 5); ctx.fill(); }
    }
    ctx.strokeStyle = '#5a4a3a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(F[0], F[1]); ctx.stroke();
    const w = Math.sin(time * 5 + b.sd) * 2; ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.moveTo(F[0], F[1]); ctx.lineTo(F[0] + 14, F[1] + 3 + w); ctx.lineTo(F[0], F[1] + 7); ctx.fill();
  }
  if (b.towers) for (const t of b.towers) { // (a tower rising out of the roof: square, with a spire on top, in the building's frame)
    const h = t.s / 2, tb = t.b || (t.b = { wall: t.wall || b.wall, roof: t.roof || '#4f6a5c', sd: b.sd + 17, kind: 'church', mat: 'stone', cap: 'hip', capH: t.capH, cross: t.cross, w: t.s, h: t.s });
    drawBox(tb, t.u - h, t.v - h, t.u + h, t.v + h, b.ht * 0.9, t.ht, t.win || 'slit', true);
    drawCap(tb, t.u - h, t.v - h, t.u + h, t.v + h, t.ht);
  }
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
    if (b.sign && rw > 30) signOn(b, rx + rw / 2, ry + rh / 2, signSize(b.sign, rw, rh), b.neon || '#ffffff');
    if (b.kind === 'club') { ctx.fillStyle = '#ffe9a8'; chaser(rx, ry, rw, rh, k, true); }
    if (b.beams) drawBeams(b, rx, ry, rw, rh, k);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  if (b.mill) drawMill(b);
}
// ---- the detailed map's real buildings: each is drawn in its own frame, turned to its main direction, so that a box at
// any angle is drawn just like one along the axes (the camera and the sun are turned into the frame while it is drawn),
// and any other outline gets walls along each of its edges round a flat roof, slopes or a spire
function drawFramed(b, glow) {
  const f = b.fr, c = f.c, s = f.s, cx = cam.x, cy = cam.y, sx = SUN.x, sy = SUN.y, ssx = SUN.sx, ssy = SUN.sy, bx = b.x, by = b.y, bw = b.w, bh = b.h, g0 = glow.length;
  if (b.lp && f.w === undefined) inscribe(b);
  const dx = cx - f.ox, dy = cy - f.oy;
  cam.x = dx * c + dy * s; cam.y = -dx * s + dy * c;
  SUN.x = sx * c + sy * s; SUN.y = -sx * s + sy * c; SUN.sx = ssx * c + ssy * s; SUN.sy = -ssx * s + ssy * c;
  b.x = f.x; b.y = f.y; b.w = f.w; b.h = f.h; FRC = c; FRS = s;
  ctx.save(); ctx.transform(c, s, -s, c, f.ox, f.oy);
  try {
    if (b.lp) drawOutline(b); else drawBody(b);
    drawTop(b, glow);
  } finally {
    ctx.restore(); cam.x = cx; cam.y = cy; SUN.x = sx; SUN.y = sy; SUN.sx = ssx; SUN.sy = ssy; b.x = bx; b.y = by; b.w = bw; b.h = bh; FRC = 1; FRS = 0;
  }
  for (let i = g0; i < glow.length; i++) { const [x, y] = glow[i]; glow[i] = [f.ox + x * c - y * s, f.oy + x * s + y * c, ...glow[i].slice(2)]; } // (back into the world)
}
// the biggest box along the frame that fits inside an outline: where a flat roof's plant, signs and domes go
function inscribe(b) {
  const [u0, v0, u1, v1] = b.lb, cs = Math.max(3, Math.max(u1 - u0, v1 - v0) / 40), nu = Math.max(1, Math.ceil((u1 - u0) / cs)), nv = Math.max(1, Math.ceil((v1 - v0) / cs));
  const H = new Int32Array(nu); let best = [0, 0, 0, 0, 0];
  for (let j = 0; j < nv; j++) {
    const vc = v0 + (j + 0.5) * cs, xs = [];
    for (const r of b.lp) for (let i = 0, k = r.length - 1; i < r.length; k = i++) { const a = r[k], e = r[i]; if ((a[1] > vc) !== (e[1] > vc)) xs.push(a[0] + (vc - a[1]) * (e[0] - a[0]) / (e[1] - a[1])); }
    xs.sort((p, q) => p - q);
    let m = 0;
    for (let i = 0; i < nu; i++) { const uc = u0 + (i + 0.5) * cs; while (m < xs.length && xs[m] < uc) m++; H[i] = m & 1 ? H[i] + 1 : 0; }
    const st = []; // (the largest rectangle under the histogram of runs ending on this row)
    for (let i = 0; i <= nu; i++) {
      const h = i < nu ? H[i] : 0; let start = i;
      while (st.length && st[st.length - 1][1] >= h) { const [p, hh] = st.pop(); const ar = hh * (i - p); if (ar > best[0]) best = [ar, p, j - hh + 1, i - p, hh]; start = p; }
      st.push([start, h]);
    }
  }
  const f = b.fr, m = best[0] ? 0.5 : 0;
  f.x = u0 + best[1] * cs + m; f.y = v0 + best[2] * cs + m; f.w = Math.max(1, best[3] * cs - 2 * m); f.h = Math.max(1, best[4] * cs - 2 * m);
  if (b.dome) b.dome.r = Math.min(b.dome.r, Math.min(f.w, f.h) * 0.48);
}
// a ring moved in by d (each corner along its bisector, as far as both its edges move), or null where an edge would turn
// round (the outline is narrower there than 2d) or a corner is too sharp
function insetRing(r, d) {
  const n = r.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = r[(i + n - 1) % n], p = r[i], e = r[(i + 1) % n];
    let x1 = p[0] - a[0], y1 = p[1] - a[1], x2 = e[0] - p[0], y2 = e[1] - p[1]; const l1 = Math.hypot(x1, y1) || 1, l2 = Math.hypot(x2, y2) || 1;
    const m1x = -y1 / l1, m1y = x1 / l1, m2x = -y2 / l2, m2y = x2 / l2, cs = 1 + m1x * m2x + m1y * m2y; // (inward normals of both edges)
    if (cs < 0.25) return null;
    out.push([p[0] + d * (m1x + m2x) / cs, p[1] + d * (m1y + m2y) / cs]);
  }
  for (let i = 0; i < n; i++) {
    const a = r[i], e = r[(i + 1) % n], A = out[i], E = out[(i + 1) % n];
    if ((e[0] - a[0]) * (E[0] - A[0]) + (e[1] - a[1]) * (E[1] - A[1]) < -1e-6) return null;
  }
  return out;
}
const ringPath = (R, z) => { const k = 1 + z; ctx.beginPath(); for (const r of R) r.forEach(([u, v], i) => i ? ctx.lineTo(cam.x + (u - cam.x) * k, cam.y + (v - cam.y) * k) : ctx.moveTo(cam.x + (u - cam.x) * k, cam.y + (v - cam.y) * k)); ctx.closePath(); };
function drawOutline(b) {
  const W = [];
  for (const r of b.lp) for (let i = 0, n = r.length; i < n; i++) {
    const a = r[i], e = r[(i + 1) % n], ex = e[0] - a[0], ey = e[1] - a[1], L = Math.hypot(ex, ey);
    if (L < 0.5) continue;
    const nx = ey / L, ny = -ex / L; // (outward: the outer ring runs one way, courtyards the other)
    if ((cam.x - a[0]) * nx + (cam.y - a[1]) * ny <= 0) continue;
    W.push([a, e, nx, ny, i, d2((a[0] + e[0]) / 2, (a[1] + e[1]) / 2, cam.x, cam.y)]);
  }
  W.sort((p, q) => q[5] - p[5]);
  for (const [a, e, nx, ny, i] of W) drawWall(b, a[0], a[1], e[0], e[1], nx, ny, i, 0, b.ht, b.win, true);
  if (b.pyr && polyPyr(b)) return;
  if (b.hip && polyHip(b)) return;
  polyFlat(b);
}
// a flat roof: its parapet round the edge, the roofing inside, the parapet's shadow, then the plant on the biggest box inside
function polyFlat(b) {
  const z = b.ht, k = 1 + z, L = lum(0, 0, 1) * 1.02;
  if (b.li === undefined) b.li = b.lp.map(r => insetRing(r, 3)).every(Boolean) ? b.lp.map(r => insetRing(r, 3)) : null;
  const inner = b.li || b.lp, glass = b.style === 'glass';
  ringPath(b.lp, z); ctx.fillStyle = tint(b.roof, L * (glass ? 1.2 : 1.15)); ctx.fill('evenodd');
  ringPath(inner, z); ctx.fillStyle = tint(b.roof, L); ctx.fill('evenodd');
  const ware = b.style === 'ware', rt = ware ? RTEX.corr : !b.kind && b.style === 'flat' && (b.sd & 3) === 0 ? RTEX.gravel : RTEX.membrane;
  const ox = cam.x * (1 - k) + (b.sd % 61) * k, oy = cam.y * (1 - k) + (b.sd % 37) * k;
  if (TEX) { rt.setTransform(setPM(k / 2, 0, 0, k / 2, ox, oy)); ctx.fillStyle = rt; ctx.globalAlpha = TEXA * 0.9; ctx.fill('evenodd'); ctx.globalAlpha = 1; }
  if (SUN.on && !glass) { // the parapet's shadow along the inside of the edges the sun comes over
    const a = 0.16 * (1 - NIGHT), dx = SUN.sx * Math.min(SUN.len, 2) * 3, dy = SUN.sy * Math.min(SUN.len, 2) * 3;
    ctx.save(); ringPath(inner, z); ctx.clip('evenodd'); ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.beginPath();
    for (const r of inner) for (let i = 0, n = r.length; i < n; i++) {
      const p = r[i], e = r[(i + 1) % n], ex = e[0] - p[0], ey = e[1] - p[1], l = Math.hypot(ex, ey) || 1;
      if ((ey * SUN.sx - ex * SUN.sy) / l > -0.2) continue;
      const P = [[p[0], p[1]], [e[0], e[1]], [e[0] + dx, e[1] + dy], [p[0] + dx, p[1] + dy]].map(([u, v]) => [cam.x + (u - cam.x) * k, cam.y + (v - cam.y) * k]);
      ctx.moveTo(P[0][0], P[0][1]); for (let j = 1; j < 4; j++) ctx.lineTo(P[j][0], P[j][1]); ctx.closePath();
    }
    ctx.fill(); ctx.restore();
  }
  flatRoof(b, b.x, b.y, b.x + b.w, b.y + b.h, z, true, true);
}
// a pitched roof on any outline: every wall's slope rises inwards at the same pitch until it meets its neighbours, as a
// straight skeleton does: the outline is moved in step by step, and an edge that shrinks away (a notch, the end of a
// wing) drops out, so a narrow wing ends up under a ridge and a deep block keeps a flat top. Each wall's slope is the
// polygon its two ends trace on the way in.
function hipRoof(b) {
  const [u0, v0, u1, v1] = b.lb, D = Math.min(Math.min(u1 - u0, v1 - v0) * 0.5, 3 * T), st = Math.max(1.5, D / 48);
  const wall = (mx, my, c, ux, uy, A, B) => ({ mx, my, c, ux, uy, A, B, d: 0 });
  let rings = b.lp.map(r => {
    const E = [];
    for (let i = 0, n = r.length; i < n; i++) {
      const a = r[i], e = r[(i + 1) % n], ex = e[0] - a[0], ey = e[1] - a[1], L = Math.hypot(ex, ey);
      if (L < 0.3) continue;
      const mx = -ey / L, my = ex / L, last = E[E.length - 1];
      if (last && last.mx * mx + last.my * my > 0.9986) continue; // (straight on, within 3 degrees: the same wall)
      E.push(wall(mx, my, mx * a[0] + my * a[1], ex / L, ey / L, [], []));
    }
    if (E.length > 1 && E[0].mx * E[E.length - 1].mx + E[0].my * E[E.length - 1].my > 0.9986) E.pop();
    return E;
  }).filter(E => E.length >= 3);
  const all = rings.flat(), done = [];
  const corner = (p, q, d) => { // where two walls' lines meet, each moved in by d (none if they run (anti)parallel)
    const det = p.mx * q.my - p.my * q.mx; if (Math.abs(det) < 0.05) return null;
    return [((p.c + d) * q.my - (q.c + d) * p.my) / det, (p.mx * (q.c + d) - q.mx * (p.c + d)) / det];
  };
  const crossed = R => { // (does any ring cross itself or another?)
    const S = [];
    for (const V of R) for (let i = 0; i < V.length; i++) S.push([V[i], V[(i + 1) % V.length]]);
    for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) {
      const [p, q] = S[i], [r, t] = S[j];
      if (p === r || p === t || q === r || q === t) continue;
      const o = (a, b2, c) => (b2[0] - a[0]) * (c[1] - a[1]) - (b2[1] - a[1]) * (c[0] - a[0]);
      if (o(p, q, r) * o(p, q, t) < -1e-6 && o(r, t, p) * o(r, t, q) < -1e-6) return true;
    }
    return false;
  };
  const put = (C, p) => { const n = C.length; if (n >= 2) { const a = C[n - 2], m = C[n - 1]; if (Math.abs((m[0] - a[0]) * (p[1] - a[1]) - (m[1] - a[1]) * (p[0] - a[0])) < 0.05 * Math.hypot(m[0] - a[0], m[1] - a[1])) { C[n - 1] = p; return; } } C.push(p); };
  let top = null, dEnd = 0;
  for (let d = 0; rings.length; d = Math.min(D, d + st)) {
    const now = [], queue = rings.slice();
    let bad = false;
    while (queue.length && !bad) {
      let E = queue.shift(), V = null, split = false;
      for (let it = 0; it < 60 && E.length >= 3; it++) {
        V = E.map((e, i) => corner(E[(i + E.length - 1) % E.length], e, d));
        // walls that shrank away (or met back to back, under a ridge) drop out
        const gone = new Set();
        E.forEach((e, i) => {
          const p = V[i], q = V[(i + 1) % E.length], pv = E[(i + E.length - 1) % E.length], nx = E[(i + 1) % E.length];
          // (back to back: under a ridge; in line with the wall before, once a notch between them has gone: one wall)
          if (!p || !q) { if (pv.mx * e.mx + pv.my * e.my < 0 || nx.mx * e.mx + nx.my * e.my < 0 || (!p && pv.mx * e.mx + pv.my * e.my > 0)) gone.add(e); return; }
          if ((q[0] - p[0]) * e.ux + (q[1] - p[1]) * e.uy < 0) gone.add(e);
        });
        if (gone.size) { E = E.filter(e => !gone.has(e)); continue; }
        if (V.some(p => !p)) break;
        // a corner that ran into a wall across the way splits the ring in two there
        const n = E.length;
        for (let i = 0; i < n && !split; i++) {
          const p = V[i], pi = (i + n - 1) % n;
          if (E[pi].ux * E[i].uy - E[pi].uy * E[i].ux >= 0) continue; // (only a reflex corner can)
          for (let j = 0; j < n; j++) {
            if (j === i || j === pi) continue;
            const w = E[j], a = V[j], c = V[(j + 1) % n], s0 = (p[0] - a[0]) * w.ux + (p[1] - a[1]) * w.uy, len = (c[0] - a[0]) * w.ux + (c[1] - a[1]) * w.uy;
            const dep = w.mx * p[0] + w.my * p[1] - (w.c + d);
            if (dep >= 0 || dep < -6 * st || s0 <= 0 || s0 >= len) continue;
            const X = [p[0] - w.mx * dep, p[1] - w.my * dep], j1 = wall(w.mx, w.my, w.c, w.ux, w.uy, [[a[0], a[1], d]], [[X[0], X[1], d]]), j2 = wall(w.mx, w.my, w.c, w.ux, w.uy, [[X[0], X[1], d]], [[c[0], c[1], d]]);
            put(w.A, [a[0], a[1], d]); put(w.B, [c[0], c[1], d]); w.d = d; done.push(w); all.push(j1, j2);
            const ring = k => E[(k + n) % n], RA = [], RB = [];
            for (let k = i; (k % n) !== j; k++) RA.push(ring(k)); RA.push(j1);
            RB.push(j2); for (let k = j + 1; (k % n) !== i; k++) RB.push(ring(k));
            queue.push(RA, RB); split = true; break;
          }
        }
        break;
      }
      if (split) continue;
      if (E.length < 3 || !V || V.some(p => !p)) continue;
      if (V.some(p => p[0] < u0 - 2 || p[0] > u1 + 2 || p[1] < v0 - 2 || p[1] > v1 + 2)) { bad = true; break; } // (a corner running off out of the building)
      now.push([E, V]);
    }
    if (bad || (d > 0 && crossed(now.map(([, V]) => V)))) break; // (stop at the last good step)
    for (const [E, V] of now) E.forEach((e, i) => { put(e.A, [V[i][0], V[i][1], d]); put(e.B, [V[(i + 1) % E.length][0], V[(i + 1) % E.length][1], d]); e.d = d; });
    rings = now.map(([E]) => E); top = now.map(([, V]) => V); dEnd = d;
    if (d >= D) break;
  }
  if (dEnd < 4) return null;
  const faces = all.filter(e => e.A.length && e.B.length && (e.A.length > 1 || e.B.length > 1)).map(e => ({ e, p: [e.A[0], e.B[0], ...e.B.slice(1), ...e.A.slice(1).reverse()] }));
  return { faces, top: top && top.length ? top : null, D: dEnd };
}
function polyHip(b) {
  if (b.hr === undefined) b.hr = hipRoof(b);
  if (!b.hr) return false;
  const e = b.ht, { faces, top, D } = b.hr, ch = Math.min(b.hip, D / T * 0.022 + 0.012), z = d => e + ch * d / D, L0 = lum(0, 0, 1);
  ringPath(b.lp, e); ctx.fillStyle = tint(b.roof, L0 * 0.9); ctx.fill('evenodd'); // (under the slopes, so no seam shows)
  if (!b.hf) b.hf = faces.map(({ e: w, p }) => { // (the slopes in 3-D: the same every frame)
    const dl = w.d, m = [(w.A[0][0] + w.B[0][0]) / 2 + w.mx * dl, (w.A[0][1] + w.B[0][1]) / 2 + w.my * dl, z(dl)];
    return { p: p.map(q => [q[0], q[1], z(q[2])]), n: [-w.mx * ch, -w.my * ch, D / HC], c: b.roof, top: m };
  });
  drawFaces(b, b.hf.slice()); // (a fresh list each time: drawFaces sorts it, and ties keep this order)
  if (top) { ringPath(top, z(D)); ctx.fillStyle = tint(b.roof, L0 * 1.04); ctx.fill('evenodd'); }
  if (b.kind || b.sign) { const sv = b.ht; b.ht = z(D); b.det = []; b.kit = 0; flatRoof(b, b.x, b.y, b.x + b.w, b.y + b.h, b.ht, true, true); b.ht = sv; }
  return true;
}
// a spire or a cone on any outline: every wall's slope runs up to one point over the middle
function polyPyr(b) {
  const e = b.ht, r = e + b.pyr, cu = b.x + b.w / 2, cv = b.y + b.h / 2, faces = [];
  for (const ring of b.lp.slice(0, 1)) for (let i = 0, n = ring.length; i < n; i++) {
    const a = ring[i], c2 = ring[(i + 1) % n], ex = c2[0] - a[0], ey = c2[1] - a[1], L = Math.hypot(ex, ey);
    if (L < 0.5) continue;
    const nx = ey / L, ny = -ex / L, dd = Math.max(4, (a[0] - cu) * nx + (a[1] - cv) * ny);
    faces.push({ p: [[a[0], a[1], e], [c2[0], c2[1], e], [cu, cv, r]], n: [nx * b.pyr, ny * b.pyr, dd / HC], c: b.stripe && i & 1 ? b.stripe : b.roof }); // (a tent's canvas in stripes)
  }
  drawFaces(b, faces);
  return true;
}
// ---- trees: leafy canopies drawn once into sprites, then relit when the sun moves or night falls
// sprites 0-5 broadleaf, 6-7 conifer, 8-9 palm, 10-11 cactus, 12-13 desert scrub
const TREE_N = 14, TREE_R = 16, TREE_S = 2, TREE_PX = Math.ceil(TREE_R * 2.6 * TREE_S);
const TREE_BASE = [], TREE_LIT = [];
for (let v = 0; v < TREE_N; v++) {
  const c = document.createElement('canvas'); c.width = c.height = TREE_PX;
  const g = c.getContext('2d'), rnd = prng(500 + v * 17), R = TREE_R;
  const pal = [['#21501d', '#357a2e', '#64a84a'], ['#245a20', '#3f8634', '#76b652'], ['#1f4c29', '#327240', '#5fa262'], ['#30551e', '#527c2c', '#89ad46']][v & 3];
  g.translate(TREE_PX / 2, TREE_PX / 2); g.scale(TREE_S, TREE_S);
  if (v >= 8 && v <= 9) { // a palm: fronds radiating from the crown, each with a rib and drooping leaflets
    const n = v === 8 ? 9 : 7, rot = rnd() * TAU;
    for (let f = 0; f < n; f++) {
      const a = rot + f / n * TAU + (rnd() - 0.5) * 0.3, L = R * (0.95 + rnd() * 0.2), ca = Math.cos(a), sa = Math.sin(a);
      g.fillStyle = f & 1 ? '#3f7a2c' : '#4e8f36';
      for (let i = 2; i < 13; i++) { // leaflets on both sides of the rib
        const t = i / 13, px = ca * L * t, py = sa * L * t, w = R * 0.32 * Math.sin(t * Math.PI) + 1;
        g.beginPath(); g.moveTo(px, py); g.lineTo(px + (-sa) * w + ca * 3, py + ca * w + sa * 3); g.lineTo(px + ca * 2.4, py + sa * 2.4); g.lineTo(px + sa * w + ca * 3, py - ca * w + sa * 3); g.fill();
      }
      g.strokeStyle = '#2b5420'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, 0); g.lineTo(ca * L, sa * L); g.stroke();
    }
    g.fillStyle = '#6b4a2a'; g.beginPath(); g.arc(0, 0, 2.6, 0, TAU); g.fill();
    for (let i = 0; i < 3; i++) { g.fillStyle = '#5a3e1e'; g.beginPath(); g.arc(Math.cos(i * 2.1) * 2.2, Math.sin(i * 2.1) * 2.2, 1.4, 0, TAU); g.fill(); }
  } else if (v >= 10 && v <= 11) { // a cactus from above: a ribbed column with an arm or two
    const parts = v === 10 ? [[0, 0, 0.42], [0.55, 0.1, 0.24], [-0.5, -0.2, 0.22]] : [[0, 0, 0.5], [0.1, 0.6, 0.22]];
    for (const [px, py, pr] of parts) {
      const gr = g.createRadialGradient(px * R - pr * R * 0.3, py * R - pr * R * 0.3, 0, px * R, py * R, pr * R);
      gr.addColorStop(0, '#8fbf6a'); gr.addColorStop(0.7, '#4d8a3a'); gr.addColorStop(1, '#2f5e26');
      g.fillStyle = gr; g.beginPath(); g.arc(px * R, py * R, pr * R, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(20,50,16,.5)'; g.lineWidth = 0.6;
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; g.beginPath(); g.moveTo(px * R, py * R); g.lineTo(px * R + Math.cos(a) * pr * R, py * R + Math.sin(a) * pr * R); g.stroke(); }
      g.fillStyle = 'rgba(240,230,200,.8)'; for (let k = 0; k < 10; k++) { const a = rnd() * TAU, d = rnd() * pr * R; g.fillRect(px * R + Math.cos(a) * d, py * R + Math.sin(a) * d, 0.7, 0.7); }
    }
    if (v === 10) { g.fillStyle = '#f4d24a'; g.beginPath(); g.arc(0, 0, 1.6, 0, TAU); g.fill(); } // a flower on top
  } else if (v >= 12) { // desert scrub: a loose tangle of grey-green twigs
    for (let i = 0; i < 70; i++) {
      const a = rnd() * TAU, d = Math.sqrt(rnd()) * R * 0.75, l = 2 + rnd() * 4, b = rnd() * TAU;
      g.strokeStyle = rnd() < 0.5 ? (v === 12 ? '#7d7a4a' : '#8a7a52') : (v === 12 ? '#5e6a3c' : '#6e5e3a'); g.lineWidth = 1 + rnd();
      g.beginPath(); g.moveTo(Math.cos(a) * d, Math.sin(a) * d); g.lineTo(Math.cos(a) * d + Math.cos(b) * l, Math.sin(a) * d + Math.sin(b) * l); g.stroke();
    }
  } else if (v >= 6) { // a conifer: stacked rings of needles
    for (let l = 0; l < 5; l++) {
      const r = R * (1 - l * 0.17), pts = 14, rot = rnd() * TAU;
      g.fillStyle = l === 0 ? '#163a1c' : pal[l < 3 ? 1 : 2];
      g.beginPath();
      for (let k = 0; k <= pts * 2; k++) { const a = rot + k / (pts * 2) * TAU, rr = k & 1 ? r * 0.72 : r; k ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(rr * Math.cos(a), rr * Math.sin(a)); }
      g.fill();
    }
  } else { // a broadleaf: overlapping clumps of leaves, each shaded like a ball lit from above
    const clumps = [[0, 0, R * 0.62]];
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + rnd() * 0.5, d = R * (0.45 + rnd() * 0.15); clumps.push([Math.cos(a) * d, Math.sin(a) * d, R * (0.36 + rnd() * 0.14)]); }
    g.fillStyle = pal[0]; for (const [x, y, r] of clumps) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
    for (const [x, y, r] of clumps.slice(1).concat([clumps[0]])) {
      const gr = g.createRadialGradient(x, y - r * 0.1, r * 0.05, x, y, r);
      gr.addColorStop(0, pal[2]); gr.addColorStop(0.6, pal[1]); gr.addColorStop(1, 'rgba(30,70,30,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 0.96, 0, TAU); g.fill();
    }
  }
  g.globalCompositeOperation = 'source-atop'; // clusters of leaves, kept inside the canopy
  for (let i = 0; i < (v < 8 ? 260 : 0); i++) { const a = rnd() * TAU, d = Math.sqrt(rnd()) * R; g.fillStyle = rnd() < 0.5 ? 'rgba(10,32,8,.22)' : 'rgba(190,230,140,.16)'; g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, 0.8 + rnd() * 1.1, 0, TAU); g.fill(); }
  TREE_BASE.push(c);
  const lc = document.createElement('canvas'); lc.width = lc.height = TREE_PX; TREE_LIT.push(lc);
}
let treeKey = '';
function treeSprites() {
  const nq = Math.round(NIGHT * 20), sl = Math.hypot(SUN.x, SUN.y);
  const key = nq + '|' + (SUN.on ? Math.round(Math.atan2(SUN.y, SUN.x) * 8) + ',' + Math.round(sl * 6) : '-');
  if (key === treeKey) return TREE_LIT;
  treeKey = key;
  const h = TREE_PX / 2, R = TREE_R * TREE_S, ux = sl > 0.01 ? SUN.x / sl : 0.5, uy = sl > 0.01 ? SUN.y / sl : 0.86, f = SUN.on ? 0.4 + Math.min(0.6, sl) : 0.4;
  for (let i = 0; i < TREE_N; i++) {
    const g = TREE_LIT[i].getContext('2d');
    g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, TREE_PX, TREE_PX); g.drawImage(TREE_BASE[i], 0, 0);
    g.globalCompositeOperation = 'source-atop';
    const gr = g.createLinearGradient(h + ux * R, h + uy * R, h - ux * R, h - uy * R); // sunlit side to shaded side
    gr.addColorStop(0, `rgba(255,245,200,${0.26 * f})`); gr.addColorStop(0.45, 'rgba(255,255,255,0)'); gr.addColorStop(1, `rgba(0,14,0,${0.45 * f})`);
    g.fillStyle = gr; g.fillRect(0, 0, TREE_PX, TREE_PX);
    if (nq) { g.fillStyle = `rgba(6,10,32,${nq / 20 * 0.78})`; g.fillRect(0, 0, TREE_PX, TREE_PX); } // the same night tint as tint()
    g.globalCompositeOperation = 'source-over';
  }
  return TREE_LIT;
}
function drawTrees(v) {
  const spr = treeSprites(), sz = TREE_PX / TREE_S / TREE_R;
  // trunks first, tapering from the ground up to where the canopy starts (they lean away from the middle of the screen)
  ctx.fillStyle = tint('#4a3220');
  inView(treeGrid(), v, 60, t => {
    if (t.down || t.sp >= 10) return;
    const dx = (t.x - cam.x) * 0.08 * 0.9, dy = (t.y - cam.y) * 0.08 * 0.9, l = Math.hypot(dx, dy), w0 = Math.max(1.6, t.tr || 3), w1 = w0 * 0.55; // (up under the canopy)
    if (l < 2) return;
    const nx = -dy / l, ny = dx / l;
    ctx.beginPath(); ctx.moveTo(t.x + nx * w0, t.y + ny * w0); ctx.lineTo(t.x + dx + nx * w1, t.y + dy + ny * w1); ctx.lineTo(t.x + dx - nx * w1, t.y + dy - ny * w1); ctx.lineTo(t.x - nx * w0, t.y - ny * w0); ctx.fill();
  });
  inView(TGRID, v, 60, t => {
    if (t.down) return;
    const z = t.sp >= 10 ? 1.05 : 1.08, x = cam.x + (t.x - cam.x) * z, y = cam.y + (t.y - cam.y) * z, s = t.r * sz;
    if (t.v === undefined) t.v = t.sp ?? ((Math.imul(t.x | 0, 73856093) ^ Math.imul(t.y | 0, 19349663)) >>> 0) % 8;
    ctx.drawImage(spr[t.v], x - s / 2, y - s / 2, s, s);
  });
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
// ---- the Atom Array Lab, drawn: the zones' floors, then over the cars the pulse, the blockade circles and the camera flash
function drawZones(v) {
  for (const z of ZONES) {
    if (z.x1 < v.x0 || z.x0 > v.x1 || z.y1 < v.y0 || z.y0 > v.y1) continue;
    const w = z.x1 - z.x0, h = z.y1 - z.y0;
    ctx.fillStyle = z.kind === 'ent' ? 'rgba(52,30,96,.55)' : z.kind === 'read' ? 'rgba(20,28,40,.5)' : 'rgba(50,70,92,.35)'; ctx.fillRect(z.x0, z.y0, w, h);
    if (z.kind === 'ent') { // the static array of traps the atoms sit in, and the edge of the Rydberg laser's beam
      ctx.fillStyle = 'rgba(200,170,255,.35)';
      for (let y = z.y0 + 16; y < z.y1; y += 32) for (let x = z.x0 + 16; x < z.x1; x += 32) { ctx.beginPath(); ctx.arc(x, y, 1.6, 0, TAU); ctx.fill(); }
      ctx.strokeStyle = 'rgba(179,136,255,.8)'; ctx.lineWidth = 2; ctx.setLineDash([10, 6]); ctx.strokeRect(z.x0 + 1, z.y0 + 1, w - 2, h - 2); ctx.setLineDash([]);
    } else { ctx.strokeStyle = z.kind === 'read' ? 'rgba(143,211,255,.6)' : 'rgba(180,200,220,.45)'; ctx.lineWidth = 1.5; ctx.strokeRect(z.x0 + 1, z.y0 + 1, w - 2, h - 2); }
    ctx.fillStyle = z.kind === 'ent' ? 'rgba(200,170,255,.75)' : 'rgba(220,235,250,.6)'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(z.kind === 'ent' ? 'ENTANGLING ZONE' : z.kind === 'read' ? 'READOUT' : 'STORAGE', (z.x0 + z.x1) / 2, z.y1 - 6);
  }
}
function drawZoneFx(v) {
  const P = pp();
  for (const z of ZONES) {
    if (z.x1 < v.x0 - 80 || z.x0 > v.x1 + 80 || z.y1 < v.y0 - 80 || z.y0 > v.y1 + 80) continue;
    const w = z.x1 - z.x0, h = z.y1 - z.y0;
    if (z.kind === 'ent') {
      // each atom's half blockade radius: where two circles overlap, those two will interact at the pulse
      const at = cars.filter(c => !c.dead && !c.ghost && c !== player.car && inZone(z, c.x, c.y)).map(c => [c.x, c.y]);
      if (!player.hidden && inZone(z, P.x, P.y)) at.push([P.x, P.y]);
      for (const [x, y] of at) {
        const k = at.filter(([x2, y2]) => d2(x, y, x2, y2) < RB_R * RB_R).length - 1;
        ctx.strokeStyle = k > 1 ? 'rgba(255,90,90,.75)' : k === 1 ? 'rgba(200,160,255,.85)' : 'rgba(200,160,255,.4)'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.arc(x, y, RB_R / 2, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      }
      if (z.fx > 0) { // the pulse: the whole zone lights up at once, and every close pair is joined
        const a = Math.min(1, z.fx / 0.7);
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(150,90,255,${0.35 * a})`; ctx.fillRect(z.x0, z.y0, w, h);
        for (const pr of z.pairs || []) {
          ctx.strokeStyle = pr.ok ? `rgba(220,190,255,${a})` : `rgba(255,90,90,${a})`; ctx.lineWidth = 3;
          const mx = (pr.a.x + pr.b.x) / 2, my = (pr.a.y + pr.b.y) / 2 - 14;
          ctx.beginPath(); ctx.moveTo(pr.a.x, pr.a.y); ctx.quadraticCurveTo(mx, my, pr.b.x, pr.b.y); ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    } else if (z.kind === 'read' && z.fx > 0) {
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(200,230,255,${0.45 * z.fx / 0.35})`; ctx.fillRect(z.x0, z.y0, w, h); ctx.globalCompositeOperation = 'source-over';
    }
  }
}
// the tweezer: a bright spot where the trap is, under the car it holds, and the beam's line back to your car
function drawTow() {
  const tw = player.tow; if (!tw || !player.car) return;
  const pc = player.car, r = 20, hot = clamp(tw.n / 60, 0, 1);
  const g = ctx.createRadialGradient(tw.Ax, tw.Ay, 0, tw.Ax, tw.Ay, r * 1.6);
  g.addColorStop(0, `rgba(255,${Math.round(200 - 140 * hot)},${Math.round(255 - 200 * hot)},.75)`); g.addColorStop(1, 'rgba(255,120,200,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(tw.Ax, tw.Ay, r * 1.6, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255,200,255,.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(tw.Ax, tw.Ay, TW.lose, 0, TAU); ctx.stroke();
  ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(pc.x, pc.y); ctx.lineTo(tw.Ax, tw.Ay); ctx.stroke(); ctx.setLineDash([]);
}
// ---- fishing, drawn: the rod, the line, the float (or the fish on the end), and the panel that says what to do
function fishFloat() { // where the float is, while it is out on the water
  const f = player.fish; if (!f || !(f.ph === 'wait' || f.ph === 'bite' || f.ph === 'fly' || f.ph === 'snag')) return null;
  if (f.ph !== 'fly') return [f.bx, f.by];
  const u = clamp(f.t / f.fly, 0, 1), tp = rodTip(f);
  return [lerp(tp[0], f.bx, u), lerp(tp[1], f.by, u) - Math.sin(u * Math.PI) * (20 + f.pow * 40)];
}
function rodTip(f) {
  const a = player.angle, b = f.ph === 'fight' ? f.ten * 0.35 * Math.sign(f.lat || 1) : 0;
  return [player.x + Math.cos(a + b) * 28, player.y + Math.sin(a + b) * 28];
}
function fishShape(x, y, a, len, c, al) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.globalAlpha = al; ctx.fillStyle = c;
  ctx.beginPath(); ctx.ellipse(0, 0, len / 2, len / 5, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-len * 0.42, 0); ctx.lineTo(-len * 0.72, -len / 5); ctx.lineTo(-len * 0.72, len / 5); ctx.closePath(); ctx.fill();
  ctx.restore(); ctx.globalAlpha = 1;
}
function drawFishing() {
  const f = player.fish; if (!f) return;
  const a = player.angle, ca = Math.cos(a), sa = Math.sin(a), hx = player.x + ca * 5, hy = player.y + sa * 5, tp = rodTip(f);
  if (f.ph === 'charge') { // where the cast will land: green over water, red over land
    const d = castDist(f.pow), lx = f.s.fx + ca * d, ly = f.s.fy + sa * d, tx = Math.floor(lx / T), ty = Math.floor(ly / T), wet = tile(tx, ty) === WATER && !bridge[ty * MW + tx];
    ctx.strokeStyle = wet ? 'rgba(120,255,160,.8)' : 'rgba(255,90,90,.8)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.moveTo(tp[0], tp[1]); ctx.lineTo(lx, ly); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(lx, ly, 8, 0, TAU); ctx.stroke();
  }
  let end = fishFloat();
  if (f.ph === 'fight') { // the fish, coming in as you reel, darting sideways when it runs
    const px = -sa, py = ca, k = 0.15 + 0.85 * f.prog, ex = lerp(f.bx, tp[0], k) + px * f.lat * (1 - f.prog * 0.6), ey = lerp(f.by, tp[1], k) + py * f.lat * (1 - f.prog * 0.6);
    const fa = Math.atan2(ey - tp[1], ex - tp[0]) + (f.run ? f.dir * 0.9 : 0), len = 12 + f.fish.str * 16;
    if (f.sup) for (const [i, [c, p]] of f.sup.entries()) fishShape(ex + px * (i ? 9 : -9), ey + py * (i ? 9 : -9), fa, 10 + c.str * 16, '#c9b3ff', 0.25 + p * 0.4);
    else fishShape(ex, ey, fa, len, '#0a1a20', 0.72);
    if (f.run && Math.random() < 0.5) addPart(ex + rand(-6, 6), ey + rand(-6, 6), rand(-30, 30), rand(-30, 30), 0.35, 1.6, '#e8f6ff');
    end = [ex, ey];
  }
  // the rod, bending toward the line under load
  const bend = f.ph === 'fight' ? f.ten : f.ph === 'bite' ? 0.6 : 0.1, mx = (hx + tp[0]) / 2 + (end ? (end[0] - tp[0]) : 0) * 0.04 * bend, my = (hy + tp[1]) / 2 + (end ? (end[1] - tp[1]) : 0) * 0.04 * bend;
  ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo(mx, my, tp[0], tp[1]); ctx.stroke();
  if (end) { // the line: slack sags, taut is straight, red near breaking
    const ten = f.ph === 'fight' ? f.ten : f.ph === 'bite' ? 0.7 : 0.15, sag = (1 - Math.min(1, ten)) * 10, nx = -(end[1] - tp[1]), ny = end[0] - tp[0], nl = Math.hypot(nx, ny) || 1;
    ctx.strokeStyle = ten > 0.85 ? '#ff5a5a' : 'rgba(240,240,240,.85)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(tp[0], tp[1]);
    ctx.quadraticCurveTo((tp[0] + end[0]) / 2 + nx / nl * sag, (tp[1] + end[1]) / 2 + ny / nl * sag, end[0], end[1]); ctx.stroke();
  }
  const fl = fishFloat();
  if (fl && f.ph !== 'fly' || f.ph === 'fight') { // rings on the water
    const [rx, ry] = f.ph === 'fight' ? end : fl;
    ctx.strokeStyle = 'rgba(220,240,255,.5)'; ctx.lineWidth = 1;
    for (let i = 0; i < 2; i++) { const r = (time * 14 + i * 9) % 18; ctx.globalAlpha = 1 - r / 18; ctx.beginPath(); ctx.arc(rx, ry, r + 3, 0, TAU); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  if (fl) { // the float: bobs at a nibble, goes under at a bite
    const under = f.ph === 'bite', r = under ? 1.5 : f.dip ? 2.4 : 3.4, [bx, by] = fl;
    if (f.ph === 'fly') { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(lerp(tp[0], f.bx, clamp(f.t / f.fly, 0, 1)), lerp(tp[1], f.by, clamp(f.t / f.fly, 0, 1)), 2.5, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#f4f4f4'; ctx.beginPath(); ctx.arc(bx, by, r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e53935'; ctx.beginPath(); ctx.arc(bx, by, r, Math.PI, TAU); ctx.fill();
    if (under) { ctx.fillStyle = '#ffe14d'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', bx, by - 9 - Math.abs(Math.sin(time * 14)) * 4); }
  }
}
function drawFishPanel() {
  const f = player.fish; if (!f) return;
  const tch = touchOn(), K = tch ? { f: '●', u: '⇄', lr: '◀ ▶', l: '◀', r: '▶' } : { f: 'Space', u: 'Enter', lr: '← →', l: '←', r: '→' };
  // below you, or above you when the jetty points down the screen (so it never covers the line), and clear of a quantum note
  const nw = Q.note && W > 700 ? Math.min(380, W - 24) + 12 : 0, w = Math.min(400, W - 24 - nw), h = 74, x = (W - nw - w) / 2, cx = x + w / 2;
  const y = Math.sin(f.s.a) > 0.5 ? Math.max(130, H / 2 - 84 - h) : Math.min(H / 2 + 84, H - (tch ? 250 : 176));
  ctx.fillStyle = 'rgba(8,16,26,.8)'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#4fc3f7'; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h);
  txt('FISHING', x + 10, y + 16, 11, '#4fc3f7', 'left', true);
  txt(`${K.u}: stop`, x + w - 10, y + 16, 11, '#8fa8b8', 'right');
  const bar = (by, v, c, lbl, red) => {
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x + 70, by, w - 84, 10);
    if (red) { ctx.fillStyle = 'rgba(255,60,60,.35)'; ctx.fillRect(x + 70 + (w - 84) * red, by, (w - 84) * (1 - red), 10); }
    ctx.fillStyle = c; ctx.fillRect(x + 70, by, (w - 84) * clamp(v, 0, 1), 10);
    txt(lbl, x + 10, by + 9, 11, '#cfe3ee', 'left');
  };
  switch (f.ph) {
    case 'ready': txt(`Hold ${K.f} to cast · ${K.lr} to aim`, cx, y + 44, 15, '#fff', 'center');
      txt(dawnDusk() ? 'Dawn and dusk: the fish are biting.' : 'Cast far out for the bigger fish.', cx, y + 64, 11, '#8fa8b8', 'center'); break;
    case 'charge': bar(y + 32, f.pow, '#ffd54a', 'power');
      txt('Let go to cast: the ring must be on the water', cx, y + 62, 12, '#fff', 'center'); break;
    case 'fly': case 'wait': txt(f.dip ? 'A nibble…' : 'Waiting for a bite…', cx, y + 44, 15, f.dip ? '#ffe9a0' : '#fff', 'center');
      txt(`strike when the float goes under · ${K.f} now reels in`, cx, y + 64, 11, '#8fa8b8', 'center'); break;
    case 'bite': if (Math.sin(time * 20) > -0.3) txt(`BITE! ${K.f}!`, cx, y + 50, 24, '#ffe14d', 'center', true); break;
    case 'fight': {
      bar(y + 26, f.ten, f.ten > 0.85 ? '#ff5a5a' : f.ten > 0.65 ? '#ffd54a' : '#7dff8a', 'tension', 0.85);
      bar(y + 42, f.prog, '#4fc3f7', 'line in');
      const tip = f.run ? `It runs ${f.dir > 0 ? 'right' : 'left'}! Ease off, or hold ${f.dir > 0 ? K.l : K.r} to pull against it` : `Hold ${K.f} to reel in`;
      txt(f.sup ? `ψ = ${fishName(f.sup[0][0].sp)} ${Math.round(f.sup[0][1] * 100)}% ⊕ ${fishName(f.sup[1][0].sp)} ${Math.round(f.sup[1][1] * 100)}%` : tip, cx, y + 66, 11, f.sup ? '#c9b3ff' : f.run ? '#ffb38a' : '#fff', 'center');
      break;
    }
    case 'caught': {
      const c = f.card, junk = c.sp.tag === 'junk';
      txt(`${junk ? 'You fished out' : 'Caught'}: ${fishName(c.sp)}${junk ? '' : ` · ${c.kg.toFixed(1)} kg`}`, cx, y + 40, 16, junk ? '#cfd8dc' : '#fff', 'center', true);
      txt(junk ? 'Worth nothing. At least the water is cleaner.' : `sold for ${fmt(c.v)}${c.rec === 'record' ? ` · NEW RECORD (was ${c.was.toFixed(1)} kg)` : c.rec === 'first' ? ' · your first one' : ''}`,
        cx, y + 62, 12, c.rec === 'record' ? '#ffd54a' : '#9fe8b0', 'center');
      break;
    }
    default: txt('…', cx, y + 46, 15, '#fff', 'center');
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
  for (const h of HOSPITALS) mk(h, '#e74c3c', 'ER');
  if (heat >= 8) for (const e of eprPhones()) mk(e, '#3cf0ff', 'EPR'); // (the entangled payphones)
  for (const h of POLICE_POSTS) mk(h, '#3498db', 'PD');
  for (const s of SPRAYS) mk(s, '#9b59b6', 'SPRAY');
  for (const s of FISH_SPOTS) if (!player.fish || player.fish.s !== s) mk(s, '#29b6f6', 'FISH');
  for (const c of CONSOLES) mk(c, '#b388ff', 'AOD');
  if (EA && EA.qpc) mk(EA.qpc, '#00a9e0', 'QPU'); // (FIT's quantum computer)
  for (const b of BOOTHS) {
    ctx.fillStyle = b === ringing && pulse > 0.5 ? '#ffe14d' : '#1e5d3a'; ctx.fillRect(b.x - 6, b.y - 6, 12, 12);
    ctx.fillStyle = '#fff'; ctx.fillRect(b.x - 3, b.y - 3, 6, 3);
  }
  for (const u of pickups) {
    if (u.cd > 0 || (u.k === 'ent' && heat >= 8)) continue;
    const pk = PK[u.k], bob = Math.sin(time * 4 + u.x) * 2;
    if (pk.draw) { pk.draw(u.x, u.y + bob * 0.5); continue; }
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(u.x - 7, u.y - 4, 14, 12);
    ctx.fillStyle = pk.c; ctx.fillRect(u.x - 8, u.y - 9 + bob, 16, 16);
    ctx.fillStyle = '#111'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(pk.l, u.x, u.y + 3 + bob);
  }
  for (const u of drops) if (dropShown(u) && onScreen(u.x, u.y) && !(u.age > DROP_LIFE - 8 && Math.sin(time * 14) < -0.3)) drawDrop(u); // (blinking before it goes)
}
// a power-up that turned up: it pops in, then bobs like the others; ψ and ε look like theirs, the heart is a heart
function drawDrop(u) {
  const bob = Math.sin(time * 4 + u.x) * 2, s = u.age < 0.25 ? u.age / 0.25 * 1.2 : Math.max(1, 1.2 - (u.age - 0.25) / 0.15 * 0.2); // (a little overshoot)
  if (u.k === 'heart') {
    const heart = (x, y, r) => { ctx.beginPath(); ctx.moveTo(x, y + r * 0.9); ctx.bezierCurveTo(x - r * 1.35, y - r * 0.1, x - r * 0.65, y - r * 1.15, x, y - r * 0.35); ctx.bezierCurveTo(x + r * 0.65, y - r * 1.15, x + r * 1.35, y - r * 0.1, x, y + r * 0.9); };
    ctx.fillStyle = 'rgba(0,0,0,.3)'; heart(u.x + 1.5, u.y + 4, 8 * s); ctx.fill();
    heart(u.x, u.y - 2 + bob, 8.5 * s); ctx.fillStyle = DROP.heart.c; ctx.fill(); ctx.strokeStyle = '#5a0f1c'; ctx.lineWidth = 1.3; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(u.x - 3.2 * s, u.y - 4.5 * s + bob, 1.8 * s, 0, TAU); ctx.fill();
    return;
  }
  const pk = DROP[u.k], h = 8 * s;
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(u.x - 7 * s, u.y - 4 * s, 14 * s, 12 * s);
  ctx.fillStyle = pk.c; ctx.fillRect(u.x - h, u.y - 1 - h + bob, 2 * h, 2 * h);
  ctx.fillStyle = '#111'; ctx.font = `bold ${Math.max(1, 11 * s).toFixed(1)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText(pk.l, u.x, u.y + 3 * s + bob);
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
  if (p.suit && !isPlayer) { ctx.strokeStyle = '#222'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-1, 5); ctx.lineTo(-4, 6.5); ctx.stroke(); ctx.fillStyle = p.suit; rrect(-10.5, 4.2, 7, 4.6, 1); } // (a suitcase in tow)
  ctx.fillStyle = p.shirt; ctx.beginPath(); ctx.ellipse(0, 0, 3.4, 5.6, 0, 0, TAU); ctx.fill();
  if (p.monk) { ctx.beginPath(); ctx.ellipse(-0.8, 0, 4.8, 6.4, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = '#b9ae98'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(-0.5, -5.2); ctx.lineTo(-0.5, 5.2); ctx.stroke(); } // (a white habit)
  if (p.fan) { ctx.fillStyle = p.shirt === '#f4f4f4' ? '#1d4fa0' : '#f4f4f4'; ctx.fillRect(-0.9, -5.4, 1.8, 10.8); } // (and a scarf in the other colour)
  if (isPlayer && player.weapon) { ctx.fillStyle = '#111'; ctx.fillRect(3, 1.5, player.weapon === 'rocket' ? 11 : 7, player.weapon === 'rocket' ? 3 : 2); }
  else if (p.cop) { ctx.fillStyle = '#111'; ctx.fillRect(3, 1.5, p.swat ? 9 : 6, p.swat ? 2.6 : 2); }
  ctx.fillStyle = p.skin; ctx.beginPath(); ctx.arc(0.5, 0, 3, 0, TAU); ctx.fill();
  ctx.fillStyle = p.hair; ctx.beginPath(); ctx.arc(-0.5, 0, 3, Math.PI * 0.5, Math.PI * 1.5); ctx.fill();
  if (p.cop) { ctx.fillStyle = p.army ? '#3b4a1f' : p.swat ? '#121418' : '#0d1b4a'; ctx.beginPath(); ctx.arc(0, 0, p.swat ? 3.6 : 3.2, 0, TAU); ctx.fill(); }
  if (caller && caller.p === p) { ctx.fillStyle = '#111'; ctx.fillRect(-1, 3, 4, 2); } // (the phone at their ear)
  ctx.restore();
  if (caller && caller.p === p) { // and a ringing handset over their head
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(time * 9); ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('☎', p.x, p.y - 10); ctx.textAlign = 'left'; ctx.globalAlpha = 1;
  }
}
// shading across a car's width: dark sills, a bright highlight along the roof; cached per body size in car space
const glossCache = new Map();
function carGloss(l, w) {
  const key = l * 1000 + w;
  let g = glossCache.get(key);
  if (!g) {
    g = ctx.createLinearGradient(0, -w / 2, 0, w / 2);
    g.addColorStop(0, 'rgba(0,0,0,.32)'); g.addColorStop(0.16, 'rgba(0,0,0,.04)'); g.addColorStop(0.36, 'rgba(255,255,255,.2)');
    g.addColorStop(0.5, 'rgba(255,255,255,.06)'); g.addColorStop(0.8, 'rgba(0,0,0,.06)'); g.addColorStop(1, 'rgba(0,0,0,.36)');
    glossCache.set(key, g);
  }
  return g;
}
function drawCar(c) {
  const t = CT[c.type], l = t.l, w = t.w;
  if (t.boat) { drawBoat(c); return; }
  if (t.draw) { t.draw(c); return; } // (Birk's wheel, the Formula Student car)
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
  if (c.type === 'tractor') { // big rear wheels, small front ones, a bonnet and an open cab
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(-l / 2 - 1, -w / 2 - 3, 11, 5); ctx.fillRect(-l / 2 - 1, w / 2 - 2, 11, 5);
    ctx.fillRect(l / 2 - 8, -w / 2 - 1, 6, 3); ctx.fillRect(l / 2 - 8, w / 2 - 2, 6, 3);
    ctx.fillStyle = 'rgba(255,255,255,.12)'; for (let i = 0; i < 4; i++) { ctx.fillRect(-l / 2 + i * 3, -w / 2 - 3, 1, 5); ctx.fillRect(-l / 2 + i * 3, w / 2 - 2, 1, 5); }
    ctx.fillStyle = shade(c.color, 0.8); ctx.fillRect(-l / 2 + 2, -w / 2 + 2, l * 0.42, w - 4);
    ctx.fillStyle = '#1b2631'; ctx.fillRect(-l / 2 + 4, -w / 2 + 4, l * 0.3, w - 8);
    ctx.fillStyle = shade(c.color, 1.2); ctx.fillRect(-l * 0.02, -3.5, l * 0.5, 7);
    ctx.fillStyle = '#333'; ctx.fillRect(l * 0.1, -4.5, 2.5, 2.5);
    ctx.restore(); return;
  }
  if (c.type === 'apc') { // eight wheels, sloped armour, a gun turret
    ctx.fillStyle = '#1a1a1a'; for (let i = 0; i < 4; i++) { const x = -l / 2 + 7 + i * (l - 14) / 3; ctx.fillRect(x - 4, -w / 2 - 1.5, 8, 4); ctx.fillRect(x - 4, w / 2 - 2.5, 8, 4); }
    ctx.fillStyle = c.color; rrect(-l / 2, -w / 2 + 1, l, w - 2, 4);
    ctx.fillStyle = shade(c.color, 1.16); ctx.fillRect(-l / 2 + 4, -w / 2 + 5, l - 14, w - 10);
    ctx.fillStyle = '#20240f'; ctx.fillRect(l / 2 - 8, -w / 2 + 4, 3, w - 8); ctx.fillRect(-l / 2 + 6, -3, 6, 6);
    ctx.rotate(wrapA((c.turret ?? c.angle) - c.angle));
    ctx.fillStyle = '#23270f'; ctx.fillRect(0, -1.3, 22, 2.6);
    ctx.fillStyle = shade(c.color, 0.82); ctx.beginPath(); ctx.arc(-1, 0, 6.5, 0, TAU); ctx.fill();
    ctx.restore(); return;
  }
  if (c.type === 'dozer') { // tracks, an armoured cab, and the blade up front, wider than the rest
    ctx.fillStyle = '#222'; ctx.fillRect(-l / 2, -w / 2 + 1, l - 9, 7); ctx.fillRect(-l / 2, w / 2 - 8, l - 9, 7);
    ctx.fillStyle = '#4a4a4a'; for (let x = -l / 2 + 2; x < l / 2 - 10; x += 5) { ctx.fillRect(x, -w / 2 + 1, 2, 7); ctx.fillRect(x, w / 2 - 8, 2, 7); }
    ctx.fillStyle = c.color; ctx.fillRect(-l / 2 + 2, -w / 2 + 7, l - 12, w - 14);
    ctx.fillStyle = '#5b5f66'; ctx.fillRect(-l * 0.22, -w / 2 + 7, l * 0.3, w - 14); ctx.fillStyle = '#1b2631'; ctx.fillRect(l * 0.02, -w / 2 + 9, 2.5, w - 18);
    ctx.fillStyle = '#111'; ctx.fillRect(-l * 0.34, -5, 3.5, 3.5);
    ctx.fillStyle = '#3c3f44'; ctx.fillRect(l / 2 - 7, -w / 2 - 3, 6, w + 6); ctx.fillStyle = '#7a7f86'; ctx.fillRect(l / 2 - 2, -w / 2 - 3, 2, w + 6);
    ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(l / 2 - 7, -w / 4); ctx.lineTo(l / 2 - 16, -w / 4); ctx.moveTo(l / 2 - 7, w / 4); ctx.lineTo(l / 2 - 16, w / 4); ctx.stroke();
    ctx.restore(); return;
  }
  if (c.type === 'tanker') { // the tank on its trailer, and the cab jack-knifed off its line
    const hx = l / 2 - 16;
    ctx.fillStyle = '#2a2a2a'; ctx.fillRect(-l / 2 + 2, -w / 2 - 1, hx + l / 2 - 2, w + 2);
    const g = ctx.createLinearGradient(0, -w / 2, 0, w / 2); g.addColorStop(0, '#9da3a9'); g.addColorStop(0.45, '#f4f6f8'); g.addColorStop(1, '#8a9096');
    ctx.fillStyle = g; rrect(-l / 2, -w / 2 + 1, hx + l / 2 - 2, w - 2, 8);
    ctx.fillStyle = '#c0392b'; ctx.fillRect(-l / 2 + 4, -1.5, hx + l / 2 - 10, 3);
    ctx.translate(hx, 0); ctx.rotate(c.jk || 0);
    ctx.fillStyle = '#c0392b'; rrect(0, -w / 2 + 1, 16, w - 2, 3); ctx.fillStyle = '#1b2631'; ctx.fillRect(10, -w / 2 + 3, 3, w - 6);
    ctx.restore(); return;
  }
  if (c.type === 'armytruck') { // a Tatra: the cab up front, the canvas over the back on its hoops, the spare wheel behind the cab
    ctx.fillStyle = shade(c.color, 0.85); ctx.fillRect(l * 0.18, -w / 2 + 1, l * 0.3, w - 2);
    ctx.fillStyle = '#1b2631'; ctx.fillRect(l * 0.38, -w / 2 + 2.5, l * 0.07, w - 5);
    ctx.fillStyle = shade(c.color, 1.2); ctx.fillRect(-l / 2 + 1, -w / 2 + 0.5, l * 0.64, w - 1);
    ctx.fillStyle = 'rgba(0,0,0,.22)'; for (let i = 1; i < 6; i++) ctx.fillRect(-l / 2 + 1 + i * l * 0.107, -w / 2 + 0.5, 1.2, w - 1);
    ctx.fillStyle = '#1e1e1e'; ctx.beginPath(); ctx.arc(l * 0.11, 0, 4, 0, TAU); ctx.fill();
  } else if (c.type === 'truck') {
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
    if (c.type === 'jeep') { // (the roof rack, and the spare wheel on the back door)
      ctx.strokeStyle = 'rgba(30,30,24,.7)'; ctx.lineWidth = 1; ctx.strokeRect(-l * 0.28, -w / 2 + 2.5, l * 0.32, w - 5);
      ctx.fillStyle = '#1e1e1e'; ctx.beginPath(); ctx.arc(-l / 2 - 1, 0, 3.6, 0, TAU); ctx.fill();
    }
    if (c.type === 'ambulance') {
      ctx.fillStyle = '#fafafa'; ctx.fillRect(-l / 2 + 1, -w / 2 + 2, l * 0.62, w - 4);
      ctx.fillStyle = '#d62828'; ctx.fillRect(-l * 0.2 - 5, -1.5, 10, 3); ctx.fillRect(-l * 0.2 - 1.5, -5, 3, 10);
      ctx.fillRect(-l / 2, -w / 2, l, 1.5); ctx.fillRect(-l / 2, w / 2 - 1.5, l, 1.5);
    }
    if (c.type === 'firetruck') {
      ctx.fillStyle = '#bbb'; ctx.fillRect(-l * 0.45, -4, l * 0.62, 1.5); ctx.fillRect(-l * 0.45, 2.5, l * 0.62, 1.5);
      for (let i = 0; i < 7; i++) ctx.fillRect(-l * 0.45 + i * 4.5, -4, 1, 8);
    }
    if (c.type === 'bureau') { // a black van with a detector dish on its roof
      ctx.fillStyle = '#23262d'; ctx.fillRect(-l / 2 + 3, -w / 2 + 3, l * 0.62, w - 6);
      ctx.fillStyle = '#e8eaed'; ctx.beginPath(); ctx.arc(-l * 0.16, 0, 5, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#555'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-l * 0.16, 0); ctx.lineTo(-l * 0.16 + Math.cos(time * 4) * 5, Math.sin(time * 4) * 5); ctx.stroke();
      ctx.fillStyle = c.chase && Math.sin(time * 10) > 0 ? '#3cf0ff' : '#1d6b72'; ctx.fillRect(l * 0.12, -2, 3, 4);
    }
    if (c.type === 'swat') { ctx.fillStyle = '#2b3546'; ctx.fillRect(-l / 2 + 3, -w / 2 + 3, l * 0.62, w - 6); ctx.fillStyle = '#d8d8d8'; ctx.fillRect(-l * 0.32, -w / 2, 2.5, w); ctx.fillRect(-l * 0.02, -w / 2, 2.5, w); }
    const lit = c.type === 'police' || c.type === 'swat' ? c.chase : (c.type === 'ambulance' || c.type === 'firetruck') ? !!c.job : null;
    if (lit !== null) {
      const on = lit && Math.sin(time * 18) > 0, bx = c.type === 'police' ? -l * 0.05 : c.type === 'swat' ? l * 0.12 : l * 0.18;
      ctx.fillStyle = lit ? (on ? '#ff3030' : '#5a0000') : '#7a1d1d'; ctx.fillRect(bx, -w / 2 + 2, 4, (w - 4) / 2);
      ctx.fillStyle = lit ? (!on ? '#3070ff' : '#00105a') : '#1d2f7a'; ctx.fillRect(bx, 0, 4, (w - 4) / 2);
      if (lit) { ctx.fillStyle = on ? 'rgba(255,40,40,.18)' : 'rgba(40,90,255,.18)'; ctx.beginPath(); ctx.arc(0, 0, 26, 0, TAU); ctx.fill(); }
    }
  }
  if (!c.ghost) { ctx.fillStyle = carGloss(l, w); rrect(-l / 2, -w / 2, l, w, 4); } // rounded, glossy bodywork
  ctx.fillStyle = '#fff6c8'; ctx.fillRect(l / 2 - 2, -w / 2 + 1.5, 2, 3); ctx.fillRect(l / 2 - 2, w / 2 - 4.5, 2, 3);
  ctx.fillStyle = c.speed < -5 || (c.driver === 'player' && keys.down) ? '#ff4040' : '#a31515';
  ctx.fillRect(-l / 2, -w / 2 + 1.5, 2, 3); ctx.fillRect(-l / 2, w / 2 - 4.5, 2, 3);
  if (dmg > 0.3) { ctx.fillStyle = `rgba(20,20,20,${dmg * 0.5})`; ctx.fillRect(l * 0.25, -w / 2, l * 0.25, w); }
  if (c.door > 0.02) { // the driver's door (or the other, if that side was blocked), swung out on its front hinge
    const sd = c.doorSide || -1, dl = l * 0.27, hx = l * 0.2, hy = sd * w / 2, a = c.door * 1.15, ex = hx - dl * Math.cos(a), ey = hy + sd * dl * Math.sin(a);
    ctx.fillStyle = '#141414'; ctx.fillRect(hx - dl, sd < 0 ? -w / 2 : w / 2 - 2.5, dl, 2.5); // (the gap it left)
    ctx.lineCap = 'round'; ctx.strokeStyle = shade(c.color, 0.85); ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.strokeStyle = 'rgba(150,190,220,.75)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(hx + (ex - hx) * 0.2, hy + (ey - hy) * 0.2); ctx.lineTo(hx + (ex - hx) * 0.65, hy + (ey - hy) * 0.65); ctx.stroke(); // (its window)
    ctx.lineCap = 'butt';
  }
  const steal = c.mission && mission && mission.type === 'steal' && mission.stage === 0;
  if (steal || c.twin || c.linked || c.decoy || c.driver === 'eve') { ctx.strokeStyle = c.twin || c.linked || c.decoy ? '#3cf0ff' : c.driver === 'eve' ? '#c39bd3' : '#ff2bd6'; ctx.lineWidth = 2; if (c.decoy) ctx.setLineDash([4, 3]); ctx.strokeRect(-l / 2 - 3, -w / 2 - 3, l + 6, w + 6); ctx.setLineDash([]); }
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
  if (heat < 1 || belief.sig < 15 || player.hidden || !Number.isFinite(belief.x + belief.y + belief.sig)) return;
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
  for (const p of lampsNear(v, 85)) if (vis(p.x, p.y, p.r)) l.drawImage(glowSpr, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2); // (no lamp's light reaches further than 85)
  for (const c of cars) {
    if (c.dead || c.lay === 1 || !vis(c.x, c.y, 160)) continue;
    if (c.driver) { // headlights, and a faint light that keeps the car's own shape (no halo on the road round it)
      const t = CT[c.type];
      l.save(); l.translate(c.x, c.y); l.rotate(c.angle); l.drawImage(coneSpr, t.l / 2 - 2, -40, 150, 80);
      l.globalAlpha = 0.55; l.drawImage(glowSpr, -t.l * 0.6, -t.w * 0.6, t.l * 1.2, t.w * 1.2); l.globalAlpha = 1; l.restore();
    }
    if (c.fire > 0) l.drawImage(glowSpr, c.x - 70, c.y - 70, 140, 140);
  }
  for (const t of trams) { // a tram's lit saloon, and its headlights
    if (!(t.train ? t.sec.some(S => vis(S.x, S.y, 200)) : vis(t.x, t.y, 260))) continue;
    for (const S of t.sec) { if (S.lv < 0) continue; l.save(); l.translate(S.x, S.y); l.rotate(S.a); l.globalAlpha = t.dead ? 0.3 : 0.6; l.drawImage(glowSpr, -S.l * 0.62, -t.w, S.l * 1.24, t.w * 2); l.globalAlpha = 1; l.restore(); }
    const S = t.sec[0]; if (!t.dead && !S.lv) { l.save(); l.translate(S.x, S.y); l.rotate(S.a); l.drawImage(coneSpr, S.l / 2 - 2, -40, 150, 80); l.restore(); }
    if (t.fire > 0) l.drawImage(glowSpr, t.x - 90, t.y - 90, 180, 180);
  }
  if (Q.branches) for (const g of Q.branches) l.drawImage(glowSpr, g.x - 40, g.y - 40, 80, 80);
  for (const q of parts) if (q.grow > 10 && q.life > 0.2 && !q.top) l.drawImage(glowSpr, q.x - 50, q.y - 50, 100, 100);
  if (!player.car && !player.hidden) l.drawImage(glowSpr, player.x - 45, player.y - 45, 90, 90);
  const fp = fishFloat(); if (fp) l.drawImage(glowSpr, fp[0] - 22, fp[1] - 22, 44, 44);
  if (player.tow) l.drawImage(glowSpr, player.tow.Ax - 40, player.tow.Ay - 40, 80, 80);
  for (const z of ZONES) if (z.fx > 0 && vis((z.x0 + z.x1) / 2, (z.y0 + z.y1) / 2, 300)) { l.globalAlpha = Math.min(1, z.fx * 2); l.drawImage(glowSpr, z.x0 - 40, z.y0 - 40, z.x1 - z.x0 + 80, z.y1 - z.y0 + 80); l.globalAlpha = 1; }
  if (flight.on) l.drawImage(glowSpr, flight.x + 30, (AIRPORT.ry0 + AIRPORT.ry1) / 2 - 30, 60, 60);
  if (heli && !heli.dead && !heli.leaveT) l.drawImage(glowSpr, heli.lx - 120, heli.ly - 120, 240, 240);
  ctx.save(); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.drawImage(lightCv, 0, 0, W, H); ctx.restore();
  if (dk > 0.15) { // coloured light sources on top
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = dk;
    for (const p of lampsNear(v, 10)) if (vis(p.x, p.y, 10)) { ctx.fillStyle = p.c || 'rgba(255,220,140,.9)'; ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, TAU); ctx.fill(); }
    if (fp && player.fish.ph !== 'bite') { ctx.fillStyle = 'rgba(120,255,140,.9)'; ctx.beginPath(); ctx.arc(fp[0], fp[1], 1.8, 0, TAU); ctx.fill(); } // (the float's glow stick)
    forLights(v, (n, poles) => { for (const p of poles) { ctx.fillStyle = SIG[sigCol(n, p.g)]; ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, TAU); ctx.fill(); } });
    const on = Math.sin(time * 18) > 0;
    if (heli && !heli.dead && !heli.leaveT) { ctx.fillStyle = 'rgba(210,230,255,.16)'; ctx.beginPath(); ctx.arc(heli.lx, heli.ly, 95, 0, TAU); ctx.fill(); }
    for (const c of cars) if (c.driver && !c.dead && c.lay !== 1 && vis(c.x, c.y, 40)) { // tail lights, brighter when braking
      const t = CT[c.type], ca = Math.cos(c.angle), sa = Math.sin(c.angle), br = c.speed > 5 && c.brk ? 0.85 : 0.45;
      ctx.fillStyle = `rgba(255,36,28,${br})`;
      for (const s of [-1, 1]) { const x = c.x - ca * (t.l / 2 - 1) - sa * s * t.w * 0.32, y = c.y - sa * (t.l / 2 - 1) + ca * s * t.w * 0.32; ctx.beginPath(); ctx.arc(x, y, t.bike ? 2 : 2.6, 0, TAU); ctx.fill(); if (t.bike) break; }
    }
    for (const t of trams) if (!t.dead && vis(t.x, t.y, 220)) for (const S of t.sec) if (S.lv >= 0) { // (the saloon's windows glow warm)
      ctx.save(); ctx.translate(S.x, S.y); ctx.rotate(S.a); ctx.fillStyle = 'rgba(255,210,130,.28)'; ctx.fillRect(-S.l / 2 + 3, -t.w / 2 + 1, S.l - 6, t.w - 2); ctx.restore();
    }
    for (const c of cars) if ((c.chase || c.job) && c.lay !== 1 && vis(c.x, c.y, 40)) { ctx.fillStyle = on ? 'rgba(255,40,40,.4)' : 'rgba(40,90,255,.4)'; ctx.beginPath(); ctx.arc(c.x, c.y, 34, 0, TAU); ctx.fill(); }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
}
function drawTunnelView() {
  const v = viewRect(60);
  ctx.fillStyle = 'rgba(5,7,12,.82)'; ctx.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
  const path = pts => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); };
  const E = TUNNELS.filter(e => e.bb[0] < v.x1 && e.bb[2] > v.x0 && e.bb[1] < v.y1 && e.bb[3] > v.y0);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const e of E) { path(e.pts); ctx.strokeStyle = '#1c1e22'; ctx.lineWidth = 96; ctx.stroke(); }
  for (const e of E) { path(e.pts); ctx.strokeStyle = '#6d6c68'; ctx.lineWidth = 80; ctx.stroke(); }
  for (const e of E) { path(e.pts); ctx.strokeStyle = PAT.hw; ctx.lineWidth = 64; ctx.stroke(); }
  for (const e of E) { path(e.pts); ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 58; ctx.stroke(); path(e.pts); ctx.strokeStyle = PAT.hw; ctx.lineWidth = 54; ctx.stroke(); }
  ctx.setLineDash([14, 12]); ctx.lineWidth = 2; ctx.strokeStyle = '#e8e8e8'; for (const e of E) { path(e.pts); ctx.stroke(); } ctx.setLineDash([]);
  ctx.globalCompositeOperation = 'lighter'; // the lamps along the walls
  for (const e of E) for (let s = 40; s < e.len; s += 90) {
    const [x, y, h] = edgePt(e, s), nx = -Math.sin(h), ny = Math.cos(h);
    for (const sd of [-1, 1]) {
      const lx = x + nx * 38 * sd, ly = y + ny * 38 * sd, g = ctx.createRadialGradient(lx, ly, 0, lx, ly, 46);
      g.addColorStop(0, 'rgba(255,190,90,.38)'); g.addColorStop(1, 'rgba(255,190,90,0)');
      ctx.fillStyle = g; ctx.fillRect(lx - 46, ly - 46, 92, 92);
      ctx.fillStyle = '#ffd27a'; ctx.fillRect(lx - 3, ly - 1.5, 6, 3);
    }
  }
  ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'butt';
  for (const c of cars) if (c.lay === 1 && onScreen(c.x, c.y, 60)) drawCar(c);
}
// your co-op partner, as seen from this machine: { p (to draw on foot), x, y, inCar, hidden, dead, tag, color }
function otherPlayer() {
  if (NET.role === 'host' && NET.guest) { const g = NET.guest.player, at = g.car || g; return { p: g, x: at.x, y: at.y, inCar: !!g.car, hidden: g.hidden || (g.down && g.downKind === 'busted'), dead: g.down && g.downKind === 'wasted', tag: 'P2', color: '#2ee88a' }; }
  if (NET.role === 'guest' && NET.other) { const o = NET.other, c = o.car ? NET.ents.get(o.car) : null, at = c || o; return { p: o, x: at.x, y: at.y, inCar: !!c, hidden: o.hidden, dead: o.dead, tag: 'P1', color: '#ff9a4a' }; }
  return null;
}
function drawWorld() {
  const sx = (Math.random() - 0.5) * shake * 10, sy = (Math.random() - 0.5) * shake * 10;
  ctx.setTransform(DPR * cam.zoom, 0, 0, DPR * cam.zoom, DPR * (W / 2 - cam.x * cam.zoom + sx), DPR * (H / 2 - cam.y * cam.zoom + sy));
  const v = viewRect(8);
  updateSun();
  drawGround(v);
  drawStreetNames(v);
  drawProps(v);
  drawZones(v);
  drawSignals(v);
  drawDecals(v);
  drawWantedGround(v);
  drawMarkers();
  drawEggs(v, 0);
  for (const p of peds) if (p.dead && onScreen(p.x, p.y)) drawPed(p);
  for (const p of peds) if (!p.dead && onScreen(p.x, p.y)) drawPed(p);
  drawHeroes(false);
  drawEggs(v, 1);
  if (!player.car && !player.hidden && !player.cellar && !(player.down && player.downKind === 'busted')) drawPed(player, true);
  drawFishing();
  drawTow();
  const oth = otherPlayer();
  if (oth && !oth.inCar && !oth.hidden) drawPed(oth.dead ? Object.assign({}, oth.p, { dead: true }) : oth.p);
  drawTrams(v, 0);
  for (const c of cars) if (c.lay !== 1 && c.lay !== 3 && c.lay !== 4 && onScreen(c.x, c.y, 60)) drawCar(c);
  drawDecks(v);
  drawRailDecks(v);
  drawTrams(v, 1); // (up on a bridge over a street)
  drawBranches();
  drawZoneFx(v);
  for (const pl of PLANES) if (onScreen(pl.x, pl.y, 80)) drawPlane(pl.x, pl.y, pl.a, 0);
  ctx.fillStyle = '#ffe9a0';
  for (const b of bullets) ctx.fillRect(b.x - 1.5, b.y - 1.5, b.rocket ? 5 : 3, b.rocket ? 5 : 3);
  drawParts(false);
  drawShadows(v);
  if (heli && SUN.on) { ctx.fillStyle = `rgba(12,18,40,${0.25 * (1 - NIGHT)})`; ctx.beginPath(); ctx.ellipse(heli.x + SUN.sx * 70, heli.y + SUN.sy * 70, 22, 14, heli.angle, 0, TAU); ctx.fill(); }
  drawLighting(v);
  drawBuildings(v);
  drawEggs(v, 2);
  drawTrees(v);
  drawTurbines(v);
  drawParts(true);
  if (flight.on) drawPlane(flight.x, (AIRPORT.ry0 + AIRPORT.ry1) / 2, 0, flight.alt);
  drawHeli();
  drawWantedAir();
  drawBelief();
  for (const r of RAMPS) if (onScreen(r.pts[r.pts.length - 1][0], r.pts[r.pts.length - 1][1], 80)) { // the portal's lintel, over the cars driving in
    const P = r.pts, n = P.length, [ex, ey] = P[n - 1], [qx, qy] = P[Math.max(0, n - 6)], L = Math.hypot(ex - qx, ey - qy) || 1, ux = (ex - qx) / L, uy = (ey - qy) / L, nx = -uy, ny = ux, k = 1.06;
    const X = (x, y) => [cam.x + (x - cam.x) * k, cam.y + (y - cam.y) * k], A = X(ex + ux * 4 + nx * 42, ey + uy * 4 + ny * 42), B = X(ex + ux * 4 - nx * 42, ey + uy * 4 - ny * 42);
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 14; ctx.beginPath(); ctx.moveTo(A[0] + 4, A[1] + 5); ctx.lineTo(B[0] + 4, B[1] + 5); ctx.stroke();
    ctx.strokeStyle = tint('#b5b1a7', 1); ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
  }
  if (player.car && player.car.lay === 1) drawTunnelView(); // in a tunnel: the city above fades, the lit tube shows
  // a health bar over the car you drive (and over your friend's)
  const carBar = c => {
    if (!c || c.dead) return;
    const t = CT[c.type], f = clamp(c.hp / t.hp, 0, 1), w = 34, x = c.x - w / 2, y = c.y - 28;
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x - 1.5, y - 1.5, w + 3, 7);
    ctx.fillStyle = c.fire > 0 ? (Math.sin(time * 12) > 0 ? '#ff5a1f' : '#ffd23f') : f > 0.5 ? '#2ecc71' : f > 0.25 ? '#f1c40f' : '#e74c3c';
    ctx.fillRect(x, y, w * f, 4);
  };
  if (!player.hidden) carBar(player.car);
  if (NET.role === 'host' && NET.guest) carBar(NET.guest.player.car);
  else if (NET.role === 'guest' && NET.other && NET.other.car) carBar(NET.ents.get(NET.other.car));
  if (oth && !oth.hidden) { // a name tag over your friend
    const tx = oth.x, ty = oth.y - (oth.inCar ? 30 : 18);
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(tx - 15, ty - 10, 30, 14);
    ctx.fillStyle = oth.color; ctx.fillText(oth.tag, tx, ty + 1);
  }
  const tg = missionTarget();
  if (tg && !player.hidden) {
    const pulse = Math.sin(time * 5) * 4;
    ctx.strokeStyle = mission ? '#ffe14d' : '#7dff7a'; ctx.lineWidth = 3 / cam.zoom + 1;
    ctx.beginPath(); ctx.arc(tg.x, tg.y, 22 + pulse, 0, TAU); ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath(); ctx.moveTo(tg.x, tg.y - 30 - pulse); ctx.lineTo(tg.x - 8, tg.y - 44 - pulse); ctx.lineTo(tg.x + 8, tg.y - 44 - pulse); ctx.fill();
  }
  if (Q.link && !player.down) {
    const o = pp(), c = Q.link, ang = Math.atan2(c.y - o.y, c.x - o.x), dl = Math.min(140, Math.hypot(c.x - o.x, c.y - o.y));
    ctx.strokeStyle = 'rgba(60,240,255,.55)'; ctx.setLineDash([3, 5]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x + Math.cos(ang) * dl, o.y + Math.sin(ang) * dl); ctx.stroke(); ctx.setLineDash([]);
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
  const y = showMap === 1 ? 12 + MMV * (small ? 1.1 : 1.6) + 44 : 60;
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
const MMV = 100; // tiles across the minimap
const FIT = BRNO && siteRect('FIT BUT') ? { x: (siteRect('FIT BUT').x0 + siteRect('FIT BUT').x1 + 1) / 2 * T, y: (siteRect('FIT BUT').y0 + siteRect('FIT BUT').y1 + 1) / 2 * T } : null;
const FACS = BRNO ? FACULTIES.filter(f => f[0] !== 'FIT').map(([name, , c]) => { const r = siteRect(name + ' BUT'); return r && { name, c, x: (r.x0 + r.x1 + 1) / 2 * T, y: (r.y0 + r.y1 + 1) / 2 * T }; }).filter(Boolean) : []; // (BUT's other faculties)
const CLUB = (r => r && { name: r.name, x: (r.x0 + r.x1 + 1) / 2 * T, y: (r.y0 + r.y1 + 1) / 2 * T })(siteRect(BRNO ? 'Moulin Rouge' : 'The Naked Singularity')); // the strip club
const MAP_LABELS = BRNO ? [['FIT BUT', ...geo(49.2285, 16.5955), 'hi'],
  ...['Staré Město', 'Královo Pole', 'Bystrc', 'Líšeň', 'Bohunice', 'Lesná', 'Židenice', 'Slatina', 'Tuřany', 'Žabovřesky', 'Kohoutovice', 'Komárov', 'Řečkovice']
    .map((n, i) => { const p = placeAt(n); return [n, p[0], p[1] - 2, i < 9]; }),
  ...['Veveří', 'Štýřice', 'Husovice', 'Medlánky', 'Jundrov', 'Černovice', 'Vinohrady', 'Obřany', 'Starý Lískovec', 'Pisárky'].map(n => { const p = placeAt(n); return [n, p[0], p[1] - 2]; }),
  ['Brněnská přehrada', ...geo(49.2380, 16.5230), true], ['Špilberk', ...geo(49.1947, 16.5970)], ['Výstaviště', ...geo(49.1860, 16.5810)], ['Svratka', ...geo(49.2160, 16.5450)],
  ['Svitava', ...geo(49.2300, 16.6420)], ['Hády', ...geo(49.2260, 16.6741)], ['Letiště', ...geo(49.1500, 16.6850)], ['Zoo', ...geo(49.2320, 16.5329)], ['Lužánky', ...geo(49.2085, 16.6089)]]
  : [['Quantum City', 50, 52, true], ['Harvest Valley', 132, 88, true], ["Bell's Crossing", 150, 66], ['Lake Bloch', 129, 50], ['Las Ondas', 205, 22, true],
  ['Vacuum Flats', 196, 124, true], ['Site Ψ', 206, 94], ['Coral Bay', 152, 152, true], ['Palm Coast', 92, 197], ['Mount Eigen', 50, 136, true], ['Hilbert Woods', 30, 108],
  ['Pine Lake', 88, 111], ['Eigen Observatory', 50, 157]].filter(([, x, y]) => x > 3 && y > 3 && x < MW - 3 && y < MH - 3);
function drawHUD() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const small = W < 600, s = small ? 0.8 : 1;
  drawEggsHUD();
  txt(fmt(player.cash), W - 16, 40 * s, 32 * s, '#ffd54a', 'right', true);
  txt(`x${player.mult}  ${'♥'.repeat(Math.max(0, player.lives))}`, W - 16, 64 * s, 16 * s, '#ff8a8a', 'right');
  txt(`${eggBadges()}ψ×${Q.psi}  ε×${Q.ent}  ${lab || qBlocked() ? 'tunnel –' : `tunnel ${Math.floor(tunChance(player) * 100)}%`}`, W - 16, 86 * s, 15 * s, '#c9b3ff', 'right'); // (and the chance of tunnelling through the next wall)
  const stars = Math.floor(heat), flash = heat >= 1 && belief.seen && Math.sin(time * 8) > 0;
  for (let i = 0; i < 5; i++) star(W / 2 - 60 + i * 30, 26, 11, i < stars, flash ? '#fff' : '#ffd54a');
  const WLv = WL[Math.min(10, stars)];
  if (WLv) { // six stars and up: a second row, the level's name, and its way out
    for (let i = 0; i < 5; i++) star(W / 2 - 48 + i * 24, 50, 8, i < stars - 5, flash ? '#fff' : WLv.col);
    txt(WLv.name, W / 2, 72, 12, WLv.col, 'center', true); txt(wantedHint(), W / 2, 87, 11, '#e6e6e6', 'center');
  }
  if (heat >= 1) txt(belief.seen ? 'SEEN' : `LOST YOU · Δx ≈ ${Math.round(belief.sig / T)} tiles`, W / 2, WLv ? 103 : 98, 12, belief.seen ? '#ff6b6b' : '#8fb4ff', 'center');
  drawWantedHUD();
  if (Q.branches) txt(`SUPERPOSED · ${Math.ceil(Q.supT)}s · X to collapse`, W / 2, 118, 13, '#c9b3ff', 'center');
  if (Q.link) txt(`ε entangled · T: measure and swap places · ${Math.ceil(Q.linkT)} s`, W / 2, H / 2 + 70, 13, '#3cf0ff', 'center');
  else if (Q.decoyT > 0) txt(`the police are chasing your twin · ${Math.ceil(Q.decoyT)} s`, W / 2, H / 2 + 70, 13, '#3cf0ff', 'center');
  const bx = 16, by = H - (touchOn() ? 196 : 40);
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(bx, by, 164, 14);
  ctx.fillStyle = player.hp > 35 ? '#2ecc71' : '#e74c3c'; ctx.fillRect(bx + 2, by + 2, 160 * clamp(player.hp / 100, 0, 1), 10);
  if (player.car) {
    const c = player.car, t = CT[c.type];
    const f = clamp(c.hp / t.hp, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(bx, by - 22, 164, 14);
    ctx.fillStyle = c.fire > 0 ? '#ff5a1f' : f > 0.5 ? '#5dade2' : f > 0.25 ? '#f1c40f' : '#e74c3c'; ctx.fillRect(bx + 2, by - 20, 160 * f, 10);
    txt(c.fire > 0 ? 'ON FIRE: GET OUT' : `car ${Math.ceil(f * 100)}%`, bx + 168, by - 11, 11, c.fire > 0 ? '#ff8a5a' : '#cfe6f5');
    txt(`${t.label}${radio ? '  ♪ ' + STATIONS[radio].name : ''}`, bx, by - 30, 13, '#ddd');
  } else {
    const w = player.weapon;
    txt(w ? `${WEAPONS[w].name}  ${player.weapons[w]}` : 'Fists', bx, by - 8, 15, '#fff');
  }
  if (player.tow) { // the trap as a well, the car as a ball rolling in it: how far it is from the centre, and how hot
    const tw = player.tow, ww = 164, wh = 58, wx = W - 16 - ww, wy = touchOn() ? 204 : 172, u = clamp(Math.hypot(tw.ux, tw.uy), 0, 1.15) * Math.sign(tw.ux || 1);
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(wx, wy, ww, wh);
    ctx.strokeStyle = '#ff8ad8'; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i <= 30; i++) { const xx = -1.1 + 2.2 * i / 30, X = wx + 52 + xx * 40, Y = wy + 48 - Math.min(1.21, xx * xx) * 32; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,90,90,.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(wx + 8, wy + 16); ctx.lineTo(wx + 96, wy + 16); ctx.stroke(); // (out of the trap above this)
    ctx.fillStyle = tw.n > 40 ? '#ff6b6b' : tw.n > 12 ? '#ffd54a' : '#7dff8a'; ctx.beginPath(); ctx.arc(wx + 52 + u * 40, wy + 44 - Math.min(1.3, u * u) * 32, 4.5, 0, TAU); ctx.fill();
    txt('TWEEZER', wx + 104, wy + 16, 11, '#ff8ad8');
    txt(`n̄ ${tw.n < 10 ? tw.n.toFixed(1) : Math.round(tw.n)}`, wx + 104, wy + 36, 15, '#fff');
    txt('G drops', wx + 104, wy + 52, 10, '#aaa');
  }
  if (!player.hidden) { const P = pp(); for (const z of ZONES) if (z.kind === 'ent' && d2(P.x, P.y, (z.x0 + z.x1) / 2, (z.y0 + z.y1) / 2) < 520 * 520) { // near an entangling zone: when the next pulse comes
    txt(`Rydberg pulse in ${Math.ceil(z.t)} s`, W / 2, 140, 14, z.t < 3 ? '#e0c8ff' : '#b388ff', 'center'); break; } }
  if (showMap) {
    // M cycles: a minimap of the 100 tiles around you, then the whole island, then nothing
    const full = showMap === 2, P = pp();
    let ms, mx, my, sw, sh, sx = 0, sy = 0;
    if (full) { ms = Math.min((W - 40) / MW, (H - 90) / MH); sw = MW * ms; sh = MH * ms; mx = (W - sw) / 2; my = (H - sh) / 2 + 10; }
    else { ms = small ? 1.1 : 1.6; sw = sh = MMV * ms; mx = 12; my = 12; sx = clamp(P.x / T - MMV / 2, 0, MW - MMV); sy = clamp(P.y / T - MMV / 2, 0, MH - MMV); }
    if (full) { ctx.fillStyle = 'rgba(6,10,20,.6)'; ctx.fillRect(0, 0, W, H); }
    ctx.globalAlpha = full ? 1 : 0.85; ctx.drawImage(mm, sx, sy, sw / ms, sh / ms, mx, my, sw, sh); ctx.globalAlpha = 1;
    ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeRect(mx, my, sw, sh);
    ctx.save(); ctx.beginPath(); ctx.rect(mx, my, sw, sh); ctx.clip();
    const dot = (x, y, c, r = 2.5) => { ctx.fillStyle = c; ctx.fillRect(mx + (x / T - sx) * ms - r, my + (y / T - sy) * ms - r, r * 2, r * 2); };
    if (full) for (const [nm, x, y, big] of MAP_LABELS) txt(nm, mx + x * ms, my + y * ms, big ? 15 : 11, big === 'hi' ? '#5cc8ff' : big ? '#fff' : '#e8e8e8', 'center', !!big);
    if (FIT) { // the Faculty of Information Technology gets its own marker
      const fx = mx + (FIT.x / T - sx) * ms, fy = my + (FIT.y / T - sy) * ms, r = (full ? 6 : 4) + Math.sin(time * 4);
      ctx.fillStyle = '#00a9e0'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(fx, fy - r); ctx.lineTo(fx + r, fy); ctx.lineTo(fx, fy + r); ctx.lineTo(fx - r, fy); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    if (heat >= 1 && belief.sig > 15) {
      ctx.strokeStyle = 'rgba(120,170,255,.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(mx + (belief.x / T - sx) * ms, my + (belief.y / T - sy) * ms, Math.max(3, belief.sig / T * ms), 0, TAU); ctx.stroke();
    }
    for (const c of cars) if (c.chase) dot(c.x, c.y, Math.sin(time * 10) > 0 ? '#f33' : '#33f', 2);
    for (const h of HOSPITALS) dot(h.x, h.y, '#e74c3c', 2);
    for (const h of POLICE_POSTS) dot(h.x, h.y, '#3498db', 2);
    for (const sp of SPRAYS) dot(sp.x, sp.y, '#c27cf0', 2);
    for (const sp of FISH_SPOTS) dot(sp.x, sp.y, '#4fc3f7', 2);
    for (const L of [trams, tramsFar]) for (const t of L) if (!t.dead) dot(t.x, t.y, t.R.col, full ? 1.6 : 1.8); // (the trams, in their lines' colours)
    if (Q.branches) for (const g of Q.branches) dot(g.x, g.y, g.tint, 2);
    for (const u of drops) if (dropShown(u)) dot(u.x, u.y, DROP[u.k].c, full ? 2.5 : 2); // (the power-ups that turned up)
    // BUT's other faculties: a small diamond each in the faculty's colour
    for (const f of FACS) {
      const fx = mx + (f.x / T - sx) * ms, fy = my + (f.y / T - sy) * ms, r = full ? 4.5 : 3;
      ctx.fillStyle = f.c; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(fx, fy - r); ctx.lineTo(fx + r, fy); ctx.lineTo(fx, fy + r); ctx.lineTo(fx - r, fy); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    if (CLUB) dot(CLUB.x, CLUB.y, '#ff4fa8', full ? 3.5 : 2.5);
    if (full) { // names on the big map above their marks, or else below, right or left of them: wherever no other name is (else none)
      const mono = 'bold 11px ui-monospace, Menlo, Consolas, monospace';
      const boxes = MAP_LABELS.map(([nm, x, y, big]) => { ctx.font = big ? '15px Bungee, Impact, sans-serif' : mono; const w = ctx.measureText(nm).width; return [mx + x * ms - w / 2, my + y * ms - (big ? 15 : 11), mx + x * ms + w / 2, my + y * ms + 3]; });
      const label = (name, x, y, col, must) => {
        const cx = mx + x / T * ms, cy = my + y / T * ms; ctx.font = mono; const w = ctx.measureText(name).width;
        const at = ([dx, dy, al]) => { const x0 = cx + dx - (al === 'center' ? w / 2 : al === 'right' ? w : 0), y0 = cy + dy - 11; return [x0, y0, x0 + w, y0 + 14]; };
        const spot = [[0, -9, 'center'], [0, 18, 'center'], [8, 4, 'left'], [-8, 4, 'right']].find(s => { const b = at(s); return !boxes.some(q => q[0] < b[2] && q[2] > b[0] && q[1] < b[3] && q[3] > b[1]); }) || (must ? [0, -9, 'center'] : null);
        if (spot) { boxes.push(at(spot)); txt(name, cx + spot[0], cy + spot[1], 11, col, spot[2]); }
      };
      if (CLUB) label(CLUB.name, CLUB.x, CLUB.y, '#ff9ccf', true);
      for (const f of FACS) label(f.name, f.x, f.y, '#d8e8f4', false);
    }
    if (Q.link) dot(Q.link.x, Q.link.y, '#3cf0ff', 2.5);
    if (heli) dot(heli.x, heli.y, Math.sin(time * 10) > 0 ? '#cfe3ff' : '#f33', 3);
    if (heat >= 8) for (const e of eprPhones()) dot(e.x, e.y, Math.sin(time * 6) > 0 ? '#3cf0ff' : '#fff', full ? 4.5 : 3.5);
    if (HQ.drone) dot(HQ.drone.x, HQ.drone.y, '#b388ff', 2); if (HQ.carrier) dot(HQ.carrier.x, HQ.carrier.y, '#ef5350', 5);
    for (const h of HQ.heroes || []) if (h.ph === 'go' || h.ph === 'drop') dot(h.x, h.y, HEROES[h.k].c, full ? 3.5 : 2.5); // (P.L.A.N.C.K.'s heroes)
    if (Q.decoy) dot(Q.decoy.x, Q.decoy.y, '#3cf0ff', 2.5);
    for (const e of eggDots()) dot(e.x, e.y, e.c, full ? 4 : 3);
    const tg = missionTarget(); if (tg) dot(tg.x, tg.y, '#ffe14d', 3.5);
    const oth = otherPlayer(); if (oth && !oth.hidden) dot(oth.x, oth.y, oth.color, full ? 4 : 3);
    dot(P.x, P.y, '#fff', full ? 4 : 3);
    ctx.restore();
    if (full) txt(`${BRNO ? 'Brno · map data © OpenStreetMap contributors' : 'the island'} · M to close`, W / 2, my - 10, 13, '#ddd', 'center');
    else {
      txt(hxs(streetName(P.x, P.y) || placeName(P.x, P.y)), mx, my + sh + 16, 12, '#ddd');
      const hh = Math.floor(dayT * 24), mi = Math.floor((dayT * 24 - hh) * 60);
      txt(`${BRNO ? WDAYS[weekday()] + ' ' : ''}${String(hh).padStart(2, '0')}:${String(mi).padStart(2, '0')}`, mx, my + sh + 32, 12, darkness() > 0.3 ? '#9fb7ff' : '#ffe08a');
    }
  }
  const tg = missionTarget();
  if (tg && !player.down) {
    const a = Math.atan2(tg.y - player.y, tg.x - player.x), d = Math.hypot(tg.x - player.x, tg.y - player.y);
    const ax = W / 2, ay = heat >= 6 ? 142 : 62; // (below the wanted level's lines, from six stars)
    ctx.save(); ctx.translate(ax, ay); ctx.rotate(a);
    ctx.fillStyle = mission ? '#ffe14d' : '#7dff7a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-10, -11); ctx.lineTo(-4, 0); ctx.lineTo(-10, 11); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    txt(`${Math.round(d / T)}m`, ax + 40, ay + 5, 12, '#fff', 'left');
  }
  const ml = NET.role === 'guest' ? NET.mx : missionLine() || eggLine();
  if (ml) {
    if (ml.arc) txt(ml.arc, W - 16, 156 * s, 12 * s, '#c9b3ff', 'right');
    txt(ml.line, W - 16, 110 * s, 15 * s, '#ffe14d', 'right');
    if (ml.timer > 0) txt(`${Math.ceil(ml.timer)}s`, W - 16, 134 * s, 20 * s, ml.timer < 10 ? '#ff6b6b' : '#fff', 'right');
  }
  if (NET.role) txt(NET.role === 'host' ? (NET.guest ? 'CO-OP · you are orange' : 'CO-OP · waiting') : 'CO-OP · you are green', W / 2, H - 14, 12, '#7dffd8', 'center');
  let my2 = H - (touchOn() ? 230 : 80);
  // keep messages clear of the quantum-note panel on the right
  const mx2 = Q.note && W > 700 ? (W - Math.min(380, W - 24) - 12) / 2 : W / 2;
  for (let i = msgs.length - 1; i >= 0; i--) { // (one too long for the screen goes on two lines, or more)
    ctx.globalAlpha = clamp(msgs[i].t, 0, 1);
    const fs = small ? 13 : 17, L = wrapLines(msgs[i].text, Math.min(2 * mx2 - 24, 980), `bold ${fs}px ui-monospace, Menlo, Consolas, monospace`);
    for (let j = L.length - 1; j >= 0; j--) { txt(L[j], mx2, my2, fs, '#fff', 'center'); my2 -= small ? 18 : 22; }
    my2 -= small ? 2 : 4;
  }
  ctx.globalAlpha = 1;
  drawAchToast();
  drawFishPanel();
  drawNote();
  drawLabCard(small);
  drawPhasorPanel(by);
  drawBB();
  if (overlay) {
    // as big as fits between the minimap and its mirror on the right (on a narrow screen, across it all)
    const side = showMap === 1 ? 24 + MMV * (small ? 1.1 : 1.6) : 12, maxW = W - 2 * side >= W / 2 ? W - 2 * side : W - 24;
    ctx.font = '100px Bungee, Impact, sans-serif'; const f = Math.min(84, H / 8, 100 * maxW / ctx.measureText(overlay.text).width);
    ctx.font = 'bold 18px ui-monospace, Menlo, Consolas, monospace'; const fs = overlay.sub ? Math.min(18, 18 * (W - 24) / ctx.measureText(overlay.sub).width) : 18;
    if (overlay.y == null) overlay.y = bannerY(f, !!overlay.sub); // (chosen once, so it doesn't jump about)
    ctx.globalAlpha = clamp(Math.min(overlay.t, overlay.max - overlay.t) * 3, 0, 1);
    txt(overlay.text, W / 2, overlay.y, f, overlay.color, 'center', true);
    if (overlay.sub) txt(overlay.sub, W / 2, overlay.y + 40, fs, '#fff', 'center');
    ctx.globalAlpha = 1;
  }
  if (helpPage) drawHelp();
}
// the big banner (a new wanted level, WASTED, JOB DONE...) never covers the player: it goes just under the HUD at the
// top, or, when the camera's lead has put the player up there, above the messages at the bottom
function bannerY(f, sub) {
  const P = pp(), py = H / 2 + (P.y - cam.y) * cam.zoom, clr = 28 * cam.zoom + 14; // the player on screen, and room round them
  const below = sub ? 46 : 0.25 * f, up = (heat >= 6 || Q.branches ? 150 : 112) + 0.75 * f, lo = H - (touchOn() ? 252 : 184) - below;
  if (up + below <= py - clr) return up;
  if (lo - 0.75 * f >= py + clr) return lo;
  return py < H / 2 ? Math.max(lo, py + clr + 0.75 * f) : Math.min(up, py - clr - below);
}
// ============================================================ the AOD planner: shuttle atoms around a trap array
// A puzzle at the Atom Array Lab's console (and the last Physics Lab lesson). Switch on some column tones and some row
// tones: a moving tweezer sits wherever a chosen row meets a chosen column, and picks up whatever atom is there. Drag
// the tones to new places (each its own distance, but they may never cross or merge), then GO: every picked atom moves
// at once. Two atoms dropped into one trap knock each other out. Fill the target sites in as few moves as you can.
const blockSites = (x0, y0, w, h) => { const o = []; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) o.push([x, y]); return o; };
const AOD_LV = [
  { name: 'Close up a row', w: 8, h: 1, atoms: [[1, 0], [3, 0], [4, 0], [6, 0]], target: blockSites(0, 0, 4, 1), par: 1, pay: 500,
    hint: 'Switch on the row and the four columns that have atoms (click their headers, or C and R at the cursor). Then drag each column left (or A / D). Tones keep their order, so the row closes up in a single parallel move. GO runs it.' },
  { name: 'A block without gaps', w: 5, h: 5, atoms: [[1, 0], [4, 0], [0, 1], [2, 1], [4, 1], [1, 2], [3, 2], [0, 3], [2, 3], [4, 3], [0, 4], [2, 4]], target: blockSites(1, 1, 3, 3), par: 2, pay: 1000,
    hint: 'Every atom where a chosen row meets a chosen column comes along, wanted or not. Rows whose atoms sit in the same columns can move together; a spare atom can fill the last hole.' },
  { name: 'Pairs for the gate', w: 8, h: 4, zone: 0, gates: [[0, 1], [3, 4], [6, 7]], atoms: [[5, 1], [1, 2], [2, 2], [3, 2], [2, 3], [3, 3], [4, 3]], par: 2, pay: 1500,
    hint: 'The top row is the entangling zone. Fill the three pairs of gate sites, keep the sites between them empty (a third atom nearby would be crosstalk), then fire the global Rydberg PULSE (P): every close pair gets a CZ gate at once.' },
  { name: 'Free play: a fresh array', w: 8, h: 8, fill: 0.5, need: 22, target: blockSites(2, 2, 4, 4), loss: 0.005, pay: 400,
    hint: 'A new array, loaded at random as real ones are (each trap catches an atom about half the time). Build the 4 × 4 block in the middle. Each pick-up and drop-off loses an atom one time in 200.' },
];
AOD_LV[2].target = AOD_LV[2].gates.flat().map(x => [x, 0]);
let AOD = null;
// ---- FIT BUT's quantum computer: Grover's search. One of the PINs opens a bank's vault. Each round the oracle flips the
// sign of the right PIN's amplitude and the diffusion step reflects every amplitude about their mean, which moves
// amplitude onto it; measure after about π/4·√N rounds and it is almost certain, go on and it swings past and back down
const QC_LV = [{ n: 2, pay: 1000 }, { n: 4, pay: 2500 }, { n: 6, pay: 5000 }]; // (qubits, and the vault's cash)
let QC = null, qcWins = 0, qcDay = -1, qcCool = 0;
function qcOpen() {
  if (NET.role) { msg('The quantum computer is single-player for now.', 2.5); return; }
  if (qcCool > time) { msg(`The dilution refrigerator is cooling back down to 10 mK: ${Math.ceil(qcCool - time)} s.`, 2.5); return; }
  const L = QC_LV[Math.min(qcWins, QC_LV.length - 1)], N = 1 << L.n, a0 = 1 / Math.sqrt(N);
  QC = { L, N, amp: new Array(N).fill(a0), prev: new Array(N).fill(a0), mark: randi(0, N - 1), k: 0, anim: 0, res: null, btn: [],
    best: Math.round(Math.PI / (4 * Math.asin(1 / Math.sqrt(N))) - 0.5) };
  state = 'qc'; touchEl.style.visibility = 'hidden'; sfx.quantum();
}
function qcClose() { QC = null; state = 'play'; touchEl.style.visibility = ''; }
function qcStep() { // one round: the oracle, then the diffusion
  const a = QC.amp; QC.prev = a.slice();
  a[QC.mark] = -a[QC.mark];
  const m = a.reduce((t, v) => t + v, 0) / a.length;
  for (let i = 0; i < a.length; i++) a[i] = 2 * m - a[i];
  QC.k++; QC.anim = 0.4; sfx.cast();
}
function qcMeasure() {
  let r = Math.random(), i = 0;
  for (; i < QC.N - 1; i++) { r -= QC.amp[i] ** 2; if (r < 0) break; }
  const ok = i === QC.mark, paid = ok && qcDay !== dayN;
  QC.res = { i, ok, p: QC.amp[QC.mark] ** 2, paid, pay: QC.L.pay };
  if (ok) { if (paid) { earn(QC.L.pay); qcDay = dayN; } qcWins++; ach('quantumpc'); sfx.good(); }
  else { qcCool = time + 45; sfx.bad(); }
}
function updateQC(dt) {
  if (QC.anim > 0) QC.anim = Math.max(0, QC.anim - dt);
  const tp = hit('Tap') && tapAt ? (QC.btn.find(b => tapAt.x > b.x && tapAt.x < b.x + b.w && tapAt.y > b.y && tapAt.y < b.y + b.h) || { k: 'any' }).k : null;
  if (QC.res) { if (tp || hit('Enter', 'Space', 'Escape', 'KeyE', 'KeyF', 'NumpadEnter')) qcClose(); return; }
  if (hit('Escape') || tp === 'leave') qcClose();
  else if ((hit('Space', 'KeyG') || tp === 'round') && QC.anim <= 0) qcStep();
  else if (hit('Enter', 'KeyM', 'NumpadEnter') || tp === 'measure') qcMeasure();
}
function drawFridge(cx, y0, h) { // the dilution refrigerator, the gold "chandelier": plates colder the lower they hang, the chip at the bottom
  const plates = [[34, '4 K'], [28, '1 K'], [22, '100 mK'], [16, ''], [11, '10 mK']], gap = h / (plates.length + 0.6);
  ctx.strokeStyle = '#b8903c'; ctx.lineWidth = 2; for (const dx of [-8, 0, 8]) { ctx.beginPath(); ctx.moveTo(cx + dx, y0); ctx.lineTo(cx + dx * 0.6, y0 + gap * (plates.length - 0.2)); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(200,160,90,.7)'; ctx.lineWidth = 1; for (let i = 0; i < 6; i++) { ctx.beginPath(); const x = cx - 20 + i * 8; ctx.moveTo(x, y0); for (let t = 0; t <= 1; t += 0.05) ctx.lineTo(x + Math.sin(t * 18 + i) * 3 * (1 - t), y0 + t * gap * (plates.length - 0.4)); ctx.stroke(); } // (the coax lines, coiled)
  plates.forEach(([r, lab], i) => {
    const y = y0 + i * gap, g = ctx.createLinearGradient(cx - r, y, cx + r, y); g.addColorStop(0, '#8a6424'); g.addColorStop(0.45, '#f3d27a'); g.addColorStop(1, '#9c742c');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, y, r, 4.5, 0, 0, TAU); ctx.fill();
    if (lab) { ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#9fb3c8'; ctx.fillText(lab, cx + r + 6, y + 3); }
  });
  const yc = y0 + gap * (plates.length - 0.3), pulse = 0.5 + 0.5 * Math.sin(time * 6);
  ctx.fillStyle = `rgba(60,240,255,${0.25 + 0.35 * pulse})`; ctx.beginPath(); ctx.arc(cx, yc + 6, 12, 0, TAU); ctx.fill();
  ctx.fillStyle = '#1d2a36'; ctx.fillRect(cx - 7, yc, 14, 12); ctx.fillStyle = '#3cf0ff'; ctx.fillRect(cx - 4, yc + 3, 8, 6);
}
function drawQC() {
  const Q0 = QC; if (!Q0) return;
  const pw = Math.min(W - 16, 780), ph = Math.min(H - 16, 500), x0 = (W - pw) / 2, y0 = (H - ph) / 2, tch = touchOn(), wide = pw >= 560;
  ctx.fillStyle = 'rgba(4,8,16,.94)'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#0d1624'; ctx.fillRect(x0, y0, pw, ph); ctx.strokeStyle = '#00a9e0'; ctx.lineWidth = 2; ctx.strokeRect(x0, y0, pw, ph);
  txt('FIT BUT · QUANTUM COMPUTER', x0 + pw / 2, y0 + 32, Math.min(22, pw / 26), '#00a9e0', 'center', true);
  txt(`Grover's search · ${Q0.N} PINs, ${Q0.L.n} qubits · round ${Q0.k}`, x0 + pw / 2, y0 + 54, 12, '#cfe8f5', 'center');
  if (wide) drawFridge(x0 + 72, y0 + 92, ph - 220);
  // the amplitudes: up for plus, down for minus; the dashed line is their mean, the diffusion step reflects about it
  const bx0 = wide ? x0 + 160 : x0 + 14, bw = x0 + pw - 14 - bx0, by0 = y0 + 76, bh = ph - 236, mid = by0 + bh * 0.62, sc = bh * 0.58;
  const f = Q0.anim > 0 ? 1 - Q0.anim / 0.4 : 1, amp = Q0.amp.map((a, i) => lerp(Q0.prev[i], a, f * f * (3 - 2 * f)));
  ctx.strokeStyle = 'rgba(160,190,220,.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bx0, mid); ctx.lineTo(bx0 + bw, mid); ctx.stroke();
  const cw = bw / Q0.N;
  amp.forEach((a, i) => {
    const hgt = a * sc, sel = Q0.res && Q0.res.i === i;
    ctx.fillStyle = sel ? (Q0.res.ok ? '#7dff7a' : '#ff6b6b') : a >= 0 ? '#3cf0ff' : '#ff6b9a';
    ctx.fillRect(bx0 + i * cw + cw * 0.15, Math.min(mid, mid - hgt), Math.max(1, cw * 0.7), Math.max(1, Math.abs(hgt)));
    if (Q0.N <= 16) { ctx.font = `${Math.min(11, cw * 0.32)}px ui-monospace, monospace`; ctx.textAlign = 'center'; ctx.fillStyle = '#7f93a8'; ctx.fillText(i.toString(2).padStart(Q0.L.n, '0'), bx0 + (i + 0.5) * cw, by0 + bh + 14); }
  });
  const mean = amp.reduce((t, v) => t + v, 0) / amp.length;
  ctx.setLineDash([5, 4]); ctx.strokeStyle = 'rgba(255,225,77,.8)'; ctx.beginPath(); ctx.moveTo(bx0, mid - mean * sc); ctx.lineTo(bx0 + bw, mid - mean * sc); ctx.stroke(); ctx.setLineDash([]);
  // what it means, or what came out
  const ty = y0 + ph - 132;
  ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#aab8c8';
  const tx = wrapLines(`Each round the oracle flips the sign of the right PIN's amplitude, and the diffusion step reflects every amplitude about their mean (the dashed line), which moves amplitude onto it. After about π/4·√N rounds (here ${Q0.best}) the right PIN is almost certain; go on and it swings back down. Measuring gives one PIN, with the chance its bar's height squared.`, pw - 28, '12px system-ui, sans-serif');
  tx.forEach((l, i) => ctx.fillText(l, x0 + 14, ty + i * 15));
  if (Q0.res) {
    const R = Q0.res, pin = R.i.toString(2).padStart(Q0.L.n, '0');
    txt(R.ok ? `|${pin}⟩: the right PIN! ${R.paid ? `The vault opens: +$${R.pay.toLocaleString('en')}` : 'The vault is already empty today'}` : `|${pin}⟩: wrong PIN (the right one had ${Math.round(R.p * 100)}%). 45 s to cool down again.`, x0 + pw / 2, y0 + ph - 50, 15, R.ok ? '#7dff7a' : '#ff6b6b', 'center');
    txt(tch ? 'tap to leave' : 'any key to leave', x0 + pw / 2, y0 + ph - 24, 12, '#cfe8f5', 'center'); Q0.btn = [];
  } else { // the buttons (keys on the labels)
    const labs = [['round', tch ? 'ROUND' : 'ROUND · Space'], ['measure', tch ? 'MEASURE' : 'MEASURE · Enter'], ['leave', tch ? 'LEAVE' : 'LEAVE · Esc']], bwid = Math.min(190, (pw - 40) / 3);
    Q0.btn = labs.map(([k, l], i) => ({ k, l, x: x0 + pw / 2 + (i - 1.5) * (bwid + 8) + 4, y: y0 + ph - 58, w: bwid, h: 38 }));
    for (const b of Q0.btn) { ctx.fillStyle = b.k === 'measure' ? '#0b5c7a' : '#1b2a3a'; ctx.fillRect(b.x, b.y, b.w, b.h); ctx.strokeStyle = '#00a9e0'; ctx.lineWidth = 1.5; ctx.strokeRect(b.x, b.y, b.w, b.h); txt(b.l, b.x + b.w / 2, b.y + 24, 13, '#fff', 'center'); }
  }
}
const aodPaid = new Set(), aodSolved = new Set(); // (levels paid for and solved, this game or this lab lesson)
function aodOpen(lv) {
  if (NET.role) { msg('The AOD console is single-player for now.', 2.5); return; }
  AOD = {};
  aodLoad(lv !== undefined ? lv : [0, 1, 2].find(i => !aodSolved.has(i)) ?? 3);
  state = 'aod'; touchEl.style.visibility = 'hidden'; note('aod'); sfx.pickup();
}
function aodClose() { AOD = null; state = 'play'; touchEl.style.visibility = ''; }
function aodLoad(i) {
  const L = AOD_LV[i]; let atoms;
  if (L.fill) { do { atoms = []; for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) if (Math.random() < L.fill) atoms.push([x, y]); } while (atoms.length < L.need); }
  else atoms = L.atoms;
  Object.assign(AOD, { lv: i, L, atoms: atoms.map(([x, y]) => ({ x, y })), cols: new Map(), rows: new Map(), cur: [0, 0], moves: 0, us: 0, lost: 0, anim: null, done: false, note: '', noteT: 0, pulse: 0, drag: null, puffs: [] });
}
const aodAt = (x, y) => AOD.atoms.find(a => a.x === x && a.y === y);
function aodSay(t) { AOD.note = t; AOD.noteT = 3; }
// set a tone's offset if that keeps the tones in order, apart, and on the board
function aodShift(kind, i, off) {
  const M = kind === 'col' ? AOD.cols : AOD.rows, n = kind === 'col' ? AOD.L.w : AOD.L.h, pos = i + off;
  if (pos < 0 || pos >= n) return false;
  for (const [j, o] of M) if (j !== i && (j < i ? j + o >= pos : j + o <= pos)) { aodSay(`${kind === 'col' ? 'Columns' : 'Rows'} can't cross or merge: a tone keeps its place in the order.`); return false; }
  M.set(i, off); return true;
}
function aodToggle(kind, i) {
  const M = kind === 'col' ? AOD.cols : AOD.rows;
  if (M.has(i)) { M.delete(i); return; }
  M.set(i, 0); if (!aodShift(kind, i, 0)) M.delete(i);
}
// what a move would do: the atoms picked up, and where each one lands
function aodPlan() {
  const out = [];
  for (const [c, oc] of AOD.cols) for (const [r, or] of AOD.rows) { const a = aodAt(c, r); if (a) out.push({ a, tx: c + oc, ty: r + or }); }
  return out;
}
function aodGo() {
  if (AOD.anim || AOD.done) return;
  if (!AOD.cols.size || !AOD.rows.size) { aodSay('Switch on at least one row and one column: tweezers sit where they cross.'); return; }
  if ([...AOD.cols.values(), ...AOD.rows.values()].every(o => !o)) { aodSay('Drag a tone first: nothing would move.'); return; }
  const plan = aodPlan(), dmax = Math.max(0, ...plan.map(p => Math.hypot(p.tx - p.a.x, p.ty - p.a.y)));
  AOD.anim = { t: 0, plan }; AOD.moves++;
  AOD.us += 100 + 2 * Math.sqrt(dmax * 5 / 0.002); // (a site is 5 µm; ~2000 m/s² of acceleration, plus picking up and putting down)
  sfx.cast();
}
function aodFinish() {
  const { plan } = AOD.anim, moving = new Set(plan.map(p => p.a)), L = AOD.L;
  AOD.anim = null; AOD.cols.clear(); AOD.rows.clear();
  for (const p of plan) {
    if (L.loss && (Math.random() < L.loss || Math.random() < L.loss)) { AOD.atoms.splice(AOD.atoms.indexOf(p.a), 1); AOD.lost++; AOD.puffs.push({ x: p.a.x, y: p.a.y, t: 1, c: '#9aa4b8' }); aodSay('An atom was lost in the transfer.'); continue; }
    const hitA = AOD.atoms.find(b => !moving.has(b) && b.x === p.tx && b.y === p.ty);
    if (hitA) { // two atoms in one trap: a light-assisted collision throws both out
      AOD.atoms.splice(AOD.atoms.indexOf(hitA), 1); AOD.atoms.splice(AOD.atoms.indexOf(p.a), 1); AOD.lost += 2;
      AOD.puffs.push({ x: p.tx, y: p.ty, t: 1, c: '#ff5a5a' }); aodSay('Two atoms in one trap: they collided and both were lost.'); sfx.snap(); continue;
    }
    p.a.x = p.tx; p.a.y = p.ty;
  }
  if (!L.gates && aodFilled()) aodWin();
  else if (L.gates && aodFilled() && aodZoneClean()) aodSay('Ready: fire the PULSE (P).');
  else if (AOD.atoms.length < (L.target || []).length) aodSay('Not enough atoms left to finish. Start again (N).');
}
const aodFilled = () => AOD.L.target.every(([x, y]) => aodAt(x, y));
const aodZoneClean = () => { const L = AOD.L, g = new Set(L.gates.flat()); return AOD.atoms.every(a => a.y !== L.zone || g.has(a.x)); };
function aodPulse() {
  const L = AOD.L; if (!L.gates || AOD.anim || AOD.done) return;
  AOD.pulse = 0.8; sfx.quantum();
  if (aodFilled() && aodZoneClean()) aodWin();
  else aodSay(!aodZoneClean() ? 'Crosstalk: an atom between the gate pairs spoiled the gates.' : 'Some gate sites were empty: those atoms got no partner.');
}
function aodWin() {
  AOD.done = true; sfx.good(); ach('atoms');
  const L = AOD.L; aodSolved.add(AOD.lv);
  let pay = 0;
  if (!lab && (L.fill || !aodPaid.has(AOD.lv))) { aodPaid.add(AOD.lv); pay = L.pay; earn(pay); }
  aodSay(`Done in ${AOD.moves} move${AOD.moves === 1 ? '' : 's'}${L.par ? ` (par ${L.par})` : ''}, ≈ ${(AOD.us / 1000).toFixed(2)} ms${pay ? ` · the lab pays ${fmt(pay)}` : ''}.`);
  AOD.noteT = 1e9;
}
function updateAOD(dt) {
  const A = AOD; if (!A) return;
  if (A.noteT > 0) A.noteT -= dt;
  if (A.pulse > 0) A.pulse -= dt;
  for (const p of A.puffs) p.t -= dt; A.puffs = A.puffs.filter(p => p.t > 0);
  if (A.anim) { A.anim.t += dt / 1.1; if (A.anim.t >= 1) aodFinish(); }
  if (hit('Escape', 'KeyQ')) { aodClose(); return; }
  if (hit('KeyN')) { aodLoad(A.done || A.L.fill ? Math.min(A.lv + (A.done && !A.L.fill ? 1 : 0), AOD_LV.length - 1) : A.lv); return; }
  if (A.done || A.anim) return;
  const L = A.L, c = A.cur;
  if (hit('ArrowLeft')) c[0] = Math.max(0, c[0] - 1); if (hit('ArrowRight')) c[0] = Math.min(L.w - 1, c[0] + 1);
  if (hit('ArrowUp')) c[1] = Math.max(0, c[1] - 1); if (hit('ArrowDown')) c[1] = Math.min(L.h - 1, c[1] + 1);
  if (hit('KeyC')) aodToggle('col', c[0]);
  if (hit('KeyR')) aodToggle('row', c[1]);
  if (hit('KeyA', 'KeyD') && A.cols.has(c[0])) aodShift('col', c[0], A.cols.get(c[0]) + (hit('KeyA') ? -1 : 1));
  if (hit('KeyW', 'KeyS') && A.rows.has(c[1])) aodShift('row', c[1], A.rows.get(c[1]) + (hit('KeyW') ? -1 : 1));
  if (hit('Backspace', 'KeyZ')) { A.cols.clear(); A.rows.clear(); }
  if (hit('Space', 'Enter', 'NumpadEnter', 'KeyG')) aodGo();
  if (hit('KeyP')) aodPulse();
}
// the layout: the board in the middle, column tones above it, row tones to its left, buttons along the bottom
function aodLayout() {
  const L = AOD.L, px = 12, py = 12, pw = W - 24, ph = H - 24;
  const hint = wrapLines(L.hint, pw - 40, '12px system-ui, sans-serif').slice(0, 4), top = py + 54 + hint.length * 15 + 8, bottom = py + ph - 88;
  const s = Math.floor(clamp(Math.min((pw - 80) / (L.w + 0.8), (bottom - top) / (L.h + 0.8)), 18, 64)), hs = Math.max(20, Math.round(s * 0.7));
  const bw = L.w * s, bh = L.h * s, bx = Math.round(px + (pw - bw + hs) / 2), by = Math.round(top + hs + Math.max(0, (bottom - top - hs - bh) / 2));
  const names = ['GO', 'CLEAR', ...(L.gates ? ['PULSE'] : []), AOD.done ? (L.fill || AOD.lv === AOD_LV.length - 1 ? 'NEW' : 'NEXT') : L.fill ? 'NEW' : 'RESET', 'EXIT'];
  const bwid = Math.min(110, (pw - 40) / names.length - 8), btns = names.map((n, i) => ({ n, x: px + (pw - names.length * (bwid + 8)) / 2 + i * (bwid + 8), y: py + ph - 46, w: bwid, h: 34 }));
  return { px, py, pw, ph, hint, s, hs, bx, by, bw, bh, btns };
}
function aodButton(n) {
  if (n === 'GO') aodGo(); else if (n === 'CLEAR') { AOD.cols.clear(); AOD.rows.clear(); } else if (n === 'PULSE') aodPulse(); else if (n === 'EXIT') aodClose();
  else if (n === 'NEXT') aodLoad(Math.min(AOD.lv + 1, AOD_LV.length - 1)); else aodLoad(AOD.lv);
}
function aodPointer(kind, x, y) {
  const A = AOD; if (!A) return;
  const G = A.lay; if (!G) return;
  if (kind === 'down') {
    for (const b of G.btns) if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) { aodButton(b.n); return; }
    if (A.done || A.anim) return;
    const ci = Math.floor((x - G.bx) / G.s), ri = Math.floor((y - G.by) / G.s);
    if (y > G.by - G.hs && y < G.by && ci >= 0 && ci < A.L.w) A.drag = { kind: 'col', i: ci, x0: x, y0: y, off0: A.cols.has(ci) ? A.cols.get(ci) : null, moved: false };
    else if (x > G.bx - G.hs && x < G.bx && ri >= 0 && ri < A.L.h) A.drag = { kind: 'row', i: ri, x0: x, y0: y, off0: A.rows.has(ri) ? A.rows.get(ri) : null, moved: false };
    else if (ci >= 0 && ci < A.L.w && ri >= 0 && ri < A.L.h) A.cur = [ci, ri];
  } else if (kind === 'move' && A.drag) {
    const d = A.drag, delta = Math.round(((d.kind === 'col' ? x - d.x0 : y - d.y0)) / G.s);
    if (Math.abs(d.kind === 'col' ? x - d.x0 : y - d.y0) > 6 && !d.moved) { d.moved = true; if (d.off0 === null) { aodToggle(d.kind, d.i); d.off0 = 0; if (!(d.kind === 'col' ? A.cols : A.rows).has(d.i)) { A.drag = null; return; } } }
    if (d.moved) { const M = d.kind === 'col' ? A.cols : A.rows, want = d.off0 + delta; if (M.has(d.i) && M.get(d.i) !== want) aodShift(d.kind, d.i, want); }
  } else if (kind === 'up' && A.drag) {
    const d = A.drag; A.drag = null;
    if (!d.moved) { aodToggle(d.kind, d.i); if (d.kind === 'col') A.cur[0] = d.i; else A.cur[1] = d.i; }
  }
}
function drawAOD() {
  const A = AOD; if (!A) return;
  const G = A.lay = aodLayout(), L = A.L, { s, hs, bx, by } = G, tch = touchOn();
  ctx.fillStyle = 'rgba(6,8,18,.97)'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#b388ff'; ctx.lineWidth = 2; ctx.strokeRect(G.px, G.py, G.pw, G.ph);
  txt(`AOD PLANNER · ${A.lv + 1}/${AOD_LV.length} · ${L.name}`, G.px + 16, G.py + 30, 18, '#b388ff', 'left', true);
  txt(`moves ${A.moves}${L.par ? ` (par ${L.par})` : ''} · ≈ ${(A.us / 1000).toFixed(2)} ms · lost ${A.lost}`, G.px + G.pw - 16, G.py + 28, 12, '#cfd8e8', 'right');
  ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#aab4c8';
  G.hint.forEach((l, i) => ctx.fillText(l, G.px + 20, G.py + 54 + i * 15));
  // the entangling zone and the gate sites
  if (L.gates) {
    ctx.fillStyle = 'rgba(120,70,220,.25)'; ctx.fillRect(bx, by + L.zone * s, L.w * s, s);
    ctx.strokeStyle = 'rgba(200,170,255,.8)'; ctx.lineWidth = 2;
    for (const [a, b] of L.gates) { ctx.beginPath(); ctx.moveTo(bx + (a + 0.2) * s, by + (L.zone + 0.92) * s); ctx.lineTo(bx + (a + 0.2) * s, by + (L.zone + 0.98) * s); ctx.lineTo(bx + (b + 0.8) * s, by + (L.zone + 0.98) * s); ctx.lineTo(bx + (b + 0.8) * s, by + (L.zone + 0.92) * s); ctx.stroke(); }
    txt('entangling zone', bx + L.w * s + 8, by + (L.zone + 0.6) * s, 11, '#c9b3ff');
  }
  const tg = new Set((L.target || []).map(([x, y]) => x + ',' + y));
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
    const cx = bx + (x + 0.5) * s, cy = by + (y + 0.5) * s;
    if (tg.has(x + ',' + y)) { ctx.fillStyle = 'rgba(70,200,120,.16)'; ctx.fillRect(bx + x * s + 2, by + y * s + 2, s - 4, s - 4); ctx.strokeStyle = 'rgba(95,220,138,.6)'; ctx.lineWidth = 1; ctx.strokeRect(bx + x * s + 2.5, by + y * s + 2.5, s - 5, s - 5); }
    ctx.strokeStyle = '#3d4a68'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, cy, s * 0.2, 0, TAU); ctx.stroke(); // (a static trap)
  }
  // the tones: a red beam down each chosen column and along each chosen row, at where it will be after the move
  const an = A.anim, mj = an ? minJerk(clamp((an.t - 0.2) / 0.6, 0, 1)) : 1;
  ctx.lineWidth = 2;
  for (const [c, o] of A.cols) { const xx = bx + (c + (an ? o * mj : o) + 0.5) * s; ctx.strokeStyle = 'rgba(255,80,90,.5)'; ctx.beginPath(); ctx.moveTo(xx, by - hs); ctx.lineTo(xx, by + L.h * s); ctx.stroke(); }
  for (const [r, o] of A.rows) { const yy = by + (r + (an ? o * mj : o) + 0.5) * s; ctx.strokeStyle = 'rgba(255,80,90,.5)'; ctx.beginPath(); ctx.moveTo(bx - hs, yy); ctx.lineTo(bx + L.w * s, yy); ctx.stroke(); }
  // headers
  for (let x = 0; x < L.w; x++) {
    const on = A.cols.has(x), o = on ? A.cols.get(x) : 0;
    ctx.fillStyle = on ? 'rgba(255,80,90,.35)' : 'rgba(255,255,255,.07)'; ctx.fillRect(bx + x * s + 1, by - hs, s - 2, hs - 3);
    txt(on && o ? `${o > 0 ? '+' : ''}${o}` : String(x), bx + (x + 0.5) * s, by - hs / 2 + 2, 11, on ? '#fff' : '#8090a8', 'center');
  }
  for (let y = 0; y < L.h; y++) {
    const on = A.rows.has(y), o = on ? A.rows.get(y) : 0;
    ctx.fillStyle = on ? 'rgba(255,80,90,.35)' : 'rgba(255,255,255,.07)'; ctx.fillRect(bx - hs, by + y * s + 1, hs - 3, s - 2);
    txt(on && o ? `${o > 0 ? '+' : ''}${o}` : String(y), bx - hs / 2 - 1, by + (y + 0.5) * s + 4, 11, on ? '#fff' : '#8090a8', 'center');
  }
  // the atoms: where they are, or on their way (lifted half a site off the grid so they pass between the static traps)
  const plan = an ? an.plan : aodPlan(), pick = new Map(plan.map(p => [p.a, p]));
  for (const a of A.atoms) {
    let x = a.x, y = a.y; const p = pick.get(a);
    if (an && p) { const lift = Math.min(1, an.t / 0.2, (1 - an.t) / 0.2) * 0.5; x += (p.tx - a.x) * mj + lift; y += (p.ty - a.y) * mj + lift; }
    const cx = bx + (x + 0.5) * s, cy = by + (y + 0.5) * s;
    ctx.fillStyle = 'rgba(255,170,70,.25)'; ctx.beginPath(); ctx.arc(cx, cy, s * 0.34, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(cx, cy, s * 0.2, 0, TAU); ctx.fill();
    if (p) { ctx.strokeStyle = '#ff5060'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, s * 0.3, 0, TAU); ctx.stroke(); }
  }
  if (!an) for (const p of plan) { // where the picked atoms will land (red: onto an atom that isn't moving)
    if (p.tx === p.a.x && p.ty === p.a.y) continue;
    const x0 = bx + (p.a.x + 0.5) * s, y0 = by + (p.a.y + 0.5) * s, x1 = bx + (p.tx + 0.5) * s, y1 = by + (p.ty + 0.5) * s;
    const clash = A.atoms.some(b => !pick.has(b) && b.x === p.tx && b.y === p.ty);
    ctx.strokeStyle = clash ? 'rgba(255,90,90,.9)' : 'rgba(255,200,140,.7)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(x1, y1, s * 0.2, 0, TAU); ctx.stroke();
  }
  for (const p of A.puffs) { ctx.globalAlpha = p.t; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(bx + (p.x + 0.5) * s, by + (p.y + 0.5) * s, s * (0.5 - 0.25 * p.t), 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
  if (A.pulse > 0 && L.gates) { // the global Rydberg pulse, and the CZ gates it gave
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(150,90,255,${0.4 * A.pulse})`; ctx.fillRect(bx, by + L.zone * s, L.w * s, s);
    ctx.strokeStyle = `rgba(230,200,255,${A.pulse})`; ctx.lineWidth = 3;
    for (const [a, b] of L.gates) if (aodAt(a, L.zone) && aodAt(b, L.zone)) { ctx.beginPath(); ctx.moveTo(bx + (a + 0.5) * s, by + (L.zone + 0.5) * s); ctx.quadraticCurveTo(bx + (a + b + 1) / 2 * s, by + (L.zone + 0.1) * s, bx + (b + 0.5) * s, by + (L.zone + 0.5) * s); ctx.stroke(); }
    ctx.globalCompositeOperation = 'source-over';
  }
  if (!tch && !A.done) { ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 1.5; ctx.strokeRect(bx + A.cur[0] * s + 1, by + A.cur[1] * s + 1, s - 2, s - 2); }
  // status and buttons
  const sy = G.py + G.ph - 64;
  if (A.noteT > 0) txt(A.note, W / 2, sy, 13, A.done ? '#7dff8a' : '#ffd27a', 'center');
  else {
    ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#8090a8';
    ctx.fillText(tch ? 'Tap a header to switch a tone on or off; drag it to move it.' : W > 900 ? 'Arrows: cursor · C / R: column / row tone on or off · A D / W S: move the tone · Space: GO · Z: clear · N: reset · Esc: leave'
      : 'C / R: tones on/off · A D / W S: move · Space: GO · Esc: leave', W / 2, sy);
  }
  for (const b of G.btns) {
    const hot = (b.n === 'GO' && A.cols.size && A.rows.size) || (b.n === 'PULSE' && aodFilled()) || ((b.n === 'NEXT' || b.n === 'NEW') && A.done);
    ctx.fillStyle = hot ? 'rgba(179,136,255,.35)' : 'rgba(255,255,255,.08)'; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = hot ? '#b388ff' : '#56607a'; ctx.lineWidth = 1.5; ctx.strokeRect(b.x, b.y, b.w, b.h);
    txt(b.n, b.x + b.w / 2, b.y + 22, 13, '#fff', 'center');
  }
}
const HELP = [
  ['Arrows / WASD', 'drive · walk (up = forward, left/right = turn)'],
  ['Space', 'shoot on foot · handbrake in a car'],
  ['Enter / F / E', 'get in or out of cars (occupied ones too) · a tram, at its front · a boat, from the bank · fish at a jetty'],
  ['Q / Tab', 'switch weapon'],
  ['X', 'superposition: split your car into 3 branches'],
  ['V', 'slow motion + amplitude arrows (while superposed)'],
  ['T', 'entangle with a car nearby · T again: swap places with it'],
  ['G', 'optical tweezer: pick up the empty car behind yours · G again drops it'],
  ['Wanted', '★ tail you · ★★★ roadblocks · ★★★★ SWAT + helicopter · ★★★★★ tank'],
  ['Wanted 6–10', 'the Bureau · the army · the Observer · demolition · air assault'],
  ['R · M', 'radio station · minimap, then the whole map'],
  ['P / Esc · H', 'pause (then Q quits to the title) · help (H again: quantum notes, then achievements)'],
  ['Title screen', '← → start location · ↑ ↓ map (the island, inner Brno) · L Physics Lab · O online co-op · H achievements'],
];
// ============================================================ achievements
// Hidden until you earn one: the help's last page (H) shows a tile for each, from the easiest to the hardest, blank for
// those you haven't (but the next one's name, as a hint), and what the ones you have are, newest first; what to do for
// one you haven't found can be bought there with the game's cash. Kept in this browser alone (localStorage qta.ach). None in a game where the debug console changed anything (a
// new game clears that, unless god mode is still on), none on the title screen; in online co-op a friend's go to their
// own browser.
const ACH = {
  // the state comes after you, and you get away
  wl6: ['Measured', 'Reached six stars: the Measurement Bureau came for you.'],
  wl7: ['State of Emergency', 'Reached seven stars: the army came out.'],
  wl8: ['The Observer', 'Reached eight stars.'],
  wl9: ['Condemned', 'Reached nine stars: they began knocking the city down round you.'],
  wl10: ['Air Assault', 'Reached ten stars.'],
  lowkey: ['Lying Low', 'Sat out a state of emergency unseen.'],
  ashore: ['Across the Water', 'Came ashore unseen across the water at seven stars.'],
  teleport: ['Wrong Qubit', 'Teleported out of the Observer\'s reach between the entangled payphones.'],
  crowd: ['Lost in the Crowd', 'Hid in a pedestrian zone until the demolition was called off.'],
  ground: ['Gone to Ground', 'Called off an air assault by going underground.'],
  qtunnel: ['Through the Wall', 'Tunnelled through a wall and out of their sight.'],
  drone: ['Drone Down', 'Shot down the Bureau\'s drone.'],
  carrier: ['Carrier Down', 'Brought down a P.L.A.N.C.K. Helicarrier.'],
  squad: ['The Constants', 'Beat all four of P.L.A.N.C.K.\'s heroes.'],
  drops: ['Power-Up', 'Took 25 power-ups in one game.'],
  tunnel: ['Quantum Leak', 'Went through a wall by quantum tunnelling.'],
  quantumpc: ['Quantum Advantage', 'Found the PIN with Grover\'s search on FIT BUT\'s quantum computer.', 'b'],
  qclock: ['Atomic Time', 'Read the quantum clock at the Institute of Scientific Instruments.', 'b'],
  sealion: ['Ar! Ar!', 'Met the sea lion of Starý Lískovec.', 'b'],
  panda: ['Pandamonium', 'Found the panda between the Tesco and the Kaufland.', 'b'],
  jackal: ['Golden Jackal', 'Got close to the jackal of Bystrc.', 'b'],
  jost: ['Under the Horse', 'Walked under Jošt\'s horse on Moravské náměstí.', 'b'],
  justice: ['Wet Justice', 'Got sprayed by Justice outside the Supreme Administrative Court.', 'b'],
  // quantum
  superpose: ['Both Ways at Once', 'Put your car into a superposition.'],
  swap: ['Spooky Action', 'Measured an entangled pair and swapped places with your twin.'],
  notes: ['Well Read', 'Met every quantum note.'],
  schrodinger: ['Schrödinger\'s Catch', 'Landed a fish that was two fish at once.'],
  atoms: ['Atom Shuffler', 'Solved an array at the atom lab\'s console.'],
  lab: ['Lab Graduate', 'Finished every lesson in the Physics Lab.'],
  // wheels
  copcar: ['Bold', 'Jacked a police car.'],
  tank: ['Heavy Metal', 'Drove a tank.'],
  army: ['Borrowed from the Army', 'Drove off in a vehicle from the University of Defence.', 'b'],
  tram: ['Next Stop: Anywhere', 'Hijacked a tram.', '5'],
  train: ['Off the Timetable', 'Hijacked a train.', '5'],
  sail: ['Into the Wind', 'Took a sailing dinghy out.'],
  formula: ['Formula Student', 'Took FSI\'s Formula Student car.', 'b'],
  // Brno
  marble: ['Lost Your Marbles', 'Caught the glass marble from the orloj at eleven.', 'b'],
  lucky: ['Lucky Marble', 'Slipped an arrest thanks to the orloj\'s marble.', 'b'],
  bells: ['Noon at Eleven', 'Petrov\'s bells eased the siege, as they did for the Swedes.', 'b'],
  dragon: ['Dragon Slayer', 'Fed the Brno dragon a calfskin full of lime.', 'b'],
  birk: ['Birk\'s Wager', 'Rolled the wheel from the Lednice road to the Old Town Hall in a day.', 'b'],
  cellars: ['Underground Brno', 'Went through the cellars under the old town.', 'b'],
  spilberk: ['Prisoner of Nations', 'Did your time in Špilberk.', 'b'],
  jakub: ['The Little Man', 'Found the little stone man on St James\'s.', 'b'],
  station: ['Opening Soon', 'Saw where the new main station is to stand.', 'b'],
  kometa: ['Kometa!', 'Heard Hala Rondo roar on a match night.', 'b'],
  monk: ['Vow of Silence', 'Were seen by a monk, who kept the vow.', 'b'],
  cow: ['Monte Bú', 'Bumped into a cow on Kraví hora.', 'b'],
  bren: ['BRno ENfield', 'Picked up the Bren gun at Zbrojovka.', 'b'],
  duck: ['Rubber Duck Debugging', 'Found the duck from U Kachničky.', 'b'],
  deadline: ['23:59', 'Got a student to Božetěchova before the deadline.', 'b'],
  hantec: ['Hantec', 'Got the city speaking Hantec.'],
  // and the rest
  wasted: ['Wasted', 'Died for the first time.'],
  busted: ['Busted', 'Arrested for the first time.'],
  job: ['Odd Jobs', 'Finished a job from a ringing payphone.'],
  mult9: ['On a Roll', 'Took your multiplier to x9.'],
  arc: ['Story Arc', 'Finished a district\'s arc of jobs.'],
  conquer: ['City Conquered', 'Reached the goal.'],
  coop: ['Better Together', 'Played online co-op with a friend.'],
  tourist: ['Tourist', 'Played on both maps.'],
  day: ['Another Day', 'Saw the clock round to a new day.'],
};
// from the easiest to the hardest: the order of the tiles, and the next to find is the first you haven't (that can be had
// on this map: the third field, b or 5 Brno)
const ACH_ORDER = ['superpose', 'wasted', 'copcar', 'busted', 'swap', 'job', 'drops', 'tunnel', 'day', 'tourist', 'spilberk', 'station', 'jakub', 'jost', 'qclock', 'tram', 'army', 'tank', 'sail', 'cellars', 'formula', 'bren', 'lab', 'atoms', 'quantumpc', 'schrodinger', 'wl6', 'kometa', 'cow', 'panda', 'sealion', 'jackal', 'justice', 'marble', 'bells', 'duck', 'hantec', 'coop', 'drone', 'wl7', 'qtunnel', 'train', 'arc', 'lucky', 'deadline', 'lowkey', 'ashore', 'wl8', 'teleport', 'mult9', 'monk', 'wl9', 'crowd', 'dragon', 'birk', 'conquer', 'wl10', 'notes', 'ground', 'carrier', 'squad'];
const achHere = k => { const w = ACH[k][2]; return !w || (w === 'b' && BRNO) || (w === '5' && B5); };
const ACH_GOT = (() => { try { const o = JSON.parse(localStorage.getItem('qta.ach') || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } })();
const achToasts = [];
function ach(id) {
  if (!ACH[id] || ACH_GOT[id] || DBG.used) return;
  if (player.isGuest) { NET.ev.push(['ach', id]); return; } // (the friend's: it goes to their browser)
  if (state === 'play' || state === 'aod' || state === 'qc') achGrant(id);
}
function achGrant(id) {
  if (!ACH[id] || ACH_GOT[id]) return;
  ACH_GOT[id] = Date.now();
  try { localStorage.setItem('qta.ach', JSON.stringify(ACH_GOT)); } catch (e) { /* storage unavailable: it lasts this visit */ }
  achToasts.push({ id }); sfx.ach();
}
// (the tourist: which maps you have played on)
function achMap() {
  let m = [];
  try { m = JSON.parse(localStorage.getItem('qta.maps') || '[]'); if (!Array.isArray(m)) m = []; if (!m.includes(MAP_ID)) { m.push(MAP_ID); localStorage.setItem('qta.maps', JSON.stringify(m)); } } catch (e) { /* storage unavailable */ }
  if (['island', 'brno5'].every(k => m.includes(k))) ach('tourist');
}
// the card for a new one: under the minimap (out of the way of the middle of the screen, where you are), one at a time
function drawAchToast() {
  const a = achToasts[0]; if (!a) return;
  const now2 = performance.now() / 1000; if (a.t0 === undefined) a.t0 = now2; // (in real time: it shows while paused too)
  const t = now2 - a.t0; if (t > 5.5) { achToasts.shift(); return; }
  const [name, desc] = ACH[a.id], w = Math.min(330, W - 24), h = 50, x = 12 - Math.max(0, 0.3 - t) / 0.3 * (w + 20) - Math.max(0, t - 5.2) / 0.3 * (w + 20);
  const y = showMap === 1 ? 12 + MMV * (W < 600 ? 1.1 : 1.6) + 46 : 12;
  ctx.fillStyle = 'rgba(14,12,6,.92)'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = '#ffd54a'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = '#ffd54a'; ctx.beginPath(); ctx.arc(x + 25, y + 25, 15, 0, TAU); ctx.fill();
  ctx.fillStyle = '#5a4300'; ctx.font = 'bold 17px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('★', x + 25, y + 31);
  ctx.textAlign = 'left'; ctx.fillStyle = '#ffd54a'; ctx.font = 'bold 10px system-ui, sans-serif'; ctx.fillText('ACHIEVEMENT', x + 48, y + 15);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 14px system-ui, sans-serif'; ctx.fillText(name, x + 48, y + 31);
  ctx.fillStyle = '#bbb'; ctx.font = '11px system-ui, sans-serif'; const l = wrapLines(desc, w - 58, '11px system-ui, sans-serif'); ctx.fillText(l[0] + (l.length > 1 ? ' …' : ''), x + 48, y + 44);
}
// what to do for each, in detail: what buying one on the achievements page shows
const ACH_HOW = {
  superpose: 'In a car, press X: it splits into three branches for a few seconds.',
  wasted: 'Lose all your health.',
  copcar: 'Pull a police officer out of their cruiser (Enter by the driver\'s door) and drive off in it.',
  busted: 'Let the police catch you while you are wanted.',
  swap: 'Press T by a car to entangle with it, then T again to measure the pair and swap places with it.',
  job: 'Answer a ringing payphone (the arrow at the top points to it) and finish the job it gives you.',
  day: 'Keep playing until the clock passes midnight (a game day lasts 24 minutes).',
  tourist: 'Start a game on the island and on inner Brno (↑ ↓ on the title screen switches the map).',
  spilberk: 'Get busted in Brno: they let you out of the castle.',
  station: 'Go past the site of the new main station, south of the present one, toward the Svratka.',
  jakub: 'Go past St James\'s church tower on Jakubské náměstí in the old town.',
  tram: 'On inner Brno in detail, stop by the front of a tram and press Enter.',
  army: 'Take one of the vehicles in the University of Defence\'s yard on Kounicova.',
  tank: 'Get in a tank: one comes for you at five stars, and the army keeps one on Kounicova in Brno.',
  sail: 'Take a sailing dinghy from the bank (Enter by it): on the island\'s water, or on the Brno reservoir.',
  cellars: 'On foot, find the hatch on Zelný trh, Kapucínské, Jakubské or Dominikánské náměstí and press Enter by it.',
  formula: 'The Formula Student car stands by FSI\'s main entrance on Technická: get in.',
  bren: 'The Bren gun lies in the old Zbrojovka works, east of the centre: pick it up.',
  lab: 'Choose the Physics Lab on the title screen (L) and finish every lesson.',
  atoms: 'At the Atom Array Lab\'s console (Enter by it), fill an array\'s target sites with atoms.',
  schrodinger: 'Fish from a jetty: now and then a bite is two fish at once, each with its chance. Land one of those.',
  wl6: 'At five stars, stay in the police\'s sight until a sixth comes.',
  kometa: 'On a Tuesday, Friday or Sunday, be near Hala Rondo between 17:30 and 20:00 when the crowd roars.',
  cow: 'Drive into one of the cows that graze round the observatory on Kraví hora.',
  marble: 'Be at the orloj on Náměstí Svobody at 11:00 and catch the marble it lets out, on foot.',
  bells: 'Be wanted (one to five stars) within earshot of Petrov when its bells ring noon at 11:00.',
  duck: 'The duck sits outside the U Kachničky club by FIT on Božetěchova: pick it up.',
  hantec: 'While you play, type the word hantec.',
  coop: 'Play online co-op: O on the title screen, then give the code to a friend.',
  drone: 'At six stars the Bureau sends a drone after you: shoot it down.',
  wl7: 'At six stars, stay in their sight until the seventh comes.',
  qtunnel: 'At seven stars, on foot and facing a wall, press T (it takes an ε charge) to tunnel through it.',
  train: 'On inner Brno in detail, stop by the front of a train standing at a station and press Enter.',
  arc: 'Finish three jobs in one district.',
  lucky: 'Catch the orloj\'s marble at 11:00, then get busted: it gets you off once.',
  deadline: 'From 22:45 a student waits by the Pod Palackého vrchem dorms: drive them to FIT on Božetěchova before 23:59.',
  lowkey: 'At seven stars, stay out of their sight for a whole minute.',
  ashore: 'At seven stars, cross the water in a boat and land unseen.',
  wl8: 'At seven stars, stay in their sight until the eighth comes.',
  teleport: 'At eight stars, press Enter at one of the cyan entangled payphones: it teleports you to its twin.',
  mult9: 'Finish eight jobs one after another without dying or getting busted: the multiplier reaches x9.',
  monk: 'At night, commit a crime in FIT\'s old monastery courtyard with only a monk to see it.',
  wl9: 'At eight stars, stay in their sight until the ninth comes.',
  crowd: 'At nine stars, hide in a pedestrian zone for 45 seconds.',
  dragon: 'Between midnight and 4:00 the dragon prowls the old town. Take the calfskin of lime from the market on Zelný trh and let the dragon snatch it from you.',
  birk: 'From 5:00 a wheel waits on the road in from Lednice: get in and roll it to the Old Town Hall before 20:00.',
  conquer: `Make ${fmt(GOAL)}.`,
  wl10: 'At nine stars, stay in their sight until the tenth comes.',
  notes: 'Meet every quantum note: try every quantum trick, from superposition to teleportation, and go fishing.',
  ground: 'At ten stars, drive through two different tunnels from end to end, unseen going in and coming out (on the island, with no tunnels: stay unseen 75 s).',
  carrier: 'At ten stars a P.L.A.N.C.K. Helicarrier comes: bring it down with twelve rockets.',
  drops: 'Power-ups (ψ, ε and ♥) keep turning up around you: take 25 of them in one game.',
  tunnel: 'Hit walls, in a car or on foot: now and then you tunnel through one. The chance (in the corner, by ψ and ε) grows the longer it has been since you last did.',
  quantumpc: 'In Brno, walk up to FIT BUT\'s door (the QPU sign) and run Grover\'s search on its quantum computer: measure after the right number of rounds, and you find the PIN.',
  qclock: 'In Brno, find the quantum clock by the gate of the Institute of Scientific Instruments (ÚPT AV ČR) on Královopolská.',
  sealion: 'In Brno, a sea lion has got loose in Starý Lískovec. Go and find it.',
  panda: 'In Brno, a panda wanders the streets between the Tesco on Cimburkova and the Kaufland on Sportovní, in Ponava.',
  jackal: 'In Brno, a golden jackal roams Bystrc. It runs from you: get close (a car helps).',
  jost: 'On Moravské náměstí, walk on foot right under the horse of Margrave Jošt.',
  justice: 'On Moravské náměstí, stand by the statue of Justice outside the Supreme Administrative Court until its jet sprays you.',
  squad: 'At ten stars the Helicarrier sends down four heroes, one after another: the Collapser, Agent Spooky, Big Bang and the Tunneler. Beat all four (rockets help, and so does running them over, except Big Bang).',
};
// what to do for one you haven't found yet, bought with the game's cash (dearer the harder it is), kept like them
const ACH_REV = (() => { try { const o = JSON.parse(localStorage.getItem('qta.achRev') || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } })();
const achPrice = k => 500 + 200 * ACH_ORDER.indexOf(k);
const achNext = () => ACH_ORDER.find(k => !ACH_GOT[k] && achHere(k)) || ACH_ORDER.find(k => !ACH_GOT[k]);
let achSel = -1, achUI = null, achDeny = 0; // (the tile picked on the page: -1 the next to find; where things are, to tap)
function achBuy(k) {
  if (!k || ACH_GOT[k] || ACH_REV[k] || state === 'title') return;
  if (NET.role === 'guest') { msg('In co-op only the host can buy what an achievement is.', 3); return; }
  const c = achPrice(k);
  if (player.cash < c) { achDeny = performance.now(); msg(`Not enough cash: that costs ${fmt(c)}.`, 2.5); return; }
  player.cash -= c; ACH_REV[k] = Date.now(); sfx.good();
  try { localStorage.setItem('qta.achRev', JSON.stringify(ACH_REV)); } catch (e) { /* storage unavailable: it lasts this visit */ }
}
// the page's own keys and taps (the game waits while it is open): arrows pick a tile, Enter buys; true if a tap was used
function achPageInput() {
  const n = ACH_ORDER.length, per = achUI ? achUI.per : 17;
  let i = achSel >= 0 ? achSel : ACH_ORDER.indexOf(achNext());
  if (i < 0) i = 0;
  if (hit('ArrowLeft', 'KeyA')) achSel = Math.max(0, i - 1); else if (hit('ArrowRight', 'KeyD')) achSel = Math.min(n - 1, i + 1);
  else if (hit('ArrowUp', 'KeyW')) achSel = Math.max(0, i - per); else if (hit('ArrowDown', 'KeyS')) achSel = Math.min(n - 1, i + per);
  else if (hit('Enter', 'NumpadEnter', 'Space')) achBuy(ACH_ORDER[i]);
  if (!hit('Tap') || !tapAt || !achUI) return false;
  const u = achUI, cx = Math.floor((tapAt.x - u.x0) / (u.sz + u.gap)), cy = Math.floor((tapAt.y - u.y0) / (u.sz + u.gap)), j = cy * u.per + cx;
  if (cx >= 0 && cx < u.per && cy >= 0 && j < n && tapAt.x >= u.x0 && tapAt.y >= u.y0) { achSel = j; return true; }
  if (u.buy && tapAt.x > u.buy.x && tapAt.x < u.buy.x + u.buy.w && tapAt.y > u.buy.y && tapAt.y < u.buy.y + u.buy.h) { achBuy(ACH_ORDER[i]); return true; }
  return false;
}
// the help's last page: a tile for every achievement, from the easiest to the hardest, gold for those you have and
// blank for the rest (nothing about them), but for the next to find: its name shows, as a hint. Pick a tile to read
// it, or to buy what to do for one you haven't found. Under that, what the ones you have are, newest first
function drawAchPage(x, y, w, h) {
  txt('ACHIEVEMENTS', W / 2, y + 36, 22, '#ffd54a', 'center', true);
  const got = ACH_ORDER.filter(k => ACH_GOT[k]).sort((a, b) => ACH_GOT[b] - ACH_GOT[a]), next = achNext();
  txt(`${got.length} of ${ACH_ORDER.length} found · from the easiest to the hardest`, W / 2, y + 58, 12, '#aaa', 'center');
  const sz = 24, gap = 6, per = Math.max(1, Math.floor((w - 32 + gap) / (sz + gap))), rows = Math.ceil(ACH_ORDER.length / per);
  const x0 = x + (w - (Math.min(per, ACH_ORDER.length) * (sz + gap) - gap)) / 2, y0 = y + 72;
  const si = achSel >= 0 ? achSel : Math.max(0, ACH_ORDER.indexOf(next)), sel = ACH_ORDER[si];
  achUI = { x0, y0, sz, gap, per, buy: null };
  ACH_ORDER.forEach((k, i) => {
    const tx = x0 + (i % per) * (sz + gap), ty = y0 + Math.floor(i / per) * (sz + gap), have = !!ACH_GOT[k], rev = !have && ACH_REV[k];
    ctx.fillStyle = have ? '#ffd54a' : k === next || rev ? 'rgba(255,213,74,.16)' : 'rgba(255,255,255,.07)'; ctx.fillRect(tx, ty, sz, sz);
    ctx.strokeStyle = have ? '#fff3b0' : k === next || rev ? '#ffd54a' : 'rgba(255,255,255,.18)'; ctx.lineWidth = 1; ctx.strokeRect(tx + 0.5, ty + 0.5, sz - 1, sz - 1);
    ctx.textAlign = 'center';
    if (have) { ctx.fillStyle = '#5a4300'; ctx.font = 'bold 15px system-ui, sans-serif'; ctx.fillText('★', tx + sz / 2, ty + sz / 2 + 5); }
    else if (rev || k === next) { ctx.fillStyle = '#ffd54a'; ctx.font = 'bold 14px system-ui, sans-serif'; ctx.fillText(rev ? '!' : '?', tx + sz / 2, ty + sz / 2 + 5); }
    if (i === si) { ctx.strokeStyle = '#7dffd8'; ctx.lineWidth = 2; ctx.strokeRect(tx - 2.5, ty - 2.5, sz + 5, sz + 5); }
  });
  // the picked one
  let ly = y0 + rows * (sz + gap) + 16;
  const line = (parts, yy) => { // [text, colour, bold] pieces, centred together
    const f = b => `${b ? 'bold 13px' : '12px'} system-ui, sans-serif`; let tw = 0;
    for (const [t, , b] of parts) { ctx.font = f(b); tw += ctx.measureText(t).width; }
    let xx = W / 2 - tw / 2; ctx.textAlign = 'left';
    for (const [t, c, b] of parts) { ctx.font = f(b); ctx.fillStyle = c; ctx.fillText(t, xx, yy); xx += ctx.measureText(t).width; }
    return { x: W / 2 - tw / 2 - 8, y: yy - 15, w: tw + 16, h: 22 };
  };
  const [sn, sd] = ACH[sel], wrap = t => wrapLines(t, w - 60, '12px system-ui, sans-serif')[0];
  if (ACH_GOT[sel]) { line([['★ ' + sn, '#ffd54a', true], ['  found ' + new Date(ACH_GOT[sel]).toLocaleDateString(), '#888']], ly); line([[wrap(sd), '#ddd']], ly + 19); }
  else if (ACH_REV[sel]) { line([[sn, '#ffd54a', true], ['  not found yet', '#888']], ly); wrapLines(ACH_HOW[sel] || sd, w - 40, '12px system-ui, sans-serif').slice(0, 2).forEach((l, i) => line([[l, '#ddd']], ly + 19 + i * 17)); }
  else {
    line(sel === next ? [['Next to find: ', '#aaa'], [sn, '#ffd54a', true]] : [['A hidden one', '#888', true]], ly);
    const deny = performance.now() - achDeny < 900, c = fmt(achPrice(sel));
    achUI.buy = line(state === 'title' ? [['(what it is can be bought in a game, with its cash)', '#888']] : NET.role === 'guest' ? [['(in co-op only the host can buy what it is)', '#888']] :
      [[touchOn() ? 'tap here' : 'Enter', '#7dffd8', true], [sel === next ? ': what to do, for ' : ': its name and what to do, for ', '#aaa'], [c, deny ? '#ff6b6b' : '#ffd54a', true], [`  (you have ${fmt(player.cash)})`, '#777']], ly + 19);
  }
  ly += ACH_REV[sel] && !ACH_GOT[sel] ? 63 : 46;
  if (!got.length) {
    wrapLines('None yet. Each blank tile is one you haven\'t found: nothing tells you what it is until you have it, but the next one\'s name.', w - 40, '12px system-ui, sans-serif').forEach((l, i) => txt(l, W / 2, ly + 6 + i * 18, 12, '#aaa', 'center'));
  } else {
    const n = Math.max(1, Math.floor((y + h - 30 - ly) / 19)), show = got.length > n ? got.slice(0, n - 1) : got;
    show.forEach((k, i) => {
      const yy = ly + 8 + i * 19, [name, desc] = ACH[k];
      ctx.textAlign = 'left'; ctx.font = 'bold 12px system-ui, sans-serif'; ctx.fillStyle = '#ffd54a'; ctx.fillText('★ ' + name, x + 16, yy);
      const nw = ctx.measureText('★ ' + name).width; ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = '#bbb';
      let d = desc; while (d.length > 4 && ctx.measureText(d).width > w - 44 - nw) d = d.slice(0, -2);
      ctx.fillText(d === desc ? desc : d.trimEnd() + '…', x + 26 + nw, yy);
    });
    if (show.length < got.length) txt(`… and ${got.length - show.length} more found before`, W / 2, ly + 8 + show.length * 19, 11, '#888', 'center');
  }
  txt(touchOn() ? 'tap a tile to pick it · tap elsewhere: close' : '← → ↑ ↓ pick a tile · H: close', W / 2, y + h - 8, 11, '#777', 'center');
}
// the title screen's corner: how many you have, a tile for each, the next to find; H (or a tap on it) opens the page
let titleAchRect = null;
function drawTitleAch() {
  const n = ACH_ORDER.filter(k => ACH_GOT[k]).length, next = achNext(), per = 17, sz = W < 520 ? 7 : 10, gap = W < 520 ? 2 : 3;
  const gw = per * (sz + gap) - gap, pw = gw + 24, rows = Math.ceil(ACH_ORDER.length / per), ph = 46 + rows * (sz + gap) + 28, x = W - pw - 12, y = 12;
  ctx.fillStyle = 'rgba(10,10,14,.78)'; ctx.fillRect(x, y, pw, ph); ctx.strokeStyle = 'rgba(255,213,74,.7)'; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, pw, ph);
  txt('ACHIEVEMENTS', x + 12, y + 22, 12, '#ffd54a', 'left', true); txt(`${n} of ${ACH_ORDER.length}`, x + pw - 12, y + 22, 12, '#ddd', 'right');
  ACH_ORDER.forEach((k, i) => {
    const tx = x + 12 + (i % per) * (sz + gap), ty = y + 34 + Math.floor(i / per) * (sz + gap);
    ctx.fillStyle = ACH_GOT[k] ? '#ffd54a' : ACH_REV[k] ? 'rgba(255,213,74,.3)' : 'rgba(255,255,255,.12)'; ctx.fillRect(tx, ty, sz, sz);
    if (k === next) { ctx.strokeStyle = '#ffd54a'; ctx.lineWidth = 1.5; ctx.strokeRect(tx - 1, ty - 1, sz + 2, sz + 2); }
  });
  const ny = y + 34 + rows * (sz + gap) + 12;
  ctx.textAlign = 'left'; ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = '#aaa';
  if (next) { const lead = 'Next: '; ctx.fillText(lead, x + 12, ny); ctx.font = 'bold 11px system-ui, sans-serif'; ctx.fillStyle = '#ffd54a'; ctx.fillText(ACH[next][0], x + 12 + ctx.measureText(lead).width, ny); }
  else ctx.fillText('Every one found!', x + 12, ny);
  ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = '#888'; ctx.textAlign = 'right'; ctx.fillText(touchOn() ? 'tap: all' : 'H: all', x + pw - 12, ny);
  titleAchRect = { x, y, w: pw, h: ph };
}
function drawHelp() {
  const w = Math.min(600, W - 24), h = Math.min(H - 24, 470), x = (W - w) / 2, y = (H - h) / 2;
  ctx.fillStyle = state === 'title' ? '#0a0a0e' : 'rgba(10,10,14,.94)'; ctx.fillRect(x, y, w, h); // (over the title's big letters: opaque)
  ctx.strokeStyle = helpPage === 2 ? '#b388ff' : '#ffd54a'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
  if (helpPage === 3) drawAchPage(x, y, w, h);
  else if (helpPage === 1) {
    txt('HOW TO PLAY', W / 2, y + 36, 22, '#ffd54a', 'center', true);
    HELP.forEach(([k, d], i) => { txt(k, x + 16, y + 74 + i * 26, 13, '#ffd54a'); txt(d, x + 160, y + 74 + i * 26, 12, '#ddd'); });
    const lines = wrapLines(`Answer ringing payphones for jobs. Spray shops make the cops forget you. Reach ${fmt(GOAL)} to own the city.`, w - 32, '12px system-ui, sans-serif');
    lines.forEach((l, i) => txt(l, W / 2, y + h - 46 + i * 16, 12, '#aaa', 'center'));
    txt('H: quantum notes', W / 2, y + h - 10, 11, '#777', 'center');
  } else {
    txt('QUANTUM NOTES', W / 2, y + 36, 22, '#b388ff', 'center', true);
    // the notes you have met show as much of their text as fits; the others just their titles
    const ks = Object.keys(NOTES), body = ks.map(k => Q.notes.has(k) ? wrapLines(NOTES[k].body, w - 40, '11px system-ui, sans-serif') : []);
    let nl = 3; while (nl > 0 && ks.reduce((a, k, i) => a + 20 + (body[i].length ? Math.min(nl, body[i].length) * 13 + 4 : 0), 0) > h - 84) nl--;
    let yy = y + 64;
    ks.forEach((k, i) => {
      if (yy > y + h - 26) return;
      const seen = Q.notes.has(k);
      ctx.fillStyle = seen ? '#fff' : '#888'; ctx.font = 'bold 13px system-ui, sans-serif'; ctx.textAlign = 'left';
      ctx.fillText((seen ? '● ' : '○ ') + NOTES[k].title, x + 16, yy);
      ctx.fillStyle = '#aab'; ctx.font = '11px system-ui, sans-serif';
      const l = body[i].slice(0, nl); if (l.length < body[i].length) l[l.length - 1] += ' …';
      l.forEach((s2, j) => ctx.fillText(s2, x + 30, yy + 15 + j * 13));
      yy += 20 + (l.length ? l.length * 13 + 4 : 0);
    });
    txt('H: achievements', W / 2, y + h - 8, 11, '#777', 'center');
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
  const st = STARTS[startSel];
  txt(`MAP: ${B5 ? 'INNER BRNO' : 'QUANTUM ISLAND'}  ·  ${touchOn() ? 'tap here for' : '↑ ↓ for'} ${B5 ? 'the island' : 'inner Brno'}`, W / 2, H * 0.5 - 30, Math.min(13, W / 40), '#ffd54a', 'center');
  txt(`◀   START IN ${st.name.toUpperCase()}   ▶`, W / 2, H * 0.5, Math.min(20, W / 26), '#7dffd8', 'center', true);
  txt(`${st.sub}  ·  ${touchOn() ? 'tap here to change' : '← → to change'}`, W / 2, H * 0.5 + 22, Math.min(13, W / 40), '#bbb', 'center');
  if (Math.sin(time * 4) > -0.3) txt(touchOn() ? 'TAP LEFT: PLAY · TAP RIGHT: PHYSICS LAB' : 'ENTER: PLAY  ·  L: PHYSICS LAB', W / 2, H * 0.6, Math.min(22, W / 24), '#fff', 'center', true);
  txt(touchOn() ? 'tap here for online co-op' : 'O: ONLINE CO-OP WITH A FRIEND', W / 2, H * 0.6 + 34, Math.min(15, W / 34), '#7dffd8', 'center', true);
  if (W > 560) HELP.slice(0, 6).forEach(([k, d], i) => txt(`${k}  —  ${d}`, W / 2, H * 0.71 + i * 21, 13, '#bbb', 'center'));
  if (best > 0) txt(`Best: ${fmt(best)}`, W / 2, H - 24, 14, '#ffd54a', 'center');
  drawTitleAch();
  if (helpPage === 3) drawHelp(); // (the achievements, opened over the title)
  if (BRNO) txt('Brno map data © OpenStreetMap contributors (ODbL)', 12, H - 10, 11, '#aaa', 'left');
}
function drawOver() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(0, 0, W, H);
  txt('GAME OVER', W / 2, H * 0.4, Math.min(80, W / 8), '#e74c3c', 'center', true);
  txt(`You made ${fmt(player.cash)}   ·   best ${fmt(best)}`, W / 2, H * 0.4 + 50, 18, '#fff', 'center');
  if (Math.sin(time * 4) > -0.3) txt('PRESS ENTER / TAP TO PLAY AGAIN', W / 2, H * 0.62, 20, '#ffd54a', 'center', true);
}

// ============================================================ Brno's easter eggs
// The old town: the orloj's marble at eleven and Petrov ringing noon an hour early (the Swedes, 1645), the dragon in the
// Old Town Hall's passage and Birk's wheel, the little man on St James's, Špilberk's cells, the cellars under the old
// town. The city: the new main station that keeps its distance, Mendel's peas, Kometa's nights, the cows on Kraví hora,
// the Bren gun from Zbrojovka, Hantec. And BUT: the Carthusians at FIT, the duck from U Kachničky, a project due at
// 23:59, the Formula Student car, the students' Friday train home. (In online co-op the host's alone.)
const PXM = B5 ? T / 5 : T / 15; // px a metre
const WDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
let dayN = 0; // whole days since the game began (on a Friday)
const weekday = () => (5 + dayN) % 7;
const EGG_SPOTS = []; // (kept in their places like the army's: the Formula Student car)
// (what the eggs add to the game's tables: Birk's wheel and the Formula Student car, the Bren gun)
CT.wheel = { label: "Birk's Wheel", w: 6, l: 22, max: 175, acc: 85, turn: 2.8, hp: 600, mass: 0.5, colors: ['#8a5a2e'], draw: drawWheelCar };
CT.formula = { label: 'Formula Student Car', w: 13, l: 28, max: 470, acc: 360, turn: 3.5, hp: 110, mass: 0.6, colors: ['#f2f2f2'], draw: drawFormula };
WEAPONS.bren = { name: 'Bren Gun', rate: 0.12, dmg: 30, spd: 1000, spread: 0.035, life: 0.8 };
WORDER.splice(2, 0, 'bren');
const EA = BRNO ? (() => {
  const mpt = B5 ? 5 : 15, P = (lat, lon) => geo(lat, lon).map(v => v * T);
  const nearT = (x, y, ok, Rm = 150) => { // the nearest tile it likes, ring by ring
    const tx = Math.floor(x / T), ty = Math.floor(y / T), R = Math.ceil(Rm / mpt);
    const at = (i, j) => i > 0 && j > 0 && i < MW - 1 && j < MH - 1 && ok(map[j * MW + i], i, j);
    for (let r = 0; r <= R; r++) {
      for (let dx = -r; dx <= r; dx++) for (const dy of r ? [-r, r] : [0]) if (at(tx + dx, ty + dy)) return { x: (tx + dx + 0.5) * T, y: (ty + dy + 0.5) * T };
      for (let dy = -r + 1; dy < r; dy++) for (const dx of [-r, r]) if (at(tx + dx, ty + dy)) return { x: (tx + dx + 0.5) * T, y: (ty + dy + 0.5) * T };
    }
    return null;
  };
  const foot = t => t === WALK || t === PLAZA, open = t => t === WALK || t === PLAZA || t === GRASS;
  const reach = new Map(); // (is this tile out in the open city, not in a closed courtyard? a flood fill that gives up once it is big)
  const outside = (i, j) => {
    const k0 = j * MW + i; if (reach.has(k0)) return reach.get(k0);
    const seen = new Set([k0]), q = [k0]; let h = 0;
    while (h < q.length && seen.size < 3000) { const k = q[h++], x = k % MW, y = (k / MW) | 0; for (let d = 0; d < 4; d++) { const nx = x + DX[d], ny = y + DY[d], n = ny * MW + nx; if (nx < 1 || ny < 1 || nx >= MW - 1 || ny >= MH - 1 || seen.has(n) || solidT(map[n])) continue; seen.add(n); q.push(n); } }
    const r = seen.size >= 3000; for (const k of q) reach.set(k, r); return r;
  };
  const byRoad = (i, j) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (tile(i + dx, j + dy) === ROAD) return true; return false; };
  const mid = s => s && { x: (s.x0 + s.x1 + 1) / 2 * T, y: (s.y0 + s.y1 + 1) / 2 * T };
  const nearProp = (k, x, y, r, f) => { let b = null, bd = r * r; for (const p of props) if (p.k === k && (!f || f(p))) { const d = d2(p.x, p.y, x, y); if (d < bd) { bd = d; b = p; } } return b; };
  // a place to leave a vehicle: on paving or grass clear of walls and of the road, facing the longest way out
  const park = (x, y, type, Rm, inside) => {
    const t = CT[type], R = Rm * PXM; let best = null, bs = 1e9;
    const ok = (px, py) => !solidAt(px, py) && tileAtP(px, py) !== WATER;
    const free = (cx, cy, a) => { const ca = Math.cos(a), sa = Math.sin(a);
      for (let u = -t.l / 2 - 5; u <= t.l / 2 + 5; u += 5) for (let v = -t.w / 2 - 5; v <= t.w / 2 + 5; v += 5) { const px = cx + ca * u - sa * v, py = cy + sa * u + ca * v; if (!ok(px, py) || tileAtP(px, py) === ROAD || (inside && !inside(px, py))) return false; }
      return true; };
    const run = (cx, cy, a) => { const ca = Math.cos(a), sa = Math.sin(a); let d = 0; for (; d < 150; d += 6) for (const v of [-t.w / 2, 0, t.w / 2]) { const px = cx + ca * (t.l / 2 + 4 + d) - sa * v, py = cy + sa * (t.l / 2 + 4 + d) + ca * v; if (!ok(px, py)) return d; } return d; };
    // (the points in rings outward from the spot: once a ring is too far out to do better, nor can any after it; of equally
    // good ones the first in the order of rows wins, as it did when they were searched row by row)
    const rings = []; let n = 0, bi = Infinity;
    for (let py = y - R; py <= y + R; py += 8) for (let px = x - R; px <= x + R; px += 8, n++) {
      const dd = Math.hypot(px - x, py - y); if (dd > R) continue;
      const k = Math.floor(dd / 8); (rings[k] || (rings[k] = [])).push(px, py, dd, n);
    }
    for (let k = 0; k < rings.length && k * 8 - 75 <= bs; k++) {
      const G = rings[k]; if (!G) continue;
      for (let m = 0; m < G.length; m += 4) {
        const px = G[m], py = G[m + 1], dd = G[m + 2], o = G[m + 3] * 8; if (dd - 75 > bs) continue;
        for (let q = 0; q < 8; q++) { const a = q * Math.PI / 4; if (!free(px, py, a)) continue; const r = run(px, py, a); if (r < 40) continue; const s = dd - Math.min(r, 120) * 0.6; if (s < bs || (s === bs && o + q < bi)) { bs = s; bi = o + q; best = { x: px, y: py, a }; } }
      }
    }
    return best;
  };
  const A = { hatches: [], cloister: [], grass: [] };
  const oj = props.find(p => p.k === 'orloj'); A.orloj = oj ? { x: oj.x, y: oj.y } : null;
  A.petrov = mid(siteRect('Katedrála sv. Petra a Pavla')) || (([x, y]) => ({ x, y }))(P(49.1910, 16.6073));
  A.hall = nearT(...P(49.19314, 16.60870), (t, i, j) => (foot(t) || t === ROAD) && outside(i, j), 90); // (the gate under the tower, on Radnická)
  // the market on Zelný trh: a calfskin full of lime by the stalls, and the fountains the dragon would drink from
  const mk = nearProp('market', ...P(49.1922, 16.6089), 260 * PXM);
  A.lime = mk ? nearT(mk.x + 27, mk.y + 24, (t, i, j) => foot(t) && outside(i, j), 30) : nearT(...P(49.1920, 16.6088), (t, i, j) => foot(t) && outside(i, j), 80);
  A.drink = props.filter(p => p.k === 'fountain' && A.hall && d2(p.x, p.y, A.hall.x, A.hall.y) < (700 * PXM) ** 2).map(p => ({ x: p.x, y: p.y }));
  // the cellars under the old town: a hatch by each of four real ways down (the Labyrinth under Zelný trh, the Capuchin
  // crypt, the ossuary under St James's, the Mint Master's cellar by the New Town Hall), each leading on to the next
  for (const [name, la, lo] of [['Zelný trh', 49.19291, 16.60938], ['Kapucínské náměstí', 49.19111, 16.60986], ['Jakubské náměstí', 49.19632, 16.60799], ['Dominikánské náměstí', 49.19430, 16.60600]]) {
    const q = nearT(...P(la, lo), (t, i, j) => foot(t) && outside(i, j) && !(A.lime && d2((i + 0.5) * T, (j + 0.5) * T, A.lime.x, A.lime.y) < 60 * 60) && !(A.orloj && d2((i + 0.5) * T, (j + 0.5) * T, A.orloj.x, A.orloj.y) < 60 * 60), 90);
    if (q && !A.hatches.some(h => d2(h.x, h.y, q.x, q.y) < 120 * 120)) A.hatches.push({ name, x: q.x, y: q.y });
  }
  if (A.hatches.length < 2) A.hatches = [];
  A.spil = nearT(...P(49.19440, 16.59950), (t, i, j) => foot(t) && outside(i, j), 150); // (by the castle's gate)
  // the little man on St James's: in the window arch of the bell tower's first floor, on its south face (toward Náměstí
  // Svobody), baring his backside at Petrov (the detailed map has the church as it stands)
  if (B5) {
    const [px, py] = P(49.19640, 16.60792), inB = (b, x, y) => x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h && (!b.wr || inRings(b.wr, x, y));
    let tw = buildings.find(b => inB(b, px, py)), bd = (5 * T) ** 2; // (the tower: the piece the point is in, else the nearest)
    if (!tw) for (const b of buildings) { const dx = Math.max(b.x - px, 0, px - b.x - b.w), dy = Math.max(b.y - py, 0, py - b.y - b.h), d = dx * dx + dy * dy; if (d < bd) { bd = d; tw = b; } }
    if (tw) {
      const tx = inB(tw, px, py) ? px : tw.x + tw.w / 2, ty = inB(tw, px, py) ? py : tw.y + tw.h / 2;
      let d = 0; while (d < 400 && buildings.some(b => inB(b, tx, ty + d))) d += 2;
      A.jakub = { x: tx, y: ty + d - 1, z: 0.22, a: Math.atan2(A.petrov.y - ty, A.petrov.x - tx) };
    }
  }
  const clear = (i, j, rx, ry) => { for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) { const t = tile(i + dx, j + dy), k = (j + dy) * MW + i + dx; if (solidT(t) || t === ROAD || LCG[k] === LC_RAIL || RAILT && RAILT[k]) return false; } return true; };
  A.board = nearT(...P(49.18238, 16.61548), (t, i, j) => (t === GRASS || t === PLAZA || t === WALK) && clear(i, j, B5 ? 4 : 2, B5 ? 3 : 1), 400);
  A.mendel = (([x, y]) => ({ x, y }))(P(49.19130, 16.59380));
  { // (clear of the tram tracks: the tracks' pieces round Mendlák, in a grid of 64 px cells, so each test looks at a few)
    const G = new Map(), rr = 260 * PXM + 120, cell = 64, key = (i, j) => i * 65536 + j;
    for (const R of TL) if (!R.train) for (let k = 1; k < R.pts.length; k++) {
      const a = R.pts[k - 1], b = R.pts[k];
      if (segPtD(A.mendel.x, A.mendel.y, a[0], a[1], b[0], b[1]) > rr) continue;
      for (let i = Math.floor((Math.min(a[0], b[0]) - 26) / cell); i <= Math.floor((Math.max(a[0], b[0]) + 26) / cell); i++)
        for (let j = Math.floor((Math.min(a[1], b[1]) - 26) / cell); j <= Math.floor((Math.max(a[1], b[1]) + 26) / cell); j++) { const kk = key(i, j); if (!G.has(kk)) G.set(kk, []); G.get(kk).push([a[0], a[1], b[0], b[1]]); }
    }
    const tramNear = (x, y) => { const l = G.get(key(Math.floor(x / cell), Math.floor(y / cell))); return !!l && l.some(q => segPtD(x, y, q[0], q[1], q[2], q[3]) < 26); };
    const taken = [];
    for (let k = 0; k < 10; k++) {
      const a = k * TAU / 10, r = (60 + (k % 3) * 45) * PXM, q = park(A.mendel.x + Math.cos(a) * r, A.mendel.y + Math.sin(a) * r, 'sedan', 45, (x, y) => !tramNear(x, y) && !taken.some(o => d2(o.x, o.y, x, y) < 40 * 40));
      if (q && !taken.some(o => d2(o.x, o.y, q.x, q.y) < 40 * 40)) { EGG_SPOTS.push({ x: q.x, y: q.y, a: q.a, type: pick(['compact', 'sedan', 'sedan', 'sports']), mendel: true, mi: taken.length, always: true, c: null, tried: false }); taken.push(q); }
    } }
  const ro = siteRect('Hala Rondo'); A.rondo = mid(ro) || (([x, y]) => ({ x, y }))(P(49.18544, 16.60205));
  A.rondo.door = nearT(...P(49.18578, 16.60294), (t, i, j) => foot(t) && outside(i, j), 160) || A.rondo; // (its entrance)
  const st = siteRect('Hlavní nádraží'); A.station = mid(st) || (([x, y]) => ({ x, y }))(P(49.19060, 16.61300));
  A.station.door = nearT(A.station.x, A.station.y, foot, 160) || A.station;
  // Kraví hora: the grass round the observatory, where the cows graze
  const ob = mid(siteRect('Hvězdárna a planetárium')) || (([x, y]) => ({ x, y }))(P(49.20400, 16.58380));
  A.kravi = ob;
  { const R = Math.ceil(260 / mpt), tx = Math.floor(ob.x / T), ty = Math.floor(ob.y / T);
    for (let j = ty - R; j <= ty + R; j++) for (let i = tx - R; i <= tx + R; i++) if (tile(i, j) === GRASS && (i - tx) ** 2 + (j - ty) ** 2 <= R * R && !solidAt((i + 0.5) * T, (j + 0.5) * T)) A.grass.push({ x: (i + 0.5) * T, y: (j + 0.5) * T });
    if (A.grass.length > 600) A.grass = A.grass.filter((_, i) => i % Math.ceil(A.grass.length / 600) === 0); }
  // FIT: the cloister of the Carthusian monastery (the open ground in the faculty's grounds with walls all round), the
  // duck outside the students' club U Kachničky, and the faculty's door
  const fs = siteRect('FIT BUT');
  if (fs) {
    A.fit = mid(fs);
    const L = B5 ? 14 : 3, wall = (i, j, dx, dy) => { for (let k = 1; k <= L; k++) if (tile(i + dx * k, j + dy * k) === BUILD) return true; return false; };
    const all = [];
    for (let j = fs.y0; j <= fs.y1; j++) for (let i = fs.x0; i <= fs.x1; i++) { const t = tile(i, j); if (!open(t) || solidAt((i + 0.5) * T, (j + 0.5) * T)) continue; all.push({ x: (i + 0.5) * T, y: (j + 0.5) * T }); if (wall(i, j, 1, 0) && wall(i, j, -1, 0) && wall(i, j, 0, 1) && wall(i, j, 0, -1)) A.cloister.push(all[all.length - 1]); }
    if (A.cloister.length < 6) A.cloister = all;
    const bench = nearProp('bench', A.fit.x, A.fit.y, 40 * T, p => p.x > (fs.x0 - 6) * T && p.x < (fs.x1 + 7) * T && p.y > (fs.y0 - 6) * T && p.y < (fs.y1 + 7) * T);
    const flag = nearProp('flag', A.fit.x, A.fit.y, 40 * T, p => p.c === '#00a9e0');
    A.duck = nearT(...P(49.22653, 16.59511), (t, i, j) => foot(t) && outside(i, j), 120) || (bench ? { x: bench.x, y: bench.y } : null); // (outside the club, in the old brewery's wing)
    A.fitDoor = (bench || flag) ? nearT((bench || flag).x, (bench || flag).y + 6, foot, 40) : nearT(A.fit.x, A.fit.y, foot, 200);
  }
  // the BUT dorms Pod Palackého vrchem on Kolejní (by block A02, the reception), where the student with the late project waits
  A.dorm = nearT(...P(49.23168, 16.56956), (t, i, j) => foot(t) && byRoad(i, j) && outside(i, j), 220) || nearT(...P(49.23168, 16.56956), (t, i, j) => open(t) && byRoad(i, j) && outside(i, j), 600);
  // the Formula Student car outside the mechanical engineering faculty; the Bren gun at the old Zbrojovka works
  { const q = park(...P(49.22412, 16.57734), 'formula', 160); if (q) EGG_SPOTS.push({ x: q.x, y: q.y, a: q.a, type: 'formula', color: '#f2f2f2', always: true, c: null, tried: false }); } // (by FSI's main entrance, tower A1)
  A.bren = nearT(...P(49.20591, 16.63367), (t, i, j) => open(t) && !byRoad(i, j) && outside(i, j), 250) || nearT(...P(49.20591, 16.63367), open, 300);
  // Birk's wheel: where the road from Lednice comes in at the edge of the map
  if (A.hall) {
    const [lx, ly] = geo(48.8000, 16.8000), hx = A.hall.x / T, hy = A.hall.y / T, m = Math.ceil(250 / mpt), dl = Math.hypot(lx - hx, ly - hy);
    let ex = hx, ey = hy; for (let k = 0; k < 5000; k++) { const nx = ex + (lx - hx) / dl, ny = ey + (ly - hy) / dl; if (nx < m || ny < m || nx > MW - m || ny > MH - m) break; ex = nx; ey = ny; }
    const q = park(ex * T, ey * T, 'wheel', 400); if (q) A.wheel = q;
  }
  // somewhere for the dragon to drink, failing a fountain: the nearest water
  if (A.hall) A.water = nearT(A.hall.x, A.hall.y, t => t === WATER, 2500);
  // animals that got loose: a sea lion in Starý Lískovec, a panda between the Tesco (Cimburkova) and the Kaufland
  // (Sportovní) in Ponava, a golden jackal in Bystrc; each roams the open ground round its spot
  const roam = (x, y, Rm) => {
    const R = Math.ceil(Rm / mpt), tx = Math.floor(x / T), ty = Math.floor(y / T), o = [];
    for (let j = ty - R; j <= ty + R; j++) for (let i = tx - R; i <= tx + R; i++) if ((i - tx) ** 2 + (j - ty) ** 2 <= R * R && open(tile(i, j)) && !solidAt((i + 0.5) * T, (j + 0.5) * T) && outside(i, j)) o.push({ x: (i + 0.5) * T, y: (j + 0.5) * T });
    return o.length > 400 ? o.filter((_, i) => i % Math.ceil(o.length / 400) === 0) : o;
  };
  const plc = n => { const p = BRNO_DATA.places.find(q => q[0] === n); return p ? { x: p[1] * T, y: p[2] * T } : null; };
  A.zoo = [];
  for (const [k, at, Rm] of [['sealion', plc('Starý Lískovec'), 220], ['panda', (([x, y]) => ({ x, y }))(P(49.21594, 16.60637)), 190], ['jackal', plc('Bystrc'), 300]]) {
    const pts = at ? roam(at.x, at.y, Rm) : []; if (pts.length >= 8) A.zoo.push({ k, x: at.x, y: at.y, pts });
  }
  // the quantum clock by the gate of the Institute of Scientific Instruments (ÚPT) on Královopolská; FIT's quantum
  // computer, through the faculty's door
  A.qclock = nearT(...P(49.22202, 16.58368), (t, i, j) => foot(t) && outside(i, j) && byRoad(i, j), 160) || nearT(...P(49.22202, 16.58368), (t, i, j) => open(t) && outside(i, j), 220);
  A.qpc = A.fitDoor || null;
  // Moravské náměstí: Margrave Jošt on his long-legged horse (Odvaha, Courage) and, outside the Supreme Administrative
  // Court, a man lifting a block on a jet of water (Spravedlnost, Justice)
  if (B5) { const [jx, jy] = P(49.197636, 16.607535), [sx, sy] = P(49.197482, 16.607103); A.jost = { x: jx, y: jy, a: -Math.PI / 2 }; A.justice = { x: sx, y: sy }; }
  return A;
})() : null;
const EGG = { h: null, told: {}, crowdT: 0, marble: null, dragon: null, slain: -1, wheel: null, wheelSt: 'wait', wheelDay: -1, cows: [], cowT: 0, monks: [], student: null, deadDay: -1, roarT: 20, leaveT: 0, boosts: [], zoo: [], splashT: 0, atClock: false };
function eggReset() {
  Object.assign(EGG, { h: null, told: {}, marble: null, dragon: null, slain: -1, wheel: null, wheelSt: 'wait', wheelDay: -1, cows: [], monks: [], student: null, deadDay: -1, boosts: [], zoo: [], splashT: 0, atClock: false });
  player.marble = false; player.lime = false; player.cellar = null;
}
const eggOnce = (k, text, t = 4) => { if (EGG.told[k]) return false; EGG.told[k] = 1; msg(text, t); return true; };
const gameH = h => (((h % 24) + 24) % 24); // (hours since midnight)
const hhmm = h => { h = gameH(h); const hh = Math.floor(h), mi = Math.floor((h - hh) * 60); return `${String(hh).padStart(2, '0')}:${String(mi).padStart(2, '0')}`; };
Object.assign(sfx, {
  bells: () => { for (let i = 0; i < 6; i++) { const w = now() + i * 1.3; for (const [f, v] of [[196, 0.05], [392, 0.09], [469, 0.05], [587, 0.035], [784, 0.025]]) tone(f, 2.6, 'sine', v, 0, w); } },
  roar: () => { noise(2.4, 650, 'bandpass', 0.35, 0.4); [0, 0.45, 0.9, 1.35].forEach(w => tone(233, 0.35, 'sawtooth', 0.03, 0, now() + w)); },
  moo: () => { tone(150, 1.0, 'sawtooth', 0.05, 105); tone(151, 1.0, 'triangle', 0.06, 106); },
  quack: () => { tone(640, 0.13, 'square', 0.05, 380); tone(610, 0.13, 'square', 0.05, 360, now() + 0.17); },
  clink: () => { tone(2600, 0.3, 'sine', 0.07); tone(3950, 0.2, 'sine', 0.035, 0, now() + 0.06); },
  hatch: () => { noise(0.5, 300, 'lowpass', 0.4); tone(90, 0.4, 'triangle', 0.1, 60); },
});
// ---- the calfskin, the duck and the gun lying about
Object.assign(PK, {
  lime: { c: '#d9c9a3', l: '', label: 'A calfskin stuffed with quicklime. The dragon prowls the old town after midnight.', give: () => { player.lime = true; }, can: () => !player.lime, cd: 20, draw: drawLime },
  duck: { c: '#ffd83d', l: '', label: 'A rubber duck from the FIT students\' club U Kachničky.', cd: 30, draw: drawDuck, give: () => {
    sfx.quack();
    if (!DBG.duck) { DBG.duck = true; try { localStorage.setItem('qta.duck', '1'); } catch (e) { /* storage unavailable */ } }
    msg('Rubber-duck debugging: press ` (backquote) any time and tell the duck what\'s wrong.', 6); ach('duck');
  } },
  bren: { c: '#6b6f4a', l: 'B', label: 'Bren gun +120: BRno and ENfield. Zbrojovka\'s ZB vz. 26, built under licence at Enfield.', give: () => { give('bren', 120); ach('bren'); } },
});
function eggPickups() {
  if (!EA) return;
  if (EA.lime) pickups.push({ x: EA.lime.x, y: EA.lime.y, k: 'lime', cd: 0 });
  if (EA.duck) pickups.push({ x: EA.duck.x, y: EA.duck.y, k: 'duck', cd: 0 });
  if (EA.bren) pickups.push({ x: EA.bren.x, y: EA.bren.y, k: 'bren', cd: 0 });
}
// ---- the people: the crowd round the orloj, Kometa's fans, the students with their suitcases
function eggBoost(x, y) { let s = 0; for (const b of EGG.boosts) { const d = d2(x, y, b.x, b.y); if (d < 9 * b.r * b.r) s += b.a * Math.exp(-d / (b.r * b.r)); } return s; }
const matchDay = () => { const w = weekday(); return w === 0 || w === 2 || w === 5; }; // (Kometa at home: Tuesdays, Fridays, Sundays)
function eggNewPed(p) {
  if (!EA || p.cop || lab) return p;
  const h = dayT * 24, w = weekday();
  if (matchDay() && h >= 16.25 && h < 20.9 && d2(p.x, p.y, EA.rondo.x, EA.rondo.y) < (650 * PXM) ** 2 && Math.random() < 0.7) {
    p.fan = true; p.shirt = Math.random() < 0.72 ? '#1d4fa0' : '#f4f4f4';
    if (h < 17.6 && pedGo(p, EA.rondo.door.x + rand(-12, 12), EA.rondo.door.y + rand(-12, 12))) p.eg = 'in';
    return p;
  }
  const fri = w === 5 && h >= 12 && h < 18.5, sun = w === 0 && h >= 16 && h < 22;
  if (fri || sun) {
    const ds = d2(p.x, p.y, EA.station.x, EA.station.y) < (600 * PXM) ** 2;
    if (Math.random() < (ds ? 0.55 : 0.22)) {
      p.suit = pick(['#2c3e50', '#8e2c2c', '#1f5f8b', '#555b61', '#6d4c41', '#3d6b3d']);
      if (fri && ds && pedGo(p, EA.station.door.x + rand(-14, 14), EA.station.door.y + rand(-14, 14))) p.eg = 'in';
    }
  }
  return p;
}
function eggArrive(p) { // (where an egg's pedestrian was headed: there)
  const k = p.eg; p.eg = null;
  if (k === 'orloj' && EA.orloj) { p.idle = Math.max(2, (11.03 - dayT * 24) / 24 * DAY_LEN) + rand(0, 4); p.chatWith = null; p.angle = Math.atan2(EA.orloj.y - p.y, EA.orloj.x - p.x); return true; }
  if (k === 'in') { p.entering = 0.7; return true; } // (in through the doors: to the match, to the train)
  return false;
}
// ---- every frame
function updateEggs(dt) {
  if (!EA || lab || NET.role === 'guest') return;
  const h = dayT * 24, h0 = EGG.h ?? h; EGG.h = h;
  const at = H => h0 <= h ? h0 < H && h >= H : h0 < H || h >= H; // (the clock passed H just now)
  const P0 = pp(), you = !player.hidden && !player.down;
  const near = (o, r) => !!o && d2(o.x, o.y, P0.x, P0.y) < r * r;
  EGG.boosts.length = 0;
  if (player.cellar) updateCellar(dt);
  // the orloj: a crowd from twenty to eleven, the marble at eleven into one of its four holes; Petrov's noon
  const O = EA.orloj;
  if (O) {
    const nearO = near(O, 900 * PXM);
    if (h >= 10.5 && h < 11.03) {
      EGG.boosts.push({ x: O.x, y: O.y, r: 60 * PXM, a: 1.6 * clamp((h - 10.5) * 4, 0, 1) });
      EGG.crowdT -= dt;
      if (nearO && h < 11 && EGG.crowdT <= 0) {
        EGG.crowdT = 0.35; let n = 0;
        for (const p of peds) {
          if (n >= 3) break;
          if (p.dead || p.cop || p.eg || p.tp || p.vip || p.target || p.monk || p.flee > 0 || p.held || p.idle > 0 || p.entering || d2(p.x, p.y, O.x, O.y) > 420 * 420 || d2(p.x, p.y, O.x, O.y) < 46 * 46) continue;
          const a = rand(TAU), r = rand(17, 44), sx = O.x + Math.cos(a) * r, sy = O.y + Math.sin(a) * r;
          if (!solidAt(sx, sy) && pedGo(p, sx, sy)) { p.eg = 'orloj'; n++; }
        }
      }
      if (you && !player.car && near(O, 300) && h >= 10.7) if (eggOnce('orloj' + dayN, 'At eleven the orloj drops a glass marble out of one of its openings.', 6)) msg('Wait by one, on foot, and you might catch it.', 6);
    }
    if (at(11)) {
      const k = randi(0, 3), a = Math.PI / 4 + k * Math.PI / 2;
      EGG.marble = { x: O.x + Math.cos(a) * 9, y: O.y + Math.sin(a) * 9, vx: Math.cos(a) * 16, vy: Math.sin(a) * 16, t: 0, a };
      if (near(O, 500)) sfx.clink();
      eggBells(P0, you);
    }
    const m = EGG.marble;
    if (m) {
      m.t += dt; if (m.t < 0.8) { m.x += m.vx * dt; m.y += m.vy * dt; }
      if (you && !player.car && !player.cellar && d2(m.x, m.y, P0.x, P0.y) < 17 * 17) {
        EGG.marble = null;
        if (player.marble) msg('Another marble: you hand it to a child in the crowd. You already carry one.', 3);
        else { player.marble = true; bigText('THE ORLOJ\'S MARBLE', '#9fe8ff', 3.5, 'You caught it: it will get you out of one arrest'); sfx.good(); ach('marble'); }
      } else if (m.t > 1.7) { EGG.marble = null; if (near(O, 260) && peds.some(p => !p.dead && d2(p.x, p.y, O.x, O.y) < 60 * 60)) msg('Someone in the crowd caught the marble.', 3); }
    }
  }
  updateDragon(dt, h, at, P0, you, near);
  updateBirk(dt, h, at, P0, you, near);
  // the little man on St James's; the billboard where the new main station is to be
  if (you && EA.jakub && near(EA.jakub, 140)) if (eggOnce('jakub', 'On St James\'s tower a little stone man bares his backside at Petrov.', 6)) ach('jakub'), msg('The story goes it was its builders\' answer to the cathedral\'s.', 6);
  if (you && EA.board && near(EA.board, 170)) if (eggOnce('board', 'The new main station is to stand here. Brno has argued about the move since 1901.', 6)) ach('station'), msg('The opening date stays twenty years away: watch it slip a year every day.', 6);
  // the hatches into the cellars: what each is
  if (you && !player.car && !player.cellar) {
    const i = eggHatchAt(P0.x, P0.y);
    if (i !== EGG.hatchHint && i >= 0) msg(`A hatch into the old town's cellars. ${touchOn() ? '⇄' : 'Enter'}: climb down, out at ${EA.hatches[(i + 1) % EA.hatches.length].name}.`, 3);
    EGG.hatchHint = i;
  }
  // Kometa at home: the fans in blue and white stream to Hala Rondo, the hall roars, and after the match they pour out
  if (matchDay()) {
    const R = EA.rondo;
    if (at(16)) msg('Kometa plays at home tonight: Hala Rondo, face-off at 17:30.', 5);
    if (h >= 16.4 && h < 21) EGG.boosts.push({ x: R.x, y: R.y, r: 300 * PXM, a: h < 17.5 ? 1.3 : h < 20 ? 0.3 : 1.7 });
    if (h >= 17.5 && h < 20 && near(R, 900 * PXM)) {
      EGG.roarT -= dt;
      if (EGG.roarT <= 0) { EGG.roarT = rand(30, 75); sfx.roar(); ach('kometa'); msg(pick(['A roar from Hala Rondo: Kometa scores!', 'Drums and horns from Hala Rondo.', 'Hala Rondo groans: the visitors score.', 'A roar from Hala Rondo: Kometa scores!']), 2.5); }
    }
    if (h >= 20 && h < 20.8 && near(R, 700 * PXM) && peds.length < 260) {
      EGG.leaveT -= dt;
      if (EGG.leaveT <= 0) { EGG.leaveT = 0.3; const d = EA.rondo.door, p = makePed(d.x + rand(-10, 10), d.y + rand(-10, 10)); if (!solidAt(p.x, p.y)) Object.assign(p, { fan: true, shirt: Math.random() < 0.72 ? '#1d4fa0' : '#f4f4f4' }); else p.gone = true; }
    }
  }
  // Friday: the students go home for the weekend, suitcases to the main station; Sunday evening they come back
  const w = weekday();
  if (w === 5 && h >= 13 && h < 18.5) EGG.boosts.push({ x: EA.station.x, y: EA.station.y, r: 220 * PXM, a: 0.9 });
  if (w === 0 && h >= 17 && h < 22) EGG.boosts.push({ x: EA.station.x, y: EA.station.y, r: 220 * PXM, a: 0.8 });
  if (w === 5 && at(12)) msg('Friday: the students head home for the weekend, suitcases and all, to the main station.', 5);
  if (w === 0 && at(16)) msg('Sunday evening: the students are coming back to Brno.', 4);
  updateCows(dt, P0, near);
  updateZoo(dt, P0, you, near);
  updateSights(dt, P0, you, near);
  updateMonks(dt, h, near);
  updateDeadline(dt, h, at, P0, you, near);
}
// ---- the bells of Petrov at eleven: in 1645 the Swedes were to give up if Brno held out until noon; the bells rang noon
// an hour early, and they went. Wanted round here at eleven, up to five stars, the police take the hint too
function eggBells(P0, you) {
  if (d2(EA.petrov.x, EA.petrov.y, P0.x, P0.y) > (1500 * PXM) ** 2) return;
  sfx.bells();
  if (!you) return;
  const stars = Math.floor(heat);
  if (stars >= 1 && stars <= 5) {
    heat = Math.max(0, heat - 2); if (heat < 1) { heat = 0; caller = null; }
    ach('bells'); bigText('NOON AT ELEVEN', '#ffd27a', 4.5, heat < 1 ? 'Petrov rings noon an hour early, as in 1645: the police lift the siege' : 'Petrov rings noon an hour early, as in 1645: the siege eases');
  } else if (stars >= 6) msg('Petrov rings noon at eleven, but the state isn\'t as easily fooled as the Swedes were in 1645.', 4);
  else msg('Petrov rings noon at eleven, as it has since the Swedes gave up their siege of Brno in 1645.', 4);
}
// ---- the Brno dragon: past midnight the crocodile in the Old Town Hall's passage crawls out and hunts the old town. Bullets
// glance off it; what killed it in the legend was a calfskin stuffed with lime: it swallowed it, drank, and burst
function updateDragon(dt, h, at, P0, you, near) {
  const L = EA.hall; if (!L) return;
  const night = h < 4;
  let d = EGG.dragon;
  if (!d) {
    if (night && EGG.slain !== dayN && you && near(L, 1700)) {
      d = EGG.dragon = { x: L.x, y: L.y, a: rand(TAU), st: 'prowl', t: 0, tg: null, tgT: 0, bite: 0, eat: 0, hitT: 0, sway: 0, wx: L.x, wy: L.y, wT: 0, stuck: 0, told: false };
      if (near(L, 900) && eggOnce('dragon' + dayN, 'Past midnight the Brno dragon crawls out of the Old Town Hall passage.', 6)) msg('Bullets won\'t hurt it. The legend used a calfskin full of lime (the market on Zelný trh).', 6);
    }
    return;
  }
  if (!near(d, 3600)) { EGG.dragon = null; return; }
  d.t += dt; d.bite -= dt; d.hitT -= dt; d.sway += dt * (d.st === 'thirst' ? 14 : 8);
  if (!night && d.st === 'prowl') { d.st = 'home'; d.t = 0; if (near(d, 700)) msg('Dawn: the dragon crawls back into the Old Town Hall passage.', 3); }
  const head = () => [d.x + Math.cos(d.a) * 21, d.y + Math.sin(d.a) * 21];
  let gx = d.wx, gy = d.wy, sp = 58;
  if (d.eat > 0) { d.eat -= dt; sp = 0; }
  else if (d.st === 'prowl') {
    d.tgT -= dt;
    if (d.tgT <= 0) { // (whoever is nearest, within its patch of the old town)
      d.tgT = 0.5; d.tg = null; let bd = 270 * 270;
      const leash = (450 * PXM) ** 2;
      if (you && !player.cellar && d2(P0.x, P0.y, L.x, L.y) < leash) { const dd = d2(P0.x, P0.y, d.x, d.y) * 0.8; if (dd < bd) { bd = dd; d.tg = 'you'; } }
      for (const p of peds) if (!p.dead && !p.held && !p.vip && d2(p.x, p.y, L.x, L.y) < leash) { const dd = d2(p.x, p.y, d.x, d.y); if (dd < bd) { bd = dd; d.tg = p; } }
    }
    if (d.tg === 'you') { gx = P0.x; gy = P0.y; sp = 112; }
    else if (d.tg) { if (d.tg.dead || !peds.includes(d.tg)) d.tg = null; else { gx = d.tg.x; gy = d.tg.y; sp = 112; } }
    if (!d.tg) { d.wT -= dt; if (d.wT <= 0 || d2(d.x, d.y, d.wx, d.wy) < 30 * 30) { d.wT = rand(5, 9); for (let i = 0; i < 12; i++) { const a = rand(TAU), r = rand(40, 300 * PXM), x = L.x + Math.cos(a) * r, y = L.y + Math.sin(a) * r; if (!solidAt(x, y)) { d.wx = x; d.wy = y; break; } } } }
  } else if (d.st === 'thirst') {
    let w = null, wd = 1e18; for (const q of [...EA.drink, ...(EA.water ? [EA.water] : [])]) { const dd = d2(q.x, q.y, d.x, d.y); if (dd < wd) { wd = dd; w = q; } }
    if (w) { gx = w.x; gy = w.y; }
    sp = 150;
    if ((w && wd < 34 * 34) || d.t > 9) { eggDragonBurst(d); return; }
  } else if (d.st === 'home') { gx = L.x; gy = L.y; sp = 80; if (d2(d.x, d.y, L.x, L.y) < 24 * 24 || d.t > 30 || !near(d, 1100)) { EGG.dragon = null; return; } }
  // crawl: along the streets to where it is going (it can't go through buildings), straight at it once in sight
  if (sp > 0) {
    d.pT = (d.pT || 0) - dt;
    if (d.pT <= 0 || !d.path) { d.pT = 0.8; d.path = los(d.x, d.y, gx, gy) ? [] : eggPath(d.x, d.y, gx, gy) || []; }
    while (d.path.length && d2(d.path[0].x, d.path[0].y, d.x, d.y) < 14 * 14) d.path.shift();
    while (d.path.length > 1 && los(d.x, d.y, d.path[1].x, d.path[1].y)) d.path.shift();
    const tx = d.path.length ? d.path[0].x : gx, ty = d.path.length ? d.path[0].y : gy;
    d.a += clamp(wrapA(Math.atan2(ty - d.y, tx - d.x) - d.a), -4 * dt, 4 * dt);
    const px = d.x, py = d.y, f = Math.max(0.35, Math.cos(wrapA(Math.atan2(ty - d.y, tx - d.x) - d.a))); // (slows to turn)
    moveFree(d, Math.cos(d.a) * sp * f, Math.sin(d.a) * sp * f, dt, 6);
    if (Math.hypot(d.x - px, d.y - py) < sp * f * dt * 0.2) { d.stuck = (d.stuck || 0) + dt; if (d.stuck > 1) { d.stuck = 0; d.path = null; d.wT = 0; d.tgT = 0; d.a += rand(-2, 2); } } else d.stuck = 0;
  }
  // its jaws
  const [hx, hy] = head();
  if (d.tg && d.tg !== 'you' && d2(hx, hy, d.tg.x, d.tg.y) < 13 * 13 && !d.tg.dead) { killPed(d.tg, 'dragon'); d.eat = 1.4; d.tg = null; sfx.bite(); }
  if (you && !player.cellar) {
    if (player.lime && d2(hx, hy, P0.x, P0.y) < 46 * 46 && d.st === 'prowl') {
      player.lime = false; d.st = 'thirst'; d.t = 0; d.eat = 0.8; sfx.bite();
      msg('The dragon snapped up the calfskin and swallowed it, lime and all. Now it burns with thirst…', 4);
    } else if (d.st === 'prowl' && d.bite <= 0) {
      if (!player.car && d2(hx, hy, P0.x, P0.y) < 15 * 15) { hurtPlayer(22); d.bite = 1.1; shake = Math.max(shake, 0.6); sfx.bite(); }
      else if (player.car && d2(d.x, d.y, P0.x, P0.y) < 34 * 34) { damageCar(player.car, 30, null); d.bite = 1.3; shake = Math.max(shake, 0.8); sfx.bite(); }
    }
  }
  // cars that hit it: they come off worse
  if (d.hitT <= 0) for (const c of cars) {
    if (c.dead || c.lay === 1 || CT[c.type].boat || c.tram || d2(c.x, c.y, d.x, d.y) > 30 * 30) continue;
    const dx = c.x - d.x, dy = c.y - d.y, l = Math.hypot(dx, dy) || 1, sp0 = Math.abs(c.speed);
    c.x += dx / l * 6; c.y += dy / l * 6; c.speed *= -0.3; c.vx = dx / l * 60; c.vy = dy / l * 60;
    if (sp0 > 30) damageCar(c, 10 + sp0 * 0.12, null);
    moveFree(d, -dx / l * 120, -dy / l * 120, 0.05, 7); d.hitT = 0.4;
    if (c === player.car) { shake = Math.max(shake, 0.5); if (!d.told) { d.told = true; msg('Its hide is like armour: the dragon shrugs off cars and bullets.', 3); } }
    sfx.crash(); break;
  }
  // bullets glance off its scales; a rocket's blast just rocks it
  for (const b of bullets) {
    if (b.life <= 0) continue;
    const qx = b.x - b.vx * dt, qy = b.y - b.vy * dt, vx = b.x - qx, vy = b.y - qy, L2 = vx * vx + vy * vy || 1, u = clamp(((d.x - qx) * vx + (d.y - qy) * vy) / L2, 0, 1);
    if (d2(qx + vx * u, qy + vy * u, d.x, d.y) > 16 * 16) continue;
    const ix = qx + vx * u, iy = qy + vy * u;
    if (b.rocket) explode(ix, iy, 40, b.owner); else { for (let i = 0; i < 4; i++) addPart(ix, iy, rand(-120, 120), rand(-120, 120), 0.15, 1.5, '#ffe9a0'); }
    b.life = 0; if (b.owner === 'player' && !d.told) { d.told = true; msg('The bullets glance off its scales. The legend used lime.', 3); }
  }
}
// (the way there through the streets: a BFS over open tiles, as waypoints)
function eggPath(x0, y0, x1, y1, maxD = 120) {
  const sx = Math.floor(x0 / T), sy = Math.floor(y0 / T), gx = Math.floor(x1 / T), gy = Math.floor(y1 / T), g = gy * MW + gx;
  if (sx < 1 || sy < 1 || sx >= MW - 1 || sy >= MH - 1) return null;
  const st = ++bfsStamp, s0 = sy * MW + sx; let h = 0, tl = 0, best = s0, bd = 1e18; bfsQ[tl++] = s0; bfsSeen[s0] = st; bfsPrev[s0] = -1; bfsD[s0] = 0;
  while (h < tl) {
    const i = bfsQ[h++], d = bfsD[i], x = i % MW, y = (i / MW) | 0, dd = (x - gx) ** 2 + (y - gy) ** 2;
    if (dd < bd) { bd = dd; best = i; } if (i === g) break; if (d >= maxD) continue;
    for (let k = 0; k < 4; k++) { const nx = x + DX[k], ny = y + DY[k], j = ny * MW + nx; if (nx < 1 || ny < 1 || nx >= MW - 1 || ny >= MH - 1 || bfsSeen[j] === st || solidT(map[j])) continue; bfsSeen[j] = st; bfsPrev[j] = i; bfsD[j] = d + 1; bfsQ[tl++] = j; }
  }
  const path = []; for (let i = best; i !== s0 && i >= 0; i = bfsPrev[i]) path.push({ x: (i % MW + 0.5) * T, y: (((i / MW) | 0) + 0.5) * T });
  return path.reverse();
}
function eggDragonBurst(d) {
  for (let i = 0; i < 60; i++) addPart(d.x + rand(-14, 14), d.y + rand(-8, 8), rand(-160, 160), rand(-160, 160), rand(0.5, 1.2), rand(2, 5), pick(['#3f5a2a', '#5b7a3a', '#e8e4d8', '#9aa08a', '#2c4220']), 4, true);
  addDecal({ k: 'scorch', x: d.x, y: d.y, r: 14 }); sfx.boom(); shake = Math.max(shake, 1);
  EGG.dragon = null; EGG.slain = dayN;
  const P0 = pp();
  if (d2(d.x, d.y, P0.x, P0.y) < 1200 * 1200) { earn(5000); bigText('DRAGON SLAIN', '#7dff7a', 4.5, 'Lime, then water: it burst, as in the legend · +$5,000'); sfx.good(); ach('dragon'); }
}
// ---- Birk's wheel. In 1636 the wheelwright Jiří Birk bet he could fell a tree, make a wheel and roll it from Lednice to
// Brno between dawn and dusk, and won: the wheel hangs in the Old Town Hall's passage. It waits at the edge of town from
// five in the morning; roll it to the Old Town Hall before eight in the evening
function updateBirk(dt, h, at, P0, you, near) {
  const S = EA.wheel; if (!S || !EA.hall) return;
  let c = EGG.wheel;
  if (c && (!cars.includes(c) || c.dead)) { if (EGG.wheelSt === 'roll') { msg('Birk\'s wheel is lost: the wager with it.', 3); EGG.wheelSt = 'lost'; } c = EGG.wheel = null; }
  if (c) c.roll = (c.roll || 0) + c.speed * dt;
  if (EGG.wheelDay < 0 || at(5)) { // a new day: a new wheel at the edge of town
    EGG.wheelDay = dayN;
    if (EGG.wheelSt !== 'roll') {
      if (c && player.car !== c && !onScreen(c.x, c.y, 100)) { cars.splice(cars.indexOf(c), 1); c = EGG.wheel = null; }
      if (!c) { c = EGG.wheel = makeCar('wheel', S.x, S.y, S.a, null); c.parked = true; c.egg = 'wheel'; }
      EGG.wheelSt = 'wait';
    }
  }
  const day = h >= 5 && h < 20;
  if (c && player.car === c && EGG.wheelSt === 'wait') {
    if (day) { EGG.wheelSt = 'roll'; bigText('BIRK\'S WAGER', '#e0b070', 3.5, 'Roll the wheel to the Old Town Hall before sunset (20:00)'); msg('In 1636 the wheelwright Jiří Birk bet he could fell a tree and make a wheel of it,', 7); msg('then roll it from Lednice to Brno, all between dawn and dusk. He won.', 7); }
    else eggOnce('birknight' + dayN, 'Birk set out at dawn: the wager starts between five in the morning and eight in the evening.', 4);
  }
  if (EGG.wheelSt === 'roll') {
    if (!day) { EGG.wheelSt = 'lost'; bigText('SUNSET', '#e67e22', 3, 'Birk lost the wager'); sfx.bad(); }
    else if (c && d2(c.x, c.y, EA.hall.x, EA.hall.y) < 64 * 64) {
      EGG.wheelSt = 'won'; earn(4000); sfx.good();
      ach('birk'); bigText('BIRK WINS THE WAGER', '#ffd27a', 4.5, 'The wheel hangs in the Old Town Hall passage to this day · +$4,000');
      if (player.car === c) { player.car = null; const s = sideSpot(c) || c; player.x = s.x; player.y = s.y; }
      cars.splice(cars.indexOf(c), 1); EGG.wheel = null;
    }
  }
}
// ---- the cellars under the old town: down a hatch, through the dark, up at the next one; the police lose you there
const eggHatchAt = (x, y) => EA ? EA.hatches.findIndex(q => d2(q.x, q.y, x, y) < 16 * 16) : -1;
function enterCellar(i) {
  const H = EA.hatches, q = H[i];
  player.cellar = { t: 2.6, to: (i + 1) % H.length }; player.moving = false; sfx.hatch(); ach('cellars');
  if (heat >= 1) Object.assign(belief, { x: q.x, y: q.y, vx: 0, vy: 0, sig: Math.max(belief.sig, 300), seen: false, seeT: 1.5 });
}
function updateCellar(dt) {
  const c = player.cellar; c.t -= dt; belief.seen = false;
  if (c.t > 0) return;
  const q = EA.hatches[c.to]; player.cellar = null;
  player.x = q.x; player.y = q.y; player.angle = faceOpen(q.x, q.y); updateCamera(0, true); sfx.hatch();
  msg(`You climb out at ${q.name}.`, 2.5);
}
// ---- the cows on Kraví hora ("Cow Hill"): they graze round the observatory, and moo at whoever bumps them
function updateCows(dt, P0, near) {
  const K = EA.kravi;
  if (!A_GRASS().length) return;
  if (near(K, 1500)) { if (!EGG.cows.length) for (let i = 0; i < 5; i++) { const g = pick(A_GRASS()); EGG.cows.push({ x: g.x + rand(-8, 8), y: g.y + rand(-8, 8), a: rand(TAU), t: rand(0, 6), g: null, vx: 0, vy: 0, hit: 0, s: randi(0, 9999) }); } }
  else if (EGG.cows.length && !near(K, 2400)) EGG.cows = [];
  for (const w of EGG.cows) {
    w.hit -= dt;
    if (Math.abs(w.vx) + Math.abs(w.vy) > 2) { moveFree(w, w.vx, w.vy, dt, 5); w.vx *= Math.exp(-dt * 4); w.vy *= Math.exp(-dt * 4); }
    else if (w.t > 0) w.t -= dt;
    else {
      if (!w.g) { let b = null; for (let i = 0; i < 12; i++) { const g = pick(A_GRASS()); if (d2(g.x, g.y, w.x, w.y) < 110 * 110) { b = g; break; } } w.g = b || pick(A_GRASS()); }
      const dx = w.g.x - w.x, dy = w.g.y - w.y, l = Math.hypot(dx, dy);
      if (l < 4) { w.g = null; w.t = rand(4, 12); }
      else { w.a += clamp(wrapA(Math.atan2(dy, dx) - w.a), -dt, dt); const px = w.x, py = w.y; moveFree(w, Math.cos(w.a) * 9, Math.sin(w.a) * 9, dt, 5); if (Math.abs(w.x - px) + Math.abs(w.y - py) < 0.02) { w.g = null; w.t = rand(1, 3); } }
    }
    if (w.hit <= 0) for (const c of cars) {
      if (c.dead || c.lay === 1 || CT[c.type].boat || c.tram || d2(c.x, c.y, w.x, w.y) > 20 * 20) continue;
      const dx = w.x - c.x, dy = w.y - c.y, l = Math.hypot(dx, dy) || 1, sp = Math.abs(c.speed);
      w.vx = dx / l * (40 + sp * 0.4); w.vy = dy / l * (40 + sp * 0.4); w.hit = 1; w.t = rand(2, 4); w.g = null;
      c.speed *= 0.45; if (sp > 60) damageCar(c, 6 + sp * 0.04, null);
      if (onScreen(w.x, w.y)) sfx.moo();
      if (c === player.car) { eggOnce('cow', 'Moo. Kraví hora means Cow Hill.', 2.5); ach('cow'); }
      break;
    }
  }
}
const A_GRASS = () => EA.grass;
// ---- the animals on the loose: each keeps near its spot, wanders, rests, and is bumped aside by cars like the cows;
// the sea lion barks, the panda sits and eats, the jackal runs from you (and howls at night)
const ZOO = {
  sealion: { sp: 16, r: 7, meet: 70, line: 'A sea lion in Starý Lískovec! Nobody knows where it came from. Ar! Ar!' },
  panda: { sp: 11, r: 7, meet: 70, line: 'A giant panda between the Tesco and the Kaufland. It isn\'t saying which one it came out of.' },
  jackal: { sp: 46, r: 5, meet: 120, line: 'A golden jackal in Bystrc. They have spread into Moravia by themselves, from the Balkans.' },
};
function updateZoo(dt, P0, you, near) {
  for (const Z of EA.zoo) {
    let w = EGG.zoo.find(o => o.k === Z.k);
    if (!w) { if (!near(Z, 1500)) continue; const g = pick(Z.pts); w = { k: Z.k, x: g.x, y: g.y, a: rand(TAU), t: rand(0, 4), g: null, vx: 0, vy: 0, hit: 0, s: randi(0, 9999), run: 0, say: rand(2, 6), anim: 0 }; EGG.zoo.push(w); }
    else if (!near(Z, 2400)) { EGG.zoo = EGG.zoo.filter(o => o !== w); continue; }
    const D = ZOO[w.k], d = Math.hypot(w.x - P0.x, w.y - P0.y);
    w.hit -= dt; w.say -= dt;
    if (you && d < D.meet && eggOnce(w.k, D.line, 5)) { ach(w.k); sfx[w.k](); }
    if (w.k === 'jackal' && you && d < 130 && w.run <= 0) { w.run = 2.5; w.g = null; }
    if (w.run > 0) { // (away from you, at a run)
      w.run -= dt; const a = Math.atan2(w.y - P0.y, w.x - P0.x); w.a += clamp(wrapA(a - w.a), -dt * 6, dt * 6);
      moveFree(w, Math.cos(w.a) * 140, Math.sin(w.a) * 140, dt, D.r); w.anim += dt * 40;
    } else if (Math.abs(w.vx) + Math.abs(w.vy) > 2) { moveFree(w, w.vx, w.vy, dt, D.r); w.vx *= Math.exp(-dt * 4); w.vy *= Math.exp(-dt * 4); }
    else if (w.t > 0) w.t -= dt;
    else {
      if (!w.g) { let b = null; for (let i = 0; i < 12; i++) { const g = pick(Z.pts); if (d2(g.x, g.y, w.x, w.y) < 160 * 160) { b = g; break; } } w.g = b || pick(Z.pts); }
      const dx = w.g.x - w.x, dy = w.g.y - w.y, l = Math.hypot(dx, dy);
      if (l < 5) { w.g = null; w.t = w.k === 'panda' ? rand(8, 18) : w.k === 'sealion' ? rand(3, 9) : rand(1, 4); }
      else {
        w.a += clamp(wrapA(Math.atan2(dy, dx) - w.a), -dt * 2, dt * 2); const px = w.x, py = w.y;
        moveFree(w, Math.cos(w.a) * D.sp, Math.sin(w.a) * D.sp, dt, D.r); w.anim += dt * D.sp * 0.4;
        if (Math.abs(w.x - px) + Math.abs(w.y - py) < 0.02) { w.g = null; w.t = rand(1, 3); }
      }
    }
    if (w.hit <= 0) for (const c of cars) {
      if (c.dead || c.lay === 1 || CT[c.type].boat || c.tram || d2(c.x, c.y, w.x, w.y) > 18 * 18) continue;
      const dx = w.x - c.x, dy = w.y - c.y, l = Math.hypot(dx, dy) || 1, sp = Math.abs(c.speed);
      w.vx = dx / l * (40 + sp * 0.4); w.vy = dy / l * (40 + sp * 0.4); w.hit = 1; w.t = rand(2, 4); w.g = null;
      c.speed *= 0.5; if (sp > 60) damageCar(c, 4 + sp * 0.03, null);
      if (onScreen(w.x, w.y)) sfx[w.k]();
      break;
    }
    if (w.say <= 0) { w.say = rand(7, 15); if ((w.k === 'sealion' || (w.k === 'jackal' && darkness() > 0.3)) && d < 600 && onScreen(w.x, w.y, 300)) sfx[w.k](); }
  }
}
// ---- Moravské náměstí: walk under Jošt's horse; Justice, whose jet now and then soaks the pavement. ÚPT's quantum clock
function updateSights(dt, P0, you, near) {
  const J = EA.jost, S = EA.justice, C = EA.qclock;
  EGG.atClock = !!(you && C && near(C, 60));
  if (!you) return;
  if (J && near(J, 170)) {
    eggOnce('jost', 'Odvaha (Courage): Margrave Jošt on a horse eight metres tall. Brno likened it to a giraffe; you can walk right under it.', 6);
    if (!player.car && near(J, 14) && eggOnce('jostUnder', 'You walked under Jošt\'s horse.', 3)) ach('jost');
  }
  if (S && near(S, 150)) {
    eggOnce('justice', 'Spravedlnost (Justice): a man lifting a heavy block on a jet of water, outside the Supreme Administrative Court.', 6);
    EGG.splashT -= dt;
    if (!player.car && near(S, 30) && EGG.splashT <= 0) {
      EGG.splashT = 5;
      if (Math.random() < 0.6) {
        for (let k = 0; k < 18; k++) addPart(S.x + rand(-6, 6), S.y + rand(-6, 6), rand(-90, 90), rand(-90, 90), 0.6, 2.5, '#bfe6ff', 0, true);
        msg('Justice sprays you. On some days its jet soaks the pavement: Brno calls him the man stealing a bidet.', 5); ach('justice');
      }
    }
  }
  if (EGG.atClock && eggOnce('qclock', 'ÚPT\'s quantum clock: an optical atomic clock, the most precise time in Brno.', 4)) ach('qclock');
}
// ---- the Carthusians at FIT: the faculty's old monastery has its monks back at night, walking the cloister. They have
// taken a vow of silence: whatever they see, they won't call the police
function updateMonks(dt, h, near) {
  if (!EA.fit || !EA.cloister.length) return;
  const night = h >= 21.5 || h < 5;
  EGG.monks = EGG.monks.filter(m => peds.includes(m) && !m.dead && !m.gone);
  EGG.monkT = (EGG.monkT || 0) - dt;
  if (night && near(EA.fit, 1500) && EGG.monks.length < 4 && EGG.monkT <= 0) { // (one at a time, out of sight where it can)
    EGG.monkT = 1.5; let q = null;
    for (let i = 0; i < 8; i++) { q = pick(EA.cloister); if (!onScreen(q.x, q.y, 10)) break; }
    const m = makePed(q.x, q.y); Object.assign(m, { monk: true, shirt: '#ece6d6', hair: '#ddd5c6', pants: '#e4ddcc', speed: 15, mt: null, skin: pick(SKINS) });
    EGG.monks.push(m);
  } else if (!night) for (const m of EGG.monks) if (!onScreen(m.x, m.y, 40)) m.gone = true;
}
function monkStep(p, dt) {
  if (p.idle > 0) { p.idle -= dt; p.moving = false; return; }
  if (!p.mt || d2(p.x, p.y, p.mt.x, p.mt.y) < 9) {
    if (p.mt) { p.mt = null; p.idle = rand(2, 7); p.moving = false; return; }
    let q = null; for (let i = 0; i < 10; i++) { const c = pick(EA.cloister); if (d2(c.x, c.y, p.x, p.y) < 150 * 150 && los(p.x, p.y, c.x, c.y)) { q = c; break; } }
    p.mt = q || pick(EA.cloister);
  }
  const a = Math.atan2(p.mt.y - p.y, p.mt.x - p.x); p.angle = a; p.moving = true; p.anim += dt * 5;
  const px = p.x, py = p.y; moveFree(p, Math.cos(a) * p.speed, Math.sin(a) * p.speed, dt, 3);
  if (Math.abs(p.x - px) + Math.abs(p.y - py) < 0.02) p.mt = null;
}
// ---- the project due at 23:59: from a quarter to eleven at night a FIT student waits outside the dorms on Kolejní with
// a laptop. Stop by them, and get them to Božetěchova before midnight
const DL0 = 22.75, DL1 = 23 + 59 / 60;
function updateDeadline(dt, h, at, P0, you, near) {
  if (!EA.dorm || !EA.fitDoor) return;
  const s = EGG.student, m = mission;
  if (m && m.type === 'deadline') {
    if (player.car !== m.car) failMission('You left the student behind.');
    else if (h >= DL1 || h < 5) failMission('23:59 has passed: zero points.');
    else if (near(m, 40) && Math.abs(player.car.speed) < 160) {
      const late = hhmm(h); completeMission(1, 'SUBMITTED'); ach('deadline'); msg(`"Uploaded at ${late}. Thank you!"`, 3);
    }
    return;
  }
  const on = h >= DL0 && h < DL1 && EGG.deadDay !== dayN;
  if (on && !s) {
    if (at(DL0) || near(EA.dorm, 2600)) {
      const p = EGG.student = makePed(EA.dorm.x, EA.dorm.y); Object.assign(p, { vip: true, student: true, shirt: '#00a9e0', hp: 40 });
      if (near(EA.dorm, 30000)) msg('A FIT student at the Kolejní dorms needs a lift to Božetěchova: the project is due at 23:59.', 6);
    }
  } else if (s && (!on || s.dead || !peds.includes(s))) {
    if (s.dead || !peds.includes(s)) EGG.deadDay = dayN; else s.vip = false;
    EGG.student = null; return;
  }
  if (s && !mission && player.car && !player.car.tram && !CT[player.car.type].boat && !CT[player.car.type].bike && player.car.type !== 'wheel' && near(s, 46) && Math.abs(player.car.speed) < 40) {
    peds.splice(peds.indexOf(s), 1); EGG.student = null; EGG.deadDay = dayN;
    mission = { type: 'deadline', stage: 1, ped: s, car: player.car, x: EA.fitDoor.x, y: EA.fitDoor.y, reward: 3000 + randi(0, 4) * 250, timer: 0, arc: null };
    msg('"Božetěchova, please, and fast: the project is due at 23:59 and the upload is still running!"', 5); sfx.pickup();
  }
}
const eggTarget = wager => { // (where the arrow points, with no job on: the wager's goal first, then the student)
  if (!EA || NET.role === 'guest') return null;
  if (EGG.wheelSt === 'roll' && EA.hall) return EA.hall;
  if (wager) return null;
  if (EGG.student && !EGG.student.dead) return EGG.student;
  return null;
};
const eggLine = () => {
  if (!EA || EGG.wheelSt !== 'roll') return null;
  return { line: `Birk's wager: the wheel to the Old Town Hall by 20:00 · ${hhmm(dayT * 24)}`, arc: '', timer: 0 };
};
// (round Mendel's abbey the parked cars come in green and yellow, three to one: his peas' colours, in his ratio)
function eggParked(c) {
  if (!EA || d2(c.x, c.y, EA.mendel.x, EA.mendel.y) > (320 * PXM) ** 2) return;
  const yellow = c.spot && c.spot.mendel ? c.spot.mi % 4 === 3 : Math.random() >= 0.75; // (in his own spots, exactly three to one)
  c.color = yellow ? '#e8c62e' : '#3f8f3a'; c.mendel = true;
}
function eggGetIn(c) {
  if (!EA) return;
  if (c.mendel && eggOnce('mendel', c.color === '#e8c62e' ? 'A yellow one: recessive.' : 'A green one: dominant.', 6)) msg('Round Mendel\'s abbey the parked cars come green and yellow, three to one, like his peas.', 6);
  if (c.type === 'formula') eggOnce('formula', 'A Formula Student car from the mechanical engineering faculty: the fastest thing in town.', 4);
}
// ---- drawing
function drawEggs(v, pass) {
  if (!EA) return;
  const inV = (o, m = 60) => o && o.x > v.x0 - m && o.x < v.x1 + m && o.y > v.y0 - m && o.y < v.y1 + m;
  if (pass === 2) { if (B5 && EA.orloj && inV(EA.orloj, 120)) drawOrloj(EA.orloj); if (EA.justice && inV(EA.justice, 120)) drawJustice(EA.justice); if (EA.jost && inV(EA.jost, 170)) drawJost(EA.jost); if (EA.qclock && inV(EA.qclock, 100)) drawQClock(EA.qclock); }
  if (pass === 0) {
    for (const q of EA.hatches) if (inV(q)) { // an iron hatch in the paving
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(q.x - 7, q.y - 6, 15, 15);
      ctx.fillStyle = '#4a4d52'; ctx.fillRect(q.x - 8, q.y - 8, 16, 16); ctx.strokeStyle = '#2c2e32'; ctx.lineWidth = 1.2; ctx.strokeRect(q.x - 8, q.y - 8, 16, 16);
      ctx.beginPath(); ctx.moveTo(q.x - 8, q.y); ctx.lineTo(q.x + 8, q.y); ctx.moveTo(q.x, q.y - 8); ctx.lineTo(q.x, q.y + 8); ctx.stroke();
      ctx.fillStyle = '#8a8d92'; for (const [a, b] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) ctx.fillRect(q.x + a - 0.7, q.y + b - 0.7, 1.4, 1.4);
    }
    if (EA.orloj && inV(EA.orloj)) { // the orloj's four holes, and the marble rolling out of one
      const O = EA.orloj; ctx.fillStyle = '#050506';
      for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2; ctx.beginPath(); ctx.arc(O.x + Math.cos(a) * 8, O.y + Math.sin(a) * 8, 1.4, 0, TAU); ctx.fill(); }
      const m = EGG.marble;
      if (m) { const g = ctx.createRadialGradient(m.x - 0.6, m.y - 0.6, 0.2, m.x, m.y, 2.2); g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#9fe8ff'); g.addColorStop(1, '#2f7fa0'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(m.x, m.y, 2.2, 0, TAU); ctx.fill(); }
    }
    if (EA.board && inV(EA.board, 80)) drawBoard(EA.board);
  } else if (pass === 1) {
    for (const w of EGG.cows) if (inV(w, 30)) drawCow(w);
    for (const w of EGG.zoo) if (inV(w, 30)) drawAnimal(w);
    if (EGG.dragon && inV(EGG.dragon, 80)) drawDragon(EGG.dragon);
  } else if (pass === 2 && EA.jakub && inV(EA.jakub, 120)) { // (high on the wall: where the walls are drawn, lifted)
    const J = EA.jakub, k = 1 + J.z, x = cam.x + (J.x - cam.x) * k, y = cam.y + (J.y - cam.y) * k;
    ctx.save(); ctx.translate(x, y); ctx.rotate(J.a); ctx.scale(1.8, 1.8);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(-2.5, -2, 5, 5);
    ctx.fillStyle = '#cdbfa6'; ctx.beginPath(); ctx.ellipse(-1, 0, 2.4, 1.8, 0, 0, TAU); ctx.fill(); // (bent over)
    ctx.fillStyle = '#e2d6bf'; ctx.beginPath(); ctx.arc(1.5, -1, 1.25, 0, TAU); ctx.arc(1.5, 1, 1.25, 0, TAU); ctx.fill(); // (its bare backside, toward Petrov)
    ctx.fillStyle = '#b7a98f'; ctx.beginPath(); ctx.arc(-3.2, 0, 1.2, 0, TAU); ctx.fill();
    ctx.restore();
  }
}
function drawBoard(B) { // a billboard on two legs: the new main station, opening (always) twenty years from now
  const x = B.x, y = B.y;
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x - 30, y + 2, 64, 10);
  ctx.fillStyle = '#5a5e64'; ctx.fillRect(x - 20, y + 2, 3, 9); ctx.fillRect(x + 17, y + 2, 3, 9);
  ctx.fillStyle = '#1f4e8c'; ctx.fillRect(x - 32, y - 14, 64, 20); ctx.fillStyle = '#e8c43a'; ctx.fillRect(x - 32, y + 4, 64, 2);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
  ctx.font = 'bold 6px sans-serif'; ctx.fillText('NOVÉ HLAVNÍ NÁDRAŽÍ', x, y - 6);
  ctx.font = 'bold 7px sans-serif'; ctx.fillText(`OTEVŘENÍ ${new Date().getFullYear() + 20 + dayN}`, x, y + 2);
  ctx.textAlign = 'left';
}
function drawDragon(d) { // a crocodile seen from above: tail sweeping, legs paddling, its eyes catching the light
  ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.a);
  const s = Math.sin(d.sway), mv = d.eat > 0 ? 0 : 1;
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(2, 3, 26, 9, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#2f4a22';
  for (const [lx, ly, ph] of [[8, -7, 0], [8, 7, Math.PI], [-8, -7, Math.PI], [-8, 7, 0]]) { const o = Math.sin(d.sway + ph) * 3 * mv; ctx.beginPath(); ctx.ellipse(lx + o, ly + Math.sign(ly) * 2, 3.2, 2, 0.4 * Math.sign(ly), 0, TAU); ctx.fill(); }
  ctx.beginPath(); ctx.moveTo(-10, -5); // the tail, swinging
  for (let i = 1; i <= 6; i++) ctx.lineTo(-10 - i * 4.6, Math.sin(d.sway - i * 0.7) * i * 0.9 * mv - 5 + i * 0.8);
  for (let i = 6; i >= 1; i--) ctx.lineTo(-10 - i * 4.6, Math.sin(d.sway - i * 0.7) * i * 0.9 * mv + 5 - i * 0.8);
  ctx.lineTo(-10, 5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#4d6e33'; ctx.beginPath(); ctx.ellipse(0, 0, 14, 6.5, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#577a3a'; ctx.beginPath(); ctx.moveTo(10, -4.5); ctx.lineTo(25, -2.2); ctx.lineTo(26, 0); ctx.lineTo(25, 2.2); ctx.lineTo(10, 4.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#26391b'; for (let x = -24; x < 10; x += 3.4) ctx.fillRect(x, -0.8, 1.8, 1.6); // (the ridge of its back)
  if (d.eat > 0 || d.bite > 0.8) { ctx.fillStyle = '#f2efe4'; for (let x = 15; x < 25; x += 2.2) { ctx.fillRect(x, -2.6, 0.9, 0.9); ctx.fillRect(x, 1.7, 0.9, 0.9); } }
  ctx.fillStyle = NIGHT > 0.3 ? '#ffe25a' : '#c9a227'; ctx.beginPath(); ctx.arc(12.5, -3.2, 1.3, 0, TAU); ctx.arc(12.5, 3.2, 1.3, 0, TAU); ctx.fill();
  ctx.restore();
}
// ---- the animals, seen from above (facing +x)
function drawAnimal(w) {
  ctx.save(); ctx.translate(w.x, w.y); ctx.rotate(w.a);
  const g = Math.sin(w.anim * 3), rest = w.t > 0 && !(w.run > 0);
  if (w.k === 'sealion') { // sleek and brown, fore-flippers out, the tail flippers behind
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(2, 2, 12, 5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3e3024'; ctx.beginPath(); ctx.ellipse(3, -6 - g * 0.6, 4, 1.6, -0.5, 0, TAU); ctx.ellipse(3, 6 + g * 0.6, 4, 1.6, 0.5, 0, TAU); ctx.ellipse(-12, -2.2, 3, 1.3, 0.5, 0, TAU); ctx.ellipse(-12, 2.2, 3, 1.3, -0.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#6b5442'; ctx.beginPath(); ctx.ellipse(0, 0, 10.5, 4.6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(160,130,100,.45)'; ctx.beginPath(); ctx.ellipse(-1, -1.4, 7, 1.6, 0, 0, TAU); ctx.fill(); // (wet sheen)
    const hx = rest ? 9 + Math.sin(time * 2 + w.s) * 0.8 : 9.5;
    ctx.fillStyle = '#6b5442'; ctx.beginPath(); ctx.ellipse(hx, 0, 3.6, 3, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2a201a'; ctx.beginPath(); ctx.arc(hx + 3.2, 0, 1.1, 0, TAU); ctx.fill(); ctx.fillStyle = '#111'; ctx.fillRect(hx + 0.6, -1.9, 1, 1); ctx.fillRect(hx + 0.6, 0.9, 1, 1);
    ctx.strokeStyle = 'rgba(240,235,220,.7)'; ctx.lineWidth = 0.4; ctx.beginPath(); for (const v of [-1, 1]) { ctx.moveTo(hx + 3, v * 0.8); ctx.lineTo(hx + 5.6, v * 2.4); } ctx.stroke();
  } else if (w.k === 'panda') { // black and white, sitting with a bamboo stalk when it rests
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(2, 2, 9, 7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1b1b1b'; for (const [u, v] of [[4.5, -5.6], [4.5, 5.6], [-4.5, -5.4], [-4.5, 5.4]]) { ctx.beginPath(); ctx.ellipse(u + (u > 0 ? g : -g) * 0.6, v, 2.4, 1.9, 0, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#f1f0ea'; ctx.beginPath(); ctx.ellipse(0, 0, 8, 6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1b1b1b'; ctx.fillRect(2, -6, 2.6, 12); // (the black band over its shoulders)
    ctx.fillStyle = '#f1f0ea'; ctx.beginPath(); ctx.arc(8.6, 0, 4.1, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1b1b1b'; ctx.beginPath(); ctx.arc(7.4, -3.6, 1.5, 0, TAU); ctx.arc(7.4, 3.6, 1.5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(10.2, -1.6, 1.3, 0.9, 0.4, 0, TAU); ctx.ellipse(10.2, 1.6, 1.3, 0.9, -0.4, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(12.4, 0, 0.8, 0, TAU); ctx.fill();
    if (rest) { ctx.strokeStyle = '#6dbb4a'; ctx.lineWidth = 1.3; const b = Math.sin(time * 4 + w.s) * 0.8; ctx.beginPath(); ctx.moveTo(10, 4 + b); ctx.lineTo(17, 8 + b); ctx.stroke(); ctx.fillStyle = '#8fd46a'; ctx.beginPath(); ctx.ellipse(17.5, 8.5 + b, 2, 0.8, 0.5, 0, TAU); ctx.fill(); }
  } else { // the golden jackal: lean and tawny, a bushy tail with a dark tip
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(1, 2, 10, 4, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#7a5a30'; ctx.lineWidth = 1.2; ctx.beginPath(); for (const [u, v] of [[4, -2.6], [4, 2.6], [-4, -2.6], [-4, 2.6]]) { const o = (u > 0 ? g : -g) * (v > 0 ? 1 : -1) * 1.8; ctx.moveTo(u, v); ctx.lineTo(u + o, v * 1.5); } ctx.stroke();
    ctx.fillStyle = '#a07a44'; ctx.beginPath(); ctx.ellipse(-10, Math.sin(time * 5 + w.s) * 0.8, 4.2, 1.7, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#2a1e10'; ctx.beginPath(); ctx.arc(-13.6, 0, 1, 0, TAU); ctx.fill();
    ctx.fillStyle = '#c19a5b'; ctx.beginPath(); ctx.ellipse(0, 0, 8, 3.2, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#c9a466'; ctx.beginPath(); ctx.ellipse(8, 0, 3, 2.4, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(11, 0, 2, 1.2, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#8d6a3a'; ctx.beginPath(); ctx.moveTo(7, -1.8); ctx.lineTo(5.2, -4); ctx.lineTo(8.4, -2.4); ctx.moveTo(7, 1.8); ctx.lineTo(5.2, 4); ctx.lineTo(8.4, 2.4); ctx.fill();
    ctx.fillStyle = '#1a1208'; ctx.beginPath(); ctx.arc(12.8, 0, 0.7, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
// ---- what stands tall on the squares, drawn with the roofs and lifted by its height (a metre is PXM px; heights over HC)
const hexOf = (r, g, b) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
const ORLOJ_SH = Array.from({ length: 15 }, (_, i) => hexOf(12 + i * 2.2, 13 + i * 2.3, 16 + i * 2.6));
function drawOrloj(O) { // Brno's astronomical clock: a polished black granite bullet 5.9 m tall, rounded on top
  const H = 5.87 * PXM / HC, R = 6.5, n = ORLOJ_SH.length - 1;
  for (let i = 0; i <= n; i++) {
    const f = i / n, r = f < 0.7 ? R : R * Math.sqrt(Math.max(0, 1 - ((f - 0.7) / 0.3) ** 2));
    if (r < 0.5) continue;
    const [x, y] = proj(O.x, O.y, H * f); ctx.fillStyle = tint(ORLOJ_SH[i]); ctx.beginPath(); ctx.arc(x, y, r * (1 + H * f), 0, TAU); ctx.fill();
  }
  const [x, y] = proj(O.x, O.y, H * 0.82); ctx.strokeStyle = `rgba(255,255,255,${0.35 * (1 - NIGHT * 0.7)})`; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(x - 0.8, y - 0.8, R * 0.62, 3.3, 4.8); ctx.stroke(); // (the polish)
}
function drawJost(J) { // Odvaha: Margrave Jošt on a bronze horse whose legs reach six metres; you can walk under it
  const z = m => m * PXM / HC, ca = Math.cos(J.a), sa = Math.sin(J.a), at = (u, v, h) => proj(J.x + ca * u - sa * v, J.y + sa * u + ca * v, z(h));
  const br = tint('#52442f'), hi = tint('#7d6a48');
  if (SUN.on) { ctx.fillStyle = `rgba(12,18,40,${0.22 * (1 - NIGHT)})`; ctx.beginPath(); ctx.ellipse(J.x + SUN.sx * 36, J.y + SUN.sy * 36, 16, 7, J.a, 0, TAU); ctx.fill(); }
  ctx.strokeStyle = br; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
  for (const [u, v] of [[9, -3.5], [9, 3.5], [-9, -3.5], [-9, 3.5]]) { const a = at(u * 1.1, v * 1.4, 0), b = at(u, v, 5.6); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  ctx.lineCap = 'butt';
  const [bx, by] = at(0, 0, 6), k = 1 + z(6);
  ctx.save(); ctx.translate(bx, by); ctx.rotate(J.a); ctx.scale(k, k);
  ctx.strokeStyle = br; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(-12, 0); ctx.quadraticCurveTo(-18, 1, -19, 4); ctx.stroke(); // (the tail)
  ctx.fillStyle = br; ctx.beginPath(); ctx.ellipse(0, 0, 13, 5, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = hi; ctx.beginPath(); ctx.ellipse(-2, -1.4, 9, 2, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = br; ctx.beginPath(); ctx.ellipse(14, 0, 6, 2.6, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(20.5, 0, 4, 2.2, 0, 0, TAU); ctx.fill(); // (neck and head)
  ctx.restore();
  const [rx, ry] = at(-1, 0, 7.4), k2 = 1 + z(7.4);
  ctx.save(); ctx.translate(rx, ry); ctx.rotate(J.a); ctx.scale(k2, k2);
  ctx.fillStyle = tint('#463a28'); ctx.beginPath(); ctx.ellipse(-1.5, 0, 4.6, 5.6, 0, 0, TAU); ctx.fill(); // (his cloak)
  ctx.fillStyle = hi; ctx.beginPath(); ctx.arc(1.4, 0, 2.4, 0, TAU); ctx.fill();
  ctx.restore();
}
function drawJustice(S) { // Spravedlnost: a man bent under a heavy block that a jet of water holds up
  const z = m => m * PXM / HC, br = tint('#5c4a33'), hi = tint('#86704e');
  ctx.fillStyle = 'rgba(110,150,185,.28)'; ctx.beginPath(); ctx.ellipse(S.x, S.y, 15, 13, 0, 0, TAU); ctx.fill(); // (the wet stone)
  const [jx, jy] = proj(S.x, S.y, z(2.4));
  ctx.strokeStyle = 'rgba(205,238,255,.75)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(S.x, S.y); ctx.lineTo(jx, jy); ctx.stroke();
  const k1 = 1 + z(1.5), [mx, my] = proj(S.x - 3, S.y + 2.5, z(1.5));
  ctx.fillStyle = br; ctx.beginPath(); ctx.ellipse(mx, my, 3.4 * k1, 4.8 * k1, 0.4, 0, TAU); ctx.fill();
  ctx.fillStyle = hi; ctx.beginPath(); ctx.arc(mx - k1, my + 2.8 * k1, 2 * k1, 0, TAU); ctx.fill();
  const k2 = 1 + z(2.7), [bx, by] = proj(S.x, S.y, z(2.7));
  ctx.save(); ctx.translate(bx, by); ctx.rotate(0.3); ctx.scale(k2, k2);
  ctx.fillStyle = br; ctx.fillRect(-7.5, -5.5, 15, 11); ctx.fillStyle = hi; ctx.fillRect(-7.5, -5.5, 15, 2.6);
  ctx.restore();
  ctx.fillStyle = 'rgba(215,242,255,.85)';
  for (let i = 0; i < 12; i++) { const a = i * 2.4 + time * 0.7, f = (time * 1.3 + i * 0.37) % 1, r = 6 + f * 17, [px, py] = proj(S.x + Math.cos(a) * r, S.y + Math.sin(a) * r, z(2.5) * (1 - f)); ctx.fillRect(px - 0.8, py - 0.8, 1.6, 1.6); }
}
function drawQClock(C) { // ÚPT's quantum clock: a dial on a post, ringed by the violet glow of its lasers
  const z = 3.2 * PXM / HC, [x, y] = proj(C.x, C.y, z), k = 1 + z;
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(C.x + 4, C.y + 4, 6, 4, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = tint('#3a4450'); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(C.x, C.y); ctx.lineTo(x, y); ctx.stroke();
  ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(150,110,255,${0.22 + 0.15 * Math.sin(time * 3)})`; ctx.beginPath(); ctx.arc(x, y, 14 * k, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = tint('#2b3440'); ctx.beginPath(); ctx.arc(x, y, 10 * k, 0, TAU); ctx.fill();
  ctx.fillStyle = '#eef3ff'; ctx.beginPath(); ctx.arc(x, y, 8 * k, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#2b3440'; ctx.lineWidth = 0.8; ctx.beginPath(); for (let i = 0; i < 12; i++) { const a = i * TAU / 12; ctx.moveTo(x + Math.cos(a) * 6.4 * k, y + Math.sin(a) * 6.4 * k); ctx.lineTo(x + Math.cos(a) * 7.6 * k, y + Math.sin(a) * 7.6 * k); } ctx.stroke();
  const hh = dayT * 24, hand = (a, l, w, c) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a - Math.PI / 2) * l * k, y + Math.sin(a - Math.PI / 2) * l * k); ctx.stroke(); };
  hand((hh % 12) / 12 * TAU, 4.2, 1.6, '#1d2330'); hand((hh % 1) * TAU, 6.4, 1.1, '#1d2330'); hand(((hh * 60) % 1) * TAU, 7, 0.6, '#c0392b');
  ctx.fillStyle = '#7c4dff'; ctx.beginPath(); ctx.arc(x, y, 1.2 * k, 0, TAU); ctx.fill();
}
function drawCow(w) {
  ctx.save(); ctx.translate(w.x, w.y); ctx.rotate(w.a);
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(2, 2, 9, 5, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#f4f1ea'; ctx.beginPath(); ctx.ellipse(0, 0, 9, 5, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#1e1e1e'; for (let i = 0; i < 3; i++) { const r = ((w.s >> (i * 3)) & 7) / 7; ctx.beginPath(); ctx.ellipse(-5 + i * 4.5, (r - 0.5) * 5, 2.2, 1.7, r * 3, 0, TAU); ctx.fill(); }
  const g = w.t > 0 ? Math.sin(time * 3 + w.s) * 0.8 : 0;
  ctx.fillStyle = '#e9e4d8'; ctx.beginPath(); ctx.ellipse(10 + g, 0, 3.4, 2.6, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#d99a9a'; ctx.beginPath(); ctx.ellipse(12.6 + g, 0, 1.4, 1.9, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#2a2a2a'; ctx.fillRect(8.5 + g, -3.8, 1.6, 1.4); ctx.fillRect(8.5 + g, 2.4, 1.6, 1.4);
  ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-12, Math.sin(time * 2 + w.s) * 1.5); ctx.stroke();
  ctx.restore();
}
function drawWheelCar(c) { // Birk's wheel, seen from above: the rim on edge, the hub out to both sides, and whoever rolls it
  ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.angle);
  ctx.fillStyle = 'rgba(0,0,0,.3)'; rrect(-9, -1, 22, 6, 3);
  if (c.driver === 'player') {
    const sw = Math.sin((c.roll || 0) * 0.12) * 3;
    ctx.fillStyle = player.pants || '#2c3e50'; ctx.fillRect(-17 + sw, -3.5, 4, 2.4); ctx.fillRect(-17 - sw, 1.1, 4, 2.4);
    ctx.fillStyle = player.shirt; ctx.beginPath(); ctx.ellipse(-15, 0, 3.4, 5.6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = player.skin; ctx.fillRect(-13, -4.2, 4, 1.6); ctx.fillRect(-13, 2.6, 4, 1.6);
    ctx.beginPath(); ctx.arc(-14.5, 0, 3, 0, TAU); ctx.fill(); ctx.fillStyle = player.hair; ctx.beginPath(); ctx.arc(-15.5, 0, 3, Math.PI * 0.5, Math.PI * 1.5); ctx.fill();
  }
  ctx.fillStyle = c.dead ? '#2a2018' : '#6b4423'; rrect(-11, -2.6, 22, 5.2, 2.6);
  ctx.fillStyle = '#3e2914'; const ph = ((c.roll || 0) % 5.5 + 5.5) % 5.5; for (let x = -11 + ph; x < 11; x += 5.5) ctx.fillRect(x, -2.6, 1.1, 5.2); // (the felloes' joints rolling by)
  ctx.fillStyle = '#4a3018'; ctx.fillRect(-2.2, -5, 4.4, 10); ctx.fillStyle = '#2b2b2b'; ctx.fillRect(-1, -5.5, 2, 11);
  ctx.restore();
}
function drawFormula(c) { // an open-wheeler: wings front and back, the wheels out in the air, the driver's helmet
  ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.angle);
  ctx.fillStyle = 'rgba(0,0,0,.3)'; rrect(-12, -5, 28, 12, 3);
  ctx.fillStyle = '#141414'; for (const [x, y, l, w] of [[8, -6.8, 5.5, 3.2], [8, 3.6, 5.5, 3.2], [-9.5, -7.4, 6.5, 3.8], [-9.5, 3.6, 6.5, 3.8]]) ctx.fillRect(x - l / 2, y, l, w);
  const col = c.dead ? '#242424' : c.color;
  ctx.fillStyle = c.dead ? '#1a1a1a' : '#c0392b'; ctx.fillRect(12, -6.5, 2.6, 13); ctx.fillRect(-15, -6, 3, 12);
  ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(5, -3); ctx.lineTo(-4, -3.4); ctx.lineTo(-6, -5.6); ctx.lineTo(-11, -5.6); ctx.lineTo(-13, -2.5); ctx.lineTo(-13, 2.5); ctx.lineTo(-11, 5.6); ctx.lineTo(-6, 5.6); ctx.lineTo(-4, 3.4); ctx.lineTo(5, 3); ctx.closePath(); ctx.fill();
  if (!c.dead) { ctx.fillStyle = '#1f5fbf'; ctx.fillRect(-2, -0.7, 15, 1.4); ctx.fillStyle = '#111'; ctx.beginPath(); ctx.ellipse(-3.5, 0, 3.6, 2.4, 0, 0, TAU); ctx.fill(); }
  if (c.driver && !c.dead) { ctx.fillStyle = c.driver === 'player' ? '#ffd23f' : '#e0e0e0'; ctx.beginPath(); ctx.arc(-3.5, 0, 2.1, 0, TAU); ctx.fill(); }
  ctx.restore();
}
function drawLime(x, y) { // a calfskin, stitched up round its load of quicklime
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x + 2, y + 2, 8, 5, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#b08a5a'; ctx.beginPath(); ctx.ellipse(x, y, 8, 5, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#6e5232'; ctx.beginPath(); ctx.ellipse(x - 2, y - 1, 2.5, 1.6, 0.3, 0, TAU); ctx.ellipse(x + 3, y + 1.5, 2.2, 1.3, -0.2, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#f2eee2'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x - 6, y); for (let i = -5; i <= 6; i += 2) ctx.lineTo(x + i, y + (i & 2 ? -1 : 1)); ctx.stroke();
}
function drawDuck(x, y) { // a yellow rubber duck
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(x + 1.5, y + 2, 6, 4, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffd83d'; ctx.beginPath(); ctx.ellipse(x - 1, y + 1, 6, 4.2, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(x + 3.5, y - 2.5, 3.2, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ff8a1f'; ctx.beginPath(); ctx.moveTo(x + 6, y - 3.2); ctx.lineTo(x + 9, y - 2.4); ctx.lineTo(x + 6, y - 1.4); ctx.fill();
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x + 4.2, y - 3.4, 0.7, 0, TAU); ctx.fill();
}
function drawEggsHUD() {
  if (EGG.atClock && EA && EA.qclock && state === 'play') { // ÚPT's clock: the exact time, and what is coming up in Brno
    const w = Math.min(390, W - 24), x = W - w - 12, y = 172, hh = dayT * 24, p2 = n => String(n).padStart(2, '0');
    const fmt = E => `${p2(Math.floor(E))}:${p2(Math.round((E % 1) * 60))}`;
    const ev = [[11, 'the orloj\'s marble, Petrov\'s noon'], [0, 'the dragon comes out'], [5, 'Birk\'s wheel waits']];
    if (matchDay()) ev.push([17.5, 'Kometa\'s face-off']);
    if (weekday() === 5) ev.push([12, 'students head home']);
    const up = ev.map(([E, t]) => ({ E, t, d: ((E - hh) % 24 + 24) % 24 })).sort((a, b) => a.d - b.d).slice(0, 3);
    const body = wrapLines('Strontium atoms held in a lattice of laser light tick 429,228,004,229,873 times a second. A clock like this would drift by less than a second over the age of the universe.', w - 24, '12px system-ui, sans-serif');
    const lib = wrapLines('Game liberty: no such clock stands at the gate. The Institute of Scientific Instruments works on lasers, electron microscopes and precise measurement.', w - 24, 'italic 11px system-ui, sans-serif');
    const h = 76 + body.length * 15 + 20 + up.length * 16 + 8 + lib.length * 14 + 10;
    ctx.fillStyle = 'rgba(12,8,30,.86)'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = '#9f7bff'; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h);
    txt('ÚPT AV ČR · THE QUANTUM CLOCK', x + 12, y + 20, 12, '#b9a2ff');
    const sec = (hh * 3600) % 60;
    txt(`${p2(Math.floor(hh))}:${p2(Math.floor((hh % 1) * 60))}:${sec.toFixed(9).padStart(12, '0')}`, x + 12, y + 50, 22, '#ffffff');
    ctx.textAlign = 'left'; ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = '#d8d0ff'; body.forEach((l, i) => ctx.fillText(l, x + 12, y + 72 + i * 15));
    let yy = y + 72 + body.length * 15 + 10;
    ctx.font = 'bold 12px system-ui, sans-serif'; ctx.fillStyle = '#ffe14d'; ctx.fillText('Coming up in Brno', x + 12, yy); yy += 16;
    ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = '#e8e8f0';
    for (const u of up) { ctx.textAlign = 'left'; ctx.fillText(`${fmt(u.E)}  ${u.t}`, x + 12, yy); ctx.textAlign = 'right'; ctx.fillText(`in ${Math.floor(u.d)} h ${p2(Math.floor((u.d % 1) * 60))} min`, x + w - 12, yy); yy += 16; }
    ctx.textAlign = 'left';
    ctx.font = 'italic 11px system-ui, sans-serif'; ctx.fillStyle = '#a99fd0'; lib.forEach((l, i) => ctx.fillText(l, x + 12, yy + 6 + i * 14));
  }
  if (player.cellar) { // in the dark under the old town: a candle, the vaults
    const c = player.cellar, f = clamp(Math.min(2.6 - c.t, c.t) * 3, 0, 1);
    ctx.fillStyle = `rgba(6,5,4,${0.93 * f})`; ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, 160 + Math.sin(time * 9) * 6); g.addColorStop(0, `rgba(255,190,90,${0.35 * f})`); g.addColorStop(1, 'rgba(255,190,90,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = f; txt('Through the cellars under the old town…', W / 2, H / 2 + 60, 16, '#e8d2a8', 'center'); ctx.globalAlpha = 1;
  }
}
const eggBadges = () => (player.marble ? '◉ ' : '') + (player.lime ? 'lime ' : '') + (DBG.duck ? '🦆 ' : '');
const eggDots = () => { const o = []; if (!EA) return o; if (EGG.dragon) o.push({ x: EGG.dragon.x, y: EGG.dragon.y, c: '#7dff7a' }); if (EGG.student) o.push({ x: EGG.student.x, y: EGG.student.y, c: '#00a9e0' }); if (EGG.wheelSt === 'roll' && EA.hall) o.push({ x: EA.hall.x, y: EA.hall.y, c: '#e0b070' }); return o; };

// ---- Hantec, Brno's own slang: type "hantec" (or "hantec" in the debug console) and the game's messages speak it. The
// big words and the commonest messages whole (some put together from the dictionaries' words), elsewhere the words and
// the places as Brno says them: šalina, švestky, fáro, štatl, Svoboďák, Zelňák, Špilas, Rola, Prýgl, Monte Bú... (from
// the Czech Wikipedia's Hantec, Wiktionary, hantec.cz and the like)
// (on the Brno map a browser set to Czech starts with it on; whatever you switch it to yourself is kept, on either map)
const HANTEC_CZ = (() => { try { return BRNO && /^cs\b/i.test((navigator.languages && navigator.languages[0]) || navigator.language || ''); } catch (e) { return false; } })();
let HANTEC_SET = false; // (switched by hand at some point)
var HANTEC_ON = (() => { try { const v = localStorage.getItem('qta.hantec'); if (v === '1' || v === '0') { HANTEC_SET = true; return v === '1'; } } catch (e) { /* storage unavailable */ } return HANTEC_CZ; })();
const hxw = (s, f = 'giu') => new RegExp(`(?<![\\p{L}\\p{N}])(?:${s})(?![\\p{L}\\p{N}])`, f);
const HX_WHOLE = [
  [/^WASTED$/, 'JE TO V KAKÁČU'], [/^BUSTED$/, 'ŠÓPLI TĚ DO KAMEŇA'], [/^JOB DONE$/, 'HOKNA HOTOVÁ'], [/^JOB FAILED$/, 'JE TO KRÉN'],
  [/^CITY CONQUERED$/, 'ŠTATL JE TVOJE'], [/^ARC COMPLETE$/, 'ŠPICA!'],
  [/^You got wasted\.$/, 'Zgebnuls.'], [/^You got busted\.$/, 'Čapli tě.'], [/^Out of time\.$/, 'Pozdě, je to v kakáču.'],
  [/^Fine (\$[\d,]+) · weapons confiscated$/, 'Flastr $1 · bóchačky sebrali'],
  [/^Carjacked an? (.+)!$/, 'Čórnuls $1!'], [/^You jacked a cop car\. Bold\.$/, 'Čórnuls fáro švestkám. Špica!'],
  [/^Welcome to (.+)\. Find a ride, any ride\.$/, '$1: čau! Čórni si nějaký fáro.'],
  [/^A witness called the police\.$/, 'Svědek zavolal švestky.'], [/^Someone saw that and is calling the police\.$/, 'Někdo to viděl a volá švestky.'],
  [/^Your car is on fire\. Get out!$/, 'Fáro hoří. Vypadni, pila pali!'],
  [/^Next stop: /, 'Příští štace: '], [/^Job: /, 'Hokna: '], [/^JOB /, 'HOKNA '],
];
const HX_WORD = [ // [regex, Hantec]: the case of the first letter is kept
  [hxw('the police'), 'švestky'], [hxw('police'), 'švestky'], [hxw('cops'), 'hémoni'], [hxw('cop'), 'hémon'],
  [hxw('trams'), 'šaliny'], [hxw('tram'), 'šalina'], [hxw('city'), 'štatl'], [hxw('cars'), 'fára'], [hxw('car'), 'fáro'],
  [hxw('kids'), 'šropi'], [hxw('kid|child'), 'kindoš'], [hxw('hospital'), 'špitál'], [hxw('prison|jail'), 'kameň'], [hxw('beer'), 'škopek'],
  [hxw('money'), 'love'], [hxw('wallet'), 'šrajtofla'], [hxw('reservoir'), 'Prýgl'], [hxw('fine'), 'flastr'], [hxw('nice one'), 'špica'],
  // the places, as Brno calls them
  [hxw('(?:Brno )?[Hh]lavní nádraží', 'gu'), 'Rola'], [hxw('[Nn]áměstí Svobody', 'gu'), 'Svoboďák'], [hxw('Zelný trh', 'gu'), 'Zelňák'],
  [hxw('Moravské náměstí', 'gu'), 'Moravák'], [hxw('Mendlovo náměstí', 'gu'), 'Mendlák'], [hxw('Malinovského náměstí', 'gu'), 'Maliňák'],
  [hxw('(?:Hrad )?Špilberk', 'gu'), 'Špilas'], [hxw('Brněnská přehrada', 'gu'), 'Prýgl'], [hxw('Lužánky', 'gu'), 'Augec'],
  [hxw('Kraví hora', 'gu'), 'Monte Bú'], [hxw('Královo Pole', 'gu'), 'Kénig'], [hxw('Černá Pole', 'gu'), 'Blekfíld'],
  [hxw('Židenice', 'gu'), 'Šimice'], [hxw('Komárov', 'gu'), 'Komec'], [hxw('Bystrc', 'gu'), 'Bástr'], [hxw('Žabovřesky', 'gu'), 'Žabiny'],
  [hxw('Kohoutovice', 'gu'), 'Kohótky'], [hxw('Česká', 'gu'), 'Čára'], [hxw('Pisárky', 'gu'), 'Šrajbec'], [hxw('Staré Brno', 'gu'), 'Oltec'],
  [hxw('Výstaviště', 'gu'), 'Výstec'], [hxw('Zvonařka', 'gu'), 'Zvonec'], [hxw('Zbrojovka', 'gu'), 'Flinta'], [hxw('Prague', 'gu'), 'Prágl'],
];
const hxCase = (m, to) => m.length > 1 && m === m.toUpperCase() && m !== m.toLowerCase() ? to.toUpperCase() : m[0] !== m[0].toLowerCase() ? to[0].toUpperCase() + to.slice(1) : to;
function hx(s) {
  if (!s) return s;
  for (const [re, to] of HX_WHOLE) s = s.replace(re, to);
  for (const [re, to] of HX_WORD) s = s.replace(re, m => hxCase(m, to));
  return s;
}
const hxs = s => HANTEC_ON && s ? hx(s) : s;
function hantecToggle() {
  HANTEC_ON = !HANTEC_ON; HANTEC_SET = true; try { localStorage.setItem('qta.hantec', HANTEC_ON ? '1' : '0'); } catch (e) { /* storage unavailable */ }
  msg(HANTEC_ON ? 'Hantec: špica! The štatl speaks Brno now (type "hantec" again to stop).' : 'Hantec off.', 5);
  if (HANTEC_ON) ach('hantec');
}

// ============================================================ online co-op: two browsers, one world
// The host's browser runs the whole simulation; the guest's sends its keys and draws what the host sends back about
// 15 times a second. Rooms are found through PeerJS's public broker, loaded only when someone opens the co-op menu.
const NET = { role: null, peer: null, conn: null, code: '', guest: null, hostCam: null, idc: 0, snapT: 0, ev: [], inGuest: false,
  ents: new Map(), mt: null, mx: null, other: null, sendT: 0, queued: [], last: 0, pkSent: '' };
const PEERJS = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
function loadPeer() {
  if (window.Peer) return Promise.resolve();
  return new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = PEERJS; sc.onload = res; sc.onerror = () => rej(new Error('could not load PeerJS')); document.head.appendChild(sc); });
}
// sounds made on the guest's behalf are played on the guest's machine instead
for (const k of Object.keys(sfx)) { const f = sfx[k]; sfx[k] = (...a) => NET.inGuest ? void NET.ev.push(['sfx', k]) : f(...a); }
// the host runs the guest's turn by swapping in the guest's player, keys, camera, quantum gear and messages
const SIDE = ['player', 'keys', 'pressed', 'Q', 'cam', 'msgs', 'overlay', 'curDistrict', 'spawnT', 'policeCd', 'serviceCd', 'rbCd'];
function asGuest(fn) {
  const g = NET.guest; if (!g || NET.inGuest) return fn();
  const save = [player, keys, pressed, Q, cam, msgs, overlay, curDistrict, spawnT, policeCd, serviceCd, rbCd];
  [player, keys, pressed, Q, cam, msgs, overlay, curDistrict, spawnT, policeCd, serviceCd, rbCd] = SIDE.map(k => g[k]);
  NET.inGuest = true;
  try { return fn(); } finally {
    NET.inGuest = false;
    for (const m of msgs) NET.ev.push(['msg', m.text, m.t]); msgs.length = 0; // what the guest is told goes over the wire
    if (overlay && overlay !== g.sentOv) { NET.ev.push(['big', overlay.text, overlay.color, overlay.t, overlay.sub]); g.sentOv = overlay; }
    if (Q.note && Q.note !== g.sentNote) { NET.ev.push(['note', Q.note.k]); g.sentNote = Q.note; }
    SIDE.forEach((k, i) => { if (k !== 'msgs') g[k] = [player, keys, pressed, Q, cam, msgs, overlay, curDistrict, spawnT, policeCd, serviceCd, rbCd][i]; });
    [player, keys, pressed, Q, cam, msgs, overlay, curDistrict, spawnT, policeCd, serviceCd, rbCd] = save;
  }
}
function addGuest() {
  NET.shown = new Set();
  const near = tileCenter(findTileNear(Math.floor(player.x / T) + 1, Math.floor(player.y / T), WALK));
  NET.hostCam = cam;
  ach('coop');
  NET.guest = { player: { x: near.x, y: near.y, vx: 0, vy: 0, angle: 0, hp: 100, car: null, weapons: {}, weapon: null, cash: 0, lives: 5, mult: 1, anim: 0, moving: false,
    shootCd: 0, bust: 0, down: 0, downKind: null, hidden: false, tunT: time, tunRoll: 0, shirt: '#2ee88a', skin: '#c68642', hair: '#2a1a0a', pants: '#24304a', isGuest: true, inPsi: false },
    keys: { up: 0, down: 0, left: 0, right: 0, fire: 0 }, pressed: {}, cam: { x: near.x, y: near.y, zoom: cam.zoom }, msgs: [], overlay: null, curDistrict: -1,
    Q: { psi: 1, ent: 2, link: null, linkT: 0, decoy: null, decoyT: 0, branches: null, supT: 0, grace: 0, obsT: 0, notes: new Set(), note: null }, spawnT: 0, policeCd: 0, serviceCd: 0, rbCd: 6 };
  msg('Your friend joined: they are the one in green.', 4);
  NET.ev.push(['msg', 'Connected. You are the one in green; your friend runs the world.', 5]);
}
function dropGuest(why) {
  const g = NET.guest; if (!g) return;
  if (g.player.car && g.player.car.driver === 'player') g.player.car.driver = null;
  NET.guest = null; cam = NET.hostCam || cam; NET.conn = null;
  if (why) msg(why, 4);
}
// ---- the host: a snapshot of everything near the guest, plus what happened since the last one
const nid = o => o.nid || (o.nid = ++NET.idc);
function hostSnap() {
  const g = NET.guest, gp = g.player, v = viewRect(420, g.cam), inV = o => o.x > v.x0 && o.x < v.x1 && o.y > v.y0 && o.y < v.y1;
  const was = NET.shown || new Set(), now = new Set(); // (ids the guest had in its last snapshot know their looks already)
  const C = cars.filter(inV).map(c => { const i = nid(c); now.add(i); return [i, c.x | 0, c.y | 0, +c.angle.toFixed(2), (c.dead ? 1 : 0) | (c.chase ? 2 : 0) | (c.fire > 0 ? 4 : 0) | (c.driver ? 8 : 0)
    | (c.twin || c.linked || c.decoy ? 16 : 0) | (c.job ? 32 : 0) | (c.driver === 'player' ? 64 : 0) | (c.driver === 'eve' ? 128 : 0) | (c.lay === 1 ? 256 : c.lay === 2 ? 512 : c.lay === 3 ? 1024 : c.lay === 4 ? 2048 : 0), c.hp | 0, c.turret == null ? 0 : +c.turret.toFixed(2), c.speed | 0, ...(was.has(i) ? [] : [c.type, c.color])]; });
  const P = peds.filter(inV).map(p => { const i = nid(p); now.add(i); return [i, p.x | 0, p.y | 0, +p.angle.toFixed(1), (p.dead ? 1 : 0) | (p.cop ? 2 : 0) | (p.swat ? 4 : 0) | (p.moving ? 8 : 0) | (p.burnt ? 16 : 0), +(p.anim || 0).toFixed(1), ...(was.has(i) ? [] : [p.shirt, p.skin, p.hair, p.pants || 0])]; });
  NET.shown = now;
  const B = bullets.filter(inV).map(b => [b.x | 0, b.y | 0, b.rocket ? 1 : 0]);
  const TR = trams.filter(inV).map(t => [t.id, t.R.i, Math.round(t.s), t.prev ? t.prev.i : -1, TRAM_MODELS.indexOf(t.m), (t.doors > 0.3 ? 1 : 0) | (t.dead ? 2 : 0), Math.round(t.v)]);
  const tg = missionTarget(), ml = missionLine(), gq = g.Q;
  const pk = pickups.map(u => u.cd > 0 ? 0 : 1).join('');
  const snap = { t: 's', time: +time.toFixed(2), dayT: +dayT.toFixed(5), dn: dayN, heat: +heat.toFixed(2), bel: [belief.x | 0, belief.y | 0, belief.sig | 0, belief.seen ? 1 : 0],
    fl: flight.on ? [flight.x | 0, +flight.alt.toFixed(2)] : 0, TR, he: heli ? [heli.x | 0, heli.y | 0, +heli.angle.toFixed(2), +heli.rot.toFixed(2), heli.dead ? 1 : 0, +(heli.fall || 0).toFixed(2), heli.army ? 1 : 0] : 0, C, P, B, hq: HQ,
    me: [gp.x | 0, gp.y | 0, +gp.angle.toFixed(2), gp.hp | 0, gp.car ? nid(gp.car) : 0, gp.weapons, gp.weapon, gp.cash | 0, gp.lives, gp.mult, +gp.down.toFixed(2), gp.downKind, gp.moving ? 1 : 0, +gp.anim.toFixed(1), gq.psi, gq.ent, gq.link ? nid(gq.link) : 0, gq.branches ? gq.branches.map(b => [b.x | 0, b.y | 0, +b.angle.toFixed(2), b.tint, +(b.amp || 0).toFixed(2)]) : 0, +(gp.tunT ?? time).toFixed(1)],
    ho: [player.x | 0, player.y | 0, +player.angle.toFixed(2), player.car ? nid(player.car) : 0, player.hidden || (player.down && player.downKind === 'busted') ? 1 : 0, player.moving ? 1 : 0, +player.anim.toFixed(1), player.down && player.downKind === 'wasted' ? 1 : 0],
    mt: tg ? [tg.x | 0, tg.y | 0, mission ? 1 : 0] : 0, ml, dr: drops.map(u => [u.id, u.x | 0, u.y | 0, DROP_K.indexOf(u.k), +u.age.toFixed(1)]), rg: ringing ? BOOTHS.indexOf(ringing) : -1, ev: NET.ev };
  if (pk !== NET.pkSent) { snap.pk = pk; NET.pkSent = pk; }
  NET.ev = [];
  const ch = NET.conn.dataChannel; if (ch && ch.bufferedAmount > 200000) { NET.shown = was; NET.ev = snap.ev; return; } // a slow link: skip this one rather than queue up lag
  try { NET.conn.send(snap); } catch (e) { /* the channel closed under us */ }
}
function onHostData(d) {
  const g = NET.guest; if (!g || !d) return;
  if (d.t === 'i') { // the guest's keys
    g.keys.up = d.k[0]; g.keys.down = d.k[1]; g.keys.left = d.k[2]; g.keys.right = d.k[3]; g.keys.fire = d.k[4];
    for (const c of d.p) g.pressed[c] = true;
    g.lastIn = performance.now();
    // a hidden tab gets no animation frames, so while the host's tab is in the background (or its window covered)
    // the guest's messages, which keep arriving about 30 times a second, drive the world instead
    if (document.hidden) hostBackgroundStep();
  }
}
function hostBackgroundStep() {
  const now = performance.now(), dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
  if (dt <= 0 || (state !== 'play' && state !== 'pause')) return;
  if (state === 'play') for (let t = dt; t > 1e-4; t -= 0.05) { const h = Math.min(0.05, t); updateWorld(h); updateCamera(h); }
  NET.snapT -= dt; if (NET.snapT <= 0) { NET.snapT = state === 'play' ? 1 / 15 : 0.5; hostSnap(); }
  for (const k in pressed) delete pressed[k];
}
// ---- the guest: apply snapshots, smooth the motion in between, send keys
function onGuestData(d) {
  if (!d) return;
  if (d.t === 'hello') {
    if (d.map !== MAP_ID) { try { sessionStorage.setItem('qta.join', NET.code); localStorage.setItem('qta.map', d.map); } catch (e) { /* ignore */ } const u = new URL(location.href); u.searchParams.set('map', d.map); location.replace(u.toString()); return; }
    pickups = d.pk.map(([x, y, k]) => ({ x, y, k, cd: 0 }));
    state = 'guest'; NET.role = 'guest'; cars = []; peds = []; bullets = []; heli = null; mission = null; ringing = null; lab = null; achGrant('coop');
    Object.assign(player, { hidden: false, down: 0, car: null, hp: 100, weapons: {}, weapon: null, cash: 0, lives: 5, mult: 1, shirt: '#2ee88a', skin: '#c68642', hair: '#2a1a0a', pants: '#24304a' });
    netPanel(false); return;
  }
  if (d.t === 's') NET.queued.push(d);
}
function guestApply(d) {
  time = d.time; dayT = d.dayT; heat = d.heat; if (d.dn !== undefined) dayN = d.dn;
  [belief.x, belief.y, belief.sig] = d.bel; belief.seen = !!d.bel[3];
  flight.on = !!d.fl; if (d.fl) { flight.x = d.fl[0]; flight.alt = d.fl[1]; }
  if (d.he) { heli = heli || { vx: 0, vy: 0, hp: 1, snd: 0 }; [heli.x, heli.y, heli.angle, heli.rot] = d.he; heli.dead = !!d.he[4]; heli.fall = d.he[5]; heli.army = !!d.he[6]; } else heli = null;
  if (d.hq) HQ = d.hq;
  const seen = new Set(), E = NET.ents;
  const ent = (id, mk) => { seen.add(id); let o = E.get(id); if (!o) { o = mk(); o.nid = id; o.fresh = true; E.set(id, o); } return o; };
  cars = d.C.map(([id, x, y, a, f, hp, tur, spd, type, color]) => {
    const c = ent(id, () => ({ type, x, y, angle: a, vx: 0, vy: 0, ai: {}, color }));
    if (type) { c.type = type; c.color = color; }
    Object.assign(c, { tx: x, ty: y, ta: a, hp, turret: c.type === 'tank' ? tur : undefined, speed: spd, dead: !!(f & 1), chase: !!(f & 2), fire: f & 4 ? 1 : 0, lay: f & 256 ? 1 : f & 512 ? 2 : f & 1024 ? 3 : f & 2048 ? 4 : 0, driver: f & 64 ? 'player' : f & 128 ? 'eve' : f & 8 ? 'ai' : null,
      twin: !!(f & 16), job: f & 32 ? 1 : null, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd });
    if (c.fresh) { c.x = x; c.y = y; c.angle = a; c.fresh = false; }
    return c;
  });
  peds = d.P.map(([id, x, y, a, f, anim, shirt, skin, hair, pants]) => {
    const p = ent(id, () => ({ x, y, angle: a }));
    if (shirt) Object.assign(p, { shirt, skin, hair, pants: pants || undefined });
    Object.assign(p, { tx: x, ty: y, ta: a, dead: !!(f & 1), cop: !!(f & 2), swat: !!(f & 4), moving: !!(f & 8), burnt: !!(f & 16), anim, deadT: 0 });
    if (p.fresh) { p.x = x; p.y = y; p.angle = a; p.fresh = false; }
    return p;
  });
  for (const id of E.keys()) if (!seen.has(id)) E.delete(id);
  cars = cars.filter(c => c.type); // (never draw something whose looks haven't arrived)
  bullets = d.B.map(([x, y, r]) => ({ x, y, rocket: !!r }));
  if (d.TR) { const old = new Map(trams.map(t => [t.id, t])); trams = d.TR.map(([id, ri, s, pi, mi, f, v]) => { const R = TL[ri]; let t = old.get(id); if (!t) { t = newTram(R, s, null, TRAM_MODELS[mi]); t.id = id; } if (t.R !== R) { t.R = R; t.s = s; } t.ts = s; t.prev = pi >= 0 ? TL[pi] : null; t.v = v; t.doors = f & 1; t.dead = !!(f & 2); return t; }); }
  const [x, y, a, hp, car, w, wp, cash, lives, mult, down, dk, mv, an, psi, ent2, link, br, tunT] = d.me;
  if (tunT !== undefined) player.tunT = tunT;
  Object.assign(player, { tx: x, ty: y, ta: a, hp, weapons: w, weapon: wp, cash, lives, mult, down, downKind: dk, moving: !!mv, anim: an });
  if (Math.hypot(player.x - x, player.y - y) > 300) { player.x = x; player.y = y; }
  player.car = car ? E.get(car) || null : null;
  Q.psi = psi; Q.ent = ent2; Q.link = link ? E.get(link) || null : null;
  Q.branches = br ? br.map(([bx, by, ba, tint, amp]) => ({ x: bx, y: by, angle: ba, tint, amp })) : null;
  const [hx, hy, ha, hcar, hid, hmv, han, hdead] = d.ho;
  NET.other = { x: hx, y: hy, angle: ha, car: hcar, hidden: !!hid, moving: !!hmv, anim: han, dead: !!hdead, shirt: '#ff7a1a', skin: '#e0ac69', hair: '#1a1a1a', pants: '#1e2a3a' };
  NET.mt = d.mt; NET.mx = d.ml; ringing = d.rg >= 0 ? BOOTHS[d.rg] : null;
  if (d.pk) pickups.forEach((u, i) => { u.cd = d.pk[i] === '1' ? 0 : 1; });
  if (d.dr) drops = d.dr.map(([id, x, y, k, age]) => ({ id, x, y, k: DROP_K[k], age }));
  for (const e of d.ev) {
    if (e[0] === 'boom') boomFx(e[1], e[2], e[3]);
    else if (e[0] === 'dec') { decals.push(e[1]); if (decals.length > 500) decals.shift(); }
    else if (e[0] === 'msg') msg(e[1], e[2]);
    else if (e[0] === 'big') bigText(e[1], e[2], e[3], e[4]);
    else if (e[0] === 'ach') achGrant(e[1]);
    else if (e[0] === 'note') note(e[1]);
    else if (e[0] === 'sfx' && sfx[e[1]]) sfx[e[1]]();
    else if (e[0] === 'tree' && trees[e[1]]) trees[e[1]].down = true;
  }
}
// the look of an explosion, without its effects (the host already applied those)
function boomFx(x, y, r) {
  if (onScreen(x, y, 200)) { sfx.boom(); shake = 1; }
  for (let i = 0; i < 30; i++) { const a = rand(TAU), s = rand(30, 220); addPart(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.3, 0.8), rand(4, 9), pick(['#ffdf6b', '#ff9c2a', '#ff5a1f', '#fff3b0']), 18); }
  for (let i = 0; i < 16; i++) { const a = rand(TAU), s = rand(10, 70); addPart(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(1.2, 2.4), rand(6, 12), pick(['#444', '#555', '#333']), 14, true); }
}
function guestTick(dt) {
  if (NET.queued.length) { for (const d of NET.queued) guestApply(d); NET.queued = []; NET.last = performance.now(); }
  const k = Math.min(1, dt * 14), sm = o => { o.x += (o.tx - o.x) * k; o.y += (o.ty - o.y) * k; o.angle += wrapA(o.ta - o.angle) * k; };
  for (const c of cars) sm(c);
  for (const p of peds) sm(p);
  for (const t of trams) { t.ts += t.v * dt; t.s += t.v * dt; t.s += (t.ts - t.s) * k; placeTram(t); }
  if (player.tx !== undefined) sm(player);
  if (player.car) { player.x = player.car.x; player.y = player.car.y; }
  time += dt;
  for (const c of cars) if (c.fire > 0 && Math.random() < 0.5) addPart(c.x + rand(-6, 6), c.y + rand(-6, 6), rand(-10, 10), rand(-30, -10), 0.6, rand(3, 6), pick(['#ff9c2a', '#ffdf6b', '#ff5a1f']), 6, true);
  for (let i = parts.length - 1; i >= 0; i--) { const q = parts[i]; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.94; q.vy *= 0.94; q.size += q.grow * dt; q.life -= dt; if (q.life <= 0) parts.splice(i, 1); }
  for (const m of msgs) m.t -= dt; msgs = msgs.filter(m => m.t > 0);
  if (overlay) { overlay.t -= dt; if (overlay.t <= 0) overlay = null; }
  if (Q.note) { Q.note.t -= dt; if (Q.note.t <= 0 || hit('KeyN')) Q.note = null; }
  shake = Math.max(0, shake - dt * 2.5);
  updateCamera(dt);
  // keys go to the host about 30 times a second (presses are collected in between so none is lost)
  for (const c in pressed) if (!NET.sentP.includes(c)) NET.sentP.push(c);
  NET.sendT -= dt;
  if (NET.sendT <= 0 && NET.conn) {
    NET.sendT = 1 / 30;
    try { NET.conn.send({ t: 'i', k: [keys.up, keys.down, keys.left, keys.right, keys.fire], p: NET.sentP }); } catch (e) { /* closed */ }
    NET.sentP = [];
  }
  if (performance.now() - NET.last > 8000) leaveNet('Lost the connection to your friend.');
}
NET.sentP = [];
function leaveNet(why) {
  const wasGuest = NET.role === 'guest';
  try { if (NET.conn) NET.conn.close(); if (NET.peer) NET.peer.destroy(); } catch (e) { /* ignore */ }
  NET.conn = null; NET.peer = null; NET.role = null; NET.ents.clear();
  if (NET.guest) dropGuest();
  if (wasGuest) { state = 'title'; titleInit(); if (why) msg(why, 5); }
}
// ---- the co-op menu: a little panel over the title screen
let netEl = null;
function netPanel(show) {
  if (!netEl) {
    netEl = document.createElement('div');
    netEl.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:30;width:min(360px,90vw);padding:18px;border-radius:12px;background:rgba(12,14,24,.94);' +
      'border:1px solid rgba(255,255,255,.25);color:#e8eef4;font:14px/1.5 system-ui,sans-serif;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.5)';
    netEl.innerHTML = '<div style="font:bold 18px system-ui;color:#ffd54a;margin-bottom:6px">Online co-op</div>' +
      '<div style="color:#aab;margin-bottom:12px">Two browsers, one world. One of you hosts; the other joins with the room code.</div>' +
      '<button data-a="host" style="width:100%;padding:9px;margin-bottom:10px;font:bold 15px system-ui;border-radius:8px;border:0;background:#ffd54a;color:#222;cursor:pointer">Host a game</button>' +
      '<div style="display:flex;gap:8px"><input data-a="code" maxlength="5" placeholder="ROOM CODE" style="flex:1;min-width:0;padding:8px;font:bold 16px ui-monospace,monospace;text-transform:uppercase;text-align:center;border-radius:8px;border:1px solid #556;background:#1b2030;color:#fff">' +
      '<button data-a="join" style="padding:8px 14px;font:bold 15px system-ui;border-radius:8px;border:0;background:#7dffd8;color:#123;cursor:pointer">Join</button></div>' +
      '<div data-a="status" style="min-height:22px;margin-top:12px;color:#9fd0ff"></div>' +
      '<div style="margin-top:8px;font-size:12px;color:#778">Rooms are matched through the free PeerJS service; the game itself runs directly between your browsers.</div>' +
      '<button data-a="close" style="margin-top:10px;padding:5px 14px;border-radius:8px;border:1px solid #556;background:none;color:#ccd;cursor:pointer">Close</button>';
    document.body.appendChild(netEl);
    const q = a => netEl.querySelector(`[data-a="${a}"]`);
    q('host').onclick = () => hostNet();
    q('join').onclick = () => joinNet(q('code').value);
    q('code').onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') joinNet(q('code').value); };
    q('close').onclick = () => netPanel(false);
    netEl.addEventListener('keydown', e => e.stopPropagation());
  }
  netEl.style.display = show ? 'block' : 'none';
}
const netStatus = t => { if (netEl) netEl.querySelector('[data-a="status"]').textContent = t; };
async function hostNet() {
  if (NET.peer) return;
  try { netStatus('Opening a room…'); await loadPeer(); } catch (e) { netStatus('Could not reach the PeerJS service.'); return; }
  const code = Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
  NET.peer = new window.Peer('qta-room-' + code.toLowerCase()); NET.code = code;
  NET.peer.on('open', () => netStatus(`Room code: ${code} · waiting for your friend…`));
  NET.peer.on('error', e => { netStatus('Network trouble: ' + (e.type || e.message)); });
  NET.peer.on('connection', c => {
    if (NET.conn) { c.on('open', () => c.close()); return; }
    NET.conn = c; NET.role = 'host';
    c.on('open', () => netHostOpen(c));
    c.on('data', onHostData);
    c.on('close', () => { dropGuest('Your friend left.'); NET.role = null; });
  });
}
function netHostOpen(c) {
  if (state !== 'play') newGame();
  c.send({ t: 'hello', map: MAP_ID, pk: pickups.map(u => [u.x, u.y, u.k]) });
  addGuest(); netPanel(false);
}
async function joinNet(code) {
  code = (code || '').trim().toUpperCase(); if (code.length !== 5) { netStatus('Type the five-letter room code.'); return; }
  if (NET.peer) return;
  try { netStatus('Connecting…'); await loadPeer(); } catch (e) { netStatus('Could not reach the PeerJS service.'); return; }
  NET.code = code; NET.peer = new window.Peer();
  NET.peer.on('error', e => { netStatus(e.type === 'peer-unavailable' ? 'No room with that code.' : 'Network trouble: ' + (e.type || e.message)); try { NET.peer.destroy(); } catch (x) { /* ignore */ } NET.peer = null; });
  NET.peer.on('open', () => {
    const c = NET.peer.connect('qta-room-' + code.toLowerCase(), { reliable: true });
    NET.conn = c; NET.last = performance.now() + 10000;
    c.on('data', onGuestData);
    c.on('close', () => leaveNet('Your friend closed the game.'));
  });
}
// tests and the map switch use the same entry points without a network: attach any {send, on} pair
function netAttach(role, c) { NET.conn = c; NET.role = role; if (role === 'host') { c.on('data', onHostData); netHostOpen(c); } else { c.on('data', onGuestData); NET.last = performance.now() + 10000; } }
// after a map switch the guest rejoins on its own
try { const pj = sessionStorage.getItem('qta.join'); if (pj) { sessionStorage.removeItem('qta.join'); setTimeout(() => { netPanel(true); joinNet(pj); }, 300); } } catch (e) { /* ignore */ }

// ============================================================ game flow
function resetWorld() {
  cars = []; peds = []; bullets = []; parts = []; decals = []; heli = null; drops = [];
  seed = 4242; eggReset(); placeParked(); placePickups(); initTrams(); HQ = hqNew(); tankerCars = []; caller = null;
}
let startSel = 0; // which of STARTS a new game begins in (chosen on the title screen)
// the maps are generated when the page loads, so switching map reloads it (and remembers the choice)
function switchMap() {
  const to = B5 ? 'island' : 'brno5';
  try { localStorage.setItem('qta.map', to); } catch (e) { /* storage unavailable: the URL still carries it */ }
  const u = new URL(location.href); u.searchParams.set('map', to); location.replace(u.toString());
}
function newGame() {
  resetWorld();
  const at = STARTS[startSel];
  Object.assign(player, { hp: 100, car: null, weapons: {}, weapon: null, cash: 0, lives: 5, mult: 1, down: 0, bust: 0, hidden: false, x: at.p.x, y: at.p.y, angle: faceOpen(at.p.x, at.p.y), inPsi: false, fish: null, tow: null, fishHint: null, marble: false, marbleT: 0, lime: false, cellar: null, nDrops: 0, stun: 0, tunT: time, tunRoll: 0 });
  Object.assign(Q, { psi: 1, ent: 2, link: null, linkT: 0, decoy: null, decoyT: 0, branches: null, note: null, slow: false, bb: null });
  lab = null; labCars = []; labFlags = {}; arcProg = DISTRICTS.map(() => 0); dayT = 17 / 24; aodPaid.clear(); aodSolved.clear(); dayN = 0; qcWins = 0; qcDay = -1; qcCool = 0;
  heat = 0; belief.sig = 0; mission = null; ringing = null; ringCd = 3; won = false; curDistrict = -1; msgs = []; overlay = null;
  updateCamera(0, true);
  fillSpots(true);
  for (let i = 0; i < 30; i++) manageSpawns(1);
  msg(`Welcome to ${at.name}. Find a ride, any ride.`, 5);
  msg('X superposes your car. T entangles you with another car. H for help.', 6);
  if (HANTEC_ON && !HANTEC_SET && !lab) msg('Your browser speaks Czech, so Brno speaks Hantec: type "hantec" to switch it off.', 7);
  state = 'play'; helpPage = 0; DBG.used = DBG.god; achMap();
}
function titleInit() {
  resetWorld();
  player.hidden = true; player.car = null; dayT = 21 / 24; heat = 0; mission = null;
  titleLook(true);
}
// the title screen slowly circles the chosen starting place
function titleLook(jump) {
  const p = STARTS[startSel].p, a = time * 0.06;
  player.x = p.x + Math.cos(a) * 220; player.y = p.y + Math.sin(a) * 140;
  if (jump) { updateCamera(0, true); fillSpots(true); for (let i = 0; i < 30; i++) manageSpawns(1); }
}
titleInit();

let last = performance.now();
// the version picker (stamped into the published page) only shows on the title screen
function showVersionPicker() {
  const el = document.getElementById('ver'), show = state === 'title';
  if (el && el.dataset.on !== String(show)) { el.dataset.on = show; el.style.display = show ? 'flex' : 'none'; }
}

// ============================================================ the debug console (hidden)
// Type "debug" while playing (or paused): a command line opens at the top of the screen. "help" lists the commands:
// tp <place> or tp <x> <y> teleports you (tiles; in Brno also latitude and longitude), wanted, car, god...
// Esc closes it. Not in a co-op game you joined.
const DBG = { used: false, duck: (() => { try { return localStorage.getItem('qta.duck') === '1'; } catch (e) { return false; } })(), buf: '', box: null, inp: null, out: null, god: false, stats: false, ft: 0, places: null, hist: [], hi: 0 };
const dbgOpen = () => !!(DBG.box && DBG.box.style.display !== 'none');
const fold = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
function dbgSay(s) { DBG.out.textContent = (DBG.out.textContent + '\n' + s).split('\n').slice(-14).join('\n').replace(/^\n/, ''); }
function dbgShow(on) {
  if (!DBG.box) {
    const b = DBG.box = document.createElement('div');
    b.style.cssText = 'position:fixed;left:8px;right:8px;top:8px;z-index:20;background:rgba(10,12,18,.88);border:1px solid #3cf0ff;border-radius:6px;padding:8px 10px;font:13px/1.35 ui-monospace,Menlo,Consolas,monospace;color:#d8f6ff;max-width:760px';
    const o = DBG.out = document.createElement('pre'); o.style.cssText = 'margin:0 0 6px;white-space:pre-wrap;max-height:40vh;overflow:auto';
    const i = DBG.inp = document.createElement('input'); i.style.cssText = 'width:100%;box-sizing:border-box;background:#05070b;color:#fff;border:1px solid #2a4a55;border-radius:4px;padding:5px 7px;font:inherit;outline:none';
    i.setAttribute('autocomplete', 'off'); i.setAttribute('spellcheck', 'false'); i.placeholder = 'help · tp <place> · tp <x> <y> · wanted <n> · car <type> · god · stats · Esc closes';
    i.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Escape') { dbgShow(false); return; }
      if (e.key === 'ArrowUp' && DBG.hist.length) { DBG.hi = Math.max(0, DBG.hi - 1); i.value = DBG.hist[DBG.hi]; e.preventDefault(); return; }
      if (e.key === 'ArrowDown' && DBG.hist.length) { DBG.hi = Math.min(DBG.hist.length, DBG.hi + 1); i.value = DBG.hist[DBG.hi] || ''; e.preventDefault(); return; }
      if (e.key !== 'Enter') return;
      const line = i.value.trim(); i.value = ''; if (!line) return;
      DBG.hist.push(line); DBG.hi = DBG.hist.length; dbgSay('> ' + line);
      try { const r = dbgRun(line); if (r) dbgSay(r); } catch (err) { dbgSay('error: ' + err.message); }
    });
    i.addEventListener('keyup', e => e.stopPropagation());
    b.append(o, i); document.body.appendChild(b);
    dbgSay('QTA debug console. "help" for the commands.');
  }
  DBG.box.style.display = on ? 'block' : 'none';
  for (const k in keys) keys[k] = 0;
  if (on) setTimeout(() => DBG.inp.focus(), 0); else { DBG.inp.blur(); cv.focus && cv.focus(); }
}
addEventListener('keydown', e => {
  if (dbgOpen() || !e.key || e.key.length !== 1) return;
  if (e.code === 'Backquote' && DBG.duck && (state === 'play' || state === 'pause') && NET.role !== 'guest') { e.preventDefault(); dbgShow(true); dbgSay('🦆 Quack. Tell me what\'s wrong.'); sfx.quack(); return; } // (the duck from U Kachničky listens)
  DBG.buf = (DBG.buf + e.key.toLowerCase()).slice(-6);
  if (DBG.buf.endsWith('debug') && (state === 'play' || state === 'pause') && NET.role !== 'guest') { DBG.buf = ''; dbgShow(true); }
  else if (DBG.buf === 'hantec' && BRNO) { DBG.buf = ''; hantecToggle(); } // (Brno's own slang)
});
// every place with a name: where you start, sites and landmarks, districts, streets, tram stops, faculties and more
function dbgPlaces() {
  if (DBG.places) return DBG.places;
  const L = [], add = (name, x, y) => { if (name && isFinite(x) && isFinite(y)) L.push({ name, f: fold(name), x, y }); };
  for (const s of STARTS) add(s.name, s.p.x, s.p.y);
  for (const s of SITES) add(s.name, (s.x0 + s.x1 + 1) / 2 * T, (s.y0 + s.y1 + 1) / 2 * T);
  const sx = new Float64Array(DISTRICTS.length), sy = new Float64Array(DISTRICTS.length), n = new Float64Array(DISTRICTS.length);
  for (let k = 0; k < MW * MH; k += 3) { const r = REG[k]; if (r === undefined || r >= DISTRICTS.length || solidT(map[k])) continue; sx[r] += k % MW; sy[r] += (k / MW) | 0; n[r]++; }
  DISTRICTS.forEach((d, i) => { if (n[i]) add(d.name, (sx[i] / n[i] + 0.5) * T, (sy[i] / n[i] + 0.5) * T); });
  for (const p of TRAM_STOPS) add(p.name, p.x, p.y);
  if (MIL_SPOTS.length) { const q = MIL_SPOTS[0]; add('Univerzita obrany', q.x, q.y + 40); add('army', q.x, q.y + 40); }
  const seenE = new Set();
  for (const e of EDGES) if (e.name && !seenE.has(e.name)) { seenE.add(e.name); const q = e.pts[e.pts.length >> 1]; add(e.name, q[0], q[1]); }
  if (BRNO) { for (const f of FACULTIES) { const [x, y] = geo(f[3], f[4]); add(f[0], x * T, y * T); } add('harbour', HARBOUR[0] * T, HARBOUR[1] * T); add('reservoir', HARBOUR[0] * T, HARBOUR[1] * T); }
  HOSPITALS.forEach((h, i) => add(i ? 'clinic ' + i : 'hospital', h.x, h.y)); POLICE_POSTS.forEach((h, i) => add(i ? 'police post ' + i : 'police', h.x, h.y));
  SPRAYS.forEach((h, i) => add('spray shop ' + (i + 1), h.x, h.y)); FISH_SPOTS.forEach((h, i) => add('jetty ' + (i + 1), h.x, h.y));
  if (ATOM_LAB) add('atom array lab', ATOM_LAB.con.x, ATOM_LAB.con.y);
  try { eprPhones().forEach((e, i) => add('payphone ' + (i + 1), e.x, e.y)); } catch (e) { /* (none on this map) */ }
  if (EA) { // (the easter eggs)
    const e = EA, f = EGG_SPOTS.find(q => q.type === 'formula');
    if (e.orloj) add('orloj', e.orloj.x, e.orloj.y + 40); for (const z of e.zoo) add(z.k === 'sealion' ? 'sea lion' : z.k, z.x, z.y); if (e.qclock) add('quantum clock', e.qclock.x, e.qclock.y + 30); if (e.qpc) add('quantum computer', e.qpc.x, e.qpc.y + 30); if (e.jost) add('Jošt', e.jost.x + 40, e.jost.y); if (e.justice) add('Justice', e.justice.x, e.justice.y + 30); if (e.hall) { add('dragon', e.hall.x, e.hall.y); add('Old Town Hall gate', e.hall.x, e.hall.y); }
    if (e.wheel) add('wheel', e.wheel.x + 30, e.wheel.y + 30); e.hatches.forEach((q, i) => add('hatch ' + (i + 1), q.x, q.y + 26));
    if (e.jakub) add('little man', e.jakub.x, e.jakub.y); if (e.board) add('new station', e.board.x, e.board.y + 40); add('mendel', e.mendel.x, e.mendel.y);
    add('rondo', e.rondo.door.x, e.rondo.door.y); add('cows', e.kravi.x, e.kravi.y); if (e.cloister.length) add('cloister', e.cloister[0].x, e.cloister[0].y);
    if (e.duck) add('duck', e.duck.x, e.duck.y + 26); if (e.dorm) add('dorms', e.dorm.x, e.dorm.y); if (e.bren) add('bren', e.bren.x, e.bren.y + 26); if (e.lime) add('lime', e.lime.x, e.lime.y + 26);
    if (f) add('formula', f.x, f.y + 40); if (e.spil) add('Špilberk cells', e.spil.x, e.spil.y);
  }
  return (DBG.places = L);
}
function dbgFind(q) {
  const f = fold(q), P = dbgPlaces();
  const ex = P.filter(p => p.f === f), pre = P.filter(p => p.f.startsWith(f)), sub = P.filter(p => p.f.includes(f));
  return ex.length ? ex : pre.length ? pre : sub;
}
function dbgTeleport(x, y) {
  const s = nearOf(x, y, false, 40) || { x, y };
  if (player.jack) endJack();
  if (player.tow) dropTow('');
  if (Q.branches) collapse('you teleported');
  if (player.car) { player.car.driver = null; player.car = null; }
  player.fish = null; player.x = s.x; player.y = s.y; player.angle = faceOpen(s.x, s.y);
  updateCamera(0, true); fillSpots(true); for (let i = 0; i < 20; i++) manageSpawns(1);
  return s;
}
function dbgRun(line) {
  const [cmd, ...a] = line.split(/\s+/), rest = a.join(' '), num = a.map(Number);
  if (!['help', '?', 'where', 'find', 'stats', 'quality', 'detail', 'close', 'hantec', ''].includes(cmd.toLowerCase())) DBG.used = true; // (no achievements in this game)
  switch (cmd.toLowerCase()) {
    case 'help': case '?': return [
      'tp <place>        teleport (a start, site, district, street, tram stop, faculty, hospital, police, jetty 1, payphone 1, harbour...)',
      'tp <x> <y>        teleport to tile x, y' + (BRNO ? ' (or: tp <lat> <lon>, e.g. tp 49.1951 16.6080)' : ''),
      'where             your position: tiles' + (BRNO ? ', latitude and longitude' : '') + ', the place',
      'find <text>       the places whose name has it',
      'wanted <0-10>     set the wanted level',
      'car <type>        a vehicle by you, and you in it (car list: the types)',
      'god               toggle: no damage, no arrest',
      'stats             toggle: frame time and what is simulated',
      'quality [auto|0-5] the detail level: 0 the sharpest, 3 plain walls and roofs, 5 the fewest pixels',
      'cash <n> · time <hour> · day <mon..sun> · charges (refill ψ and ε) · powerups (ψ, ε and ♥ beside you) · squad (send the heroes) · wind <deg> · hantec · close'].join('\n');
    case 'close': case 'exit': dbgShow(false); return '';
    case 'tp': case 'teleport': case 'goto': {
      if (!a.length) return 'tp <place> or tp <x> <y>';
      if (a.length === 2 && num.every(isFinite)) {
        let [x, y] = num;
        if (BRNO && x > 40 && x < 60 && y > 10 && y < 20) [x, y] = geo(x, y); // (latitude, longitude)
        if (x < 0 || y < 0 || x >= MW || y >= MH) return `off the map (it is ${MW} x ${MH} tiles)`;
        const s = dbgTeleport((x + 0.5) * T, (y + 0.5) * T); return `teleported to ${(s.x / T).toFixed(1)}, ${(s.y / T).toFixed(1)} · ${placeName(s.x, s.y)}`;
      }
      const m = dbgFind(rest); if (!m.length) return `no place called "${rest}" (try: find ${a[0]})`;
      const s = dbgTeleport(m[0].x, m[0].y);
      return `teleported to ${m[0].name} (${(s.x / T).toFixed(0)}, ${(s.y / T).toFixed(0)})` + (() => { const o = [...new Set(m.map(p => p.name))].filter(n => n !== m[0].name); return o.length ? `\n  also: ${o.slice(0, 5).join(' · ')}${o.length > 5 ? ' …' : ''}` : ''; })();
    }
    case 'find': case 'list': { const m = dbgFind(rest); return m.length ? m.slice(0, 30).map(p => `${p.name} (${(p.x / T) | 0}, ${(p.y / T) | 0})`).join('\n') + (m.length > 30 ? `\n… ${m.length - 30} more` : '') : 'nothing'; }
    case 'where': { const P0 = pp(), tx = P0.x / T, ty = P0.y / T; let s = `tile ${tx.toFixed(1)}, ${ty.toFixed(1)} · ${placeName(P0.x, P0.y)}`;
      if (BRNO) s += ` · ${(GEO[3] - ty / MH * (GEO[3] - GEO[2])).toFixed(5)}, ${(GEO[0] + tx / MW * (GEO[1] - GEO[0])).toFixed(5)}`; return s; }
    case 'wanted': case 'heat': { const v = clamp(num[0] || 0, 0, 10); heat = v ? Math.min(10.99, v + 0.01) : 0; if (!v) { HQ = hqNew(); belief.sig = 1e4; } lastCrime = time; return `wanted level ${Math.floor(heat)}`; }
    case 'car': case 'spawn': {
      const t = (a[0] || '').toLowerCase();
      if (!CT[t] || t === 'tram' || t === 'train') return 'types: ' + Object.keys(CT).filter(k => k !== 'tram' && k !== 'train').join(' ');
      const P0 = pp();
      let at;
      if (CT[t].boat) { at = nearOf(P0.x, P0.y, true, 40); if (!at) return 'no water near here'; at.a = rand(TAU); for (let i = 0; i < 12 && boatHits({ type: t }, at.x, at.y, at.a); i++) at.a += 0.5; }
      else { const lp = nearestLanePt(P0.x, P0.y, null, 400); if (!lp) return 'no road near here'; at = { x: lp.x, y: lp.y, a: lp.h }; }
      if (player.car) { player.car.driver = null; player.car = null; }
      const c = makeCar(t, at.x, at.y, at.a, null); getIn(c, false, false);
      player.x = c.x; player.y = c.y; updateCamera(0, true);
      return `you are in a ${CT[t].label}`;
    }
    case 'god': DBG.god = !DBG.god; return 'god mode ' + (DBG.god ? 'on' : 'off');
    case 'stats': DBG.stats = !DBG.stats; return 'stats ' + (DBG.stats ? 'on' : 'off');
    case 'quality': case 'detail':
      if ((a[0] || '').toLowerCase() === 'auto') { QA.fix = -1; QA.lock = false; QA.down = null; QA.up = -1; QA.tries.fill(0); qualSet(0); return qualSay(); }
      if (a.length && isFinite(num[0])) { QA.fix = clamp(Math.round(num[0]), 0, QUAL.length - 1); QA.down = null; QA.up = -1; qualSet(QA.fix); }
      return qualSay();
    case 'cash': player.cash = num[0] || 0; return `cash $${player.cash}`;
    case 'day': { const i = WDAYS.findIndex(d => d.toLowerCase() === (a[0] || '').slice(0, 3).toLowerCase()); if (i < 0) return 'day <mon|tue|wed|thu|fri|sat|sun>'; dayN += ((i - weekday()) % 7 + 7) % 7; EGG.h = null; return `it is ${WDAYS[i]}`; }
    case 'hantec': hantecToggle(); return 'Hantec ' + (HANTEC_ON ? 'on' : 'off');
    case 'time': dayT = ((num[0] || 0) % 24) / 24; EGG.h = null; return `time ${num[0] || 0}:00`;
    case 'charges': Q.psi = 9; Q.ent = 9; return 'ψ 9 · ε 9';
    case 'squad': { if (heat < 10) heat = 10.3; const P = pp(), bl = HQ.carrier || { x: P.x + 500, y: P.y - 300 }; for (const k of SQUAD) launchHero(k, bl, P); if (HQ.carrier) HQ.carrier.sent = SQUAD.length; return 'P.L.A.N.C.K.\'s heroes are coming'; }
    case 'powerups': { const n = drops.length; for (const k of DROP_K) dropNear(pp(), k, 50, 140, 40); return `${drops.length - n} power-ups beside you`; }
    case 'wind': WIND = (num[0] || 0) * Math.PI / 180; return `the wind blows to ${num[0] || 0}° (0 east, 90 south)`;
    default: return `unknown: ${cmd} ("help" lists the commands)`;
  }
}
// god mode, and the stats line
function dbgTick() {
  if (!DBG.god) return;
  player.hp = 100; player.bust = 0;
  const c = player.car, t = c && c.tram;
  if (t) { if (!t.dead) t.hp = t.hp0; } else if (c) { c.hp = CT[c.type].hp; c.fire = 0; }
}
// ---- detail: on a machine that cannot keep up (under 30 frames a second), the frame gets fewer pixels, and then plain
// walls and roofs, until it can. It steps down one level at a time while the frames are slow; if none of the steps
// makes them faster (two steps that bring nothing tell), it goes back up to where it began and stays there. After a good
// while at full speed the level above is tried again, and kept if the frames stay as fast (twice at most). The debug
// console's "quality" fixes a level.
const QUAL = [[2, 1], [1.5, 1], [1, 1], [1, 0], [0.8, 0], [0.67, 0]]; // (at most this many pixels to a CSS pixel; textures)
const QA = { lv: 0, fix: -1, iv: [], ivT: 0, skip: 2000, down: null, up: -1, fast: 0, lock: false, tries: QUAL.map(() => 0) };
const qualOf = i => [Math.min(window.devicePixelRatio || 1, 2, QUAL[i][0]), QUAL[i][1]]; // (what a level means on this screen)
function qualStep(i, d) { // the next level down (d 1) or up (d -1) that changes anything on this screen
  const [a, b] = qualOf(i);
  for (let j = i + d; j >= 0 && j < QUAL.length; j += d) { const [c, e] = qualOf(j); if (c !== a || e !== b) return j; }
  return i;
}
function qualSet(i) {
  QA.lv = i; QCAP = QUAL[i][0]; TEX = !!QUAL[i][1];
  if (qualOf(i)[0] !== DPR) resize();
  QA.iv = []; QA.ivT = 0; QA.skip = 1000; // (ms: meanwhile the ground is drawn again at the new size)
}
function qualTick(ms) { // ms: the time since the frame before
  if (QA.fix >= 0) return;
  if (document.hidden || (state !== 'play' && state !== 'title' && state !== 'guest')) { QA.iv = []; QA.ivT = 0; return; }
  if (!(ms > 0 && ms < 250)) return; // (a pause, or one long frame, left out; the first frame's stamp can even come before the clock read as the game was set up)
  if (QA.skip > 0) { QA.skip -= ms; return; }
  QA.iv.push(ms); QA.ivT += ms; if (QA.iv.length < 90 && !(QA.ivT > 1500 && QA.iv.length >= 12)) return; // (90 frames, or 1.5 s of slow ones)
  const med = QA.iv.sort((a, b) => a - b)[QA.iv.length >> 1], slow = med > 34; QA.iv = []; QA.ivT = 0; // (the median: a burst of slow frames while a new part of the city is drawn does not count)
  const D = QA.down;
  if (D) { // (on the way down)
    D.miss = med > D.best * 0.95 ? D.miss + 1 : 0; // (no faster than the best level yet)
    if (med < D.best) { D.best = med; D.at = QA.lv; }
    const j = qualStep(QA.lv, 1);
    if (!slow) QA.down = null;
    else if (D.miss >= 2 || j === QA.lv) { QA.down = null; QA.lock = true; qualSet(D.best < D.base * 0.85 ? D.at : D.top); } // (the fastest, if anything helped; and no more tries)
    else qualSet(j);
    return;
  }
  if (QA.up >= 0) { const from = QA.up; QA.up = -1; if (med >= 18) qualSet(from); return; } // (not as fast up there)
  if (slow) {
    QA.fast = 0; const j = qualStep(QA.lv, 1);
    if (!QA.lock && j !== QA.lv) { QA.down = { top: QA.lv, base: med, best: med, at: QA.lv, miss: 0 }; qualSet(j); }
  } else if (med < 18 && QA.lv > 0) {
    if (++QA.fast >= 8) { QA.fast = 0; const j = qualStep(QA.lv, -1); if (j !== QA.lv && QA.tries[j] < 2) { QA.tries[j]++; QA.up = QA.lv; qualSet(j); } }
  } else QA.fast = 0;
}
const qualSay = () => `detail ${QA.lv}${QA.fix >= 0 ? ' (fixed)' : ' (automatic)'}: ${+DPR.toFixed(2)} pixels to a CSS pixel (${cv.width} x ${cv.height}), textures ${TEX ? 'on' : 'off'}`;
function dbgDraw() {
  if (!DBG.stats) return;
  const s = `${DBG.ft.toFixed(1)} ms · detail ${QA.lv}${QA.fix >= 0 ? '*' : ''} (${+DPR.toFixed(2)}x${TEX ? '' : ', plain'}) · cars ${cars.length} (boats ${cars.filter(boatOf).length}) · people ${peds.length} (on platforms ${peds.filter(p => p.tp).length}) · trams ${trams.length} in full, ${tramsFar.length} further off`;
  ctx.font = '12px ui-monospace,Menlo,monospace'; const w = ctx.measureText(s).width;
  ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(W / 2 - w / 2 - 6, H - 52, w + 12, 18); ctx.fillStyle = '#7dffd8'; ctx.textAlign = 'center'; ctx.fillText(s, W / 2, H - 39); ctx.textAlign = 'left';
}
function frame(nowT) {
  showVersionPicker();
  qualTick(nowT - last);
  const dt = Math.min(0.05, Math.max(0.001, (nowT - last) / 1000)); last = nowT; const ft0 = performance.now();
  if (state === 'title' && helpPage === 3) { // the achievements page, over the title screen
    if (hit('KeyH', 'Escape', 'Enter', 'NumpadEnter', 'Space')) helpPage = 0; else if (!achPageInput() && hit('Tap')) helpPage = 0;
    titleLook(false); updateWorld(dt); updateCamera(dt); cam.zoom = clamp(Math.min(W, H) / 760, 0.55, 1.6) * 0.9;
  } else if (state === 'title') {
    const pick2 = d => { startSel = (startSel + d + STARTS.length) % STARTS.length; titleLook(true); };
    const onAch = tapAt && titleAchRect && tapAt.x > titleAchRect.x && tapAt.x < titleAchRect.x + titleAchRect.w && tapAt.y > titleAchRect.y && tapAt.y < titleAchRect.y + titleAchRect.h;
    if (hit('ArrowRight', 'KeyD')) pick2(1); else if (hit('ArrowLeft', 'KeyA')) pick2(-1);
    if (hit('ArrowUp', 'ArrowDown', 'KeyW', 'KeyS') || (tapAt && Math.abs(tapAt.y - (H * 0.5 - 34)) < 14)) switchMap();
    titleLook(false);
    updateWorld(dt); updateCamera(dt);
    cam.zoom = clamp(Math.min(W, H) / 760, 0.55, 1.6) * 0.9;
    if (hit('KeyH') || onAch) { helpPage = 3; achSel = -1; }
    else if (hit('KeyO') || (tapAt && Math.abs(tapAt.y - (H * 0.6 + 34)) < 16)) netPanel(true);
    else if (tapAt && Math.abs(tapAt.y - (H * 0.5 + 6)) < 30) pick2(tapAt.x > W / 2 ? 1 : -1);
    else if (hit('KeyL') || (tapAt && touchOn() && tapAt.x > W / 2)) startLab();
    else if (hit('Enter', 'Space', 'Tap', 'NumpadEnter')) newGame();
  } else if (state === 'play') {
    if (hit('KeyP', 'Escape')) state = 'pause';
    if (hit('KeyH')) { helpPage = (helpPage + 1) % 4; achSel = -1; }
    if (hit('KeyM')) showMap = (showMap + 1) % 3;
    if (hit('KeyR')) { radio = (radio + 1) % STATIONS.length; msg(radio ? `♪ ${STATIONS[radio].name}` : 'Radio off', 2); }
    if (hit('KeyV')) { Q.slow = !Q.slow; msg(Q.slow ? 'Slow motion + amplitude arrows ON (V)' : 'Slow motion OFF', 2); }
    const sdt = Q.slow && !NET.guest ? dt * 0.3 : dt; // (no slow motion while a friend is playing too)
    if (helpPage === 3 && achPageInput()) { /* (a tile or the buy line, tapped) */ }
    else if (helpPage && !NET.guest && hit('Tap')) helpPage = (helpPage + 1) % 4;
    if (!helpPage || NET.guest) { updateWorld(sdt); updateCamera(sdt); dbgTick(); }
    if (NET.guest) { NET.snapT -= dt; if (NET.snapT <= 0) { NET.snapT = 1 / 15; hostSnap(); } }
  } else if (state === 'guest') {
    if (hit('KeyM')) showMap = (showMap + 1) % 3;
    if (hit('KeyH')) helpPage = (helpPage + 1) % 4;
    if (helpPage === 3) achPageInput();
    if (hit('KeyR')) { radio = (radio + 1) % STATIONS.length; msg(radio ? `♪ ${STATIONS[radio].name}` : 'Radio off', 2); }
    if (hit('Escape')) leaveNet('You left the co-op game.');
    else guestTick(dt);
  } else if (state === 'pause') {
    if (NET.guest) { NET.snapT -= dt; if (NET.snapT <= 0) { NET.snapT = 0.5; hostSnap(); } } // (keep the guest connected while paused)
    if (hit('KeyQ') || (lab && hit('KeyL')) || (hit('Tap') && tapAt && tapAt.y > H * 0.75)) { // quit to the title screen
      if (!lab) saveBest();
      if (NET.role) leaveNet();
      lab = null; helpPage = 0; titleInit(); state = 'title';
    } else if (hit('KeyP', 'Escape', 'Enter')) state = 'play';
    else if (hit('Tap')) { state = 'play'; helpPage = 1; }
  } else if (state === 'aod') {
    updateAOD(dt);
  } else if (state === 'qc') {
    updateQC(dt);
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
      txt(touchOn() ? `tap for help, notes & achievements · tap near the bottom to ${lab ? 'leave the lab' : 'quit'}` : `P to resume · H for help, notes & achievements · Q to ${lab ? 'leave the lab' : 'quit to the title screen'}`, W / 2, H / 2 + 36, 14, '#ccc', 'center');
    }
    if (state === 'over') drawOver();
    if (state === 'aod') drawAOD();
    if (state === 'qc') drawQC();
  }
  dbgDraw(); DBG.ft += (performance.now() - ft0 - DBG.ft) * 0.05;
  for (const k in pressed) delete pressed[k];
  tapAt = null;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// debug/test hook
window.__gridlock = { get EGG() { return EGG; }, EA, EGG_SPOTS, get dayN() { return dayN; }, set dayN(v) { dayN = v; }, enterCellar, eggHatchAt, get HANTEC_ON() { return HANTEC_ON; }, hx, BOAT_SPOTS, WBN, boatShore, spawnBoat, enterExit, updateWorld, updateCamera, get WIND() { return WIND; }, set WIND(v) { WIND = v; }, get HQ() { return HQ; }, eprPhones, teleport, get tankerCars() { return tankerCars; }, get trams() { return trams; }, dbgRun, dbgShow, DBG, get tramsFar() { return tramsFar; }, TL, TRAM_STOPS, get heli() { return heli; }, placeRoadblock, map, MW, buildings, redStop, lightPhase, NODES, EDGES, LANES, LIGHT_NODES, BUS_STOPS, SITES, XW, XE, nearestLanePt, get time() { return time; }, player, Q, belief, get cars() { return cars; }, get peds() { return peds; }, get state() { return state; }, get heat() { return heat; }, set heat(v) { heat = v; }, get mission() { return mission; }, get lab() { return lab; }, get dayT() { return dayT; }, set dayT(v) { dayT = v; },
  newGame, startLab, setupLesson, makeCar, superpose, collapse, entangle, startMission, bb84, keys, pressed, labFlags: () => labFlags, arcProg: () => arcProg,
  NET, netAttach, faceOpen, TUNNELS, RAMPS, tunT, OVERS, OVRAMPS, ovT, oE, carDeckZ, FISH, FISH_SPOTS, startFishing, castDist, ZONES, CONSOLES, get ATOM_LAB() { return ATOM_LAB; }, grabTow, dropTow, towBase, RB_R, aodOpen, aodToggle, aodShift, aodGo, aodPulse, aodPointer, aodSolved, AOD_LV, get AOD() { return AOD; }, hostSnap, hostNet, joinNet, MAP_ID, geo, LCG, taken, dR, mm, trees, props, FIELDS, STARTS, REG, SITE_PSI, HOSPITALS, POLICE_POSTS, get startSel() { return startSel; }, set startSel(v) { startSel = v; }, get showMap() { return showMap; }, set showMap(v) { showMap = v; } };
})();
