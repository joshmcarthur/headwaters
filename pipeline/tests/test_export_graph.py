from headwaters_pipeline.export_graph import records_from_rows


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
