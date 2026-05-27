import { MAMMOTH_STATIC_MODEL_BASE } from "./catalogGlb.js";

function pushUnique(out: string[], seen: Set<string>, url: string): void {
  if (seen.has(url)) return;
  seen.add(url);
  out.push(url);
}

/** Normalize site-root paths to `/static/models/...` form. */
export function normalizeMammothStaticModelUri(pathOrUrl: string): string {
  const trimmed = pathOrUrl.trim().replace(/^\/+/u, "");
  let normalized: string;
  if (trimmed.startsWith("static/")) normalized = `/${trimmed}`;
  else if (trimmed.startsWith("/static/")) normalized = trimmed;
  else normalized = `${MAMMOTH_STATIC_MODEL_BASE}/${trimmed}`;
  return normalized.replace("/static/models-opt/", "/static/models/");
}

/**
 * Load URL for a static model GLB under `static/models/`.
 * Draco/KTX2 compression is handled by the configured GLTF loader when present in the file.
 */
export function mammothGlbLoadCandidates(legacyUri: string): readonly string[] {
  return [normalizeMammothStaticModelUri(legacyUri)];
}

/** Expand a URI list, normalizing each entry to `static/models/` paths. */
export function expandMammothGlbLoadCandidates(candidates: readonly string[]): readonly string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const uri of candidates) {
    for (const candidate of mammothGlbLoadCandidates(uri)) {
      pushUnique(out, seen, candidate);
    }
  }
  return out;
}
