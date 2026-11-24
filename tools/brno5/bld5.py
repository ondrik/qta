# Inner Brno's buildings at 5 m a tile, from their OpenStreetMap outlines (courtyards included). Overlapping outlines
# are made disjoint (the smaller one wins), each is cleared off the streets' carriageways, and every piece is stored in
# the cheapest exact form: a rectangle at any angle, a right-angled outline in its own turned frame, or a free polygon.
# Each building keeps its kind, floors, roof shape and colours where they are mapped; tall building parts (church
# spires and other towers) become pieces of their own with their real height and roof.
import json, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'brno'))
from roads import MW, MH, P
from land5 import rings
from shapely.geometry import Polygon, MultiPolygon, LineString, box
from shapely.ops import unary_union
from shapely.strtree import STRtree
from shapely.validation import make_valid
KINDS = ['yes', 'house', 'flats', 'shed', 'industry', 'shop', 'civic', 'church', 'hospital', 'school', 'station', 'castle', 'sport', 'hotel', 'tower']
def kind(t):
    b, am = t.get('building'), t.get('amenity')
    if t.get('historic') == 'castle' or b == 'castle': return 'castle'
    if b in ('church', 'cathedral', 'chapel', 'religious', 'synagogue', 'mosque') or am == 'place_of_worship': return 'church'
    if b == 'hospital' or am == 'hospital': return 'hospital'
    if b in ('school', 'university', 'college', 'kindergarten') or am in ('school', 'university', 'college'): return 'school'
    if b in ('train_station', 'transportation') or t.get('railway') == 'station' or t.get('public_transport') == 'station': return 'station'
    if b in ('stadium', 'sports_hall', 'grandstand', 'sports_centre'): return 'sport'
    if b == 'hotel' or t.get('tourism') == 'hotel': return 'hotel'
    if b in ('tower',) or (t.get('man_made') == 'tower' and t.get('tower:type') in ('bell_tower', 'observation', 'clock')): return 'tower'
    if b in ('house', 'detached', 'semidetached_house', 'terrace', 'bungalow', 'farm', 'villa'): return 'house'
    if b in ('residential', 'apartments', 'dormitory'): return 'flats'
    if b in ('garage', 'garages', 'shed', 'cabin', 'hut', 'carport', 'service', 'kiosk', 'toilets', 'barn', 'greenhouse', 'storage_tank'): return 'shed'
    if b in ('industrial', 'warehouse', 'manufacture', 'factory', 'hangar', 'depot'): return 'industry'
    if b in ('commercial', 'office', 'retail', 'supermarket', 'shop', 'mall'): return 'shop'
    if b in ('civic', 'public', 'government', 'museum', 'theatre', 'library', 'courthouse', 'townhall'): return 'civic'
    return 'yes'
DEF_LV = {'yes': 3, 'house': 2, 'flats': 4, 'shed': 1, 'industry': 2, 'shop': 3, 'civic': 3, 'church': 6, 'hospital': 4, 'school': 3, 'station': 3, 'castle': 4, 'sport': 3, 'hotel': 5, 'tower': 8}
# roof shapes: 0 flat, 1 gabled, 2 hipped, 3 dome (or onion), 4 a spire (pyramid or cone)
ROOF = {'flat': 0, 'gabled': 1, 'hipped': 2, 'half-hipped': 2, 'side_hipped': 2, 'mansard': 2, 'gambrel': 1, 'pitched': 1, 'quadruple_saltbox': 2,
        'dome': 3, 'onion': 3, 'round': 3, 'pyramidal': 4, 'cone': 4}
CN = {'white': '#e8e6e0', 'red': '#a5483a', 'brown': '#7a5a44', 'grey': '#8a8c90', 'gray': '#8a8c90', 'black': '#3a3c40', 'yellow': '#e0c878', 'beige': '#dccca8',
      'green': '#5a7a5a', 'blue': '#5a6e8a', 'orange': '#d88a4a', 'silver': '#b8bcc0', 'darkgrey': '#5a5c60', 'darkgray': '#5a5c60', 'lightgrey': '#b4b6b8',
      'lightgray': '#b4b6b8', 'sand': '#d8c8a0', 'tan': '#c8b48c', 'cream': '#ece2c8', 'pink': '#e0a8b0', 'maroon': '#7a3030', 'darkgreen': '#3a5a40'}
def colour(v):
    if not v: return None
    v = v.strip().lower()
    if v.startswith('#') and len(v) in (4, 7): return v if len(v) == 7 else '#' + ''.join(c * 2 for c in v[1:])
    return CN.get(v.replace(' ', '').replace('_', ''))
