import type { RiverHit } from "./search.ts";

export const HWN1_MAGIC = "HWN1";
export const HWN1_HEADER = 24;
export const PREFIX_SLOTS = 27;

export type Hwn1Header = {
  magic: string;
  version: number;
  buildId: number;
  startCount: number;
  startOff: number;
  prefixDirOff: number;
};

function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function prefixLetter(name: string): string {
  const ch = fold(name).trim().charAt(0);
  if (ch >= "a" && ch <= "z") return ch;
  return "*";
}

export function prefixIndex(letter: string): number {
  if (letter >= "a" && letter <= "z") return letter.charCodeAt(0) - 97;
  return 26;
}

function magicOf(view: DataView): string {
  return String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  );
}

export function parseHwn1Header(buffer: ArrayBuffer): Hwn1Header {
  if (buffer.byteLength < HWN1_HEADER) throw new Error("names file is too small");
  const view = new DataView(buffer);
  const magic = magicOf(view);
  if (magic !== HWN1_MAGIC) throw new Error("names file is not HWN1");
  return {
    magic,
    version: view.getUint16(4, true),
    buildId: view.getUint32(8, true),
    startCount: view.getUint32(12, true),
    startOff: view.getUint32(16, true),
    prefixDirOff: view.getUint32(20, true),
  };
}

function readHits(buffer: ArrayBuffer, off: number, end: number, limit = Infinity): RiverHit[] {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const out: RiverHit[] = [];
  let o = off;
  while (o + 2 <= end && out.length < limit) {
    const nameLen = view.getUint16(o, true);
    o += 2;
    if (o + nameLen + 4 + 4 + 16 > end) break;
    const name = new TextDecoder().decode(bytes.subarray(o, o + nameLen));
    o += nameLen;
    const id = view.getUint32(o, true);
    o += 4;
    const metres = view.getFloat32(o, true);
    o += 4;
    const bbox: [number, number, number, number] = [
      view.getFloat32(o, true),
      view.getFloat32(o + 4, true),
      view.getFloat32(o + 8, true),
      view.getFloat32(o + 12, true),
    ];
    o += 16;
    out.push({ name, id, metres, bbox });
  }
  return out;
}

function writeHits(hits: RiverHit[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  let n = 0;
  for (const hit of hits) {
    const name = enc.encode(hit.name);
    const buf = new ArrayBuffer(2 + name.length + 4 + 4 + 16);
    const view = new DataView(buf);
    view.setUint16(0, name.length, true);
    new Uint8Array(buf, 2, name.length).set(name);
    let o = 2 + name.length;
    view.setUint32(o, hit.id, true);
    o += 4;
    view.setFloat32(o, hit.metres, true);
    o += 4;
    view.setFloat32(o, hit.bbox[0], true);
    view.setFloat32(o + 4, hit.bbox[1], true);
    view.setFloat32(o + 8, hit.bbox[2], true);
    view.setFloat32(o + 12, hit.bbox[3], true);
    const u8 = new Uint8Array(buf);
    parts.push(u8);
    n += u8.length;
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function startHits(buffer: ArrayBuffer, header: Hwn1Header): RiverHit[] {
  return readHits(buffer, header.startOff, buffer.byteLength, header.startCount);
}

export function prefixHits(
  buffer: ArrayBuffer,
  header: Hwn1Header,
  letter: string,
): RiverHit[] {
  const view = new DataView(buffer);
  const slot = prefixIndex(letter);
  const o = header.prefixDirOff + slot * 8;
  const off = view.getUint32(o, true);
  const len = view.getUint32(o + 4, true);
  return readHits(buffer, off, off + len);
}

export function encodeHwn1(
  rivers: RiverHit[],
  startNames: readonly string[],
  buildId: number,
): ArrayBuffer {
  const byName = new Map(rivers.map((r) => [r.name, r]));
  const start: RiverHit[] = [];
  for (const name of startNames) {
    const hit = byName.get(name);
    if (hit) start.push(hit);
  }
  const buckets: RiverHit[][] = Array.from({ length: PREFIX_SLOTS }, () => []);
  for (const hit of rivers) {
    buckets[prefixIndex(prefixLetter(hit.name))].push(hit);
  }
  const startBytes = writeHits(start);
  const bucketBytes = buckets.map(writeHits);
  const prefixDirOff = HWN1_HEADER;
  const startOff = prefixDirOff + PREFIX_SLOTS * 8;
  let cursor = startOff + startBytes.length;
  const dir = new ArrayBuffer(PREFIX_SLOTS * 8);
  const dirView = new DataView(dir);
  for (let i = 0; i < PREFIX_SLOTS; i++) {
    dirView.setUint32(i * 8, cursor, true);
    dirView.setUint32(i * 8 + 4, bucketBytes[i].length, true);
    cursor += bucketBytes[i].length;
  }
  const buf = new ArrayBuffer(cursor);
  const view = new DataView(buf);
  view.setUint8(0, 0x48);
  view.setUint8(1, 0x57);
  view.setUint8(2, 0x4e);
  view.setUint8(3, 0x31);
  view.setUint16(4, 1, true);
  view.setUint16(6, 0, true);
  view.setUint32(8, buildId, true);
  view.setUint32(12, start.length, true);
  view.setUint32(16, startOff, true);
  view.setUint32(20, prefixDirOff, true);
  new Uint8Array(buf, prefixDirOff, dir.byteLength).set(new Uint8Array(dir));
  new Uint8Array(buf, startOff, startBytes.length).set(startBytes);
  let o = startOff + startBytes.length;
  for (const part of bucketBytes) {
    new Uint8Array(buf, o, part.length).set(part);
    o += part.length;
  }
  return buf;
}

const nativeFetch: typeof fetch = (input, init) => fetch(input, init);

export async function loadStartHits(
  url: string,
  fetchImpl: typeof fetch = nativeFetch,
): Promise<RiverHit[]> {
  const head = await fetchImpl(url, {
    headers: { Range: `bytes=0-${HWN1_HEADER - 1}` },
    cache: "reload",
  });
  if (!head.ok && head.status !== 206) throw new Error("names missing");
  const header = parseHwn1Header(await head.arrayBuffer());
  const res = await fetchImpl(url, {
    headers: { Range: `bytes=${header.startOff}-${header.startOff + 8191}` },
  });
  if (!res.ok && res.status !== 206) throw new Error("names missing");
  const body = await res.arrayBuffer();
  return readHits(body, 0, body.byteLength, header.startCount);
}

export async function loadPrefixHits(
  url: string,
  letter: string,
  fetchImpl: typeof fetch = nativeFetch,
): Promise<RiverHit[]> {
  const head = await fetchImpl(url, {
    headers: { Range: `bytes=0-${HWN1_HEADER + PREFIX_SLOTS * 8 - 1}` },
  });
  if (!head.ok && head.status !== 206) throw new Error("names missing");
  const prefixBlock = await head.arrayBuffer();
  const header = parseHwn1Header(prefixBlock);
  const slot = prefixIndex(prefixLetter(letter));
  const dirView = new DataView(prefixBlock, header.prefixDirOff);
  const off = dirView.getUint32(slot * 8, true);
  const len = dirView.getUint32(slot * 8 + 4, true);
  if (len === 0) return [];
  const res = await fetchImpl(url, {
    headers: { Range: `bytes=${off}-${off + len - 1}` },
  });
  if (!res.ok && res.status !== 206) throw new Error("names missing");
  const body = await res.arrayBuffer();
  return readHits(body, 0, body.byteLength);
}
