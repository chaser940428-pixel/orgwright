import { chromium, Browser, BrowserContext, Page, CDPSession } from 'playwright';
import * as path from 'path';
import { ROOT_DIR } from './lib/paths';
import * as fs from 'fs';
import { logger } from './logger';

export interface RecorderOptions {
  startUrl?: string;
  instanceUrl?: string;
  browserChannel?: string;
  objectName?: string;
  onStep?: (step: string) => void;
  broadcast?: (msg: any) => void;
}

let activeBrowser: Browser | null = null;
let activeContext: BrowserContext | null = null;
let activePage: Page | null = null;
let activeCdpSession: CDPSession | null = null;
let isRecording = false;
let recordedSteps: string[] = [];
let currentBroadcast: ((msg: any) => void) | null = null;

let lastFrameTimestamp = Date.now();
let screencastHeartbeatTimer: NodeJS.Timeout | null = null;

// RAW SCRIPT STRING: Immune to tsx / esbuild compilation
const RECORD_INJECTION_SCRIPT = `
(function() {
  if (typeof window.__name === 'undefined') {
    window.__name = function(target, value) { return target; };
  }

  if (window.__KPLAY_RECORDER_INSTALLED__) return;
  window.__KPLAY_RECORDER_INSTALLED__ = true;

  console.log('[KPlay Studio] Interactive recorder script initialized on:', window.location.href);

  var activeFocusedField = '';
  var lastActionText = '';
  var lastActionTime = 0;
  var lastScrollY = window.scrollY || 0;
  var scrollTimer = null;
  var inputDebounceTimer = null;

  function clean(str) {
    if (!str) return '';
    return String(str).replace(/[\\r\\n\\t]+/g, ' ').replace(/\\s+/g, ' ').trim();
  }

  function cleanLabel(str) {
    var c = clean(str);
    c = c.replace(/^[*\\s]+/, '').replace(/[*\\s]+$/, '').trim();
    c = c.replace(/__c$/i, '').replace(/_/g, ' ').trim();
    return c;
  }

  function showToast(label, x, y) {
    try {
      var badge = document.createElement('div');
      badge.innerText = '⚡ KPlay Recorded: ' + label;
      badge.style.position = 'fixed';
      badge.style.left = Math.min(Math.max((x || 100) - 20, 10), window.innerWidth - 300) + 'px';
      badge.style.top = Math.max((y || 100) - 45, 10) + 'px';
      badge.style.background = 'linear-gradient(135deg, #0284c7, #2563eb)';
      badge.style.color = '#ffffff';
      badge.style.padding = '6px 14px';
      badge.style.borderRadius = '8px';
      badge.style.fontSize = '12px';
      badge.style.fontFamily = 'system-ui, -apple-system, sans-serif';
      badge.style.fontWeight = '600';
      badge.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)';
      badge.style.zIndex = '99999999';
      badge.style.pointerEvents = 'none';
      badge.style.transition = 'all 0.3s ease-out';
      document.body.appendChild(badge);

      setTimeout(function() {
        badge.style.opacity = '0';
        badge.style.transform = 'translateY(-10px)';
        setTimeout(function() { badge.remove(); }, 350);
      }, 1200);
    } catch (e) {}
  }

  function emitAction(action, x, y) {
    if (!action || !action.stepText) return;
    var now = Date.now();
    // Only debounce if the EXACT same step text occurred within 500ms (accidental double-click)
    if (action.stepText === lastActionText && (now - lastActionTime) < 500) {
      return;
    }
    lastActionText = action.stepText;
    lastActionTime = now;

    showToast(action.label || action.stepText, x, y);
    if (typeof window.__kplay_emit_action__ === 'function') {
      window.__kplay_emit_action__(action);
    }
  }

  function extractActionFromPath(path) {
    if (!path || path.length === 0) return null;

    // 1. Check for Combobox / Dropdown Option (Item clicked in listbox)
    for (var i = 0; i < path.length; i++) {
      var el = path[i];
      if (!(el instanceof HTMLElement)) continue;
      var tag = el.tagName.toLowerCase();
      var role = el.getAttribute('role');
      if (
        tag === 'lightning-base-combobox-item' ||
        role === 'option' ||
        tag === 'option' ||
        el.classList.contains('slds-listbox__option')
      ) {
        var txt = clean(el.innerText || el.textContent || el.getAttribute('data-value'));
        if (txt && txt.length < 50) {
          return {
            actionType: 'choose_option',
            stepText: 'Choose ' + txt + ' as option',
            label: txt
          };
        }
      }
    }

    // 2. Check for Tab (Details, Related, etc.)
    for (var i = 0; i < path.length; i++) {
      var el = path[i];
      if (!(el instanceof HTMLElement)) continue;
      if (el.getAttribute('role') === 'tab' || el.classList.contains('slds-tabs_default__link')) {
        var txt = clean(el.innerText || el.textContent || el.getAttribute('title'));
        if (txt && txt.length < 40) {
          return {
            actionType: 'click_tab',
            stepText: 'Click on ' + txt + ' tab',
            label: txt
          };
        }
      }
    }

    // 3. Check for Input or Textarea
    var isInputEl = false;
    for (var i = 0; i < path.length; i++) {
      var el = path[i];
      if (!(el instanceof HTMLElement)) continue;
      var tag = el.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea') {
        if (el.getAttribute('type') === 'button' || el.getAttribute('type') === 'submit') continue;
        isInputEl = true;
        break;
      }
    }

    if (isInputEl) {
      var label = '';
      for (var i = 0; i < path.length; i++) {
        var el = path[i];
        if (!(el instanceof HTMLElement)) continue;
        if (el.getAttribute('label')) {
          label = cleanLabel(el.getAttribute('label'));
          break;
        }
        if (el.getAttribute('aria-label')) {
          label = cleanLabel(el.getAttribute('aria-label'));
          break;
        }
        if (el.querySelector) {
          var lbl = el.querySelector('label, .slds-form-element__label');
          if (lbl && clean(lbl.innerText)) {
            label = cleanLabel(lbl.innerText);
            break;
          }
        }
        if (el.getAttribute('placeholder')) {
          label = cleanLabel(el.getAttribute('placeholder'));
          break;
        }
        if (el.getAttribute('name')) {
          var nameAttr = clean(el.getAttribute('name'));
          if (nameAttr && !nameAttr.includes('-')) {
            label = cleanLabel(nameAttr);
            break;
          }
        }
      }

      if (!label) {
        for (var i = 0; i < path.length; i++) {
          var el = path[i];
          if (el instanceof HTMLElement && el.classList.contains('slds-form-element')) {
            var lbl = el.querySelector('label, .slds-form-element__label');
            if (lbl && clean(lbl.innerText)) {
              label = cleanLabel(lbl.innerText);
              break;
            }
          }
        }
      }

      if (label) {
        activeFocusedField = label;
        return {
          actionType: 'focus_field',
          stepText: 'click on ' + label + ' field',
          label: label
        };
      }
    }

    // 4. Check for Combobox / Dropdown Trigger
    for (var i = 0; i < path.length; i++) {
      var el = path[i];
      if (!(el instanceof HTMLElement)) continue;
      var tag = el.tagName.toLowerCase();
      var role = el.getAttribute('role');
      if (
        tag === 'lightning-combobox' ||
        (role === 'combobox' && !['input', 'textarea'].includes(tag)) ||
        (tag === 'select' && el.classList.contains('slds-select'))
      ) {
        var label = cleanLabel(el.getAttribute('label'));
        if (!label) {
          for (var j = 0; j < path.length; j++) {
            var p = path[j];
            if (!(p instanceof HTMLElement)) continue;
            if (p.getAttribute('label')) {
              label = cleanLabel(p.getAttribute('label'));
              break;
            }
            var lbl = p.querySelector ? p.querySelector('label, .slds-form-element__label') : null;
            if (lbl && clean(lbl.innerText)) {
              label = cleanLabel(lbl.innerText);
              break;
            }
          }
        }
        if (label) {
          return {
            actionType: 'click_dropdown',
            stepText: 'Click on ' + label + ' dropdown',
            label: label
          };
        }
      }
    }

    // 5. Check for Button (Create RUL, Save, Edit, Cancel, New, Sync, etc.)
    for (var i = 0; i < path.length; i++) {
      var el = path[i];
      if (!(el instanceof HTMLElement)) continue;
      var tag = el.tagName.toLowerCase();
      var role = el.getAttribute('role');
      if (
        tag === 'button' ||
        role === 'button' ||
        el.classList.contains('slds-button') ||
        tag === 'lightning-button'
      ) {
        var visibleText = clean(el.innerText || el.textContent);
        var ariaText = clean(el.getAttribute('title') || el.getAttribute('aria-label'));
        var nameText = clean(el.getAttribute('name'));
        if (nameText && nameText.includes('.')) {
          nameText = nameText.split('.').pop() || nameText;
          nameText = nameText.replace(/_/g, ' ');
        }
        var btnText = visibleText || ariaText || nameText;
        if (btnText && btnText.startsWith('SaveEdit')) btnText = 'Save';
        if (btnText && btnText.startsWith('SaveAndNew')) btnText = 'Save & New';
        if (btnText && btnText.length > 0 && btnText.length < 50) {
          return {
            actionType: 'click_button',
            stepText: 'Click on ' + btnText + ' button',
            label: btnText
          };
        }
      }
    }

    // 6. Check for Table Record Link
    for (var i = 0; i < path.length; i++) {
      var el = path[i];
      if (!(el instanceof HTMLElement)) continue;
      if (
        el.getAttribute('data-refid') === 'recordId' ||
        (el.tagName.toLowerCase() === 'a' && el.closest && el.closest('tbody tr th'))
      ) {
        var recName = clean(el.innerText || el.textContent || el.getAttribute('title'));
        var isRawId = /^[a-zA-Z0-9]{15,18}$/.test(recName);
        var step = isRawId ? ('Click on ' + recName + ' record') : (recName ? ('Click on ' + recName + ' record') : 'Click on first record in list');
        return {
          actionType: 'open_record',
          stepText: step,
          label: recName || 'Encounter record'
        };
      }
    }

    // 7. General Clickable Link / Truncated Title (Explicit link elements only)
    for (var i = 0; i < path.length; i++) {
      var el = path[i];
      if (!(el instanceof HTMLElement)) continue;
      var tag = el.tagName.toLowerCase();
      if (tag === 'a' || el.getAttribute('role') === 'link' || el.classList.contains('slds-truncate')) {
        var txt = clean(el.innerText || el.textContent);
        if (txt && txt.length > 2 && txt.length < 40 && !txt.includes('\\n')) {
          return {
            actionType: 'click_text',
            stepText: 'Click on "' + txt + '"',
            label: txt
          };
        }
      }
    }

    return null;
  }

  // Capture Click on Window (Capture Phase)
  window.addEventListener(
    'click',
    function(e) {
      try {
        var path = e.composedPath ? e.composedPath() : [e.target];
        var action = extractActionFromPath(path);
        if (action) {
          emitAction(action, e.clientX, e.clientY);
        }
      } catch (err) {
        console.error('[KPlay] Click recording error:', err);
      }
    },
    true
  );

  // Synchronous Input Commit Helper
  function handleInputCommitSync(target, path) {
    try {
      if (!target || (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA')) return;
      if (target.type === 'checkbox' || target.type === 'radio') return;
      var val = clean(target.value);
      if (val) {
        var field = activeFocusedField;
        if (path && path.length) {
          for (var i = 0; i < path.length; i++) {
            var p = path[i];
            if (!(p instanceof HTMLElement)) continue;
            if (p.getAttribute('label')) {
              field = cleanLabel(p.getAttribute('label'));
              break;
            }
            var lbl = p.querySelector ? p.querySelector('label, .slds-form-element__label') : null;
            if (lbl && clean(lbl.innerText)) {
              field = cleanLabel(lbl.innerText);
              break;
            }
          }
        }

        var stepText = 'Type ' + val + ' as value';
        emitAction({
          actionType: 'type_value',
          stepText: stepText,
          field: field,
          value: val,
          label: val
        }, window.innerWidth / 2, 80);
      }
    } catch (err) {
      console.error('[KPlay] Input recording error:', err);
    }
  }

  window.addEventListener('change', function(e) {
    var path = e.composedPath ? e.composedPath() : [e.target];
    handleInputCommitSync(e.target, path);
  }, true);

  window.addEventListener('blur', function(e) {
    var path = e.composedPath ? e.composedPath() : [e.target];
    handleInputCommitSync(e.target, path);
  }, true);

  window.addEventListener('input', function(e) {
    var target = e.target;
    var path = e.composedPath ? e.composedPath() : [target];
    if (inputDebounceTimer) clearTimeout(inputDebounceTimer);
    inputDebounceTimer = setTimeout(function() {
      handleInputCommitSync(target, path);
    }, 600);
  }, true);

  window.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === 'Tab') {
      var path = e.composedPath ? e.composedPath() : [e.target];
      handleInputCommitSync(e.target, path);
    }
  }, true);

  // Capture Wheel / Scroll Events (Debounced & with capture: true for Salesforce inner containers)
  var accumulatedScrollDelta = 0;
  window.addEventListener(
    'wheel',
    function(e) {
      accumulatedScrollDelta += e.deltaY;
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(function() {
        if (Math.abs(accumulatedScrollDelta) >= 60) {
          var isDown = accumulatedScrollDelta > 0;
          var stepText = isDown ? 'Scroll down' : 'Scroll up';
          emitAction({
            actionType: 'scroll',
            stepText: stepText,
            label: stepText
          }, window.innerWidth / 2, Math.max(100, Math.min(window.innerHeight - 100, (e.clientY || 200))));
        }
        accumulatedScrollDelta = 0;
      }, 350);
    },
    { capture: true, passive: true }
  );

  // Also capture scroll events on inner containers (.slds-modal__content, scrollable divs, etc.)
  window.addEventListener(
    'scroll',
    function(e) {
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(function() {
        var targetEl = e.target;
        var currentY = (targetEl === document || targetEl === window)
          ? (window.scrollY || (document.documentElement && document.documentElement.scrollTop) || 0)
          : (targetEl && targetEl.scrollTop ? targetEl.scrollTop : 0);

        var diff = currentY - lastScrollY;
        lastScrollY = currentY;

        if (Math.abs(diff) >= 80) {
          var stepText = diff > 0 ? 'Scroll down' : 'Scroll up';
          emitAction({
            actionType: 'scroll',
            stepText: stepText,
            label: stepText
          }, window.innerWidth / 2, 100);
        }
      }, 350);
    },
    { capture: true, passive: true }
  );
})();
`;

