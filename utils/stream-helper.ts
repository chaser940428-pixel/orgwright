import { Page, CDPSession, test } from '@playwright/test';
import WebSocket from 'ws';
import * as fs from 'fs';
import * as path from 'path';
import { LightningHelpers } from './lightning-helpers';

export interface StepTelemetryItem {
  stepIndex: number;
  stepText: string;
  durationMs: number;
  status: 'passed' | 'failed';
  url: string;
  auraActions: Array<{ name: string; status: number; durationMs?: number }>;
  /** Plain error message when this step failed */
  error?: string;
  /** File name (inside test-results/<testId>-steps/) of the screenshot taken when the step finished */
  screenshot?: string;
}

export interface DetachOptions {
  page?: Page;
  /** Set when the test failed; the step that was running is marked failed with this message */
  error?: string;
}

export class StreamHelper {
  private static cdpSession: CDPSession | null = null;
  private static ws: WebSocket | null = null;
  private static currentTestId = '';
  private static currentStep = '';
  private static isAttached = false;
  private static activePage: Page | null = null;
  private static isPaused = false;
  /** Decision sent by the Studio while a failed step is paused for repair */
  private static repairDecision: { action: 'clicked' | 'retry' | 'fail'; newStep?: string } | null = null;
  private static repairing = false;
  private static lastDynamicError = '';
  private static currentStepIndex = 0;
  private static dynamicStepsQueue: string[] = [];
  private static originalSteps: string[] = [];

  private static stepTelemetry: StepTelemetryItem[] = [];
  private static currentStepStartTime = 0;
  private static currentStepAuraActions: Array<{ name: string; status: number; durationMs?: number }> = [];

