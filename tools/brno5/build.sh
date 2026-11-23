#!/bin/sh
# Rebuild inner Brno at 5 m a tile (the third map) from OpenStreetMap (© OpenStreetMap contributors, ODbL) into
# ../../brno5_data.js. Needs curl and Python 3 with numpy, scipy, Pillow and shapely; shares ../brno/roads.py, net.py and
# decks.py with the 15 m map. Overpass is a shared public service: run this rarely (the queries are big).
set -e
cd "$(dirname "$0")"
export QTA_MAP=brno5
api=https://overpass-api.de/api/interpreter
fetch() { curl -sS -A "qta-map-builder/1.0" --data-urlencode "data@$1" "$api" -o "$2"; head -c 1 "$2" | grep -q '{' || { echo "Overpass is busy: try again later"; exit 1; }; }
fetch q_roads.txt roads.json; sleep 10
fetch q_bld.txt bld.json; sleep 10
fetch q_parts.txt parts.json; sleep 10
fetch q_land1.txt land1.json; sleep 10
fetch q_land2.txt land2.json; sleep 10
fetch q_land3.txt land3.json; sleep 10
fetch q_trees.txt trees.json
python3 land5.py     # the ground at 5 m a tile -> land5.npy, rivers5.json
python3 net5.py      # every street, with tunnels and overpasses -> net5.json
python3 ../brno/gradecheck.py net5.json  # (no junction where OpenStreetMap has roads cross at different levels)
python3 bld5.py      # the buildings' outlines, off the streets -> bld5.json
python3 export5.py ../../brno5_data.js
