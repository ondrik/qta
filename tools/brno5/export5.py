# Pack inner Brno (5 m a tile) into brno5_data.js, which the game loads only for that map.
# Land is run-length coded per tile (for the rules) and as polygons (for drawing); buildings, land polygons and trees are
# variable-length base-64 numbers (like source maps' VLQ).
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
def clip(pts, m=1.0, eps=0.1):
    out, cur = [], []
    for p in resample(pts, 0.25):
        if m <= p[0] <= MW - m and m <= p[1] <= MH - m: cur.append(p)
        elif cur: out.append(cur); cur = []
    if cur: out.append(cur)
    return [dp(c, eps) for c in out if seglen(c) >= 1]
if __name__ == '__main__':
    land = np.load('land5.npy')
    net = json.load(open('net5.json'))
    R = []
    for w in net:
        nm = (w['name'] or '').split(';')[0]
        if nm.isdigit(): nm = 'Silnice ' + nm
        flag = 1 if w.get('tunnel') else (1 + w.get('lv', 1)) if w.get('over') else 0
        for c in ([w['pts']] if (w.get('tunnel') or w.get('over')) else clip(w['pts'])):
            R.append([nm, w['r'], w['rural'], fl(c), flag, w.get('lf', 1), w.get('lb', 1), w.get('wd', 64)])  # (lanes forward and back, carriageway px)
    lay = json.load(open('land3.json'))['elements']
    rails, trams = [], []
    for e in lay:
        t = e.get('tags', {})
        if e['type'] != 'way' or t.get('railway') not in ('rail', 'tram', 'light_rail') or t.get('tunnel') == 'yes': continue
        pts = [P(g['lat'], g['lon']) for g in e['geometry']]
        if t['railway'] == 'tram': trams += [fl(c, 2) for c in clip(pts, 0.5, 0.05)]  # (closely: the trams run on these, see tram5.py)
        else: rails += [fl(dp(c, 0.15)) for c in clip(pts, 0.5)]
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
    # universities' and colleges' grounds, by name (the game finds faculties' buildings in them): outer rings, in tiles
    from land5 import rings as land_rings
    unis = []
    for e in lay:
        t = e.get('tags', {})
        if t.get('amenity') not in ('university', 'college') or not t.get('name') or e['type'] == 'node': continue
        for r in land_rings(e):
            r = dp(r, 0.3)
            if len(r) >= 3 and any(0 <= x < MW and 0 <= y < MH for x, y in r): unis.append([t['name'], fl(r)])
    # traffic signals as mapped (not those of a pedestrian crossing, nor blinkers): the game lights the junctions they stand at
    sig = []
    if os.path.exists('signals.json'):
        for e in json.load(open('signals.json'))['elements']:
            if e.get('tags', {}).get('traffic_signals') in ('pedestrian_crossing', 'blinker'): continue
            x, y = P(e['lat'], e['lon'])
            if 0 <= x < MW and 0 <= y < MH: sig += [round(x, 1), round(y, 1)]
    # buildings, sorted top to bottom: kind, floors, roof shape and height, glass, colours, name, then each piece in
    # tenths of a tile: a turned rectangle (corner, angle, size), a right-angled outline (angle, then each ring's first
    # corner and its steps along and across the frame in turn) or a free polygon (each ring's corner and steps); every
    # first corner is relative to the one before
    bl = json.load(open('bld5.json'))
    def first(q): return (q['x'], q['y']) if q['t'] == 'r' else (q['r'][0]['x'], q['r'][0]['y']) if q['t'] == 'o' else q['r'][0][0]
    bl.sort(key=lambda b: (first(b['p'][0])[1], first(b['p'][0])[0]))
    names, cols = [], []
    idx = lambda arr, v: 0 if v is None else (arr.index(v) + 1 if v in arr else (arr.append(v) or len(arr)))
    s, px, py = [], 0, 0
    T10 = lambda v: int(round(v * 10))
    def at(x, y):
        global px, py
        o = vlq(T10(x) - px) + vlq(T10(y) - py); px, py = T10(x), T10(y); return o
    for b in bl:
        s.append(''.join(vlq(v) for v in (b['k'], b['lv'], b['rf'] + 1, b['rh'], b['gl'], idx(cols, b['wc']), idx(cols, b['rc']), idx(names, b['nm']), len(b['p']))))
        for q in b['p']:
            if q['t'] == 'r': s.append(vlq(0) + at(q['x'], q['y']) + vlq(T10(q['a'] + 45)) + vlq(T10(q['w'])) + vlq(T10(q['h'])))
            elif q['t'] == 'o':
                s.append(vlq(1) + vlq(T10(q['a'] + 45)) + vlq(len(q['r'])))
                for r in q['r']: s.append(at(r['x'], r['y']) + vlq(len(r['d'])) + ''.join(vlq(T10(d)) for d in r['d']))
            else:
                s.append(vlq(2) + vlq(len(q['r'])))
                for r in q['r']:
                    s.append(at(*r[0]) + vlq(len(r)) + ''.join(vlq(T10(b2[0]) - T10(a2[0])) + vlq(T10(b2[1]) - T10(a2[1])) for a2, b2 in zip(r, r[1:])))
    bld = ''.join(s)
    # the ground's areas as polygons, in paint order: for each kind its class, how many polygons and lines, then each
    # polygon's rings (first corner relative to the last first corner, then steps) and each line's width and points,
    # all in tenths of a tile
    lp, px, py = [], 0, 0
    steps = lambda r: vlq(len(r)) + ''.join(vlq(T10(b2[0]) - T10(a2[0])) + vlq(T10(b2[1]) - T10(a2[1])) for a2, b2 in zip(r, r[1:]))
    for c, ps, ls in json.load(open('land5poly.json')):
        lp.append(vlq(c) + vlq(len(ps)) + vlq(len(ls)))
        for q in ps: lp.append(vlq(len(q)) + ''.join(at(*r[0]) + steps(r) for r in q))
        for wd, pts in ls: lp.append(vlq(T10(wd)) + at(*pts[0]) + steps(pts))
    lands = ''.join(lp)
    # trees, in quarter tiles, sorted, as deltas
    tr = sorted({(round(P(e['lat'], e['lon'])[0] * 4), round(P(e['lat'], e['lon'])[1] * 4)) for e in json.load(open('trees.json'))['elements'] if e['type'] == 'node'}, key=lambda p: (p[1], p[0]))
    tr = [p for p in tr if 4 < p[0] < MW * 4 - 4 and 4 < p[1] < MH * 4 - 4 and 0 <= p[1] // 4 < MH and 0 <= p[0] // 4 < MW and land[p[1] // 4, p[0] // 4] != 7]
    ts, px, py = [], 0, 0
    for x, y in tr: ts.append(vlq(x - px) + vlq(y - py)); px, py = x, y
    rivers = json.load(open('rivers5.json'))
    # the tram routes: line, its colour, where it goes, its path (hundredths of a tile), its stops (arc length, name),
    # where it runs under (-1) or over (1) a street, which routes it goes on as at a terminus, and flags: 1 it comes in
    # over the map's edge, 2 it leaves over it, 4 trams come onto it from another route
    tl, tsn = [], []
    for r in json.load(open('tram5.json')):
        st = []
        for s, nm in r['stops']:
            if nm not in tsn: tsn.append(nm)
            st += [s, tsn.index(nm)]
        tl.append([r['ref'], r['col'], r['dest'], fl(r['pts'], 2), st, [v for q in r['lv'] for v in q], r['next'], r['edge0'] | r['edge1'] << 1 | r['fed'] << 2])
    data = {'bbox': [LON0, LON1, LAT0, LAT1], 'mw': MW, 'mh': MH, 'lc': runs(land), 'roads': R, 'rails': rails, 'trams': trams,
            'rivers': [[n, [c for x, y in pts for c in (round(x, 1), round(y, 1))]] for n, pts in rivers], 'places': places, 'pois': pois,
            'bld': bld, 'bnames': names, 'bcols': cols, 'trees': ''.join(ts), 'land': lands, 'unis': unis, 'sig': sig, 'tl': tl, 'tsn': tsn}
    js = '// Inner Brno at about 5 m a tile, from OpenStreetMap (© OpenStreetMap contributors, ODbL). Built by tools/brno5.\nwindow.BRNO5_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n'
    out = sys.argv[1] if len(sys.argv) > 1 else 'brno5_data.js'
    open(out, 'w').write(js)
    sizes = {k: len(json.dumps(v, ensure_ascii=False)) for k, v in data.items()}
    print('bytes', len(js.encode()), sizes, 'roads', len(R), 'rails', len(rails), 'trams', len(trams), 'pois', len(pois), 'trees', len(tr), 'places', len(places))
