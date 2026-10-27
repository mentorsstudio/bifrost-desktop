// Huginn's wardrobe: season → outfit, stored preference → outfit (src/huginn/wardrobe.ts).
// Huginn's own adornments (Bifrost).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OUTFIT_SELECTIONS, OUTFIT_LABELS, SeasonCache, easterDate, parseOutfit, resolveOutfit,
  seasonalOutfit, wardrobeHeader,
} from "../src/huginn/wardrobe.ts";
import { DEFAULT_SETTINGS } from "../src/core/state.ts";

/** A local calendar day, at noon so no time zone can push it into the next one. */
const day = (y, m, d) => new Date(y, m - 1, d, 12);
const season = (y, m, d) => seasonalOutfit(day(y, m, d));

test("frost scarf for Yule, December 21 to January 6", () => {
  assert.equal(season(2026, 12, 20), "none");
  assert.equal(season(2026, 12, 21), "frostScarf");
  assert.equal(season(2027, 1, 1), "frostScarf");
  assert.equal(season(2027, 1, 6), "frostScarf");
  assert.equal(season(2027, 1, 7), "none");
});

test("star crown at midsummer, June 19 to 25", () => {
  assert.equal(season(2026, 6, 18), "none");
  assert.equal(season(2026, 6, 19), "starCrown");
  assert.equal(season(2026, 6, 25), "starCrown");
  assert.equal(season(2026, 6, 26), "none");
});

test("lantern for the long nights, October 31 to November 2", () => {
  assert.equal(season(2026, 10, 30), "none");
  for (const [m, d] of [[10, 31], [11, 1], [11, 2]]) assert.equal(season(2026, m, d), "lantern");
  assert.equal(season(2026, 11, 3), "none");
});

test("Easter falls where the calendar says", () => {
  assert.deepEqual(easterDate(2026), [4, 5]);
  assert.deepEqual(easterDate(2027), [3, 28]);
  assert.deepEqual(easterDate(2028), [4, 16]);
  assert.deepEqual(easterDate(2019), [4, 21]);
});

test("rune band from two days before Easter to the day after", () => {
  assert.equal(season(2026, 4, 2), "none");
  for (const d of [3, 4, 5, 6]) assert.equal(season(2026, 4, d), "runeBand", `April ${d}`);
  assert.equal(season(2026, 4, 7), "none");
  assert.equal(season(2027, 3, 26), "runeBand");
  assert.equal(season(2027, 3, 30), "none");
});

test("a daylight-saving change just before Easter doesn't shift the count", () => {
  assert.equal(seasonalOutfit(new Date(2026, 3, 3, 0, 0)), "runeBand");
  assert.equal(seasonalOutfit(new Date(2026, 3, 6, 23, 59)), "runeBand");
  assert.equal(seasonalOutfit(new Date(2026, 3, 7, 0, 0)), "none");
});

test("auto dresses for the season, any other choice is worn as is", () => {
  const d = day(2026, 11, 1);
  assert.equal(resolveOutfit("auto", d), "lantern");
  assert.equal(resolveOutfit("none", d), "none");
  assert.equal(resolveOutfit("helm", d), "helm");
});

test("Huginn's adornments, in the view's order", () => {
  assert.deepEqual([...OUTFIT_SELECTIONS], [
    "auto", "none", "auroraHalo", "runeBand", "frostScarf", "starCrown", "helm", "lantern",
  ]);
  for (const sel of OUTFIT_SELECTIONS) assert.ok(OUTFIT_LABELS[sel], `${sel} has a label`);
});

test("a stored preference is read back as it was saved", () => {
  for (const sel of OUTFIT_SELECTIONS) assert.equal(parseOutfit(sel), sel);
});

test("removed, unknown or missing preferences mean auto", () => {
  for (const raw of ["topHat", "beanie", "witchHat", "pumpkin", "totallyUnknown", "", "Helm"]) {
    assert.equal(parseOutfit(raw), "auto", JSON.stringify(raw));
  }
  for (const raw of [undefined, null, 42, true, {}, ["helm"]]) {
    assert.equal(parseOutfit(raw), "auto", String(raw));
  }
});

test("preferences from before the wardrobe start on auto", () => {
  assert.equal(DEFAULT_SETTINGS.mochiOutfit, "auto");
  // What main.ts does with a settings.json that has no mochiOutfit key.
  const old = { soundEnabled: false, model: "x" };
  const merged = { ...DEFAULT_SETTINGS, ...old };
  assert.equal(parseOutfit(merged.mochiOutfit), "auto");
});

test("the wardrobe header names the hovered outfit, else the current choice", () => {
  const d = day(2026, 11, 1);
  assert.equal(wardrobeHeader(null, "auto", d), "Auto · Lantern");
  assert.equal(wardrobeHeader(null, "starCrown", d), "Star crown");
  assert.equal(wardrobeHeader("auto", "helm", d), "Auto · follows the seasons (now: Lantern)");
  assert.equal(wardrobeHeader("frostScarf", "auto", d), "Frost scarf");
  assert.equal(wardrobeHeader(null, "auto", day(2026, 5, 1)), "Auto · None");
});

test("the per-frame season lookup follows the calendar day", () => {
  const cache = new SeasonCache();
  assert.equal(cache.get("auto", day(2026, 10, 30)), "none");
  assert.equal(cache.get("auto", new Date(2026, 9, 31, 0, 0, 1)), "lantern");
  assert.equal(cache.get("helm", day(2026, 10, 31)), "helm");
  assert.equal(cache.get("auto", day(2026, 12, 24)), "frostScarf");
});
