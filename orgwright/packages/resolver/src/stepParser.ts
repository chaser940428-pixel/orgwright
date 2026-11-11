import { ActionType } from '@orgwright/core';

export interface ParsedStepResult {
  index: number;
  rawText: string;
  cleanedText: string;
  actionType: ActionType;
  target: string;
  field?: string;
  value?: any;
  tab?: string;
  extra?: Record<string, any>;
  rawConfidence: number;
  /** Misspelled words that were auto-corrected before parsing, e.g. ["clciking → clicking"] */
  corrections?: string[];
}

/**
 * Strips step numbers, bullets, and prefixes from raw test step lines.
 * Examples:
 *   "1. Open recent Encounter" -> { index: 1, cleaned: "Open recent Encounter" }
 *   "Step 3: Click Sync Property Notes" -> { index: 3, cleaned: "Click Sync Property Notes" }
 *   "- Verify toast \"Note synced\"" -> { cleaned: "Verify toast \"Note synced\"" }
 */
export function cleanStepText(raw: string): { index?: number; cleaned: string } {
  const trimmed = raw.trim();
  const prefixRegex = /^(?:(?:step\s+)?(\d+)[.:\-)]|[-*•>])\s*(.*)$/i;
  const match = trimmed.match(prefixRegex);

  if (match) {
    const numStr = match[1];
    const index = numStr ? parseInt(numStr, 10) : undefined;
    const cleaned = (match[2] || '').trim();
    return { index, cleaned };
  }

  return { cleaned: trimmed };
}

/**
 * Deterministic NLP / Regex parser for manual Salesforce QA test steps.
 */
// Words testers type in steps; close misspellings outside quotes are corrected before parsing
const STEP_VOCABULARY = [
  'salesforce', 'login', 'log', 'into', 'sign', 'app', 'apps', 'application', 'applications', 'launcher', 'waffle',
  'click', 'clicking', 'clicked', 'search', 'searching', 'select', 'selecting', 'open', 'opening', 'navigate', 'navigating',
  'enter', 'entering', 'type', 'typing', 'verify', 'verifying', 'button', 'tab', 'field', 'picklist', 'record', 'recent',
  'desired', 'navigation', 'remember', 'toast', 'visible', 'save', 'cancel', 'related', 'list', 'lookup', 'checkbox'
];

