import { Page } from '@playwright/test';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { SfSession } from '@orgwright/core';

export async function loginWithCliFrontdoor(page: Page, orgAlias = 'sandboxOrg', authDir = './.auth'): Promise<SfSession> {
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  const storageStatePath = path.resolve(authDir, `${orgAlias}-state.json`);
  console.log(`[sf-connect] Requesting frontdoor URL for target org: "${orgAlias}" via Salesforce CLI...`);

  const rawOutput = execSync(`sf org open -o "${orgAlias}" -r --url-only`, {
    encoding: 'utf-8',
    timeout: 45000,
    shell: true as unknown as string,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const urlMatch = rawOutput.match(/https:\/\/[^\s"']+\/secur\/frontdoor\.jsp\?[^\s"']+/);
  let frontdoorUrl = urlMatch ? urlMatch[0] : null;

  if (!frontdoorUrl && rawOutput.includes('{')) {
    try {
      const parsed = JSON.parse(rawOutput.substring(rawOutput.indexOf('{'), rawOutput.lastIndexOf('}') + 1));
      frontdoorUrl = parsed?.result?.url;
    } catch {
      // ignore parse error
    }
  }

  if (!frontdoorUrl) {
    throw new Error(`[sf-connect] Could not retrieve frontdoor URL from Salesforce CLI for org "${orgAlias}". Output: ${rawOutput.substring(0, 200)}`);
  }

  console.log(`[sf-connect] Frontdoor URL acquired. Navigating and waiting for Lightning Experience redirect...`);
  await page.goto(frontdoorUrl, { waitUntil: 'domcontentloaded' });

  // Specifically wait for OAuth redirect out of frontdoor.jsp and into Lightning
  await page.waitForURL(url => {
    const u = url.toString();
    return (u.includes('/lightning/') || u.includes('/one/one.app')) && !u.includes('frontdoor.jsp');
  }, { timeout: 60000 });

  // Wait for Salesforce header shell
  const globalShell = page.locator('.slds-global-header, one-app-nav-bar, header, button.slds-icon-waffle_container').first();
  await globalShell.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);

  // Save session storage state
  await page.context().storageState({ path: storageStatePath });
  console.log(`[sf-connect] Successfully authenticated. StorageState cached at: ${storageStatePath}`);

  const currentUrl = new URL(page.url());
  const instanceUrl = `${currentUrl.protocol}//${currentUrl.host}`;

  return {
    alias: orgAlias,
    persona: 'admin',
    instanceUrl,
    frontdoorUrl,
    storageStatePath
  };
}
