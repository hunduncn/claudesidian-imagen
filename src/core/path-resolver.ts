// src/core/path-resolver.ts
import { basename, join, relative } from "node:path";

export type ImageType = "xhs-cover" | "wechat-cover" | "wechat-illust";

export interface ResolveSavePathInput {
  vaultRoot: string;
  sourceMdPath: string;
  type: ImageType;
  version: number;
}

export interface ResolveSavePathResult {
  relativeDir: string;
  absoluteDir: string;
  filename: string;
  absolutePath: string;
}

const ATTACHMENTS_BASE = "05_Attachments/Organized";

const VERSION_PATTERNS: Record<ImageType, RegExp> = {
  "xhs-cover":     /^xhs-cover_v(\d+)\.png$/,
  "wechat-cover":  /^wechat-cover_v(\d+)\.png$/,
  "wechat-illust": /^wechat-illust_v(\d+)\.png$/,
};

/** Strip `.md` and any directory parts. */
function articleSlug(sourceMdPath: string): string {
  const base = basename(sourceMdPath);
  return base.endsWith(".md") ? base.slice(0, -3) : base;
}

export function resolveSavePath(input: ResolveSavePathInput): ResolveSavePathResult {
  const slug = articleSlug(input.sourceMdPath);
  const relativeDir = join(ATTACHMENTS_BASE, slug);
  const absoluteDir = join(input.vaultRoot, relativeDir);
  const filename = `${input.type}_v${input.version}.png`;
  const absolutePath = join(absoluteDir, filename);
  return { relativeDir, absoluteDir, filename, absolutePath };
}

/**
 * Given a list of file basenames in the target directory,
 * return the next version number for a given image type prefix.
 */
export function nextVersion(existingFiles: string[], type: ImageType): number {
  const re = VERSION_PATTERNS[type];
  let max = 0;
  for (const name of existingFiles) {
    const m = name.match(re);
    if (m) max = Math.max(max, parseInt(m[1]!, 10));
  }
  return max + 1;
}

export interface BuildWikilinkInput {
  absolutePath: string;
  vaultRoot: string;
  /** All basenames already present anywhere in the vault. */
  existingBasenames: Set<string>;
}

/**
 * Build an Obsidian embed wikilink, choosing short form when basename is
 * unique within the vault, otherwise falling back to the relative path.
 */
export function buildWikilink(input: BuildWikilinkInput): string {
  const base = basename(input.absolutePath);
  if (!input.existingBasenames.has(base)) {
    return `![[${base}]]`;
  }
  const rel = relative(input.vaultRoot, input.absolutePath);
  return `![[${rel}]]`;
}
