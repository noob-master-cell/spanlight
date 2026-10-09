import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against the real stack (API + worker + Postgres + this
 * frontend). They are skipped unless E2E_BASE_URL points at a running instance,
 * e.g. `E2E_BASE_URL=http://localhost:5173 npm run test:e2e`.
 * Set PW_CHANNEL=chrome to use an installed Google Chrome instead of
 * Playwright's bundled Chromium (`npx playwright install chromium`).
 */
const baseURL = process.env.E2E_BASE_URL;
const channel = process.env.PW_CHANNEL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    reducedMotion: "reduce",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], ...(channel ? { channel } : {}) },
    },
  ],
});
