import assert from "node:assert/strict";
import test from "node:test";
import {
  encodeNames,
  loadPrefixHits,
  loadStartHits,
  parseNamesHeader,
  prefixHits,
  prefixLetter,
  startHits,
} from "./names-bin.ts";

const rivers = [
  {
    name: "Murray River",
    id: 10,
    metres: 1000,
    bbox: [140, -36, 148, -34] as [number, number, number, number],
  },
  {
    name: "Avon River",
    id: 20,
    metres: 50,
    bbox: [172, -44, 173, -43] as [number, number, number, number],
  },
];

test("prefix letter folds macrons into a-z", () => {
  assert.equal(prefixLetter("Murray River"), "m");
  assert.equal(prefixLetter("Avon River"), "a");
  assert.equal(prefixLetter("Te Awa Kairangi / Hutt River"), "t");
});

test("names start block and prefix spans", () => {
  const buf = encodeNames(rivers, ["Murray River"], 42);
  const header = parseNamesHeader(buf);
  assert.equal(header.magic, "HWN\0");
  assert.equal(header.buildId, 42);
  assert.equal(header.startCount, 1);
  const start = startHits(buf, header);
  assert.equal(start.length, 1);
  assert.equal(start[0]?.name, "Murray River");
  assert.equal(start[0]?.id, 10);
  const m = prefixHits(buf, header, "m");
  assert.equal(m.length, 1);
  assert.equal(m[0]?.name, "Murray River");
  const a = prefixHits(buf, header, "a");
  assert.equal(a[0]?.name, "Avon River");
});

test("loadStartHits and loadPrefixHits use Range", async () => {
  const file = encodeNames(rivers, ["Murray River"], 7);
  const fetchImpl: typeof fetch = async (_input, init) => {
    const range = new Headers(init?.headers).get("Range");
    const m = /^bytes=(\d+)-(\d+)$/.exec(range ?? "");
    if (!m) return new Response(file.slice(0));
    return new Response(file.slice(Number(m[1]), Number(m[2]) + 1), { status: 206 });
  };
  const start = await loadStartHits("/data/nz/names.bin", { fetch: fetchImpl });
  assert.equal(start[0]?.name, "Murray River");
  const m = await loadPrefixHits("/data/nz/names.bin", "Murray", { fetch: fetchImpl });
  assert.equal(m[0]?.id, 10);
});
