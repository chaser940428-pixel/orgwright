import { test, expect } from '@playwright/test';
import { BasePage } from '../../pages/BasePage';
import { EncounterNotesPage } from '../../pages/EncounterNotesPage';
import { LightningHelpers } from '../../utils/lightning-helpers';
import { StreamHelper } from '../../utils/stream-helper';

test.describe('Sales Cloud - CRM-101', () => {
  let basePage: BasePage;
  let encounterPage: EncounterNotesPage;

  test.beforeEach(async ({ page }) => {
    basePage = new BasePage(page);
    encounterPage = new EncounterNotesPage(page);
    await StreamHelper.attach(page, 'TC_001');
  });

  test.afterEach(async ({ page }, testInfo) => {
    const failed = testInfo.status !== testInfo.expectedStatus;
    await StreamHelper.detach(failed ? { page, error: testInfo.error?.message } : { page });
  });

  /**
   * CRM-101: Create New Account with Industry and Billing Address
   */
  test('CRM-101: Create New Account with Industry and Billing Address', async ({ page }) => {
    // Step 1: 1. Log in to Salesforce
    {
      await StreamHelper.setStep(page, "1. Log in to Salesforce");
      await page.goto('/lightning/page/home', { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/lightning|one\.app/);
      await LightningHelpers.waitForLightningReady(page);
    }

    // Step 2: click on app launcher
    {
      await StreamHelper.setStep(page, "click on app launcher");
      await LightningHelpers.clickButton(page, /app launcher/i);
    }

    // Step 3: Type account in search bar
    {
      await StreamHelper.setStep(page, "Type account in search bar");
      const input = page.getByRole('textbox', { name: /search bar/i })
        .or(page.getByRole('spinbutton', { name: /search bar/i }))
        .or(page.getByLabel(/search bar/i))
        .or(page.locator('records-record-layout-item, .slds-form-element, lightning-textarea, lightning-input').filter({ hasText: /search bar/i }).locator('textarea, input'))
        .first();
      await input.waitFor({ state: 'visible', timeout: 15000 });
      await input.click();
      await input.fill("account");
      await input.press('Tab');
      await LightningHelpers.waitForLightningReady(page);
    }

    // Step 4: 2. Click on Account
    {
      await StreamHelper.setStep(page, "2. Click on Account");
      await LightningHelpers.clickButton(page, /Account/i);
    }

    // Step 5: 3. Click on New button
    {
      await StreamHelper.setStep(page, "3. Click on New button");
      await LightningHelpers.clickButton(page, /New/i);
    }

    // Step 6: 4. Enter "Acme Corporation" in Account Name
    {
      await StreamHelper.setStep(page, "4. Enter \"Acme Corporation\" in Account Name");
      const input = page.getByRole('textbox', { name: /Account Name/i })
        .or(page.getByRole('spinbutton', { name: /Account Name/i }))
        .or(page.getByLabel(/Account Name/i))
        .or(page.locator('records-record-layout-item, .slds-form-element, lightning-textarea, lightning-input').filter({ hasText: /Account Name/i }).locator('textarea, input'))
        .first();
      await input.waitFor({ state: 'visible', timeout: 15000 });
      await input.click();
      await input.fill("Acme Corporation");
      await input.press('Tab');
      await LightningHelpers.waitForLightningReady(page);
    }

    // Step 7: 5. Select "Technology" from Industry picklist
    {
      await StreamHelper.setStep(page, "5. Select \"Technology\" from Industry picklist");
      await LightningHelpers.selectCombobox(page, "Industry", "Technology");
    }

    // Step 8: 6. Enter "100 Market St, San Francisco" in Billing Address
    {
      await StreamHelper.setStep(page, "6. Enter \"100 Market St, San Francisco\" in Billing Address");
      const input = page.getByRole('textbox', { name: /Billing Address/i })
        .or(page.getByRole('spinbutton', { name: /Billing Address/i }))
        .or(page.getByLabel(/Billing Address/i))
        .or(page.locator('records-record-layout-item, .slds-form-element, lightning-textarea, lightning-input').filter({ hasText: /Billing Address/i }).locator('textarea, input'))
        .first();
      await input.waitFor({ state: 'visible', timeout: 15000 });
      await input.click();
      await input.fill("100 Market St, San Francisco");
      await input.press('Tab');
      await LightningHelpers.waitForLightningReady(page);
    }

    // Step 9: 7. Click on Save button
    {
      await StreamHelper.setStep(page, "7. Click on Save button");
      await LightningHelpers.clickButton(page, /Save/i);
    }

    // Step 10: 8. Verify toast "Account was created"
    {
      await StreamHelper.setStep(page, "8. Verify toast \"Account was created\"");
      await LightningHelpers.verifyToastMessage(page, "Account was created");
    }

    // Step 11: 9. Verify field "Account Name" equals "Acme Corporation"
    {
      await StreamHelper.setStep(page, "9. Verify field \"Account Name\" equals \"Acme Corporation\"");
      const fieldValue = await encounterPage.getFieldValue("Account Name");
      expect(fieldValue).toContain("Acme Corporation");
    }

    // Step 12: 10. Click on "Revenue Ops Console"
    {
      await StreamHelper.setStep(page, "10. Click on \"Revenue Ops Console\"");
      await LightningHelpers.clickButton(page, /Revenue Ops Console/i);
    }

    // Step 13: 11. Click on "Revenue Ops Console"
    {
      await StreamHelper.setStep(page, "11. Click on \"Revenue Ops Console\"");
      await LightningHelpers.clickButton(page, /Revenue Ops Console/i);
    }

    // Step 14: 12. Click on "Revenue Ops Console"
    {
      await StreamHelper.setStep(page, "12. Click on \"Revenue Ops Console\"");
      await LightningHelpers.clickButton(page, /Revenue Ops Console/i);
    }

    // Hold view for tester to visually confirm final state
    await page.waitForTimeout(3000);
  });
});
