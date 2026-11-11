import { test, expect } from '@playwright/test';
import { BasePage } from '../../pages/BasePage';
import { EncounterNotesPage } from '../../pages/EncounterNotesPage';
import { LightningHelpers } from '../../utils/lightning-helpers';
import { StreamHelper } from '../../utils/stream-helper';

test.describe('Alliance Orthopedics - RCM Sync - AMS-2272', () => {
  let basePage: BasePage;
  let encounterPage: EncounterNotesPage;

  test.beforeEach(async ({ page }) => {
    basePage = new BasePage(page);
    encounterPage = new EncounterNotesPage(page);
    await StreamHelper.attach(page, 'AMS-2272');
  });

  test.afterEach(async () => {
    await StreamHelper.detach();
  });

  /**
   * AMS-2272: Verify Note Creation with Follow Up Task and Sync
   */
  test('AMS-2272: Verify Note Creation with Follow Up Task and Sync', async ({ page }) => {
    // Step 1: 1. Log in to Salesforce as standard user
    {
      await StreamHelper.setStep(page, "1. Log in to Salesforce as standard user");
      await page.goto('/lightning/page/home', { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/lightning|one\.app/);
      await LightningHelpers.waitForLightningReady(page);
    }

    // Step 2: 2. Navigate to Encounter record recent
    {
      await StreamHelper.setStep(page, "2. Navigate to Encounter record recent");
      await encounterPage.openEncounter("Recent");
    }

    // Step 3: 3. Click on Create RUL button
    {
      await StreamHelper.setStep(page, "3. Click on Create RUL button");
      await LightningHelpers.clickButton(page, /Create RUL/i);
    }

    // Step 4: 4.Wait for fields to auto populate
    {
      await StreamHelper.setStep(page, "4.Wait for fields to auto populate");
      await LightningHelpers.waitForLightningReady(page);
      await page.waitForTimeout(2000);
    }

    // Step 5: 5.Click on Issue Type dropdown
    {
      await StreamHelper.setStep(page, "5.Click on Issue Type dropdown");
      const dropdown = page.getByRole('combobox', { name: /Issue Type/i })
        .or(page.getByLabel(/Issue Type/i))
        .or(page.locator('lightning-combobox, records-record-layout-item, .slds-form-element').filter({ hasText: /Issue Type/i }).locator('button, select, input, [role="combobox"]'))
        .first();
      await dropdown.waitFor({ state: 'visible', timeout: 15000 });
      await dropdown.click();
      await LightningHelpers.waitForLightningReady(page);
    }

    // Step 6: 6.Choose Insurance as option
    {
      await StreamHelper.setStep(page, "6.Choose Insurance as option");
      const selectEl = page.locator('select:visible').filter({ has: page.locator('option', { hasText: "Insurance" }) }).first();
      if (await selectEl.isVisible().catch(() => false)) {
        await selectEl.selectOption({ label: "Insurance" });
      } else {
        const option = page.locator('lightning-base-combobox-item:has-text("Insurance"), [role="option"]:has-text("Insurance"), span[title="Insurance"]').first();
        await option.waitFor({ state: 'visible', timeout: 15000 });
        await option.click();
      }
      await LightningHelpers.waitForLightningReady(page);
    }

    // Step 7: 7.click on Billed Charges field
    {
      await StreamHelper.setStep(page, "7.click on Billed Charges field");
      const input = page.getByRole('textbox', { name: /Billed Charges/i })
        .or(page.getByRole('spinbutton', { name: /Billed Charges/i }))
        .or(page.getByLabel(/Billed Charges/i))
        .or(page.locator('records-record-layout-item, .slds-form-element, lightning-textarea, lightning-input').filter({ hasText: /Billed Charges/i }).locator('textarea, input'))
        .first();
      await input.waitFor({ state: 'visible', timeout: 15000 });
      await input.click();
      await LightningHelpers.waitForLightningReady(page);
    }

    // Step 8: 8.Type 23 as value
    {
      await StreamHelper.setStep(page, "8.Type 23 as value");
      const input = page.getByRole('textbox', { name: /23/i })
        .or(page.getByRole('spinbutton', { name: /23/i }))
        .or(page.getByLabel(/23/i))
        .or(page.locator('records-record-layout-item, .slds-form-element, lightning-textarea, lightning-input').filter({ hasText: /23/i }).locator('textarea, input'))
        .first();
      await input.waitFor({ state: 'visible', timeout: 15000 });
      await input.click();
      await input.fill("value");
      await input.press('Tab');
      await LightningHelpers.waitForLightningReady(page);
    }

    // Step 9: 9.click on save
    {
      await StreamHelper.setStep(page, "9.click on save");
      await LightningHelpers.clickButton(page, /save/i);
    }

    // Step 10: 10.new RUL record should be opened
    {
      await StreamHelper.setStep(page, "10.new RUL record should be opened");
      throw new Error("Orgwright does not understand this step: \"10.new RUL record should be opened\". Regenerate this spec in Studio or edit the code.");
    }

    // Hold view for tester to visually confirm final state
    await page.waitForTimeout(3000);
  });
});
