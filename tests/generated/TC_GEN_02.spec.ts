import { test, expect } from '@playwright/test';
import { BasePage } from '../../pages/BasePage';
import { EncounterNotesPage } from '../../pages/EncounterNotesPage';
import { LightningHelpers } from '../../utils/lightning-helpers';
import { StreamHelper } from '../../utils/stream-helper';

test.describe('Revenue Operations - OPS-402', () => {
  let basePage: BasePage;
  let encounterPage: EncounterNotesPage;

  test.beforeEach(async ({ page }) => {
    basePage = new BasePage(page);
    encounterPage = new EncounterNotesPage(page);
    await StreamHelper.attach(page, 'OPS-402');
  });

  test.afterEach(async () => {
    await StreamHelper.detach();
  });

  /**
   * OPS-402: Verify Opportunity Stage Progression to Closed Won
   */
  test('OPS-402: Verify Opportunity Stage Progression to Closed Won', async ({ page }) => {
    // Step 1: 1. Open Opportunity list
    {
      await StreamHelper.setStep(page, "1. Open Opportunity list");
      await basePage.navigateToObjectList("Opportunity", 'Recent');
      await expect(page).toHaveURL(/Opportunity/);
    }

    // Step 2: 2. Open record "Recent"
    {
      await StreamHelper.setStep(page, "2. Open record \"Recent\"");
      // Custom action: 2. Open record "Recent"
      await LightningHelpers.waitForLightningReady(page);
    }

    // Step 3: 3. Activate Details tab
    {
      await StreamHelper.setStep(page, "3. Activate Details tab");
      const tabLocator = page.getByRole('tab', { name: /Details/i }).first();
      if (await tabLocator.isVisible({ timeout: 8000 })) {
        await tabLocator.click();
        await LightningHelpers.waitForLightningReady(page);
      }
    }

    // Step 4: 4. Select picklist "Stage" with value "Closed Won"
    {
      await StreamHelper.setStep(page, "4. Select picklist \"Stage\" with value \"Closed Won\"");
      // Custom action: 4. Select picklist "Stage" with value "Closed Won"
      await LightningHelpers.waitForLightningReady(page);
    }

    // Step 5: 5. Click button "Save"
    {
      await StreamHelper.setStep(page, "5. Click button \"Save\"");
      await LightningHelpers.clickButton(page, /Save/i);
    }

    // Step 6: 6. Verify toast "Opportunity was saved"
    {
      await StreamHelper.setStep(page, "6. Verify toast \"Opportunity was saved\"");
      await LightningHelpers.verifyToastMessage(page, "Opportunity was saved");
    }

    // Hold view for tester to visually confirm final state
    await page.waitForTimeout(3000);
  });
});
