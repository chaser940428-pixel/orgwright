import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, Search } from 'lucide-react';
import { Modal, btn } from './ui/Modal';
import { SALESFORCE_STANDARD_TEMPLATES, SalesforceTestTemplate } from '../data/salesforce-templates';

export interface WizardResult {
  objectName: string;
  testName: string;
  steps: string;
  tags: string[];
  run: boolean;
}

interface OnboardingWizardProps {
  open: boolean;
  onClose: () => void;
  orgConnected: boolean;
  orgLabel: string;
  onOpenConnector: () => void;
  /** Explore the editor with demo steps when no org is connected */
  onTryDemo: () => void;
  standardObjects: string[];
  customObjects: string[];
  initialObject: string;
  onFinish: (result: WizardResult) => void;
}

interface FieldMeta {
  apiName: string;
  label: string;
  type: string;
  required: boolean;
  readOnly: boolean;
  picklistValues: string[];
}

const pretty = (api: string) => api.replace(/__c$/i, '').replace(/_/g, ' ');

/** Builds a starter "create record" test from the object's real required fields. */
function starterSteps(objectApi: string, label: string, fields: FieldMeta[]): string {
  const word = /^[A-Za-z0-9_]+$/.test(label) ? label : objectApi;
  const editable = fields.filter((f) => !f.readOnly && !['OwnerId', 'RecordTypeId'].includes(f.apiName));
  const lines = ['Log in to Salesforce', `Open ${word} list`, 'Click on New button'];
  const required = editable.filter((f) => f.required).slice(0, 4);
  const toFill = required.length ? required : editable.filter((f) => f.type === 'string').slice(0, 1);
  for (const f of toFill) {
    if (f.type === 'picklist' && f.picklistValues.length) lines.push(`Select "${f.picklistValues[0]}" from "${f.label}" picklist`);
    else if (f.type === 'date' || f.type === 'datetime') lines.push(`Enter "{{today}}" in "${f.label}"`);
    else if (f.type === 'boolean') lines.push(`Check "${f.label}"`);
    else if (f.type === 'reference') lines.push(`Select "" in "${f.label}" lookup`);
    else if (f.type === 'email') lines.push(`Enter "{{random.email}}" in "${f.label}"`);
    else lines.push(`Enter "Test {{unique}}" in "${f.label}"`);
  }
  lines.push('Click on Save button', 'Verify toast "was created"');
  return lines.map((l, i) => `${i + 1}. ${l}`).join('\n');
}

