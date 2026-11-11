import { OrgMetadataCache, ResolvedAction, TestStep, FieldDescribe } from '@kplay/core';

/**
 * Step insights power the Studio's live step check: a plain-English summary of what
 * each step will do, plus actionable issues (unknown field, bad picklist value,
 * undefined variable, unrecognised phrasing) with "did you mean" suggestions.
 */

export type InsightSeverity = 'error' | 'warning' | 'info';

export interface StepIssue {
  severity: InsightSeverity;
  message: string;
  /** Full replacement lines the tester can apply with one click */
  suggestions?: string[];
}

export interface StepInsight {
  index: number;
  lineNumber: number;
  rawText: string;
  actionType: string;
  actionLabel: string;
  summary: string;
  confidence: number;
  status: 'ok' | 'warning' | 'error';
  issues: StepIssue[];
}

export interface StepPattern {
  category: string;
  label: string;
  template: string;
  example: string;
}

/** Cheat sheet of supported phrasings (also used for autocomplete and suggestions). */
export const STEP_PATTERNS: StepPattern[] = [
  { category: 'Navigate', label: 'Log in', template: 'Log in to Salesforce', example: 'Log in to Salesforce as standard user' },
  { category: 'Navigate', label: 'App Launcher', template: 'Click App Launcher', example: 'Click App Launcher' },
  { category: 'Navigate', label: 'Search app', template: 'Search app ""', example: 'Search app "Sales"' },
  { category: 'Navigate', label: 'Select app tab', template: 'Select "" tab', example: 'Select "Accounts" tab' },
  { category: 'Navigate', label: 'Open list view', template: 'Open  list', example: 'Open Account list' },
  { category: 'Navigate', label: 'Open recent record', template: 'Open recent ', example: 'Open recent Opportunity' },
  { category: 'Navigate', label: 'Open record by variable', template: 'Open record {{}}', example: 'Open record {{caseId}}' },
  { category: 'Navigate', label: 'Switch tab', template: 'Click on  tab', example: 'Click on Details tab' },
  { category: 'Act', label: 'Click button', template: 'Click on  button', example: 'Click on New button' },
  { category: 'Act', label: 'Enter text', template: 'Enter "" in ""', example: 'Enter "Acme {{unique}}" in "Account Name"' },
  { category: 'Act', label: 'Pick picklist value', template: 'Select "" from "" picklist', example: 'Select "Technology" from "Industry" picklist' },
  { category: 'Act', label: 'Pick lookup record', template: 'Select "" in "" lookup', example: 'Select "Acme Corp" in "Account Name" lookup' },
  { category: 'Act', label: 'Tick checkbox', template: 'Check ""', example: 'Check "Do Not Call"' },
  { category: 'Act', label: 'Save modal', template: 'Save modal', example: 'Save modal' },
  { category: 'Act', label: 'Wait for page', template: 'Wait for page to load', example: 'Wait for page to load' },
  { category: 'Verify', label: 'Toast message', template: 'Verify toast ""', example: 'Verify toast "Account was created"' },
  { category: 'Verify', label: 'Field equals', template: 'Verify field "" equals ""', example: 'Verify field "Stage" equals "Closed Won"' },
  { category: 'Verify', label: 'Field not empty', template: 'Verify field "" is not empty', example: 'Verify field "Owner" is not empty' },
  { category: 'Verify', label: 'Text visible', template: 'Verify "" is visible', example: 'Verify "Audit Note" is visible' },
  { category: 'Negative', label: 'Validation error', template: 'Verify error "" on ""', example: 'Verify error "Complete this field." on "Close Date"' },
  { category: 'Negative', label: 'Page error', template: 'Verify error ""', example: 'Verify error "We hit a snag."' },
  { category: 'Permissions', label: 'Button hidden', template: 'Verify "" button is not visible', example: 'Verify "Delete" button is not visible' },
  { category: 'Permissions', label: 'Field hidden', template: 'Verify field "" is not visible', example: 'Verify field "SSN" is not visible' },
  { category: 'Permissions', label: 'Field read-only', template: 'Verify field "" is read-only', example: 'Verify field "Amount" is read-only' },
  { category: 'Permissions', label: 'Field editable', template: 'Verify field "" is editable', example: 'Verify field "Description" is editable' },
  { category: 'List views', label: 'Select list view', template: 'Select list view ""', example: 'Select list view "All Accounts"' },
  { category: 'List views', label: 'Select record checkbox', template: 'Select record ""', example: 'Select record "Acme Corp"' },
  { category: 'List views', label: 'Select several records', template: 'Select records "" and ""', example: 'Select records "Acme Corp" and "Globex"' },
  { category: 'List views', label: 'Select first records', template: 'Select first 2 records', example: 'Select first 2 records' },
  { category: 'List views', label: 'Select all records', template: 'Select all records', example: 'Select all records' },
  { category: 'Related lists', label: 'Open related list', template: 'Open "" related list', example: 'Open "Contacts" related list' },
  { category: 'Related lists', label: 'New from related list', template: 'Click "New" in "" related list', example: 'Click "New" in "Contacts" related list' },
  { category: 'Related lists', label: 'Related list count', template: 'Verify "" related list has at least 1 records', example: 'Verify "Contacts" related list has at least 1 records' },
  { category: 'Lightning', label: 'Path / stage', template: 'Mark stage as ""', example: 'Mark stage as "Qualification"' },
  { category: 'Lightning', label: 'Record type', template: 'Choose record type ""', example: 'Choose record type "Clinic Visit"' },
  { category: 'Lightning', label: 'Dual listbox', template: 'Move "" to chosen in ""', example: 'Move "Spanish" to chosen in "Languages"' },
  { category: 'Lightning', label: 'Date field', template: 'Enter "{{today+7}}" in ""', example: 'Enter "{{today+7}}" in "Close Date"' },
  { category: 'Record actions', label: 'Inline edit', template: 'Inline edit "" to ""', example: 'Inline edit "Status" to "Working"' },
  { category: 'Record actions', label: 'Change owner', template: 'Change owner to ""', example: 'Change owner to "Jane Doe"' },
  { category: 'Record actions', label: 'Delete record', template: 'Delete record', example: 'Delete record' },
  { category: 'Record actions', label: 'Submit for approval', template: 'Submit for approval', example: 'Submit for approval with comment "Ready for review"' },
  { category: 'Record actions', label: 'Convert lead', template: 'Convert lead', example: 'Convert lead' },
  { category: 'Record actions', label: 'Global search', template: 'Search for "" and open first result', example: 'Search for "Acme" and open first result' },
  { category: 'Test data', label: 'Create record via API', template: 'Create  record with Name "" as ', example: 'Create Account record with Name "Acme {{unique}}" and Industry "Technology" as acct' },
  { category: 'Test data', label: 'Reusable block', template: 'Use block ""', example: 'Use block "Login and open recent Account"' },
  { category: 'Test data', label: 'Remember field value', template: 'Remember field "" as ', example: 'Remember field "Case Number" as caseNumber' },
  { category: 'Test data', label: 'Remember record Id', template: 'Remember record Id as ', example: 'Remember record Id as caseId' }
];

