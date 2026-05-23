import { useEffect, useState, useSyncExternalStore } from "react";
import type { InventoryDragDropRulesContext } from "./inventoryDragDropHelpers";
import {
  inventorySlotAcceptsDrag,
  mammothInventorySlotUnderPoint,
} from "./inventoryDragDropHelpers";
import type { MammothDragSourceSlotInfo } from "./inventoryDragDropTypes";
import {
  getInventoryDragSession,
  getInventoryDragSessionVersion,
  subscribeInventoryDragSession,
} from "./inventoryDragSession";
import type { SlotGrids } from "./inventoryOptimistic";

export function useInventoryDragHoverSlot(
  gridsForPrediction: () => SlotGrids,
  rules: InventoryDragDropRulesContext,
  requireStashInvolvement = false,
): MammothDragSourceSlotInfo | null {
  const dragVersion = useSyncExternalStore(
    subscribeInventoryDragSession,
    getInventoryDragSessionVersion,
    getInventoryDragSessionVersion,
  );
  const [hoverSlot, setHoverSlot] = useState<MammothDragSourceSlotInfo | null>(null);

  useEffect(() => {
    const src = getInventoryDragSession();
    if (!src) {
      setHoverSlot(null);
      return;
    }

    const onMove = (ev: MouseEvent) => {
      const active = getInventoryDragSession();
      if (!active) {
        setHoverSlot(null);
        return;
      }
      const slot = mammothInventorySlotUnderPoint(ev.clientX, ev.clientY);
      if (
        !slot ||
        !inventorySlotAcceptsDrag(
          gridsForPrediction(),
          active,
          slot,
          rules,
          requireStashInvolvement,
        )
      ) {
        setHoverSlot(null);
        return;
      }
      setHoverSlot(slot);
    };

    document.addEventListener("mousemove", onMove);
    return () => {
      document.removeEventListener("mousemove", onMove);
      setHoverSlot(null);
    };
  }, [dragVersion, gridsForPrediction, rules, requireStashInvolvement]);

  return hoverSlot;
}
