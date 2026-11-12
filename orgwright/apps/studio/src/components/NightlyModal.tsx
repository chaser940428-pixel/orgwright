import React, { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Modal, btn } from './ui/Modal';
import { EnvBadge, OrgEnvironment } from './Header';

interface NightlyModalProps {
  open: boolean;
  onClose: () => void;
  tags: string[];
  defaultOrg: string;
  orgEnv: OrgEnvironment;
  orgEnvLabel: string;
  /** Resolves false to cancel saving (production guard) */
  confirmSave?: () => Promise<boolean>;
}

interface NightlyState {
  config: { tag: string; time: string; browser: string; alias: string; teamsWebhook: string };
  last: null | { startedAt: string; total: number; passed: number; failed: number; unknown: number; tag?: string };
  commands: { runNow: string; schedule: string; remove: string };
  /** Whether Windows Task Scheduler has the nightly task (read-only check on the server) */
  schedule?: { supported: boolean; registered: boolean; nextRun?: string; status?: string };
}

/** Settings for the scheduled (Windows Task Scheduler) nightly regression run. */
export function NightlyModal({ open, onClose, tags, defaultOrg, orgEnv, orgEnvLabel, confirmSave }: NightlyModalProps) {
  const [state, setState] = useState<NightlyState | null>(null);
  const [tag, setTag] = useState('');
  const [time, setTime] = useState('02:00');
  const [webhook, setWebhook] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const [checking, setChecking] = useState(false);
  const refresh = () => {
    setChecking(true);
    return fetch('/api/nightly')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setState((s) => (s ? { ...s, schedule: d.schedule, last: d.last } : d));
      })
      .catch((e) => setError(String(e)))
      .finally(() => setChecking(false));
  };

  useEffect(() => {
    if (!open) return;
    fetch('/api/nightly')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setState(d);
          setTag(d.config.tag || '');
          setTime(d.config.time || '02:00');
          setWebhook(d.config.teamsWebhook || '');
        }
      })
      .catch((e) => setError(String(e)));
  }, [open]);

  if (!open) return null;

  const save = async () => {
    if (confirmSave && !(await confirmSave())) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/nightly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag, time, alias: state?.config.alias || defaultOrg, teamsWebhook: webhook })
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error || 'Save failed');
      setState((s) => (s ? { ...s, config: d.config, commands: d.commands } : s));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const copy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const field = 'mt-1 h-9 w-full rounded-md border border-slate-300 px-2.5 text-sm focus:outline-none focus:border-primary';

  const nightlyOrg = state?.config.alias || defaultOrg;

  return (
    <Modal open={open} onClose={onClose} title="Nightly regression" size="md">
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-md border border-border bg-slate-50 px-3 py-2">
            <span className="text-xs font-medium text-slate-700">Org</span>
            <span className="flex items-center gap-2">
              <span className="font-mono text-sm text-slate-900">{nightlyOrg || 'No org connected'}</span>
              {nightlyOrg && nightlyOrg === defaultOrg && <EnvBadge env={orgEnv} label={orgEnvLabel} />}
            </span>
          </div>
          <p>
            Runs every test with the chosen tag, headless, on this computer — even when the Studio is closed. Results go to each test's run history and to{' '}
            <code className="text-xs">test-results/nightly-&lt;date&gt;.md</code>.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Tag to run</span>
              <input list="nightly-tags" value={tag} onChange={(e) => setTag(e.target.value)} className={field} placeholder="Regression" />
              <datalist id="nightly-tags">
                {tags.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Time (24h)</span>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Microsoft Teams incoming webhook (optional)</span>
            <input value={webhook} onChange={(e) => setWebhook(e.target.value)} className={field} placeholder="https://…webhook.office.com/…" />
          </label>
          {error && <p className="text-danger">{error}</p>}
          <button type="button" onClick={save} disabled={saving} className={btn.primary}>
            {saving ? 'Saving…' : 'Save settings'}
          </button>

          {state && (
            <div
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                state.schedule?.registered ? 'border-emerald-200 bg-success-soft text-success' : 'border-amber-200 bg-warning-soft text-warning'
              }`}
              role="status"
            >
              <span className="flex-1">
                {state.schedule?.registered ? (
                  <>
                    <strong>Scheduled</strong>
                    {state.schedule.nextRun ? ` — next run ${state.schedule.nextRun}` : ''}
                    {state.schedule.status ? ` (${state.schedule.status})` : ''}
                  </>
                ) : state.schedule && !state.schedule.supported ? (
                  <>
                    <strong>Not scheduled</strong> — Task Scheduler is only available on Windows. Use cron or your CI to run the command below.
                  </>
                ) : (
                  <>
                    <strong>Not scheduled</strong> — run the “Schedule daily” command below once.
                  </>
                )}
              </span>
              <button type="button" onClick={refresh} disabled={checking} className="text-xs underline cursor-pointer disabled:opacity-50">
                {checking ? 'Checking…' : 'Check again'}
              </button>
            </div>
          )}

          {state && (
            <div className="space-y-2 border-t border-border pt-3">
              <p className="font-medium text-slate-900">{state.schedule?.registered ? 'Schedule commands' : 'Turn on the schedule (once, in Command Prompt)'}</p>
              {[
                ['schedule', 'Schedule daily', state.commands.schedule],
                ['run', 'Run now', state.commands.runNow],
                ['remove', 'Remove schedule', state.commands.remove]
              ].map(([key, label, cmd]) => (
                <div key={key}>
                  <div className="text-xs text-muted">{label}</div>
                  <div className="flex items-start gap-2">
                    <code className="flex-1 break-all rounded bg-slate-100 px-2 py-1 text-xs">{cmd}</code>
                    <button type="button" onClick={() => copy(key, cmd)} className="p-1 text-muted hover:text-slate-900 cursor-pointer" aria-label={`Copy ${label}`}>
                      {copied === key ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted">The computer must be on and signed in at that time. Saved settings apply to the next run.</p>
              {state.last && (
                <p className="text-xs">
                  Last nightly ({new Date(state.last.startedAt).toLocaleString()}): {state.last.passed}/{state.last.total} passed
                  {state.last.failed ? `, ${state.last.failed} failed` : ''}
                </p>
              )}
            </div>
          )}
        </div>
    </Modal>
  );
}
