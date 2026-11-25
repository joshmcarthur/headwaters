# Range-loaded river graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Do **not** commit — the user forbade commits this pass. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MapLibre starts without `reaches.bin`. A tap range-requests the selected-point DFS slice and heavy path only. Search range-requests one letter of `names.bin`.

**Architecture:** New `HWG2` graph and `HWN1` name index, written by `export_graph`. The browser keeps walk helpers in `graph.ts`. A `GraphStore` issues `Range` fetches, stores aligned 16 KiB blocks as Cache Storage 200s, and builds a mini `CompactGraph`. `tapHighlights` becomes selected-point. nginx (and Vite if needed) serve `.bin` with byte ranges and no gzip.

**Tech Stack:** Python 3 pipeline, Astro + MapLibre, node:test, pytest, nginx, Cache Storage. No new npm/pip dependencies.

## Global Constraints

- Spec: `docs/specs/2026-11-25-graph-range-loading-design.md`
- Static nginx only. No app server. No service worker. No new packages.
- Do not invent graph edges. Lake chords stay in the graph, not tiles.
- Production reads `HWG2` only. No v3 fallback in `MapView`.
- Cache API: never `cache.put` a 206. Store slice bytes as status 200.
- `parent_hld` sink sentinel is `0xFFFFFFFF`, not `0`.
- `name_idx` unnamed is `0xFFFF`.
- Visitor copy changes go through the humanize skill. Prefer existing `copy.loading`, `copy.dataMissing`, `copy.searchIndexFailed`.
- Do not commit.
- New Zealand English in visitor copy. Preserve macrons.

## File map

| File | Responsibility |
| --- | --- |
| `web/src/lib/hwg2.ts` | HWG2 constants, encode (tests), parse header/index/records, assemble mini-graph |
| `web/src/lib/graph-store.ts` | Range fetch, 16 KiB Cache Storage, `loadById(id)` |
| `web/src/lib/names-bin.ts` | HWN1 parse, start block, prefix range |
| `web/src/lib/graph.ts` | Keep `CompactGraph` + walks. Add `tapSelectedPoint`. Keep v3 `loadCompactGraph` for old unit tests until they move to HWG2. |
| `web/src/components/MapView.ts` | Start map first; `select` awaits `GraphStore` |
| `web/src/lib/search.ts` | Load start/prefix from `names.bin` |
| `pipeline/.../export_graph.py` | Write HWG2 + HWN1 |
| `nginx.conf` | `.bin` same as `.pmtiles` |
| `web/astro.config.mjs` | Range middleware only if Vite fails |
| `README.md`, `data/SOURCES.md`, `countries.py` | Paths: `names.bin` not `names.json` |

---

### Task 1: HWG2 encode/decode and selected-point highlights

**Files:**
- Create: `web/src/lib/hwg2.ts`
- Create: `web/src/lib/hwg2.test.ts`
- Modify: `web/src/lib/graph.ts` (`tapSelectedPoint`)
- Modify: `web/src/lib/graph.test.ts`

**Interfaces:**
- Produces: `HEADER_SIZE = 64`, `RECORD_SIZE = 24`, `PAGE_SIZE = 1024`, `SINK_HLD = 0xffffffff`, `NAME_NONE = 0xffff`
- Produces: `encodeHwg2(records: {id, down, length_m, name?, inland?}[]): ArrayBuffer`
- Produces: `parseHwg2Header(buf): { magic, count, buildId, stringsOff, indexRootOff, indexPagesOff, dfsOff, hldOff, pageSize }`
- Produces: `lookupId(buf, id): { dfsIndex, hldIndex, subtreeSize } | null`
- Produces: `miniGraphFromSlices(dfsRecords, hldRecords, clickId, strings): CompactGraph`
- Produces: `tapSelectedPoint(graph, start): TapHighlights` — catchment = upstream of start, not of mouth

Layout (little-endian):

