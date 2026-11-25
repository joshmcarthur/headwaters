import type { CompactGraph } from "./graph.ts";
import {
  HEADER_SIZE,
  RECORD_SIZE,
  collectHldWalk,
  indexPageForId,
  lookupInPage,
  miniGraphFromSlices,
  parseReachesHeader,
  readCStrings,
  readDfsRecords,
  readHldRecords,
  type HldRecord,
  type ReachesHeader,
} from "./reaches-bin.ts";
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

export class GraphStore {
  private readonly url: string;
  private readonly fetchImpl: typeof fetch;
  private readonly cache: ByteCache;
  private header: ReachesHeader | null = null;
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
    const header = parseReachesHeader(headerBuf);
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
    this.strings = readCStrings(new Uint8Array(stringsBuf), header.nameCount);
    const rootBuf = await this.range(
      header.indexRootOff,
      header.indexRootOff + header.indexRootLen,
    );
    this.indexRoot = new DataView(rootBuf);
  }

  async loadById(id: number): Promise<CompactGraph> {
    if (!this.header || !this.indexRoot) await this.warmup();
    const header = this.header;
    const root = this.indexRoot;
    if (!header || !root) throw new Error("Graph header missing");
    const hit = await this.lookup(header, root, id);
    if (!hit) throw new Error(`Unknown segment ${id}`);
    const dfsBuf = await this.range(
      header.dfsOff + hit.dfsIndex * RECORD_SIZE,
      header.dfsOff + (hit.dfsIndex + hit.subtreeSize) * RECORD_SIZE,
    );
    const hld = await this.collectHld(header, hit.hldIndex);
    return miniGraphFromSlices(readDfsRecords(dfsBuf), hld, this.strings);
  }

  private async lookup(
    header: ReachesHeader,
    root: DataView,
    id: number,
  ): Promise<{ dfsIndex: number; hldIndex: number; subtreeSize: number } | null> {
    const pageCount = header.indexRootLen / 8;
    const loc = indexPageForId(root, pageCount, header.pageSize, header.count, id);
    if (!loc) return null;
    const buf = await this.range(loc.pageOff, loc.pageOff + loc.pageLen * 16);
    return lookupInPage(new DataView(buf), loc.pageLen, id);
  }

  private async collectHld(header: ReachesHeader, startIndex: number): Promise<HldRecord[]> {
    return collectHldWalk(startIndex, async (i) => {
      const recBuf = await this.range(
        header.hldOff + i * RECORD_SIZE,
        header.hldOff + (i + 1) * RECORD_SIZE,
      );
      const rec = readHldRecords(recBuf)[0];
      if (!rec) return [];
      const pathBuf = await this.range(
        header.hldOff + i * RECORD_SIZE,
        header.hldOff + rec.pathHi * RECORD_SIZE,
      );
      return readHldRecords(pathBuf);
    });
  }

  private range(start: number, endExclusive: number): Promise<ArrayBuffer> {
    return fetchRange(this.url, start, endExclusive, {
      fetch: this.fetchImpl,
      cache: this.cache,
    });
  }
}
