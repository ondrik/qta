import json, math, sys
from PIL import Image, ImageDraw
LON0, LON1, LAT0, LAT1, MW, MH = 16.500, 16.698, 49.140, 49.252, 480, 416  # about 30 m a tile
P = lambda lat, lon: ((lon - LON0) / (LON1 - LON0) * MW, (LAT1 - lat) / (LAT1 - LAT0) * MH)
RANK = {'motorway': 0, 'trunk': 1, 'primary': 2, 'secondary': 3, 'tertiary': 4}
def dp(pts, eps):
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]; dx, dy = b[0]-a[0], b[1]-a[1]; L = math.hypot(dx, dy) or 1e-9
    i, dm = 0, -1
    for k in range(1, len(pts)-1):
        p = pts[k]; d = abs(dy*(p[0]-a[0]) - dx*(p[1]-a[1])) / L if L > 1e-9 else math.hypot(p[0]-a[0], p[1]-a[1])
        if d > dm: dm, i = d, k
    if dm <= eps: return [a, b]
    return dp(pts[:i+1], eps)[:-1] + dp(pts[i:], eps)
def seglen(pts): return sum(math.hypot(pts[i+1][0]-pts[i][0], pts[i+1][1]-pts[i][1]) for i in range(len(pts)-1))
def resample(pts, step):
    out = [pts[0]]; acc = 0
    for i in range(len(pts)-1):
        a, b = pts[i], pts[i+1]; L = math.hypot(b[0]-a[0], b[1]-a[1]); t = step - acc
        while t <= L: out.append((a[0]+(b[0]-a[0])*t/L, a[1]+(b[1]-a[1])*t/L)); t += step
        acc = (acc + L) % step
    out.append(pts[-1]); return out
def build(maxrank, pair=1.7):
    d = json.load(open('roads.json'))
    ways, rbs = [], []
    for e in d['elements']:
        t = e['tags']; h = t.get('highway')
        pts = [P(g['lat'], g['lon']) for g in e['geometry']]
        if t.get('junction') in ('roundabout', 'circular'):
            cx = sum(p[0] for p in pts) / len(pts); cy = sum(p[1] for p in pts) / len(pts)
            rbs.append((cx, cy, max(math.hypot(p[0]-cx, p[1]-cy) for p in pts))); continue
        if h not in RANK or RANK[h] > maxrank or t.get('area') == 'yes': continue
        ways.append({'r': RANK[h], 'name': t.get('name') or t.get('ref') or '', 'pts': pts, 'len': seglen(pts), 'oneway': t.get('oneway') in ('yes', '-1') or h == 'motorway'})
    ways.sort(key=lambda w: (w['r'], -w['len']))
    # dual carriageways: a one-way road running alongside a kept one-way road of the same name is the other half
    occ = {}
    def near(name, x, y, r):
        cx, cy = int(x*2), int(y*2); R = int(r*2)+1
        for j in range(cy-R, cy+R+1):
            for i in range(cx-R, cx+R+1):
                for q in occ.get((name, i, j), ()):
                    if math.hypot(q[0]-x, q[1]-y) < r: return True
        return False
    kept = []
    for w in ways:
        if w['oneway'] and w['name']:
            smp = resample(w['pts'], 0.5)
            dup = sum(near(w['name'], x, y, pair) for x, y in smp) / len(smp)
            if dup > 0.5: continue
            for x, y in resample(w['pts'], 0.25): occ.setdefault((w['name'], int(x*2), int(y*2)), []).append((x, y))
        kept.append(w)
    # roundabouts become plain junctions: ends that touch one move to its middle
    for w in kept:
        for end in (0, -1):
            x, y = w['pts'][end]
            for cx, cy, r in rbs:
                if math.hypot(x-cx, y-cy) < r + 0.6: w['pts'][end] = (cx, cy); break
    out = []
    for w in kept:
        pts = dp(w['pts'], 0.25)
        if seglen(pts) < 0.8: continue
        out.append({'r': w['r'], 'name': w['name'], 'pts': pts})
    return out
if __name__ == '__main__':
    maxrank = int(sys.argv[1]) if len(sys.argv) > 1 else 4
    kept = build(maxrank)
    S = 4; im = Image.new('RGB', (MW*S, MH*S), (40, 70, 40)); dr = ImageDraw.Draw(im)
    col = {0: (230, 120, 60), 1: (230, 180, 60), 2: (240, 220, 120), 3: (240, 240, 240), 4: (170, 170, 170)}
    for w in kept:
        dr.line([(x*S, y*S) for x, y in w['pts']], fill=col[w['r']], width=3 if w['r'] < 3 else 2)
    im.save(f'roads_r{maxrank}.png'); print(len(kept), 'polylines', sum(len(w['pts']) for w in kept), 'points')
