# Brno's road network as one connected graph: paint the chosen roads at half-tile resolution, close small gaps (this
# also merges the two halves of dual carriageways), thin to centre lines, trace the lines into a graph, prune spurs,
# merge junctions that are too close, then name and grade each road by the OpenStreetMap roads underneath it.
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
def raw_ways():
    RK = {'motorway': 0, 'motorway_link': 0, 'trunk': 1, 'trunk_link': 1, 'primary': 2, 'primary_link': 2, 'secondary': 3, 'secondary_link': 3, 'tertiary': 4}
    out = []
    for e in json.load(open('roads.json'))['elements']:
        t = e['tags']; h = t.get('highway')
        if h not in RK or t.get('area') == 'yes': continue
        out.append({'r': RK[h], 'name': t.get('name') or t.get('ref') or '', 'pts': [P(g['lat'], g['lon']) for g in e['geometry']], 'link': h.endswith('_link'), 'tunnel': t.get('tunnel') == 'yes'})
    return out
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
def near_portal(p, portals, r=6 * SC):
    return any(math.hypot(p[0] - q[0], p[1] - q[1]) < r for q in portals)
def connectors(lines, portals=(), max_len=60 * SC, min_far=8 * SC):
    """dead ends of the main network joined to it again along the residential streets they really lead into"""
    key = lambda g: (round(g['lat'] * 1e7), round(g['lon'] * 1e7))
    pos, adj = {}, {}
    def add(ways, kind):
        for e in ways:
            t = e.get('tags', {})
            if kind == 'res' and t.get('highway') not in ('residential', 'unclassified', 'living_street'): continue
            ks = []
            for g in e['geometry']:
                k = key(g); pos[k] = P(g['lat'], g['lon']); ks.append(k)
            for a, b in zip(ks, ks[1:]):
                L = math.hypot(pos[a][0] - pos[b][0], pos[a][1] - pos[b][1])
                adj.setdefault(a, []).append((b, L, kind, t.get('name', ''))); adj.setdefault(b, []).append((a, L, kind, t.get('name', '')))
    add(json.load(open('res.json'))['elements'], 'res')
    # where the main network runs (to recognise arriving at it)
    occ = np.zeros((MH * 2, MW * 2), bool)
    for pts in lines:
        for x, y in resample(pts, 0.25):
            i, j = int(x * 2), int(y * 2)
            if 0 <= i < MW * 2 and 0 <= j < MH * 2: occ[j, i] = True
    occ = ndimage.binary_dilation(occ, iterations=round(2 * SC))  # within about 30 m
    onmain = lambda p: 0 <= int(p[0] * 2) < MW * 2 and 0 <= int(p[1] * 2) < MH * 2 and occ[int(p[1] * 2), int(p[0] * 2)]
    deg = {}
    for pts in lines:
        for p in (pts[0], pts[-1]): k = (round(p[0], 1), round(p[1], 1)); deg[k] = deg.get(k, 0) + 1
    ends = [k for k, n in deg.items() if n == 1 and 4 < k[0] < MW - 4 and 4 < k[1] < MH - 4 and not near_portal(k, portals)]  # (a road into a tunnel ends there)
    grid = {}
    for k, p in pos.items(): grid.setdefault((int(p[0]), int(p[1])), []).append(k)
    import heapq
    out = []
    for ex, ey in ends:
        rr = int(2 * SC) + 1
        starts = [k for i in range(int(ex) - rr, int(ex) + rr + 1) for j in range(int(ey) - rr, int(ey) + rr + 1) for k in grid.get((i, j), ()) if math.hypot(pos[k][0] - ex, pos[k][1] - ey) < 1.6 * SC]
        if not starts: continue
        dist, prev, pq, goal = {}, {}, [], None
        for k in starts: dist[k] = 0; heapq.heappush(pq, (0, k))
        while pq:
            d0, u = heapq.heappop(pq)
            if d0 > dist.get(u, 1e9): continue
            if d0 > max_len: break
            p = pos[u]
            if d0 > 2 * SC and onmain(p) and math.hypot(p[0] - ex, p[1] - ey) > min_far: goal = u; break
            for v, L, kind, nm in adj.get(u, ()):
                nd = d0 + L
                if nd < dist.get(v, 1e9): dist[v] = nd; prev[v] = (u, nm); heapq.heappush(pq, (nd, v))
        if goal is None: continue
        path, names, u = [goal], {}, goal
        while u in prev: u, nm = prev[u]; path.append(u); names[nm] = names.get(nm, 0) + 1
        pts = [pos[k] for k in reversed(path)]
        nm = max((n for n in names if n), key=lambda n: names[n], default='')
        out.append({'r': 5, 'name': nm, 'pts': pts, 'link': False})
    return out
