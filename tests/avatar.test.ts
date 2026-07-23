import { test } from "node:test";
import assert from "node:assert/strict";
import { initials, pickAvatarColor } from "../src/lib/avatar";

test("initials from a full name", () => {
  assert.equal(initials("Ada Lovelace"), "AL");
});

test("initials from a single name", () => {
  assert.equal(initials("Ada"), "AD");
});

test("initials fall back to ? when empty", () => {
  assert.equal(initials("   "), "?");
});

test("pickAvatarColor is deterministic and returns a hex color", () => {
  const a = pickAvatarColor("ada@example.com");
  const b = pickAvatarColor("ada@example.com");
  assert.equal(a, b);
  assert.match(a, /^#[0-9a-f]{6}$/i);
});
