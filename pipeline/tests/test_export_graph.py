import pytest

from headwaters_pipeline.countries import get_country
from headwaters_pipeline.export_graph import (
    apply_length_fallbacks,
    envelope_from_record,
    envelope_from_wkt,
    inland_stream_ids,
    load_names_from_export,
    longest_stretches,
    official_name,
    records_from_rows,
    validate_ids,
    write_binary,
    write_names_bin,
)


def test_nextdownid_maps_through_hydro_to_nzsegment() -> None:
    rows = [
        (10, 100, 200, 50.0),
        (20, 200, -1, 80.0),
    ]
    assert records_from_rows(rows) == [(10, 20, 50.0), (20, 0, 80.0)]


def test_unmapped_down_keeps_foreign_id() -> None:
    rows = [(10, 100, 999, 1.0)]
    assert records_from_rows(rows) == [(10, 999, 1.0)]


def test_zero_and_minus_one_are_sinks() -> None:
    rows = [(1, 10, 0, 2.0), (2, 20, -1, 3.0)]
    assert records_from_rows(rows) == [(1, 0, 2.0), (2, 0, 3.0)]


def test_gazetteer_overlay_is_exact_rivname_only() -> None:
    assert official_name("Hutt River") == "Te Awa Kairangi / Hutt River"
    assert official_name("Western Hutt River") == "Western Hutt River"
    assert official_name("Eastern Hutt River") == "Eastern Hutt River"
    assert official_name("  Hutt River  ") == "Te Awa Kairangi / Hutt River"
    assert official_name("") == ""


def test_longest_stretch_keeps_one_name_and_downstream_outlet() -> None:
    records = [
        (1, 2, 10.0),
        (2, 3, 10.0),
        (3, 0, 10.0),
        (10, 11, 5.0),
        (11, 0, 5.0),
        (20, 0, 100.0),
    ]
    names = {
        1: "Creek",
        2: "Creek",
        3: "Creek",
        10: "Creek",
        11: "Creek",
        20: "Other River",
    }
    envelopes = {
        1: (0.0, 0.0, 1.0, 1.0),
        2: (1.0, 0.0, 2.0, 1.0),
        3: (2.0, 0.0, 3.0, 1.0),
        10: (10.0, 10.0, 11.0, 11.0),
        11: (11.0, 10.0, 12.0, 11.0),
        20: (5.0, 5.0, 6.0, 6.0),
    }
    rivers = longest_stretches(records, names, envelopes)
    assert rivers == [
        {
            "name": "Creek",
            "id": 3,
            "metres": 30.0,
            "bbox": [0.0, 0.0, 3.0, 1.0],
        },
        {
            "name": "Other River",
            "id": 20,
            "metres": 100.0,
            "bbox": [5.0, 5.0, 6.0, 6.0],
        },
    ]


def test_envelope_from_wkt_reads_linestring() -> None:
    bbox = envelope_from_wkt("LINESTRING (174.0 -41.0,175.5 -40.25)")
    assert bbox == (174.0, -41.0, 175.5, -40.25)


def test_envelope_from_wkt_reads_multilinestring() -> None:
    bbox = envelope_from_wkt(
        "MULTILINESTRING ((173.0 -34.4,173.1 -34.5),(173.2 -34.6,173.3 -34.3))"
    )
    assert bbox == (173.0, -34.6, 173.3, -34.3)


def test_envelope_from_record_reads_bbox_columns() -> None:
    bbox = envelope_from_record(
        {"id": "1", "minx": "174.0", "miny": "-41.0", "maxx": "175.0", "maxy": "-40.0"}
    )
    assert bbox == (174.0, -41.0, 175.0, -40.0)


def test_australia_hydroid_is_identity_map() -> None:
    rows = [
        (10, 10, 20, 50.0),
        (20, 20, 0, 80.0),
    ]
    assert records_from_rows(rows) == [(10, 20, 50.0), (20, 0, 80.0)]


def test_null_length_uses_fallback_not_zero() -> None:
    rows = [(10, 10, 0, None), (11, 11, 0, 12.0)]
    filled = apply_length_fallbacks(rows, {10: 33.5})
    assert filled == [(10, 10, 0, 33.5), (11, 11, 0, 12.0)]


