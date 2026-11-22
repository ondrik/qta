# Inner Brno's buildings at 5 m a tile, from their OpenStreetMap outlines: each outline (less its courtyards) is
# rasterised, clipped where a street runs, and cut into a few rectangles the game can draw as boxes. Each building keeps
# its kind, floors, roof shape and colour where they are mapped.
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'brno'))
from roads import MW, MH, P, resample
from land5 import rings
KINDS = ['yes', 'house', 'flats', 'shed', 'industry', 'shop', 'civic', 'church', 'hospital', 'school', 'station', 'castle', 'sport', 'hotel']
def kind(t):
    b, am = t.get('building'), t.get('amenity')
    if t.get('historic') == 'castle' or b == 'castle': return 'castle'
    if b in ('church', 'cathedral', 'chapel', 'religious', 'synagogue', 'mosque') or am == 'place_of_worship': return 'church'
    if b == 'hospital' or am == 'hospital': return 'hospital'
    if b in ('school', 'university', 'college', 'kindergarten') or am in ('school', 'university', 'college'): return 'school'
    if b in ('train_station', 'transportation') or t.get('railway') == 'station' or t.get('public_transport') == 'station': return 'station'
    if b in ('stadium', 'sports_hall', 'grandstand', 'sports_centre'): return 'sport'
    if b == 'hotel': return 'hotel'
    if b in ('house', 'detached', 'semidetached_house', 'terrace', 'bungalow', 'farm', 'villa'): return 'house'
    if b in ('residential', 'apartments', 'dormitory'): return 'flats'
    if b in ('garage', 'garages', 'shed', 'cabin', 'hut', 'carport', 'service', 'kiosk', 'toilets', 'barn', 'greenhouse', 'storage_tank'): return 'shed'
    if b in ('industrial', 'warehouse', 'manufacture', 'factory', 'hangar', 'depot'): return 'industry'
    if b in ('commercial', 'office', 'retail', 'supermarket', 'shop', 'mall'): return 'shop'
    if b in ('civic', 'public', 'government', 'museum', 'theatre', 'library', 'courthouse', 'townhall'): return 'civic'
    return 'yes'
DEF_LV = {'yes': 3, 'house': 2, 'flats': 4, 'shed': 1, 'industry': 2, 'shop': 3, 'civic': 3, 'church': 3, 'hospital': 4, 'school': 3, 'station': 2, 'castle': 3, 'sport': 2, 'hotel': 5}
ROOF = {'flat': 0, 'gabled': 1, 'hipped': 2, 'half-hipped': 2, 'pyramidal': 2, 'skillion': 0, 'mansard': 2, 'gambrel': 1, 'dome': 3, 'onion': 3, 'round': 3}
NAMED = {'colors': ['white', 'red', 'brown', 'grey', 'gray', 'black', 'yellow', 'beige', 'green', 'blue', 'orange']}
CN = {'white': '#e8e6e0', 'red': '#a5483a', 'brown': '#7a5a44', 'grey': '#8a8c90', 'gray': '#8a8c90', 'black': '#3a3c40', 'yellow': '#e0c878', 'beige': '#dccca8', 'green': '#5a7a5a', 'blue': '#5a6e8a', 'orange': '#d88a4a', 'silver': '#b8bcc0', 'darkgrey': '#5a5c60', 'darkgray': '#5a5c60', 'lightgrey': '#b8bab8', 'pink': '#e8a8b8', 'cream': '#ece2c8', 'maroon': '#6a2a2a'}
def colour(v):
    if not v: return None
    v = v.strip().lower()
    if v.startswith('#') and len(v) in (4, 7): return v if len(v) == 7 else '#' + ''.join(c * 2 for c in v[1:])
    return CN.get(v.replace(' ', '').replace('_', ''))
def levels(t, k):
    for key in ('building:levels',):
        v = t.get(key, '').replace(',', '.').split(';')[0]
        try: return max(1, round(float(v) + 0.5 * float(t.get('roof:levels', '0').replace(',', '.') or 0)))
        except ValueError: pass
    try: return max(1, round(float(t.get('height', '').replace('m', '').strip()) / 3.2))
    except ValueError: return DEF_LV[k]
def rects(mask):
    """greedy cover of a small boolean mask by rectangles: grow right along the row, then down while the whole span is free"""
    m = mask.copy(); out = []
    H, W = m.shape
    for y in range(H):
        x = 0
        while x < W:
            if not m[y, x]: x += 1; continue
            x1 = x
            while x1 + 1 < W and m[y, x1 + 1]: x1 += 1
            y1 = y
            while y1 + 1 < H and m[y1 + 1, x:x1 + 1].all(): y1 += 1
            m[y:y1 + 1, x:x1 + 1] = False
            out.append((x, y, x1 - x + 1, y1 - y + 1))
            x = x1 + 1
    return out
