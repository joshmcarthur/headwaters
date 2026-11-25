#!/usr/bin/env bash
# Build country PMTiles from the gitignored File Geodatabase.
# Intermediates stay in data/derived/. Output: web/public/data/{country}/reaches.pmtiles
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COUNTRY="${1:-nz}"
eval "$(PYTHONPATH="$ROOT/pipeline/src" python3 -m headwaters_pipeline.countries "$COUNTRY")"

if [[ ! -d "$GDB" ]]; then
  echo "Missing $GDB. Download the source geodatabase into data/raw/ (see README.md)." >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT")"

echo "Streaming $COUNTRY river lines to tippecanoe…"
# NZ: LID > 0 is REC2 in-lake routing. AU: AHGFFType != 1 is a connector
# or waterbody chord. Keep those reaches in reaches.bin so walks still
# cross; do not draw them.
OGR_DIALECT=()
if [[ -n "${TILE_DIALECT:-}" ]]; then
  OGR_DIALECT=(-dialect "$TILE_DIALECT")
fi
ogr2ogr -t_srs EPSG:4326 -f GeoJSONSeq /vsistdout/ \
  "${OGR_DIALECT[@]}" \
  -sql "$TILE_SQL" \
  "$GDB" \
| tippecanoe \
  --force \
  --layer=reaches \
  --minimum-zoom="$MIN_ZOOM" \
  --maximum-zoom=13 \
  --use-attribute-for-id=id \
  --attribute-type=id:int \
  --attribute-type=StreamOrde:int \
  --drop-smallest-as-needed \
  --extend-zooms-if-still-dropping \
  --no-feature-limit \
  --include=id \
  --include=StreamOrde \
  -o "$OUT"

echo "Wrote $OUT ($(du -h "$OUT" | awk '{print $1}'))"
