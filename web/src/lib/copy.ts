/** Visitor-facing strings. Humanize skill applied. NZ English. */

export const copy = {
  title: "Headwaters",
  subtitle: "Ki uta ki tai: from the mountains to the sea.",
  emptyTitle: "Pick a waterway",
  empty: "Click a waterway on the map, or search for one by name.",
  searchLabel: "Search for a river or stream",
  searchNone: "We can't find a river with that name yet.",
  searchIndexFailed: "River names didn't load. You can still click a waterway on the map.",
  startList: "Some rivers to start with",
  loading: "Tracing the network…",
  dataMissing: "The river data didn't load. Check your connection and try again.",
  gap: "We can't trace this stream any further. There's a gap in the mapped river network.",
  longestPath: "Longest path along this network",
  fromSourceToSea: "From source to sea",
  fromSourceToSink: "From source to an inland end",
  countryGroup: "Country",
  countryNz: "New Zealand",
  countryAu: "Australia",
  unnamed: "Unnamed stream",
  attributionCreated: "Created by Josh McArthur",
  attributionCreatedHref: "https://joshmcarthur.com",
  attributionNetwork: "River network: NIWA REC2 (CC BY-NC)",
  attributionNames: "Names: NIWA REC2 and New Zealand Gazetteer",
  attributionLicence: "https://creativecommons.org/licenses/by-nc/4.0/",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  resetNorth: "Reset north",
  terrainToggle: "3D",
  terrainLabel: "3D terrain",
  attributionTerrain: "Terrain: Mapterhorn",
  clear: "Clear selection",
  back: "Back",
  themeSwitch: "Switch colour scheme",
};

export function splitOfficialName(name: string | null | undefined): {
  maori: string;
  english: string;
} {
  if (!name) {
    return { maori: "", english: copy.unnamed };
  }
  const parts = name.split(" / ");
  if (parts.length >= 2) {
    return { maori: parts[0], english: parts.slice(1).join(" / ") };
  }
  return { maori: "", english: name };
}

export function formatLength(metres: number): { value: string; unit: string } {
  if (metres >= 1000) {
    const km = metres / 1000;
    const digits = km >= 100 ? 0 : 1;
    return { value: km.toFixed(digits), unit: "km" };
  }
  return { value: Math.round(metres).toString(), unit: "m" };
}
