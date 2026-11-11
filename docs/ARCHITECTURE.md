# How Orgwright works

This is a tour of the code as it is today. If something here disagrees with the code, the code wins, and please open an issue.

## The big picture

```text
 plain-English steps
        │
        ▼
 ┌──────────────┐   org metadata   ┌───────────────┐
 │   resolver   │ ◄─────────────── │  introspector │ ◄── Salesforce CLI (sf)
 └──────┬───────┘                  └───────────────┘
        │ typed steps (TestStep[])
        ▼
 ┌──────────────┐
 │   codegen    │  ──► tests/generated/<id>.spec.ts   (plain Playwright)
 └──────┬───────┘
        │
        ▼
 ┌──────────────┐   live frames, step events, pause/repair   ┌──────────┐
 │    runner    │ ◄────────────────── WebSocket ───────────► │  Studio  │
 └──────────────┘                                             └──────────┘
        │
        ▼
 utils/lightning-helpers.ts  (what every generated test calls into)
```

Everything under `orgwright/` is a pnpm workspace. The root of the repo is an ordinary Playwright project: `playwright.config.ts`, `pages/`, `utils/` and `tests/`. Generated specs live there too, so they run with plain `npx playwright test` and don't need Orgwright installed.

## Packages

### `@orgwright/core`
Shared types, defined as Zod schemas in `packages/core/src/types/`. The important one is `TestStep`: the raw text a person typed, plus the `ResolvedAction` it turned into (`type`, `target`, `field`, `value`, `confidence`). `ActionTypeEnum` lists every action the system understands. When you add a new one, the code generator's tests fail until you give it a sample, which is on purpose.

### `@orgwright/resolver`
Turns lines of English into `TestStep`s. It's deterministic: regular expressions and fuzzy matching, no AI model involved.

- `stepParser.ts`: strips numbering and bullets, fixes common typos ("clciking app auncher"), then matches the line against roughly 40 phrase patterns. Anything it can't place becomes a low-confidence `custom` step.
- `catalogMatcher.ts`: checks targets against your org's real objects, fields, picklist values, apps, tabs and list views, and keeps track of which object each step is on. After "Navigate to Encounter tab", fields are checked against `Encounter__c`, not the object you started on.
- `stepInsights.ts`: produces the warnings you see in the Studio's step check: unknown fields, invalid picklist values, read-only fields, empty `""` placeholders, undefined `{{variables}}`. Each comes with suggested rewrites.

### `@orgwright/codegen`
`stepEmitter.ts` turns each resolved action into Playwright code, and `specGenerator.ts` wraps the steps in a spec file. Rules it follows:

- Every step runs inside `StreamHelper.runStep(page, "<raw text>", …)`, so the Studio knows which step is running and can pause on a failure.
- **Fail loudly.** A step it doesn't understand, `Run Apex` (not implemented yet) or a missing tab throws an error. A generated test never passes without doing what the step says.
- Field locators combine role, label and form-element matches, keep only visible elements, and match the whole label. Salesforce keeps hidden list-view headers labelled like your fields behind every New-record modal.
- `{{tokens}}` become `OrgwrightData.resolve(...)` calls, so each run gets fresh values. Records created through the API are cleaned up in `afterEach`.

### `@orgwright/introspector`
Reads metadata from the org by calling the Salesforce CLI (`sf sobject describe`, `sf data query`, …), and caches the results as JSON files in `.orgwright/cache/`, one per org and object. `releaseDiff.ts` compares two cached snapshots, for example before and after a sandbox refresh, and reports added, removed and changed fields.

### `@orgwright/runner`
Starts `npx playwright test` for a spec, streams its output and reports results back to the Studio. Runs are sequential (`workers: 1`) because parallel tests on one org tend to fight over record locks.

### `@orgwright/sf-connect`
Login helpers. `cliAuth.ts` opens the org through the CLI's frontdoor URL, the same thing `sf org open` does, so whatever MFA you completed when you ran `sf org login web` carries over. `jwtAuth.ts` is a placeholder; real JWT bearer login isn't implemented yet.

## The Studio (`orgwright/apps/studio`)

A React + Vite front end and an Express + WebSocket server (`server/index.ts`), both started by `npm run studio`.

- **Steps → spec:** `server/lib/spec-builder.ts` is the one place a test definition becomes a spec. Studio runs, batch runs and the nightly suite all go through it. "Use block" lines are expanded first (`server/lib/blocks.ts`).
- **Test cases** are JSON files in `tests/definitions/`. The generated spec sits next to them in `tests/generated/`.
- **Live view and repair:** the generated test connects back to the server over WebSocket (`utils/stream-helper.ts`). It streams screenshots and step events. When a step fails in a headed run with "Pause on failure" on, the test waits in place. The repair panel lets you click the right element in the live view, or edit the step and retry, and the test carries on from there.
- **After a failure:** `server/failure-analyzer.ts` turns Playwright's error and call log into a plain explanation and a suggested fix. `server/salesforce-log-analyzer.ts` pulls recent Apex debug logs for the run and lists the validation rules, flows and DML that fired.
- **Org selection:** the Studio lists the orgs your Salesforce CLI knows. Set `ORGWRIGHT_ORGS=alias1,alias2` to limit the list (handy if your CLI also holds client orgs) and `ORGWRIGHT_DEFAULT_ORG` to choose the default.
- **Nightly suite:** `server/cli/run-suite.ts` runs a whole project and can post a summary to Microsoft Teams (`ORGWRIGHT_TEAMS_WEBHOOK`).

The server is meant for your own machine. It isn't hardened for a shared network yet.

## `utils/lightning-helpers.ts`

This is the knowledge of how Lightning behaves, and it's the one place where it lives. It covers spinners and in-flight Aura calls (`waitForLightningReady`), comboboxes whose options render outside the component, the App Launcher, navigation tabs, including overflow menus and console apps, list views and row selection, related lists, path stages, record types, dual list boxes, inline edit, owner change, approvals and lead conversion. It also dismisses Salesforce's in-app prompts automatically, because their mask blocks every click (turn that off with `ORGWRIGHT_KEEP_PROMPTS=1`).

The helpers are tested against saved Lightning pages in `tests-orgwright/fixtures/` (`npm run test:helpers`), so most changes can be checked without an org.

## Tests

| Command | What it covers | Needs an org? |
|---|---|---|
| `npm run test:unit` | Step parser golden cases, and code generator output for every action type (syntax-checked with the TypeScript compiler) | No |
| `npm run test:helpers` | Lightning helpers against saved pages | No |
| `npm run test:regression` | Your generated specs | Yes |

CI runs `test:unit` and type-checks the Studio on every push.

## Ideas that aren't built yet

Earlier design notes went further than the code. These are good directions, but none of them exists today, so don't build on them:

- A drop-in `@orgwright/sf-diagnostics` Playwright plugin with `persona`, `sf`, `data` and `logs` fixtures, for existing Playwright suites.
- Failure classification into fixed categories (validation rule, field-level security, sharing, Apex exception, flow error, governor limit, UI change, test data, environment), with confidence scores.
- A YAML "persona security matrix": expected access per profile, checked through the API, with a report of which permission set granted unexpected access.
- JWT bearer login for headless CI personas, and a synthetic data factory with run-ID tagging and a purge command.
- An optional AI fallback for steps the rules can't resolve, limited to metadata names and never sent record data.

If you want to work on one of these, open an issue first so we can agree on the shape.
