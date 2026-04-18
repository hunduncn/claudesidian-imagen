// src/server.ts
import { findVaultRoot } from "./core/vault-finder.ts";
import { loadConfig, isConfigComplete, saveConfig, type Config } from "./config.ts";
import { handleVaultRoutes } from "./routes/vault.ts";
import { handleExtractRoute } from "./routes/extract.ts";
import { handleGenerateRoute } from "./routes/generate.ts";
import { handleSaveRoute } from "./routes/save.ts";
import { join } from "node:path";
import { existsSync } from "node:fs";

interface ServerContext {
  vaultRoot: string;
  getConfig: () => Config | null;
  setConfig: (cfg: Config) => void;
}

async function findFreePort(start: number): Promise<number> {
  for (let p = start; p < start + 100; p++) {
    try {
      const s = Bun.serve({ port: p, fetch: () => new Response() });
      s.stop();
      return p;
    } catch {
      // continue
    }
  }
  throw new Error(`No free port near ${start}`);
}

function staticResponse(publicDir: string, urlPath: string): Response | null {
  const safePath = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = join(publicDir, safePath.replace(/^\//, ""));
  if (!filePath.startsWith(publicDir)) return null; // path traversal guard
  if (!existsSync(filePath)) return null;
  return new Response(Bun.file(filePath));
}

async function handleApi(req: Request, ctx: ServerContext): Promise<Response | null> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (path === "/api/health") {
    return Response.json({ ok: true, vaultRoot: ctx.vaultRoot });
  }
  if (path === "/api/config" && req.method === "GET") {
    return Response.json({
      config: ctx.getConfig(),
      complete: isConfigComplete(ctx.getConfig()),
    });
  }
  if (path === "/api/config" && req.method === "POST") {
    const body = (await req.json()) as Config;
    ctx.setConfig(body);
    return Response.json({ ok: true });
  }
  if (path.startsWith("/api/vault/")) return handleVaultRoutes(req, ctx);
  if (path === "/api/extract") return handleExtractRoute(req, ctx);
  if (path === "/api/generate") return handleGenerateRoute(req, ctx);
  if (path === "/api/save") return handleSaveRoute(req, ctx);
  return null;
}

export async function startServer(): Promise<void> {
  const vaultRoot = findVaultRoot(process.cwd());
  if (!vaultRoot) {
    console.error("✗ 未找到 Claudesidian vault 标记 (CLAUDE.md)。");
    console.error("  请进入 vault 目录后再运行: cd /path/to/vault && bunx @claudesidian/imagen");
    process.exit(1);
  }
  console.log(`✓ Vault: ${vaultRoot}`);

  let cfg = loadConfig();
  cfg = cfg ?? {
    api: { baseUrl: "", apiKey: "", textModel: "", imageModel: "" },
    preferredPort: 5173,
  };

  const ctx: ServerContext = {
    vaultRoot,
    getConfig: () => cfg,
    setConfig: (c) => {
      cfg = { ...c, lastVaultPath: vaultRoot };
      saveConfig(cfg);
    },
  };

  const port = await findFreePort(cfg.preferredPort ?? 5173);
  // public dir is sibling of src/
  const publicDir = new URL("../public", import.meta.url).pathname;

  Bun.serve({
    port,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname.startsWith("/api/")) {
        const r = await handleApi(req, ctx);
        return r ?? new Response("Not Found", { status: 404 });
      }
      const s = staticResponse(publicDir, url.pathname);
      if (s) return s;
      // SPA fallback: serve index.html
      return new Response(Bun.file(join(publicDir, "index.html")));
    },
  });

  const url = `http://127.0.0.1:${port}`;
  console.log(`→ ${url}`);

  // open browser (best-effort, cross-platform)
  try {
    if (process.platform === "darwin") {
      Bun.spawn(["open", url]);
    } else if (process.platform === "win32") {
      // empty title arg required after `start` because the URL contains `&`
      Bun.spawn(["cmd", "/c", "start", "", url]);
    } else {
      Bun.spawn(["xdg-open", url]);
    }
  } catch {
    console.log("(could not auto-open browser; open the URL above manually)");
  }
}

if (import.meta.main) {
  startServer();
}

export type { ServerContext };
