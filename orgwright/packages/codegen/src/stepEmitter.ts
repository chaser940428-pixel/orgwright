import { ResolvedAction, TestStep } from '@orgwright/core';

export interface StepEmitterOptions {
  pageVar?: string;
  encounterPageVar?: string;
  basePageVar?: string;
  indent?: string;
}

/**
 * Escapes characters for safe inclusion in regular expressions.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Returns a TypeScript expression for a step value. Values containing {{tokens}}
 * (e.g. "Acme {{unique}}", "{{today+7}}", "{{caseId}}") are resolved at run time
 * by OrgwrightData so every run gets fresh data; plain values are emitted as literals.
 */
export function valueExpr(value: unknown): string {
  const str = String(value ?? '');
  return /\{\{[^{}]+\}\}/.test(str) ? `OrgwrightData.resolve(${JSON.stringify(str)})` : JSON.stringify(str);
}

/** True when any step in the list uses {{tokens}} or remembers values (spec must import OrgwrightData). */
export function stepsUseTestData(steps: TestStep[]): boolean {
  return steps.some(
    (st) => /\{\{[^{}]+\}\}/.test(st.rawText) || st.action?.type === 'remember_value' || st.action?.type === 'api_create'
  );
}

/** True when any step creates records through the API (spec must import SalesforceApi). */
export function stepsUseApi(steps: TestStep[]): boolean {
  return steps.some((st) => st.action?.type === 'api_create');
}

/**
 * Emits Playwright TypeScript statements for a single resolved action.
 */