  /**
   * Attaches CDP screencast and network telemetry listeners to the active Playwright page
   */
  static async attach(page: Page, testId: string): Promise<void> {
    this.currentTestId = testId;
    this.isAttached = true;
    this.activePage = page;
    this.isPaused = false;
    this.currentStepIndex = 0;
    this.dynamicStepsQueue = [];
    this.originalSteps = [];
    this.stepTelemetry = [];
    this.currentStep = '';
    this.currentStepStartTime = Date.now();
    this.currentStepAuraActions = [];

    // Fresh per-step screenshot folder for this test id
    try {
      fs.rmSync(this.stepScreenshotDir(), { recursive: true, force: true });
    } catch {}

    // Track network events (Aura actions, UI-API calls, Lightning backend DML)
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/aura') || url.includes('/ui-api/') || url.includes('/services/data/')) {
        let actionName = 'Aura/REST Action';
        try {
          const postData = req.postData();
          if (postData) {
            const match = postData.match(/"descriptor":"([^"]+)"/) || postData.match(/ACTION\$([a-zA-Z0-9_]+)/);
            if (match) actionName = match[1];
          }
        } catch {}
        this.currentStepAuraActions.push({
          name: actionName,
          status: 0,
          durationMs: 0
        });
      }
    });

    page.on('response', (res) => {
      const url = res.url();
      if (url.includes('/aura') || url.includes('/ui-api/') || url.includes('/services/data/')) {
        const last = this.currentStepAuraActions[this.currentStepAuraActions.length - 1];
        if (last) {
          last.status = res.status();
        }
      }
    });

    try {
      // 1. Setup Studio Server WebSocket connection for streaming
      const ws = new WebSocket('ws://localhost:3001/ws');
      this.ws = ws;

      // Handle interactive commands sent from studio during pause
      ws.on('message', async (data: any) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'pause_execution') {
            StreamHelper.isPaused = true;
            console.log(`[StreamHelper] ⏸ Execution paused at step ${StreamHelper.currentStepIndex}: "${StreamHelper.currentStep}"`);
            if (StreamHelper.ws && StreamHelper.ws.readyState === WebSocket.OPEN) {
              StreamHelper.ws.send(JSON.stringify({
                type: 'execution_paused',
                testId: StreamHelper.currentTestId,
                step: StreamHelper.currentStep,
                stepIndex: StreamHelper.currentStepIndex
              }));
            }
          } else if (msg.type === 'resume_execution') {
            console.log(`[StreamHelper] ▶ Execution resume command received`);
            if (Array.isArray(msg.newSteps) && msg.newSteps.length > 0) {
              StreamHelper.dynamicStepsQueue.push(...msg.newSteps);
            } else if (Array.isArray(msg.steps) && msg.steps.length > 0) {
              const pIdx = msg.pausedStepIndex !== undefined ? msg.pausedStepIndex : StreamHelper.currentStepIndex;
              const extraSteps = msg.steps.slice(pIdx).filter((s: string) => !StreamHelper.originalSteps.includes(s));
              if (extraSteps.length > 0) {
                StreamHelper.dynamicStepsQueue.push(...extraSteps);
              }
            }
            StreamHelper.isPaused = false;
            if (StreamHelper.ws && StreamHelper.ws.readyState === WebSocket.OPEN) {
              StreamHelper.ws.send(JSON.stringify({
                type: 'execution_resumed',
                testId: StreamHelper.currentTestId,
                pendingDynamicStepsCount: StreamHelper.dynamicStepsQueue.length
              }));
            }
          } else if (msg.type === 'repair_decision') {
            if (StreamHelper.repairing) {
              StreamHelper.repairDecision = { action: msg.action, newStep: msg.newStep };
            }
          } else if (msg.type === 'interact_click') {
            if (StreamHelper.isPaused && StreamHelper.activePage && !StreamHelper.activePage.isClosed()) {
              await StreamHelper.handleInteractiveClick(msg.x, msg.y);
            }
          } else if (msg.type === 'interact_type') {
            if (StreamHelper.isPaused && StreamHelper.activePage && !StreamHelper.activePage.isClosed()) {
              await StreamHelper.handleInteractiveType(msg.text);
            }
          } else if (msg.type === 'interact_key') {
            if (StreamHelper.isPaused && StreamHelper.activePage && !StreamHelper.activePage.isClosed()) {
              await StreamHelper.handleInteractiveKey(msg.key);
            }
          } else if (msg.type === 'interact_scroll') {
            if (StreamHelper.isPaused && StreamHelper.activePage && !StreamHelper.activePage.isClosed()) {
              await StreamHelper.handleInteractiveScroll(msg.deltaY || 350);
            }
          } else if (msg.type === 'add_dynamic_step') {
            if (msg.step) {
              StreamHelper.dynamicStepsQueue.push(msg.step);
            }
          }
        } catch (err) {
          console.error('[StreamHelper] WebSocket message dispatch error:', err);
        }
      });

      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 1500);
        ws.on('open', () => {
          clearTimeout(timer);
          resolve();
        });
        ws.on('error', () => {
          clearTimeout(timer);
          resolve();
        });
      });

      // 2. Attach CDP session to capture screencast frames
      const client = await page.context().newCDPSession(page);
      this.cdpSession = client;

      client.on('Page.screencastFrame', async ({ data, sessionId }) => {
        try {
          await client.send('Page.screencastFrameAck', { sessionId });
        } catch {}

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(
            JSON.stringify({
              type: 'stream_frame',
              testId: this.currentTestId,
              frame: data,
              url: page.url(),
              step: this.currentStep
            })
          );
        }
      });

      // Start screencast at 1280x720 with smooth quality
      await client.send('Page.startScreencast', {
        format: 'jpeg',
        quality: 65,
        maxWidth: 1280,
        maxHeight: 720,
        everyNthFrame: 1
      });

      console.log(`[StreamHelper] Live browser screencast & telemetry attached for ${testId}`);
    } catch (err) {
      console.log(`[StreamHelper] CDP screencast setup notice: ${(err as Error).message}`);
    }
  }

  /**
   * Updates the current step label and captures step telemetry
   */
  static async setStep(page: Page, stepText: string): Promise<void> {
    this.currentStepIndex++;
    this.originalSteps.push(stepText);
    const now = Date.now();

    // Finalize previous step if exists (screenshot = state the previous step left the page in)
    if (this.currentStep) {
      const prevDuration = now - this.currentStepStartTime;
      const stepNo = this.stepTelemetry.length + 1;
      const screenshot = await this.captureStepScreenshot(page, stepNo);
      this.stepTelemetry.push({
        stepIndex: stepNo,
        stepText: this.currentStep,
        durationMs: prevDuration,
        status: 'passed',
        url: page.url(),
        auraActions: [...this.currentStepAuraActions],
        screenshot
      });
    }

    this.currentStep = stepText;
    this.currentStepStartTime = now;
    this.currentStepAuraActions = [];

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'stream_step',
          testId: this.currentTestId,
          step: stepText,
          stepIndex: this.currentStepIndex,
          url: page.url()
        })
      );
    }

    // Capture visual frame
    if (!this.cdpSession) {
      await this.captureAndSendFrame();
    }

    // PAUSE HANDLING: If pause is active, enter wait loop
    if (this.isPaused) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({
            type: 'execution_paused',
            testId: this.currentTestId,
            step: stepText,
            stepIndex: this.currentStepIndex,
            url: page.url()
          })
        );
      }

      console.log(`[StreamHelper] ⏸ Execution paused at step ${this.currentStepIndex}: "${stepText}". Live browser is interactive.`);

      // Wait while paused - browser page remains alive, interactive, and responsive
      while (this.isPaused) {
        await page.waitForTimeout(150);
      }

      console.log(`[StreamHelper] ▶ Execution resumed. Checking for dynamically queued steps...`);

      // Execute any dynamic steps that were added during pause
      while (this.dynamicStepsQueue.length > 0) {
        const nextDynamicStep = this.dynamicStepsQueue.shift();
        if (nextDynamicStep && nextDynamicStep.trim().length > 0) {
          console.log(`[StreamHelper] ⚡ Executing dynamic step added during pause: "${nextDynamicStep}"`);
          await this.executeDynamicStep(page, nextDynamicStep.trim());
        }
      }
    }
  }

  /**
   * Runs one generated step. When the Studio started the run with KPLAY_PAUSE_ON_FAILURE=1,
   * a failing step pauses the live browser instead of ending the test, so the tester can
   * click the right element (or edit the step) and continue.
   */
  static async runStep(page: Page, stepText: string, body: () => Promise<void>): Promise<void> {
    await this.setStep(page, stepText);
    try {
      await body();
    } catch (err: any) {
      const repaired = await this.offerRepair(page, stepText, err);
      if (!repaired) throw err;
    }
  }

  private static async offerRepair(page: Page, stepText: string, err: any): Promise<boolean> {
    if (process.env.KPLAY_PAUSE_ON_FAILURE !== '1') return false;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || page.isClosed()) return false;

    // A paused test must not be killed by the Playwright test timeout
    try {
      test.setTimeout(0);
    } catch {}

    let errorText = this.cleanError(err?.message || String(err));
    const timeoutMs = Number(process.env.KPLAY_REPAIR_TIMEOUT_MS || 15 * 60 * 1000);

    while (true) {
      this.repairing = true;
      this.repairDecision = null;
      this.isPaused = true;
      await this.captureAndSendFrame();
      this.ws.send(JSON.stringify({
        type: 'step_failed_paused',
        testId: this.currentTestId,
        stepIndex: this.currentStepIndex,
        step: stepText,
        error: errorText,
        url: page.url()
      }));
      console.log(`[StreamHelper] Step ${this.currentStepIndex} failed — paused for repair: ${errorText}`);

      const deadline = Date.now() + timeoutMs;
      while (!this.repairDecision && Date.now() < deadline && !page.isClosed()) {
        await page.waitForTimeout(200);
      }
      const decision = this.repairDecision as { action: 'clicked' | 'retry' | 'fail'; newStep?: string } | null;
      this.repairDecision = null;
      this.repairing = false;
      this.isPaused = false;

      if (!decision || decision.action === 'fail' || page.isClosed()) return false;

      if (decision.action === 'clicked') {
        // The tester performed the action in the live browser; continue with the next step
        this.ws?.send(JSON.stringify({ type: 'step_repaired', testId: this.currentTestId, stepIndex: this.currentStepIndex, step: decision.newStep || stepText }));
        await this.waitAfterRepair(page);
        return true;
      }

      if (decision.action === 'retry' && decision.newStep) {
        const ok = await this.executeDynamicStep(page, decision.newStep.replace(/^\s*\d+[.)]\s*/, ''), false);
        if (ok) {
          this.ws?.send(JSON.stringify({ type: 'step_repaired', testId: this.currentTestId, stepIndex: this.currentStepIndex, step: decision.newStep }));
          return true;
        }
        errorText = this.cleanError(this.lastDynamicError || 'The edited step also failed.');
        // loop: pause again with the new error
      } else {
        return false;
      }
    }
  }

  private static async waitAfterRepair(page: Page): Promise<void> {
    try {
      await LightningHelpers.waitForLightningReady(page);
    } catch {}
  }

  /** Optional pause at the end of a headed Studio run so the tester can see the final screen. */
  static async holdForReview(page: Page): Promise<void> {
    const ms = Number(process.env.KPLAY_HOLD_MS || 0);
    if (ms > 0 && !page.isClosed()) {
      await page.waitForTimeout(ms);
    }
  }

  /**
   * Executes a dynamically added test step during or right after pause
   */
  static async executeDynamicStep(page: Page, rawStepText: string, recordTelemetry = true): Promise<boolean> {
    const stepText = rawStepText.replace(/^\d+\.\s*/, '').trim();
    const stepStartTime = Date.now();
    this.currentStep = rawStepText;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'stream_step',
          testId: this.currentTestId,
          step: `⚡ [Dynamic] ${rawStepText}`,
          url: page.url()
        })
      );
    }

    try {
      // 1. Scroll actions
      if (/^scroll\s+down/i.test(stepText)) {
        const match = stepText.match(/(\d+)/);
        const dy = match ? parseInt(match[1], 10) : 400;
        await LightningHelpers.scrollPage(page, dy);
      } else if (/^scroll\s+up/i.test(stepText)) {
        const match = stepText.match(/(\d+)/);
        const dy = match ? -parseInt(match[1], 10) : -400;
        await LightningHelpers.scrollPage(page, dy);
      }
      // 2. Click button or element
      else if (/^(?:click|press)(?:\s+on)?(?:\s+the)?\s+["']?([^"']+)["']?(?:\s+button|\s+tab|\s+link)?$/i.test(stepText)) {
        const match = stepText.match(/^(?:click|press)(?:\s+on)?(?:\s+the)?\s+["']?([^"']+)["']?(?:\s+button|\s+tab|\s+link)?$/i);
        const target = match ? match[1].trim().replace(/\s+(?:button|tab|link)$/i, '').trim() : '';
        if (target) {
          await LightningHelpers.clickButton(page, target);
        }
      }
      // 3. Enter / Type / Fill input
      else if (/^(?:enter|type|fill|input)\s+["']?([^"']+)["']?\s+(?:in|into)\s+(?:the\s+)?["']?([^"']+)["']?/i.test(stepText)) {
        const match = stepText.match(/^(?:enter|type|fill|input)\s+["']?([^"']+)["']?\s+(?:in|into)\s+(?:the\s+)?["']?([^"']+)["']?/i);
        const val = match ? match[1].trim() : '';
        const field = match ? match[2].trim() : '';
        if (field) {
          const input = page.getByRole('textbox', { name: new RegExp(field, 'i') })
            .or(page.getByRole('spinbutton', { name: new RegExp(field, 'i') }))
            .or(page.getByLabel(new RegExp(field, 'i')))
            .or(page.locator('records-record-layout-item, .slds-form-element, lightning-textarea, lightning-input').filter({ hasText: new RegExp(field, 'i') }).locator('textarea, input'))
            .first();
          await input.waitFor({ state: 'visible', timeout: 12000 });
          await input.click();
          await input.fill(val);
          await input.press('Tab');
          await LightningHelpers.waitForLightningReady(page);
        }
      }
      // 4. Select from combobox/dropdown
      else if (/^(?:select|choose)\s+["']?([^"']+)["']?\s+(?:from|in)\s+(?:the\s+)?["']?([^"']+)["']?/i.test(stepText)) {
        const match = stepText.match(/^(?:select|choose)\s+["']?([^"']+)["']?\s+(?:from|in)\s+(?:the\s+)?["']?([^"']+)["']?/i);
        const option = match ? match[1].trim() : '';
        const field = match ? match[2].trim() : '';
        if (field && option) {
          await LightningHelpers.selectCombobox(page, field, option);
        }
      }
      // 5. Verify toast
      else if (/^verify\s+toast\s+["']?([^"']+)["']?/i.test(stepText)) {
        const match = stepText.match(/^verify\s+toast\s+["']?([^"']+)["']?/i);
        const toastText = match ? match[1].trim() : '';
        if (toastText) {
          await LightningHelpers.verifyToastMessage(page, toastText);
        }
      }
      // 6. Generic wait
      else if (/^wait\s+(\d+)/i.test(stepText)) {
        const match = stepText.match(/(\d+)/);
        const sec = match ? parseInt(match[1], 10) : 2;
        await page.waitForTimeout(sec * 1000);
      }
      else {
        await LightningHelpers.waitForLightningReady(page);
      }

      if (recordTelemetry) this.stepTelemetry.push({
        stepIndex: this.stepTelemetry.length + 1,
        stepText: `⚡ ${rawStepText}`,
        durationMs: Date.now() - stepStartTime,
        status: 'passed',
        url: page.url(),
        auraActions: []
      });

      await this.captureAndSendFrame();
      return true;
    } catch (err: any) {
      console.error(`[StreamHelper] Dynamic step failed: "${rawStepText}":`, err.message);
      this.lastDynamicError = err?.message || String(err);
      if (recordTelemetry) this.stepTelemetry.push({
        stepIndex: this.stepTelemetry.length + 1,
        stepText: `⚡ ${rawStepText} (Failed: ${err.message})`,
        durationMs: Date.now() - stepStartTime,
        status: 'failed',
        url: page.url(),
        auraActions: []
      });
      return false;
    }
  }

  /**
   * Handles user click on the interactive live screencast viewport when paused
   */
  static async handleInteractiveClick(x: number, y: number): Promise<void> {
    if (!this.activePage || this.activePage.isClosed()) return;
    try {
      let clickedElementInfo: any = null;
      try {
        clickedElementInfo = await this.activePage.evaluate(({ px, py }) => {
          const el = document.elementFromPoint(px, py);
          if (!el) return null;
          const btn = el.closest('button, [role="button"], a, lightning-button, [role="tab"]');
          if (btn) {
            const text = (btn.getAttribute('aria-label') || btn.getAttribute('title') || btn.textContent || '').trim().replace(/\s+/g, ' ');
            return { type: 'button', label: text.slice(0, 45) };
          }
          const inp = el.closest('input, textarea, [role="textbox"]');
          if (inp) {
            const label = (inp.getAttribute('aria-label') || inp.getAttribute('placeholder') || inp.getAttribute('name') || '').trim();
            return { type: 'input', label: label.slice(0, 45) };
          }
          const combo = el.closest('lightning-combobox, [role="combobox"], select');
          if (combo) {
            const label = (combo.getAttribute('label') || combo.getAttribute('aria-label') || '').trim();
            return { type: 'combobox', label: label.slice(0, 45) };
          }
          const card = el.closest('.slds-card, [role="row"]');
          if (card) {
            const text = (card.textContent || '').trim().replace(/\s+/g, ' ');
            return { type: 'card', label: text.slice(0, 35) };
          }
          const fallbackText = (el.textContent || '').trim().replace(/\s+/g, ' ');
          if (fallbackText && fallbackText.length < 40) {
            return { type: 'element', label: fallbackText };
          }
          return null;
        }, { px: x, py: y });
      } catch {}

      await this.activePage.mouse.click(x, y);

      if (clickedElementInfo && clickedElementInfo.label) {
        let recordedStepText = '';
        if (clickedElementInfo.type === 'button') {
          recordedStepText = `Click on "${clickedElementInfo.label}" button`;
        } else if (clickedElementInfo.type === 'input') {
          recordedStepText = `Click on "${clickedElementInfo.label}" field`;
        } else if (clickedElementInfo.type === 'combobox') {
          recordedStepText = `Select from "${clickedElementInfo.label}" dropdown`;
        } else {
          recordedStepText = `Click on "${clickedElementInfo.label}"`;
        }

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            type: 'recorded_step',
            step: recordedStepText,
            rawStep: recordedStepText,
            actionType: 'click',
            isPausedInteraction: true
          }));
        }
      }

      await this.captureAndSendFrame();
    } catch (err) {
      console.error('[StreamHelper] Interactive click error:', err);
    }
  }

  /**
   * Handles user typing into active focused element when paused
   */
  static async handleInteractiveType(text: string): Promise<void> {
    if (!this.activePage || this.activePage.isClosed()) return;
    try {
      await this.activePage.keyboard.type(text, { delay: 20 });
      try {
        const activeField = await this.activePage.evaluate(() => {
          const active = document.activeElement;
          if (!active) return null;
          const label = active.getAttribute('aria-label') || active.getAttribute('placeholder') || active.getAttribute('name') || '';
          return label.trim();
        });

        const stepText = activeField
          ? `Enter "${text}" in ${activeField}`
          : `Enter "${text}" into field`;

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            type: 'recorded_step',
            step: stepText,
            rawStep: stepText,
            actionType: 'fill',
            isPausedInteraction: true
          }));
        }
      } catch {}

      await this.captureAndSendFrame();
    } catch (err) {
      console.error('[StreamHelper] Interactive type error:', err);
    }
  }

  /**
   * Handles user keyboard press (Enter, Tab, Backspace) when paused
   */
  static async handleInteractiveKey(key: string): Promise<void> {
    if (!this.activePage || this.activePage.isClosed()) return;
    try {
      await this.activePage.keyboard.press(key);
      await this.captureAndSendFrame();
    } catch (err) {
      console.error('[StreamHelper] Interactive key error:', err);
    }
  }

  /**
   * Handles user scroll in Salesforce viewport when paused
   */
  static async handleInteractiveScroll(deltaY: number): Promise<void> {
    if (!this.activePage || this.activePage.isClosed()) return;
    try {
      await LightningHelpers.scrollPage(this.activePage, deltaY);
      const stepText = deltaY > 0 ? 'Scroll down' : 'Scroll up';
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'recorded_step',
          step: stepText,
          rawStep: stepText,
          actionType: 'scroll',
          isPausedInteraction: true
        }));
      }
      await this.captureAndSendFrame();
    } catch (err) {
      console.error('[StreamHelper] Interactive scroll error:', err);
    }
  }

  /**
   * Captures immediate screenshot frame and broadcasts via WebSocket
   */
  static async captureAndSendFrame(): Promise<void> {
    if (!this.activePage || this.activePage.isClosed()) return;
    try {
      const buffer = await this.activePage.screenshot({ type: 'jpeg', quality: 65 });
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({
            type: 'stream_frame',
            testId: this.currentTestId,
            frame: buffer.toString('base64'),
            url: this.activePage.url(),
            step: this.currentStep
          })
        );
      }
    } catch {}
  }

  private static stepScreenshotDir(): string {
    return path.resolve(process.cwd(), 'test-results', `${this.currentTestId || 'TC_RUN'}-steps`);
  }

  /** Screenshot of the page when a step finishes. Disable with KPLAY_STEP_SCREENSHOTS=0. */
  private static async captureStepScreenshot(page: Page, stepNo: number): Promise<string | undefined> {
    if (process.env.KPLAY_STEP_SCREENSHOTS === '0') return undefined;
    try {
      if (page.isClosed()) return undefined;
      const dir = this.stepScreenshotDir();
      fs.mkdirSync(dir, { recursive: true });
      const fileName = `step-${stepNo}.jpg`;
      await page.screenshot({ path: path.join(dir, fileName), type: 'jpeg', quality: 55, timeout: 5000 });
      return fileName;
    } catch {
      return undefined;
    }
  }

  /** Strips ANSI colours and Playwright call logs so testers see the actual reason. */
  private static cleanError(raw: string): string {
    return raw
      .replace(/\u001b\[[0-9;]*m/g, '')
      .split(/\n\s*Call log:/i)[0]
      .trim()
      .slice(0, 1200);
  }

  /**
   * Detaches screencast session and writes execution telemetry to disk
   */
  static async detach(options: DetachOptions = {}): Promise<void> {
    const page = options.page || this.activePage;
    this.isAttached = false;
    this.isPaused = false;
    this.activePage = null;
    this.dynamicStepsQueue = [];

    // Finalize last active step — it is the failing one when the test failed
    if (this.currentStep) {
      const duration = Date.now() - this.currentStepStartTime;
      const stepNo = this.stepTelemetry.length + 1;
      const screenshot = page ? await this.captureStepScreenshot(page, stepNo) : undefined;
      let url = '';
      try {
        url = page ? page.url() : '';
      } catch {}
      this.stepTelemetry.push({
        stepIndex: stepNo,
        stepText: this.currentStep,
        durationMs: duration,
        status: options.error ? 'failed' : 'passed',
        error: options.error ? this.cleanError(options.error) : undefined,
        url,
        auraActions: [...this.currentStepAuraActions],
        screenshot
      });
    }
    this.currentStep = '';

    // Save telemetry to disk for studio server to consume
    try {
      const resultsDir = path.resolve(process.cwd(), 'test-results');
      if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true });
      }
      const telemetryPath = path.join(resultsDir, `${this.currentTestId}-telemetry.json`);
      fs.writeFileSync(telemetryPath, JSON.stringify(this.stepTelemetry, null, 2), 'utf-8');
    } catch {}

    if (this.cdpSession) {
      try {
        await this.cdpSession.send('Page.stopScreencast').catch(() => {});
      } catch {}
      this.cdpSession = null;
    }
    if (this.ws) {
      try {
        this.ws.send(
          JSON.stringify({
            type: 'telemetry_saved',
            testId: this.currentTestId,
            telemetry: this.stepTelemetry
          })
        );
        this.ws.close();
      } catch {}
      this.ws = null;
    }
  }
}
