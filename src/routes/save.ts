// src/routes/save.ts
import type { ServerContext } from "../server.ts";
import {
  resolveSavePath,
  nextVersion,
  buildWikilink,
} from "../core/path-resolver.ts";
import type { ImageType } from "../core/path-resolver.ts";
import { writeImage, listFilesIn, collectAllBasenames, ensureInsideVault } from "../adapters/fs-vault.ts";
import { sanitizeErrorMessage } from "./_errors.ts";
import { join, relative } from "node:path";

interface SaveBody {
  sourcePath: string;
  type: ImageType;
  image:
    | { kind: "url"; url: string }
    | { kind: "base64"; mimeType: string; base64: string };
}

const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024; // 20 MB

function assertSafeDownloadUrl(rawUrl: string): URL {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error("Invalid download URL");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error("Only http(s) URLs are allowed");
  }
  // Block private/loopback/link-local hostnames by name (best-effort).
  // DNS-rebinding and resolved IPs are NOT covered; this is local-CLI hygiene, not hardening.
  const host = u.hostname.toLowerCase();
  const blockedHosts = ["localhost", "127.0.0.1", "0.0.0.0", "::1", "169.254.169.254"];
  if (blockedHosts.includes(host)) {
    throw new Error("Download host is blocked");
  }
  // Block literal private IPv4 ranges and link-local
  if (/^10\./.test(host)) throw new Error("Download host is blocked");
  if (/^192\.168\./.test(host)) throw new Error("Download host is blocked");
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) throw new Error("Download host is blocked");
  if (/^169\.254\./.test(host)) throw new Error("Download host is blocked");
  return u;
}

function isKnownImageMagic(b: Uint8Array): boolean {
  // PNG: 89 50 4E 47
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return true;
  // JPEG: FF D8 FF
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true;
  // GIF: "GIF"
  if (b.length >= 3 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return true;
  // WebP: "RIFF" ... "WEBP"
  if (b.length >= 12 &&
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return true;
  return false;
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const u = assertSafeDownloadUrl(url);
  const resp = await fetch(u.toString());
  if (!resp.ok) throw new Error(`download failed ${resp.status}`);

  // Size cap — read content-length if present; otherwise stream with a ceiling.
  const lenHeader = resp.headers.get("content-length");
  if (lenHeader && Number(lenHeader) > MAX_DOWNLOAD_BYTES) {
    throw new Error("Download exceeds size cap");
  }
  const buf = await resp.arrayBuffer();
  if (buf.byteLength > MAX_DOWNLOAD_BYTES) {
    throw new Error("Download exceeds size cap");
  }
  const bytes = new Uint8Array(buf);

  // Magic-byte sniff: accept PNG / JPEG / WebP / GIF
  if (!isKnownImageMagic(bytes)) {
    throw new Error("Downloaded content is not a known image format");
  }
  return bytes;
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

  if (body.image.kind === "url" && !body.image.url) {
    return Response.json({ error: "missing fields" }, { status: 400 });
  }
  if (body.image.kind === "base64" && !body.image.base64) {
    return Response.json({ error: "missing fields" }, { status: 400 });
  }

  try {
    ensureInsideVault(ctx.vaultRoot, body.sourcePath);
  } catch (e) {
    return Response.json({ error: sanitizeErrorMessage(e, "save") }, { status: 400 });
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
  try {
    writeImage(savePath.absolutePath, bytes);
  } catch (e) {
    return Response.json({ error: sanitizeErrorMessage(e, "save") }, { status: 500 });
  }

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
