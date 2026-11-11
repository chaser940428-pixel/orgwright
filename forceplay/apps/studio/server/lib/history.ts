import * as fs from 'fs';
import * as path from 'path';
import { HISTORY_DIR, safeName } from './paths';

/** Run history per test case, one JSON line per run in .kplay/history/<id>.jsonl */

export interface RunRecord {
  at: string;
  status: 'passed' | 'failed' | 'interrupted';
  durationMs?: number;
  source: 'studio' | 'batch' | 'nightly' | 'matrix';
  failedStep?: number;
  error?: string;
  persona?: string;
  rows?: { passed: number; total: number };
}

export interface HistorySummary {
  recent: Array<Pick<RunRecord, 'at' | 'status' | 'source'>>;
  runs: number;
  passRate: number | null;
  flaky: boolean;
  lastFailure?: Pick<RunRecord, 'at' | 'failedStep' | 'error'>;
}

function historyFile(testId: string): string {
  return path.join(HISTORY_DIR, `${safeName(testId)}.jsonl`);
}

export function appendHistory(testId: string, record: RunRecord): void {
  try {
    fs.appendFileSync(historyFile(testId), JSON.stringify(record) + '\n', 'utf-8');
  } catch (err) {
    console.error('[history] write failed', err);
  }
}

export function readHistory(testId: string, limit = 50): RunRecord[] {
  try {
    const lines = fs.readFileSync(historyFile(testId), 'utf-8').split('\n').filter(Boolean);
    return lines
      .slice(-limit)
      .map((l) => {
        try {
          return JSON.parse(l) as RunRecord;
        } catch {
          return null;
        }
      })
      .filter((r): r is RunRecord => Boolean(r));
  } catch {
    return [];
  }
}

/**
 * A test is flagged flaky when, within its last 10 completed runs, it both passed and failed
 * and its result changed at least twice (pass→fail→pass or similar) — i.e. not one clean break.
 */
export function summarizeHistory(testId: string): HistorySummary {
  const runs = readHistory(testId, 50).filter((r) => r.status === 'passed' || r.status === 'failed');
  const last10 = runs.slice(-10);
  let flips = 0;
  for (let i = 1; i < last10.length; i++) if (last10[i].status !== last10[i - 1].status) flips++;
  const passes = last10.filter((r) => r.status === 'passed').length;
  const lastFail = [...runs].reverse().find((r) => r.status === 'failed');
  return {
    recent: last10.map((r) => ({ at: r.at, status: r.status, source: r.source })),
    runs: runs.length,
    passRate: last10.length ? Math.round((passes / last10.length) * 100) : null,
    flaky: passes > 0 && passes < last10.length && flips >= 2,
    lastFailure: lastFail ? { at: lastFail.at, failedStep: lastFail.failedStep, error: lastFail.error } : undefined
  };
}
