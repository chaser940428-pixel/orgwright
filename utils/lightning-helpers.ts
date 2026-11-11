import { Page, Locator, expect } from '@playwright/test';

export class LightningHelpers {
  /**
   * Waits for all active Salesforce SLDS spinners to disappear from the DOM.
   * Salesforce Lightning uses async Aura and LWC components which display spinners while data loads.
   */
  /** In-flight Lightning server calls (Aura / UI API / Apex), tracked per page. */
  private static pendingRequests = new WeakMap<Page, Set<unknown>>();

  private static trackRequests(page: Page): Set<unknown> {
    const existing = this.pendingRequests.get(page);
    if (existing) return existing;
    const pending = new Set<unknown>();
    const isLightningCall = (url: string) => /\/aura\?|\/ui-api\/|\/apexremote|\/services\/data\//.test(url);
    page.on('request', (r) => {
      if (isLightningCall(r.url())) pending.add(r);
    });
    page.on('requestfinished', (r) => pending.delete(r));
    page.on('requestfailed', (r) => pending.delete(r));
    this.pendingRequests.set(page, pending);
    return pending;
  }

  /**
   * Salesforce shows in-app guidance ("Try the new Salesforce Setup", feature tours) at random moments.
   * Their mask blocks every click on the page, so dismiss them automatically whenever one appears.
   * Set ORGWRIGHT_KEEP_PROMPTS=1 to turn this off (e.g. when a test checks a prompt on purpose).
   */
  static async dismissInAppPrompts(page: Page): Promise<void> {
    if (process.env.ORGWRIGHT_KEEP_PROMPTS === '1') return;
    const dismiss = page.getByRole('button', { name: /^(Dismiss|Remind Me Later)$/ }).first();
    await page.addLocatorHandler(dismiss, async () => {
      await dismiss.click({ timeout: 5000 }).catch(() => {});
    }, { noWaitAfter: true });
  }

