import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CompactGraph, walkDownstream, walkUpstream } from "./graph.ts";
import { graphFromBuffer, lookupId, parseReachesHeader } from "./reaches-bin.ts";

function fixture(name: string): ArrayBuffer {
  const buf = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures", name));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

test("reaches header magic and count", () => {
  const buf = fixture("creek.bin");
  const h = parseReachesHeader(buf);
  assert.equal(h.magic, "HWG\0");
  assert.equal(h.count, 4);
  assert.ok(h.buildId !== 0);
});

test("id index finds dfs slice of a side creek", () => {
  const hit = lookupId(fixture("creek.bin"), 4);
  assert.ok(hit);
  assert.equal(hit.subtreeSize, 1);
});

test("mini-graph of creek 4 does not include sibling 1", async () => {
  const g = await graphFromBuffer(fixture("creek.bin"), 4);
  assert.equal(g.has(1), false);
  assert.ok(g instanceof CompactGraph);
  assert.deepEqual(walkDownstream(g, 4).map(Number), [4, 2, 3]);
  assert.deepEqual(walkUpstream(g, 4).map(Number), [4]);
  assert.equal(g.isInlandSink(3), true);
  assert.equal(g.name(4), null);
  assert.equal(g.name(2), "Creek");
});
