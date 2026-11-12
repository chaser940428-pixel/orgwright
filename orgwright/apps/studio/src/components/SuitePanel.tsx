import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Download,
  FileCheck,
  FileSpreadsheet,
  Moon,
  Play,
  PlusCircle,
  RefreshCw,
  Search,
  Square,
  Trash2,
  UploadCloud,
  X
} from 'lucide-react';
import { MenuDropdown } from './ui/Menu';
import { Modal, btn } from './ui/Modal';

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
  /** Soft delete (the caller offers Undo) */
  onDelete: (ids: string[]) => void;
  onDownloadProof: (id: string) => void;
  onImportExcel: () => void;
  /** Export all tests, or only the given ids */
  onExportExcel: (ids?: string[]) => void;
  onDownloadTemplate: () => void;
  onOpenStandardTests: () => void;
  onOpenNightly: () => void;
}

const PRIORITY_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
/** Runs above this many tests ask first */
const CONFIRM_RUN_OVER = 5;

type SortKey = 'name' | 'object' | 'priority' | 'last';

function scenarioOf(tc: SuiteTestCase): 'positive' | 'negative' {
  if (tc.scenarioType) return tc.scenarioType;
  const n = (tc.testName || '').toLowerCase();
  return n.includes('negative') || n.includes('validation') || n.includes('read-only') ? 'negative' : 'positive';
}

/** "2h ago", "3d ago" */
export function timeAgo(iso?: string): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '';
  const m = Math.round(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString();
}

function lastRun(tc: SuiteTestCase) {
  const recent = tc.history?.recent || [];
  return recent.length ? recent[recent.length - 1] : undefined;
}

