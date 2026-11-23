import assert from "node:assert/strict";
import test from "node:test";
import {
  connectedNetwork,
  encodeCompact,
  furthestSource,
  GapError,
  loadCompactGraph,
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

test("compact graph walks match the fixture", () => {
  const compact = loadCompactGraph(
    encodeCompact([
      { id: 1, down: 2, length_m: 100 },
      { id: 2, down: 3, length_m: 200 },
      { id: 3, down: 0, length_m: 300 },
      { id: 4, down: 2, length_m: 50 },
    ]),
  );
  assert.deepEqual(walkDownstream(compact, 1), [1, 2, 3]);
  assert.deepEqual(new Set(walkUpstream(compact, 3)), new Set([1, 2, 3, 4]));
  const max = maxPathLength(compact, 2);
  assert.equal(max.source, 1);
  assert.equal(max.metres, 600);
  assert.deepEqual(new Set(connectedNetwork(compact, 4)), new Set([4, 2, 3]));
});

test("compact graph interned names round-trip", () => {
  const compact = loadCompactGraph(
    encodeCompact([
      { id: 1, down: 2, length_m: 100, name: "Te Awa Kairangi / Hutt River" },
      { id: 2, down: 0, length_m: 200, name: "Te Awa Kairangi / Hutt River" },
      { id: 3, down: 2, length_m: 50, name: null },
    ]),
  );
  assert.equal(compact.name(1), "Te Awa Kairangi / Hutt River");
  assert.equal(compact.name(2), "Te Awa Kairangi / Hutt River");
  assert.equal(compact.name(3), null);
});