function startScreencastHeartbeat() {
  if (screencastHeartbeatTimer) clearInterval(screencastHeartbeatTimer);
  screencastHeartbeatTimer = setInterval(async () => {
    if (!isRecording || !activePage || activePage.isClosed()) return;
    const now = Date.now();
    if (now - lastFrameTimestamp >= 700) {
      try {
        const frameBuf = await activePage.screenshot({ type: 'jpeg', quality: 60 });
        const base64 = frameBuf.toString('base64');
        lastFrameTimestamp = Date.now();
        if (currentBroadcast && isRecording && activePage) {
          currentBroadcast({
            type: 'stream_frame',
            testId: 'RECORDER',
            frame: base64,
            url: activePage.url(),
            step: recordedSteps.length > 0 ? recordedSteps[recordedSteps.length - 1] : 'Interactive Recording Active...',
            viewport: activePage.viewportSize() || { width: 1280, height: 720 }
          });
        }
      } catch {}
    }
  }, 500);
}

export function getRecorderStatus() {
  return {
    isRecording,
    stepCount: recordedSteps.length,
    recordedSteps: [...recordedSteps],
    url: activePage?.url() || ''
  };
}

export async function startRecording(options: RecorderOptions = {}): Promise<{ success: boolean; url: string }> {
  if (isRecording && activePage) {
    await activePage.bringToFront().catch(() => {});
    return { success: true, url: activePage.url() };
  }

  currentBroadcast = options.broadcast || null;
  const rootPlaywrightDir = ROOT_DIR;
  const authPath = path.resolve(rootPlaywrightDir, '.auth', 'salesforce-state.json');

  const baseOrgUrl = (options.instanceUrl || process.env.SF_LOGIN_URL || 'https://login.salesforce.com').replace(/\/+$/, '');
  const defaultUrl = options.objectName
    ? `${baseOrgUrl}/lightning/o/${options.objectName}/list?filterName=Recent`
    : `${baseOrgUrl}/lightning/page/home`;

  const targetUrl = options.startUrl || defaultUrl;
  const browserChannel = options.browserChannel || 'chrome';

  logger.recorder('SESSION_START', `Launching interactive browser (${browserChannel})`, { targetUrl, objectName: options.objectName });

  recordedSteps = [
    '1. Log in to Salesforce as standard user'
  ];
  if (options.objectName) {
    recordedSteps.push(`2. Navigate to ${options.objectName} record recent`);
  }

  try {
    activeBrowser = await chromium.launch({
      channel: browserChannel,
      headless: false,
      args: [
        '--start-maximized',
        '--disable-blink-features=AutomationControlled',
        '--no-default-browser-check',
        '--no-first-run'
      ]
    });

    activeContext = await activeBrowser.newContext({
      storageState: fs.existsSync(authPath) ? authPath : undefined,
      viewport: { width: 1280, height: 720 },
      ignoreHTTPSErrors: true
    });

    isRecording = true;

    // Expose Node.js bridge on CONTEXT (available across frames & shadow roots)
    await activeContext.exposeFunction('__kplay_emit_action__', (data: {
      actionType: string;
      stepText: string;
      field?: string;
      value?: string;
    }) => {
      if (!isRecording || !data || !data.stepText) return;

      const cleanText = data.stepText.trim();
      const normalizedNew = cleanText.toLowerCase();

      // Deduplicate if identical to the previous step (stripping leading line number)
      if (recordedSteps.length > 0) {
        const lastStep = recordedSteps[recordedSteps.length - 1];
        const normalizedLast = lastStep.replace(/^\d+\.\s*/, '').trim().toLowerCase();
        if (normalizedLast === normalizedNew) {
          logger.recorder('STEP_DEDUPLICATED', `Skipped repeated sequential action: "${cleanText}"`);
          return;
        }
      }

      if (data && data.actionType === 'focus_field' && (data as any).label) {
        lastFocusedFieldLabel = (data as any).label;
      }

      const stepNum = recordedSteps.length + 1;
      const formattedStep = `${stepNum}. ${cleanText}`;
      recordedSteps.push(formattedStep);
      logger.action(stepNum, formattedStep, data);

      if (currentBroadcast) {
        currentBroadcast({
          type: 'recorded_step',
          step: formattedStep,
          rawStep: cleanText,
          actionType: data.actionType,
          totalSteps: recordedSteps.length,
          allSteps: recordedSteps
        });
      }
    });

    // Injected DOM Script on CONTEXT (RAW STRING - immune to tsx / esbuild compilation)
    await activeContext.addInitScript({ content: RECORD_INJECTION_SCRIPT });

    activePage = await activeContext.newPage();

    // Attach console & error listeners
    activePage.on('console', (msg) => {
      if (msg.type() === 'error' || msg.text().includes('KPlay')) {
        logger.recorder('BROWSER_CONSOLE', `[${msg.type()}] ${msg.text()}`);
      }
    });
    activePage.on('pageerror', (err) => {
      logger.error('BROWSER_PAGE_ERROR', err.message, err);
    });

    // Support any new tabs / popups
    activeContext.on('page', (newPage) => {
      logger.recorder('NEW_TAB_OPENED', newPage.url());
      newPage.addInitScript({ content: RECORD_INJECTION_SCRIPT }).catch(() => {});
      newPage.evaluate(RECORD_INJECTION_SCRIPT).catch(() => {});
    });

    // CDP Screencast
    try {
      activeCdpSession = await activeContext.newCDPSession(activePage);
      await activeCdpSession.send('Page.startScreencast', {
        format: 'jpeg',
        quality: 65,
        everyNthFrame: 1
      });

      activeCdpSession.on('Page.screencastFrame', async ({ data, sessionId }) => {
        lastFrameTimestamp = Date.now();
        try {
          await activeCdpSession?.send('Page.screencastFrameAck', { sessionId });
        } catch {}

        if (currentBroadcast && isRecording && activePage) {
          currentBroadcast({
            type: 'stream_frame',
            testId: 'RECORDER',
            frame: data,
            url: activePage.url(),
            step: recordedSteps.length > 0 ? recordedSteps[recordedSteps.length - 1] : 'Interactive Recording Active...',
            viewport: activePage.viewportSize() || { width: 1280, height: 720 }
          });
        }
      });
      logger.screencast('CDP screencast initialized');
    } catch (cdpErr) {
      logger.error('CDP_SCREENCAST', 'CDP screencast setup warning', cdpErr);
    }

    // Start heartbeat timer
    startScreencastHeartbeat();

    // Handle Browser Close
    activePage.on('close', () => {
      isRecording = false;
      if (screencastHeartbeatTimer) clearInterval(screencastHeartbeatTimer);
      logger.recorder('SESSION_CLOSED', 'Browser closed');
      if (currentBroadcast) {
        currentBroadcast({
          type: 'recorder_stopped',
          totalSteps: recordedSteps.length,
          allSteps: recordedSteps
        });
      }
    });

    logger.recorder('NAVIGATING', targetUrl);
    await activePage.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(() => {});

    // Ensure recorder script is evaluated on the active page
    await activePage.evaluate(RECORD_INJECTION_SCRIPT).catch(() => {});

    if (currentBroadcast) {
      currentBroadcast({
        type: 'recorder_started',
        url: targetUrl,
        initialSteps: recordedSteps,
        viewport: activePage.viewportSize() || { width: 1280, height: 720 }
      });
    }

    return { success: true, url: targetUrl };
  } catch (err: any) {
    logger.error('RECORDER_LAUNCH', 'Launch failed', err);
    isRecording = false;
    return { success: false, url: '' };
  }
}