function LastResult({ tc }: { tc: SuiteTestCase }) {
  const last = lastRun(tc);
  const h = tc.history;
  if (!last) return <span className="text-slate-400">Not run yet</span>;
  const failedStep = last.status === 'failed' && h?.lastFailure?.at === last.at ? h.lastFailure.failedStep : undefined;
  return (
    <div className="leading-snug">
      <div className={last.status === 'passed' ? 'text-success font-medium' : 'text-danger font-medium'}>
        {last.status === 'passed' ? 'Passed' : last.status === 'failed' ? (failedStep ? `Failed at step ${failedStep}` : 'Failed') : 'Stopped'}
        <span className="font-normal text-muted"> · {timeAgo(last.at)}</span>
      </div>
      <div className="text-xs text-muted flex items-center gap-1.5">
        {h?.passRate !== null && h?.passRate !== undefined && (
          <span title={`Pass rate over the last ${Math.min(h.runs, 10)} runs`}>
            {h.passRate}% pass · {Math.min(h.runs, 10)} runs
          </span>
        )}
        {h?.flaky && (
          <span className="inline-flex items-center gap-0.5 text-warning font-medium" title="Passed and failed in recent runs without code changes in between — investigate timing or data">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            Flaky
          </span>
        )}
      </div>
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
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'priority', dir: 1 });
  const [confirmRun, setConfirmRun] = useState<{ ids: string[]; tag?: string; label: string } | null>(null);

  const projects = useMemo(() => [...new Set(testCases.map((t) => t.project || 'Sales Cloud'))].filter(Boolean).sort(), [testCases]);
  const tags = useMemo(() => {
    const m = new Map<string, number>();
    testCases.forEach((t) => (t.tags || []).forEach((tag) => m.set(tag, (m.get(tag) || 0) + 1)));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [testCases]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cmp = (a: SuiteTestCase, b: SuiteTestCase): number => {
      switch (sort.key) {
        case 'name':
          return (a.testName || a.id).localeCompare(b.testName || b.id);
        case 'object':
          return (a.objectName || '').localeCompare(b.objectName || '');
        case 'last': {
          // Failed first, then by most recent
          const la = lastRun(a);
          const lb = lastRun(b);
          const rank = (r?: { status: string }) => (!r ? 2 : r.status === 'passed' ? 1 : 0);
          return rank(la) - rank(lb) || (lb?.at || '').localeCompare(la?.at || '');
        }
        default:
          return (PRIORITY_ORDER[a.priority || 'Medium'] ?? 1) - (PRIORITY_ORDER[b.priority || 'Medium'] ?? 1);
      }
    };
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
      .sort((a, b) => cmp(a, b) * sort.dir);
  }, [testCases, projectFilter, scenarioFilter, tagFilter, onlyFlaky, search, sort]);

  const allSelected = filtered.length > 0 && filtered.every((tc) => selectedTestIds.includes(tc.id));
  const toggleAll = () => {
    if (allSelected) setSelectedTestIds(selectedTestIds.filter((id) => !filtered.some((tc) => tc.id === id)));
    else setSelectedTestIds([...new Set([...selectedTestIds, ...filtered.map((tc) => tc.id)])]);
  };
  const toggleOne = (id: string) =>
    setSelectedTestIds(selectedTestIds.includes(id) ? selectedTestIds.filter((x) => x !== id) : [...selectedTestIds, id]);

  /** Every run is scoped and labelled; more than CONFIRM_RUN_OVER tests asks first */
  const requestRun = (ids: string[], label: string, tag?: string) => {
    if (ids.length === 0) return;
    if (ids.length > CONFIRM_RUN_OVER) setConfirmRun({ ids, tag, label });
    else props.onRunTests(ids, tag);
  };

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  const sortHeader = (k: SortKey, text: string) => (
    <th className="px-2 py-2 font-medium" aria-sort={sort.key === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer">
        {text}
        {sort.key === k && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" aria-hidden="true" /> : <ArrowDown className="h-3 w-3" aria-hidden="true" />)}
      </button>
    </th>
  );

  const flakyCount = testCases.filter((t) => t.history?.flaky).length;
  const select = 'h-8 rounded-md border border-slate-300 bg-white px-2 text-[13px] text-slate-800 focus:outline-none focus:border-primary';
  const selCount = selectedTestIds.length;
  const visibleIds = filtered.map((t) => t.id);
  const filtersActive = Boolean(search || scenarioFilter !== 'all' || tagFilter !== 'all' || onlyFlaky || projectFilter !== 'all');

  return (
    <div className="flex-1 flex flex-col gap-3 text-[13px] min-h-0">
      {lastSuiteSummary && (
        <div className={`rounded-md border px-3 py-2 ${lastSuiteSummary.failed || lastSuiteSummary.unknown ? 'border-rose-200 bg-danger-soft' : 'border-emerald-200 bg-success-soft'}`}>
          <div className="flex items-center justify-between">
            <strong className="text-slate-900">
              {lastSuiteSummary.tag ? `${lastSuiteSummary.tag} suite` : 'Suite run'}: {lastSuiteSummary.passed} of {lastSuiteSummary.total} passed
            </strong>
            <button type="button" onClick={props.onDismissSummary} className="text-muted hover:text-slate-800 cursor-pointer" aria-label="Dismiss suite summary">
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
                    {r.error && <span className="text-muted">: {r.error.split('\n')[0].slice(0, 160)}</span>}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      {/* Toolbar: filters on the left, three grouped menus on the right */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2 top-2.5" aria-hidden="true" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tests, tags, owners"
            aria-label="Search tests"
            className="h-8 w-56 rounded-md border border-slate-300 bg-white pl-7 pr-2 text-[13px] focus:outline-none focus:border-primary"
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
          <MenuDropdown
            label="Add tests"
            icon={<PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />}
            items={[
              { label: 'Standard tests…', icon: <BookOpen className="h-3.5 w-3.5" />, onSelect: props.onOpenStandardTests },
              { label: 'Import from Excel…', icon: <UploadCloud className="h-3.5 w-3.5" />, onSelect: props.onImportExcel },
              { label: 'Download import template', icon: <Download className="h-3.5 w-3.5" />, onSelect: props.onDownloadTemplate }
            ]}
          />
          <MenuDropdown
            label="Export"
            icon={<FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />}
            items={[
              { label: `Export all (${testCases.length})`, onSelect: () => props.onExportExcel() },
              { label: `Export selected (${selCount})`, disabled: selCount === 0, onSelect: () => props.onExportExcel(selectedTestIds) },
              { label: `Export shown (${filtered.length})`, disabled: !filtersActive || filtered.length === 0, onSelect: () => props.onExportExcel(visibleIds) }
            ]}
          />
          {isRunning && isBatchRunning ? (
            <button type="button" onClick={props.onStop} disabled={isStopping} className="h-8 inline-flex items-center gap-1.5 rounded-md bg-danger px-3 text-[13px] font-medium text-white hover:bg-danger-hover disabled:opacity-50 cursor-pointer">
              {isStopping ? <RefreshCw className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" /> : <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />}
              {isStopping ? 'Stopping…' : 'Stop run'}
            </button>
          ) : (
            <MenuDropdown
              primary
              align="right"
              disabled={isRunning}
              label={selCount ? `Run ${selCount} selected` : 'Run'}
              icon={<Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />}
              items={[
                { label: `Run ${selCount} selected`, disabled: selCount === 0, onSelect: () => requestRun(selectedTestIds, `${selCount} selected tests`) },
                ...(tagFilter !== 'all'
                  ? [{ label: `Run “${tagFilter}” (${filtered.length})`, disabled: filtered.length === 0, onSelect: () => requestRun(visibleIds, `the “${tagFilter}” suite`, tagFilter) }]
                  : []),
                ...(filtersActive && tagFilter === 'all'
                  ? [{ label: `Run ${filtered.length} shown`, disabled: filtered.length === 0, onSelect: () => requestRun(visibleIds, `${filtered.length} shown tests`) }]
                  : []),
                { label: projectFilter === 'all' ? 'Run project…' : `Run project “${projectFilter}”`, onSelect: props.onRunProject },
                'divider',
                { label: 'Schedule nightly…', icon: <Moon className="h-3.5 w-3.5" />, onSelect: props.onOpenNightly }
              ]}
            />
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {selCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-blue-200 bg-primary-soft px-3 py-1.5" role="region" aria-label="Bulk actions">
          <strong className="text-slate-900">{selCount} selected</strong>
          <button type="button" className={btn.secondary + ' !h-7'} disabled={isRunning} onClick={() => requestRun(selectedTestIds, `${selCount} selected tests`)}>
            <Play className="h-3.5 w-3.5" aria-hidden="true" /> Run {selCount} selected
          </button>
          <button type="button" className={btn.secondary + ' !h-7'} onClick={() => props.onExportExcel(selectedTestIds)}>
            <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" /> Export
          </button>
          <button type="button" className={btn.secondary + ' !h-7 !text-danger'} disabled={isRunning} onClick={() => props.onDelete(selectedTestIds)}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete {selCount}
          </button>
          <button type="button" className={btn.ghost + ' !h-7 ml-auto'} onClick={() => setSelectedTestIds([])}>
            Clear selection
          </button>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-auto rounded-md border border-border bg-white">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_rgb(var(--border))]">
            <tr className="text-xs text-muted">
              <th className="w-9 px-3 py-2">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all shown tests" />
              </th>
              {sortHeader('name', 'Test')}
              {sortHeader('object', 'Object')}
              {sortHeader('priority', 'Priority')}
              {sortHeader('last', 'Last result')}
              <th className="px-2 py-2 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-muted">
                  {testCases.length === 0 ? (
                    'No tests yet. Create or import a test case to get started.'
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      No tests match these filters.
                      <button
                        type="button"
                        onClick={() => {
                          setSearch('');
                          setScenarioFilter('all');
                          setTagFilter('all');
                          setOnlyFlaky(false);
                          setProjectFilter('all');
                        }}
                        className="px-2 py-0.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer"
                      >
                        Clear filters
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            )}
            {filtered.map((tc) => {
              const selected = selectedTestIds.includes(tc.id);
              const current = tc.id === currentTestId;
              return (
                <tr key={tc.id} className={`border-b border-slate-100 ${current ? 'bg-primary-soft/60' : selected ? 'bg-slate-50' : 'hover:bg-slate-50'}`}>
                  <td className="px-3 py-2 align-top">
                    <input type="checkbox" checked={selected} onChange={() => toggleOne(tc.id)} aria-label={`Select ${tc.testName || tc.id}`} />
                  </td>
                  <td className="px-2 py-2 align-top">
                    {/* Only the name opens the test (through the unsaved-changes guard) */}
                    <button
                      type="button"
                      onClick={() => props.onLoad(tc)}
                      className="text-left text-slate-900 font-medium leading-snug hover:text-primary hover:underline cursor-pointer"
                      aria-current={current ? 'true' : undefined}
                    >
                      {tc.testName || tc.id}
                    </button>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                      <span className="font-mono">{tc.id}</span>
                      {tc.ticketNumber && <span className="font-mono">{tc.ticketNumber}</span>}
                      <span>{tc.stepCount} steps</span>
                      {tc.dataRowCount ? <span>{tc.dataRowCount} data rows</span> : null}
                      {scenarioOf(tc) === 'negative' && <span className="text-danger">negative</span>}
                      {tc.owner && <span>· {tc.owner}</span>}
                      {(tc.tags || []).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setTagFilter(t)}
                          className="rounded bg-slate-100 px-1.5 text-slate-600 hover:bg-slate-200 cursor-pointer"
                          aria-label={`Filter by tag ${t}`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="px-2 py-2 align-top text-slate-700">{(tc.objectName || '').replace(/__c$/, '')}</td>
                  <td className="px-2 py-2 align-top">
                    <span className={tc.priority === 'High' ? 'text-danger font-medium' : tc.priority === 'Low' ? 'text-muted' : 'text-slate-700'}>
                      {tc.priority || 'Medium'}
                    </span>
                  </td>
                  <td className="px-2 py-2 align-top">
                    <LastResult tc={tc} />
                  </td>
                  <td className="px-2 py-2 align-top">
                    <div className="flex items-center justify-end gap-0.5 text-muted">
                      <button type="button" onClick={() => props.onRunTests([tc.id])} disabled={isRunning} className="p-1.5 rounded hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 cursor-pointer" aria-label={`Run ${tc.testName || tc.id}`} title="Run this test">
                        <Play className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => props.onDownloadProof(tc.id)}
                        disabled={tc.lastStatus !== 'passed' && tc.lastStatus !== 'failed'}
                        className="p-1.5 rounded hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        aria-label={`Download Jira proof for ${tc.id}`}
                        title={tc.lastStatus === 'passed' || tc.lastStatus === 'failed' ? 'Download Jira proof (.docx)' : 'Run this test first: no stored result to prove'}
                      >
                        <FileCheck className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => props.onDelete([tc.id])} className="p-1.5 rounded hover:bg-danger-soft hover:text-danger cursor-pointer" aria-label={`Delete ${tc.testName || tc.id}`} title="Delete (you can undo)">
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
      <div className="flex items-center gap-4 text-xs text-muted">
        <span>{testCases.length} tests</span>
        {filtered.length !== testCases.length && <span>{filtered.length} shown</span>}
        <span>{testCases.filter((t) => t.lastStatus === 'passed').length} passed last run</span>
        <span>{testCases.filter((t) => t.lastStatus === 'failed').length} failed last run</span>
      </div>

      <Modal
        open={!!confirmRun}
        onClose={() => setConfirmRun(null)}
        title={confirmRun ? `Run ${confirmRun.ids.length} tests?` : ''}
        size="sm"
        footer={
          <>
            <button type="button" className={btn.secondary} onClick={() => setConfirmRun(null)}>
              Cancel
            </button>
            <button
              type="button"
              className={btn.primary}
              onClick={() => {
                if (confirmRun) props.onRunTests(confirmRun.ids, confirmRun.tag);
                setConfirmRun(null);
              }}
            >
              Run {confirmRun?.ids.length} tests
            </button>
          </>
        }
      >
        This runs {confirmRun?.label} one after another against the connected org. It can take a while and may create records in the org.
      </Modal>
    </div>
  );
}
