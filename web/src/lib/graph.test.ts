import assert from "node:assert/strict";
import test from "node:test";
import {
  connectedNetwork,
  furthestSource,
  GapError,
  maxPathLength,
  riverGraphView,
  walkDownstream,
  walkUpstream,
  type RiverGraph,
} from "./graph.ts";

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
