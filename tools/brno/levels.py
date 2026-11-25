# How high an OpenStreetMap way is, for setting the railway against the streets (both maps)
def layer(t):
    try: return int((t.get('layer') or '0').split(';')[0])
    except ValueError: return 0

def lvl(t):
    """its layer; a bridge at least 1, a tunnel at most -1"""
    v = layer(t)
    if t.get('bridge') not in (None, 'no'): v = max(v, 1)
    if t.get('tunnel') not in (None, 'no'): v = min(v, -1)
    return v

def raised(t):
    """up on a bridge (a track that is, where it crosses a street, goes over it)"""
    return t.get('bridge') in ('yes', 'viaduct') or layer(t) > 0
