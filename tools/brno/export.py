import json, math
import numpy as np
from scipy import ndimage
from PIL import Image, ImageDraw
from roads import build, resample, dp, seglen, P, MW, MH
grid = np.load('landgrid.npy')
OPEN, FOREST, FARM, VINE, URBAN, INDUS, GREEN, WATER, AIR = range(9)
# 1. smooth away single-tile specks (but keep water and roads' shapes) with a 3x3 majority vote
def majority(g):
    out = g.copy()
    for c in range(9):
        pass
    cnt = np.stack([ndimage.uniform_filter((g == c).astype(float), 3, mode='nearest') for c in range(9)])
    best = cnt.argmax(axis=0)
    keep = (g == WATER)
    out = np.where(keep, g, best)
    return out
grid = majority(grid)
urban = (grid == URBAN) | (grid == INDUS)
# 2. main roads, plus the residential streets that open up big blocks
main = build(4)
# tertiary roads only where the bigger roads are not already close by (suburbs and villages, not the dense core)
hi = [w for w in main if w['r'] <= 3]
hocc = np.zeros((MH*2, MW*2), bool)
for w in hi:
    for x, y in resample(w['pts'], 0.25):
        i, j = int(x*2), int(y*2)
        if 0 <= i < MW*2 and 0 <= j < MH*2: hocc[j, i] = True
hd = ndimage.distance_transform_edt(~hocc) / 2
def tert_ok(w):
    smp = [p for p in resample(w['pts'], 0.5) if 0 <= p[0] < MW and 0 <= p[1] < MH]
    if not smp: return False
    return sum(1 for x, y in smp if hd[int(y*2), int(x*2)] < 5.5) / len(smp) < 0.5
main = hi + [w for w in main if w['r'] == 4 and tert_ok(w)]
print('kept tertiary', sum(1 for w in main if w['r'] == 4))
occ = np.zeros((MH*2, MW*2), bool)
def stamp(pts, r):
    for x, y in resample(pts, 0.25):
        i, j = int(x*2), int(y*2)
        occ[max(0, j-r):j+r+1, max(0, i-r):i+r+1] = True
for w in main: stamp(w['pts'], 1)
dist_main = ndimage.distance_transform_edt(~occ) / 2  # tiles from the nearest main road
res = json.load(open('res.json'))['elements']
extra = []
cands = []
for e in res:
    t = e['tags']
    if t.get('highway') not in ('residential', 'living_street') or t.get('area') == 'yes': continue
    pts = [P(g['lat'], g['lon']) for g in e['geometry']]
    if seglen(pts) < 4: continue
    cands.append((seglen(pts), t.get('name', ''), pts))
cands.sort(key=lambda c: -c[0])
occ2 = occ.copy()
for L, name, pts in cands:
    smp = resample(pts, 0.5)
    inside = [p for p in smp if 0 <= p[0] < MW and 0 <= p[1] < MH]
    if len(inside) < len(smp) * 0.8: continue
    dm = ndimage.distance_transform_edt(~occ2) / 2 if False else None
    far = sum(1 for x, y in inside if not occ2[min(MH*2-1, int(y*2)), min(MW*2-1, int(x*2))] and dist_main[min(MH*2-1, int(y*2)), min(MW*2-1, int(x*2))] > 3.2) / len(inside)
    if far < 0.45: continue
    # not too close to an already chosen street either (keeps blocks at least ~6 tiles deep)
    near2 = sum(1 for x, y in inside if occ2[min(MH*2-1, int(y*2)), min(MW*2-1, int(x*2))]) / len(inside)
    if near2 > 0.25: continue
    p2 = dp(pts, 0.3)
    extra.append({'r': 5, 'name': name, 'pts': p2})
    for x, y in resample(pts, 0.25):
        i, j = int(x*2), int(y*2); occ2[max(0, j-7):j+8, max(0, i-7):i+8] = True
print('main', len(main), 'extra residential', len(extra))
roads = json.load(open('net.json'))  # the connected network from net.py
def frac_urban(pts):
    smp = resample(pts, 0.5); n = 0
    for x, y in smp:
        tx, ty = int(x), int(y)
        if 0 <= tx < MW and 0 <= ty < MH and urban[ty, tx]: n += 1
    return n / len(smp)
# 3. railways: main lines, parallel tracks merged
lay = json.load(open('layers.json'))['elements']
rw = [[P(g['lat'], g['lon']) for g in e['geometry']] for e in lay if e['type'] == 'way' and e.get('tags', {}).get('railway') == 'rail' and not e['tags'].get('service')]
rw.sort(key=lambda p: -seglen(p))
rocc = np.zeros((MH*2, MW*2), bool); rails = []
for pts in rw:
    smp = resample(pts, 0.5)
    hits = [rocc[min(MH*2-1, max(0, int(y*2))), min(MW*2-1, max(0, int(x*2)))] for x, y in smp]
    runs, cur = [], []
    for p, h in zip(smp, hits):
        if not h: cur.append(p)
        elif cur: runs.append(cur); cur = []
    if cur: runs.append(cur)
    for run in runs:
        if seglen(run) < 4: continue
        rails.append(dp(run, 0.3))
        for x, y in resample(run, 0.25):
            i, j = int(x*2), int(y*2); rocc[max(0, j-3):j+4, max(0, i-3):i+4] = True