export interface DataToken {
  token: string;
  description: string;
  example: string;
}

/** Built-in dynamic data tokens, resolved fresh at run time by utils/test-data.ts */
export const DATA_TOKENS: DataToken[] = [
  { token: '{{unique}}', description: 'Short id, same value for the whole run', example: 'k3x9q2' },
  { token: '{{random}}', description: 'New random id every time it is used', example: 'p7d1zm' },
  { token: '{{random.email}}', description: 'Unique email address', example: 'qa.k3x9q2@example.com' },
  { token: '{{random.phone}}', description: 'Random 10-digit US phone', example: '(555) 201-4432' },
  { token: '{{random.number}}', description: 'Random number 1-99999', example: '48213' },
  { token: '{{random.text}}', description: 'Random readable word pair', example: 'Silver Falcon' },
  { token: '{{today}}', description: "Today's date (MM/DD/YYYY by default)", example: '11/10/2026' },
  { token: '{{today+7}}', description: 'Date offset in days (use - for past)', example: '11/17/2026' },
  { token: '{{now}}', description: 'Current date and time', example: '11/10/2026 14:32' }
];

const BUILTIN_TOKEN_RE = /^(?:unique|random|random\.(?:email|phone|number|text)|today(?:[+-]\d+)?|now)$/i;

export function isBuiltinToken(name: string): boolean {
  return BUILTIN_TOKEN_RE.test(name.trim());
}

