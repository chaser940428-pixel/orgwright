import path from 'path';
import { execFileSync, execSync, spawn, type ChildProcess, type ExecFileSyncOptions, type SpawnOptions } from 'child_process';

/**
 * Shared input validation and safe Salesforce CLI invocation for the Studio server.
 * Anything that comes from an HTTP request must pass through these checks before it
 * reaches a child process or a file path.
 */

const ALIAS_RE = /^[A-Za-z0-9_.@-]{1,80}$/;
const LOG_ID_RE = /^[a-zA-Z0-9]{15,18}$/;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function isValidAlias(value: unknown): value is string {
  return typeof value === 'string' && ALIAS_RE.test(value);
}

export function assertAlias(value: unknown, field = 'alias'): string {
  if (!isValidAlias(value)) {
    throw new ValidationError(`Invalid ${field}: must match ${ALIAS_RE}`);
  }
  return value;
}

export function assertLogId(value: unknown): string {
  if (typeof value !== 'string' || !LOG_ID_RE.test(value)) {
    throw new ValidationError('Invalid Salesforce log ID');
  }
  return value;
}

/** SObject API name, e.g. Account or My_Object__c. */
export function assertSObjectName(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(value)) {
    throw new ValidationError('Invalid SObject API name');
  }
  return value;
}

/** Instance URL must parse and use https. Returns the normalized origin-style URL. */
export function assertInstanceUrl(value: unknown): string {
  if (typeof value !== 'string') throw new ValidationError('Invalid instance URL');
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new ValidationError('Invalid instance URL');
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
    throw new ValidationError('Instance URL must be an https URL');
  }
  // Only the origin is meaningful for sf; dropping path/query removes any odd characters.
  return parsed.origin;
}

/** Resolve `<baseDir>/<fileName>` and guarantee the result stays inside baseDir. */
export function safeJoin(baseDir: string, fileName: string): string {
  const base = path.resolve(baseDir);
  const resolved = path.resolve(base, fileName);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new ValidationError('Resolved path escapes the base directory');
  }
  return resolved;
}

const isWindows = process.platform === 'win32';

/**
 * On Windows the Salesforce CLI is `sf.cmd`. Node (>= 18.20.2 / 20.12.2, CVE-2024-27980)
 * refuses to spawn .cmd/.bat files without a shell, so there it has to go through cmd.exe.
 * To keep that safe every argument is double-quoted, and any argument containing a character
 * that cmd.exe still interprets inside double quotes (", %, !, CR/LF, NUL) is rejected.
 * Inside double quotes cmd treats & | < > ^ ( ) as literals. On other platforms the CLI is
 * executed directly with an argument array and no shell.
 */
function quoteForCmd(arg: string): string {
  if (/["%!\r\n\0]/.test(arg)) {
    throw new ValidationError(`Argument contains characters that are not allowed: ${JSON.stringify(arg)}`);
  }
  // A trailing backslash would escape the closing quote for the target program's argv parser.
  const escaped = arg.replace(/(\\+)$/, '$1$1');
  return `"${escaped}"`;
}

/** Windows only: the full cmd.exe command line, every argument quoted and checked. */
function windowsSfCommandLine(args: string[]): string {
  return ['sf.cmd', ...args.map(quoteForCmd)].join(' ');
}

/** Synchronously run `sf <args>`. Never interpolates unchecked input into a shell command. */
export function runSfSync(args: string[], options: ExecFileSyncOptions = {}): string {
  const { shell: _ignored, ...rest } = options;
  const opts = { encoding: 'utf-8' as const, windowsHide: true, ...rest };
  if (!isWindows) {
    return execFileSync('sf', args, { ...opts, shell: false }) as unknown as string;
  }
  return execSync(windowsSfCommandLine(args), opts) as unknown as string;
}

/** Spawn `sf <args>` (async, streaming) with the same rules. */
export function spawnSf(args: string[], options: SpawnOptions = {}): ChildProcess {
  if (!isWindows) return spawn('sf', args, { windowsHide: true, ...options, shell: false });
  return spawn(windowsSfCommandLine(args), { windowsHide: true, ...options, shell: true });
}
