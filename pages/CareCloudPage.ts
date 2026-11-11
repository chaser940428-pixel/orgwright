import { Page, Locator, expect } from '@playwright/test';

export class CareCloudPage {
  readonly page: Page;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly patientSearchInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.usernameInput = page.locator('#username, input[name="username"], input[type="email"]').first();
    this.passwordInput = page.locator('#password, input[name="password"], input[type="password"]').first();
    this.loginButton = page.getByRole('button', { name: /Log In|Sign In/i }).first();
    this.patientSearchInput = page.locator('input[placeholder*="Search Patient"], input[data-testid="patient-search"]').first();
  }

  /**
   * Logs into the CareCloud application.
   */
  async login(): Promise<void> {
    const url = process.env.CARECLOUD_URL || 'https://app.carecloud.com';
    const username = process.env.CARECLOUD_USERNAME || '';
    const password = process.env.CARECLOUD_PASSWORD || '';

    console.log(`[CareCloudPage] Navigating to CareCloud: ${url}`);
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });

    if (await this.usernameInput.isVisible({ timeout: 10000 })) {
      await this.usernameInput.fill(username);
      await this.passwordInput.fill(password);
      await this.loginButton.click();
      await this.page.waitForLoadState('domcontentloaded');
      console.log('[CareCloudPage] Logged into CareCloud successfully.');
    }
  }

  /**
   * Searches and opens a Patient Record.
   */
  async openPatient(patientName: string): Promise<void> {
    const patientTab = this.page.locator('a:has-text("Patient"), button:has-text("Patient")').first();
    if (await patientTab.isVisible()) {
      await patientTab.click();
    }

    if (await this.patientSearchInput.isVisible({ timeout: 8000 })) {
      await this.patientSearchInput.fill(patientName);
      await this.page.keyboard.press('Enter');
      await this.page.waitForTimeout(1000);

      const patientRow = this.page.locator(`text="${patientName}"`).first();
      await patientRow.click();
    }
  }

  /**
   * Verifies that a synced note is visible under the Patient Record.
   */
  async verifyNotePresent(contentSnippet: string): Promise<void> {
    const notesTab = this.page.locator('a:has-text("Notes"), button:has-text("Notes")').first();
    if (await notesTab.isVisible()) {
      await notesTab.click();
    }

    const noteItem = this.page.locator(`text="${contentSnippet}"`).first();
    await expect(noteItem).toBeVisible({ timeout: 15000 });
    console.log(`[CareCloudPage] Verified note containing "${contentSnippet}" is present.`);
  }

  /**
   * Verifies the Note Author (e.g. "Salesforce Integration" per TC_009).
   */
  async verifyAuthor(expectedAuthor: string): Promise<void> {
    const authorElement = this.page.locator(`text="${expectedAuthor}"`).first();
    await expect(authorElement).toBeVisible({ timeout: 10000 });
  }
}
