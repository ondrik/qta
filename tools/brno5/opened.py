# Roads that OpenStreetMap still has under construction but whose opening date has passed are open: they get their
# road type back (highway=construction, construction=trunk -> highway=trunk). The rest under construction are dropped.
# Usage: python3 opened.py roads.json   (rewrites it in place)
import datetime, json, sys
f = sys.argv[1]
d = json.load(open(f))
today, keep, opened = datetime.date.today().isoformat(), [], []
for e in d['elements']:
    t = e.get('tags', {})
    if t.get('highway') == 'construction':
        if not (t.get('construction') and t.get('opening_date', '9999') <= today): continue
        t['highway'] = t.pop('construction'); opened.append(t.get('name', e['id']))
    keep.append(e)
d['elements'] = keep
json.dump(d, open(f, 'w'))
print('opened', len(opened), sorted(set(map(str, opened))))
