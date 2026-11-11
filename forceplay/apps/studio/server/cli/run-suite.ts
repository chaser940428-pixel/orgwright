/**
 * Headless suite runner for scheduled (nightly) regression.
 *
 *   npx tsx server/cli/run-suite.ts                 # uses .kplay/nightly.json (tag, org, browser, Teams webhook)
 *   npx tsx server/cli/run-suite.ts --tag Smoke     # override the tag
 *   npx tsx server/cli/run-suite.ts --headed        # watch it run
 *
 * Writes test-results/nightly-<date>.md, appends every test's result to run history and
 * posts a summary to Teams when a webhook is configured. Exit code 1 when any test failed.
 */
import * as fs from 'fs';
import * as path from 'path';
import { RESULTS_DIR } from '../lib/paths';
import { postToTeams, readNightlyConfig, runSuite, saveLastNightly, summaryText } from '../lib/suite-runner';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const cfg = readNightlyConfig();
  const tag = arg('tag') ?? cfg.tag;
  const alias = arg('org') ?? cfg.alias;
  console.log(`[nightly] Running tests tagged "${tag}" against ${alias}...`);
  const summary = await runSuite({
    tag: tag || undefined,
    alias,
    browser: arg('browser') ?? cfg.browser,
    headed: process.argv.includes('--headed'),
    source: 'nightly',
    onLog: (line) => process.stdout.write(line)
  });
  if (summary.total === 0) {
    console.error(`[nightly] No tests are tagged "${tag}". Add the tag to tests in the Studio (Tags field) or change it in Nightly run settings.`);
    process.exit(3);
  }
  saveLastNightly(summary);
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const file = path.join(RESULTS_DIR, `nightly-${summary.startedAt.slice(0, 10)}.md`);
  fs.writeFileSync(file, `# ${summaryText(summary)}\n`, 'utf-8');
  console.log(`\n${summaryText(summary)}\n[nightly] Summary written to ${file}`);
  const webhook = process.env.KPLAY_TEAMS_WEBHOOK || cfg.teamsWebhook;
  if (webhook) await postToTeams(webhook, summary);
  process.exit(summary.failed > 0 || summary.unknown > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[nightly] Run failed:', err);
  process.exit(2);
});