def num(v):
    try: return float(str(v).replace(',', '.').replace('m', '').split(';')[0].strip())
    except ValueError: return None
def metres(t, k):
    """wall height and roof height in metres"""
    rh = num(t.get('roof:height')) or 0
    h = num(t.get('height'))
    lv = num(t.get('building:levels'))
    if h: return max(2.5, h - rh), rh
    if lv: return max(2.5, lv * 3.2 + 0.5 * (num(t.get('roof:levels')) or 0) * 3.2), rh
    return DEF_LV[k] * 3.2, rh
def geom(e):
    outer = [r for r in rings(e) if len(r) >= 4]
    if not outer: return None
    g = unary_union([make_valid(Polygon(r)) for r in outer])
    inner = [r for r in rings(e, 'inner') if len(r) >= 4]
    if inner: g = g.difference(unary_union([make_valid(Polygon(r)) for r in inner]))
    return g.buffer(0)
def polys(g):
    if g.is_empty: return []
    if g.geom_type == 'Polygon': return [g]
    if g.geom_type in ('MultiPolygon', 'GeometryCollection'): return [p for q in g.geoms for p in polys(q)]
    return []
def clean(g, least=0.5):
    """drop slivers thinner than about a metre (what is left of a building after a street or a neighbour took the rest)"""
    g = g.buffer(-0.12, join_style='mitre').buffer(0.12, join_style='mitre')
    return [p.simplify(0.04) for p in polys(g) if p.area >= least]
# ---- one piece in its cheapest exact form
def frame_angle(p):
    """the outline's main direction (edges weighted by length, folded to a quarter turn), in (-45, 45] degrees"""
    sx = sy = 0
    for r in [p.exterior] + list(p.interiors):
        c = list(r.coords)
        for a, b in zip(c, c[1:]):
            dx, dy = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dy); f = 4 * math.atan2(dy, dx)
            sx += L * math.cos(f); sy += L * math.sin(f)
    a = math.degrees(math.atan2(sy, sx)) / 4
    return round(a, 1)
def ring_pts(r, ccw):
    c = list(r.coords)[:-1]
    A = sum(c[i][0] * c[(i + 1) % len(c)][1] - c[(i + 1) % len(c)][0] * c[i][1] for i in range(len(c)))
    if (A > 0) != ccw: c.reverse()
    return c
def ortho(c, tol=4.0):
    """snap a ring (in its own frame) to right angles if every edge runs within tol degrees of an axis: [(u, v)] or None"""
    pts = []
    for p in c:  # (drop vertices where the outline runs straight on)
        if pts and math.hypot(p[0] - pts[-1][0], p[1] - pts[-1][1]) < 0.05: continue
        pts.append(p)
    ax = []
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        d = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0])) % 180
        if min(d, 180 - d) < tol: ax.append('u')
        elif abs(d - 90) < tol: ax.append('v')
        else: return None
    # merge runs of edges along the same axis
    keep = [i for i in range(len(pts)) if ax[i - 1] != ax[i]]
    if len(keep) < 4 or len(keep) % 2: return None
    pts = [pts[i] for i in keep]; ax = [ax[i] for i in keep]
    n = len(pts); U = [0.0] * n; V = [0.0] * n
    for i in range(n):
        a, b = i, (i + 1) % n
        if ax[i] == 'u': V[a] = V[b] = (pts[a][1] + pts[b][1]) / 2  # (an edge along u: both ends at its mean v)
        else: U[a] = U[b] = (pts[a][0] + pts[b][0]) / 2
    if ax[0] != 'u': U, V, ax = U[1:] + U[:1], V[1:] + V[:1], ax[1:] + ax[:1]  # (start with an edge along u)
    return [(round(u, 1), round(v, 1)) for u, v in zip(U, V)]
