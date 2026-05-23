import balconyGrowOpItems from "../../../../content/items/catalog/balcony_grow_op.json";
import consumableItems from "../../../../content/items/catalog/consumables.json";
import materialItems from "../../../../content/items/catalog/materials.json";
import meleeWeapons from "../../../../content/items/catalog/melee_weapons.json";
import placeableItems from "../../../../content/items/catalog/placeables.json";
import rangedWeapons from "../../../../content/items/catalog/ranged_weapons.json";
import toolItems from "../../../../content/items/catalog/tools.json";
import ammo9mmIcon from "../../../../content/references/meshy/9-mm-round.png?url";
import appleIcon from "../../../../content/references/meshy/apple.png?url";
import cigaretteIcon from "../../../../content/references/meshy/cigarette.png?url";
import baseballBatIcon from "../../../../content/references/meshy/baseball-bat.png?url";
import crowbarIcon from "../../../../content/references/meshy/crowbar.png?url";
import doorLockIcon from "../../../../content/references/meshy/door-lock.png?url";
import knifeIcon from "../../../../content/references/meshy/knife.png?url";
import pistolIcon from "../../../../content/references/meshy/pistol.png?url";
import rakijaIcon from "../../../../content/references/meshy/rakija-icon.png?url";
import multimeterIcon from "../../../../content/references/meshy/multimeter.png?url";
import screwdriverIcon from "../../../../content/references/meshy/screwdriver.png?url";
import shotgunCoachIcon from "../../../../content/references/meshy/shotgun-coach.png?url";
import shotgunShellIcon from "../../../../content/references/meshy/shotgun-shell.png?url";
import scrapMetalIcon from "../../../../content/references/meshy/scrap-metal.png?url";
import chemicalStockIcon from "../../../../content/references/meshy/chemical-stock.png?url";
import compostIcon from "../../../../content/references/meshy/compost.png?url";
import freshOysterMushroomIcon from "../../../../content/references/meshy/fresh-oyster-mushroom.png?url";
import freshDillIcon from "../../../../content/references/meshy/fresh-dill.png?url";
import freshGreenOnionIcon from "../../../../content/references/meshy/fresh-green-onion.png?url";
import freshPaprikaIcon from "../../../../content/references/meshy/fresh-paprika.png?url";
import freshParsleyIcon from "../../../../content/references/meshy/fresh-parsley.png?url";
import improvisedCookFireIcon from "../../../../content/references/meshy/improvised-cook-fire.png?url";
import radishSproutsIcon from "../../../../content/references/meshy/radish-sprouts.png?url";
import scentedGeraniumCuttingsIcon from "../../../../content/references/meshy/scented-geranium-cuttings.png?url";
import seedsIcon from "../../../../content/references/meshy/seeds.png?url";
import snapRatTrapIcon from "../../../../content/references/meshy/snap-rat-trap.png?url";
import srbosjekIcon from "../../../../content/references/meshy/srbosjek.png?url";
import trenchCandleIcon from "../../../../content/references/meshy/trench-candle.png?url";
import waterBottleIcon from "../../../../content/references/meshy/water-bottle.png?url";

import {
  normalizeWaterContainer,
} from "./waterContainerHelpers";

import type {
  ItemCategory,
  MammothConstruction,
  MammothConstructionIngredient,
  MammothConsumeOnUse,
  MammothHotbarConsumeSound,
  MammothMeleeCombat,
  MammothItemDef,
  MammothBalconyGrow,
} from "./mammothItemCatalogTypes";

import {
  mammothCatalogGlbCandidates,
  MAMMOTH_CATALOG_GLB_FALLBACK_URI,
  MAMMOTH_CATALOG_GLB_PRIMARY_URI,
} from "@the-mammoth/assets";

export type {
  ItemCategory,
  MammothConstruction,
  MammothConstructionIngredient,
  MammothConsumeOnUse,
  MammothItemDef,
  MammothBalconyGrow,
  MammothWaterContainer,
} from "./mammothItemCatalogTypes";

export {
  mammothItemDefSupportsHotbarWaterDrink,
  mammothItemDefSupportsHotbarUseAction,
  mammothItemDefSupportsHotbarFpViewmodel,
} from "./waterContainerHelpers";

/** World GLB resolution (re-exported from `@the-mammoth/assets`). */
export { mammothCatalogGlbCandidates, MAMMOTH_CATALOG_GLB_FALLBACK_URI, MAMMOTH_CATALOG_GLB_PRIMARY_URI };

