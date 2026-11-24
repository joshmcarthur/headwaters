import { addProtocol, Map as MapLibreMap, removeProtocol } from "maplibre-gl";
import { Protocol } from "pmtiles";
import { copy, formatLength, splitOfficialName } from "../lib/copy.ts";
import { mountRiverSearch, type RiverHit } from "../lib/search.ts";
import { THEME_EVENT } from "../lib/theme.ts";
import { HILLSHADE_EXAGGERATION, sceneView } from "../lib/terrain-view.ts";
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
const MAPTERHORN_TILEJSON = "https://tiles.mapterhorn.com/tilejson.json";
const CONTEXT_RIVER_LAYER = "reaches";
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

type HistoryMode = "push" | "none" | "replace";

type HwHistory = { hw: true; depth: number };

function isHwHistory(value: unknown): value is HwHistory {
  if (value == null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return row.hw === true && typeof row.depth === "number";
}

function hwDepth(): number {
  return isHwHistory(history.state) ? history.state.depth : 0;
}

function hashSegmentId(hash: string): number | null {
  if (!hash.startsWith("#") || hash.length < 2) return null;
  return featureId(hash.slice(1));
}

function urlForSegment(id: number | null): string {
  const base = `${location.pathname}${location.search}`;
  return id == null ? base : `${base}#${id}`;
}

function sourceToSeaDetails(): HTMLDetailsElement {
  return el<HTMLDetailsElement>("source-to-sea");
}

function closeSourceToSea(): void {
  sourceToSeaDetails().open = false;
}

type LngLatBbox = [number, number, number, number];

const SEARCH_PAD = { top: 88, right: 48, bottom: 16, left: 48 };

function extendBbox(acc: LngLatBbox | null, lon: number, lat: number): LngLatBbox | null {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return acc;
  if (!acc) return [lon, lat, lon, lat];
  return [
    Math.min(acc[0], lon),
    Math.min(acc[1], lat),
    Math.max(acc[2], lon),
    Math.max(acc[3], lat),
  ];
}

function extendBboxFromCoords(acc: LngLatBbox | null, coords: unknown): LngLatBbox | null {
  if (!Array.isArray(coords) || coords.length === 0) return acc;
  if (typeof coords[0] === "number") {
    return extendBbox(acc, coords[0] as number, coords[1] as number);
  }
  let next = acc;
  for (const part of coords) next = extendBboxFromCoords(next, part);
  return next;
}

function bboxFromPathway(map: MapLibreMap, ids: number[]): LngLatBbox | null {
  if (ids.length === 0 || !map.getSource("reaches")) return null;
  const want = new Set(ids);
  const features = map.querySourceFeatures("reaches", { sourceLayer: SOURCE_LAYER });
  let bbox: LngLatBbox | null = null;
  for (const feature of features) {
    const raw = feature.id ?? feature.properties?.nzsegment;
    if (raw == null || !want.has(Number(raw))) continue;
    const geom = feature.geometry;
    if (!geom || !("coordinates" in geom)) continue;
    bbox = extendBboxFromCoords(bbox, geom.coordinates);
  }
  return bbox;
}

function frameRiver(map: MapLibreMap, bbox: LngLatBbox, duration = 800): void {
  const camera = map.cameraForBounds(
    [
      [bbox[0], bbox[1]],
      [bbox[2], bbox[3]],
    ],
    { padding: SEARCH_PAD, maxZoom: 12, bearing: map.getBearing() },
  );
  map.easeTo({
    center: camera?.center ?? [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2],
    zoom: camera?.zoom ?? 11,
    bearing: camera?.bearing ?? map.getBearing(),
    pitch: map.getPitch(),
    duration,
    essential: true,
  });
}

function bboxGrows(next: LngLatBbox, prev: LngLatBbox): boolean {
  return (
    next[0] < prev[0] - 1e-4 ||
    next[1] < prev[1] - 1e-4 ||
    next[2] > prev[2] + 1e-4 ||
    next[3] > prev[3] + 1e-4
  );
}

function framePathway(
  map: MapLibreMap,
  ids: number[],
  fallback: LngLatBbox,
  gen: number,
  currentGen: () => number,
): void {
  const fit = (bbox: LngLatBbox, duration: number, left: number): void => {
    if (gen !== currentGen()) return;
    frameRiver(map, bbox, duration);
    if (left <= 0) return;
    map.once("idle", () => {
      if (gen !== currentGen()) return;
      const loaded = bboxFromPathway(map, ids);
      if (loaded && bboxGrows(loaded, bbox)) fit(loaded, 600, left - 1);
    });
  };
  fit(bboxFromPathway(map, ids) ?? fallback, 800, 5);
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
    const link = document.createElement("a");
    link.href = `#${run.id}`;
    link.textContent = run.name ?? copy.unnamed;
    nameCell.append(link);
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

  if (!id) {
    empty.hidden = false;
    selected.hidden = true;
    disc.hidden = true;
    disc.open = false;
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
    maxPitch: 70,
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

  let terrainOn = false;
  let riversReady = false;

  const addRivers = (): void => {
    if (map.getSource("reaches")) return;
    map.addSource("terrain", {
      type: "raster-dem",
      url: MAPTERHORN_TILEJSON,
      encoding: "terrarium",
      tileSize: 512,
    });
    map.addSource("hillshade", {
      type: "raster-dem",
      url: MAPTERHORN_TILEJSON,
      encoding: "terrarium",
      tileSize: 512,
    });
    map.addLayer({
      id: "hillshade",
      type: "hillshade",
      source: "hillshade",
      layout: { visibility: "none" },
      paint: { "hillshade-exaggeration": HILLSHADE_EXAGGERATION },
    });
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
    riversReady = true;
  };

  if (map.loaded()) addRivers();
  else map.on("load", addRivers);

  bindDock(map);
  sourceToSeaDetails().addEventListener("toggle", () => {
    const dock = document.querySelector(".hw-dock");
    dock?.classList.toggle("hw-dock--expanded", sourceToSeaDetails().open);
  });

  let painted: number[] = [];
  let frameGen = 0;

  const stateRef = (id: number) => ({
    source: "reaches",
    sourceLayer: SOURCE_LAYER,
    id,
  });

  const setContextDim = (on: boolean): void => {
    if (!map.getLayer("reaches")) return;
    map.setPaintProperty("reaches", "line-opacity", on ? paint.opacityContext : 1);
  };

  const applyScene = (): void => {
    const view = sceneView({ terrain: terrainOn });
    map.setTerrain(view.terrain);
    if (map.getLayer("hillshade")) {
      map.setLayoutProperty("hillshade", "visibility", view.hillshade);
    }
    if (map.getLayer(CONTEXT_RIVER_LAYER)) {
      map.setLayoutProperty(
        CONTEXT_RIVER_LAYER,
        "visibility",
        view.rivers === "all" ? "visible" : "none",
      );
    }
    const btn = document.getElementById("terrain-toggle");
    btn?.setAttribute("aria-pressed", terrainOn ? "true" : "false");
    map.easeTo({ pitch: view.pitch });
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

  const recordHash = (id: number | null, mode: "push" | "replace"): void => {
    const next = urlForSegment(id);
    const current = `${location.pathname}${location.search}${location.hash}`;
    if (mode === "replace") {
      history.replaceState({ hw: true, depth: hwDepth() }, "", next);
      return;
    }
    if (current === next) return;
    history.pushState({ hw: true, depth: hwDepth() + 1 }, "", next);
  };

  const clear = (historyMode: HistoryMode): void => {
    paintClear();
    updatePanel(graph, null, false);
    if (historyMode === "push") recordHash(null, "push");
    if (historyMode === "replace") recordHash(null, "replace");
  };

  const viewBbox = (): LngLatBbox => {
    const bounds = map.getBounds();
    return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
  };

  const zoomToPainted = (): void => {
    const gen = ++frameGen;
    const ids = painted.slice();
    const start = (): void => {
      if (gen !== frameGen) return;
      map.stop();
      framePathway(map, ids, bboxFromPathway(map, ids) ?? viewBbox(), gen, () => frameGen);
    };
    requestAnimationFrame(() => requestAnimationFrame(start));
  };

  const select = (id: number, historyMode: HistoryMode): void => {
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
    if (historyMode === "push") recordHash(id, "push");
    if (historyMode === "replace") recordHash(id, "replace");
  };

  const searchInput = document.querySelector("#river-search");
  const searchList = document.querySelector("#river-search-list");
  const startList = document.querySelector("#start-rivers");
  const riverSearch =
    searchInput instanceof HTMLInputElement && searchList instanceof HTMLUListElement
      ? mountRiverSearch({
          input: searchInput,
          list: searchList,
          startList: startList instanceof HTMLElement ? startList : null,
          onPick: (hit: RiverHit) => {
            select(hit.id, "push");
            const gen = ++frameGen;
            const ids = painted.slice();
            const fallback = hit.bbox;
            const start = (): void => {
              if (gen !== frameGen) return;
              map.stop();
              framePathway(map, ids, fallback, gen, () => frameGen);
            };
            requestAnimationFrame(() => requestAnimationFrame(start));
          },
        })
      : null;

  const applyHash = (): void => {
    if (!riversReady) return;
    const id = hashSegmentId(location.hash);
    if (id != null && graph.has(id)) {
      select(id, "none");
      return;
    }
    clear("none");
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
    const id = featureId(hit ? (hit.id ?? hit.properties?.nzsegment) : null);
    if (id == null) {
      clear("push");
      return;
    }
    select(id, "push");
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
    map.easeTo({ bearing: 0, pitch: terrainOn ? map.getPitch() : 0 });
  });
  el("terrain-toggle").addEventListener("click", () => {
    terrainOn = !terrainOn;
    applyScene();
  });
  window.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") return;
    if (riverSearch?.close()) return;
    if (sourceToSeaDetails().open) {
      closeSourceToSea();
      return;
    }
    clear("push");
  });
  el("source-to-sea-body").addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof Element)) return;
    const link = target.closest("a[href^='#']");
    if (!(link instanceof HTMLAnchorElement)) return;
    ev.preventDefault();
    const id = hashSegmentId(link.hash);
    if (id == null) return;
    select(id, "push");
    sourceToSeaDetails().open = true;
    zoomToPainted();
  });
  el("river-back").addEventListener("click", () => {
    if (hwDepth() > 0) {
      history.back();
      return;
    }
    clear("replace");
  });
  window.addEventListener("popstate", applyHash);
  window.addEventListener("hashchange", applyHash);
  history.replaceState({ hw: true, depth: 0 }, "", `${location.pathname}${location.search}${location.hash}`);
  if (riversReady) applyHash();
  else map.on("load", applyHash);
  window.addEventListener(THEME_EVENT, () => {
    paint = readPaint();
    applyMapPaint(map, paint);
    setContextDim(painted.length > 0);
  });
  mapEl.setAttribute("tabindex", "0");
}
