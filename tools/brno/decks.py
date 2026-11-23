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
def level(t):
    """a way's level: its layer, or above the ground on a bridge and below it in a tunnel if no layer is given"""
    l = t.get('layer', '').split(';')[0]
    if l.lstrip('-').isdigit(): return int(l)
    return 1 if t.get('bridge') in ('yes', 'viaduct') else -1 if t.get('tunnel') == 'yes' else 0
def separate(ways):
    """split ways (each with 'lev') into decks (above a road they cross), tubes (beneath a street they cross) and the
    ground; a road that crosses nothing at another level is an ordinary street whatever its layer"""
    levs = sorted({w['lev'] for w in ways})
    below = {L: seg_grid([o for o in ways if o['lev'] < L]) for L in levs if L >= 1}
    decks = [w for w in ways if w['lev'] >= 1 and crosses(w['pts'], below[w['lev']])]
    rest = [w for w in ways if w not in decks]
    above = {L: seg_grid([o for o in rest if o['lev'] > L]) for L in levs if L <= -1}
    tubes = [w for w in rest if w['lev'] <= -1 and crosses(w['pts'], above[w['lev']])]
    return decks, tubes, [w for w in rest if w not in tubes]
def join_decks(decks, ground, maxlen):
    """a short street that runs on, with no junction along it, from the end of one deck to the end of another (of one
    level) is up there with them: it joins the decks (or the streets beyond would be cut back to nothing between them)"""
    key = lambda p: (round(p[0], 2), round(p[1], 2))
    deg = {}
    for w in ground + decks:
        for p in (w['pts'][0], w['pts'][-1]): deg[key(p)] = deg.get(key(p), 0) + 1
    dend = {}
    for d in decks:
        for p in (d['pts'][0], d['pts'][-1]): dend[key(p)] = d['lev']
    at = {}
    for i, g in enumerate(ground):
        for gi in (0, -1): at.setdefault(key(g['pts'][gi]), []).append((i, gi))
    up = set()
    for e0, lev in dend.items():
        if deg.get(e0) != 2: continue  # (a junction right at the deck's end: the streets meet there)
        for i, gi in at.get(e0, []):
            path, L, cur, ci, cgi = [], 0.0, e0, i, gi
            while True:
                g = ground[ci]; path.append(ci); L += seglen(g['pts'])
                far = key(g['pts'][-1 if cgi == 0 else 0])
                if L > maxlen: break
                if far in dend and dend[far] == lev: up.update(path); break
                if deg.get(far) != 2: break
                nxt = [(j, gj) for j, gj in at.get(far, []) if j != ci]
                if not nxt: break
                ci, cgi = nxt[0]
    joined = [dict(ground[i], lev=max(ground[i]['lev'], 1), lv=1) for i in up]
    for w in joined: w['lev'] = next(dend[key(p)] for p in (w['pts'][0], w['pts'][-1]) if key(p) in dend) if any(key(p) in dend for p in (w['pts'][0], w['pts'][-1])) else w['lev']
    return decks + joined, [g for i, g in enumerate(ground) if i not in up]
