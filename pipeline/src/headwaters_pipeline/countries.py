"""Per-country river source and output paths.

The browser loads the same three files for each country:

- ``web/public/data/{code}/reaches.bin``
- ``web/public/data/{code}/reaches.pmtiles``
- ``web/public/data/{code}/names.json``
"""

from __future__ import annotations

import argparse
import shlex
from dataclasses import dataclass
from pathlib import Path

@dataclass(frozen=True)
class Country:
    code: str
    gdb_name: str
    layer: str
    id_field: str
    hydro_field: str
    down_field: str
    length_field: str
    names_csv: str | None
    gdb_name_field: str | None
    envelope_where: str | None
    tile_sql: str
    min_zoom: int
    tile_dialect: str | None = None
    length_fallback_srs: str | None = None
    inland_layer: str | None = None
    inland_id_field: str | None = None
    inland_where: str | None = None


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


COUNTRIES: dict[str, Country] = {
    "nz": Country(
        code="nz",
        gdb_name="nzRec2_v5.gdb",
        layer="riverlines",
        id_field="nzsegment",
        hydro_field="HydroID",
        down_field="NextDownID",
        length_field="Shape_Length",
        names_csv="NZ_River_Names_REC2_V1.csv",
        gdb_name_field=None,
        envelope_where=None,
        tile_sql="SELECT nzsegment AS id, StreamOrde FROM riverlines WHERE LID = 0",
        min_zoom=4,
    ),
    "au": Country(
        code="au",
        gdb_name="SH_Network_GDB/SH_Network.gdb",
        layer="AHGFNetworkStream",
        id_field="HydroID",
        hydro_field="HydroID",
        down_field="NextDownID",
        length_field="GeodesLen",
        names_csv=None,
        gdb_name_field="Name",
        envelope_where="TRIM(Name) <> ''",
        tile_sql=(
            "SELECT HydroID AS id, "
            "CASE Hierarchy WHEN 'Major' THEN 5 WHEN 'Minor' THEN 2 ELSE 1 END AS StreamOrde, "
            "Shape FROM AHGFNetworkStream WHERE AHGFFType = 1"
        ),
        min_zoom=2,
        tile_dialect="SQLITE",
        length_fallback_srs="EPSG:3577",
        inland_layer="AHGFNetworkNode",
    ),
}


def get_country(code: str) -> Country:
    try:
        return COUNTRIES[code]
    except KeyError as exc:
        known = ", ".join(sorted(COUNTRIES))
        raise SystemExit(f"Unknown country {code!r}. Use: {known}") from exc


def gdb_path(country: Country, root: Path | None = None) -> Path:
    base = root or repo_root()
    return base / "data" / "raw" / country.gdb_name


def names_csv_path(country: Country, root: Path | None = None) -> Path | None:
    if country.names_csv is None:
        return None
    base = root or repo_root()
    return base / "data" / "raw" / country.names_csv


def output_dir(country: Country, root: Path | None = None) -> Path:
    base = root or repo_root()
    return base / "web" / "public" / "data" / country.code


def derived_csv_path(country: Country, root: Path | None = None) -> Path:
    base = root or repo_root()
    return base / "data" / "derived" / f"{country.code}-riverlines.csv"


def shell_exports(code: str, root: Path | None = None) -> str:
    country = get_country(code)
    base = root or repo_root()
    gdb = gdb_path(country, base)
    out = output_dir(country, base) / "reaches.pmtiles"
    return "\n".join(
        [
            f"COUNTRY={shlex.quote(country.code)}",
            f"GDB={shlex.quote(str(gdb))}",
            f"OUT={shlex.quote(str(out))}",
            f"TILE_SQL={shlex.quote(country.tile_sql)}",
            f"TILE_DIALECT={shlex.quote(country.tile_dialect or '')}",
            f"MIN_ZOOM={country.min_zoom}",
        ]
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Print shell exports for a country tile build.")
    parser.add_argument("country", choices=sorted(COUNTRIES))
    args = parser.parse_args()
    print(shell_exports(args.country))


if __name__ == "__main__":
    main()
