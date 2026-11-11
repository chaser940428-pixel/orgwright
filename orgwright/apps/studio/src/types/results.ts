/** Shared result/report types used by the Studio UI (mirrors server/salesforce-log-analyzer.ts). */

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
  soqlQueries: string;
  dmlStatements: string;
  cpuTimeMs: number;
  heapSizeBytes?: number;
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
  explanation?: string;
  recommendation?: string;
  screenshotUrl?: string;
  auraActions: Array<{ name: string; status: number; durationMs?: number }>;
  triggersFired: SalesforceTriggerEvent[];
  flowsExecuted: SalesforceFlowEvent[];
  validationsEvaluated: SalesforceValidationEvent[];
  dmlOperations: SalesforceDmlEvent[];
  calloutsMade: SalesforceCalloutEvent[];
  limitsConsumed?: SalesforceLimitSummary;
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

export interface FullExecutionLogReport {
  testId: string;
  status: 'passed' | 'failed';
  totalDurationMs: number;
  startedAt: string;
  finishedAt: string;
  steps: StepBackendActivity[];
  salesforceLogs: ParsedApexLog[];
  dataRows?: { passed: number; total: number; results: Array<{ row: number; status: 'passed' | 'failed'; error?: string }> };
  backendAutomationSummary: {
    totalTriggersFired: number;
    totalFlowsExecuted: number;
    totalValidationsChecked: number;
    totalDmlRecords: number;
    hasBackendExceptions: boolean;
  };
}

export interface OrgUser {
  id: string;
  name: string;
  username: string;
  email: string;
  profileName: string;
  roleName: string;
  isDefault?: boolean;
}

export interface MatrixResultItem {
  persona: OrgUser;
  status: 'pending' | 'running' | 'passed' | 'failed';
  durationMs?: number;
  error?: string;
  failureAnalysis?: any;
}

export interface MatrixSummary {
  matrixId: string;
  testId: string;
  total: number;
  passed: number;
  failed: number;
  complianceRate: string;
  totalDurationMs?: number;
  completedAt: string;
}

export interface FailureAnalysis {
  failedStepIndex?: number;
  failedStepText?: string;
  errorTitle: string;
  humanExplanation: string;
  rootCause: string;
  recommendation: string;
  suggestedStepFix?: string;
  specFile?: string;
  specLine?: number;
  rawErrorMessage?: string;
  targetSelector?: string;
  callLog?: string[];
  screenshotBase64?: string;
  screenshotPath?: string;
  tracePath?: string;
  videoPath?: string;
}

export interface ResolvedStep {
  index: number;
  rawText: string;
  status: 'resolved' | 'review_required' | 'failed';
  action: {
    type: string;
    target?: string;
    field?: string;
    value?: any;
    confidence: number;
    extra?: Record<string, any>;
  };
  reviewNotes?: string;
}
