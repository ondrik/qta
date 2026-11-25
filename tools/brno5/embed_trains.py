# Put the trains (train5.json, from train5.py) into an already built brno5_data.js, without rebuilding the rest:
#   python3 embed_trains.py [../../brno5_data.js]
import json, os, sys
from train5 import pack
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'brno5_data.js')
js = open(out).read(); head, body = js[:js.index('{')], js[js.index('{'):js.rindex('}') + 1]
data = json.loads(body); data.pop('lx', None); data.update(pack())
open(out, 'w').write(head + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('trains', len(data['trn']), 'stations', len(data['trsn']), 'platforms', len(data['plat']), 'bytes', os.path.getsize(out))
