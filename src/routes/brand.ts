// src/routes/brand.ts
//
// Brand anchor management: one reference image per style family. When set,
// the server passes that image alongside the text prompt on every generation
// under the family, keeping successive renders visually consistent.
//
// Routes:
//   GET    /api/brand/anchors                    → { anchors: [{familyKey, savedAt}] }
//   POST   /api/brand/anchor                     → body: {familyKey, imageDataUrl} → {ok:true}
//   DELETE /api/brand/anchor?familyKey=...       → {ok:true}
//
// Note: we intentionally do NOT return imageDataUrl on the GET — the data URL
// can be a multi-MB payload, and the UI only needs to know WHICH families
// have an anchor (to render the 已锚定 badge). If we later need to preview
// the anchor in the UI we can add a separate GET /api/brand/anchor?familyKey.

import type { ServerContext } from "../server.ts";
import { getStyleFamily } from "../core/prompt-templates.ts";
import type { BrandAnchor, Config } from "../config.ts";

function parseFamilyKey(url: URL): string | null {
  return url.searchParams.get("familyKey");
}

/** Enforce a reasonable size ceiling so a huge paste can't balloon config.json. */
const MAX_ANCHOR_BYTES = 5 * 1024 * 1024; // 5 MB of data-URL text

export async function handleBrandRoutes(req: Request, ctx: ServerContext): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  const cfg = ctx.getConfig();
  if (!cfg) {
    return Response.json({ error: "config incomplete" }, { status: 400 });
  }

  // ─── GET /api/brand/anchors (list, without image bytes) ───────────────
  if (path === "/api/brand/anchors" && req.method === "GET") {
    const anchors = (cfg.brandAnchors ?? []).map((a) => ({
      familyKey: a.familyKey,
      savedAt: a.savedAt,
    }));
    return Response.json({ anchors });
  }

  // ─── POST /api/brand/anchor (create/replace) ──────────────────────────
  if (path === "/api/brand/anchor" && req.method === "POST") {
    let body: { familyKey?: unknown; imageDataUrl?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (typeof body.familyKey !== "string" || typeof body.imageDataUrl !== "string") {
      return Response.json({ error: "missing familyKey or imageDataUrl" }, { status: 400 });
    }
    if (!getStyleFamily(body.familyKey)) {
      return Response.json({ error: `unknown familyKey: ${body.familyKey}` }, { status: 400 });
    }
    if (!/^data:image\/[a-z0-9+.-]+;base64,/i.test(body.imageDataUrl)) {
      return Response.json({ error: "imageDataUrl must be a data:image/* base64 URL" }, { status: 400 });
    }
    if (body.imageDataUrl.length > MAX_ANCHOR_BYTES) {
      return Response.json({ error: "imageDataUrl too large (>5MB)" }, { status: 413 });
    }

    const newAnchor: BrandAnchor = {
      familyKey: body.familyKey,
      imageDataUrl: body.imageDataUrl,
      savedAt: new Date().toISOString(),
    };
    // Replace any existing anchor for this family (one anchor per family).
    const existing = cfg.brandAnchors ?? [];
    const filtered = existing.filter((a) => a.familyKey !== newAnchor.familyKey);
    const next: Config = {
      ...cfg,
      brandAnchors: [...filtered, newAnchor],
    };
    ctx.setConfig(next);
    return Response.json({ ok: true, savedAt: newAnchor.savedAt });
  }

  // ─── DELETE /api/brand/anchor?familyKey=... (remove) ──────────────────
  if (path === "/api/brand/anchor" && req.method === "DELETE") {
    const familyKey = parseFamilyKey(url);
    if (!familyKey) {
      return Response.json({ error: "missing familyKey query param" }, { status: 400 });
    }
    const existing = cfg.brandAnchors ?? [];
    const next: Config = {
      ...cfg,
      brandAnchors: existing.filter((a) => a.familyKey !== familyKey),
    };
    ctx.setConfig(next);
    return Response.json({ ok: true });
  }

  return new Response("Not Found", { status: 404 });
}
