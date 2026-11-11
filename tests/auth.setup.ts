import { test as setup, expect } from '@playwright/test';
import { SalesforceAuth } from '../utils/salesforce-auth';
import * as fs from 'fs';

setup('Authenticate to Salesforce Stage Sandbox', async ({ browser }) => {
  const targetPath = SalesforceAuth.STORAGE_STATE_PATH;

  // If we already have a valid session file modified less than 2 hours ago, reuse it directly!
  if (fs.existsSync(targetPath)) {
    try {
      const stats = fs.statSync(targetPath);
      const ageHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
      if (ageHours < 2 && stats.size > 200) {
        console.log(`[Setup] Valid cached session detected (${Math.round(ageHours * 60)} min old) at ${targetPath}. Fast bypass active.`);
        return;
      }
    } catch {}
  }

  const page = await browser.newPage();
  const personaDisplay = process.env.PLAYWRIGHT_PERSONA_NAME
    ? `${process.env.PLAYWRIGHT_PERSONA_NAME} [${process.env.PLAYWRIGHT_PERSONA_PROFILE || 'Persona'}]`
    : 'Default User';

  console.log(`[Setup] Initializing Salesforce authentication session for ${personaDisplay}...`);
  await SalesforceAuth.authenticate(page);

  // Validate that session is authenticated
  await page.goto('/lightning/page/home', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await expect(page.locator('#username')).toBeHidden();

  // Finalize cached storage state
  await page.context().storageState({ path: targetPath });
  await page.close();
  console.log(`[Setup] Salesforce session verified and finalized for ${personaDisplay}.`);
});