print('rails', len(rails))
# 4. districts and landmarks
places = [(e['tags']['name'], *P(e['lat'], e['lon'])) for e in lay if e['type'] == 'node' and 'place' in e.get('tags', {})]
places = [p for p in places if -10 < p[1] < MW + 10 and -10 < p[2] < MH + 10 and p[0] not in ('Brno-město',)]
places.append(('Staré Město', *P(49.1951, 16.6080)))
rivers = json.load(open('rivers.json'))
# 5. encode: land use as run lengths, coordinates as tenths of a tile
def rle(g):
    flat = g.flatten().tolist(); out = []; i = 0
    while i < len(flat):
        j = i
        while j < len(flat) and flat[j] == flat[i] and j - i < 35 * 36: j += 1
        n = j - i
        out.append(str(flat[i]) + (('0123456789abcdefghijklmnopqrstuvwxyz'[n // 36] + '0123456789abcdefghijklmnopqrstuvwxyz'[n % 36]) if n > 1 else ''))
        i = j
    return ''.join(c if len(c) == 1 else c for c in out)
def enc_runs(g):
    # class digit, then 2 base-36 digits of run length (1-1295), or a bare digit for a single tile followed by another digit
    flat = g.flatten().tolist(); s = []; i = 0
    while i < len(flat):
        j = i
        while j < len(flat) and flat[j] == flat[i] and j - i < 1295: j += 1
        n = j - i; s.append('%d%s' % (flat[i], np.base_repr(n, 36).lower().rjust(2, '0'))); i = j
    return ''.join(s)
lc = enc_runs(grid)
# clip polylines to the map, leaving a margin of one and a half tiles
def clip(pts, m=1.5):
    lo_x, hi_x, lo_y, hi_y = m, MW - m, m, MH - m
    inside = lambda p: lo_x <= p[0] <= hi_x and lo_y <= p[1] <= hi_y
    out, cur = [], []
    smp = resample(pts, 0.25)
    for p in smp:
        if inside(p): cur.append(p)
        elif cur: out.append(cur); cur = []
    if cur: out.append(cur)
    return [dp(c, 0.25) for c in out if seglen(c) >= 0.6]
roads = [dict(w, pts=c) for w in roads for c in clip(w['pts'])]
rails = [c for r in rails for c in clip(r, 1.2)]
cls = {0: 'motorway', 1: 'trunk', 2: 'primary', 3: 'secondary', 4: 'tertiary', 5: 'residential'}
R = []
for w in roads:
    pts = [(round(x, 1), round(y, 1)) for x, y in w['pts']]
    nm = w['name'].split(';')[0]
    if nm.isdigit(): nm = 'Silnice ' + nm
    R.append([nm, w['r'], w.get('rural', 1 if (w['r'] <= 1 or frac_urban(w['pts']) < 0.4) else 0), [c for p in pts for c in p]])
data = {'lc': lc, 'roads': R, 'rails': [[c for x, y in r for c in (round(x, 1), round(y, 1))] for r in rails],
        'rivers': [[n, [c for x, y in pts for c in (round(x, 1), round(y, 1))]] for n, pts in rivers],
        'places': [[n, round(x, 1), round(y, 1)] for n, x, y in places]}
js = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
open('brno_data.json', 'w').write(js)
print('bytes', len(js.encode()), 'lc', len(lc), 'roads', len(json.dumps(R, ensure_ascii=False)), 'rails', len(json.dumps(data['rails'])), 'rivers', len(json.dumps(data['rivers'])))
# preview: land use + roads + rails
pal = {OPEN: (120, 160, 80), FOREST: (40, 90, 45), FARM: (200, 180, 90), VINE: (110, 140, 60), URBAN: (150, 140, 130), INDUS: (110, 110, 120), GREEN: (80, 170, 80), WATER: (40, 90, 160), AIR: (70, 70, 80)}
img = np.zeros((MH, MW, 3), dtype=np.uint8)
for c, col in pal.items(): img[grid == c] = col
S = 4; im = Image.fromarray(img).resize((MW*S, MH*S), Image.NEAREST); dr = ImageDraw.Draw(im)
for r in rails: dr.line([(x*S, y*S) for x, y in r], fill=(90, 50, 30), width=2)
for w in roads: dr.line([(x*S, y*S) for x, y in w['pts']], fill=(250, 250, 250) if w['r'] < 5 else (230, 210, 120), width=3 if w['r'] <= 2 else 2)
im.save('brno_preview.png')
