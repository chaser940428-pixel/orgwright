# Tester guide

This guide is for manual testers, BAs and Salesforce admins. You don't need to write code. You write test steps in plain English, Orgwright checks them against your org, runs them in a real browser, and stops to let you fix things when a step fails.

## Why Salesforce is hard to automate

If you've tried recording Salesforce tests before, you've probably hit some of these:

- **IDs change all the time.** Lightning generates ids like `id="124:0"` that are different after every reload, so recorded clicks break.
- **Spinners.** Click while a spinner is still turning and the click is simply lost.
- **Details vs. Related.** Record pages often open on Related. Fields like Phone or Owner don't exist on the page until you open Details.
- **Hidden buttons.** On a narrow window, Edit, Delete and custom actions collapse into "Show more actions".
- **Toasts vanish.** The green "was created" message disappears after a few seconds.
- **Pop-ups appear at random.** Salesforce shows in-app tips ("Try the new Salesforce Setup") whenever it feels like it, and they block the whole page.

Orgwright handles these for you. It finds fields and buttons by their visible label, waits for spinners and server calls to finish, opens "Show more actions" when a button is hidden there, catches toasts before they disappear, and dismisses those in-app tips.

## The Studio at a glance

Start it with `npm run studio` and open http://localhost:5173.

**Left panel: the test case**
- Ticket number, test case ID, project, scenario type (positive or negative), name, tags, priority and owner.
- **Steps**: where you write the test, one step per line. The **Record** button turns your clicks in the live browser into steps.
- **Object picker** (under the steps), the object the steps start on, such as Account or Opportunity. Orgwright loads that object's fields from your org.
- **Step check**: updates as you type and shows how each line was understood. A yellow warning means something doesn't match your org, for example a field name with a typo, with one-click fixes.
- **Add app opening steps**, **Blocks** (reusable groups of steps) and **Cheat sheet** (every phrase Orgwright understands).
- **Data rows** (optional): run the same steps once per row of data.
- **Headed Browser** shows the browser while it runs. **Pause on failure** stops on a failed step so you can fix it.
- **Save** and **Run Test**.

**Right panel**
- **Test Suite**: all your saved tests, with filters, last results, import/export, ~100 standard templates and the nightly run.
- **Live Browser**: the test's browser, streamed live. This is also where the repair panel appears when a step fails.
- **Results**: pass/fail for every step, with timings and a screenshot of each.

The header shows which org you're connected to. The green dot means it's reachable.

## Positive and negative tests

A **positive** test checks that valid data works: fill the required fields, save, see the green toast.

A **negative** test checks that Salesforce *blocks* what it should: a missing required field, a value a validation rule rejects, a user who shouldn't see a field. If a negative test fails, bad data got in, which is usually the more serious bug.

The most useful tests often do both: **try something invalid, check that it's blocked, fix it, check that it saves.**

## How to write a step

Every step is **verb + target + value**:

- the verb: Open, Click, Enter, Select, Check, Verify…
- the target: the label you see on screen ("Account Name", "Save", "Details")
- the value: always in double quotes ("Acme Corp")

### Phrases Orgwright understands

| You want to… | Write | Notes |
|---|---|---|
| Log in | `Log in to Salesforce` | Uses the org selected in the header |
| Open an app | `Click App Launcher` then `Search app "Sales"` | |
| Open a tab in the app | `Select "Accounts" tab in the app` | |
| Open a list | `Open Account list` | |
| Pick a list view | `Select list view "All Accounts"` | |
| Open a record | `Open recent Account` or `Open record {{caseId}}` | |
| Click a button | `Click on New button`, `Click on Save button` | Looks in "Show more actions" too |
| Open a record tab | `Click on Details tab` | Do this before checking fields |
| Type into a field | `Enter "Acme {{unique}}" in "Account Name"` | `{{unique}}` makes the value different on every run |
| Pick from a picklist | `Select "Technology" from "Industry" picklist` | Spelling must match the org |
| Tick a checkbox | `Check "Do Not Call"` | |
| Choose a record type | `Choose record type "Clinic Visit"` | |
| Move a path stage | `Mark stage as "Qualification"` | |
| Work with related lists | `Click "New" in "Contacts" related list` | |
| Edit inline | `Inline edit "Status" to "Working"` | |
| Change owner, delete, convert | `Change owner to "Jane Doe"`, `Delete record`, `Convert lead` | |
| Search | `Search for "Acme" and open first result` | |
| Scroll | `Scroll down`, `Scroll to "Save"` | |
| Remember a value | `Remember record Id as caseId` | Use it later as `{{caseId}}` |
| Check a toast | `Verify toast "was created"` | |
| Check a field | `Verify field "Industry" equals "Technology"` | |
| Check an error | `Verify error "Complete this field." on "Close Date"` | Leave out `on "…"` for a page-level error |
| Check something is (not) there | `Verify "Audit Note" is visible`, `Verify "Delete" button is not visible` | |
| Check access | `Verify field "Amount" is read-only`, `Verify field "Description" is editable` | |
| Count related records | `Verify "Contacts" related list has at least 2 records` | |

