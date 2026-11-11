import * as fs from 'fs';
import * as path from 'path';
import { BLOCKS_DIR, safeName } from './paths';

/**
 * Reusable step blocks, e.g. "Login and open recent Encounter", stored as
 * tests/blocks/<name>.json and used in a test with:  Use block "Login and open recent Encounter"
 */

export interface StepBlock {
  name: string;
  description?: string;
  steps: string[];
  updatedAt: string;
}

export const USE_BLOCK_RE = /^\s*(?:(?:step\s+)?\d+[.:)\-]\s*)?(?:use|run|include|insert)\s+(?:the\s+)?block\s+["“']([^"”']+)["”']\s*$/i;

function blockFile(name: string): string {
  return path.join(BLOCKS_DIR, `${safeName(name.trim().toLowerCase())}.json`);
}

function stripNumber(line: string): string {
  return line.replace(/^\s*(?:step\s+)?\d+[.:)\-]\s*/i, '').trim();
}

export function listBlocks(): StepBlock[] {
  try {
    return fs
      .readdirSync(BLOCKS_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(BLOCKS_DIR, f), 'utf-8')) as StepBlock;
        } catch {
          return null;
        }
      })
      .filter((b): b is StepBlock => Boolean(b && b.name && Array.isArray(b.steps)))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export function getBlock(name: string): StepBlock | undefined {
  const file = blockFile(name);
  if (fs.existsSync(file)) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch {}
  }
  return listBlocks().find((b) => b.name.toLowerCase() === name.trim().toLowerCase());
}

export function saveBlock(name: string, steps: string[], description = ''): StepBlock {
  const clean = steps.map(stripNumber).filter((s) => s.length > 0 && !USE_BLOCK_RE.test(s));
  if (!name.trim()) throw new Error('Block name is required');
  if (clean.length === 0) throw new Error('A block needs at least one step');
  const block: StepBlock = { name: name.trim(), description, steps: clean, updatedAt: new Date().toISOString() };
  fs.writeFileSync(blockFile(name), JSON.stringify(block, null, 2), 'utf-8');
  return block;
}

export function deleteBlock(name: string): boolean {
  const file = blockFile(name);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    return true;
  }
  return false;
}

/**
 * Replaces every "Use block" line with the block's steps and renumbers all steps 1..n,
 * so generated code, telemetry and results line up with what actually runs.
 */
export function expandBlocks(lines: string[]): { lines: string[]; errors: string[]; expanded: boolean } {
  const errors: string[] = [];
  let expanded = false;
  const out: string[] = [];
  const visit = (list: string[], depth: number) => {
    for (const line of list) {
      const m = line.match(USE_BLOCK_RE);
      if (m) {
        const block = getBlock(m[1]);
        if (!block) {
          errors.push(`Block “${m[1]}” does not exist`);
          out.push(stripNumber(line));
        } else if (depth >= 3) {
          errors.push(`Block “${m[1]}” is nested too deeply`);
        } else {
          expanded = true;
          visit(block.steps, depth + 1);
        }
      } else if (stripNumber(line)) {
        // Lines that are only a step number ("5. ") are placeholders for the next step
        out.push(stripNumber(line));
      }
    }
  };
  visit(lines, 0);
  return { lines: out.map((l, i) => `${i + 1}. ${l}`), errors, expanded };
}