let lastFocusedFieldLabel = '';
let typedCharBuffer = '';
let typeFlushTimer: NodeJS.Timeout | null = null;

export function flushTypedBuffer() {
  if (typeFlushTimer) {
    clearTimeout(typeFlushTimer);
    typeFlushTimer = null;
  }
  const cleanVal = typedCharBuffer.trim();
  if (!cleanVal) return;

  const targetDesc = lastFocusedFieldLabel ? `${lastFocusedFieldLabel} field` : 'value';

  // Check if previous step was typing into the exact same field
  if (recordedSteps.length > 0) {
    const lastIdx = recordedSteps.length - 1;
    const lastStep = recordedSteps[lastIdx];
    const match = lastStep.match(/^(\d+)\.\s*Type\s+(.+?)\s+into\s+(.+)$/i);
    if (match && match[3].trim().toLowerCase() === targetDesc.toLowerCase()) {
      const prevVal = match[2].trim();
      const combinedVal = `${prevVal}${cleanVal}`;
      const updatedStep = `${match[1]}. Type ${combinedVal} into ${targetDesc}`;
      recordedSteps[lastIdx] = updatedStep;
      logger.action(parseInt(match[1], 10), updatedStep, { value: combinedVal, field: lastFocusedFieldLabel });
      if (currentBroadcast) {
        currentBroadcast({
          type: 'recorded_step',
          step: updatedStep,
          rawStep: `Type ${combinedVal} into ${targetDesc}`,
          actionType: 'type_value',
          totalSteps: recordedSteps.length,
          allSteps: recordedSteps
        });
      }
      typedCharBuffer = '';
      return;
    }
  }

  const stepNum = recordedSteps.length + 1;
  const formattedStep = `${stepNum}. Type ${cleanVal} into ${targetDesc}`;
  recordedSteps.push(formattedStep);
  logger.action(stepNum, formattedStep, { value: cleanVal, field: lastFocusedFieldLabel });

  if (currentBroadcast) {
    currentBroadcast({
      type: 'recorded_step',
      step: formattedStep,
      rawStep: `Type ${cleanVal} into ${targetDesc}`,
      actionType: 'type_value',
      totalSteps: recordedSteps.length,
      allSteps: recordedSteps
    });
  }
  typedCharBuffer = '';
}

