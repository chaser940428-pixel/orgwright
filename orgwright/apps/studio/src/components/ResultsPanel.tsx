import React from 'react';
import { CheckCircle2, AlertCircle, Terminal, RefreshCw, Check, ShieldCheck, Filter, Search, MousePointerClick, ChevronDown, FileText, Activity, Flame, Zap, Database } from 'lucide-react';
import type { FullExecutionLogReport } from '../types/results';

type LogCategory = 'all' | 'clicks' | 'automations' | 'validations' | 'errors';

export interface ResultsPanelProps {
  executionLogReport: FullExecutionLogReport | null;
  setExecutionLogReport: (r: FullExecutionLogReport | null) => void;
  expandedStepIndex: number | null;
  setExpandedStepIndex: (i: number | null) => void;
  logSearchQuery: string;
  setLogSearchQuery: (q: string) => void;
  logCategoryFilter: LogCategory;
  setLogCategoryFilter: (c: LogCategory) => void;
  setShowFailureModal: (v: boolean) => void;
  setShowRawApexLogModal: (v: boolean) => void;
  setZoomedScreenshot: (url: string | null) => void;
  isTesterMode: boolean;
  selectedOrg: string;
  selectedPersona: any;
  testId: string;
}

/** Results tab: per-step outcome, screenshots, failure reasons and Salesforce backend activity. */
export function ResultsPanel(props: ResultsPanelProps) {
  const {
    executionLogReport,
    setExecutionLogReport,
    expandedStepIndex,
    setExpandedStepIndex,
    logSearchQuery,
    setLogSearchQuery,
    logCategoryFilter,
    setLogCategoryFilter,
    setShowFailureModal,
    setShowRawApexLogModal,
    setZoomedScreenshot,
    isTesterMode,
    selectedOrg,
    selectedPersona,
    testId
  } = props;

  return (

                <div className="flex-1 flex flex-col space-y-4 overflow-y-auto pr-1">
                  {!executionLogReport ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-white border border-slate-200 rounded-lg space-y-4 shadow-xs">
                      <div className="h-16 w-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center">
                        <FileText className="h-8 w-8 text-amber-600 stroke-1" />
                      </div>
                      <div className="space-y-1 max-w-md">
                        <h3 className="text-base font-semibold text-slate-900">No Execution Logs Recorded Yet</h3>
                        <p className="text-xs text-slate-500">
                          Click <strong>"▶ Run Live"</strong> to execute your test steps. The platform will automatically capture every browser click, input, timing, failure reasons, and trace all backend Salesforce triggers, record-triggered flows, and validation rules that fire after each click!
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => {
                            fetch('/api/test-results/execution-logs')
                              .then((r) => r.json())
                              .then((data) => {
                                if (data.report) setExecutionLogReport(data.report);
                              });
                          }}
                          className="px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-medium flex items-center space-x-1.5 transition cursor-pointer"
                        >
                          <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
                          <span>Check Recent Execution Logs</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Top Execution & Salesforce Summary Card */}
                      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs space-y-3">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                          <div className="flex items-center space-x-3">
                            <div
                              className={`h-9 w-9 rounded-lg flex items-center justify-center ${
                                executionLogReport.status === 'passed'
                                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-600'
                                  : 'bg-rose-50 border border-rose-200 text-rose-600'
                              }`}
                            >
                              {executionLogReport.status === 'passed' ? (
                                <CheckCircle2 className="h-5 w-5" />
                              ) : (
                                <AlertCircle className="h-5 w-5" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center space-x-2">
                                <h3 className="text-sm font-bold text-slate-900">
                                  {executionLogReport.testId} results
                                </h3>
                                <span
                                  className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                                    executionLogReport.status === 'passed'
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                                  }`}
                                >
                                  {executionLogReport.status}
                                </span>
                                <span className="text-xs text-slate-500 font-mono">
                                  {(executionLogReport.totalDurationMs / 1000).toFixed(1)}s total
                                </span>
                              </div>
                              <p className="text-xs text-slate-500">
                                {executionLogReport.steps.length} frontend steps executed • {selectedOrg} (Sandbox) •{' '}
                                {selectedPersona?.name || 'Standard User'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center space-x-2">
                            {executionLogReport.salesforceLogs.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setShowRawApexLogModal(true)}
                                className="px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-xs font-medium flex items-center space-x-1.5 transition cursor-pointer shadow-2xs"
                              >
                                <FileText className="h-3.5 w-3.5" />
                                <span>Raw Apex Debug Log ({executionLogReport.salesforceLogs.length})</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                fetch(`/api/test-results/execution-logs?testId=${executionLogReport.testId}`)
                                  .then((r) => r.json())
                                  .then((d) => {
                                    if (d.report) setExecutionLogReport(d.report);
                                  });
                              }}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 text-xs transition cursor-pointer"
                              title="Refresh logs from org"
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Backend Telemetry Metric Cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
                          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                            <span className="text-[11px] text-slate-500 uppercase tracking-wider block font-semibold">Steps Run</span>
                            <div className="flex items-center space-x-1.5 mt-0.5">
                              <MousePointerClick className="h-3.5 w-3.5 text-blue-600" />
                              <span className="text-sm font-bold text-slate-900">{executionLogReport.steps.length}</span>
                              <span className="text-[11px] text-slate-500 font-normal">Actions</span>
                            </div>
                          </div>

                          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                            <span className="text-[11px] text-amber-700 uppercase tracking-wider block font-semibold">Apex Triggers</span>
                            <div className="flex items-center space-x-1.5 mt-0.5">
                              <Flame className="h-3.5 w-3.5 text-amber-600" />
                              <span className="text-sm font-bold text-slate-900">
                                {executionLogReport.backendAutomationSummary?.totalTriggersFired ?? 0}
                              </span>
                              <span className="text-[11px] text-slate-500 font-normal">Fired</span>
                            </div>
                          </div>

                          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                            <span className="text-[11px] text-indigo-700 uppercase tracking-wider block font-semibold">Record Flows</span>
                            <div className="flex items-center space-x-1.5 mt-0.5">
                              <Zap className="h-3.5 w-3.5 text-indigo-600" />
                              <span className="text-sm font-bold text-slate-900">
                                {executionLogReport.backendAutomationSummary?.totalFlowsExecuted ?? 0}
                              </span>
                              <span className="text-[11px] text-slate-500 font-normal">Ran</span>
                            </div>
                          </div>

                          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                            <span className="text-[11px] text-teal-700 uppercase tracking-wider block font-semibold">Validations</span>
                            <div className="flex items-center space-x-1.5 mt-0.5">
                              <ShieldCheck className="h-3.5 w-3.5 text-teal-600" />
                              <span className="text-sm font-bold text-slate-900">
                                {executionLogReport.backendAutomationSummary?.totalValidationsChecked ?? 0}
                              </span>
                              <span className="text-[11px] text-slate-500 font-normal">Checked</span>
                            </div>
                          </div>

                          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 col-span-2 sm:col-span-1">
                            <span className="text-[11px] text-purple-700 uppercase tracking-wider block font-semibold">DML Operations</span>
                            <div className="flex items-center space-x-1.5 mt-0.5">
                              <Database className="h-3.5 w-3.5 text-purple-600" />
                              <span className="text-sm font-bold text-slate-900">
                                {executionLogReport.backendAutomationSummary?.totalDmlRecords ?? 0}
                              </span>
                              <span className="text-[11px] text-slate-500 font-normal">Records</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Filter & Search Bar */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                        <div className="flex items-center space-x-1 overflow-x-auto text-xs">
                          {(['all', 'clicks', 'automations', 'validations', 'errors'] as const).map((cat) => (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => setLogCategoryFilter(cat)}
                              className={`px-3 py-1 rounded-lg capitalize transition cursor-pointer ${
                                logCategoryFilter === cat
                                  ? 'bg-blue-600 text-white font-medium shadow-2xs'
                                  : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200'
                              }`}
                            >
                              {cat === 'all'
                                ? 'All Steps'
                                : cat === 'clicks'
                                ? 'Clicks & Inputs'
                                : cat === 'automations'
                                ? 'Backend Automations'
                                : cat === 'validations'
                                ? 'Validations'
                                : 'Failures'}
                            </button>
                          ))}
                        </div>

                        <div className="relative w-full sm:w-64">
                          <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                          <input
                            type="text"
                            placeholder="Filter steps, fields, triggers..."
                            value={logSearchQuery}
                            onChange={(e) => setLogSearchQuery(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 shadow-2xs"
                          />
                        </div>
                      </div>

                      {executionLogReport.dataRows && (
                        <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[13px]">
                          <div className="font-medium text-slate-900">
                            Data rows: {executionLogReport.dataRows.passed} of {executionLogReport.dataRows.total} passed
                          </div>
                          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                            {executionLogReport.dataRows.results.map((r) => (
                              <li key={r.row} className={r.status === 'passed' ? 'text-emerald-700' : 'text-rose-700'} title={r.error || ''}>
                                Row {r.row}: {r.status}
                              </li>
                            ))}
                          </ul>
                          <div className="mt-1 text-xs text-slate-500">Steps below are from {executionLogReport.dataRows.passed === executionLogReport.dataRows.total ? 'row 1' : 'the first failing row'}.</div>
                        </div>
                      )}

                      {/* Step-by-Step Execution Cards with Backend Correlation */}
                      <div className="space-y-3">
                        {executionLogReport.steps
                          .filter((st) => {
                            const q = logSearchQuery.toLowerCase();
                            const matchQuery =
                              !q ||
                              st.stepText.toLowerCase().includes(q) ||
                              (st.elementTarget && st.elementTarget.toLowerCase().includes(q)) ||
                              st.triggersFired.some((t) => t.name.toLowerCase().includes(q)) ||
                              st.flowsExecuted.some((f) => f.flowName.toLowerCase().includes(q)) ||
                              st.validationsEvaluated.some((v) => v.ruleName.toLowerCase().includes(q));

                            if (!matchQuery) return false;

                            if (logCategoryFilter === 'clicks') return st.actionType === 'click' || st.actionType === 'fill';
                            if (logCategoryFilter === 'automations') return st.triggersFired.length > 0 || st.flowsExecuted.length > 0;
                            if (logCategoryFilter === 'validations') return st.validationsEvaluated.length > 0;
                            if (logCategoryFilter === 'errors') return st.status === 'failed';
                            return true;
                          })
                          .map((st) => {
                            const isExpanded = expandedStepIndex === st.stepIndex;
                            const hasBackendActivity =
                              st.triggersFired.length > 0 ||
                              st.flowsExecuted.length > 0 ||
                              st.validationsEvaluated.length > 0 ||
                              st.dmlOperations.length > 0;

                            return (
                              <div
                                key={st.stepIndex}
                                className={`rounded-lg border transition overflow-hidden ${
                                  st.status === 'failed'
                                    ? 'bg-white border-2 border-rose-300 shadow-xs'
                                    : st.status === 'skipped'
                                    ? 'bg-slate-50 border border-dashed border-slate-200 opacity-70'
                                    : hasBackendActivity
                                    ? 'bg-white border border-blue-200 hover:border-blue-300 shadow-xs'
                                    : 'bg-white border border-slate-200 hover:border-slate-300 shadow-xs'
                                }`}
                              >
                                {/* Step Card Header */}
                                <div
                                  onClick={() => setExpandedStepIndex(isExpanded ? null : st.stepIndex)}
                                  className="p-3.5 px-4 flex items-center justify-between cursor-pointer select-none"
                                >
                                  <div className="flex items-center space-x-3 min-w-0">
                                    <div
                                      className={`h-7 w-7 rounded-lg flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                                        st.status === 'failed'
                                          ? 'bg-rose-600 text-white'
                                          : st.status === 'skipped'
                                          ? 'bg-slate-100 text-slate-400 border border-slate-200'
                                          : st.actionType === 'click'
                                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                          : st.actionType === 'fill'
                                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                          : st.actionType === 'navigate'
                                          ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                                      }`}
                                    >
                                      {st.stepIndex}
                                    </div>

                                    <div className="min-w-0">
                                      <div className="flex items-center space-x-2">
                                        <span className="text-xs font-semibold text-slate-900 truncate">
                                          {st.stepText}
                                        </span>
                                        {st.elementTarget && (
                                          <span className="px-1.5 py-0.2 rounded text-[11px] bg-slate-100 text-slate-700 border border-slate-200 font-mono truncate max-w-[160px]">
                                            {st.elementTarget}
                                          </span>
                                        )}
                                        {st.valueTyped && (
                                          <span className="px-1.5 py-0.2 rounded text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono">
                                            Typed: "{st.valueTyped}"
                                          </span>
                                        )}
                                      </div>

                                      {/* Subtitle indicator */}
                                      <div className="flex items-center space-x-2 text-[11px] text-slate-500 mt-0.5">
                                        <span className="capitalize">{st.actionType} action</span>
                                        <span>•</span>
                                        <span className="font-mono text-slate-500">{st.durationMs}ms</span>
                                        {hasBackendActivity && (
                                          <>
                                            <span>•</span>
                                            <span className="text-amber-700 font-semibold">
                                              Backend Automation Fired
                                            </span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center space-x-2.5 flex-shrink-0">
                                    {st.screenshotUrl && (
                                      <img
                                        src={st.screenshotUrl}
                                        alt={`Screen after step ${st.stepIndex}`}
                                        className="hidden sm:block h-9 w-14 object-cover object-top rounded border border-slate-200 hover:ring-2 hover:ring-blue-300"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setZoomedScreenshot(st.screenshotUrl || null);
                                        }}
                                        title="Screen after this step — click to enlarge"
                                      />
                                    )}
                                    {st.status === 'skipped' ? (
                                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                                        Not run
                                      </span>
                                    ) : st.status === 'passed' ? (
                                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center space-x-1">
                                        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                        <span>Passed</span>
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 flex items-center space-x-1">
                                        <AlertCircle className="h-3 w-3 text-rose-600" />
                                        <span>Failed</span>
                                      </span>
                                    )}

                                    <ChevronDown
                                      className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${
                                        isExpanded ? 'rotate-180' : ''
                                      }`}
                                    />
                                  </div>
                                </div>

                                {/* Step Failure Box if Failed */}
                                {st.status === 'failed' && (
                                  <div className="px-4 pb-3">
                                    <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 space-y-1.5">
                                      <div className="flex items-center space-x-1.5 text-rose-800 font-semibold text-xs">
                                        <AlertCircle className="h-4 w-4 flex-shrink-0" />
                                        <span>Why this step failed</span>
                                      </div>
                                      <div className="flex flex-col md:flex-row gap-3">
                                        <div className="flex-1 space-y-1.5 min-w-0">
                                          <p className="text-xs text-rose-900 leading-relaxed">
                                            {st.error || 'Assertion or locator timeout exceeded.'}
                                          </p>
                                          {st.explanation && st.explanation !== st.error && (
                                            <p className="text-[11px] text-rose-800/90 leading-relaxed">{st.explanation}</p>
                                          )}
                                          {st.recommendation && (
                                            <p className="text-[11px] text-slate-700 leading-relaxed">
                                              <span className="font-semibold">Try this: </span>
                                              {st.recommendation}
                                            </p>
                                          )}
                                        </div>
                                        {st.screenshotUrl && (
                                          <img
                                            src={st.screenshotUrl}
                                            alt={`Screen when step ${st.stepIndex} failed`}
                                            className="md:w-56 w-full rounded border border-rose-200 cursor-zoom-in"
                                            onClick={() => setZoomedScreenshot(st.screenshotUrl || null)}
                                            title="Screen when the step failed — click to enlarge"
                                          />
                                        )}
                                      </div>
                                      <div className="pt-1 flex items-center space-x-2">
                                        <button
                                          type="button"
                                          onClick={() => setShowFailureModal(true)}
                                          className="text-[11px] text-rose-700 underline hover:text-rose-900 font-medium cursor-pointer"
                                        >
                                          {isTesterMode ? 'More details' : 'View Failure Screen & Full RCA Modal'}
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* Expanded Detail Drawer: Browser Action + Salesforce Backend Activity */}
                                {isExpanded && (
                                  <div className="px-4 pb-4 pt-2 border-t border-slate-200 space-y-3 bg-slate-50/60">
                                    {st.screenshotUrl && st.status !== 'failed' && (
                                      <div className="space-y-1.5 text-xs">
                                        <span className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">Screen after this step</span>
                                        <img
                                          src={st.screenshotUrl}
                                          alt={`Screen after step ${st.stepIndex}`}
                                          className="w-full max-w-xl rounded-lg border border-slate-200 cursor-zoom-in"
                                          onClick={() => setZoomedScreenshot(st.screenshotUrl || null)}
                                        />
                                      </div>
                                    )}
                                    {/* Sub-section 1: Frontend Browser Action */}
                                    <div className="space-y-1.5 text-xs">
                                      <span className="text-[11px] text-slate-500 uppercase font-bold tracking-wider">
                                        Frontend Browser Execution
                                      </span>
                                      <div className="p-2.5 rounded-lg bg-white border border-slate-200 font-mono text-[11px] space-y-1 text-slate-700">
                                        <div>
                                          <span className="text-slate-400">Action:</span>{' '}
                                          <span className="text-blue-700 font-semibold">{st.actionType.toUpperCase()}</span> on element{' '}
                                          <span className="text-slate-900 font-semibold">"{st.elementTarget || 'target'}"</span>
                                        </div>
                                        {st.valueTyped && (
                                          <div>
                                            <span className="text-slate-400">Value Filled:</span>{' '}
                                            <span className="text-emerald-700 font-semibold">"{st.valueTyped}"</span>
                                          </div>
                                        )}
                                        <div>
                                          <span className="text-slate-400">Duration:</span> {st.durationMs}ms
                                        </div>
                                        {st.auraActions.length > 0 && (
                                          <div>
                                            <span className="text-slate-400">Lightning Server Calls:</span>{' '}
                                            <span className="text-indigo-700 font-semibold">
                                              {st.auraActions.map((a) => `${a.name} (HTTP ${a.status || 200})`).join(', ')}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {/* Sub-section 2: Salesforce Backend Automations Fired */}
                                    {hasBackendActivity ? (
                                      <div className="space-y-2 text-xs">
                                        <div className="flex items-center space-x-1.5 text-amber-800 font-semibold text-[11px] uppercase tracking-wider">
                                          <Flame className="h-3.5 w-3.5 text-amber-600" />
                                          <span>What Happened in Salesforce (Backend Automations Fired)</span>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                                          {/* Triggers */}
                                          {st.triggersFired.length > 0 && (
                                            <div className="p-2.5 rounded-lg bg-amber-50/70 border border-amber-200 space-y-1">
                                              <span className="text-amber-900 font-bold block">
                                                Apex Triggers Executed ({st.triggersFired.length})
                                              </span>
                                              {st.triggersFired.map((trig, tIdx) => (
                                                <div key={tIdx} className="text-slate-700 font-mono flex items-center justify-between">
                                                  <span>
                                                    <strong>{trig.name}</strong> on {trig.sObject}
                                                  </span>
                                                  <span className="text-amber-800 text-[11px] font-semibold">{trig.events} ({trig.durationMs || 30}ms)</span>
                                                </div>
                                              ))}
                                            </div>
                                          )}

                                          {/* Flows */}
                                          {st.flowsExecuted.length > 0 && (
                                            <div className="p-2.5 rounded-lg bg-indigo-50/70 border border-indigo-200 space-y-1">
                                              <span className="text-indigo-900 font-bold block">
                                                Record-Triggered Flows ({st.flowsExecuted.length})
                                              </span>
                                              {st.flowsExecuted.map((fl, fIdx) => (
                                                <div key={fIdx} className="text-slate-700 font-mono">
                                                  <div className="flex items-center justify-between">
                                                    <strong>{fl.flowName}</strong>
                                                    <span className="text-emerald-700 text-[11px] font-semibold">{fl.status}</span>
                                                  </div>
                                                  {fl.elementsTraversed && (
                                                    <div className="text-[11px] text-slate-500 truncate">
                                                      Elements: {fl.elementsTraversed.join(' → ')}
                                                    </div>
                                                  )}
                                                </div>
                                              ))}
                                            </div>
                                          )}

                                          {/* Validation Rules */}
                                          {st.validationsEvaluated.length > 0 && (
                                            <div className="p-2.5 rounded-lg bg-teal-50/70 border border-teal-200 space-y-1">
                                              <span className="text-teal-900 font-bold block">
                                                Validation Rules Evaluated ({st.validationsEvaluated.length})
                                              </span>
                                              {st.validationsEvaluated.map((val, vIdx) => (
                                                <div key={vIdx} className="text-slate-700 font-mono flex items-center justify-between">
                                                  <span>{val.ruleName}</span>
                                                  <span
                                                    className={`text-[11px] font-bold ${
                                                      val.result === 'PASSED' ? 'text-emerald-700' : 'text-rose-700'
                                                    }`}
                                                  >
                                                    {val.result}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                          )}

                                          {/* DML Operations */}
                                          {st.dmlOperations.length > 0 && (
                                            <div className="p-2.5 rounded-lg bg-purple-50/70 border border-purple-200 space-y-1">
                                              <span className="text-purple-900 font-bold block">
                                                Database DML Records Affected ({st.dmlOperations.length})
                                              </span>
                                              {st.dmlOperations.map((d, dIdx) => (
                                                <div key={dIdx} className="text-slate-700 font-mono flex items-center justify-between">
                                                  <span>
                                                    {d.operation} {d.rowCount} record(s)
                                                  </span>
                                                  <span className="text-purple-700 text-[11px] font-semibold">{d.sObject}</span>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>

                                        {/* Governor Limits */}
                                        {st.limitsConsumed && (
                                          <div className="p-2 rounded-lg bg-white border border-slate-200 text-[11px] font-mono text-slate-500 flex items-center justify-between">
                                            <span>SOQL Queries: <strong className="text-slate-800">{st.limitsConsumed.soqlQueries}</strong></span>
                                            <span>DML Statements: <strong className="text-slate-800">{st.limitsConsumed.dmlStatements}</strong></span>
                                            <span>CPU Time: <strong className="text-slate-800">{st.limitsConsumed.cpuTimeMs}ms</strong></span>
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="text-[11px] text-slate-500 italic p-2 rounded bg-white border border-slate-200">
                                        No backend database DML triggered by this frontend step (UI navigation or field focus).
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </>
                  )}
                </div>
  );
}
