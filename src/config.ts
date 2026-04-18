// src/config.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Brand anchor: a reference image pinned to a style family. When set, the
 * server sends this image alongside the text prompt on every generation
 * under that family, so the model stays visually close to it. One anchor
 * per family. Stored as a data URL (data:image/png;base64,...) so it travels
 * with the config file without needing a separate asset directory.
 */
export interface BrandAnchor {
  familyKey: string;
  /** data:image/<mime>;base64,<...> */
  imageDataUrl: string;
  /** ISO timestamp of when it was set, purely for UI display. */
  savedAt: string;
}

export interface Config {
  api: {
    baseUrl: string;
    apiKey: string;
    textModel: string;
    imageModel: string;
  };
  /** Preferred port to try first; server falls back to next available if taken. */
  preferredPort: number;
  /** Per-family reference image anchors. Optional; absent for fresh installs. */
  brandAnchors?: BrandAnchor[];
}

const CONFIG_DIR = ".claudesidian-imagen";
const CONFIG_FILE = "config.json";

function configPath(home: string): string {
  return join(home, CONFIG_DIR, CONFIG_FILE);
}

export function loadConfig(home: string = homedir()): Config | null {
  const p = configPath(home);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as Config;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[config] Failed to parse ${p}: ${msg}`);
    return null;
  }
}

export function saveConfig(cfg: Config, home: string = homedir()): void {
  const p = configPath(home);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(cfg, null, 2), "utf-8");
}

export function isConfigComplete(cfg: Config | null): boolean {
  if (!cfg) return false;
  const a = cfg.api;
  return Boolean(a?.baseUrl && a?.apiKey && a?.textModel && a?.imageModel);
}