def clear_ends(decks, ground, gap):
    """cut back the street that carries straight on from each end of a deck by `gap` tiles (on into the next ways if the
    first is shorter): under a short bridge the road below passes close to both its ends, and the streets would join up
    with it there at street level. The deck's hook spans the cut (and its ramps then come out of what is left)"""
    out = [dict(w) for w in ground]
    def cut(end, ux, uy, left, depth=0):
        best = None
        for i, g in enumerate(out):
            if g is None: continue
            for gi in (0, -1):
                if math.hypot(g['pts'][gi][0] - end[0], g['pts'][gi][1] - end[1]) > 0.05: continue
                gp = g['pts'] if gi == 0 else g['pts'][::-1]
                vx, vy = gp[1][0] - gp[0][0], gp[1][1] - gp[0][1]; c = (vx * ux + vy * uy) / (math.hypot(vx, vy) or 1)
                if c > (0.7 if depth == 0 else 0.3) and (best is None or c > best[0]): best = (c, i, gi)
        if not best: return
        _, i, gi = best; g = out[i]; gp = g['pts'] if gi == 0 else g['pts'][::-1]
        L = seglen(gp)
        if L <= left + 0.5:  # (all of it, and on into whatever carries on from its far end)
            out[i] = None; far, pre = gp[-1], gp[-2]; l = math.hypot(far[0] - pre[0], far[1] - pre[1]) or 1
            if depth < 6: cut(far, (far[0] - pre[0]) / l, (far[1] - pre[1]) / l, left - L, depth + 1)
            return
        smp = resample(gp, 0.25); rest = dp(smp[int(left / 0.25):], 0.1)
        out[i] = dict(g, pts=rest if gi == 0 else rest[::-1])
    for d in decks:
        for end, nxt in ((d['pts'][0], d['pts'][1]), (d['pts'][-1], d['pts'][-2])):
            L = math.hypot(end[0] - nxt[0], end[1] - nxt[1]) or 1
            cut(end, (end[0] - nxt[0]) / L, (end[1] - nxt[1]) / L, gap)
    return [w for w in out if w is not None]
def by_level(ways): return [[w for w in ways if w['lev'] == L] for L in sorted({w['lev'] for w in ways})]
def chains(ways):
    """the ways joined end to end into polylines (where exactly two of them share an end)"""
    key = lambda p: (round(p[0], 2), round(p[1], 2))
    deg = {}
    for w in ways:
        for p in (w['pts'][0], w['pts'][-1]): deg[key(p)] = deg.get(key(p), 0) + 1
    left = [list(w['pts']) for w in ways]; out = []
    while left:
        c = left.pop(0); grown = True
        while grown:
            grown = False
            for i, o in enumerate(left):
                e0, e1, o0, o1 = key(c[0]), key(c[-1]), key(o[0]), key(o[-1])
                if e1 == o0 and deg[e1] == 2: c = c + o[1:]
                elif e1 == o1 and deg[e1] == 2: c = c + o[-2::-1]
                elif e0 == o1 and deg[e0] == 2: c = o + c[1:]
                elif e0 == o0 and deg[e0] == 2: c = o[::-1] + c[1:]
                else: continue
                left.pop(i); grown = True; break
        out.append(c)
    return out
def tube_lines(ways, pair):
    """a tunnel's centre lines straight from its ways: joined end to end, and twin tubes of one name (one each way, within
    `pair` tiles of each other) averaged into one"""
    from scipy.spatial import cKDTree
    lines = []
    for nm in {w['name'] for w in ways}:
        cs = [c for c in chains([w for w in ways if w['name'] == nm]) if seglen(c) > 1]
        cs.sort(key=lambda c: -seglen(c))
        while cs:
            a = cs.pop(0); mate = None
            for b in cs:
                sb = resample(b, 0.5); t = cKDTree(sb); sa = resample(a, 0.5)
                if nm and 0.6 < seglen(b) / seglen(a) <= 1 and sum(t.query(p)[0] for p in sa) / len(sa) < pair: mate = b; break
            if mate is None: lines.append(a); continue
            cs.remove(mate); sb = resample(mate, 0.5); t = cKDTree(sb)
            lines.append(dp(smooth([((p[0] + sb[t.query(p)[1]][0]) / 2, (p[1] + sb[t.query(p)[1]][1]) / 2) for p in resample(a, 0.5)], 4), 0.15))
    return lines
