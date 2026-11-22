# Overpasses and tunnels for both Brno maps: which bridges cross a street (and which tunnels pass under one), tracing
# them apart from the streets, hooking their ends onto the streets they continue, and giving each overpass ramps.
import math
from roads import resample, dp, seglen
from net import R, trace_clean, graph_edges

def segs_cross(a, b, c, d):
    def o(p, q, r): return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
    return o(a, b, c) * o(a, b, d) < 0 and o(c, d, a) * o(c, d, b) < 0
def seg_grid(ways, cell=8):
    grid = {}
    for w in ways:
        for a, b in zip(w['pts'], w['pts'][1:]):
            for c in {(int(x // cell), int(y // cell)) for x, y in resample([a, b], 2)}: grid.setdefault(c, []).append((a, b))
    return grid
def crosses(w, grid, cell=8):
    """does polyline w cross any segment in the grid?"""
    for a, b in zip(w, w[1:]):
        for c in {(int(x // cell), int(y // cell)) for x, y in resample([a, b], 2)}:
            for (p, q) in grid.get(c, ()):
                if segs_cross(a, b, p, q): return True
    return False
def chaikin(pts, n=2):
    """round off corners (the ends stay put)"""
    for _ in range(n):
        if len(pts) < 3: return pts
        out = [pts[0]]
        for a, b in zip(pts, pts[1:]):
            out += [(0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]), (0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1])]
        out[1:2] = []; out[-1:] = [pts[-1]]
        pts = out
    return pts
def smooth(pts, n):
    for _ in range(n):
        if len(pts) > 4: pts = [pts[0], pts[1]] + [tuple(sum(pts[i + k][j] for k in (-2, -1, 0, 1, 2)) / 5 for j in (0, 1)) for i in range(2, len(pts) - 2)] + [pts[-2], pts[-1]]
    return pts
def side(ways, others, label, width, close_iter, hook, alongside_r=1.5, twin_r=3.0):
    """trace a set of special ways (tunnels or decks) on their own and hook their ends onto the ground network: onto the
    dead end of an approach if there is one, else onto a street straight ahead (never sideways)"""
    if not ways: return [], []
    cent, edges, _ = trace_clean(ways, spur=2 * R, minlen=2 * R, width=width, close_iter=close_iter)
    from scipy.spatial import cKDTree
    surf, snames = [], []
    for w in others:
        for x, y in resample(w['pts'], 0.25): surf.append((x, y)); snames.append(w['name'])
    tree = cKDTree(surf)
    deg = {}
    for w in others:
        for q in (w['pts'][0], w['pts'][-1]): k = (round(q[0], 1), round(q[1], 1)); deg[k] = deg.get(k, 0) + 1
    ends = [k for k, n in deg.items() if n == 1]  # (dead ends: where an approach stops at the bridge or the portal)
    etree = cKDTree(ends) if ends else None
    res, back = [], []  # (back: the ones that stay ordinary streets after all, so their approaches still meet)
    ndeg = {}
    for a, b, _ in edges: ndeg[a] = ndeg.get(a, 0) + 1; ndeg[b] = ndeg.get(b, 0) + 1
    for (na, nb, _), pts in zip(edges, graph_edges(cent, edges)):
        pts = smooth(pts, 6); loose = False
        for end, node in ((0, na), (-1, nb)):
            if ndeg[node] != 1: continue  # (a joint where the deck's pieces meet each other stays put)
            p = pts[end]; q = pts[1] if end == 0 else pts[-2]
            dx, dy = p[0] - q[0], p[1] - q[1]; L = math.hypot(dx, dy) or 1; dx, dy = dx / L, dy / L  # (the way out of this end)
            best = None
            if etree is not None:
                d, k = etree.query(p)
                if d < hook: best = ends[k]
            if best is None:
                for k in tree.query_ball_point(p, hook):
                    v = (surf[k][0] - p[0], surf[k][1] - p[1]); vl = math.hypot(*v)
                    if vl < 0.3 or (v[0] * dx + v[1] * dy) / vl > 0.6:
                        if best is None or vl < math.hypot(best[0] - p[0], best[1] - p[1]): best = surf[k]
            if best is not None:
                keep = [q for q in pts if math.hypot(q[0] - best[0], q[1] - best[1]) > 1.0]
                pts = [best] + keep if end == 0 else keep + [best]
            else: loose = True
        pts = dp(chaikin(pts, 2), 0.15)
        if seglen(pts) < 2 or loose:  # (too short to rise and fall, or with an end that meets nothing: an ordinary street)
            back.append({'name': '', 'pts': pts, 'r': 3, 'rural': 0}); continue
        smp = resample(pts, 0.5); alongside = sum(1 for q in smp if tree.query(q)[0] < alongside_r) / len(smp)
        votes = {}
        for x, y in resample(pts, 1):
            for w in ways:
                if w['name'] and min(math.hypot(x - a, y - b) for a, b in w['pts']) < 3: votes[w['name']] = votes.get(w['name'], 0) + 1
        nm = max(votes, key=votes.get) if votes else ''
        # one carriageway down here and the other up on the street, or half of a dual carriageway whose other half is a
        # street of the same name: the street is enough, and this one joins it as an ordinary street
        if alongside > 0.6 or (nm and sum(1 for q in smp if any(snames[k] == nm for k in tree.query_ball_point(q, twin_r))) / len(smp) > 0.5):
            back.append({'name': nm, 'pts': pts, 'r': 3, 'rural': 0}); continue
        res.append({'name': nm, 'pts': pts, label: 1, 'lv': max((w.get('lv', 1) for w in ways if min(math.hypot(pts[len(pts) // 2][0] - a, pts[len(pts) // 2][1] - b) for a, b in w['pts']) < 4), default=1)})
    return res, back
def covered(ways, kept, r=1.5):
    """the candidate ways that the kept decks actually carry (most of each way within r tiles of a deck)"""
    if not kept: return []
    from scipy.spatial import cKDTree
    tree = cKDTree([q for o in kept for q in resample(o['pts'], 0.5)])
    return [w for w in ways if sum(1 for q in resample(w['pts'], 0.5) if tree.query(q)[0] < r) / max(1, len(resample(w['pts'], 0.5))) > 0.6]
def ramps(over, out, ramp):
    """each overpass takes the last `ramp` tiles of the approaches it meets as its ramps, so the street underneath always
    passes under the full height of the deck"""
    deg = {}
    for w in out:
        if w.get('tunnel') or w.get('over'): continue
        for q in (w['pts'][0], w['pts'][-1]): k = (round(q[0], 1), round(q[1], 1)); deg[k] = deg.get(k, 0) + 1
    for o in over:
        for end in (0, -1):
            p = o['pts'][end]
            if deg.get((round(p[0], 1), round(p[1], 1)), 0) != 1: continue  # (streets meet here: the deck rises from this very junction)
            for w in out:
                if w.get('tunnel') or w.get('over'): continue
                for we in (0, -1):
                    q = w['pts'][we]
                    if math.hypot(p[0] - q[0], p[1] - q[1]) > 0.3: continue
                    path = w['pts'] if we == -1 else w['pts'][::-1]  # (running towards the overpass)
                    L = seglen(path)
                    if L <= ramp * 1.6 or L < 3: continue  # (too short to give up a ramp: the ramp rises on the deck itself)
                    smp = resample(path, 0.25); cut = max(1, len(smp) - int(ramp * 4) - 1)
                    keep, rp = smp[:cut + 1], smp[cut:]
                    w['pts'] = dp(keep, 0.2) if we == -1 else dp(keep, 0.2)[::-1]
                    rp = dp(rp, 0.2)
                    o['pts'] = (rp + o['pts'][1:]) if end == 0 else (o['pts'][:-1] + rp[::-1])
                    if not o['name']: o['name'] = w['name']
                    o['r'] = min(o.get('r', 9), w['r'])
                    break
                else: continue
                break
        o.setdefault('r', 3); o['rural'] = 0
        o['pts'] = dp(chaikin(o['pts'], 2), 0.12)  # (smooth where the ramps join the deck)
    return over
