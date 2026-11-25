# Headwaters

Ki uta ki tai: from the mountains to the sea.

A map of Aotearoa New Zealand’s and Australia’s rivers. Click a reach to see the pathway to the sea, the catchment that feeds it, and the longest path upstream.

New Zealand river network: NIWA REC2 v5, [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/). Non-commercial use only. Australia river network: Bureau of Meteorology Geofabric Surface Hydrology Network V3.3, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). See `data/SOURCES.md`.

Visual identity lives in `design/Headwaters/`. The map is Astro + MapLibre. There is no PostGIS, React, or Three.js.

The map is served from a PMTiles archive and compact binary graph per country. GeoJSON is a local debug artefact only. Do not ship nationwide GeoJSON.

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

## Geofabric download

Do not commit the geodatabase. Place it in `data/raw/` (gitignored).

1. Product page: https://www.bom.gov.au/water/geofabric/download.shtml
2. Download Surface Hydrology Network V3.3:

```bash
curl -L --fail -o data/raw/SH_Network_GDB_V3_3.zip \
  ftp://ftp.bom.gov.au/anon/home/geofabric/SH_Network_GDB_V3_3.zip
unzip -n data/raw/SH_Network_GDB_V3_3.zip -d data/raw
```

You should get `data/raw/SH_Network_GDB/SH_Network.gdb`. Licence: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## Rebuild tiles and graph

Needs GDAL (`ogr2ogr`), [tippecanoe](https://github.com/felt/tippecanoe), and Python 3.

```bash
PYTHONPATH=pipeline/src python3 -m headwaters_pipeline.export_graph --country nz
bash pipeline/scripts/build_tiles.sh nz
PYTHONPATH=pipeline/src python3 -m headwaters_pipeline.export_graph --country au
bash pipeline/scripts/build_tiles.sh au
```

Writes:

- `web/public/data/{nz,au}/reaches.bin` — packed graph (`id`, immediate downstream id, `length_m`, interned names, inland sinks)
- `web/public/data/{nz,au}/reaches.pmtiles` — MVT of drawn reaches (feature id / property `id`, plus `StreamOrde`)
- `web/public/data/{nz,au}/names.json` — search index (one official name, longest stretch, outlet, bbox)

CSV and other intermediates stay in `data/derived/` (gitignored). A Hutt-only GeoJSON clip still exists as `pipeline/src/headwaters_pipeline/clip.py` for local debug. Do not serve it.

These files are gitignored. Rebuild them locally before `npm run dev`. Do not commit them. Publish the graph, tiles, and name index together as GitHub Release tag `data` (see Deploy).

## Run the map

```bash
cd web
npm install
npm run dev
```

Open the URL Astro prints (usually http://localhost:4321/). The map opens on Aotearoa. Click any waterway, or search for one by name.

The header country control is off unless `PUBLIC_COUNTRIES` includes more than one country. Default is `nz`. To show Australia as well:

```bash
PUBLIC_COUNTRIES=nz,au npm run dev
```

## Tests

GitHub Actions runs these on pull requests and on pushes to `main`.

```bash
cd pipeline && python3 -m pytest tests -v
cd web && npm test
```

## Deploy

The site is a static nginx image. GitHub Actions bakes the New Zealand graph, tiles, and name index into that image from a Release, then pushes GHCR. Australia files on that Release are optional until `PUBLIC_COUNTRIES` includes `au`.

### Data release

From a machine that has the rebuilt files (after the GitHub repo exists):

```bash
gh release create data \
  web/public/data/nz/reaches.bin#nz-reaches.bin \
  web/public/data/nz/reaches.pmtiles#nz-reaches.pmtiles \
  web/public/data/nz/names.json#nz-names.json \
  web/public/data/au/reaches.bin#au-reaches.bin \
  web/public/data/au/reaches.pmtiles#au-reaches.pmtiles \
  web/public/data/au/names.json#au-names.json \
  --title "River data" \
  --notes "NZ REC2 v5 and AU Geofabric V3.3 graph, PMTiles, and name index. Rebuild with export_graph --country then pipeline/scripts/build_tiles.sh."
```

After a graph or tile rebuild, upload both files so they stay in lockstep:

```bash
gh release upload data \
  web/public/data/nz/reaches.bin#nz-reaches.bin \
  web/public/data/nz/reaches.pmtiles#nz-reaches.pmtiles \
  web/public/data/nz/names.json#nz-names.json \
  web/public/data/au/reaches.bin#au-reaches.bin \
  web/public/data/au/reaches.pmtiles#au-reaches.pmtiles \
  web/public/data/au/names.json#au-names.json \
  --clobber
```

Then re-run the **Publish image** workflow (`workflow_dispatch` or a push to `main`).

### Local image

Needs the graph, tiles, and name index on disk:

```bash
docker compose build
docker compose up
```

### Host

```bash
docker compose pull && docker compose up -d
```

If the GHCR package is private, `docker login ghcr.io` first. TLS stays on the host reverse proxy. The container listens on port 80.
