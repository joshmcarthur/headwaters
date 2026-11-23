#!/usr/bin/env bash
# Build national REC2 PMTiles from the gitignored File Geodatabase.
# Intermediates stay in data/derived/. Output: web/public/data/reaches.pmtiles
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
GDB="$ROOT/data/raw/nzRec2_v5.gdb"
DERIVED="$ROOT/data/derived"
OUT="$ROOT/web/public/data/reaches.pmtiles"

if [[ ! -d "$GDB" ]]; then
  echo "Missing $GDB. Download REC2 v5 into data/raw/ (see README.md)." >&2
  exit 1
fi

mkdir -p "$DERIVED" "$(dirname "$OUT")"

echo "Streaming riverlines to tippecanoe…"
# LID > 0 is REC2 in-lake routing: straight DEM chords that fill lakes
# (Taupō, hydro ponds) as a hatch of parallel "rivers". Keep those
# reaches in reaches.bin so walks still cross the lake; do not draw them.
ogr2ogr -t_srs EPSG:4326 -f GeoJSONSeq /vsistdout/ \
  -where "LID = 0" \
  -select nzsegment,StreamOrde \
  "$GDB" riverlines \
| tippecanoe \
  --force \
  --layer=reaches \
  --minimum-zoom=4 \
  --maximum-zoom=13 \
  --use-attribute-for-id=nzsegment \
  --attribute-type=nzsegment:int \
  --attribute-type=StreamOrde:int \
  --drop-smallest-as-needed \
  --extend-zooms-if-still-dropping \
  --no-feature-limit \
  --include=nzsegment \
  --include=StreamOrde \
  -o "$OUT"

echo "Wrote $OUT ($(du -h "$OUT" | awk '{print $1}'))"
