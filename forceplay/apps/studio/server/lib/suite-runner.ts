import * as fs from 'fs';
import * as path from 'path';
import { executePlaywrightTest } from '@kplay/runner';
import { DEFINITIONS_DIR, GENERATED_DIR, KPLAY_DIR, ROOT_DIR, isValidTestId } from './paths';
import { buildSpec, clearTelemetry, readRunOutcome } from './spec-builder';
import { appendHistory, RunRecord } from './history';

export interface SuiteRunOptions {
  testIds?: string[];
  tag?: string;
  headed?: boolean;
  browser?: string;
  alias?: string;
  source: RunRecord['source'];
  onLog?: (line: string) => void;
}

export interface SuiteTestResult {
  id: string;
  testName: string;
  status: 'passed' | 'failed' | 'unknown';
  failedStep?: number;
  error?: string;
  rows?: { passed: number; total: number };
}

export interface SuiteRunSummary {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  tag?: string;
  total: number;
  passed: number;
  failed: number;
  unknown: number;
  results: SuiteTestResult[];
}

export function readDefinitions(): any[] {
  if (!fs.existsSync(DEFINITIONS_DIR)) return [];
  return fs
    .readdirSync(DEFINITIONS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(DEFINITIONS_DIR, f), 'utf-8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function hasTag(def: any, tag: string): boolean {
  const tags: string[] = Array.isArray(def.tags) ? def.tags : [];
  return tags.some((t) => t.toLowerCase() === tag.toLowerCase());
}

/**
 * Writes an up-to-date spec for a definition. Specs are regenerated from the steps so
 * batch runs pick up parser/codegen fixes — unless the code was edited by hand in the Studio.
 */
export function prepareSpec(def: any, alias: string): string | undefined {
  const specRel = `tests/generated/${def.id}.spec.ts`;
  const specPath = path.join(GENERATED_DIR, `${def.id}.spec.ts`);
  if (def.codeEdited && def.specCode) {
    fs.writeFileSync(specPath, def.specCode, 'utf-8');
  } else if (def.steps && String(def.steps).trim()) {
    const built = buildSpec({ ...def, steps: def.steps, dataRows: def.dataRows }, alias);
    fs.writeFileSync(specPath, built.specCode, 'utf-8');
  }
  return fs.existsSync(specPath) ? specRel : undefined;
}

/** Runs a set of tests in one Playwright process and records a per-test outcome in history. */
export async function runSuite(options: SuiteRunOptions): Promise<SuiteRunSummary> {
  const alias = options.alias || process.env.SF_ORG_ALIAS || 'sandboxOrg';
  const all = readDefinitions();
  let defs = all;
  if (options.testIds?.length) defs = all.filter((d) => options.testIds!.includes(d.id));
  if (options.tag) defs = defs.filter((d) => hasTag(d, options.tag!));
  defs = defs.filter((d) => isValidTestId(d.id));

  const startedAt = new Date().toISOString();
  const specFiles: string[] = [];
  for (const def of defs) {
    clearTelemetry(def.id);
    const rel = prepareSpec(def, alias);
    if (rel) specFiles.push(rel);
  }
  if (specFiles.length === 0) {
    return { startedAt, finishedAt: startedAt, durationMs: 0, tag: options.tag, total: 0, passed: 0, failed: 0, unknown: 0, results: [] };
  }

  const report = await executePlaywrightTest({
    specFiles,
    cwd: ROOT_DIR,
    headed: options.headed !== false,
    browserChannel: options.browser || 'chrome',
    project: 'salesforce',
    ticketNumber: 'BATCH',
    testId: `SUITE_${Date.now()}`,
    testName: options.tag ? `${options.tag} suite` : 'Regression suite',
    onLog: options.onLog
  });

  const results: SuiteTestResult[] = [];
  for (const def of defs) {
    const outcome = readRunOutcome(def.id);
    // No telemetry (old hand-edited spec): fall back to the overall run result
    const status = outcome.status === 'unknown' ? (report.status === 'passed' ? 'passed' : 'unknown') : outcome.status;
    results.push({ id: def.id, testName: def.testName || def.id, status, failedStep: outcome.failedStep, error: outcome.error, rows: outcome.rows ? { passed: outcome.rows.passed, total: outcome.rows.total } : undefined });
    if (status !== 'unknown') {
      appendHistory(def.id, {
        at: new Date().toISOString(),
        status,
        source: options.source,
        failedStep: outcome.failedStep,
        error: outcome.error,
        rows: outcome.rows ? { passed: outcome.rows.passed, total: outcome.rows.total } : undefined
      });
    }
    try {
      const defPath = path.join(DEFINITIONS_DIR, `${def.id}.json`);
      const current = JSON.parse(fs.readFileSync(defPath, 'utf-8'));
      current.lastStatus = status === 'unknown' ? 'failed' : status;
      current.lastRunAt = new Date().toISOString();
      fs.writeFileSync(defPath, JSON.stringify(current, null, 2), 'utf-8');
    } catch {}
  }

  const finishedAt = new Date().toISOString();
  return {
    startedAt,
    finishedAt,
    durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
    tag: options.tag,
    total: results.length,
    passed: results.filter((r) => r.status === 'passed').length,
    failed: results.filter((r) => r.status === 'failed').length,
    unknown: results.filter((r) => r.status === 'unknown').length,
    results
  };
}

// ------------------------------------------------------------------------------------------
// Nightly configuration (used by the CLI and the Studio "Nightly run" settings)
// ------------------------------------------------------------------------------------------

export interface NightlyConfig {
  tag: string;
  time: string; // HH:mm, local time of the Windows machine
  browser: string;
  alias: string;
  teamsWebhook?: string;
}

const NIGHTLY_FILE = path.join(KPLAY_DIR, 'nightly.json');
const NIGHTLY_LAST = path.join(KPLAY_DIR, 'nightly-last.json');

export function readNightlyConfig(): NightlyConfig {
  try {
    return { tag: 'Regression', time: '02:00', browser: 'chrome', alias: 'sandboxOrg', ...JSON.parse(fs.readFileSync(NIGHTLY_FILE, 'utf-8')) };
  } catch {
    return { tag: 'Regression', time: '02:00', browser: 'chrome', alias: 'sandboxOrg' };
  }
}

export function saveNightlyConfig(cfg: NightlyConfig): void {
  fs.writeFileSync(NIGHTLY_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
}

export function readLastNightly(): SuiteRunSummary | null {
  try {
    return JSON.parse(fs.readFileSync(NIGHTLY_LAST, 'utf-8'));
  } catch {
    return null;
  }
}

export function saveLastNightly(summary: SuiteRunSummary): void {
  fs.writeFileSync(NIGHTLY_LAST, JSON.stringify(summary, null, 2), 'utf-8');
}

export function summaryText(summary: SuiteRunSummary): string {
  const head = `KPlay nightly${summary.tag ? ` (${summary.tag})` : ''}: ${summary.passed}/${summary.total} passed` +
    (summary.failed ? `, ${summary.failed} failed` : '') + (summary.unknown ? `, ${summary.unknown} no result` : '');
  const failures = summary.results
    .filter((r) => r.status !== 'passed')
    .map((r) => `- ${r.id} ${r.testName}: ${r.status}${r.failedStep ? ` at step ${r.failedStep}` : ''}${r.error ? ` — ${r.error.split('\n')[0].slice(0, 200)}` : ''}`);
  return [head, ...failures].join('\n');
}

/** Posts the summary to a Microsoft Teams incoming webhook (best effort). */
export async function postToTeams(webhook: string, summary: SuiteRunSummary): Promise<void> {
  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: summaryText(summary).replace(/\n/g, '  \n') })
    });
    if (!res.ok) console.warn(`[nightly] Teams webhook returned ${res.status}`);
  } catch (err: any) {
    console.warn(`[nightly] Could not post to Teams: ${err.message}`);
  }
}