def piece(p):
    """{'t': 'r', ...} a turned rectangle, {'t': 'o', ...} a right-angled outline in its own frame, {'t': 'p', ...} a free polygon.
    Coordinates in tiles, to a tenth; the outer ring runs one way and courtyards the other"""
    a = frame_angle(p); th = math.radians(a); c, s = math.cos(th), math.sin(th)
    to_l = lambda q: (q[0] * c + q[1] * s, -q[0] * s + q[1] * c)
    rings_ = [ring_pts(p.exterior, True)] + [ring_pts(r, False) for r in p.interiors]
    loc = [ortho([to_l(q) for q in r]) for r in rings_]
    if all(r is not None for r in loc):
        if len(loc) == 1 and len(loc[0]) == 4:
            us = sorted({u for u, v in loc[0]}); vs = sorted({v for u, v in loc[0]})
            if len(us) == 2 and len(vs) == 2:
                u0, v0 = us[0], vs[0]
                return {'t': 'r', 'a': a, 'x': round(u0 * c - v0 * s, 1), 'y': round(u0 * s + v0 * c, 1), 'w': round(us[1] - us[0], 1), 'h': round(vs[1] - vs[0], 1)}
        out = []
        for r in loc:  # (each ring: its first corner in the world, then the frame's steps)
            u0, v0 = r[0]; out.append({'x': round(u0 * c - v0 * s, 1), 'y': round(u0 * s + v0 * c, 1), 'd': [round(r[i + 1][i & 1] - r[i][i & 1], 1) for i in range(len(r) - 2)]})
        return {'t': 'o', 'a': a, 'r': out}
    return {'t': 'p', 'r': [[(round(x, 1), round(y, 1)) for x, y in r] for r in rings_]}
