# Check the built network against OpenStreetMap's grade separations: wherever two roads cross at different layers (a
# bridge over a street, a tunnel or an underpass beneath one) without meeting, the game must not have a junction there.
# Usage: python3 gradecheck.py net.json [png]   (QTA_MAP=brno5 for the detailed map; run where roads.json is)
import json, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from roads import P, MW, MH, SC, resample
B5 = os.environ.get('QTA_MAP') == 'brno5'
RK = {'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link'}
if B5: RK |= {'residential', 'unclassified', 'living_street'}
def level(t):
    l = t.get('layer', '').split(';')[0]
    if l.lstrip('-').isdigit(): return int(l)
    return 1 if t.get('bridge') in ('yes', 'viaduct') else -1 if t.get('tunnel') in ('yes',) else 0
def ways():
    out = []
    for e in json.load(open('roads.json'))['elements']:
        t = e['tags']
        if t.get('highway') not in RK or t.get('area') == 'yes' or (B5 and t.get('access') in ('private', 'no')): continue
        if not B5 and t.get('highway') == 'tertiary_link': continue
        out.append({'id': e['id'], 'name': t.get('name') or t.get('ref') or '', 'lv': level(t), 'nodes': e.get('nodes'), 'pts': [P(g['lat'], g['lon']) for g in e['geometry']], 'hw': t['highway']})
    return out
def cross_pt(a, b, c, d):
    r = (b[0] - a[0], b[1] - a[1]); s = (d[0] - c[0], d[1] - c[1]); den = r[0] * s[1] - r[1] * s[0]
    if abs(den) < 1e-12: return None
    t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den; u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den
    return (a[0] + t * r[0], a[1] + t * r[1], math.atan2(r[1], r[0]), math.atan2(s[1], s[0])) if 1e-9 < t < 1 - 1e-9 and 1e-9 < u < 1 - 1e-9 else None
def crossings(W):
    cell = 4.0; grid = {}
    for i, w in enumerate(W):
        for j, (a, b) in enumerate(zip(w['pts'], w['pts'][1:])):
            for cx in range(int(min(a[0], b[0]) // cell), int(max(a[0], b[0]) // cell) + 1):
                for cy in range(int(min(a[1], b[1]) // cell), int(max(a[1], b[1]) // cell) + 1): grid.setdefault((cx, cy), []).append((i, j))
    seen, out = set(), []
    for segs in grid.values():
        for p in range(len(segs)):
            for q in range(p + 1, len(segs)):
                (i, j), (k, l) = segs[p], segs[q]
                if i == k or W[i]['lv'] == W[k]['lv'] or (i, j, k, l) in seen: continue
                seen.add((i, j, k, l))
                x = cross_pt(W[i]['pts'][j], W[i]['pts'][j + 1], W[k]['pts'][l], W[k]['pts'][l + 1])
                if x and 2 < x[0] < MW - 2 and 2 < x[1] < MH - 2: out.append((x, i, k))
    # one per place and pair of roads
    res = []
    for x, i, k in out:
        if not any(math.hypot(x[0] - y[0][0], x[1] - y[0][1]) < 1.5 * SC / 2 and {i, k} == {y[1], y[2]} for y in res): res.append((x, i, k))
    return res
if __name__ == '__main__':
    W = ways(); net = json.load(open(sys.argv[1]))
    X = crossings(W)
    # the game's junctions: where street ends meet. A crossing is wrong if a street-level edge following each of the two
    # roads (running along it, near the crossing) meets the other at a junction there
    ends = {}
    for n, w in enumerate(net):
        for e in (tuple(round(v, 1) for v in w['pts'][0]), tuple(round(v, 1) for v in w['pts'][-1])): ends.setdefault(e, set()).add(n)
    r = 2.0 if B5 else 1.4
    def follows(w, way, x, y):
        """does game edge w run along OSM way `way` near (x, y)? (a stretch of it within a tile of the way, same direction)"""
        hits = 0
        P_ = resample(w['pts'], 1.0)
        for (p, q) in zip(P_, P_[1:]):
            for t in (0.5,):
                m = (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)
                if math.hypot(m[0] - x, m[1] - y) > r * 3: continue
                h = math.atan2(q[1] - p[1], q[0] - p[0])
                for (a, b) in zip(way['pts'], way['pts'][1:]):
                    L2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 or 1e-9; u = max(0, min(1, ((m[0] - a[0]) * (b[0] - a[0]) + (m[1] - a[1]) * (b[1] - a[1])) / L2))
                    d = math.hypot(a[0] + (b[0] - a[0]) * u - m[0], a[1] + (b[1] - a[1]) * u - m[1]); da = abs(h - math.atan2(b[1] - a[1], b[0] - a[0])) % math.pi
                    if d < (1.2 if B5 else 0.8) and min(da, math.pi - da) < 0.5: hits += 1; break
        return hits >= 2
    bad = []
    RS = [resample(w['pts'], 1.0) for w in net]
    for (x, y, aa, ab), i, k in X:
        near = [n for n, w in enumerate(net) if not w.get('over') and not w.get('tunnel') and any(math.hypot(p[0] - x, p[1] - y) < r * 6 for p in RS[n])]
        fa = {n for n in near if follows(net[n], W[i], x, y)}; fb = {n for n in near if follows(net[n], W[k], x, y)}
        sep = [n for n, w in enumerate(net) if (w.get('over') or w.get('tunnel')) and any(math.hypot(p[0] - x, p[1] - y) < r * 6 for p in RS[n])]
        up, lo = (W[i], W[k]) if W[i]['lv'] > W[k]['lv'] else (W[k], W[i])
        if any(follows(net[n], up, x, y) for n in sep if net[n].get('over')) or any(follows(net[n], lo, x, y) for n in sep if net[n].get('tunnel')): continue  # (carried over, or under)
        for e, ns in ends.items():
            if math.hypot(e[0] - x, e[1] - y) < r * 2.5 and ns & fa and ns & fb and (ns & fa) != (ns & fb) | (ns & fa) or (math.hypot(e[0] - x, e[1] - y) < r * 2.5 and ns & fa and ns & fb and len(ns & (fa | fb)) >= 2):
                bad.append((round(x, 1), round(y, 1), W[i]['name'], W[i]['lv'], W[k]['name'], W[k]['lv'], round(math.hypot(e[0] - x, e[1] - y), 1))); break
    print('grade-separated crossings', len(X), 'with a junction in the game', len(bad))
    for b in bad: print('  ', b)
    if len(sys.argv) > 2:
        from PIL import Image, ImageDraw
        S = 2 if B5 else 3; im = Image.new('RGB', (MW * S, MH * S), (35, 45, 35)); d = ImageDraw.Draw(im)
        for w in net: d.line([(px * S, py * S) for px, py in w['pts']], fill=(255, 60, 200) if w.get('over') else (80, 160, 255) if w.get('tunnel') else (170, 170, 170), width=2)
        for (x, y, *_), i, k in X: d.ellipse([x * S - 3, y * S - 3, x * S + 3, y * S + 3], outline=(60, 220, 60))
        for b in bad: d.ellipse([b[0] * S - 7, b[1] * S - 7, b[0] * S + 7, b[1] * S + 7], outline=(255, 40, 40), width=2)
        im.save(sys.argv[2])
