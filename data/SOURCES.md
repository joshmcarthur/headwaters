# Data sources

Do not commit nationwide GeoJSON, the 476 MB REC2 geodatabase, or huge tile intermediates.

## NIWA REC2 version 5 (June 2019)

- **Version:** REC2 v5, June 2019 (also listed as Digital Network 2.5)
- **Licence:** [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)
- **Product page:** https://niwa.co.nz/freshwater/river-environment-classification-2
- **ArcGIS Hub document:** https://hub.arcgis.com/documents/5a07a0b45d504e4db4f79753663430b6
- **Local path:** `data/raw/REC2_geodata_version_5.zip` (moved from `~/Downloads` on 2026-11-23). Unzipped File Geodatabase: `data/raw/nzRec2_v5.gdb`. Both are gitignored.

### GDB inspect (2026-11-23)

| Item | On disk |
| --- | --- |
| GDB name | `nzRec2_v5.gdb` |
| Riverlines | Feature class `riverlines` (group Hydro). 593,517 lines, EPSG:2193 |
| Watersheds | `rec2ws` in group `rec2_watersheds` (not used in this MVP) |
| `NextDownID` | **Immediate next HydroID**, not a terminal reach and not `nzsegment`. Sink is `-1`. |
| Example | `nzsegment` 9263433, HydroID 263343, NextDownID 263375 (HydroID of 9263462) |
| Extent | NZTM BBOX about 1,090,043–2,089,114 E, 4,748,694–6,193,389 N (onshore North, South, Stewart) |

No `RivName` on `riverlines` or any other table in `nzRec2_v5.gdb`. Names are a separate NIWA product (below). Unnamed reaches show as “Unnamed stream”.

### Product artefacts (national, not a Hutt clip)

| File | Role |
| --- | --- |
| `web/public/data/reaches.pmtiles` | Map geometry. ~90 MB tippecanoe MVT of `riverlines` with `LID = 0`, WGS84, z4–13. Feature id / property `nzsegment`. Also `StreamOrde`. In-lake REC2 chords (`LID > 0`) stay in the graph but are not drawn. Gitignored. Publish with the graph in GitHub Release tag `data`. |
| `web/public/data/reaches.bin` | Compact graph. Magic `HWG1` v2: `nzsegment u32`, downstream `nzsegment u32` (0 = sink), `length_m f32`, then interned UTF-8 names. Reverse `up` index is built in the browser. 11,331 sinks. No unmapped `down` pointers in v5. Gitignored. Publish with the tiles in GitHub Release tag `data`. |
| `web/public/data/names.json` | Search index. One row per official name: longest connected stretch, outlet `nzsegment`, stretch length in metres, WGS84 bbox of member envelopes. Gitignored. Publish with the graph and tiles in GitHub Release tag `data`. |

Rebuild: `PYTHONPATH=pipeline/src python3 -m headwaters_pipeline.export_graph` then `bash pipeline/scripts/build_tiles.sh`.

`NextDownID` is mapped HydroID → `nzsegment` in `export_graph.py`. Unmapped pointers stay as that HydroID so a walk can raise a gap. Do not invent edges.

GeoJSON of the network is a local debug artefact only (`data/derived/`, `web/public/data/*.geojson`, gitignored). A Hutt bbox clip script remains at `pipeline/src/headwaters_pipeline/clip.py` for debugging. It is not the product extract.

Attribution: River network: NIWA River Environment Classification REC2 version 5 (June 2019). Licensed under CC BY-NC 4.0. Modified for Headwaters (reprojected, tiled, packed graph).

## Names

`RivName` is not in the REC2 v5 GDB. The join table is **NZ River Names REC2 (Table)** (NIWA, CC BY-NC 4.0). Join key: `nzsegment`.

- Hub item: https://www.arcgis.com/home/item.html?id=4f990e025490405386a2d3c438a6ae15
- Bulk CSV (one file, not a paged FeatureServer query): https://hub.arcgis.com/api/download/v1/items/4f990e025490405386a2d3c438a6ae15/csv?redirect=true&layers=0
- Local path: `data/raw/NZ_River_Names_REC2_V1.csv` (gitignored). About 12 MB, 593,548 rows, 178,251 named, 11,565 unique `RivName` values.
- Shapefile export also exists at the same Hub download API (`format=shp`). File geodatabase / GeoPackage exports for this table return 400.

Do not page the FeatureServer. Hub CSV is the archive.

`RivName` is unofficial topo naming. Gazetteer wins where we have a documented overlay. Gazette 2011-ln7607: exact `RivName` **Hutt River** becomes **Te Awa Kairangi / Hutt River**. Eastern Hutt River and Western Hutt River are unchanged. Do not invent Māori names.

Packed names live in `reaches.bin` (HWG1 v2 string table). Unnamed stays unnamed. Search uses `names.json`, rebuilt by the same `export_graph` run. One result per official name: the longest connected stretch. Shorter waterways that share a spelling are omitted. A stretch with no envelope is omitted because the map cannot fly to it.

## Not in this extract

- Watershed polygons (MVP does not paint catchments)
- Nationwide GeoJSON
- LINZ Basemaps terrain (issue 008). The 3D view reads Mapterhorn Terrarium tiles at render time from `https://tiles.mapterhorn.com/tilejson.json`. This extract does not store a DEM.
