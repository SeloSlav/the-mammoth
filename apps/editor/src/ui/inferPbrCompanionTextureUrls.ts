const BASECOLOR_STRIP_RE =
  /(?:-basecolor|-albedo|-diffuse|-color|-base|-diff|_basecolor|_albedo|_diffuse|_color)$/i;

/** Try longer / explicit suffixes before short ambiguous ones (e.g. `_n`). */
const NORMAL_SUFFIXES = ["-normal", "_normal", "-nrm", "_nrm", "_Normal", "-n", "_n"];
const ROUGHNESS_SUFFIXES = ["-roughness", "_roughness", "-rough", "_rough", "_r"];
const METALNESS_SUFFIXES = ["-metalness", "_metalness", "-metal", "_metal", "_m"];
const HEIGHT_SUFFIXES = ["-height", "_height", "-disp", "_disp", "-bump", "_bump", "-displacement", "_displacement"];

function splitMaterialUrl(url: string): { dir: string; stem: string } {
  const trimmed = url.trim().split("?")[0] ?? "";
  const li = trimmed.lastIndexOf("/");
  const dir = li >= 0 ? trimmed.slice(0, li + 1) : "";
  const file = li >= 0 ? trimmed.slice(li + 1) : trimmed;
  const dot = file.lastIndexOf(".");
  const stem = dot > 0 ? file.slice(0, dot) : file;
  return { dir, stem };
}

function normalizeBaseStem(stem: string): string {
  return stem.replace(BASECOLOR_STRIP_RE, "");
}

function findCatalogStem(catalog: readonly string[], dir: string, wantStem: string): string | undefined {
  for (const raw of catalog) {
    const u = raw.trim().split("?")[0] ?? "";
    if (!u.startsWith(dir)) continue;
    const file = u.slice(dir.length);
    const dot = file.lastIndexOf(".");
    const stem = dot > 0 ? file.slice(0, dot) : file;
    if (stem === wantStem) return raw.trim();
  }
  return undefined;
}

function firstMatchingStem(
  catalog: readonly string[],
  dir: string,
  baseStems: readonly string[],
  suffixes: readonly string[],
): string | undefined {
  for (const base of baseStems) {
    if (!base) continue;
    for (const suf of suffixes) {
      const hit = findCatalogStem(catalog, dir, `${base}${suf}`);
      if (hit) return hit;
    }
  }
  return undefined;
}

export type PbrCompanionTextureUrls = {
  normalMapUrl?: string;
  roughnessMapUrl?: string;
  metalnessMapUrl?: string;
  bumpMapUrl?: string;
};

/**
 * Given an albedo/base map URL and the editor texture catalog, finds sibling maps in the same folder
 * using common stem suffix conventions (`-normal`, `_roughness`, etc.).
 */
export function inferPbrCompanionMapsFromBaseMapUrl(
  mapUrl: string | undefined,
  catalog: readonly string[],
): PbrCompanionTextureUrls {
  const empty: PbrCompanionTextureUrls = {
    normalMapUrl: undefined,
    roughnessMapUrl: undefined,
    metalnessMapUrl: undefined,
    bumpMapUrl: undefined,
  };
  if (!mapUrl?.trim() || catalog.length === 0) return empty;

  const { dir, stem } = splitMaterialUrl(mapUrl);
  if (!stem) return empty;

  const stems = Array.from(new Set([stem, normalizeBaseStem(stem)].filter(Boolean)));

  return {
    normalMapUrl: firstMatchingStem(catalog, dir, stems, NORMAL_SUFFIXES),
    roughnessMapUrl: firstMatchingStem(catalog, dir, stems, ROUGHNESS_SUFFIXES),
    metalnessMapUrl: firstMatchingStem(catalog, dir, stems, METALNESS_SUFFIXES),
    bumpMapUrl: firstMatchingStem(catalog, dir, stems, HEIGHT_SUFFIXES),
  };
}

/** When `mapUrl` is edited, reset companion slots from catalog inference (or clear when map cleared). */
export function expandAuthoringMaterialPatchWithCompanionMaps<T extends PbrCompanionTextureUrls & { mapUrl?: string }>(
  patch: T,
  catalog: readonly string[] | undefined,
): T {
  if (!catalog?.length || !("mapUrl" in patch)) return patch;

  if (!patch.mapUrl?.trim()) {
    return {
      ...patch,
      normalMapUrl: undefined,
      roughnessMapUrl: undefined,
      metalnessMapUrl: undefined,
      bumpMapUrl: undefined,
    };
  }

  const companions = inferPbrCompanionMapsFromBaseMapUrl(patch.mapUrl, catalog);
  return { ...patch, ...companions };
}