function editDistance(a: string, b: string): number {
  // Damerau-Levenshtein (adjacent transpositions count as one edit: "clciking" -> "clicking")
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** Corrects close misspellings of step keywords (never inside quotes). */
export function autocorrectStep(text: string): { text: string; corrections: string[] } {
  const corrections: string[] = [];
  const parts = text.split(/(["“”'][^"“”']*["“”'])/);
  const fixed = parts.map((part, i) => {
    if (i % 2 === 1) return part; // quoted value
    // Only words of 5+ letters: short words ("case", "lead") are too close to keywords to guess safely
    return part.replace(/[A-Za-z]{5,}/g, (word) => {
      const lower = word.toLowerCase();
      if (STEP_VOCABULARY.includes(lower)) return word;
      // Plurals of keywords are valid words, not typos ("records", "checkboxes")
      if (/s$/.test(lower) && (STEP_VOCABULARY.includes(lower.slice(0, -1)) || STEP_VOCABULARY.includes(lower.slice(0, -2)))) return word;
      let best = '';
      let bestDist = 99;
      for (const v of STEP_VOCABULARY) {
        if (Math.abs(v.length - lower.length) > 2) continue;
        const dist = editDistance(lower, v);
        if (dist < bestDist) {
          bestDist = dist;
          best = v;
        }
      }
      const allowed = lower.length >= 7 ? 2 : 1;
      if (best && bestDist <= allowed) {
        corrections.push(`${word} → ${best}`);
        return word[0] === word[0].toUpperCase() ? best[0].toUpperCase() + best.slice(1) : best;
      }
      return word;
    });
  });
  return { text: fixed.join(''), corrections };
}

export function parseStep(rawText: string, defaultIndex = 1): ParsedStepResult {
  const { index: parsedIndex, cleaned } = cleanStepText(rawText);
  // "Then selecting ...", "And click ..." — connecting words carry no action
  const withoutConnector = cleaned.replace(/^(?:and\s+then|then|and|next|after\s+that|afterwards|finally|now)\s*,?\s+/i, '');
  const { text, corrections } = autocorrectStep(withoutConnector);
  const result = parseStepText(rawText, text, parsedIndex ?? defaultIndex);
  if (corrections.length) {
    result.corrections = corrections;
    result.extra = { ...(result.extra || {}), corrections };
  }
  return result;
}

function parseStepText(rawText: string, text: string, index: number): ParsedStepResult {

  // 0. Login / Authentication
  // e.g. "Log in to Salesforce as standard user", "Login to Salesforce", "Sign in to Salesforce Stage Sandbox"
  const loginRegex = /^(?:log(?:ging)?\s*in(?:to)?|login|sign(?:ing)?\s*in(?:to)?|authenticate|open\s+salesforce)\b/i;
  if (loginRegex.test(text)) {
    const personaMatch = text.match(/(?:as\s+)(.+)/i);
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'navigate_app',
      target: 'Salesforce Home',
      value: personaMatch ? personaMatch[1].trim() : 'Standard User',
      rawConfidence: 0.98
    };
  }

  // 0.5 Negative / permission assertions and test-data variables
  const advanced = parseAdvancedStep(text, index, rawText);
  if (advanced) {
    return advanced;
  }

  // 1. Create Note with Title and Body
  // e.g. "Create note with title "Audit" and body "text""
  const createNoteTitleBodyRegex = /(?:create|add|new)\s+(?:a\s+)?note\s+(?:with\s+)?title\s+["'“]([^"'”]+)["'”]\s+(?:and|with)\s+(?:body|content|text)\s+["'“]([^"'”]+)["'”]/i;
  let match = text.match(createNoteTitleBodyRegex);
  if (match) {
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'create_note',
      target: 'Note',
      extra: {
        title: match[1].trim(),
        body: match[2].trim()
      },
      rawConfidence: 0.95
    };
  }

  // Create note shorthand / key-value format
  const createNoteKVRegex = /(?:create|add|new)\s+(?:a\s+)?note\s*[:\s]+\s*title\s*[:=]\s*["'“]?([^"'”\n,]+)["'”]?,?\s*(?:and\s+)?(?:body|content|text)\s*[:=]\s*["'“]?([^"'”\n]+)["'”]?/i;
  match = text.match(createNoteKVRegex);
  if (match) {
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'create_note',
      target: 'Note',
      extra: {
        title: match[1].trim(),
        body: match[2].trim()
      },
      rawConfidence: 0.92
    };
  }

  // Create note with title only
  const createNoteTitleOnlyRegex = /(?:create|add|new)\s+(?:a\s+)?note\s+(?:titled|named|with\s+title)\s+["'“]([^"'”]+)["'”]/i;
  match = text.match(createNoteTitleOnlyRegex);
  if (match) {
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'create_note',
      target: 'Note',
      extra: {
        title: match[1].trim(),
        body: ''
      },
      rawConfidence: 0.92
    };
  }

  // 2. Sync Property Notes / Sync Notes
  // e.g. "Click Sync Property Notes", "Trigger Sync Notes button", "Sync Property Notes"
  const syncNotesRegex = /(?:click|press|trigger|run|start)\s+(?:the\s+)?sync\s+(?:property\s+)?notes?(?:\s+button)?/i;
  if (syncNotesRegex.test(text) || /^sync\s+(?:property\s+)?notes?(?:\s+button)?$/i.test(text)) {
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'sync_notes',
      target: 'Sync Property Notes',
      rawConfidence: 0.95
    };
  }

  // 3. Verify Toast Notification
  // e.g. "Verify toast \"Note synced\"", "Wait for toast \"Notes synced successfully\"", "Assert toast message \"Record saved\""
  const verifyToastRegex = /(?:verify|assert|check|validate|expect|wait\s+for|await)\s+(?:that\s+)?(?:the\s+)?toast\s+(?:message\s+)?(?:displays?|shows?|contains?|is|with\s+text)?\s*["'“]([^"'”]+)["'”]/i;
  match = text.match(verifyToastRegex);
  if (match) {
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'assert_toast',
      target: 'Toast',
      value: match[1].trim(),
      rawConfidence: 0.95
    };
  }

  // Generic toast assertion e.g. "Verify success toast"
  const genericToastRegex = /(?:verify|assert|check)\s+(?:that\s+)?(?:the\s+)?(success|error|warning|info)\s+toast(?:\s+appears?|\s+shows?|\s+is\s+visible)?/i;
  match = text.match(genericToastRegex);
  if (match) {
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'assert_toast',
      target: 'Toast',
      value: match[1].trim(),
      rawConfidence: 0.90
    };
  }

  // 3.5 Wait for fields / Auto-populate / Page readiness
  // e.g. "Wait for fields to auto populate", "Wait for fields to load", "Wait for page to load", "Wait for lightning ready"
  const waitFieldsRegex = /^(?:wait|await)\s+(?:for\s+)?(?:the\s+)?(?:fields?\s+to\s+(?:auto[- ]?populate|populate|load|appear)|page\s+to\s+load|lightning\s+ready|records?\s+to\s+load|data\s+to\s+populate|modal\s+to\s+load|form\s+to\s+load|spinner(?:\s+to\s+disappear)?)\b/i;
  if (waitFieldsRegex.test(text)) {
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'click_action',
      target: 'WaitForFields',
      rawConfidence: 0.95
    };
  }

  // 4. App Navigation / Launcher
  // e.g. "Open App Launcher and select \"Revenue Ops Console\"", "Navigate to app 'Revenue Ops Console'"
  const appLauncherRegex = /(?:open|navigate\s+to|switch\s+to|launch)\s+(?:the\s+)?app\s+launcher\s+(?:and\s+(?:select|open)\s+|to\s+)?["'“]?([^"'”\n]+?)["'”]?(?:\s+app)?$/i;
  match = text.match(appLauncherRegex);
  if (match && match[1].trim()) {
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'navigate_app',
      target: match[1].trim(),
      rawConfidence: 0.92
    };
  }

  const navigateAppDirectRegex = /(?:open|navigate\s+to|select|switch\s+to)\s+(?:the\s+)?["'“]([^"'”]+)["'”]\s+app\b/i;
  match = text.match(navigateAppDirectRegex);
  if (match) {
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'navigate_app',
      target: match[1].trim(),
      rawConfidence: 0.90
    };
  }

  const consoleDirectRegex = /(?:open|navigate\s+to|select)\s+(?:the\s+)?([a-zA-Z0-9\s]+?\s+console)\b/i;
  match = text.match(consoleDirectRegex);
  if (match) {
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'navigate_app',
      target: match[1].trim(),
      rawConfidence: 0.90
    };
  }

  // 5. Open / Navigate to Record
  // Handles:
  // "Navigate to Encounter record recent"
  // "Navigate to Encounter recent"
  // "Navigate to Encounter"
  // "Navigate to Encounter record"
  // "Open recent Encounter"
  // "Open Encounter record recent"
  // "Open Encounter"
  // "Go to recent Account"
  // "Open Opportunity record"
  const openRecordGenericRegex = /^(?:navigate\s+to|open|go\s+to|view)\s+(?:the\s+)?(?:recent\s+)?([a-zA-Z0-9_]+)(?:\s+record)?(?:\s+(?:recent|first|1st))?$/i;
  match = text.match(openRecordGenericRegex);
  if (match) {
    const objectCandidate = match[1].trim();
    const disallowed = /^(?:app|launcher|tab|list|console|button|field|dropdown|picklist|combobox|input|checkbox|option|modal|dialog|toast)$/i;
    // Exclude if it's explicitly a list, tab, field, or dropdown
    if (!disallowed.test(objectCandidate) && !/\b(?:list|list\s*view|tab|field|dropdown|picklist|combobox|button|option|checkbox)\b/i.test(text)) {
      const isSpecificId = /(?:record\s+["'“]?([a-zA-Z0-9]{15,18})["'”]?)/i.exec(text);
      return {
        index,
        rawText,
        cleanedText: text,
        actionType: 'open_record',
        target: objectCandidate,
        value: isSpecificId ? isSpecificId[1].trim() : 'Recent',
        rawConfidence: 0.95
      };
    }
  }

  // Open Record By ID e.g. "Open record '001xx000003DGS2AAO'", "Click on 001xx000003DGS2AAO record"
  const openRecordByIdRegex = /(?:open|view|navigate\s+to|click\s+on)\s+(?:the\s+)?(?:record\s+)?["'“]?([a-zA-Z0-9]{15,18})["'”]?\s*(?:record)?/i;
  match = text.match(openRecordByIdRegex);
  if (match) {
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'open_record',
      target: 'Record',
      value: match[1].trim(),
      rawConfidence: 0.95
    };
  }

  // 6. Open List View
  // e.g. "Navigate to Encounter list", "Open Encounter list view", "Go to Account list"
  const openListRegex = /(?:navigate\s+to|open|go\s+to|view)\s+(?:the\s+)?([a-zA-Z0-9_]+)\s+(?:list|list\s*view)/i;
  match = text.match(openListRegex);
  if (match) {
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'open_list',
      target: match[1].trim(),
      rawConfidence: 0.90
    };
  }

  // 7. Activate Tab
  // e.g. "Click on Details tab", "Click Details tab", "Click tab 'Details'", "Go to 'Related' tab", "Navigate to Details tab"
  const activateTabRegex1 = /(?:click(?:\s+on)?|select|activate|switch\s+to|go\s+to|open|navigate\s+to)\s+(?:the\s+)?["'“]?([a-zA-Z0-9_\s]+?)["'”]?\s+tab\b/i;
  match = text.match(activateTabRegex1);
  if (match && !/^(?:app|browser|window)$/i.test(match[1].trim())) {
    const tabName = match[1].trim();
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'activate_tab',
      target: tabName,
      tab: tabName,
      rawConfidence: 0.95
    };
  }

  const activateTabRegex2 = /(?:click(?:\s+on)?|select|activate)\s+tab\s+["'“]?([a-zA-Z0-9_\s]+?)["'”]?$/i;
  match = text.match(activateTabRegex2);
  if (match) {
    const tabName = match[1].trim();
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'activate_tab',
      target: tabName,
      tab: tabName,
      rawConfidence: 0.95
    };
  }

  // 8. Select Picklist & Dropdown interactions
  // 8a. Select / Focus Picklist or Combobox Field (without selecting option yet)
  // e.g. "Select Issue Type picklist", "Click on Issue Type dropdown", "Open Status combobox"
  const openPicklistRegex = /^(?:select|click(?:\s+on)?|open|focus(?:\s+on)?)\s+(?:the\s+)?["'“]?([a-zA-Z0-9_\s]+?)["'”]?(?:\s+(?:picklist|combobox|dropdown))\s*$/i;
  match = text.match(openPicklistRegex);
  if (match) {
    const fld = match[1].trim();
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'select_picklist',
      target: fld,
      field: fld,
      value: undefined,
      rawConfidence: 0.92
    };
  }

  // 8b. Choose Option from opened Dropdown / Picklist
  // e.g. "Choose Insurance as option", "Select option Insurance", "Pick 'Insurance' from dropdown"
  const chooseOptionRegex1 = /^(?:choose|select|pick|click(?:\s+on)?)\s+(?:option\s+)?["'“]?([a-zA-Z0-9_\s]+?)["'”]?(?:\s+(?:as\s+)?(?:an\s+)?option|\s+from\s+(?:the\s+)?(?:dropdown|picklist|options|menu|list))\s*$/i;
  match = text.match(chooseOptionRegex1);
  if (match) {
    const opt = match[1].trim();
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'select_picklist',
      target: opt,
      value: opt,
      rawConfidence: 0.92
    };
  }

  const chooseOptionRegex2 = /^(?:choose|select|pick|click(?:\s+on)?)\s+option\s+["'“]?([a-zA-Z0-9_\s]+?)["'”]?\s*$/i;
  match = text.match(chooseOptionRegex2);
  if (match) {
    const opt = match[1].trim();
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'select_picklist',
      target: opt,
      value: opt,
      rawConfidence: 0.92
    };
  }

  // 8c. Single-step Picklist Selection (Field + Value)
  // e.g. "Select 'Approved' in 'Status' picklist", "Select Insurance in Issue Type picklist"
  const selectPicklistRegex1 = /^(?:select|choose|pick)\s+(?:picklist\s+)?["'“]?([^"'”\n]+?)["'”]?\s+(?:in|from|for|as)\s+(?:the\s+)?(?:picklist\s+)?["'“]?([a-zA-Z0-9_\s]+?)["'”]?(?:\s+(?:picklist|combobox|dropdown|field))?$/i;
  match = text.match(selectPicklistRegex1);
  if (match && !/^(?:option|item)$/i.test(match[2].trim())) {
    const val = match[1].trim();
    const fld = match[2].trim();
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'select_picklist',
      target: fld,
      field: fld,
      value: val,
      rawConfidence: 0.92
    };
  }

  const selectPicklistRegex2 = /^(?:select|choose|set)\s+(?:the\s+)?(?:picklist\s+)?["'“]?([a-zA-Z0-9_\s]+?)["'”]?(?:\s+(?:picklist|combobox|dropdown|field))?\s+(?:to|with|as)\s+["'“]?([^"'”\n]+?)["'”]?$/i;
  match = text.match(selectPicklistRegex2);
  if (match && !/^(?:option|item)$/i.test(match[1].trim())) {
    const fld = match[1].trim();
    const val = match[2].trim();
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'select_picklist',
      target: fld,
      field: fld,
      value: val,
      rawConfidence: 0.90
    };
  }

  // 9. Checkbox
  // e.g. "Check checkbox 'Is Active'", "Uncheck 'Billable'"
  const checkboxRegex = /(check|uncheck|tick|untick|enable|disable)\s+(?:the\s+)?(?:checkbox\s+)?["'“]?([a-zA-Z0-9_\s]+?)["'”]?(?:\s+checkbox)?$/i;
  match = text.match(checkboxRegex);
  if (match) {
    const verb = match[1].toLowerCase();
    const isCheck = verb === 'check' || verb === 'tick' || verb === 'enable';
    const fld = match[2].trim();
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'set_checkbox',
      target: fld,
      field: fld,
      value: isCheck,
      rawConfidence: 0.92
    };
  }

  // 10. Lookup Field
  // e.g. "Search and select Contact 'John Doe' in Patient lookup"
  const selectLookupRegex = /(?:search\s+and\s+select|select|choose)\s+(?:lookup\s+)?(?:record\s+)?["'“]([^"'”]+)["'”]\s+(?:in|for)\s+(?:lookup\s+)?["'“]?([a-zA-Z0-9_\s]+?)["'”]?(?:\s+lookup)?$/i;
  match = text.match(selectLookupRegex);
  if (match) {
    const val = match[1].trim();
    const fld = match[2].trim();
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'select_lookup',
      target: fld,
      field: fld,
      value: val,
      rawConfidence: 0.90
    };
  }

  // 11. Modal Save / Close
  // e.g. "Save modal", "Confirm dialog", "Close modal", "Cancel dialog"
  if (/(?:save|confirm|submit|proceed)\s+(?:the\s+)?(?:modal|dialog|popup|window)/i.test(text)) {
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'save_modal',
      target: 'Modal',
      rawConfidence: 0.92
    };
  }

  if (/(?:close|cancel|dismiss)\s+(?:the\s+)?(?:modal|dialog|popup|window)/i.test(text)) {
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'close_modal',
      target: 'Modal',
      rawConfidence: 0.92
    };
  }

  // 12. Assert Field - Not Empty
  // e.g. "Verify field 'Owner' is not empty", "Verify Owner field is not empty", "Check that Owner is populated"
  const assertFieldNotEmptyRegex = /(?:verify|assert|check|validate|expect)\s+(?:that\s+)?(?:field\s+)?["'“]?([a-zA-Z0-9_\s]+?)["'”]?(?:\s+field)?\s+(?:is\s+not\s+(?:empty|blank)|is\s+populated|has\s+a?\s*value|is\s+visible)/i;
  match = text.match(assertFieldNotEmptyRegex);
  // "Verify "Audit Note" is visible" (no field keyword) is a visibility check, handled below
  if (match && !(/\bis\s+visible\b/i.test(text) && !/\bfield\b/i.test(text))) {
    const fld = match[1].trim();
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'assert_field',
      target: fld,
      field: fld,
      value: '__NOT_EMPTY__',
      rawConfidence: 0.95
    };
  }

  // Assert Field - Equals Value
  // e.g. "Verify field 'Status' equals 'Active'", "Assert field 'Priority' is 'High'"
  const assertFieldRegex = /(?:verify|assert|check|validate|expect)\s+(?:that\s+)?(?:field\s+)?["'“]?([a-zA-Z0-9_\s]+?)["'”]?(?:\s+field)?\s+(?:equals?|is|has\s+value|contains?)\s+["'“]([^"'”]+)["'”]/i;
  match = text.match(assertFieldRegex);
  if (match) {
    const fld = match[1].trim();
    const val = match[2].trim();
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'assert_field',
      target: fld,
      field: fld,
      value: val,
      rawConfidence: 0.92
    };
  }

  // 13. Assert Visible / Exists
  // e.g. "Verify note 'Audit' is visible", "Verify 'Note 1' is visible", "Assert note exists 'Audit'"
  const assertVisibleRegex = /(?:verify|assert|check|validate|expect)\s+(?:that\s+)?(?:note\s+|item\s+|card\s+)?["'“]([^"'”]+)["'”]\s+(?:is\s+)?(?:visible|displayed|shown|exists)/i;
  match = text.match(assertVisibleRegex);
  if (match) {
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'assert_visible',
      target: match[1].trim(),
      value: match[1].trim(),
      rawConfidence: 0.90
    };
  }

  // 14. Fill Field & Field Input Interactions
  // 14a. Click / Focus Field or Input
  // e.g. "click on Assignee's Comments field", "focus Billed Charges input", "click on Account Name"
  const focusFieldRegex = /^(?:click(?:\s+on)?|focus(?:\s+on)?)\s+(?:the\s+)?["'“]?(.+?)["'”]?(?:\s+(?:field|input|box|textbox|textarea))\s*$/i;
  match = text.match(focusFieldRegex);
  if (match && !/^(?:button|tab|option|menu|item|app|console|link)$/i.test(match[1].trim())) {
    const fld = match[1].trim();
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'fill_field',
      target: fld,
      field: fld,
      value: undefined,
      rawConfidence: 0.92
    };
  }

  // 14b. Fill Field (Combined - Field + Value)
  // e.g. "Set Billed Charges to 23", "Enter 23 in Billed Charges field", "Type 4 into Total Expected Reimbursement field"
  const fillFieldDirectRegex1 = /^(?:enter|fill|type|set)\s+(?:the\s+)?(?:field\s+)?["'“]?(.+?)["'”]?(?:\s+field)?\s+(?:with|to|as)\s+["'“]?([^"'”\n]+?)["'”]?\s*$/i;
  match = text.match(fillFieldDirectRegex1);
  if (match && !/^(?:value|option|item)$/i.test(match[1].trim()) && !/\s+(?:in|into|for)\s+/i.test(match[1])) {
    const fld = match[1].trim();
    const val = match[2].trim();
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'fill_field',
      target: fld,
      field: fld,
      value: val,
      rawConfidence: 0.94
    };
  }

  const fillFieldDirectRegex2 = /^(?:enter|fill|type)\s+["'“]?([^"'”\n]+?)["'”]?\s+(?:in|into|for)\s+(?:the\s+)?(?:field\s+)?["'“]?(.+?)["'”]?(?:\s+(?:field|input|box|textarea))?\s*$/i;
  match = text.match(fillFieldDirectRegex2);
  if (match) {
    const val = match[1].trim();
    const fld = match[2].trim();
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'fill_field',
      target: fld,
      field: fld,
      value: val,
      rawConfidence: 0.94
    };
  }

  // 14c. Type / Enter Value (Sequential / Standalone)
  // e.g. "Type 23 as value", "Type 23", "Enter 23 as value", "Type value 23", "Input '23'", "Set value to 23"
  const typeValueRegex = /^(?:type|enter|input|fill|set)\s+(?:value\s+)?["'“]?([^"'”\n]+?)["'”]?(?:\s+(?:as\s+)?(?:the\s+)?value)?\s*$/i;
  match = text.match(typeValueRegex);
  if (match && !/^(?:the|a|an|in|on|into|for|to)$/i.test(match[1].trim()) && !/\s+(?:in|into|for|to|with)\s+/i.test(match[1])) {
    const val = match[1].trim();
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'fill_field',
      target: 'ActiveField',
      field: undefined,
      value: val,
      rawConfidence: 0.92
    };
  }

  // 15. Click Action Button (Generic)
  // e.g. "Click button 'New Note'", "Click 'New Note'", "Click New Note button", "Click Save"
  const clickActionRegex1 = /(?:click(?:\s+on)?|press|tap)\s+(?:the\s+)?(?:action|button)\s+["'“]([^"'”]+)["'”]/i;
  match = text.match(clickActionRegex1);
  if (match) {
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'click_action',
      target: match[1].trim(),
      rawConfidence: 0.92
    };
  }

  const clickActionRegex2 = /(?:click(?:\s+on)?|press|tap)\s+(?:the\s+)?["'“]([^"'”]+)["'”](?:\s+button)?/i;
  match = text.match(clickActionRegex2);
  if (match) {
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'click_action',
      target: match[1].trim(),
      rawConfidence: 0.90
    };
  }

  const clickActionRegex3 = /(?:click(?:\s+on)?|press|tap)\s+(?:the\s+)?([a-zA-Z0-9\s]+?)\s+button\b/i;
  match = text.match(clickActionRegex3);
  if (match) {
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'click_action',
      target: match[1].trim(),
      rawConfidence: 0.90
    };
  }

  const clickStandardButtonRegex = /^(?:click|press)\s+(Save|Cancel|Edit|New|Delete|Submit|Done|Next|Finish|Sync Property Notes|Sync Notes)\b/i;
  match = text.match(clickStandardButtonRegex);
  if (match) {
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'click_action',
      target: match[1].trim(),
      rawConfidence: 0.92
    };
  }

  // 16. Run Apex
  const runApexRegex = /(?:execute|run)\s+(?:anonymous\s+)?apex\s*[:\s]+["'“]?([^"'”\n]+)["'”]?/i;
  match = text.match(runApexRegex);
  if (match) {
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'run_apex',
      target: 'Apex',
      value: match[1].trim(),
      rawConfidence: 0.95
    };
  }

  // 17. Scroll Actions (Scroll Down, Scroll Up, Scroll to Top/Bottom, Scroll to element)
  const scrollDirectionRegex = /^scroll\s+(down|up|to\s+bottom|to\s+top|bottom|top)(?:\s+(?:by\s+)?(\d+)(?:px)?)?/i;
  match = text.match(scrollDirectionRegex);
  if (match) {
    const rawDir = match[1].toLowerCase().replace(/^to\s+/, '').trim();
    const amount = match[2] ? parseInt(match[2], 10) : 500;
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'scroll',
      target: rawDir, // 'down', 'up', 'bottom', 'top'
      value: amount,
      rawConfidence: 1.0
    };
  }

  const scrollToElementRegex = /^scroll\s+(?:to\s+(?:element\s+|button\s+)?)(?:["'“]([^"'”]+)["'”]|([a-zA-Z0-9_\s]+))/i;
  match = text.match(scrollToElementRegex);
  if (match) {
    const targetElement = (match[1] || match[2] || '').trim();
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'scroll',
      target: `to ${targetElement}`,
      rawConfidence: 0.98
    };
  }

  // Fallback: Check if it's a click action on a known phrase
  if (/^click\b/i.test(text)) {
    // If text mentions field/input/textarea/box, NEVER treat as a button!
    if (/\b(?:field|input|textarea|box|textbox|dropdown|picklist|combobox)\b/i.test(text)) {
      const fieldName = text
        .replace(/^click\s+(?:on\s+)?(?:the\s+)?/i, '')
        .replace(/\s+(?:field|input|textarea|box|textbox|dropdown|picklist|combobox)$/i, '')
        .trim();
      return {
        index,
        rawText,
        cleanedText: text,
        actionType: 'fill_field',
        target: fieldName,
        field: fieldName,
        value: undefined,
        rawConfidence: 0.90
      };
    }
    const rawTarget = text.replace(/^click\s+(?:on\s+)?(?:the\s+)?/i, '').replace(/\s+button$/i, '').trim();
    return {
      index,
      rawText,
      cleanedText: text,
      actionType: 'click_action',
      target: rawTarget,
      rawConfidence: 0.85
    };
  }

  // Ultimate fallback
  return {
    index,
    rawText,
    cleanedText: text,
    actionType: 'custom',
    target: text,
    rawConfidence: 0.50
  };
}

