# Salesforce & CareCloud RCM Notes Sync — Playwright Automation

End-to-end automated testing suite for **Salesforce Lightning** (a stage sandbox) and **CareCloud**, specifically implementing the manual test scenarios from `RCM Notes Sync.xlsx`.

---

## 🚀 Key Framework Features

- **Zero-MFA Instant Login:** Uses the Salesforce CLI frontdoor session (`sf org open -o sandboxOrg -r --url-only`), bypassing multi-factor authentication (MFA) and IP verification codes.
- **Session State Reuse:** Authenticates once via `tests/auth.setup.ts` and caches the authenticated state (`.auth/salesforce-state.json`), enabling rapid test execution without re-logging in.
- **Salesforce Lightning Resiliency:** `LightningHelpers` automatically handles asynchronous Aura/LWC spinners (`.slds-spinner_container`), toast notifications, comboboxes, and modals without brittle sleeps.
- **Cross-System Architecture:** Built with the Page Object Model (POM) separating Salesforce Encounter operations (`EncounterNotesPage`) and CareCloud patient verification (`CareCloudPage`).

---

## 📁 Project Structure

```text
Playwright/
├── .auth/                        # Cached browser session storageState
├── pages/
│   ├── BasePage.ts               # Resilient navigation & App Launcher
│   ├── EncounterNotesPage.ts     # Encounter records, New Note modal, Sync button
│   └── CareCloudPage.ts          # CareCloud login & Patient Notes verification
├── utils/
│   ├── lightning-helpers.ts      # THE single home for all Lightning helpers (spinners, toasts, comboboxes, nav, related lists...)
│   └── salesforce-auth.ts        # CLI frontdoor URL bypass & form login fallback
├── tests/
│   ├── auth.setup.ts             # Global one-time auth project
│   └── rcm-notes-sync.spec.ts    # Automated test cases from RCM Notes Sync.xlsx
├── playwright.config.ts          # Framework timeout & browser configuration
├── .env                          # Sandbox credentials and URLs
└── package.json                  # Scripts & dependencies
```

---

## ⚡ Quick Start

### 1. Install Dependencies & Browsers
```powershell
npm install
npx playwright install chromium
```

### 2. Configure Credentials in `.env`
Update `.env` with your Stage sandbox credentials or ensure your Salesforce CLI is already logged into the sandbox (`sandboxOrg`):
```ini
SF_LOGIN_URL=https://your-org--sandbox.sandbox.my.salesforce.com
SF_USERNAME=you@example.com.sandbox
SF_PASSWORD=your_password_here
SF_ORG_ALIAS=sandboxOrg
```

---

## 🧪 Running the Tests

### Interactive UI Mode (Recommended for Development & Debugging)
Opens Playwright's time-travel visual test runner:
```powershell
npm run test:ui
```

### Run All RCM Notes Sync Tests (Headless)
```powershell
npm run test:notes
```

### Run Tests in Headed Mode (Watch Browser Live)
```powershell
npm run test:headed
```

### View HTML Test Report & Trace Snapshots
```powershell
npm run test:report
```

---

## 📋 Test Case Mapping (`RCM Notes Sync.xlsx`)

| Excel Test ID | Test Scenario | Automated In |
| :--- | :--- | :--- |
| **TC_001** | Login to Salesforce & navigate to Revenue Ops Console | `tests/rcm-notes-sync.spec.ts` |
| **TC_002** | Create Note on Encounter Record | `tests/rcm-notes-sync.spec.ts` |
| **TC_007** | Update existing Note content in Salesforce | `tests/rcm-notes-sync.spec.ts` |
| **TC_017** | Verify Sequential Note Titles (`Note 1`, `Note 2`) | `tests/rcm-notes-sync.spec.ts` |
| **TC_031** | Verify "Sync Notes" button popup message | `tests/rcm-notes-sync.spec.ts` |
| **TC_032** | Verify Close / Cancel button on Sync popup | `tests/rcm-notes-sync.spec.ts` |
| **TC_037 & TC_038** | Verify Bold / Italic / Bullet list formatting | `tests/rcm-notes-sync.spec.ts` |
| **TC_039 & TC_047** | Verify Owner and Last Modified timestamp updates | `tests/rcm-notes-sync.spec.ts` |
