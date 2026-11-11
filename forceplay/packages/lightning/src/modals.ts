import { Page } from '@playwright/test';
import { waitForLightningReady } from './spinner.js';

export async function saveModal(page: Page): Promise<void> {
  const modal = page.locator('.slds-modal__container, lightning-quick-action-panel').first();
  const saveBtn = modal.getByRole('button', { name: /Save|Done|Confirm|Sync/i }).first();
  await saveBtn.click();
  await waitForLightningReady(page);
}

export async function cancelModal(page: Page): Promise<void> {
  const modal = page.locator('.slds-modal__container, lightning-quick-action-panel').first();
  const cancelBtn = modal.getByRole('button', { name: /Cancel|Close/i }).first();
  await cancelBtn.click();
  await waitForLightningReady(page);
}
