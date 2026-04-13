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

import type { ItemCategory, MammothConstruction, MammothItemDef } from "./mammothItemCatalogTypes";

export type {
  ItemCategory,
  MammothConstruction,
  MammothConstructionIngredient,
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
};

type RawShard = {
  version?: number;
  items: RawItem[];
};

const ICONS: Record<string, string> = {
  knife: knifeIcon,
  crowbar: crowbarIcon,
  srbosjek: srbosjekIcon,
  baseball_bat: baseballBatIcon,
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
    iconUrl: ICONS[it.id] ?? "",
  });
}

export function getMammothItemDef(defId: string): MammothItemDef | undefined {
  return byId.get(defId);
}

export function isMaterialDefId(defId: string): boolean {
  return getMammothItemDef(defId)?.category === "material";
}
