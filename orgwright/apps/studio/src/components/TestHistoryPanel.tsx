import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { HistorySummary } from './SuitePanel';
import { timeAgo } from './SuitePanel';

interface RunRecord {
  at: string;
  status: 'passed' | 'failed' | 'interrupted';
  durationMs?: number;
  source: 'studio' | 'batch' | 'nightly' | 'matrix';
  failedStep?: number;
  error?: string;
  persona?: string;
  rows?: { passed: number; total: number };
}

const SOURCE_LABEL: Record<string, string> = { studio: 'Studio', batch: 'Suite run', nightly: 'Nightly', matrix: 'Run as users' };

/** Run history of one test (GET /api/history/:id, newest first). */
export function TestHistoryPanel({ testId, onEditStep }: { testId: string; onEditStep?: (step: number) => void }) {
  const [records, setRecords] = useState<RunRecord[] | null>(null);
  const [summary, setSummary] = useState<HistorySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!testId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/history/${encodeURIComponent(testId)}`);
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || `HTTP ${res.status}`);
      setRecords(d.records || []);
      setSummary(d.summary || null);
    } catch (e: any) {
      setError(e?.message || 'Could not load the run history');
    } finally {
      setLoading(false);
    }
  }, [testId]);

  useEffect(() => {
    setRecords(null);
    load();
  }, [load]);

  if (!testId) return <div className="py-10 text-center text-sm text-muted">Save the test to start keeping its run history.</div>;

  return (
    <div className="space-y-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold text-slate-900">
          Run history · <span className="font-mono">{testId}</span>
        </h2>
        {summary && summary.runs > 0 && (
          <span className="text-muted">
            {summary.passRate}% pass over the last {Math.min(summary.runs, 10)} runs · {summary.runs} runs kept
          </span>
        )}
        {summary?.flaky && (
          <span className="inline-flex items-center gap-1 font-medium text-warning">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Flaky: passed and failed in recent runs
          </span>
        )}
        <button type="button" onClick={load} disabled={loading} className="ml-auto inline-flex h-7 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-xs hover:bg-slate-50 cursor-pointer disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" /> Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-danger-soft px-3 py-2 text-danger" role="alert">
          {error}
        </div>
      )}

      {records && records.length === 0 && !error && (
        <div className="rounded-md border border-dashed border-slate-300 py-10 text-center text-muted">No runs recorded for this test yet. Run it once and the result appears here.</div>
      )}

      {records && records.length > 0 && (
        <div className="overflow-auto rounded-md border border-border bg-white">
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 bg-white text-xs text-muted shadow-[0_1px_0_rgb(var(--border))]">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-2 py-2 font-medium">Result</th>
                <th className="px-2 py-2 font-medium">Duration</th>
                <th className="px-2 py-2 font-medium">Source</th>
                <th className="px-2 py-2 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={`${r.at}-${i}`} className="border-b border-slate-100 align-top">
                  <td className="px-3 py-1.5 whitespace-nowrap" title={new Date(r.at).toLocaleString()}>
                    {timeAgo(r.at)}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <span className={r.status === 'passed' ? 'font-medium text-success' : r.status === 'failed' ? 'font-medium text-danger' : 'text-warning'}>
                      {r.status === 'passed' ? '✓ Passed' : r.status === 'failed' ? '✗ Failed' : '■ Stopped'}
                    </span>
                    {r.failedStep ? (
                      onEditStep ? (
                        <button type="button" onClick={() => onEditStep(r.failedStep!)} className="ml-1 text-primary hover:underline cursor-pointer">
                          at step {r.failedStep}
                        </button>
                      ) : (
                        <span className="ml-1">at step {r.failedStep}</span>
                      )
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5 text-muted whitespace-nowrap">{r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : '—'}</td>
                  <td className="px-2 py-1.5 text-muted whitespace-nowrap">
                    {SOURCE_LABEL[r.source] || r.source}
                    {r.persona ? ` · ${r.persona}` : ''}
                  </td>
                  <td className="px-2 py-1.5 text-slate-700">
                    {r.rows ? <span className="mr-2">{r.rows.passed}/{r.rows.total} data rows passed</span> : null}
                    {r.error ? <span className="text-muted">{r.error.split('\n')[0].slice(0, 200)}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
