import { test, expect } from '@playwright/test';
import { BasePage } from '../../pages/BasePage';
import { EncounterNotesPage } from '../../pages/EncounterNotesPage';
import { LightningHelpers } from '../../utils/lightning-helpers';

test.describe('Alliance Orthopedics - AMS-2272', () => {
  let basePage: BasePage;
  let encounterPage: EncounterNotesPage;

  test.beforeEach(async ({ page }) => {
    basePage = new BasePage(page);
    encounterPage = new EncounterNotesPage(page);
  });

  /**
   * AMS-2272: Verify Notes Sync to CareCloud
   */
  test('AMS-2272: Verify Notes Sync to CareCloud', async ({ page }) => {
    // Step 1: 1. Open recent Encounter
    await encounterPage.openEncounter("Recent");

    // Step 2: 2. Activate Details tab
    const tabLocator = page.getByRole('tab', { name: /Details/i }).first();
    if (await tabLocator.isVisible({ timeout: 8000 })) {
      await tabLocator.click();
      await LightningHelpers.waitForLightningReady(page);
    }

    // Step 3: 3. Click button 'Sync CareCloud Notes'
    await encounterPage.clickSyncNotes(true);

    // Step 4: 4. Wait for toast 'Notes synced successfully'
    await LightningHelpers.verifyToastMessage(page, "Notes synced successfully");
  });
});
