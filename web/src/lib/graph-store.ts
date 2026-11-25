import type { CompactGraph } from "./graph.ts";
import {
  HEADER_SIZE,
  RECORD_SIZE,
  SINK_HLD,
  miniGraphFromSlices,
  parseHwg2Header,
  readStringTable,
  type Hwg2Header,
  type PackedRecord,
} from "./hwg2.ts";
import {
  fetchRange,
  memoryByteCache,
  type ByteCache,
} from "./range-cache.ts";

export type { ByteCache };

export type GraphStoreOpts = {
  fetch?: typeof fetch;
  cache?: ByteCache;
};

function parseRecords(buffer: ArrayBuffer): PackedRecord[] {
  const view = new DataView(buffer);
  const n = Math.floor(buffer.byteLength / RECORD_SIZE);
  const out: PackedRecord[] = [];
  for (let i = 0; i < n; i++) {
    const o = i * RECORD_SIZE;
    out.push({
      id: view.getUint32(o, true),
      length_m: view.getFloat32(o + 4, true),
      nameIdx: view.getUint16(o + 8, true),
      flags: view.getUint16(o + 10, true),
      extra: view.getUint32(o + 12, true),
      extra2: view.getUint32(o + 16, true),
    });
  }
  return out;
}

export class GraphStore {
  private readonly url: string;
  private readonly fetchImpl: typeof fetch;
  private readonly cache: ByteCache;
  private header: Hwg2Header | null = null;
  private strings: string[] = [];
  private indexRoot: DataView | null = null;
  private inflight: Promise<void> | null = null;

  constructor(url: string, opts: GraphStoreOpts = {}) {
    this.url = url;
    this.fetchImpl = (opts.fetch ?? fetch).bind(globalThis);
    this.cache = opts.cache ?? memoryByteCache();
  }

  async warmup(): Promise<void> {
    if (this.inflight) return this.inflight;
    this.inflight = this.doWarmup();
    try {
      await this.inflight;
    } catch (err) {
      this.inflight = null;
      throw err;
    }
  }

  private async doWarmup(): Promise<void> {
    const headerBuf = await fetchRange(this.url, 0, HEADER_SIZE, {
      fetch: this.fetchImpl,
      cache: this.cache,
      bypassCache: true,
    });
    const header = parseHwg2Header(headerBuf);
    if (this.header && this.header.buildId !== header.buildId) {
      await this.cache.clear();
    }
    const stored = await this.cache.get(`${this.url}#build`);
    if (stored) {
      const prev = new DataView(stored).getUint32(0, true);
      if (prev !== header.buildId) await this.cache.clear();
    }
    const meta = new ArrayBuffer(4);
    new DataView(meta).setUint32(0, header.buildId, true);
    await this.cache.set(`${this.url}#build`, meta);
    this.header = header;
    const stringsBuf = await this.range(header.stringsOff, header.stringsOff + header.stringsLen);
    this.strings = readStringTable(stringsBuf, { ...header, stringsOff: 0 });
    const rootBuf = await this.range(
      header.indexRootOff,
      header.indexRootOff + header.indexRootLen,
    );
    this.indexRoot = new DataView(rootBuf);
  }

  async loadById(id: number): Promise<CompactGraph> {
    if (!this.header || !this.indexRoot) await this.warmup();
    const header = this.header as Hwg2Header;
    const root = this.indexRoot as DataView;
    const hit = await this.lookup(header, root, id);
    if (!hit) throw new Error(`Unknown segment ${id}`);
    const dfsBuf = await this.range(
      header.dfsOff + hit.dfsIndex * RECORD_SIZE,
      header.dfsOff + (hit.dfsIndex + hit.subtreeSize) * RECORD_SIZE,
    );
    const hld = await this.collectHld(header, hit.hldIndex);
    return miniGraphFromSlices(parseRecords(dfsBuf), hld, this.strings);
  }

  private async lookup(
    header: Hwg2Header,
    root: DataView,
    id: number,
  ): Promise<{ dfsIndex: number; hldIndex: number; subtreeSize: number } | null> {
    const pageCount = header.indexRootLen / 8;
    if (pageCount === 0) return null;
    let lo = 0;
    let hi = pageCount - 1;
    let page = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const first = root.getUint32(mid * 8, true);
      if (first <= id) {
        page = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    const pageOff = root.getUint32(page * 8 + 4, true);
    const pageStart = page * header.pageSize;
    const pageLen = Math.min(header.pageSize, header.count - pageStart);
    return await this.lookupPage(pageOff, pageLen, id);
  }

  private async lookupPage(
    pageOff: number,
    pageLen: number,
    id: number,
  ): Promise<{ dfsIndex: number; hldIndex: number; subtreeSize: number } | null> {
    const buf = await this.range(pageOff, pageOff + pageLen * 16);
    const view = new DataView(buf);
    let i = 0;
    let j = pageLen - 1;
    while (i <= j) {
      const mid = (i + j) >> 1;
      const midId = view.getUint32(mid * 16, true);
      if (midId === id) {
        return {
          dfsIndex: view.getUint32(mid * 16 + 4, true),
          hldIndex: view.getUint32(mid * 16 + 8, true),
          subtreeSize: view.getUint32(mid * 16 + 12, true),
        };
      }
      if (midId < id) i = mid + 1;
      else j = mid - 1;
    }
    return null;
  }

  private async collectHld(header: Hwg2Header, startIndex: number): Promise<PackedRecord[]> {
    const out: PackedRecord[] = [];
    const seen = new Set<number>();
    let i = startIndex;
    while (i !== SINK_HLD && !seen.has(i)) {
      seen.add(i);
      const recBuf = await this.range(
        header.hldOff + i * RECORD_SIZE,
        header.hldOff + (i + 1) * RECORD_SIZE,
      );
      const rec = parseRecords(recBuf)[0];
      if (!rec) break;
      const pathHi = rec.extra;
      const pathBuf = await this.range(
        header.hldOff + i * RECORD_SIZE,
        header.hldOff + pathHi * RECORD_SIZE,
      );
      out.push(...parseRecords(pathBuf));
      const last = out[out.length - 1];
      if (!last) break;
      i = last.extra2;
    }
    return out;
  }

  private range(start: number, endExclusive: number): Promise<ArrayBuffer> {
    return fetchRange(this.url, start, endExclusive, {
      fetch: this.fetchImpl,
      cache: this.cache,
    });
  }
}
