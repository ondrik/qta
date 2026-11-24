# How many lanes each street has, each way, and how wide its carriageway is drawn: OpenStreetMap gives each way its
# lanes (or a default by its class) and whether it is one-way.

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
