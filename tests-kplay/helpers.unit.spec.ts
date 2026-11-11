import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { LightningHelpers as L } from '../utils/lightning-helpers';
import { KPlayData } from '../utils/test-data';

/**
 * Regression tests for utils/lightning-helpers.ts against saved Lightning-like pages.
 * Each fixture is served at a Lightning-style URL so URL-based helpers work too.
 */
async function openFixture(page: Page, name: string, url = 'https://kplay.lightning.force.com/lightning/r/Encounter__c/a0X000000000001AAA/view') {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf-8');
  await page.route('**/*', (route) => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto(url);
}

async function expectError(fn: () => Promise<unknown>, pattern: RegExp) {
  let message = '';
  try {
    await fn();
  } catch (err: any) {
    message = err.message;
  }
  expect(message, 'helper should have thrown').toMatch(pattern);
}

test.describe('record page', () => {
  test.beforeEach(async ({ page }) => openFixture(page, 'record-page.html'));

  test('reads field values and the record id', async ({ page }) => {
    expect(await L.readFieldValue(page, 'Encounter Number')).toBe('E-0001');
    expect(await L.readFieldValue(page, 'Billed Charges')).toBe('$1,250.00');
    expect(await L.currentRecordId(page)).toBe('a0X000000000001AAA');
  });

  test('permission checks find buttons, menu items and fields', async ({ page }) => {
    await L.verifyNotAvailable(page, 'Merge', 'button');
    await L.verifyNotAvailable(page, 'SSN', 'field');
    await expectError(() => L.verifyNotAvailable(page, 'Delete', 'button'), /available to this user as a button/);
    await expectError(() => L.verifyNotAvailable(page, 'Clone', 'button'), /"Show more actions" menu/);
    await expectError(() => L.verifyNotAvailable(page, 'Billed Charges', 'field'), /is visible to this user/);
  });

  test('read-only and editable checks', async ({ page }) => {
    await L.verifyFieldReadOnly(page, 'Billed Charges');
    await L.verifyFieldEditable(page, 'Status');
    await expectError(() => L.verifyFieldReadOnly(page, 'Status'), /inline-edit pencil/);
    await expectError(() => L.verifyFieldEditable(page, 'Billed Charges'), /read-only for this user/);
    await expectError(() => L.verifyFieldReadOnly(page, 'Nope'), /not on the page/);
  });

  test('path stage', async ({ page }) => {
    await L.selectPathStage(page, 'Checked In', 'current');
    await expect(page.locator('#stage')).toHaveText('Checked In');
    await expectError(() => L.selectPathStage(page, 'Cancelled'), /not on this record's path/);
  });

  test('related lists: count, actions, open', async ({ page }) => {
    await L.verifyRelatedListCount(page, 'Contacts', '=', 3);
    await L.verifyRelatedListCount(page, 'Notes', '>=', 10);
    await expectError(() => L.verifyRelatedListCount(page, 'Contacts', '=', 5), /shows 3 record\(s\); the test expected exactly 5/);
    await expectError(() => L.verifyRelatedListCount(page, 'Notes', '=', 10), /shows 10\+/);
    await L.relatedListAction(page, 'Contacts', 'New');
    await L.relatedListAction(page, 'Notes', 'New Note');
    await expectError(() => L.relatedListAction(page, 'Contacts', 'Merge'), /has no "Merge" action/);
    await expectError(() => L.openRelatedList(page, 'Cases'), /not on this record page/);
    await L.openRelatedList(page, 'Contacts');
    await expect(page).toHaveTitle('Contacts list');
  });

  test('record actions: delete, change owner, approval, inline edit, dual listbox, search', async ({ page }) => {
    await L.inlineEdit(page, 'Clinical Notes', 'Follow up in 2 weeks');
    expect(await L.readFieldValue(page, 'Clinical Notes')).toBe('Follow up in 2 weeks');

    await L.moveDualListboxOption(page, 'Languages', 'Spanish', 'chosen');
    await expect(page.locator('#chosen li')).toHaveText(['Spanish']);

    await L.submitForApproval(page, 'Ready for review');
    expect(await page.evaluate(() => (window as any).__comment)).toBe('Ready for review');

    await L.changeOwner(page, 'Jane Doe');
    await expect(page).toHaveTitle('owner changed');

    await L.globalSearch(page, 'Acme', true);
    await expect(page).toHaveTitle('Acme opened');

    await L.deleteRecord(page);
    await expect(page).toHaveTitle('deleted');
  });
});

test.describe('new record form', () => {
  test.beforeEach(async ({ page }) => openFixture(page, 'new-record.html', 'https://kplay.lightning.force.com/lightning/o/Encounter__c/new'));

  test('record type chooser', async ({ page }) => {
    await expectError(() => L.chooseRecordType(page, 'Inpatient'), /not offered to this user. Available: Clinic Visit, Telehealth/);
    await L.chooseRecordType(page, 'Telehealth');
    await expect(page.locator('#form')).toBeVisible();
  });

  test('validation errors and read-only inputs', async ({ page }) => {
    await L.chooseRecordType(page, 'Clinic Visit');
    await L.verifyFieldError(page, 'Complete this field.', 'Visit Date');
    await L.verifyFieldError(page, 'We hit a snag.');
    await L.verifyFieldReadOnly(page, 'Encounter Number');
    await L.verifyFieldEditable(page, 'Chief Complaint');
    await expectError(() => L.verifyFieldError(page, 'Must be in the future', 'Visit Date'), /Salesforce showed: "Complete this field."/);
  });
});

test.describe('app launcher and navigation', () => {
  test.beforeEach(async ({ page }) => openFixture(page, 'app-launcher.html', 'https://kplay.lightning.force.com/lightning/page/home'));

  test('open launcher, search an app, select tabs', async ({ page }) => {
    expect(await L.currentAppName(page)).toBe('Service');
    await L.openAppLauncher(page);
    await expect(page.getByPlaceholder('Search apps and items...')).toBeVisible();
    await L.openApp(page, 'Alliance Ortho');
    expect(await L.currentAppName(page)).toBe('Alliance Ortho');
    await L.selectNavTab(page, 'Encounters');
    await expect(page.locator('#page')).toHaveText('Encounters');
    await L.selectNavTab(page, 'Claims'); // in the "More" menu
    await expect(page.locator('#page')).toHaveText('Claims');
    await L.selectNavTab(page, 'Patient'); // singular/plural tolerant
    await expect(page.locator('#page')).toHaveText('Patients');
  });

  test('already in the app: no search; clear errors for unknown app and tab', async ({ page }) => {
    await L.openApp(page, 'Service');
    await expect(page.getByPlaceholder('Search apps and items...')).toHaveCount(0);
    await expectError(() => L.openApp(page, 'Billing Console'), /App "Billing Console" was not found in the App Launcher/);
    await expectError(() => L.selectNavTab(page, 'Invoices'), /Tab "Invoices" is not in the "Service" app's navigation. Tabs available: Home, Cases, Contacts/);
  });
});

test.describe('list views and row selection', () => {
  test.beforeEach(async ({ page }) => openFixture(page, 'list-view.html', 'https://kplay.lightning.force.com/lightning/o/Account/list?filterName=Recent'));

  const checked = (page: Page) => page.locator('#rows tr').evaluateAll((rows) =>
    rows.filter((r) => (r.querySelector('input') as HTMLInputElement).checked).map((r) => r.querySelector('th')!.textContent));

  test('switch list view', async ({ page }) => {
    await L.selectListView(page, 'All Accounts');
    expect(await L.currentListViewName(page)).toBe('All Accounts');
    await expect(page.locator('#rows tr')).toHaveCount(5);
    await L.selectListView(page, 'All Accounts'); // already selected: no-op
    await expectError(() => L.selectListView(page, 'Key Accounts'), /List view "Key Accounts" is not available to this user/);
  });

  test('select rows by name, first N, all, and untick', async ({ page }) => {
    await L.selectListRecords(page, ['Globex', 'Initech']);
    expect(await checked(page)).toEqual(['Globex', 'Initech']);
    await L.selectListRecords(page, ['Globex'], false);
    expect(await checked(page)).toEqual(['Initech']);
    await expectError(() => L.selectListRecords(page, ['Wayne Enterprises']), /No record "Wayne Enterprises" in this list view/);
    await L.selectAllListRecords(page);
    expect(await checked(page)).toEqual(['Acme Corp', 'Globex', 'Initech']);
    await L.selectAllListRecords(page, false);
    expect(await checked(page)).toEqual([]);
    await L.selectFirstListRecords(page, 2);
    expect(await checked(page)).toEqual(['Acme Corp', 'Globex']);
    await expectError(() => L.selectFirstListRecords(page, 9), /shows only 3 record/);
  });
});

test.describe('test data tokens', () => {
  test('resolve, remember and data rows', async () => {
    KPlayData.reset();
    const a = KPlayData.resolve('Acme {{unique}}');
    expect(KPlayData.resolve('Acme {{unique}}')).toBe(a);
    expect(KPlayData.resolve('{{random.email}}')).toMatch(/^qa\.[a-z0-9]+\.[a-z0-9]+@example\.com$/);
    expect(KPlayData.resolve('{{today+0}}')).toBe(KPlayData.resolve('{{today}}'));
    KPlayData.set('caseId', '500ABC');
    expect(KPlayData.resolve('/r/{{caseId}}')).toBe('/r/500ABC');
    KPlayData.load({ Patient: 'Jane Roe', Status: 'Scheduled' });
    expect(KPlayData.resolve('{{Patient}} - {{Status}}')).toBe('Jane Roe - Scheduled');
    expect(() => KPlayData.resolve('{{nope}}')).toThrow(/Unknown test data token/);
  });
});
