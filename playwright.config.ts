import { defineConfig, devices } from "@playwright/test";

const port = 3100;
const localURL = `http://localhost:${port}`;
const smokeTarget = process.env.DEMO_SMOKE_BASE_URL;
const remoteURL = smokeTarget ? new URL(smokeTarget) : undefined;
if (remoteURL && ![remoteURL.origin, `${remoteURL.origin}/`].includes(smokeTarget!)) {
  throw new Error("DEMO_SMOKE_BASE_URL must be a bare origin without credentials or a path.");
}
if (remoteURL && remoteURL.protocol !== "https:") {
  throw new Error("A remote demo smoke test requires HTTPS.");
}
const smokeOnly = Boolean(remoteURL) || process.env.DEMO_FIXTURES_ONLY === "1";

export default defineConfig({
  testDir: "./e2e",
  ...(smokeOnly ? { testMatch: "public-demo.spec.ts" } : { testIgnore: "public-demo.spec.ts" }),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: remoteURL?.origin ?? localURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: remoteURL
    ? undefined
    : {
        command: `npm run start -- --port ${port}`,
        url: localURL,
        reuseExistingServer: false,
        timeout: 120_000
      },
  outputDir: "output/playwright/results"
});
