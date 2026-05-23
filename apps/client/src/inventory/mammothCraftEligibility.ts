import { THEME_ERROR, THEME_SUCCESS } from "@the-mammoth/ui-theme";
import { getMammothItemDef, mammothCraftYieldCount } from "./mammothItemCatalog";
import type {
  MammothConstructionIngredient,
  MammothItemDef,
} from "./mammothItemCatalogTypes";
import type { MammothPopulatedItem } from "./inventoryDragDropTypes";
import {
  formatMammothItemCategory,
  type MammothItemTooltipContentModel,
  type MammothItemTooltipStat,
} from "./mammothItemTooltipContent";

export type MammothCarrierGrids = {
  hotbar: (MammothPopulatedItem | null)[];
  inventory: (MammothPopulatedItem | null)[];
};

export const MAX_CRAFT_QUEUE_PER_PLAYER = 14;

function stackQuantity(pop: MammothPopulatedItem): number {
  const q = pop.instance.quantity;
  return typeof q === "bigint" ? Number(q) : (q ?? 0);
}

export function carrierCountForDef(grids: MammothCarrierGrids, defId: string): number {
  let n = 0;
  for (const pop of grids.hotbar) {
    if (pop?.instance.defId === defId) n += stackQuantity(pop);
  }
  for (const pop of grids.inventory) {
    if (pop?.instance.defId === defId) n += stackQuantity(pop);
  }
  return n;
}

export function aggregatedCraftMaterialTotals(
  materials: MammothConstructionIngredient[],
): [string, number][] {
  const m = new Map<string, number>();
  for (const ing of materials) {
    m.set(ing.itemId, (m.get(ing.itemId) ?? 0) + ing.quantity);
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function playerHasCraftMaterials(def: MammothItemDef, grids: MammothCarrierGrids): boolean {
  const cons = def.construction;
  if (!cons) return false;
  const mats = aggregatedCraftMaterialTotals(cons.materials);
  if (mats.length === 0) return false;
  return mats.every(([materialId, need]) => carrierCountForDef(grids, materialId) >= need);
}

export function playerHasCraftTools(def: MammothItemDef, grids: MammothCarrierGrids): boolean {
  const tools = def.construction?.requiredTools ?? [];
  if (tools.length === 0) return true;
  return tools.every((toolId) => carrierCountForDef(grids, toolId) >= 1);
}

export function canCraftItem(def: MammothItemDef, grids: MammothCarrierGrids): boolean {
  return def.construction != null && playerHasCraftMaterials(def, grids) && playerHasCraftTools(def, grids);
}

export function canEnqueueCraft(
  def: MammothItemDef,
  grids: MammothCarrierGrids,
  queueLength: number,
): boolean {
  return canCraftItem(def, grids) && queueLength < MAX_CRAFT_QUEUE_PER_PLAYER;
}

export function buildMammothQuickCraftTooltipContent(
  def: MammothItemDef,
  grids: MammothCarrierGrids,
  queueLength: number,
): MammothItemTooltipContentModel {
  const cons = def.construction;
  const stats: MammothItemTooltipStat[] = [];
  if (cons) {
    stats.push({ label: "Build time", value: `${cons.buildTimeSecs}s` });
    const yieldCount = mammothCraftYieldCount(def);
    if (yieldCount > 1) {
      stats.push({ label: "Yield", value: `×${yieldCount}` });
    }
    for (const toolId of cons.requiredTools ?? []) {
      const have = carrierCountForDef(grids, toolId) >= 1;
      const label = getMammothItemDef(toolId)?.displayName ?? toolId;
      stats.push({
        label: label,
        value: have ? "carried" : "missing",
        color: have ? THEME_SUCCESS : THEME_ERROR,
      });
    }
    for (const [materialId, need] of aggregatedCraftMaterialTotals(cons.materials)) {
      const have = carrierCountForDef(grids, materialId);
      const label = getMammothItemDef(materialId)?.displayName ?? materialId;
      stats.push({
        label,
        value: `${have}/${need}`,
        color: have >= need ? THEME_SUCCESS : THEME_ERROR,
      });
    }
  }
  if (queueLength >= MAX_CRAFT_QUEUE_PER_PLAYER) {
    stats.push({
      label: "Queue",
      value: "full",
      color: THEME_ERROR,
    });
  }
  const craftable = canEnqueueCraft(def, grids, queueLength);
  return {
    name: def.displayName,
    category: formatMammothItemCategory(def.category),
    description: craftable
      ? "Click to add to the crafting queue."
      : "Missing ingredients, tools, or queue space.",
    stats,
  };
}