  /**
   * Waits for SLDS spinners to disappear and in-flight Lightning server calls to finish.
   * Replaces fixed sleeps: returns in ~100ms when the page is already idle.
   */
  static async waitForLightningReady(page: Page, timeoutMs = 12000): Promise<void> {
    const pending = this.trackRequests(page);
    try {
      const spinner = page.locator('.slds-spinner_container:visible, lightning-spinner:visible, .slds-spinner:visible');
      if (await spinner.count() > 0) {
        await spinner.first().waitFor({ state: 'hidden', timeout: timeoutMs });
      }
    } catch {
      // Continue if spinner hidden or transient
    }
    const deadline = Date.now() + Math.min(timeoutMs, 3000);
    while (pending.size > 0 && Date.now() < deadline) {
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(100);
  }

  /**
   * Stronger wait used by "Wait for page to load": DOM loaded, spinners gone and no Lightning
   * server call for 500ms (capped at 8s so background polling can't hang the test).
   */
  static async waitForPageSettled(page: Page): Promise<void> {
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await this.waitForLightningReady(page, 20000);
    const pending = this.trackRequests(page);
    const deadline = Date.now() + 8000;
    let quietSince = Date.now();
    while (Date.now() < deadline) {
      if (pending.size > 0) quietSince = Date.now();
      else if (Date.now() - quietSince >= 500) break;
      await page.waitForTimeout(100);
    }
  }

  /**
   * Universally selects an option from a Salesforce dropdown (lightning-combobox or SLDS <select> in Flows/Modals).
   */
  static async selectCombobox(page: Page, fieldOrLocator: Locator | string, optionLabel: string): Promise<void> {
    let combobox: Locator;
    if (typeof fieldOrLocator === 'string') {
      const name = fieldOrLocator;
      combobox = page.getByRole('combobox', { name: new RegExp(name, 'i') })
        .or(page.getByLabel(new RegExp(`^\\W*${name}\\W*$`, 'i')))
        .or(page.locator(`select[name*="${name}" i], select[id*="${name}" i]`))
        .or(page.locator('lightning-combobox, records-record-layout-item, .slds-form-element').filter({ hasText: new RegExp(name, 'i') }).locator('button, select, input, [role="combobox"]'))
        .filter({ visible: true }).first();
    } else {
      combobox = fieldOrLocator;
    }

    await combobox.waitFor({ state: 'visible', timeout: 15000 });
    await combobox.scrollIntoViewIfNeeded();

    const tagName = await combobox.evaluate(el => el.tagName.toLowerCase()).catch(() => '');
    if (tagName === 'select') {
      await combobox.selectOption({ label: optionLabel });
      await this.waitForLightningReady(page);
      return;
    }

    await combobox.click();
    await page.waitForTimeout(300);

    const option = page.locator(`lightning-base-combobox-item:has-text("${optionLabel}"), [role="option"]:has-text("${optionLabel}"), lightning-base-combobox-item [title="${optionLabel}"]`).first();
    await option.waitFor({ state: 'visible', timeout: 10000 });
    await option.click();
    await this.waitForLightningReady(page);
  }

  /**
   * Sets checkbox value respecting Salesforce Lightning faux elements.
   */
  static async setCheckbox(page: Page, checkboxContainer: Locator, checked = true): Promise<void> {
    const input = checkboxContainer.locator('input[type="checkbox"]');
    const isChecked = await input.isChecked();
    if (isChecked !== checked) {
      const faux = checkboxContainer.locator('.slds-checkbox__label, .slds-checkbox--faux');
      if (await faux.isVisible()) {
        await faux.click();
      } else {
        await input.click({ force: true });
      }
    }
    await this.waitForLightningReady(page);
  }

  /**
   * Fills an input inside a standard lightning-input wrapper.
   */
  static async fillLightningInput(page: Page, inputContainer: Locator, value: string): Promise<void> {
    const input = inputContainer.locator('input, textarea').first();
    await input.waitFor({ state: 'visible', timeout: 8000 });
    await input.fill(value);
    await input.press('Tab'); // Trigger onchange/onblur lifecycle
  }

  /**
   * Verifies an SLDS Toast notification banner message.
   */
  static async verifyToastMessage(page: Page, expectedSnippet: string): Promise<void> {
    const toast = page.locator('.forceVisualMessageQueue .toastMessage, .slds-theme_success, .slds-notify_toast');
    await expect(toast).toContainText(expectedSnippet, { timeout: 15000 });
  }

  /**
   * Intelligently scrolls a Salesforce Lightning page or active modal dialog.
   * Salesforce puts overflow:hidden on window/body, so scrolling must target the active scroll container.
   */
  static async scrollPage(page: Page, deltaY = 500): Promise<void> {
    try {
      // 1. Dispatch mouse wheel at current mouse position
      await page.mouse.wheel(0, deltaY).catch(() => {});

      // 2. Evaluate DOM scroll on the active modal, detail panel, or scrollable container
      await page.evaluate((dy) => {
        const candidates = [
          document.querySelector('.slds-modal__content'),
          document.querySelector('.forceDetailPanelFix'),
          document.querySelector('.flexipageDefaultAppPage'),
          document.querySelector('.slds-scrollable_y'),
          document.querySelector('div[class*="scrollable"]'),
          document.querySelector('main'),
          document.querySelector('.oneAppNavContainer')
        ];

        for (const el of candidates) {
          if (el && el.scrollHeight > el.clientHeight) {
            el.scrollBy({ top: dy, behavior: 'smooth' });
            return;
          }
        }

        // Fallback to window/document
        window.scrollBy({ top: dy, behavior: 'smooth' });
        if (document.documentElement) {
          document.documentElement.scrollBy({ top: dy, behavior: 'smooth' });
        }
      }, deltaY).catch(() => {});

      await page.waitForTimeout(300);
      await this.waitForLightningReady(page, 4000);
    } catch {
      // Continue even if scroll was boundary-limited
    }
  }

  /**
   * Scrolls a specific element or button into view inside Salesforce Lightning.
   */
  static async scrollToElement(page: Page, target: string | RegExp): Promise<void> {
    try {
      const loc = page.getByRole('button', { name: target })
        .or(page.getByRole('link', { name: target }))
        .or(page.getByLabel(target))
        .or(page.locator(`button:has-text("${target}"), a:has-text("${target}")`))
        .first();

      if (await loc.count() > 0) {
        await loc.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(200);
      }
    } catch {}
  }

  /**
   * Clicks a button by visible text or role with resilient scrolling, modal awareness, and dropdown auto-expansion.
   */
  static async clickButton(page: Page, name: string | RegExp): Promise<void> {
    // 1. Check direct button first
    const directButton = page.getByRole('button', { name })
      .or(page.locator(`button:has-text("${name}"), lightning-button button:has-text("${name}")`))
      .first();

    try {
      if (await directButton.count() > 0 && await directButton.isVisible()) {
        await directButton.scrollIntoViewIfNeeded().catch(() => {});
        await directButton.click({ timeout: 4000 });
        await this.waitForLightningReady(page);
        return;
      }
    } catch {
      // Direct click failed or intercepted; continue to fallback strategies
    }

    // 2. Check inside active modal or quick action panel
    const modal = page.locator('.slds-modal__container, lightning-quick-action-panel, .slds-modal').first();
    if (await modal.count() > 0 && await modal.isVisible()) {
      const modalBtn = modal.getByRole('button', { name })
        .or(modal.locator(`button:has-text("${name}")`))
        .first();
      if (await modalBtn.count() > 0) {
        await modalBtn.scrollIntoViewIfNeeded().catch(() => {});
        try {
          await modalBtn.click({ timeout: 5000 });
        } catch {
          await modalBtn.click({ force: true });
        }
        await this.waitForLightningReady(page);
        return;
      }
    }

    // 3. Scroll down in case button is below the fold
    await this.scrollPage(page, 400);
    if (await directButton.count() > 0) {
      await directButton.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {});
      try {
        await directButton.click({ timeout: 5000 });
        await this.waitForLightningReady(page);
        return;
      } catch {
        // Fallback to force click
        try {
          await directButton.click({ force: true, timeout: 3000 });
          await this.waitForLightningReady(page);
          return;
        } catch {}
      }
    }

    // 4. Check if button is collapsed inside Salesforce "Show more actions" menu
    const moreActionsBtn = page.getByRole('button', { name: /Show more actions|More Actions/i })
      .or(page.locator('lightning-button-menu button, button[aria-label="Show more actions"]'))
      .first();

    if (await moreActionsBtn.count() > 0 && await moreActionsBtn.isVisible()) {
      await moreActionsBtn.click();
      await page.waitForTimeout(400);

      const menuItem = page.getByRole('menuitem', { name })
        .or(page.locator(`runtime_platform_actions-action-renderer:has-text("${name}"), [role="menuitem"]:has-text("${name}")`))
        .first();

      if (await menuItem.waitFor({ state: 'visible', timeout: 4000 }).then(() => true, () => false)) {
        await menuItem.click();
        await this.waitForLightningReady(page);
        return;
      }
    }

    // Final attempt: scroll to top and click with force
    await directButton.scrollIntoViewIfNeeded().catch(() => {});
    await directButton.click({ force: true, timeout: 8000 });
    await this.waitForLightningReady(page);
  }

