// src/routes/generate.ts
import type { ServerContext } from "../server.ts";
import { isConfigComplete } from "../config.ts";
import { imageCompletion } from "../adapters/openai-compat.ts";
import { parseImageFromContent, type ParsedImage } from "../adapters/image-parser.ts";
import {
  buildImagePrompt,
  buildSimpleImagePrompt,
  deriveArticleTitle,
  getStylePresetForType,
  STYLE_FAMILIES,
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
  /**
   * Override the title that gets rendered into the image. When absent, the
   * server falls back to first H1 of the markdown, then the filename. UI
   * shows the detected title pre-filled so the user can edit away sensitive
   * vocabulary (e.g. "崩了") that triggers Gemini's safety classifier.
   */
  titleOverride?: string;
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
    // styleKey is a family key; resolve to the per-type descriptor. If the
    // family doesn't support this type, 400 with the list of available keys.
    const preset = getStylePresetForType(rawBody.styleKey, rawBody.type);
    if (!preset) {
      return Response.json({
        error: `unknown or unsupported styleKey for type: ${rawBody.styleKey}`,
        availableStyles: STYLE_FAMILIES
          .filter((f) => f.supports.includes(rawBody.type))
          .map((f) => f.key),
      }, { status: 400 });
    }
    // Read the file only to derive a human-friendly title (first H1 > filename).
    // We deliberately do NOT pass article body as "thematic grounding" anymore
    // — see note in buildSimpleImagePrompt. If the user wants more thematic
    // direction, they use the extraPrompt box, which gives them agency over
    // what's safe to include.
    let markdown: string;
    try {
      ensureInsideVault(ctx.vaultRoot, rawBody.sourcePath);
      markdown = readMarkdown(ctx.vaultRoot, rawBody.sourcePath);
    } catch (e) {
      return Response.json({ error: sanitizeErrorMessage(e, "generate") }, { status: 400 });
    }
    const filenameNoExt = basename(rawBody.sourcePath).replace(/\.md$/i, "");
    // User's explicit override wins over auto-detected H1 — lets them rewrite
    // titles with safety-trigger words (e.g. 崩了, 暴跌, 诈骗) before generation.
    const articleTitle =
      (rawBody.titleOverride && rawBody.titleOverride.trim()) ||
      deriveArticleTitle(markdown, filenameNoExt);
    prompt = buildSimpleImagePrompt({
      type: rawBody.type,
      articleTitle,
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

  // Debug: log the exact prompt we're about to send. Useful when the upstream
  // safety filter refuses — lets us see whether a recent change introduced a
  // trigger word. Kept permanently because the log is local-only (single-user
  // CLI) and the signal/volume is low.
  console.log("─── [generate] prompt ───");
  console.log(prompt);
  console.log("─── end prompt (%d chars) ───", prompt.length);

  // Resolve brand anchor for the picked family (simple-body only — legacy
  // fields-body has no family concept). The anchor is a reference image the
  // user pinned to this family; passing it to every generation under that
  // family keeps successive images visually similar.
  let referenceImageDataUrl: string | undefined;
  if (isSimpleBody(rawBody)) {
    const anchor = (cfg!.brandAnchors ?? []).find((a) => a.familyKey === rawBody.styleKey);
    referenceImageDataUrl = anchor?.imageDataUrl;
  }

  const results: GenerateResult[] = await Promise.all(
    Array.from({ length: count }, async (): Promise<GenerateResult> => {
      try {
        const content = await imageCompletion(client, { model, prompt, referenceImageDataUrl });
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
