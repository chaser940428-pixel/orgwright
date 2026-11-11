import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Download,
  FileCheck,
  FileSpreadsheet,
  FolderOpen,
  Moon,
  Play,
  RefreshCw,
  Search,
  Square,
  Trash2,
  UploadCloud,
  X
} from 'lucide-react';

export interface HistorySummary {
  recent: Array<{ at: string; status: 'passed' | 'failed' | 'interrupted'; source: string }>;
  runs: number;
  passRate: number | null;
  flaky: boolean;
  lastFailure?: { at: string; failedStep?: number; error?: string };
}

export interface SuiteTestCase {
  id: string;
  ticketNumber: string;
  testName: string;
  project: string;
  objectName: string;
  scenarioType?: 'positive' | 'negative';
  steps: string;
  stepCount: number;
  lastStatus?: 'passed' | 'failed' | 'idle';
  lastDurationMs?: number;
  tags?: string[];
  priority?: 'High' | 'Medium' | 'Low';
  owner?: string;
  dataRowCount?: number;
  history?: HistorySummary;
}

export interface SuiteRunSummary {
  total: number;
  passed: number;
  failed: number;
  unknown: number;
  tag?: string;
  results: Array<{ id: string; testName: string; status: 'passed' | 'failed' | 'unknown'; failedStep?: number; error?: string; rows?: { passed: number; total: number } }>;
}

interface SuitePanelProps {
  testCases: SuiteTestCase[];
  currentTestId: string;
  selectedTestIds: string[];
  setSelectedTestIds: (ids: string[]) => void;
  projectFilter: string;
  setProjectFilter: (p: string) => void;
  isRunning: boolean;
  isBatchRunning: boolean;
  isStopping: boolean;
  lastSuiteSummary: SuiteRunSummary | null;
  onDismissSummary: () => void;
  onLoad: (tc: SuiteTestCase) => void;
  onRunTests: (ids: string[], tag?: string) => void;
  onRunProject: () => void;
  onStop: () => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onDownloadProof: (id: string) => void;
  onImportExcel: () => void;
  onExportExcel: () => void;
  onDownloadTemplate: () => void;
  onOpenStandardTests: () => void;
  onOpenNightly: () => void;
}

const PRIORITY_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

function scenarioOf(tc: SuiteTestCase): 'positive' | 'negative' {
  if (tc.scenarioType) return tc.scenarioType;
  const n = (tc.testName || '').toLowerCase();
  return n.includes('negative') || n.includes('validation') || n.includes('read-only') ? 'negative' : 'positive';
}

function RunDots({ history }: { history?: HistorySummary }) {
  const recent = history?.recent || [];
  if (recent.length === 0) return <span className="text-slate-400">No runs yet</span>;
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-[3px]" aria-label={`Last ${recent.length} runs`}>
        {recent.map((r, i) => (
          <span
            key={i}
            title={`${new Date(r.at).toLocaleString()} — ${r.status} (${r.source})`}
            className={`h-3 w-1.5 rounded-sm ${r.status === 'passed' ? 'bg-emerald-500' : 'bg-rose-500'}`}
          />
        ))}
      </div>
      {history?.flaky && (
        <span className="flex items-center gap-0.5 text-amber-700 font-medium" title="Passed and failed in recent runs without code changes in between — investigate timing or data">
          <AlertTriangle className="h-3 w-3" />
          Flaky
        </span>
      )}
    </div>
  );
}

