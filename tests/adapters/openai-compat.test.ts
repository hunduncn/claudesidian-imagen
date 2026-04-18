// tests/adapters/openai-compat.test.ts
import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
// NOTE: These tests monkey-patch globalThis.fetch and rely on Bun running
// describe blocks sequentially. If parallel test execution is ever enabled,
// switch to mock.module or dependency-inject fetch.
import {
  textCompletion,
  imageCompletion,
  retryConfig,
  type OpenAIClient,
} from "../../src/adapters/openai-compat.ts";

const fakeClient: OpenAIClient = {
  baseUrl: "https://api.example.com/v1",
  apiKey: "sk-test",
};

describe("textCompletion", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("sends POST with bearer auth and json body", async () => {
    let captured: { url?: string; init?: RequestInit } = {};
    globalThis.fetch = mock(async (url: any, init: any) => {
      captured = { url, init };
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"title":"hi","visual":"v","style":"s"}' } }],
        }),
        { status: 200 },
      );
    }) as any;

    const result = await textCompletion(fakeClient, {
      model: "gpt-4o-mini",
      systemPrompt: "you are helpful",
      userContent: "extract from: hello",
    });

    expect(captured.url).toBe("https://api.example.com/v1/chat/completions");
    const headers = new Headers(captured.init!.headers);
    expect(headers.get("authorization")).toBe("Bearer sk-test");
    expect(headers.get("content-type")).toBe("application/json");

    const body = JSON.parse(captured.init!.body as string);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages).toEqual([
      { role: "system", content: "you are helpful" },
      { role: "user", content: "extract from: hello" },
    ]);

    expect(result).toEqual({ title: "hi", visual: "v", style: "s" });
  });

  test("retries once on 5xx then succeeds", async () => {
    let calls = 0;
    globalThis.fetch = mock(async () => {
      calls++;
      if (calls === 1) return new Response("err", { status: 500 });
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "{}" } }] }),
        { status: 200 },
      );
    }) as any;

    const result = await textCompletion(fakeClient, {
      model: "m",
      systemPrompt: "s",
      userContent: "u",
    });

    expect(calls).toBe(2);
    expect(result).toEqual({});
  });

  test("throws on non-JSON content (both attempts fail)", async () => {
    globalThis.fetch = mock(async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: "not json" } }] }),
        { status: 200 },
      ),
    ) as any;

    await expect(
      textCompletion(fakeClient, { model: "m", systemPrompt: "s", userContent: "u" }),
    ).rejects.toThrow(/not valid JSON/);
  });
});

describe("imageCompletion", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("returns the raw content string from message.content", async () => {
    globalThis.fetch = mock(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "![](https://x/img.png)" } }],
        }),
        { status: 200 },
      ),
    ) as any;

    const result = await imageCompletion(fakeClient, {
      model: "gemini-3.1-flash-image-preview",
      prompt: "a cat",
    });

    expect(result).toBe("![](https://x/img.png)");
  });
});

describe("429 retry behaviour", () => {
  let originalFetch: typeof globalThis.fetch;
  const originalDelay = retryConfig.delay429Ms;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    retryConfig.delay429Ms = 50;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    retryConfig.delay429Ms = originalDelay;
  });

  test("imageCompletion retries on 429 after delay and succeeds", async () => {
    let n = 0;
    const start = Date.now();
    globalThis.fetch = mock(async () => {
      n++;
      if (n === 1) return new Response("rate limit", { status: 429 });
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
        { status: 200 },
      );
    }) as any;

    const result = await imageCompletion(
      { baseUrl: "https://api.x/v1", apiKey: "k" },
      { model: "m", prompt: "p" },
    );
    expect(result).toBe("ok");
    expect(n).toBe(2);
    expect(Date.now() - start).toBeGreaterThanOrEqual(45);
  });

  test("imageCompletion throws after 429 retry also returns 429", async () => {
    globalThis.fetch = mock(
      async () => new Response("rate limit", { status: 429 }),
    ) as any;

    await expect(
      imageCompletion({ baseUrl: "https://api.x/v1", apiKey: "k" }, { model: "m", prompt: "p" }),
    ).rejects.toThrow(/OpenAI-compat error 429/);
  });
});

describe("textCompletion JSON parse retry", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("retries once on JSON parse failure and returns parsed result", async () => {
    let n = 0;
    globalThis.fetch = mock(async () => {
      n++;
      const content = n === 1 ? "sorry I can't do that" : JSON.stringify({ title: "t" });
      return new Response(
        JSON.stringify({ choices: [{ message: { content } }] }),
        { status: 200 },
      );
    }) as any;

    const result = await textCompletion<{ title: string }>(
      { baseUrl: "https://api.x/v1", apiKey: "k" },
      { model: "m", systemPrompt: "s", userContent: "u" },
    );
    expect(result.title).toBe("t");
    expect(n).toBe(2);
  });

  test("throws descriptive error if both JSON parses fail", async () => {
    globalThis.fetch = mock(async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: "still prose" } }] }),
        { status: 200 },
      ),
    ) as any;

    await expect(
      textCompletion(
        { baseUrl: "https://api.x/v1", apiKey: "k" },
        { model: "m", systemPrompt: "s", userContent: "u" },
      ),
    ).rejects.toThrow(/not valid JSON/);
  });
});
