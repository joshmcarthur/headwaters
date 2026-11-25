"""Write a compact river graph from a country File Geodatabase.

Binary layout (little-endian), file ``reaches.bin``, magic ``HWG2``:

- 64-byte header: count, build_id, section offsets
- interned NUL-terminated names
- id index (sorted pages of id, dfs_index, hld_index, subtree_size)
- DFS records (24 bytes) then heavy-path records (24 bytes)

Also writes ``names.bin`` (HWN1): start-list hits and names grouped by folded first letter.
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
import unicodedata
import zlib
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

MAGIC = b"HWG2"
VERSION = 1
HEADER_SIZE = 64
RECORD_SIZE = 24
PAGE_SIZE = 1024
SINK_HLD = 0xFFFFFFFF
NAME_NONE = 0xFFFF
FLAG_INLAND = 1
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


HWN1_MAGIC = b"HWN1"
HWN1_HEADER = 24
PREFIX_SLOTS = 27


def _fold_name(value: str) -> str:
    nfd = unicodedata.normalize("NFD", value)
    return "".join(ch for ch in nfd if unicodedata.category(ch) != "Mn").lower()


def _prefix_index(name: str) -> int:
    ch = _fold_name(name).strip()[:1]
    if "a" <= ch <= "z":
        return ord(ch) - 97
    return 26


def _pack_hit(hit: Stretch) -> bytes:
    name = str(hit["name"]).encode("utf-8")
    bbox = hit["bbox"]
    assert isinstance(bbox, list) and len(bbox) == 4
    return struct.pack("<H", len(name)) + name + struct.pack(
        "<If4f",
        int(hit["id"]),
        float(hit["metres"]),
        float(bbox[0]),
        float(bbox[1]),
        float(bbox[2]),
        float(bbox[3]),
    )


def write_names_bin(
    path: Path,
    rivers: list[Stretch],
    start_names: tuple[str, ...],
    build_id: int,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    by_name = {str(row["name"]): row for row in rivers}
    start = [by_name[name] for name in start_names if name in by_name]
    buckets: list[list[Stretch]] = [[] for _ in range(PREFIX_SLOTS)]
    for row in rivers:
        buckets[_prefix_index(str(row["name"]))].append(row)
    start_bytes = b"".join(_pack_hit(row) for row in start)
    bucket_bytes = [b"".join(_pack_hit(row) for row in bucket) for bucket in buckets]
    prefix_dir_off = HWN1_HEADER
    start_off = prefix_dir_off + PREFIX_SLOTS * 8
    cursor = start_off + len(start_bytes)
    directory = bytearray(PREFIX_SLOTS * 8)
    for i, blob in enumerate(bucket_bytes):
        struct.pack_into("<II", directory, i * 8, cursor, len(blob))
        cursor += len(blob)
    header = struct.pack(
        "<4sHHIIII",
        HWN1_MAGIC,
        1,
        0,
        build_id,
        len(start),
        start_off,
        prefix_dir_off,
    )
    path.write_bytes(header + bytes(directory) + start_bytes + b"".join(bucket_bytes))


def write_binary(
    path: Path,
    records: list[tuple[int, int, float]],
    names: dict[int, str],
    inland: list[int] | None = None,
) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = pack_hwg2(records, names, inland)
    path.write_bytes(data)
    return int.from_bytes(data[12:16], "little")


def pack_hwg2(
    records: list[tuple[int, int, float]],
    names: dict[int, str],
    inland: list[int] | None = None,
) -> bytes:
    inland_set = {sid for sid in (inland or []) if sid}
    id_set = {sid for sid, _down, _length in records}
    by_id = {sid: (sid, down, length) for sid, down, length in records}
    children: dict[int, list[int]] = {sid: [] for sid in id_set}
    for sid, down, _length in records:
        if down and down in id_set:
            children[down].append(sid)
    for kids in children.values():
        kids.sort()

    sinks = sorted(sid for sid, down, _length in records if not down or down not in id_set)
    subtree: dict[int, int] = {}
    dfs_order: list[int] = []

    def walk(root: int) -> None:
        if root in subtree:
            return
        stack = [root]
        pre: list[int] = []
        local: set[int] = set()
        while stack:
            sid = stack.pop()
            if sid in local or sid in subtree:
                continue
            local.add(sid)
            pre.append(sid)
            kids = children.get(sid, [])
            for child in reversed(kids):
                stack.append(child)
        dfs_order.extend(pre)
        for sid in reversed(pre):
            subtree[sid] = 1 + sum(
                subtree[c] for c in children.get(sid, []) if c in subtree
            )

    for sid in sinks:
        walk(sid)
    for sid, _down, _length in records:
        if sid not in subtree:
            walk(sid)

    heavy_child: dict[int, int] = {}
    for sid in dfs_order:
        kids = [k for k in children.get(sid, []) if k in subtree and k != sid]
        if not kids:
            continue
        best = kids[0]
        best_size = subtree[best]
        for kid in kids[1:]:
            sz = subtree[kid]
            if sz > best_size or (sz == best_size and kid < best):
                best = kid
                best_size = sz
        heavy_child[sid] = best
    is_heavy = set(heavy_child.values())
    path_heads = [sid for sid in dfs_order if sid not in is_heavy]
    hld_order: list[int] = []
    path_hi: dict[int, int] = {}
    placed: set[int] = set()
    for head in path_heads:
        path: list[int] = []
        cur: int | None = head
        seen_path: set[int] = set()
        while cur is not None and cur not in seen_path and cur not in placed:
            seen_path.add(cur)
            path.append(cur)
            cur = heavy_child.get(cur)
        path.reverse()
        hld_order.extend(path)
        placed.update(path)
        hi = len(hld_order)
        for sid in path:
            path_hi[sid] = hi
    for sid in dfs_order:
        if sid in placed:
            continue
        hld_order.append(sid)
        placed.add(sid)
        path_hi[sid] = len(hld_order)

    dfs_index = {sid: i for i, sid in enumerate(dfs_order)}
    hld_index = {sid: i for i, sid in enumerate(hld_order)}

    unique: list[str] = []
    intern: dict[str, int] = {}
    for sid, _down, _length in records:
        label = names.get(sid)
        if not label:
            continue
        if label not in intern:
            intern[label] = len(unique)
            unique.append(label)
    blobs = [(s.encode("utf-8") + b"\x00") for s in unique]
    string_table = b"".join(blobs)

    count = len(records)
    page_count = max(1, (count + PAGE_SIZE - 1) // PAGE_SIZE)
    strings_off = HEADER_SIZE
    index_root_off = strings_off + len(string_table)
    index_root_len = page_count * 8
    index_pages_off = index_root_off + index_root_len
    index_pages_len = count * 16
    dfs_off = index_pages_off + index_pages_len
    hld_off = dfs_off + count * RECORD_SIZE

    hash_parts = bytearray()
    for sid, down, length in records:
        hash_parts.extend(struct.pack("<IIf", sid, down, length))
    hash_parts.extend(string_table)
    build_id = zlib.crc32(hash_parts) & 0xFFFFFFFF

    out = bytearray(hld_off + count * RECORD_SIZE)
    header = struct.pack(
        "<4sHHIIIIIIIIIIII",
        MAGIC,
        VERSION,
        0,
        count,
        build_id,
        strings_off,
        len(string_table),
        index_root_off,
        index_root_len,
        index_pages_off,
        index_pages_len,
        dfs_off,
        hld_off,
        PAGE_SIZE,
        len(unique),
    )
    out[0:56] = header
    out[strings_off : strings_off + len(string_table)] = string_table

    sorted_ids = sorted(dfs_order)
    for page in range(page_count):
        start = page * PAGE_SIZE
        if start >= len(sorted_ids):
            break
        page_off = index_pages_off + start * 16
        struct.pack_into(
            "<II",
            out,
            index_root_off + page * 8,
            sorted_ids[start],
            page_off,
        )
    for i, sid in enumerate(sorted_ids):
        struct.pack_into(
            "<IIII",
            out,
            index_pages_off + i * 16,
            sid,
            dfs_index[sid],
            hld_index[sid],
            subtree[sid],
        )

    rec_fmt = struct.Struct("<IfHHII")

    def write_rec(off: int, sid: int, extra: int, extra2: int) -> None:
        _sid, _down, length = by_id[sid]
        label = names.get(sid)
        name_idx = intern[label] if label else NAME_NONE
        flags = FLAG_INLAND if sid in inland_set else 0
        rec_fmt.pack_into(out, off, sid, length, name_idx, flags, extra, extra2)

    for i, sid in enumerate(dfs_order):
        write_rec(dfs_off + i * RECORD_SIZE, sid, subtree[sid], 0)
    for i, sid in enumerate(hld_order):
        _sid, down, _length = by_id[sid]
        parent = hld_index[down] if down and down in hld_index else SINK_HLD
        write_rec(hld_off + i * RECORD_SIZE, sid, path_hi[sid], parent)
    return bytes(out)


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
    out_names = out_dir / "names.bin"
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
    build_id = write_binary(out_bin, records, names, inland)
    write_names_bin(out_names, rivers, country.start_rivers, build_id)
    print(f"Wrote {out_bin} ({out_bin.stat().st_size} bytes, {len(records)} reaches)")
    print(f"Wrote {out_names} ({len(rivers)} named rivers)")
    print(f"Inland sinks: {len(inland)}")


if __name__ == "__main__":
    main()
