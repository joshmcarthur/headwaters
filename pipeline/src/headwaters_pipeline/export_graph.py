"""Write a compact national REC2 graph from the File Geodatabase.

``NextDownID`` is the immediate next HydroID. This maps it to ``nzsegment``.
Unmapped pointers are stored as that HydroID so the walker can raise a gap
instead of inventing an edge.
"""

from __future__ import annotations

import csv
import subprocess
from pathlib import Path

GDB_NAME = "nzRec2_v5.gdb"
LAYER = "riverlines"


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
