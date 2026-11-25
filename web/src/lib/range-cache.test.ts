import assert from "node:assert/strict";
import test from "node:test";
import { BLOCK, fetchRange, memoryByteCache } from "./range-cache.ts";

function fileFetch(file: ArrayBuffer): typeof fetch {
  return async (input, init) => {
    const url = String(input);
    const range = new Headers(init?.headers).get("Range") ?? "";
    const m = /^bytes=(\d+)-(\d+)$/.exec(range);
    if (!m) return new Response(file.slice(0));
    let start = Number(m[1]);
    let endIncl = Number(m[2]);
    if (!url.includes("hwb=")) {
      start = 0;
      endIncl = 63;
    }
    return new Response(file.slice(start, endIncl + 1), {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${endIncl}/${file.byteLength}`,
      },
    });
  };
}

test("fetchRange still returns the asked bytes when HTTP cache repeats a 64-byte header", async () => {
  const file = new Uint8Array(BLOCK * 2);
  file[64] = 7;
  file[BLOCK + 10] = 9;
  const out = await fetchRange("/data/nz/reaches.bin", 64, BLOCK + 20, {
    fetch: fileFetch(file.buffer),
    cache: memoryByteCache(),
  });
  assert.equal(out.byteLength, BLOCK + 20 - 64);
  assert.equal(new Uint8Array(out)[0], 7);
  assert.equal(new Uint8Array(out)[BLOCK + 10 - 64], 9);
});
