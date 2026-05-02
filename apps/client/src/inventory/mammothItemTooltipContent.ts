import type { MammothPopulatedItem } from "./inventoryDragDropTypes";
import type { ItemCategory } from "./mammothItemCatalogTypes";
import { getMammothItemDef, mammothCraftYieldCount } from "./mammothItemCatalog";
import { THEME_ERROR, THEME_SUCCESS } from "@the-mammoth/ui-theme";

export type MammothItemTooltipStat = {
  label: string;
  value: string | number;
  color?: string;
};

export type MammothItemTooltipContentModel = {
  name: string;
  description?: string;
  category?: string;
  stats?: MammothItemTooltipStat[];
};

/** Same idea as vibe `Tooltip.tsx` `formatCategoryName`. */
export function formatMammothItemCategory(category: ItemCategory): string {
  const raw = category.replace(/_/g, " ");
  return raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

function deltaColor(delta: number): string | undefined {
  if (delta === 0) return undefined;
  return delta > 0 ? THEME_SUCCESS : THEME_ERROR;
}

/**
 * Tooltip payload for HUD inventory / hotbar — name, optional flavor text, category, stat rows.
 */
export function buildMammothItemTooltipContent(pop: MammothPopulatedItem): MammothItemTooltipContentModel {
  const { def, instance } = pop;
  const stats: MammothItemTooltipStat[] = [];

  stats.push({
    label: "Quantity",
    value: instance.quantity,
  });

  if (def.maxStack > 1) {
    stats.push({
      label: "Max stack",
      value: def.maxStack,
    });
  }

  if (def.meleeCombat) {
    stats.push({
      label: "Damage",
      value: def.meleeCombat.damage,
    });
  }

  if (def.consumeOnUse) {
    const c = def.consumeOnUse;
    const h = c.healthDelta ?? 0;
    const hu = c.hungerDelta ?? 0;
    const hy = c.hydrationDelta ?? 0;
    if (h !== 0) {
      stats.push({
        label: "Health",
        value: h > 0 ? `+${h}` : String(h),
        color: deltaColor(h),
      });
    }
    if (hu !== 0) {
      stats.push({
        label: "Hunger",
        value: hu > 0 ? `+${hu}` : String(hu),
        color: deltaColor(hu),
      });
    }
    if (hy !== 0) {
      stats.push({
        label: "Hydration",
        value: hy > 0 ? `+${hy}` : String(hy),
        color: deltaColor(hy),
      });
    }
  }

  if (def.construction) {
    const { buildTimeSecs, materials, requiredTools } = def.construction;
    stats.push({
      label: "Build time",
      value: `${buildTimeSecs}s`,
    });
    const y = mammothCraftYieldCount(def);
    if (y > 1) {
      stats.push({ label: "Craft yield", value: `×${y}` });
    }
    const tools = requiredTools ?? [];
    if (tools.length > 0) {
      const labels = tools.map((id) => getMammothItemDef(id)?.displayName ?? id).join(", ");
      stats.push({ label: "Requires carried", value: labels });
    }
    if (materials.length > 0) {
      stats.push({
        label: "Recipe",
        value: `${materials.length} ingredient${materials.length === 1 ? "" : "s"}`,
      });
    }
  }

  const description =
    def.description && def.description.trim().length > 0 ? def.description.trim() : undefined;

  return {
    name: def.displayName,
    category: formatMammothItemCategory(def.category),
    ...(description ? { description } : {}),
    stats,
  };
}
