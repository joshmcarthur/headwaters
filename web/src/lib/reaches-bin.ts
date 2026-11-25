import { CompactGraph } from "./graph.ts";

export const MAGIC = "HWG\0";
export const HEADER_SIZE = 64;
export const RECORD_SIZE = 24;
export const PAGE_SIZE = 1024;
export const SINK_HLD = 0xffffffff;
export const NAME_NONE = 0xffff;
export const FLAG_INLAND = 1;

export type ReachesHeader = {
  magic: string;
  version: number;
  count: number;
  buildId: number;
  stringsOff: number;
  stringsLen: number;
  indexRootOff: number;
  indexRootLen: number;
  indexPagesOff: number;
  indexPagesLen: number;
  dfsOff: number;
  hldOff: number;
  pageSize: number;
  nameCount: number;
};

export type IdHit = {
  dfsIndex: number;
  hldIndex: number;
  subtreeSize: number;
};

export type IndexPageLoc = {
  pageOff: number;
  pageLen: number;
};

export type ReachRecord = {
  id: number;
  length_m: number;
  nameIdx: number;
  flags: number;
};

export type DfsRecord = ReachRecord & { subtreeSize: number };
export type HldRecord = ReachRecord & { pathHi: number; parentHld: number };

function magicBytes(view: DataView): string {
  return String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  );
}

export function parseReachesHeader(buffer: ArrayBuffer): ReachesHeader {
  if (buffer.byteLength < HEADER_SIZE) throw new Error("Graph file is too small");
  const view = new DataView(buffer);
  const magic = magicBytes(view);
  if (magic !== MAGIC) throw new Error("Graph file has the wrong magic");
  return {
    magic,
    version: view.getUint16(4, true),
    count: view.getUint32(8, true),
    buildId: view.getUint32(12, true),
    stringsOff: view.getUint32(16, true),
    stringsLen: view.getUint32(20, true),
    indexRootOff: view.getUint32(24, true),
    indexRootLen: view.getUint32(28, true),
    indexPagesOff: view.getUint32(32, true),
    indexPagesLen: view.getUint32(36, true),
    dfsOff: view.getUint32(40, true),
    hldOff: view.getUint32(44, true),
    pageSize: view.getUint32(48, true),
    nameCount: view.getUint32(52, true),
  };
}

function readCString(bytes: Uint8Array, offset: number): { text: string; next: number } {
  let end = offset;
  while (end < bytes.length && bytes[end] !== 0) end++;
  return {
    text: new TextDecoder().decode(bytes.subarray(offset, end)),
    next: end + 1,
  };
}

export function readCStrings(bytes: Uint8Array, count: number): string[] {
  const names: string[] = [];
  let off = 0;
  for (let i = 0; i < count; i++) {
    const { text, next } = readCString(bytes, off);
    names.push(text);
    off = next;
  }
  return names;
}

export function readStringTable(buffer: ArrayBuffer, header: ReachesHeader): string[] {
  if (header.stringsOff + header.stringsLen > buffer.byteLength) {
    throw new Error(
      `String table is short: need ${header.stringsOff + header.stringsLen} bytes, got ${buffer.byteLength}`,
    );
  }
  const bytes = new Uint8Array(buffer, header.stringsOff, header.stringsLen);
  return readCStrings(bytes, header.nameCount);
}

function readReach(view: DataView, o: number): ReachRecord {
  return {
    id: view.getUint32(o, true),
    length_m: view.getFloat32(o + 4, true),
    nameIdx: view.getUint16(o + 8, true),
    flags: view.getUint16(o + 10, true),
  };
}

export function readDfsAt(view: DataView, o: number): DfsRecord {
  return { ...readReach(view, o), subtreeSize: view.getUint32(o + 12, true) };
}

export function readHldAt(view: DataView, o: number): HldRecord {
  return {
    ...readReach(view, o),
    pathHi: view.getUint32(o + 12, true),
    parentHld: view.getUint32(o + 16, true),
  };
}

export function readDfsRecords(buffer: ArrayBuffer): DfsRecord[] {
  const view = new DataView(buffer);
  const n = Math.floor(buffer.byteLength / RECORD_SIZE);
  const out: DfsRecord[] = [];
  for (let i = 0; i < n; i++) out.push(readDfsAt(view, i * RECORD_SIZE));
  return out;
}

export function readHldRecords(buffer: ArrayBuffer): HldRecord[] {
  const view = new DataView(buffer);
  const n = Math.floor(buffer.byteLength / RECORD_SIZE);
  const out: HldRecord[] = [];
  for (let i = 0; i < n; i++) out.push(readHldAt(view, i * RECORD_SIZE));
  return out;
}

