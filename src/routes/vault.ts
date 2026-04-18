// src/routes/vault.ts
import type { ServerContext } from "../server.ts";
import { listDir, readMarkdown } from "../adapters/fs-vault.ts";

export async function handleVaultRoutes(req: Request, ctx: ServerContext): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (path === "/api/vault/tree" && req.method === "GET") {
    const dir = url.searchParams.get("dir") ?? ".";
    try {
      const entries = listDir(ctx.vaultRoot, dir);
      return Response.json({ entries });
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 400 });
    }
  }

  if (path === "/api/vault/read" && req.method === "GET") {
    const filePath = url.searchParams.get("path") ?? "";
    try {
      const content = readMarkdown(ctx.vaultRoot, filePath);
      return Response.json({ content });
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 400 });
    }
  }

  return new Response("Not Found", { status: 404 });
}
