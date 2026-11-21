# Put brno_data.json into game.js (replaces the BRNO_DATA literal).
import sys
game = sys.argv[1] if len(sys.argv) > 1 else '../../game.js'
s = open(game).read(); data = open('brno_data.json').read()
a = 'const BRNO_DATA = BRNO ? '; i = s.index(a) + len(a); j = s.index(' : null;\n', i)
open(game, 'w').write(s[:i] + data + s[j:]); print('embedded', len(data), 'bytes')