```
header 64:
  0  magic b"HWG2"
  4  version u16 = 1
  6  flags u16 = 0
  8  count u32
 12  build_id u32
 16  strings_off u32
 20  strings_len u32
 24  index_root_off u32
 28  index_root_len u32
 32  index_pages_off u32
 36  index_pages_len u32
 40  dfs_off u32
 44  hld_off u32
 48  page_size u32 = 1024
 52  name_count u32
 56  reserved 8 = 0

string table: name_count NUL-terminated UTF-8 blobs, intern index = order
index root: ceil(count/1024) × {first_id u32, page_off u32}
index page: up to 1024 × {id, dfs_index, hld_index, subtree_size} all u32, ids sorted
DFS 24: id u32, length_m f32, name_idx u16, flags u16 (bit0 inland), subtree_size u32, pad u32
HLD 24: id u32, length_m f32, name_idx u16, flags u16, path_hi u32, parent_hld u32
```

Encode: build children from `down`; DFS from each sink (children sorted by id); `subtree_size` includes self; heavy child = largest subtree, then smaller id; HLD paths are nodes that are not a heavy child, walking heavy children toward the sink; `parent_hld` is the HLD index of `down`, or `SINK_HLD`.

- [ ] **Step 1: Write failing tests** in `web/src/lib/hwg2.test.ts` and add selected-point tests in `graph.test.ts`.

Tiny forest: 1→2→3(sink), 4→2. Inland on 3. Name "Creek" on 1 and 2.

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { encodeHwg2, lookupId, miniGraphFromSlices, parseHwg2Header } from "./hwg2.ts";
import { tapSelectedPoint, walkDownstream, walkUpstream } from "./graph.ts";

const buf = encodeHwg2([
  { id: 1, down: 2, length_m: 10, name: "Creek" },
  { id: 2, down: 3, length_m: 20, name: "Creek" },
  { id: 3, down: 0, length_m: 30, inland: true },
  { id: 4, down: 2, length_m: 5 },
]);

test("HWG2 header magic and count", () => {
  const h = parseHwg2Header(buf);
  assert.equal(h.magic, "HWG2");
  assert.equal(h.count, 4);
});

test("id index finds dfs slice of a side creek", () => {
  const hit = lookupId(buf, 4);
  assert.ok(hit);
  assert.equal(hit.subtreeSize, 1);
});

test("mini-graph of creek 4 does not include sibling 1", () => {
  const hit = lookupId(buf, 4);
  const g = miniGraphFromSlices(/* slice dfs[hit.dfsIndex, +subtree) and HLD path */);
  assert.equal(g.has(1), false);
  assert.deepEqual(walkDownstream(g, 4).map(Number), [4, 2, 3]);
  assert.deepEqual([...walkUpstream(g, 4)].map(Number), [4]);
});
```

In `graph.test.ts`, change the two basin tests that require whole-mouth catchment to `tapSelectedPoint`:

- tap `B` in `basinView`: catchment `{A, D}` (not `C, E, F`); downstream `["C","E"]`; main `["A"]`
- tap `D`: catchment empty; downstream `["B","C","E"]`; main `[]`

Keep old `tapHighlights` tests until MapView switches, or retarget them onto `tapSelectedPoint` and delete `tapHighlights` if unused.

- [ ] **Step 2: Run tests, expect FAIL** (`encodeHwg2` missing)

Run: `cd web && node --experimental-strip-types --test src/lib/hwg2.test.ts src/lib/graph.test.ts`

- [ ] **Step 3: Implement `hwg2.ts` and `tapSelectedPoint`**

`tapSelectedPoint`: `down = walkDownstream`; `up = walkUpstream(start)`; `main` via `furthestSource(start)` then walk down to start; `catchment = up` minus selected. Do not walk from the mouth.

`miniGraphFromSlices`: reconstruct `down` inside the DFS slice from parent links (DFS order + subtree sizes); append HLD rows after the click with `down` = next HLD id; last HLD `down = 0`. Feed `CompactGraph`.

- [ ] **Step 4: Run tests, expect PASS**

- [ ] **Step 5: Do not commit**

---

### Task 2: Pipeline writes HWG2

**Files:**
- Modify: `pipeline/src/headwaters_pipeline/export_graph.py` (`write_binary`, MAGIC)
- Modify: `pipeline/tests/test_export_graph.py`
- Test: same

**Interfaces:**
- Consumes: records `(id, down, length_m)`, names, inland ids
- Produces: same byte layout as `encodeHwg2`
- `build_id`: `zlib.crc32` of record ids+downs+lengths plus names, as unsigned u32

- [ ] **Step 1: Failing test** replace `test_write_binary_v3_includes_inland_ids` with HWG2:

```python
def test_write_binary_hwg2_round_trip(tmp_path):
    path = tmp_path / "reaches.bin"
    write_binary(path, [(1, 2, 10.0), (2, 0, 20.0), (4, 2, 5.0)], {1: "Creek"}, inland=[2])
    data = path.read_bytes()
    assert data[:4] == b"HWG2"
    count = int.from_bytes(data[8:12], "little")
    assert count == 3
