import { CompactGraph } from "./graph.ts";

export const HWG2_MAGIC = "HWG2";
export const HEADER_SIZE = 64;
export const RECORD_SIZE = 24;
export const PAGE_SIZE = 1024;
export const SINK_HLD = 0xffffffff;
export const NAME_NONE = 0xffff;
export const FLAG_INLAND = 1;

export type Hwg2Input = {
  id: number;
  down: number;
  length_m: number;
  name?: string | null;
  inland?: boolean;
};

export type Hwg2Header = {
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

export type PackedRecord = {
  id: number;
  length_m: number;
  nameIdx: number;
  flags: number;
  extra: number;
  extra2: number;
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function magicBytes(view: DataView): string {
  return String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  );
}

export function parseHwg2Header(buffer: ArrayBuffer): Hwg2Header {
  if (buffer.byteLength < HEADER_SIZE) throw new Error("Graph file is too small");
  const view = new DataView(buffer);
  const magic = magicBytes(view);
  if (magic !== HWG2_MAGIC) throw new Error("Graph file is not HWG2");
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

export function readStringTable(buffer: ArrayBuffer, header: Hwg2Header): string[] {
  if (header.stringsOff + header.stringsLen > buffer.byteLength) {
    throw new Error(
      `String table is short: need ${header.stringsOff + header.stringsLen} bytes, got ${buffer.byteLength}`,
    );
  }
  const bytes = new Uint8Array(buffer, header.stringsOff, header.stringsLen);
  const names: string[] = [];
  let off = 0;
  for (let i = 0; i < header.nameCount; i++) {
    const { text, next } = readCString(bytes, off);
    names.push(text);
    off = next;
  }
  return names;
}

function readDfsRecord(view: DataView, dfsOff: number, index: number): PackedRecord {
  const o = dfsOff + index * RECORD_SIZE;
  return {
    id: view.getUint32(o, true),
    length_m: view.getFloat32(o + 4, true),
    nameIdx: view.getUint16(o + 8, true),
    flags: view.getUint16(o + 10, true),
    extra: view.getUint32(o + 12, true),
    extra2: view.getUint32(o + 16, true),
  };
}

function readHldRecord(view: DataView, hldOff: number, index: number): PackedRecord {
  return readDfsRecord(view, hldOff, index);
}

export function lookupId(buffer: ArrayBuffer, id: number): IdHit | null {
  const header = parseHwg2Header(buffer);
  const view = new DataView(buffer);
  const pageCount = header.indexRootLen / 8;
  if (pageCount === 0) return null;
  let lo = 0;
  let hi = pageCount - 1;
  let page = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const first = view.getUint32(header.indexRootOff + mid * 8, true);
    if (first <= id) {
      page = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  const pageOff = view.getUint32(header.indexRootOff + page * 8 + 4, true);
  const pageStart = page * header.pageSize;
  const pageLen = Math.min(header.pageSize, header.count - pageStart);
  let i = 0;
  let j = pageLen - 1;
  while (i <= j) {
    const mid = (i + j) >> 1;
    const midId = view.getUint32(pageOff + mid * 16, true);
    if (midId === id) {
      return {
        dfsIndex: view.getUint32(pageOff + mid * 16 + 4, true),
        hldIndex: view.getUint32(pageOff + mid * 16 + 8, true),
        subtreeSize: view.getUint32(pageOff + mid * 16 + 12, true),
      };
    }
    if (midId < id) i = mid + 1;
    else j = mid - 1;
  }
  return null;
}

function collectHld(
  view: DataView,
  hldOff: number,
  startIndex: number,
): PackedRecord[] {
  const out: PackedRecord[] = [];
  const seen = new Set<number>();
  let i = startIndex;
  while (i !== SINK_HLD && !seen.has(i)) {
    seen.add(i);
    const rec = readHldRecord(view, hldOff, i);
    const pathHi = rec.extra;
    for (let j = i; j < pathHi; j++) {
      out.push(readHldRecord(view, hldOff, j));
    }
    const last = out[out.length - 1];
    if (!last) break;
    i = last.extra2;
  }
  return out;
}

function downsFromDfs(dfs: PackedRecord[]): Map<number, number> {
  const downs = new Map<number, number>();
  const walk = (i: number): number => {
    const node = dfs[i];
    const end = i + node.extra;
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
  dfs: PackedRecord[],
  hld: PackedRecord[],
  strings: string[],
): CompactGraph {
  const downs = downsFromDfs(dfs);
  for (let i = 0; i < hld.length - 1; i++) {
    downs.set(hld[i].id, hld[i + 1].id);
  }
  if (hld.length) downs.set(hld[hld.length - 1].id, 0);

  const byId = new Map<number, PackedRecord>();
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

export function graphFromBuffer(buffer: ArrayBuffer, id: number): CompactGraph {
  const header = parseHwg2Header(buffer);
  const hit = lookupId(buffer, id);
  if (!hit) throw new Error(`Unknown segment ${id}`);
  const view = new DataView(buffer);
  const dfs: PackedRecord[] = [];
  for (let i = 0; i < hit.subtreeSize; i++) {
    dfs.push(readDfsRecord(view, header.dfsOff, hit.dfsIndex + i));
  }
  const hld = collectHld(view, header.hldOff, hit.hldIndex);
  const strings = readStringTable(buffer, header);
  return miniGraphFromSlices(dfs, hld, strings);
}

export function encodeHwg2(records: Hwg2Input[], buildId?: number): ArrayBuffer {
  const idSet = new Set(records.map((r) => r.id));
  const children = new Map<number, number[]>();
  const byId = new Map<number, Hwg2Input>();
  for (const rec of records) {
    byId.set(rec.id, rec);
    if (!children.has(rec.id)) children.set(rec.id, []);
  }
  for (const rec of records) {
    if (!rec.down || !idSet.has(rec.down)) continue;
    const list = children.get(rec.down);
    if (list) list.push(rec.id);
  }
  for (const list of children.values()) list.sort((a, b) => a - b);

  const subtree = new Map<number, number>();
  const sized = new Set<number>();
  const sizeOf = (id: number): number => {
    if (sized.has(id)) return subtree.get(id) ?? 1;
    sized.add(id);
    let n = 1;
    for (const c of children.get(id) ?? []) n += sizeOf(c);
    subtree.set(id, n);
    return n;
  };
  const sinks = records.filter((r) => !r.down || !idSet.has(r.down)).map((r) => r.id);
  sinks.sort((a, b) => a - b);
  for (const s of sinks) sizeOf(s);
  for (const rec of records) sizeOf(rec.id);

  const dfsOrder: number[] = [];
  const visit = (id: number): void => {
    dfsOrder.push(id);
    for (const c of children.get(id) ?? []) visit(c);
  };
  for (const s of sinks) visit(s);
  for (const rec of records) {
    if (!dfsOrder.includes(rec.id)) visit(rec.id);
  }

  const heavyChild = new Map<number, number>();
  for (const id of dfsOrder) {
    const kids = children.get(id) ?? [];
    if (!kids.length) continue;
    let best = kids[0];
    let bestSize = subtree.get(best) ?? 1;
    for (const k of kids.slice(1)) {
      const sz = subtree.get(k) ?? 1;
      if (sz > bestSize || (sz === bestSize && k < best)) {
        best = k;
        bestSize = sz;
      }
    }
    heavyChild.set(id, best);
  }
  const isHeavy = new Set(heavyChild.values());
  const pathHeads = dfsOrder.filter((id) => !isHeavy.has(id));
  const hldOrder: number[] = [];
  const pathHi = new Map<number, number>();
  for (const head of pathHeads) {
    const path: number[] = [];
    let cur: number | undefined = head;
    while (cur !== undefined) {
      path.push(cur);
      cur = heavyChild.get(cur);
    }
    path.reverse();
    const start = hldOrder.length;
    for (const id of path) hldOrder.push(id);
    const hi = hldOrder.length;
    for (const id of path) pathHi.set(id, hi);
  }

  const dfsIndex = new Map<number, number>();
  dfsOrder.forEach((id, i) => dfsIndex.set(id, i));
  const hldIndex = new Map<number, number>();
  hldOrder.forEach((id, i) => hldIndex.set(id, i));

  const unique: string[] = [];
  const intern = new Map<string, number>();
  for (const rec of records) {
    if (!rec.name) continue;
    if (!intern.has(rec.name)) {
      intern.set(rec.name, unique.length);
      unique.push(rec.name);
    }
  }
  const encoder = new TextEncoder();
  const strParts = unique.map((s) => {
    const raw = encoder.encode(s);
    const withNul = new Uint8Array(raw.length + 1);
    withNul.set(raw);
    return withNul;
  });
  let strBytes = 0;
  for (const p of strParts) strBytes += p.length;

  const count = records.length;
  const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const stringsOff = HEADER_SIZE;
  const indexRootOff = stringsOff + strBytes;
  const indexRootLen = pageCount * 8;
  const indexPagesOff = indexRootOff + indexRootLen;
  const indexPagesLen = count * 16;
  const dfsOff = indexPagesOff + indexPagesLen;
  const hldOff = dfsOff + count * RECORD_SIZE;
  const total = hldOff + count * RECORD_SIZE;

  const hash = new Uint8Array(count * 12 + strBytes);
  const hashView = new DataView(hash.buffer);
  records.forEach((rec, i) => {
    hashView.setUint32(i * 12, rec.id, true);
    hashView.setUint32(i * 12 + 4, rec.down, true);
    hashView.setFloat32(i * 12 + 8, rec.length_m, true);
  });
  let hs = count * 12;
  for (const p of strParts) {
    hash.set(p, hs);
    hs += p.length;
  }
  const resolvedBuild = buildId ?? crc32(hash);

  const buf = new ArrayBuffer(total);
  const view = new DataView(buf);
  view.setUint8(0, 0x48);
  view.setUint8(1, 0x57);
  view.setUint8(2, 0x47);
  view.setUint8(3, 0x32);
  view.setUint16(4, 1, true);
  view.setUint16(6, 0, true);
  view.setUint32(8, count, true);
  view.setUint32(12, resolvedBuild, true);
  view.setUint32(16, stringsOff, true);
  view.setUint32(20, strBytes, true);
  view.setUint32(24, indexRootOff, true);
  view.setUint32(28, indexRootLen, true);
  view.setUint32(32, indexPagesOff, true);
  view.setUint32(36, indexPagesLen, true);
  view.setUint32(40, dfsOff, true);
  view.setUint32(44, hldOff, true);
  view.setUint32(48, PAGE_SIZE, true);
  view.setUint32(52, unique.length, true);

  const strings = new Uint8Array(buf, stringsOff, strBytes);
  let cursor = 0;
  for (const p of strParts) {
    strings.set(p, cursor);
    cursor += p.length;
  }

  const sortedIds = [...dfsOrder].sort((a, b) => a - b);
  for (let page = 0; page < pageCount; page++) {
    const start = page * PAGE_SIZE;
    if (start >= sortedIds.length) break;
    view.setUint32(indexRootOff + page * 8, sortedIds[start] ?? 0, true);
    view.setUint32(
      indexRootOff + page * 8 + 4,
      indexPagesOff + start * 16,
      true,
    );
  }
  sortedIds.forEach((id, i) => {
    const o = indexPagesOff + i * 16;
    view.setUint32(o, id, true);
    view.setUint32(o + 4, dfsIndex.get(id) ?? 0, true);
    view.setUint32(o + 8, hldIndex.get(id) ?? 0, true);
    view.setUint32(o + 12, subtree.get(id) ?? 1, true);
  });

  const inland = new Set(records.filter((r) => r.inland).map((r) => r.id));
  const writeRec = (
    off: number,
    id: number,
    extra: number,
    extra2: number,
  ): void => {
    const rec = byId.get(id);
    if (!rec) return;
    view.setUint32(off, id, true);
    view.setFloat32(off + 4, rec.length_m, true);
    const ni = rec.name ? (intern.get(rec.name) ?? NAME_NONE) : NAME_NONE;
    view.setUint16(off + 8, ni, true);
    view.setUint16(off + 10, inland.has(id) ? FLAG_INLAND : 0, true);
    view.setUint32(off + 12, extra, true);
    view.setUint32(off + 16, extra2, true);
  };

  dfsOrder.forEach((id, i) => {
    writeRec(dfsOff + i * RECORD_SIZE, id, subtree.get(id) ?? 1, 0);
  });
  hldOrder.forEach((id, i) => {
    const down = byId.get(id)?.down ?? 0;
    const parentHld =
      down && hldIndex.has(down) ? (hldIndex.get(down) as number) : SINK_HLD;
    writeRec(hldOff + i * RECORD_SIZE, id, pathHi.get(id) ?? i + 1, parentHld);
  });

  return buf;
}
