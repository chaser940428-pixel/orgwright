import { Page, expect } from '@playwright/test';
import { waitForLightningReady } from './spinner.js';

export async function activateTab(page: Page, tabLabel: string | RegExp, timeoutMs = 10000): Promise<void> {
  const tab = page.getByRole('tab', { name: tabLabel })
    .or(page.locator(`tablist[aria-label="Tabs"] tab:has-text("${tabLabel}")`))
    .or(page.locator(`a[data-label="${tabLabel}"], a[data-tab-value*="${tabLabel}"]`))
    .first();

  if (await tab.isVisible({ timeout: timeoutMs })) {
    const isSelected = await tab.getAttribute('aria-selected');
    if (isSelected !== 'true') {
      await tab.click();
      await waitForLightningReady(page);
    }
  }
}

export async function openConsoleWorkspaceTab(page: Page, recordTitle: string | RegExp): Promise<void> {
  const workspaceTab = page.locator(`tablist[aria-label*="Workspace"] tab:has-text("${recordTitle}")`).first();
  if (await workspaceTab.isVisible({ timeout: 8000 })) {
    await workspaceTab.click();
    await waitForLightningReady(page);
  }
}
