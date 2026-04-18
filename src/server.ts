// src/server.ts
import { findVaultRoot } from "./core/vault-finder.ts";
import { loadConfig, isConfigComplete, saveConfig, type Config } from "./config.ts";
import { handleVaultRoutes } from "./routes/vault.ts";
import { handleExtractRoute } from "./routes/extract.ts";
import { handleGenerateRoute } from "./routes/generate.ts";
import { handleSaveRoute } from "./routes/save.ts";
import { isAbsolute, join, relative } from "node:path";
import { existsSync } from "node:fs";

interface ServerContext {
  vaultRoot: string;
  getConfig: () => Config | null;
  setConfig: (cfg: Config) => void;
}

/**
 * Find a free port starting from `start`, probing up to +99.
 *
 * Note: uses `Bun.serve() + stop()` which briefly binds the port — there is a
 * small TOCTOU window between probe release and the real server bind. For a
 * single-user CLI launched once per session this is acceptable.
 */
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
  // Path-traversal guard: filePath must be inside publicDir
  const rel = relative(publicDir, filePath);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
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
    let body: Config;
    try {
      body = (await req.json()) as Config;
    } catch {
      return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }
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

  // In-memory empty defaults when no config file exists. NOT persisted to disk
  // until user completes setup via POST /api/config. GET /api/config reports
  // `complete: false` until then, which drives the setup UI in Task 14.
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
  // public dir is sibling of src/ — use import.meta.dir so this works under
  // `bun run src/server.ts` during dev AND when installed via `bunx @claudesidian/imagen`
  const publicDir = join(import.meta.dir, "..", "public");

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
      // Non-existent asset-like paths return 404 (don't mask missing images/css as HTML).
      if (/\.(png|jpe?g|gif|webp|svg|ico|css|js|mjs|map|woff2?)$/i.test(url.pathname)) {
        return new Response("Not Found", { status: 404 });
      }
      // SPA fallback: serve index.html for route-like paths
      return new Response(Bun.file(join(publicDir, "index.html")));
    },
  });

  const url = `http://127.0.0.1:${port}`;
  console.log(`→ ${url}`);

  // open browser (best-effort, cross-platform)
  try {
    const spawnOpts = { stdout: "ignore" as const, stderr: "ignore" as const };
    if (process.platform === "darwin") {
      Bun.spawn(["open", url], spawnOpts);
    } else if (process.platform === "win32") {
      // empty title arg required after `start` because the URL contains `&`
      Bun.spawn(["cmd", "/c", "start", "", url], spawnOpts);
    } else {
      Bun.spawn(["xdg-open", url], spawnOpts);
    }
  } catch {
    console.log("(could not auto-open browser; open the URL above manually)");
  }
}

if (import.meta.main) {
  startServer();
}

export type { ServerContext };