def side(ways, others, label, width, close_iter, hook, alongside_r=1.5, twin_r=3.0, apart=None, lines=None):
    """trace a set of special ways (tunnels or decks, of one level) on their own and hook their ends onto the ground
    network: onto the dead end of an approach if there is one, else onto a street straight ahead (never sideways). A piece
    that crosses a road of `apart` (the roads at other levels) stays apart from them whatever else; any other piece that is
    too short, loose, or runs alongside a street, joins the streets"""
    if not ways: return [], []
    if lines is None:  # (traced from a raster of the ways, or given as centre lines)
        cent, edges, _ = trace_clean(ways, spur=2 * R, minlen=2 * R, width=width, close_iter=close_iter)
        ndeg = {}
        for a, b, _ in edges: ndeg[a] = ndeg.get(a, 0) + 1; ndeg[b] = ndeg.get(b, 0) + 1
        pieces = [(pts, ndeg[na], ndeg[nb]) for (na, nb, _), pts in zip(edges, graph_edges(cent, edges))]
    else:
        key = lambda p: (round(p[0], 1), round(p[1], 1)); jd = {}
        for pts in lines:
            for p in (pts[0], pts[-1]): jd[key(p)] = jd.get(key(p), 0) + 1
        pieces = [(list(pts), jd[key(pts[0])], jd[key(pts[-1])]) for pts in lines]
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
    for pts, da, db in pieces:
        pts = smooth(pts, 6) if lines is None else pts; loose = False
        for end, nd in ((0, da), (-1, db)):
            if nd != 1: continue  # (a joint where the deck's pieces meet each other stays put)
            p = pts[end]; q = pts[1] if end == 0 else pts[-2]
            dx, dy = p[0] - q[0], p[1] - q[1]; L = math.hypot(dx, dy) or 1; dx, dy = dx / L, dy / L  # (the way out of this end)
            best = None
            if etree is not None:  # (the nearest dead end ahead, or right here)
                for d, k in sorted(zip(*etree.query(p, k=min(12, len(ends)), distance_upper_bound=hook))):
                    if d == float('inf'): break
                    v = (ends[k][0] - p[0], ends[k][1] - p[1])
                    if d < 3 or (v[0] * dx + v[1] * dy) / d > 0.5: best = ends[k]; break
            if best is None:
                for k in tree.query_ball_point(p, hook):
                    v = (surf[k][0] - p[0], surf[k][1] - p[1]); vl = math.hypot(*v)
                    if vl < 0.3 or (v[0] * dx + v[1] * dy) / vl > 0.6:
                        if best is None or vl < math.hypot(best[0] - p[0], best[1] - p[1]): best = surf[k]
            if best is None:  # (else the nearest street, rather than a deck that ends in mid-air)
                for k in tree.query_ball_point(p, hook * 1.5):
                    v = (surf[k][0] - p[0], surf[k][1] - p[1]); vl = math.hypot(*v)
                    if best is None or vl < math.hypot(best[0] - p[0], best[1] - p[1]): best = surf[k]
            if best is not None:
                keep = [q for q in pts if math.hypot(q[0] - best[0], q[1] - best[1]) > 1.0]
                pts = [best] + keep if end == 0 else keep + [best]
            else: loose = True
        pts = dp(chaikin(pts, 2), 0.15)
        cr = apart is not None and crosses(pts, apart)  # (it really passes over or under a road: never a junction with it)
        if (seglen(pts) < 2 or loose) and not cr:  # (too short to rise and fall, or with an end that meets nothing: an ordinary street)
            back.append({'name': '', 'pts': pts, 'r': 3, 'rural': 0}); continue
        smp = resample(pts, 0.5); alongside = sum(1 for q in smp if tree.query(q)[0] < alongside_r) / len(smp)
        votes = {}
        for x, y in resample(pts, 1):
            for w in ways:
                if w['name'] and min(math.hypot(x - a, y - b) for a, b in w['pts']) < 3: votes[w['name']] = votes.get(w['name'], 0) + 1
        nm = max(votes, key=votes.get) if votes else ''
        # one carriageway down here and the other up on the street, or half of a dual carriageway whose other half is a
        # street of the same name: the street is enough, and this one joins it as an ordinary street
        if not cr and (alongside > 0.6 or (nm and sum(1 for q in smp if any(snames[k] == nm for k in tree.query_ball_point(q, twin_r))) / len(smp) > 0.5)):
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