  // ---------------------------------------------------------------------------------------
  // Field reading, negative checks and permission checks (used by Orgwright generated specs).
  // All failures throw plain-language errors so the Studio can show them to testers as-is.
  // ---------------------------------------------------------------------------------------

  private static escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private static readonly ERROR_SELECTORS = [
    '.slds-form-element__help',
    '[data-error-message]',
    'records-record-edit-error',
    'records-record-edit-error-header',
    'force-record-edit-error-header',
    '.forceFormPageError',
    '.pageLevelErrors',
    '.slds-popover_error',
    '.genericError',
    '.errorsList',
    '[role="alert"]',
    '.slds-theme_error',
    '.slds-notify_toast.slds-theme_error'
  ].join(', ');

  /** Locates the layout item / form element that owns the field with the given visible label. */
  static fieldContainer(page: Page, label: string): Locator {
    const exact = new RegExp(`^\\s*\\*?\\s*${this.escapeRegex(label)}\\s*$`, 'i');
    const labelEl = page.locator(
      '.test-id__field-label, .slds-form-element__label, label, legend, span.slds-text-title, p.slds-text-title'
    ).filter({ hasText: exact });
    return page
      .locator(
        'records-record-layout-item, records-highlights-details-item, lightning-input-field, lightning-output-field, lightning-input, lightning-textarea, lightning-combobox, lightning-checkbox-group, .slds-form-element'
      )
      .filter({ has: labelEl })
      .first();
  }

  private static async visibleTexts(loc: Locator, max = 5): Promise<string[]> {
    const out: string[] = [];
    const n = Math.min(await loc.count().catch(() => 0), 25);
    for (let i = 0; i < n && out.length < max; i++) {
      const el = loc.nth(i);
      if (await el.isVisible().catch(() => false)) {
        const t = (await el.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
        if (t && !out.includes(t)) out.push(t);
      }
    }
    return out;
  }

  private static async anyVisible(loc: Locator): Promise<boolean> {
    const n = await loc.count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      if (await loc.nth(i).isVisible().catch(() => false)) return true;
    }
    return false;
  }

  /** Reads a field's displayed value (without its label) from a record page or edit form. */
  static async readFieldValue(page: Page, label: string): Promise<string> {
    await this.waitForLightningReady(page);
    const item = this.fieldContainer(page, label);
    try {
      await item.waitFor({ state: 'visible', timeout: 15000 });
    } catch {
      throw new Error(`Could not find a field labelled "${label}" on the page to read its value. Check the label matches what Salesforce shows, or open the Details tab first.`);
    }

    const output = item.locator(
      'lightning-formatted-text, lightning-formatted-name, lightning-formatted-number, lightning-formatted-date-time, lightning-formatted-email, lightning-formatted-phone, lightning-formatted-url, lightning-formatted-rich-text, lightning-formatted-address, force-lookup a, records-hoverable-link a, .slds-form-element__static'
    ).first();
    if (await output.count() > 0) {
      const t = (await output.innerText().catch(() => '')).trim();
      if (t) return t;
    }

    const input = item.locator('input:not([type="hidden"]):not([type="checkbox"]), textarea').first();
    if (await input.count() > 0) {
      const v = (await input.inputValue().catch(() => '')).trim();
      if (v) return v;
    }

    const lines = (await item.innerText()).split('\n').map((l) => l.trim()).filter(Boolean);
    return lines
      .filter((l) => l.replace(/^\*\s*/, '').toLowerCase() !== label.toLowerCase())
      .filter((l) => !/^(edit|help|change)\b/i.test(l))
      .join(' ')
      .trim();
  }

