import { defineConfig, devices } from "@playwright/test";

// Runs against a production build (`npm run build` first) with a seeded database, on two
// servers: one with admin sign-in configured, one without it (a guest-only demo).
const PORT = 3100;
const NO_AUTH_PORT = 3101;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      testIgnore: /no-auth\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${PORT}` },
    },
    {
      name: "no-auth",
      testMatch: /no-auth\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${NO_AUTH_PORT}` },
    },
  ],
  webServer: [
    {
      command: `npm run start -- --port ${PORT}`,
      url: `http://localhost:${PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        // `next start` serves on plain http://localhost; Auth.js must trust that host.
        AUTH_TRUST_HOST: "true",
        // Sign-in "configured" so the link renders; nothing in the tests signs in.
        AUTH_SECRET: process.env.AUTH_SECRET || "e2e-only-not-a-secret",
        AUTH_GITHUB_ID: "e2e-placeholder",
        AUTH_GITHUB_SECRET: "e2e-placeholder",
      },
    },
    {
      command: `npm run start -- --port ${NO_AUTH_PORT}`,
      url: `http://localhost:${NO_AUTH_PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      // Empty values stay empty: Next.js only fills variables from .env that are unset.
      env: { AUTH_SECRET: "", AUTH_GITHUB_ID: "", AUTH_GITHUB_SECRET: "" },
    },
  ],
});
