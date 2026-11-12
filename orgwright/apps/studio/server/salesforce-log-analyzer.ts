import { runSfSync, assertAlias, assertLogId } from './lib/validators';
import * as fs from 'fs';
import * as path from 'path';

export interface SalesforceTriggerEvent {
  name: string;
  sObject: string;
  events: string;
  durationMs?: number;
  status: 'Success' | 'Failed';
}

export interface SalesforceFlowEvent {
  flowName: string;
  interviewId?: string;
  status: 'Started' | 'Completed' | 'Faulted';
  elementsTraversed?: string[];
}

export interface SalesforceValidationEvent {
  ruleName: string;
  result: 'PASSED' | 'FAILED';
  errorMessage?: string;
}

export interface SalesforceDmlEvent {
  operation: 'Insert' | 'Update' | 'Delete' | 'Undelete';
  sObject: string;
  rowCount: number;
}

export interface SalesforceCalloutEvent {
  endpoint: string;
  method: string;
  statusCode?: number;
}

export interface SalesforceLimitSummary {
  soqlQueries: string; // e.g. "8/100"
  dmlStatements: string; // e.g. "2/150"
  cpuTimeMs: number; // e.g. 142
  heapSizeBytes?: number;
}

export interface ParsedApexLog {
  logId: string;
  startTime: string;
  durationMs: number;
  status: string;
  operation: string;
  logUser: string;
  triggers: SalesforceTriggerEvent[];
  flows: SalesforceFlowEvent[];
  validations: SalesforceValidationEvent[];
  dml: SalesforceDmlEvent[];
  callouts: SalesforceCalloutEvent[];
  exceptions: Array<{ type: string; message: string }>;
  limits?: SalesforceLimitSummary;
  rawLogPreview: string[];
}

export interface StepBackendActivity {
  stepIndex: number;
  stepText: string;
  actionType: 'click' | 'fill' | 'navigate' | 'wait' | 'assert' | 'auth';
  elementTarget?: string;
  valueTyped?: string;
  status: 'passed' | 'failed' | 'skipped';
  durationMs: number;
  error?: string;
  /** Plain-language explanation for testers (failed step only) */
  explanation?: string;
  /** Suggested next action for testers (failed step only) */
  recommendation?: string;
  /** Screenshot taken when the step finished, served by /api/test-results/step-screenshot */
  screenshotUrl?: string;
  auraActions: Array<{ name: string; status: number; durationMs?: number }>;
  triggersFired: SalesforceTriggerEvent[];
  flowsExecuted: SalesforceFlowEvent[];
  validationsEvaluated: SalesforceValidationEvent[];
  dmlOperations: SalesforceDmlEvent[];
  calloutsMade: SalesforceCalloutEvent[];
  limitsConsumed?: SalesforceLimitSummary;
}

export interface FullExecutionLogReport {
  testId: string;
  status: 'passed' | 'failed';
  totalDurationMs: number;
  startedAt: string;
  finishedAt: string;
  steps: StepBackendActivity[];
  salesforceLogs: ParsedApexLog[];
  backendAutomationSummary: {
    totalTriggersFired: number;
    totalFlowsExecuted: number;
    totalValidationsChecked: number;
    totalDmlRecords: number;
    hasBackendExceptions: boolean;
  };
}

/**
 * Fetches recent ApexLog records from Salesforce via CLI Tooling Query
 */
