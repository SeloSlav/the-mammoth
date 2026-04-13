import consumableItems from "../../../../content/items/catalog/consumables.json";
import materialItems from "../../../../content/items/catalog/materials.json";
import meleeWeapons from "../../../../content/items/catalog/melee_weapons.json";
import placeableItems from "../../../../content/items/catalog/placeables.json";
import rangedWeapons from "../../../../content/items/catalog/ranged_weapons.json";
import toolItems from "../../../../content/items/catalog/tools.json";
import baseballBatIcon from "../../../../content/references/meshy/baseball-bat-lowpoly-reference.png?url";
import crowbarIcon from "../../../../content/references/meshy/crowbar-lowpoly-reference.png?url";
import knifeIcon from "../../../../content/references/meshy/knife-lowpoly-reference.png?url";
import srbosjekIcon from "../../../../content/references/meshy/srbosjek-lowpoly-reference.png?url";

import type {
  ItemCategory,
  MammothConstruction,
  MammothConsumeOnUse,
  MammothItemDef,
} from "./mammothItemCatalogTypes";

export type {
  ItemCategory,
  MammothConstruction,
  MammothConstructionIngredient,
  MammothConsumeOnUse,
  MammothItemDef,
} from "./mammothItemCatalogTypes";

/** Keep in sync with `apps/server/src/items_catalog/load.rs` `SHARD_SOURCES`. */
const CATALOG_SHARDS = [
  materialItems,
  meleeWeapons,
  rangedWeapons,
  toolItems,
  placeableItems,
  consumableItems,
] as const;

type RawItem = {
  id: string;
  displayName: string;
  description: string;
  category: ItemCategory;
  maxStack: number;
  construction?: MammothConstruction;
  consumeOnUse?: MammothConsumeOnUse;
};

type RawShard = {
  version?: number;
  items: RawItem[];
};

/** Tiny inline SVGs until real PNGs are wired via `?url` imports (see `knife` above). */
function mammothSvgDataUrl(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const APPLE_ICON_PLACEHOLDER = mammothSvgDataUrl(
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect fill="#1e2a22" width="64" height="64"/><ellipse cx="32" cy="36" rx="16" ry="18" fill="#5ecf6a"/><ellipse cx="28" cy="32" rx="6" ry="10" fill="#8ef098" opacity="0.5"/><path d="M32 10 Q36 6 40 12" stroke="#3d2817" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`,
);
const WATER_BOTTLE_ICON_PLACEHOLDER = mammothSvgDataUrl(
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect fill="#152030" width="64" height="64"/><rect x="22" y="12" width="20" height="42" rx="6" fill="#4a90d9" opacity="0.9"/><rect x="26" y="8" width="12" height="8" rx="2" fill="#6ab0f0"/><rect x="26" y="22" width="12" height="22" fill="#87c8ff" opacity="0.35"/></svg>`,
);

const ICONS: Record<string, string> = {
  knife: knifeIcon,
  crowbar: crowbarIcon,
  srbosjek: srbosjekIcon,
  baseball_bat: baseballBatIcon,
  apple: APPLE_ICON_PLACEHOLDER,
  water_bottle: WATER_BOTTLE_ICON_PLACEHOLDER,
};

/** World pickup mesh (under `apps/client/public`). Keep aligned with weapon GLBs + catalog ids. */
const WORLD_MODELS: Record<string, string> = {
  knife: "/static/models/weapons/knife.glb",
  crowbar: "/static/models/weapons/crowbar.glb",
  srbosjek: "/static/models/weapons/srbosjek.glb",
  baseball_bat: "/static/models/weapons/baseball_bat.glb",
};

export function getMammothDroppedWorldModelUrl(defId: string): string | undefined {
  return WORLD_MODELS[defId];
}

function normalizeConsumeOnUse(raw?: MammothConsumeOnUse): MammothConsumeOnUse | null {
  if (!raw) return null;
  const h = raw.healthDelta ?? 0;
  const hu = raw.hungerDelta ?? 0;
  const hy = raw.hydrationDelta ?? 0;
  if (h === 0 && hu === 0 && hy === 0) return null;
  return { ...raw };
}

/** `true` when catalog says instant hotbar consume is defined (category consumable + non-zero `consumeOnUse`). */
export function mammothItemDefSupportsHotbarInstantConsume(def: MammothItemDef | undefined): boolean {
  if (!def || def.category !== "consumable") return false;
  return def.consumeOnUse !== null;
}

function mergeRawItems(): RawItem[] {
  const out: RawItem[] = [];
  for (const shard of CATALOG_SHARDS) {
    const s = shard as RawShard;
    out.push(...s.items);
  }
  return out;
}

const byId = new Map<string, MammothItemDef>();
for (const it of mergeRawItems()) {
  byId.set(it.id, {
    id: it.id,
    displayName: it.displayName,
    description: it.description,
    category: it.category,
    maxStack: it.maxStack,
    construction: it.construction ?? null,
    consumeOnUse: normalizeConsumeOnUse(it.consumeOnUse),
    iconUrl: ICONS[it.id] ?? "",
  });
}

export function getMammothItemDef(defId: string): MammothItemDef | undefined {
  return byId.get(defId);
}

export function isMaterialDefId(defId: string): boolean {
  return getMammothItemDef(defId)?.category === "material";
}
