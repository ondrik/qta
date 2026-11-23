# Straight streets. The traced network (the skeleton of the streets drawn thick) bends towards a side street at a
# junction and wobbles where the drawing did; here each traced street is put back on the OpenStreetMap ways it follows
# (the midline between a dual carriageway's two halves), and each junction where those ways' lines meet, so that a main
# road runs straight through and a side street meets it at its real angle.
import math
from roads import resample, seglen, dp
from decks import smooth

R_NEAR = 2.5   # tiles: how far a way may be from the traced street to be one it follows
END = 1.6      # tiles from a junction: where a street's own line is taken, clear of the junction's blob

def support(pts, idx):
    """the ways a traced street follows: ('one', ways), ('dual', ways one way, ways the other), or None"""
    smp = resample(pts, 1.0); cnt, sgn = {}, {}
    for k, (x, y) in enumerate(smp):
        a, b = smp[max(0, k - 1)], smp[min(len(smp) - 1, k + 1)]
        ex, ey = b[0] - a[0], b[1] - a[1]; el = math.hypot(ex, ey) or 1
        for i, (d, ux, uy) in idx.near(x, y, R_NEAR).items():
            c = (ux * ex + uy * ey) / el
            if abs(c) < 0.8: continue  # (a street crossing it)
            cnt[i] = cnt.get(i, 0) + 1; sgn[i] = sgn.get(i, 0) + (1 if c > 0 else -1)
    if not cnt: return None
    top = max(cnt.values()); sig = [i for i, v in cnt.items() if v >= 0.25 * top]
    D = lambda i: idx.ways[i].get('dir', 0)
    # (each set of ways with how much of the street each follows: a point goes onto the best-followed way near it, so
    # that it never flips between parallel ones, a carriageway and a slip road beside it)
    two = {i: cnt[i] for i in sig if D(i) == 0}; F = {i: cnt[i] for i in sig if D(i) * sgn[i] > 0}; B = {i: cnt[i] for i in sig if D(i) * sgn[i] < 0}
    if two and sum(cnt[i] for i in two) >= max(sum(cnt[i] for i in F), sum(cnt[i] for i in B)): return ('one', two)
    if F and B: # (between the two halves of a dual carriageway, or along one of them, the other traced on its own?)
        dist = lambda W: sum(math.hypot(q[0] - x, q[1] - y) if q else R_NEAR for x, y in smp for q in [nearest(idx, W, x, y)[0]]) / len(smp)
        dF, dB = dist(F), dist(B)
        if abs(dF - dB) < 0.6: return ('dual', F, B)
        return ('one', F if dF < dB else B)
    return ('one', F or B)

