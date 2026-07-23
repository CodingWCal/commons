import { test } from "node:test";
import assert from "node:assert/strict";
import {
  channelSchema,
  loginSchema,
  messageSchema,
  signupSchema,
} from "../src/lib/validations";

test("signup requires an 8+ character password", () => {
  assert.equal(
    signupSchema.safeParse({ displayName: "Ada", email: "a@b.com", password: "short" })
      .success,
    false,
  );
  assert.equal(
    signupSchema.safeParse({ displayName: "Ada", email: "a@b.com", password: "longenough" })
      .success,
    true,
  );
});

test("signup normalizes email (trim + lowercase)", () => {
  const result = signupSchema.safeParse({
    displayName: "Ada",
    email: "  A@B.COM ",
    password: "longenough",
  });
  assert.ok(result.success);
  assert.equal(result.data.email, "a@b.com");
});

test("login rejects an invalid email", () => {
  assert.equal(loginSchema.safeParse({ email: "nope", password: "x" }).success, false);
});

test("message body must be 1..4000 chars", () => {
  assert.equal(messageSchema.safeParse({ body: "" }).success, false);
  assert.equal(messageSchema.safeParse({ body: "hi" }).success, true);
  assert.equal(messageSchema.safeParse({ body: "x".repeat(4001) }).success, false);
});

test("channel name needs at least 2 characters", () => {
  assert.equal(channelSchema.safeParse({ name: "a" }).success, false);
  assert.equal(channelSchema.safeParse({ name: "help" }).success, true);
});
