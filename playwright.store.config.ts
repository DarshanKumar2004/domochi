import { defineConfig } from '@playwright/test';

// Google Play listing art (npm run store-art): screenshots of the real game, at store sizes.
export default defineConfig({
  testDir: 'tests/store',
  outputDir: 'test-results/store',
  workers: 1,
  timeout: 120_000,
  use: { baseURL: 'http://localhost:5173', deviceScaleFactor: 1 },
  projects: [
    { name: 'landscape', use: { viewport: { width: 1920, height: 1080 }, hasTouch: true } },
    { name: 'portrait', use: { viewport: { width: 1080, height: 1920 }, hasTouch: true } },
  ],
  webServer: { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 60_000 },
});
