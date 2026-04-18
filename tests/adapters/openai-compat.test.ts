// tests/adapters/openai-compat.test.ts
import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import {
  textCompletion,
  imageCompletion,
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

  test("throws on non-JSON content", async () => {
    globalThis.fetch = mock(async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: "not json" } }] }),
        { status: 200 },
      ),
    ) as any;

    await expect(
      textCompletion(fakeClient, { model: "m", systemPrompt: "s", userContent: "u" }),
    ).rejects.toThrow();
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
