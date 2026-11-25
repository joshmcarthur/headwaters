import assert from "node:assert/strict";
import test from "node:test";
import {
  CompactGraph,
  collapseRoute,
  connectedNetwork,
  furthestSource,
  GapError,
  maxPathLength,
  riverGraphView,
  tapSelectedPoint,
  walkDownstream,
  walkUpstream,
  type RiverGraph,
} from "./graph.ts";

function compactOf(
  rows: Array<{
    id: number;
    down: number;
    length_m: number;
    name?: string | null;
    inland?: boolean;
  }>,
): CompactGraph {
  const ids = new Uint32Array(rows.map((r) => r.id));
  const downs = new Uint32Array(rows.map((r) => r.down));
  const lengths = new Float32Array(rows.map((r) => r.length_m));
  const names = new Map<number, string>();
  const inland = new Set<number>();
  for (const r of rows) {
    if (r.name) names.set(r.id, r.name);
    if (r.inland) inland.add(r.id);
  }
  return new CompactGraph(ids, downs, lengths, names, inland);
}

const fixture: RiverGraph = {
  outlet_nzsegment: 0,
  sink_nextdownid: 0,
  segments: {
    A: { down: "B", length_m: 100, up: [], official_name: null },
    B: { down: "C", length_m: 200, up: ["A", "D"], official_name: null },
    C: { down: 0, length_m: 300, up: ["B"], official_name: null },
    D: { down: "B", length_m: 50, up: [], official_name: null },
  },
};

const view = riverGraphView(fixture);

test("downstream from A reaches sink", () => {
  assert.deepEqual(walkDownstream(view, "A"), ["A", "B", "C"]);
});

test("upstream from C includes branch", () => {
  assert.deepEqual(new Set(walkUpstream(view, "C")), new Set(["A", "B", "C", "D"]));
});

test("furthest source from C is A", () => {
  const { node, dist } = furthestSource(view, "C");
  assert.equal(node, "A");
  assert.equal(dist, 300);
});

test("missing down pointer is a gap", () => {
  const g: RiverGraph = {
    ...fixture,
    segments: { ...fixture.segments, B: { ...fixture.segments.B, down: 999 } },
  };
  assert.throws(() => walkDownstream(riverGraphView(g), "A"), GapError);
});

test("max path length through B is source to sink", () => {
  const { source, path, metres } = maxPathLength(view, "B");
  assert.equal(source, "A");
  assert.deepEqual(path, ["A", "B", "C"]);
  assert.equal(metres, 600);
});

test("connected network from D excludes A", () => {
  const ids = new Set(connectedNetwork(view, "D"));
  assert.deepEqual(ids, new Set(["D", "B", "C"]));
});

test("compact graph walks match the fixture", () => {
  const compact = compactOf([
    { id: 1, down: 2, length_m: 100 },
    { id: 2, down: 3, length_m: 200 },
    { id: 3, down: 0, length_m: 300 },
    { id: 4, down: 2, length_m: 50 },
  ]);
  assert.deepEqual(walkDownstream(compact, 1), [1, 2, 3]);
  assert.deepEqual(new Set(walkUpstream(compact, 3)), new Set([1, 2, 3, 4]));
  const max = maxPathLength(compact, 2);
  assert.equal(max.source, 1);
  assert.equal(max.metres, 600);
  assert.deepEqual(new Set(connectedNetwork(compact, 4)), new Set([4, 2, 3]));
});

test("compact graph interned names round-trip", () => {
  const compact = compactOf([
    { id: 1, down: 2, length_m: 100, name: "Te Awa Kairangi / Hutt River" },
    { id: 2, down: 0, length_m: 200, name: "Te Awa Kairangi / Hutt River" },
    { id: 3, down: 2, length_m: 50, name: null },
  ]);
  assert.equal(compact.name(1), "Te Awa Kairangi / Hutt River");
  assert.equal(compact.name(2), "Te Awa Kairangi / Hutt River");
  assert.equal(compact.name(3), null);
  assert.equal(compact.isInlandSink(2), false);
});

test("compact graph inland sinks", () => {
  const compact = compactOf([
    { id: 1, down: 2, length_m: 100 },
    { id: 2, down: 0, length_m: 200, inland: true },
  ]);
  assert.equal(compact.isInlandSink(2), true);
  assert.equal(compact.isInlandSink(1), false);
});

