import { Page, Locator } from '@playwright/test';
import { waitForLightningReady } from './spinner.js';
import { activateTab, openConsoleWorkspaceTab } from './tabs.js';
import { selectCombobox, selectLookup, fillField, setCheckbox } from './inputs.js';
import { verifyToast, dismissToast } from './toast.js';
import { saveModal, cancelModal } from './modals.js';
import { scrollPage, scrollToElement, clickButton } from './scroll.js';

export class LightningHelpers {
  static waitForLightningReady = waitForLightningReady;
  static activateTab = activateTab;
  static openConsoleWorkspaceTab = openConsoleWorkspaceTab;
  static selectCombobox = selectCombobox;
  static selectLookup = selectLookup;
  static fillField = fillField;
  static setCheckbox = setCheckbox;
  static verifyToast = verifyToast;
  static dismissToast = dismissToast;
  static saveModal = saveModal;
  static cancelModal = cancelModal;
  static scrollPage = scrollPage;
  static scrollToElement = scrollToElement;
  static clickButton = clickButton;
}