  /** Returns the 15/18-char Id of the record currently open in Lightning. */
  static async currentRecordId(page: Page): Promise<string> {
    await page.waitForURL(/\/lightning\/r\/[^/]+\/[a-zA-Z0-9]{15,18}\//, { timeout: 20000 }).catch(() => {});
    const m = page.url().match(/\/lightning\/r\/(?:[^/]+\/)?([a-zA-Z0-9]{18}|[a-zA-Z0-9]{15})(?:\/|$)/);
    if (!m) {
      throw new Error(`No record is open (current page: ${page.url()}). Save or open a record before remembering its Id.`);
    }
    return m[1];
  }

  /**
   * Permission / negative check: asserts that a button, action, tab, link, field or text is
   * NOT available to the current user. Buttons are also checked inside the "Show more actions" menu.
   */
  static async verifyNotAvailable(page: Page, name: string, kind = 'any'): Promise<void> {
    await this.waitForLightningReady(page);
    await page.waitForTimeout(1000); // let dynamic actions render before asserting absence
    const nameRe = new RegExp(`^\\s*${this.escapeRegex(name)}\\s*$`, 'i');

    if (kind === 'field') {
      if (await this.anyVisible(this.fieldContainer(page, name))) {
        throw new Error(`Field "${name}" is visible to this user, but the test expected it to be hidden (check field-level security / page layout).`);
      }
      return;
    }
    if (kind === 'tab') {
      if (await this.anyVisible(page.getByRole('tab', { name: nameRe }))) {
        throw new Error(`Tab "${name}" is visible, but the test expected it to be hidden.`);
      }
      return;
    }
    if (kind === 'link') {
      if (await this.anyVisible(page.getByRole('link', { name: nameRe }))) {
        throw new Error(`Link "${name}" is visible, but the test expected it to be hidden.`);
      }
      return;
    }

    // Buttons / actions (also the default for "any")
    if (await this.anyVisible(page.getByRole('button', { name: nameRe }).or(page.getByRole('menuitem', { name: nameRe })))) {
      throw new Error(`"${name}" is available to this user as a button, but the test expected it to be hidden (check profile/permission set and page layout actions).`);
    }

    const moreActions = page.getByRole('button', { name: /Show more actions|More Actions/i });
    const menus = await moreActions.count().catch(() => 0);
    for (let i = 0; i < menus; i++) {
      const btn = moreActions.nth(i);
      if (!(await btn.isVisible().catch(() => false))) continue;
      await btn.click().catch(() => {});
      await page.waitForTimeout(500);
      const inMenu = await this.anyVisible(page.getByRole('menuitem', { name: nameRe }));
      await page.keyboard.press('Escape').catch(() => {});
      if (inMenu) {
        throw new Error(`"${name}" is available to this user in the "Show more actions" menu, but the test expected it to be hidden.`);
      }
    }

    if (kind === 'any') {
      if (await this.anyVisible(this.fieldContainer(page, name))) {
        throw new Error(`Field "${name}" is visible to this user, but the test expected it to be hidden.`);
      }
      if (await this.anyVisible(page.getByText(nameRe))) {
        throw new Error(`"${name}" is visible on the page, but the test expected it to be hidden.`);
      }
    }
  }

  private static editableInputs(item: Locator): Locator {
    return item.locator(
      'input:not([disabled]):not([readonly]):not([type="hidden"]), textarea:not([disabled]):not([readonly]), button[role="combobox"]:not([disabled]):not([aria-disabled="true"]), input[role="combobox"]:not([disabled]):not([readonly])'
    );
  }

  private static inlineEditButtons(item: Locator): Locator {
    return item.locator('button.inline-edit-trigger, button[title^="Edit "], button:has(.inline-edit-trigger-icon)');
  }

  private static async requireField(page: Page, label: string, purpose: string): Promise<Locator> {
    await this.waitForLightningReady(page);
    const item = this.fieldContainer(page, label);
    try {
      await item.waitFor({ state: 'visible', timeout: 15000 });
    } catch {
      throw new Error(`Field "${label}" is not on the page, so Orgwright could not check that it is ${purpose}. If the field is hidden for this user, use: Verify field "${label}" is not visible.`);
    }
    return item;
  }

  /** Asserts a field cannot be edited (works on edit forms and on record detail inline edit). */
  static async verifyFieldReadOnly(page: Page, label: string): Promise<void> {
    const item = await this.requireField(page, label, 'read-only');
    if (await this.anyVisible(this.editableInputs(item))) {
      throw new Error(`Field "${label}" has an enabled input, so this user can edit it — the test expected it to be read-only.`);
    }
    if (await this.anyVisible(this.inlineEditButtons(item))) {
      throw new Error(`Field "${label}" shows an inline-edit pencil, so this user can edit it — the test expected it to be read-only.`);
    }
  }

  /** Asserts a field can be edited by the current user. */
  static async verifyFieldEditable(page: Page, label: string): Promise<void> {
    const item = await this.requireField(page, label, 'editable');
    if (await this.anyVisible(this.editableInputs(item))) return;
    if (await this.anyVisible(this.inlineEditButtons(item))) return;
    throw new Error(`Field "${label}" is read-only for this user (no enabled input or inline-edit pencil) — the test expected it to be editable.`);
  }

  /** Asserts a validation / page error message is shown, optionally next to a specific field. */
  static async verifyFieldError(page: Page, message: string, fieldLabel?: string): Promise<void> {
    await this.waitForLightningReady(page);
    const msgRe = new RegExp(this.escapeRegex(message), 'i');
    const deadline = Date.now() + 12000;

    while (Date.now() < deadline) {
      if (fieldLabel) {
        const item = this.fieldContainer(page, fieldLabel);
        if (await this.anyVisible(item.getByText(msgRe))) return;
        // Lightning also lists field errors in the page-level error popover: "Close Date: Complete this field."
        const popover = page.locator(this.ERROR_SELECTORS).filter({ hasText: msgRe }).filter({ hasText: new RegExp(this.escapeRegex(fieldLabel), 'i') });
        if (await this.anyVisible(popover)) return;
      } else {
        if (await this.anyVisible(page.locator(this.ERROR_SELECTORS).filter({ hasText: msgRe }))) return;
        if (await this.anyVisible(page.getByText(msgRe))) return;
      }
      await page.waitForTimeout(500);
    }

    const shown = await this.visibleTexts(page.locator(this.ERROR_SELECTORS));
    const where = fieldLabel ? ` on field "${fieldLabel}"` : '';
    throw new Error(
      shown.length
        ? `Expected error "${message}"${where}, but Salesforce showed: ${shown.map((t) => `"${t}"`).join('; ')}.`
        : `Expected error "${message}"${where}, but no error message appeared. The record may have saved successfully.`
    );
  }

  // ---------------------------------------------------------------------------------------
  // Related lists, path, record types, dual listbox and record actions
  // ---------------------------------------------------------------------------------------

  private static exact(text: string): RegExp {
    return new RegExp(`^\\s*${this.escapeRegex(text)}\\s*$`, 'i');
  }

  private static activeModal(page: Page): Locator {
    return page.locator('section[role="dialog"]:visible, .slds-modal__container:visible, div[role="dialog"]:visible').last();
  }

  private static async clickInModal(page: Page, name: RegExp, purpose: string): Promise<void> {
    const modal = this.activeModal(page);
    try {
      await modal.waitFor({ state: 'visible', timeout: 15000 });
    } catch {
      throw new Error(`Expected a dialog to open for ${purpose}, but none appeared.`);
    }
    const btn = modal.getByRole('button', { name }).last();
    try {
      await btn.waitFor({ state: 'visible', timeout: 10000 });
    } catch {
      throw new Error(`The ${purpose} dialog has no "${name.source.replace(/[\^$\\]/g, '')}" button.`);
    }
    await btn.click();
    await this.waitForLightningReady(page);
  }

  /** Card for a related list on a record page (switches to the Related tab if needed). */
  private static async relatedListCard(page: Page, listName: string): Promise<Locator> {
    await this.waitForLightningReady(page);
    const titleRe = new RegExp(`^\\s*${this.escapeRegex(listName)}(\\s*\\(\\d+\\+?\\))?\\s*$`, 'i');
    const card = page
      .locator('lst-related-list-single-container, force-related-list-single-container, article.slds-card')
      .filter({ has: page.locator('h2, .slds-card__header-title, span[title]').filter({ hasText: titleRe }) })
      .first();
    if (!(await card.isVisible().catch(() => false))) {
      const relatedTab = page.getByRole('tab', { name: /^Related$/i }).first();
      if (await relatedTab.isVisible().catch(() => false)) {
        await relatedTab.click();
        await this.waitForLightningReady(page);
      }
    }
    try {
      await card.waitFor({ state: 'visible', timeout: 15000 });
      await card.scrollIntoViewIfNeeded().catch(() => {});
    } catch {
      throw new Error(`Related list "${listName}" is not on this record page. Check the related list label (and that it is on this user's page layout).`);
    }
    return card;
  }

  static async openRelatedList(page: Page, listName: string): Promise<void> {
    const card = await this.relatedListCard(page, listName);
    const header = card.locator('.slds-card__header-title a, h2 a').first();
    if (await header.isVisible().catch(() => false)) {
      await header.click();
    } else {
      await card.getByRole('link', { name: /view all/i }).first().click();
    }
    await this.waitForPageSettled(page);
  }

  static async relatedListAction(page: Page, listName: string, actionName: string): Promise<void> {
    const card = await this.relatedListCard(page, listName);
    const nameRe = this.exact(actionName);
    const direct = card.getByRole('button', { name: nameRe }).first();
    if (await direct.isVisible().catch(() => false)) {
      await direct.click();
      await this.waitForLightningReady(page);
      return;
    }
    const menu = card.locator('lightning-button-menu button, button[title*="more actions" i], button[aria-haspopup="true"]').first();
    if (await menu.isVisible().catch(() => false)) {
      await menu.click();
      const item = page.getByRole('menuitem', { name: nameRe }).first();
      if (await item.waitFor({ state: 'visible', timeout: 4000 }).then(() => true, () => false)) {
        await item.click();
        await this.waitForLightningReady(page);
        return;
      }
      await page.keyboard.press('Escape').catch(() => {});
    }
    throw new Error(`The "${listName}" related list has no "${actionName}" action for this user.`);
  }

  static async verifyRelatedListCount(page: Page, listName: string, op: string, expected: number): Promise<void> {
    const card = await this.relatedListCard(page, listName);
    await this.waitForLightningReady(page);
    const headerText = (await card.locator('h2, .slds-card__header-title').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
    const m = headerText.match(/\((\d+)(\+)?\)/);
    let count: number;
    let atLeast = false;
    if (m) {
      count = parseInt(m[1], 10);
      atLeast = Boolean(m[2]);
    } else {
      count = await card.locator('tbody tr, li.slds-item, .slds-tile').count();
    }
    const shown = `${count}${atLeast ? '+' : ''}`;
    const ok =
      op === '>=' ? count >= expected :
      op === '>' ? count > expected :
      op === '<=' ? !atLeast && count <= expected :
      !atLeast && count === expected;
    if (!ok) {
      const want = op === '>=' ? `at least ${expected}` : op === '>' ? `more than ${expected}` : op === '<=' ? `at most ${expected}` : `exactly ${expected}`;
      throw new Error(`Related list "${listName}" shows ${shown} record(s); the test expected ${want}.`);
    }
  }

  static async selectPathStage(page: Page, stage: string, mark: 'current' | 'complete' = 'current'): Promise<void> {
    await this.waitForLightningReady(page);
    const stageRe = this.exact(stage);
    const item = page
      .locator('.slds-path__nav a.slds-path__link, .slds-path__item a, [role="option"].slds-path__link')
      .filter({ hasText: stageRe })
      .or(page.locator(`.slds-path__nav a[title="${stage.replace(/"/g, '\\"')}"]`))
      .first();
    try {
      await item.waitFor({ state: 'visible', timeout: 15000 });
    } catch {
      throw new Error(`Stage "${stage}" is not on this record's path. Check the stage/status value name.`);
    }
    await item.click();
    await this.waitForLightningReady(page);
    const buttonRe = mark === 'complete' ? /Mark (Stage|Status) as Complete/i : /Mark as Current (Stage|Status)/i;
    const button = page.getByRole('button', { name: buttonRe }).first();
    if (await button.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false)) {
      await button.click();
      await this.waitForLightningReady(page);
    } else {
      throw new Error(`After selecting "${stage}" on the path, the "${mark === 'complete' ? 'Mark Stage as Complete' : 'Mark as Current Stage'}" button did not appear (the stage may already be current, or the user cannot edit it).`);
    }
  }

  static async chooseRecordType(page: Page, recordType: string): Promise<void> {
    await this.waitForLightningReady(page);
    const re = this.exact(recordType);
    const modal = this.activeModal(page);
    try {
      await modal.waitFor({ state: 'visible', timeout: 15000 });
    } catch {
      throw new Error(`No record type chooser appeared. The user may have only one record type available, so remove the "Choose record type" step.`);
    }
    const radio = modal.getByRole('radio', { name: re }).first();
    if (await radio.count() > 0) {
      await radio.check({ force: true });
    } else {
      const label = modal.locator('label, span.slds-form-element__label, .changeRecordTypeOptionRightColumn').filter({ hasText: re }).first();
      if (!(await label.isVisible().catch(() => false))) {
        const offered = await this.visibleTexts(modal.locator('label'), 10);
        throw new Error(`Record type "${recordType}" is not offered to this user. Available: ${offered.join(', ') || 'none found'}.`);
      }
      await label.click();
    }
    await this.clickInModal(page, /^Next$/i, 'record type selection');
  }

  static async moveDualListboxOption(page: Page, fieldLabel: string, option: string, to: 'chosen' | 'available' = 'chosen'): Promise<void> {
    await this.waitForLightningReady(page);
    const box = page.locator('lightning-dual-listbox').filter({ hasText: new RegExp(this.escapeRegex(fieldLabel), 'i') }).first();
    try {
      await box.waitFor({ state: 'visible', timeout: 15000 });
    } catch {
      throw new Error(`No dual listbox labelled "${fieldLabel}" is on the page.`);
    }
    const opt = box.getByRole('option', { name: this.exact(option) }).first();
    if (!(await opt.isVisible().catch(() => false))) {
      throw new Error(`"${option}" is not an option in "${fieldLabel}".`);
    }
    await opt.click();
    const moveBtn = box.locator(to === 'chosen'
      ? 'button[title*="to Chosen" i], button[title*="to Selected" i]'
      : 'button[title*="to Available" i]').first();
    await moveBtn.click();
    await this.waitForLightningReady(page);
  }

  static async deleteRecord(page: Page): Promise<void> {
    await this.clickButton(page, /^Delete$/i);
    await this.clickInModal(page, /^Delete$/i, 'delete confirmation');
    await this.waitForPageSettled(page);
  }

  static async changeOwner(page: Page, userName: string): Promise<void> {
    await this.clickButton(page, /Change Owner/i);
    const modal = this.activeModal(page);
    await modal.waitFor({ state: 'visible', timeout: 15000 });
    const input = modal.locator('input[placeholder*="Search" i], input[role="combobox"], input[type="text"]').first();
    await input.fill(userName);
    const option = page.locator('lightning-base-combobox-item, [role="option"]').filter({ hasText: new RegExp(this.escapeRegex(userName), 'i') }).first();
    try {
      await option.waitFor({ state: 'visible', timeout: 15000 });
    } catch {
      throw new Error(`No active user matching "${userName}" was found in the Change Owner search.`);
    }
    await option.click();
    await this.clickInModal(page, /^(Submit|Change Owner|Save)$/i, 'change owner');
  }

  static async globalSearch(page: Page, term: string, openFirst = false): Promise<void> {
    await this.waitForLightningReady(page);
    const searchBtn = page.getByRole('button', { name: /^Search/i }).first();
    if (await searchBtn.isVisible().catch(() => false)) {
      await searchBtn.click();
    }
    const input = page.locator('input[type="search"]:visible, input[placeholder^="Search" i]:visible').first();
    await input.waitFor({ state: 'visible', timeout: 10000 });
    await input.fill(term);
    await input.press('Enter');
    await this.waitForPageSettled(page);
    if (openFirst) {
      const result = page.locator('a[data-refid="recordId"], .resultsItem a, search_results-search-results a, table tbody tr th a').first();
      try {
        await result.waitFor({ state: 'visible', timeout: 15000 });
      } catch {
        throw new Error(`Global search for "${term}" returned no results.`);
      }
      await result.click();
      await this.waitForPageSettled(page);
    }
  }

  static async inlineEdit(page: Page, fieldLabel: string, value: string): Promise<void> {
    const item = await this.requireField(page, fieldLabel, 'inline-editable');
    const pencil = this.inlineEditButtons(item).first();
    if (!(await pencil.isVisible().catch(() => false))) {
      throw new Error(`Field "${fieldLabel}" has no inline-edit pencil for this user (it may be read-only).`);
    }
    await pencil.click();
    await this.waitForLightningReady(page);
    const editItem = this.fieldContainer(page, fieldLabel);
    const combo = editItem.locator('button[role="combobox"], input[role="combobox"]').first();
    if (await combo.isVisible().catch(() => false)) {
      await this.selectCombobox(page, fieldLabel, value);
    } else {
      const input = editItem.locator('input:not([type="hidden"]):not([type="checkbox"]), textarea').first();
      await input.waitFor({ state: 'visible', timeout: 10000 });
      await input.fill(value);
    }
    const save = page.locator('records-record-edit-form button, .slds-docked-form-footer button, force-record-layout-footer button')
      .filter({ hasText: /^\s*Save\s*$/i })
      .or(page.getByRole('button', { name: /^Save$/i }))
      .first();
    await save.click();
    await this.waitForLightningReady(page);
  }

  static async submitForApproval(page: Page, comment = ''): Promise<void> {
    await this.clickButton(page, /Submit for Approval/i);
    const modal = this.activeModal(page);
    await modal.waitFor({ state: 'visible', timeout: 15000 });
    if (comment) {
      const box = modal.locator('textarea').first();
      if (await box.isVisible().catch(() => false)) await box.fill(comment);
    }
    await this.clickInModal(page, /^Submit$/i, 'submit for approval');
  }

  static async convertLead(page: Page): Promise<void> {
    await this.clickButton(page, /^Convert$/i);
    await this.clickInModal(page, /^Convert$/i, 'lead conversion');
    const done = page.getByText(/lead has been converted/i).first();
    try {
      await done.waitFor({ state: 'visible', timeout: 30000 });
    } catch {
      const errors = await this.visibleTexts(page.locator(this.ERROR_SELECTORS));
      throw new Error(`Lead conversion did not complete${errors.length ? `: ${errors.join('; ')}` : '.'}`);
    }
  }

  // ---------------------------------------------------------------------------------------
  // App Launcher and app navigation bar
  // ---------------------------------------------------------------------------------------

  private static launcherSearch(page: Page): Locator {
    return page
      .locator(
        'one-app-launcher-menu input[type="search"], one-app-launcher-modal input[type="search"], input[placeholder^="Search apps" i], .appLauncherMenu input[type="search"]'
      )
      .first();
  }

  /** Name of the app currently open (header of the navigation bar), or '' when unknown. */
  static async currentAppName(page: Page): Promise<string> {
    const label = page.locator('one-app-nav-bar .appName span[title], .slds-context-bar__app-name span[title], span.appName[title], .appName span').first();
    if (await label.count() === 0) return '';
    return ((await label.getAttribute('title').catch(() => null)) || (await label.innerText().catch(() => '')) || '').trim();
  }

  /** Clicks the App Launcher (waffle) and waits for its search box. */
  static async openAppLauncher(page: Page): Promise<void> {
    await this.waitForLightningReady(page);
    if (await this.launcherSearch(page).isVisible().catch(() => false)) return;
    const waffle = page
      .getByRole('button', { name: /App Launcher/i })
      .or(page.locator('one-app-launcher-header button, button.slds-icon-waffle_container, div.slds-icon-waffle'))
      .first();
    try {
      await waffle.waitFor({ state: 'visible', timeout: 20000 });
    } catch {
      throw new Error('The App Launcher button is not on the page. Make sure the previous step logged in and Lightning has loaded.');
    }
    await waffle.click();
    try {
      await this.launcherSearch(page).waitFor({ state: 'visible', timeout: 10000 });
    } catch {
      throw new Error('The App Launcher opened but its search box did not appear.');
    }
  }

  /**
   * Searches the App Launcher for an app and opens it. Skips the search when that app is
   * already open. Fails with the apps that did match when the name is not found.
   */
  static async openApp(page: Page, appName: string): Promise<void> {
    await this.waitForLightningReady(page);
    const current = await this.currentAppName(page);
    const launcherOpen = await this.launcherSearch(page).isVisible().catch(() => false);
    if (!launcherOpen && current && current.toLowerCase() === appName.trim().toLowerCase()) {
      return;
    }
    await this.openAppLauncher(page);
    const search = this.launcherSearch(page);
    await search.fill(appName);
    const exact = this.exact(appName);
    const results = page.locator(
      'one-app-launcher-menu-item a, one-app-launcher-menu a[role="option"], one-app-launcher-app-tile a, one-app-launcher-modal a[role="option"], [role="listbox"] [role="option"]'
    );
    const match = results.filter({ hasText: exact }).first();
    const loose = results.filter({ hasText: new RegExp(this.escapeRegex(appName), 'i') }).first();
    let target: Locator | null = null;
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline && !target) {
      if (await match.isVisible().catch(() => false)) target = match;
      else if (await loose.isVisible().catch(() => false)) target = loose;
      else await page.waitForTimeout(200);
    }
    if (!target) {
      const shown = await this.visibleTexts(results, 8);
      await page.keyboard.press('Escape').catch(() => {});
      throw new Error(
        `App "${appName}" was not found in the App Launcher for this user.` +
          (shown.length ? ` The search showed: ${shown.join(', ')}.` : ' The search returned nothing — check the app name and the user’s app assignments.')
      );
    }
    await target.click();
    await this.waitForPageSettled(page);
  }

