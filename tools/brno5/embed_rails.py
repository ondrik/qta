# Put the railway's levels (rails5.py: which tracks are up on bridges over the streets, and how the tracks on the ground
# meet the streets) into an already built brno5_data.js, without rebuilding the rest. Run it where the build's
# land3.json and roads.json are:   python3 embed_rails.py [../../brno5_data.js]
import json, os, sys
from export5 import rail_pieces
from rails5 import rail_levels
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'brno5_data.js')
js = open(out).read(); head, body = js[:js.index('{')], js[js.index('{'):js.rindex('}') + 1]
data = json.loads(body)
rails, rway = rail_pieces(json.load(open('land3.json'))['elements'])
if rails != data['rails']: sys.exit('these land3.json tracks are not the ones in ' + out + ': run it with the data that map was built from')
data['rlv'], data['rx'] = rail_levels(rway, rails, data['roads'], json.load(open('roads.json'))['elements'])
open(out, 'w').write(head + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('rails', len(rails), 'on bridges over streets', sum(data['rlv']), 'crossings', len(data['rx']),
      {k: sum(1 for q in data['rx'] if q[2] == k) for k in (0, 1, 2)}, 'bytes', os.path.getsize(out))
