function normalizeStaticModelPath(pathOrUrl: string): string {
  const trimmed = pathOrUrl.trim().replace(/^\/+/u, "");
  if (trimmed.startsWith("static/")) return `/${trimmed}`;
  if (trimmed.startsWith("/static/")) return trimmed;
  return `/static/models/${trimmed}`;
}

/**
 * URL for loading a file under `apps/client/public/static/…`.
 * In dev, appends `?t=<mtime>` from `/__dev/static-model-mtime` so browser + in-memory GLTF caches
 * pick up `.glb` overwrites after a normal refresh.
 */
export async function resolveStaticModelFetchUrl(pathOrUrl: string): Promise<string> {
  const base = normalizeStaticModelPath(pathOrUrl);
  if (!import.meta.env.DEV) return base;

  const rel = base.replace(/^\//, "");
  try {
    const response = await fetch(
      `/__dev/static-model-mtime?rel=${encodeURIComponent(rel)}`,
      { cache: "no-store" },
    );
    if (response.ok) {
      const payload = (await response.json()) as { mtimeMs?: number };
      if (typeof payload.mtimeMs === "number" && Number.isFinite(payload.mtimeMs)) {
        return `${base}?t=${payload.mtimeMs}`;
      }
    }
  } catch {
    /* fall through */
  }
  return base;
}

/** @deprecated Dev URLs are resolved fresh per call; kept for tests. */
export function clearStaticModelFetchUrlCache(): void {
  /* no-op */
}
