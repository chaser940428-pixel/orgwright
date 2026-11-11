import { defineConfig } from '@playwright/test';

/**
 * Regression tests for KPlay's Lightning helpers, run against saved pages in tests-kplay/fixtures.
 * No Salesforce login needed:  npm run test:helpers
 */
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.unit\.spec\.ts/,
  outputDir: '../test-results/kplay-unit',
  reporter: [['list']],
  timeout: 60_000,
  fullyParallel: true,
  use: {
    headless: true,
    channel: process.env.KPLAY_UNIT_CHANNEL === 'bundled' ? undefined : process.env.PLAYWRIGHT_BROWSER_CHANNEL || 'chrome',
    launchOptions: process.env.KPLAY_UNIT_EXECUTABLE ? { executablePath: process.env.KPLAY_UNIT_EXECUTABLE } : {},
    actionTimeout: 5_000
  }
});
