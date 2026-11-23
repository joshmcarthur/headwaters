from headwaters_pipeline.export_graph import (
    envelope_from_wkt,
    longest_stretches,
    official_name,
    records_from_rows,
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
