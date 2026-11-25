# Data sources

Do not commit nationwide GeoJSON, the 476 MB REC2 geodatabase, the Geofabric zip, or huge tile intermediates.

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
| `web/public/data/nz/reaches.pmtiles` | Map geometry. ~90 MB tippecanoe MVT of `riverlines` with `LID = 0`, WGS84, z4–13. Feature id / property `id`. Also `StreamOrde`. In-lake REC2 chords (`LID > 0`) stay in the graph but are not drawn. Gitignored. Publish with the graph in GitHub Release tag `data`. |
| `web/public/data/nz/reaches.bin` | Compact graph. Magic is NUL-padded `HWG`. Interned names, sorted id index, DFS records and heavy-path records (24 bytes). The browser range-requests the tributary tree of a tap and its path to the mouth. Gitignored. Publish with the tiles in GitHub Release tag `data`. |
| `web/public/data/nz/names.bin` | Search index. Magic is NUL-padded `HWN`. Start-list hits plus names grouped by folded first letter. Gitignored. Publish with the graph and tiles in GitHub Release tag `data`. |

Rebuild: `PYTHONPATH=pipeline/src python3 -m headwaters_pipeline.export_graph --country nz` then `bash pipeline/scripts/build_tiles.sh nz`.

Export (2026-11-25): `reaches.bin` is 38,171,076 bytes (~36 MB). `names.bin` is 470,985 bytes (~460 KB).

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

Packed names live in `reaches.bin` (string table). Unnamed stays unnamed. Search uses `names.bin`, rebuilt by the same `export_graph` run. One result per official name: the longest connected stretch. Shorter waterways that share a spelling are omitted. A stretch with no envelope is omitted because the map cannot fly to it.

## Bureau of Meteorology Geofabric Surface Hydrology Network V3.3

- **Version:** National V3.3
- **Licence:** [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- **Product page:** https://www.bom.gov.au/water/geofabric/download.shtml
- **FTP file:** `ftp://ftp.bom.gov.au/anon/home/geofabric/SH_Network_GDB_V3_3.zip` (about 1.5 GB)
- **Local path:** `data/raw/SH_Network_GDB/SH_Network.gdb` (gitignored)
- **Requested credit:** © Commonwealth of Australia (Bureau of Meteorology) 2022. Modified for Headwaters (reprojected, tiled, packed graph).

### GDB inspect (2026-11-25)

| Item | On disk |
| --- | --- |
| GDB name | `SH_Network.gdb` |
| Streams | `AHGFNetworkStream`. 2,578,471 lines, GDA94 (`EPSG:4283`) |
| Segment id | `HydroID`. `NextDownID` is the next stream's `HydroID`. Sink is `-1`. |
| Length | `GeodesLen` (metres). No nulls in V3.3. |
| Names | `Name` on the stream. 573,668 reaches with a non-blank name. Almost all names are stored in capitals (`MURRAY RIVER`). Eight mixed-case exceptions. Do not title-case. |
| Draw filter | `AHGFFType = 1` (`NetworkFlowSegment`). Types 2 and 3 stay in the graph. |
| Stream order | No `StreamOrde`. Tiles write `5` for `Hierarchy = Major`, `2` for Minor, `1` otherwise. |
| Inland sinks | Terminal streams (`NextDownID` sink) whose `To_Node` is `AHGFNetworkNode` `AHGFFType = 5` and `DiffusType` is not `Coastal` or `Delta`. Murray mouth is `Delta`. |

Search still keeps one result per spelling. Many Australian creeks share a name; only the longest stretch is shown. V3.3 has 573,668 named reaches and 22,208 unique `Name` values, so the index hides 551,460 named reaches that share a spelling.

Inland sinks: 56,079 (terminus node `AHGFFType = 5`, `DiffusType` not Coastal or Delta).

Rebuild: `PYTHONPATH=pipeline/src python3 -m headwaters_pipeline.export_graph --country au` then `bash pipeline/scripts/build_tiles.sh au`.

Export (2026-11-25): about 1.8 minutes. `reaches.bin` is 165,384,630 bytes (~158 MB). `names.bin` is 898,010 bytes (~877 KB, 22,208 named rivers). The browser range-requests slices; it does not download the whole graph.

### Product artefacts

| File | Role |
| --- | --- |
| `web/public/data/au/reaches.pmtiles` | Map geometry. `AHGFFType = 1` only, WGS84, z2–13. Feature id / property `id`. Also `StreamOrde`. Gitignored. |
| `web/public/data/au/reaches.bin` | Compact graph of every `AHGFNetworkStream`. Gitignored. |
| `web/public/data/au/names.bin` | Search index. One row per Geofabric `Name`. Gitignored. |

## Not in this extract

- Watershed polygons (MVP does not paint catchments)
- Nationwide GeoJSON
- LINZ Basemaps terrain (issue 008). The 3D view reads Mapterhorn Terrarium tiles at render time from `https://tiles.mapterhorn.com/tilejson.json`. This extract does not store a DEM.
