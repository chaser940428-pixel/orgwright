import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Database,
  Boxes,
  Layers3,
  LayoutGrid,
  Save,
  Trash2,
  Info,
  RefreshCw,
  Search,
  Sparkles,
  Wand2
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types returned by the Studio server (/api/steps/*, /api/org/describe)
// ---------------------------------------------------------------------------

export interface StepIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
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

export interface StepCheckSummary {
  total: number;
  ok: number;
  warnings: number;
  errors: number;
}

interface FieldMeta {
  apiName: string;
  label: string;
  type: string;
  picklistValues: string[];
  required: boolean;
  readOnly: boolean;
}

interface StepPattern {
  category: string;
  label: string;
  template: string;
  example: string;
}

interface DataToken {
  token: string;
  description: string;
  example: string;
}

interface SuggestItem {
  label: string;
  detail?: string;
  insert: string;
  /** caret offset inside `insert` after applying (defaults to end) */
  caretOffset?: number;
}

interface SuggestState {
  items: SuggestItem[];
  active: number;
  from: number;
  to: number;
  title: string;
}

export interface StepEditorProps {
  value: string;
  onChange: (value: string) => void;
  objectContext: string;
  /** Called when the tester picks a different object for field suggestions/checks */
  onObjectChange?: (objectApiName: string) => void;
  /** Objects available in the connected org */
  standardObjects?: string[];
  customObjects?: string[];
  selectedOrg: string;
  /** Column names of the data rows (valid {{Column}} tokens) */
  dataColumns?: string[];
  isRecording?: boolean;
  isPaused?: boolean;
  placeholder?: string;
  onSummaryChange?: (summary: StepCheckSummary) => void;
}

const QUOTE_CHARS = ['"', '“', '”'];

function countQuotes(text: string): number {
  let n = 0;
  for (const ch of text) if (QUOTE_CHARS.includes(ch)) n++;
  return n;
}

function lastQuoteIndex(text: string): number {
  return Math.max(text.lastIndexOf('"'), text.lastIndexOf('“'), text.lastIndexOf('”'));
}

/** Caret position for a template: inside the first "" pair, else in the double-space gap, else the end. */
function templateCaret(template: string): number {
  const q = template.indexOf('""');
  if (q >= 0) return q + 1;
  const gap = template.indexOf('  ');
  if (gap >= 0) return gap + 1;
  const brace = template.indexOf('{{}}');
  if (brace >= 0) return brace + 2;
  return template.length;
}

function nextStepNumber(text: string): number {
  const nums = text
    .split('\n')
    .map((l) => l.match(/^\s*(\d+)[.)]/))
    .filter(Boolean)
    .map((m) => parseInt((m as RegExpMatchArray)[1], 10));
  return nums.length ? Math.max(...nums) + 1 : text.trim() ? text.trim().split('\n').length + 1 : 1;
}

const SYSTEM_FIELDS = new Set([
  'Id', 'IsDeleted', 'CreatedById', 'CreatedDate', 'LastModifiedById', 'LastModifiedDate', 'SystemModstamp',
  'LastActivityDate', 'LastViewedDate', 'LastReferencedDate', 'OwnerId', 'RecordTypeId', 'MasterRecordId',
  'ConnectionReceivedId', 'ConnectionSentId', 'Jigsaw', 'JigsawCompanyId', 'PhotoUrl'
]);

function objectWord(apiName: string, label: string): string {
  // The step parser takes a single word for "Open X list" — use the label if it is one word
  return /^[A-Za-z0-9_]+$/.test(label) ? label : apiName;
}

/** Human-friendly label for an API name in the picker: Encounter__c -> "Encounter" */
function prettyObject(api: string): string {
  return api.replace(/__c$/i, '').replace(/_/g, ' ');
}

/**
 * Builds cheat-sheet examples from the selected object's real fields so testers see
 * phrasing that works on their object (e.g. Encounter) instead of Account samples.
 */
