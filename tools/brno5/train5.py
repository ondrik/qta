# Inner Brno's trains (5 m a tile): every OpenStreetMap passenger train route through the map (one relation for each
# direction and variant) as a path along its own track, cut where it leaves the map, with the stations it stops at,
# where it runs in a tunnel or on a bridge over a street, and which route a train goes on as at a terminus inside the
# map; and the stations' platforms -> train5.json. Like tram5.py, whose helpers it shares.
# Most routes in OpenStreetMap list only their ends, so the stations come from the stations themselves (stations.json):
# an S train stops at every one it passes, a regional train at the main ones, an express at the main station.
#   python3 train5.py [data.js]   (data.js: the built map, for its streets, when net5.json is gone; ../../brno5_data.js)
import json, math, os, sys
from shapely.geometry import LineString
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'brno'))
from roads import MW, MH, P, dp
from tram5 import cum, proj, EDGE

NEAR = 8.0   # a station node this far from the track still counts (old-style routes list the station, not the stop)
MAIN = ('Brno hlavní nádraží', 'Brno-Královo Pole', 'Brno-Židenice')  # (where the regional trains stop)
FREIGHT = ('Brno dolní nádraží',)

def kind(t):
    """s: a suburban unit (the S lines), r: a regional train, x: an express (loco and coaches)"""
    ref, svc = (t.get('ref') or '').strip(), t.get('service', '')
    if svc in ('long_distance', 'high_speed', 'night') or ref[:2] in ('EC', 'IC', 'EN', 'Ex', 'RJ', 'LE', 'Rx', 'rj', 'Sp') or ref[:3] == 'ICE': return 'x'
    if ref[:1] == 'S' or svc == 'commuter': return 's'
    return 'r'

def op(t):
    o = (t.get('operator') or '').lower()
    return 'rj' if 'regiojet' in o else 'le' if 'leo' in o else 'zssk' if 'žssk' in o or 'zssk' in o else 'obb' if 'öbb' in o or 'obb' in o else 'arr' if 'arriva' in o else 'cd'

def pieces(rel):
    """the route's track ways joined end to end in order, as [(x, y, way id)] in tiles, split where they don't meet"""
    out, cur = [], []
    for m in rel['members']:
        if m['type'] != 'way' or m['role'] not in ('', 'forward', 'backward'): continue
        g = [(q['lat'], q['lon']) for q in (m.get('geometry') or []) if q]
        if len(g) < 2:  # (outside the box: a gap)
            if cur: out.append(cur); cur = []
            continue
        seg = [(*P(a, b), m['ref']) for a, b in g]
        if not cur: cur = seg; continue
        last = cur[-1][:2]
        if math.dist(seg[-1][:2], last) < 0.05: seg = seg[::-1]
        elif math.dist(seg[0][:2], last) >= 0.05:
            if len(cur) > 1 and math.dist(cur[0][:2], seg[0][:2]) < 0.05 or math.dist(cur[0][:2], seg[-1][:2]) < 0.05:
                cur = cur[::-1]  # (the first way was taken the wrong way round)
                if math.dist(seg[-1][:2], cur[-1][:2]) < 0.05: seg = seg[::-1]
            if math.dist(seg[0][:2], cur[-1][:2]) >= 0.05: out.append(cur); cur = seg; continue
        cur += seg[1:]
    if cur: out.append(cur)
    return out

