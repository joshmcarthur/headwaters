import json
from pathlib import Path

from headwaters_pipeline.graph import (
    GapError,
    connected_network,
    furthest_source,
    max_path_length_m,
    walk_downstream,
    walk_upstream,
)

FIXTURE = Path(__file__).parent / "fixtures" / "tiny_network.json"


def load_fixture():
    return json.loads(FIXTURE.read_text())


def test_downstream_from_a_reaches_sink():
    g = load_fixture()
    assert walk_downstream(g, "A") == ["A", "B", "C"]


def test_upstream_from_c_includes_branch():
    g = load_fixture()
    assert set(walk_upstream(g, "C")) == {"A", "B", "C", "D"}


def test_furthest_source_from_c_is_a():
    g = load_fixture()
    node, dist = furthest_source(g, "C")
    assert node == "A"
    assert dist == 300  # 100 + 200, not D's 50 + 200


def test_missing_down_pointer_is_a_gap():
    g = load_fixture()
    g["B"]["down"] = 999
    try:
        walk_downstream(g, "A")
    except GapError:
        return
    raise AssertionError("expected GapError")


def test_max_path_length_through_b_is_source_to_sink():
    g = load_fixture()
    source, path, metres = max_path_length_m(g, "B")
    assert source == "A"
    assert path == ["A", "B", "C"]
    assert metres == 600  # 100 + 200 + 300


def test_connected_network_from_d_excludes_a():
    g = load_fixture()
    ids = set(connected_network(g, "D"))
    assert ids == {"D", "B", "C"}
    assert "A" not in ids
