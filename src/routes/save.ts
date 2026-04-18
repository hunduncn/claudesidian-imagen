// src/routes/save.ts
import type { ServerContext } from "../server.ts";
import {
  resolveSavePath,
  nextVersion,
  buildWikilink,
} from "../core/path-resolver.ts";
import type { ImageType } from "../core/path-resolver.ts";
import { writeImage, listFilesIn, collectAllBasenames } from "../adapters/fs-vault.ts";
import { sanitizeErrorMessage } from "./_errors.ts";
import { join, relative } from "node:path";

interface SaveBody {
  sourcePath: string;
  type: ImageType;
  image:
    | { kind: "url"; url: string }
    | { kind: "base64"; mimeType: string; base64: string };
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`download failed ${resp.status}`);
  return new Uint8Array(await resp.arrayBuffer());
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function handleSaveRoute(req: Request, ctx: ServerContext): Promise<Response> {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body: SaveBody;
  try {
    body = (await req.json()) as SaveBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.sourcePath || !body.type || !body.image) {
    return Response.json({ error: "missing fields" }, { status: 400 });
  }

  const sourceMdAbs = join(ctx.vaultRoot, body.sourcePath);

  // First call with version=1 to get absoluteDir
  const dummyPath = resolveSavePath({
    vaultRoot: ctx.vaultRoot,
    sourceMdPath: sourceMdAbs,
    type: body.type,
    version: 1,
  });

  // Read existing filenames and compute next version
  const existing = listFilesIn(dummyPath.absoluteDir);
  const version = nextVersion(existing, body.type);

  // Final save path with real version
  const savePath = resolveSavePath({
    vaultRoot: ctx.vaultRoot,
    sourceMdPath: sourceMdAbs,
    type: body.type,
    version,
  });

  // Download or decode bytes
  let bytes: Uint8Array;
  try {
    if (body.image.kind === "url") {
      bytes = await fetchBytes(body.image.url);
    } else {
      bytes = decodeBase64(body.image.base64);
    }
  } catch (e) {
    return Response.json({ error: sanitizeErrorMessage(e, "save") }, { status: 502 });
  }

  // Write to disk
  writeImage(savePath.absolutePath, bytes);

  // Build wikilink, excluding our own filename so it doesn't collide with itself
  const allBasenames = collectAllBasenames(ctx.vaultRoot);
  const ours = savePath.filename;
  const otherBasenames = new Set<string>();
  for (const n of allBasenames) {
    if (n === ours) continue;
    otherBasenames.add(n);
  }
  const wikilink = buildWikilink({
    absolutePath: savePath.absolutePath,
    vaultRoot: ctx.vaultRoot,
    existingBasenames: otherBasenames,
  });

  return Response.json({
    savedPath: relative(ctx.vaultRoot, savePath.absolutePath),
    wikilink,
  });
}
