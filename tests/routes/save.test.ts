// tests/routes/save.test.ts
import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { handleSaveRoute } from "../../src/routes/save.ts";
import type { ServerContext } from "../../src/server.ts";

function makeTmpVault(): string {
  const vault = mkdtempSync(join(tmpdir(), "save-test-vault-"));
  // CLAUDE.md marker so vault-detection works consistently
  writeFileSync(join(vault, "CLAUDE.md"), "# test vault\n");
  return vault;
}

function makeCtx(vaultRoot: string): ServerContext {
  return {
    vaultRoot,
    getConfig: () => null as any,
    setConfig: () => {},
  } as ServerContext;
}

// PNG magic bytes (89 50 4E 47 …)
const PNG_MAGIC = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// ─── fetch isolation ──────────────────────────────────────────────────────────

let originalFetch: typeof globalThis.fetch;
beforeEach(() => { originalFetch = globalThis.fetch; });
afterEach(() => { globalThis.fetch = originalFetch; });

// ─── Test 1: base64 image saves correctly ─────────────────────────────────────

test("base64 image → saves v1 with correct path and wikilink", async () => {
  const vault = makeTmpVault();
  const ctx = makeCtx(vault);

  // 1x1 transparent PNG as base64
  const base64 = Buffer.from(PNG_MAGIC).toString("base64");

  const req = new Request("http://x/api/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sourcePath: "article.md",
      type: "xhs-cover",
      image: { kind: "base64", mimeType: "image/png", base64 },
    }),
  });

  const resp = await handleSaveRoute(req, ctx);
  expect(resp.status).toBe(200);

  const json = await resp.json();
  expect(json.savedPath).toBe("05_Attachments/Organized/article/xhs-cover_v1.png");
  expect(json.wikilink).toBe("![[xhs-cover_v1.png]]");
});

// ─── Test 2: auto-increment to v2 when v1 exists ─────────────────────────────

test("auto-increments to v2 when v1 already exists", async () => {
  const vault = makeTmpVault();
  const ctx = makeCtx(vault);

  // Pre-create v1
  const dir = join(vault, "05_Attachments/Organized/article");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "xhs-cover_v1.png"), PNG_MAGIC);

  const base64 = Buffer.from(PNG_MAGIC).toString("base64");

  const req = new Request("http://x/api/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sourcePath: "article.md",
      type: "xhs-cover",
      image: { kind: "base64", mimeType: "image/png", base64 },
    }),
  });

  const resp = await handleSaveRoute(req, ctx);
  expect(resp.status).toBe(200);

  const json = await resp.json();
  expect(json.savedPath).toBe("05_Attachments/Organized/article/xhs-cover_v2.png");
  expect(json.wikilink).toBe("![[xhs-cover_v2.png]]");
});

// ─── Test 3: URL image → fetch bytes and write PNG magic ─────────────────────

test("URL image → fetches bytes and writes correct PNG content", async () => {
  const vault = makeTmpVault();
  const ctx = makeCtx(vault);

  globalThis.fetch = mock(async (_url: string) => {
    return new Response(PNG_MAGIC, { status: 200 });
  }) as any;

  const req = new Request("http://x/api/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sourcePath: "article.md",
      type: "xhs-cover",
      image: { kind: "url", url: "https://example.com/image.png" },
    }),
  });

  const resp = await handleSaveRoute(req, ctx);
  expect(resp.status).toBe(200);

  const json = await resp.json();
  expect(json.savedPath).toBe("05_Attachments/Organized/article/xhs-cover_v1.png");

  // Verify the written file has PNG magic bytes
  const written = new Uint8Array(
    require("node:fs").readFileSync(join(vault, json.savedPath))
  );
  expect(written.slice(0, 4)).toEqual(PNG_MAGIC.slice(0, 4));
});

// ─── Test 4: 405 for non-POST ─────────────────────────────────────────────────

test("405 for non-POST", async () => {
  const vault = makeTmpVault();
  const req = new Request("http://x/api/save", { method: "GET" });
  const resp = await handleSaveRoute(req, makeCtx(vault));
  expect(resp.status).toBe(405);
});

// ─── Test 5: 400 on invalid JSON body ────────────────────────────────────────

test("400 on invalid JSON body", async () => {
  const vault = makeTmpVault();
  const req = new Request("http://x/api/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "not json",
  });
  const resp = await handleSaveRoute(req, makeCtx(vault));
  expect(resp.status).toBe(400);
  const json = await resp.json();
  expect(json.error).toBe("Invalid JSON body");
});

// ─── Test 6: 400 on missing fields ───────────────────────────────────────────

test("400 on missing fields", async () => {
  const vault = makeTmpVault();
  const req = new Request("http://x/api/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  const resp = await handleSaveRoute(req, makeCtx(vault));
  expect(resp.status).toBe(400);
  const json = await resp.json();
  expect(json.error).toBe("missing fields");
});

// ─── Test 7: 502 on download failure ─────────────────────────────────────────

test("502 on download failure", async () => {
  const vault = makeTmpVault();

  globalThis.fetch = mock(async () => {
    return new Response("nope", { status: 500 });
  }) as any;

  const req = new Request("http://x/api/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sourcePath: "article.md",
      type: "xhs-cover",
      image: { kind: "url", url: "https://example.com/image.png" },
    }),
  });

  const resp = await handleSaveRoute(req, makeCtx(vault));
  expect(resp.status).toBe(502);
  const json = await resp.json();
  // sanitizeErrorMessage returns "Internal error" for unknown errors
  expect(typeof json.error).toBe("string");
  expect(json.error.length).toBeGreaterThan(0);
});