function buildObjectExamples(apiName: string, objLabel: string, fields: FieldMeta[]): Record<string, string> {
  const usable = fields.filter((f) => !SYSTEM_FIELDS.has(f.apiName));
  const editable = usable.filter((f) => !f.readOnly);
  const pick = (pred: (f: FieldMeta) => boolean, from = editable) =>
    from.find((f) => pred(f) && f.required) || from.find(pred);

  const text = pick((f) => f.type === 'string' || f.type === 'email' || f.type === 'phone');
  const longText = pick((f) => f.type === 'textarea') || text;
  const picklist = pick((f) => f.type === 'picklist' && f.picklistValues.length > 0);
  const checkbox = pick((f) => f.type === 'boolean');
  const lookup = pick((f) => f.type === 'reference');
  const date = pick((f) => f.type === 'date' || f.type === 'datetime');
  const readOnly = usable.find((f) => f.readOnly && f.type !== 'reference') || usable.find((f) => f.readOnly);
  const nameField = usable.find((f) => f.apiName === 'Name') || text;
  const word = objectWord(apiName, objLabel);

  const ex: Record<string, string> = {
    'Open list view': `Open ${word} list`,
    'Open recent record': `Open recent ${word}`,
    'Open record by variable': `Open record {{${word.charAt(0).toLowerCase()}${word.slice(1).replace(/__c$/i, '')}Id}}`,
    // Lightning toast after save reads: Encounter "E-00012" was created.
    'Toast message': 'Verify toast "was created"',
    'Remember record Id': `Remember record Id as ${word.charAt(0).toLowerCase()}${word.slice(1).replace(/__c$/i, '')}Id`
  };
  ex['Select list view'] = `Select list view "All ${/s$/i.test(objLabel) ? objLabel : objLabel + 's'}"`;
  if (text) ex['Enter text'] = `Enter "Test {{unique}}" in "${text.label}"`;
  if (picklist) {
    ex['Pick picklist value'] = `Select "${picklist.picklistValues[0]}" from "${picklist.label}" picklist`;
    ex['Field equals'] = `Verify field "${picklist.label}" equals "${picklist.picklistValues[0]}"`;
  }
  if (lookup) ex['Pick lookup record'] = `Select "" in "${lookup.label}" lookup`;
  if (checkbox) ex['Tick checkbox'] = `Check "${checkbox.label}"`;
  if (nameField) {
    ex['Field not empty'] = `Verify field "${nameField.label}" is not empty`;
    ex['Remember field value'] = `Remember field "${nameField.label}" as ${nameField.apiName.replace(/__c$/i, '').replace(/_/g, '').replace(/^./, (c) => c.toLowerCase())}`;
  }
  const required = editable.find((f) => f.required && f.type !== 'boolean');
  const apiField = required && ['string', 'textarea', 'email', 'phone'].includes(required.type) ? required : text;
  if (apiField) {
    ex['Create record via API'] = `Create ${word} record with ${apiField.label} "Test {{unique}}" as ${word.charAt(0).toLowerCase()}${word.slice(1).replace(/__c$/i, '')}Id`;
  }
  if (required) ex['Validation error'] = `Verify error "Complete this field." on "${required.label}"`;
  if (readOnly) ex['Field read-only'] = `Verify field "${readOnly.label}" is read-only`;
  if (longText) ex['Field editable'] = `Verify field "${longText.label}" is editable`;
  if (date) ex['Date (test data)'] = `Enter "{{today+7}}" in "${date.label}"`;
  return ex;
}

/** Finds Salesforce objects that the steps navigate to (tab / list / recent record). */
function detectObjectsInSteps(text: string, objects: string[]): string[] {
  if (!objects.length) return [];
  const byKey = new Map<string, string>();
  const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
  objects.forEach((api) => {
    byKey.set(norm(api), api);
    byKey.set(norm(api.replace(/__c$/i, '')), api);
  });
  const found: string[] = [];
  const re = /(?:navigate\s+to|open|go\s+to|view|click(?:\s+on)?)\s+(?:the\s+)?(?:recent\s+)?["“]?([A-Za-z][A-Za-z0-9_ ]*?)["”]?\s+(?:tab|list(?:\s*view)?|record)\b|open\s+recent\s+([A-Za-z][A-Za-z0-9_]*)/gi;
  for (const m of text.matchAll(re)) {
    const raw = (m[1] || m[2] || '').trim();
    if (!raw || /^(details|related|activity|chatter|feed|new|edit)$/i.test(raw)) continue;
    const candidates = [raw, raw.replace(/ies$/i, 'y'), raw.replace(/s$/i, '')];
    for (const c of candidates) {
      const hit = byKey.get(norm(c));
      if (hit) {
        if (!found.includes(hit)) found.push(hit);
        break;
      }
    }
  }
  return found;
}