export async function stopRecording(): Promise<{ steps: string[] }> {
  isRecording = false;
  flushTypedBuffer();
  if (screencastHeartbeatTimer) {
    clearInterval(screencastHeartbeatTimer);
    screencastHeartbeatTimer = null;
  }
  try {
    if (activeCdpSession) {
      await activeCdpSession.send('Page.stopScreencast').catch(() => {});
      activeCdpSession = null;
    }
    if (activePage) {
      await activePage.close().catch(() => {});
      activePage = null;
    }
    if (activeBrowser) {
      await activeBrowser.close().catch(() => {});
      activeBrowser = null;
    }
  } catch {}

  const finalSteps = [...recordedSteps];
  logger.recorder('SESSION_STOPPED', 'Recording complete', { stepsCount: finalSteps.length });
  return { steps: finalSteps };
}

export async function dispatchRecorderClick(x: number, y: number) {
  flushTypedBuffer();
  if (activePage && !activePage.isClosed()) {
    try {
      const vp = activePage.viewportSize() || { width: 1280, height: 720 };
      const clampedX = Math.max(0, Math.min(x, vp.width - 1));
      const clampedY = Math.max(0, Math.min(y, vp.height - 1));

      logger.click(clampedX, clampedY, { originalX: x, originalY: y, viewport: vp });

      await activePage.mouse.click(clampedX, clampedY);

      // Instant visual feedback frame: capture immediately after click
      setTimeout(async () => {
        if (activePage && !activePage.isClosed() && currentBroadcast && isRecording) {
          try {
            const buf = await activePage.screenshot({ type: 'jpeg', quality: 65 });
            lastFrameTimestamp = Date.now();
            currentBroadcast({
              type: 'stream_frame',
              testId: 'RECORDER',
              frame: buf.toString('base64'),
              url: activePage.url(),
              step: recordedSteps.length > 0 ? recordedSteps[recordedSteps.length - 1] : 'Interactive Recording Active...',
              viewport: vp
            });
          } catch {}
        }
      }, 150);
    } catch (err) {
      logger.error('CLICK_DISPATCH', 'Failed dispatching mouse click', err);
    }
  }
}

