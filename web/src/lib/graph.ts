export type SegmentId = string | number;

export type Segment = {
  down: number | string | null;
  up?: Array<number | string>;
  length_m: number;
  official_name: string | null;
  riv_name?: string | null;
  cum_area_m2?: number | null;
};

export type RiverGraph = {
  outlet_nzsegment: number;
  sink_nextdownid: number;
  segments: Record<string, Segment>;
};

export type GraphView = {
  has(id: SegmentId): boolean;
  down(id: SegmentId): SegmentId | 0;
  length(id: SegmentId): number;
  up(id: SegmentId): SegmentId[];
  name(id: SegmentId): string | null;
};

export class GapError extends Error {
  fromId: SegmentId;
  downId: SegmentId;
  constructor(fromId: SegmentId, downId: SegmentId) {
    super(
      `Segment ${fromId} points downstream to ${downId}, which is not in the graph.`,
    );
    this.name = "GapError";
    this.fromId = fromId;
    this.downId = downId;
  }
}

function sid(value: string | number | null | undefined): SegmentId {
  return String(value ?? "0");
}

function isSink(down: unknown): boolean {
  return down === null || down === undefined || down === 0 || down === "0" || down === -1;
}

export function riverGraphView(graph: RiverGraph): GraphView {
  return {
    has(id) {
      return sid(id) in graph.segments;
    },
    down(id) {
      const d = graph.segments[sid(id)].down;
      if (isSink(d)) return 0;
      return sid(d);
    },
    length(id) {
      return graph.segments[sid(id)].length_m;
    },
    up(id) {
      return (graph.segments[sid(id)].up ?? []).map(sid);
    },
    name(id) {
      return graph.segments[sid(id)]?.official_name ?? null;
    },
  };
}

const MAGIC = 0x31475748; // 'HWG1' little-endian
const VERSION = 2;

export type CompactRecord = {
  id: number;
  down: number;
  length_m: number;
  name?: string | null;
};

export class CompactGraph implements GraphView {
  readonly count: number;
  private readonly ids: Uint32Array;
  private readonly downs: Uint32Array;
  private readonly lengths: Float32Array;
  private readonly index: Map<number, number>;
  private readonly ups: number[][];
  private readonly names: Map<number, string>;

  constructor(
    ids: Uint32Array,
    downs: Uint32Array,
    lengths: Float32Array,
    names: Map<number, string> = new Map(),
  ) {
    this.count = ids.length;
    this.ids = ids;
    this.downs = downs;
    this.lengths = lengths;
    this.names = names;
    this.index = new Map();
    this.ups = Array.from({ length: ids.length }, () => []);
    for (let i = 0; i < ids.length; i++) {
      this.index.set(ids[i], i);
    }
    for (let i = 0; i < ids.length; i++) {
      const down = downs[i];
      if (down === 0) continue;
      const di = this.index.get(down);
      if (di === undefined) continue;
      this.ups[di].push(ids[i]);
    }
  }

  has(id: SegmentId): boolean {
    return this.index.has(Number(id));
  }

  down(id: SegmentId): SegmentId | 0 {
    const i = this.row(id);
    const d = this.downs[i];
    return d === 0 ? 0 : d;
  }

  length(id: SegmentId): number {
    return this.lengths[this.row(id)];
  }

  up(id: SegmentId): SegmentId[] {
    return this.ups[this.row(id)];
  }

  name(id: SegmentId): string | null {
    return this.names.get(Number(id)) ?? null;
  }

  private row(id: SegmentId): number {
    const i = this.index.get(Number(id));
    if (i === undefined) throw new Error(`Unknown segment ${id}`);
    return i;
  }
}

function readCString(bytes: Uint8Array, offset: number): string {
  let end = offset;
  while (end < bytes.length && bytes[end] !== 0) end++;
  return new TextDecoder().decode(bytes.subarray(offset, end));
}

