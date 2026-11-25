export const BLOCK = 16384;

export type ByteCache = {
  get(key: string): Promise<ArrayBuffer | undefined>;
  set(key: string, buf: ArrayBuffer): Promise<void>;
  clear(): Promise<void>;
};

export function alignBlocks(
  start: number,
  endExclusive: number,
): { pageStart: number; pageEnd: number } {
  const pageStart = Math.floor(start / BLOCK) * BLOCK;
  const pageEnd = Math.ceil(endExclusive / BLOCK) * BLOCK;
  return { pageStart, pageEnd: Math.max(pageEnd, pageStart + BLOCK) };
}

export function memoryByteCache(): ByteCache {
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

function blockRequest(key: string): Request {
  return new Request(`https://headwaters.invalid/block?k=${encodeURIComponent(key)}`);
}

export async function openByteCache(name: string): Promise<ByteCache> {
  if (typeof caches === "undefined") return memoryByteCache();
  let cache = await caches.open(name);
  return {
    async get(key) {
      const res = await cache.match(blockRequest(key));
      if (!res) return undefined;
      return res.arrayBuffer();
    },
    async set(key, buf) {
      try {
        await cache.put(blockRequest(key), new Response(buf.slice(0), { status: 200 }));
      } catch {
        /* quota */
      }
    },
    async clear() {
      await caches.delete(name);
      cache = await caches.open(name);
    },
  };
}

function pageUrl(url: string, page: number): string {
  return `${url}${url.includes("?") ? "&" : "?"}hwb=${page}`;
}

export async function fetchRange(
  url: string,
  start: number,
  endExclusive: number,
  opts: {
    fetch?: typeof fetch;
    cache: ByteCache;
    bypassCache?: boolean;
  },
): Promise<ArrayBuffer> {
  const fetchImpl = (opts.fetch ?? fetch).bind(globalThis);
  const { pageStart, pageEnd } = alignBlocks(start, endExclusive);
  const parts: ArrayBuffer[] = [];
  for (let page = pageStart; page < pageEnd; page += BLOCK) {
    const key = `${url}|${page}`;
    let block: ArrayBuffer | undefined;
    if (!opts.bypassCache) block = await opts.cache.get(key);
    if (block && block.byteLength <= 64) block = undefined;
    if (!block) {
      const res = await fetchImpl(pageUrl(url, page), {
        headers: { Range: `bytes=${page}-${page + BLOCK - 1}` },
        cache: "no-store",
      });
      if (!res.ok && res.status !== 206) {
        throw new Error(`Range ${res.status}`);
      }
      block = await res.arrayBuffer();
      await opts.cache.set(key, block);
    }
    parts.push(block);
  }
  const joined = join(parts);
  const out = joined.slice(start - pageStart, endExclusive - pageStart);
  const want = endExclusive - start;
  if (out.byteLength < want) {
    throw new Error(`Range short: got ${out.byteLength} want ${want}`);
  }
  return out;
}

function join(parts: ArrayBuffer[]): ArrayBuffer {
  if (parts.length === 1) return parts[0];
  let n = 0;
  for (const p of parts) n += p.byteLength;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(new Uint8Array(p), o);
    o += p.byteLength;
  }
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}
