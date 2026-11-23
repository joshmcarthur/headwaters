import assert from "node:assert/strict";
import test from "node:test";
import { copy, splitOfficialName } from "./copy.ts";

test("empty-state copy has no we'll", () => {
  assert.equal(
    copy.empty,
    "Click a waterway on the map, or search for one by name.",
  );
  assert.equal(copy.empty.includes("we'll"), false);
  assert.equal(copy.empty.includes("We'll"), false);
});

test("unnamed streams stay unnamed", () => {
  assert.deepEqual(splitOfficialName(null), { maori: "", english: "Unnamed stream" });
  assert.equal(copy.unnamed, "Unnamed stream");
});

test("official dual names split on the Gazetteer slash", () => {
  assert.deepEqual(splitOfficialName("Te Awa Kairangi / Hutt River"), {
    maori: "Te Awa Kairangi",
    english: "Hutt River",
  });
});

test("attribution includes Josh McArthur and data credits", () => {
  assert.equal(copy.attributionCreated, "Created by Josh McArthur");
  assert.equal(copy.attributionCreatedHref, "https://joshmcarthur.com");
  assert.match(copy.attributionNetwork, /NIWA REC2/);
  assert.match(copy.attributionNames, /Gazetteer/);
});

test("source-to-sea label is sentence case, not Routing", () => {
  assert.equal(copy.fromSourceToSea, "From source to sea");
  assert.equal(copy.fromSourceToSea.includes("Routing"), false);
});

test("3D control is a short pressed label", () => {
  assert.equal(copy.terrainToggle, "3D");
  assert.equal(copy.terrainLabel, "3D terrain");
  assert.equal(copy.attributionTerrain, "Terrain: Mapterhorn");
});

test("search copy names the field and the empty list", () => {
  assert.equal(copy.searchLabel, "Search for a river or stream");
  assert.equal(copy.searchNone, "We can't find a river with that name yet.");
  assert.equal(
    copy.searchIndexFailed,
    "River names didn't load. You can still click a waterway on the map.",
  );
  assert.equal(copy.startList, "Some rivers to start with");
});

test("theme control names the action, not the token themes", () => {
  assert.equal(copy.themeSwitch, "Switch colour scheme");
  assert.equal("themePrefSystem" in copy, false);
  assert.equal("themePrefPaper" in copy, false);
  assert.equal("themePrefDusk" in copy, false);
});
