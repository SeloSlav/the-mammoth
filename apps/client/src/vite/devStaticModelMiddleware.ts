import fs from "node:fs/promises";
import type { ServerResponse } from "node:http";
import path from "node:path";
import type { Connect } from "vite";

export type DevStaticModelMiddlewareOptions = {
  /** Absolute path to `apps/client/public`. */
  clientPublicRoot: string;
};

function staticMime(filePath: string): string {
  if (filePath.endsWith(".wasm")) return "application/wasm";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".glb")) return "model/gltf-binary";
  if (filePath.endsWith(".gltf")) return "model/gltf+json";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  if (filePath.endsWith(".webp")) return "image/webp";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".wav")) return "audio/wav";
  return "application/octet-stream";
}

function noStoreHeaders(res: ServerResponse): void {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
}

function resolvePublicFile(
  clientPublicRoot: string,
  urlPath: string,
): { abs: string; relSafe: string } | null {
  const rel = decodeURIComponent(urlPath.replace(/^\//, ""));
  const abs = path.resolve(clientPublicRoot, rel);
  const relSafe = path.relative(clientPublicRoot, abs);
  if (relSafe.startsWith("..") || path.isAbsolute(relSafe)) return null;
  return { abs, relSafe };
}

/**
 * Dev-only: serve `apps/client/public/static/**` with no browser cache, and expose file mtimes
 * so GLTF loads can bust in-memory Three.js template caches after overwriting a `.glb` on disk.
 */
export function devStaticModelMiddleware(
  opts: DevStaticModelMiddlewareOptions,
): Connect.NextHandleFunction {
  return async (req, res, next) => {
    const url = req.url ?? "";
    const pathOnly = url.split("?")[0] ?? "";

    if (pathOnly === "/__dev/static-model-mtime") {
      const rel = new URL(url, "http://localhost").searchParams.get("rel")?.trim() ?? "";
      if (!rel || rel.includes("..")) {
        res.statusCode = 400;
        res.end("bad rel");
        return;
      }
      const resolved = resolvePublicFile(opts.clientPublicRoot, `/${rel}`);
      if (!resolved) {
        res.statusCode = 403;
        res.end("bad path");
        return;
      }
      try {
        const stat = await fs.stat(resolved.abs);
        noStoreHeaders(res);
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.statusCode = 200;
        res.end(JSON.stringify({ mtimeMs: stat.mtimeMs, size: stat.size }));
      } catch {
        res.statusCode = 404;
        res.end("not found");
      }
      return;
    }

    if (
      !pathOnly.startsWith("/static/") &&
      !pathOnly.startsWith("/audio/") &&
      !pathOnly.startsWith("/basis/")
    ) {
      return next();
    }

    const resolved = resolvePublicFile(opts.clientPublicRoot, pathOnly);
    if (!resolved) {
      res.statusCode = 403;
      res.end("bad path");
      return;
    }
    try {
      const data = await fs.readFile(resolved.abs);
      const stat = await fs.stat(resolved.abs);
      noStoreHeaders(res);
      res.setHeader("Content-Type", staticMime(resolved.abs));
      res.setHeader("X-Mammoth-Mtime-Ms", String(stat.mtimeMs));
      res.statusCode = 200;
      res.end(data);
    } catch {
      return next();
    }
  };
}