if __name__ == '__main__':
    els = [e for e in json.load(open('bld.json'))['elements'] if e.get('tags', {}).get('building') not in ('roof', 'construction', 'ruins', 'no', 'demolished', 'collapsed', 'transformer_tower')]
    if os.path.exists('rel.json'):  # (relations fetched with their members, if bld.json has them without)
        rel = {e['id']: e for e in json.load(open('rel.json'))['elements']}
        els = [rel.get(e['id'], e) if e['type'] == 'relation' else e for e in els]
    world = box(0.6, 0.6, MW - 0.6, MH - 0.6)
    B = []
    for e in els:
        g = geom(e)
        if g is None: continue
        g = g.intersection(world).simplify(0.08)
        if g.area < 0.5: continue
        t = e['tags']; k = kind(t); wm, rm = metres(t, k)
        B.append({'g': g, 'k': k, 'wm': wm, 'rm': rm, 'rf': ROOF.get(t.get('roof:shape'), -1), 't': t})
    # tall building parts (spires and towers) become buildings of their own, taller than the one they rise from
    tree = STRtree([b['g'] for b in B])
    nt = 0
    for e in json.load(open('parts.json'))['elements'] if os.path.exists('parts.json') else []:
        t = e.get('tags', {})
        if (num(t.get('min_height')) or 0) > 1: continue
        g = geom(e)
        if g is None or g.area < 0.1: continue
        g = g.intersection(world)
        hit = [i for i in tree.query(g) if B[i]['g'].intersection(g).area > 0.5 * g.area]
        if not hit: continue
        par = B[max(hit, key=lambda i: B[i]['g'].intersection(g).area)]
        rf = ROOF.get(t.get('roof:shape'), -1)
        k = 'tower' if t.get('building:part') in ('tower', 'bell_tower', 'steeple') or rf in (3, 4) else par['k']
        wm, rm = metres(t, k)
        if not (t.get('building:part') in ('tower', 'bell_tower', 'steeple') or (wm + rm > par['wm'] + par['rm'] + 8 and g.area < 0.4 * par['g'].area)): continue
        if t.get('building:part') in ('tower', 'bell_tower', 'steeple') and not t.get('height'): wm, rm = max(wm, par['wm'] + 12), max(rm, 8)
        # (parts stacked on one footprint, a tower's shaft and the spire on it say, are one tower: the widest footprint,
        # the tallest height and that one's roof)
        same = [b for b in B if b.get('part') and b['g'].intersection(g).area > 0.6 * min(b['g'].area, g.area)]
        top = max(same, key=lambda b: b['wm'] + b['rm'], default=None)
        if top and top['wm'] + top['rm'] >= wm + rm: top['g'] = unary_union([top['g'], g]); continue
        for b in same: g = unary_union([g, b['g']]); B.remove(b); nt -= 1
        B.append({'g': g, 'k': k, 'wm': wm, 'rm': rm, 'rf': rf if rf >= 0 else 4 if k == 'tower' and rm > 3 else -1, 'part': 1,
                  't': dict(t, **{'building:colour': t.get('building:colour') or par['t'].get('building:colour') or '', 'name': ''})}); nt += 1
    print('buildings', len(B), 'towers from parts', nt)
    # disjoint: each outline gives up what the smaller ones on it take (a tower out of its church, a shed out of a yard)
    B.sort(key=lambda b: -b['g'].area)
    tree = STRtree([b['g'] for b in B])
    for i, b in enumerate(B):
        small = [B[j]['g'] for j in tree.query(b['g']) if j > i and B[j]['g'].intersects(b['g'])]
        if small: b['g'] = b['g'].difference(unary_union(small))
    # off the streets: nothing on a carriageway (half its width, 32 px a tile, and a third of a tile either side); a
    # tunnel runs under the city, but its ramps down to the portals (the game's last 4 tiles of it at each end) are open
    net = [w for w in json.load(open('net5.json')) if len(w['pts']) > 1]
    half = lambda w: w.get('wd', 64) / 64 + 0.35  # (and a little more: the game's line is the exported one, simplified, and cars are wide)
    ends = [LineString(w['pts']).buffer(half(w)) for w in net if not w.get('tunnel')]
    for w in net:
        if not w.get('tunnel'): continue
        L = LineString(w['pts']); r = min(6.0, L.length / 3)
        for a, b in ((0, r), (L.length - r, L.length)): ends.append(LineString([L.interpolate(a + (b - a) * i / 8) for i in range(9)]).buffer(half(w)))
    rt = STRtree(ends)
    out, npc, kinds = [], 0, {}
    for b in B:
        g = b['g']
        near = [ends[j] for j in rt.query(g) if ends[j].intersects(g)]
        if near: g = g.difference(unary_union(near))
        ps = clean(g, 0.15 if b['k'] == 'tower' else 0.5)  # (a spire may stand on a small square)
        if not ps: continue
        t = b['t']; k = b['k']
        pcs = [piece(p) for p in ps]
        for q in pcs: kinds[q['t']] = kinds.get(q['t'], 0) + 1
        npc += len(pcs)
        lv = max(1, min(60, round(b['wm'] / 3.2)))
        wc, rc = colour(t.get('building:colour')), colour(t.get('roof:colour'))
        glass = t.get('building:cladding') == 'glass' or t.get('building:material') == 'glass' or t.get('building:facade:material') == 'glass'
        nm = t.get('name') if t.get('name') and (k in ('church', 'hospital', 'school', 'station', 'castle', 'civic', 'sport', 'hotel') or t.get('amenity') or t.get('tourism') or t.get('historic')) else None
        out.append({'k': KINDS.index(k), 'lv': lv, 'rf': b['rf'], 'rh': min(60, round(b['rm'])), 'gl': 1 if glass else 0, 'wc': wc, 'rc': rc, 'nm': nm, 'p': pcs})
    json.dump(out, open('bld5.json', 'w'), ensure_ascii=False)
    from collections import Counter
    print('buildings', len(out), 'pieces', npc, kinds, Counter(KINDS[b['k']] for b in out).most_common(), 'named', sum(1 for b in out if b['nm']),
          'courtyards', sum(len(q['r']) - 1 for b in out for q in b['p'] if q['t'] != 'r'), 'glass', sum(b['gl'] for b in out))
    from PIL import Image, ImageDraw
    S = 2; im = Image.new('RGB', (MW * S, MH * S), (60, 70, 60)); d = ImageDraw.Draw(im)
    for w in json.load(open('net5.json')):
        if not w.get('tunnel'): d.line([(x * S, y * S) for x, y in w['pts']], fill=(90, 90, 95), width=2 * S)
    for b in out:
        for q in b['p']:
            if q['t'] == 'r':
                th = math.radians(q['a']); c, s = math.cos(th), math.sin(th)
                poly = [(q['x'] + u * c - v * s, q['y'] + u * s + v * c) for u, v in ((0, 0), (q['w'], 0), (q['w'], q['h']), (0, q['h']))]
                d.polygon([(x * S, y * S) for x, y in poly], fill=(200, 120, 90))
            elif q['t'] == 'o':
                th = math.radians(q['a']); c, s = math.cos(th), math.sin(th)
                for j, r in enumerate(q['r']):
                    u0 = r['x'] * c + r['y'] * s; v0 = -r['x'] * s + r['y'] * c; pts = [(u0, v0)]
                    for i, dd in enumerate(r['d']): u, v = pts[-1]; pts.append((u + dd, v) if i % 2 == 0 else (u, v + dd))
                    pts.append((pts[0][0], pts[-1][1]))
                    d.polygon([((u * c - v * s) * S, (u * s + v * c) * S) for u, v in pts], fill=(120, 170, 220) if j == 0 else (60, 70, 60))
            else:
                for j, r in enumerate(q['r']): d.polygon([(x * S, y * S) for x, y in r], fill=(230, 200, 90) if j == 0 else (60, 70, 60))
    im.save('bld5.png')
