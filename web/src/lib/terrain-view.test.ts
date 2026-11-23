import assert from "node:assert/strict";
import test from "node:test";
import { sceneView } from "./terrain-view.ts";

test("flat map uses style lines and no terrain mesh", () => {
  assert.deepEqual(sceneView({ terrain: false }), {
    pitch: 0,
    terrain: null,
    hillshade: "none",
    rivers: "all",
  });
});

test("3D map keeps highlight lines and hides the rest of the network", () => {
  assert.deepEqual(sceneView({ terrain: true }), {
    pitch: 60,
    terrain: { source: "terrain", exaggeration: 1.5 },
    hillshade: "visible",
    rivers: "highlights",
  });
});
