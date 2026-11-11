import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

export const STORAGE_STATE_PATH = process.env.PLAYWRIGHT_STORAGE_STATE
  ? path.resolve(process.env.PLAYWRIGHT_STORAGE_STATE)
  : path.resolve(__dirname, '.auth/salesforce-state.json');
const BASE_URL = process.env.SF_LOGIN_URL || 'https://login.salesforce.com';
// Studio passes HEADLESS=true when "Headed Browser" is unticked; the CLI --headed flag still wins.
const HEADLESS = process.env.HEADLESS === 'true';
// Slow motion is opt-in (e.g. SLOW_MO=300 for demos); generated tests wait for Lightning instead.
const SLOW_MO = Number(process.env.SLOW_MO || 0);

export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // Run sequentially to avoid Salesforce database row-lock collisions
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: {
    timeout: 15_000
  },
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list']
  ],
  use: {
    baseURL: BASE_URL,
    actionTimeout: 25_000,
    navigationTimeout: 50_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1440, height: 900 }
  },

  projects: [
    // 1. One-time Authentication project to capture active session tokens
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: {
        channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || 'chrome',
        headless: false,
        launchOptions: {
          args: ['--start-maximized', '--window-position=0,0']
        }
      }
    },

    // 2. Main functional testing project reusing the authenticated session
    {
      name: 'salesforce',
      use: {
        channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || 'chrome',
        headless: HEADLESS,
        viewport: HEADLESS ? { width: 1440, height: 900 } : null,
        launchOptions: {
          args: [
            '--start-maximized',
            '--window-position=0,0',
            '--new-window',
            '--disable-blink-features=AutomationControlled'
          ],
          slowMo: SLOW_MO
        },
        storageState: STORAGE_STATE_PATH
      },
      dependencies: ['setup']
    },

    // 3. Backward-compatible alias
    {
      name: 'salesforce-carecloud',
      use: {
        channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || 'chrome',
        headless: HEADLESS,
        viewport: HEADLESS ? { width: 1440, height: 900 } : null,
        launchOptions: {
          args: [
            '--start-maximized',
            '--window-position=0,0',
            '--new-window',
            '--disable-blink-features=AutomationControlled'
          ],
          slowMo: SLOW_MO
        },
        storageState: STORAGE_STATE_PATH
      },
      dependencies: ['setup']
    }
  ]
});
