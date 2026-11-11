import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  OrgMetadataCache,
  OrgMetadataCacheSchema,
  SObjectDescribe,
  SALESFORCE_DEFAULT_RELEASE
} from '@kplay/core';

/**
 * Returns the default directory used for schema caching.
 * Can be overridden via KPLAY_CACHE_DIR environment variable.
 */
export function getDefaultCacheDir(): string {
  return process.env.KPLAY_CACHE_DIR || path.join(process.cwd(), '.kplay', 'cache');
}

/**
 * Normalizes an org alias into a filesystem-safe string.
 */
export function sanitizeOrgAlias(orgAlias: string): string {
  return orgAlias.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Computes the full path to an org's cached schema JSON file.
 */
export function getCacheFilePath(orgAlias: string, cacheDir?: string): string {
  const dir = cacheDir || getDefaultCacheDir();
  const safeAlias = sanitizeOrgAlias(orgAlias || 'default');
  return path.join(dir, `schema-${safeAlias}.json`);
}

/**
 * Retrieves cached org metadata for an org alias.
 * Returns null if cache does not exist or fails validation.
 */
export async function getCachedMetadata(
  orgAlias: string = 'default',
  cacheDir?: string
): Promise<OrgMetadataCache | null> {
  const filePath = getCacheFilePath(orgAlias, cacheDir);

  try {
    const rawContent = await fs.readFile(filePath, 'utf-8');
    const json = JSON.parse(rawContent);
    const parsed = OrgMetadataCacheSchema.safeParse(json);

    if (parsed.success) {
      return parsed.data;
    }

    console.warn(`[schemaCache] Invalid cache file schema at ${filePath}:`, parsed.error.issues);
    return null;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return null;
    }
    console.warn(`[schemaCache] Failed to read cache file at ${filePath}: ${err.message}`);
    return null;
  }
}

/**
 * Persists an OrgMetadataCache to local disk.
 */
export async function saveCachedMetadata(
  cache: OrgMetadataCache,
  cacheDir?: string
): Promise<void> {
  const validated = OrgMetadataCacheSchema.parse(cache);
  const targetDir = cacheDir || getDefaultCacheDir();
  const filePath = getCacheFilePath(validated.orgAlias, targetDir);

  await fs.mkdir(targetDir, { recursive: true });

  const tempFilePath = `${filePath}.${Date.now()}.tmp`;
  await fs.writeFile(tempFilePath, JSON.stringify(validated, null, 2), 'utf-8');
  await fs.rename(tempFilePath, filePath);
}

/**
 * Retrieves cached SObject metadata for instant studio autocomplete.
 */
export async function getCachedSObject(
  sObjectName: string,
  orgAlias: string = 'default',
  cacheDir?: string
): Promise<SObjectDescribe | null> {
  const cache = await getCachedMetadata(orgAlias, cacheDir);
  if (!cache || !cache.objects) {
    return null;
  }

  // Exact or case-insensitive match
  if (cache.objects[sObjectName]) {
    return cache.objects[sObjectName];
  }

  const lowerName = sObjectName.toLowerCase();
  for (const [key, sobj] of Object.entries(cache.objects)) {
    if (key.toLowerCase() === lowerName) {
      return sobj;
    }
  }

  return null;
}

/**
 * Inserts or updates an SObject describe within the org cache.
 */
export async function updateObjectInCache(
  orgAlias: string,
  sObject: SObjectDescribe,
  cacheDir?: string
): Promise<OrgMetadataCache> {
  const existing = await getCachedMetadata(orgAlias, cacheDir);

  const updatedCache: OrgMetadataCache = existing
    ? {
        ...existing,
        updatedAt: new Date().toISOString(),
        objects: {
          ...existing.objects,
          [sObject.apiName]: sObject
        }
      }
    : {
        orgAlias,
        release: SALESFORCE_DEFAULT_RELEASE,
        updatedAt: new Date().toISOString(),
        apps: {},
        objects: {
          [sObject.apiName]: sObject
        }
      };

  await saveCachedMetadata(updatedCache, cacheDir);
  return updatedCache;
}

/**
 * Clears cached schema for an org alias, or all schemas if alias is omitted.
 */
export async function clearCache(orgAlias?: string, cacheDir?: string): Promise<void> {
  const targetDir = cacheDir || getDefaultCacheDir();

  try {
    if (orgAlias) {
      const filePath = getCacheFilePath(orgAlias, targetDir);
      await fs.unlink(filePath);
    } else {
      const entries = await fs.readdir(targetDir);
      for (const entry of entries) {
        if (entry.startsWith('schema-') && entry.endsWith('.json')) {
          await fs.unlink(path.join(targetDir, entry));
        }
      }
    }
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
}

/**
 * Lists all org aliases that have cached schemas locally.
 */
export async function listCachedOrgs(cacheDir?: string): Promise<string[]> {
  const targetDir = cacheDir || getDefaultCacheDir();

  try {
    const entries = await fs.readdir(targetDir);
    const orgs: string[] = [];

    for (const entry of entries) {
      const match = entry.match(/^schema-(.+)\.json$/);
      if (match && match[1]) {
        orgs.push(match[1]);
      }
    }

    return orgs;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}