export function StepEditor({
  value,
  onChange,
  objectContext,
  onObjectChange,
  standardObjects = [],
  customObjects = [],
  selectedOrg,
  dataColumns = [],
  isRecording,
  isPaused,
  placeholder,
  onSummaryChange
}: StepEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [insights, setInsights] = useState<StepInsight[]>([]);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [fields, setFields] = useState<FieldMeta[]>([]);
  const [objectLabel, setObjectLabel] = useState<string>('');
  const [objectPickerOpen, setObjectPickerOpen] = useState(false);
  const [objectQuery, setObjectQuery] = useState('');
  const [fieldsStatus, setFieldsStatus] = useState<'idle' | 'loading' | 'loaded' | 'failed'>('idle');
  const [fieldsError, setFieldsError] = useState<string | null>(null);
  const [patterns, setPatterns] = useState<StepPattern[]>([]);
  const [tokens, setTokens] = useState<DataToken[]>([]);
  const [suggest, setSuggest] = useState<SuggestState | null>(null);
  const [showCheatSheet, setShowCheatSheet] = useState(false);
  const [showCheck, setShowCheck] = useState(true);
  const [blocks, setBlocks] = useState<Array<{ name: string; steps: string[] }>>([]);
  const [showBlocks, setShowBlocks] = useState(false);
  const [blockName, setBlockName] = useState('');
  const [blockMsg, setBlockMsg] = useState<string | null>(null);

  const [apps, setApps] = useState<Array<{ label: string; name: string }>>([]);
  const [navTabs, setNavTabs] = useState<Array<{ label: string; name: string; sobject?: string }>>([]);
  useEffect(() => {
    if (!selectedOrg) return;
    fetch(`/api/org/apps?alias=${encodeURIComponent(selectedOrg)}`)
      .then((r) => r.json())
      .then((d) => setApps(d.success ? d.apps || [] : []))
      .catch(() => setApps([]));
    fetch(`/api/org/tabs?alias=${encodeURIComponent(selectedOrg)}`)
      .then((r) => r.json())
      .then((d) => setNavTabs(d.success ? d.tabs || [] : []))
      .catch(() => setNavTabs([]));
  }, [selectedOrg]);

  // List views of the selected object (autocomplete for "Select list view")
  const [listViews, setListViews] = useState<Array<{ label: string; name: string }>>([]);
  useEffect(() => {
    if (!objectContext || !selectedOrg) return;
    fetch(`/api/org/listviews?alias=${encodeURIComponent(selectedOrg)}&object=${encodeURIComponent(objectContext)}`)
      .then((r) => r.json())
      .then((d) => setListViews(d.success ? d.listViews || [] : []))
      .catch(() => setListViews([]));
  }, [selectedOrg, objectContext]);

  const loadBlocks = useCallback(() => {
    fetch('/api/blocks')
      .then((r) => r.json())
      .then((d) => d.success && setBlocks(d.blocks || []))
      .catch(() => {});
  }, []);
  useEffect(() => loadBlocks(), [loadBlocks]);

  // ---------------------------------------------------------------- data loading
  useEffect(() => {
    fetch('/api/steps/patterns')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setPatterns(d.patterns || []);
          setTokens(d.tokens || []);
        }
      })
      .catch(() => {});
  }, []);

  const loadFields = useCallback(
    (refresh = false) => {
      if (!objectContext || !selectedOrg) return;
      setFieldsStatus('loading');
      setFieldsError(null);
      fetch(`/api/org/describe?alias=${encodeURIComponent(selectedOrg)}&object=${encodeURIComponent(objectContext)}${refresh ? '&refresh=true' : ''}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.success) {
            setFields(d.fields || []);
            setObjectLabel(d.label || objectContext);
            setFieldsStatus('loaded');
          } else {
            setFields([]);
            setObjectLabel('');
            setFieldsStatus('failed');
            setFieldsError(d.error || 'Could not load fields');
          }
        })
        .catch((err) => {
          setFields([]);
          setFieldsStatus('failed');
          setFieldsError(String(err?.message || err));
        });
    },
    [objectContext, selectedOrg]
  );

  useEffect(() => {
    loadFields(false);
  }, [loadFields]);

  // Debounced live step check
  useEffect(() => {
    const handle = setTimeout(() => {
      if (!value.trim()) {
        setInsights([]);
        return;
      }
      setChecking(true);
      fetch('/api/steps/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepsText: value, objectContext, targetOrg: selectedOrg, dataColumns })
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.success) {
            setInsights(d.insights || []);
            setCatalogLoaded(Boolean(d.catalogLoaded));
            setCheckError(null);
          } else {
            setCheckError(d.error || 'Step check failed');
          }
        })
        .catch((err) => setCheckError(String(err?.message || err)))
        .finally(() => setChecking(false));
    }, 450);
    return () => clearTimeout(handle);
  }, [value, objectContext, selectedOrg, fieldsStatus, dataColumns.join('|'), blocks.length]);

  const summary: StepCheckSummary = useMemo(
    () => ({
      total: insights.length,
      ok: insights.filter((i) => i.status === 'ok').length,
      warnings: insights.filter((i) => i.status === 'warning').length,
      errors: insights.filter((i) => i.status === 'error').length
    }),
    [insights]
  );

  useEffect(() => {
    onSummaryChange?.(summary);
  }, [summary, onSummaryChange]);

  const insightByLine = useMemo(() => {
    const m = new Map<number, StepInsight>();
    insights.forEach((i) => m.set(i.lineNumber, i));
    return m;
  }, [insights]);

  const rememberedVars = useMemo(() => {
    const vars: string[] = [];
    value.split('\n').forEach((line) => {
      const m = line.match(/^\s*(?:\d+[.)]\s*)?(?:remember|save|store|capture)\b.*\b(?:as|into|in)\s+\{?\{?([A-Za-z_]\w*)\}?\}?\s*$/i);
      if (m && !vars.includes(m[1])) vars.push(m[1]);
    });
    return vars;
  }, [value]);

  // ---------------------------------------------------------------- autocomplete
  const computeSuggestions = useCallback(
    (text: string, caret: number, force: boolean): SuggestState | null => {
      const lineStart = text.lastIndexOf('\n', caret - 1) + 1;
      const lineEndIdx = text.indexOf('\n', caret);
      const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx;
      const before = text.slice(lineStart, caret);
      const after = text.slice(caret, lineEnd);

      // 1. {{data tokens}}
      const tokenMatch = before.match(/\{\{([\w.+-]*)$/);
      if (tokenMatch) {
        const partial = tokenMatch[1].toLowerCase();
        const closes = after.startsWith('}}') ? 2 : 0;
        const items: SuggestItem[] = [
          ...rememberedVars.map((v) => ({ label: `{{${v}}}`, detail: 'Remembered by an earlier step', insert: `${v}}}` })),
          ...dataColumns.map((c) => ({ label: `{{${c}}}`, detail: 'Data row column', insert: `${c}}}` })),
          ...tokens.map((t) => ({ label: t.token, detail: `${t.description} — e.g. ${t.example}`, insert: t.token.slice(2) }))
        ].filter((i) => i.insert.toLowerCase().startsWith(partial));
        return items.length
          ? { items: items.slice(0, 10), active: 0, from: caret - tokenMatch[1].length, to: caret + closes, title: 'Test data' }
          : null;
      }

      const quoteCount = countQuotes(before);

      // 2. Inside quotes: field labels or picklist values
      if (quoteCount % 2 === 1 && (fields.length > 0 || blocks.length > 0 || apps.length > 0 || navTabs.length > 0 || listViews.length > 0)) {
        const q = lastQuoteIndex(before);
        const partial = before.slice(q + 1);
        const pre = before.slice(0, q);
        const lowPartial = partial.toLowerCase();
        const closingQuote = after.startsWith('"') || after.startsWith('”') ? 1 : 0;
        const restOfLineEmpty = after.slice(closingQuote).trim().length === 0;

        // App name: Search app "|", Searching desired application "|", Select app "|"
        if (/(?:search(?:ing)?|find(?:ing)?|select(?:ing)?|open(?:ing)?|choose)\s+(?:for\s+)?(?:the\s+)?(?:desired\s+)?app(?:lication)?s?\s*$/i.test(pre)) {
          const items = apps
            .filter((a) => !lowPartial || a.label.toLowerCase().includes(lowPartial))
            .slice(0, 12)
            .map((a) => ({ label: a.label, detail: 'App', insert: a.label }));
          return items.length ? { items, active: 0, from: caret - partial.length, to: caret, title: 'Apps in this org' } : null;
        }

        // List view: Select list view "|", Switch to "|" list view
        if (
          /(?:select(?:ing)?|switch(?:ing)?\s+to|choose|open)\s+(?:the\s+)?list\s*view\s*$/i.test(pre) ||
          (/(?:select(?:ing)?|switch(?:ing)?\s+to|choose)\s+(?:the\s+)?$/i.test(pre) && /^["”]?\s*list\s*view/i.test(after))
        ) {
          const items = listViews
            .filter((v) => !lowPartial || v.label.toLowerCase().includes(lowPartial))
            .slice(0, 12)
            .map((v) => ({ label: v.label, detail: `${objectContext} list view`, insert: v.label }));
          return items.length ? { items, active: 0, from: caret - partial.length, to: caret, title: `List views on ${objectContext}` } : null;
        }

        // Navigation tab: Select "|" tab
        if (
          /^\s*(?:\d+[.)]\s*)?(?:then\s+)?(?:select(?:ing)?|click(?:ing)?(?:\s+on)?|open(?:ing)?|go\s+to)\s+(?:the\s+)?(?:tab\s+)?$/i.test(pre) &&
          (/^["”]?\s*tab\b/i.test(after) || /tab\s*$/i.test(pre)) &&
          navTabs.length > 0
        ) {
          const items = navTabs
            .filter((t) => !lowPartial || t.label.toLowerCase().includes(lowPartial))
            .sort((a, b) => Number(!a.label.toLowerCase().startsWith(lowPartial)) - Number(!b.label.toLowerCase().startsWith(lowPartial)))
            .slice(0, 12)
            .map((t) => ({ label: t.label, detail: t.sobject ? `${t.sobject} tab` : 'Tab', insert: t.label }));
          return items.length ? { items, active: 0, from: caret - partial.length, to: caret, title: 'Navigation tabs' } : null;
        }

        // Block name: Use block "|"
        if (/^\s*(?:\d+[.)]\s*)?(?:use|run|include|insert)\s+(?:the\s+)?block\s*$/i.test(pre)) {
          const items = blocks
            .filter((b) => !lowPartial || b.name.toLowerCase().includes(lowPartial))
            .map((b) => ({ label: b.name, detail: `${b.steps.length} steps`, insert: b.name }));
          return items.length ? { items, active: 0, from: caret - partial.length, to: caret, title: 'Reusable blocks' } : null;
        }

        // Value position of a picklist step: Select "|"
        if (/^\s*(?:\d+[.)]\s*)?(?:select|choose|pick)\s*$/i.test(pre)) {
          const items: SuggestItem[] = [];
          fields
            .filter((f) => f.picklistValues?.length)
            .forEach((f) =>
              f.picklistValues.forEach((pv) => {
                if (!lowPartial || pv.toLowerCase().includes(lowPartial)) {
                  items.push(
                    restOfLineEmpty
                      ? { label: pv, detail: f.label, insert: `${pv}" from "${f.label}" picklist` }
                      : { label: pv, detail: f.label, insert: pv }
                  );
                }
              })
            );
          items.sort((a, b) => Number(!a.label.toLowerCase().startsWith(lowPartial)) - Number(!b.label.toLowerCase().startsWith(lowPartial)));
          return items.length
            ? { items: items.slice(0, 12), active: 0, from: caret - partial.length, to: caret + (restOfLineEmpty ? closingQuote : 0), title: `Picklist values on ${objectContext}` }
            : null;
        }

        // Field position: in "|", field "|", Verify "|", Remember field "|", Check "|", from "|"
        const fieldPosition =
          /\b(?:in|into|on|for|from|of|field)\s*$/i.test(pre) ||
          /^\s*(?:\d+[.)]\s*)?(?:verify|assert|validate|expect|ensure|confirm|remember|save|store|capture|set|check|uncheck)\s+(?:that\s+)?(?:the\s+)?(?:value\s+of\s+)?(?:field\s+)?$/i.test(pre);
        if (fieldPosition) {
          const picklistValueMatch = pre.match(/(?:select|choose|pick)\s+["“]([^"”]+)["”]\s+from\s*$/i);
          let candidates = fields;
          if (picklistValueMatch) {
            const val = picklistValueMatch[1].toLowerCase();
            candidates = fields
              .filter((f) => f.picklistValues?.length)
              .sort((a, b) => Number(!a.picklistValues.some((p) => p.toLowerCase() === val)) - Number(!b.picklistValues.some((p) => p.toLowerCase() === val)));
          }
          const items = candidates
            .filter((f) => !lowPartial || f.label.toLowerCase().includes(lowPartial) || f.apiName.toLowerCase().includes(lowPartial))
            .sort((a, b) => Number(!a.label.toLowerCase().startsWith(lowPartial)) - Number(!b.label.toLowerCase().startsWith(lowPartial)))
            .slice(0, 12)
            .map((f) => ({
              label: f.label,
              detail: `${f.type}${f.required ? ' · required' : ''}${f.readOnly ? ' · read-only' : ''}${f.label !== f.apiName ? ' · ' + f.apiName : ''}`,
              insert: f.label
            }));
          return items.length ? { items, active: 0, from: caret - partial.length, to: caret, title: `Fields on ${objectContext}` } : null;
        }
        return null;
      }

      // 3. Start of a line: step phrasing templates
      if (quoteCount === 0) {
        const prefix = before.match(/^\s*(?:\d+[.)]\s*)?/)?.[0] || '';
        const partial = before.slice(prefix.length);
        if ((partial.length >= 2 || (force && partial.length >= 0)) && /^[A-Za-z][A-Za-z ]*$|^$/.test(partial) && after.trim().length === 0) {
          const low = partial.toLowerCase();
          const items = patterns
            .filter((p) => !low || p.template.toLowerCase().startsWith(low) || p.example.toLowerCase().startsWith(low) || p.label.toLowerCase().includes(low))
            .slice(0, 10)
            .map((p) => ({ label: p.template, detail: `${p.category} · e.g. ${p.example}`, insert: p.template, caretOffset: templateCaret(p.template) }));
          return items.length ? { items, active: 0, from: lineStart + prefix.length, to: caret, title: 'Step phrasing' } : null;
        }
      }
      return null;
    },
    [fields, patterns, tokens, rememberedVars, objectContext, dataColumns, blocks, apps, navTabs, listViews]
  );

  const refreshSuggestions = (force = false) => {
    const el = textareaRef.current;
    if (!el || isRecording) {
      setSuggest(null);
      return;
    }
    if (el.selectionStart !== el.selectionEnd) {
      setSuggest(null);
      return;
    }
    setSuggest(computeSuggestions(el.value, el.selectionStart, force));
  };

  const applySuggestion = (item: SuggestItem, state: SuggestState) => {
    const el = textareaRef.current;
    const text = el ? el.value : value;
    const next = text.slice(0, state.from) + item.insert + text.slice(state.to);
    const caret = state.from + (item.caretOffset ?? item.insert.length);
    onChange(next);
    setSuggest(null);
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(caret, caret);
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === ' ') {
      e.preventDefault();
      refreshSuggestions(true);
      return;
    }
    if (!suggest || suggest.items.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSuggest({ ...suggest, active: (suggest.active + 1) % suggest.items.length });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSuggest({ ...suggest, active: (suggest.active - 1 + suggest.items.length) % suggest.items.length });
    } else if (e.key === 'Tab') {
      e.preventDefault();
      applySuggestion(suggest.items[suggest.active], suggest);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setSuggest(null);
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) refreshSuggestions();
    if (!suggest && ['ArrowUp', 'ArrowDown'].includes(e.key)) refreshSuggestions();
  };

  // ---------------------------------------------------------------- line edits
  const replaceLine = (lineNumber: number, newText: string) => {
    const lines = value.split('\n');
    if (lineNumber - 1 < lines.length) {
      lines[lineNumber - 1] = newText;
      onChange(lines.join('\n'));
    }
  };

  const appendStep = (stepText: string) => {
    const n = nextStepNumber(value);
    const base = value.replace(/\s+$/, '');
    onChange(`${base}${base ? '\n' : ''}${n}. ${stepText}`);
  };

  const focusLine = (lineNumber: number) => {
    const el = textareaRef.current;
    if (!el) return;
    const lines = value.split('\n');
    let pos = 0;
    for (let i = 0; i < lineNumber - 1 && i < lines.length; i++) pos += lines[i].length + 1;
    el.focus();
    el.setSelectionRange(pos, pos + (lines[lineNumber - 1]?.length || 0));
  };

  // Save the selected lines (or all lines) as a reusable block
  const saveSelectionAsBlock = async () => {
    const el = textareaRef.current;
    const name = blockName.trim();
    if (!name) {
      setBlockMsg('Give the block a name first.');
      return;
    }
    let text = value;
    if (el && el.selectionStart !== el.selectionEnd) {
      const start = value.lastIndexOf('\n', el.selectionStart - 1) + 1;
      const endIdx = value.indexOf('\n', el.selectionEnd);
      text = value.slice(start, endIdx === -1 ? value.length : endIdx);
    }
    const res = await fetch('/api/blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, steps: text })
    });
    const d = await res.json();
    if (d.success) {
      setBlockMsg(`Saved “${d.block.name}” (${d.block.steps.length} steps). Use it with: Use block "${d.block.name}"`);
      setBlockName('');
      loadBlocks();
    } else {
      setBlockMsg(d.error || 'Could not save the block');
    }
  };

  // Standard opening of a test: log in, App Launcher, search the app, pick the tab
  const hasOpening = /app\s*launcher|search(?:ing)?\s+(?:for\s+)?(?:the\s+)?(?:desired\s+)?app/i.test(value);
  const insertOpeningSteps = () => {
    const opening = ['Log in to Salesforce', 'Click App Launcher', 'Search app ""', 'Select "" tab'];
    const existing = value
      .split('\n')
      .map((l) => l.replace(/^\s*(?:step\s+)?\d+[.:)\-]\s*/i, '').trim())
      .filter((l) => l.length > 0 && !/^(?:log\s*in(?:to)?|login|sign\s*in)\b/i.test(l));
    const all = [...opening, ...existing];
    const next = all.map((l, i) => `${i + 1}. ${l}`).join('\n') + (existing.length ? '' : '\n5. ');
    onChange(next);
    // Put the cursor inside the app name quotes
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      const pos = next.indexOf('Search app ""') + 'Search app "'.length;
      el.focus();
      el.setSelectionRange(pos, pos);
      setSuggest(computeSuggestions(next, pos, true));
    });
  };

  const removeBlock = async (name: string) => {
    await fetch(`/api/blocks/${encodeURIComponent(name)}`, { method: 'DELETE' });
    loadBlocks();
  };

  // Cheat sheet examples rewritten for the selected object's real fields
  const objectExamples = useMemo(
    () => (fieldsStatus === 'loaded' && fields.length ? buildObjectExamples(objectContext, objectLabel || objectContext, fields) : {}),
    [fieldsStatus, fields, objectContext, objectLabel]
  );

  const patternGroups = useMemo(() => {
    const g = new Map<string, StepPattern[]>();
    patterns.forEach((p) => {
      const example = objectExamples[p.label] || p.example;
      g.set(p.category, [...(g.get(p.category) || []), { ...p, example }]);
    });
    if (objectExamples['Date (test data)']) {
      const td = g.get('Test data') || [];
      g.set('Test data', [...td, { category: 'Test data', label: 'Date (test data)', template: '', example: objectExamples['Date (test data)'] }]);
    }
    return [...g.entries()];
  }, [patterns, objectExamples]);

  // Object picker data
  const allObjects = useMemo(() => {
    const seen = new Set<string>();
    const out: { api: string; custom: boolean }[] = [];
    customObjects.forEach((o) => !seen.has(o) && (seen.add(o), out.push({ api: o, custom: true })));
    standardObjects.forEach((o) => !seen.has(o) && (seen.add(o), out.push({ api: o, custom: /__c$/i.test(o) })));
    return out;
  }, [customObjects, standardObjects]);

  const filteredObjects = useMemo(() => {
    const q = objectQuery.trim().toLowerCase();
    const list = q
      ? allObjects.filter((o) => o.api.toLowerCase().includes(q) || prettyObject(o.api).toLowerCase().includes(q))
      : allObjects;
    return list
      .slice()
      .sort((a, b) => {
        if (q) {
          const as = Number(!prettyObject(a.api).toLowerCase().startsWith(q));
          const bs = Number(!prettyObject(b.api).toLowerCase().startsWith(q));
          if (as !== bs) return as - bs;
        }
        return Number(!a.custom) - Number(!b.custom);
      })
      .slice(0, 60);
  }, [allObjects, objectQuery]);

  const detectedObjects = useMemo(
    () => detectObjectsInSteps(value, allObjects.map((o) => o.api)),
    [value, allObjects]
  );
  const suggestedObject = detectedObjects.find((o) => o !== objectContext);

  const chooseObject = (api: string) => {
    setObjectPickerOpen(false);
    setObjectQuery('');
    if (api !== objectContext) onObjectChange?.(api);
  };

  // ---------------------------------------------------------------- render
  return (
    <div className="space-y-2">
      <div className="relative">
        <textarea
          ref={textareaRef}
          rows={9}
          spellCheck={false}
          className={`w-full bg-slate-50 border rounded-lg p-3 text-xs font-mono text-slate-800 focus:outline-none resize-y leading-relaxed transition ${
            isRecording
              ? 'border-rose-400 bg-white ring-2 ring-rose-100'
              : isPaused
              ? 'border-amber-400 bg-white ring-2 ring-amber-100'
              : summary.errors > 0
              ? 'border-rose-300 focus:bg-white focus:border-rose-400 focus:ring-2 focus:ring-rose-500/10'
              : 'border-slate-300 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10'
          }`}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            const el = e.target;
            setSuggest(computeSuggestions(el.value, el.selectionStart, false));
          }}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onClick={() => refreshSuggestions()}
          onBlur={() => setTimeout(() => setSuggest(null), 150)}
          placeholder={placeholder}
        />

        {suggest && suggest.items.length > 0 && (
          <div className="absolute left-2 right-2 top-full -mt-1 z-30 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-2.5 py-1 bg-slate-50 border-b border-slate-200 text-[11px] text-slate-500">
              <span className="font-semibold uppercase tracking-wide">{suggest.title}</span>
              <span>Tab to insert · ↑↓ to move · Esc to close</span>
            </div>
            <ul className="max-h-56 overflow-y-auto">
              {suggest.items.map((item, i) => (
                <li key={`${item.label}-${item.detail}-${i}`}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applySuggestion(item, suggest);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 flex items-center justify-between gap-3 text-xs cursor-pointer ${
                      i === suggest.active ? 'bg-blue-50 text-blue-900' : 'hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <span className="font-mono truncate">{item.label}</span>
                    {item.detail && <span className="text-[11px] text-slate-500 truncate max-w-[55%]">{item.detail}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Toolbar: field metadata + cheat sheet */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex flex-wrap items-center gap-1.5 text-slate-500">
          {/* Object picker: drives field suggestions, checks and the cheat sheet */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setObjectPickerOpen((o) => !o)}
              className="flex items-center gap-1 px-2 py-0.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 cursor-pointer"
              title="Object these steps work on — used for field suggestions, checks and the cheat sheet"
            >
              <Boxes className="h-3 w-3 text-slate-500" />
              <span className="font-semibold">{objectLabel && fieldsStatus === 'loaded' ? objectLabel : prettyObject(objectContext || 'Select object')}</span>
              {/__c$/i.test(objectContext) && <span className="font-mono text-[11px] text-slate-400">{objectContext}</span>}
              <ChevronDown className="h-3 w-3 text-slate-400" />
            </button>
            {objectPickerOpen && (
              <div className="absolute left-0 top-full mt-1 z-40 w-72 bg-white border border-slate-200 rounded-lg shadow-lg">
                <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-slate-200">
                  <Search className="h-3.5 w-3.5 text-slate-400" />
                  <input
                    autoFocus
                    value={objectQuery}
                    onChange={(e) => setObjectQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setObjectPickerOpen(false);
                      if (e.key === 'Enter' && filteredObjects[0]) chooseObject(filteredObjects[0].api);
                    }}
                    placeholder="Search objects (e.g. Encounter)"
                    className="flex-1 text-xs outline-none bg-transparent"
                  />
                </div>
                <ul className="max-h-64 overflow-y-auto py-1">
                  {filteredObjects.length === 0 && (
                    <li className="px-2.5 py-1.5 text-[11px] text-slate-500">
                      {allObjects.length ? 'No matching object' : 'Object list not loaded — check the org connection'}
                    </li>
                  )}
                  {filteredObjects.map((o) => (
                    <li key={o.api}>
                      <button
                        type="button"
                        onClick={() => chooseObject(o.api)}
                        className={`w-full text-left px-2.5 py-1 flex items-center justify-between text-xs cursor-pointer hover:bg-blue-50 ${
                          o.api === objectContext ? 'bg-blue-50 text-blue-800 font-semibold' : 'text-slate-800'
                        }`}
                      >
                        <span className="truncate">{prettyObject(o.api)}</span>
                        <span className="font-mono text-[11px] text-slate-400 ml-2 truncate">
                          {o.custom ? o.api : 'standard'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <Database className="h-3.5 w-3.5 ml-1" />
          {fieldsStatus === 'loading' && <span>Loading fields…</span>}
          {fieldsStatus === 'loaded' && <span>{fields.length} fields loaded</span>}
          {fieldsStatus === 'failed' && (
            <span className="text-amber-700" title={fieldsError || ''}>
              Field checks off — couldn't load fields from {selectedOrg}
            </span>
          )}
          {fieldsStatus !== 'loading' && objectContext && (
            <button
              type="button"
              onClick={() => loadFields(true)}
              className="text-blue-700 hover:underline cursor-pointer flex items-center gap-0.5"
              title="Re-read field metadata from the org"
            >
              <RefreshCw className="h-3 w-3" />
              <span>{fieldsStatus === 'failed' ? 'Retry' : 'Refresh'}</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 text-slate-500">
          <span className="hidden md:inline">Ctrl+Space for suggestions · type {'{{'} for test data</span>
          {!hasOpening && (
            <button
              type="button"
              onClick={insertOpeningSteps}
              className="flex items-center gap-1 px-2 py-0.5 rounded border bg-white border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
              title="Adds: Log in to Salesforce, Click App Launcher, Search app, Select tab"
            >
              <LayoutGrid className="h-3 w-3" />
              <span>Add app opening steps</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowBlocks((s) => !s)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded border cursor-pointer ${
              showBlocks ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Layers3 className="h-3 w-3" />
            <span>Blocks{blocks.length ? ` (${blocks.length})` : ''}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowCheatSheet((s) => !s)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded border cursor-pointer ${
              showCheatSheet ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <BookOpen className="h-3 w-3" />
            <span>Cheat sheet</span>
          </button>
        </div>
      </div>

      {showBlocks && (
        <div className="border border-slate-200 rounded-lg p-2.5 space-y-2 text-[12px]">
          <div className="text-slate-600">
            Blocks are named groups of steps you reuse across tests, e.g. login and opening a record. Add one to a test with{' '}
            <code className="text-[11px]">Use block "Name"</code>.
          </div>
          {blocks.length > 0 && (
            <ul className="divide-y divide-slate-100 border border-slate-200 rounded">
              {blocks.map((b) => (
                <li key={b.name} className="flex items-center justify-between gap-2 px-2 py-1">
                  <span className="min-w-0">
                    <span className="font-medium text-slate-800">{b.name}</span>
                    <span className="text-slate-500"> · {b.steps.length} steps</span>
                    <span className="block truncate text-[11px] text-slate-400" title={b.steps.join('\n')}>{b.steps.join(' → ')}</span>
                  </span>
                  <span className="flex items-center gap-1 flex-shrink-0">
                    <button type="button" onClick={() => appendStep(`Use block "${b.name}"`)} className="px-2 py-0.5 rounded border border-slate-200 hover:bg-slate-50 cursor-pointer">
                      Insert
                    </button>
                    <button type="button" onClick={() => removeBlock(b.name)} className="p-1 text-slate-400 hover:text-rose-700 cursor-pointer" aria-label={`Delete block ${b.name}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-2">
            <input
              value={blockName}
              onChange={(e) => setBlockName(e.target.value)}
              placeholder="New block name, e.g. Login and open recent Encounter"
              className="h-7 flex-1 rounded border border-slate-300 px-2 focus:outline-none focus:border-blue-500"
            />
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={saveSelectionAsBlock} className="h-7 inline-flex items-center gap-1 rounded border border-slate-300 px-2 hover:bg-slate-50 cursor-pointer" title="Saves the lines you selected in the editor (or all lines)">
              <Save className="h-3.5 w-3.5" /> Save selected lines
            </button>
          </div>
          {blockMsg && <div className="text-slate-600">{blockMsg}</div>}
        </div>
      )}

      {suggestedObject && onObjectChange && (
        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
          <span>
            Your steps open <strong>{prettyObject(suggestedObject)}</strong>, but fields are being checked against{' '}
            <strong>{objectLabel || prettyObject(objectContext)}</strong>.
          </span>
          <button
            type="button"
            onClick={() => chooseObject(suggestedObject)}
            className="px-2 py-0.5 rounded bg-white border border-amber-300 hover:bg-amber-100 font-semibold cursor-pointer flex-shrink-0"
          >
            Use {prettyObject(suggestedObject)}
          </button>
        </div>
      )}

      {/* Cheat sheet */}
      {showCheatSheet && (
        <div className="border border-blue-100 bg-blue-50/40 rounded-lg p-2.5 space-y-2 max-h-72 overflow-y-auto">
          <div className="text-[11px] text-slate-600">
            {Object.keys(objectExamples).length > 0
              ? `Examples use real ${objectLabel || objectContext} fields. Click one to add it as the next step.`
              : 'Click an example to add it as the next step, then edit the quoted values.'}
          </div>
          {patternGroups.map(([category, items]) => (
            <div key={category}>
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">{category}</div>
              <div className="flex flex-wrap gap-1">
                {items.map((p) => (
                  <button
                    key={p.example}
                    type="button"
                    onClick={() => appendStep(p.example)}
                    className="px-2 py-0.5 rounded bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-[11px] font-mono text-slate-700 cursor-pointer"
                    title={p.label}
                  >
                    {p.example}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {tokens.length > 0 && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">Test data tokens (fresh every run)</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {tokens.map((t) => (
                  <div key={t.token} className="flex items-center gap-2 text-[11px]">
                    <code className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-emerald-700">{t.token}</code>
                    <span className="text-slate-600 truncate">{t.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Live step check */}
      {insights.length > 0 && (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setShowCheck((s) => !s)}
            className="w-full flex items-center justify-between px-2.5 py-1.5 bg-slate-50 border-b border-slate-200 text-[11px] cursor-pointer"
          >
            <span className="flex items-center gap-2 font-semibold text-slate-700">
              <Sparkles className="h-3.5 w-3.5 text-blue-600" />
              <span>Step check</span>
              {checking && <RefreshCw className="h-3 w-3 animate-spin text-slate-400" />}
              <span className="text-emerald-700 font-medium">{summary.ok} ready</span>
              {summary.warnings > 0 && <span className="text-amber-700 font-medium">{summary.warnings} to review</span>}
              {summary.errors > 0 && <span className="text-rose-700 font-medium">{summary.errors} need fixing</span>}
              {!catalogLoaded && fieldsStatus !== 'loaded' && <span className="text-slate-400 font-normal">(phrasing only)</span>}
            </span>
            <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${showCheck ? 'rotate-180' : ''}`} />
          </button>
          {checkError && <div className="px-2.5 py-1 text-[11px] text-rose-700 bg-rose-50">{checkError}</div>}
          {showCheck && (
            <ul className="max-h-64 overflow-y-auto divide-y divide-slate-100">
              {insights.map((ins) => (
                <li key={`${ins.lineNumber}-${ins.rawText}`} className="px-2.5 py-1.5 text-[11px]">
                  <div className="flex items-start gap-2">
                    {ins.status === 'ok' ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mt-0.5 flex-shrink-0" />
                    ) : ins.status === 'warning' ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 text-rose-600 mt-0.5 flex-shrink-0" />
                    )}
                    <button
                      type="button"
                      onClick={() => focusLine(ins.lineNumber)}
                      className="text-slate-400 font-mono w-6 text-right flex-shrink-0 hover:text-blue-700 cursor-pointer"
                      title="Jump to this line"
                    >
                      {ins.lineNumber}
                    </button>
                    <span
                      className={`px-1.5 rounded text-[11px] font-semibold flex-shrink-0 border ${
                        ins.status === 'error'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : ins.actionType.startsWith('assert')
                          ? 'bg-purple-50 text-purple-700 border-purple-200'
                          : ins.actionType === 'remember_value'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-blue-50 text-blue-700 border-blue-200'
                      }`}
                    >
                      {ins.actionLabel}
                    </span>
                    <span className={`min-w-0 ${ins.status === 'error' ? 'text-rose-800' : 'text-slate-700'}`}>{ins.summary}</span>
                  </div>
                  {ins.issues.map((issue, k) => (
                    <div key={k} className="ml-[3.25rem] mt-1 space-y-1">
                      <div
                        className={`flex items-start gap-1 ${
                          issue.severity === 'error' ? 'text-rose-700' : issue.severity === 'warning' ? 'text-amber-800' : 'text-slate-500'
                        }`}
                      >
                        {issue.severity === 'info' && <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />}
                        <span>{issue.message}</span>
                      </div>
                      {issue.suggestions && issue.suggestions.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {issue.suggestions.map((sugg) => (
                            <button
                              key={sugg}
                              type="button"
                              onClick={() => replaceLine(ins.lineNumber, sugg)}
                              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-[11px] font-mono text-slate-700 cursor-pointer"
                              title="Replace this line"
                            >
                              <Wand2 className="h-3 w-3 text-blue-600" />
                              <span>{sugg}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
