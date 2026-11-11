import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { LightningHelpers as L } from '../utils/lightning-helpers';

async function openFixture(page: Page, name: string) {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf-8');
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('https://orgwright.lightning.force.com/lightning/page/home');
}

test('record action waits for its delayed overflow item', async ({ page }) => {
  await openFixture(page, 'record-page.html');
  await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>('button[aria-label="Show more actions"]')!.onclick = () => {
      setTimeout(() => document.getElementById('more')!.style.display = 'block', 1500);
    };
    document.querySelector<HTMLElement>('#more [role="menuitem"]:last-child')!.onclick = () => document.title = 'cloned';
  });
  await L.clickButton(page, 'Clone');
  await expect(page).toHaveTitle('cloned');
});

test('related-list action waits for its delayed menu item', async ({ page }) => {
  await openFixture(page, 'record-page.html');
  await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>('lightning-button-menu button')!.onclick = () => {
      setTimeout(() => document.getElementById('notesMenu')!.style.display = 'block', 1500);
    };
    document.querySelector<HTMLElement>('#notesMenu [role="menuitem"]')!.onclick = () => document.title = 'note created';
  });
  await L.relatedListAction(page, 'Notes', 'New Note');
  await expect(page).toHaveTitle('note created');
});

test('path selection waits for the delayed confirmation button', async ({ page }) => {
  await openFixture(page, 'record-page.html');
  await page.evaluate(() => {
    (window as any).pathSel = (stage: string) => {
      (window as any).__sel = stage;
      setTimeout(() => document.getElementById('markCurrent')!.style.display = 'inline-block', 1500);
    };
  });
  await L.selectPathStage(page, 'Checked In');
  await expect(page.locator('#stage')).toHaveText('Checked In');
});

test('navigation waits for a delayed tab instead of taking the fallback', async ({ page }) => {
  await openFixture(page, 'app-launcher.html');
  await page.evaluate(() => {
    const tab = document.querySelector('one-app-nav-bar-item-root a[title="Contacts"]')!.parentElement!;
    tab.remove();
    setTimeout(() => document.getElementById('bar')!.appendChild(tab), 1500);
  });
  await L.selectNavTab(page, 'Contacts', 'Contact');
  await expect(page.locator('#page')).toHaveText('Contacts');
});

test('navigation waits for a delayed overflow menu item', async ({ page }) => {
  await openFixture(page, 'app-launcher.html');
  await page.evaluate(() => {
    document.querySelector<HTMLButtonElement>('one-app-nav-bar-menu-button button')!.onclick = () => {
      setTimeout(() => document.getElementById('more')!.style.display = 'block', 1500);
    };
  });
  await L.selectNavTab(page, 'Reports');
  await expect(page.locator('#page')).toHaveText('Reports');
});

test('list view waits for its delayed search input before searching', async ({ page }) => {
  await openFixture(page, 'list-view.html');
  await page.evaluate(() => {
    const search = document.querySelector<HTMLInputElement>('#picker input')!;
    search.style.display = 'none';
    document.getElementById('views')!.replaceChildren();
    document.querySelector<HTMLButtonElement>('button[title^="Select a List View"]')!.onclick = () => {
      document.getElementById('picker')!.style.display = 'block';
      setTimeout(() => search.style.display = 'inline-block', 1500);
    };
  });
  await L.selectListView(page, 'All Accounts');
  expect(await L.currentListViewName(page)).toBe('All Accounts');
  await expect(page.locator('#rows tr')).toHaveCount(5);
});

test('UI login waits for the delayed username field', async ({ page }, testInfo) => {
  // Disable the real CLI before loading the auth module: no org or credentials
  // are needed, and all browser requests are fulfilled below.
  const childProcess = require('child_process');
  const originalExec = childProcess.execSync;
  const environment = {
    SF_ORG_ALIAS: 'fixture-org',
    SF_LOGIN_URL: 'https://auth.example.com',
    SF_USERNAME: 'fixture-user',
    SF_PASSWORD: 'fixture-password',
    PLAYWRIGHT_PERSONA_ID: 'admin',
    PLAYWRIGHT_STORAGE_STATE: testInfo.outputPath('fixture-state.json')
  };
  const previous = Object.fromEntries(Object.keys(environment).map(key => [key, process.env[key]]));
  try {
    childProcess.execSync = () => { throw new Error('CLI disabled for offline auth test'); };
    Object.assign(process.env, environment);
    const { SalesforceAuth } = require('../utils/salesforce-auth');
    fs.mkdirSync(path.dirname(environment.PLAYWRIGHT_STORAGE_STATE), { recursive: true });
    await page.route('**/*', route => route.fulfill({
      contentType: 'text/html',
      body: new URL(route.request().url()).pathname.startsWith('/lightning/')
        ? '<header>Fixture home</header>'
        : `<script>setTimeout(() => {
            document.body.innerHTML = '<input id="username"><input id="password"><button id="Login">Log in</button>';
            document.getElementById('Login').onclick = () => location.href = '/lightning/page/home';
          }, 1500)</script>`
    }));
    await SalesforceAuth.authenticate(page);
    await expect(page).toHaveURL('https://auth.example.com/lightning/page/home');
    expect(fs.existsSync(environment.PLAYWRIGHT_STORAGE_STATE)).toBe(true);
  } finally {
    childProcess.execSync = originalExec;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
