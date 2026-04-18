// src/adapters/fs-vault.ts
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  type Stats,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

export interface DirEntry {
  name: string;
  isDir: boolean;
  /** Path relative to vault root. */
  relPath: string;
}

const ALWAYS_EXCLUDE = new Set([".obsidian", ".git", "node_modules", ".DS_Store"]);

function ensureInsideVault(vaultRoot: string, target: string): string {
  const abs = resolve(vaultRoot, target);
  const rel = relative(vaultRoot, abs);
  if (rel.startsWith("..")) {
    throw new Error(`Path is outside vault: ${target}`);
  }
  return abs;
}

export function listDir(vaultRoot: string, relPath: string): DirEntry[] {
  const abs = ensureInsideVault(vaultRoot, relPath);
  if (!existsSync(abs)) return [];
  const items = readdirSync(abs);
  const entries: DirEntry[] = [];
  for (const name of items) {
    if (ALWAYS_EXCLUDE.has(name)) continue;
    // hide all dotfiles (starts with ".")
    if (name.startsWith(".")) continue;
    const childAbs = join(abs, name);
    let isDir = false;
    try {
      isDir = statSync(childAbs).isDirectory();
    } catch {
      continue;
    }
    if (!isDir && !name.endsWith(".md")) continue;
    entries.push({
      name,
      isDir,
      relPath: relative(vaultRoot, childAbs),
    });
  }
  // dirs first, then alphabetical within each group
  return entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function readMarkdown(vaultRoot: string, relPath: string): string {
  if (!relPath.endsWith(".md")) throw new Error(`Not a .md file: ${relPath}`);
  const abs = ensureInsideVault(vaultRoot, relPath);
  return readFileSync(abs, "utf-8");
}

export function writeImage(absolutePath: string, bytes: Uint8Array): void {
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, bytes);
}

export function listFilesIn(absoluteDir: string): string[] {
  if (!existsSync(absoluteDir)) return [];
  return readdirSync(absoluteDir).filter((n) => {
    try {
      return statSync(join(absoluteDir, n)).isFile();
    } catch {
      return false;
    }
  });
}

export function collectAllBasenames(vaultRoot: string): Set<string> {
  const out = new Set<string>();
  const walk = (dir: string) => {
    let items: string[];
    try {
      items = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of items) {
      if (ALWAYS_EXCLUDE.has(name)) continue;
      const child = join(dir, name);
      let s: Stats;
      try {
        s = statSync(child);
      } catch {
        continue;
      }
      if (s.isDirectory()) walk(child);
      else out.add(name);
    }
  };
  walk(vaultRoot);
  return out;
}
