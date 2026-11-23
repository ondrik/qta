# Inner Brno's ground at 5 m a tile: what every tile is when no road or building stands on it (land5.npy, for the
# game's rules), and the same areas as polygons in paint order (land5poly.json, for drawing their real edges).
# Run from the data directory, with QTA_MAP=brno5 (the extent and resolution come from ../brno/roads.py).
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union
from shapely.validation import make_valid
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'brno'))
from roads import MW, MH, P
OPEN, FOREST, FARM, VINE, URBAN, INDUS, GREEN, WATER, AIR, PLAZA, PARK_LOT, RAIL, PITCH = range(13)

def load(*names):
    out = []
    for n in names: out += json.load(open(n))['elements']
    return out
def rings(e, role='outer'):
    """the closed rings of a way or a multipolygon relation (outer or inner ones), joined from their member ways"""
    if e['type'] == 'way': return [[P(g['lat'], g['lon']) for g in e['geometry']]] if role == 'outer' and 'geometry' in e else []
    segs = [[P(g['lat'], g['lon']) for g in m['geometry']] for m in e.get('members', []) if m.get('role', 'outer') in ((role,) if role == 'inner' else ('outer', '')) and m.get('geometry')]
    out = []
    while segs:
        r = segs.pop(0); changed = True
        while changed and math.hypot(r[0][0] - r[-1][0], r[0][1] - r[-1][1]) > 1e-6:
            changed = False
            for i, s in enumerate(segs):
                if math.hypot(s[0][0] - r[-1][0], s[0][1] - r[-1][1]) < 1e-6: r += s[1:]; segs.pop(i); changed = True; break
                if math.hypot(s[-1][0] - r[-1][0], s[-1][1] - r[-1][1]) < 1e-6: r += s[-2::-1]; segs.pop(i); changed = True; break
        out.append(r)
    return out
def cls(t):
    lu, nat, lei, am, hw = t.get('landuse'), t.get('natural'), t.get('leisure'), t.get('amenity'), t.get('highway')
    if nat == 'water' or lu in ('basin', 'reservoir'): return WATER
    if hw == 'pedestrian' or t.get('place') == 'square' or t.get('area:highway') in ('pedestrian', 'footway'): return PLAZA
    if am == 'parking' and t.get('parking') not in ('underground', 'multi-storey', 'rooftop'): return PARK_LOT
    if lei in ('pitch', 'track', 'stadium', 'sports_centre', 'swimming_pool'): return PITCH
    if lu == 'forest' or nat == 'wood': return FOREST
    if lu in ('vineyard', 'orchard'): return VINE
    if lu in ('farmland', 'farmyard'): return FARM
    if lu == 'railway': return RAIL
    if lu in ('industrial', 'commercial', 'retail', 'construction', 'garages', 'depot'): return INDUS
    if lu in ('residential',): return URBAN
    if lu in ('meadow', 'brownfield', 'greenfield') or nat in ('grassland', 'scrub', 'heath', 'wetland'): return OPEN
    if lu in ('allotments', 'cemetery', 'grass', 'village_green', 'greenery', 'park', 'recreation_ground', 'flowerbed') or lei in ('park', 'garden', 'common', 'dog_park', 'playground') or nat == 'tree_row': return GREEN
    return None
