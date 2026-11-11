// Golden tests for the step parser + catalog matcher.  Run: node --test orgwright/packages/resolver/test/
// (build first: pnpm --prefix orgwright -r run build)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTestSteps, analyzeSteps } from '../dist/index.js';

const field = (apiName, label, type, extra = {}) => ({ apiName, label, type, picklistValues: [], referenceTo: [], required: false, readOnly: false, ...extra });
const catalog = {
  orgAlias: 'test', release: 'x', updatedAt: new Date().toISOString(), apps: {},
  objects: {
    Account: { apiName: 'Account', label: 'Account', listUrl: '', tabs: [], actions: [], fields: {
      Name: field('Name', 'Account Name', 'string', { required: true }),
      Industry: field('Industry', 'Industry', 'picklist', { picklistValues: ['Technology', 'Banking'] })
    } },
    Encounter__c: { apiName: 'Encounter__c', label: 'Encounter', listUrl: '', tabs: [], actions: [], fields: {
      Status__c: field('Status__c', 'Status', 'picklist', { picklistValues: ['Scheduled', 'Checked In'] }),
      Visit_Date__c: field('Visit_Date__c', 'Visit Date', 'date')
    } },
    Contact: { apiName: 'Contact', label: 'Contact', listUrl: '', tabs: [], actions: [], fields: {} }
  }
};

// [step text, expected action type, expected subset of the action]
const CASES = [
  ['Log in to Salesforce', 'navigate_app', {}],
  ['Open Account list', 'open_list', { target: 'Account' }],
  ['Navigate to Encounter tab', 'open_list', { target: 'Encounter__c' }],
  ['Navigate to Encounters tab', 'open_list', { target: 'Encounter__c' }],
  ['Click on Details tab', 'activate_tab', { target: 'Details' }],
  ['Open recent Encounter', 'open_record', { target: 'Encounter__c', value: 'Recent' }],
  ['Open record {{caseId}}', 'open_record', { value: '{{caseId}}' }],
  ['Click on New button', 'click_action', { target: 'New' }],
  ['Enter "Acme {{unique}}" in "Account Name"', 'fill_field', { field: 'Account Name', value: 'Acme {{unique}}' }],
  ['Select "Technology" from "Industry" picklist', 'select_picklist', { field: 'Industry', value: 'Technology' }],
  ['Verify toast "was created"', 'assert_toast', { value: 'was created' }],
  ['Verify field "Account Name" equals "Acme"', 'assert_field', { value: 'Acme' }],
  ['Verify "Audit Note" is visible', 'assert_visible', {}],
  ['Verify "Delete" button is not visible', 'assert_not_visible', { target: 'Delete' }],
  ['Verify Delete button is not visible', 'assert_not_visible', { target: 'Delete' }],
  ['Verify user cannot see field "SSN"', 'assert_not_visible', { target: 'SSN' }],
  ['Verify field "Amount" is read-only', 'assert_field_readonly', { field: 'Amount' }],
  ['Verify field "Description" is editable', 'assert_field_editable', { field: 'Description' }],
  ['Verify error "Complete this field." on "Close Date"', 'assert_field_error', { field: 'Close Date', value: 'Complete this field.' }],
  ['Verify error "We hit a snag."', 'assert_field_error', { value: 'We hit a snag.' }],
  ['Remember record Id as caseId', 'remember_value', { value: 'caseId' }],
  ['Remember field "Case Number" as caseNo', 'remember_value', { value: 'caseNo' }],
  ['Open "Contacts" related list', 'related_list_open', { target: 'Contacts' }],
  ['Click "New" in "Contacts" related list', 'related_list_action', { target: 'Contacts', value: 'New' }],
  ['Verify "Contacts" related list has at least 2 records', 'assert_related_count', { target: 'Contacts', value: 2 }],
  ['Verify "Notes" related list is empty', 'assert_related_count', { target: 'Notes', value: 0 }],
  ['Mark stage as "Qualification"', 'path_select', { value: 'Qualification' }],
  ['Select "Closed Won" in path and mark as complete', 'path_select', { value: 'Closed Won' }],
  ['Choose record type "Clinic Visit"', 'select_record_type', { value: 'Clinic Visit' }],
  ['Move "Spanish" to chosen in "Languages"', 'dual_listbox', { value: 'Spanish' }],
  ['Delete record', 'delete_record', {}],
  ['Change owner to "Jane Doe"', 'change_owner', { value: 'Jane Doe' }],
  ['Search for "Acme" and open first result', 'global_search', { value: 'Acme' }],
  ['Inline edit "Status" to "Working"', 'inline_edit', { value: 'Working' }],
  ['Submit for approval with comment "Ready"', 'submit_for_approval', { value: 'Ready' }],
  ['Convert lead', 'convert_lead', {}],
  ['Create Account record with Name "Acme {{unique}}" and Industry "Technology" as acct', 'api_create', { target: 'Account', value: 'acct' }],
  ['Log into Salesforce', 'navigate_app', {}],
  ['log insto salesforece', 'navigate_app', {}],
  ['Click App Launcher', 'app_launcher_open', {}],
  ['clciking app auncher', 'app_launcher_open', {}],
  ['Search app "Sales"', 'navigate_app', { target: 'Sales' }],
  ['searching desired application "Alliance Ortho"', 'navigate_app', { target: 'Alliance Ortho' }],
  ['Select app "Sales"', 'navigate_app', { target: 'Sales' }],
  ['Select "Encounters" tab in the app', 'nav_tab', { target: 'Encounters' }],
  ['Search for "Acme"', 'global_search', { value: 'Acme' }],
  ['Select list view "All Accounts"', 'select_list_view', { value: 'All Accounts' }],
  ['Switch to "My Accounts" list view', 'select_list_view', { value: 'My Accounts' }],
  ['Choose list view All Open Cases', 'select_list_view', { value: 'All Open Cases' }],
  ['Open Encounter list view', 'open_list', { target: 'Encounter__c' }],
  ['Select record "Acme Corp"', 'select_list_records', { value: 'Acme Corp' }],
  ['Check records "Acme" and "Globex"', 'select_list_records', { value: 'Acme, Globex' }],
  ['Select the checkbox for "Acme"', 'select_list_records', { value: 'Acme' }],
  ['Uncheck record "Acme"', 'select_list_records', { value: 'Acme' }],
  ['Select first 3 records', 'select_list_records', { value: 3 }],
  ['Select the first record', 'select_list_records', { value: 1 }],
  ['Select all records', 'select_list_records', { value: 'all' }],
  ['Check "Do Not Call"', 'set_checkbox', {}],
  ['Frobnicate the widget', 'custom', {}]
];

