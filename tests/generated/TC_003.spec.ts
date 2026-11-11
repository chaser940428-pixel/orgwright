import { test, expect } from '@playwright/test';
import { BasePage } from '../../pages/BasePage';
import { EncounterNotesPage } from '../../pages/EncounterNotesPage';
import { LightningHelpers } from '../../utils/lightning-helpers';
import { StreamHelper } from '../../utils/stream-helper';

test.describe('Sales Cloud - TC_003', () => {
  let basePage: BasePage;
  let encounterPage: EncounterNotesPage;

  test.beforeEach(async ({ page }) => {
    basePage = new BasePage(page);
    encounterPage = new EncounterNotesPage(page);
    await StreamHelper.attach(page, 'TC_003');
  });

  test.afterEach(async ({ page }, testInfo) => {
    const failed = testInfo.status !== testInfo.expectedStatus;
    await StreamHelper.detach(failed ? { page, error: testInfo.error?.message } : { page });
  });

  /**
   * Automated Salesforce Workflow
   */
  test('Automated Salesforce Workflow', async ({ page }) => {
    // Step 1: 1. Log in to Salesforce
    await StreamHelper.runStep(page, "1. Log in to Salesforce", async () => {
      await page.goto('/lightning/page/home', { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/lightning|one\.app/);
      await LightningHelpers.waitForLightningReady(page);
    });

    // Step 2: 2. Click App Launcher
    await StreamHelper.runStep(page, "2. Click App Launcher", async () => {
      await LightningHelpers.openAppLauncher(page);
    });

    // Step 3: 3. Search app "Intake"
    await StreamHelper.runStep(page, "3. Search app \"Intake\"", async () => {
      await LightningHelpers.openApp(page, "Intake");
    });

    // Step 4: 4. Wait for page to load
    await StreamHelper.runStep(page, "4. Wait for page to load", async () => {
      await LightningHelpers.waitForPageSettled(page);
    });

    // Step 5: 5. Select "Accounts" tab
    await StreamHelper.runStep(page, "5. Select \"Accounts\" tab", async () => {
      await LightningHelpers.selectNavTab(page, "Accounts", "Account");
    });

    // Step 6: 6. Select list view "All Accounts"
    await StreamHelper.runStep(page, "6. Select list view \"All Accounts\"", async () => {
      await LightningHelpers.selectListView(page, "All Accounts");
    });

    await StreamHelper.holdForReview(page);
  });
});