# paint order: broad zones first, then what sits in them (a park in a residential area, a car park in a park, water last)
ORDER = [URBAN, INDUS, FARM, OPEN, VINE, RAIL, FOREST, GREEN, PITCH, PARK_LOT, PLAZA, WATER]
S = 2  # sub-samples per tile
if __name__ == '__main__':
    els = load('land1.json', 'land2.json', 'land3.json')
    layers = {c: Image.new('L', (MW * S, MH * S), 0) for c in ORDER}
    holes = {c: [] for c in ORDER}
    geoms = {c: [] for c in ORDER}  # (each area with its own holes, for the polygons)
    lines = {c: [] for c in ORDER}  # (and the areas drawn as lines: rivers, pedestrian streets), with their widths
    for e in els:
        if e['type'] == 'node': continue
        t = e.get('tags', {}); c = cls(t)
        if c is None: continue
        if e['type'] == 'way' and len(e.get('geometry', [])) < 4: continue  # (an open line, not an area)
        if e['type'] == 'way' and (e['geometry'][0]['lat'], e['geometry'][0]['lon']) != (e['geometry'][-1]['lat'], e['geometry'][-1]['lon']): continue
        for r in rings(e):
            if len(r) >= 3: ImageDraw.Draw(layers[c]).polygon([(x * S, y * S) for x, y in r], fill=255)
        for r in rings(e, 'inner'): holes[c].append(r)
        try:
            g = unary_union([make_valid(Polygon(r)) for r in rings(e) if len(r) >= 3])
            ins = [make_valid(Polygon(r)) for r in rings(e, 'inner') if len(r) >= 3]
            if ins: g = g.difference(unary_union(ins))
            if not g.is_empty: geoms[c].append(g)
        except Exception as ex: print('skipped', e['type'], e['id'], ex)
    for c, hs in holes.items():
        for r in hs:
            if len(r) >= 3: ImageDraw.Draw(layers[c]).polygon([(x * S, y * S) for x, y in r], fill=0)
    # rivers and canals as lines where they have no water area of their own; pedestrian streets as squares
    rivers, dams = [], ([], [])  # (dams and weirs: areas, and lines with their widths)
    for e in els:
        t = e.get('tags', {})
        if e['type'] != 'way' or 'geometry' not in e: continue
        pts = [P(g['lat'], g['lon']) for g in e['geometry']]
        ww = t.get('waterway')
        if ww in ('river', 'canal', 'stream') and t.get('tunnel') not in ('culvert', 'yes'):
            if ww == 'river': rivers.append((t.get('name', ''), pts))
            wd = 4 if ww == 'river' else 1.6 if ww == 'canal' else 0.9
            ImageDraw.Draw(layers[WATER]).line([(x * S, y * S) for x, y in pts], fill=255, width=int(wd * S)); lines[WATER].append((wd, pts))
        elif ww in ('dam', 'weir'):  # the reservoir's dam (a paved crest you can walk) and the rivers' weirs, drawn over the water
            if len(pts) >= 4 and pts[0] == pts[-1]:
                dams[0].append(make_valid(Polygon(pts)))
                if ww == 'dam': ImageDraw.Draw(layers[PLAZA]).polygon([(x * S, y * S) for x, y in pts], fill=255)
            else:
                dams[1].append((2.0 if ww == 'dam' else 0.8, pts))
                if ww == 'dam': ImageDraw.Draw(layers[PLAZA]).line([(x * S, y * S) for x, y in pts], fill=255, width=int(2.0 * S))
    for e in json.load(open('roads.json'))['elements']:
        t = e['tags']
        if t.get('highway') == 'pedestrian' and t.get('area') != 'yes' and t.get('tunnel') is None:
            ImageDraw.Draw(layers[PLAZA]).line([(P(g['lat'], g['lon'])[0] * S, P(g['lat'], g['lon'])[1] * S) for g in e['geometry']], fill=255, width=int(2.4 * S))
            lines[PLAZA].append((2.4, [P(g['lat'], g['lon']) for g in e['geometry']]))
    grid = np.full((MH, MW), -1, dtype=np.int16)
    for c in ORDER:
        a = np.array(layers[c]).reshape(MH, S, MW, S).mean(axis=(1, 3)) > 100
        grid[a] = c
    # what nobody mapped: inside the built-up area it is paved (yards, pavements, courtyards), outside it is open ground
    built = np.isin(grid, (URBAN, INDUS, PLAZA, PARK_LOT, RAIL, PITCH))
    bl = np.zeros((MH, MW), bool)
    for e in json.load(open('bld.json'))['elements']:
        if e['type'] == 'way' and e.get('geometry'):
            x, y = P(e['geometry'][0]['lat'], e['geometry'][0]['lon'])
            if 0 <= int(x) < MW and 0 <= int(y) < MH: bl[int(y), int(x)] = True
    town = ndimage.binary_closing(built | ndimage.binary_dilation(bl, iterations=6), iterations=8)
    grid[(grid == -1) & town] = URBAN
    grid[grid == -1] = OPEN
    np.save('land5.npy', grid)
    # the polygons: first the built-up land nobody mapped (the town mask, its tile steps smoothed away), then each kind
    # of area in paint order, merged, simplified to 0.15 tile and cut to the map; lines go with their kind
    B = box(0, 0, MW, MH)
    def runs_of(m):
        bx = []
        for y in range(m.shape[0]):
            d = np.flatnonzero(np.diff(np.concatenate(([0], m[y].astype(np.int8), [0]))))
            bx += [box(a, y, b, y + 1) for a, b in zip(d[::2], d[1::2])]
        return unary_union(bx)
    polys = lambda g: [g] if g.geom_type == 'Polygon' else [q for q in getattr(g, 'geoms', []) if q.geom_type == 'Polygon']
    def cut(q, cell=32):  # (a big polygon is cut on a 32-tile grid, so that drawing one chunk of ground never walks all of it;
        # the cuts fall on whole pixels, where the pieces meet without a seam)
        if len(q.exterior.coords) + sum(len(i.coords) for i in q.interiors) <= 300: return [q]
        x0, y0, x1, y1 = q.bounds
        return [r for gx in range(int(x0 // cell), int(x1 // cell) + 1) for gy in range(int(y0 // cell), int(y1 // cell) + 1)
                for r in polys(q.intersection(box(gx * cell, gy * cell, (gx + 1) * cell, (gy + 1) * cell)))]
    def parts(g):
        out = [r for q in polys(g.intersection(B)) for r in cut(q)]
        return [[[(round(x, 2), round(y, 2)) for x, y in q.exterior.coords[:-1]]] + [[(round(x, 2), round(y, 2)) for x, y in i.coords[:-1]] for i in q.interiors] for q in out if q.area >= 0.3]
    def cut_lines(ls):
        out = []
        for wd, pts in ls:
            g = LineString(pts).simplify(0.15).intersection(B.buffer(wd))
            for q in [g] if g.geom_type == 'LineString' else getattr(g, 'geoms', []):
                if q.geom_type == 'LineString' and len(q.coords) >= 2: out.append([wd, [(round(x, 2), round(y, 2)) for x, y in q.coords]])
        return out
    # (the town mask's edge is made up, so it is rounded: closed and opened by 1.5 tiles, which smooths its tile steps)
    poly = [[URBAN, parts(runs_of(town).buffer(1.5, quad_segs=2).buffer(-3, quad_segs=2).buffer(1.5, quad_segs=2).simplify(0.4)), []]]
    for c in ORDER:
        ps, ls = parts(unary_union(geoms[c]).simplify(0.15)) if geoms[c] else [], cut_lines(lines[c])
        if ps or ls: poly.append([c, ps, ls])
    ps, ls = parts(unary_union(dams[0]).simplify(0.15)) if dams[0] else [], cut_lines(dams[1])
    if ps or ls: poly.append([PLAZA, ps, ls])
    json.dump(poly, open('land5poly.json', 'w'))
    print('polygons', [(c, len(ps), sum(len(r) for p in ps for r in p), len(ls)) for c, ps, ls in poly])
    json.dump([[n, [[round(x, 2), round(y, 2)] for x, y in pts]] for n, pts in rivers], open('rivers5.json', 'w'), ensure_ascii=False)
    pal = {OPEN: (120, 160, 80), FOREST: (40, 90, 45), FARM: (200, 180, 90), VINE: (110, 140, 60), URBAN: (150, 140, 130), INDUS: (110, 110, 120), GREEN: (80, 170, 80),
           WATER: (40, 90, 160), AIR: (70, 70, 80), PLAZA: (210, 200, 180), PARK_LOT: (90, 90, 95), RAIL: (120, 90, 70), PITCH: (190, 120, 80)}
    img = np.zeros((MH, MW, 3), dtype=np.uint8)
    for c, col in pal.items(): img[grid == c] = col
    Image.fromarray(img).save('land5.png')
    from collections import Counter; print(sorted(Counter(grid.flatten().tolist()).items()), 'rivers', sorted({n for n, _ in rivers}))
