# The railway's levels on the 15 m map. export.py traces the running lines into one line down each corridor, so each
# traced line is cut where OpenStreetMap's own tracks along it go into a tunnel (that stretch is dropped: the trains are
# out of sight there) or up onto a bridge over a street (rlv 1: drawn over the street's traffic). And where a line on the
# ground meets a street on the ground, OpenStreetMap's ways there say which is on top (rx: [x, y, k], k 0 a level
# crossing, 1 the street bridges the railway, 2 the railway bridges a street that dips under it).
# Run it after export.py, before embed.py:   python3 railsplit.py   (rewrites brno_data.json; reads layers.json, roads.json)
import json
from shapely.geometry import LineString, Point
from shapely.ops import unary_union
from shapely.strtree import STRtree
from roads import P, dp, resample, seglen
from levels import lvl, raised

NEAR = 0.7  # tiles: how far OpenStreetMap's tracks may lie from the traced line (it runs down the middle of the corridor)
STEP = 0.25

def split(d, lay, osm_roads):
    pairs = lambda f: list(zip(f[::2], f[1::2]))
    ground = [LineString(pairs(r[3])) for r in d['roads'] if (len(r) < 5 or r[4] == 0) and len(r[3]) >= 4]
    gt = STRtree(ground)
    tracks = []  # (the running lines, as export.py takes them)
    for e in lay:
        t = e.get('tags', {})
        if e['type'] == 'way' and t.get('railway') == 'rail' and t.get('service') not in ('yard', 'siding', 'spur', 'crossover') and len(e.get('geometry') or []) >= 2:
            tracks.append((LineString([P(q['lat'], q['lon']) for q in e['geometry']]), t))
    under = unary_union([L.buffer(NEAR) for L, t in tracks if lvl(t) < 0 and t.get('tunnel') not in (None, 'no')])
    over = unary_union([L.buffer(NEAR) for L, t in tracks if raised(t) and any(ground[i].intersects(L) for i in gt.query(L))])
    rails, rlv = [], []
    for f in d['rails']:
        pts = resample(pairs(f), STEP)
        lv = [-1 if under.contains(Point(p)) else 1 if over.contains(Point(p)) else 0 for p in pts]
        for i in range(1, len(lv) - 1):  # (a stretch of a single sample takes its neighbours' level)
            if lv[i - 1] == lv[i + 1] != lv[i]: lv[i] = lv[i - 1]
        i = 0
        while i < len(pts):
            j = i
            while j + 1 < len(pts) and lv[j + 1] == lv[i]: j += 1
            piece = pts[max(0, i - 1):j + 1]  # (sharing its first point with the piece before)
            if lv[i] >= 0 and len(piece) >= 2 and seglen(piece) >= 0.5:
                rails.append([c for x, y in dp(piece, 0.08) for c in (round(x, 1), round(y, 1))]); rlv.append(lv[i])
            i = j + 1
    # where a line on the ground meets a street on the ground
    hw = [(LineString([P(q['lat'], q['lon']) for q in e['geometry'] if q]), lvl(e['tags'])) for e in osm_roads
          if e['type'] == 'way' and 'highway' in e.get('tags', {}) and len([q for q in (e.get('geometry') or []) if q]) >= 2]
    ht, tt = STRtree([g for g, _ in hw]), STRtree([L for L, _ in tracks])
    rx = []
    for f, v in zip(rails, rlv):
        if v: continue
        L = LineString(pairs(f))
        for i in gt.query(L):
            X = ground[i].intersection(L)
            for p in getattr(X, 'geoms', [X]):
                if p.is_empty or p.geom_type != 'Point' or any(abs(p.x - o[0]) < 1 and abs(p.y - o[1]) < 1 for o in rx): continue
                # (the traced line can run a tile or two off the tracks: the crossing of an OpenStreetMap street with an
                # OpenStreetMap track nearest this point says which is on top)
                best, k = 2.5, 0
                for j in ht.query(p.buffer(2.5)):
                    for q in tt.query(hw[j][0]):
                        X2 = hw[j][0].intersection(tracks[q][0])
                        for c in getattr(X2, 'geoms', [X2]):
                            if c.is_empty or c.geom_type != 'Point' or c.distance(p) >= best: continue
                            best, rd, rl = c.distance(p), hw[j][1], lvl(tracks[q][1]); k = 1 if rd > rl else 2 if rd < rl else 0
                rx.append([round(p.x, 1), round(p.y, 1), k])
    return rails, rlv, rx

if __name__ == '__main__':
    d = json.load(open('brno_data.json'))
    n0 = len(d['rails'])
    d['rails'], d['rlv'], d['rx'] = split(d, json.load(open('layers.json'))['elements'], json.load(open('roads.json'))['elements'])
    open('brno_data.json', 'w').write(json.dumps(d, ensure_ascii=False, separators=(',', ':')))
    print('rails', n0, '-> pieces', len(d['rails']), 'over streets', sum(d['rlv']), 'crossings', len(d['rx']), {k: sum(1 for q in d['rx'] if q[2] == k) for k in (0, 1, 2)})
