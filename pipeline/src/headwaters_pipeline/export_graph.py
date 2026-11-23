"""Write a compact national REC2 graph from the File Geodatabase.

Binary layout (little-endian), file ``reaches.bin``:

- magic ``HWG1`` (4 bytes)
- version ``u16`` = 2
- flags ``u16`` = 0
- count ``u32``
- ``count`` records of ``nzsegment u32``, ``down_nzsegment u32`` (0 = sink), ``length_m f32``
- named_count ``u32``
- string_bytes ``u32``
- ``named_count`` of ``nzsegment u32``, ``str_offset u32``
- UTF-8 names, interned, null-terminated

Also writes ``names.json``: one object per official name with the
downstream ``nzsegment`` of the longest connected stretch, stretch length
in metres, and a WGS84 bbox of member envelopes.

``NextDownID`` is the immediate next HydroID. This maps it to ``nzsegment``.
Unmapped pointers are stored as that HydroID so the walker can raise a gap
instead of inventing an edge.

Names come from the NIWA ``NZ River Names REC2 (Table)`` bulk CSV, joined on
``nzsegment``. Gazetteer dual names overlay exact ``RivName`` matches only.
"""

from __future__ import annotations

import csv
import json
import re
import struct
import subprocess
from pathlib import Path

GDB_NAME = "nzRec2_v5.gdb"
LAYER = "riverlines"
NAMES_CSV = "NZ_River_Names_REC2_V1.csv"
MAGIC = b"HWG1"
VERSION = 2

# Exact RivName only. Eastern/Western Hutt River are unchanged (Gazette 2011-ln7607).
GAZETTEER_BY_RIVNAME = {
    "Hutt River": "Te Awa Kairangi / Hutt River",
}

WKT_NUMBER = re.compile(r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?")
BBox = tuple[float, float, float, float]
Stretch = dict[str, object]


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def export_csv(gdb: Path, csv_path: Path) -> None:
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ogr2ogr",
        "-f",
        "CSV",
        str(csv_path),
        str(gdb),
        LAYER,
        "-select",
        "nzsegment,HydroID,NextDownID,Shape_Length",
        "-lco",
        "SEPARATOR=COMMA",
    ]
    subprocess.run(cmd, check=True)


def load_rows(csv_path: Path) -> list[tuple[int, int, int, float]]:
    rows: list[tuple[int, int, int, float]] = []
    with csv_path.open(newline="") as fh:
        reader = csv.DictReader(fh)
        for rec in reader:
            nz = rec.get("nzsegment")
            if nz is None or nz == "":
                continue
            hydro = rec.get("HydroID") or "0"
            down = rec.get("NextDownID") or "0"
            length = rec.get("Shape_Length") or "0"
            rows.append((int(float(nz)), int(float(hydro)), int(float(down)), float(length)))
    return rows


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


def load_envelopes(gdb: Path) -> dict[int, BBox]:
    cmd = [
        "ogr2ogr",
        "-t_srs",
        "EPSG:4326",
        "-f",
        "CSV",
        "/vsistdout/",
        str(gdb),
        LAYER,
        "-select",
        "nzsegment",
        "-lco",
        "GEOMETRY=AS_WKT",
        "-lco",
        "SEPARATOR=COMMA",
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, text=True)
    assert proc.stdout is not None
    envelopes: dict[int, BBox] = {}
    reader = csv.DictReader(proc.stdout)
    for rec in reader:
        raw_id = rec.get("nzsegment")
        if raw_id is None or raw_id == "":
            continue
        wkt = (
            rec.get("WKT")
            or rec.get("wkt")
            or rec.get("Shape")
            or rec.get("SHAPE")
            or rec.get("geometry")
            or ""
        )
        bbox = envelope_from_wkt(wkt)
        if bbox is None:
            continue
        envelopes[int(float(raw_id))] = bbox
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


def main() -> None:
    root = repo_root()
    gdb = root / "data" / "raw" / GDB_NAME
    names_csv = root / "data" / "raw" / NAMES_CSV
    derived = root / "data" / "derived"
    csv_path = derived / "riverlines.csv"
    out_bin = root / "web" / "public" / "data" / "reaches.bin"
    out_names = root / "web" / "public" / "data" / "names.json"
    if not gdb.exists():
        raise SystemExit(f"Missing {gdb}. See README.md.")
    if not names_csv.exists():
        raise SystemExit(
            f"Missing {names_csv}. Download the NIWA river-names CSV into data/raw/. See README.md."
        )
    print(f"Exporting attributes from {gdb}…")
    export_csv(gdb, csv_path)
    rows = load_rows(csv_path)
    print(f"Rows: {len(rows)}")
    records = records_from_rows(rows)
    names = load_names(names_csv)
    print(f"Named reaches: {len(names)}")
    print("Reading reach envelopes…")
    envelopes = load_envelopes(gdb)
    rivers = longest_stretches(records, names, envelopes)
    write_binary(out_bin, records, names)
    write_names_json(out_names, rivers)
    print(f"Wrote {out_bin} ({out_bin.stat().st_size} bytes, {len(records)} reaches)")
    print(f"Wrote {out_names} ({len(rivers)} named rivers)")


if __name__ == "__main__":
    main()