```

Also assert side creek 4 has `subtree_size == 1` via the id index (parse header offsets).

- [ ] **Step 2: Run** `cd pipeline && python3 -m pytest tests/test_export_graph.py::test_write_binary_hwg2_round_trip -v` — FAIL

- [ ] **Step 3: Implement pack in Python** matching Task 1. Port the TS DFS/HLD logic; do not emit HWG1.

- [ ] **Step 4: pytest tests/test_export_graph.py -v PASS**

- [ ] **Step 5: Do not commit**

---

### Task 3: GraphStore range loader + Cache Storage

**Files:**
- Create: `web/src/lib/range-cache.ts`
- Create: `web/src/lib/graph-store.ts`
- Create: `web/src/lib/graph-store.test.ts`

**Interfaces:**
- Produces: `fetchRange(url, start, endExclusive, cache: CacheLike): Promise<ArrayBuffer>`
- Produces: `align16k(start, end): { pageStart, pageEnd }` — 16384-byte pages
- Produces: `class GraphStore { constructor(url: string, fetchImpl?, cacheImpl?); warmup(): Promise<void>; loadById(id: number): Promise<CompactGraph>; }`
- `warmup`: GET header 64 bytes with `{ cache: "reload" }`; if `build_id` ≠ stored meta, `caches.delete`; then fetch string table + index root; cache as 200s
- `loadById`: root binary search → range index page → DFS slice + HLD peek `path_hi` → HLD `[hldIndex, pathHi)` → extra HLD jumps while `parent_hld !== SINK_HLD` → `miniGraphFromSlices`
- Cache key: `${url}#${pageStart}-${pageEnd}` status 200. Ignore `put` quota errors.

- [ ] **Step 1: Failing test** with a fake fetch that records `Range` headers and an in-memory `Map` cache. Encode a HWG2 buffer. Assert first `loadById(4)` issues ranges; second `loadById(4)` issues none for those pages. Assert a `build_id` change in a second header reload deletes the map.

- [ ] **Step 2: Run test, FAIL**

- [ ] **Step 3: Implement range-cache + GraphStore**

- [ ] **Step 4: PASS**

- [ ] **Step 5: Do not commit**

---

### Task 4: MapView starts without the national graph

**Files:**
- Modify: `web/src/components/MapView.ts`
- Test: `web/src/lib/graph.test.ts` already covers highlight math. MapView has no unit test file; do not add a React-style harness. Verify with `npm test` plus a later Vite range check.

**Interfaces:**
- Consumes: `GraphStore`
- `mountMap`: do not `await fetch(graphUrl)` before `new MapLibreMap`
- After map construct: `store.warmup()` without awaiting paint
- `select(id)`: `const g = await store.loadById(Number(id))`; use `tapSelectedPoint(g, id)`; generation token so a stale tap does not paint
- Hash apply: same `loadById`
- Unknown id / fetch throw: `copy.dataMissing` or clear selection as spec
- Until slices return, keep `copy.loading` on the panel if that path already exists; otherwise leave panel until ready (do not add new visitor strings unless required)

- [ ] **Step 1: Confirm `tapHighlights` is unused after the switch** — grep; remove import