export function loadCompactGraph(buffer: ArrayBuffer): CompactGraph {
  const view = new DataView(buffer);
  if (view.byteLength < 12) throw new Error("Graph file is too small");
  const magic = view.getUint32(0, true);
  if (magic !== MAGIC) throw new Error("Graph file is not HWG1");
  const version = view.getUint16(4, true);
  if (version !== 1 && version !== 2) {
    throw new Error(`Unsupported graph version ${version}`);
  }
  const count = view.getUint32(8, true);
  const recEnd = 12 + count * 12;
  if (view.byteLength < recEnd) throw new Error("Graph file is truncated");
  const ids = new Uint32Array(count);
  const downs = new Uint32Array(count);
  const lengths = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const o = 12 + i * 12;
    ids[i] = view.getUint32(o, true);
    downs[i] = view.getUint32(o + 4, true);
    lengths[i] = view.getFloat32(o + 8, true);
  }
  const names = new Map<number, string>();
  if (version >= 2 && view.byteLength >= recEnd + 8) {
    const namedCount = view.getUint32(recEnd, true);
    const strBytes = view.getUint32(recEnd + 4, true);
    const entriesStart = recEnd + 8;
    const strStart = entriesStart + namedCount * 8;
    if (view.byteLength < strStart + strBytes) {
      throw new Error("Graph file name table is truncated");
    }
    const strings = new Uint8Array(buffer, strStart, strBytes);
    for (let i = 0; i < namedCount; i++) {
      const o = entriesStart + i * 8;
      const id = view.getUint32(o, true);
      const off = view.getUint32(o + 4, true);
      const label = readCString(strings, off);
      if (label) names.set(id, label);
    }
  }
  return new CompactGraph(ids, downs, lengths, names);
}

export function encodeCompact(records: CompactRecord[]): ArrayBuffer {
  const named = records.filter((r) => r.name);
  const unique: string[] = [];
  const intern = new Map<string, number>();
  const encoder = new TextEncoder();
  for (const rec of named) {
    const label = rec.name as string;
    if (!intern.has(label)) {
      intern.set(label, unique.length);
      unique.push(label);
    }
  }
  const strParts = unique.map((s) => {
    const raw = encoder.encode(s);
    const withNul = new Uint8Array(raw.length + 1);
    withNul.set(raw);
    return withNul;
  });
  const strOffsets: number[] = [];
  let strBytes = 0;
  for (const part of strParts) {
    strOffsets.push(strBytes);
    strBytes += part.length;
  }
  const recEnd = 12 + records.length * 12;
  const buf = new ArrayBuffer(recEnd + 8 + named.length * 8 + strBytes);
  const view = new DataView(buf);
  view.setUint32(0, MAGIC, true);
  view.setUint16(4, VERSION, true);
  view.setUint16(6, 0, true);
  view.setUint32(8, records.length, true);
  records.forEach((rec, i) => {
    const o = 12 + i * 12;
    view.setUint32(o, rec.id, true);
    view.setUint32(o + 4, rec.down, true);
    view.setFloat32(o + 8, rec.length_m, true);
  });
  view.setUint32(recEnd, named.length, true);
  view.setUint32(recEnd + 4, strBytes, true);
  named.forEach((rec, i) => {
    const o = recEnd + 8 + i * 8;
    view.setUint32(o, rec.id, true);
    view.setUint32(o + 4, strOffsets[intern.get(rec.name as string) as number], true);
  });
  const strings = new Uint8Array(buf, recEnd + 8 + named.length * 8, strBytes);
  let cursor = 0;
  for (const part of strParts) {
    strings.set(part, cursor);
    cursor += part.length;
  }
  return buf;
}

export function walkDownstream(graph: GraphView, start: SegmentId): SegmentId[] {
  if (!graph.has(start)) throw new Error(`Unknown segment ${start}`);
  const path: SegmentId[] = [];
  const seen = new Set<string>();
  let current = start;
  while (true) {
    const key = String(current);
    if (seen.has(key)) throw new GapError(current, graph.down(current));
    seen.add(key);
    path.push(current);
    const next = graph.down(current);
    if (next === 0) return path;
    if (!graph.has(next)) throw new GapError(current, next);
    current = next;
  }
}