export async function dispatchRecorderScroll(deltaY: number) {
  flushTypedBuffer();
  if (activePage && !activePage.isClosed()) {
    try {
      logger.recorder('DISPATCH_SCROLL', `Scrolling deltaY: ${deltaY}`);
      
      // 1. Mouse wheel on page
      await activePage.mouse.wheel(0, deltaY).catch(() => {});

      // 2. Evaluate DOM scroll in Salesforce active scroll container
      await activePage.evaluate((dy) => {
        const candidates = [
          document.querySelector('.slds-modal__content'),
          document.querySelector('.forceDetailPanelFix'),
          document.querySelector('.flexipageDefaultAppPage'),
          document.querySelector('.slds-scrollable_y'),
          document.querySelector('div[class*="scrollable"]'),
          document.querySelector('main')
        ];
        for (const el of candidates) {
          if (el && el.scrollHeight > el.clientHeight) {
            el.scrollBy({ top: dy, behavior: 'smooth' });
            return;
          }
        }
        window.scrollBy({ top: dy, behavior: 'smooth' });
      }, deltaY).catch(() => {});

      // 3. Record step into manual steps
      const stepText = deltaY > 0 ? 'Scroll down' : 'Scroll up';
      const stepNum = recordedSteps.length + 1;
      const formattedStep = `${stepNum}. ${stepText}`;

      const lastStep = recordedSteps.length > 0 ? recordedSteps[recordedSteps.length - 1] : '';
      if (!lastStep.includes(stepText)) {
        recordedSteps.push(formattedStep);
        logger.action(stepNum, formattedStep, { actionType: 'scroll' });

        if (currentBroadcast) {
          currentBroadcast({
            type: 'recorded_step',
            step: formattedStep,
            rawStep: stepText,
            actionType: 'scroll',
            totalSteps: recordedSteps.length,
            allSteps: recordedSteps
          });
        }
      }

      // 4. Capture immediate visual feedback screenshot frame
      setTimeout(async () => {
        if (activePage && !activePage.isClosed() && currentBroadcast && isRecording) {
          try {
            const buf = await activePage.screenshot({ type: 'jpeg', quality: 65 });
            lastFrameTimestamp = Date.now();
            currentBroadcast({
              type: 'stream_frame',
              testId: 'RECORDER',
              frame: buf.toString('base64'),
              url: activePage.url(),
              step: stepText,
              viewport: activePage.viewportSize() || { width: 1280, height: 720 }
            });
          } catch {}
        }
      }, 180);
    } catch (err) {
      logger.error('SCROLL_DISPATCH', 'Failed dispatching scroll', err);
    }
  }
}

