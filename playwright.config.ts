import { defineConfig, devices } from "@playwright/test";

// E2E runs against a dedicated dev server on PORT with an isolated test
// database (see scripts/setup-e2e-db.mjs, run by the `test:e2e` script before
// Playwright starts). Serial (workers: 1) keeps the in-process realtime bus and
// per-user rate guard deterministic across tests.
const PORT = 4020;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { DATABASE_URL: "file:./e2e-test.db" },
  },
});
