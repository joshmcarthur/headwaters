import assert from "node:assert/strict";
import test from "node:test";
import {
  cyclePreference,
  readPreference,
  resolveTheme,
} from "./theme.ts";

test("system follows the device", () => {
  assert.equal(resolveTheme("system", true), "dusk");
  assert.equal(resolveTheme("system", false), "paper");
});

test("explicit preference ignores the device", () => {
  assert.equal(resolveTheme("paper", true), "paper");
  assert.equal(resolveTheme("dusk", false), "dusk");
});

test("invalid stored value is system", () => {
  assert.equal(readPreference(null), "system");
  assert.equal(readPreference("contrast"), "system");
  assert.equal(readPreference("paper"), "paper");
});

test("cycle wraps system → paper → dusk → system", () => {
  assert.equal(cyclePreference("system"), "paper");
  assert.equal(cyclePreference("paper"), "dusk");
  assert.equal(cyclePreference("dusk"), "system");
});
