import React, { useEffect, useState } from 'react';
import { BookOpen, ChevronDown, Plus, Search, Settings2 } from 'lucide-react';
import { StepEditor, StepCheckSummary, RunMarkers } from './StepEditor';
import { CommandPalette } from './CommandPalette';
import { DataRowsPanel } from './DataRowsPanel';
import { useRun } from '../run/RunContext';

export interface TestCardMeta {
  ticketNumber: string;
  testId: string;
  projectName: string;
  testName: string;
  scenarioType: 'positive' | 'negative';
  tagsText: string;
  priority: 'High' | 'Medium' | 'Low';
  owner: string;
}

interface TestCardProps {
  meta: TestCardMeta;
  onMetaChange: <K extends keyof TestCardMeta>(key: K, value: TestCardMeta[K]) => void;
  isDirty: boolean;
  testCases: Array<{ id: string; testName: string; tags?: string[] }>;
  distinctProjects: string[];
  onOpenStandardTests: () => void;
  onNewTest: () => void;
  onPickTest: (id: string) => void;
  activeTab: string;
  onOpenLiveBrowser: () => void;
  onInsertStepAtPause: () => void;

  // Step editor
  manualSteps: string;
  setManualSteps: (v: string) => void;
  objectContext: string;
  setObjectContext: (v: string) => void;
  standardObjects: string[];
  customObjects: string[];
  selectedOrg: string;
  dataColumns: string[];
  onSummaryChange: (s: StepCheckSummary) => void;
  stepCheckSummary: StepCheckSummary;
  focusRequest?: { nonce: number; line?: number; stepIndex?: number; firstError?: boolean };
  openCheatSheetNonce?: number;
  runMarkers?: RunMarkers;
  dataRows: Array<Record<string, string>>;
  setDataRows: (rows: Array<Record<string, string>>) => void;

  // Run options
  headed: boolean;
  setHeaded: (v: boolean) => void;
  pauseOnFailure: boolean;
  setPauseOnFailure: (v: boolean) => void;
  selectedBrowser: 'chrome' | 'msedge' | 'chromium';
  setSelectedBrowser: (v: 'chrome' | 'msedge' | 'chromium') => void;

  /** The sticky action bar */
  runBar: React.ReactNode;
}

const input = 'w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10';
const label = 'text-xs font-semibold text-slate-700 block mb-1';

