const ORDER = [".ktx2", ".webp", ".png", ".jpg", ".jpeg"] as const;

/** Lowercase extensions we treat as “already resolved” paths (single candidate only). */
const HAS_EXT_RE = /\.(png|jpe?g|webp|svg|ktx2)$/i;

/**
 * Builds an ordered candidate list for a texture **without** a recognized extension —
 * prefers GPU-friendly BasisU/KTX2 first, then webp/png/jpeg.
 *
 * With an extension present, returns `[spec]` only (legacy authored URLs stay stable).
 */
export function textureCandidatesFromSpec(spec: string): string[] {
  const raw = spec.trim();
  if (!raw) return [];
  const lower = raw.toLowerCase();
  if (HAS_EXT_RE.test(lower)) {
    return [raw];
  }
  const base = raw.replace(/\/+$/, "");
  const out: string[] = [];
  for (const ext of ORDER) {
    out.push(`${base}${ext}`);
  }
  return out;
}
