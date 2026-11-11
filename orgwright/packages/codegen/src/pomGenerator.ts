import { generatePageObject, PomGeneratorOptions } from './pageObjectGenerator.js';
import { SObjectDescribe } from '@orgwright/core';

export * from './pageObjectGenerator.js';

/**
 * Alias for generatePageObject.
 */
export function generatePom(describe: SObjectDescribe, options?: PomGeneratorOptions): string {
  return generatePageObject(describe, options);
}
