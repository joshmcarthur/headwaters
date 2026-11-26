import assert from "node:assert/strict";
import test from "node:test";
import { SNAP_FULL, SNAP_HALF, SNAP_PEEK, cycleSnapIndex, framePadding } from "./sheet.ts";

test("sheet handle cycles peek, half, then full", () => {
  assert.equal(cycleSnapIndex(SNAP_PEEK), SNAP_HALF);
  assert.equal(cycleSnapIndex(SNAP_HALF), SNAP_FULL);
  assert.equal(cycleSnapIndex(SNAP_FULL), SNAP_PEEK);
});

test("an unknown snap index starts the cycle at half", () => {
  assert.equal(cycleSnapIndex(0), SNAP_HALF);
});

test("frame padding keeps the search fallback when the map has none", () => {
  assert.deepEqual(framePadding({}), {
    top: 88,
    right: 48,
    bottom: 16,
    left: 48,
  });
});

test("frame padding uses the live sheet and header when they are larger", () => {
  assert.deepEqual(
    framePadding({ top: 120, right: 0, bottom: 200, left: 0 }),
    { top: 120, right: 48, bottom: 200, left: 48 },
  );
});