if __name__ == '__main__':
    d = json.load(open('trains.json'))['elements']
    sd = json.load(open('stations.json'))['elements']
    # the stations: each one's points (the station node, the stop positions on its tracks), by its full name
    full = {}
    for e in sd:
        t = e.get('tags', {})
        if e['type'] == 'node' and t.get('railway') in ('station', 'halt') and t.get('name') and t['name'] not in FREIGHT:
            full[t['name']] = t['name']
            if t.get('short_name'): full[t['short_name']] = t['name']
    STA = {}
    for e in sd:
        t = e.get('tags', {})
        if e['type'] == 'node' and (t.get('railway') in ('station', 'halt', 'stop') or t.get('public_transport') == 'stop_position') and full.get(t.get('name')):
            STA.setdefault(full[t['name']], []).append(P(e['lat'], e['lon']))
    print('stations', {k: len(v) for k, v in STA.items()})
    # the platforms near them (not the trams'): outlines or lines, in tiles
    plats = []
    for e in sd:
        t = e.get('tags', {})
        if e['type'] != 'way' or t.get('railway') != 'platform' and t.get('public_transport') != 'platform' or t.get('tram') == 'yes' or t.get('bus') == 'yes' or not e.get('geometry'): continue
        g = [P(q['lat'], q['lon']) for q in e['geometry']]
        if any(math.dist(g[0], q) < 80 for v in STA.values() for q in v): plats.append([round(c, 1) for x, y in g for c in (x, y)])
    nodes = {e['id']: e for e in d if e['type'] == 'node'}
    ways = {e['id']: e for e in d if e['type'] == 'way'}
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'brno5_data.js')
    if os.path.exists('net5.json'): ground = [LineString(e['pts']) for e in json.load(open('net5.json')) if not e.get('over') and not e.get('tunnel')]
    else:
        js = open(src).read(); data = json.loads(js[js.index('{'):js.rindex('}') + 1])
        ground = [LineString(list(zip(r[3][::2], r[3][1::2]))) for r in data['roads'] if r[4] == 0 and len(r[3]) >= 4]
    lvc = {}
    def level(wid):
        """-1 in a tunnel, 1 up on a bridge that crosses a street, else 0"""
        if wid not in lvc:
            t, v = ways.get(wid, {}).get('tags', {}), 0
            if t.get('tunnel') in ('yes', 'flooded'): v = -1
            elif (t.get('bridge') in ('yes', 'viaduct') or int((t.get('layer') or '0').split(';')[0] or 0) > 0) and ways.get(wid, {}).get('geometry'):
                L = LineString([P(q['lat'], q['lon']) for q in ways[wid]['geometry']])
                if any(g.intersects(L) for g in ground): v = 1
            lvc[wid] = v
        return lvc[wid]
    runs = []
    rels = sorted((e for e in d if e['type'] == 'relation'), key=lambda e: (kind(e['tags']), e['tags'].get('ref', ''), e['id']))
    for rel in rels:
        t = rel['tags']
        if t.get('route') != 'train' or t.get('disused') == 'yes': continue
        ref, k = (t.get('ref') or '').strip(), kind(t)
        dest = (t.get('to') or t.get('name', '').split('⇒')[-1].split('=>')[-1].split('->')[-1]).strip()
        stops = [(nm, q) for nm, Q in STA.items() if k == 's' or nm in MAIN[:1 if k == 'x' else 3] for q in Q]
        for piece in pieces(rel):
            pts = [(x, y) for x, y, _ in piece]; wid = [w for _, _, w in piece]
            fine, fw = [], []
            for i in range(len(pts) - 1):
                a, b = pts[i], pts[i + 1]; n = max(1, int(math.hypot(b[0] - a[0], b[1] - a[1]) / 0.25))
                for q in range(n): fine.append((a[0] + (b[0] - a[0]) * q / n, a[1] + (b[1] - a[1]) * q / n)); fw.append(wid[i + 1])
            fine.append(pts[-1]); fw.append(wid[-1])
            inside = [EDGE <= x <= MW - EDGE and EDGE <= y <= MH - EDGE for x, y in fine]
            i = 0
            while i < len(fine):
                if not inside[i]: i += 1; continue
                j = i
                while j + 1 < len(fine) and inside[j + 1]: j += 1
                seg, sw = fine[i:j + 1], fw[i:j + 1]
                i = j + 1
                if len(seg) < 8: continue
                cs = cum(seg)
                if cs[-1] < 60: continue
                lv = []
                for q in range(len(seg) - 1):
                    v = level(sw[q + 1])
                    if v and lv and lv[-1][2] == v and abs(lv[-1][1] - cs[q]) < 1e-6: lv[-1][1] = cs[q + 1]
                    elif v: lv.append([cs[q], cs[q + 1], v])
                best = {}  # (each station where its nearest point to the track is)
                for nm, q in stops:
                    s, dd = proj(seg, cs, q)
                    if dd < NEAR and (nm not in best or dd < best[nm][1]): best[nm] = (s, dd)
                S = sorted((round(min(max(s, 0.5), cs[-1] - 0.5), 2), nm) for nm, (s, dd) in best.items())  # (a terminus too)
                simp = dp(seg, 0.05)
                runs.append({'ref': ref, 'kind': k, 'op': op(t), 'col': t.get('colour', ''), 'dest': dest, 'rel': rel['id'],
                             'pts': [[round(x, 2), round(y, 2)] for x, y in simp], 'len': round(cs[-1], 2), 'stops': S,
                             'lv': [[round(a, 2), round(b, 2), v] for a, b, v in lv],
                             'edge0': i - len(seg) > 0 or not inside[0], 'edge1': j < len(fine) - 1})
    for r in runs:  # (dp keeps the points it doesn't drop exactly: rescale the arc lengths)
        cs = cum(r['pts']); f = cs[-1] / r['len']
        r['stops'] = [(round(s * f, 2), nm) for s, nm in r['stops']]
        r['lv'] = [[round(a * f, 2), round(b * f, 2), v] for a, b, v in r['lv']]
        r['len'] = round(cs[-1], 2)
    # one of each: the same kind of train over the same track with the same stops (the variants, the other days)
    uniq, seen = [], {}
    for r in runs:
        key = (r['kind'], round(r['pts'][0][0] / 4), round(r['pts'][0][1] / 4), round(r['pts'][-1][0] / 4), round(r['pts'][-1][1] / 4), round(r['len'] / 20), tuple(nm for _, nm in r['stops']))
        if key in seen: seen[key]['refs'].add(r['ref']); continue
        r['refs'] = {r['ref']}; seen[key] = r; uniq.append(r)
    runs = uniq
    # (a train doesn't run on into its way back the way a tram goes round its loop: at a terminus inside the map it
    # waits at the platform, and the next one out starts from there)
    for r in runs: r['refs'] = sorted(r['refs']); r['next'] = []; r['fed'] = False
    # (no passenger line in the map crosses a street on the level: OpenStreetMap's level crossings here are all on
    # sidings, yards and industrial spurs, which no route uses)
    json.dump({'runs': runs, 'plats': plats}, open('train5.json', 'w'), ensure_ascii=False)
    for k, r in enumerate(runs):
        print(k, r['kind'], ','.join(r['refs'])[:14].ljust(14), r['op'], r['dest'][:24].ljust(24), 'len', round(r['len']), 'stops', len(r['stops']), [nm[:14] for _, nm in r['stops']][:6],
              'edge', int(r['edge0']), int(r['edge1']), 'next', r['next'], 'fed', int(r['fed']), 'lv', [(round(a), round(b), v) for a, b, v in r['lv']])
    print('runs', len(runs), 'total', round(sum(r['len'] for r in runs)), 'platforms', len(plats))

def pack(path='train5.json'):
    """the trains for brno5_data.js: trn (each route: its lines, kind, operator, colour, where it goes, its path in
    hundredths of a tile, its stops as arc length and name, where it is in a tunnel (-1) or over a street (1), flags: 1 it
    comes in over the map's edge, 2 it leaves over it), trsn (the stations' names), plat (the platforms' outlines)"""
    t = json.load(open(path)); trn, trsn = [], []
    for r in t['runs']:
        st = []
        for s, nm in r['stops']:
            if nm not in trsn: trsn.append(nm)
            st += [s, trsn.index(nm)]
        trn.append(['/'.join(r['refs']), r['kind'], r['op'], r['col'], r['dest'], [c for x, y in r['pts'] for c in (round(x, 2), round(y, 2))], st,
                    [v for q in r['lv'] for v in q], int(r['edge0']) | int(r['edge1']) << 1])
    return {'trn': trn, 'trsn': trsn, 'plat': t['plats']}
