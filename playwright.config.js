const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests/visual",
  timeout: 90000,
  retries: 1,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5500",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    locale: "en-IN",
    launchOptions: {
      args: ["--disable-gpu", "--disable-software-rasterizer"],
    },
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      threshold: 0.2,
    },
  },
  webServer: {
    command: "npx http-server frontend -p 5500 -c-1 --silent",
    url: "http://127.0.0.1:5500",
    reuseExistingServer: true,
    timeout: 120000,
  },
});