export async function dispatchRecorderType(text: string) {
  if (activePage && !activePage.isClosed()) {
    try {
      logger.recorder('DISPATCH_TYPE', `Typing into focused element: "${text}"`);
      await activePage.keyboard.type(text, { delay: 20 });

      if (text.length > 1) {
        // Multi-character input (e.g. from quick-type bar or paste)
        typedCharBuffer = text;
        flushTypedBuffer();
      } else {
        // Single-character physical keyboard input
        typedCharBuffer += text;
        if (typeFlushTimer) clearTimeout(typeFlushTimer);
        typeFlushTimer = setTimeout(() => {
          flushTypedBuffer();
        }, 750);
      }

      // Immediate visual frame update
      setTimeout(async () => {
        if (activePage && !activePage.isClosed() && currentBroadcast && isRecording) {
          try {
            const buf = await activePage.screenshot({ type: 'jpeg', quality: 65 });
            lastFrameTimestamp = Date.now();
            currentBroadcast({
              type: 'stream_frame',
              testId: 'RECORDER',
              frame: buf.toString('base64'),
              url: activePage.url(),
              step: recordedSteps.length > 0 ? recordedSteps[recordedSteps.length - 1] : 'Interactive Recording Active...',
              viewport: activePage.viewportSize() || { width: 1280, height: 720 }
            });
          } catch {}
        }
      }, 100);
    } catch (err) {
      logger.error('TYPE_DISPATCH', 'Failed typing text', err);
    }
  }
}

