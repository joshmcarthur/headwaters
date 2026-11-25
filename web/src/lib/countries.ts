import { copy } from "./copy.ts";

export type CountryCode = "nz" | "au";

export type Country = {
  code: CountryCode;
  bounds: [[number, number], [number, number]];
  maxBounds: [[number, number], [number, number]];
  minZoom: number;
  tileMaxZoom: number;
  graphUrl: string;
  tilesPath: string;
  namesUrl: string;
  startRivers: readonly string[];
  attributionNetwork: string;
  attributionNames: string;
  attributionLicence: string;
};

export const COUNTRY_STORAGE_KEY = "headwaters-country";

export const COUNTRY_CODES: readonly CountryCode[] = ["nz", "au"];

function envCountries(): string | undefined {
  const env = import.meta.env as { PUBLIC_COUNTRIES?: string } | undefined;
  return env?.PUBLIC_COUNTRIES;
}

export function parseEnabledCountries(raw: string | undefined): CountryCode[] {
  const wanted = (raw ?? "nz")
    .split(",")
    .map((part) => part.trim().toLowerCase());
  const out: CountryCode[] = [];
  for (const code of wanted) {
    if (code !== "nz" && code !== "au") continue;
    if (!out.includes(code)) out.push(code);
  }
  return out.length > 0 ? out : ["nz"];
}

export function enabledCountries(): CountryCode[] {
  return parseEnabledCountries(envCountries());
}

export function isCountryEnabled(
  code: string,
  enabled: readonly CountryCode[] = enabledCountries(),
): code is CountryCode {
  return enabled.some((item) => item === code);
}

export const COUNTRIES: Record<CountryCode, Country> = {
  nz: {
    code: "nz",
    bounds: [
      [166.0, -47.5],
      [178.9, -34.0],
    ],
    maxBounds: [
      [165.2, -48.2],
      [179.4, -33.2],
    ],
    minZoom: 4,
    tileMaxZoom: 13,
    graphUrl: "/data/nz/reaches.bin",
    tilesPath: "/data/nz/reaches.pmtiles",
    namesUrl: "/data/nz/names.bin",
    startRivers: [
      "Waikato River",
      "Whanganui River",
      "Rangitikei River",
      "Manawatu River",
      "Te Awa Kairangi / Hutt River",
      "Waimakariri River",
      "Waitaki River",
      "Clutha River",
    ],
    attributionNetwork: "River network: NIWA REC2 (CC BY-NC)",
    attributionNames: "Names: NIWA REC2 and New Zealand Gazetteer",
    attributionLicence: "https://creativecommons.org/licenses/by-nc/4.0/",
  },
  au: {
    code: "au",
    bounds: [
      [113.38, -43.63],
      [153.63, -10.06],
    ],
    maxBounds: [
      [112.38, -44.63],
      [154.63, -9.06],
    ],
    minZoom: 2,
    tileMaxZoom: 13,
    graphUrl: "/data/au/reaches.bin",
    tilesPath: "/data/au/reaches.pmtiles",
    namesUrl: "/data/au/names.bin",
    startRivers: [
      "SWAN RIVER",
      "ORD RIVER",
      "ROPER RIVER",
      "COOPER CREEK",
      "BURDEKIN RIVER",
      "RIVER MURRAY",
      "SNOWY RIVER",
      "RIVER DERWENT",
    ],
    attributionNetwork:
      "River network: © Commonwealth of Australia (Bureau of Meteorology) 2022 (CC BY)",
    attributionNames: "Names: Bureau of Meteorology Geofabric. Modified for Headwaters.",
    attributionLicence: "https://creativecommons.org/licenses/by/4.0/",
  },
};

export type CountryResolution = {
  code: CountryCode;
  persist: boolean;
  writeQuery: boolean;
};

function queryCountry(search: string): CountryCode | null {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const c = new URLSearchParams(raw).get("c");
  if (c === "nz" || c === "au") return c;
  return null;
}

export function countryFromLocation(
  search: string,
  hash: string,
  stored: string | null,
  enabled: readonly CountryCode[] = enabledCountries(),
): CountryResolution {
  const allowed = enabled.length > 0 ? enabled : (["nz"] as const);
  const fallback = allowed.includes("nz") ? "nz" : allowed[0];
  const fromQuery = queryCountry(search);
  if (fromQuery && allowed.includes(fromQuery)) {
    return { code: fromQuery, persist: true, writeQuery: false };
  }
  if (hash.startsWith("#") && hash.length > 1) {
    return { code: fallback, persist: false, writeQuery: false };
  }
  if (stored && isCountryEnabled(stored, allowed)) {
    return { code: stored, persist: true, writeQuery: true };
  }
  return { code: fallback, persist: true, writeQuery: true };
}

export function readStoredCountry(): string | null {
  try {
    return localStorage.getItem(COUNTRY_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function persistCountry(code: CountryCode): void {
  try {
    localStorage.setItem(COUNTRY_STORAGE_KEY, code);
  } catch {
    // Ignore private-mode storage failures.
  }
}

export function countryUrl(code: CountryCode, id: number | null = null): string {
  const url = `/?c=${code}`;
  return id == null ? url : `${url}#${id}`;
}

export function mountCountrySwitch(root: HTMLElement, country: CountryCode): void {
  const inputs = root.querySelectorAll<HTMLInputElement>('input[name="country"]');
  for (const input of inputs) {
    input.checked = input.value === country;
    input.addEventListener("change", () => {
      if (!input.checked) return;
      if (input.value !== "nz" && input.value !== "au") return;
      persistCountry(input.value);
      location.assign(countryUrl(input.value));
    });
  }
}

export function applyAttribution(country: Country): void {
  const network = document.querySelector("#attr-network");
  const names = document.querySelector("#attr-names");
  if (network instanceof HTMLAnchorElement) {
    network.textContent = country.attributionNetwork;
    network.href = country.attributionLicence;
  }
  if (names instanceof HTMLElement) {
    names.textContent = country.attributionNames;
  }
}

export function countryLabel(code: CountryCode): string {
  switch (code) {
    case "nz":
      return copy.countryNz;
    case "au":
      return copy.countryAu;
    default: {
      const _never: never = code;
      return _never;
    }
  }
}
