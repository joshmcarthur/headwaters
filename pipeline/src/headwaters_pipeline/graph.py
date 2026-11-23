"""Directed river-network walks.

``down`` is the immediate next segment, or ``0`` / ``None`` at a sink.
A pointer to a missing id is a gap: raise ``GapError``. Do not invent edges.
"""

from __future__ import annotations

from typing import Hashable, Mapping

SegmentId = Hashable
Segment = Mapping[str, object]
Graph = Mapping[SegmentId, Segment]

SINK = 0


class GapError(Exception):
    """A downstream pointer does not exist in the graph."""

    def __init__(self, from_id: SegmentId, down_id: SegmentId) -> None:
        super().__init__(
            f"Segment {from_id!r} points downstream to {down_id!r}, which is not in the graph."
        )
        self.from_id = from_id
        self.down_id = down_id


def _is_sink(down: object) -> bool:
    return down is None or down == SINK or down == "0"


def _norm(value: SegmentId) -> SegmentId:
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return value


def build_up_index(graph: Graph) -> dict[SegmentId, list[SegmentId]]:
    """Reverse index: each id → immediate upstream neighbours."""
    up: dict[SegmentId, list[SegmentId]] = {sid: [] for sid in graph}
    for sid, seg in graph.items():
        down = seg.get("down")
        if _is_sink(down):
            continue
        down_id = _norm(down) if not isinstance(down, (int, str)) else down
        if down_id not in graph:
            # Same rule as walks: missing pointer is a gap, not a skip.
            raise GapError(sid, down_id)
        up[down_id].append(sid)
    return up


def walk_downstream(graph: Graph, start: SegmentId) -> list[SegmentId]:
    """Start inclusive, follow ``down`` until a sink. Cycle-safe."""
    if start not in graph:
        raise KeyError(start)
    path: list[SegmentId] = []
    seen: set[SegmentId] = set()
    current: SegmentId = start
    while True:
        if current in seen:
            raise GapError(current, graph[current].get("down"))
        seen.add(current)
        path.append(current)
        down = graph[current].get("down")
        if _is_sink(down):
            return path
        if down not in graph:
            raise GapError(current, down)
        current = down  # type: ignore[assignment]


def walk_upstream(graph: Graph, start: SegmentId) -> list[SegmentId]:
    """Start inclusive, every segment that drains to ``start``."""
    if start not in graph:
        raise KeyError(start)
    up = build_up_index(graph)
    found: list[SegmentId] = []
    stack = [start]
    seen: set[SegmentId] = set()
    while stack:
        current = stack.pop()
        if current in seen:
            continue
        seen.add(current)
        found.append(current)
        stack.extend(up.get(current, []))
    return found
