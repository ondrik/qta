# The projection of inner Brno's map (about 5 m a tile, see ../brno5) and the polyline helpers its tools share
import math
LON0, LON1, LAT0, LAT1, MW, MH = 16.500, 16.654, 49.166, 49.242, 2241, 1690
SC = 6.0  # tiles per 30 m: distances in the shared tools were tuned at 30 m a tile and scale with it
P = lambda lat, lon: ((lon - LON0) / (LON1 - LON0) * MW, (LAT1 - lat) / (LAT1 - LAT0) * MH)
def dp(pts, eps):
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]; dx, dy = b[0]-a[0], b[1]-a[1]; L = math.hypot(dx, dy) or 1e-9
    i, dm = 0, -1
    for k in range(1, len(pts)-1):
        p = pts[k]; d = abs(dy*(p[0]-a[0]) - dx*(p[1]-a[1])) / L if L > 1e-9 else math.hypot(p[0]-a[0], p[1]-a[1])
        if d > dm: dm, i = d, k
    if dm <= eps: return [a, b]
    return dp(pts[:i+1], eps)[:-1] + dp(pts[i:], eps)
def seglen(pts): return sum(math.hypot(pts[i+1][0]-pts[i][0], pts[i+1][1]-pts[i][1]) for i in range(len(pts)-1))
def resample(pts, step):
    out = [pts[0]]; acc = 0
    for i in range(len(pts)-1):
        a, b = pts[i], pts[i+1]; L = math.hypot(b[0]-a[0], b[1]-a[1]); t = step - acc
        while t <= L: out.append((a[0]+(b[0]-a[0])*t/L, a[1]+(b[1]-a[1])*t/L)); t += step
        acc = (acc + L) % step
    out.append(pts[-1]); return out
