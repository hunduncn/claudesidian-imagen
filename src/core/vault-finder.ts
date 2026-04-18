// src/core/vault-finder.ts
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const MAX_LEVELS = 5;
const MARKER = "CLAUDE.md";

/**
 * Walk up from `startDir` (inclusive) at most MAX_LEVELS levels,
 * looking for a directory containing CLAUDE.md.
 * Returns the absolute path of the found directory, or null.
 */
export function findVaultRoot(startDir: string): string | null {
  let current = resolve(startDir);
  for (let i = 0; i <= MAX_LEVELS; i++) {
    if (existsSync(join(current, MARKER))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) return null; // reached filesystem root
    current = parent;
  }
  return null;
}
