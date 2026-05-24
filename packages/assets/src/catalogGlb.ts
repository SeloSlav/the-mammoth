/**
 * Convention-based GLB resolution for catalog `def_id` values under
 * `apps/client/public/static/models/{weapons,consumables,objects,items}/{name}.glb`.
 *
 * **`items`** is for misc props—ammo pickups, cigarettes, packs—distinct from equippables (`weapons`)
 * and food/drink (`consumables`). Runtime loaders try URLs from {@link mammothCatalogGlbCandidates}
 * in order. Use {@link MAMMOTH_CATALOG_GLB_PRIMARY_URI} when the filename stem is not the catalog id
 * (e.g. `ammo-9mm` → `9-mm-round.glb`, `cigarettes` → `cigarette.glb`).
 * Catalog ids use **kebab-case**; filenames match them except where noted in PRIMARY.
 */

export const MAMMOTH_STATIC_MODEL_BASE = "/static/models";

/** Subfolders scanned after optional PRIMARY — `items` last (props / ammo / misc). */
export const MAMMOTH_CATALOG_GLB_SEARCH_ROOTS = ["weapons", "consumables", "objects", "items"] as const;

/** Catalog id → canonical URL when filename stem ≠ `def_id`. */
export const MAMMOTH_CATALOG_GLB_PRIMARY_URI: Readonly<Record<string, string>> = {
  "ammo-9mm": `${MAMMOTH_STATIC_MODEL_BASE}/items/9-mm-round.glb`,
  "ammo-shotgun-shell": `${MAMMOTH_STATIC_MODEL_BASE}/items/shotgun-shell.glb`,
  cigarettes: `${MAMMOTH_STATIC_MODEL_BASE}/items/cigarette.glb`,
  "scrap-metal": `${MAMMOTH_STATIC_MODEL_BASE}/items/scrap-metal.glb`,
  "chemical-stock": `${MAMMOTH_STATIC_MODEL_BASE}/items/chemical-stock.glb`,
  "door-lock": `${MAMMOTH_STATIC_MODEL_BASE}/items/door-lock.glb`,
  "fish-filter-sponge": `${MAMMOTH_STATIC_MODEL_BASE}/items/fish-filter-sponge.glb`,
  // Consumables: search order tries `weapons/` before `consumables/` — pin folder for correct primary + previews.
  apple: `${MAMMOTH_STATIC_MODEL_BASE}/consumables/apple.glb`,
  "water-bottle": `${MAMMOTH_STATIC_MODEL_BASE}/consumables/water-bottle.glb`,
  rakija: `${MAMMOTH_STATIC_MODEL_BASE}/consumables/rakija.glb`,
  "balcony-grow-substrate": `${MAMMOTH_STATIC_MODEL_BASE}/objects/compost.glb`,
};

/** Catalog def ids that share the balcony grow preview mesh (never `grow-tray.glb`). */
const BALCONY_GROW_CATALOG_PREVIEW_DEF_IDS = new Set<string>([
  "parsley-seeds",
  "dill-seeds",
  "paprika-seedlings",
  "green-onion-sets",
  "radish-sprout-seeds",
  "oyster-mushroom-spore",
  "scented-geranium-cuttings",
  "fresh-parsley",
  "fresh-dill",
  "fresh-paprika",
  "fresh-green-onion",
  "radish-sprouts",
  "fresh-oyster-mushroom",
  "scented-geranium-leaves",
]);

export type BalconyGrowStageGlb = "seed" | "sapling" | "mid" | "mature";

const BALCONY_GROW_STAGE_GLB: Record<BalconyGrowStageGlb, string> = {
  seed: `${MAMMOTH_STATIC_MODEL_BASE}/objects/grow-stage-seed.glb`,
  sapling: `${MAMMOTH_STATIC_MODEL_BASE}/objects/grow-stage-sapling.glb`,
  mid: `${MAMMOTH_STATIC_MODEL_BASE}/objects/grow-stage-mid.glb`,
  mature: `${MAMMOTH_STATIC_MODEL_BASE}/objects/grow-stage-mature.glb`,
};

/** Inventory / dropped-world preview for balcony grow catalog rows. */
export function balconyGrowCatalogPreviewGlb(): string {
  return BALCONY_GROW_STAGE_GLB.sapling;
}

export function isBalconyGrowCatalogPreviewDef(defId: string): boolean {
  return BALCONY_GROW_CATALOG_PREVIEW_DEF_IDS.has(defId);
}

/** Shared stage mesh for balcony grow slots (per-crop tint/scale applied at runtime). */
export function balconyGrowStageGlb(stage: BalconyGrowStageGlb): string {
  return BALCONY_GROW_STAGE_GLB[stage];
}

export const MAMMOTH_CATALOG_GLB_FALLBACK_URI = `${MAMMOTH_STATIC_MODEL_BASE}/weapons/crowbar.glb`;

function pushUnique(out: string[], seen: Set<string>, url: string): void {
  if (seen.has(url)) return;
  seen.add(url);
  out.push(url);
}

/**
 * Ordered GLB URLs — first successful `loadAsync` wins; last entry is a shipped fallback.
 */
export function mammothCatalogGlbCandidates(defId: string): readonly string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  if (isBalconyGrowCatalogPreviewDef(defId)) {
    pushUnique(out, seen, balconyGrowCatalogPreviewGlb());
  }

  const primary = MAMMOTH_CATALOG_GLB_PRIMARY_URI[defId];
  if (primary) pushUnique(out, seen, primary);

  for (const root of MAMMOTH_CATALOG_GLB_SEARCH_ROOTS) {
    const base = `${MAMMOTH_STATIC_MODEL_BASE}/${root}`;
    pushUnique(out, seen, `${base}/${defId}.glb`);
  }

  pushUnique(out, seen, MAMMOTH_CATALOG_GLB_FALLBACK_URI);

  return out;
}
