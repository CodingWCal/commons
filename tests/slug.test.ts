import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify } from "../src/lib/slug";

test("slugify lowercases and hyphenates", () => {
  assert.equal(slugify("Week 2 — Help!"), "week-2-help");
});

test("slugify trims surrounding whitespace and hyphens", () => {
  assert.equal(slugify("  General  "), "general");
  assert.equal(slugify("--hi--"), "hi");
});

test("slugify strips accents", () => {
  assert.equal(slugify("Café Talk"), "cafe-talk");
});

test("slugify returns empty string when nothing usable", () => {
  assert.equal(slugify("###"), "");
  assert.equal(slugify("   "), "");
});
