/**
 * Default import scale for apartment decor GLBs.
 *
 * Values are taken from the first placement of each model in the reference authored unit
 * (`content/apartment/owned_apartment_builtins.json`, floor 19 east 3). Update this map when
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

/** First-authoring scale per `modelRelPath` from the reference owned-apartment unit. */
export const OWNED_APARTMENT_DECOR_DEFAULT_SCALE_BY_MODEL = {
  "static/models/objects/ashtray.glb": {
    uniformScale: 0.1253475248350381,
    verticalScaleMul: 1,
  },
  "static/models/objects/bed.glb": {
    uniformScale: 1.3018349780093093,
    verticalScaleMul: 1,
  },
  "static/models/objects/box-bread.glb": {
    uniformScale: 0.20179741183439223,
    verticalScaleMul: 1,
  },
  "static/models/objects/cabinet-horizontal.glb": {
    uniformScale: 0.9015343208782767,
    verticalScaleMul: 1,
  },
  "static/models/objects/chair.glb": {
    uniformScale: 0.6387760114721411,
    verticalScaleMul: 1,
  },
  "static/models/objects/chandelier.glb": {
    uniformScale: 0.34027693535970077,
    verticalScaleMul: 1,
  },
  "static/models/objects/cigarette.glb": {
    uniformScale: 0.04627148439303097,
    verticalScaleMul: 1,
  },
  "static/models/objects/coat-hanger-2.glb": {
    uniformScale: 0.3783331562089969,
    verticalScaleMul: 1,
  },
  "static/models/objects/coffee-cup-empty.glb": {
    uniformScale: 0.08,
    verticalScaleMul: 1,
  },
  "static/models/objects/computer.glb": {
    uniformScale: 0.32709119452241925,
    verticalScaleMul: 1,
  },
  "static/models/objects/cushion.glb": {
    uniformScale: 0.2973920205353675,
    verticalScaleMul: 1,
  },
  "static/models/objects/desk.glb": {
    uniformScale: 1.076300752191443,
    verticalScaleMul: 1,
  },
  "static/models/objects/drying-rack-2.glb": {
    uniformScale: 0.8012005715278097,
    verticalScaleMul: 1,
  },
  "static/models/objects/drying-rack-dishes.glb": {
    uniformScale: 0.1513817664625529,
    verticalScaleMul: 1,
  },
  "static/models/objects/empty-beer-bottle.glb": {
    uniformScale: 0.1702213304073897,
    verticalScaleMul: 1,
  },
  "static/models/objects/empty-beer-can-ozujsko.glb": {
    uniformScale: 0.11242224924488126,
    verticalScaleMul: 1,
  },
  "static/models/objects/empty-cigarette-pack.glb": {
    uniformScale: 0.09626611719109424,
    verticalScaleMul: 1,
  },
  "static/models/objects/family-photo-2.glb": {
    uniformScale: 0.1430165319488383,
    verticalScaleMul: 1,
  },
  "static/models/objects/family-photo.glb": {
    uniformScale: 0.19171383484397495,
    verticalScaleMul: 1,
  },
  "static/models/objects/fish-tank-castle.glb": {
    uniformScale: 0.12883928123690452,
    verticalScaleMul: 1,
  },
  "static/models/objects/fish-tank-filter.glb": {
    uniformScale: 0.15227231729779228,
    verticalScaleMul: 0.9552318371825571,
  },
  "static/models/objects/fish-tank-sand.glb": {
    uniformScale: 0.17502921019171694,
    verticalScaleMul: 1.1298328205147943,
  },
  "static/models/objects/fish-tank.glb": {
    uniformScale: 0.24004505933091325,
    verticalScaleMul: 1,
  },
  "static/models/objects/footlocker.glb": {
    uniformScale: 0.6213117846513727,
    verticalScaleMul: 1,
  },
  "static/models/objects/fridge.glb": {
    uniformScale: 1.0875838849973372,
    verticalScaleMul: 1,
  },
  "static/models/objects/glass-empty.glb": {
    uniformScale: 0.061285726222450015,
    verticalScaleMul: 1,
  },
  "static/models/objects/grow-tray-empty.glb": {
    uniformScale: 0.5068560948252686,
    verticalScaleMul: 1,
  },
  "static/models/objects/heater-room.glb": {
    uniformScale: 0.5596451438846985,
    verticalScaleMul: 1,
  },
  "static/models/objects/kelp.glb": {
    uniformScale: 0.053975298518160277,
    verticalScaleMul: 1,
  },
  "static/models/objects/kitchen-counter-2.glb": {
    uniformScale: 1.2905003590527768,
    verticalScaleMul: 1.2458761734189374,
  },
  "static/models/objects/lamp-standing.glb": {
    uniformScale: 1,
    verticalScaleMul: 1,
  },
  "static/models/objects/laundry.glb": {
    uniformScale: 0.562436812617749,
    verticalScaleMul: 1,
  },
  "static/models/objects/light-ceiling-2.glb": {
    uniformScale: 0.19097143292300797,
    verticalScaleMul: 1,
  },
  "static/models/objects/light-grow-op.glb": {
    uniformScale: 0.47502786609209796,
    verticalScaleMul: 1,
  },
  "static/models/objects/marian-portrait.glb": {
    uniformScale: 0.3,
    verticalScaleMul: 1,
  },
  "static/models/objects/notebook.glb": {
    uniformScale: 0.16239800099616974,
    verticalScaleMul: 1,
  },
  "static/models/objects/painting-knitted.glb": {
    uniformScale: 0.5574408386464206,
    verticalScaleMul: 1,
  },
  "static/models/objects/radio.glb": {
    uniformScale: 0.25,
    verticalScaleMul: 1,
  },
  "static/models/objects/rakija.glb": {
    uniformScale: 0.21375318679269292,
    verticalScaleMul: 1,
  },
  "static/models/objects/remote.glb": {
    uniformScale: 0.11838750237364837,
    verticalScaleMul: 1,
  },
  "static/models/objects/rug-floor.glb": {
    uniformScale: 2.084773889828986,
    verticalScaleMul: 1.0298823224092546,
  },
  "static/models/objects/rug-wall.glb": {
    uniformScale: 1,
    verticalScaleMul: 1,
  },
  "static/models/objects/shelf-storage.glb": {
    uniformScale: 1.3906682215791686,
    verticalScaleMul: 1.7309991360230665,
  },
  "static/models/objects/shower.glb": {
    uniformScale: 1.2780374390037539,
    verticalScaleMul: 1,
  },
  "static/models/objects/sink.glb": {
    uniformScale: 0.3922916098188611,
    verticalScaleMul: 1,
  },
  "static/models/objects/slippers.glb": {
    uniformScale: 0.17967842276127186,
    verticalScaleMul: 1,
  },
  "static/models/objects/sofa.glb": {
    uniformScale: 1.6105584619117874,
    verticalScaleMul: 1,
  },
  "static/models/objects/stove.glb": {
    uniformScale: 0.5459024758546215,
    verticalScaleMul: 1,
  },
  "static/models/objects/table-dining.glb": {
    uniformScale: 0.8778936277210995,
    verticalScaleMul: 1,
  },
  "static/models/objects/table-side.glb": {
    uniformScale: 0.45519422090843403,
    verticalScaleMul: 1,
  },
  "static/models/objects/toilet.glb": {
    uniformScale: 0.6515191438158092,
    verticalScaleMul: 1,
  },
  "static/models/objects/towl.glb": {
    uniformScale: 0.20976430023967615,
    verticalScaleMul: 1,
  },
  "static/models/objects/tv.glb": {
    uniformScale: 0.41536348828836117,
    verticalScaleMul: 1,
  },
  "static/models/objects/used-cigarette-2.glb": {
    uniformScale: 0.04912865049069664,
    verticalScaleMul: 1,
  },
  "static/models/objects/used-cigarette.glb": {
    uniformScale: 0.03757038782453294,
    verticalScaleMul: 1,
  },
  "static/models/objects/wall-clock.glb": {
    uniformScale: 0.23638635139427056,
    verticalScaleMul: 1,
  },
  "static/models/objects/wardrobe-closet.glb": {
    uniformScale: 1.2597163561791922,
    verticalScaleMul: 1,
  },
  "static/models/objects/water-tank.glb": {
    uniformScale: 1,
    verticalScaleMul: 1,
  },
  "static/models/objects/window-shutter.glb": {
    uniformScale: 1.7485030380530002,
    verticalScaleMul: 0.8024663311843774,
  },
} as const satisfies Readonly<Record<string, OwnedApartmentDecorDefaultScale>>;

export function normalizeOwnedApartmentDecorModelRelPath(modelRelPath: string): string {
  return modelRelPath.trim().replace(/^\/+/u, "");
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
