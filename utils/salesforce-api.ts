import { execSync } from 'child_process';

/**
 * SalesforceApi — test data setup/teardown for generated specs.
 *
 * "Create Account record with Name "Acme {{unique}}" as acct" creates the record through the
 * REST API before the UI steps, so tests never depend on whatever "recent" record exists in
 * the sandbox. Every record created in a test is deleted again in afterEach (newest first).
 *
 * Auth reuses the Salesforce CLI session: `sf org display --target-org <alias>`.
 *   SF_ORG_ALIAS       org alias (default: sandboxOrg)
 *   SF_API_VERSION     REST version (default: 61.0)
 *   ORGWRIGHT_KEEP_DATA=1  keep created records (skip cleanup) for debugging
 */

interface OrgSession {
  accessToken: string;
  instanceUrl: string;
}

export class SalesforceApi {
  private static session: OrgSession | null = null;
  private static created: Array<{ sobject: string; id: string }> = [];

  private static alias(): string {
    return process.env.SF_ORG_ALIAS || 'sandboxOrg';
  }

  private static version(): string {
    return process.env.SF_API_VERSION || '61.0';
  }

  private static getSession(force = false): OrgSession {
    if (this.session && !force) return this.session;
    let raw: string;
    try {
      raw = execSync(`sf org display --target-org "${this.alias()}" --json`, {
        encoding: 'utf-8',
        timeout: 60000,
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (err: any) {
      const out = String(err?.stdout || err?.message || '');
      throw new Error(`Could not read the Salesforce CLI session for org "${this.alias()}". Log in with "sf org login web -a ${this.alias()}". Details: ${out.slice(0, 300)}`);
    }
    const parsed = JSON.parse(raw);
    const result = parsed.result || {};
    if (!result.accessToken || !result.instanceUrl) {
      throw new Error(`The Salesforce CLI session for "${this.alias()}" has no access token. Re-authenticate the org.`);
    }
    this.session = { accessToken: result.accessToken, instanceUrl: result.instanceUrl };
    return this.session;
  }

  private static async request(method: string, path: string, body?: unknown, retry = true): Promise<any> {
    const s = this.getSession();
    const res = await fetch(`${s.instanceUrl}/services/data/v${this.version()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${s.accessToken}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (res.status === 401 && retry) {
      this.getSession(true);
      return this.request(method, path, body, false);
    }
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const errors = Array.isArray(data) ? data : [data];
      const msg = errors
        .map((e: any) => `${e?.message || 'Unknown error'}${e?.fields?.length ? ` (fields: ${e.fields.join(', ')})` : ''}`)
        .join('; ');
      throw new Error(msg);
    }
    return data;
  }

  /** Creates a record and returns its Id. Field keys are API names. */
  static async createRecord(sobject: string, fields: Record<string, unknown>): Promise<string> {
    try {
      const data = await this.request('POST', `/sobjects/${encodeURIComponent(sobject)}`, fields);
      this.created.push({ sobject, id: data.id });
      console.log(`[SalesforceApi] Created ${sobject} ${data.id}`);
      return data.id;
    } catch (err: any) {
      throw new Error(`Could not create ${sobject} through the API: ${err.message}`);
    }
  }

  /** Runs a SOQL query and returns the records. */
  static async query<T = any>(soql: string): Promise<T[]> {
    const data = await this.request('GET', `/query?q=${encodeURIComponent(soql)}`);
    return data.records || [];
  }

  /** Deletes everything created in this test, newest first. Never throws. */
  static async cleanup(): Promise<void> {
    const toDelete = this.created.reverse();
    this.created = [];
    if (process.env.ORGWRIGHT_KEEP_DATA === '1') {
      if (toDelete.length) console.log(`[SalesforceApi] ORGWRIGHT_KEEP_DATA=1 — keeping ${toDelete.length} record(s)`);
      return;
    }
    for (const rec of toDelete) {
      try {
        await this.request('DELETE', `/sobjects/${encodeURIComponent(rec.sobject)}/${rec.id}`);
        console.log(`[SalesforceApi] Deleted ${rec.sobject} ${rec.id}`);
      } catch (err: any) {
        // Already deleted by the test (e.g. "Delete record" step) or blocked by a rule — report, don't fail
        console.warn(`[SalesforceApi] Could not delete ${rec.sobject} ${rec.id}: ${err.message}`);
      }
    }
  }
}
