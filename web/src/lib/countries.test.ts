import assert from "node:assert/strict";
import test from "node:test";
import {
  COUNTRIES,
  countryFromLocation,
  countryLabel,
  countryShortLabel,
  countryUrl,
  parseEnabledCountries,
} from "./countries.ts";

const both = ["nz", "au"] as const;

test("explicit c=au wins over a stored New Zealand preference", () => {
  const resolved = countryFromLocation("?c=au", "", "nz", both);
  assert.equal(resolved.code, "au");
  assert.equal(resolved.persist, true);
  assert.equal(resolved.writeQuery, false);
});

test("an old hash with no c is New Zealand", () => {
  const resolved = countryFromLocation("", "#9260925", "au");
  assert.equal(resolved.code, "nz");
  assert.equal(resolved.persist, false);
  assert.equal(resolved.writeQuery, false);
});

test("stored country is used when the URL has no c and no hash", () => {
  const resolved = countryFromLocation("", "", "au", both);
  assert.equal(resolved.code, "au");
  assert.equal(resolved.writeQuery, true);
});

test("disabled countries are ignored", () => {
  const fromQuery = countryFromLocation("?c=au", "", "au", ["nz"]);
  assert.equal(fromQuery.code, "nz");
  const fromStore = countryFromLocation("", "", "au", ["nz"]);
  assert.equal(fromStore.code, "nz");
});

test("PUBLIC_COUNTRIES defaults to New Zealand only", () => {
  assert.deepEqual(parseEnabledCountries(undefined), ["nz"]);
  assert.deepEqual(parseEnabledCountries("nz,au"), ["nz", "au"]);
  assert.deepEqual(parseEnabledCountries("au"), ["au"]);
  assert.deepEqual(parseEnabledCountries("nope"), ["nz"]);
});

test("default country is New Zealand", () => {
  const resolved = countryFromLocation("", "", null);
  assert.equal(resolved.code, "nz");
});

test("australia data paths sit under /data/au", () => {
  assert.equal(COUNTRIES.au.graphUrl, "/data/au/reaches.bin");
  assert.equal(COUNTRIES.au.tilesPath, "/data/au/reaches.pmtiles");
  assert.equal(COUNTRIES.au.namesUrl, "/data/au/names.bin");
  assert.equal(COUNTRIES.au.minZoom, 2);
  assert.match(COUNTRIES.au.attributionNetwork, /Bureau of Meteorology/);
  assert.match(COUNTRIES.au.attributionLicence, /by\/4\.0/);
  assert.equal(COUNTRIES.au.startRivers.length, 8);
  assert.ok(COUNTRIES.au.startRivers.includes("COOPER CREEK"));
  assert.ok(COUNTRIES.au.startRivers.includes("RIVER MURRAY"));
});

test("country URLs drop the previous hash", () => {
  assert.equal(countryUrl("au"), "/?c=au");
  assert.equal(countryUrl("nz", 9260925), "/?c=nz#9260925");
});

test("country labels are New Zealand and Australia", () => {
  assert.equal(countryLabel("nz"), "New Zealand");
  assert.equal(countryLabel("au"), "Australia");
  assert.equal(countryShortLabel("nz"), "NZ");
  assert.equal(countryShortLabel("au"), "AU");
});
