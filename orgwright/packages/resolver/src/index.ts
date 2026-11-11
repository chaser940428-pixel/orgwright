import {
  OrgMetadataCache,
  TestStep,
  TestStepSchema
} from '@orgwright/core';
import { parseStep, cleanStepText } from './stepParser.js';
import { matchCatalog, ResolutionContext } from './catalogMatcher.js';

export * from './stepParser.js';
export * from './catalogMatcher.js';
export * from './stepInsights.js';

/**
 * Resolves a single manual test step string or TestStep object against the Salesforce catalog.
 * Produces a validated TestStep with action classification, targets, and confidence score.
 */
export function resolveStep(
  step: string | TestStep,
  catalog?: OrgMetadataCache,
  context: ResolutionContext = {}
): TestStep {
  const rawText = typeof step === 'string' ? step : step.rawText;
  const index = typeof step === 'string' ? (cleanStepText(step).index ?? 1) : step.index;

  const parsed = parseStep(rawText, index);
  const { action, updatedContext } = matchCatalog(parsed, catalog, context);
  // Remember which object this step runs against (used for per-step field checks)
  if (updatedContext.currentObject) {
    action.extra = { ...(action.extra || {}), contextObject: updatedContext.currentObject };
  }

  let status: 'resolved' | 'review_required' | 'failed' = 'resolved';
  let reviewNotes: string | undefined;

  if (action.confidence >= 0.80) {
    status = 'resolved';
  } else if (action.confidence >= 0.50) {
    status = 'review_required';
    reviewNotes = `Step parsed with ${Math.round(action.confidence * 100)}% confidence. Manual confirmation recommended for target "${action.target}".`;
  } else {
    status = 'failed';
    reviewNotes = `Could not reliably resolve action for step: "${rawText}".`;
  }

  const resolvedStep: TestStep = {
    id: typeof step === 'object' && step.id ? step.id : undefined,
    index,
    rawText,
    action,
    status,
    reviewNotes
  };

  // Mutate context if caller supplied an object
  Object.assign(context, updatedContext);

  return TestStepSchema.parse(resolvedStep);
}

/**
 * Resolves an ordered list of manual test steps into fully structured TestStep objects.
 * Maintains context between steps (e.g. current active object/app) to disambiguate fields and actions.
 */
export function resolveTestSteps(
  steps: (string | TestStep)[],
  catalog?: OrgMetadataCache,
  initialContext: ResolutionContext = {}
): TestStep[] {
  const context: ResolutionContext = { ...initialContext };
  const resolvedList: TestStep[] = [];

  for (let i = 0; i < steps.length; i++) {
    const item = steps[i];
    const defaultIdx = i + 1;
    let stepObj: TestStep;

    if (typeof item === 'string') {
      stepObj = {
        index: defaultIdx,
        rawText: item,
        status: 'pending'
      };
    } else {
      stepObj = { ...item, index: item.index ?? defaultIdx };
    }

    const resolved = resolveStep(stepObj, catalog, context);
    resolvedList.push(resolved);
  }

  return resolvedList;
}
