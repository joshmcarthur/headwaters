"""Write a compact river graph from a country File Geodatabase.

Binary layout (little-endian), file ``reaches.bin``:

- magic ``HWG1`` (4 bytes)
- version ``u16`` = 3
- flags ``u16`` = 0
- count ``u32``
- ``count`` records of ``id u32``, ``down_id u32`` (0 = sink), ``length_m f32``
- named_count ``u32``
- string_bytes ``u32``
- ``named_count`` of ``id u32``, ``str_offset u32``
- UTF-8 names, interned, null-terminated
- inland_count ``u32``
- ``inland_count`` of sink ``id u32``

Also writes ``names.json``: one object per official name with the
downstream id of the longest connected stretch, stretch length
in metres, and a WGS84 bbox of member envelopes.

``NextDownID`` is the immediate next HydroID. New Zealand maps that to
``nzsegment``. Australia uses HydroID as the graph id. Unmapped pointers
are stored as that HydroID so the walker can raise a gap instead of
inventing an edge.

New Zealand names come from the NIWA ``NZ River Names REC2 (Table)`` bulk
CSV, joined on ``nzsegment``. Gazetteer dual names overlay exact
``RivName`` matches only. Australia names come from the Geofabric ``Name``
field.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import struct
import subprocess
import sys
from pathlib import Path

_csv_limit = sys.maxsize
while True:
    try:
        csv.field_size_limit(_csv_limit)
        break
    except OverflowError:
        _csv_limit //= 10

from headwaters_pipeline.countries import (
    Country,
    derived_csv_path,
    gdb_path,
    get_country,
    names_csv_path,
    output_dir,
    repo_root,
)

MAGIC = b"HWG1"
VERSION = 3
U32_MAX = 2**32 - 1

# Exact RivName only. Eastern/Western Hutt River are unchanged (Gazette 2011-ln7607).
GAZETTEER_BY_RIVNAME = {
    "Hutt River": "Te Awa Kairangi / Hutt River",
}

WKT_NUMBER = re.compile(r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?")
BBox = tuple[float, float, float, float]
Stretch = dict[str, object]


def _select_fields(country: Country) -> str:
    fields = [
        country.id_field,
        country.hydro_field,
        country.down_field,
        country.length_field,
    ]
    if country.gdb_name_field:
        fields.append(country.gdb_name_field)
    unique: list[str] = []
    for field in fields:
        if field not in unique:
            unique.append(field)
    return ",".join(unique)


def export_csv(gdb: Path, csv_path: Path, country: Country) -> None:
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ogr2ogr",
        "-f",
        "CSV",
        str(csv_path),
        str(gdb),
        country.layer,
        "-select",
        _select_fields(country),
        "-lco",
        "SEPARATOR=COMMA",
    ]
    subprocess.run(cmd, check=True)


def _field(rec: dict[str, str], *names: str) -> str:
    for name in names:
        value = rec.get(name)
        if value is not None:
            return value
        lower = name.lower()
        for key, raw in rec.items():
            if key.lower() == lower:
                return raw
    return ""


def _optional_float(value: str) -> float | None:
    text = value.strip()
    if text == "":
        return None
    return float(text)


def load_rows(
    csv_path: Path,
    country: Country,
) -> list[tuple[int, int, int, float | None]]:
    rows: list[tuple[int, int, int, float | None]] = []
    with csv_path.open(newline="") as fh:
        reader = csv.DictReader(fh)
        for rec in reader:
            raw_id = _field(rec, country.id_field)
            if raw_id == "":
                continue
            hydro = _field(rec, country.hydro_field) or "0"
            down = _field(rec, country.down_field) or "0"
            length = _optional_float(_field(rec, country.length_field))
            rows.append((int(float(raw_id)), int(float(hydro)), int(float(down)), length))
    return rows


def validate_ids(rows: list[tuple[int, int, int, float | None]]) -> None:
    seen: set[int] = set()
    for sid, _hydro, _down, _length in rows:
        if sid < 0 or sid > U32_MAX:
            raise SystemExit(f"Segment id {sid} does not fit in u32")
        if sid in seen:
            raise SystemExit(f"Duplicate segment id {sid}")
        seen.add(sid)


def apply_length_fallbacks(
    rows: list[tuple[int, int, int, float | None]],
    fallbacks: dict[int, float],
) -> list[tuple[int, int, int, float]]:
    out: list[tuple[int, int, int, float]] = []
    missing: list[int] = []
    used = 0
    for sid, hydro, down, length in rows:
        if length is not None:
            out.append((sid, hydro, down, length))
            continue
        fallback = fallbacks.get(sid)
        if fallback is None:
            missing.append(sid)
            continue
        used += 1
        out.append((sid, hydro, down, fallback))
    if missing:
        sample = ", ".join(str(sid) for sid in missing[:8])
        raise SystemExit(f"No length for {len(missing)} reaches (e.g. {sample})")
    if used:
        print(f"Length fallback used on {used} reaches")
    return out


def records_from_rows(rows: list[tuple[int, int, int, float]]) -> list[tuple[int, int, float]]:
    hydro_to_nz = {hydro: nz for nz, hydro, _down, _length in rows if hydro}
    out: list[tuple[int, int, float]] = []
    for nz, _hydro, raw_down, length in rows:
        if raw_down in (0, -1):
            down = 0
        elif raw_down in hydro_to_nz:
            down = hydro_to_nz[raw_down]
        else:
            # Keep the foreign id so a walk can report a gap.
            down = raw_down
        out.append((nz, down, length))
    out.sort(key=lambda r: r[0])
    return out


def official_name(riv_name: str) -> str:
    """Gazetteer overlay for documented dual names. Do not invent Māori names."""
    key = riv_name.strip()
    return GAZETTEER_BY_RIVNAME.get(key, key)


def load_names_from_export(csv_path: Path, country: Country) -> dict[int, str]:
    if country.gdb_name_field is None:
        return {}
    names: dict[int, str] = {}
    with csv_path.open(newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        for rec in reader:
            raw_id = _field(rec, country.id_field)
            label = _field(rec, country.gdb_name_field).strip()
            if raw_id == "" or not label:
                continue
            names[int(float(raw_id))] = label
    return names


def load_length_fallbacks(gdb: Path, country: Country) -> dict[int, float]:
    if country.length_fallback_srs is None:
        return {}
    sql = (
        f"SELECT {country.id_field} AS id, ST_Length(geometry) AS length_m "
        f"FROM {country.layer} WHERE {country.length_field} IS NULL"
    )
    cmd = [
        "ogr2ogr",
        "-t_srs",
        country.length_fallback_srs,
        "-dialect",
        "SQLITE",
        "-f",
        "CSV",
        "/vsistdout/",
        str(gdb),
        "-sql",
        sql,
        "-lco",
        "SEPARATOR=COMMA",
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, text=True)
    assert proc.stdout is not None
    fallbacks: dict[int, float] = {}
    reader = csv.DictReader(proc.stdout)
    for rec in reader:
        raw_id = _field(rec, "id", country.id_field)
        length = _optional_float(_field(rec, "length_m"))
        if raw_id == "" or length is None:
            continue
        fallbacks[int(float(raw_id))] = length
    code = proc.wait()
    if code != 0:
        raise RuntimeError(f"ogr2ogr length fallback failed with exit {code}")
    return fallbacks


COASTAL_DIFFUS = frozenset({"Coastal", "Delta"})


def inland_stream_ids(
    sinks: list[tuple[int, int]],
    terminus_nodes: list[tuple[int, str]],
) -> list[int]:
    inland_nodes = {
        node_id
        for node_id, diffus in terminus_nodes
        if (diffus or "").strip() not in COASTAL_DIFFUS
    }
    return [sid for sid, to_node in sinks if to_node in inland_nodes]


def _ogr_csv(
    gdb: Path,
    layer: str,
    select: str,
    where: str | None = None,
) -> list[dict[str, str]]:
    cmd = [
        "ogr2ogr",
        "-f",
        "CSV",
        "/vsistdout/",
        str(gdb),
        layer,
        "-select",
        select,
        "-lco",
        "SEPARATOR=COMMA",
    ]
    if where:
        cmd.extend(["-where", where])
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, text=True)
    assert proc.stdout is not None
    rows = list(csv.DictReader(proc.stdout))
    code = proc.wait()
    if code != 0:
        raise RuntimeError(f"ogr2ogr {layer} failed with exit {code}")
    return rows


def load_inland_ids(gdb: Path, country: Country) -> list[int]:
    if country.inland_layer is None:
        return []
    node_rows = _ogr_csv(
        gdb,
        country.inland_layer,
        "HydroID,DiffusType",
        where="AHGFFType = 5",
    )
    terminus = [
        (int(float(_field(rec, "HydroID"))), _field(rec, "DiffusType"))
        for rec in node_rows
        if _field(rec, "HydroID")
    ]
    sink_rows = _ogr_csv(
        gdb,
        country.layer,
        f"{country.id_field},To_Node",
        where="NextDownID IS NULL OR NextDownID IN (0,-1)",
    )
    sinks = [
        (int(float(_field(rec, country.id_field))), int(float(_field(rec, "To_Node") or "0")))
        for rec in sink_rows
        if _field(rec, country.id_field)
    ]
    return inland_stream_ids(sinks, terminus)


def load_names(csv_path: Path) -> dict[int, str]:
    names: dict[int, str] = {}
    with csv_path.open(newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        for rec in reader:
            raw_id = rec.get("nzsegment")
            raw_name = rec.get("RivName") or rec.get("rivname") or ""
            if raw_id is None or raw_id == "":
                continue
            label = official_name(raw_name)
            if not label:
                continue
            names[int(float(raw_id))] = label
    return names


def envelope_from_wkt(wkt: str) -> BBox | None:
    nums = [float(part) for part in WKT_NUMBER.findall(wkt)]
    if len(nums) < 2:
        return None
    lons = nums[0::2]
    lats = nums[1::2]
    if len(lons) != len(lats) or not lons:
        return None
    return (min(lons), min(lats), max(lons), max(lats))


def union_bbox(left: BBox | None, right: BBox | None) -> BBox | None:
    if left is None:
        return right
    if right is None:
        return left
    return (
        min(left[0], right[0]),
        min(left[1], right[1]),
        max(left[2], right[2]),
        max(left[3], right[3]),
    )


def envelope_from_record(rec: dict[str, str]) -> BBox | None:
    try:
        minx = float(_field(rec, "minx"))
        miny = float(_field(rec, "miny"))
        maxx = float(_field(rec, "maxx"))
        maxy = float(_field(rec, "maxy"))
    except ValueError:
        wkt = (
            rec.get("WKT")
            or rec.get("wkt")
            or rec.get("Shape")
            or rec.get("SHAPE")
            or rec.get("geometry")
            or ""
        )
        return envelope_from_wkt(wkt)
    return (minx, miny, maxx, maxy)


def load_envelopes(
    gdb: Path, country: Country, named: set[int] | None = None
) -> dict[int, BBox]:
    where = f" WHERE {country.envelope_where}" if country.envelope_where else ""
    sql = (
        f"SELECT id, ST_MinX(g) AS minx, ST_MinY(g) AS miny, "
        f"ST_MaxX(g) AS maxx, ST_MaxY(g) AS maxy FROM ("
        f"SELECT {country.id_field} AS id, ST_Transform(Shape, 4326) AS g "
        f"FROM {country.layer}{where})"
    )
    cmd = [
        "ogr2ogr",
        "-f",
        "CSV",
        "/vsistdout/",
        "-dialect",
        "SQLITE",
        "-sql",
        sql,
        "-lco",
        "SEPARATOR=COMMA",
        str(gdb),
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, text=True)
    assert proc.stdout is not None
    envelopes: dict[int, BBox] = {}
    reader = csv.DictReader(proc.stdout)
    for rec in reader:
        raw_id = _field(rec, "id", country.id_field)
        if raw_id == "":
            continue
        bbox = envelope_from_record(rec)
        if bbox is None:
            continue
        sid = int(float(raw_id))
        if named is not None and sid not in named:
            continue
        envelopes[sid] = bbox
    code = proc.wait()
    if code != 0:
        raise RuntimeError(f"ogr2ogr envelopes failed with exit {code}")
    return envelopes


def longest_stretches(
    records: list[tuple[int, int, float]],
    names: dict[int, str],
    envelopes: dict[int, BBox],
) -> list[Stretch]:
    down = {nz: nxt for nz, nxt, _length in records}
    length_of = {nz: length for nz, _nxt, length in records}
    outlet_of: dict[int, int] = {}

    def stretch_outlet(start: int) -> int:
        cached = outlet_of.get(start)
        if cached is not None:
            return cached
        label = names[start]
        current = start
        path: list[int] = []
        seen: set[int] = set()
        while current not in seen:
            seen.add(current)
            path.append(current)
            nxt = down.get(current, 0)
            if nxt == 0 or names.get(nxt) != label:
                for node in path:
                    outlet_of[node] = current
                return current
            current = nxt
        for node in path:
            outlet_of[node] = current
        return current

    groups: dict[tuple[str, int], tuple[float, BBox | None]] = {}
    for nz, label in names.items():
        if nz not in length_of:
            continue
        outlet = stretch_outlet(nz)
        key = (label, outlet)
        metres, bbox = groups.get(key, (0.0, None))
        groups[key] = (metres + length_of[nz], union_bbox(bbox, envelopes.get(nz)))

    best: dict[str, tuple[int, float, BBox | None]] = {}
    for (label, outlet), (metres, bbox) in groups.items():
        prev = best.get(label)
        if prev is None:
            better = True
        else:
            prev_id, prev_metres, _prev_bbox = prev
            better = metres > prev_metres or (metres == prev_metres and outlet < prev_id)
        if better:
            best[label] = (outlet, metres, bbox)

    rivers: list[Stretch] = []
    for label, (outlet, metres, bbox) in best.items():
        if bbox is None:
            continue
        rivers.append(
            {
                "name": label,
                "id": outlet,
                "metres": metres,
                "bbox": [bbox[0], bbox[1], bbox[2], bbox[3]],
            }
        )
    return sorted(rivers, key=lambda row: (str(row["name"]), int(row["id"])))


def write_names_json(path: Path, rivers: list[Stretch]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        json.dump(rivers, fh, ensure_ascii=False, separators=(",", ":"))


def write_binary(
    path: Path,
    records: list[tuple[int, int, float]],
    names: dict[int, str],
    inland: list[int] | None = None,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    unique: list[str] = []
    intern: dict[str, int] = {}
    named: list[tuple[int, str]] = []
    for nz, _down, _length in records:
        label = names.get(nz)
        if not label:
            continue
        named.append((nz, label))
        if label not in intern:
            intern[label] = len(unique)
            unique.append(label)

    blobs = [(s.encode("utf-8") + b"\x00") for s in unique]
    offsets: list[int] = []
    cursor = 0
    for blob in blobs:
        offsets.append(cursor)
        cursor += len(blob)
    string_table = b"".join(blobs)

    header = struct.pack("<4sHHI", MAGIC, VERSION, 0, len(records))
    rec_fmt = struct.Struct("<IIf")
    name_hdr = struct.pack("<II", len(named), len(string_table))
    entry_fmt = struct.Struct("<II")
    with path.open("wb") as fh:
        fh.write(header)
        for nz, down, length in records:
            fh.write(rec_fmt.pack(nz, down, length))
        fh.write(name_hdr)
        for nz, label in named:
            fh.write(entry_fmt.pack(nz, offsets[intern[label]]))
        fh.write(string_table)
        inland_ids = sorted({sid for sid in (inland or []) if sid})
        fh.write(struct.pack("<I", len(inland_ids)))
        for sid in inland_ids:
            fh.write(struct.pack("<I", sid))


def main() -> None:
    parser = argparse.ArgumentParser(description="Write packed river graph and name index.")
    parser.add_argument("--country", default="nz")
    args = parser.parse_args()
    country = get_country(args.country)
    root = repo_root()
    gdb = gdb_path(country, root)
    names_csv = names_csv_path(country, root)
    csv_path = derived_csv_path(country, root)
    out_dir = output_dir(country, root)
    out_bin = out_dir / "reaches.bin"
    out_names = out_dir / "names.json"
    if not gdb.exists():
        raise SystemExit(f"Missing {gdb}. See README.md.")
    if names_csv is not None and not names_csv.exists():
        raise SystemExit(
            f"Missing {names_csv}. Download the NIWA river-names CSV into data/raw/. See README.md."
        )
    print(f"Exporting attributes from {gdb}…")
    export_csv(gdb, csv_path, country)
    rows = load_rows(csv_path, country)
    print(f"Rows: {len(rows)}")
    validate_ids(rows)
    missing_lengths = any(length is None for _sid, _hydro, _down, length in rows)
    fallbacks = load_length_fallbacks(gdb, country) if missing_lengths else {}
    filled = apply_length_fallbacks(rows, fallbacks)
    records = records_from_rows(filled)
    if names_csv is not None:
        names = load_names(names_csv)
    else:
        names = load_names_from_export(csv_path, country)
    print(f"Named reaches: {len(names)}")
    inland = load_inland_ids(gdb, country)
    print("Reading reach envelopes…")
    envelopes = load_envelopes(gdb, country, set(names))
    rivers = longest_stretches(records, names, envelopes)
    write_binary(out_bin, records, names, inland)
    write_names_json(out_names, rivers)
    print(f"Wrote {out_bin} ({out_bin.stat().st_size} bytes, {len(records)} reaches)")
    print(f"Wrote {out_names} ({len(rivers)} named rivers)")
    print(f"Inland sinks: {len(inland)}")


if __name__ == "__main__":
    main()
