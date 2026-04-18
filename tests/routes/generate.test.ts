// tests/routes/generate.test.ts
import { test, expect, mock, beforeEach, afterEach } from "bun:test";
import { handleGenerateRoute } from "../../src/routes/generate.ts";
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
  const req = new Request("http://x/api/generate", { method: "GET" });
  const resp = await handleGenerateRoute(req, makeCtx());
  expect(resp.status).toBe(405);
});

// ─── config incomplete ────────────────────────────────────────────────────────

test("400 when config is null", async () => {
  const req = new Request("http://x/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "xhs-cover", fields: { visual: "v", style: "s" }, count: 1 }),
  });
  const resp = await handleGenerateRoute(req, makeCtx(null));
  expect(resp.status).toBe(400);
  const json = await resp.json();
  expect(json.error).toBe("config incomplete");
});

test("400 when config has empty imageModel", async () => {
  const req = new Request("http://x/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "xhs-cover", fields: { visual: "v", style: "s" }, count: 1 }),
  });
  const incompleteConfig = {
    api: { baseUrl: "https://api.x/v1", apiKey: "k", textModel: "t", imageModel: "" },
    preferredPort: 5173,
  };
  const resp = await handleGenerateRoute(req, makeCtx(incompleteConfig));
  expect(resp.status).toBe(400);
  const json = await resp.json();
  expect(json.error).toBe("config incomplete");
});

// ─── invalid JSON body ────────────────────────────────────────────────────────

test("400 on invalid JSON body", async () => {
  const req = new Request("http://x/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "not json",
  });
  const resp = await handleGenerateRoute(req, makeCtx());
  expect(resp.status).toBe(400);
  const json = await resp.json();
  expect(json.error).toBe("Invalid JSON body");
});

// ─── missing type or fields ───────────────────────────────────────────────────

test("400 on missing type", async () => {
  const req = new Request("http://x/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ count: 2 }),
  });
  const resp = await handleGenerateRoute(req, makeCtx());
  expect(resp.status).toBe(400);
  const json = await resp.json();
  expect(json.error).toBe("missing type");
});

test("400 when type present but neither legacy fields nor simple-body shape given", async () => {
  const req = new Request("http://x/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "xhs-cover", count: 1 }),
  });
  const resp = await handleGenerateRoute(req, makeCtx());
  expect(resp.status).toBe(400);
  const json = await resp.json();
  expect(json.error).toMatch(/styleKey|fields/);
});

// ─── successful 4-variant generation ─────────────────────────────────────────

test("returns 4 image results when all calls succeed", async () => {
  let n = 0;
  globalThis.fetch = mock(async () => {
    n++;
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: `![](https://x/${n}.png)` } }],
      }),
      { status: 200 },
    );
  }) as any;

  const req = new Request("http://x/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "xhs-cover",
      fields: { title: "t", visual: "v", style: "s" },
      count: 4,
    }),
  });

  const resp = await handleGenerateRoute(req, makeCtx());
  expect(resp.status).toBe(200);
  const json = await resp.json();
  expect(json.results).toHaveLength(4);
  expect(json.results.every((r: any) => r.kind === "url")).toBe(true);
  const urls = new Set(json.results.map((r: any) => r.url));
  expect(urls.size).toBe(4);
});

// ─── count clamping ───────────────────────────────────────────────────────────

test("clamps count > 4 to 4", async () => {
  globalThis.fetch = mock(async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: "![](https://x/img.png)" } }],
      }),
      { status: 200 },
    ),
  ) as any;

  const req = new Request("http://x/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "wechat-illust",
      fields: { visual: "v", style: "s" },
      count: 10,
    }),
  });

  const resp = await handleGenerateRoute(req, makeCtx());
  expect(resp.status).toBe(200);
  const json = await resp.json();
  expect(json.results).toHaveLength(4);
});

test("clamps count=0 up to 1", async () => {
  globalThis.fetch = mock(async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: "![](https://x/img.png)" } }],
      }),
      { status: 200 },
    ),
  ) as any;

  const req = new Request("http://x/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "wechat-illust",
      fields: { visual: "v", style: "s" },
      count: 0,
    }),
  });

  const resp = await handleGenerateRoute(req, makeCtx());
  expect(resp.status).toBe(200);
  const json = await resp.json();
  // count 0 is clamped to min 1 by Math.max(0, 1) → 1
  // Spec says Math.min(Math.max(body.count ?? 4, 1), 4): count=0 → max(0,1)=1 → min(1,4)=1
  expect(json.results).toHaveLength(1);
});

test("defaults count to 4 when count is missing", async () => {
  globalThis.fetch = mock(async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: "![](https://x/img.png)" } }],
      }),
      { status: 200 },
    ),
  ) as any;

  const req = new Request("http://x/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "wechat-illust",
      fields: { visual: "v", style: "s" },
      // count omitted → defaults to 4
    }),
  });

  const resp = await handleGenerateRoute(req, makeCtx());
  expect(resp.status).toBe(200);
  const json = await resp.json();
  expect(json.results).toHaveLength(4);
});

// ─── mixed success / error ────────────────────────────────────────────────────

test("mixed: always returns 4 results even when fetch returns 500", async () => {
  // openai-compat retries a 5xx once, so a persistent 500 will throw
  // after the retry. The handler should catch and return error entries.
  globalThis.fetch = mock(async () =>
    new Response("Internal Server Error", { status: 500 }),
  ) as any;

  const req = new Request("http://x/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "xhs-cover",
      fields: { title: "t", visual: "v", style: "s" },
      count: 4,
    }),
  });

  const resp = await handleGenerateRoute(req, makeCtx());
  expect(resp.status).toBe(200);
  const json = await resp.json();
  expect(json.results).toHaveLength(4);
  // All should be error entries since the API persistently returns 500
  expect(json.results.every((r: any) => r.kind === "error")).toBe(true);
});

// ─── sanitized error message ──────────────────────────────────────────────────

test("error messages are sanitized (ENOENT → 'File or directory not found')", async () => {
  // openai-compat retries once on network error — both throws → error result
  globalThis.fetch = mock(async () => {
    throw new Error("ENOENT: no such file or directory, '/etc/passwd'");
  }) as any;

  const req = new Request("http://x/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "wechat-cover",
      fields: { title: "t", visual: "v", style: "s" },
      count: 1,
    }),
  });

  const resp = await handleGenerateRoute(req, makeCtx());
  expect(resp.status).toBe(200);
  const json = await resp.json();
  expect(json.results).toHaveLength(1);
  expect(json.results[0].kind).toBe("error");
  expect(json.results[0].message).toBe("File or directory not found");
});

// ─── no image in LLM response ─────────────────────────────────────────────────

test("all results have kind:'error' when LLM returns no image", async () => {
  globalThis.fetch = mock(async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: "sorry, I cannot generate images" } }],
      }),
      { status: 200 },
    ),
  ) as any;

  const req = new Request("http://x/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "xhs-cover",
      fields: { title: "t", visual: "v", style: "s" },
      count: 2,
    }),
  });

  const resp = await handleGenerateRoute(req, makeCtx());
  expect(resp.status).toBe(200);
  const json = await resp.json();
  expect(json.results).toHaveLength(2);
  expect(json.results.every((r: any) => r.kind === "error")).toBe(true);
  expect(json.results.every((r: any) => r.message === "No image in response")).toBe(true);
});
