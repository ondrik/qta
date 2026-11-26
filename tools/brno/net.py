# Tracing roads into a graph, as decks.py does for the overpasses and tunnels: paint them at half-tile resolution, close
# small gaps (this also merges the two halves of dual carriageways), thin to centre lines, trace the lines into a
# graph, prune spurs and merge junctions that are too close.
import json, math
import numpy as np
from scipy import ndimage
from PIL import Image, ImageDraw
from roads import resample, dp, seglen, P, MW, MH, SC
R = 2  # raster cells per tile
def zhang_suen(img):
    img = img.copy().astype(np.uint8)
    while True:
        changed = False
        for step in (0, 1):
            p = np.pad(img, 1)
            P2, P3, P4, P5, P6, P7, P8, P9 = p[:-2, 1:-1], p[:-2, 2:], p[1:-1, 2:], p[2:, 2:], p[2:, 1:-1], p[2:, :-2], p[1:-1, :-2], p[:-2, :-2]
            B = P2 + P3 + P4 + P5 + P6 + P7 + P8 + P9
            seq = [P2, P3, P4, P5, P6, P7, P8, P9, P2]
            A = sum(((seq[i] == 0) & (seq[i + 1] == 1)).astype(np.uint8) for i in range(8))
            c1 = (P2 * P4 * P6 == 0) if step == 0 else (P2 * P4 * P8 == 0)
            c2 = (P4 * P6 * P8 == 0) if step == 0 else (P2 * P6 * P8 == 0)
            m = (img == 1) & (B >= 2) & (B <= 6) & (A == 1) & c1 & c2
            if m.any(): img[m] = 0; changed = True
        if not changed: return img
def network(selected, close_iter=1, width=1.3):
    H, W = MH * R, MW * R
    im = Image.new('L', (W, H), 0); dr = ImageDraw.Draw(im)
    for w in selected: dr.line([(x * R, y * R) for x, y in w['pts']], fill=255, width=max(1, int(round(width * R))))
    a = np.array(im) > 0
    a = ndimage.binary_closing(a, structure=np.ones((3, 3)), iterations=close_iter)
    sk = zhang_suen(a)
    # label raster: which OSM road (index) is nearest to each cell
    lab = np.zeros((H, W), np.int32); ld = ImageDraw.Draw(Image.new('L', (1, 1)))
    labim = Image.new('I', (W, H), 0); lid = ImageDraw.Draw(labim)
    for i, w in sorted(enumerate(selected), key=lambda t: -t[1]['r']):  # bigger roads drawn last, so they win
        lid.line([(x * R, y * R) for x, y in w['pts']], fill=i + 1, width=max(1, int(round(width * R))) + 2)
    lab = np.array(labim)
    _, (iy, ix) = ndimage.distance_transform_edt(lab == 0, return_indices=True)
    near = lab[iy, ix] - 1
    return sk, near
def trace(sk):
    pix = set(zip(*np.nonzero(sk)))
    def nb(p):
        y, x = p
        orth = [(y + dy, x + dx) for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)) if (y + dy, x + dx) in pix]
        out = list(orth)
        for dy, dx in ((-1, -1), (-1, 1), (1, -1), (1, 1)):
            q = (y + dy, x + dx)
            if q not in pix: continue
            # a diagonal step is redundant when an orthogonal neighbour already links the two
            if (y + dy, x) in pix or (y, x + dx) in pix: continue
            out.append(q)
        return out
    N = {p: nb(p) for p in pix}
    nodes = {p for p in pix if len(N[p]) != 2}
    nid, cid = {}, 0
    for p in nodes:
        if p in nid: continue
        st = [p]; nid[p] = cid
        while st:
            q = st.pop()
            for r in N[q]:
                if r in nodes and r not in nid: nid[r] = cid; st.append(r)
        cid += 1
    cent = {}
    for p, c in nid.items(): cent.setdefault(c, []).append(p)
    cent = {c: (sum(p[1] for p in ps) / len(ps), sum(p[0] for p in ps) / len(ps)) for c, ps in cent.items()}
    edges, used = [], set()
    for p in nodes:
        for q in N[p]:
            if q in nodes and nid[q] == nid[p]: continue
            if (p, q) in used: continue
            path = [p, q]; prev, cur = p, q
            while cur not in nodes:
                nxt = [r for r in N[cur] if r != prev]
                if len(nxt) != 1: break
                prev, cur = cur, nxt[0]; path.append(cur)
            if cur not in nodes: continue
            used.add((p, q)); used.add((cur, path[-2]))
            a, b = nid[p], nid[cur]
            if a == b and len(path) < 8 * SC: continue
            edges.append([a, b, [(x, y) for y, x in path]])
    return cent, edges
def prune(cent, edges, spur=5.0 * R, rounds=4):
    for _ in range(rounds):
        deg = {}
        for a, b, _ in edges: deg[a] = deg.get(a, 0) + 1; deg[b] = deg.get(b, 0) + 1
        keep = []
        for e in edges:
            a, b, path = e
            L = len(path)
            if (deg.get(a, 0) == 1 or deg.get(b, 0) == 1) and L < spur and not (deg.get(a, 0) == 1 and deg.get(b, 0) == 1): continue
            keep.append(e)
        if len(keep) == len(edges): break
        edges = keep
    return edges
def contract(cent, edges, minlen=2.0 * R):
    # merge the two ends of very short edges (junctions too close together for queues)
    parent = {c: c for c in cent}
    def find(c):
        while parent[c] != c: parent[c] = parent[parent[c]]; c = parent[c]
        return c
    for a, b, path in edges:
        if a != b and len(path) < minlen: parent[find(a)] = find(b)
    groups = {}
    for c in cent: groups.setdefault(find(c), []).append(c)
    newc = {g: (sum(cent[c][0] for c in cs) / len(cs), sum(cent[c][1] for c in cs) / len(cs)) for g, cs in groups.items()}
    out = []
    for a, b, path in edges:
        fa, fb = find(a), find(b)
        if fa == fb and len(path) < minlen * 2: continue
        out.append([fa, fb, path])
    return newc, out
def graph_edges(cent, edges):
    """polylines (tile units) of a traced, cleaned graph"""
    out = []
    for a, b, path in edges:
        pts = [cent[a]] + path[1:-1] + [cent[b]]
        out.append([(x / R + 0.25, y / R + 0.25) for x, y in pts])
    return out
def trace_clean(sel, spur, minlen, width=1.3, close_iter=1):
    sk, near = network(sel, close_iter, width)
    cent, edges = trace(sk)
    edges = prune(cent, edges, spur)
    cent, edges = contract(cent, edges, minlen)
    edges = prune(cent, edges, spur)
    return cent, edges, near
