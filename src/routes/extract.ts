// src/routes/extract.ts
import type { ServerContext } from "../server.ts";
import { isConfigComplete } from "../config.ts";
import { textCompletion } from "../adapters/openai-compat.ts";
import { buildExtractSystemPrompt, type ImageType } from "../core/prompt-templates.ts";
import { sanitizeErrorMessage } from "./_errors.ts";

interface ExtractBody {
  content: string;
  type: ImageType;
}

export async function handleExtractRoute(req: Request, ctx: ServerContext): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const cfg = ctx.getConfig();
  if (!isConfigComplete(cfg)) {
    return Response.json({ error: "config incomplete" }, { status: 400 });
  }

  let body: ExtractBody;
  try {
    body = (await req.json()) as ExtractBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.content || !body.type) {
    return Response.json({ error: "missing content or type" }, { status: 400 });
  }

  const systemPrompt = buildExtractSystemPrompt(body.type);

  try {
    const fields = await textCompletion(
      { baseUrl: cfg!.api.baseUrl, apiKey: cfg!.api.apiKey },
      {
        model: cfg!.api.textModel,
        systemPrompt,
        userContent: body.content.slice(0, 8000),
      },
    );
    return Response.json({ fields });
  } catch (e) {
    return Response.json({ error: sanitizeErrorMessage(e, "extract") }, { status: 502 });
  }
}
