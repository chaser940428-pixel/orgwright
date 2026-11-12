import React, { createContext, useContext, useRef, useState } from 'react';
import type { RepairState } from '../components/RepairPanel';
import type { StepCheckSummary } from '../components/StepEditor';

export type RunStatus = 'idle' | 'running' | 'passed' | 'failed' | 'interrupted';

/**
 * Owns every piece of run / record state. App calls this once and publishes the result
 * through RunContext so Header, TestCard, RunBar and the status strip read the same values.
 */
export function useRunStore() {
  const [isRunning, setIsRunning] = useState(false);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [pausedStepIndex, setPausedStepIndex] = useState<number | null>(null);
  const [pausedStepText, setPausedStepText] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<RunStatus>('idle');
  const [runDuration, setRunDuration] = useState<number | null>(null);
  const [repair, setRepair] = useState<RepairState | null>(null);
  const repairRef = useRef<RepairState | null>(null);
  const [repairBusy, setRepairBusy] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isStartingRecorder, setIsStartingRecorder] = useState(false);
  const [recordedStepsCount, setRecordedStepsCount] = useState(0);
  const [liveStep, setLiveStep] = useState<string>('');
  /** Test the current/last single run belongs to */
  const [runTestId, setRunTestId] = useState<string | null>(null);

  return {
    isRunning, setIsRunning,
    isBatchRunning, setIsBatchRunning,
    isStopping, setIsStopping,
    isPaused, setIsPaused,
    pausedStepIndex, setPausedStepIndex,
    pausedStepText, setPausedStepText,
    runStatus, setRunStatus,
    runDuration, setRunDuration,
    repair, setRepair, repairRef,
    repairBusy, setRepairBusy,
    isRecording, setIsRecording,
    isStartingRecorder, setIsStartingRecorder,
    recordedStepsCount, setRecordedStepsCount,
    liveStep, setLiveStep,
    runTestId, setRunTestId
  };
}

export type RunStore = ReturnType<typeof useRunStore>;

export type Stage = 'write' | 'check' | 'run' | 'repair' | 'report' | 'record';

export interface StageInfo {
  stage: Stage;
  /** Label of the one solid primary action */
  primaryLabel: string;
  /** What the primary action does */
  primaryAction: 'run' | 'retry' | 'fix' | 'stop-recording' | 'resume' | 'none';
  /** One-line description for the status strip / document.title */
  headline: string;
}

export interface StageInput {
  isRecording: boolean;
  isRunning: boolean;
  isBatchRunning: boolean;
  isPaused: boolean;
  repair: RepairState | null;
  pausedStepIndex: number | null;
  runStatus: RunStatus;
  stepCheck: StepCheckSummary;
  hasSteps: boolean;
}

/** Single state machine behind the primary button: Write → Check → Run → Repair → Report. */
export function deriveStage(s: StageInput): StageInfo {
  if (s.isRecording) {
    return { stage: 'record', primaryLabel: 'Stop recording', primaryAction: 'stop-recording', headline: 'Recording — your clicks become steps' };
  }
  if (s.repair) {
    return {
      stage: 'repair',
      primaryLabel: `Retry step ${s.repair.stepIndex}`,
      primaryAction: 'retry',
      headline: `Paused at step ${s.repair.stepIndex} — needs your fix`
    };
  }
  if (s.isRunning) {
    if (s.isPaused) {
      return {
        stage: 'run',
        primaryLabel: 'Resume run',
        primaryAction: 'resume',
        headline: `Paused${s.pausedStepIndex !== null ? ` at step ${s.pausedStepIndex}` : ''}`
      };
    }
    return { stage: 'run', primaryLabel: 'Running…', primaryAction: 'none', headline: s.isBatchRunning ? 'Running selected tests…' : 'Running test…' };
  }
  if (!s.hasSteps) {
    return { stage: 'write', primaryLabel: 'Run test', primaryAction: 'none', headline: 'Write steps' };
  }
  if (s.stepCheck.errors > 0) {
    // Run stays the primary action; running asks "Fix first / Run anyway"
    return {
      stage: 'check',
      primaryLabel: 'Run test',
      primaryAction: 'run',
      headline: `${s.stepCheck.errors} step${s.stepCheck.errors > 1 ? 's' : ''} to fix`
    };
  }
  if (s.runStatus === 'passed' || s.runStatus === 'failed' || s.runStatus === 'interrupted') {
    return {
      stage: 'report',
      primaryLabel: 'Run again',
      primaryAction: 'run',
      headline: s.runStatus === 'passed' ? 'Passed' : s.runStatus === 'failed' ? 'Failed' : 'Stopped'
    };
  }
  return { stage: 'run', primaryLabel: 'Run test', primaryAction: 'run', headline: 'Ready to run' };
}

export interface RunContextValue extends RunStore {
  stage: StageInfo;
}

export const RunContext = createContext<RunContextValue | null>(null);

export function useRun(): RunContextValue {
  const ctx = useContext(RunContext);
  if (!ctx) throw new Error('useRun must be used inside RunContext');
  return ctx;
}
