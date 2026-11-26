# Inner Brno's street network straight from OpenStreetMap's ways: a junction wherever ways share a node and nowhere else,
# each way cut into edges at its junctions (and joined up again where nothing branches off), so that dual carriageways stay
# two one-way roads, slip roads, loops and roundabouts are as mapped, and a road crossing another on a bridge or in a
# tunnel never meets it. A bridge over a street is a deck and a tunnel under one is a tunnel (as ../brno/decks.py
# tells them apart); each street keeps its own lanes and width. Writes net5.json (bld5.py and export5.py read it).
# Run from the data directory.
import json, math, os, sys
from collections import defaultdict
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'brno'))
from roads import resample, dp, seglen, P, MW, MH
from decks import level, separate, ramps
from lanes5 import way_lanes, LANE_PX, MIN_PX
RK = {'motorway': 0, 'motorway_link': 0, 'trunk': 1, 'trunk_link': 1, 'primary': 2, 'primary_link': 2, 'secondary': 3, 'secondary_link': 3,
      'tertiary': 4, 'tertiary_link': 4, 'residential': 5, 'unclassified': 5, 'living_street': 5}
RAMP = 4.0  # tiles of approach that rise to an overpass (20 m)

def key(q): return (round(q['lat'], 7), round(q['lon'], 7))

if __name__ == '__main__':
    ways = []
    for e in json.load(open('roads.json'))['elements']:
        t = e['tags']; h = t.get('highway')
        if h not in RK or t.get('area') == 'yes' or t.get('access') in ('private', 'no') or len(e.get('geometry', [])) < 2: continue
        d, f, b = way_lanes(t, h)
        ways.append({'r': RK[h], 'name': t.get('name') or t.get('ref') or '', 'pts': [P(q['lat'], q['lon']) for q in e['geometry']],
                     'keys': [key(q) for q in e['geometry']], 'link': h.endswith('_link'), 'lev': level(t), 'lv': abs(level(t)), 'dir': d, 'lf': f, 'lb': b})
    # which level each way is on: a bridge over a road is a deck, a tunnel under a street a tube, anything else the ground
    decks, tubes, ground = separate(ways)
    kind = {id(w): 'over' for w in decks}; kind.update({id(w): 'tunnel' for w in tubes})
    # junctions: a node two ways share (or one way twice), and every way's ends
    use = defaultdict(int)
    for w in ways:
        for k in w['keys']: use[k] += 1
    edges = []
    for w in ways:
        cut = [i for i, k in enumerate(w['keys']) if i == 0 or i == len(w['keys']) - 1 or use[k] > 1]
        for i0, i1 in zip(cut, cut[1:]):
            if i1 > i0: edges.append({'w': w, 'pts': w['pts'][i0:i1 + 1], 'a': w['keys'][i0], 'b': w['keys'][i1]})
    # an edge runs the way its traffic goes (one-way against the way's points: turned round)
    for e in edges:
        w = e['w']
        if w['dir'] < 0: e['pts'] = e['pts'][::-1]; e['a'], e['b'] = e['b'], e['a']
    # join up edges where nothing branches off and nothing changes (the same street, lanes, level and direction of travel)
    sig = lambda e: (e['w']['name'], e['w']['r'], e['w']['dir'] != 0, e['w']['lf'], e['w']['lb'], kind.get(id(e['w']), 'ground'), e['w']['lv'], e['w']['link'])
    at = defaultdict(list)
    for e in edges: at[e['a']].append(e); at[e['b']].append(e)
    alive = set(range(len(edges))); idx = {id(e): i for i, e in enumerate(edges)}
    changed = True
    while changed:
        changed = False
        for n, es in list(at.items()):
            es = [e for e in es if idx[id(e)] in alive]; at[n] = es
            if len(es) != 2 or es[0] is es[1] or sig(es[0]) != sig(es[1]): continue
            e1, e2 = es
            if e1['w']['dir'] or e2['w']['dir']: # (one-way: only end to start)
                if e1['b'] == n and e2['a'] == n: first, second = e1, e2
                elif e2['b'] == n and e1['a'] == n: first, second = e2, e1
                else: continue
                pts, a, b = first['pts'] + second['pts'][1:], first['a'], second['b']
            else:
                if e1['w']['lf'] != e1['w']['lb'] and not ((e1['b'] == n and e2['a'] == n) or (e2['b'] == n and e1['a'] == n)): continue # (more lanes one way: only end to start, or they would swap sides)
                if e1['w']['lf'] != e1['w']['lb'] and e2['b'] == n: e1, e2 = e2, e1
                p1 = e1['pts'] if e1['b'] == n else e1['pts'][::-1]; a = e1['a'] if e1['b'] == n else e1['b']
                p2 = e2['pts'] if e2['a'] == n else e2['pts'][::-1]; b = e2['b'] if e2['a'] == n else e2['a']
                if a == b: continue  # (a closed loop stays in two pieces)
                pts = p1 + p2[1:]
            m = {'w': first['w'] if (e1['w']['dir'] or e2['w']['dir']) else e1['w'], 'pts': pts, 'a': a, 'b': b}
            alive.discard(idx[id(e1)]); alive.discard(idx[id(e2)])
            idx[id(m)] = len(edges); edges.append(m); alive.add(idx[id(m)])
            at[n] = []; at[a] = [x for x in at[a] if x is not e1 and x is not e2] + [m]; at[b] = [x for x in at[b] if x is not e1 and x is not e2] + [m]
            changed = True
    edges = [edges[i] for i in sorted(alive)]
    land = np.load('land5.npy'); urban = np.isin(land, (4, 5, 9, 10, 11, 12))
    out, over, tun = [], [], []
    for e in edges:
        w = e['w']; pts = dp(e['pts'], 0.05)
        if seglen(pts) < 0.3: continue
        smp = resample(pts, 0.5)
        ur = sum(1 for x, y in smp if 0 <= int(x) < MW and 0 <= int(y) < MH and urban[int(y), int(x)]) / max(1, len(smp))
        lf, lb = (w['lf'], 0) if w['dir'] else (w['lf'], w['lb'])
        rec = {'name': w['name'], 'r': w['r'], 'rural': 1 if (w['r'] <= 1 or ur < 0.4) else 0, 'pts': pts, 'lf': lf, 'lb': lb,
               'wd': max(MIN_PX, (lf + lb) * LANE_PX.get(w['r'], 24))}
        k = kind.get(id(w), 'ground')
        if k == 'over': rec.update({'over': 1, 'lv': max(1, w['lv'])}); over.append(rec)
        elif k == 'tunnel': rec.update({'tunnel': 1, 'r': 1, 'rural': 0}); tun.append(rec)
        else: out.append(rec)
    ramps(over, out, RAMP)  # (each deck takes the end of each street it meets as its ramp)
    print('ways', len(ways), 'edges', len(out), 'decks', len(over), 'tunnels', len(tun), 'one-way', sum(1 for r in out + over + tun if r['lb'] == 0))
    print('tunnels', sorted({(t['name'], round(seglen(t['pts']))) for t in tun})[:12])
    json.dump(out + tun + over, open('net5.json', 'w'), ensure_ascii=False)
