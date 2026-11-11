/**
 * Saves a real Lightning page as a fixture for the helper regression tests.
 *
 *   npx tsx tests-orgwright/capture-fixture.ts /lightning/r/Encounter__c/<id>/view encounter-record
 *
 * Uses the saved Salesforce session (.auth/salesforce-state.json) and SF_LOGIN_URL from .env.
 * Scripts are removed so the page is static; review the HTML for patient data before committing it.
 */
import { chromium } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

async function main() {
  const [urlPath, name] = process.argv.slice(2);
  if (!urlPath || !name) {
    console.error('Usage: npx tsx tests-orgwright/capture-fixture.ts <lightning path or url> <fixture-name>');
    process.exit(1);
  }
  const base = process.env.SF_LOGIN_URL || 'https://login.salesforce.com';
  const url = /^https?:/.test(urlPath) ? urlPath : new URL(urlPath, base).toString();
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || 'chrome' });
  const context = await browser.newContext({ storageState: path.resolve(__dirname, '..', '.auth', 'salesforce-state.json') });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000); // let Lightning render
  const html = await page.evaluate(() => {
    document.querySelectorAll('script, link[rel="preload"], iframe').forEach((n) => n.remove());
    return '<!doctype html>\n' + document.documentElement.outerHTML;
  });
  const out = path.join(__dirname, 'fixtures', `${name.replace(/[^A-Za-z0-9_-]/g, '_')}.html`);
  fs.writeFileSync(out, html, 'utf-8');
  console.log(`Saved ${out} (${Math.round(html.length / 1024)} KB). Add tests for it in tests-orgwright/helpers.unit.spec.ts.`);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
