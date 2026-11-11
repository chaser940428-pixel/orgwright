// Tests for the code generator (stepEmitter + specGenerator).
// Run: node --test orgwright/packages/codegen/test/   (build first: pnpm --prefix orgwright -r run build)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { ActionTypeEnum } from '@orgwright/core';
import { resolveTestSteps } from '@orgwright/resolver';
import { emitActionCode, emitStepCode, generatePlaywrightSpec, valueExpr, escapeRegex } from '../dist/index.js';

/** Returns TypeScript syntax errors for a source string (no type checking, imports are not resolved). */
function syntaxErrors(source) {
  const out = ts.transpileModule(source, {
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
  });
  return (out.diagnostics || []).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

/** Wraps emitted statements so they can be syntax-checked as a function body. */
const asBody = (code) => `async function step(page, basePage, encounterPage) {\n${code}\n}`;

// A representative action for every ActionType, with awkward values (quotes, regex chars, tokens)
const SAMPLE = {
  navigate_app: { target: 'Sales "Console"' },
  open_list: { target: 'Account' },
  open_record: { target: 'Account', value: 'Acme (Corp)' },
  activate_tab: { target: 'Details' },
  click_action: { target: 'Save & New' },
  fill_field: { target: 'Account Name', field: 'Account Name', value: `O'Brien "Acme" \`x\` {{unique}}` },
  select_picklist: { target: 'Industry', field: 'Industry', value: 'Technology' },
  select_lookup: { target: 'Account', field: 'Account Name', value: 'Acme' },
  set_checkbox: { target: 'Active', field: 'Active', value: true },
  create_note: { target: 'Note', extra: { title: 'Audit', body: 'Line "1"' } },
  sync_notes: { target: 'Sync Notes' },
  save_modal: { target: 'Save' },
  close_modal: { target: 'Cancel' },
  assert_toast: { target: 'toast', value: 'was created' },
  assert_field: { target: 'Status', field: 'Status', value: 'Open' },
  assert_visible: { target: 'Audit Note' },
  assert_not_visible: { target: 'Delete', extra: { kind: 'button' } },
  assert_field_readonly: { target: 'Amount', field: 'Amount' },
  assert_field_editable: { target: 'Description', field: 'Description' },
  assert_field_error: { target: 'Close Date', field: 'Close Date', value: 'Complete this field.' },
  remember_value: { target: 'record', value: 'caseId', extra: { source: 'recordId' } },
  related_list_open: { target: 'Contacts' },
  related_list_action: { target: 'Contacts', value: 'New' },
  assert_related_count: { target: 'Contacts', value: 2, extra: { op: '>=' } },
  path_select: { target: 'Stage', value: 'Closed Won', extra: { mark: 'complete' } },
  select_record_type: { target: 'Record Type', value: 'Clinic Visit' },
  dual_listbox: { target: 'Languages', field: 'Languages', value: 'Spanish', extra: { to: 'chosen' } },
  delete_record: { target: 'record' },
  change_owner: { target: 'Owner', value: 'Jane Doe' },
  global_search: { target: 'search', value: 'Acme', extra: { open: true } },
  inline_edit: { target: 'Status', field: 'Status', value: 'Working' },
  submit_for_approval: { target: 'approval', value: 'Ready' },
  convert_lead: { target: 'Lead' },
  api_create: { target: 'Account', value: 'acct', extra: { apiObject: 'Account', apiFields: { Name: 'Acme {{unique}}' } } },
  app_launcher_open: { target: 'App Launcher' },
  nav_tab: { target: 'Encounters', extra: { objectApi: 'Encounter__c' } },
  select_list_view: { target: 'list view', value: 'All Accounts' },
  select_list_records: { target: 'records', extra: { mode: 'names', names: ['Acme', 'Globex'] } },
  run_apex: { target: 'Apex', value: 'System.debug(1);' },
  scroll: { target: 'down', value: 300 },
  custom: { target: 'Frobnicate the widget' }
};

test('every ActionType has a sample (keeps this suite in sync with @orgwright/core)', () => {
  assert.deepEqual(Object.keys(SAMPLE).sort(), [...ActionTypeEnum.options].sort());
});

for (const type of ActionTypeEnum.options) {
  test(`emitActionCode(${type}) produces syntactically valid TypeScript`, () => {
    const code = emitActionCode({ type, confidence: 1, ...SAMPLE[type] }, `step for ${type}`);
    assert.ok(code.trim().length > 0, 'emits code');
    assert.deepEqual(syntaxErrors(asBody(code)), []);
  });
}

test('no generated step silently skips: no visibility-guarded actions', () => {
  for (const type of ActionTypeEnum.options) {
    const code = emitActionCode({ type, confidence: 1, ...SAMPLE[type] });
    assert.doesNotMatch(code, /if \(await \w+\.isVisible\(\{ timeout/, `${type} must not guard on isVisible`);
  }
});

test('field locators only match visible elements (list-view headers behind a modal share the label)', () => {
  for (const action of [
    { type: 'fill_field', target: 'Account Name', field: 'Account Name', value: 'Acme', confidence: 1 },
    { type: 'fill_field', target: 'Account Name', field: 'Account Name', confidence: 1 },
    { type: 'select_picklist', target: 'Industry', field: 'Industry', confidence: 1 },
    { type: 'select_lookup', target: 'Account', field: 'Account Name', value: 'Acme', confidence: 1 }
  ]) {
    assert.match(emitActionCode(action), /\.filter\(\{ visible: true \}\)/, `${action.type} must skip hidden matches`);
  }
});

test('fill_field prefers the exact field input over inputs inside a container that mentions the label', () => {
  const code = emitActionCode({ type: 'fill_field', target: 'Last Name', field: 'Last Name', value: 'Tester', confidence: 1 });
  assert.match(code, /const input = \(await exactInput\.count\(\)\) > 0 \? exactInput\.first\(\) : nearbyInput\.first\(\);/);
  assert.match(code, /await expect\(input\)\.toHaveValue\(fieldValue\);/);
});

test('unrecognised (custom) steps throw instead of passing', () => {
  const code = emitActionCode({ type: 'custom', target: 'Frobnicate', confidence: 0.5 }, 'Frobnicate the widget');
  assert.match(code, /throw new Error\(.*does not understand this step: \\"Frobnicate the widget\\"/);
  assert.doesNotMatch(code, /waitForLightningReady/);
});

test('Run Apex throws until it is implemented', () => {
  const code = emitActionCode({ type: 'run_apex', target: 'Apex', value: 'System.debug(1);', confidence: 1 });
  assert.match(code, /throw new Error\(.*Run Apex is not supported yet/);
});

test('activate_tab clicks the tab directly so a missing tab fails the step', () => {
  const code = emitActionCode({ type: 'activate_tab', target: 'Related', confidence: 1 });
  assert.match(code, /getByRole\('tab', \{ name: \/Related\/i \}\)/);
  assert.match(code, /await tabLocator\.click\(\{ timeout: 15000 \}\);/);
});

test('unresolved steps fail inside runStep (so Studio can pause and repair them)', () => {
  const code = emitStepCode({ index: 3, rawText: '3. Do the thing', status: 'failed' });
  assert.match(code, /await StreamHelper\.runStep\(page, "3\. Do the thing", async \(\) => \{/);
  assert.match(code, /throw new Error\(/);
  assert.deepEqual(syntaxErrors(asBody(code)), []);
});

test('resolved steps are wrapped in runStep with the raw step text', () => {
  const code = emitStepCode({ index: 1, rawText: 'Click on "Save" button', status: 'resolved', action: { type: 'save_modal', target: 'Save', confidence: 1 } });
  assert.match(code, /\/\/ Step 1: Click on "Save" button/);
  assert.match(code, /StreamHelper\.runStep\(page, "Click on \\"Save\\" button"/);
});

test('valueExpr: literals vs run-time {{tokens}}', () => {
  assert.equal(valueExpr('Acme'), '"Acme"');
  assert.equal(valueExpr('Acme {{unique}}'), 'OrgwrightData.resolve("Acme {{unique}}")');
  assert.equal(valueExpr(undefined), '""');
  assert.equal(valueExpr(`a "b" 'c'`), JSON.stringify(`a "b" 'c'`));
});

test('escapeRegex escapes every regex metacharacter', () => {
  const s = 'Save & New (1) [x] *+?.^$|\\';
  assert.ok(new RegExp(`^${escapeRegex(s)}$`).test(s));
});

test('generatePlaywrightSpec: plain spec has the expected skeleton and is valid TS', () => {
  const steps = [{ index: 1, rawText: 'Delete record', status: 'resolved', action: { type: 'delete_record', target: 'record', confidence: 1 } }];
  const spec = generatePlaywrightSpec(steps, { suiteName: "O'Reilly Suite", testName: "Doesn't break", ticketNumber: 'CRM-1' });
  assert.deepEqual(syntaxErrors(spec), []);
  assert.match(spec, /test\.describe\('O\\'Reilly Suite'/);
  assert.match(spec, /test\('CRM-1: Doesn\\'t break'/);
  assert.match(spec, /StreamHelper\.attach\(page, 'CRM-1'\)/);
  assert.doesNotMatch(spec, /OrgwrightData|SalesforceApi/, 'no unused imports');
});

test('generatePlaywrightSpec: tokens import OrgwrightData; api_create imports SalesforceApi and cleans up', () => {
  const steps = [
    { index: 1, rawText: 'Create Account', status: 'resolved', action: { type: 'api_create', target: 'Account', value: 'acct', confidence: 1, extra: { apiObject: 'Account', apiFields: { Name: 'Acme {{unique}}' } } } },
    { index: 2, rawText: 'Open record {{acct}}', status: 'resolved', action: { type: 'open_record', target: 'Account', value: '{{acct}}', confidence: 1 } }
  ];
  const spec = generatePlaywrightSpec(steps, { streamHelperImportPath: '../../utils/stream-helper' });
  assert.deepEqual(syntaxErrors(spec), []);
  assert.match(spec, /import \{ OrgwrightData \} from '\.\.\/\.\.\/utils\/test-data';/);
  assert.match(spec, /import \{ SalesforceApi \} from '\.\.\/\.\.\/utils\/salesforce-api';/);
  assert.match(spec, /OrgwrightData\.reset\(\);/);
  assert.match(spec, /await SalesforceApi\.cleanup\(\);/);
  assert.match(spec, /basePage\.navigateToRecord\(OrgwrightData\.resolve\("\{\{acct\}\}"\)\)/);
});

test('generatePlaywrightSpec: data rows produce one test per row', () => {
  const steps = [{ index: 1, rawText: 'Enter "{{Patient}}" in "Name"', status: 'resolved', action: { type: 'fill_field', target: 'Name', field: 'Name', value: '{{Patient}}', confidence: 1 } }];
  const spec = generatePlaywrightSpec(steps, { testName: 'Data `run`', dataRows: [{ Patient: 'A' }, { Patient: 'B' }, {}] });
  assert.deepEqual(syntaxErrors(spec), []);
  assert.match(spec, /const DATA_ROWS: Array<Record<string, string>> = \[/);
  assert.equal((spec.match(/"Patient": "/g) || []).length, 2, 'empty rows are dropped');
  assert.match(spec, /for \(const \[rowIndex, row\] of DATA_ROWS\.entries\(\)\)/);
  assert.match(spec, /OrgwrightData\.load\(row\);/);
});

test('end to end: English steps -> resolver -> spec is valid TS and every step is a runStep', () => {
  const lines = [
    '1. Log in to Salesforce',
    '2. Click App Launcher',
    '3. Search app "Sales"',
    '4. Select "Accounts" tab in the app',
    '5. Click on New button',
    '6. Enter "Acme {{unique}}" in "Account Name"',
    '7. Select "Technology" from "Industry" picklist',
    '8. Click on Save button',
    '9. Verify toast "was created"',
    '10. Frobnicate the widget'
  ];
  const steps = resolveTestSteps(lines);
  const spec = generatePlaywrightSpec(steps, { ticketNumber: 'E2E-1' });
  assert.deepEqual(syntaxErrors(spec), []);
  assert.equal((spec.match(/await StreamHelper\.runStep\(/g) || []).length, lines.length);
  assert.match(spec, /OrgwrightData\.resolve\("Acme \{\{unique\}\}"\)/);
  assert.match(spec, /does not understand this step: \\"10\. Frobnicate the widget\\"/, 'unknown step fails loudly');
});
