import { Page, Locator } from '@playwright/test';
import { waitForLightningReady } from './spinner.js';

export async function selectCombobox(page: Page, comboboxLocator: Locator, optionLabel: string): Promise<void> {
  await comboboxLocator.scrollIntoViewIfNeeded();
  await comboboxLocator.click();
  await page.waitForTimeout(300);

  const option = page.locator(`lightning-base-combobox-item:has-text("${optionLabel}"), lightning-base-combobox-item [title="${optionLabel}"]`).first();
  await option.waitFor({ state: 'visible', timeout: 8000 });
  await option.click();
  await waitForLightningReady(page);
}

export async function selectLookup(page: Page, lookupLabel: string, searchText: string): Promise<void> {
  const container = page.locator(`lightning-lookup:has-text("${lookupLabel}"), records-record-layout-item:has-text("${lookupLabel}")`).first();
  const input = container.locator('input[type="text"], input[role="combobox"]').first();
  
  await input.click();
  await input.fill(searchText);
  await page.waitForTimeout(600);

  const resultItem = page.locator(`lightning-base-combobox-formatted-text:has-text("${searchText}"), [role="option"]:has-text("${searchText}")`).first();
  await resultItem.waitFor({ state: 'visible', timeout: 10000 });
  await resultItem.click();
  await waitForLightningReady(page);
}

export async function fillField(page: Page, fieldLabel: string, value: string): Promise<void> {
  const fieldContainer = page.locator(`records-record-layout-item:has-text("${fieldLabel}"), lightning-input:has-text("${fieldLabel}"), lightning-textarea:has-text("${fieldLabel}")`).first();
  const input = fieldContainer.locator('input, textarea, div[contenteditable="true"]').first();
  
  await input.scrollIntoViewIfNeeded();
  await input.click();
  await input.fill(value);
  await input.press('Tab');
}

export async function setCheckbox(page: Page, checkboxContainer: Locator, checked = true): Promise<void> {
  const input = checkboxContainer.locator('input[type="checkbox"]').first();
  const isChecked = await input.isChecked();
  if (isChecked !== checked) {
    const faux = checkboxContainer.locator('.slds-checkbox__label, .slds-checkbox--faux');
    if (await faux.isVisible()) {
      await faux.click();
    } else {
      await input.click({ force: true });
    }
  }
  await waitForLightningReady(page);
}
