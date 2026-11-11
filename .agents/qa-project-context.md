# QA Project Context — Orgwright Studio

> Single source of truth for all QA automation skills and agent standards (petrkindlmann/qa-skills standard).

## Product
- **Name**: Orgwright Studio
- **Type**: Salesforce Enterprise Test Automation Platform & Playwright Studio
- **Target App**: Salesforce Lightning Experience (Health Cloud, Sales Cloud, Revenue Operations)
- **Primary Org**: `sandboxOrg` (Sandbox) 
- **Critical Journeys**:
  1. Record Navigation & Recent View Loading (`Encounter__c`, `Account`, `Opportunity`)
  2. Modal Form Interaction (Edit/Create fields, picklists, comboboxes, lookups)
  3. Action Execution (Save button, custom Lightning actions like `Create RUL`, `Sync CareCloud Notes`)
  4. Backend Automation Verification (Apex Triggers, Record Flows, Validation Rules, DML, Governor Limits)
  5. Multi-Persona Permission Matrix (Standard QA, Billing Specialist, RevOps, System Administrator)

## Tech Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS, Vite, Lucide Icons, WebSockets
- **Studio Backend**: Node.js, Express, TypeScript (`tsx watch`), Salesforce CLI (`sf data query`, `sf apex get log`)
- **E2E Automation Runner**: `@playwright/test` (v1.50+), Chromium / Google Chrome

## Test Stack & Conventions (petrkindlmann/qa-skills)
- **Framework**: Playwright TypeScript
- **Locators (Role-First Discipline)**:
  - Priority: `getByRole` > `getByLabel` > `getByPlaceholder` > `getByTestId` > Scoped Lightning item
  - Rule: Never use brute-force CSS paths (`div > div:nth-child(3)`).
  - Rule: Never use raw `waitForTimeout` in test assertions — rely on Playwright's web-first auto-waiting (`expect(locator).toBeVisible()`).
  - Disambiguation: Region scoping (`getByRole('region', { name: ... }).getByRole('button', ...)`) or `.filter({ hasText: ... })`.
- **Page Object Model (POM)**:
  - `BasePage.ts`: Global navigation, app launcher, record tabs, toasts, modals.
  - `EncounterNotesPage.ts`: Encounter record actions, note creation, sync trigger.
- **Lightning Synchronizers**:
  - `LightningHelpers.waitForLightningReady(page)`: Ensures Aura / LWC rendering queues are settled before interacting.
  - `StreamHelper`: Telemetry recording of browser clicks, fills, network requests, and durations.

## Selector Stability Rubric (0 to 5)
- **Score 5**: Accessible semantic role + name (e.g. `getByRole('button', { name: 'Save' })`)
- **Score 4**: User-facing label or testid (e.g. `getByLabel('Encounter Name')`)
- **Score 3**: Region-scoped semantic locator (e.g. `getByRole('dialog').getByRole('button', { name: 'Save' })`)
- **Score 2**: Scoped Lightning container with text filter (e.g. `locator('records-record-layout-item').filter({ hasText: '...' })`)
- **Score 1**: DOM classes or Lightning tags (e.g. `locator('.slds-button_brand')`)
- **Score 0**: Fragile positional DOM hierarchy (e.g. `locator('div > div:nth-child(2)')`) — FORBIDDEN

## Quality Goals & Anti-Flakiness
- Flake rate < 1%
- 100% role-first compliant locators in newly generated specs
- Correlated Salesforce backend logging for all DML operations
- Real-time selector drift detection on Salesforce quarterly release updates