export function SuitePanel(props: SuitePanelProps) {
  const {
    testCases,
    currentTestId,
    selectedTestIds,
    setSelectedTestIds,
    projectFilter,
    setProjectFilter,
    isRunning,
    isBatchRunning,
    isStopping,
    lastSuiteSummary
  } = props;
  const [search, setSearch] = useState('');
  const [scenarioFilter, setScenarioFilter] = useState<'all' | 'positive' | 'negative'>('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [onlyFlaky, setOnlyFlaky] = useState(false);

  const projects = useMemo(() => [...new Set(testCases.map((t) => t.project || 'Sales Cloud'))].filter(Boolean).sort(), [testCases]);
  const tags = useMemo(() => {
    const m = new Map<string, number>();
    testCases.forEach((t) => (t.tags || []).forEach((tag) => m.set(tag, (m.get(tag) || 0) + 1)));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [testCases]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return testCases
      .filter((tc) => projectFilter === 'all' || tc.project === projectFilter)
      .filter((tc) => scenarioFilter === 'all' || scenarioOf(tc) === scenarioFilter)
      .filter((tc) => tagFilter === 'all' || (tc.tags || []).some((t) => t.toLowerCase() === tagFilter.toLowerCase()))
      .filter((tc) => !onlyFlaky || tc.history?.flaky)
      .filter(
        (tc) =>
          !q ||
          tc.id.toLowerCase().includes(q) ||
          (tc.ticketNumber || '').toLowerCase().includes(q) ||
          (tc.testName || '').toLowerCase().includes(q) ||
          (tc.owner || '').toLowerCase().includes(q) ||
          (tc.tags || []).some((t) => t.toLowerCase().includes(q))
      )
      .sort((a, b) => (PRIORITY_ORDER[a.priority || 'Medium'] ?? 1) - (PRIORITY_ORDER[b.priority || 'Medium'] ?? 1));
  }, [testCases, projectFilter, scenarioFilter, tagFilter, onlyFlaky, search]);

  const allSelected = filtered.length > 0 && filtered.every((tc) => selectedTestIds.includes(tc.id));
  const toggleAll = () => {
    if (allSelected) setSelectedTestIds(selectedTestIds.filter((id) => !filtered.some((tc) => tc.id === id)));
    else setSelectedTestIds([...new Set([...selectedTestIds, ...filtered.map((tc) => tc.id)])]);
  };
  const toggleOne = (id: string) =>
    setSelectedTestIds(selectedTestIds.includes(id) ? selectedTestIds.filter((x) => x !== id) : [...selectedTestIds, id]);

  const flakyCount = testCases.filter((t) => t.history?.flaky).length;
  const select = 'h-8 rounded-md border border-slate-300 bg-white px-2 text-[13px] text-slate-800 focus:outline-none focus:border-blue-500';
  const ghostBtn = 'h-8 inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-[13px] text-slate-700 hover:bg-slate-50 cursor-pointer';

  return (
    <div className="flex-1 flex flex-col gap-3 text-[13px]">
      {lastSuiteSummary && (
        <div className={`rounded-md border px-3 py-2 ${lastSuiteSummary.failed || lastSuiteSummary.unknown ? 'border-rose-200 bg-rose-50' : 'border-emerald-200 bg-emerald-50'}`}>
          <div className="flex items-center justify-between">
            <strong className="text-slate-900">
              {lastSuiteSummary.tag ? `${lastSuiteSummary.tag} suite` : 'Suite run'}: {lastSuiteSummary.passed} of {lastSuiteSummary.total} passed
            </strong>
            <button type="button" onClick={props.onDismissSummary} className="text-slate-500 hover:text-slate-800 cursor-pointer" aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </div>
          {lastSuiteSummary.results.filter((r) => r.status !== 'passed').length > 0 && (
            <ul className="mt-1 space-y-0.5 text-slate-700">
              {lastSuiteSummary.results
                .filter((r) => r.status !== 'passed')
                .map((r) => (
                  <li key={r.id}>
                    <span className="font-mono text-xs">{r.id}</span> {r.testName} —{' '}
                    {r.status === 'unknown' ? 'no per-step result (hand-edited spec)' : `failed${r.failedStep ? ` at step ${r.failedStep}` : ''}`}
                    {r.error && <span className="text-slate-500">: {r.error.split('\n')[0].slice(0, 160)}</span>}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2 top-2.5" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tests, tags, owners"
            className="h-8 w-56 rounded-md border border-slate-300 bg-white pl-7 pr-2 text-[13px] focus:outline-none focus:border-blue-500"
          />
        </div>
        <select className={select} value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} aria-label="Project">
          <option value="all">All projects</option>
          {projects.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select className={select} value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} aria-label="Tag">
          <option value="all">All tags</option>
          {tags.map(([t, n]) => (
            <option key={t} value={t}>
              {t} ({n})
            </option>
          ))}
        </select>
        <select className={select} value={scenarioFilter} onChange={(e) => setScenarioFilter(e.target.value as any)} aria-label="Scenario">
          <option value="all">Positive and negative</option>
          <option value="positive">Positive</option>
          <option value="negative">Negative</option>
        </select>
        {flakyCount > 0 && (
          <label className="inline-flex items-center gap-1 text-slate-700 cursor-pointer">
            <input type="checkbox" checked={onlyFlaky} onChange={(e) => setOnlyFlaky(e.target.checked)} />
            Flaky only ({flakyCount})
          </label>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {isRunning && isBatchRunning ? (
            <button type="button" onClick={props.onStop} disabled={isStopping} className="h-8 inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-3 text-[13px] font-medium text-white hover:bg-rose-700 disabled:opacity-50 cursor-pointer">
              {isStopping ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5 fill-current" />}
              {isStopping ? 'Stopping…' : 'Stop run'}
            </button>
          ) : (
            <>
              {tagFilter !== 'all' && (
                <button
                  type="button"
                  disabled={isRunning}
                  onClick={() => props.onRunTests(filtered.map((t) => t.id), tagFilter)}
                  className={ghostBtn}
                  title={`Run every test tagged ${tagFilter}`}
                >
                  <Play className="h-3.5 w-3.5" />
                  Run “{tagFilter}” ({filtered.length})
                </button>
              )}
              <button
                type="button"
                disabled={selectedTestIds.length === 0 || isRunning}
                onClick={() => props.onRunTests(selectedTestIds)}
                className="h-8 inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 text-[13px] font-medium text-white hover:bg-blue-700 disabled:opacity-40 cursor-pointer"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                Run selected ({selectedTestIds.length})
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-slate-600">
        <button type="button" className={ghostBtn} onClick={props.onImportExcel}>
          <UploadCloud className="h-3.5 w-3.5" /> Import
        </button>
        <button type="button" className={ghostBtn} onClick={props.onExportExcel}>
          <FileSpreadsheet className="h-3.5 w-3.5" /> Export
        </button>
        <button type="button" className={ghostBtn} onClick={props.onDownloadTemplate}>
          <Download className="h-3.5 w-3.5" /> Import template
        </button>
        <button type="button" className={ghostBtn} onClick={props.onOpenStandardTests}>
          <BookOpen className="h-3.5 w-3.5" /> Standard tests
        </button>
        <button type="button" className={ghostBtn} onClick={props.onOpenNightly}>
          <Moon className="h-3.5 w-3.5" /> Nightly run
        </button>
        <button type="button" className={ghostBtn} onClick={props.onRunProject} disabled={isRunning}>
          <Play className="h-3.5 w-3.5" /> Run project
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-x-auto rounded-md border border-slate-200 bg-white">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 text-xs text-slate-500">
              <th className="w-9 px-3 py-2">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" />
              </th>
              <th className="px-2 py-2 font-medium">Test</th>
              <th className="px-2 py-2 font-medium">Object</th>
              <th className="px-2 py-2 font-medium">Priority</th>
              <th className="px-2 py-2 font-medium">Last runs</th>
              <th className="px-2 py-2 font-medium sr-only">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-slate-500">
                  No tests match these filters.
                </td>
              </tr>
            )}
            {filtered.map((tc) => {
              const selected = selectedTestIds.includes(tc.id);
              const current = tc.id === currentTestId;
              return (
                <tr
                  key={tc.id}
                  onClick={() => props.onLoad(tc)}
                  className={`border-b border-slate-100 cursor-pointer ${current ? 'bg-blue-50/60' : 'hover:bg-slate-50'}`}
                >
                  <td className="px-3 py-2 align-top" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected} onChange={() => toggleOne(tc.id)} aria-label={`Select ${tc.id}`} />
                  </td>
                  <td className="px-2 py-2 align-top">
                    <div className="text-slate-900 font-medium leading-snug">{tc.testName || tc.id}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                      <span className="font-mono">{tc.id}</span>
                      {tc.ticketNumber && <span className="font-mono">{tc.ticketNumber}</span>}
                      <span>{tc.stepCount} steps</span>
                      {tc.dataRowCount ? <span>{tc.dataRowCount} data rows</span> : null}
                      {scenarioOf(tc) === 'negative' && <span className="text-rose-700">negative</span>}
                      {tc.owner && <span>· {tc.owner}</span>}
                      {(tc.tags || []).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setTagFilter(t);
                          }}
                          className="rounded bg-slate-100 px-1.5 text-slate-600 hover:bg-slate-200 cursor-pointer"
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="px-2 py-2 align-top text-slate-700">{(tc.objectName || '').replace(/__c$/, '')}</td>
                  <td className="px-2 py-2 align-top">
                    <span className={tc.priority === 'High' ? 'text-rose-700 font-medium' : tc.priority === 'Low' ? 'text-slate-500' : 'text-slate-700'}>
                      {tc.priority || 'Medium'}
                    </span>
                  </td>
                  <td className="px-2 py-2 align-top text-xs">
                    <RunDots history={tc.history} />
                  </td>
                  <td className="px-2 py-2 align-top" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-0.5 text-slate-500">
                      <button type="button" onClick={() => props.onLoad(tc)} className="p-1.5 rounded hover:bg-slate-100 hover:text-slate-900 cursor-pointer" title="Open in editor">
                        <FolderOpen className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => props.onRunTests([tc.id])} disabled={isRunning} className="p-1.5 rounded hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 cursor-pointer" title="Run">
                        <Play className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => props.onDownloadProof(tc.id)} className="p-1.5 rounded hover:bg-slate-100 hover:text-slate-900 cursor-pointer" title="Download Jira proof (.docx)">
                        <FileCheck className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={(e) => props.onDelete(tc.id, e)} className="p-1.5 rounded hover:bg-rose-50 hover:text-rose-700 cursor-pointer" title="Delete">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span>{testCases.length} tests</span>
        <span>{testCases.filter((t) => t.lastStatus === 'passed').length} passed last run</span>
        <span>{testCases.filter((t) => t.lastStatus === 'failed').length} failed last run</span>
      </div>
    </div>
  );
}