for (const [text, type, subset] of CASES) {
  test(`${text} -> ${type}`, () => {
    const [step] = resolveTestSteps([text], catalog, { currentObject: 'Account' });
    assert.equal(step.action.type, type, `action type for "${text}"`);
    for (const [k, v] of Object.entries(subset)) {
      assert.deepEqual(step.action[k], v, `${k} for "${text}"`);
    }
  });
}

test('api_create maps field labels to API names', () => {
  const [step] = resolveTestSteps(['Create Account record with Name "Acme" and Industry "Technology" as acct'], catalog);
  assert.deepEqual(step.action.extra.apiFields, { Name: 'Acme', Industry: 'Technology' });
});

test('per-step object context: fields are checked against the object the step is on', () => {
  const steps = resolveTestSteps([
    'Open Account list',
    'Select "Technology" from "Industry" picklist',
    'Navigate to Encounter tab',
    'Select "Checked In" from "Status" picklist',
    'Select "Closed" from "Status" picklist'
  ], catalog, { currentObject: 'Account' });
  const ins = analyzeSteps(steps, { catalog, objectApi: 'Account' });
  assert.equal(ins[1].status, 'ok');
  assert.equal(ins[3].status, 'ok', 'Status exists on Encounter__c');
  assert.equal(ins[4].status, 'warning', '"Closed" is not an Encounter status');
});

test('undefined variables are errors, remembered and data-row variables are not', () => {
  const steps = resolveTestSteps(['Remember record Id as caseId', 'Open record {{caseId}}', 'Enter "{{Patient}}" in "Account Name"', 'Enter "{{nope}}" in "Account Name"'], catalog);
  const ins = analyzeSteps(steps, { catalog, objectApi: 'Account', dataColumns: ['Patient'] });
  assert.deepEqual(ins.map((i) => i.status), ['ok', 'ok', 'ok', 'error']);
});

test('empty quoted placeholders are flagged', () => {
  const steps = resolveTestSteps(['Select "" in "Patient" lookup', 'Enter "x" in "Account Name"'], catalog);
  const ins = analyzeSteps(steps, { catalog, objectApi: 'Account' });
  assert.equal(ins[0].status, 'error');
  assert.equal(ins[1].status, 'ok');
});

test('the opening flow: login, App Launcher, search app, select tab — then fields of that object', () => {
  const steps = resolveTestSteps([
    '1. log insto salesforece',
    '2. clciking app auncher',
    '3. searching desired application "Alliance Ortho"',
    '4. then selecting "Encounters" tab',
    '5. Select "Checked In" from "Status" picklist'
  ], catalog, { currentObject: 'Account' });
  assert.deepEqual(steps.map((s) => s.action.type), ['navigate_app', 'app_launcher_open', 'navigate_app', 'nav_tab', 'select_picklist']);
  assert.equal(steps[3].action.extra.objectApi, 'Encounter__c');
  const ins = analyzeSteps(steps, { catalog, objectApi: 'Account' });
  assert.equal(ins[4].status, 'ok', 'Status checked against Encounter');
  assert.match(ins[1].issues[0].message, /clciking → clicking/);
});

test('record-page tabs stay record tabs inside an app', () => {
  const steps = resolveTestSteps(['Search app "Sales"', 'Open recent Account', 'Click on Details tab'], catalog);
  assert.equal(steps[2].action.type, 'activate_tab');
});

test('custom record-page tab after opening a record is not treated as an app tab', () => {
  const steps = resolveTestSteps(['Search app "Sales"', 'Open recent Account', 'Click on Visits tab', 'Select "Contacts" tab in the app'], catalog);
  assert.deepEqual(steps.map((s) => s.action.type), ['navigate_app', 'open_record', 'activate_tab', 'nav_tab']);
});

test('opening template placeholders ask to be filled in', () => {
  const steps = resolveTestSteps(['Log in to Salesforce', 'Click App Launcher', 'Search app ""', 'Select "" tab'], catalog);
  const ins = analyzeSteps(steps, { catalog });
  assert.deepEqual(ins.map((i) => i.status), ['ok', 'ok', 'error', 'error']);
  assert.equal(ins[3].issues.length, 1);
  assert.match(ins[3].issues[0].message, /empty "" value/);
});

test('uncheck and multi-record selection details', () => {
  const [a, b] = resolveTestSteps(['Uncheck record "Acme"', 'Check records "Acme", "Globex" and "Hooli"']);
  assert.equal(a.action.extra.checked, false);
  assert.deepEqual(b.action.extra.names, ['Acme', 'Globex', 'Hooli']);
});

test('autocorrect leaves real words alone', () => {
  const steps = resolveTestSteps(['Open recent Case', 'Select all records', 'Click on Leads tab', 'Select first 2 rows']);
  for (const st of steps) assert.equal(st.action.extra?.corrections, undefined, st.rawText);
});