/** Keep in sync with `apps/server/src/items_catalog/load.rs` `SHARD_SOURCES`. */
const CATALOG_SHARDS = [
  materialItems,
  meleeWeapons,
  rangedWeapons,
  toolItems,
  placeableItems,
  consumableItems,
  balconyGrowOpItems,
] as const;

type RawItem = {
  id: string;
  displayName: string;
  description: string;
  category: ItemCategory;
  maxStack: number;
  construction?: {
    buildTimeSecs?: number;
    materials?: MammothConstructionIngredient[];
    requiredTools?: string[];
    outputQuantity?: number;
  };
  meleeCombat?: MammothMeleeCombat;
  consumeOnUse?: MammothConsumeOnUse;
  hotbarConsumeSound?: MammothHotbarConsumeSound;
  waterContainer?: {
    capacityLiters?: number;
    sipLiters?: number;
    hydrationPerLiter?: number;
  };
  balconyGrow?: {
    harvestDefId?: string;
    growDaysMin?: number;
    growDaysMax?: number;
    stageTint?: string;
    stageScale?: number;
  };
  balconyGrowFertilizer?: boolean;
};

type RawShard = {
  version?: number;
  items: RawItem[];
};

/** HUD icons: Vite `?url` imports (see `knife` above). */
const ICONS: Record<string, string> = {
  knife: knifeIcon,
  crowbar: crowbarIcon,
  srbosjek: srbosjekIcon,
  "baseball-bat": baseballBatIcon,
  apple: appleIcon,
  "water-bottle": waterBottleIcon,
  rakija: rakijaIcon,
  pistol: pistolIcon,
  "shotgun-coach": shotgunCoachIcon,
  "ammo-9mm": ammo9mmIcon,
  "ammo-shotgun-shell": shotgunShellIcon,
  "scrap-metal": scrapMetalIcon,
  "chemical-stock": chemicalStockIcon,
  cigarettes: cigaretteIcon,
  "door-lock": doorLockIcon,
  multimeter: multimeterIcon,
  screwdriver: screwdriverIcon,
  "balcony-grow-substrate": compostIcon,
  "fresh-parsley": freshParsleyIcon,
  "fresh-dill": freshDillIcon,
  "fresh-paprika": freshPaprikaIcon,
  "fresh-green-onion": freshGreenOnionIcon,
  "radish-sprouts": radishSproutsIcon,
  "fresh-oyster-mushroom": freshOysterMushroomIcon,
  "scented-geranium-leaves": scentedGeraniumCuttingsIcon,
  "improvised-cook-fire": improvisedCookFireIcon,
  "snap-rat-trap": snapRatTrapIcon,
  "trench-candle": trenchCandleIcon,
};

/** First candidate URL (preview / legacy). World mesh load uses the full candidate list. */
export function getMammothDroppedWorldModelUrl(defId: string): string {
  const first = mammothCatalogGlbCandidates(defId)[0];
  return first ?? MAMMOTH_CATALOG_GLB_FALLBACK_URI;
}

function normalizeConsumeOnUse(raw?: MammothConsumeOnUse): MammothConsumeOnUse | null {
  if (!raw) return null;
  const h = raw.healthDelta ?? 0;
  const hu = raw.hungerDelta ?? 0;
  const hy = raw.hydrationDelta ?? 0;
  if (h === 0 && hu === 0 && hy === 0) return null;
  return { ...raw };
}

function normalizeHotbarConsumeSound(raw?: MammothHotbarConsumeSound): MammothHotbarConsumeSound | null {
  return raw === "eat" || raw === "drink" || raw === "smoke" ? raw : null;
}

function normalizeMeleeCombat(raw?: MammothMeleeCombat): MammothMeleeCombat | null {
  if (!raw) return null;
  if (!(raw.damage > 0)) return null;
  return { damage: raw.damage };
}

