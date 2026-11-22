# Inner Brno's ground at 5 m a tile: what every tile is when no road or building stands on it.
# Run from the data directory, with QTA_MAP=brno5 (the extent and resolution come from ../brno/roads.py).
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
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
    for e in els:
        if e['type'] == 'node': continue
        t = e.get('tags', {}); c = cls(t)
        if c is None: continue
        if e['type'] == 'way' and len(e.get('geometry', [])) < 4: continue  # (an open line, not an area)
        if e['type'] == 'way' and (e['geometry'][0]['lat'], e['geometry'][0]['lon']) != (e['geometry'][-1]['lat'], e['geometry'][-1]['lon']): continue
        for r in rings(e):
            if len(r) >= 3: ImageDraw.Draw(layers[c]).polygon([(x * S, y * S) for x, y in r], fill=255)
        for r in rings(e, 'inner'): holes[c].append(r)
    for c, hs in holes.items():
        for r in hs:
            if len(r) >= 3: ImageDraw.Draw(layers[c]).polygon([(x * S, y * S) for x, y in r], fill=0)
    # rivers and canals as lines where they have no water area of their own; pedestrian streets as squares
    rivers = []
    for e in els:
        t = e.get('tags', {})
        if e['type'] != 'way' or 'geometry' not in e: continue
        pts = [P(g['lat'], g['lon']) for g in e['geometry']]
        ww = t.get('waterway')
        if ww in ('river', 'canal', 'stream') and t.get('tunnel') not in ('culvert', 'yes'):
            if ww == 'river': rivers.append((t.get('name', ''), pts))
            ImageDraw.Draw(layers[WATER]).line([(x * S, y * S) for x, y in pts], fill=255, width=int((4 if ww == 'river' else 1.6 if ww == 'canal' else 0.9) * S))
    for e in json.load(open('roads.json'))['elements']:
        t = e['tags']
        if t.get('highway') == 'pedestrian' and t.get('area') != 'yes' and t.get('tunnel') is None:
            ImageDraw.Draw(layers[PLAZA]).line([(P(g['lat'], g['lon'])[0] * S, P(g['lat'], g['lon'])[1] * S) for g in e['geometry']], fill=255, width=int(2.4 * S))
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
    json.dump([[n, [[round(x, 2), round(y, 2)] for x, y in pts]] for n, pts in rivers], open('rivers5.json', 'w'), ensure_ascii=False)
    pal = {OPEN: (120, 160, 80), FOREST: (40, 90, 45), FARM: (200, 180, 90), VINE: (110, 140, 60), URBAN: (150, 140, 130), INDUS: (110, 110, 120), GREEN: (80, 170, 80),
           WATER: (40, 90, 160), AIR: (70, 70, 80), PLAZA: (210, 200, 180), PARK_LOT: (90, 90, 95), RAIL: (120, 90, 70), PITCH: (190, 120, 80)}
    img = np.zeros((MH, MW, 3), dtype=np.uint8)
    for c, col in pal.items(): img[grid == c] = col
    Image.fromarray(img).save('land5.png')
    from collections import Counter; print(sorted(Counter(grid.flatten().tolist()).items()), 'rivers', sorted({n for n, _ in rivers}))
