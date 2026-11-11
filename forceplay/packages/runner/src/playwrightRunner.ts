import { spawn, execSync, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { TestExecutionReport } from '@kplay/core';

export interface RunOptions {
  specFile?: string;
  specFiles?: string[];
  cwd?: string;
  headed?: boolean;
  browserChannel?: string; // 'chrome' (default) | 'msedge' | 'chromium'
  project?: string;
  ticketNumber?: string;
  testId?: string;
  testName?: string;
  onLog?: (line: string) => void;
  env?: Record<string, string>;
}

let activeTestProcess: ChildProcess | null = null;
let currentRunAborted = false;

/**
 * Stops any actively running Playwright test process tree immediately.
 */
export function stopTestExecution(): boolean {
  if (!activeTestProcess) {
    return false;
  }
  currentRunAborted = true;
  try {
    const pid = activeTestProcess.pid;
    if (pid) {
      if (process.platform === 'win32') {
        try {
          execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
        } catch {}
      } else {
        try {
          process.kill(-pid, 'SIGKILL');
        } catch {}
      }
    }
    try {
      activeTestProcess.kill('SIGKILL');
    } catch {}
    activeTestProcess = null;
    return true;
  } catch (e) {
    activeTestProcess = null;
    return false;
  }
}

/**
 * Returns whether a test execution is actively running.
 */
export function isTestRunning(): boolean {
  return activeTestProcess !== null;
}

export async function executePlaywrightTest(options: RunOptions): Promise<TestExecutionReport> {
  const startedAt = new Date().toISOString();
  const startTime = Date.now();
  const logs: string[] = [];
  const testId = options.testId || (options.specFile ? path.basename(options.specFile, '.spec.ts') : 'BATCH');
  const workingDir = options.cwd || process.cwd();

  const headedFlag = options.headed !== false ? '--headed' : '';
  const projectFlag = options.project ? `--project=${options.project}` : '';

  let filesArg = '';
  if (options.specFiles && options.specFiles.length > 0) {
    filesArg = options.specFiles.map(f => `"${f}"`).join(' ');
  } else if (options.specFile) {
    filesArg = `"${options.specFile}"`;
  } else {
    filesArg = 'tests/generated';
  }

  const cmdStr = `npx playwright test ${filesArg} ${headedFlag} ${projectFlag} --workers=1`.replace(/\s+/g, ' ').trim();

  const browserChannel = options.browserChannel || 'chrome';

  return new Promise((resolve) => {
    currentRunAborted = false;
    console.log(`[runner] Launching default browser (${browserChannel}): ${cmdStr} in ${workingDir}`);

    const proc = spawn(cmdStr, {
      cwd: workingDir,
      shell: true,
      env: {
        ...process.env,
        PLAYWRIGHT_BROWSER_CHANNEL: browserChannel,
        // Untick "Headed Browser" => really headless (playwright.config reads HEADLESS)
        HEADLESS: options.headed === false ? 'true' : 'false',
        FORCE_COLOR: '1',
        ...(options.env || {})
      }
    });

    activeTestProcess = proc;

    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      logs.push(text);
      if (options.onLog) {
        options.onLog(text);
      }
    });

    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      logs.push(text);
      if (options.onLog) {
        options.onLog(text);
      }
    });

    proc.on('error', (err) => {
      activeTestProcess = null;
      const errorMsg = `\n[runner] Process error: ${err.message}\n`;
      logs.push(errorMsg);
      if (options.onLog) options.onLog(errorMsg);
    });

    proc.on('close', (code) => {
      activeTestProcess = null;
      const durationMs = Date.now() - startTime;
      const finishedAt = new Date().toISOString();
      const wasStopped = currentRunAborted;
      const rawLogs = logs.join('');
      const passed = !wasStopped && code === 0 && !rawLogs.includes('failed');

      if (wasStopped && options.onLog) {
        options.onLog('\n[runner] ⏹ Test execution stopped by user.\n');
      }

      const resultsDir = path.resolve(workingDir, 'test-results');
      let tracePath: string | undefined;
      let videoPath: string | undefined;

      if (fs.existsSync(resultsDir)) {
        try {
          const files = fs.readdirSync(resultsDir, { recursive: true }) as string[];
          const traceFile = files.find(f => f.endsWith('trace.zip'));
          const videoFile = files.find(f => f.endsWith('.webm'));
          if (traceFile) tracePath = path.join(resultsDir, traceFile);
          if (videoFile) videoPath = path.join(resultsDir, videoFile);
        } catch {}
      }

      resolve({
        testId,
        ticketNumber: options.ticketNumber,
        name: options.testName || testId,
        status: wasStopped ? 'interrupted' : (passed ? 'passed' : 'failed'),
        durationMs,
        startedAt,
        finishedAt,
        steps: [],
        tracePath,
        videoPath,
        rawLogs: wasStopped ? `${rawLogs}\n[runner] ⏹ Test execution stopped by user.` : rawLogs
      });
    });
  });
}
