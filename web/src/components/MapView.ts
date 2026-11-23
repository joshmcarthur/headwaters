import { addProtocol, Map as MapLibreMap, removeProtocol } from "maplibre-gl";
import { Protocol } from "pmtiles";
import { copy, formatLength, splitOfficialName } from "../lib/copy.ts";
import { THEME_EVENT } from "../lib/theme.ts";
import {
  GapError,
  collapseRoute,
  loadCompactGraph,
  maxPathLength,
  tapHighlights,
  type GraphView,
  type RouteRun,
  type SegmentId,
} from "../lib/graph.ts";

const TAP_PAD = 10;
const SOURCE_LAYER = "reaches";
const MOBILE_MQ = "(max-width: 720px)";
const NZ_BOUNDS: [[number, number], [number, number]] = [
  [166.0, -47.5],
  [178.9, -34.0],
];

type MapPaint = {
  land: string;
  context: string;
  selected: string;
  main: string;
  mainHalo: string;
  upstream: string;
  upstreamHalo: string;
  downstream: string;
  lineContext: number;
  lineUpstream: number;
  lineUpstreamHalo: number;
  lineDown: number;
  lineMain: number;
  lineMainHalo: number;
  lineSelected: number;
  opacityContext: number;
};

function cssToken(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function cssPx(name: string, fallback: number): number {
  const n = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name).trim());
  return Number.isFinite(n) ? n : fallback;
}

function readPaint(): MapPaint {
  return {
    land: cssToken("--map-land", "#f2ecdd"),
    context: cssToken("--map-river-context", "#6e9aa6"),
    selected: cssToken("--map-river-selected", "#0a6fa3"),
    main: cssToken("--map-main-channel", "#b1421a"),
    mainHalo: cssToken("--map-main-halo", "#f2ecdd"),
    upstream: cssToken("--map-upstream", "#24635e"),
    upstreamHalo: cssToken("--map-upstream-halo", "#24635e4d"),
    downstream: cssToken("--map-downstream", "#8a5a00"),
    lineContext: cssPx("--line-context", 1),
    lineUpstream: cssPx("--line-upstream", 2),
    lineUpstreamHalo: cssPx("--line-upstream-halo", 8),
    lineDown: cssPx("--line-downstream", 3),
    lineMain: cssPx("--line-main", 3),
    lineMainHalo: cssPx("--line-main-halo", 7),
    lineSelected: cssPx("--line-selected", 4),
    opacityContext: cssPx("--opacity-context", 0.7),
  };
}

function applyMapPaint(map: MapLibreMap, next: MapPaint): void {
  if (map.getLayer("background")) {
    map.setPaintProperty("background", "background-color", next.land);
  }
  const lines: [string, string][] = [
    ["reaches", next.context],
    ["reaches-catchment-halo", next.upstreamHalo],
    ["reaches-catchment", next.upstream],
    ["reaches-main-halo", next.mainHalo],
    ["reaches-main", next.main],
    ["reaches-down", next.downstream],
    ["reaches-selected", next.selected],
  ];
  for (const [id, color] of lines) {
    if (map.getLayer(id)) {
      map.setPaintProperty(id, "line-color", color);
    }
  }
}

function stateOpacity(flag: "selected" | "catchment" | "main" | "downstream") {
  return ["case", ["boolean", ["feature-state", flag], false], 1, 0];
}

function ensurePmtilesProtocol(): void {
  const protocol = new Protocol();
  removeProtocol("pmtiles");
  addProtocol("pmtiles", protocol.tilev4);
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}

