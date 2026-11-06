import { defineConfig, devices } from "@playwright/test";
import { URLS } from "./e2e/stack/config";

/**
 * End to end tests. `pnpm --filter web e2e` brings up a disposable stack (see e2e/README.md), runs every
 * spec on a desktop and a phone viewport, and tears the stack down.
 *
 * Environment switches: E2E_REUSE=1|0 (use a stack that is already running), E2E_WORKERS=n, E2E_HTML=1.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  outputDir: "./test-results",
  globalSetup: "./e2e/global-setup.ts",

  // One shared chain and database, and one funding account behind the app's faucet: run one test at a time.
  fullyParallel: false,
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 90_000,
  expect: { timeout: 15_000 },

  // The HTML report is opt-in, because it writes a folder and a failure already leaves a trace and a screenshot.
  reporter: process.env.E2E_HTML
    ? [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : [["list"]],

  use: {
    baseURL: URLS.web,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    // Fixed so a run looks the same on every machine. Motion is reduced so entrance animations do not race clicks.
    reducedMotion: "reduce",
    locale: "en-IN",
    timezoneId: "UTC",
  },

  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "phone",
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 375, height: 812 },
        screen: { width: 375, height: 812 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
