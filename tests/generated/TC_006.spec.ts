import { test, expect } from '@playwright/test';
import { BasePage } from '../../pages/BasePage';
import { EncounterNotesPage } from '../../pages/EncounterNotesPage';
import { LightningHelpers } from '../../utils/lightning-helpers';
import { StreamHelper } from '../../utils/stream-helper';

test.describe('Sales Cloud - TC_006', () => {
  let basePage: BasePage;
  let encounterPage: EncounterNotesPage;

  test.beforeEach(async ({ page }) => {
    basePage = new BasePage(page);
    encounterPage = new EncounterNotesPage(page);
    await StreamHelper.attach(page, 'TC_006');
  });

  test.afterEach(async ({ page }, testInfo) => {
    const failed = testInfo.status !== testInfo.expectedStatus;
    await StreamHelper.detach(failed ? { page, error: testInfo.error?.message } : { page });
  });

  /**
   * Create a new Encounter
   */
  test('Create a new Encounter', async ({ page }) => {
    // Step 1: 1. Log in to Salesforce
    await StreamHelper.runStep(page, "1. Log in to Salesforce", async () => {
      await page.goto('/lightning/page/home', { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/lightning|one\.app/);
      await LightningHelpers.waitForLightningReady(page);
    });

    // Step 2: 2. click on app launcher
    await StreamHelper.runStep(page, "2. click on app launcher", async () => {
      await LightningHelpers.clickButton(page, /app launcher/i);
    });

    // Step 3: 3. type revenue ops console
    await StreamHelper.runStep(page, "3. type revenue ops console", async () => {
      const input = page.locator(':focus, textarea:visible, input:visible').first();
      await input.fill("revenue ops console");
      await input.press('Tab');
      await LightningHelpers.waitForLightningReady(page);
    });

    // Step 4: 4. Select revenue ops console
    await StreamHelper.runStep(page, "4. Select revenue ops console", async () => {
      await basePage.openAppFromLauncher("Revenue Ops Console");
    });

    // Step 5: 5. click on a record
    await StreamHelper.runStep(page, "5. click on a record", async () => {
      const recordLink = page.getByRole('link', { name: /a/i })
        .or(page.locator('tbody tr th a, tbody tr td a[data-refid="recordId"], tbody tr a').filter({ hasText: /a/i }))
        .or(page.locator('tbody tr th a, tbody tr a').first());
      await recordLink.waitFor({ state: 'visible', timeout: 20000 });
      await recordLink.click();
      await LightningHelpers.waitForLightningReady(page);
    });

    await StreamHelper.holdForReview(page);
  });
});