/** Left pane: steps first, metadata behind a one-line Details disclosure, sticky RunBar at the bottom. */
export function TestCard(props: TestCardProps) {
  const run = useRun();
  const { meta, onMetaChange: set } = props;
  const [showDetails, setShowDetails] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Ctrl+K opens the test palette from anywhere (not while another dialog is open)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        if (document.querySelector('[aria-modal="true"]')) return;
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const detailsSummary = [
    meta.ticketNumber || 'No ticket',
    meta.projectName || 'No project',
    meta.scenarioType === 'negative' ? 'Negative' : 'Positive',
    meta.tagsText ? meta.tagsText : null,
    meta.priority !== 'Medium' ? `${meta.priority} priority` : null
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="bg-white border border-border rounded-lg p-5 shadow-xs space-y-4">
      {/* Title row */}
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-slate-600">{meta.testId || 'New test'}</span>
            {props.isDirty && (
              <span className="flex items-center gap-1 text-xs font-medium text-amber-800">
                <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" /> unsaved
              </span>
            )}
          </div>
          <label htmlFor="tc-name" className="sr-only">
            Test name
          </label>
          <input
            id="tc-name"
            type="text"
            value={meta.testName}
            onChange={(e) => set('testName', e.target.value)}
            placeholder="Name this test, e.g. Create an Account with Industry"
            className="mt-0.5 w-full rounded-md border border-transparent px-1 -mx-1 py-0.5 text-base font-semibold text-slate-900 hover:border-border focus:border-primary focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setShowDetails((s) => !s)}
            aria-expanded={showDetails}
            aria-controls="tc-details"
            className="mt-1 flex max-w-full items-center gap-1 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            <span className="truncate">{detailsSummary}</span>
            <span className="flex-shrink-0 font-medium text-primary-hover">Details</span>
            <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 transition-transform ${showDetails ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={props.onOpenStandardTests}
            className="flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer"
            title="Browse standard Salesforce test templates"
          >
            <BookOpen className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span>Standard tests</span>
          </button>
          <button
            type="button"
            onClick={props.onNewTest}
            className="flex h-8 items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer"
            title="Start a new test"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>New</span>
          </button>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer"
            title="Open a saved test (Ctrl+K)"
          >
            <Search className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
            <span>Open test…</span>
            <kbd className="rounded border border-border px-1 text-[10px] text-muted">Ctrl K</kbd>
          </button>
        </div>
      </div>

      {/* Details disclosure: the metadata fields */}
      {showDetails && (
        <div id="tc-details" className="grid grid-cols-2 gap-3 rounded-md border border-border bg-slate-50/60 p-3">
          <div>
            <label className={label} htmlFor="tc-ticket">Ticket</label>
            <input id="tc-ticket" type="text" className={`${input} font-mono`} value={meta.ticketNumber} onChange={(e) => set('ticketNumber', e.target.value)} placeholder="e.g. CRM-101" />
          </div>
          <div>
            <label className={label} htmlFor="tc-id">Test case ID</label>
            <input id="tc-id" type="text" className={`${input} font-mono`} value={meta.testId} onChange={(e) => set('testId', e.target.value)} placeholder="e.g. TC_001" />
          </div>
          <div>
            <label className={label} htmlFor="tc-project">Project</label>
            <input id="tc-project" type="text" list="project-suggestions" className={input} value={meta.projectName} onChange={(e) => set('projectName', e.target.value)} placeholder="e.g. Sales Cloud" />
            <datalist id="project-suggestions">
              {props.distinctProjects.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
          <fieldset>
            <legend className={label}>Scenario</legend>
            <div className="grid grid-cols-2 gap-2">
              {(['positive', 'negative'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={meta.scenarioType === t}
                  onClick={() => set('scenarioType', t)}
                  className={`flex items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs font-semibold cursor-pointer ${
                    meta.scenarioType === t
                      ? t === 'positive'
                        ? 'border-emerald-500 bg-success-soft text-emerald-800'
                        : 'border-rose-500 bg-danger-soft text-rose-800'
                      : 'border-border bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${t === 'positive' ? 'bg-emerald-500' : 'bg-rose-500'}`} aria-hidden="true" />
                  {t === 'positive' ? 'Positive' : 'Negative'}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
            <div>
              <label className={label} htmlFor="tc-tags">Tags</label>
              <input id="tc-tags" type="text" list="orgwright-known-tags" className={input} value={meta.tagsText} onChange={(e) => set('tagsText', e.target.value)} placeholder="Smoke, Regression, Release 26.4" />
              <datalist id="orgwright-known-tags">
                {[...new Set(props.testCases.flatMap((t) => t.tags || []))].map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
            <div>
              <label className={label} htmlFor="tc-priority">Priority</label>
              <select id="tc-priority" value={meta.priority} onChange={(e) => set('priority', e.target.value as TestCardMeta['priority'])} className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none">
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
            </div>
            <div>
              <label className={label} htmlFor="tc-owner">Owner</label>
              <input id="tc-owner" type="text" className={`${input} w-36`} value={meta.owner} onChange={(e) => set('owner', e.target.value)} placeholder="Name" />
            </div>
          </div>
        </div>
      )}

      {/* Steps */}
      <div>
        {run.isPaused && !run.repair && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-amber-300 bg-warning-soft px-3 py-2 text-sm text-amber-950">
            <span>
              <strong>Run paused{run.pausedStepIndex !== null ? ` at step ${run.pausedStepIndex}` : ''}.</strong> Add or edit steps, then Resume.
            </span>
            <button type="button" onClick={props.onInsertStepAtPause} className="flex h-7 flex-shrink-0 items-center gap-1 rounded-md border border-amber-400 bg-white px-2.5 text-xs font-medium text-amber-900 hover:bg-amber-100 cursor-pointer">
              <Plus className="h-3 w-3" aria-hidden="true" /> Insert step
            </button>
          </div>
        )}
        {run.repair && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-amber-300 bg-warning-soft px-3 py-2 text-sm">
            <span className="text-slate-800">
              <strong>Step {run.repair.stepIndex} failed.</strong> The run is paused so you can fix it.
            </span>
            {props.activeTab !== 'browser' && (
              <button type="button" onClick={props.onOpenLiveBrowser} className="h-7 flex-shrink-0 rounded-md border border-amber-400 bg-white px-2.5 text-xs font-medium text-amber-900 hover:bg-amber-100 cursor-pointer">
                Fix in Live browser
              </button>
            )}
          </div>
        )}

        <StepEditor
          dataColumns={props.dataColumns}
          value={props.manualSteps}
          onChange={props.setManualSteps}
          objectContext={props.objectContext}
          onObjectChange={props.setObjectContext}
          standardObjects={props.standardObjects}
          customObjects={props.customObjects}
          selectedOrg={props.selectedOrg}
          isRecording={run.isRecording}
          isPaused={run.isPaused}
          onSummaryChange={props.onSummaryChange}
          focusRequest={props.focusRequest}
          openCheatSheetNonce={props.openCheatSheetNonce}
          runMarkers={props.runMarkers}
          placeholder={'1. Log in to Salesforce\n2. Open Account list\n3. Click on New button\n4. Enter "Acme {{unique}}" in "Account Name"\n5. Click on Save button\n6. Verify toast "was created"'}
        />

        {run.isRecording && <div className="mt-1 text-xs text-slate-600">Recording: your clicks in the browser are added as steps.</div>}

        <div className="mt-2">
          <DataRowsPanel rows={props.dataRows} onChange={props.setDataRows} />
        </div>
      </div>

      {/* Run options disclosure */}
      <div className="border-t border-slate-100 pt-2">
        <button
          type="button"
          onClick={() => setShowOptions((s) => !s)}
          aria-expanded={showOptions}
          className="flex items-center gap-1.5 text-xs text-slate-700 hover:text-slate-900 cursor-pointer"
        >
          <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="font-medium">Run options:</span>
          <span className="text-slate-600">
            {props.headed ? 'headed' : 'headless'}
            {props.headed && props.pauseOnFailure ? ' · pause on failure' : ''} ·{' '}
            {props.selectedBrowser === 'msedge' ? 'Edge' : props.selectedBrowser === 'chromium' ? 'Chromium' : 'Chrome'}
          </span>
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showOptions ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {showOptions && (
          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-slate-700">
            <label className="flex cursor-pointer select-none items-center gap-1.5">
              <input type="checkbox" checked={props.headed} onChange={(e) => props.setHeaded(e.target.checked)} className="rounded border-slate-300 text-primary" />
              Headed browser
            </label>
            <label className={`flex select-none items-center gap-1.5 ${props.headed ? 'cursor-pointer' : 'opacity-50'}`} title="When a step fails, keep the browser open so you can fix it and continue">
              <input
                type="checkbox"
                checked={props.pauseOnFailure && props.headed}
                disabled={!props.headed}
                onChange={(e) => props.setPauseOnFailure(e.target.checked)}
                className="rounded border-slate-300 text-primary"
              />
              Pause on failure
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-xs text-slate-600">Browser</span>
              <select
                value={props.selectedBrowser}
                onChange={(e) => props.setSelectedBrowser(e.target.value as TestCardProps['selectedBrowser'])}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800 focus:border-primary focus:outline-none cursor-pointer"
              >
                <option value="chrome">Google Chrome</option>
                <option value="msedge">Microsoft Edge</option>
                <option value="chromium">Chromium</option>
              </select>
            </label>
          </div>
        )}
      </div>

      {props.stepCheckSummary.errors > 0 && !run.isRunning && (
        <p className="rounded-md border border-rose-200 bg-danger-soft px-2.5 py-1.5 text-xs text-rose-800" role="status">
          {props.stepCheckSummary.errors} step{props.stepCheckSummary.errors > 1 ? 's need' : ' needs'} fixing before this test can run correctly. See Step check above.
        </p>
      )}

      {props.runBar}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} tests={props.testCases} currentId={meta.testId} onPick={props.onPickTest} />
    </div>
  );
}
