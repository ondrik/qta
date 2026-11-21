#!/bin/sh
# Rebuild the Brno map data from OpenStreetMap (© OpenStreetMap contributors, ODbL) and embed it in game.js.
# Needs curl and Python 3 with numpy, scipy and Pillow. Overpass is a shared public service: run this rarely.
set -e
cd "$(dirname "$0")"
api=https://overpass-api.de/api/interpreter
fetch() { curl -sS -A "qta-map-builder/1.0" --data-urlencode "data@$1" "$api" -o "$2"; head -c 1 "$2" | grep -q '{' || { echo "Overpass is busy: try again later"; exit 1; }; }
fetch q_roads.txt roads.json; sleep 5
fetch q_layers.txt layers.json; sleep 5
fetch q_rel.txt rels.json; sleep 5
fetch q_res.txt res.json
python3 land.py      # land use and water -> landgrid.npy, rivers.json
python3 net.py       # the connected road network -> net.json
python3 export.py    # everything, compactly -> brno_data.json
python3 embed.py ../../game.js