/** First-run guide: connect an org → pick an object → pick a starter test → run it. */
export function OnboardingWizard(props: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [object, setObject] = useState(props.initialObject || 'Account');
  const [query, setQuery] = useState('');
  const [fields, setFields] = useState<FieldMeta[]>([]);
  const [label, setLabel] = useState('');
  const [loadingFields, setLoadingFields] = useState(false);
  const [choice, setChoice] = useState<string>('starter');

  useEffect(() => {
    if (!props.open || step !== 2) return;
    setLoadingFields(true);
    fetch(`/api/org/describe?alias=${encodeURIComponent(props.orgLabel)}&object=${encodeURIComponent(object)}`)
      .then((r) => r.json())
      .then((d) => {
        setFields(d.success ? d.fields : []);
        setLabel(d.success ? d.label : pretty(object));
      })
      .catch(() => setFields([]))
      .finally(() => setLoadingFields(false));
  }, [props.open, step, object, props.orgLabel]);

  const objects = useMemo(() => {
    const all = [...new Set([...props.customObjects, ...props.standardObjects])];
    const q = query.trim().toLowerCase();
    return (q ? all.filter((o) => o.toLowerCase().includes(q) || pretty(o).toLowerCase().includes(q)) : all).slice(0, 40);
  }, [props.customObjects, props.standardObjects, query]);

  const templates: SalesforceTestTemplate[] = useMemo(
    () => SALESFORCE_STANDARD_TEMPLATES.filter((t) => t.objectName.toLowerCase() === object.toLowerCase()).slice(0, 6),
    [object]
  );

  if (!props.open) return null;

  const objLabel = label || pretty(object);
  const starter = starterSteps(object, objLabel, fields);
  const chosen = choice === 'starter'
    ? { testName: `Create a new ${objLabel}`, steps: starter, tags: ['Smoke'] }
    : choice === 'blank'
    ? { testName: `${objLabel} test`, steps: '', tags: [] as string[] }
    : (() => {
        const t = templates.find((x) => x.id === choice)!;
        return { testName: t.testName, steps: t.steps, tags: t.tags || [] };
      })();

  const finish = (run: boolean) => {
    try {
      localStorage.setItem('orgwright.onboarded', '1');
    } catch {}
    props.onFinish({ objectName: object, ...chosen, run: run && Boolean(chosen.steps) });
  };

  const close = () => {
    try {
      localStorage.setItem('orgwright.onboarded', '1');
    } catch {}
    props.onClose();
  };

  const titles = ['Connect your org', 'Choose an object', 'Pick a starter test', 'Run it'];

  return (
    <Modal open={props.open} onClose={close} title="Get started with Orgwright" size="md" closeOnBackdrop={false}>
        <ol className="flex flex-wrap items-center gap-1 text-xs text-slate-600">
          {titles.map((t, i) => (
            <li key={t} className="flex items-center gap-1">
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${i < step ? 'bg-success text-white' : i === step ? 'bg-primary text-white' : 'bg-slate-200 text-slate-600'}`}>
                {i < step ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span className={i === step ? 'text-slate-900 font-medium' : ''}>{t}</span>
              {i < titles.length - 1 && <ChevronRight className="h-3 w-3" />}
            </li>
          ))}
        </ol>

        <div className="min-h-[260px] py-4 text-sm text-slate-700">
          {step === 0 && (
            <div className="space-y-3">
              {props.orgConnected ? (
                <p>
                  Connected to <strong>{props.orgLabel}</strong>. Orgwright reads objects and fields from this org to check your steps.
                </p>
              ) : (
                <p>Connect a Salesforce sandbox so Orgwright can read its objects and fields and run tests in it.</p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={props.onOpenConnector} className={props.orgConnected ? btn.secondary : btn.primary}>
                  {props.orgConnected ? 'Change org' : 'Connect an org'}
                </button>
                {!props.orgConnected && (
                  <button type="button" onClick={props.onTryDemo} className={btn.ghost}>
                    Try with demo steps (no org)
                  </button>
                )}
              </div>
              {!props.orgConnected && <p className="text-xs text-slate-600">Next unlocks once an org is connected.</p>}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-2">
              <p>Which object do you want to test first?</p>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search objects" className="h-9 w-full rounded-md border border-slate-300 pl-8 pr-2 text-sm focus:outline-none focus:border-primary" autoFocus />
              </div>
              <ul className="max-h-48 overflow-y-auto rounded-md border border-border">
                {objects.map((o) => (
                  <li key={o}>
                    <button type="button" onClick={() => setObject(o)} className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm cursor-pointer ${o === object ? 'bg-primary-soft text-blue-800 font-medium' : 'hover:bg-slate-50'}`}>
                      <span>{pretty(o)}</span>
                      <span className="font-mono text-xs text-slate-400">{o}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-2">
              {loadingFields && <p className="text-muted">Reading {pretty(object)} fields…</p>}
              {[
                { id: 'starter', title: `Create a new ${objLabel}`, desc: fields.length ? 'Built from this object’s required fields' : 'Basic create-record flow' },
                ...templates.map((t) => ({ id: t.id, title: t.testName, desc: t.description })),
                { id: 'blank', title: 'Start from an empty test', desc: 'Write the steps yourself' }
              ].map((opt) => (
                <label key={opt.id} className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 ${choice === opt.id ? 'border-blue-400 bg-primary-soft/50' : 'border-border hover:bg-slate-50'}`}>
                  <input type="radio" name="starter" checked={choice === opt.id} onChange={() => setChoice(opt.id)} className="mt-1" />
                  <span>
                    <span className="block font-medium text-slate-900">{opt.title}</span>
                    <span className="block text-xs text-muted">{opt.desc}</span>
                  </span>
                </label>
              ))}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-2">
              <p>
                <strong>{chosen.testName}</strong> on {objLabel}
              </p>
              {chosen.steps ? (
                <pre className="max-h-48 overflow-auto rounded-md bg-slate-50 p-2 font-mono text-xs text-slate-700">{chosen.steps}</pre>
              ) : (
                <p className="text-muted">An empty test will open in the editor.</p>
              )}
              <p className="text-xs text-muted">If a step fails, the run pauses so you can click the right element in the Live Browser and continue.</p>
            </div>
          )}
        </div>

        <div className="-mx-5 -mb-4 flex items-center justify-between border-t border-border px-5 py-3">
          <button type="button" onClick={close} className="text-sm text-muted hover:text-slate-900 cursor-pointer">
            Skip
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button type="button" onClick={() => setStep(step - 1)} className="h-9 rounded-md border border-slate-300 px-3 text-sm hover:bg-slate-50 cursor-pointer">
                Back
              </button>
            )}
            {step < 3 ? (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                disabled={step === 0 && !props.orgConnected}
                title={step === 0 && !props.orgConnected ? 'Connect an org first, or try the demo steps' : undefined}
                className={btn.primary}
              >
                Next
              </button>
            ) : (
              <>
                <button type="button" onClick={() => finish(false)} className="h-9 rounded-md border border-slate-300 px-3 text-sm hover:bg-slate-50 cursor-pointer">
                  Open in editor
                </button>
                {chosen.steps && (
                  <button type="button" onClick={() => finish(true)} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary-hover cursor-pointer">
                    Run test
                  </button>
                )}
              </>
            )}
          </div>
        </div>
    </Modal>
  );
}