export function indexPageForId(
  root: DataView,
  pageCount: number,
  pageSize: number,
  count: number,
  id: number,
): IndexPageLoc | null {
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
  const pageStart = page * pageSize;
  const pageLen = Math.min(pageSize, count - pageStart);
  return { pageOff, pageLen };
}

export function lookupInPage(page: DataView, pageLen: number, id: number): IdHit | null {
  let i = 0;
  let j = pageLen - 1;
  while (i <= j) {
    const mid = (i + j) >> 1;
    const midId = page.getUint32(mid * 16, true);
    if (midId === id) {
      return {
        dfsIndex: page.getUint32(mid * 16 + 4, true),
        hldIndex: page.getUint32(mid * 16 + 8, true),
        subtreeSize: page.getUint32(mid * 16 + 12, true),
      };
    }
    if (midId < id) i = mid + 1;
    else j = mid - 1;
  }
  return null;
}

export function lookupId(buffer: ArrayBuffer, id: number): IdHit | null {
  const header = parseReachesHeader(buffer);
  const pageCount = header.indexRootLen / 8;
  const root = new DataView(buffer, header.indexRootOff, header.indexRootLen);
  const loc = indexPageForId(root, pageCount, header.pageSize, header.count, id);
  if (!loc) return null;
  const page = new DataView(buffer, loc.pageOff, loc.pageLen * 16);
  return lookupInPage(page, loc.pageLen, id);
}

export async function collectHldWalk(
  startIndex: number,
  loadPath: (index: number) => Promise<HldRecord[]>,
): Promise<HldRecord[]> {
  const out: HldRecord[] = [];
  const seen = new Set<number>();
  let i = startIndex;
  while (i !== SINK_HLD && !seen.has(i)) {
    seen.add(i);
    const path = await loadPath(i);
    if (!path.length) break;
    out.push(...path);
    const last = path[path.length - 1];
    if (!last) break;
    i = last.parentHld;
  }
  return out;
}

function downsFromDfs(dfs: DfsRecord[]): Map<number, number> {
  const downs = new Map<number, number>();
  const walk = (i: number): number => {
    const node = dfs[i];
    const end = i + node.subtreeSize;
    let cur = i + 1;
    while (cur < end) {
      const child = dfs[cur];
      downs.set(child.id, node.id);
      cur = walk(cur);
    }
    return end;
  };
  if (dfs.length) walk(0);
  return downs;
}

export function miniGraphFromSlices(
  dfs: DfsRecord[],
  hld: HldRecord[],
  strings: string[],
): CompactGraph {
  const downs = downsFromDfs(dfs);
  for (let i = 0; i < hld.length - 1; i++) {
    downs.set(hld[i].id, hld[i + 1].id);
  }
  if (hld.length) downs.set(hld[hld.length - 1].id, 0);

  const byId = new Map<number, ReachRecord>();
  for (const rec of [...dfs, ...hld]) byId.set(rec.id, rec);
  const ids = new Uint32Array(byId.size);
  const downArr = new Uint32Array(byId.size);
  const lengths = new Float32Array(byId.size);
  const names = new Map<number, string>();
  const inland = new Set<number>();
  let n = 0;
  for (const rec of byId.values()) {
    ids[n] = rec.id;
    downArr[n] = downs.get(rec.id) ?? 0;
    lengths[n] = rec.length_m;
    if (rec.nameIdx !== NAME_NONE && strings[rec.nameIdx]) {
      names.set(rec.id, strings[rec.nameIdx]);
    }
    if (rec.flags & FLAG_INLAND) inland.add(rec.id);
    n++;
  }
  return new CompactGraph(ids, downArr, lengths, names, inland);
}

export async function graphFromBuffer(buffer: ArrayBuffer, id: number): Promise<CompactGraph> {
  const header = parseReachesHeader(buffer);
  const hit = lookupId(buffer, id);
  if (!hit) throw new Error(`Unknown segment ${id}`);
  const view = new DataView(buffer);
  const dfs: DfsRecord[] = [];
  for (let i = 0; i < hit.subtreeSize; i++) {
    dfs.push(readDfsAt(view, header.dfsOff + (hit.dfsIndex + i) * RECORD_SIZE));
  }
  const hld = await collectHldWalk(hit.hldIndex, async (i) => {
    const rec = readHldAt(view, header.hldOff + i * RECORD_SIZE);
    const path: HldRecord[] = [];
    for (let j = i; j < rec.pathHi; j++) {
      path.push(readHldAt(view, header.hldOff + j * RECORD_SIZE));
    }
    return path;
  });
  const strings = readStringTable(buffer, header);
  return miniGraphFromSlices(dfs, hld, strings);
}
