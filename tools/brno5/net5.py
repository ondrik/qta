# Inner Brno's street network at 5 m a tile: every public street, traced into one connected graph (as ../brno/net.py
# does for the main roads), with tunnels and overpasses traced on their own so the streets they cross don't meet them.
# An overpass is a bridge that crosses another street (bridges over water or rails stay ordinary streets); it keeps a
# stretch of each approach as its ramps, so the street beneath always passes under the full height of the deck.
import json, math, os, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'brno'))
from roads import resample, dp, seglen, P, MW, MH, SC
import net
from net import R, trace_clean, graph_edges, close_gaps
from decks import seg_grid, crosses, smooth, side, ramps, level, separate, by_level, tube_lines, clear_ends, join_decks
RK = {'motorway': 0, 'motorway_link': 0, 'trunk': 1, 'trunk_link': 1, 'primary': 2, 'primary_link': 2, 'secondary': 3, 'secondary_link': 3,
      'tertiary': 4, 'tertiary_link': 4, 'residential': 5, 'unclassified': 5, 'living_street': 5}
RAMP = 4.0  # tiles of approach that rise to an overpass (20 m)

if __name__ == '__main__':
    ways = []
    for e in json.load(open('roads.json'))['elements']:
        t = e['tags']; h = t.get('highway')
        if h not in RK or t.get('area') == 'yes' or t.get('access') in ('private', 'no'): continue
        ways.append({'r': RK[h], 'name': t.get('name') or t.get('ref') or '', 'pts': [P(g['lat'], g['lon']) for g in e['geometry']], 'link': h.endswith('_link'), 'lev': level(t), 'lv': abs(level(t))})
    # a road on another level than one it crosses is carried over it on a deck, or under it in a tunnel: never a junction
    decks, tubes, ground = separate(ways)
    decks, ground = join_decks(decks, ground, 16.0)
    ground = clear_ends(decks, ground, 5.0)  # (a short bridge's streets kept clear of the road it crosses, beyond the tracer's reach)
    print('ground ways', len(ground), 'overpass ways', len(decks), 'tunnel ways', len(tubes), 'levels', sorted({w['lev'] for w in decks + tubes}))
    land = np.load('land5.npy'); urban = np.isin(land, (4, 5, 9, 10, 11, 12))
    def streets(ground, decks, tubes):
        portals = [w['pts'][k] for w in decks + tubes for k in (0, -1)]
        cent, edges, near = trace_clean(ground, spur=4 * R, minlen=3 * R, width=1.3, close_iter=3)
        print('ground graph', len(cent), 'nodes', len(edges), 'edges')
        out = []
        for a, b, path in edges:
            pts = [cent[a]] + path[1:-1] + [cent[b]]
            pts = [(x / R + 0.25, y / R + 0.25) for x, y in pts]
            votes = {}
            for x, y in pts:
                l = near[min(MH * R - 1, int(y * R)), min(MW * R - 1, int(x * R))]
                if l >= 0: votes[l] = votes.get(l, 0) + 1
            named = {l: v for l, v in votes.items() if ground[l]['name'] and not ground[l].get('link')}
            best = max(votes, key=votes.get) if votes else -1
            nb_ = max(named, key=named.get) if named else best
            name = ground[nb_]['name'] if nb_ >= 0 else ''
            rank = ground[best]['r'] if best >= 0 else 5
            pts = dp(smooth(pts, 8), 0.25)
            if seglen(pts) < 1.5: continue
            smp = resample(pts, 0.5)
            ur = sum(1 for x, y in smp if 0 <= int(x) < MW and 0 <= int(y) < MH and urban[int(y), int(x)]) / max(1, len(smp))
            out.append({'name': name, 'r': rank, 'rural': 1 if (rank <= 1 or ur < 0.4) else 0, 'pts': pts})
        out += close_gaps(out, portals, pair_max=8, reach=5, margin=6)
        # each level on its own (a tunnel's tubes apart from the slip roads that dip under the street beside it), hooked on
        # to the streets; what really crosses a road at another level stays apart from it, the rest joins the streets
        tun, over, back = [], [], []
        for g in by_level(tubes):
            t_, b_ = side(g, out, 'tunnel', 3.0, 4, 30, apart=seg_grid([w for w in ground if w['lev'] > g[0]['lev']]), lines=tube_lines(g, 8)); tun += t_; back += b_
        for g in by_level(decks):
            o_, b_ = side(g, out, 'over', 1.3, 3, 8, apart=seg_grid([w for w in ground + tubes + decks if w['lev'] < g[0]['lev']]), lines=tube_lines(g, 4)); over += o_; back += b_
        return out + back, tun, over
    out, tun, over = streets(ground, decks, tubes)
    print('decks', len(over), 'tunnels', len(tun))
    ramps(over, out, RAMP)
    for t in tun: t['r'] = 1; t['rural'] = 0
    print('tunnels', [(t['name'], round(seglen(t['pts']))) for t in tun])
    print('overpasses', len(over), [(o['name'], round(seglen(o['pts']))) for o in over][:40])
    out += tun + over
    json.dump(out, open('net5.json', 'w'), ensure_ascii=False)
    from PIL import Image, ImageDraw
    S = 1; im = Image.new('RGB', (MW * S, MH * S), (35, 60, 35)); d = ImageDraw.Draw(im)
    col = {0: (230, 120, 60), 1: (230, 180, 60), 2: (240, 220, 120), 3: (240, 240, 240), 4: (200, 200, 200), 5: (140, 140, 140)}
    for w in out: d.line([(x * S, y * S) for x, y in w['pts']], fill=(80, 160, 255) if w.get('tunnel') else (255, 60, 200) if w.get('over') else col[w['r']], width=2 if w.get('over') or w.get('tunnel') or w['r'] < 5 else 1)
    deg = {}
    for w in out:
        for p in (w['pts'][0], w['pts'][-1]): k = (round(p[0], 1), round(p[1], 1)); deg[k] = deg.get(k, 0) + 1
    dead = [(x, y) for (x, y), n in deg.items() if n == 1 and 6 < x < MW - 6 and 6 < y < MH - 6]
    for x, y in dead: d.ellipse([x * S - 2, y * S - 2, x * S + 2, y * S + 2], fill=(255, 50, 50))
    im.save('net5.png'); print('inner dead ends', len(dead), 'roads', len(out))
