// tests/core/config.test.ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, saveConfig, isConfigComplete, type Config } from "../../src/config.ts";

describe("config", () => {
  let tmpHome: string;

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), "config-"));
  });

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true });
  });

  test("loadConfig returns null when file does not exist", () => {
    expect(loadConfig(tmpHome)).toBeNull();
  });

  test("loadConfig returns parsed object when file exists", () => {
    const dir = join(tmpHome, ".claudesidian-imagen");
    require("node:fs").mkdirSync(dir);
    writeFileSync(
      join(dir, "config.json"),
      JSON.stringify({
        api: { baseUrl: "https://x/v1", apiKey: "k", textModel: "t", imageModel: "i" },
        preferredPort: 5173,
      }),
    );
    const cfg = loadConfig(tmpHome);
    expect(cfg?.api.apiKey).toBe("k");
  });

  test("saveConfig writes JSON and creates parent dir", () => {
    const cfg: Config = {
      api: { baseUrl: "https://x/v1", apiKey: "k", textModel: "t", imageModel: "i" },
      preferredPort: 5173,
    };
    saveConfig(cfg, tmpHome);
    const reloaded = loadConfig(tmpHome);
    expect(reloaded).toEqual(cfg);
  });

  test("isConfigComplete returns false when fields missing", () => {
    expect(isConfigComplete(null)).toBe(false);
    expect(
      isConfigComplete({
        api: { baseUrl: "", apiKey: "k", textModel: "t", imageModel: "i" },
        preferredPort: 5173,
      }),
    ).toBe(false);
  });

  test("isConfigComplete returns true when all api fields present", () => {
    expect(
      isConfigComplete({
        api: { baseUrl: "https://x/v1", apiKey: "k", textModel: "t", imageModel: "i" },
        preferredPort: 5173,
      }),
    ).toBe(true);
  });
});
