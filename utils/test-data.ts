/**
 * KPlayData — run-time test data for generated specs.
 *
 * Steps can contain tokens that are resolved fresh on every run, so re-running a test
 * never collides with duplicate rules or yesterday's records:
 *
 *   {{unique}}         short id, identical for the whole test run (use it twice to match)
 *   {{random}}         new short id each time it appears
 *   {{random.email}}   qa.<unique>.<rand>@example.com
 *   {{random.phone}}   (555) xxx-xxxx
 *   {{random.number}}  1..99999
 *   {{random.text}}    readable word pair, e.g. "Silver Falcon"
 *   {{today}}          today's date in KPLAY_DATE_FORMAT (default MM/DD/YYYY)
 *   {{today+7}}        date offset in days ({{today-3}} for the past)
 *   {{now}}            date + time (HH:mm)
 *   {{myVar}}          any value saved earlier with "Remember field "X" as myVar"
 *
 * Unknown tokens throw a clear error instead of silently typing "{{typo}}" into Salesforce.
 */

const ADJECTIVES = ['Silver', 'Bright', 'Rapid', 'Quiet', 'Golden', 'Crimson', 'Lucky', 'Brave', 'Clever', 'Swift'];
const NOUNS = ['Falcon', 'Harbor', 'Summit', 'Maple', 'Comet', 'Willow', 'Canyon', 'Otter', 'Beacon', 'Meadow'];

function shortId(len = 6): string {
  let out = '';
  while (out.length < len) {
    out += Math.random().toString(36).slice(2);
  }
  return out.slice(0, len);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatDate(date: Date, format = process.env.KPLAY_DATE_FORMAT || 'MM/DD/YYYY'): string {
  return format
    .replace(/YYYY/g, String(date.getFullYear()))
    .replace(/MM/g, pad(date.getMonth() + 1))
    .replace(/DD/g, pad(date.getDate()))
    .replace(/HH/g, pad(date.getHours()))
    .replace(/mm/g, pad(date.getMinutes()));
}

export class KPlayData {
  private static runId = shortId();
  private static vars = new Map<string, string>();

  /** Start a fresh data scope (called from the generated beforeEach). */
  static reset(): void {
    this.runId = shortId();
    this.vars.clear();
  }

  /** Loads one data-driven row: every column becomes a {{Column}} token. */
  static load(row: Record<string, unknown>): void {
    for (const [k, v] of Object.entries(row || {})) {
      if (k.trim()) this.vars.set(k.trim(), String(v ?? ''));
    }
    console.log(`[KPlayData] Data row: ${JSON.stringify(row)}`);
  }

  /** The run-scoped {{unique}} value. */
  static get unique(): string {
    return this.runId;
  }

  /** Save a value for later steps, e.g. KPlayData.set('caseId', '500...'). */
  static set(name: string, value: string | undefined | null): void {
    const clean = name.replace(/^\{\{\s*|\s*\}\}$/g, '').trim();
    if (value === undefined || value === null || String(value).trim() === '') {
      throw new Error(`KPlay could not capture a value for {{${clean}}} — the field or record Id was empty or not found on the page.`);
    }
    this.vars.set(clean, String(value).trim());
    console.log(`[KPlayData] {{${clean}}} = ${String(value).trim()}`);
  }

  static get(name: string): string | undefined {
    return this.vars.get(name.trim());
  }

  /** Resolve a single token name (without braces). */
  static token(name: string): string {
    const key = name.trim();
    const lower = key.toLowerCase();

    if (this.vars.has(key)) return this.vars.get(key)!;
    if (lower === 'unique') return this.runId;
    if (lower === 'random') return shortId();
    if (lower === 'random.email') return `qa.${this.runId}.${shortId(4)}@example.com`;
    if (lower === 'random.phone') {
      const mid = 200 + Math.floor(Math.random() * 800);
      const end = Math.floor(Math.random() * 10000);
      return `(555) ${mid}-${String(end).padStart(4, '0')}`;
    }
    if (lower === 'random.number') return String(1 + Math.floor(Math.random() * 99999));
    if (lower === 'random.text') {
      const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
      const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
      return `${a} ${n}`;
    }
    if (lower === 'now') {
      const fmt = (process.env.KPLAY_DATE_FORMAT || 'MM/DD/YYYY') + ' HH:mm';
      return formatDate(new Date(), fmt);
    }
    const dateMatch = lower.match(/^today(?:([+-])(\d+))?$/);
    if (dateMatch) {
      const d = new Date();
      if (dateMatch[1]) {
        const days = parseInt(dateMatch[2], 10) * (dateMatch[1] === '-' ? -1 : 1);
        d.setDate(d.getDate() + days);
      }
      return formatDate(d);
    }

    const known = [...this.vars.keys()].map((k) => `{{${k}}}`).join(', ') || 'none yet';
    throw new Error(`Unknown test data token {{${key}}}. Remembered values so far: ${known}.`);
  }

  /** Replace every {{token}} inside a string. */
  static resolve(text: string): string {
    return String(text).replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_m, name: string) => this.token(name));
  }
}
