import { Page } from '@playwright/test';

export async function waitForLightningReady(page: Page, timeoutMs = 15000): Promise<void> {
  try {
    const spinner = page.locator('.slds-spinner_container:visible, lightning-spinner:visible, .slds-spinner:visible');
    if (await spinner.count() > 0) {
      await spinner.first().waitFor({ state: 'hidden', timeout: timeoutMs });
    }
  } catch {
    // Spinner may have hidden or was transient
  }

  // Best effort: Check if Aura has settled
  try {
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        // @ts-ignore
        if (typeof window.$A === 'undefined' || window.$A.isDone()) {
          resolve();
        } else {
          // @ts-ignore
          window.$A.enqueueAction(window.$A.get('e.force:refreshView'));
          resolve();
        }
      });
    }).catch(() => {});
  } catch {
    // Non-Aura or standard LWC page
  }

  await page.waitForTimeout(300);
}
