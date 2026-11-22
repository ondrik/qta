# Pack inner Brno (5 m a tile) into brno5_data.js, which the game loads only for that map.
# Land is run-length coded; buildings and trees are variable-length base-64 numbers (like source maps' VLQ).
import json, math, os, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'brno'))
from roads import MW, MH, P, LON0, LON1, LAT0, LAT1, resample, dp, seglen
B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
def vlq(n):
    """one signed integer: 5 bits a character, the sixth bit says more follows, the lowest bit of the first is the sign"""
    v = (-n << 1) | 1 if n < 0 else n << 1
    s = ''
    while True:
        d = v & 31; v >>= 5
        if v: d |= 32
        s += B64[d]
        if not v: return s
def runs(g):
    flat = g.flatten().tolist(); s = []; i = 0
    while i < len(flat):
        j = i
        while j < len(flat) and flat[j] == flat[i] and j - i < 1295: j += 1
        s.append(np.base_repr(flat[i], 36).lower() + np.base_repr(j - i, 36).lower().rjust(2, '0')); i = j
    return ''.join(s)
def fl(pts, nd=1): return [c for x, y in pts for c in (round(x, nd), round(y, nd))]
def clip(pts, m=1.0):
    out, cur = [], []
    for p in resample(pts, 0.25):
        if m <= p[0] <= MW - m and m <= p[1] <= MH - m: cur.append(p)
        elif cur: out.append(cur); cur = []
    if cur: out.append(cur)
    return [dp(c, 0.2) for c in out if seglen(c) >= 1]
if __name__ == '__main__':
    land = np.load('land5.npy')
    net = json.load(open('net5.json'))
    R = []
    for w in net:
        nm = (w['name'] or '').split(';')[0]
        if nm.isdigit(): nm = 'Silnice ' + nm
        flag = 1 if w.get('tunnel') else (1 + w.get('lv', 1)) if w.get('over') else 0
        for c in ([w['pts']] if (w.get('tunnel') or w.get('over')) else clip(w['pts'])):
            R.append([nm, w['r'], w['rural'], fl(c)] + ([flag] if flag else []))
    lay = json.load(open('land3.json'))['elements']
    rails, trams = [], []
    for e in lay:
        t = e.get('tags', {})
        if e['type'] != 'way' or t.get('railway') not in ('rail', 'tram', 'light_rail') or t.get('tunnel') == 'yes': continue
        pts = [P(g['lat'], g['lon']) for g in e['geometry']]
        for c in clip(pts, 0.5): (trams if t['railway'] == 'tram' else rails).append(fl(dp(c, 0.15)))
    places = [(e['tags']['name'], *P(e['lat'], e['lon'])) for e in lay if e['type'] == 'node' and 'place' in e.get('tags', {})]
    places = [[n, round(x, 1), round(y, 1)] for n, x, y in places if -150 < x < MW + 150 and -150 < y < MH + 150 and n not in ('Brno-město',)]
    places.append(['Staré Město', *[round(v, 1) for v in P(49.1951, 16.6080)]])
    pois = []
    for e in lay:
        t = e.get('tags', {}); am = t.get('amenity')
        if am not in ('hospital', 'police', 'fire_station', 'fuel', 'clinic'): continue
        if e['type'] == 'node': x, y = P(e['lat'], e['lon'])
        elif e.get('geometry'): g = e['geometry']; x = sum(P(q['lat'], q['lon'])[0] for q in g) / len(g); y = sum(P(q['lat'], q['lon'])[1] for q in g) / len(g)
        elif e.get('bounds'): b = e['bounds']; x, y = P((b['minlat'] + b['maxlat']) / 2, (b['minlon'] + b['maxlon']) / 2)
        else: continue
        if 2 < x < MW - 2 and 2 < y < MH - 2: pois.append([am, t.get('name', ''), round(x, 1), round(y, 1)])
    # buildings: sorted top to bottom; each one's corner relative to the previous one, its rectangles relative to its corner
    bl = json.load(open('bld5.json'))
    for b in bl: b['x0'] = min(r[0] for r in b['r']); b['y0'] = min(r[1] for r in b['r'])
    bl.sort(key=lambda b: (b['y0'], b['x0']))
    names, cols = [], []
    idx = lambda arr, v: 0 if v is None else (arr.index(v) + 1 if v in arr else (arr.append(v) or len(arr)))
    s, px, py = [], 0, 0
    for b in bl:
        s.append(vlq(b['k']) + vlq(b['lv']) + vlq(b['rf'] + 1) + vlq(idx(cols, b['wc'])) + vlq(idx(cols, b['rc'])) + vlq(idx(names, b['nm'])) + vlq(b['x0'] - px) + vlq(b['y0'] - py) + vlq(len(b['r'])))
        for x, y, w, h in b['r']: s.append(vlq(x - b['x0']) + vlq(y - b['y0']) + vlq(w) + vlq(h))
        px, py = b['x0'], b['y0']
    bld = ''.join(s)
    # trees, in quarter tiles, sorted, as deltas
    tr = sorted({(round(P(e['lat'], e['lon'])[0] * 4), round(P(e['lat'], e['lon'])[1] * 4)) for e in json.load(open('trees.json'))['elements'] if e['type'] == 'node'}, key=lambda p: (p[1], p[0]))
    tr = [p for p in tr if 4 < p[0] < MW * 4 - 4 and 4 < p[1] < MH * 4 - 4 and 0 <= p[1] // 4 < MH and 0 <= p[0] // 4 < MW and land[p[1] // 4, p[0] // 4] != 7]
    ts, px, py = [], 0, 0
    for x, y in tr: ts.append(vlq(x - px) + vlq(y - py)); px, py = x, y
    rivers = json.load(open('rivers5.json'))
    data = {'bbox': [LON0, LON1, LAT0, LAT1], 'mw': MW, 'mh': MH, 'lc': runs(land), 'roads': R, 'rails': rails, 'trams': trams,
            'rivers': [[n, [c for x, y in pts for c in (round(x, 1), round(y, 1))]] for n, pts in rivers], 'places': places, 'pois': pois,
            'bld': bld, 'bnames': names, 'bcols': cols, 'trees': ''.join(ts)}
    js = '// Inner Brno at about 5 m a tile, from OpenStreetMap (© OpenStreetMap contributors, ODbL). Built by tools/brno5.\nwindow.BRNO5_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n'
    out = sys.argv[1] if len(sys.argv) > 1 else 'brno5_data.js'
    open(out, 'w').write(js)
    sizes = {k: len(json.dumps(v, ensure_ascii=False)) for k, v in data.items()}
    print('bytes', len(js.encode()), sizes, 'roads', len(R), 'rails', len(rails), 'trams', len(trams), 'pois', len(pois), 'trees', len(tr), 'places', len(places))
