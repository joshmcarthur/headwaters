"""Local debug clip of REC2 riverlines for Te Awa Kairangi / Hutt River.

Not the product extract. Nationwide geometry is PMTiles; topology is
``reaches.bin``. Prefers the File Geodatabase in data/raw/. Does not invent edges.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

from headwaters_pipeline.graph import GapError, build_up_index, walk_upstream

# Te Awa Kairangi / Hutt valley, NZTM2000 (EPSG:2193). Tight around Petone–Tararua.
HUTT_BBOX = (1754500.0, 5428500.0, 1780500.0, 5466500.0)
GDB_NAME = "nzRec2_v5.gdb"
LAYER = "riverlines"


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _attrs(feat: dict[str, Any]) -> dict[str, Any]:
    return feat.get("attributes") or feat.get("properties") or {}


def _length_m(a: dict[str, Any]) -> float:
    raw = a.get("Shape_Length") or a.get("Shape__Length") or a.get("Shape_Leng") or 0.0
    return float(raw)


def load_geojson_features(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text())
    return list(data.get("features") or [])


def clip_gdb_to_geojson(
    gdb: Path, out_geojson: Path, bbox: tuple[float, float, float, float] = HUTT_BBOX
) -> Path:
    xmin, ymin, xmax, ymax = bbox
    out_geojson.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ogr2ogr",
        "-f",
        "GeoJSON",
        "-t_srs",
        "EPSG:4326",
        "-spat",
        str(xmin),
        str(ymin),
        str(xmax),
        str(ymax),
        "-lco",
        "RFC7946=YES",
        str(out_geojson),
        str(gdb),
        LAYER,
    ]
    subprocess.run(cmd, check=True)
    return out_geojson


def classify_nextdown(features: list[dict[str, Any]]) -> str:
    """Return 'hydro_id' if NextDownID matches HydroID, else 'nzsegment', else 'unknown'."""
    hydro = {
        a["HydroID"]: a["nzsegment"]
        for f in features
        if (a := _attrs(f)).get("HydroID") is not None
    }
    nz = {a["nzsegment"] for f in features if (a := _attrs(f)).get("nzsegment") is not None}
    hits_hydro = 0
    hits_nz = 0
    samples = 0
    for feat in features:
        a = _attrs(feat)
        down = a.get("NextDownID")
        if down in (None, 0, -1):
            continue
        samples += 1
        if down in hydro:
            hits_hydro += 1
        if down in nz:
            hits_nz += 1
        if samples >= 40:
            break
    if samples == 0:
        return "unknown"
    if hits_hydro >= hits_nz and hits_hydro > samples * 0.5:
        return "hydro_id"
    if hits_nz > samples * 0.5:
        return "nzsegment"
    return "unknown"


def features_to_graph(features: list[dict[str, Any]], pointer: str) -> dict[str, dict[str, Any]]:
    hydro_to_nz = {}
    for feat in features:
        a = _attrs(feat)
        if a.get("HydroID") is not None and a.get("nzsegment") is not None:
            hydro_to_nz[a["HydroID"]] = a["nzsegment"]

    graph: dict[str, dict[str, Any]] = {}
    for feat in features:
        a = _attrs(feat)
        nz = a.get("nzsegment")
        if nz is None:
            continue
        raw_down = a.get("NextDownID")
        down: int | None
        if raw_down in (None, 0, -1):
            down = 0
        elif pointer == "hydro_id":
            mapped = hydro_to_nz.get(raw_down, raw_down)
            down = int(mapped) if mapped is not None else 0
        else:
            down = int(raw_down)
        graph[str(nz)] = {
            "down": 0 if down in (None, 0, -1) else int(down),
            "length_m": _length_m(a),
            "catarea_m2": a.get("CATAREA"),
            "cum_area_m2": a.get("CUM_AREA"),
            "up_elev_m": a.get("upElev"),
            "down_elev_m": a.get("downElev"),
            "stream_order": a.get("StreamOrde"),
            "headwater": a.get("Headwater") == 0,
            "hydro_id": a.get("HydroID"),
            "riv_name": None,
            "official_name": None,
            "source": "rec2_v5",
        }
    return graph


def coerce_down_keys(graph: dict[str, dict[str, Any]]) -> None:
    for seg in graph.values():
        down = seg["down"]
        if down in (0, None):
            continue
        if str(down) not in graph:
            seg["down"] = 0
        else:
            seg["down"] = str(down)


def pick_hutt_outlet(graph: dict[str, dict[str, Any]]) -> str:
    """Largest CUM_AREA among segments whose next reach is missing or a sink."""
    best_id = None
    best_area = -1.0
    for sid, seg in graph.items():
        down = seg["down"]
        if down in (0, None) or str(down) not in graph:
            area = seg.get("cum_area_m2") or 0.0
            if area > best_area:
                best_area = float(area)
                best_id = sid
    if best_id is None:
        raise RuntimeError("No outlet candidate in the Hutt extract")
    return best_id


def clip_to_outlet(graph: dict[str, dict[str, Any]], outlet: str) -> dict[str, dict[str, Any]]:
    ids = {str(i) for i in walk_upstream(graph, outlet)}
    clipped = {sid: dict(seg) for sid, seg in graph.items() if sid in ids}
    for seg in clipped.values():
        down = seg["down"]
        if down not in (0, None) and str(down) not in clipped:
            seg["down"] = 0
    return clipped


def features_to_geojson(
    features: list[dict[str, Any]], graph: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    keep = set(graph)
    out_features = []
    for feat in features:
        a = _attrs(feat)
        nz = a.get("nzsegment")
        if nz is None or str(nz) not in keep:
            continue
        geom = feat.get("geometry") or {}
        if geom.get("type") in ("LineString", "MultiLineString"):
            geometry = geom
        else:
            paths = geom.get("paths") or []
            if not paths:
                continue
            if len(paths) == 1:
                geometry = {"type": "LineString", "coordinates": paths[0]}
            else:
                geometry = {"type": "MultiLineString", "coordinates": paths}
        sid = str(nz)
        out_features.append(
            {
                "type": "Feature",
                "id": int(nz),
                "properties": {
                    "nzsegment": int(nz),
                    "length_m": graph[sid]["length_m"],
                    "stream_order": graph[sid].get("stream_order"),
                    "official_name": graph[sid].get("official_name"),
                },
                "geometry": geometry,
            }
        )
    return {"type": "FeatureCollection", "features": out_features}


def apply_hutt_name(graph: dict[str, dict[str, Any]], outlet: str) -> None:
    """Gazette 2011-ln7607 dual name on the high-area main stem only."""
    official = "Te Awa Kairangi / Hutt River"
    outlet_area = float(graph[outlet].get("cum_area_m2") or 0)
    if outlet_area <= 0:
        return
    up = build_up_index(graph)
    current = outlet
    seen: set[str] = set()
    while current not in seen:
        seen.add(current)
        graph[current]["official_name"] = official
        children = up.get(current, [])
        if not children:
            break
        child = max(children, key=lambda c: float(graph[c].get("cum_area_m2") or 0))
        child_area = float(graph[child].get("cum_area_m2") or 0)
        if child_area < 0.15 * outlet_area:
            break
        current = str(child)


def write_extract(
    out_dir: Path,
    features: list[dict[str, Any]],
    graph: dict[str, dict[str, Any]],
    outlet: str,
    pointer: str,
) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": 1,
        "crs": "EPSG:4326",
        "outlet_nzsegment": int(outlet),
        "sink_nextdownid": 0,
        "pointer": pointer,
        "segments": {
            sid: {
                "down": 0 if seg["down"] in (0, None) else int(seg["down"]),
                "up": [],
                "length_m": seg["length_m"],
                "catarea_m2": seg.get("catarea_m2"),
                "cum_area_m2": seg.get("cum_area_m2"),
                "up_elev_m": seg.get("up_elev_m"),
                "down_elev_m": seg.get("down_elev_m"),
                "headwater": bool(seg.get("headwater")),
                "riv_name": seg.get("riv_name"),
                "official_name": seg.get("official_name"),
                "source": "rec2_v5",
            }
            for sid, seg in graph.items()
        },
    }
    up = build_up_index(graph)
    for sid, parents in up.items():
        if sid in payload["segments"]:
            payload["segments"][sid]["up"] = [int(p) for p in parents]
    (out_dir / "hutt-graph.json").write_text(json.dumps(payload))
    geo = features_to_geojson(features, graph)
    (out_dir / "hutt-reaches.geojson").write_text(json.dumps(geo))


def main() -> None:
    root = repo_root()
    gdb = root / "data" / "raw" / GDB_NAME
    derived = root / "data" / "derived" / "hutt_bbox.geojson"
    out_dir = root / "web" / "public" / "data"
    if not gdb.exists():
        raise SystemExit(
            f"Missing {gdb}. Download REC2 v5 into data/raw/ (see README.md)."
        )
    print(f"Clipping {gdb} riverlines to the Hutt bbox…")
    clip_gdb_to_geojson(gdb, derived)
    features = load_geojson_features(derived)
    print(f"Bbox features: {len(features)}")
    pointer = classify_nextdown(features)
    print(f"NextDownID points at: {pointer}")
    if pointer == "unknown":
        raise RuntimeError("Cannot classify NextDownID; refusing to invent edges")
    graph = features_to_graph(features, pointer)
    coerce_down_keys(graph)
    outlet = pick_hutt_outlet(graph)
    print(f"Outlet nzsegment={outlet} cum_area_m2={graph[outlet].get('cum_area_m2')}")
    clipped = clip_to_outlet(graph, outlet)
    try:
        build_up_index(clipped)
    except GapError as exc:
        raise RuntimeError(f"Gap in clipped graph: {exc}") from exc
    apply_hutt_name(clipped, outlet)
    write_extract(out_dir, features, clipped, outlet, pointer)
    print(f"Wrote {out_dir / 'hutt-graph.json'} ({len(clipped)} segments)")


if __name__ == "__main__":
    main()
