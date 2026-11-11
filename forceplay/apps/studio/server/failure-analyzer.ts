import * as fs from 'fs';
import * as path from 'path';

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

export function analyzeTestFailure(
  rawLogs: string,
  rootPlaywrightDir: string,
  testId?: string,
  manualSteps?: string | string[]
): FailureAnalysis {
  const stepsList = Array.isArray(manualSteps)
    ? manualSteps
    : (manualSteps || '').split('\n').map(s => s.trim()).filter(Boolean);

  let specFile: string | undefined;
  let specLine: number | undefined;
  let failedStepIndex: number | undefined;
  let failedStepText: string | undefined;

  // 1. Identify failing line in spec file
  // Look specifically for stack trace frames: "at ... TC_002.spec.ts:42:30"
  const stackMatches = [...rawLogs.matchAll(/at\s+(?:.*?[\\/])?((?:tests[\\/][^:\r\n]+|[a-zA-Z0-9_.-]+)\.spec\.ts):(\d+):(\d+)/gi)];
  
  if (stackMatches.length > 0) {
    const targetMatch = stackMatches[0]; // first stack frame inside spec
    specFile = path.resolve(rootPlaywrightDir, targetMatch[1].replace(/^[\\/]+/, ''));
    specLine = parseInt(targetMatch[2], 10);
  } else {
    // Fallback to any .spec.ts:line:col
    const anyMatches = [...rawLogs.matchAll(/((?:tests[\\/][^:\r\n]+|[a-zA-Z0-9_.-]+)\.spec\.ts):(\d+):(\d+)/gi)];
    if (anyMatches.length > 0) {
      specFile = path.resolve(rootPlaywrightDir, anyMatches[0][1]);
      specLine = parseInt(anyMatches[0][2], 10);
    }
  }

  // If spec file found, inspect the lines around specLine to find StreamHelper.setStep or step comment
  if (specFile && fs.existsSync(specFile) && specLine) {
    try {
      const fileLines = fs.readFileSync(specFile, 'utf-8').split('\n');
      for (let i = specLine - 1; i >= Math.max(0, specLine - 15); i--) {
        const line = fileLines[i];
        // Match: await StreamHelper.setStep(page, "3. Click on 001xx000003DGS2AAO record");
        const setStepMatch = line.match(/StreamHelper\.setStep\([^,]+,\s*["'`]([^"'`]+)["'`]\)/);
        if (setStepMatch) {
          failedStepText = setStepMatch[1];
          const idxMatch = failedStepText.match(/^(\d+)\.\s*(.*)/);
          if (idxMatch) {
            failedStepIndex = parseInt(idxMatch[1], 10);
          }
          break;
        }
        // Match: // Step 3: 3. Click on ...
        const commentMatch = line.match(/\/\/\s*Step\s*(\d+):\s*(.*)/i);
        if (commentMatch) {
          failedStepIndex = parseInt(commentMatch[1], 10);
          failedStepText = commentMatch[2].trim();
          break;
        }
      }
    } catch {}
  }

  // Fallback step resolution from step list
  if (!failedStepText && failedStepIndex && stepsList[failedStepIndex - 1]) {
    failedStepText = stepsList[failedStepIndex - 1];
  }

  // 2. Parse Error Type and Selector
  let errorTitle = 'Test Execution Failed';
  let rawErrorMessage = '';
  const errorMatch = rawLogs.match(/(TimeoutError:[^\r\n]+|Error:[^\r\n]+|expect\([^)]+\)[^\r\n]+)/i);
  if (errorMatch) {
    rawErrorMessage = errorMatch[1].trim();
  }

  // Extract Call log
  const callLog: string[] = [];
  const callLogMatch = rawLogs.match(/Call log:\s*([\s\S]*?)(?=\n\s*(?:at\s+|attachment\s+|Error Context:|$))/i);
  if (callLogMatch) {
    const rawCallLines = callLogMatch[1].split('\n');
    for (const cl of rawCallLines) {
      const cleanCl = cl.trim().replace(/^[-•*]\s*/, '');
      if (cleanCl) callLog.push(cleanCl);
    }
  }

  // Extract waiting selector
  let targetSelector = '';
  const waitingMatch = rawLogs.match(/waiting for (getByRole\([^)]+\)|locator\([^)]+\)|[^\r\n]+)/i);
  if (waitingMatch) {
    targetSelector = waitingMatch[1].trim();
  }

  // 3. Diagnose and create Human Explanation, Root Cause, and Recommendation
  let humanExplanation = '';
  let rootCause = '';
  let recommendation = '';
  let suggestedStepFix: string | undefined;

  // Case 1: Salesforce Record ID clicked as button
  const isRecordAsButton = /button.*['"`/][a-zA-Z0-9]{15,18}/i.test(targetSelector) ||
    /button.*['"`/][a-zA-Z0-9]{15,18}\s+record/i.test(targetSelector) ||
    (failedStepText && /(?:click on|open)\s+[a-zA-Z0-9]{15,18}\s+record/i.test(failedStepText));

  // Case 2: Field API name (__c) used instead of label
  const isFieldApiName = /__c/i.test(targetSelector) || (failedStepText && /__c/i.test(failedStepText));

  // Case 3: Toast assertion failure
  const isToastError = /toast/i.test(targetSelector) || /toast/i.test(failedStepText || '') || /verifyToast/i.test(rawLogs);

  // Case 4: General button timeout
  const isButtonTimeout = /button/i.test(targetSelector) || /clickButton/i.test(rawLogs);

  if (isRecordAsButton) {
    const idMatch = (failedStepText || targetSelector).match(/([a-zA-Z0-9]{15,18})/);
    const recId = idMatch ? idMatch[1] : 'the record';
    errorTitle = `Record Link Not Found as Button (${recId})`;
    humanExplanation = `KPlay engine waited 25 seconds for an action button named "${recId} record", but Salesforce displays records in tables as links or rows, not buttons.`;
    rootCause = `The test step recorded a hardcoded record ID (${recId}) as a button click. Salesforce Lightning list views render table records as hyperlinks (<a>) or table cells. Additionally, hardcoded IDs from one session often do not appear or change order in subsequent runs.`;
    recommendation = `Use a dynamic list navigation step like "Navigate to Encounter record recent" to click the first available record automatically, rather than searching for a button with a static record ID.`;
    if (failedStepIndex) {
      suggestedStepFix = `${failedStepIndex}. Navigate to Encounter record recent`;
    }
  } else if (isFieldApiName) {
    const fieldMatch = (targetSelector || failedStepText || '').match(/([a-zA-Z0-9_]+__c)/i);
    const rawFieldName = fieldMatch ? fieldMatch[1] : 'custom field';
    const cleanLabel = rawFieldName.replace(/__c$/i, '').replace(/_/g, ' ');
    errorTitle = `Field Label Mismatch: Technical API Name "${rawFieldName}"`;
    humanExplanation = `Could not find an input field with the technical API name "${rawFieldName}". In Salesforce, fields are rendered on screen using their user-friendly labels.`;
    rootCause = `The test searched for "${rawFieldName}". The Salesforce Lightning UI displays the label "${cleanLabel}". Automation locators match the visible screen label.`;
    recommendation = `Change the step to reference "${cleanLabel}" instead of "${rawFieldName}".`;
    if (failedStepIndex && failedStepText) {
      suggestedStepFix = failedStepText.replace(rawFieldName, cleanLabel);
    }
  } else if (isToastError) {
    errorTitle = 'Toast Notification Mismatch';
    humanExplanation = 'KPlay engine waited for a success notification banner (Toast), but it either did not appear within 15 seconds or contained an error.';
    rootCause = 'Salesforce might have encountered a validation rule, required field restriction, or backend trigger error when submitting the form.';
    recommendation = 'Check if an error banner appeared on screen in Salesforce, and confirm that all required fields were filled before saving.';
  } else if (isButtonTimeout) {
    const btnMatch = targetSelector.match(/name:\s*\/([^/]+)\//i) || (failedStepText || '').match(/click on\s+(.+?)\s+button/i);
    const btnName = btnMatch ? btnMatch[1].trim() : 'Button';
    errorTitle = `Button "${btnName}" Not Found or Not Clickable`;
    humanExplanation = `KPlay engine waited 25 seconds for button "${btnName}", but it was not visible, clickable, or present in the current DOM.`;
    rootCause = `The page may still have been loading, or the button was inside a modal or drawer that hadn't finished opening, or required fields were incomplete.`;
    recommendation = `Verify that any previous save or modal transition succeeded, or add a brief "Wait for fields to auto populate" step before clicking "${btnName}".`;
  } else {
    errorTitle = rawErrorMessage ? rawErrorMessage.split('\n')[0] : 'Step Execution Timed Out';
    humanExplanation = `The test execution timed out waiting for the target element to become visible and interactive.`;
    rootCause = `The element was not found in the DOM within the configured timeout period. This typically happens when previous page navigation is still pending or the selector does not match the active Salesforce Lightning view.`;
    recommendation = `Inspect the failure screenshot below to see the exact state of the browser when the failure occurred.`;
  }

  // 4. Locate Artifacts (screenshot, trace, video)
  const resultsDir = path.resolve(rootPlaywrightDir, 'test-results');
  let screenshotPath: string | undefined;
  let screenshotBase64: string | undefined;
  let tracePath: string | undefined;
  let videoPath: string | undefined;

  if (fs.existsSync(resultsDir)) {
    try {
      const files = fs.readdirSync(resultsDir, { recursive: true }) as string[];
      // Find most recent test-failed PNG
      const pngFiles = files.filter(f => f.endsWith('test-failed-1.png') || f.endsWith('.png'));
      if (pngFiles.length > 0) {
        // pick newest
        let newestFile = pngFiles[0];
        let newestTime = 0;
        for (const pf of pngFiles) {
          const fullPf = path.join(resultsDir, pf);
          try {
            const stat = fs.statSync(fullPf);
            if (stat.mtimeMs > newestTime) {
              newestTime = stat.mtimeMs;
              newestFile = pf;
            }
          } catch {}
        }
        const fullScreenshot = path.join(resultsDir, newestFile);
        screenshotPath = fullScreenshot;
        try {
          const buf = fs.readFileSync(fullScreenshot);
          screenshotBase64 = buf.toString('base64');
        } catch {}
      }

      const traceFile = files.find(f => f.endsWith('trace.zip'));
      if (traceFile) tracePath = path.join(resultsDir, traceFile);

      const videoFile = files.find(f => f.endsWith('.webm'));
      if (videoFile) videoPath = path.join(resultsDir, videoFile);
    } catch {}
  }

  return {
    failedStepIndex,
    failedStepText,
    errorTitle,
    humanExplanation,
    rootCause,
    recommendation,
    suggestedStepFix,
    specFile,
    specLine,
    rawErrorMessage,
    targetSelector,
    callLog,
    screenshotBase64,
    screenshotPath,
    tracePath,
    videoPath
  };
}
