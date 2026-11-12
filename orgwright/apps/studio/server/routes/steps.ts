import type { Express } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { analyzeSteps, STEP_PATTERNS, DATA_TOKENS, similarity } from '@orgwright/resolver';
import { describeCacheFile, fetchDescribe, readDescribe, resolveWithCatalog } from '../lib/catalog';
import { USE_BLOCK_RE, getBlock, listBlocks, saveBlock, deleteBlock } from '../lib/blocks';
import { CACHE_DIR, RESULTS_DIR, safeName } from '../lib/paths';
import { executeSfCommand } from '@orgwright/introspector';
import { assertAlias } from '../lib/validators';

/** Runs a SOQL query with the Salesforce CLI and caches the records for a day. */
async function cachedQuery(alias: string, key: string, soql: string, refresh: boolean): Promise<{ records: any[]; fromCache: boolean }> {
  // The alias reaches the Salesforce CLI (through cmd.exe on Windows); only allow safe characters.
  assertAlias(alias);
  const file = path.join(CACHE_DIR, `${key}-${safeName(alias)}.json`);
  if (!refresh && fs.existsSync(file)) {
    const age = Date.now() - fs.statSync(file).mtimeMs;
    if (age < 24 * 60 * 60 * 1000) {
      return { records: JSON.parse(fs.readFileSync(file, 'utf-8')).records || [], fromCache: true };
    }
  }
  // On Windows the CLI is spawned through cmd.exe, which splits unquoted arguments on spaces
  const q = process.platform === 'win32' ? `"${soql}"` : soql;
  const result = await executeSfCommand(['data', 'query', '-q', q, '-o', alias, '--json'], { timeoutMs: 45000 });
  const records = (result?.records || []).map((r: any) => {
    const { attributes, ...rest } = r;
    return rest;
  });
  fs.writeFileSync(file, JSON.stringify({ alias, fetchedAt: new Date().toISOString(), records }, null, 2), 'utf-8');
  return { records, fromCache: false };
}

/**
 * Step authoring routes: field metadata for autocomplete, live step check, cheat sheet,
 * reusable blocks and per-step screenshots.
 */
