// Unit tests for the low-level step parser helpers (cleanStepText, autocorrectStep, parseStep).
// Run: node --test orgwright/packages/resolver/test/   (build first: pnpm --prefix orgwright -r run build)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanStepText, autocorrectStep, parseStep, resolveTestSteps } from '../dist/index.js';

test('cleanStepText strips numbering and bullets', () => {
  const cases = [
    ['1. Open recent Encounter', 1, 'Open recent Encounter'],
    ['12) Click Save', 12, 'Click Save'],
    ['Step 3: Click Sync Notes', 3, 'Click Sync Notes'],
    ['step 4- Delete record', 4, 'Delete record'],
    ['- Verify toast "Saved"', undefined, 'Verify toast "Saved"'],
    ['* Convert lead', undefined, 'Convert lead'],
    ['   Delete record   ', undefined, 'Delete record']
  ];
  for (const [raw, index, cleaned] of cases) {
    const r = cleanStepText(raw);
    assert.equal(r.cleaned, cleaned, raw);
    assert.equal(r.index, index, raw);
  }
});

test('autocorrectStep fixes misspelled step words but never touches quoted values', () => {
  const r = autocorrectStep('clciking "Clciking Corp" record');
  assert.match(r.text, /^clicking "Clciking Corp"/);
  assert.ok(r.corrections.some((c) => /clciking → clicking/.test(c)));
});

test('autocorrectStep leaves correct text unchanged', () => {
  const r = autocorrectStep('Select "Technology" from "Industry" picklist');
  assert.equal(r.text, 'Select "Technology" from "Industry" picklist');
  assert.deepEqual(r.corrections, []);
});

test('parseStep keeps the raw text and uses the number from the line', () => {
  const r = parseStep('7. Delete record', 99);
  assert.equal(r.index, 7);
  assert.equal(r.rawText, '7. Delete record');
  assert.equal(r.actionType, 'delete_record');
});

test('parseStep falls back to defaultIndex when the line has no number', () => {
  assert.equal(parseStep('Delete record', 5).index, 5);
});

test('scroll steps: direction, amount and element targets', () => {
  assert.deepEqual(pick(parseStep('Scroll down by 800px')), { actionType: 'scroll', target: 'down', value: 800 });
  assert.deepEqual(pick(parseStep('Scroll up')), { actionType: 'scroll', target: 'up', value: 500 });
  assert.deepEqual(pick(parseStep('Scroll to bottom')), { actionType: 'scroll', target: 'bottom', value: 500 });
  const el = parseStep('Scroll to "Related Contacts"');
  assert.equal(el.actionType, 'scroll');
  assert.equal(el.target, 'to Related Contacts');
});

test('Run Apex is recognised (and code generation fails it loudly until supported)', () => {
  const r = parseStep('Execute anonymous apex: System.debug(1);');
  assert.equal(r.actionType, 'run_apex');
  assert.equal(r.value, 'System.debug(1);');
});

test('"click ... field" is treated as focusing a field, not clicking a button', () => {
  const r = parseStep('Click on the Description field');
  assert.equal(r.actionType, 'fill_field');
  assert.equal(r.field, 'Description');
  assert.equal(r.value, undefined);
});

test('unknown click targets fall back to a button click with lower confidence', () => {
  const r = parseStep('Click Launch Rocket');
  assert.equal(r.actionType, 'click_action');
  assert.equal(r.target, 'Launch Rocket');
  assert.ok(r.rawConfidence < 0.9);
});

test('unrecognised text becomes a low-confidence custom step', () => {
  const r = parseStep('Frobnicate the widget');
  assert.equal(r.actionType, 'custom');
  assert.ok(r.rawConfidence <= 0.5);
});

test('resolveTestSteps keeps order, indexes and flags low-confidence steps for review', () => {
  const steps = resolveTestSteps(['Log in to Salesforce', 'Frobnicate the widget', 'Delete record']);
  assert.deepEqual(steps.map((s) => s.index), [1, 2, 3]);
  assert.deepEqual(steps.map((s) => s.action?.type), ['navigate_app', 'custom', 'delete_record']);
  assert.notEqual(steps[1].status, 'resolved', 'custom step is not marked resolved');
});

test('resolveTestSteps returns one step per input line (callers such as toLines() drop blank lines first)', () => {
  const steps = resolveTestSteps(['Delete record', 'Convert lead']);
  assert.equal(steps.length, 2);
  assert.deepEqual(steps.map((s) => s.action?.type), ['delete_record', 'convert_lead']);
});

function pick(r) {
  return { actionType: r.actionType, target: r.target, value: r.value };
}
