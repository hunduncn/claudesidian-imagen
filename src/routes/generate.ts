// src/routes/generate.ts
import type { ServerContext } from "../server.ts";
import { isConfigComplete } from "../config.ts";
import { imageCompletion } from "../adapters/openai-compat.ts";
import { parseImageFromContent, type ParsedImage } from "../adapters/image-parser.ts";
import { buildImagePrompt, type ImageType, type ExtractedFields } from "../core/prompt-templates.ts";
import { sanitizeErrorMessage } from "./_errors.ts";

interface GenerateBody {
  type: ImageType;
  fields: ExtractedFields;
  count: number;
}

type GenerateResult = ParsedImage | { kind: "error"; message: string };

export async function handleGenerateRoute(req: Request, ctx: ServerContext): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const cfg = ctx.getConfig();
  if (!isConfigComplete(cfg)) {
    return Response.json({ error: "config incomplete" }, { status: 400 });
  }

  let body: GenerateBody;
  try {
    body = (await req.json()) as GenerateBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.type || !body.fields) {
    return Response.json({ error: "missing type or fields" }, { status: 400 });
  }

  const count = Math.min(Math.max(body.count ?? 4, 1), 4);
  const prompt = buildImagePrompt(body.type, body.fields);
  const client = { baseUrl: cfg!.api.baseUrl, apiKey: cfg!.api.apiKey };
  const model = cfg!.api.imageModel;

  const results: GenerateResult[] = await Promise.all(
    Array.from({ length: count }, async (): Promise<GenerateResult> => {
      try {
        const content = await imageCompletion(client, { model, prompt });
        const parsed = parseImageFromContent(content);
        if (parsed.kind === "none") {
          return { kind: "error", message: "No image in response" };
        }
        return parsed;
      } catch (e) {
        return { kind: "error", message: sanitizeErrorMessage(e, "generate") };
      }
    }),
  );

  return Response.json({ results });
}