export function walkUpstream(graph: GraphView, start: SegmentId): SegmentId[] {
  if (!graph.has(start)) throw new Error(`Unknown segment ${start}`);
  const found: SegmentId[] = [];
  const stack: SegmentId[] = [start];
  const seen = new Set<string>();
  while (stack.length) {
    const current = stack.pop() as SegmentId;
    const key = String(current);
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(current);
    for (const p of graph.up(current)) stack.push(p);
  }
  return found;
}

export function furthestSource(
  graph: GraphView,
  start: SegmentId,
): { node: SegmentId; dist: number } {
  if (!graph.has(start)) throw new Error(`Unknown segment ${start}`);
  let bestId: SegmentId = start;
  let bestDist = 0;
  const stack: Array<{ node: SegmentId; dist: number }> = [{ node: start, dist: 0 }];
  while (stack.length) {
    const { node, dist } = stack.pop() as { node: SegmentId; dist: number };
    const parents = graph.up(node);
    if (parents.length === 0) {
      if (dist > bestDist) {
        bestId = node;
        bestDist = dist;
      }
      continue;
    }
    for (const parent of parents) {
      stack.push({ node: parent, dist: dist + graph.length(parent) });
    }
  }
  return { node: bestId, dist: bestDist };
}

export function connectedNetwork(graph: GraphView, start: SegmentId): SegmentId[] {
  const down = walkDownstream(graph, start);
  const up = walkUpstream(graph, start);
  const seen = new Set<string>();
  const ordered: SegmentId[] = [];
  for (const id of [...up, ...down]) {
    const key = String(id);
    if (!seen.has(key)) {
      seen.add(key);
      ordered.push(id);
    }
  }
  return ordered;
}

export function maxPathLength(
  graph: GraphView,
  start: SegmentId,
): { source: SegmentId; path: SegmentId[]; metres: number } {
  const { node: source, dist: distToStart } = furthestSource(graph, start);
  const downPath = walkDownstream(graph, start);
  const downLen = downPath.reduce((sum, id) => sum + graph.length(id), 0);
  const fromSource = walkDownstream(graph, source);
  const i = fromSource.findIndex((id) => String(id) === String(start));
  if (i < 0) throw new GapError(source, start);
  const path = fromSource.slice(0, i + 1).concat(downPath.slice(1));
  return { source, path, metres: distToStart + downLen };
}

export type RouteRun = {
  id: SegmentId;
  name: string | null;
  metres: number;
  containsSelected: boolean;
};

export function collapseRoute(
  graph: GraphView,
  path: SegmentId[],
  selected: SegmentId,
): RouteRun[] {
  const runs: RouteRun[] = [];
  const selectedKey = String(selected);
  for (const id of path) {
    const name = graph.name(id);
    const metres = graph.length(id);
    const selectedHere = String(id) === selectedKey;
    const last = runs[runs.length - 1];
    if (last && last.name === name) {
      last.id = id;
      last.metres += metres;
      last.containsSelected = last.containsSelected || selectedHere;
    } else {
      runs.push({ id, name, metres, containsSelected: selectedHere });
    }
  }
  return runs;
}

export type TapHighlights = {
  selected: SegmentId;
  downstream: SegmentId[];
  main: SegmentId[];
  catchment: SegmentId[];
};

export function tapHighlights(graph: GraphView, start: SegmentId): TapHighlights {
  const up = walkUpstream(graph, start);
  const down = walkDownstream(graph, start);
  const { node: source } = furthestSource(graph, start);
  const fromSource = walkDownstream(graph, source);
  const i = fromSource.findIndex((id) => String(id) === String(start));
  if (i < 0) throw new GapError(source, start);
  return {
    selected: start,
    downstream: down.slice(1),
    main: fromSource.slice(0, i),
    catchment: up.filter((id) => String(id) !== String(start)),
  };
}
