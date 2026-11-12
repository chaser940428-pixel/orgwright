import React from 'react';
import { AlertTriangle, Disc, Loader2, Pause } from 'lucide-react';
import { useRun } from '../run/RunContext';

interface RunStatusStripProps {
  /** Shows a persistent warning while the connected org is production */
  isProduction: boolean;
  selectedOrg: string;
  activeTab: string;
  onGoToFix: () => void;
  onOpenLive: () => void;
  onStop: () => void;
}

/** Thin strip under the header, visible on every tab while a run or recording is active. */
export function RunStatusStrip({ isProduction, selectedOrg, activeTab, onGoToFix, onOpenLive, onStop }: RunStatusStripProps) {
  const run = useRun();
  const active = run.isRunning || run.isRecording || Boolean(run.repair);

  return (
    <div aria-live="polite">
      {isProduction && (
        <div className="border-b border-rose-700 bg-danger px-5 py-1 text-center text-xs font-semibold text-white">
          PRODUCTION org ({selectedOrg}) — runs and saves change real data. You will be asked to confirm the org alias once per session.
        </div>
      )}
      {active && (
        <div
          className={`flex items-center justify-between gap-3 border-b px-5 py-1.5 text-sm ${
            run.repair || run.isPaused
              ? 'border-amber-300 bg-warning-soft text-amber-950'
              : run.isRecording
              ? 'border-rose-200 bg-danger-soft text-rose-900'
              : 'border-blue-200 bg-primary-soft text-blue-900'
          }`}
        >
          <div className="flex min-w-0 items-center gap-2">
            {run.repair || run.isPaused ? (
              <Pause className="h-4 w-4 flex-shrink-0 text-warning" aria-hidden="true" />
            ) : run.isRecording ? (
              <Disc className="h-4 w-4 flex-shrink-0 text-danger" aria-hidden="true" />
            ) : (
              <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-primary-hover motion-reduce:animate-none" aria-hidden="true" />
            )}
            <span className="font-semibold">{run.stage.headline}</span>
            {run.repair ? (
              <span className="truncate text-amber-900">{run.repair.error}</span>
            ) : run.isRecording ? (
              <span className="truncate">{run.recordedStepsCount} step{run.recordedStepsCount === 1 ? '' : 's'} recorded</span>
            ) : run.liveStep ? (
              <span className="truncate text-slate-700">{run.liveStep}</span>
            ) : null}
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            {run.repair && (
              <button type="button" onClick={onGoToFix} className="h-7 rounded-md bg-amber-600 px-2.5 text-xs font-semibold text-white hover:bg-amber-700 cursor-pointer">
                Go to fix
              </button>
            )}
            {!run.repair && activeTab !== 'browser' && (
              <button type="button" onClick={onOpenLive} className="h-7 rounded-md border border-current/30 bg-white px-2.5 text-xs font-medium hover:bg-slate-50 cursor-pointer">
                Watch live
              </button>
            )}
            {run.isRunning && (
              <button
                type="button"
                onClick={onStop}
                disabled={run.isStopping}
                className="flex h-7 items-center gap-1 rounded-md border border-rose-300 bg-white px-2.5 text-xs font-medium text-rose-800 hover:bg-danger-soft disabled:opacity-50 cursor-pointer"
              >
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                {run.isStopping ? 'Stopping…' : 'Stop'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
