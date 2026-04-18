// tests/core/vault-finder.test.ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { findVaultRoot } from "../../src/core/vault-finder.ts";

describe("findVaultRoot", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "vault-finder-"));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  test("returns the directory containing CLAUDE.md when started in it", () => {
    writeFileSync(join(tmpRoot, "CLAUDE.md"), "# vault");
    expect(findVaultRoot(tmpRoot)).toBe(tmpRoot);
  });

  test("walks up directories to find CLAUDE.md", () => {
    writeFileSync(join(tmpRoot, "CLAUDE.md"), "# vault");
    const sub = join(tmpRoot, "a", "b", "c");
    mkdirSync(sub, { recursive: true });
    expect(findVaultRoot(sub)).toBe(tmpRoot);
  });

  test("returns null when no CLAUDE.md within 5 levels", () => {
    const deep = join(tmpRoot, "a", "b", "c", "d", "e", "f", "g");
    mkdirSync(deep, { recursive: true });
    expect(findVaultRoot(deep)).toBeNull();
  });

  test("does not search beyond 5 levels up", () => {
    writeFileSync(join(tmpRoot, "CLAUDE.md"), "# vault");
    const sixLevelsDown = join(tmpRoot, "a", "b", "c", "d", "e", "f");
    mkdirSync(sixLevelsDown, { recursive: true });
    expect(findVaultRoot(sixLevelsDown)).toBeNull();
  });
});