const VERIFY_PREFIX = String.raw`(?:verify|assert|check|validate|expect|ensure|confirm)\s+(?:that\s+)?(?:the\s+)?`;
const Q_OPEN = `["'“‘]`;
const Q_CLOSE = `["'”’]`;
const NON_FIELD_SUFFIX = /\s(?:button|action|link|tab|menu\s+item)$/i;
const ELEMENT_KIND = '(button|action|field|tab|link|section|menu\\s+item)';

function normalizeKind(kind?: string): string {
  if (!kind) return 'any';
  const k = kind.toLowerCase().replace(/\s+/g, '_');
  if (k === 'action' || k === 'menu_item') return 'button';
  return k;
}

function cleanVarName(name: string): string {
  return name.replace(/^\{\{\s*|\s*\}\}$/g, '').trim();
}

/**
 * Parses permission / negative checks and test-data variable steps.
 *
 *   Verify "Delete" button is not visible           -> assert_not_visible (kind=button)
 *   Verify user cannot see field "SSN"              -> assert_not_visible (kind=field)
 *   Verify field "Amount" is read-only              -> assert_field_readonly
 *   Verify field "Amount" is editable               -> assert_field_editable
 *   Verify error "Complete this field" on "Close Date" -> assert_field_error
 *   Verify field "Close Date" shows error "Complete this field"
 *   Remember field "Case Number" as caseNumber      -> remember_value (source=field)
 *   Remember record Id as caseId                    -> remember_value (source=recordId)
 */
