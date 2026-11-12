import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Code2, Disc, Layers, Pause, Play, RefreshCw, RotateCcw, Save, Square, Users, Wrench } from 'lucide-react';
import { useRun } from '../run/RunContext';

interface RunBarProps {
  onPrimary: () => void;
  onSave: () => void;
  isSaving: boolean;
  isDirty: boolean;
  onRecord: () => void;
  onPause: () => void;
  onStop: () => void;
  onFailRepair: () => void;
  onOpenMatrix: () => void;
  matrixCount: number;
  isTesterMode: boolean;
  onResolve: () => void;
  isResolving: boolean;
  onGenerate: () => void;
  isGenerating: boolean;
}

/** Sticky action bar at the bottom of the test card: one solid primary action from deriveStage(). */
export function RunBar(props: RunBarProps) {
  const run = useRun();
  const { stage } = run;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const PrimaryIcon =
    stage.primaryAction === 'retry' ? RotateCcw : stage.primaryAction === 'fix' ? Wrench : stage.primaryAction === 'stop-recording' ? Square : Play;
  const primaryDisabled = stage.primaryAction === 'none' || (run.isRunning && run.repairBusy);
  const showRunMenu = !run.isRunning && !run.isRecording;

  return (
    <div className="sticky bottom-0 z-10 -mx-5 -mb-5 flex flex-wrap items-center gap-2 rounded-b-lg border-t border-border bg-white/95 px-5 py-3 backdrop-blur">
      {/* Primary + split menu */}
      <div className="relative flex flex-1 min-w-[180px]" ref={menuRef}>
        <button
          type="button"
          onClick={props.onPrimary}
          disabled={primaryDisabled}
          className={`flex flex-1 items-center justify-center gap-2 h-9 px-4 text-sm font-semibold text-white shadow-xs transition disabled:opacity-60 cursor-pointer ${
            showRunMenu ? 'rounded-l-md' : 'rounded-md'
          } ${stage.primaryAction === 'retry' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-primary hover:bg-primary-hover'}`}
          title={stage.primaryAction === 'run' ? 'Run test (Ctrl+Enter)' : stage.primaryLabel}
          aria-keyshortcuts={stage.primaryAction === 'run' ? 'Control+Enter' : undefined}
        >
          {run.isRunning && stage.primaryAction === 'none' ? (
            <RefreshCw className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <PrimaryIcon className="h-4 w-4" aria-hidden="true" />
          )}
          <span>{stage.primaryLabel}</span>
          {stage.primaryAction === 'run' && <kbd className="hidden rounded border border-white/40 px-1 text-xs font-normal sm:inline">Ctrl+Enter</kbd>}
        </button>
        {showRunMenu && (
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="More run options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex h-9 items-center rounded-r-md border-l border-primary bg-primary px-2 text-white hover:bg-primary-hover cursor-pointer"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        )}
        {menuOpen && (
          <div role="menu" className="absolute bottom-full left-0 z-30 mb-2 w-72 rounded-lg border border-border bg-white p-1.5 text-sm shadow-xl">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                props.onOpenMatrix();
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-slate-100 cursor-pointer"
            >
              <Users className="h-4 w-4 text-indigo-600" aria-hidden="true" />
              <span className="flex-1">Run as several users (matrix)…</span>
              {props.matrixCount > 0 && <span className="rounded-full border border-indigo-200 bg-indigo-50 px-1.5 text-xs font-semibold text-indigo-800">{props.matrixCount}</span>}
            </button>
            {!props.isTesterMode && (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    props.onResolve();
                  }}
                  disabled={props.isResolving}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-slate-100 cursor-pointer disabled:opacity-50"
                >
                  <Layers className="h-4 w-4 text-slate-600" aria-hidden="true" /> Resolve plan
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    props.onGenerate();
                  }}
                  disabled={props.isGenerating}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-slate-100 cursor-pointer disabled:opacity-50"
                >
                  <Code2 className="h-4 w-4 text-indigo-600" aria-hidden="true" /> Generate spec
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Run controls while running (hidden while a failed step waits for repair) */}
      {run.isRunning && !run.repair && !run.isPaused && (
        <button type="button" onClick={props.onPause} className="flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 hover:bg-slate-50 cursor-pointer">
          <Pause className="h-4 w-4" aria-hidden="true" /> Pause
        </button>
      )}
      {run.repair && (
        <button
          type="button"
          onClick={props.onFailRepair}
          disabled={run.repairBusy}
          className="h-9 rounded-md px-3 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
          title="Stop repairing and mark the test as failed"
        >
          Fail the test
        </button>
      )}
      {run.isRunning && (
        <button
          type="button"
          onClick={props.onStop}
          disabled={run.isStopping}
          className="flex h-9 items-center gap-1.5 rounded-md border border-rose-300 bg-white px-3 text-sm text-rose-800 hover:bg-danger-soft disabled:opacity-50 cursor-pointer"
        >
          <Square className="h-3.5 w-3.5" aria-hidden="true" /> {run.isStopping ? 'Stopping…' : 'Stop'}
        </button>
      )}

      {/* Save */}
      <button
        type="button"
        onClick={props.onSave}
        disabled={props.isSaving}
        className="relative flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
        title={props.isDirty ? 'Save changes (Ctrl+S)' : 'Saved'}
        aria-keyshortcuts="Control+S"
      >
        {props.isSaving ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4 text-slate-600" aria-hidden="true" />}
        <span>Save</span>
        {props.isDirty && <span className="h-2 w-2 rounded-full bg-amber-500" aria-label="unsaved changes" />}
      </button>

      {/* Record */}
      {!run.isRunning && !run.isRecording && (
        <button
          type="button"
          onClick={props.onRecord}
          disabled={run.isStartingRecorder}
          className={`flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm cursor-pointer disabled:opacity-60 ${
            run.isRecording ? 'border-rose-300 bg-danger-soft text-rose-800 hover:bg-rose-100' : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
          }`}
          title="Record steps by clicking in the browser"
        >
          {run.isStartingRecorder ? (
            <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : run.isRecording ? (
            <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          ) : (
            <Disc className="h-4 w-4 text-danger" aria-hidden="true" />
          )}
          <span>{run.isRecording ? 'Stop recording' : 'Record'}</span>
        </button>
      )}
    </div>
  );
}