  /**
   * Clicks a tab in the open app's navigation bar (also looks in the "More" overflow and the
   * console navigation menu). Falls back to the object's list view when a known object tab is
   * hidden from the bar, so the test still lands in the right place.
   */
  static async selectNavTab(page: Page, tabName: string, objectApiFallback?: string): Promise<void> {
    await this.waitForLightningReady(page);
    const names = [tabName, tabName.replace(/s$/i, ''), `${tabName.replace(/s$/i, '')}s`];
    const nameRe = new RegExp(`^\\s*(?:${names.map((n) => this.escapeRegex(n)).join('|')})\\s*$`, 'i');
    const barItem = page
      .locator('one-app-nav-bar-item-root a, one-app-nav-bar a.slds-context-bar__label-action, nav[role="navigation"] one-app-nav-bar-item-root a')
      .filter({ hasText: nameRe })
      .first();
    if (await barItem.waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false)) {
      await barItem.click();
      await this.waitForPageSettled(page);
      return;
    }

    // Overflow "More" menu (standard apps) or the navigation menu (console apps)
    const menuButtons = [
      page.locator('one-app-nav-bar-menu-button button, one-app-nav-bar button[title="More"]').first(),
      page.getByRole('button', { name: /Show Navigation Menu|Navigation Menu/i }).first()
    ];
    for (const btn of menuButtons) {
      if (!(await btn.isVisible().catch(() => false))) continue;
      await btn.click();
      const item = page
        .locator('one-app-nav-bar-menu-item a, [role="menuitem"], [role="menuitemcheckbox"]')
        .filter({ hasText: nameRe })
        .first();
      if (await item.waitFor({ state: 'visible', timeout: 4000 }).then(() => true, () => false)) {
        await item.click();
        await this.waitForPageSettled(page);
        return;
      }
      await page.keyboard.press('Escape').catch(() => {});
    }