export function registerStepRoutes(app: Express): void {
  // Field list (labels, types, picklist values) for one object — cached per org/object
  app.get('/api/org/describe', async (req, res) => {
    const alias = (req.query.alias as string) || 'sandboxOrg';
    const objectApi = (req.query.object as string) || '';
    const refresh = req.query.refresh === 'true';
    if (!objectApi) {
      return res.status(400).json({ success: false, error: 'object is required' });
    }
    try {
      let describe = refresh ? undefined : readDescribe(alias, objectApi);
      const fromCache = Boolean(describe);
      if (!describe) describe = await fetchDescribe(alias, objectApi);
      const fields = Object.values(describe.fields || {})
        .map((f) => ({
          apiName: f.apiName,
          label: f.label,
          type: f.type,
          picklistValues: f.picklistValues || [],
          required: f.required,
          readOnly: f.readOnly
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
      res.json({ success: true, alias, object: describe.apiName, label: describe.label, fields, fromCache, cacheFile: path.basename(describeCacheFile(alias, objectApi)) });
    } catch (err: any) {
      res.json({ success: false, alias, object: objectApi, fields: [], error: err?.message || 'Describe failed' });
    }
  });

  // Lightning apps visible in the App Launcher (for "Search app" autocomplete)
  app.get('/api/org/apps', async (req, res) => {
    const alias = (req.query.alias as string) || 'sandboxOrg';
    try {
      const { records, fromCache } = await cachedQuery(alias, 'apps', "SELECT Label, Name FROM AppMenuItem WHERE Type = 'TabSet' ORDER BY Label", req.query.refresh === 'true');
      res.json({ success: true, apps: records.map((r) => ({ label: r.Label, name: r.Name })), fromCache });
    } catch (err: any) {
      res.json({ success: false, apps: [], error: err?.message || 'Could not list apps' });
    }
  });

  // Navigation tabs in the org (for "Select "X" tab" autocomplete)
  app.get('/api/org/tabs', async (req, res) => {
    const alias = (req.query.alias as string) || 'sandboxOrg';
    try {
      const { records, fromCache } = await cachedQuery(alias, 'tabs', 'SELECT Label, Name, SobjectName FROM TabDefinition ORDER BY Label', req.query.refresh === 'true');
      res.json({ success: true, tabs: records.map((r) => ({ label: r.Label, name: r.Name, sobject: r.SobjectName })), fromCache });
    } catch (err: any) {
      res.json({ success: false, tabs: [], error: err?.message || 'Could not list tabs' });
    }
  });

  // List views of an object (for "Select list view" autocomplete)
  app.get('/api/org/listviews', async (req, res) => {
    const alias = (req.query.alias as string) || 'sandboxOrg';
    const objectApi = String(req.query.object || '');
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(objectApi)) {
      return res.status(400).json({ success: false, listViews: [], error: 'object must be an API name' });
    }
    try {
      const { records, fromCache } = await cachedQuery(
        alias,
        `listviews-${objectApi}`,
        `SELECT Name, DeveloperName FROM ListView WHERE SobjectType = '${objectApi}' ORDER BY Name`,
        req.query.refresh === 'true'
      );
      res.json({ success: true, listViews: records.map((r) => ({ label: r.Name, name: r.DeveloperName })), fromCache });
    } catch (err: any) {
      res.json({ success: false, listViews: [], error: err?.message || 'Could not list list views' });
    }
  });

  // Live step check: plain-English summary + issues for every line in the editor
  app.post('/api/steps/check', (req, res) => {
    try {
      const { stepsText, objectContext, targetOrg, dataColumns } = req.body as {
        stepsText?: string;
        objectContext?: string;
        targetOrg?: string;
        dataColumns?: string[];
      };
      const alias = targetOrg || 'sandboxOrg';

      // Expand "Use block" lines inline but remember which editor line each step came from
      const entries: Array<{ text: string; editorLine: number; block?: string }> = [];
      const blockLines: Array<{ editorLine: number; name: string; rawText: string; found: boolean; size: number }> = [];
      String(stepsText || '')
        .split('\n')
        .forEach((line, i) => {
          // Skip blank lines and bare step numbers ("5. ") left for the next step
          if (!line.trim() || /^\s*(?:step\s+)?\d+[.:)\-]?\s*$/i.test(line)) return;
          const m = line.match(USE_BLOCK_RE);
          if (m) {
            const block = getBlock(m[1]);
            blockLines.push({ editorLine: i + 1, name: m[1], rawText: line.trim(), found: Boolean(block), size: block?.steps.length || 0 });
            block?.steps.forEach((s) => entries.push({ text: s, editorLine: i + 1, block: block.name }));
          } else {
            entries.push({ text: line.trim(), editorLine: i + 1 });
          }
        });

      if (entries.length === 0 && blockLines.length === 0) {
        return res.json({ success: true, insights: [], catalogLoaded: false });
      }

      const { steps, catalog, objectsUsed, pendingDescribes } = resolveWithCatalog(alias, entries.map((e) => e.text), objectContext);
      const raw = analyzeSteps(steps, {
        catalog,
        objectApi: objectContext,
        lineNumbers: entries.map((e) => e.editorLine),
        dataColumns: Array.isArray(dataColumns) ? dataColumns : []
      });

      // Collapse block steps into one insight on the "Use block" line
      const insights: any[] = [];
      raw.forEach((ins, i) => {
        if (!entries[i].block) insights.push(ins);
      });
      const allBlocks = listBlocks().map((b) => b.name);
      for (const bl of blockLines) {
        const inner = raw.filter((_, i) => entries[i].editorLine === bl.editorLine);
        const issues = bl.found
          ? inner.flatMap((ins, k) => ins.issues.map((iss) => ({ ...iss, message: `Block step ${k + 1} (${ins.rawText}): ${iss.message}`, suggestions: [] })))
          : [
              {
                severity: 'error',
                message: `There is no block named “${bl.name}”.`,
                suggestions: allBlocks
                  .map((n) => ({ n, s: similarity(n, bl.name) }))
                  .sort((a, b) => b.s - a.s)
                  .slice(0, 3)
                  .filter((x) => x.s > 0.3)
                  .map((x) => bl.rawText.replace(bl.name, x.n))
              }
            ];
        const status = issues.some((x) => x.severity === 'error') ? 'error' : issues.some((x) => x.severity === 'warning') ? 'warning' : 'ok';
        insights.push({
          index: bl.editorLine,
          lineNumber: bl.editorLine,
          rawText: bl.rawText,
          actionType: 'use_block',
          actionLabel: 'Block',
          summary: bl.found ? `Run block “${bl.name}” (${bl.size} step${bl.size === 1 ? '' : 's'})` : `Unknown block “${bl.name}”`,
          confidence: bl.found ? 1 : 0,
          status,
          issues
        });
      }
      insights.sort((a, b) => a.lineNumber - b.lineNumber);

      res.json({
        success: true,
        insights,
        catalogLoaded: Boolean(catalog && objectsUsed.some((o) => readDescribe(alias, o))),
        objectsUsed,
        pendingDescribes
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Step check failed' });
    }
  });

  // Supported phrasings + data tokens (cheat sheet and autocomplete source)
  app.get('/api/steps/patterns', (_req, res) => {
    res.json({ success: true, patterns: STEP_PATTERNS, tokens: DATA_TOKENS });
  });

  // Reusable step blocks
  app.get('/api/blocks', (_req, res) => {
    res.json({ success: true, blocks: listBlocks() });
  });
  app.post('/api/blocks', (req, res) => {
    try {
      const { name, steps, description } = req.body || {};
      const list = Array.isArray(steps) ? steps : String(steps || '').split('\n');
      const block = saveBlock(String(name || ''), list, description || '');
      res.json({ success: true, block });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });
  app.delete('/api/blocks/:name', (req, res) => {
    res.json({ success: deleteBlock(req.params.name) });
  });

  // Screenshot captured when a given step finished (written by utils/stream-helper.ts)
  app.get('/api/test-results/step-screenshot', (req, res) => {
    const testId = safeName((req.query.testId as string) || '');
    const step = parseInt((req.query.step as string) || '', 10);
    if (!testId || !Number.isFinite(step)) {
      return res.status(400).json({ error: 'testId and step are required' });
    }
    const file = path.resolve(RESULTS_DIR, `${testId}-steps`, `step-${step}.jpg`);
    if (!fs.existsSync(file)) {
      return res.status(404).json({ error: 'No screenshot for this step' });
    }
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(file);
  });
}
