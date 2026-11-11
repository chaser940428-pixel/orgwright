import * as fs from 'fs';
import * as path from 'path';
import { ROOT_DIR } from './lib/paths';

const LOGS_DIR = path.resolve(ROOT_DIR, 'logs');
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const RECORDER_LOG_FILE = path.join(LOGS_DIR, 'recorder.log');
const STUDIO_LOG_FILE = path.join(LOGS_DIR, 'studio.log');

function timestamp(): string {
  const now = new Date();
  return now.toISOString().replace('T', ' ').replace('Z', '');
}

function appendLog(filePath: string, line: string) {
  try {
    fs.appendFileSync(filePath, line + '\n', 'utf-8');
  } catch (err) {
    console.error('Failed to write to log file:', err);
  }
}

export const logger = {
  getLogPaths() {
    return {
      recorderLog: RECORDER_LOG_FILE,
      studioLog: STUDIO_LOG_FILE,
      logsDir: LOGS_DIR
    };
  },

  info(category: string, message: string, data?: any) {
    const formatted = `[${timestamp()}] [INFO] [${category}] ${message}${data !== undefined ? ' ' + JSON.stringify(data) : ''}`;
    console.log(formatted);
    appendLog(STUDIO_LOG_FILE, formatted);
  },

  recorder(category: string, message: string, data?: any) {
    const formatted = `[${timestamp()}] [RECORDER] [${category}] ${message}${data !== undefined ? ' ' + (typeof data === 'string' ? data : JSON.stringify(data)) : ''}`;
    console.log(formatted);
    appendLog(RECORDER_LOG_FILE, formatted);
  },

  click(x: number, y: number, details?: any) {
    const formatted = `[${timestamp()}] [CLICK] Position (${x}, ${y})${details ? ' | Details: ' + JSON.stringify(details) : ''}`;
    console.log(formatted);
    appendLog(RECORDER_LOG_FILE, formatted);
  },

  action(stepNum: number, stepText: string, metadata?: any) {
    const formatted = `[${timestamp()}] [ACTION_CAPTURED] Step #${stepNum}: "${stepText}"${metadata ? ' | Meta: ' + JSON.stringify(metadata) : ''}`;
    console.log(formatted);
    appendLog(RECORDER_LOG_FILE, formatted);
  },

  error(category: string, message: string, error?: any) {
    const errStr = error instanceof Error ? `${error.message}\n${error.stack}` : (error ? JSON.stringify(error) : '');
    const formatted = `[${timestamp()}] [ERROR] [${category}] ${message} ${errStr}`.trim();
    console.error(formatted);
    appendLog(RECORDER_LOG_FILE, formatted);
    appendLog(STUDIO_LOG_FILE, formatted);
  },

  screencast(event: string, meta?: any) {
    const formatted = `[${timestamp()}] [SCREENCAST] ${event}${meta ? ' | ' + JSON.stringify(meta) : ''}`;
    appendLog(RECORDER_LOG_FILE, formatted);
  }
};