    if (objectApiFallback) {
      console.warn(`[LightningHelpers] Tab "${tabName}" is not in this app's navigation; opening the ${objectApiFallback} list directly.`);
      await page.goto(`/lightning/o/${objectApiFallback}/list?filterName=Recent`, { waitUntil: 'domcontentloaded' });
      await this.waitForPageSettled(page);
      return;
    }

    const available = await this.visibleTexts(page.locator('one-app-nav-bar-item-root a'), 15);
    const app = await this.currentAppName(page);
    throw new Error(
      `Tab "${tabName}" is not in the ${app ? `"${app}" ` : ''}app's navigation.` +
        (available.length ? ` Tabs available: ${available.join(', ')}.` : '')
    );
  }

  // ---------------------------------------------------------------------------------------
  // List views and row selection
  // ---------------------------------------------------------------------------------------

  /** Name of the list view currently shown, or ''. */
  static async currentListViewName(page: Page): Promise<string> {
    const title = page
      .locator('.slds-page-header__title .triggerLinkText, h1 .slds-page-header__title span[data-aura-class*="uiOutputText"], .listViewTitle, h1.slds-page-header__title span, .slds-page-header__title span')
      .first();
    return ((await title.innerText().catch(() => '')) || '').trim();
  }

  /** Switches the open object list to another list view (e.g. "All Encounters"). */
  static async selectListView(page: Page, viewName: string): Promise<void> {
    await this.waitForLightningReady(page);
    if ((await this.currentListViewName(page)).toLowerCase() === viewName.trim().toLowerCase()) return;

    const picker = page
      .locator('button[title^="Select a List View" i], button[title^="Select List View" i], .listViewPickerTrigger button, force-list-view-manager-header button.slds-button_icon')
      .first();
    try {
      await picker.waitFor({ state: 'visible', timeout: 15000 });
    } catch {
      throw new Error(`No list view picker on this page. Open the object's list first (e.g. "Open Account list" or select its tab).`);
    }
    await picker.click();

    const search = page.locator('input[placeholder^="Search lists" i], .listViewPickerDropdown input[type="search"], .slds-dropdown input[type="search"]').first();
    if (await search.waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false)) {
      await search.fill(viewName);
    }
    const options = page.locator('.slds-dropdown [role="option"], .listViewPickerDropdown [role="option"], .slds-dropdown li a, [role="listbox"] [role="option"]');
    const option = options.filter({ hasText: this.exact(viewName) }).first();
    try {
      await option.waitFor({ state: 'visible', timeout: 10000 });
    } catch {
      const shown = await this.visibleTexts(options, 12);
      await page.keyboard.press('Escape').catch(() => {});
      throw new Error(`List view "${viewName}" is not available to this user.` + (shown.length ? ` Lists shown: ${shown.join(', ')}.` : ''));
    }
    await option.click();
    await this.waitForPageSettled(page);
  }

  private static listGrid(page: Page): Locator {
    return page.locator('table[role="grid"], table.slds-table, lightning-datatable table').first();
  }

  private static async rowCheckbox(row: Locator): Promise<Locator> {
    return row
      .locator('input[type="checkbox"], [role="checkbox"]')
      .first();
  }

  private static async setRowChecked(page: Page, checkbox: Locator, checked: boolean, label: string): Promise<void> {
    const isChecked = async () =>
      (await checkbox.isChecked().catch(() => undefined)) ??
      (await checkbox.getAttribute('aria-checked').catch(() => null)) === 'true';
    if ((await isChecked()) === checked) return;
    // SLDS hides the real input behind a styled label; click through it
    await checkbox.click({ force: true }).catch(async () => {
      await checkbox.locator('xpath=ancestor::*[contains(@class,"slds-checkbox")][1]').first().click();
    });
    await page.waitForTimeout(150);
    if ((await isChecked()) !== checked) {
      throw new Error(`Could not ${checked ? 'tick' : 'untick'} the checkbox for ${label}.`);
    }
  }

  private static async waitForRows(page: Page): Promise<Locator> {
    await this.waitForLightningReady(page);
    const grid = this.listGrid(page);
    try {
      await grid.locator('tbody tr').first().waitFor({ state: 'visible', timeout: 20000 });
    } catch {
      throw new Error('No records are shown in this list view, so there is nothing to select.');
    }
    return grid;
  }

  /** Ticks (or unticks) the checkbox of the rows whose text matches each name. */
  static async selectListRecords(page: Page, names: string[], checked = true): Promise<void> {
    const grid = await this.waitForRows(page);
    for (const name of names) {
      const row = grid.locator('tbody tr').filter({ hasText: new RegExp(this.escapeRegex(name), 'i') }).first();
      if (!(await row.isVisible().catch(() => false))) {
        const shown = await this.visibleTexts(grid.locator('tbody tr th, tbody tr td:nth-child(3)'), 8);
        throw new Error(`No record "${name}" in this list view.` + (shown.length ? ` First records shown: ${shown.join(', ')}.` : ''));
      }
      await this.setRowChecked(page, await this.rowCheckbox(row), checked, `"${name}"`);
    }
  }

  /** Ticks the checkboxes of the first N rows. */
  static async selectFirstListRecords(page: Page, count: number): Promise<void> {
    const grid = await this.waitForRows(page);
    const rows = grid.locator('tbody tr');
    const available = await rows.count();
    if (available < count) {
      throw new Error(`The list shows only ${available} record(s); the step asked to select ${count}.`);
    }
    for (let i = 0; i < count; i++) {
      await this.setRowChecked(page, await this.rowCheckbox(rows.nth(i)), true, `row ${i + 1}`);
    }
  }

  /** Ticks (or unticks) the select-all checkbox in the list header. */
  static async selectAllListRecords(page: Page, checked = true): Promise<void> {
    const grid = await this.waitForRows(page);
    const header = grid.locator('thead input[type="checkbox"], thead [role="checkbox"]').first();
    if (!(await header.count())) {
      throw new Error('This list has no select-all checkbox (row selection may be turned off for this list view).');
    }
    await this.setRowChecked(page, header, checked, 'all records');
  }
}

