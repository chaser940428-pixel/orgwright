import React, { useEffect, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';

interface NightlyModalProps {
  open: boolean;
  onClose: () => void;
  tags: string[];
  defaultOrg: string;
}

interface NightlyState {
  config: { tag: string; time: string; browser: string; alias: string; teamsWebhook: string };
  last: null | { startedAt: string; total: number; passed: number; failed: number; unknown: number; tag?: string };
  commands: { runNow: string; schedule: string; remove: string };
}

/** Settings for the scheduled (Windows Task Scheduler) nightly regression run. */
export function NightlyModal({ open, onClose, tags, defaultOrg }: NightlyModalProps) {
  const [state, setState] = useState<NightlyState | null>(null);
  const [tag, setTag] = useState('');
  const [time, setTime] = useState('02:00');
  const [webhook, setWebhook] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

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

  const field = 'mt-1 h-9 w-full rounded-md border border-slate-300 px-2.5 text-sm focus:outline-none focus:border-blue-500';

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Nightly run">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">Nightly regression</h2>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-900 cursor-pointer" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 px-5 py-4 text-sm text-slate-700">
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
              <input value={time} onChange={(e) => setTime(e.target.value)} className={field} placeholder="02:00" />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Microsoft Teams incoming webhook (optional)</span>
            <input value={webhook} onChange={(e) => setWebhook(e.target.value)} className={field} placeholder="https://…webhook.office.com/…" />
          </label>
          {error && <p className="text-rose-700">{error}</p>}
          <button type="button" onClick={save} disabled={saving} className="h-9 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer">
            {saving ? 'Saving…' : 'Save settings'}
          </button>

          {state && (
            <div className="space-y-2 border-t border-slate-200 pt-3">
              <p className="font-medium text-slate-900">Turn on the schedule (once, in Command Prompt)</p>
              {[
                ['schedule', 'Schedule daily', state.commands.schedule],
                ['run', 'Run now', state.commands.runNow],
                ['remove', 'Remove schedule', state.commands.remove]
              ].map(([key, label, cmd]) => (
                <div key={key}>
                  <div className="text-xs text-slate-500">{label}</div>
                  <div className="flex items-start gap-2">
                    <code className="flex-1 break-all rounded bg-slate-100 px-2 py-1 text-xs">{cmd}</code>
                    <button type="button" onClick={() => copy(key, cmd)} className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer" aria-label={`Copy ${label}`}>
                      {copied === key ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              ))}
              <p className="text-xs text-slate-500">The computer must be on and signed in at that time. Saved settings apply to the next run.</p>
              {state.last && (
                <p className="text-xs">
                  Last nightly ({new Date(state.last.startedAt).toLocaleString()}): {state.last.passed}/{state.last.total} passed
                  {state.last.failed ? `, ${state.last.failed} failed` : ''}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
