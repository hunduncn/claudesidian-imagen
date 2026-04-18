// src/routes/generate.ts
import type { ServerContext } from "../server.ts";
import { isConfigComplete } from "../config.ts";
import { imageCompletion } from "../adapters/openai-compat.ts";
import { parseImageFromContent, type ParsedImage } from "../adapters/image-parser.ts";
import {
  buildImagePrompt,
  buildSimpleImagePrompt,
  deriveArticleTitle,
  deriveArticleExcerpt,
  getStylePreset,
  STYLE_PRESETS,
  type ImageType,
  type ExtractedFields,
} from "../core/prompt-templates.ts";
import { readMarkdown, ensureInsideVault } from "../adapters/fs-vault.ts";
import { basename } from "node:path";
import { sanitizeErrorMessage } from "./_errors.ts";

interface LegacyBody {
  type: ImageType;
  fields: ExtractedFields;
  count?: number;
}

interface SimpleBody {
  type: ImageType;
  styleKey: string;
  sourcePath: string;
  extraPrompt?: string;
  count?: number;
}

type GenerateResult = ParsedImage | { kind: "error"; message: string };

function isSimpleBody(b: unknown): b is SimpleBody {
  return typeof b === "object" && b !== null &&
    typeof (b as SimpleBody).styleKey === "string" &&
    typeof (b as SimpleBody).sourcePath === "string";
}

function isLegacyBody(b: unknown): b is LegacyBody {
  return typeof b === "object" && b !== null &&
    typeof (b as LegacyBody).fields === "object" && (b as LegacyBody).fields !== null;
}

export async function handleGenerateRoute(req: Request, ctx: ServerContext): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const cfg = ctx.getConfig();
  if (!isConfigComplete(cfg)) {
    return Response.json({ error: "config incomplete" }, { status: 400 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const body = rawBody as { type?: ImageType; count?: number };

  if (!body || !body.type) {
    return Response.json({ error: "missing type" }, { status: 400 });
  }

  // Build prompt depending on body shape
  let prompt: string;
  if (isSimpleBody(rawBody)) {
    const preset = getStylePreset(rawBody.styleKey);
    if (!preset) {
      return Response.json({
        error: `unknown styleKey: ${rawBody.styleKey}`,
        availableStyles: STYLE_PRESETS.map((s) => s.key),
      }, { status: 400 });
    }
    let markdown: string;
    try {
      ensureInsideVault(ctx.vaultRoot, rawBody.sourcePath);
      markdown = readMarkdown(ctx.vaultRoot, rawBody.sourcePath);
    } catch (e) {
      return Response.json({ error: sanitizeErrorMessage(e, "generate") }, { status: 400 });
    }
    const filenameNoExt = basename(rawBody.sourcePath).replace(/\.md$/i, "");
    const articleTitle = deriveArticleTitle(markdown, filenameNoExt);
    const articleExcerpt = deriveArticleExcerpt(markdown, 600);
    prompt = buildSimpleImagePrompt({
      type: rawBody.type,
      articleTitle,
      articleExcerpt,
      stylePreset: preset,
      extraPrompt: rawBody.extraPrompt,
    });
  } else if (isLegacyBody(rawBody)) {
    prompt = buildImagePrompt(rawBody.type, rawBody.fields);
  } else {
    return Response.json(
      { error: "body must provide either {styleKey, sourcePath} or {fields}" },
      { status: 400 },
    );
  }

  const count = Math.min(Math.max(body.count ?? 4, 1), 4);
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