export function extractTokens(text: string): string[] {
  return [...text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((m) => m[1].trim());
}

const ACTION_LABELS: Record<string, string> = {
  navigate_app: 'Navigate',
  open_list: 'Open list',
  open_record: 'Open record',
  activate_tab: 'Switch tab',
  click_action: 'Click',
  fill_field: 'Enter text',
  select_picklist: 'Picklist',
  select_lookup: 'Lookup',
  set_checkbox: 'Checkbox',
  create_note: 'Create note',
  sync_notes: 'Sync notes',
  save_modal: 'Save modal',
  close_modal: 'Close modal',
  assert_toast: 'Check toast',
  assert_field: 'Check field',
  assert_visible: 'Check visible',
  assert_not_visible: 'Check hidden',
  assert_field_readonly: 'Check read-only',
  assert_field_editable: 'Check editable',
  assert_field_error: 'Check error',
  remember_value: 'Remember',
  related_list_open: 'Related list',
  related_list_action: 'Related list',
  assert_related_count: 'Check count',
  path_select: 'Path',
  select_record_type: 'Record type',
  dual_listbox: 'Dual listbox',
  delete_record: 'Delete',
  change_owner: 'Owner',
  global_search: 'Search',
  inline_edit: 'Inline edit',
  submit_for_approval: 'Approval',
  convert_lead: 'Convert',
  api_create: 'API setup',
  app_launcher_open: 'App Launcher',
  nav_tab: 'App tab',
  select_list_view: 'List view',
  select_list_records: 'Select rows',
  run_apex: 'Apex',
  scroll: 'Scroll',
  custom: 'Not understood'
};

function q(v: unknown): string {
  return `“${String(v)}”`;
}

export function summarizeAction(action?: ResolvedAction, rawText = ''): string {
  if (!action) return 'Not resolved';
  const f = action.field || action.target;
  const v = action.value;
  switch (action.type) {
    case 'navigate_app':
      return /home|salesforce/i.test(action.target)
        ? 'Log in and open Salesforce home'
        : `Search the App Launcher for ${q(action.target)} and open the app`;
    case 'open_list':
      return `Open the ${action.target} list view`;
    case 'open_record':
      return !v || v === 'Recent' ? `Open the most recent ${action.target} record` : `Open record ${q(v)}`;
    case 'activate_tab':
      return `Switch to the ${q(action.tab || action.target)} tab`;
    case 'click_action':
      return action.target === 'WaitForFields' ? 'Wait until the page finishes loading' : `Click ${q(action.target)}`;
    case 'fill_field':
      if (v === undefined || v === '') return `Click into ${q(f)}`;
      return f && f !== 'ActiveField' ? `Type ${q(v)} into ${q(f)}` : `Type ${q(v)} into the focused field`;
    case 'select_picklist':
      return action.field && v !== undefined ? `Pick ${q(v)} in ${q(action.field)}` : v !== undefined ? `Pick option ${q(v)}` : `Open the ${q(f)} picklist`;
    case 'select_lookup':
      return `Search and pick ${q(v)} in lookup ${q(f)}`;
    case 'set_checkbox':
      return `${v ? 'Tick' : 'Untick'} ${q(f)}`;
    case 'create_note':
      return `Create note ${q(action.extra?.title ?? '')}`;
    case 'sync_notes':
      return 'Click Sync Property Notes';
    case 'save_modal':
      return 'Click Save / Confirm in the open dialog';
    case 'close_modal':
      return 'Close the open dialog';
    case 'assert_toast':
      return `Expect a toast containing ${q(v ?? action.target)}`;
    case 'assert_field':
      return v === '__NOT_EMPTY__' ? `Expect ${q(f)} to have a value` : `Expect ${q(f)} to contain ${q(v)}`;
    case 'assert_visible':
      return `Expect ${q(v ?? action.target)} to be visible`;
    case 'assert_not_visible': {
      const kind = String(action.extra?.kind || 'any');
      return `Expect ${kind === 'any' ? '' : kind + ' '}${q(action.target)} to NOT be available`;
    }
    case 'assert_field_readonly':
      return `Expect ${q(f)} to be read-only`;
    case 'assert_field_editable':
      return `Expect ${q(f)} to be editable`;
    case 'assert_field_error':
      return action.field ? `Expect error ${q(v)} on ${q(action.field)}` : `Expect error ${q(v)} on the page`;
    case 'remember_value':
      return action.extra?.source === 'recordId'
        ? `Save the current record Id as {{${v}}}`
        : `Save the value of ${q(f)} as {{${v}}}`;
    case 'select_list_view':
      return `Switch the list to the ${q(v)} list view`;
    case 'select_list_records': {
      const mode = action.extra?.mode;
      const verb = action.extra?.checked === false ? 'Untick' : 'Tick';
      if (mode === 'all') return `${verb} the select-all checkbox in the list`;
      if (mode === 'first') return `Tick the checkbox of the first ${v} record(s) in the list`;
      return `${verb} the checkbox of ${((action.extra?.names as string[]) || []).map((n) => q(n)).join(', ')} in the list`;
    }
    case 'app_launcher_open':
      return 'Open the App Launcher';
    case 'nav_tab':
      return `Click the ${q(action.tab || action.target)} tab in the app's navigation bar`;
    case 'related_list_open':
      return `Open the ${q(action.target)} related list`;
    case 'related_list_action':
      return `Click ${q(v)} on the ${q(action.target)} related list`;
    case 'assert_related_count': {
      const op = String(action.extra?.op || '=');
      const word = op === '>=' ? 'at least ' : op === '>' ? 'more than ' : op === '<=' ? 'at most ' : '';
      return `Expect the ${q(action.target)} related list to have ${word}${v} record(s)`;
    }
    case 'path_select':
      return `Select ${q(v)} on the path and mark it as ${action.extra?.mark === 'complete' ? 'complete' : 'current'}`;
    case 'select_record_type':
      return `Choose record type ${q(v)} and continue`;
    case 'dual_listbox':
      return `Move ${q(v)} to ${action.extra?.to === 'available' ? 'Available' : 'Chosen'} in ${q(f)}`;
    case 'delete_record':
      return 'Delete the open record and confirm';
    case 'change_owner':
      return `Change owner to ${q(v)}`;
    case 'global_search':
      return `Search Salesforce for ${q(v)}${action.extra?.open ? ' and open the first result' : ''}`;
    case 'inline_edit':
      return `Inline-edit ${q(f)} to ${q(v)} and save`;
    case 'submit_for_approval':
      return `Submit the record for approval${v ? ` with comment ${q(v)}` : ''}`;
    case 'convert_lead':
      return 'Convert the lead';
    case 'api_create': {
      const n = Object.keys((action.extra?.apiFields as Record<string, string>) || {}).length;
      return `Create a ${action.target} record through the API (${n} field${n === 1 ? '' : 's'}) and save its Id as {{${v}}}`;
    }
    case 'run_apex':
      return 'Run anonymous Apex';
    case 'scroll':
      return `Scroll ${action.target}`;
    default:
      return `Not understood: ${rawText}`;
  }
}

/** Normalised Levenshtein similarity in [0,1]. */
export function similarity(a: string, b: string): number {
  const s = a.toLowerCase().replace(/[^a-z0-9]/g, '');
  const t = b.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!s.length && !t.length) return 1;
  if (!s.length || !t.length) return 0;
  const prev = new Array(t.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= s.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (s[i - 1] === t[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return 1 - prev[t.length] / Math.max(s.length, t.length);
}

function closest(needle: string, haystack: string[], max = 3, minScore = 0.45): string[] {
  const n = needle.toLowerCase();
  return haystack
    .map((h) => {
      const hl = h.toLowerCase();
      // Substring matches are strong signals ("Amount" vs "Expected Amount")
      const bonus = hl.includes(n) || n.includes(hl) ? 0.25 : 0;
      return { h, score: similarity(needle, h) + bonus };
    })
    .filter((x) => x.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => x.h);
}

function getObjectFields(catalog: OrgMetadataCache | undefined, objectApi?: string): FieldDescribe[] {
  if (!catalog?.objects || !objectApi) return [];
  const describe =
    catalog.objects[objectApi] ||
    Object.values(catalog.objects).find((o) => o.apiName.toLowerCase() === objectApi.toLowerCase());
  return describe ? Object.values(describe.fields || {}) : [];
}

function findFieldByLabel(fields: FieldDescribe[], name: string): FieldDescribe | undefined {
  const norm = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return fields.find(
    (f) =>
      f.label.toLowerCase().replace(/[^a-z0-9]/g, '') === norm ||
      f.apiName.toLowerCase().replace(/[^a-z0-9]/g, '') === norm ||
      f.apiName.replace(/__c$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '') === norm
  );
}

const FIELD_ACTIONS = new Set([
  'inline_edit',
  'dual_listbox',
  'fill_field',
  'select_picklist',
  'select_lookup',
  'set_checkbox',
  'assert_field',
  'assert_field_readonly',
  'assert_field_editable',
  'assert_field_error',
  'remember_value'
]);

/** Pattern suggestions for a line the parser did not understand. */
export function suggestPatterns(rawText: string, max = 3): string[] {
  const text = rawText.replace(/^\s*(?:step\s+)?\d+[.:)\-]\s*/i, '').trim();
  const firstWord = (text.split(/\s+/)[0] || '').toLowerCase();
  const verbAliases: Record<string, string[]> = {
    click: ['Click on  button', 'Click on  tab'],
    press: ['Click on  button'],
    tap: ['Click on  button'],
    enter: ['Enter "" in ""'],
    type: ['Enter "" in ""'],
    fill: ['Enter "" in ""'],
    input: ['Enter "" in ""'],
    set: ['Enter "" in ""', 'Select "" from "" picklist'],
    select: ['Select "" from "" picklist', 'Select "" in "" lookup'],
    choose: ['Select "" from "" picklist'],
    pick: ['Select "" from "" picklist'],
    verify: ['Verify field "" equals ""', 'Verify toast ""', 'Verify "" is visible'],
    check: ['Check ""', 'Verify field "" equals ""'],
    assert: ['Verify field "" equals ""', 'Verify toast ""'],
    validate: ['Verify field "" equals ""'],
    open: ['Open recent ', 'Open  list', 'Open App Launcher and select ""'],
    navigate: ['Open recent ', 'Open  list'],
    go: ['Open recent ', 'Open  list'],
    remember: ['Remember field "" as ', 'Remember record Id as '],
    save: ['Save modal', 'Click on Save button', 'Remember record Id as '],
    wait: ['Wait for page to load'],
    log: ['Log in to Salesforce'],
    login: ['Log in to Salesforce'],
    clicking: ['Click App Launcher', 'Click on  button'],
    searching: ['Search app ""'],
    selecting: ['Select "" tab', 'Select "" from "" picklist']
  };
  const byVerb = verbAliases[firstWord];
  if (byVerb) {
    return byVerb.slice(0, max).map((tpl) => STEP_PATTERNS.find((p) => p.template === tpl)?.example || tpl);
  }
  return STEP_PATTERNS.map((p) => ({ p, s: similarity(text, p.example) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map((x) => x.p.example);
}

/**
 * Analyse resolved steps and return per-line insights for the Studio editor.
 * `lineNumbers` maps step i -> editor line number (1-based) so the UI can highlight it.
 */
export function analyzeSteps(
  steps: TestStep[],
  options: { catalog?: OrgMetadataCache; objectApi?: string; lineNumbers?: number[]; dataColumns?: string[] } = {}
): StepInsight[] {
  const definedVars = new Set<string>(options.dataColumns || []);

  return steps.map((step, i) => {
    const action = step.action;
    const issues: StepIssue[] = [];
    const prefixMatch = step.rawText.match(/^\s*((?:step\s+)?\d+[.:)\-]\s*)/i);
    const prefix = prefixMatch ? prefixMatch[1] : '';
    const withPrefix = (line: string) => prefix + line;

    const hasEmptyPlaceholder = /(?:^|\s)["“]["”](?=\s|$)/.test(step.rawText);

    // 1. Unrecognised phrasing (a step with an empty "" placeholder is reported as "fill it in" instead)
    if ((!action || action.type === 'custom') && !hasEmptyPlaceholder) {
      issues.push({
        severity: 'error',
        message: 'KPlay does not understand this step yet, so it will do nothing when the test runs.',
        suggestions: suggestPatterns(step.rawText).map(withPrefix)
      });
    } else if (action && action.type !== 'custom' && step.status === 'review_required') {
      issues.push({
        severity: 'warning',
        message: `Low confidence (${Math.round(action.confidence * 100)}%). Check the summary matches what you meant.`
      });
    }

    // 2. Field and picklist checks against org metadata (per step: the object this step runs on)
    const stepObject = String(action?.extra?.contextObject || options.objectApi || '');
    const fields = getObjectFields(options.catalog, stepObject);
    const fieldLabels = fields.map((f) => f.label);
    if (action && FIELD_ACTIONS.has(action.type) && fields.length > 0) {
      const fieldName = action.field || (action.target !== 'ActiveField' ? action.target : undefined);
      const isPageLevel = action.type === 'assert_field_error' && !action.field;
      if (fieldName && !isPageLevel && !(action.type === 'remember_value' && action.extra?.source === 'recordId')) {
        const match = findFieldByLabel(fields, fieldName);
        if (!match) {
          const near = closest(fieldName, fieldLabels);
          issues.push({
            severity: 'warning',
            message: `No field labelled “${fieldName}” on ${stepObject}.` + (near.length ? ` Did you mean ${near.map((n) => `“${n}”`).join(', ')}?` : ''),
            suggestions: near.map((n) => step.rawText.split(fieldName).join(n))
          });
        } else {
          if (
            (action.type === 'select_picklist') &&
            action.value !== undefined &&
            match.picklistValues?.length &&
            !String(action.value).includes('{{')
          ) {
            const val = String(action.value);
            const ok = match.picklistValues.some((pv) => pv.toLowerCase() === val.toLowerCase());
            if (!ok) {
              const near = closest(val, match.picklistValues);
              issues.push({
                severity: 'warning',
                message: `“${val}” is not an active value of ${match.label}.` + (near.length ? ` Did you mean ${near.map((n) => `“${n}”`).join(', ')}?` : ''),
                suggestions: near.map((n) => step.rawText.split(val).join(n))
              });
            }
          }
          if (action.type === 'fill_field' && match.readOnly && action.value !== undefined) {
            issues.push({
              severity: 'info',
              message: `${match.label} is read-only in metadata; typing into it may fail for most users.`
            });
          }
        }
      }
    }

    // 2b. API record creation: unknown object / fields
    if (action?.type === 'api_create') {
      if (!action.extra?.objectKnown) {
        issues.push({ severity: 'warning', message: `“${action.target}” is not a known object in this org — check the object name.` });
      }
      const unmapped = (action.extra?.unmappedFields as string[]) || [];
      if (unmapped.length && getObjectFields(options.catalog, action.target).length > 0) {
        issues.push({
          severity: 'warning',
          message: `No field labelled ${unmapped.map((u) => `“${u}”`).join(', ')} on ${action.target}; it will be sent as an API name.`
        });
      }
      if (action.value) definedVars.add(String(action.value));
    }

    // 2b2. Auto-corrected spelling (informational)
    const corrections = (action?.extra?.corrections as string[]) || [];
    if (corrections.length) {
      issues.push({ severity: 'info', message: `Read as: ${corrections.join(', ')}` });
    }

    // 2c. Placeholders left empty, e.g. Select "" in "Patient" lookup
    if (hasEmptyPlaceholder) {
      issues.push({ severity: 'error', message: 'This step has an empty "" value — fill it in before running.' });
    }

    // 3. Variables / data tokens
    for (const token of extractTokens(step.rawText)) {
      if (isBuiltinToken(token)) continue;
      if (action?.type === 'remember_value' && String(action.value) === token) continue;
      if (!definedVars.has(token)) {
        issues.push({
          severity: 'error',
          message: `{{${token}}} is not a built-in token and has not been remembered by an earlier step.`,
          suggestions: []
        });
      }
    }
    if (action?.type === 'remember_value' && action.value) {
      definedVars.add(String(action.value));
    }

    const hasError = issues.some((x) => x.severity === 'error');
    const hasWarn = issues.some((x) => x.severity === 'warning');

    return {
      index: step.index,
      lineNumber: options.lineNumbers?.[i] ?? i + 1,
      rawText: step.rawText,
      actionType: action?.type || 'custom',
      actionLabel: ACTION_LABELS[action?.type || 'custom'] || action?.type || 'Unknown',
      summary: summarizeAction(action, step.rawText),
      confidence: action?.confidence ?? 0,
      status: hasError ? 'error' : hasWarn ? 'warning' : 'ok',
      issues
    };
  });
}
