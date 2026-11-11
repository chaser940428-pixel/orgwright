import { defineConfig } from '@playwright/test';

/**
 * Regression tests for Orgwright's Lightning helpers, run against saved pages in tests-orgwright/fixtures.
 * No Salesforce login needed:  npm run test:helpers
 */
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.unit\.spec\.ts/,
  outputDir: '../test-results/orgwright-unit',
  reporter: [['list']],
  timeout: 60_000,
  fullyParallel: true,
  use: {
    headless: true,
    channel: process.env.ORGWRIGHT_UNIT_CHANNEL === 'bundled' ? undefined : process.env.PLAYWRIGHT_BROWSER_CHANNEL || 'chrome',
    launchOptions: process.env.ORGWRIGHT_UNIT_EXECUTABLE ? { executablePath: process.env.ORGWRIGHT_UNIT_EXECUTABLE } : {},
    actionTimeout: 5_000
  }
});
