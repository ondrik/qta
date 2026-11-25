# The railway against the streets (the detailed map). A piece of track up on a bridge that crosses a street is drawn
# above the street and its traffic, as the trains on it are (the same test as train5.py's level()). Where a track on
# the ground meets a street on the ground, OpenStreetMap's own ways there say which is on top: the street bridges the
# railway, the railway bridges a street that dips under it, or it is a level crossing (here only on the sidings and
# the industrial spurs: no passenger line in the map has one).
from shapely.geometry import LineString
from shapely.strtree import STRtree
from roads import P
from levels import lvl, raised

def rail_levels(ways, pieces, roads, osm_roads):
    """ways: each piece's OpenStreetMap way (with its geometry); pieces: the pieces as drawn, flat [x, y, ...] in tiles;
    roads: the map's streets (export5's rows: [name, r, rural, flat points, flag, ...], flag 0 on the ground);
    osm_roads: OpenStreetMap's highway ways (roads.json's elements)
    -> rlv: 1 for each piece up on a bridge over a street, else 0; rx: [x, y, k] where a track on the ground meets a
    street on the ground, k 0 a level crossing, 1 the street goes over the railway, 2 the railway over the street"""
    ground = [LineString(list(zip(r[3][::2], r[3][1::2]))) for r in roads if r[4] == 0 and len(r[3]) >= 4]
    gt = STRtree(ground)
    hw = []
    for e in osm_roads:
        g = [q for q in (e.get('geometry') or []) if q]
        if e['type'] == 'way' and 'highway' in e.get('tags', {}) and len(g) >= 2: hw.append((LineString([P(q['lat'], q['lon']) for q in g]), lvl(e['tags'])))
    ht = STRtree([g for g, _ in hw])
    full, up, rlv, rx = {}, {}, [], []
    for e, f in zip(ways, pieces):
        t, wid = e.get('tags', {}), e['id']
        if wid not in full: full[wid] = LineString([P(q['lat'], q['lon']) for q in e['geometry']])
        Wl = full[wid]
        if wid not in up: up[wid] = int(raised(t) and any(ground[i].intersects(Wl) for i in gt.query(Wl)))
        rlv.append(up[wid])
        if up[wid]: continue
        L, rl = LineString(list(zip(f[::2], f[1::2]))), lvl(t)
        for i in gt.query(L):
            X = ground[i].intersection(L)
            for p in getattr(X, 'geoms', [X]):
                if p.is_empty or p.geom_type != 'Point': continue
                # (the street there as OpenStreetMap has it: the nearest of its ways that cross this track)
                cand = [(hw[j][0].distance(p), hw[j][1]) for j in ht.query(p.buffer(3)) if hw[j][0].intersects(Wl)] or \
                       [(hw[j][0].distance(p), hw[j][1]) for j in ht.query(p.buffer(2))]
                k = 0
                if cand: rd = min(cand)[1]; k = 1 if rd > rl else 2 if rd < rl else 0
                if not any(abs(p.x - o[0]) < 0.5 and abs(p.y - o[1]) < 0.5 for o in rx): rx.append([round(p.x, 1), round(p.y, 1), k])
    return rlv, rx
