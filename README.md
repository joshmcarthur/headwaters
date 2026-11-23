# Headwaters

Ki uta ki tai: from the mountains to the sea.

A map of Aotearoa New Zealand’s rivers. Click a reach to see the pathway to the sea, the catchment that feeds it, and the longest path upstream.

River network: NIWA REC2 v5, [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/). Non-commercial use only. See `data/SOURCES.md`.

Visual identity lives in `design/Headwaters/`. The map is Astro + MapLibre. There is no PostGIS, React, or Three.js.

The map is served from a national PMTiles archive of REC2 `riverlines`, plus a compact binary graph. GeoJSON is a local debug artefact only. Do not ship nationwide GeoJSON.

## REC2 download

Do not commit the geodatabase. Place it in `data/raw/` (gitignored).

1. Download REC2 v5 from:
   - https://niwa.co.nz/freshwater/river-environment-classification-2
   - https://hub.arcgis.com/documents/5a07a0b45d504e4db4f79753663430b6
2. Save the zip as `data/raw/REC2_geodata_version_5.zip` (about 476 MB).
3. Unzip there. You should get `data/raw/nzRec2_v5.gdb`.
4. Licence: [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/).

## River names download

`nzRec2_v5.gdb` has no `RivName`. Download the NIWA names table as one CSV (same CC BY-NC 4.0):

```bash
curl -L --fail -o data/raw/NZ_River_Names_REC2_V1.csv \
  "https://hub.arcgis.com/api/download/v1/items/4f990e025490405386a2d3c438a6ae15/csv?redirect=true&layers=0"
```

Hub item: https://www.arcgis.com/home/item.html?id=4f990e025490405386a2d3c438a6ae15

Do not query the FeatureServer page by page. See `data/SOURCES.md`.

## Rebuild tiles and graph

Needs GDAL (`ogr2ogr`), [tippecanoe](https://github.com/felt/tippecanoe), and Python 3.

```bash
PYTHONPATH=pipeline/src python3 -m headwaters_pipeline.export_graph
bash pipeline/scripts/build_tiles.sh
```

Writes:

- `web/public/data/reaches.bin` — packed national graph (`nzsegment`, immediate downstream `nzsegment`, `length_m`, interned names)
- `web/public/data/reaches.pmtiles` — national MVT of `riverlines` with `LID = 0` (`nzsegment`, `StreamOrde`)

CSV and other intermediates stay in `data/derived/` (gitignored). A Hutt-only GeoJSON clip still exists as `pipeline/src/headwaters_pipeline/clip.py` for local debug. Do not serve it.

Both files are gitignored. Rebuild them locally before `npm run dev`. Do not commit them. Publish both together as GitHub Release tag `data` (see Deploy).

## Run the map

```bash
cd web
npm install
npm run dev
```

Open the URL Astro prints (usually http://localhost:4321/). The map opens on Aotearoa. Click any waterway.

## Tests

```bash
cd pipeline && python3 -m pytest tests -v
cd web && node --experimental-strip-types --test src/lib/graph.test.ts src/lib/copy.test.ts src/lib/theme.test.ts
```

## Deploy

The site is a static nginx image. GitHub Actions bakes `reaches.bin` and `reaches.pmtiles` into that image from a Release, then pushes GHCR.

### Data release

From a machine that has the rebuilt files (after the GitHub repo exists):

```bash
gh release create data \
  web/public/data/reaches.bin \
  web/public/data/reaches.pmtiles \
  --title "National river data" \
  --notes "REC2 v5 graph and PMTiles. CC BY-NC 4.0. Rebuild with export_graph then pipeline/scripts/build_tiles.sh."
```

After a graph or tile rebuild, upload both files so they stay in lockstep:

```bash
gh release upload data \
  web/public/data/reaches.bin \
  web/public/data/reaches.pmtiles \
  --clobber
```

Then re-run the **Publish image** workflow (`workflow_dispatch` or a push to `main`).

### Local image

Needs the two data files on disk:

```bash
docker compose build
docker compose up
```

### Host

```bash
docker compose pull && docker compose up -d
```

If the GHCR package is private, `docker login ghcr.io` first. TLS stays on the host reverse proxy. The container listens on port 80.