function normalizeConstruction(raw?: RawItem["construction"] | null): MammothConstruction | null {
  if (!raw) return null;
  if (!(raw.buildTimeSecs && raw.buildTimeSecs > 0)) return null;
  if (!Array.isArray(raw.materials) || raw.materials.length === 0) return null;
  const materials: MammothConstructionIngredient[] = [];
  for (const m of raw.materials) {
    if (
      typeof m.itemId !== "string" ||
      m.itemId.trim().length === 0 ||
      typeof m.quantity !== "number" ||
      !Number.isFinite(m.quantity)
    )
      continue;
    materials.push({ itemId: m.itemId, quantity: Math.max(1, Math.floor(m.quantity)) });
  }
  if (materials.length === 0) return null;
  const requiredTools = Array.isArray(raw.requiredTools)
    ? raw.requiredTools.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    : [];

  const construction: MammothConstruction = {
    buildTimeSecs: raw.buildTimeSecs,
    materials,
    requiredTools,
  };
  if (typeof raw.outputQuantity === "number" && Number.isFinite(raw.outputQuantity)) {
    const oq = Math.max(1, Math.floor(raw.outputQuantity));
    if (oq > 1) construction.outputQuantity = oq;
  }
  return construction;
}

/** `true` when catalog says instant hotbar consume is defined (category consumable + non-zero `consumeOnUse`). */
export function mammothItemDefSupportsHotbarInstantConsume(def: MammothItemDef | undefined): boolean {
  if (!def || def.category !== "consumable") return false;
  return def.consumeOnUse !== null;
}

function normalizeBalconyGrow(raw?: RawItem["balconyGrow"]): MammothBalconyGrow | null {
  if (!raw?.harvestDefId) return null;
  const min = raw.growDaysMin ?? 1;
  const max = Math.max(min, raw.growDaysMax ?? min);
  return {
    harvestDefId: raw.harvestDefId,
    growDaysMin: min,
    growDaysMax: max,
    stageTint: raw.stageTint ?? "#3d8b4a",
    stageScale: raw.stageScale ?? 1,
  };
}

function mergeRawItems(): RawItem[] {
  const out: RawItem[] = [];
  for (const shard of CATALOG_SHARDS) {
    const s = shard as RawShard;
    out.push(...s.items);
  }
  return out;
}

function resolveIconUrl(it: RawItem): string {
  const icon = ICONS[it.id];
  if (icon) return icon;
  if (normalizeBalconyGrow(it.balconyGrow)) return seedsIcon;
  return "";
}

const byId = new Map<string, MammothItemDef>();
for (const it of mergeRawItems()) {
  byId.set(it.id, {
    id: it.id,
    displayName: it.displayName,
    description: it.description,
    category: it.category,
    maxStack: it.maxStack,
    meleeCombat: normalizeMeleeCombat(it.meleeCombat),
    construction: normalizeConstruction(it.construction),
    consumeOnUse: normalizeConsumeOnUse(it.consumeOnUse),
    hotbarConsumeSound: normalizeHotbarConsumeSound(it.hotbarConsumeSound),
    waterContainer: normalizeWaterContainer(it.waterContainer),
    balconyGrow: normalizeBalconyGrow(it.balconyGrow),
    balconyGrowFertilizer: it.balconyGrowFertilizer === true,
    iconUrl: resolveIconUrl(it),
  });
}

export function getMammothItemDef(defId: string): MammothItemDef | undefined {
  return byId.get(defId);
}

/** Catalog defs whose `construction` row makes them craftable — sorted for HUD picker. */
export function listMammothCraftableItemDefs(): MammothItemDef[] {
  return [...byId.values()].filter((d) => d.construction != null).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** Stack granted when one craft completes (batch ammo vs ×1 equip). */
export function mammothCraftYieldCount(def: MammothItemDef): number {
  const q = def.construction?.outputQuantity;
  return typeof q === "number" && q >= 1 ? q : 1;
}

export function getMammothHotbarInstantConsumeDefIds(): string[] {
  return [...byId.values()]
    .filter((def) => mammothItemDefSupportsHotbarInstantConsume(def))
    .map((def) => def.id)
    .sort();
}

export function isResourceDefId(defId: string): boolean {
  return getMammothItemDef(defId)?.category === "resource";
}

export function mammothItemDefIsPlantableSeed(def: MammothItemDef | undefined): boolean {
  return def?.balconyGrow != null;
}

/** Fresh harvest display name for a plantable seed/cutting def (falls back to seed label). */
export function mammothBalconyGrowHarvestDisplayName(seedDefId: string): string {
  const seed = getMammothItemDef(seedDefId);
  const harvestId = seed?.balconyGrow?.harvestDefId;
  if (!harvestId) return seed?.displayName ?? seedDefId;
  return getMammothItemDef(harvestId)?.displayName ?? harvestId;
}
