import * as fs from 'fs';
import * as path from 'path';
import type { TestStep } from '@orgwright/core';
import { generatePlaywrightSpec } from '@orgwright/codegen';
import { expandBlocks } from './blocks';
import { resolveWithCatalog } from './catalog';
import { RESULTS_DIR, safeName } from './paths';

export interface SpecInput {
  id: string;
  ticketNumber?: string;
  testName?: string;
  project?: string;
  objectName?: string;
  steps: string | string[];
  dataRows?: Array<Record<string, string>>;
}

export interface BuiltSpec {
  specCode: string;
  resolvedSteps: TestStep[];
  /** Steps after "Use block" expansion and renumbering — what the spec actually runs */
  expandedLines: string[];
  blockErrors: string[];
}

export function toLines(steps: string | string[]): string[] {
  const list = Array.isArray(steps) ? steps : String(steps || '').split('\n');
  return list.map((s) => String(s).trim()).filter((s) => s.length > 0 && !/^(?:step\s+)?\d+[.:)\-]?$/i.test(s));
}

/** Single place that turns a test definition into a Playwright spec (Studio, batch and nightly runs). */
export function buildSpec(input: SpecInput, alias = 'sandboxOrg'): BuiltSpec {
  const { lines, errors } = expandBlocks(toLines(input.steps));
  const { steps } = resolveWithCatalog(alias, lines, input.objectName);
  const id = input.id || 'TC_CUSTOM';
  const ticket = input.ticketNumber || '';
  const name = input.testName || 'Automated Salesforce Workflow';
  const project = input.project || 'Salesforce Regression';
  const specCode = generatePlaywrightSpec(
    {
      id,
      ticketNumber: ticket,
      name,
      projectName: project,
      targetOrg: alias,
      persona: 'admin',
      tags: [],
      steps,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      suiteName: `${project} - ${ticket || id}`,
      testName: name,
      ticketNumber: ticket,
      basePageImportPath: '../../pages/BasePage',
      encounterNotesPageImportPath: '../../pages/EncounterNotesPage',
      lightningHelpersImportPath: '../../utils/lightning-helpers',
      streamHelperImportPath: '../../utils/stream-helper',
      dataRows: input.dataRows
    }
  );
  return { specCode, resolvedSteps: steps, expandedLines: lines, blockErrors: errors };
}

export interface RunOutcome {
  status: 'passed' | 'failed' | 'unknown';
  failedStep?: number;
  error?: string;
  /** Telemetry file the per-step results were built from */
  telemetryId?: string;
  telemetry: any[];
  rows?: { passed: number; total: number; results: Array<{ row: number; status: 'passed' | 'failed'; error?: string }> };
}

function readTelemetry(telemetryId: string): any[] | undefined {
  const file = path.join(RESULTS_DIR, `${safeName(telemetryId)}-telemetry.json`);
  if (!fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return undefined;
  }
}

/**
 * Per-test outcome from the telemetry written by StreamHelper. Data-driven tests write one
 * file per row (<id>__rowN); the report uses the first failing row, otherwise row 1.
 */
export function readRunOutcome(testId: string): RunOutcome {
  const rowFiles = fs.existsSync(RESULTS_DIR)
    ? fs.readdirSync(RESULTS_DIR).filter((f) => f.startsWith(`${safeName(testId)}__row`) && f.endsWith('-telemetry.json'))
    : [];
  if (rowFiles.length > 0) {
    const results = rowFiles
      .map((f) => {
        const row = parseInt(f.slice(`${safeName(testId)}__row`.length), 10);
        const tele = readTelemetry(`${testId}__row${row}`) || [];
        const failed = tele.find((t) => t.status === 'failed');
        return { row, tele, status: (failed ? 'failed' : 'passed') as 'passed' | 'failed', error: failed?.error as string | undefined, failedStep: failed?.stepIndex as number | undefined };
      })
      .sort((a, b) => a.row - b.row);
    const firstFail = results.find((r) => r.status === 'failed');
    const pick = firstFail || results[0];
    return {
      status: firstFail ? 'failed' : 'passed',
      failedStep: firstFail?.failedStep,
      error: firstFail ? `Row ${firstFail.row}: ${firstFail.error || 'failed'}` : undefined,
      telemetryId: `${testId}__row${pick.row}`,
      telemetry: pick.tele,
      rows: {
        passed: results.filter((r) => r.status === 'passed').length,
        total: results.length,
        results: results.map((r) => ({ row: r.row, status: r.status, error: r.error }))
      }
    };
  }
  const tele = readTelemetry(testId);
  if (!tele) return { status: 'unknown', telemetry: [] };
  const failed = tele.find((t) => t.status === 'failed');
  return {
    status: failed ? 'failed' : 'passed',
    failedStep: failed?.stepIndex,
    error: failed?.error,
    telemetryId: testId,
    telemetry: tele
  };
}

/** Removes stale telemetry before a run so outcomes never come from a previous run. */
export function clearTelemetry(testId: string): void {
  if (!fs.existsSync(RESULTS_DIR)) return;
  for (const f of fs.readdirSync(RESULTS_DIR)) {
    if ((f === `${safeName(testId)}-telemetry.json`) || (f.startsWith(`${safeName(testId)}__row`) && f.endsWith('-telemetry.json'))) {
      try {
        fs.unlinkSync(path.join(RESULTS_DIR, f));
      } catch {}
    }
  }
}
