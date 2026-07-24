import { test, expect, type Page } from "@playwright/test";

// A run-unique suffix keeps emails/channel names collision-free even if the
// test DB isn't reset between runs.
const RUN = Date.now();

async function signup(page: Page, name: string, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Display name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("supersecret");
  await page.getByRole("button", { name: "Create account" }).click();
  // App shell is ready once the #general composer is present.
  await expect(
    page.getByRole("textbox", { name: "Message #general" }),
  ).toBeVisible();
}

test("a message from one user appears live for another", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const ada = await ctxA.newPage();
  const grace = await ctxB.newPage();

  await signup(ada, "Ada Lovelace", `ada+${RUN}@example.com`);
  await signup(grace, "Grace Hopper", `grace+${RUN}@example.com`);

  const message = `hello cohort ${RUN}`;
  await ada.getByRole("textbox", { name: "Message #general" }).fill(message);
  await ada.getByRole("button", { name: "Send message" }).click();

  // Grace receives it in real time, without reloading.
  await expect(grace.getByText(message)).toBeVisible({ timeout: 10_000 });

  // Presence reflects both users online.
  await expect(grace.getByText("2 online")).toBeVisible({ timeout: 10_000 });

  await ctxA.close();
  await ctxB.close();
});

test("a new channel broadcasts live to other users", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const ada = await ctxA.newPage();
  const grace = await ctxB.newPage();

  await signup(ada, "Ada Two", `ada2+${RUN}@example.com`);
  await signup(grace, "Grace Two", `grace2+${RUN}@example.com`);

  const channelName = `Room ${RUN}`;
  await ada.getByRole("button", { name: "Create a channel" }).click();
  await ada.getByLabel("Name").fill(channelName);
  await ada.getByRole("button", { name: "Create channel" }).click();

  // Grace's sidebar shows the new channel, delivered over SSE.
  await expect(
    grace.getByRole("button", { name: new RegExp(channelName, "i") }),
  ).toBeVisible({ timeout: 10_000 });

  await ctxA.close();
  await ctxB.close();
});

test("direct messages are private and delivered in real time", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const ctxC = await browser.newContext();
  const alice = await ctxA.newPage();
  const bob = await ctxB.newPage();
  const carol = await ctxC.newPage();

  const bobName = `Bob ${RUN}`;
  await signup(alice, `Alice ${RUN}`, `alice+${RUN}@example.com`);
  await signup(bob, bobName, `bob+${RUN}@example.com`);
  await signup(carol, `Carol ${RUN}`, `carol+${RUN}@example.com`);

  // Alice starts a DM with Bob from the presence list.
  await alice.getByTitle(`Message ${bobName}`).click();
  const dmText = `secret for bob ${RUN}`;
  const composer = alice.getByRole("textbox", { name: `Message ${bobName}` });
  await expect(composer).toBeVisible();
  await composer.fill(dmText);
  await alice.getByRole("button", { name: "Send message" }).click();
  await expect(alice.getByText(dmText)).toBeVisible();

  // Bob receives the DM live: it shows up in his sidebar and opens to the message.
  await expect(bob.getByTestId("dm-item")).toHaveCount(1, { timeout: 10_000 });
  await bob.getByTestId("dm-item").click();
  await expect(bob.getByText(dmText)).toBeVisible({ timeout: 10_000 });

  // Carol (not a participant) never receives it — no DM, no message.
  await expect(carol.getByTestId("dm-item")).toHaveCount(0);
  await expect(carol.getByText(dmText)).toHaveCount(0);

  await ctxA.close();
  await ctxB.close();
  await ctxC.close();
});

test("mobile: the sidebar opens as an off-canvas drawer", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signup(page, `Mobile ${RUN}`, `mobile+${RUN}@example.com`);

  const aside = page.locator("aside");
  // Off-screen initially (drawer closed).
  expect((await aside.boundingBox())!.x).toBeLessThan(0);

  await page.getByRole("button", { name: "Open channel list" }).click();
  // Slides fully into view.
  await expect.poll(async () => (await aside.boundingBox())!.x).toBe(0);

  // And closes again.
  await page.getByRole("button", { name: "Close channel list" }).click();
  await expect.poll(async () => (await aside.boundingBox())!.x).toBeLessThan(0);
});

test("messages persist across a reload", async ({ page }) => {
  await signup(page, "Persist User", `persist+${RUN}@example.com`);

  const message = `persisted message ${RUN}`;
  await page.getByRole("textbox", { name: "Message #general" }).fill(message);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(message)).toBeVisible();

  await page.reload();
  await expect(page.getByText(message)).toBeVisible();
});
