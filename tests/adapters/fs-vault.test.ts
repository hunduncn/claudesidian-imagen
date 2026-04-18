// tests/adapters/fs-vault.test.ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  listDir,
  readMarkdown,
  writeImage,
  listFilesIn,
  collectAllBasenames,
} from "../../src/adapters/fs-vault.ts";

describe("fs-vault", () => {
  let vault: string;

  beforeEach(() => {
    vault = mkdtempSync(join(tmpdir(), "vault-"));
    writeFileSync(join(vault, "CLAUDE.md"), "# vault");
    mkdirSync(join(vault, "01_Projects"));
    mkdirSync(join(vault, "01_Projects", "cats"));
    writeFileSync(join(vault, "01_Projects", "cats", "article.md"), "hello cat");
    writeFileSync(join(vault, "01_Projects", "cats", "notes.txt"), "ignored");
    mkdirSync(join(vault, "05_Attachments"));
  });

  afterEach(() => {
    rmSync(vault, { recursive: true, force: true });
  });

  test("listDir returns directories and .md files only, dirs first", () => {
    const entries = listDir(vault, "01_Projects");
    const names = entries.map((e) => e.name);
    expect(names).toContain("cats");
    expect(entries.find((e) => e.name === "cats")?.isDir).toBe(true);
  });

  test("listDir at vault root excludes hidden and system dirs", () => {
    mkdirSync(join(vault, ".obsidian"));
    mkdirSync(join(vault, ".git"));
    writeFileSync(join(vault, ".DS_Store"), "");
    const names = listDir(vault, ".").map((e) => e.name);
    expect(names).not.toContain(".obsidian");
    expect(names).not.toContain(".git");
    expect(names).not.toContain(".DS_Store");
    expect(names).toContain("01_Projects");
  });

  test("listDir refuses paths outside the vault", () => {
    expect(() => listDir(vault, "../escape")).toThrow(/outside vault/i);
  });

  test("readMarkdown returns file contents", () => {
    expect(readMarkdown(vault, "01_Projects/cats/article.md")).toBe("hello cat");
  });

  test("readMarkdown refuses non-md and outside-vault paths", () => {
    expect(() => readMarkdown(vault, "01_Projects/cats/notes.txt")).toThrow(/\.md/);
    expect(() => readMarkdown(vault, "../etc/passwd")).toThrow();
  });

  test("writeImage creates parent dirs and writes bytes", () => {
    const target = join(vault, "05_Attachments/Organized/article/xhs-cover_v1.png");
    writeImage(target, new Uint8Array([1, 2, 3]));
    expect(existsSync(target)).toBe(true);
  });

  test("listFilesIn returns basenames in a directory or [] when missing", () => {
    expect(listFilesIn(join(vault, "missing"))).toEqual([]);
    writeFileSync(join(vault, "05_Attachments", "a.png"), "");
    writeFileSync(join(vault, "05_Attachments", "b.png"), "");
    const names = listFilesIn(join(vault, "05_Attachments"));
    expect(names.sort()).toEqual(["a.png", "b.png"]);
  });

  test("collectAllBasenames recurses, returns Set of all file basenames", () => {
    writeFileSync(join(vault, "05_Attachments", "shared.png"), "");
    mkdirSync(join(vault, "05_Attachments", "Organized", "x"), { recursive: true });
    writeFileSync(join(vault, "05_Attachments", "Organized", "x", "shared.png"), "");
    const set = collectAllBasenames(vault);
    expect(set.has("shared.png")).toBe(true);
    expect(set.has("article.md")).toBe(true);
    expect(set.has("CLAUDE.md")).toBe(true);
  });
});