def tunnels(tun, out):
    """the tunnels, traced on their own (so the streets above them don't meet them), each end hooked onto the
    surface road at its portal"""
    cent, edges, _ = trace_clean(tun, spur=3 * R * SC, minlen=2 * R * SC, width=3.5 * SC, close_iter=round(2 * SC))  # (twin tubes merge into one)
    from scipy.spatial import cKDTree
    surf = [(x, y) for w in out for x, y in resample(w['pts'], 0.25)]
    tree = cKDTree(surf)
    res = []
    for pts in graph_edges(cent, edges):
        for _ in range(round(3 * SC)):
            if len(pts) > 4: pts = [pts[0], pts[1]] + [((pts[i-2][0] + pts[i-1][0] + pts[i][0] + pts[i+1][0] + pts[i+2][0]) / 5, (pts[i-2][1] + pts[i-1][1] + pts[i][1] + pts[i+1][1] + pts[i+2][1]) / 5) for i in range(2, len(pts) - 2)] + [pts[-2], pts[-1]]
        for end in (0, -1):
            p = pts[end]
            dist, k = tree.query(p); best = surf[k]
            if dist < 5 * SC: # (dropping the traced points close to the new end, so the tube does not hook round to meet it)
                keep = [q for q in pts if math.hypot(q[0] - best[0], q[1] - best[1]) > 3 * SC]
                pts = [best] + keep if end == 0 else keep + [best]
        pts = dp(pts, 0.2 * SC)
        if seglen(pts) < 3 * SC: continue
        # one carriageway in a tunnel and the other on the surface (Žabovřeská's gallery): the surface road is enough
        smp = resample(pts, 0.5); alongside = sum(1 for q in smp if tree.query(q)[0] < 2.5 * SC) / len(smp)
        if alongside > 0.6: continue
        votes = {}
        for x, y in resample(pts, 1):
            for w in tun:
                if w['name'] and min(math.hypot(x - a, y - b) for a, b in w['pts']) < 3 * SC: votes[w['name']] = votes.get(w['name'], 0) + 1
        name = max(votes, key=votes.get) if votes else 'tunel'
        res.append({'name': name, 'r': 1, 'rural': 0, 'pts': pts, 'tunnel': 1})
    print('tunnels', [(t['name'], round(seglen(t['pts']))) for t in res])
    return res