- [ ] **Step 2: Edit `mountMap` as above**

- [ ] **Step 3: `cd web && npm test` PASS**

- [ ] **Step 4: Do not commit**

---

### Task 5: `names.bin` (HWN1) pipeline + search

**Files:**
- Modify: `pipeline/.../export_graph.py` — `write_names_bin`, stop writing `names.json` (or write both until README switch; spec says drop JSON)
- Modify: `pipeline/src/headwaters_pipeline/countries.py` docstring
- Create parse/encode in `web/src/lib/names-bin.ts` + `names-bin.test.ts`
- Modify: `web/src/lib/search.ts` `loadRiverIndex` / start-list load
- Modify: `web/src/lib/countries.ts` `namesUrl` → `/data/{nz,au}/names.bin`
- Modify: `web/src/lib/countries.test.ts`

**HWN1 layout:**

```
0  magic b"HWN1"
4  version u16 = 1
6  flags u16 = 0
8  build_id u32  (same as reaches.bin)
12 start_count u32
16 start_off u32
20 prefix_dir_off u32  # 27 × {off u32, len u32}  index 0='a' … 25='z'  26=other
24 records follow
```

Each hit: `name_len u16`, name UTF-8, `id u32`, `metres f32`, `bbox 4×f32`.

Fold first letter as `search.ts` `fold`.

- [ ] **Step 1: Failing Python test** write two rivers "Murray" and "Avon", assert magic, start block for `["Murray"]`, prefix `m` contains Murray.

- [ ] **Step 2: Failing TS test** parse that buffer; `prefixLetter("Murray") === "m"`.

- [ ] **Step 3: Implement writer + `loadRiverIndex` from a prefix fetch.** `mountRiverSearch` start list: fetch start block once (range 0..start_end or `loadStartHits(url)`). First query letter fetches that prefix span via `fetchRange`.

- [ ] **Step 4: pytest + npm test PASS**

- [ ] **Step 5: Do not commit**

---

### Task 6: nginx, Vite range, docs, rebuild check

**Files:**
- Modify: `nginx.conf`
- Modify: `web/astro.config.mjs` only if Step 2 fails
- Modify: `README.md`, `data/SOURCES.md`

```
location ~* \.bin$ {
    gzip off;
    add_header Accept-Ranges bytes;
}
```

- [ ] **Step 1: nginx.conf** as above (`.bin` not gzipped)

- [ ] **Step 2: Vite range probe**

Run a tiny `curl -I` / `curl --range` against `npm run dev` for a dummy file in `web/public/data/` if present; if no file, write a 32-byte fixture in tests instead and skip live probe. If Vite returns 200 whole file for `Range`, add `astro.config.mjs` vite middleware:

```js
export default defineConfig({
  srcDir: "./src",
  publicDir: "./public",
  vite: {
    plugins: [{
      name: "bin-range",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          // if url ends .bin and Range present, fs.read slice, 206
          next();
        });
      },
    }],
  },
});
```

Implement for real if the probe fails.

- [ ] **Step 3: README / SOURCES** — HWG2, `names.bin`, gzip off, selected-point tap, sizes as “rebuild to measure”

- [ ] **Step 4: `cd pipeline && python3 -m pytest tests -v` and `cd web && npm test`**

- [ ] **Step 5: Do not commit**

---

## Spec coverage

| Spec | Task |
| --- | --- |
| Map paints first | 4 |
| DFS + HLD range tap | 1, 3, 4 |
| Selected-point highlight | 1, 4 |
| Cache Storage aligned 200s, `build_id` bust | 3 |
| No 206 put | 3 |
| `names.bin` prefix + start block | 5 |
| nginx Accept-Ranges, no gzip | 6 |
| No tile rebuild | (none) |
| HWG2 only in production | 2, 4 |
| Vite Range open issue | 6 |
| Humanize | 4 uses existing copy |

## Self-review

- No v3 production path. Unit tests may keep `encodeCompact` until unused.
- `tapHighlights` deleted or unused after Task 4.
- Python and TS encoders must match Task 1 layout; Task 2 test should decode with the same offsets.
