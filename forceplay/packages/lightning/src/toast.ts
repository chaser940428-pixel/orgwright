import { Page, expect } from '@playwright/test';

export async function verifyToast(page: Page, expectedSnippet: string, timeoutMs = 15000): Promise<void> {
  const toast = page.locator('.forceVisualMessageQueue .toastMessage, .slds-theme_success, .slds-notify_toast');
  await expect(toast).toContainText(expectedSnippet, { timeout: timeoutMs });
}

export async function dismissToast(page: Page): Promise<void> {
  const closeBtn = page.locator('.slds-notify_toast button.toastClose, .forceVisualMessageQueue button.slds-notify__close').first();
  if (await closeBtn.isVisible({ timeout: 2000 })) {
    await closeBtn.click();
  }
}