export function fetchRecentSalesforceLogs(
  targetOrg = 'sandboxOrg',
  sinceIso?: string,
  limit = 5
): ParsedApexLog[] {
  try {
    assertAlias(targetOrg, 'targetOrg');
    limit = Math.max(1, Math.min(50, Math.floor(Number(limit)) || 5));
    let query = `SELECT Id, LogUserId, LogUser.Name, Operation, Request, Status, StartTime, DurationMilliseconds, LogLength FROM ApexLog`;
    if (sinceIso) {
      // Format to Salesforce SOQL timestamp: YYYY-MM-DDTHH:MM:SSZ
      const cleanIso = new Date(sinceIso).toISOString();
      query += ` WHERE StartTime >= ${cleanIso}`;
    }
    query += ` ORDER BY StartTime DESC LIMIT ${limit}`;

    console.log(`[SalesforceLogAnalyzer] Querying ApexLog in ${targetOrg}: ${query}`);
    const raw = runSfSync(['data', 'query', '-o', targetOrg, '-q', query, '--json'], {
      timeout: 25000,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const parsed = JSON.parse(raw);
    const records = parsed.result?.records || [];
    const results: ParsedApexLog[] = [];

    for (const rec of records) {
      try {
        const logId = rec.Id;
        const logContent = getApexLogBody(logId, targetOrg);
        const parsedLog = parseApexLogText(logId, rec, logContent);
        results.push(parsedLog);
      } catch (err) {
        console.warn(`[SalesforceLogAnalyzer] Failed to parse log ${rec.Id}:`, (err as Error).message);
      }
    }

    return results;
  } catch (err) {
    console.warn(`[SalesforceLogAnalyzer] Querying ApexLog notice: ${(err as Error).message.split('\n')[0]}`);
    return [];
  }
}

/**
 * Fetches body of an ApexLog by ID
 */
function getApexLogBody(logId: string, targetOrg: string): string {
  try {
    assertLogId(logId);
    assertAlias(targetOrg, 'targetOrg');
    const raw = runSfSync(['apex', 'get', 'log', '-i', logId, '-o', targetOrg], {
      timeout: 20000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return raw;
  } catch {
    return '';
  }
}

/**
 * Parses raw Salesforce ApexLog text into structured automation events
 */
export function parseApexLogText(logId: string, headerMeta: any, rawLog: string): ParsedApexLog {
  const lines = rawLog.split('\n');
  const triggers: SalesforceTriggerEvent[] = [];
  const flows: SalesforceFlowEvent[] = [];
  const validations: SalesforceValidationEvent[] = [];
  const dml: SalesforceDmlEvent[] = [];
  const callouts: SalesforceCalloutEvent[] = [];
  const exceptions: Array<{ type: string; message: string }> = [];
  let limits: SalesforceLimitSummary | undefined;

  let currentTrigger: Partial<SalesforceTriggerEvent> | null = null;
  let currentFlow: Partial<SalesforceFlowEvent> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 1. Triggers
    if (line.includes('|CODE_UNIT_STARTED|') && line.includes('trigger event')) {
      // e.g. CODE_UNIT_STARTED|[EXTERNAL]|01q...|EncounterTrigger on Encounter trigger event BeforeUpdate|__sfdc_trigger/EncounterTrigger
      const match = line.match(/([a-zA-Z0-9_]+)\s+on\s+([a-zA-Z0-9_]+)\s+trigger event\s+([a-zA-Z0-9_]+)/i);
      if (match) {
        currentTrigger = {
          name: match[1],
          sObject: match[2],
          events: match[3],
          status: 'Success'
        };
      }
    } else if (line.includes('|CODE_UNIT_FINISHED|') && currentTrigger) {
      if (line.includes(currentTrigger.name || '')) {
        triggers.push(currentTrigger as SalesforceTriggerEvent);
        currentTrigger = null;
      }
    }

    // 2. Flows & Process Builder
    if (line.includes('|FLOW_CREATE_INTERVIEW_BEGIN|')) {
      const parts = line.split('|');
      const flowName = parts[3] || 'Salesforce Flow';
      currentFlow = {
        flowName,
        status: 'Started',
        elementsTraversed: []
      };
    } else if (line.includes('|FLOW_ELEMENT_BEGIN|') && currentFlow) {
      const parts = line.split('|');
      const elemName = parts[3] || 'Element';
      currentFlow.elementsTraversed?.push(elemName);
    } else if (line.includes('|FLOW_CREATE_INTERVIEW_END|') && currentFlow) {
      currentFlow.status = 'Completed';
      flows.push(currentFlow as SalesforceFlowEvent);
      currentFlow = null;
    }

    // 3. Validation Rules
    if (line.includes('|VALIDATION_RULE|')) {
      const parts = line.split('|');
      const ruleName = parts[3] || 'ValidationRule';
      // Look ahead for pass or fail
      let res: 'PASSED' | 'FAILED' = 'PASSED';
      let errorMsg: string | undefined;
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        if (lines[j].includes('|VALIDATION_FAIL|')) {
          res = 'FAILED';
          errorMsg = lines[j].split('|')[3] || 'Validation failed';
          break;
        } else if (lines[j].includes('|VALIDATION_PASS|')) {
          res = 'PASSED';
          break;
        }
      }
      validations.push({ ruleName, result: res, errorMessage: errorMsg });
    }

    // 4. DML Operations
    if (line.includes('|DML_BEGIN|')) {
      // e.g. DML_BEGIN|[14]|Op:Update|Type:Account|Rows:1
      const opMatch = line.match(/Op:([a-zA-Z]+)/);
      const typeMatch = line.match(/Type:([a-zA-Z0-9_]+)/);
      const rowsMatch = line.match(/Rows:(\d+)/);
      if (opMatch && typeMatch) {
        dml.push({
          operation: opMatch[1] as any,
          sObject: typeMatch[1],
          rowCount: rowsMatch ? parseInt(rowsMatch[1], 10) : 1
        });
      }
    }

    // 5. Callouts
    if (line.includes('|CALLOUT_REQUEST|')) {
      // e.g. CALLOUT_REQUEST|[22]|System.HttpRequest[Endpoint=https://api.external.com/...,Method=POST]
      const epMatch = line.match(/Endpoint=([^,\s\]]+)/);
      const methodMatch = line.match(/Method=([A-Z]+)/);
      if (epMatch) {
        callouts.push({
          endpoint: epMatch[1],
          method: methodMatch ? methodMatch[1] : 'POST'
        });
      }
    } else if (line.includes('|CALLOUT_RESPONSE|') && callouts.length > 0) {
      const statusMatch = line.match(/StatusCode=(\d+)/);
      if (statusMatch) {
        callouts[callouts.length - 1].statusCode = parseInt(statusMatch[1], 10);
      }
    }

    // 6. Exceptions / Fatal Errors
    if (line.includes('|FATAL_ERROR|') || line.includes('|EXCEPTION_THROWN|')) {
      const parts = line.split('|');
      const msg = parts[parts.length - 1] || line;
      exceptions.push({
        type: line.includes('FATAL_ERROR') ? 'Fatal Error' : 'Apex Exception',
        message: msg.trim()
      });
    }

    // 7. Cumulative Limits
    if (line.includes('Number of SOQL queries:')) {
      const soqlMatch = line.match(/Number of SOQL queries:\s*(\d+\s*out of\s*\d+)/);
      if (!limits) limits = { soqlQueries: '0/100', dmlStatements: '0/150', cpuTimeMs: 0 };
      if (soqlMatch) limits.soqlQueries = soqlMatch[1].replace(/\s*out of\s*/, '/');
    }
    if (line.includes('Number of DML statements:')) {
      const dmlMatch = line.match(/Number of DML statements:\s*(\d+\s*out of\s*\d+)/);
      if (!limits) limits = { soqlQueries: '0/100', dmlStatements: '0/150', cpuTimeMs: 0 };
      if (dmlMatch) limits.dmlStatements = dmlMatch[1].replace(/\s*out of\s*/, '/');
    }
    if (line.includes('Maximum CPU time:')) {
      const cpuMatch = line.match(/Maximum CPU time:\s*(\d+)/);
      if (!limits) limits = { soqlQueries: '0/100', dmlStatements: '0/150', cpuTimeMs: 0 };
      if (cpuMatch) limits.cpuTimeMs = parseInt(cpuMatch[1], 10);
    }
  }

  // Deduplicate triggers
  const uniqueTriggers = Array.from(
    new Map(triggers.map((t) => [`${t.name}-${t.sObject}-${t.events}`, t])).values()
  );

  return {
    logId,
    startTime: headerMeta.StartTime || new Date().toISOString(),
    durationMs: headerMeta.DurationMilliseconds || 0,
    status: headerMeta.Status || 'Success',
    operation: headerMeta.Operation || '/aura',
    logUser: headerMeta.LogUser?.Name || 'User',
    triggers: uniqueTriggers,
    flows,
    validations,
    dml,
    callouts,
    exceptions,
    limits,
    rawLogPreview: lines.slice(0, 150)
  };
}

/**
 * Builds the comprehensive execution log report by combining:
 * 1. Playwright step telemetry (click/fill/navigation/failures)
 * 2. In-flight network Aura/REST requests intercepted by Playwright
 * 3. Salesforce ApexLog records from the connected org
 */
export function buildExecutionLogReport(
  testId: string,
  rawSteps: string[] | string,
  testStatus: 'passed' | 'failed',
  testDurationMs: number,
  stepTelemetry: any[],
  salesforceLogs: ParsedApexLog[] = [],
  failureAnalysis?: any,
  sObjectContext?: string
): FullExecutionLogReport {
  const stepLines = Array.isArray(rawSteps)
    ? rawSteps
    : (rawSteps || '').split('\n').filter((s) => s.trim().length > 0);

  const rawStepsText = stepLines.join(' ');
  const detectedObjMatch = rawStepsText.match(/\b(Account|Contact|Opportunity|Lead|Case|Task|Event|Campaign|[A-Z][a-zA-Z0-9_]+__c)\b/i);
  const targetObj = sObjectContext || (detectedObjMatch ? detectedObjMatch[1] : 'Account');

  const steps: StepBackendActivity[] = [];

  // Synthetic backend traces are only for demos — real runs must never show invented triggers/flows.
  const allowSyntheticTrace = process.env.ORGWRIGHT_DEMO_BACKEND_TRACE === '1';

  // Which step failed? Prefer real telemetry from the run, then the failure analyzer.
  const teleFailed = stepTelemetry.find((t) => t && t.status === 'failed');
  const failedIndex: number | undefined =
    testStatus === 'failed' ? (teleFailed?.stepIndex ?? failureAnalysis?.failedStepIndex) : undefined;

  // Match or generate step activities
  for (let idx = 0; idx < stepLines.length; idx++) {
    const rawLine = stepLines[idx];
    const cleanText = rawLine.replace(/^\d+[\.\)]\s*/, '').trim();

    // Find recorded telemetry if available
    const tele = stepTelemetry.find((t) => t.stepIndex === idx + 1) ||
      stepTelemetry.find((t) => t.stepText?.toLowerCase() === rawLine.toLowerCase());

    // Infer action type
    let actionType: StepBackendActivity['actionType'] = 'click';
    let elementTarget = '';
    let valueTyped = '';

    if (/log\s*in|login|auth/i.test(cleanText)) {
      actionType = 'auth';
      elementTarget = 'Salesforce Login / OAuth Frontdoor';
    } else if (/navigate|open|goto|activate\s+tab/i.test(cleanText)) {
      actionType = 'navigate';
      const objMatch = cleanText.match(/navigate to\s+([a-zA-Z0-9_]+)/i) || cleanText.match(/open\s+([a-zA-Z0-9_]+)/i);
      elementTarget = objMatch ? objMatch[1] : 'Salesforce View';
    } else if (/type|fill|set\s+field|enter/i.test(cleanText)) {
      actionType = 'fill';
      const valMatch = cleanText.match(/type\s+([^\s]+)\s+(?:into|as|in)/i) || cleanText.match(/to\s+"([^"]+)"/i);
      valueTyped = valMatch ? valMatch[1] : '';
      const fieldMatch = cleanText.match(/(?:into|in|field)\s+([a-zA-Z0-9_]+)/i);
      elementTarget = fieldMatch ? fieldMatch[1] : 'Input Field';
    } else if (/wait/i.test(cleanText)) {
      actionType = 'wait';
      elementTarget = 'DOM / Element State';
    } else if (/verify|assert|should\s+be/i.test(cleanText)) {
      actionType = 'assert';
      elementTarget = 'UI Element / Toast / Record State';
    } else {
      actionType = 'click';
      const btnMatch = cleanText.match(/click\s+(?:on\s+)?(?:button\s+)?["']?([^"']+)["']?/i);
      elementTarget = btnMatch ? btnMatch[1] : 'Button / Dropdown';
    }

    // Step Status
    const isStepFailed = testStatus === 'failed' && failedIndex === idx + 1;
    // Steps after the failing one never ran; with no telemetry at all we cannot claim they passed either
    const isStepSkipped =
      !isStepFailed &&
      ((failedIndex !== undefined && idx + 1 > failedIndex) ||
        (testStatus === 'failed' && failedIndex === undefined && !tele));
    const stepDuration = tele?.durationMs ?? (isStepSkipped ? 0 : Math.round(testDurationMs / Math.max(stepLines.length, 1)));

    // Correlate backend events
    // For Save or DML buttons (e.g. Save, Submit, Convert, Create), associate trigger & flow events!
    const isSaveAction = /save|submit|convert|create/i.test(cleanText);
    const stepTriggers: SalesforceTriggerEvent[] = [];
    const stepFlows: SalesforceFlowEvent[] = [];
    const stepValidations: SalesforceValidationEvent[] = [];
    const stepDml: SalesforceDmlEvent[] = [];
    const stepCallouts: SalesforceCalloutEvent[] = [];

    if (salesforceLogs.length > 0) {
      for (const log of salesforceLogs) {
        if (isSaveAction) {
          stepTriggers.push(...log.triggers);
          stepFlows.push(...log.flows);
          stepValidations.push(...log.validations);
          stepDml.push(...log.dml);
          stepCallouts.push(...log.callouts);
        }
      }
    } else if (isSaveAction && allowSyntheticTrace && !isStepSkipped) {
      // Deterministic synthetic preview if offline so user always sees the backend architecture trace
      stepTriggers.push({
        name: `${targetObj}Trigger`,
        sObject: targetObj,
        events: 'BEFORE_INSERT, AFTER_INSERT',
        durationMs: 34,
        status: 'Success'
      });
      stepValidations.push(
        { ruleName: `VR_${targetObj}_Required_Fields`, result: 'PASSED' },
        { ruleName: `VR_${targetObj}_Validation_Check`, result: 'PASSED' }
      );
      stepFlows.push({
        flowName: `${targetObj}_AfterSave_Automation`,
        status: 'Completed',
        elementsTraversed: ['Evaluate_Criteria', 'Assign_Owner', 'Record_History']
      });
      stepDml.push({
        operation: 'Insert',
        sObject: targetObj,
        rowCount: 1
      });
    }

    steps.push({
      stepIndex: idx + 1,
      stepText: rawLine,
      actionType,
      elementTarget,
      valueTyped: valueTyped || undefined,
      status: isStepFailed ? 'failed' : isStepSkipped ? 'skipped' : 'passed',
      durationMs: stepDuration,
      error: isStepFailed
        ? friendlyStepError(tele?.error, failureAnalysis)
        : isStepSkipped
        ? 'Not run — an earlier step failed.'
        : undefined,
      explanation: isStepFailed ? failureAnalysis?.humanExplanation : undefined,
      recommendation: isStepFailed ? failureAnalysis?.recommendation : undefined,
      screenshotUrl: tele?.screenshot
        ? `/api/test-results/step-screenshot?testId=${encodeURIComponent(testId)}&step=${idx + 1}&t=${Date.now()}`
        : undefined,
      auraActions: tele?.auraActions || (isSaveAction && allowSyntheticTrace && !isStepSkipped ? [{ name: 'RecordUiController/ACTION$saveRecord', status: 200, durationMs: 240 }] : []),
      triggersFired: stepTriggers,
      flowsExecuted: stepFlows,
      validationsEvaluated: stepValidations,
      dmlOperations: stepDml,
      calloutsMade: stepCallouts,
      limitsConsumed: isSaveAction && allowSyntheticTrace && !isStepSkipped ? { soqlQueries: '8/100', dmlStatements: '2/150', cpuTimeMs: 142 } : undefined
    });
  }

  const allTriggers = steps.flatMap((s) => s.triggersFired);
  const allFlows = steps.flatMap((s) => s.flowsExecuted);
  const allValidations = steps.flatMap((s) => s.validationsEvaluated);
  const allDml = steps.flatMap((s) => s.dmlOperations);

  return {
    testId,
    status: testStatus,
    totalDurationMs: testDurationMs,
    startedAt: new Date(Date.now() - testDurationMs).toISOString(),
    finishedAt: new Date().toISOString(),
    steps,
    salesforceLogs,
    backendAutomationSummary: {
      totalTriggersFired: allTriggers.length,
      totalFlowsExecuted: allFlows.length,
      totalValidationsChecked: allValidations.length,
      totalDmlRecords: allDml.reduce((sum, d) => sum + d.rowCount, 0),
      hasBackendExceptions: salesforceLogs.some((l) => l.exceptions.length > 0)
    }
  };
}


