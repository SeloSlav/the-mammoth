import fs from "node:fs/promises";
import path from "node:path";
import type { Connect } from "vite";

/** GET `/content/**` from repo `content/` (dev only) so the client can hot-reload authored JSON. */
export function contentDevStaticGetMiddleware(repoRoot: string): Connect.NextHandleFunction {
  const contentRoot = path.resolve(repoRoot, "content");
  return async (req, res, next) => {
    const url = req.url?.split("?")[0] ?? "";
    if (!url.startsWith("/content/")) return next();
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    const rel = decodeURIComponent(url.replace(/^\/content\/?/, ""));
    const abs = path.resolve(contentRoot, rel);
    if (!abs.startsWith(contentRoot)) {
      res.statusCode = 403;
      res.end("bad path");
      return;
    }
    try {
      const data = await fs.readFile(abs);
      const ct = abs.endsWith(".json") ? "application/json" : "application/octet-stream";
      res.setHeader("Content-Type", ct);
      res.statusCode = 200;
      if (req.method === "HEAD") res.end();
      else res.end(data);
    } catch {
      res.statusCode = 404;
      res.end("not found");
    }
  };
}
