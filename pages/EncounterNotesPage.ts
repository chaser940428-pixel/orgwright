import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { LightningHelpers } from '../utils/lightning-helpers';

export class EncounterNotesPage extends BasePage {
  readonly noteTitleInput: Locator;
  readonly noteBodyEditor: Locator;
  readonly saveNoteButton: Locator;
  readonly syncNotesButton: Locator;

  constructor(page: Page) {
    super(page);
    this.noteTitleInput = page.locator('input[placeholder*="Title"], lightning-input[data-id="note-title"] input, input[name="title"]').first();
    this.noteBodyEditor = page.locator('.note-body, div[contenteditable="true"], textarea[placeholder*="Note"], lightning-textarea textarea').first();
    this.saveNoteButton = page.getByRole('button', { name: /Save|Done/i }).first();
    this.syncNotesButton = page.getByRole('button', { name: /Sync CareCloud Notes|Sync CareCloud Note|Sync Note|Sync Notes/i }).first();
  }

  /**
   * Opens an Encounter by record ID or selects the first matching row from list view.
   */
  async openEncounter(encounterIdOrName = 'Recent'): Promise<void> {
    if (encounterIdOrName.startsWith('a0') || encounterIdOrName.startsWith('00') || encounterIdOrName.startsWith('a2')) {
      await this.navigateToRecord(encounterIdOrName);
    } else {
      await this.navigateToObjectList('Encounter__c', 'Recent');
      await LightningHelpers.waitForLightningReady(this.page);
      
      const encounterRow = this.page.locator('tbody tr th a, tbody tr td a[data-refid="recordId"], tbody tr a').first();
      await encounterRow.waitFor({ state: 'visible', timeout: 20000 });
      await encounterRow.click();
      
      // Wait for the Encounter record layout / tabs to be rendered
      const recordIdentifier = this.page.locator('button:has-text("Edit"), button:has-text("Save"), button:has-text("Create RUL"), [role="tab"]:has-text("Details"), [role="tab"]:has-text("Related"), records-record-layout-item').first();
      await recordIdentifier.waitFor({ state: 'visible', timeout: 20000 });
      await LightningHelpers.waitForLightningReady(this.page);
    }
  }

  /**
   * Creates a Note on the current Encounter record.
   */
  async createNote(title: string, bodyText: string): Promise<void> {
    await LightningHelpers.waitForLightningReady(this.page);

    // Strategy 1: Look for "Show actions for Notes" dropdown menu in the Notes card
    const actionBtn = this.page.getByRole('button', { name: /actions for Notes/i })
      .or(this.page.locator('article:has-text("Notes") button[title*="actions for Notes"]'))
      .or(this.page.locator('button[aria-label*="actions for Notes"]'))
      .first();

    // Strategy 2: Look for direct "New" button in the Notes related list
    const directNewBtn = this.page.locator('article:has-text("Notes") button:has-text("New"), records-related-list-card:has-text("Notes") button:has-text("New")').first();

    if (await actionBtn.isVisible({ timeout: 5000 })) {
      await actionBtn.click();
      await this.page.waitForTimeout(400);
      const newMenuItem = this.page.getByRole('menuitem', { name: /New|New Note/i })
        .or(this.page.locator('a[role="menuitem"]:has-text("New"), span:has-text("New Note")'))
        .first();
      await newMenuItem.click();
    } else if (await directNewBtn.isVisible({ timeout: 5000 })) {
      await directNewBtn.click();
    } else {
      // Fallback: Check "Show more actions" dropdown on top header
      const topMoreActions = this.page.getByRole('button', { name: /Show more actions/i }).first();
      if (await topMoreActions.isVisible({ timeout: 4000 })) {
        await topMoreActions.click();
        await this.page.waitForTimeout(400);
        const newNoteItem = this.page.getByRole('menuitem', { name: /New Note|Note/i }).first();
        await newNoteItem.click();
      } else {
        const topNewBtn = this.page.locator('button:has-text("New Note"), a[title="New Note"]').first();
        await topNewBtn.click();
      }
    }

    await LightningHelpers.waitForLightningReady(this.page);

    // Fill Title
    if (await this.noteTitleInput.isVisible({ timeout: 8000 })) {
      await this.noteTitleInput.fill(title);
    }

    // Fill Body
    if (await this.noteBodyEditor.isVisible({ timeout: 8000 })) {
      await this.noteBodyEditor.fill(bodyText);
    }

    // Save Note
    if (await this.saveNoteButton.isVisible({ timeout: 8000 })) {
      await this.saveNoteButton.click();
      await LightningHelpers.waitForLightningReady(this.page);
    }
  }

  /**
   * Verifies that a Note exists on the Encounter page.
   */
  async verifyNoteExists(titleSnippet: string): Promise<void> {
    const noteCard = this.page.locator(`text="${titleSnippet}"`).first();
    await expect(noteCard).toBeVisible({ timeout: 15000 });
  }

  /**
   * Triggers the "Sync CareCloud Notes" button on the Encounter.
   */
  async clickSyncNotes(confirm = true): Promise<void> {
    await this.syncNotesButton.waitFor({ state: 'visible', timeout: 15000 });
    await this.syncNotesButton.click();
    await this.page.waitForTimeout(800);

    const modal = this.page.locator('.slds-modal__container, lightning-quick-action-panel');
    if (await modal.isVisible({ timeout: 8000 })) {
      if (confirm) {
        const proceedBtn = modal.getByRole('button', { name: /Sync|Confirm|Yes|OK/i }).first();
        if (await proceedBtn.isVisible()) {
          await proceedBtn.click();
        }
      } else {
        const cancelBtn = modal.getByRole('button', { name: /Cancel|Close/i }).first();
        if (await cancelBtn.isVisible()) {
          await cancelBtn.click();
        }
      }
    }
    await LightningHelpers.waitForLightningReady(this.page);
  }

  /**
   * Reads a field value from the Encounter record details section.
   * Clicks the "Details" tab to ensure field containers are rendered.
   */
  async getFieldValue(fieldLabel: string): Promise<string> {
    // 1. Ensure "Details" tab is selected
    const detailsTab = this.page.getByRole('tab', { name: /Details/i }).first();
    if (await detailsTab.isVisible({ timeout: 6000 })) {
      await detailsTab.click();
      await LightningHelpers.waitForLightningReady(this.page);
    }

    // 2. Locate field item across standard Lightning layouts and highlights panels
    const fieldContainer = this.page.locator(`
      records-record-layout-item:has-text("${fieldLabel}"),
      records-highlights-details-item:has-text("${fieldLabel}"),
      records-record-layout-row:has-text("${fieldLabel}"),
      lightning-output-field:has-text("${fieldLabel}")
    `).first();

    // Fail loudly: a missing field must fail the step, never fall back to page text or a fake value
    try {
      await fieldContainer.waitFor({ state: 'visible', timeout: 15000 });
    } catch {
      throw new Error(`Field "${fieldLabel}" was not found on the record page`);
    }

    // innerText includes the label (and "Edit <label>" button text) - return only the value
    const lines = (await fieldContainer.innerText())
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && l.toLowerCase() !== fieldLabel.toLowerCase() && l.toLowerCase() !== `edit ${fieldLabel}`.toLowerCase());
    return lines.join('\n');
  }
}
