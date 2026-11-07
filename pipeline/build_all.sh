#!/usr/bin/env bash
# Kompletní sestavení dat mhdGO (jízdní řády, nástupiště, trasy, balíčky okresů, bedekr).
# Použití: pipeline/build_all.sh [pracovní_adresář]   (potřebuje ~6 GB RAM a ~8 GB disku)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
W="${1:-$ROOT/work}"
mkdir -p "$W/src/cisjr" "$W/src/pid" "$W/src/osm" "$W/vh/tiles" "$W/out"
P="$ROOT/pipeline"
echo "== stahuji zdroje"
curl -fsSL -o "$W/src/cisjr/gtfs.zip" "https://spojenka.d3s.mff.cuni.cz/api/data/timetable/gtfs"
curl -fsSL -o "$W/src/pid/PID_GTFS.zip" "https://data.pid.cz/PID_GTFS.zip"
if [ ! -s "$W/src/osm/cz.osm.pbf" ] || [ -n "${OSM_REFRESH:-}" ]; then
  curl -fsSL -o "$W/src/osm/cz.osm.pbf" "https://download.geofabrik.de/europe/czech-republic-latest.osm.pbf" \
  || curl -fsSL -o "$W/src/osm/cz.osm.pbf" "https://download.openstreetmap.fr/extracts/europe/czech_republic-latest.osm.pbf"
fi
(cd "$W/src/cisjr" && unzip -o -q gtfs.zip)
echo "== OSM"
python3 "$P/osm_extract.py" "$W/src/osm/cz.osm.pbf" "$W"
python3 "$P/osm_admin.py" "$W/src/osm/cz.osm.pbf" "$W"
echo "== Valhalla"
python3 - "$W" <<'PY'
import json, os, sys
from valhalla.config import get_config
w = sys.argv[1]; c = get_config(tile_extract='', tile_dir=os.path.join(w, 'vh', 'tiles'), verbose=False)
c['mjolnir']['concurrency'] = os.cpu_count() or 2
for k in ('timezone', 'admin', 'tile_extract', 'traffic_extract', 'transit_dir', 'transit_feeds_dir', 'landmarks'):
    if k in c['mjolnir']: c['mjolnir'][k] = ''
for k in ('bus', 'auto'):
    c['service_limits'][k]['max_locations'] = 500; c['service_limits'][k]['max_distance'] = 3000000
json.dump(c, open(os.path.join(w, 'vh', 'config.json'), 'w'), indent=1)
PY
python3 -m valhalla valhalla_build_tiles -c "$W/vh/config.json" "$W/src/osm/cz.osm.pbf" > "$W/vh/build.log" 2>&1
echo "== jízdní řády"
python3 "$P/gtfs_load.py" "$W/src/cisjr" "$W" "$(date +%Y%m%d)" "${DAYS:-42}"
python3 "$P/regions.py" "$W"
python3 "$P/platforms.py" "$W"
rm -f "$W/seg_cache.pkl"
python3 "$P/shapes.py" "$W" "$W/vh/config.json" "$W/src/pid/PID_GTFS.zip"
python3 "$P/packs.py" "$W" "$W/out"
if [ -z "${SKIP_BEDEKR:-}" ]; then python3 "$P/bedekr.py" "$W" "$W/out" || echo "bedekr přeskočen"; fi
echo "== kopíruji do data/"
mkdir -p "$ROOT/data/okres"
cp "$W/out/"*.json "$ROOT/data/"
cp "$W/out/okres/"*.json "$ROOT/data/okres/"
python3 "$ROOT/app/build.py"
echo "hotovo"
