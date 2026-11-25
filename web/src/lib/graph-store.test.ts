import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { walkDownstream } from "./graph.ts";
import { GraphStore, type ByteCache } from "./graph-store.ts";

function fixture(name: string): ArrayBuffer {
  const buf = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures", name));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function memCache(): ByteCache {
  const map = new Map<string, ArrayBuffer>();
  return {
    async get(key) {
      return map.get(key);
    },
    async set(key, buf) {
      map.set(key, buf);
    },
    async clear() {
      map.clear();
    },
  };
}

function rangeFetch(file: ArrayBuffer): {
  fetch: typeof fetch;
  ranges: string[];
} {
  const ranges: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    const range = headers.get("Range");
    if (!range) {
      return new Response(file.slice(0));
    }
    ranges.push(range);
    const m = /^bytes=(\d+)-(\d+)$/.exec(range);
    if (!m) return new Response(null, { status: 416 });
    const start = Number(m[1]);
    const endIncl = Number(m[2]);
    const slice = file.slice(start, endIncl + 1);
    return new Response(slice, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${endIncl}/${file.byteLength}`,
      },
    });
  };
  return { fetch: fetchImpl, ranges };
}

test("loadById fetches ranges then serves the second tap from cache", async () => {
  const buf = fixture("creek.bin");
  const { fetch, ranges } = rangeFetch(buf);
  const cache = memCache();
  const store = new GraphStore("/data/nz/reaches.bin", { fetch, cache });
  await store.warmup();
  const g = await store.loadById(4);
  assert.equal(g.has(1), false);
  assert.deepEqual(walkDownstream(g, 4).map(Number), [4, 2, 3]);
  const first = ranges.length;
  assert.ok(first > 0);
  await store.loadById(4);
  assert.equal(ranges.length, first);
});

test("warmup still loads names when HTTP cache repeats a 64-byte header", async () => {
  const buf = fixture("creek.bin");
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const range = new Headers(init?.headers).get("Range") ?? "";
    const m = /^bytes=(\d+)-(\d+)$/.exec(range);
    if (!m) return new Response(buf.slice(0));
    let start = Number(m[1]);
    let endIncl = Number(m[2]);
    if (!url.includes("hwb=")) {
      start = 0;
      endIncl = 63;
    }
    return new Response(buf.slice(start, endIncl + 1), {
      status: 206,
      headers: { "Content-Range": `bytes ${start}-${endIncl}/${buf.byteLength}` },
    });
  };
  const store = new GraphStore("/data/nz/reaches.bin", {
    fetch: fetchImpl,
    cache: memCache(),
  });
  const g = await store.loadById(4);
  assert.equal(g.name(2), "Creek");
});

test("warmup overwrites a truncated first page in the cache", async () => {
  const buf = fixture("creek.bin");
  const { fetch } = rangeFetch(buf);
  const cache = memCache();
  await cache.set("/data/nz/reaches.bin|0", buf.slice(0, 64));
  const store = new GraphStore("/data/nz/reaches.bin", { fetch, cache });
  const g = await store.loadById(4);
  assert.equal(g.name(2), "Creek");
});

test("warmup does not reuse a 64-byte header as the first data page", async () => {
  const buf = fixture("creek.bin");
  let headerBody: ArrayBuffer | null = null;
  const fetchImpl: typeof fetch = async (_input, init) => {
    const range = new Headers(init?.headers).get("Range") ?? "";
    const m = /^bytes=(\d+)-(\d+)$/.exec(range);
    if (!m) return new Response(buf.slice(0));
    const start = Number(m[1]);
    const endIncl = Number(m[2]);
    if (start === 0 && endIncl === 63) {
      headerBody = buf.slice(0, 64);
      return new Response(headerBody, { status: 206 });
    }
    if (headerBody && start === 0) {
      return new Response(headerBody.slice(0), { status: 206 });
    }
    return new Response(buf.slice(start, endIncl + 1), { status: 206 });
  };
  const store = new GraphStore("/data/nz/reaches.bin", {
    fetch: fetchImpl,
    cache: memCache(),
  });
  const g = await store.loadById(4);
  assert.equal(g.name(2), "Creek");
});

test("loadById still works when fetch rejects a non-Window this", async () => {
  const buf = fixture("creek.bin");
  const { fetch: inner } = rangeFetch(buf);
  const fetchImpl: typeof fetch = function (this: unknown, input, init) {
    if (this !== undefined && this !== globalThis) {
      throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
    }
    return inner(input, init);
  };
  const store = new GraphStore("/data/nz/reaches.bin", {
    fetch: fetchImpl,
    cache: memCache(),
  });
  const g = await store.loadById(4);
  assert.equal(g.has(4), true);
});

test("warmup with a new build_id drops stale pages", async () => {
  const buf1 = fixture("creek.bin");
  const buf2 = fixture("creek-long.bin");
  const cache = memCache();
  const a = rangeFetch(buf1);
  const store = new GraphStore("/data/nz/reaches.bin", { fetch: a.fetch, cache });
  await store.warmup();
  await store.loadById(4);
  const b = rangeFetch(buf2);
  const store2 = new GraphStore("/data/nz/reaches.bin", { fetch: b.fetch, cache });
  await store2.warmup();
  const g = await store2.loadById(4);
  assert.equal(g.length(4), 99);
});
