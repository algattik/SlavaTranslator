import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results/playwright",
  reporter: [["list"]],
  use: {
    serviceWorkers: "allow",
    trace: "retain-on-failure",
  },
});