def close_gaps(out, portals=(), pair_max=25 * SC, reach=10 * SC, margin=6):
    """the last dead ends: where OpenStreetMap has no street across a gap (a tunnel tagged as something else, a road
    under construction), join two dead ends that face each other with a smooth curve, or carry a dead end straight
    on to the road ahead of it"""
    deg, endinfo = {}, []
    key = lambda p: (round(p[0], 1), round(p[1], 1))
    for wi, w in enumerate(out):
        for p in (w['pts'][0], w['pts'][-1]): deg[key(p)] = deg.get(key(p), 0) + 1
    for wi, w in enumerate(out):
        pts = w['pts']
        for end in (0, -1):
            p = pts[end]
            if deg[key(p)] != 1 or not (margin < p[0] < MW - margin and margin < p[1] < MH - margin) or near_portal(p, portals): continue
            back = resample(pts if end == -1 else pts[::-1], 0.5)
            q = back[max(0, len(back) - 1 - int(3 * SC * 2))]  # about 3 tiles back along the road
            dx, dy = p[0] - q[0], p[1] - q[1]; L = math.hypot(dx, dy) or 1
            endinfo.append({'w': wi, 'p': p, 'd': (dx / L, dy / L)})
    add, used = [], set()
    pairs = []
    for i, a in enumerate(endinfo):
        for j, b in enumerate(endinfo):
            if j <= i: continue
            vx, vy = b['p'][0] - a['p'][0], b['p'][1] - a['p'][1]; L = math.hypot(vx, vy)
            if L > pair_max or L < 0.5: continue
            ca = (vx * a['d'][0] + vy * a['d'][1]) / L; cb = -(vx * b['d'][0] + vy * b['d'][1]) / L
            if ca > 0.6 and cb > 0.6: pairs.append((L, i, j))
    for L, i, j in sorted(pairs):
        if i in used or j in used: continue
        a, b = endinfo[i], endinfo[j]; used |= {i, j}
        h = L / 3; c1 = (a['p'][0] + a['d'][0] * h, a['p'][1] + a['d'][1] * h); c2 = (b['p'][0] + b['d'][0] * h, b['p'][1] + b['d'][1] * h)
        n = max(4, int(L / 2)); bz = []
        for k in range(n + 1):
            t = k / n; u = 1 - t
            bz.append((u**3 * a['p'][0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t**3 * b['p'][0], u**3 * a['p'][1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t**3 * b['p'][1]))
        wa, wb = out[a['w']], out[b['w']]
        add.append({'name': wa['name'] or wb['name'], 'r': min(wa['r'], wb['r']), 'rural': wa['rural'] and wb['rural'], 'pts': dp(bz, 0.1)})
    for i, a in enumerate(endinfo):
        if i in used: continue
        best = None
        for wi, w in enumerate(out):
            if wi == a['w']: continue
            for x, y in resample(w['pts'], 0.5):
                vx, vy = x - a['p'][0], y - a['p'][1]; L = math.hypot(vx, vy)
                if L < 0.5 or L > reach or (vx * a['d'][0] + vy * a['d'][1]) / L < 0.8: continue
                if best is None or L < best[0]: best = (L, (x, y))
        if best:
            w = out[a['w']]
            add.append({'name': w['name'], 'r': w['r'], 'rural': w['rural'], 'pts': [a['p'], best[1]]})
    print('gaps closed', len(add))
    return add
if __name__ == '__main__':
    ways = raw_ways()
    sel, tun = [w for w in ways if not w['tunnel']], [w for w in ways if w['tunnel']]
    portals = [w['pts'][k] for w in tun for k in (0, -1)]  # where the tunnels come up
    TC = dict(spur=5 * R * SC, minlen=2.5 * R * SC, width=1.5 * SC, close_iter=round(SC))
    cent, edges, near = trace_clean(sel, **TC)
    lines = graph_edges(cent, edges)
    con = connectors(lines, portals)
    print('first pass', len(edges), 'edges; connectors', len(con))
    sel = sel + con
    cent, edges, near = trace_clean(sel, **TC)
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
        named = {l: v for l, v in votes.items() if sel[l]['name'] and not sel[l].get('link')}
        best = max(votes, key=votes.get) if votes else -1
        nb_ = max(named, key=named.get) if named else best
        name = sel[nb_]['name'] if nb_ >= 0 else ''
        rank = min(sel[best]['r'], 4) if best >= 0 else 4
        for _ in range(round(3 * SC)): # smooth the pixel staircase (ends stay put so roads still meet)
            if len(pts) > 4: pts = [pts[0], pts[1]] + [((pts[i-2][0] + pts[i-1][0] + pts[i][0] + pts[i+1][0] + pts[i+2][0]) / 5, (pts[i-2][1] + pts[i-1][1] + pts[i][1] + pts[i+1][1] + pts[i+2][1]) / 5) for i in range(2, len(pts) - 2)] + [pts[-2], pts[-1]]
        pts = dp(pts, 0.2 * SC)
        smp = resample(pts, 0.5)
        ur = sum(1 for x, y in smp if 0 <= int(x) < MW and 0 <= int(y) < MH and urban[int(y), int(x)]) / max(1, len(smp))
        if seglen(pts) < 0.3 * SC: continue
        out.append({'name': name, 'r': rank, 'rural': 1 if (rank <= 1 or ur < 0.4) else 0, 'pts': pts})
    out += close_gaps(out, portals)
    out += tunnels(tun, out)
    json.dump(out, open('net.json', 'w'), ensure_ascii=False)
    S = 2; im = Image.new('RGB', (MW * S, MH * S), (35, 60, 35)); d = ImageDraw.Draw(im)
    col = {0: (230, 120, 60), 1: (230, 180, 60), 2: (240, 220, 120), 3: (240, 240, 240), 4: (170, 170, 170), 5: (140, 140, 140)}
    for w in out: d.line([(x * S, y * S) for x, y in w['pts']], fill=col[w['r']], width=2)
    deg = {}
    for w in out:
        for p in (w['pts'][0], w['pts'][-1]): k = (round(p[0], 1), round(p[1], 1)); deg[k] = deg.get(k, 0) + 1
    dead = [(x, y) for (x, y), n in deg.items() if n == 1 and 4 < x < MW - 4 and 4 < y < MH - 4]
    for x, y in dead: d.ellipse([x * S - 3, y * S - 3, x * S + 3, y * S + 3], fill=(255, 50, 50))
    im.save('net.png'); print('inner dead ends', len(dead), 'roads', len(out))
