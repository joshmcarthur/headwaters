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


def furthest_source(graph: Graph, start: SegmentId) -> tuple[SegmentId, float]:
    """Headwater that maximises path length along the network to ``start``.

    Distance is the sum of ``length_m`` on the path from the source to ``start``,
    excluding ``start`` itself (see fixture: A→B→C is 300, not 600).
    """
    if start not in graph:
        raise KeyError(start)
    up = build_up_index(graph)
    best_id: SegmentId = start
    best_dist = 0.0

    def visit(node: SegmentId, dist_above: float) -> None:
        nonlocal best_id, best_dist
        parents = up.get(node, [])
        if not parents:
            if dist_above > best_dist or (
                dist_above == best_dist and node != start and best_id == start
            ):
                best_id = node
                best_dist = dist_above
            elif dist_above > best_dist:
                best_id = node
                best_dist = dist_above
            return
        for parent in parents:
            parent_len = float(graph[parent]["length_m"])  # type: ignore[arg-type]
            visit(parent, dist_above + parent_len)

    visit(start, 0.0)
    return best_id, best_dist


def connected_network(graph: Graph, start: SegmentId) -> list[SegmentId]:
    """Upstream ∪ downstream of ``start``, self once."""
    down = walk_downstream(graph, start)
    up = walk_upstream(graph, start)
    seen: set[SegmentId] = set()
    ordered: list[SegmentId] = []
    for sid in up + down:
        if sid not in seen:
            seen.add(sid)
            ordered.append(sid)
    return ordered


def max_path_length_m(graph: Graph, start: SegmentId) -> tuple[SegmentId, list[SegmentId], float]:
    """Longest directed path in the connected network through ``start``.

    Furthest upstream source → ``start`` → sink. Returns (source id, path, metres).
    """
    source, dist_to_start = furthest_source(graph, start)
    down_path = walk_downstream(graph, start)
    down_len = sum(float(graph[sid]["length_m"]) for sid in down_path)  # type: ignore[arg-type]
    path = _path_from_source(graph, source, start) + down_path[1:]
    return source, path, dist_to_start + down_len


def _path_from_source(graph: Graph, source: SegmentId, start: SegmentId) -> list[SegmentId]:
    if source == start:
        return [start]
    path = walk_downstream(graph, source)
    try:
        i = path.index(start)
    except ValueError as exc:
        raise GapError(source, start) from exc
    return path[: i + 1]