test("tap highlights keep catchment, longest upstream, and downstream distinct", () => {
  const marks = tapSelectedPoint(view, "B");
  assert.equal(marks.selected, "B");
  assert.deepEqual(marks.downstream, ["C"]);
  assert.deepEqual(marks.main, ["A"]);
  assert.deepEqual(new Set(marks.catchment), new Set(["A", "D"]));
});

const basin: RiverGraph = {
  outlet_nzsegment: 0,
  sink_nextdownid: 0,
  segments: {
    A: { down: "B", length_m: 100, up: [], official_name: null },
    B: { down: "C", length_m: 200, up: ["A", "D"], official_name: null },
    C: { down: "E", length_m: 50, up: ["B"], official_name: null },
    D: { down: "B", length_m: 50, up: [], official_name: null },
    E: { down: 0, length_m: 300, up: ["C", "F"], official_name: null },
    F: { down: "E", length_m: 40, up: [], official_name: null },
  },
};

const basinView = riverGraphView(basin);

test("selected-point tap on B excludes tributaries that join below the click", () => {
  const marks = tapSelectedPoint(basinView, "B");
  assert.equal(marks.selected, "B");
  assert.deepEqual(marks.downstream, ["C", "E"]);
  assert.deepEqual(marks.main, ["A"]);
  assert.deepEqual(new Set(marks.catchment), new Set(["A", "D"]));
});

test("selected-point tap on a side tributary does not paint the rest of the basin", () => {
  const marks = tapSelectedPoint(basinView, "D");
  assert.equal(marks.selected, "D");
  assert.deepEqual(marks.downstream, ["B", "C", "E"]);
  assert.deepEqual(marks.main, []);
  assert.deepEqual(marks.catchment, []);
});

const named: RiverGraph = {
  outlet_nzsegment: 0,
  sink_nextdownid: 0,
  segments: {
    A: { down: "B", length_m: 100, up: [], official_name: "Headwaters Stream" },
    B: { down: "C", length_m: 200, up: ["A"], official_name: "Headwaters Stream" },
    C: { down: "D", length_m: 50, up: ["B"], official_name: null },
    D: {
      down: "E",
      length_m: 300,
      up: ["C"],
      official_name: "Te Awa Kairangi / Hutt River",
    },
    E: {
      down: "F",
      length_m: 100,
      up: ["D"],
      official_name: "Te Awa Kairangi / Hutt River",
    },
    F: { down: "G", length_m: 20, up: ["E"], official_name: null },
    G: {
      down: 0,
      length_m: 80,
      up: ["F"],
      official_name: "Te Awa Kairangi / Hutt River",
    },
  },
};

const namedView = riverGraphView(named);
const namedPath = ["A", "B", "C", "D", "E", "F", "G"];

test("collapseRoute merges consecutive names and sums lengths", () => {
  const runs = collapseRoute(namedView, namedPath, "D");
  assert.deepEqual(runs, [
    { id: "B", name: "Headwaters Stream", metres: 300, containsSelected: false },
    { id: "C", name: null, metres: 50, containsSelected: false },
    {
      id: "E",
      name: "Te Awa Kairangi / Hutt River",
      metres: 400,
      containsSelected: true,
    },
    { id: "F", name: null, metres: 20, containsSelected: false },
    {
      id: "G",
      name: "Te Awa Kairangi / Hutt River",
      metres: 80,
      containsSelected: false,
    },
  ]);
});

test("collapseRoute flags the unnamed run when it contains the selected reach", () => {
  const runs = collapseRoute(namedView, namedPath, "C");
  assert.equal(runs[1]?.name, null);
  assert.equal(runs[1]?.id, "C");
  assert.equal(runs[1]?.containsSelected, true);
  assert.equal(runs.filter((r) => r.containsSelected).length, 1);
});

test("collapseRoute on the longest path matches maxPathLength", () => {
  const { path } = maxPathLength(namedView, "D");
  assert.deepEqual(path, namedPath);
  const runs = collapseRoute(namedView, path, "D");
  assert.equal(
    runs.reduce((sum, r) => sum + r.metres, 0),
    850,
  );
});
