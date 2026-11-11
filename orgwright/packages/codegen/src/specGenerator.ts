import { TestCase, TestStep } from '@orgwright/core';
import { emitStepCode, stepsUseTestData, stepsUseApi } from './stepEmitter.js';

export interface SpecGeneratorOptions {
  suiteName?: string;
  testName?: string;
  ticketNumber?: string;
  basePageImportPath?: string;
  encounterNotesPageImportPath?: string;
  lightningHelpersImportPath?: string;
  streamHelperImportPath?: string;
  testDataImportPath?: string;
  salesforceApiImportPath?: string;
  /** Data-driven runs: one test per row; columns become {{Column}} tokens */
  dataRows?: Array<Record<string, string>>;
  includeBeforeEach?: boolean;
  pageVar?: string;
  encounterPageVar?: string;
  basePageVar?: string;
}

/**
 * Transforms resolved TestStep[] or a TestCase into a complete, production-ready
 * Playwright TypeScript .spec.ts file importing BasePage, EncounterNotesPage, and LightningHelpers.
 */
export function generatePlaywrightSpec(
  input: TestCase | TestStep[],
  options: SpecGeneratorOptions = {}
): string {
  let steps: TestStep[];
  let suiteName = options.suiteName || 'Salesforce Regression Test Suite';
  let testName = options.testName || 'Verify Automated End-to-End Workflow';
  let ticketNumber = options.ticketNumber;
  let testCaseId: string | undefined;

  if (Array.isArray(input)) {
    steps = input;
  } else {
    steps = input.steps;
    testCaseId = input.id;
    suiteName = options.suiteName || `${input.projectName} - ${input.name}`;
    testName = options.testName || input.name;
    ticketNumber = options.ticketNumber || input.ticketNumber;
  }

  const basePagePath = options.basePageImportPath || '../pages/BasePage';
  const encounterPagePath = options.encounterNotesPageImportPath || '../pages/EncounterNotesPage';
  const lightningHelpersPath = options.lightningHelpersImportPath || '../utils/lightning-helpers';
  const streamHelperPath = options.streamHelperImportPath || '../../utils/stream-helper';
  const testDataPath = options.testDataImportPath || streamHelperPath.replace(/stream-helper$/, 'test-data');
  const salesforceApiPath = options.salesforceApiImportPath || streamHelperPath.replace(/stream-helper$/, 'salesforce-api');
  const dataRows = (options.dataRows || []).filter((r) => r && Object.keys(r).length > 0);
  const usesApi = stepsUseApi(steps);
  const usesTestData = stepsUseTestData(steps) || dataRows.length > 0;
  // Telemetry/screenshots are keyed by the test case id so the Studio can map results back to steps
  const telemetryId = (testCaseId || ticketNumber || 'TC_RUN').replace(/'/g, "\\'");

  const testTitle = ticketNumber ? `${ticketNumber}: ${testName}` : testName;
  const beforeEachExtra =
    (usesTestData ? '    OrgwrightData.reset();\n' : '') +
    (dataRows.length ? '' : `    await StreamHelper.attach(page, '${telemetryId}');\n`);

  // Generate code for each step
  const stepCodeBlocks = steps.map(step => emitStepCode(step, {
    pageVar: options.pageVar || 'page',
    encounterPageVar: options.encounterPageVar || 'encounterPage',
    basePageVar: options.basePageVar || 'basePage',
    indent: '    '
  }));

  const code = `import { test, expect } from '@playwright/test';
import { BasePage } from '${basePagePath}';
import { EncounterNotesPage } from '${encounterPagePath}';
import { LightningHelpers } from '${lightningHelpersPath}';
import { StreamHelper } from '${streamHelperPath}';
${usesTestData ? `import { OrgwrightData } from '${testDataPath}';\n` : ''}${usesApi ? `import { SalesforceApi } from '${salesforceApiPath}';\n` : ''}${dataRows.length ? `\n// Data-driven run: one test per row; each column is available as {{Column}}\nconst DATA_ROWS: Array<Record<string, string>> = ${JSON.stringify(dataRows, null, 2)};\n` : ''}
test.describe('${suiteName.replace(/'/g, "\\'")}', () => {
  let basePage: BasePage;
  let encounterPage: EncounterNotesPage;

  test.beforeEach(async ({ page }) => {
    basePage = new BasePage(page);
    encounterPage = new EncounterNotesPage(page);
${beforeEachExtra}  });

  test.afterEach(async ({ page }, testInfo) => {
    const failed = testInfo.status !== testInfo.expectedStatus;
    await StreamHelper.detach(failed ? { page, error: testInfo.error?.message } : { page });${usesApi ? `\n    await SalesforceApi.cleanup();` : ''}
  });

  /**
   * ${testTitle.replace(/\*\//g, '* /')}
   */
${dataRows.length ? `  for (const [rowIndex, row] of DATA_ROWS.entries()) {
  test(\`${testTitle.replace(/`/g, "'")} [row \${rowIndex + 1}]\`, async ({ page }) => {
    OrgwrightData.load(row);
    await StreamHelper.attach(page, \`${telemetryId}__row\${rowIndex + 1}\`);
${stepCodeBlocks.join('\n\n')}

    await StreamHelper.holdForReview(page);
  });
  }` : `  test('${testTitle.replace(/'/g, "\\'")}', async ({ page }) => {
${stepCodeBlocks.join('\n\n')}

    await StreamHelper.holdForReview(page);
  });`}
});
`;

  return code;
}
