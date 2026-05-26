import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const OWNED_APARTMENT_BUILTINS_REL = "content/apartment/owned_apartment_builtins.json";
export const OWNED_APARTMENT_DECOR_DEFAULT_SCALE_REL =
  "packages/schemas/src/ownedApartmentDecorDefaultScale.ts";

/**
 * First placement per normalized `modelRelPath` (reference unit extraction).
 *
 * @param {ReadonlyArray<{ modelRelPath: string; uniformScale: number; verticalScaleMul?: number }>} placedItems
 * @returns {Record<string, { uniformScale: number; verticalScaleMul: number }>}
 */
export function buildOwnedApartmentDecorDefaultScaleByModelFromPlacedItems(placedItems) {
  const out = {};
  for (const item of placedItems) {
    if (!item || typeof item.modelRelPath !== "string") continue;
    const path = item.modelRelPath.trim().replace(/^\/+/u, "");
    if (!path || out[path]) continue;
    const uniformScale = Number(item.uniformScale);
    if (!Number.isFinite(uniformScale)) continue;
    const verticalScaleMul = Number(item.verticalScaleMul ?? 1);
    out[path] = {
      uniformScale,
      verticalScaleMul: Number.isFinite(verticalScaleMul) ? verticalScaleMul : 1,
    };
  }
  return out;
}

/**
 * @param {Record<string, { uniformScale: number; verticalScaleMul: number }>} byModel
 */
export function formatOwnedApartmentDecorDefaultScaleTsFile(byModel) {
  const sortedPaths = Object.keys(byModel).sort();
  const entries = sortedPaths
    .map((path) => {
      const s = byModel[path];
      return `  "${path}": {
    uniformScale: ${s.uniformScale},
    verticalScaleMul: ${s.verticalScaleMul},
  },`;
    })
    .join("\n");

  return `/**
 * Default import scale for apartment decor GLBs.
 *
 * Values are taken from the first placement of each model in the reference authored unit
 * (\`content/apartment/owned_apartment_builtins.json\`, floor 19 east 3). Update this map when
 * you establish a new canonical scale in that unit — the sync test keeps it aligned.
 *
 * Regenerate: node scripts/sync-owned-apartment-decor-default-scale.mjs
 * Editor: My apartment → **Sync default import scales** (dev server, EDITOR_SAVE=1).
 */
export type OwnedApartmentDecorDefaultScale = {
  uniformScale: number;
  verticalScaleMul: number;
};

export const OWNED_APARTMENT_FALLBACK_DECOR_DEFAULT_SCALE: OwnedApartmentDecorDefaultScale =
  {
    uniformScale: 1,
    verticalScaleMul: 1,
  };

/** First-authoring scale per \`modelRelPath\` from the reference owned-apartment unit. */
export const OWNED_APARTMENT_DECOR_DEFAULT_SCALE_BY_MODEL = {
${entries}
} as const satisfies Readonly<Record<string, OwnedApartmentDecorDefaultScale>>;

export function normalizeOwnedApartmentDecorModelRelPath(modelRelPath: string): string {
  return modelRelPath.trim().replace(/^\\/+/u, "");
}

/** Build first-placement scale map from an authored layout doc (reference extraction helper). */
export function buildOwnedApartmentDecorDefaultScaleByModelFromPlacedItems(
  placedItems: ReadonlyArray<{
    modelRelPath: string;
    uniformScale: number;
    verticalScaleMul?: number;
  }>,
): Record<string, OwnedApartmentDecorDefaultScale> {
  const out: Record<string, OwnedApartmentDecorDefaultScale> = {};
  for (const item of placedItems) {
    const path = normalizeOwnedApartmentDecorModelRelPath(item.modelRelPath);
    if (out[path]) continue;
    out[path] = {
      uniformScale: item.uniformScale,
      verticalScaleMul: item.verticalScaleMul ?? 1,
    };
  }
  return out;
}

/** Default scale when importing a decor model that is not yet in the reference map. */
export function defaultOwnedApartmentDecorScaleForModel(
  modelRelPath: string,
): OwnedApartmentDecorDefaultScale {
  const norm = normalizeOwnedApartmentDecorModelRelPath(modelRelPath);
  return (
    OWNED_APARTMENT_DECOR_DEFAULT_SCALE_BY_MODEL[
      norm as keyof typeof OWNED_APARTMENT_DECOR_DEFAULT_SCALE_BY_MODEL
    ] ?? OWNED_APARTMENT_FALLBACK_DECOR_DEFAULT_SCALE
  );
}
`;
}

/**
 * @param {string} repoRoot
 * @param {{
 *   placedItems?: ReadonlyArray<{ modelRelPath: string; uniformScale: number; verticalScaleMul?: number }>;
 *   builtinsPath?: string;
 *   outPath?: string;
 * }} [opts]
 */
export function syncOwnedApartmentDecorDefaultScaleFromRepoRoot(repoRoot, opts = {}) {
  const builtinsPath = opts.builtinsPath ?? join(repoRoot, OWNED_APARTMENT_BUILTINS_REL);
  const outPath = opts.outPath ?? join(repoRoot, OWNED_APARTMENT_DECOR_DEFAULT_SCALE_REL);

  let placedItems = opts.placedItems;
  let source = "editor";
  if (!placedItems) {
    const raw = JSON.parse(readFileSync(builtinsPath, "utf8"));
    placedItems = raw.placedItems ?? [];
    source = "disk";
  }

  const byModel = buildOwnedApartmentDecorDefaultScaleByModelFromPlacedItems(placedItems);
  const modelCount = Object.keys(byModel).length;
  const placementCount = placedItems.length;

  writeFileSync(outPath, formatOwnedApartmentDecorDefaultScaleTsFile(byModel));

  return {
    ok: true,
    source,
    modelCount,
    placementCount,
    builtinsPath,
    outPath,
  };
}
