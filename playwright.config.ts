import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000",
    channel: "msedge",
    headless: true,
    viewport: { width: 1440, height: 1050 },
  },
  workers: 1,
  reporter: "list",
});
