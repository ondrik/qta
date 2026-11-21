# Brno's road network as one connected graph: paint the chosen roads at half-tile resolution, close small gaps (this
# also merges the two halves of dual carriageways), thin to centre lines, trace the lines into a graph, prune spurs,
# merge junctions that are too close, then name and grade each road by the OpenStreetMap roads underneath it.
import json, math
import numpy as np
from scipy import ndimage
from PIL import Image, ImageDraw
from roads import build, resample, dp, seglen, P, MW, MH
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
            if a == b and len(path) < 8: continue
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
def raw_ways():
    RK = {'motorway': 0, 'motorway_link': 0, 'trunk': 1, 'trunk_link': 1, 'primary': 2, 'primary_link': 2, 'secondary': 3, 'secondary_link': 3, 'tertiary': 4}
    out = []
    for e in json.load(open('roads.json'))['elements']:
        t = e['tags']; h = t.get('highway')
        if h not in RK or t.get('area') == 'yes': continue
        out.append({'r': RK[h], 'name': t.get('name') or t.get('ref') or '', 'pts': [P(g['lat'], g['lon']) for g in e['geometry']], 'link': h.endswith('_link')})
    return out
if __name__ == '__main__':
    main = raw_ways()
    hi = [w for w in main if w['r'] <= 3]
    hocc = np.zeros((MH * 2, MW * 2), bool)
    for w in hi:
        for x, y in resample(w['pts'], 0.25):
            i, j = int(x * 2), int(y * 2)
            if 0 <= i < MW * 2 and 0 <= j < MH * 2: hocc[j, i] = True
    hd = ndimage.distance_transform_edt(~hocc) / 2
    def tert_ok(w):
        smp = [p for p in resample(w['pts'], 0.5) if 0 <= p[0] < MW and 0 <= p[1] < MH]
        return bool(smp) and sum(1 for x, y in smp if hd[int(y * 2), int(x * 2)] < 5.5) / len(smp) < 0.5
    sel = hi + [w for w in main if w['r'] == 4 and tert_ok(w)]
    sk, near = network(sel)
    cent, edges = trace(sk)
    print('raw', len(cent), 'nodes', len(edges), 'edges')
    edges = prune(cent, edges)
    cent, edges = contract(cent, edges)
    edges = prune(cent, edges)
    print('clean', len(cent), 'nodes', len(edges), 'edges')
    grid = np.load('landgrid.npy'); urban = (grid == 4) | (grid == 5)
    out = []
    for a, b, path in edges:
        pts = [cent[a]] + path[1:-1] + [cent[b]]
        pts = [(x / R + 0.25, y / R + 0.25) for x, y in pts]
        labs = [near[min(MH * R - 1, int(y * R)), min(MW * R - 1, int(x * R))] for x, y in pts]
        votes = {}
        for l in labs:
            if l >= 0: votes[l] = votes.get(l, 0) + 1
        best = max(votes, key=votes.get) if votes else -1
        named = {l: v for l, v in votes.items() if sel[l]['name'] and not sel[l].get('link')}
        nb_ = max(named, key=named.get) if named else best
        name = sel[nb_]['name'] if nb_ >= 0 else ''
        rank = min((sel[l]['r'] for l in votes), default=4) if votes else 4
        rank = sel[best]['r'] if best >= 0 else 4
        for _ in range(3): # smooth the pixel staircase (ends stay put so roads still meet)
            if len(pts) > 4: pts = [pts[0], pts[1]] + [((pts[i-2][0] + pts[i-1][0] + pts[i][0] + pts[i+1][0] + pts[i+2][0]) / 5, (pts[i-2][1] + pts[i-1][1] + pts[i][1] + pts[i+1][1] + pts[i+2][1]) / 5) for i in range(2, len(pts) - 2)] + [pts[-2], pts[-1]]
        pts = dp(pts, 0.3)
        ur = sum(1 for x, y in resample(pts, 0.5) if 0 <= int(x) < MW and 0 <= int(y) < MH and urban[int(y), int(x)]) / max(1, len(resample(pts, 0.5)))
        if seglen(pts) < 0.3: continue
        out.append({'name': name, 'r': rank, 'rural': 1 if (rank <= 1 or ur < 0.4) else 0, 'pts': pts})
    json.dump(out, open('net.json', 'w'), ensure_ascii=False)
    S = 4; im = Image.new('RGB', (MW * S, MH * S), (35, 60, 35)); d = ImageDraw.Draw(im)
    col = {0: (230, 120, 60), 1: (230, 180, 60), 2: (240, 220, 120), 3: (240, 240, 240), 4: (170, 170, 170), 5: (140, 140, 140)}
    for w in out: d.line([(x * S, y * S) for x, y in w['pts']], fill=col[w['r']], width=3)
    deg = {}
    for w in out:
        for p in (w['pts'][0], w['pts'][-1]): k = (round(p[0], 1), round(p[1], 1)); deg[k] = deg.get(k, 0) + 1
    for (x, y), n in deg.items():
        if n == 1: d.ellipse([x * S - 3, y * S - 3, x * S + 3, y * S + 3], fill=(255, 50, 50))
    im.save('net.png'); print('dead ends', sum(1 for n in deg.values() if n == 1), 'roads', len(out))
