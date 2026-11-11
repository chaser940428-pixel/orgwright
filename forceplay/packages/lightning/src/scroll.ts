import { Page } from '@playwright/test';
import { waitForLightningReady } from './spinner.js';

/**
 * Intelligently scrolls a Salesforce Lightning page or active modal dialog.
 * Handles Salesforce's internal scroll containers (.slds-modal__content, .slds-scrollable_y, etc.)
 */
export async function scrollPage(page: Page, deltaY = 500): Promise<void> {
  try {
    await page.mouse.wheel(0, deltaY).catch(() => {});

    await page.evaluate((dy) => {
      const candidates = [
        document.querySelector('.slds-modal__content'),
        document.querySelector('.forceDetailPanelFix'),
        document.querySelector('.flexipageDefaultAppPage'),
        document.querySelector('.slds-scrollable_y'),
        document.querySelector('div[class*="scrollable"]'),
        document.querySelector('main'),
        document.querySelector('.oneAppNavContainer')
      ];

      for (const el of candidates) {
        if (el && el.scrollHeight > el.clientHeight) {
          el.scrollBy({ top: dy, behavior: 'smooth' });
          return;
        }
      }

      window.scrollBy({ top: dy, behavior: 'smooth' });
      if (document.documentElement) {
        document.documentElement.scrollBy({ top: dy, behavior: 'smooth' });
      }
    }, deltaY).catch(() => {});

    await page.waitForTimeout(300);
    await waitForLightningReady(page);
  } catch {}
}

/**
 * Scrolls a specific element or button into view inside Salesforce Lightning.
 */
export async function scrollToElement(page: Page, target: string | RegExp): Promise<void> {
  try {
    const loc = page.getByRole('button', { name: target })
      .or(page.getByRole('link', { name: target }))
      .or(page.getByLabel(target))
      .or(page.locator(`button:has-text("${target}"), a:has-text("${target}")`))
      .first();

    if (await loc.count() > 0) {
      await loc.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(200);
    }
  } catch {}
}

/**
 * Clicks a button with resilient scrolling, modal awareness, and dropdown auto-expansion.
 */
export async function clickButton(page: Page, name: string | RegExp): Promise<void> {
  const directButton = page.getByRole('button', { name })
    .or(page.locator(`button:has-text("${name}"), lightning-button button:has-text("${name}")`))
    .first();

  try {
    if (await directButton.count() > 0 && await directButton.isVisible()) {
      await directButton.scrollIntoViewIfNeeded().catch(() => {});
      await directButton.click({ timeout: 4000 });
      await waitForLightningReady(page);
      return;
    }
  } catch {}

  const modal = page.locator('.slds-modal__container, lightning-quick-action-panel, .slds-modal').first();
  if (await modal.count() > 0 && await modal.isVisible()) {
    const modalBtn = modal.getByRole('button', { name })
      .or(modal.locator(`button:has-text("${name}")`))
      .first();
    if (await modalBtn.count() > 0) {
      await modalBtn.scrollIntoViewIfNeeded().catch(() => {});
      try {
        await modalBtn.click({ timeout: 5000 });
      } catch {
        await modalBtn.click({ force: true });
      }
      await waitForLightningReady(page);
      return;
    }
  }

  await scrollPage(page, 400);
  if (await directButton.count() > 0) {
    await directButton.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {});
    try {
      await directButton.click({ timeout: 5000 });
      await waitForLightningReady(page);
      return;
    } catch {
      try {
        await directButton.click({ force: true, timeout: 3000 });
        await waitForLightningReady(page);
        return;
      } catch {}
    }
  }

  const moreActionsBtn = page.getByRole('button', { name: /Show more actions|More Actions/i })
    .or(page.locator('lightning-button-menu button, button[aria-label="Show more actions"]'))
    .first();

  if (await moreActionsBtn.count() > 0 && await moreActionsBtn.isVisible()) {
    await moreActionsBtn.click();
    await page.waitForTimeout(400);

    const menuItem = page.getByRole('menuitem', { name })
      .or(page.locator(`runtime_platform_actions-action-renderer:has-text("${name}"), [role="menuitem"]:has-text("${name}")`))
      .first();

    if (await menuItem.isVisible({ timeout: 4000 })) {
      await menuItem.click();
      await waitForLightningReady(page);
      return;
    }
  }

  await directButton.scrollIntoViewIfNeeded().catch(() => {});
  await directButton.click({ force: true, timeout: 8000 });
  await waitForLightningReady(page);
}
