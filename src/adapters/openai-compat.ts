// src/adapters/openai-compat.ts
export interface OpenAIClient {
  baseUrl: string;
  apiKey: string;
}

export interface TextCompletionRequest {
  model: string;
  systemPrompt: string;
  userContent: string;
}

export interface ImageCompletionRequest {
  model: string;
  prompt: string;
}

interface ChatResponse {
  choices: Array<{ message: { content: string } }>;
}

const REQUEST_TIMEOUT_MS = 60_000;

export const retryConfig = { delay429Ms: 5_000 };

async function postChat(
  client: OpenAIClient,
  body: Record<string, unknown>,
): Promise<ChatResponse> {
  const url = `${client.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const doFetch = () =>
    fetch(url, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${client.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

  let resp: Response;
  try {
    resp = await doFetch();
    if (resp.status >= 500) {
      // retry once on server error
      resp = await doFetch();
    } else if (resp.status === 429) {
      // retry once on rate limit after backoff
      await new Promise((r) => setTimeout(r, retryConfig.delay429Ms));
      resp = await doFetch();
    }
  } catch {
    // retry once on network error (DNS/reset/timeout)
    resp = await doFetch();
  }
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`OpenAI-compat error ${resp.status}: ${txt}`);
  }
  return (await resp.json()) as ChatResponse;
}

/**
 * Call a chat completion expecting a JSON object in the response content.
 * Throws if the content does not parse as JSON.
 */
export async function textCompletion<T = unknown>(
  client: OpenAIClient,
  req: TextCompletionRequest,
): Promise<T> {
  const json = await postChat(client, {
    model: req.model,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: req.systemPrompt },
      { role: "user", content: req.userContent },
    ],
  });
  const content = json.choices[0]?.message?.content ?? "";
  try {
    return JSON.parse(content) as T;
  } catch {
    // LLM may have returned prose despite response_format. Retry once.
    const retryBody = {
      model: req.model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: req.systemPrompt },
        { role: "user", content: req.userContent },
      ],
    };
    const retryJson = await postChat(client, retryBody);
    const retryContent = retryJson.choices[0]?.message?.content ?? "";
    try {
      return JSON.parse(retryContent) as T;
    } catch (e) {
      throw new Error(`textCompletion: response was not valid JSON: ${(e as Error).message}`);
    }
  }
}

/**
 * Call a chat completion expecting an image (URL / base64 / markdown) in
 * the response content. Returns the raw content string for the parser.
 */
export async function imageCompletion(
  client: OpenAIClient,
  req: ImageCompletionRequest,
): Promise<string> {
  const json = await postChat(client, {
    model: req.model,
    messages: [{ role: "user", content: req.prompt }],
  });
  return json.choices[0]?.message?.content ?? "";
}
