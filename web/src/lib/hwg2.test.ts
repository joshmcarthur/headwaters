import assert from "node:assert/strict";
import test from "node:test";
import { CompactGraph } from "./graph.ts";
import { walkDownstream, walkUpstream } from "./graph.ts";
import {
  encodeHwg2,
  graphFromBuffer,
  lookupId,
  parseHwg2Header,
} from "./hwg2.ts";

const records = [
  { id: 1, down: 2, length_m: 10, name: "Creek" },
  { id: 2, down: 3, length_m: 20, name: "Creek" },
  { id: 3, down: 0, length_m: 30, inland: true },
  { id: 4, down: 2, length_m: 5 },
];

test("HWG2 header magic and count", () => {
  const buf = encodeHwg2(records);
  const h = parseHwg2Header(buf);
  assert.equal(h.magic, "HWG2");
  assert.equal(h.count, 4);
  assert.ok(h.buildId !== 0);
});

test("id index finds dfs slice of a side creek", () => {
  const buf = encodeHwg2(records);
  const hit = lookupId(buf, 4);
  assert.ok(hit);
  assert.equal(hit.subtreeSize, 1);
});

test("mini-graph of creek 4 does not include sibling 1", () => {
  const buf = encodeHwg2(records);
  const g = graphFromBuffer(buf, 4);
  assert.equal(g.has(1), false);
  assert.ok(g instanceof CompactGraph);
  assert.deepEqual(walkDownstream(g, 4).map(Number), [4, 2, 3]);
  assert.deepEqual(walkUpstream(g, 4).map(Number), [4]);
  assert.equal(g.isInlandSink(3), true);
  assert.equal(g.name(4), null);
  assert.equal(g.name(2), "Creek");
});
