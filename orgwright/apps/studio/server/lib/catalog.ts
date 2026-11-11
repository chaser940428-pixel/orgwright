import * as fs from 'fs';
import * as path from 'path';
import type { OrgMetadataCache, SObjectDescribe, TestStep } from '@orgwright/core';
import { resolveTestSteps } from '@orgwright/resolver';
import { introspectSObject } from '@orgwright/introspector';
import { CACHE_DIR, safeName } from './paths';

/**
 * Org metadata for the resolver: the org's object list (so "Encounter" resolves to Encounter__c)
 * plus cached field describes for the objects a test actually touches.
 */

export function describeCacheFile(alias: string, objectApi: string): string {
  return path.join(CACHE_DIR, `describe-${safeName(alias)}-${safeName(objectApi)}.json`);
}

export function objectsCacheFile(alias: string): string {
  return path.join(CACHE_DIR, `objects-${safeName(alias)}.json`);
}

export function readObjectList(alias: string): string[] {
  try {
    const data = JSON.parse(fs.readFileSync(objectsCacheFile(alias), 'utf-8'));
    return Array.isArray(data.objects) ? data.objects : [];
  } catch {
    return [];
  }
}

export function readDescribe(alias: string, objectApi: string): SObjectDescribe | undefined {
  try {
    return JSON.parse(fs.readFileSync(describeCacheFile(alias, objectApi), 'utf-8')).describe;
  } catch {
    return undefined;
  }
}

const inFlight = new Map<string, Promise<SObjectDescribe>>();

/** Describes an object with the Salesforce CLI and caches it (concurrent calls share one CLI run). */
export function fetchDescribe(alias: string, objectApi: string): Promise<SObjectDescribe> {
  const key = `${alias}::${objectApi}`;
  const running = inFlight.get(key);
  if (running) return running;
  const p = introspectSObject(objectApi, alias, { timeoutMs: 45000 })
    .then((describe) => {
      fs.writeFileSync(
        describeCacheFile(alias, objectApi),
        JSON.stringify({ alias, object: objectApi, fetchedAt: new Date().toISOString(), describe }, null, 2),
        'utf-8'
      );
      return describe;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

/** Starts background describes for objects that are not cached yet (errors are ignored). */
export function prefetchDescribes(alias: string, objects: string[]): void {
  const known = new Set(readObjectList(alias));
  for (const obj of objects) {
    if (!obj || readDescribe(alias, obj)) continue;
    // Only describe real API names from the org list (avoids CLI calls for typos)
    if (known.size > 0 && !known.has(obj)) continue;
    fetchDescribe(alias, obj).catch(() => {});
  }
}

function prettyLabel(api: string): string {
  return api.replace(/__c$/i, '').replace(/_/g, ' ');
}

export function buildCatalog(alias: string, describeObjects: string[] = []): OrgMetadataCache | undefined {
  const objects: OrgMetadataCache['objects'] = {};
  for (const api of readObjectList(alias)) {
    objects[api] = { apiName: api, label: prettyLabel(api), listUrl: `/lightning/o/${api}/list`, tabs: [], actions: [], fields: {} };
  }
  for (const api of describeObjects) {
    const describe = api ? readDescribe(alias, api) : undefined;
    if (describe) objects[describe.apiName] = describe;
  }
  if (Object.keys(objects).length === 0) return undefined;
  return {
    orgAlias: alias,
    release: "Winter '27",
    updatedAt: new Date().toISOString(),
    apps: {},
    objects
  } as OrgMetadataCache;
}

/** Objects each resolved step runs against (and objects created through the API). */
export function objectsUsedBy(steps: TestStep[]): string[] {
  const set = new Set<string>();
  for (const st of steps) {
    const ctx = st.action?.extra?.contextObject;
    if (ctx) set.add(String(ctx));
    if (st.action?.type === 'api_create' && st.action.extra?.apiObject) set.add(String(st.action.extra.apiObject));
  }
  return [...set];
}

/**
 * Resolves steps with the richest catalog available: a first pass discovers which objects the
 * steps navigate to, then a second pass includes their cached field describes. Missing describes
 * are fetched in the background so the next check is complete.
 */
export function resolveWithCatalog(
  alias: string,
  lines: string[],
  objectContext?: string
): { steps: TestStep[]; catalog?: OrgMetadataCache; objectsUsed: string[]; pendingDescribes: string[] } {
  const base = objectContext ? [objectContext] : [];
  let catalog = buildCatalog(alias, base);
  let steps = resolveTestSteps(lines, catalog, { currentObject: objectContext });
  const used = objectsUsedBy(steps);
  const all = [...new Set([...base, ...used])];
  const cached = all.filter((o) => readDescribe(alias, o));
  if (cached.some((o) => !base.includes(o))) {
    catalog = buildCatalog(alias, cached);
    steps = resolveTestSteps(lines, catalog, { currentObject: objectContext });
  }
  const pendingDescribes = all.filter((o) => !readDescribe(alias, o));
  prefetchDescribes(alias, pendingDescribes);
  return { steps, catalog, objectsUsed: all, pendingDescribes };
}