/**
 * Turns a raw Playwright error into a sentence a tester can act on.
 * Orgwright helper errors are already plain language and are passed through unchanged.
 */
export function friendlyStepError(rawError: string | undefined, failureAnalysis?: any): string {
  const raw = (rawError || failureAnalysis?.rawErrorMessage || '').replace(/\u001b\[[0-9;]*m/g, '').trim();
  const firstLine = raw.split('\n')[0].replace(/^Error:\s*/, '').trim();

  if (!raw) {
    return failureAnalysis?.errorTitle || 'The step failed, but Playwright did not report a reason.';
  }
  // Errors thrown by Orgwright helpers (LightningHelpers / OrgwrightData) are already written for testers
  if (!/locator|getBy|toBeVisible|toHaveURL|toContain|expect\(|Timeout \d+ms|waiting for/i.test(firstLine)) {
    return firstLine;
  }

  const target =
    raw.match(/getByRole\('(\w+)',\s*\{\s*name:\s*\/([^/]+)\//)?.slice(1) ||
    raw.match(/getByLabel\(\/([^/]+)\//)?.slice(1) ||
    raw.match(/getByText\('([^']+)'/)?.slice(1);
  const what = target
    ? target.length === 2
      ? `${target[0]} "${target[1].replace(/\\/g, '')}"`
      : `"${target[0].replace(/\\/g, '')}"`
    : 'the element';

  const toContain = raw.match(/Expected substring:\s*"([^"]*)"[\s\S]*?Received string:\s*"([^"]*)"/);
  if (toContain) {
    return `Expected the value to contain "${toContain[1]}", but the page showed "${toContain[2].slice(0, 200)}".`;
  }
  if (/toHaveURL/i.test(raw)) {
    return 'The page did not navigate where the step expected (wrong URL after the action).';
  }
  if (/toBeVisible/i.test(raw)) {
    return `Expected ${what} to be visible, but it did not appear in time.`;
  }
  if (/Timeout \d+ms exceeded|waiting for/i.test(raw)) {
    return `Could not find ${what} on the page in time. It may be named differently, hidden for this user, or the page had not finished loading.`;
  }
  return firstLine;
}
