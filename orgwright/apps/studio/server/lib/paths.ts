import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Root of the Playwright project (the folder with playwright.config.ts).
 * Derived from this file's location (server/lib -> Playwright); override with ORGWRIGHT_ROOT.
 */
export const ROOT_DIR = path.resolve(process.env.ORGWRIGHT_ROOT || path.resolve(here, '../../../../..'));
export const GENERATED_DIR = path.resolve(ROOT_DIR, 'tests', 'generated');
export const DEFINITIONS_DIR = path.resolve(ROOT_DIR, 'tests', 'definitions');
export const BLOCKS_DIR = path.resolve(ROOT_DIR, 'tests', 'blocks');
export const RESULTS_DIR = path.resolve(ROOT_DIR, 'test-results');
export const ORGWRIGHT_DIR = path.resolve(ROOT_DIR, '.orgwright');
export const CACHE_DIR = path.resolve(ORGWRIGHT_DIR, 'cache');
export const HISTORY_DIR = path.resolve(ORGWRIGHT_DIR, 'history');

for (const dir of [GENERATED_DIR, DEFINITIONS_DIR, BLOCKS_DIR, CACHE_DIR, HISTORY_DIR]) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {}
}

/** Makes a value safe to use inside a file name. */
export function safeName(value: string): string {
  return String(value || '').replace(/[^A-Za-z0-9_.-]/g, '_');
}

/** Test case ids are used as file names: only letters, digits, _ and -. */
export function isValidTestId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,80}$/.test(String(id || ''));
}
