import assert from "node:assert/strict";
import test from "node:test";
import { hitForQuery, resolveNames, searchRivers, type RiverHit } from "./search.ts";

const rivers: RiverHit[] = [
  {
    name: "Rangitikei River",
    id: 1,
    metres: 200,
    bbox: [175, -40, 176, -39],
  },
  {
    name: "Te Awa Kairangi / Hutt River",
    id: 2,
    metres: 50,
    bbox: [174.8, -41.3, 175.2, -41.0],
  },
  {
    name: "Awanui River",
    id: 3,
    metres: 20,
    bbox: [173, -35, 174, -34],
  },
  {
    name: "Waikato River",
    id: 4,
    metres: 400,
    bbox: [175, -38, 176, -37],
  },
];

test("macron query matches an unmacronated NIWA name", () => {
  const hits = searchRivers(rivers, "Rangitīkei");
  assert.equal(hits[0]?.name, "Rangitikei River");
});

test("Hutt matches the Gazetteer dual name", () => {
  const hits = searchRivers(rivers, "hutt");
  assert.equal(hits[0]?.name, "Te Awa Kairangi / Hutt River");
});

test("prefix ranks above a longer substring", () => {
  const hits = searchRivers(rivers, "awa");
  assert.equal(hits[0]?.name, "Awanui River");
  assert.ok(hits.some((h) => h.name === "Te Awa Kairangi / Hutt River"));
  assert.ok(
    hits.findIndex((h) => h.name === "Awanui River") <
      hits.findIndex((h) => h.name === "Te Awa Kairangi / Hutt River"),
  );
});

test("Enter confirms the current query, not a stale list", () => {
  assert.equal(hitForQuery(rivers, "hutt")?.name, "Te Awa Kairangi / Hutt River");
  assert.equal(hitForQuery(rivers, "hutt", 99)?.name, "Te Awa Kairangi / Hutt River");
  assert.equal(hitForQuery(rivers, "   "), null);
});

test("empty query returns no hits", () => {
  assert.deepEqual(searchRivers(rivers, "  "), []);
});

test("start list keeps order and drops names missing from the index", () => {
  const resolved = resolveNames(rivers, [
    "Waikato River",
    "Missing River",
    "Te Awa Kairangi / Hutt River",
  ]);
  assert.deepEqual(
    resolved.map((r) => r.name),
    ["Waikato River", "Te Awa Kairangi / Hutt River"],
  );
});
