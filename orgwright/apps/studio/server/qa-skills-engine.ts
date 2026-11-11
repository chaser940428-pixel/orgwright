import * as fs from 'fs';
import * as path from 'path';
import { ROOT_DIR } from './lib/paths';

export interface LocatorAnalysis {
  line: number;
  code: string;
  type: 'role' | 'label' | 'testid' | 'scoped_lightning' | 'css_class' | 'brittle_css';
  score: number; // 0 to 5
  recommendation?: string;
}

export interface SpecAuditResult {
  overallScore: number; // 0 to 100%
  roleFirstCompliancePercent: number;
  totalLocators: number;
  locators: LocatorAnalysis[];
  antiFlakinessChecks: {
    noWaitForTimeout: boolean;
    usesWebFirstAssertions: boolean;
    usesPageObjects: boolean;
    usesStreamTelemetry: boolean;
    usesLightningReady: boolean;
  };
  warnings: string[];
  recommendations: string[];
}

export interface QASkillItem {
  name: string;
  category: string;
  tags: string[];
  description?: string;
}

/**
 * Audits a Playwright spec according to petrkindlmann/qa-skills standards
 */
export function auditPlaywrightSpec(specCode: string): SpecAuditResult {
  const lines = specCode.split('\n');
  const locators: LocatorAnalysis[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];

  let roleCount = 0;
  let hasWaitForTimeout = false;
  let hasWebFirstAssertions = false;
  let hasPageObjects = false;
  let hasStreamTelemetry = false;
  let hasLightningReady = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check anti-flakiness rules
    if (trimmed.includes('page.waitForTimeout') || trimmed.includes('.waitForTimeout(')) {
      // If it's the final viewer hold (e.g. holding view for tester), allow with note
      if (!trimmed.includes('visually confirm final state')) {
        hasWaitForTimeout = true;
        warnings.push(`Line ${i + 1}: Found raw 'waitForTimeout' - petrkindlmann/qa-skills rule #2 forbids hardcoded sleeps; rely on auto-waiting assertions.`);
      }
    }

    if (trimmed.includes('expect(') && (trimmed.includes('toBeVisible') || trimmed.includes('toHaveURL') || trimmed.includes('toHaveText'))) {
      hasWebFirstAssertions = true;
    }

    if (trimmed.includes('BasePage') || trimmed.includes('EncounterNotesPage') || trimmed.includes('basePage.') || trimmed.includes('encounterPage.')) {
      hasPageObjects = true;
    }

    if (trimmed.includes('StreamHelper')) {
      hasStreamTelemetry = true;
    }

    if (trimmed.includes('LightningHelpers.waitForLightningReady')) {
      hasLightningReady = true;
    }

    // Check locator stability
    if (trimmed.includes('getByRole(')) {
      roleCount++;
      locators.push({
        line: i + 1,
        code: trimmed,
        type: 'role',
        score: 5
      });
    } else if (trimmed.includes('getByLabel(') || trimmed.includes('getByTestId(') || trimmed.includes('getByPlaceholder(')) {
      roleCount++;
      locators.push({
        line: i + 1,
        code: trimmed,
        type: 'label',
        score: 4
      });
    } else if (trimmed.includes('records-record-layout-item') || trimmed.includes('lightning-combobox') || trimmed.includes('lightning-input')) {
      locators.push({
        line: i + 1,
        code: trimmed,
        type: 'scoped_lightning',
        score: 3,
        recommendation: 'Good semantic scoping for Salesforce Lightning.'
      });
    } else if (trimmed.includes('locator(') && (trimmed.includes('.slds-') || trimmed.includes('button') || trimmed.includes('input'))) {
      locators.push({
        line: i + 1,
        code: trimmed,
        type: 'css_class',
        score: 2,
        recommendation: 'Consider elevating to getByRole() or getByLabel() for higher drift resistance.'
      });
    } else if (trimmed.includes(':nth-child') || trimmed.includes(' > div > ')) {
      locators.push({
        line: i + 1,
        code: trimmed,
        type: 'brittle_css',
        score: 0,
        recommendation: 'CRITICAL: Brittle positional selector detected. Replace with getByRole() immediately.'
      });
      warnings.push(`Line ${i + 1}: Brittle positional DOM locator detected.`);
    }
  }

  const totalLocators = locators.length || 1;
  const avgScore = locators.reduce((sum, l) => sum + l.score, 0) / totalLocators;
  const compliance = Math.round((roleCount / totalLocators) * 100);

  let overallScore = Math.round((avgScore / 5) * 80);
  if (!hasWaitForTimeout) overallScore += 10;
  if (hasWebFirstAssertions) overallScore += 5;
  if (hasLightningReady) overallScore += 5;
  overallScore = Math.min(100, Math.max(10, overallScore));

  if (compliance < 80) {
    recommendations.push('Increase role-first locator adoption (target > 85% getByRole or getByLabel).');
  }
  if (!hasWebFirstAssertions) {
    recommendations.push('Add web-first assertions (e.g. await expect(locator).toBeVisible()).');
  }
  if (!hasLightningReady) {
    recommendations.push('Include LightningHelpers.waitForLightningReady() to synchronize with Aura queue.');
  }

  return {
    overallScore,
    roleFirstCompliancePercent: Math.min(100, compliance),
    totalLocators: locators.length,
    locators,
    antiFlakinessChecks: {
      noWaitForTimeout: !hasWaitForTimeout,
      usesWebFirstAssertions: hasWebFirstAssertions,
      usesPageObjects: hasPageObjects,
      usesStreamTelemetry: hasStreamTelemetry,
      usesLightningReady: hasLightningReady
    },
    warnings,
    recommendations
  };
}

/**
 * Loads the 50 QA Skills Catalog
 */
export function getQASkillsCatalog(): QASkillItem[] {
  try {
    const indexPath = path.resolve(ROOT_DIR, 'qa-skills', 'skills_index.json');
    if (fs.existsSync(indexPath)) {
      const data = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      return data.skills || [];
    }
  } catch {}

  // Fallback core skills
  return [
    { name: 'playwright-automation', category: 'automation', tags: ['playwright', 'typescript', 'pom', 'fixtures'] },
    { name: 'selector-drift-recovery', category: 'automation', tags: ['selectors', 'drift', 'healing', 'role-first'] },
    { name: 'test-reliability', category: 'automation', tags: ['flakiness', 'auto-wait', 'retries'] },
    { name: 'qa-dashboard', category: 'metrics', tags: ['dashboard', 'visualization', 'reporting'] },
    { name: 'ai-bug-triage', category: 'analysis', tags: ['triage', 'rca', 'classification'] },
    { name: 'qa-project-context', category: 'foundation', tags: ['context', 'setup', 'standards'] },
    { name: 'accessibility-testing', category: 'specialized', tags: ['a11y', 'wcag', 'axe'] },
    { name: 'api-testing', category: 'automation', tags: ['api', 'rest', 'salesforce-rest'] }
  ];
}
