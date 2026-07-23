import { test, expect } from "@playwright/test";

// The `request` fixture keeps its own cookie jar and does NOT send an Origin
// header unless we add one — perfect for exercising both the auth gate and the
// CSRF (same-origin) guard.
const BASE = "http://localhost:4020";
const RUN = Date.now();

test("auth gate, validation, and CSRF are enforced", async ({ request }) => {
  // Unauthenticated read is rejected.
  expect((await request.get("/api/channels")).status()).toBe(401);

  // Sign up (same-origin) to obtain a session cookie.
  const signup = await request.post("/api/auth/signup", {
    headers: { origin: BASE },
    data: {
      displayName: "API Tester",
      email: `api+${RUN}@example.com`,
      password: "supersecret",
    },
  });
  expect(signup.status()).toBe(200);

  // Authenticated read now works.
  expect((await request.get("/api/channels")).status()).toBe(200);

  // CSRF: a foreign Origin is blocked.
  const foreign = await request.post("/api/channels/general/messages", {
    headers: { origin: "https://evil.example" },
    data: { body: "hi" },
  });
  expect(foreign.status()).toBe(403);

  // CSRF: a missing Origin on a mutation is blocked.
  const noOrigin = await request.post("/api/channels/general/messages", {
    data: { body: "hi" },
  });
  expect(noOrigin.status()).toBe(403);

  // Validation: empty and oversize bodies are rejected.
  expect(
    (
      await request.post("/api/channels/general/messages", {
        headers: { origin: BASE },
        data: { body: "" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/channels/general/messages", {
        headers: { origin: BASE },
        data: { body: "x".repeat(4001) },
      })
    ).status(),
  ).toBe(400);

  // Unknown channel → 404.
  expect(
    (
      await request.post("/api/channels/does-not-exist/messages", {
        headers: { origin: BASE },
        data: { body: "hi" },
      })
    ).status(),
  ).toBe(404);

  // Duplicate channel slug → 409.
  await request.post("/api/channels", {
    headers: { origin: BASE },
    data: { name: `Dup ${RUN}` },
  });
  const dup = await request.post("/api/channels", {
    headers: { origin: BASE },
    data: { name: `dup ${RUN}` },
  });
  expect(dup.status()).toBe(409);
});

test("per-user rate limit returns 429 after the burst allowance", async ({
  request,
}) => {
  await request.post("/api/auth/signup", {
    headers: { origin: BASE },
    data: {
      displayName: "Rate Tester",
      email: `rate+${RUN}@example.com`,
      password: "supersecret",
    },
  });

  const statuses: number[] = [];
  for (let i = 0; i < 12; i++) {
    const res = await request.post("/api/channels/showcase/messages", {
      headers: { origin: BASE },
      data: { body: `rate ${i}` },
    });
    statuses.push(res.status());
  }

  expect(statuses.filter((s) => s === 200).length).toBe(10);
  expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
});

test("sign out of all devices invalidates the session", async ({ request }) => {
  await request.post("/api/auth/signup", {
    headers: { origin: BASE },
    data: {
      displayName: "Logout Tester",
      email: `logout+${RUN}@example.com`,
      password: "supersecret",
    },
  });
  // Authenticated before sign-out.
  expect((await request.get("/api/channels")).status()).toBe(200);

  const out = await request.post("/api/auth/logout", {
    headers: { origin: BASE },
    data: { scope: "all" },
  });
  expect(out.status()).toBe(200);

  // Session is gone afterward.
  expect((await request.get("/api/channels")).status()).toBe(401);
});
