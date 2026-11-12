import type { Express } from 'express';
import * as path from 'path';
import { execFile } from 'child_process';
import { readHistory, summarizeHistory } from '../lib/history';
import { ROOT_DIR, isValidTestId } from '../lib/paths';
import { readDefinitions, readLastNightly, readNightlyConfig, saveNightlyConfig } from '../lib/suite-runner';

/** Run history, tags and nightly-run settings. */
export function registerSuiteRoutes(app: Express): void {
  app.get('/api/history/:id', (req, res) => {
    if (!isValidTestId(req.params.id)) return res.status(400).json({ error: 'Invalid test id' });
    res.json({ success: true, records: readHistory(req.params.id, 50).reverse(), summary: summarizeHistory(req.params.id) });
  });

  app.get('/api/tags', (_req, res) => {
    const counts = new Map<string, number>();
    for (const d of readDefinitions()) {
      for (const t of Array.isArray(d.tags) ? d.tags : []) counts.set(t, (counts.get(t) || 0) + 1);
    }
    res.json({ success: true, tags: [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => a.tag.localeCompare(b.tag)) });
  });

  app.get('/api/nightly', async (_req, res) => {
    const cfg = readNightlyConfig();
    const schedule = await queryNightlyTask();
    res.json({ success: true, config: { ...cfg, teamsWebhook: cfg.teamsWebhook ? '(configured)' : '' }, last: readLastNightly(), commands: nightlyCommands(cfg.time), schedule });
  });

  app.post('/api/nightly', (req, res) => {
    const current = readNightlyConfig();
    const { tag, time, browser, alias, teamsWebhook } = req.body || {};
    if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      return res.status(400).json({ success: false, error: 'Time must be HH:mm (24h)' });
    }
    const next = {
      tag: typeof tag === 'string' ? tag : current.tag,
      time: time || current.time,
      browser: browser || current.browser,
      alias: alias || current.alias,
      // Keep the stored webhook unless a new one is given (the UI never receives it back)
      teamsWebhook: teamsWebhook === '' ? undefined : teamsWebhook && teamsWebhook !== '(configured)' ? teamsWebhook : current.teamsWebhook
    };
    saveNightlyConfig(next);
    res.json({ success: true, config: { ...next, teamsWebhook: next.teamsWebhook ? '(configured)' : '' }, commands: nightlyCommands(next.time) });
  });
}

function nightlyCommands(time: string) {
  const bat = path.join(ROOT_DIR, 'run-nightly.bat');
  return {
    runNow: `"${bat}"`,
    schedule: `schtasks /Create /F /SC DAILY /ST ${time} /TN "Orgwright Nightly Regression" /TR "\\"${bat}\\""`,
    remove: 'schtasks /Delete /F /TN "Orgwright Nightly Regression"'
  };
}

const TASK_NAME = 'Orgwright Nightly Regression';

export interface NightlySchedule {
  supported: boolean;
  registered: boolean;
  nextRun?: string;
  status?: string;
}

/** Asks Windows Task Scheduler whether the nightly task is registered (read-only query). */
function queryNightlyTask(): Promise<NightlySchedule> {
  if (process.platform !== 'win32') return Promise.resolve({ supported: false, registered: false });
  return new Promise((resolve) => {
    execFile('schtasks', ['/Query', '/TN', TASK_NAME, '/FO', 'CSV', '/NH'], { timeout: 5000, windowsHide: true }, (err, stdout) => {
      if (err || !stdout) return resolve({ supported: true, registered: false });
      // "TaskName","Next Run Time","Status"
      const cols = String(stdout).trim().split(/\r?\n/)[0].split('","').map((c) => c.replace(/^"|"$/g, '').trim());
      resolve({ supported: true, registered: true, nextRun: cols[1], status: cols[2] });
    });
  });
}
