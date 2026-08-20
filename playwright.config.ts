import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    trace: "off",
    screenshot: "only-on-failure",
    locale: "ru-RU",
  },
  projects: [
    {
      name: "desktop-chrome",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
      testIgnore: /mobile-visual/,
    },
    {
      name: "pixel-7",
      use: { ...devices["Pixel 7"] },
      testMatch: /mobile-visual|app-flows/,
    },
  ],
  webServer: {
    command: `E2E_SKIP_AUTH=true npx next start -H 127.0.0.1 -p ${PORT}`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
