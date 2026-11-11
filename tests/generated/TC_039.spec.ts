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
   * AMS-2272: Verify Encounter Details and Fields
   */
  test('AMS-2272: Verify Encounter Details and Fields', async ({ page }) => {
    // Step 1: 1. Open recent Encounter
    {
      await encounterPage.openEncounter("Recent");
    }

    // Step 2: 2. Activate Details tab
    {
      const tabLocator = page.getByRole('tab', { name: /Details/i }).first();
      await tabLocator.click({ timeout: 15000 });
      await LightningHelpers.waitForLightningReady(page);
    }

    // Step 3: 3. Verify field 'Owner' is not empty
    {
      throw new Error("Orgwright does not understand this step: \"3. Verify field 'Owner' is not empty\". Regenerate this spec in Studio or edit the code.");
    }

    // Step 4: 4. Activate Related tab
    {
      const tabLocator = page.getByRole('tab', { name: /Related/i }).first();
      await tabLocator.click({ timeout: 15000 });
      await LightningHelpers.waitForLightningReady(page);
    }
  });
});
