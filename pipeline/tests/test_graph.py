import json
from pathlib import Path

from headwaters_pipeline.graph import (
    GapError,
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


def test_missing_down_pointer_is_a_gap():
    g = load_fixture()
    g["B"]["down"] = 999
    try:
        walk_downstream(g, "A")
    except GapError:
        return
    raise AssertionError("expected GapError")