if __name__ == '__main__':
    S = 2
    els = [e for e in json.load(open('bld.json'))['elements'] if e.get('tags', {}).get('building') not in ('roof', 'construction', 'ruins', 'no', 'demolished', 'collapsed')]
    polys = []
    for e in els:
        outer = [r for r in rings(e) if len(r) >= 3]
        if not outer: continue
        area = sum(abs(sum(r[i][0] * r[(i + 1) % len(r)][1] - r[(i + 1) % len(r)][0] * r[i][1] for i in range(len(r)))) / 2 for r in outer)
        if area < 0.5: continue  # (under 12 m²: a kiosk or a hut)
        polys.append((area, e, outer, [r for r in rings(e, 'inner') if len(r) >= 3]))
    polys.sort(key=lambda p: -p[0])  # big first, so a small building inside a big one stays on top
    lab = Image.new('I', (MW * S, MH * S), 0); d = ImageDraw.Draw(lab)
    for i, (_, e, outer, inner) in enumerate(polys):
        for r in outer: d.polygon([(x * S, y * S) for x, y in r], fill=i + 1)
        for r in inner: d.polygon([(x * S, y * S) for x, y in r], fill=0)
    sub = np.array(lab).reshape(MH, S, MW, S).transpose(0, 2, 1, 3).reshape(MH, MW, S * S)
    # each tile goes to the building covering most of it (at least half)
    best = np.zeros((MH, MW), np.int32); cnt = np.zeros((MH, MW), np.int8)
    for j in range(S * S):
        v = sub[:, :, j]
        c = (sub == v[:, :, None]).sum(axis=2)
        upd = (v > 0) & (c > cnt)
        best[upd] = v[upd]; cnt[upd] = c[upd]
    best[cnt < (S * S) // 2] = 0
    # small buildings that fell between tiles keep the tile their middle is in
    for i, (area, e, outer, _) in enumerate(polys):
        if area < 3:
            r = outer[0]; cx = sum(p[0] for p in r) / len(r); cy = sum(p[1] for p in r) / len(r)
            tx, ty = int(cx), int(cy)
            if 0 <= tx < MW and 0 <= ty < MH and best[ty, tx] == 0: best[ty, tx] = i + 1
    # no building on a street's carriageway (the game's road core: within a tile of the centre line)
    road = Image.new('L', (MW * 4, MH * 4), 0); rd = ImageDraw.Draw(road)
    for w in json.load(open('net5.json')):
        if w.get('tunnel'): continue
        rd.line([(x * 4, y * 4) for x, y in w['pts']], fill=255, width=7)
    road = np.array(road).reshape(MH, 4, MW, 4).mean(axis=(1, 3)) > 120
    best[road] = 0
    np.save('bldgrid.npy', best)
    out, names, cols = [], [], []
    objs = ndimage.find_objects(best)
    nrect = 0
    for i, sl in enumerate(objs):
        if sl is None: continue
        area, e, outer, _ = polys[i]; t = e['tags']
        mask = best[sl] == i + 1
        if not mask.any(): continue
        k = kind(t); lv = min(60, levels(t, k))
        rs = [(x + sl[1].start, y + sl[0].start, w, h) for x, y, w, h in rects(mask)]
        nrect += len(rs)
        rf = ROOF.get(t.get('roof:shape'), -1)
        wc, rc = colour(t.get('building:colour')), colour(t.get('roof:colour'))
        nm = t.get('name') if t.get('name') and (k in ('church', 'hospital', 'school', 'station', 'castle', 'civic', 'sport', 'hotel') or t.get('amenity') or t.get('tourism') or t.get('historic')) else None
        out.append({'k': KINDS.index(k), 'lv': lv, 'rf': rf, 'wc': wc, 'rc': rc, 'nm': nm, 'r': rs, 'am': t.get('amenity')})
    json.dump(out, open('bld5.json', 'w'), ensure_ascii=False)
    from collections import Counter
    print('buildings', len(out), 'rects', nrect, 'tiles', int((best > 0).sum()), 'kinds', Counter(KINDS[b['k']] for b in out).most_common(), 'named', sum(1 for b in out if b['nm']),
          'wall colours', sum(1 for b in out if b['wc']), 'roof colours', sum(1 for b in out if b['rc']), 'rects/bldg', round(nrect / len(out), 2))
    img = np.zeros((MH, MW, 3), np.uint8); img[:] = (60, 70, 60); img[road] = (90, 90, 95)
    rng = np.random.default_rng(1); pal = rng.integers(120, 255, size=(len(polys) + 1, 3)).astype(np.uint8); pal[0] = (60, 70, 60)
    img[best > 0] = pal[best[best > 0]]
    Image.fromarray(img).save('bld5.png')