function featureId(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function sourceToSeaDetails(): HTMLDetailsElement {
  return el<HTMLDetailsElement>("source-to-sea");
}

function closeSourceToSea(): void {
  sourceToSeaDetails().open = false;
}

function fillSourceToSea(runs: RouteRun[]): void {
  const body = el("source-to-sea-body");
  body.replaceChildren();
  for (const run of runs) {
    const tr = document.createElement("tr");
    if (run.containsSelected) {
      tr.setAttribute("aria-current", "location");
    }
    const nameCell = document.createElement("td");
    nameCell.textContent = run.name ?? copy.unnamed;
    const lengthCell = document.createElement("td");
    lengthCell.className = "hw-num";
    const formatted = formatLength(run.metres);
    lengthCell.textContent = `${formatted.value} ${formatted.unit}`;
    tr.append(nameCell, lengthCell);
    body.append(tr);
  }
}

function updatePanel(graph: GraphView, id: SegmentId | null, gap: boolean): void {
  const empty = el("empty-panel");
  const selected = el("river-panel");
  const maori = el("place-maori");
  const english = el("place-english");
  const summary = el("river-summary");
  const value = el("length-value");
  const unit = el("length-unit");
  const gapNote = el("gap-note");
  const disc = sourceToSeaDetails();

  closeSourceToSea();

  if (!id) {
    empty.hidden = false;
    selected.hidden = true;
    disc.hidden = true;
    fillSourceToSea([]);
    return;
  }

  const names = splitOfficialName(graph.name(id));
  empty.hidden = true;
  selected.hidden = false;
  if (names.maori) {
    maori.textContent = names.maori;
    maori.hidden = false;
    maori.lang = "mi";
    english.textContent = names.english;
    english.hidden = false;
  } else {
    maori.textContent = names.english;
    maori.hidden = false;
    maori.removeAttribute("lang");
    english.textContent = "";
    english.hidden = true;
  }
  gapNote.hidden = !gap;
  summary.textContent = "";
  summary.hidden = true;

  try {
    const { metres, path } = maxPathLength(graph, id);
    const formatted = formatLength(metres);
    value.textContent = formatted.value;
    unit.textContent = formatted.unit;
    fillSourceToSea(collapseRoute(graph, path, id));
    disc.hidden = false;
  } catch (err) {
    if (!(err instanceof GapError)) throw err;
    gapNote.hidden = false;
    value.textContent = "—";
    unit.textContent = "";
    disc.hidden = true;
    fillSourceToSea([]);
  }
}

function bindDock(map: MapLibreMap): void {
  const app = document.querySelector(".hw-app");
  const dock = document.querySelector(".hw-dock");
  if (!(app instanceof HTMLElement) || !(dock instanceof HTMLElement)) return;
  const mq = window.matchMedia(MOBILE_MQ);
  const sync = (): void => {
    const h = mq.matches ? Math.round(dock.getBoundingClientRect().height) : 0;
    app.style.setProperty("--dock-offset", `${h}px`);
    map.setPadding({ top: 0, right: 0, bottom: h, left: 0 });
  };
  const ro = new ResizeObserver(sync);
  ro.observe(dock);
  mq.addEventListener("change", sync);
  sync();
}

export async function mountMap(): Promise<void> {
  ensurePmtilesProtocol();
  const mapEl = el("map");
  const graphRes = await fetch("/data/reaches.bin");
  if (!graphRes.ok) throw new Error(copy.dataMissing);
  const graph = loadCompactGraph(await graphRes.arrayBuffer());
  const tilesUrl = `pmtiles://${window.location.origin}/data/reaches.pmtiles`;
  let paint = readPaint();

  const map = new MapLibreMap({
    container: "map",
    attributionControl: false,
    renderWorldCopies: false,
    minZoom: 4,
    maxZoom: 14,
    style: {
      version: 8,
      sources: {},
      layers: [
        {
          id: "background",
          type: "background",
          paint: { "background-color": paint.land },
        },
      ],
    },
    bounds: NZ_BOUNDS,
    fitBoundsOptions: { padding: 32 },
    maxBounds: [
      [165.2, -48.2],
      [179.4, -33.2],
    ],
  });

  map.on("error", (ev) => {
    console.error(ev.error || ev);
  });

  const addRivers = (): void => {
    if (map.getSource("reaches")) return;
    map.addSource("reaches", {
      type: "vector",
      tiles: [`${tilesUrl}/{z}/{x}/{y}`],
      minzoom: 4,
      maxzoom: 13,
    });
    const lineLayout = { "line-cap": "round" as const, "line-join": "bevel" as const };
    map.addLayer({
      id: "reaches",
      type: "line",
      source: "reaches",
      "source-layer": SOURCE_LAYER,
      layout: lineLayout,
      paint: {
        "line-color": paint.context,
        "line-opacity": 1,
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4,
          paint.lineContext,
          12,
          ["min", paint.lineUpstream, ["+", 0.7, ["*", 0.12, ["coalesce", ["get", "StreamOrde"], 1]]]],
        ],
      },
    });
    map.addLayer({
      id: "reaches-catchment-halo",
      type: "line",
      source: "reaches",
      "source-layer": SOURCE_LAYER,
      layout: lineLayout,
      paint: {
        "line-color": paint.upstreamHalo,
        "line-opacity": stateOpacity("catchment"),
        "line-blur": 1.2,
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4,
          paint.lineUpstreamHalo * 0.55,
          12,
          paint.lineUpstreamHalo,
        ],
      },
    });
    map.addLayer({
      id: "reaches-catchment",
      type: "line",
      source: "reaches",
      "source-layer": SOURCE_LAYER,
      layout: lineLayout,
      paint: {
        "line-color": paint.upstream,
        "line-opacity": stateOpacity("catchment"),
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4,
          paint.lineUpstream,
          12,
          paint.lineUpstream + 0.4,
        ],
      },
    });
    map.addLayer({
      id: "reaches-main-halo",
      type: "line",
      source: "reaches",
      "source-layer": SOURCE_LAYER,
      layout: lineLayout,
      paint: {
        "line-color": paint.mainHalo,
        "line-opacity": stateOpacity("main"),
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4,
          paint.lineMainHalo * 0.7,
          12,
          paint.lineMainHalo,
        ],
      },
    });
    map.addLayer({
      id: "reaches-main",
      type: "line",
      source: "reaches",
      "source-layer": SOURCE_LAYER,
      layout: lineLayout,
      paint: {
        "line-color": paint.main,
        "line-opacity": stateOpacity("main"),
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4,
          paint.lineMain,
          12,
          paint.lineMain + 0.5,
        ],
      },
    });
    map.addLayer({
      id: "reaches-down",
      type: "line",
      source: "reaches",
      "source-layer": SOURCE_LAYER,
      layout: lineLayout,
      paint: {
        "line-color": paint.downstream,
        "line-opacity": stateOpacity("downstream"),
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4,
          paint.lineDown * 0.7,
          12,
          paint.lineDown,
        ],
      },
    });
    map.addLayer({
      id: "reaches-selected",
      type: "line",
      source: "reaches",
      "source-layer": SOURCE_LAYER,
      layout: lineLayout,
      paint: {
        "line-color": paint.selected,
        "line-opacity": stateOpacity("selected"),
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4,
          paint.lineSelected * 0.65,
          12,
          paint.lineSelected,
        ],
      },
    });
    map.addLayer({
      id: "reaches-hit",
      type: "line",
      source: "reaches",
      "source-layer": SOURCE_LAYER,
      paint: {
        "line-color": "#000000",
        "line-opacity": 0,
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 8, 12, 16],
      },
    });
  };

  if (map.loaded()) addRivers();
  else map.on("load", addRivers);

  bindDock(map);
  sourceToSeaDetails().addEventListener("toggle", () => {
    const dock = document.querySelector(".hw-dock");
    dock?.classList.toggle("hw-dock--expanded", sourceToSeaDetails().open);
  });

  let painted: number[] = [];

  const stateRef = (id: number) => ({
    source: "reaches",
    sourceLayer: SOURCE_LAYER,
    id,
  });

  const setContextDim = (on: boolean): void => {
    if (!map.getLayer("reaches")) return;
    map.setPaintProperty("reaches", "line-opacity", on ? paint.opacityContext : 1);
  };

  const paintClear = (): void => {
    for (const sid of painted) {
      map.setFeatureState(stateRef(sid), {
        selected: false,
        catchment: false,
        main: false,
        downstream: false,
      });
    }
    painted = [];
    setContextDim(false);
  };

  const clear = (): void => {
    paintClear();
    updatePanel(graph, null, false);
  };

  const select = (id: number): void => {
    if (!graph.has(id)) return;
    paintClear();
    let gap = false;
    let marks = {
      selected: id as SegmentId,
      downstream: [] as SegmentId[],
      main: [] as SegmentId[],
      catchment: [] as SegmentId[],
    };
    try {
      marks = tapHighlights(graph, id);
    } catch (err) {
      if (!(err instanceof GapError)) throw err;
      gap = true;
      marks = { selected: id, downstream: [], main: [], catchment: [] };
    }
    const downSet = new Set(marks.downstream.map(Number));
    const mainSet = new Set(marks.main.map(Number));
    const catchSet = new Set(marks.catchment.map(Number));
    painted = [id, ...downSet, ...mainSet, ...catchSet];
    for (const sid of painted) {
      map.setFeatureState(stateRef(sid), {
        selected: sid === id,
        downstream: downSet.has(sid),
        main: sid !== id && mainSet.has(sid),
        catchment: sid !== id && !mainSet.has(sid) && catchSet.has(sid),
      });
    }
    setContextDim(true);
    updatePanel(graph, id, gap);
  };

  map.on("click", (ev) => {
    const box: [[number, number], [number, number]] = [
      [ev.point.x - TAP_PAD, ev.point.y - TAP_PAD],
      [ev.point.x + TAP_PAD, ev.point.y + TAP_PAD],
    ];
    const hits = map.queryRenderedFeatures(box, { layers: ["reaches-hit"] });
    hits.sort(
      (a, b) =>
        Number(b.properties?.StreamOrde ?? 0) - Number(a.properties?.StreamOrde ?? 0),
    );
    const hit = hits[0];
    const raw = hit ? (hit.id ?? hit.properties?.nzsegment) : null;
    const id = featureId(raw);
    if (id == null) {
      clear();
      return;
    }
    select(id);
  });

  map.on("mouseenter", "reaches-hit", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "reaches-hit", () => {
    map.getCanvas().style.cursor = "";
  });

  (window as unknown as { hwMap: MapLibreMap }).hwMap = map;

  el("zoom-in").addEventListener("click", () => {
    map.zoomIn();
  });
  el("zoom-out").addEventListener("click", () => {
    map.zoomOut();
  });
  el("reset-north").addEventListener("click", () => {
    map.easeTo({ bearing: 0, pitch: 0 });
  });
  window.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") return;
    if (sourceToSeaDetails().open) {
      closeSourceToSea();
      return;
    }
    clear();
  });
  window.addEventListener(THEME_EVENT, () => {
    paint = readPaint();
    applyMapPaint(map, paint);
    setContextDim(painted.length > 0);
  });
  mapEl.setAttribute("tabindex", "0");
}
