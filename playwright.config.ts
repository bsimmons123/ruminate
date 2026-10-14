import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "offline.spec.ts",
  workers: 1,
  timeout: 60000,
  use: { actionTimeout: 10000, baseURL: "http://127.0.0.1:4179", viewport: { width: 412, height: 915 }, screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: { command: "npm run preview -- --host 127.0.0.1 --port 4179", url: "http://127.0.0.1:4179", env: { RUMINATE_TEST_API: "http://127.0.0.1:4180" } },
});
