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