export function parseAdvancedStep(text: string, index: number, rawText: string): ParsedStepResult | undefined {
  const base = { index, rawText, cleanedText: text };

  // --- App Launcher and app navigation ------------------------------------------------------
  // "Click App Launcher", "Clicking app launcher", "Open the App Launcher"
  if (/^(?:click(?:ing|ed)?|open(?:ing)?|press(?:ing)?|tap)\s+(?:on\s+)?(?:the\s+)?app\s*launcher(?:\s+(?:icon|button|waffle|menu))?\s*$/i.test(text)) {
    return { ...base, actionType: 'app_launcher_open', target: 'App Launcher', rawConfidence: 0.97 };
  }
  // "Search app "Sales"", "Searching desired application "Revenue Ops"", "Search for "Sales" in App Launcher"
  let m = text.match(
    /^(?:search(?:ing)?|find(?:ing)?|look(?:ing)?\s+for|type|typing)\s+(?:for\s+)?(?:the\s+)?(?:desired\s+)?(?:app(?:lication)?s?\s+)?["“']([^"”']+)["”'](?:\s+(?:app|application))?(?:\s+in\s+(?:the\s+)?app\s*launcher)?(?:\s+and\s+(?:select|open|click)(?:\s+it)?)?\s*$/i
  );
  if (m && (/\bapp(?:lication)?s?\b|launcher/i.test(text))) {
    return { ...base, actionType: 'navigate_app', target: m[1].trim(), extra: { viaSearch: true }, rawConfidence: 0.96 };
  }
  // "Select app "Sales"", "Open application "Revenue Ops"", "Selecting "Sales" app"
  m = text.match(/^(?:select(?:ing)?|open(?:ing)?|choose|choosing|click(?:ing)?(?:\s+on)?)\s+(?:the\s+)?(?:app(?:lication)?\s+)["“']([^"”']+)["”']\s*$/i)
    || text.match(/^(?:select(?:ing)?|choose|choosing)\s+(?:the\s+)?["“']([^"”']+)["”']\s+(?:app|application)\s*$/i);
  if (m) {
    return { ...base, actionType: 'navigate_app', target: m[1].trim(), extra: { viaSearch: true }, rawConfidence: 0.95 };
  }
  // "Select "Encounters" tab in the app", "Selecting tab "Accounts" from navigation"
  m = text.match(/^(?:select(?:ing)?|click(?:ing)?(?:\s+on)?|open(?:ing)?|go(?:ing)?\s+to)\s+(?:the\s+)?(?:tab\s+)?["“']([^"”']+)["”'](?:\s+tab)?\s+(?:in|from|on)\s+(?:the\s+)?(?:app|application|navigation(?:\s+bar)?|nav(?:\s+bar)?)\s*$/i)
    || text.match(/^(?:select(?:ing)?|click(?:ing)?(?:\s+on)?|open(?:ing)?)\s+(?:the\s+)?(?:navigation|nav)\s+tab\s+["“']([^"”']+)["”']\s*$/i);
  if (m) {
    return { ...base, actionType: 'nav_tab', target: m[1].trim(), tab: m[1].trim(), rawConfidence: 0.96 };
  }
  // "Selecting "Encounters" tab" (gerund form of the existing tab step)
  m = text.match(/^(?:selecting|clicking(?:\s+on)?|opening)\s+(?:the\s+)?["“']?([^"”']+?)["”']?\s+tab\s*$/i);
  if (m) {
    return { ...base, actionType: 'activate_tab', target: m[1].trim(), tab: m[1].trim(), rawConfidence: 0.93 };
  }

  // --- List views -----------------------------------------------------------------------------
  // "Select list view "All Encounters"", "Switch to "My Accounts" list view", "Choose list view All Open Cases"
  m = text.match(/^(?:select(?:ing)?|switch(?:ing)?\s+to|choose|choosing|change\s+(?:the\s+)?list\s*view\s+to|open(?:ing)?|go\s+to)\s+(?:the\s+)?(?:list\s*view\s+["“']?([^"”']+?)["”']?|["“']([^"”']+)["”']\s+list\s*view)\s*$/i);
  if (m) {
    const view = (m[1] || m[2]).trim();
    return { ...base, actionType: 'select_list_view', target: view, value: view, rawConfidence: 0.96 };
  }

  // --- Selecting records in a list view with their checkbox --------------------------------
  // "Select all records", "Check all rows in the list"
  m = text.match(/^(un)?(?:select(?:ing)?|check(?:ing)?|tick(?:ing)?)\s+(?:the\s+)?all\s+(?:the\s+)?(?:records|rows|items)(?:\s+in\s+(?:the\s+)?list(?:\s*view)?)?\s*$/i);
  if (m) {
    return { ...base, actionType: 'select_list_records', target: 'All records', value: 'all', extra: { mode: 'all', checked: !m[1] }, rawConfidence: 0.96 };
  }
  // "Select first 3 records", "Select the first record"
  m = text.match(/^(?:select(?:ing)?|check(?:ing)?|tick(?:ing)?)\s+(?:the\s+)?(?:first|top)\s+(\d+\s+)?(?:records?|rows?|items?)(?:\s+in\s+(?:the\s+)?list(?:\s*view)?)?\s*$/i);
  if (m) {
    const count = m[1] ? parseInt(m[1], 10) : 1;
    return { ...base, actionType: 'select_list_records', target: `First ${count}`, value: count, extra: { mode: 'first', count, checked: true }, rawConfidence: 0.95 };
  }
  // "Select record "Acme"", "Check records "E-0001" and "E-0002"", "Select the checkbox for "Acme"", "Uncheck record "Acme""
  m = text.match(/^(un)?(?:select(?:ing)?|check(?:ing)?|tick(?:ing)?|mark(?:ing)?)\s+(?:the\s+)?(?:(?:records?|rows?)\s+((?:["“'][^"”']+["”'](?:\s*(?:,|and)\s*)?)+)(?:\s+(?:checkbox(?:es)?|in\s+(?:the\s+)?list(?:\s*view)?))?|checkbox(?:es)?\s+(?:for|of|next\s+to)\s+(?:the\s+)?(?:records?\s+|rows?\s+)?((?:["“'][^"”']+["”'](?:\s*(?:,|and)\s*)?)+))\s*$/i);
  if (m) {
    const names = [...(m[2] || m[3]).matchAll(/["“']([^"”']+)["”']/g)].map((x) => x[1].trim());
    return {
      ...base,
      actionType: 'select_list_records',
      target: names.join(', '),
      value: names.join(', '),
      extra: { mode: 'names', names, checked: !m[1] },
      rawConfidence: 0.95
    };
  }

  // --- Test data setup through the API -------------------------------------------------
  // "Create Account record with Name "Acme {{unique}}" and Industry "Technology" as acct"
  const apiCreate = /^(?:create|insert|set\s*up)\s+(?:an?\s+|new\s+)?([A-Za-z][A-Za-z0-9_ ]*?)\s+record\s+(?:via\s+(?:the\s+)?api\s+|using\s+(?:the\s+)?api\s+)?with\s+(.+?)(?:\s+(?:as|save\s+as|saved\s+as)\s+(\{\{\s*[A-Za-z_]\w*\s*\}\}|[A-Za-z_]\w*))?\s*$/i;
  m = text.match(apiCreate);
  if (m && /["“]/.test(m[2])) {
    const fields: Record<string, string> = {};
    const pairRe = /(?:^|,|\band\b)\s*([A-Za-z][A-Za-z0-9_ ]*?)\s*(?:=|:|\bis\b|\bof\b)?\s*["“]([^"”]*)["”]/gi;
    for (const pm of m[2].matchAll(pairRe)) {
      const name = pm[1].replace(/^(?:and|with)\s+/i, '').trim();
      if (name) fields[name] = pm[2];
    }
    if (Object.keys(fields).length > 0) {
      const objectName = m[1].trim();
      const varName = m[3] ? cleanVarName(m[3]) : objectName.replace(/\s+/g, '').replace(/^./, (c) => c.toLowerCase()) + 'Id';
      return {
        ...base,
        actionType: 'api_create',
        target: objectName,
        value: varName,
        extra: { objectName, fields, varName },
        rawConfidence: 0.95
      };
    }
  }

  // --- Related lists ---------------------------------------------------------------------
  const relatedAction = new RegExp(
    String.raw`^(?:click|press|tap)(?:\s+on)?\s+(?:the\s+)?` + Q_OPEN + `?([^"'”’]+?)` + Q_CLOSE +
      String.raw`?(?:\s+button)?\s+(?:in|on|from)\s+(?:the\s+)?` + Q_OPEN + `?([^"'”’]+?)` + Q_CLOSE + String.raw`?\s+related\s+list\s*$`,
    'i'
  );
  m = text.match(relatedAction);
  if (m) {
    return { ...base, actionType: 'related_list_action', target: m[2].trim(), value: m[1].trim(), rawConfidence: 0.95 };
  }

  const relatedCount = new RegExp(
    '^' + VERIFY_PREFIX + Q_OPEN + `?([^"'”’]+?)` + Q_CLOSE +
      String.raw`?\s+related\s+list\s+(?:has|shows|contains|displays)\s+(at\s+least\s+|more\s+than\s+|exactly\s+|no\s+more\s+than\s+)?(\d+)\s+(?:records?|items?|rows?)\s*$`,
    'i'
  );
  m = text.match(relatedCount);
  if (m) {
    const qual = (m[2] || 'exactly').trim().toLowerCase();
    const op = qual.startsWith('at least') ? '>=' : qual.startsWith('more') ? '>' : qual.startsWith('no more') ? '<=' : '=';
    return {
      ...base,
      actionType: 'assert_related_count',
      target: m[1].trim(),
      value: parseInt(m[3], 10),
      extra: { op },
      rawConfidence: 0.95
    };
  }
  const relatedEmpty = new RegExp('^' + VERIFY_PREFIX + Q_OPEN + `?([^"'”’]+?)` + Q_CLOSE + String.raw`?\s+related\s+list\s+is\s+empty\s*$`, 'i');
  m = text.match(relatedEmpty);
  if (m) {
    return { ...base, actionType: 'assert_related_count', target: m[1].trim(), value: 0, extra: { op: '=' }, rawConfidence: 0.95 };
  }

  const relatedOpen1 = /^(?:open|view|go\s+to|navigate\s+to|click(?:\s+on)?)\s+(?:the\s+)?related\s+list\s+["“']?([^"”']+?)["”']?\s*$/i;
  const relatedOpen2 = /^(?:open|view|go\s+to|navigate\s+to|click(?:\s+on)?)\s+(?:the\s+)?["“']?([^"”']+?)["”']?\s+related\s+list\s*$/i;
  m = text.match(relatedOpen1) || text.match(relatedOpen2);
  if (m) {
    return { ...base, actionType: 'related_list_open', target: m[1].trim(), rawConfidence: 0.95 };
  }

  // --- Path / stage bar ------------------------------------------------------------------
  const pathStage = /^(?:mark|set|move|change)\s+(?:the\s+)?(?:stage|status|path)\s+(?:as|to)\s+["“']([^"”']+)["”'](?:\s+(?:and\s+)?(?:mark\s+(?:it\s+)?)?(?:as\s+)?(complete|completed|current))?\s*$/i;
  const pathSelect = /^(?:select|click(?:\s+on)?)\s+["“']([^"”']+)["”']\s+(?:in|on)\s+(?:the\s+)?(?:path|stage\s+bar)(?:\s+and\s+mark\s+(?:it\s+)?(?:as\s+)?(complete|completed|current))?\s*$/i;
  m = text.match(pathStage) || text.match(pathSelect);
  if (m) {
    const mark = m[2] && /^complete/i.test(m[2]) ? 'complete' : 'current';
    return { ...base, actionType: 'path_select', target: m[1].trim(), value: m[1].trim(), extra: { mark }, rawConfidence: 0.94 };
  }

  // --- Record type chooser -----------------------------------------------------------------
  const recordType = /^(?:choose|select|pick)\s+(?:the\s+)?record\s+type\s+["“']([^"”']+)["”'](?:\s+and\s+(?:click\s+)?next)?\s*$/i;
  m = text.match(recordType);
  if (m) {
    return { ...base, actionType: 'select_record_type', target: m[1].trim(), value: m[1].trim(), rawConfidence: 0.96 };
  }

  // --- Dual listbox ----------------------------------------------------------------------------
  const dualListbox = /^move\s+["“']([^"”']+)["”']\s+to\s+(?:the\s+)?["“']?(chosen|selected|available)["”']?(?:\s+(?:list|column|side))?\s+(?:in|for|of)\s+(?:the\s+)?["“']?([^"”']+?)["”']?(?:\s+field)?\s*$/i;
  m = text.match(dualListbox);
  if (m) {
    const to = /available/i.test(m[2]) ? 'available' : 'chosen';
    return { ...base, actionType: 'dual_listbox', target: m[3].trim(), field: m[3].trim(), value: m[1].trim(), extra: { to }, rawConfidence: 0.94 };
  }

  // --- Record actions --------------------------------------------------------------------------
  if (/^delete\s+(?:the\s+|this\s+|current\s+)?record(?:\s+and\s+confirm)?\s*$/i.test(text)) {
    return { ...base, actionType: 'delete_record', target: 'Record', rawConfidence: 0.96 };
  }
  m = text.match(/^change\s+(?:the\s+)?(?:record\s+)?owner\s+to\s+["“']([^"”']+)["”']\s*$/i);
  if (m) {
    return { ...base, actionType: 'change_owner', target: 'Owner', value: m[1].trim(), rawConfidence: 0.95 };
  }
  m = text.match(/^(?:global\s+)?search\s+(?:salesforce\s+)?for\s+["“']([^"”']+)["”'](\s+and\s+open\s+(?:the\s+)?(?:first\s+|top\s+)?(?:result|record|match))?\s*$/i);
  if (m) {
    return { ...base, actionType: 'global_search', target: m[1].trim(), value: m[1].trim(), extra: { open: Boolean(m[2]) }, rawConfidence: 0.95 };
  }
  m = text.match(/^inline[-\s]?edit\s+(?:the\s+)?(?:field\s+)?["“']([^"”']+)["”'](?:\s+field)?\s+(?:to|with|as)\s+["“']([^"”']*)["”']\s*$/i);
  if (m) {
    return { ...base, actionType: 'inline_edit', target: m[1].trim(), field: m[1].trim(), value: m[2], rawConfidence: 0.95 };
  }
  m = text.match(/^submit\s+(?:the\s+|this\s+)?(?:record\s+)?for\s+approval(?:\s+with\s+comments?\s+["“']([^"”']*)["”'])?\s*$/i);
  if (m) {
    return { ...base, actionType: 'submit_for_approval', target: 'Approval', value: m[1] || '', rawConfidence: 0.95 };
  }
  if (/^convert\s+(?:the\s+|this\s+)?lead\s*$/i.test(text)) {
    return { ...base, actionType: 'convert_lead', target: 'Lead', rawConfidence: 0.95 };
  }

  // --- Remember / capture values for later steps -------------------------------------
  const rememberRecordId = new RegExp(
    String.raw`^(?:remember|save|store|capture)\s+(?:the\s+)?(?:current\s+|new\s+)?record\s*id\s+(?:as|in(?:to)?)\s+(\{\{\s*[A-Za-z_]\w*\s*\}\}|[A-Za-z_]\w*)\s*$`,
    'i'
  );
  m = text.match(rememberRecordId);
  if (m) {
    const varName = cleanVarName(m[1]);
    return {
      ...base,
      actionType: 'remember_value',
      target: varName,
      value: varName,
      extra: { source: 'recordId', varName },
      rawConfidence: 0.97
    };
  }

  const rememberField = new RegExp(
    String.raw`^(?:remember|save|store|capture)\s+(?:the\s+)?(?:value\s+of\s+)?(?:field\s+)?` + Q_OPEN + `([^"'”’]+)` + Q_CLOSE +
      String.raw`(?:\s+field)?(?:\s+value)?\s+(?:as|in(?:to)?)\s+(\{\{\s*[A-Za-z_]\w*\s*\}\}|[A-Za-z_]\w*)\s*$`,
    'i'
  );
  m = text.match(rememberField);
  if (m) {
    const varName = cleanVarName(m[2]);
    const fld = m[1].trim();
    return {
      ...base,
      actionType: 'remember_value',
      target: fld,
      field: fld,
      value: varName,
      extra: { source: 'field', varName },
      rawConfidence: 0.95
    };
  }

  // --- Field validation errors --------------------------------------------------------
  // "Verify field "Close Date" shows error "Complete this field""
  const fieldShowsError = new RegExp(
    '^' + VERIFY_PREFIX + String.raw`(?:field\s+)?` + Q_OPEN + `([^"'”’]+)` + Q_CLOSE + String.raw`(?:\s+field)?\s+(?:shows?|displays?|has)\s+(?:an?\s+)?(?:validation\s+)?error(?:\s+message)?\s+` +
      Q_OPEN + `([^"'”’]+)` + Q_CLOSE + String.raw`\s*$`,
    'i'
  );
  m = text.match(fieldShowsError);
  if (m) {
    const fld = m[1].trim();
    return {
      ...base,
      actionType: 'assert_field_error',
      target: fld,
      field: fld,
      value: m[2].trim(),
      rawConfidence: 0.95
    };
  }

  // "Verify error "Complete this field" is shown on "Close Date" field" / "Verify error message "X""
  const errorOnField = new RegExp(
    '^' + VERIFY_PREFIX + String.raw`(?:an?\s+)?(?:validation\s+|page\s+)?error(?:\s+message)?\s+` + Q_OPEN + `([^"'”’]+)` + Q_CLOSE +
      String.raw`(?:\s+(?:is\s+)?(?:shown|displayed|appears?|visible))?` +
      String.raw`(?:\s+(?:on|for|under|below|near)\s+(?:the\s+)?(?:field\s+)?` + Q_OPEN + `?([^"'”’]+?)` + Q_CLOSE + String.raw`?(?:\s+field)?)?\s*$`,
    'i'
  );
  m = text.match(errorOnField);
  if (m) {
    const fld = m[2] ? m[2].trim() : undefined;
    return {
      ...base,
      actionType: 'assert_field_error',
      target: fld || 'Page',
      field: fld,
      value: m[1].trim(),
      rawConfidence: 0.95
    };
  }

  // --- Read-only / editable ------------------------------------------------------------
  const readOnly = new RegExp(
    '^' + VERIFY_PREFIX + String.raw`(?:field\s+)?` + Q_OPEN + `?([^"'”’]+?)` + Q_CLOSE +
      String.raw`?(?:\s+field)?\s+(?:is|should\s+be)\s+(?:read[-\s]?only|not\s+editable|non[-\s]?editable|locked|disabled)\s*$`,
    'i'
  );
  m = text.match(readOnly);
  if (m && !NON_FIELD_SUFFIX.test(m[1].trim())) {
    const fld = m[1].trim();
    return { ...base, actionType: 'assert_field_readonly', target: fld, field: fld, rawConfidence: 0.95 };
  }

  const cannotEdit = new RegExp(
    '^' + VERIFY_PREFIX + String.raw`(?:the\s+)?(?:current\s+)?user\s+(?:cannot|can['’]?t|can\s+not|is\s+not\s+able\s+to)\s+(?:edit|change|modify)\s+(?:the\s+)?(?:field\s+)?` +
      Q_OPEN + `?([^"'”’]+?)` + Q_CLOSE + String.raw`?(?:\s+field)?\s*$`,
    'i'
  );
  m = text.match(cannotEdit);
  if (m) {
    const fld = m[1].trim();
    return { ...base, actionType: 'assert_field_readonly', target: fld, field: fld, rawConfidence: 0.93 };
  }

  const editable = new RegExp(
    '^' + VERIFY_PREFIX + String.raw`(?:field\s+)?` + Q_OPEN + `?([^"'”’]+?)` + Q_CLOSE +
      String.raw`?(?:\s+field)?\s+(?:is|should\s+be)\s+(?:editable|enabled|not\s+read[-\s]?only)\s*$`,
    'i'
  );
  m = text.match(editable);
  if (m && !NON_FIELD_SUFFIX.test(m[1].trim())) {
    const fld = m[1].trim();
    return { ...base, actionType: 'assert_field_editable', target: fld, field: fld, rawConfidence: 0.93 };
  }

  // --- Not visible / not available ----------------------------------------------------------
  // "Verify "Delete" button is not visible", "Verify button "Delete" is not visible"
  const notVisibleQuoted = new RegExp(
    '^' + VERIFY_PREFIX + `(?:${ELEMENT_KIND}\\s+)?` + Q_OPEN + `([^"'”’]+)` + Q_CLOSE + `(?:\\s+${ELEMENT_KIND})?` +
      String.raw`\s+(?:is\s+not|isn['’]t|should\s+not\s+be|does\s+not\s+appear|is\s+hidden)\s*(?:visible|displayed|shown|available|present)?\s*$`,
    'i'
  );
  m = text.match(notVisibleQuoted);
  if (m) {
    const kind = normalizeKind(m[1] || m[3]);
    const name = m[2].trim();
    return {
      ...base,
      actionType: 'assert_not_visible',
      target: name,
      field: kind === 'field' ? name : undefined,
      extra: { kind },
      rawConfidence: 0.95
    };
  }

  // "Verify Delete button is not visible" (unquoted, kind required)
  const notVisiblePlain = new RegExp(
    '^' + VERIFY_PREFIX + String.raw`([A-Za-z0-9_&/\- ]+?)\s+` + ELEMENT_KIND +
      String.raw`\s+(?:is\s+not|isn['’]t|should\s+not\s+be|is\s+hidden)\s*(?:visible|displayed|shown|available|present)?\s*$`,
    'i'
  );
  m = text.match(notVisiblePlain);
  if (m) {
    const kind = normalizeKind(m[2]);
    const name = m[1].trim();
    return {
      ...base,
      actionType: 'assert_not_visible',
      target: name,
      field: kind === 'field' ? name : undefined,
      extra: { kind },
      rawConfidence: 0.9
    };
  }

  // "Verify user cannot see "Delete" button", "Verify user can't see field "SSN""
  const cannotSee = new RegExp(
    '^' + VERIFY_PREFIX + String.raw`(?:the\s+)?(?:current\s+)?user\s+(?:cannot|can['’]?t|can\s+not|is\s+not\s+able\s+to)\s+(?:see|view|access|use)\s+(?:the\s+)?` +
      `(?:${ELEMENT_KIND}\\s+)?` + Q_OPEN + `?([^"'”’]+?)` + Q_CLOSE + `?(?:\\s+${ELEMENT_KIND})?\\s*$`,
    'i'
  );
  m = text.match(cannotSee);
  if (m) {
    const kind = normalizeKind(m[1] || m[3]);
    const name = m[2].trim();
    return {
      ...base,
      actionType: 'assert_not_visible',
      target: name,
      field: kind === 'field' ? name : undefined,
      extra: { kind },
      rawConfidence: 0.92
    };
  }

  // --- Open record by remembered variable: "Open record {{caseId}}" -------------------------
  const openVarRecord = /^(?:open|view|navigate\s+to|go\s+to)\s+(?:the\s+)?record\s+["'“]?(\{\{\s*[A-Za-z_][\w.]*\s*\}\})["'”]?\s*$/i;
  m = text.match(openVarRecord);
  if (m) {
    return {
      ...base,
      actionType: 'open_record',
      target: 'Record',
      value: m[1].replace(/\s+/g, ''),
      rawConfidence: 0.95
    };
  }

  return undefined;
}
