import { Page, Locator } from '@playwright/test';
import { LightningHelpers } from '../utils/lightning-helpers';

export class BasePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Ensures the browser is loaded on Salesforce Lightning.
   */
  async ensureOnSalesforce(): Promise<void> {
    const currentUrl = this.page.url();
    if (currentUrl === 'about:blank' || !currentUrl.includes('/lightning/')) {
      await this.page.goto('/lightning/page/home', { waitUntil: 'domcontentloaded' });
      await LightningHelpers.waitForLightningReady(this.page);
    }
  }

  /**
   * Navigates directly to any object list view (Fast & Resilient).
   */
  async navigateToObjectList(objectApiName: string, filterName = 'Recent'): Promise<void> {
    const listUrl = `/lightning/o/${objectApiName}/list?filterName=${filterName}`;
    console.log(`[BasePage] Navigating to: ${listUrl}`);
    await this.page.goto(listUrl, { waitUntil: 'domcontentloaded' });
    await LightningHelpers.waitForLightningReady(this.page);
  }

  /**
   * Navigates directly to a record view by record ID.
   */
  async navigateToRecord(recordId: string): Promise<void> {
    console.log(`[BasePage] Navigating to record ID: ${recordId}`);
    await this.page.goto(`/lightning/r/${recordId}/view`, { waitUntil: 'domcontentloaded' });
    await LightningHelpers.waitForLightningReady(this.page);
  }

  /**
   * Opens the App Launcher waffle and selects an app (or confirms if already on it).
   */
  async openAppFromLauncher(appName: string): Promise<void> {
    await this.ensureOnSalesforce();
    await LightningHelpers.waitForLightningReady(this.page);

    // If already inside the requested app (e.g. Revenue Ops Console), proceed directly
    const currentAppHeading = this.page.locator(`h1:has-text("${appName}"), span[title="${appName}"], p[title="${appName}"]`).first();
    if (await currentAppHeading.isVisible({ timeout: 4000 })) {
      console.log(`[BasePage] Already inside app "${appName}".`);
      return;
    }

    const waffle = this.page.getByRole('button', { name: /App Launcher/i })
      .or(this.page.locator('button.slds-icon-waffle_container'))
      .or(this.page.locator('div.slds-icon-waffle'))
      .first();

    if (await waffle.isVisible({ timeout: 8000 })) {
      await waffle.click();
      await this.page.waitForTimeout(500);

      const searchInput = this.page.getByPlaceholder(/Search apps/i)
        .or(this.page.locator('one-app-launcher-modal input[type="search"]'))
        .or(this.page.locator('.slds-modal input[type="search"]'))
        .first();

      if (await searchInput.isVisible({ timeout: 6000 })) {
        await searchInput.fill(appName);
        await this.page.waitForTimeout(800);

        const resultItem = this.page.locator(`one-app-launcher-menu-item:has-text("${appName}"), p:has-text("${appName}"), a[role="option"]:has-text("${appName}")`).first();
        if (await resultItem.isVisible({ timeout: 6000 })) {
          await resultItem.click();
          await LightningHelpers.waitForLightningReady(this.page);
          return;
        }
      }
    }

    // Direct URL fallback
    if (appName.toLowerCase().includes('encounter')) {
      await this.navigateToObjectList('Encounter__c', 'Recent');
    }
    await LightningHelpers.waitForLightningReady(this.page);
  }
}
