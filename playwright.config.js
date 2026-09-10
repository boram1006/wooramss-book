const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4175',
    channel: 'chrome',
    headless: true,
    viewport: { width: 1365, height: 900 }
  },
  webServer: {
    command: 'npm run build && node scripts/serve-static.cjs',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: false,
    timeout: 30_000
  }
});
