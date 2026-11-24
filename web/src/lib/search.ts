import { copy, splitOfficialName } from "./copy.ts";

export type RiverHit = {
  name: string;
  id: number;
  metres: number;
  bbox: [number, number, number, number];
};

export const START_RIVERS = [
  "Waikato River",
  "Whanganui River",
  "Rangitikei River",
  "Manawatu River",
  "Te Awa Kairangi / Hutt River",
  "Waimakariri River",
  "Waitaki River",
  "Clutha River",
] as const;

const DEFAULT_LIMIT = 8;

function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function needles(name: string): string[] {
  const parts = name.split(" / ").map((part) => fold(part.trim()));
  return [fold(name), ...parts];
}

function matchRank(name: string, query: string): number | null {
  const q = fold(query.trim());
  if (!q) return null;
  let best: number | null = null;
  for (const n of needles(name)) {
    if (!n) continue;
    let rank: number | null = null;
    if (n === q) rank = 0;
    else if (n.startsWith(q)) rank = 1;
    else if (n.includes(q)) rank = 2;
    if (rank != null && (best == null || rank < best)) best = rank;
  }
  return best;
}

export function searchRivers(
  rivers: RiverHit[],
  query: string,
  limit: number = DEFAULT_LIMIT,
): RiverHit[] {
  const q = query.trim();
  if (!q) return [];
  const ranked = rivers
    .map((river) => {
      const rank = matchRank(river.name, q);
      return rank == null ? null : { river, rank };
    })
    .filter((row): row is { river: RiverHit; rank: number } => row != null);
  ranked.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.river.metres !== b.river.metres) return b.river.metres - a.river.metres;
    return a.river.name.localeCompare(b.river.name);
  });
  return ranked.slice(0, limit).map((row) => row.river);
}

export function hitForQuery(
  rivers: RiverHit[],
  query: string,
  active = 0,
): RiverHit | null {
  const rows = searchRivers(rivers, query);
  if (rows.length === 0) return null;
  const i = Math.max(0, Math.min(active, rows.length - 1));
  return rows[i] ?? null;
}

export function resolveNames(
  rivers: RiverHit[],
  names: readonly string[],
): RiverHit[] {
  const byName = new Map(rivers.map((river) => [river.name, river]));
  const out: RiverHit[] = [];
  for (const name of names) {
    const hit = byName.get(name);
    if (hit) out.push(hit);
  }
  return out;
}

function isHit(value: unknown): value is RiverHit {
  if (value == null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  const bbox = row.bbox;
  return (
    typeof row.name === "string" &&
    typeof row.id === "number" &&
    typeof row.metres === "number" &&
    Array.isArray(bbox) &&
    bbox.length === 4 &&
    bbox.every((n) => typeof n === "number")
  );
}

export async function loadRiverIndex(
  url: string = "/data/names.json",
): Promise<RiverHit[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("names missing");
  const data: unknown = await res.json();
  if (!Array.isArray(data)) throw new Error("names invalid");
  const rivers: RiverHit[] = [];
  for (const row of data) {
    if (isHit(row)) rivers.push(row);
  }
  return rivers;
}

function escapeText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function optionLabel(name: string): string {
  const parts = splitOfficialName(name);
  if (parts.maori) {
    return `<span lang="mi">${escapeText(parts.maori)}</span><span class="hw-search__ctx">${escapeText(parts.english)}</span>`;
  }
  return `<span>${escapeText(parts.english)}</span>`;
}

export type RiverSearchHandle = {
  close: () => boolean;
};

export function mountRiverSearch(opts: {
  input: HTMLInputElement;
  list: HTMLUListElement;
  startList: HTMLElement | null;
  onPick: (hit: RiverHit) => void;
  load?: () => Promise<RiverHit[]>;
}): RiverSearchHandle {
  let rivers: RiverHit[] = [];
  let hits: RiverHit[] = [];
  let active = 0;
  let open = false;
  let loaded = false;

  const setOpen = (next: boolean): void => {
    open = next;
    opts.input.setAttribute("aria-expanded", next ? "true" : "false");
    opts.list.hidden = !next;
  };

  const paintList = (rows: RiverHit[], emptyText: string | null): void => {
    hits = rows;
    active = 0;
    opts.list.replaceChildren();
    if (rows.length === 0) {
      const li = document.createElement("li");
      li.className = "hw-search__opt";
      li.textContent = emptyText ?? copy.searchNone;
      opts.list.append(li);
      setOpen(true);
      return;
    }
    rows.forEach((hit, i) => {
      const li = document.createElement("li");
      li.id = `${opts.input.id}-opt-${i}`;
      li.className = "hw-search__opt";
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", i === 0 ? "true" : "false");
      li.innerHTML = optionLabel(hit.name);
      li.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
        pick(hit);
      });
      opts.list.append(li);
    });
    setOpen(true);
  };

  const markActive = (): void => {
    const items = opts.list.querySelectorAll('[role="option"]');
    items.forEach((item, i) => {
      item.setAttribute("aria-selected", i === active ? "true" : "false");
    });
    const current = items[active];
    if (current) opts.input.setAttribute("aria-activedescendant", current.id);
    else opts.input.removeAttribute("aria-activedescendant");
  };

  const pick = (hit: RiverHit): void => {
    opts.input.value = hit.name;
    setOpen(false);
    opts.onPick(hit);
  };

  const runQuery = (): void => {
    if (!loaded) return;
    const q = opts.input.value;
    if (!q.trim()) {
      setOpen(false);
      hits = [];
      return;
    }
    paintList(searchRivers(rivers, q), copy.searchNone);
    markActive();
  };

  const fillStart = (): void => {
    if (!opts.startList) return;
    const chosen = resolveNames(rivers, START_RIVERS);
    opts.startList.replaceChildren();
    for (const hit of chosen) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hw-btn hw-btn--quiet";
      const parts = splitOfficialName(hit.name);
      btn.textContent = parts.maori ? `${parts.maori} / ${parts.english}` : parts.english;
      btn.addEventListener("click", () => pick(hit));
      li.append(btn);
      opts.startList.append(li);
    }
  };

  opts.input.addEventListener("input", runQuery);
  opts.input.addEventListener("focus", runQuery);
  opts.input.addEventListener("keydown", (ev) => {
    if (ev.isComposing) return;
    if (ev.key === "ArrowDown") {
      if (!open) return;
      ev.preventDefault();
      active = Math.min(active + 1, Math.max(hits.length - 1, 0));
      markActive();
      return;
    }
    if (ev.key === "ArrowUp") {
      if (!open) return;
      ev.preventDefault();
      active = Math.max(active - 1, 0);
      markActive();
      return;
    }
    if (ev.key === "Enter") {
      ev.preventDefault();
      const hit = hitForQuery(rivers, opts.input.value, active);
      if (hit) pick(hit);
      else setOpen(false);
      return;
    }
    if (ev.key === "Escape") {
      if (!open) return;
      ev.preventDefault();
      setOpen(false);
    }
  }, true);

  const loader = opts.load ?? (() => loadRiverIndex());
  loader()
    .then((data) => {
      rivers = data;
      loaded = true;
      fillStart();
    })
    .catch(() => {
      loaded = true;
      rivers = [];
      if (opts.startList) {
        opts.startList.replaceChildren();
        const li = document.createElement("li");
        li.textContent = copy.searchIndexFailed;
        opts.startList.append(li);
      }
    });

  return {
    close: () => {
      if (!open) return false;
      setOpen(false);
      return true;
    },
  };
}
