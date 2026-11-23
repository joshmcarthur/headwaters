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

``NextDownID`` is the immediate next HydroID. This maps it to ``nzsegment``.
Unmapped pointers are stored as that HydroID so the walker can raise a gap
instead of inventing an edge.

Names come from the NIWA ``NZ River Names REC2 (Table)`` bulk CSV, joined on
``nzsegment``. Gazetteer dual names overlay exact ``RivName`` matches only.
"""

from __future__ import annotations

import csv
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
    write_binary(out_bin, records, names)
    print(f"Wrote {out_bin} ({out_bin.stat().st_size} bytes, {len(records)} reaches)")


if __name__ == "__main__":
    main()
