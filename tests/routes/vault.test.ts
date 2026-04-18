// tests/routes/vault.test.ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { handleVaultRoutes } from "../../src/routes/vault.ts";

function makeCtx(vaultRoot: string) {
  return {
    vaultRoot,
    getConfig: () => null,
    setConfig: () => {},
  };
}

describe("/api/vault routes", () => {
  let vault: string;

  beforeEach(() => {
    vault = mkdtempSync(join(tmpdir(), "vroute-"));
    writeFileSync(join(vault, "CLAUDE.md"), "");
    mkdirSync(join(vault, "01_Projects"));
    writeFileSync(join(vault, "01_Projects", "a.md"), "hello");
  });

  afterEach(() => {
    rmSync(vault, { recursive: true, force: true });
  });

  test("GET /api/vault/tree returns root entries by default", async () => {
    const req = new Request("http://x/api/vault/tree");
    const resp = await handleVaultRoutes(req, makeCtx(vault));
    expect(resp.status).toBe(200);
    const json = await resp.json();
    expect(json.entries.some((e: any) => e.name === "01_Projects")).toBe(true);
  });

  test("GET /api/vault/tree?dir=... returns subdir entries", async () => {
    const req = new Request("http://x/api/vault/tree?dir=01_Projects");
    const resp = await handleVaultRoutes(req, makeCtx(vault));
    const json = await resp.json();
    expect(json.entries.some((e: any) => e.name === "a.md")).toBe(true);
  });

  test("GET /api/vault/read?path=... returns file contents", async () => {
    const req = new Request("http://x/api/vault/read?path=01_Projects/a.md");
    const resp = await handleVaultRoutes(req, makeCtx(vault));
    const json = await resp.json();
    expect(json.content).toBe("hello");
  });

  test("GET /api/vault/read returns 400 for non-md path", async () => {
    const req = new Request("http://x/api/vault/read?path=01_Projects");
    const resp = await handleVaultRoutes(req, makeCtx(vault));
    expect(resp.status).toBe(400);
    const json = await resp.json();
    expect(json.error).toBe("Not a markdown file");
  });

  test("GET /api/vault/tree returns 400 for path escape", async () => {
    const req = new Request("http://x/api/vault/tree?dir=../../etc");
    const resp = await handleVaultRoutes(req, makeCtx(vault));
    expect(resp.status).toBe(400);
    const json = await resp.json();
    expect(json.error).toBe("Path is outside vault");
  });

  test("GET /api/vault/read returns 400 for empty path", async () => {
    const req = new Request("http://x/api/vault/read?path=");
    const resp = await handleVaultRoutes(req, makeCtx(vault));
    expect(resp.status).toBe(400);
    const json = await resp.json();
    expect(json.error).toBe("Not a markdown file");
  });

  test("GET /api/vault/read returns 400 for path escape", async () => {
    const req = new Request("http://x/api/vault/read?path=../outside.md");
    const resp = await handleVaultRoutes(req, makeCtx(vault));
    expect(resp.status).toBe(400);
    const json = await resp.json();
    expect(json.error).toBe("Path is outside vault");
  });

  test("returns 404 for unknown /api/vault/* route", async () => {
    const req = new Request("http://localhost/api/vault/nonsense");
    const resp = await handleVaultRoutes(req, makeCtx(vault));
    expect(resp.status).toBe(404);
  });
});