export async function dispatchRecorderKeyPress(key: string) {
  if (activePage && !activePage.isClosed()) {
    try {
      logger.recorder('DISPATCH_KEY', `Pressing key: "${key}"`);
      await activePage.keyboard.press(key);

      if (key === 'Backspace') {
        if (typedCharBuffer.length > 0) {
          typedCharBuffer = typedCharBuffer.slice(0, -1);
        }
      } else if (key === 'Enter' || key === 'Tab') {
        flushTypedBuffer();
      }

      // Immediate visual frame update
      setTimeout(async () => {
        if (activePage && !activePage.isClosed() && currentBroadcast && isRecording) {
          try {
            const buf = await activePage.screenshot({ type: 'jpeg', quality: 65 });
            lastFrameTimestamp = Date.now();
            currentBroadcast({
              type: 'stream_frame',
              testId: 'RECORDER',
              frame: buf.toString('base64'),
              url: activePage.url(),
              step: recordedSteps.length > 0 ? recordedSteps[recordedSteps.length - 1] : 'Interactive Recording Active...',
              viewport: activePage.viewportSize() || { width: 1280, height: 720 }
            });
          } catch {}
        }
      }, 100);
    } catch (err) {
      logger.error('KEY_DISPATCH', 'Failed pressing key', err);
    }
  }
}
