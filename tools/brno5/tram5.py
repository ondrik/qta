# Inner Brno's tram lines (5 m a tile): every OpenStreetMap tram route (one relation for each direction and variant)
# as a path along its own track, cut where it leaves the map, with its stops, where it runs under or over a street,
# and which route a tram goes on with at a terminus inside the map -> tram5.json
import json, math, os, sys
from shapely.geometry import LineString
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'brno'))
from roads import MW, MH, P, dp, resample

EDGE = 0.5   # a path is cut this far inside the map's border (tiles)
JOIN = 4.0   # a route ending this close to another one of its line's start goes on as that one (tiles)

def cum(pts):
    s = [0.0]
    for i in range(1, len(pts)): s.append(s[-1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    return s

def proj(pts, cs, q, s0=0.0):
    """the arc length of the point on the path nearest to q, at or after s0, and how far q is from it"""
    best = (1e9, 0.0)
    for i in range(len(pts) - 1):
        if cs[i + 1] < s0: continue
        (ax, ay), (bx, by) = pts[i], pts[i + 1]
        dx, dy = bx - ax, by - ay; l2 = dx * dx + dy * dy or 1e-9
        t = max(0.0, min(1.0, ((q[0] - ax) * dx + (q[1] - ay) * dy) / l2))
        d = math.hypot(ax + dx * t - q[0], ay + dy * t - q[1])
        s = cs[i] + t * (cs[i + 1] - cs[i])
        if s >= s0 and d < best[0]: best = (d, s)
    return best[1], best[0]

def route(rel):
    """the route's track ways joined end to end in order, as [(lat, lon, way id)], split where they don't meet"""
    ways = [m for m in rel['members'] if m['type'] == 'way' and m['role'] == '' and m.get('geometry')]
    pieces, cur = [], []
    for i, m in enumerate(ways):
        g = [(q['lat'], q['lon']) for q in m['geometry']]
        if not cur:
            if i + 1 < len(ways):  # the first way: whichever way round meets the next one
                n = [(q['lat'], q['lon']) for q in ways[i + 1]['geometry']]
                if g[0] in (n[0], n[-1]): g = g[::-1]
            cur = [(a, b, m['ref']) for a, b in g]; continue
        last = cur[-1][:2]
        if g[-1] == last: g = g[::-1]
        elif g[0] != last:
            if len(cur) and g[-1] == cur[0][:2] or g[0] == cur[0][:2]: pass  # (a route listed backwards: rare, left as a gap)
            pieces.append(cur); cur = [(a, b, m['ref']) for a, b in g]; continue
        cur += [(a, b, m['ref']) for a, b in g[1:]]
    if cur: pieces.append(cur)
    return pieces

if __name__ == '__main__':
    d = json.load(open('trams.json'))['elements']
    names = {e['id']: e.get('tags', {}).get('name', '') for e in d if e['type'] == 'node'}
    wtag = {e['id']: e.get('tags', {}) for e in json.load(open('land3.json'))['elements'] if e['type'] == 'way'}
    ground = [LineString(e['pts']) for e in json.load(open('net5.json')) if not e.get('over') and not e.get('tunnel')]
    wgeo = {e['id']: [P(q['lat'], q['lon']) for q in e['geometry']] for e in json.load(open('land3.json'))['elements'] if e['type'] == 'way' and e.get('geometry')}
    lvc = {}
    def level(wid, a, b):
        """-1 under the street (a tram tunnel), 1 up on a bridge that crosses a street, else 0"""
        if wid not in lvc:
            t, v = wtag.get(wid, {}), 0
            if t.get('tunnel') == 'yes': v = -1
            elif (t.get('bridge') == 'yes' or int(t.get('layer', '0') or 0) > 0) and len(wgeo.get(wid, [])) > 1:
                L = LineString(wgeo[wid])
                if any(g.intersects(L) for g in ground): v = 1
            lvc[wid] = v
        return lvc[wid]
    runs = []
    for rel in sorted((e for e in d if e['type'] == 'relation'), key=lambda e: (int(e['tags'].get('ref', '0')), e['id'])):
        t = rel['tags']
        ref, col = t.get('ref', ''), t.get('colour', '#c0392b')
        dest = (t.get('to') or t.get('name', '').split('⇒')[-1].split('=>')[-1]).strip()
        stops = [(names.get(m['ref'], ''), P(m['lat'], m['lon'])) for m in rel['members'] if m['type'] == 'node' and m['role'].startswith('stop') and 'lat' in m]
        for piece in route(rel):
            pts = [P(a, b) for a, b, _ in piece]
            wid = [w for _, _, w in piece]
            # resample to cut cleanly at the map's border, keeping which way each bit came from
            fine, fw = [], []
            for i in range(len(pts) - 1):
                a, b = pts[i], pts[i + 1]; n = max(1, int(math.hypot(b[0] - a[0], b[1] - a[1]) / 0.25))
                for k in range(n): fine.append((a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n)); fw.append(wid[i + 1])
            fine.append(pts[-1]); fw.append(wid[-1])
            inside = [EDGE <= x <= MW - EDGE and EDGE <= y <= MH - EDGE for x, y in fine]
            i = 0
            while i < len(fine):
                if not inside[i]: i += 1; continue
                j = i
                while j + 1 < len(fine) and inside[j + 1]: j += 1
                seg, sw = fine[i:j + 1], fw[i:j + 1]
                if len(seg) > 8:
                    cs = cum(seg)
                    if cs[-1] >= 20:
                        lv = []  # [s0, s1, level] where it isn't at street level
                        for k in range(len(seg) - 1):
                            v = level(sw[k + 1], seg[k], seg[k + 1])
                            if v and lv and lv[-1][2] == v and abs(lv[-1][1] - cs[k]) < 1e-6: lv[-1][1] = cs[k + 1]
                            elif v: lv.append([cs[k], cs[k + 1], v])
                        S, s0 = [], 0.0
                        for nm, q in stops:
                            s, dd = proj(seg, cs, q, s0)
                            if dd < 3 and 0 < s < cs[-1] - 1: S.append((round(s, 2), nm)); s0 = s
                        simp = dp(seg, 0.05)
                        runs.append({'ref': ref, 'col': col, 'dest': dest, 'rel': rel['id'], 'pts': [[round(x, 2), round(y, 2)] for x, y in simp],
                                     'len': round(cs[-1], 2), 'stops': S, 'lv': [[round(a, 2), round(b, 2), v] for a, b, v in lv],
                                     'edge0': i > 0 or not inside[0] or fine[0][0] < EDGE + 0.5 or fine[0][1] < EDGE + 0.5, 'edge1': j < len(fine) - 1})
                i = j + 1
    # (dp keeps every point it doesn't drop exactly, so the arc lengths of the simplified path differ only a little: rescale)
    for r in runs:
        cs = cum(r['pts']); f = cs[-1] / r['len']
        r['stops'] = [(round(s * f, 2), nm) for s, nm in r['stops']]
        r['lv'] = [[round(a * f, 2), round(b * f, 2), v] for a, b, v in r['lv']]
        r['len'] = round(cs[-1], 2)
    # at a terminus inside the map a tram goes on as one of its line's routes starting there
    for r in runs:
        e = r['pts'][-1]
        r['next'] = [k for k, o in enumerate(runs) if o is not r and o['ref'] == r['ref'] and not o['edge0'] and math.hypot(o['pts'][0][0] - e[0], o['pts'][0][1] - e[1]) < JOIN] if not r['edge1'] else []
    fed = {k for r in runs for k in r['next']}
    for k, r in enumerate(runs): r['fed'] = k in fed
    json.dump(runs, open('tram5.json', 'w'))
    for k, r in enumerate(runs):
        print(k, r['ref'], r['dest'][:28].ljust(28), 'len', round(r['len']), 'stops', len(r['stops']), 'edge', int(r['edge0']), int(r['edge1']), 'next', r['next'], 'fed', int(r['fed']), 'lv', [(round(a), round(b), v) for a, b, v in r['lv']])
    print('runs', len(runs), 'total', round(sum(r['len'] for r in runs)))
