# How many lanes each street of the traced network has, each way, and how wide its carriageway is drawn.
# OpenStreetMap gives each way its lanes (or a default by its class) and whether it is one-way; a traced street takes them
# from the ways running alongside it: one two-way way, two one-way carriageways (a dual carriageway: their lanes add up,
# one each way), or one one-way way (a one-way street, its points turned to run the way the traffic goes).
import math
from roads import resample

# a lane's width in px (32 px a tile, about 6.4 px a metre): the game's cars are drawn about 1.3 times real size, so
# its lanes are too (3.75 to 4 m)
LANE_PX = {0: 26, 1: 26, 2: 25, 3: 25, 4: 24, 5: 24}
MIN_PX = 36  # (the narrowest carriageway: a one-lane street still has room for a car and a parked one)

def way_lanes(t, h):
    """a way's direction (1 along it, -1 against it, 0 both ways) and its lanes forward and backward"""
    ow = t.get('oneway')
    d = 1 if ow in ('yes', 'true', '1') else -1 if ow == '-1' else 0
    if d == 0 and ow != 'no' and (h in ('motorway', 'motorway_link') or t.get('junction') in ('roundabout', 'circular')): d = 1
    def num(k):
        try: return max(1, int(float(str(t.get(k, '')).split(';')[0])))
        except ValueError: return None
    n = num('lanes')
    major = h in ('motorway', 'trunk', 'primary', 'secondary')
    if d:
        return d, n or (2 if major and not h.endswith('_link') else 1), 0
    n = n or (4 if h in ('motorway', 'trunk') else 2)
    f, b = num('lanes:forward'), num('lanes:backward')
    if f and b: return 0, f, b
    if f: return 0, f, max(1, n - f)
    if b: return 0, max(1, n - b), b
    return 0, max(1, (n + 1) // 2), max(1, n // 2)

class Index:
    """the ways' segments in a grid of 4-tile cells, each with its way and its direction"""
    def __init__(self, ways, cell=4.0):
        self.ways, self.cell, self.g = ways, cell, {}
        for i, w in enumerate(ways):
            for a, b in zip(w['pts'], w['pts'][1:]):
                for c in {(int(x // cell), int(y // cell)) for x, y in resample([a, b], 1.0)}: self.g.setdefault(c, []).append((i, a, b))
    def near(self, x, y, r):
        """each way with a segment within r of (x, y): its index and that segment's unit direction"""
        out, c = {}, self.cell
        for cx in range(int((x - r) // c), int((x + r) // c) + 1):
            for cy in range(int((y - r) // c), int((y + r) // c) + 1):
                for i, a, b in self.g.get((cx, cy), ()):
                    dx, dy = b[0] - a[0], b[1] - a[1]; l2 = dx * dx + dy * dy or 1e-9
                    t = max(0.0, min(1.0, ((x - a[0]) * dx + (y - a[1]) * dy) / l2))
                    d = math.hypot(a[0] + dx * t - x, a[1] + dy * t - y)
                    if d < r and (i not in out or d < out[i][0]): out[i] = (d, dx / math.sqrt(l2), dy / math.sqrt(l2))
        return out

def assign(rec, idx, r=2.5, fallback=None):
    """set rec's lanes forward (lf) and backward (lb) and its carriageway width (wd, px), from the ways alongside it;
    a one-way street's points are turned to run the way its traffic goes"""
    pts = rec['pts']; smp = resample(pts, 1.0)
    cnt, sgn = {}, {}
    for k, (x, y) in enumerate(smp):
        a, b = smp[max(0, k - 1)], smp[min(len(smp) - 1, k + 1)]
        ex, ey = b[0] - a[0], b[1] - a[1]; el = math.hypot(ex, ey) or 1
        for i, (d, ux, uy) in idx.near(x, y, r).items():
            c = (ux * ex + uy * ey) / el
            if abs(c) < 0.75: continue  # (a street crossing this one, not running along it)
            cnt[i] = cnt.get(i, 0) + 1; sgn[i] = sgn.get(i, 0) + (1 if c > 0 else -1)
    lf, lb = 1, 1
    if not cnt and fallback is not None: return assign(rec, fallback, r)
    if cnt:
        W = lambda i: (idx.ways[i].get('dir', 0), idx.ways[i].get('lf', 1), idx.ways[i].get('lb', 1))  # (ways made up by the tracer: two-way, a lane each way)
        top = max(cnt.values()); sig = [i for i, v in cnt.items() if v >= 0.3 * top]
        two = [i for i in sig if W(i)[0] == 0]
        one = [i for i in sig if W(i)[0] != 0]
        if two and max(cnt[i] for i in two) >= max((cnt[i] for i in one), default=0):
            i = max(two, key=lambda i: cnt[i]); _, f, b = W(i)
            lf, lb = (f, b) if sgn[i] >= 0 else (b, f)
        else:
            F = max((W(i)[1] for i in one if W(i)[0] * sgn[i] > 0), default=0)
            B = max((W(i)[1] for i in one if W(i)[0] * sgn[i] < 0), default=0)
            lf, lb = (F, B) if F else (B, 0)
            if not F and B: rec['pts'] = pts[::-1]  # (one way, against the points: turn them)
            if not F and not B: lf, lb = 1, 1
    rec['lf'], rec['lb'] = lf, lb
    rec['wd'] = max(MIN_PX, (lf + lb) * LANE_PX.get(rec.get('r', 5), 24))
    return rec