def nearest(idx, ways, x, y):
    """the point nearest (x, y) on the best-followed of the given ways ({way: weight}) that comes within R_NEAR of it,
    and that way's direction there"""
    cand, c = {}, idx.cell
    for cx in range(int((x - R_NEAR) // c), int((x + R_NEAR) // c) + 1):
        for cy in range(int((y - R_NEAR) // c), int((y + R_NEAR) // c) + 1):
            for i, a, b in idx.g.get((cx, cy), ()):
                if i not in ways: continue
                dx, dy = b[0] - a[0], b[1] - a[1]; l2 = dx * dx + dy * dy
                if l2 < 1e-9: continue
                t = max(0.0, min(1.0, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)); qx, qy = a[0] + dx * t, a[1] + dy * t
                d = math.hypot(qx - x, qy - y)
                if d < R_NEAR and (i not in cand or d < cand[i][0]): l = math.sqrt(l2); cand[i] = (d, (qx, qy), (dx / l, dy / l))
    if not cand: return None, None
    i = max(cand, key=lambda i: (ways[i], -i)) # (ties to one way, always the same: never flipping between twins)
    return cand[i][1], cand[i][2]

def snap(idx, sup, x, y):
    """(x, y) put on the street's ways (the midline of a dual carriageway), with their direction; or None"""
    if sup[0] == 'one':
        q, u = nearest(idx, sup[1], x, y)
        return (q, u) if q else None
    qf, uf = nearest(idx, sup[1], x, y); qb, ub = nearest(idx, sup[2], x, y)
    if not qf or not qb: return None
    if uf[0] * ub[0] + uf[1] * ub[1] < 0: ub = (-ub[0], -ub[1])
    ux, uy = uf[0] + ub[0], uf[1] + ub[1]; l = math.hypot(ux, uy) or 1
    return ((qf[0] + qb[0]) / 2, (qf[1] + qb[1]) / 2), (ux / l, uy / l)

def at(pts, s):
    """the point at distance s along a polyline"""
    for a, b in zip(pts, pts[1:]):
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        if s <= L and L > 0: return (a[0] + (b[0] - a[0]) * s / L, a[1] + (b[1] - a[1]) * s / L)
        s -= L
    return pts[-1]

def straighten(edges, nodes, idx, lam=0.05, reach=2.5, keep=(), keep_r=6.0, blend=3.0):
    """edges: [(a, b, points in tiles)], nodes: {id: (x, y)}. Each junction moves to where its streets' lines meet (least
    squares over the lines, held near where it was: no more than `reach` tiles away), each street onto its ways between
    them; but within keep_r of a point in `keep` (a tunnel's portals, where the tunnel was hooked on to the streets as
    traced) nothing moves, and over the next `blend` tiles the street eases from the one to the other. Returns the new
    nodes and, for each edge, its points and whether it was put on its ways."""
    def near_keep(x, y): return min((math.hypot(x - k[0], y - k[1]) for k in keep), default=1e9)
    sups = [support(p, idx) for _, _, p in edges]
    lines = {n: [] for n in nodes}
    for (a, b, p), s in zip(edges, sups):
        if not s or seglen(p) < 2 * END: continue
        rp = p[::-1]
        for n, q in ((a, at(p, END)), (b, at(rp, END))):
            sn = snap(idx, s, *q)
            if sn: lines[n].append(sn)
    newn = {}
    for n, (x0, y0) in nodes.items():
        a11, a12, a22, b1, b2 = lam, 0.0, lam, lam * x0, lam * y0
        for (px, py), (ux, uy) in lines[n]: # (each line pulls the junction onto itself: the projector across it)
            n11, n12, n22 = 1 - ux * ux, -ux * uy, 1 - uy * uy
            a11 += n11; a12 += n12; a22 += n22; b1 += n11 * px + n12 * py; b2 += n12 * px + n22 * py
        det = a11 * a22 - a12 * a12
        x, y = ((a22 * b1 - a12 * b2) / det, (a11 * b2 - a12 * b1) / det) if abs(det) > 1e-9 else (x0, y0)
        f = max(0.0, min(1.0, (near_keep(x0, y0) - keep_r) / blend))
        newn[n] = (x0 + (x - x0) * f, y0 + (y - y0) * f) if math.hypot(x - x0, y - y0) <= reach else (x0, y0)
    out = []
    for (a, b, p), s in zip(edges, sups):
        if not s:
            out.append(([newn[a]] + p[1:-1] + [newn[b]], False)); continue
        base = smooth(p, 8); L = seglen(base); inner = [] # (where no way is near, the traced line as smoothed as before)
        for k in range(1, int(L / 0.5)):
            sk = k * 0.5
            if sk < END * 0.75 or sk > L - END * 0.75: continue
            q = at(base, sk); sn = snap(idx, s, *q)
            f = max(0.0, min(1.0, (near_keep(*q) - keep_r) / blend))
            inner.append((q[0] + (sn[0][0] - q[0]) * f, q[1] + (sn[0][1] - q[1]) * f) if sn else q)
        out.append((dp([newn[a]] + inner + [newn[b]], 0.08), True))
    return newn, out
