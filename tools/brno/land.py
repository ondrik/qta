import json, math
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from roads import MW, MH, P, SC
OPEN, FOREST, FARM, VINE, URBAN, INDUS, GREEN, WATER, AIR = range(9)
d = [e for e in json.load(open('layers.json'))['elements'] if e['type'] != 'relation'] + json.load(open('rels.json'))['elements']
res = json.load(open('res.json'))['elements']
def rings(e):
    if e['type'] == 'way': return [[P(g['lat'], g['lon']) for g in e['geometry']]]
    segs = [[P(g['lat'], g['lon']) for g in m['geometry']] for m in e.get('members', []) if m.get('role') == 'outer' and m.get('geometry')]
    out = []
    while segs:
        r = segs.pop(0)
        changed = True
        while changed and math.hypot(r[0][0]-r[-1][0], r[0][1]-r[-1][1]) > 1e-6:
            changed = False
            for i, s in enumerate(segs):
                if math.hypot(s[0][0]-r[-1][0], s[0][1]-r[-1][1]) < 1e-6: r += s[1:]; segs.pop(i); changed = True; break
                if math.hypot(s[-1][0]-r[-1][0], s[-1][1]-r[-1][1]) < 1e-6: r += s[-2::-1]; segs.pop(i); changed = True; break
        out.append(r)
    return out
def cls(t):
    lu, nat, lei, aer = t.get('landuse'), t.get('natural'), t.get('leisure'), t.get('aeroway')
    if nat == 'water': return WATER
    if aer in ('apron', 'runway'): return AIR
    if lu == 'forest' or nat == 'wood': return FOREST
    if lu in ('vineyard', 'orchard'): return VINE
    if lu in ('farmland',): return FARM
    if lu in ('meadow',) or nat in ('grassland', 'scrub'): return OPEN
    if lu in ('residential',): return URBAN
    if lu in ('industrial', 'commercial', 'retail', 'construction'): return INDUS
    if lu in ('allotments', 'cemetery', 'grass', 'village_green', 'greenery', 'park', 'railway') or lei == 'park': return GREEN
    return None
S = max(2, round(4 / SC))  # rasterise at sub-samples of about 7.5 m, then take the majority per tile
layers = {c: Image.new('L', (MW*S, MH*S), 0) for c in range(9)}
order = {URBAN: 0, INDUS: 1, FARM: 2, OPEN: 3, VINE: 4, FOREST: 5, GREEN: 6, AIR: 7, WATER: 8}
for e in d:
    t = e.get('tags', {}); c = cls(t)
    if c is None: continue
    if t.get('landuse') == 'grass' or t.get('leisure') == 'garden': continue  # verges and private gardens are too small to matter
    for r in rings(e):
        if len(r) >= 3: ImageDraw.Draw(layers[c]).polygon([(x*S, y*S) for x, y in r], fill=255)
# rivers as thick lines (exaggerated a little so they read at this scale)
rivers = []
for e in d:
    t = e.get('tags', {})
    if t.get('waterway') == 'river' and e['type'] == 'way':
        pts = [P(g['lat'], g['lon']) for g in e['geometry']]
        rivers.append((t.get('name', ''), pts))
        ImageDraw.Draw(layers[WATER]).line([(x*S, y*S) for x, y in pts], fill=255, width=int(1.5*SC*S))
grid = np.full((MH, MW), -1, dtype=int)
for c in sorted(order, key=order.get):
    a = np.array(layers[c]).reshape(MH, S, MW, S).mean(axis=(1, 3)) > 110
    grid[a] = c
# unmapped land inside the built-up area counts as built-up (closing the urban mask), the rest is open land
hint = Image.new('L', (MW*S, MH*S), 0)
for e in res:
    if e['tags'].get('highway') in ('residential', 'living_street'):
        ImageDraw.Draw(hint).line([(P(g['lat'], g['lon'])[0]*S, P(g['lat'], g['lon'])[1]*S) for g in e['geometry']], fill=255, width=int(5.0*SC*S))
hint = np.array(hint).reshape(MH, S, MW, S).mean(axis=(1, 3)) > 90
grid[((grid == -1) | (grid == OPEN)) & hint] = URBAN
urb = (grid == URBAN) | (grid == INDUS)
closed = ndimage.binary_fill_holes(ndimage.binary_closing(urb, iterations=round(4 * SC)))
grid[(grid == -1) & closed] = URBAN
grid[grid == -1] = OPEN
np.save('landgrid.npy', grid)
pal = {OPEN: (120, 160, 80), FOREST: (40, 90, 45), FARM: (200, 180, 90), VINE: (110, 140, 60), URBAN: (150, 140, 130), INDUS: (110, 110, 120), GREEN: (80, 170, 80), WATER: (40, 90, 160), AIR: (70, 70, 80)}
img = np.zeros((MH, MW, 3), dtype=np.uint8)
for c, col in pal.items(): img[grid == c] = col
Image.fromarray(img).resize((MW*2, MH*2), Image.NEAREST).save('landgrid.png')
json.dump([[n, [[round(x, 2), round(y, 2)] for x, y in pts]] for n, pts in rivers], open('rivers.json', 'w'))
from collections import Counter; print(Counter(grid.flatten().tolist())); print([n for n, _ in rivers])
