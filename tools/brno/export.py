import json, math
import numpy as np
from scipy import ndimage
from PIL import Image, ImageDraw
from roads import resample, dp, seglen, P, MW, MH, SC
grid = np.load('landgrid.npy')
OPEN, FOREST, FARM, VINE, URBAN, INDUS, GREEN, WATER, AIR = range(9)
# 1. smooth away specks (but keep water's shape) with a majority vote over about 90 m
def majority(g):
    cnt = np.stack([ndimage.uniform_filter((g == c).astype(float), 2 * round(SC) + 1, mode='nearest') for c in range(9)])
    best = cnt.argmax(axis=0)
    return np.where(g == WATER, g, best)
grid = majority(grid)
urban = (grid == URBAN) | (grid == INDUS)
# 2. the connected road network from net.py
roads = json.load(open('net.json'))  # the connected network from net.py
def frac_urban(pts):
    smp = resample(pts, 0.5); n = 0
    for x, y in smp:
        tx, ty = int(x), int(y)
        if 0 <= tx < MW and 0 <= ty < MH and urban[ty, tx]: n += 1
    return n / len(smp)
# 3. railways: every running line painted, parallel tracks merged by closing, then thinned and traced like the roads
import net
lay = json.load(open('layers.json'))['elements']
rsel = [{'r': 0, 'name': '', 'pts': [P(g['lat'], g['lon']) for g in e['geometry']]} for e in lay
        if e['type'] == 'way' and e.get('tags', {}).get('railway') == 'rail' and e['tags'].get('service') not in ('yard', 'siding', 'spur', 'crossover')]
rc, re_, _ = net.trace_clean(rsel, spur=8 * net.R * SC, minlen=3 * net.R * SC, width=1.0 * SC, close_iter=round(2 * SC))
rails = []
for pts in net.graph_edges(rc, re_):
    for _ in range(round(4 * SC)):
        if len(pts) > 4: pts = [pts[0], pts[1]] + [((pts[i-2][0] + pts[i-1][0] + pts[i][0] + pts[i+1][0] + pts[i+2][0]) / 5, (pts[i-2][1] + pts[i-1][1] + pts[i][1] + pts[i+1][1] + pts[i+2][1]) / 5) for i in range(2, len(pts) - 2)] + [pts[-2], pts[-1]]
    pts = dp(pts, 0.2 * SC)
    if seglen(pts) >= 2 * SC: rails.append(pts)
print('rails', len(rails))
# 4. districts and landmarks
places = [(e['tags']['name'], *P(e['lat'], e['lon'])) for e in lay if e['type'] == 'node' and 'place' in e.get('tags', {})]
places = [p for p in places if -10 < p[1] < MW + 10 and -10 < p[2] < MH + 10 and p[0] not in ('Brno-město',)]
places.append(('Staré Město', *P(49.1951, 16.6080)))
rivers = json.load(open('rivers.json'))
# 5. encode: land use as run lengths, coordinates as tenths of a tile
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
roads = [dict(w, pts=c) for w in roads for c in ([w['pts']] if w.get('over') or w.get('tunnel') else clip(w['pts']))]
rails = [c for r in rails for c in clip(r, 1.2)]
cls = {0: 'motorway', 1: 'trunk', 2: 'primary', 3: 'secondary', 4: 'tertiary', 5: 'residential'}
R = []
for w in roads:
    pts = [(round(x, 1), round(y, 1)) for x, y in w['pts']]
    nm = w['name'].split(';')[0]
    if nm.isdigit(): nm = 'Silnice ' + nm
    flag = 1 if w.get('tunnel') else (1 + w.get('lv', 1)) if w.get('over') else 0  # (1 a tunnel, 2 or 3 an overpass on that layer + 1)
    R.append([nm, w['r'], w.get('rural', 1 if (w['r'] <= 1 or frac_urban(w['pts']) < 0.4) else 0), [c for p in pts for c in p]] + ([flag] if flag else []))
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
