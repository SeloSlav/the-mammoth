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
  // Consumables: search order tries `weapons/` before `consumables/` — pin folder for correct primary + previews.
  apple: `${MAMMOTH_STATIC_MODEL_BASE}/consumables/apple.glb`,
  "water-bottle": `${MAMMOTH_STATIC_MODEL_BASE}/consumables/water-bottle.glb`,
  rakija: `${MAMMOTH_STATIC_MODEL_BASE}/consumables/rakija.glb`,
  "balcony-grow-substrate": `${MAMMOTH_STATIC_MODEL_BASE}/objects/grow-tray.glb`,
  "lovage-seeds": `${MAMMOTH_STATIC_MODEL_BASE}/objects/grow-tray.glb`,
  "parsley-seeds": `${MAMMOTH_STATIC_MODEL_BASE}/objects/grow-tray.glb`,
  "dill-seeds": `${MAMMOTH_STATIC_MODEL_BASE}/objects/grow-tray.glb`,
  "paprika-seedlings": `${MAMMOTH_STATIC_MODEL_BASE}/objects/grow-tray.glb`,
  "green-onion-sets": `${MAMMOTH_STATIC_MODEL_BASE}/objects/grow-tray.glb`,
  "radish-sprout-seeds": `${MAMMOTH_STATIC_MODEL_BASE}/objects/grow-tray.glb`,
  "oyster-mushroom-spore": `${MAMMOTH_STATIC_MODEL_BASE}/objects/grow-tray.glb`,
  "scented-geranium-cuttings": `${MAMMOTH_STATIC_MODEL_BASE}/objects/grow-tray.glb`,
  "fresh-lovage": `${MAMMOTH_STATIC_MODEL_BASE}/objects/grow-tray.glb`,
  "fresh-parsley": `${MAMMOTH_STATIC_MODEL_BASE}/objects/grow-tray.glb`,
  "fresh-dill": `${MAMMOTH_STATIC_MODEL_BASE}/objects/grow-tray.glb`,
  "fresh-paprika": `${MAMMOTH_STATIC_MODEL_BASE}/consumables/apple.glb`,
  "fresh-green-onion": `${MAMMOTH_STATIC_MODEL_BASE}/objects/grow-tray.glb`,
  "radish-sprouts": `${MAMMOTH_STATIC_MODEL_BASE}/objects/grow-tray.glb`,
  "fresh-oyster-mushroom": `${MAMMOTH_STATIC_MODEL_BASE}/objects/grow-tray.glb`,
  "dried-oyster-mushroom": `${MAMMOTH_STATIC_MODEL_BASE}/objects/grow-tray.glb`,
  "scented-geranium-leaves": `${MAMMOTH_STATIC_MODEL_BASE}/consumables/apple.glb`,
};

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

  const primary = MAMMOTH_CATALOG_GLB_PRIMARY_URI[defId];
  if (primary) pushUnique(out, seen, primary);

  for (const root of MAMMOTH_CATALOG_GLB_SEARCH_ROOTS) {
    const base = `${MAMMOTH_STATIC_MODEL_BASE}/${root}`;
    pushUnique(out, seen, `${base}/${defId}.glb`);
  }

  pushUnique(out, seen, MAMMOTH_CATALOG_GLB_FALLBACK_URI);

  return out;
}
