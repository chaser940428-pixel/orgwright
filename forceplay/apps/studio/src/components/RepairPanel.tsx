import React, { useEffect, useState } from 'react';
import { MousePointerClick, RotateCcw, Wrench, XCircle } from 'lucide-react';

export interface RepairState {
  stepIndex: number;
  step: string;
  error: string;
  capturedStep?: string;
}

interface RepairPanelProps {
  repair: RepairState;
  onUseClick: () => void;
  onRetry: (newStep: string) => void;
  onFail: () => void;
  busy?: boolean;
}

/**
 * Shown when a live run is paused on a failing step. The tester can click the right element
 * in the live browser (that click performs the step and becomes the new step text), or edit
 * the step and retry it, or let the test fail.
 */
export function RepairPanel({ repair, onUseClick, onRetry, onFail, busy }: RepairPanelProps) {
  const [text, setText] = useState(repair.step.replace(/^\s*\d+[.)]\s*/, ''));
  useEffect(() => setText(repair.step.replace(/^\s*\d+[.)]\s*/, '')), [repair.step, repair.error]);

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-[13px] text-slate-800 space-y-2" role="alert">
      <div className="flex items-start gap-2">
        <Wrench className="h-4 w-4 mt-0.5 text-amber-700 flex-shrink-0" />
        <div className="min-w-0">
          <div className="font-semibold text-slate-900">Step {repair.stepIndex} failed — the run is paused</div>
          <div className="text-slate-700">{repair.error}</div>
          <div className="mt-0.5 font-mono text-xs text-slate-500 truncate" title={repair.step}>{repair.step}</div>
        </div>
      </div>

      <div className="rounded border border-amber-200 bg-white p-2 space-y-1.5">
        <div className="flex items-center gap-1.5 font-medium">
          <MousePointerClick className="h-4 w-4 text-blue-600" />
          Option 1: do it in the Live Browser
        </div>
        <p className="text-xs text-slate-600">Click the correct element in the Live Browser view. KPlay performs the click and records it as the new step.</p>
        {repair.capturedStep ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{repair.capturedStep}</code>
            <button type="button" disabled={busy} onClick={onUseClick} className="h-7 rounded-md bg-blue-600 px-2.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer">
              Use this step and continue
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-500">Waiting for your click…</p>
        )}
      </div>

      <div className="rounded border border-amber-200 bg-white p-2 space-y-1.5">
        <div className="flex items-center gap-1.5 font-medium">
          <RotateCcw className="h-4 w-4 text-blue-600" />
          Option 2: edit the step and retry
        </div>
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="h-8 flex-1 rounded-md border border-slate-300 px-2 font-mono text-xs focus:outline-none focus:border-blue-500"
            aria-label="Edited step"
          />
          <button type="button" disabled={busy || !text.trim()} onClick={() => onRetry(text.trim())} className="h-8 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50 cursor-pointer">
            Retry step
          </button>
        </div>
        <p className="text-xs text-slate-500">Retry supports click, enter, select, verify toast, scroll and wait steps.</p>
      </div>

      <button type="button" disabled={busy} onClick={onFail} className="inline-flex items-center gap-1 text-xs text-rose-700 hover:underline cursor-pointer">
        <XCircle className="h-3.5 w-3.5" /> Stop repairing and fail the test
      </button>
    </div>
  );
}