Open the **Cheat sheet** in the Studio for the full list. If Orgwright doesn't understand a line, the step check marks it, and the test fails on that line when it runs rather than skipping it.

### Ten habits that save time

1. Use the label you see on screen, never the API name (`Account Name`, not `Name`).
2. Put values in double quotes.
3. Click the Details tab before checking fields.
4. One action per line.
5. Copy picklist values exactly as they appear in the org.
6. Make checks specific: `Verify toast "was created"`, not "check it saved".
7. Check the exact error text in negative tests.
8. Don't add waits. Orgwright already waits for Salesforce.
9. Use `{{unique}}` in names so reruns don't collide with old records.
10. Fix every yellow warning in the step check before you run.

## Example 1: create an account (positive)

```text
1. Log in to Salesforce
2. Open Account list
3. Click on New button
4. Enter "Summit Healthcare {{unique}}" in "Account Name"
5. Select "Healthcare" from "Industry" picklist
6. Enter "555-0188" in "Phone"
7. Click on Save button
8. Verify toast "was created"
9. Click on Details tab
10. Verify field "Industry" equals "Healthcare"
```

## Example 2: a validation rule blocks Closed Won (negative, then recovery)

This assumes your org has a rule that requires Amount before an Opportunity can be Closed Won. Replace the error text with your rule's actual message.

```text
1. Log in to Salesforce
2. Open Opportunity list
3. Click on New button
4. Enter "Q4 Expansion {{unique}}" in "Opportunity Name"
5. Enter "{{today+30}}" in "Close Date"
6. Select "Closed Won" from "Stage" picklist
7. Click on Save button
8. Verify error "Amount is required to close this Opportunity"
9. Enter "85000" in "Amount"
10. Click on Save button
11. Verify toast "was created"
```

## Running a test

Click **Run Test**. With **Headed Browser** on, the **Live Browser** tab streams the run: you see each page open, each value typed and each button clicked. **Pause Run** and **Stop** sit next to Save.

When it's done, the **Results** tab shows PASSED or FAILED, the total time, and every step with its own timing and screenshot.

## When a step fails

With **Pause on failure** on, the test stops on the failing step and leaves the browser open on that page. The Live Browser tab shows what went wrong, in plain words, and two ways out:

- **Option 1: do it in the Live Browser.** Click the right element in the live view. Orgwright performs the click, records it as the new step and carries on.
- **Option 2: edit the step and retry.** Fix the text, for example a typo in a field name, and click **Retry step**.

Either way the run continues from where it stopped, so you don't have to rerun a long test from the start. Click **Stop repairing and fail the test** if you want the failure to stand.

> Use **Retry step** in the repair panel. The big **Resume Run** button continues a run you paused yourself; it doesn't repair a failed step.

After a run, the Studio also pulls recent Salesforce debug logs for that user and lists the validation rules, flows and record changes that fired. That's useful to paste into a bug ticket for a developer.

## Common problems

| What you see | Why | Fix |
|---|---|---|
| "Field … was not found" | You're on the Related tab | Add `Click on Details tab` first |
| A button can't be found | It's under "Show more actions", or the user can't see it | Orgwright checks the menu; if it still fails, check the user's profile |
| A picklist value isn't selected | Spelling or capitals differ from the org | Copy the value exactly; the step check warns about this |
| "Orgwright does not understand this step" | The phrasing isn't one it knows | Check the Cheat sheet, or rephrase |
| Every test fails at login | The CLI session expired | Run `sf org login web --alias <your alias>` again |

## FAQ

**Do I need to write code?** No. The generated Playwright code is there if a developer wants it, but you never have to touch it.

**Can I edit steps after recording them?** Yes. They're plain text, so edit them like any other text.

**Can tests run without a visible browser?** Yes. Untick **Headed Browser**. Pausing on failure needs the browser, so failures just fail in that mode.

**Where are the ready-made tests?** Test Suite → **Standard tests**. There are about 100 templates for Sales, Service and other clouds. Load one and adjust the values to your org.
