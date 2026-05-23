import type { MouseEvent as ReactMouseEvent } from "react";
import type { MammothDragSourceSlotInfo, MammothPopulatedItem } from "./inventoryDragDropTypes";
import { useMammothHotLoot } from "./MammothHotLootContext";
import type { MammothHotLootContext } from "./mammothHotLootSlotKey";

type TooltipHoverHandlers = {
  onEnter: (e: ReactMouseEvent) => void;
  onMove: (e: ReactMouseEvent) => void;
  onLeave: () => void;
};

/** Compose tooltip hover handlers with hold-H hot loot sweep. */
export function useMammothHotLootSlotHover(
  pop: MammothPopulatedItem | null,
  slotInfo: MammothDragSourceSlotInfo,
  context: MammothHotLootContext,
  tooltip: TooltipHoverHandlers,
): TooltipHoverHandlers {
  const hotLoot = useMammothHotLoot();

  return {
    onEnter: (e) => {
      tooltip.onEnter(e);
      if (pop) {
        hotLoot.handleSlotHover(pop, slotInfo, context);
      } else {
        hotLoot.setCurrentHover(null, slotInfo, context);
      }
    },
    onMove: tooltip.onMove,
    onLeave: () => {
      tooltip.onLeave();
      hotLoot.setCurrentHover(null, null, null);
    },
  };
}

export function useMammothHotLootSlotChrome(
  pop: MammothPopulatedItem | null,
  slotInfo: MammothDragSourceSlotInfo,
) {
  const hotLoot = useMammothHotLoot();
  const indicator = hotLoot.getSlotIndicator(slotInfo);
  return {
    hotLootActive: hotLoot.enabled && hotLoot.isHotLootActive && pop != null,
    hotLootProgress: indicator?.progress,
  };
}

export function mammothHotLootSubtitle(active: boolean): string {
  if (!active) return "";
  return " Hold H and sweep slots to quick-transfer.";
}

export function mammothHotLootActiveLabel(active: boolean): string | null {
  if (!active) return null;
  return "⚡ HOT LOOT — hold H, sweep slots ⚡";
}
