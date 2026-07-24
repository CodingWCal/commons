import { test, expect } from "@playwright/test";

// The `request` fixture keeps its own cookie jar and does NOT send an Origin
// header unless we add one — perfect for exercising both the auth gate and the
// CSRF (same-origin) guard.
const BASE = "http://localhost:4020";
const RUN = Date.now();

type Ctx = Awaited<ReturnType<typeof newSignedInCtx>>;

async function newSignedInCtx(
  playwright: import("@playwright/test").PlaywrightWorkerArgs["playwright"],
  email: string,
) {
  const ctx = await playwright.request.newContext({ baseURL: BASE });
  await ctx.post("/api/auth/signup", {
    headers: { origin: BASE },
    data: { displayName: email, email, password: "supersecret" },
  });
  return ctx;
}

async function postMessage(ctx: Ctx, body: string): Promise<number> {
  const res = await ctx.post("/api/channels/general/messages", {
    headers: { origin: BASE },
    data: { body },
  });
  const data = (await res.json()) as { message: { id: number } };
  return data.message.id;
}

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

test("reactions toggle on and off, and reject unknown emoji", async ({ playwright }) => {
  const ctx = await newSignedInCtx(playwright, `react+${RUN}@example.com`);
  const id = await postMessage(ctx, `reaction target ${RUN}`);

  const on = await ctx.post(`/api/messages/${id}/reactions`, {
    headers: { origin: BASE },
    data: { emoji: "👍" },
  });
  const onData = (await on.json()) as {
    reactions: { emoji: string; count: number }[];
  };
  expect(onData.reactions.find((r) => r.emoji === "👍")?.count).toBe(1);

  const off = await ctx.post(`/api/messages/${id}/reactions`, {
    headers: { origin: BASE },
    data: { emoji: "👍" },
  });
  expect(((await off.json()) as { reactions: unknown[] }).reactions.length).toBe(0);

  const bad = await ctx.post(`/api/messages/${id}/reactions`, {
    headers: { origin: BASE },
    data: { emoji: "🚀" },
  });
  expect(bad.status()).toBe(400);

  await ctx.dispose();
});

test("only the author (or an admin) can delete a message", async ({ playwright }) => {
  const author = await newSignedInCtx(playwright, `author+${RUN}@example.com`);
  const other = await newSignedInCtx(playwright, `other+${RUN}@example.com`);
  const id = await postMessage(author, `delete target ${RUN}`);

  // A different, non-admin user cannot delete it.
  expect(
    (await other.delete(`/api/messages/${id}`, { headers: { origin: BASE } })).status(),
  ).toBe(403);

  // The author can.
  expect(
    (await author.delete(`/api/messages/${id}`, { headers: { origin: BASE } })).status(),
  ).toBe(200);

  await author.dispose();
  await other.dispose();
});

test("search finds a message by its content", async ({ playwright }) => {
  const ctx = await newSignedInCtx(playwright, `search+${RUN}@example.com`);
  const term = `xyzzy${RUN}`;
  await postMessage(ctx, `a distinctive ${term} token`);

  const res = await ctx.get(`/api/search?q=${term}`);
  const data = (await res.json()) as { results: { body: string }[] };
  expect(data.results.length).toBeGreaterThan(0);
  expect(data.results[0].body).toContain(term);

  await ctx.dispose();
});

test("only the author can edit a message; edits set editedAt", async ({ playwright }) => {
  const author = await newSignedInCtx(playwright, `editor+${RUN}@example.com`);
  const other = await newSignedInCtx(playwright, `editorother+${RUN}@example.com`);
  const id = await postMessage(author, `original ${RUN}`);

  // A non-author cannot edit.
  const forbidden = await other.patch(`/api/messages/${id}`, {
    headers: { origin: BASE },
    data: { body: "hijacked" },
  });
  expect(forbidden.status()).toBe(403);

  // The author can, and editedAt is set.
  const res = await author.patch(`/api/messages/${id}`, {
    headers: { origin: BASE },
    data: { body: `edited ${RUN}` },
  });
  expect(res.status()).toBe(200);
  const data = (await res.json()) as { message: { body: string; editedAt: string | null } };
  expect(data.message.body).toBe(`edited ${RUN}`);
  expect(data.message.editedAt).not.toBeNull();

  await author.dispose();
  await other.dispose();
});
