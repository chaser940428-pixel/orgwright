import { Page } from '@playwright/test';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export class SalesforceAuth {
  static readonly AUTH_DIR = path.resolve(__dirname, '../.auth');

  static get STORAGE_STATE_PATH(): string {
    return process.env.PLAYWRIGHT_STORAGE_STATE
      ? path.resolve(process.env.PLAYWRIGHT_STORAGE_STATE)
      : path.resolve(SalesforceAuth.AUTH_DIR, 'salesforce-state.json');
  }

  /**
   * Performs authentication using either Salesforce CLI frontdoor URL (instant Zero-MFA bypass)
   * or standard UI login, ensuring session cookies are settled before saving storageState.
   * If PLAYWRIGHT_PERSONA_ID is specified, it additionally switches into that persona session.
   */
  static async authenticate(page: Page): Promise<void> {
    if (!fs.existsSync(SalesforceAuth.AUTH_DIR)) {
      fs.mkdirSync(SalesforceAuth.AUTH_DIR, { recursive: true });
    }

    const orgAlias = process.env.SF_ORG_ALIAS || 'sandboxOrg';
    // Org-specific values come only from .env (never hardcode credentials in source)
    const baseUrl = process.env.SF_LOGIN_URL || 'https://test.salesforce.com';
    const username = process.env.SF_USERNAME || '';
    const password = process.env.SF_PASSWORD || '';
    const personaId = process.env.PLAYWRIGHT_PERSONA_ID;
    const personaName = process.env.PLAYWRIGHT_PERSONA_NAME || personaId;
    const personaProfile = process.env.PLAYWRIGHT_PERSONA_PROFILE || '';
    const orgId = process.env.SF_ORG_ID || '';

    let adminAuthenticated = false;

    // Strategy 1: Salesforce CLI frontdoor.jsp login (Bypasses MFA & IP restrictions instantly)
    // Only the configured org (alias, then username). Never fall back to other aliases: that could
    // silently log the tests into a different org than the one in .env.
    const aliasesToTry = [orgAlias, username].filter(Boolean);
    const uniqueAliases = [...new Set(aliasesToTry)];

    for (const alias of uniqueAliases) {
      try {
        console.log(`[SalesforceAuth] Fetching CLI frontdoor URL for alias: "${alias}"...`);
        const rawOutput = execSync(`sf org open -o "${alias}" -r --url-only`, {
          encoding: 'utf-8',
          timeout: 45000,
          shell: true as unknown as string,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        // Extract frontdoor URL
        const urlMatch = rawOutput.match(/https:\/\/[^\s"']+\/secur\/frontdoor\.jsp\?[^\s"']+/);
        let frontdoorUrl = urlMatch ? urlMatch[0] : null;

        if (!frontdoorUrl && rawOutput.includes('{')) {
          try {
            const parsed = JSON.parse(rawOutput.substring(rawOutput.indexOf('{'), rawOutput.lastIndexOf('}') + 1));
            frontdoorUrl = parsed?.result?.url;
          } catch {
            // ignore
          }
        }

        if (frontdoorUrl) {
          console.log(`[SalesforceAuth] CLI frontdoor URL obtained. Navigating to start session...`);
          await page.goto(frontdoorUrl, { waitUntil: 'domcontentloaded' });

          // CRITICAL: Must wait for frontdoor.jsp to complete full OAuth handshake and redirect into Lightning
          console.log('[SalesforceAuth] Waiting for redirect from frontdoor.jsp into Lightning Experience...');
          await page.waitForURL(url => {
            const u = url.toString();
            return (u.includes('/lightning/') || u.includes('/one/one.app')) && !u.includes('frontdoor.jsp');
          }, { timeout: 60000 });

          // Wait for global header / UI shell to confirm authenticated DOM is live
          const globalShell = page.locator('.slds-global-header, one-app-nav-bar, header, button.slds-icon-waffle_container, button[aria-label="App Launcher"]').first();
          await globalShell.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});

          await page.waitForTimeout(3000); // Allow all session cookies (sid, oid) to settle

          console.log('[SalesforceAuth] Successfully authenticated via CLI frontdoor.');
          adminAuthenticated = true;
          break;
        }
      } catch (cliErr) {
        console.log(`[SalesforceAuth] CLI frontdoor bypass for alias "${alias}" failed: ${(cliErr as Error).message.split('\n')[0]}`);
      }
    }

    // Strategy 2: Standard UI form login fallback if CLI failed
    if (!adminAuthenticated) {
      console.log(`[SalesforceAuth] Falling back to standard UI login at ${baseUrl}...`);
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

      if (!username || !password) {
        throw new Error('[SalesforceAuth] CLI login failed and SF_USERNAME / SF_PASSWORD are not set in .env');
      }
      if (await page.locator('#username').isVisible({ timeout: 10000 })) {
        await page.locator('#username').fill(username);
        await page.locator('#password').fill(password);
        await page.locator('#Login').click();

        await page.waitForURL(url => {
          const u = url.toString();
          return (u.includes('/lightning/') || u.includes('/one/one.app')) && !u.includes('login');
        }, { timeout: 60000 });
        await page.waitForTimeout(4000);
        console.log('[SalesforceAuth] Successfully authenticated via UI login form.');
        adminAuthenticated = true;
      }
    }

    // Persona Login-As Switch (if requested and not admin)
    if (personaId && personaId !== 'admin') {
      if (!orgId) throw new Error('[SalesforceAuth] SF_ORG_ID must be set in .env to switch persona');
      console.log(`[SalesforceAuth] Switching persona to: "${personaName}" [${personaProfile}] (ID: ${personaId})...`);
      const loginAsUrl = `${baseUrl.replace(/\/$/, '')}/servlet/servlet.su?oid=${orgId}&suorgadminid=${personaId}&targetURL=%2Flightning%2Fpage%2Fhome`;
      
      try {
        await page.goto(loginAsUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(4000);
        console.log(`[SalesforceAuth] Persona session established. Current URL: ${page.url()}`);
      } catch (switchErr) {
        console.warn(`[SalesforceAuth] Persona switch warning: ${(switchErr as Error).message}. Proceeding with active session.`);
      }
    }

    await page.context().storageState({ path: SalesforceAuth.STORAGE_STATE_PATH });
    console.log(`[SalesforceAuth] Storage state saved to: ${SalesforceAuth.STORAGE_STATE_PATH}`);
  }
}
