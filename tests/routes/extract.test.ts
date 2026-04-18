// tests/routes/extract.test.ts
import { test, expect, mock, beforeEach, afterEach } from "bun:test";
import { handleExtractRoute } from "../../src/routes/extract.ts";
import type { ServerContext } from "../../src/server.ts";

function makeCtx(overrideConfig?: unknown): ServerContext {
  return {
    vaultRoot: "/tmp",
    getConfig: () =>
      (overrideConfig !== undefined
        ? overrideConfig
        : {
            api: {
              baseUrl: "https://api.x/v1",
              apiKey: "k",
              textModel: "t",
              imageModel: "i",
            },
            preferredPort: 5173,
          }) as any,
    setConfig: () => {},
  } as ServerContext;
}

// ─── fetch isolation ─────────────────────────────────────────────────────────

let originalFetch: typeof globalThis.fetch;
beforeEach(() => { originalFetch = globalThis.fetch; });
afterEach(() => { globalThis.fetch = originalFetch; });

// ─── method guard ────────────────────────────────────────────────────────────

test("405 for non-POST", async () => {
  const req = new Request("http://x/api/extract", { method: "GET" });
  const resp = await handleExtractRoute(req, makeCtx());
  expect(resp.status).toBe(405);
});

// ─── config incomplete ────────────────────────────────────────────────────────

test("400 when config is null", async () => {
  const req = new Request("http://x/api/extract", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: "hello", type: "xhs-cover" }),
  });
  const resp = await handleExtractRoute(req, makeCtx(null));
  expect(resp.status).toBe(400);
  const json = await resp.json();
  expect(json.error).toBe("config incomplete");
});

// ─── invalid JSON body ────────────────────────────────────────────────────────

test("400 on invalid JSON body", async () => {
  const req = new Request("http://x/api/extract", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "not json",
  });
  const resp = await handleExtractRoute(req, makeCtx());
  expect(resp.status).toBe(400);
  const json = await resp.json();
  expect(json.error).toBe("Invalid JSON body");
});

// ─── missing content or type ──────────────────────────────────────────────────

test("400 on missing content or type", async () => {
  const req = new Request("http://x/api/extract", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  const resp = await handleExtractRoute(req, makeCtx());
  expect(resp.status).toBe(400);
  const json = await resp.json();
  expect(json.error).toBe("missing content or type");
});

// ─── happy path ───────────────────────────────────────────────────────────────

test("200 with extracted fields on success", async () => {
  const fields = { title: "t", visual: "v", style: "s" };
  globalThis.fetch = mock(async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(fields) } }],
      }),
      { status: 200 },
    ),
  ) as any;

  const req = new Request("http://x/api/extract", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: "some article text", type: "xhs-cover" }),
  });

  const resp = await handleExtractRoute(req, makeCtx());
  expect(resp.status).toBe(200);
  const json = await resp.json();
  expect(json.fields.title).toBe("t");
});

// ─── 502 on upstream failure (sanitized) ─────────────────────────────────────

test("502 with sanitized error on upstream 500", async () => {
  // openai-compat retries once on 5xx; a persistent 500 throws after retry
  globalThis.fetch = mock(async () =>
    new Response("Internal Server Error", { status: 500 }),
  ) as any;

  const req = new Request("http://x/api/extract", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: "some article text", type: "xhs-cover" }),
  });

  const resp = await handleExtractRoute(req, makeCtx());
  expect(resp.status).toBe(502);
  const json = await resp.json();
  // Sanitizer categorizes upstream 5xx as a Chinese "上游平台错误 (500)" message.
  expect(json.error).toMatch(/上游平台错误.*500/);
});