export function emitActionCode(
  action: ResolvedAction,
  rawText?: string,
  options: StepEmitterOptions = {}
): string {
  const page = options.pageVar || 'page';
  const encounterPage = options.encounterPageVar || 'encounterPage';
  const basePage = options.basePageVar || 'basePage';
  const indent = options.indent || '    ';

  const lines: string[] = [];

  switch (action.type) {
    case 'navigate_app': {
      if (/salesforce\s*home|salesforce|home/i.test(action.target)) {
        lines.push(`await ${page}.goto('/lightning/page/home', { waitUntil: 'domcontentloaded' });`);
        lines.push(`await expect(${page}).toHaveURL(/lightning|one\\.app/);`);
        lines.push(`await LightningHelpers.waitForLightningReady(${page});`);
      } else {
        lines.push(`await LightningHelpers.openApp(${page}, ${valueExpr(action.target)});`);
      }
      break;
    }

    case 'select_list_view': {
      lines.push(`await LightningHelpers.selectListView(${page}, ${valueExpr(action.value ?? action.target)});`);
      break;
    }

    case 'select_list_records': {
      const mode = String(action.extra?.mode || 'names');
      const checked = action.extra?.checked === false ? 'false' : 'true';
      if (mode === 'all') {
        lines.push(`await LightningHelpers.selectAllListRecords(${page}, ${checked});`);
      } else if (mode === 'first') {
        lines.push(`await LightningHelpers.selectFirstListRecords(${page}, ${Number(action.extra?.count) || 1});`);
      } else {
        const names = ((action.extra?.names as string[]) || []).map((n) => valueExpr(n)).join(', ');
        lines.push(`await LightningHelpers.selectListRecords(${page}, [${names}], ${checked});`);
      }
      break;
    }

    case 'app_launcher_open': {
      lines.push(`await LightningHelpers.openAppLauncher(${page});`);
      break;
    }

    case 'nav_tab': {
      const tabName = action.tab || action.target;
      const objectApi = action.extra?.objectApi ? `, ${JSON.stringify(String(action.extra.objectApi))}` : '';
      lines.push(`await LightningHelpers.selectNavTab(${page}, ${valueExpr(tabName)}${objectApi});`);
      break;
    }

    case 'open_list': {
      const objName = action.target || 'Account';
      lines.push(`await ${basePage}.navigateToObjectList(${JSON.stringify(objName)}, 'Recent');`);
      lines.push(`await expect(${page}).toHaveURL(/${escapeRegex(objName)}/);`);
      break;
    }

    case 'open_record': {
      const isEncounter = /encounter/i.test(action.target);
      const recordVal = action.value ? String(action.value) : 'Recent';

      if (/\{\{[^{}]+\}\}/.test(recordVal)) {
        lines.push(`await ${basePage}.navigateToRecord(${valueExpr(recordVal)});`);
        lines.push(`await LightningHelpers.waitForLightningReady(${page});`);
      } else if (isEncounter) {
        lines.push(`await ${encounterPage}.openEncounter(${JSON.stringify(recordVal)});`);
      } else if (recordVal.startsWith('00') || recordVal.startsWith('a0') || recordVal.startsWith('a2')) {
        lines.push(`await ${basePage}.navigateToRecord(${JSON.stringify(recordVal)});`);
      } else {
        lines.push(`await ${basePage}.navigateToObjectList(${JSON.stringify(action.target)}, 'Recent');`);
        lines.push(`const recordRow = ${page}.locator('tbody tr th a, tbody tr td a[data-refid="recordId"], tbody tr a').first();`);
        lines.push(`await recordRow.waitFor({ state: 'visible', timeout: 20000 });`);
        lines.push(`await recordRow.click();`);
        lines.push(`await LightningHelpers.waitForLightningReady(${page});`);
      }
      break;
    }

    case 'activate_tab': {
      const tabName = action.tab || action.target || 'Details';
      // No visibility guard: a missing tab must fail the step instead of silently skipping it
      lines.push(`const tabLocator = ${page}.getByRole('tab', { name: /${escapeRegex(tabName)}/i }).first();`);
      lines.push(`await tabLocator.click({ timeout: 15000 });`);
      lines.push(`await LightningHelpers.waitForLightningReady(${page});`);
      break;
    }

    case 'create_note': {
      const title = action.extra?.title ? String(action.extra.title) : 'Audit';
      const body = action.extra?.body ? String(action.extra.body) : '';
      lines.push(`await ${encounterPage}.createNote(${JSON.stringify(title)}, ${JSON.stringify(body)});`);
      break;
    }

    case 'sync_notes': {
      lines.push(`await ${encounterPage}.clickSyncNotes(true);`);
      break;
    }

    case 'click_action': {
      if (action.target === 'WaitForFields') {
        lines.push(`await LightningHelpers.waitForPageSettled(${page});`);
      } else if (/sync.*property|sync.*note/i.test(action.target)) {
        lines.push(`await ${encounterPage}.clickSyncNotes(true);`);
      } else if (/^[a-zA-Z0-9]{15,18}/i.test(action.target) || /\brecord\b/i.test(action.target)) {
        const cleanTarget = action.target.replace(/\s+record$/i, '').trim();
        lines.push(`const recordLink = ${page}.getByRole('link', { name: /${escapeRegex(cleanTarget)}/i })`);
        lines.push(`  .or(${page}.locator('tbody tr th a, tbody tr td a[data-refid="recordId"], tbody tr a').filter({ hasText: /${escapeRegex(cleanTarget)}/i }))`);
        lines.push(`  .or(${page}.locator('tbody tr th a, tbody tr a').first());`);
        lines.push(`await recordLink.waitFor({ state: 'visible', timeout: 20000 });`);
        lines.push(`await recordLink.click();`);
        lines.push(`await LightningHelpers.waitForLightningReady(${page});`);
      } else {
        lines.push(`await LightningHelpers.clickButton(${page}, /${escapeRegex(action.target)}/i);`);
      }
      break;
    }

    case 'fill_field': {
      const fieldName = action.field || action.target;
      const valStr = action.value !== undefined ? String(action.value) : '';
      const cleanField = fieldName ? fieldName.replace(/__c$/i, '').replace(/_/g, ' ').trim() : '';
      const regexPattern = cleanField && cleanField !== fieldName
        ? `${escapeRegex(cleanField).replace(/['’]/g, '.?')}|${escapeRegex(fieldName).replace(/['’]/g, '.?')}`
        : escapeRegex(fieldName).replace(/['’]/g, '.?');

      if (fieldName && fieldName !== 'ActiveField' && valStr) {
        lines.push(`const input = ${page}.getByRole('textbox', { name: /${regexPattern}/i })`);
        lines.push(`  .or(${page}.getByRole('spinbutton', { name: /${regexPattern}/i }))`);
        lines.push(`  .or(${page}.getByLabel(/${regexPattern}/i))`);
        lines.push(`  .or(${page}.locator('records-record-layout-item, .slds-form-element, lightning-textarea, lightning-input').filter({ hasText: /${regexPattern}/i }).locator('textarea, input'))`);
        lines.push(`  .first();`);
        lines.push(`await input.waitFor({ state: 'visible', timeout: 15000 });`);
        lines.push(`await input.click();`);
        lines.push(`await input.fill(${valueExpr(valStr)});`);
        lines.push(`await input.press('Tab');`);
        lines.push(`await LightningHelpers.waitForLightningReady(${page});`);
      } else if (fieldName && fieldName !== 'ActiveField' && !valStr) {
        lines.push(`const input = ${page}.getByRole('textbox', { name: /${regexPattern}/i })`);
        lines.push(`  .or(${page}.getByRole('spinbutton', { name: /${regexPattern}/i }))`);
        lines.push(`  .or(${page}.getByLabel(/${regexPattern}/i))`);
        lines.push(`  .or(${page}.locator('records-record-layout-item, .slds-form-element, lightning-textarea, lightning-input').filter({ hasText: /${regexPattern}/i }).locator('textarea, input'))`);
        lines.push(`  .first();`);
        lines.push(`await input.waitFor({ state: 'visible', timeout: 15000 });`);
        lines.push(`await input.click();`);
        lines.push(`await LightningHelpers.waitForLightningReady(${page});`);
      } else if (valStr) {
        lines.push(`const input = ${page}.locator(':focus, textarea:visible, input:visible').first();`);
        lines.push(`await input.fill(${valueExpr(valStr)});`);
        lines.push(`await input.press('Tab');`);
        lines.push(`await LightningHelpers.waitForLightningReady(${page});`);
      }
      break;
    }

    case 'select_picklist': {
      const fieldName = action.field || (action.value === undefined ? action.target : undefined);
      const valStr = action.value !== undefined ? String(action.value) : '';

      if (fieldName && valStr) {
        lines.push(`await LightningHelpers.selectCombobox(${page}, ${JSON.stringify(fieldName)}, ${valueExpr(valStr)});`);
      } else if (fieldName && !valStr) {
        lines.push(`const dropdown = ${page}.getByRole('combobox', { name: /${escapeRegex(fieldName)}/i })`);
        lines.push(`  .or(${page}.getByLabel(/${escapeRegex(fieldName)}/i))`);
        lines.push(`  .or(${page}.locator('lightning-combobox, records-record-layout-item, .slds-form-element').filter({ hasText: /${escapeRegex(fieldName)}/i }).locator('button, select, input, [role="combobox"]'))`);
        lines.push(`  .first();`);
        lines.push(`await dropdown.waitFor({ state: 'visible', timeout: 15000 });`);
        lines.push(`await dropdown.click();`);
        lines.push(`await LightningHelpers.waitForLightningReady(${page});`);
      } else if (!fieldName && valStr) {
        lines.push(`const optionLabel = ${valueExpr(valStr)};`);
        lines.push(`const selectEl = ${page}.locator('select:visible').filter({ has: ${page}.locator('option', { hasText: optionLabel }) }).first();`);
        lines.push(`if (await selectEl.isVisible().catch(() => false)) {`);
        lines.push(`  await selectEl.selectOption({ label: optionLabel });`);
        lines.push(`} else {`);
        lines.push(`  const option = ${page}.locator('lightning-base-combobox-item, [role="option"]').filter({ hasText: optionLabel })`);
        lines.push(`    .or(${page}.locator(\`span[title="\${optionLabel}"]\`)).first();`);
        lines.push(`  await option.waitFor({ state: 'visible', timeout: 15000 });`);
        lines.push(`  await option.click();`);
        lines.push(`}`);
        lines.push(`await LightningHelpers.waitForLightningReady(${page});`);
      }
      break;
    }

    case 'select_lookup': {
      const fieldName = action.field || action.target;
      const valStr = action.value !== undefined ? String(action.value) : '';
      lines.push(`const lookupValue = ${valueExpr(valStr)};`);
      lines.push(`const lookupInput = ${page}.locator('lightning-grouped-combobox, records-record-layout-item').filter({ hasText: ${JSON.stringify(fieldName)} }).locator('input').first();`);
      lines.push(`await lookupInput.fill(lookupValue);`);
      lines.push(`const lookupOption = ${page}.locator('lightning-base-combobox-item, [role="option"]').filter({ hasText: lookupValue }).first();`);
      lines.push(`await lookupOption.waitFor({ state: 'visible', timeout: 15000 });`);
      lines.push(`await lookupOption.click();`);
      lines.push(`await LightningHelpers.waitForLightningReady(${page});`);
      break;
    }

    case 'set_checkbox': {
      const fieldName = action.field || action.target;
      const checked = Boolean(action.value);
      lines.push(`const checkboxContainer = ${page}.locator('records-record-layout-item:has-text("${fieldName}"), lightning-input:has-text("${fieldName}")').first();`);
      lines.push(`await LightningHelpers.setCheckbox(${page}, checkboxContainer, ${checked});`);
      break;
    }

    case 'save_modal': {
      lines.push(`await LightningHelpers.clickButton(${page}, /Save|Confirm|Proceed|OK/i);`);
      break;
    }

    case 'close_modal': {
      lines.push(`await LightningHelpers.clickButton(${page}, /Cancel|Close|Dismiss/i);`);
      break;
    }

    case 'assert_toast': {
      const toastSnippet = String(action.value || action.target || 'Success');
      lines.push(`await LightningHelpers.verifyToastMessage(${page}, ${valueExpr(toastSnippet)});`);
      break;
    }

    case 'assert_field': {
      const fieldName = action.field || action.target;
      lines.push(`const fieldValue = await ${encounterPage}.getFieldValue(${JSON.stringify(fieldName)});`);
      if (action.value === '__NOT_EMPTY__') {
        lines.push(`expect(fieldValue.trim().length).toBeGreaterThan(0);`);
      } else {
        const expectedVal = String(action.value ?? '');
        lines.push(`expect(fieldValue).toContain(${valueExpr(expectedVal)});`);
      }
      break;
    }

    case 'assert_visible': {
      const itemText = String(action.value || action.target || '');
      lines.push(`const visibleElement = ${page}.getByText(${valueExpr(itemText)}).first();`);
      lines.push(`await expect(visibleElement).toBeVisible({ timeout: 15000 });`);
      break;
    }

    case 'assert_not_visible': {
      const kind = String(action.extra?.kind || 'any');
      lines.push(`await LightningHelpers.verifyNotAvailable(${page}, ${valueExpr(action.target)}, ${JSON.stringify(kind)});`);
      break;
    }

    case 'assert_field_readonly': {
      const fieldName = action.field || action.target;
      lines.push(`await LightningHelpers.verifyFieldReadOnly(${page}, ${JSON.stringify(fieldName)});`);
      break;
    }

    case 'assert_field_editable': {
      const fieldName = action.field || action.target;
      lines.push(`await LightningHelpers.verifyFieldEditable(${page}, ${JSON.stringify(fieldName)});`);
      break;
    }

    case 'assert_field_error': {
      const message = String(action.value ?? '');
      const fieldArg = action.field ? `, ${JSON.stringify(action.field)}` : '';
      lines.push(`await LightningHelpers.verifyFieldError(${page}, ${valueExpr(message)}${fieldArg});`);
      break;
    }

    case 'remember_value': {
      const varName = String(action.value || action.extra?.varName || 'value');
      if (action.extra?.source === 'recordId') {
        lines.push(`OrgwrightData.set(${JSON.stringify(varName)}, await LightningHelpers.currentRecordId(${page}));`);
      } else {
        const fieldName = action.field || action.target;
        lines.push(`OrgwrightData.set(${JSON.stringify(varName)}, await LightningHelpers.readFieldValue(${page}, ${JSON.stringify(fieldName)}));`);
      }
      break;
    }

    case 'related_list_open': {
      lines.push(`await LightningHelpers.openRelatedList(${page}, ${valueExpr(action.target)});`);
      break;
    }

    case 'related_list_action': {
      lines.push(`await LightningHelpers.relatedListAction(${page}, ${valueExpr(action.target)}, ${valueExpr(action.value)});`);
      break;
    }

    case 'assert_related_count': {
      const op = String(action.extra?.op || '=');
      lines.push(`await LightningHelpers.verifyRelatedListCount(${page}, ${valueExpr(action.target)}, ${JSON.stringify(op)}, ${Number(action.value) || 0});`);
      break;
    }

    case 'path_select': {
      lines.push(`await LightningHelpers.selectPathStage(${page}, ${valueExpr(action.value ?? action.target)}, ${JSON.stringify(action.extra?.mark === 'complete' ? 'complete' : 'current')});`);
      break;
    }

    case 'select_record_type': {
      lines.push(`await LightningHelpers.chooseRecordType(${page}, ${valueExpr(action.value ?? action.target)});`);
      break;
    }

    case 'dual_listbox': {
      const fieldName = action.field || action.target;
      lines.push(`await LightningHelpers.moveDualListboxOption(${page}, ${JSON.stringify(fieldName)}, ${valueExpr(action.value)}, ${JSON.stringify(action.extra?.to === 'available' ? 'available' : 'chosen')});`);
      break;
    }

    case 'delete_record': {
      lines.push(`await LightningHelpers.deleteRecord(${page});`);
      break;
    }

    case 'change_owner': {
      lines.push(`await LightningHelpers.changeOwner(${page}, ${valueExpr(action.value)});`);
      break;
    }

    case 'global_search': {
      lines.push(`await LightningHelpers.globalSearch(${page}, ${valueExpr(action.value ?? action.target)}, ${action.extra?.open ? 'true' : 'false'});`);
      break;
    }

    case 'inline_edit': {
      const fieldName = action.field || action.target;
      lines.push(`await LightningHelpers.inlineEdit(${page}, ${JSON.stringify(fieldName)}, ${valueExpr(action.value)});`);
      break;
    }

    case 'submit_for_approval': {
      lines.push(`await LightningHelpers.submitForApproval(${page}, ${valueExpr(action.value || '')});`);
      break;
    }

    case 'convert_lead': {
      lines.push(`await LightningHelpers.convertLead(${page});`);
      break;
    }

    case 'api_create': {
      const apiObject = String(action.extra?.apiObject || action.target);
      const apiFields = (action.extra?.apiFields || {}) as Record<string, string>;
      const varName = String(action.value || action.extra?.varName || 'recordId');
      const fieldExprs = Object.entries(apiFields).map(([k, v]) => `${JSON.stringify(k)}: ${valueExpr(v)}`).join(', ');
      lines.push(`OrgwrightData.set(${JSON.stringify(varName)}, await SalesforceApi.createRecord(${JSON.stringify(apiObject)}, { ${fieldExprs} }));`);
      break;
    }

    case 'run_apex': {
      // Apex execution is not implemented yet: fail instead of pretending it ran
      const snippet = String(action.value || action.target);
      lines.push(`throw new Error(${JSON.stringify(`Run Apex is not supported yet - this step did not run: ${snippet}`)});`);
      break;
    }

    case 'scroll': {
      const dir = action.target?.toLowerCase() || 'down';
      const amount = typeof action.value === 'number' ? action.value : (parseInt(String(action.value || '500'), 10) || 500);

      if (dir.includes('up') || dir === 'top') {
        const delta = dir === 'top' ? -5000 : -Math.abs(amount);
        lines.push(`await LightningHelpers.scrollPage(${page}, ${delta});`);
      } else if (dir.includes('down') || dir === 'bottom') {
        const delta = dir === 'bottom' ? 5000 : Math.abs(amount);
        lines.push(`await LightningHelpers.scrollPage(${page}, ${delta});`);
      } else {
        const targetName = action.target.replace(/^to\s+/i, '').replace(/["']/g, '').trim();
        lines.push(`await LightningHelpers.scrollToElement(${page}, /${escapeRegex(targetName)}/i);`);
      }
      break;
    }

    case 'custom':
    default: {
      // Unrecognised step: fail loudly so the test never passes without doing what the step says
      const desc = rawText || action.target || 'Custom Action';
      lines.push(`throw new Error(${JSON.stringify(`Orgwright does not understand this step: "${desc}". Rephrase it or edit the generated code.`)});`);
      break;
    }
  }

  return lines.map(line => indent + line).join('\n');
}

/**
 * Emits full code block for a TestStep including header comment.
 */
export function emitStepCode(step: TestStep, options: StepEmitterOptions = {}): string {
  const indent = options.indent || '    ';
  const pageVar = options.pageVar || 'page';
  const rawComment = `${indent}// Step ${step.index}: ${step.rawText}`;

  if (!step.action) {
    // Unresolved step: fail inside runStep so the Studio pauses on it instead of passing silently
    const msg = JSON.stringify(`Orgwright does not understand this step: "${step.rawText}". Rephrase it or edit the generated code.`);
    return `${rawComment}\n${indent}await StreamHelper.runStep(${pageVar}, ${JSON.stringify(step.rawText)}, async () => {\n${indent}  throw new Error(${msg});\n${indent}});`;
  }

  const actionCode = emitActionCode(step.action, step.rawText, options);
  const indentedActionCode = actionCode.split('\n').map(l => '  ' + l).join('\n');
  // runStep marks the step in telemetry and, in the Studio, pauses on failure so the tester can repair it
  return `${rawComment}\n${indent}await StreamHelper.runStep(${pageVar}, ${JSON.stringify(step.rawText)}, async () => {\n${indentedActionCode}\n${indent}});`;
}