def test_null_length_without_fallback_fails() -> None:
    with pytest.raises(SystemExit, match="No length"):
        apply_length_fallbacks([(10, 10, 0, None)], {})


def test_blank_geofabric_name_stays_unnamed(tmp_path) -> None:
    csv_path = tmp_path / "au.csv"
    csv_path.write_text("HydroID,Name\n1,Murray River\n2,\n3,   \n", encoding="utf-8")
    names = load_names_from_export(csv_path, get_country("au"))
    assert names == {1: "Murray River"}


def test_hierarchy_tile_sql_maps_major_minor() -> None:
    sql = get_country("au").tile_sql
    assert "AHGFFType = 1" in sql
    assert "WHEN 'Major' THEN 5" in sql
    assert "WHEN 'Minor' THEN 2" in sql
    assert ", Shape FROM" in sql
    assert get_country("au").tile_dialect == "SQLITE"


def test_duplicate_or_overflow_ids_fail() -> None:
    with pytest.raises(SystemExit, match="Duplicate"):
        validate_ids([(1, 1, 0, 1.0), (1, 1, 0, 2.0)])
    with pytest.raises(SystemExit, match="u32"):
        validate_ids([(-1, -1, 0, 1.0)])
    with pytest.raises(SystemExit, match="u32"):
        validate_ids([(2**32, 2**32, 0, 1.0)])


def test_inland_sinks_are_terminus_nodes_without_coastal_diffus() -> None:
    sinks = [(10, 100), (20, 200), (30, 300)]
    nodes = [(100, "Coastal"), (200, ""), (300, "Delta")]
    assert inland_stream_ids(sinks, nodes) == [20]


def test_write_binary_hwg2_round_trip(tmp_path) -> None:
    path = tmp_path / "reaches.bin"
    write_binary(
        path,
        [(1, 2, 10.0), (2, 0, 20.0), (4, 2, 5.0)],
        {1: "Creek"},
        inland=[2],
    )
    data = path.read_bytes()
    assert data[:4] == b"HWG2"
    count = int.from_bytes(data[8:12], "little")
    assert count == 3
    index_pages_off = int.from_bytes(data[32:36], "little")
    # Sorted ids 1, 2, 4. Side creek 4 is the third index row.
    row = index_pages_off + 2 * 16
    assert int.from_bytes(data[row : row + 4], "little") == 4
    subtree = int.from_bytes(data[row + 12 : row + 16], "little")
    assert subtree == 1


def test_write_binary_hwg2_survives_a_deep_chain(tmp_path) -> None:
    path = tmp_path / "reaches.bin"
    n = 1200
    records = [(i, i + 1 if i < n else 0, 1.0) for i in range(1, n + 1)]
    records[-1] = (n, 0, 1.0)
    write_binary(path, records, {}, inland=[n])
    data = path.read_bytes()
    assert data[:4] == b"HWG2"
    assert int.from_bytes(data[8:12], "little") == n


def test_write_binary_hwg2_survives_a_down_cycle(tmp_path) -> None:
    path = tmp_path / "reaches.bin"
    write_binary(path, [(1, 2, 1.0), (2, 1, 1.0), (3, 0, 1.0)], {})
    data = path.read_bytes()
    assert data[:4] == b"HWG2"
    assert int.from_bytes(data[8:12], "little") == 3


def test_write_names_bin_start_and_prefix(tmp_path) -> None:
    path = tmp_path / "names.bin"
    rivers = [
        {
            "name": "Murray River",
            "id": 10,
            "metres": 1000.0,
            "bbox": [140.0, -36.0, 148.0, -34.0],
        },
        {
            "name": "Avon River",
            "id": 20,
            "metres": 50.0,
            "bbox": [172.0, -44.0, 173.0, -43.0],
        },
    ]
    write_names_bin(path, rivers, ("Murray River",), 42)
    data = path.read_bytes()
    assert data[:4] == b"HWN1"
    build = int.from_bytes(data[8:12], "little")
    assert build == 42
    start_count = int.from_bytes(data[12:16], "little")
    assert start_count == 1
    start_off = int.from_bytes(data[16:20], "little")
    name_len = int.from_bytes(data[start_off : start_off + 2], "little")
    name = data[start_off + 2 : start_off + 2 + name_len].decode("utf-8")
    assert name == "Murray River"
