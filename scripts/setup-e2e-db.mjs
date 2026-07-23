// Prepare an isolated, freshly-seeded SQLite database for the Playwright E2E
// suite so tests never touch dev data and start from a known state.
// Runs `prisma db push` + the seed with DATABASE_URL pointed at e2e-test.db.
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

const DB_URL = "file:./e2e-test.db";
const env = { ...process.env, DATABASE_URL: DB_URL };

// Start clean (delete both possible resolution locations + journals).
for (const f of [
  "./e2e-test.db",
  "./e2e-test.db-journal",
  "./prisma/e2e-test.db",
  "./prisma/e2e-test.db-journal",
]) {
  rmSync(f, { force: true });
}

console.log("Setting up E2E test database…");
execSync("npx prisma db push --skip-generate", { stdio: "inherit", env });
execSync("npx tsx prisma/seed.ts", { stdio: "inherit", env });
console.log("E2E test database ready.");
