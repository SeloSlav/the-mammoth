import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  apartmentStashHudGridCols,
  apartmentStashHudSections,
} from "@the-mammoth/schemas";
import type { DbConnection } from "../module_bindings";
import type { ApartmentStashKind } from "../game/fpApartment/fpApartmentStashKey";
import type {
  MammothDragSourceSlotInfo,
  MammothDraggedItemInfo,
  MammothDropResult,
  MammothPopulatedItem,
} from "./inventoryDragDropTypes";
import { destIndexForQuickTransfer } from "./inventoryQuickTransfer";
import {
  inventorySlotGridsMatch,
  predictSlotMove,
  type SlotGrids,
} from "./inventoryOptimistic";
import {
  apartmentStashRejectionHint,
  isApartmentStashSlotIndexValid,
  mammothItemAllowedInApartmentStash,
} from "./apartmentStashInventoryRules";
import { MammothDraggableItem } from "./MammothDraggableItem";
import { MammothDroppableSlot } from "./MammothDroppableSlot";
import { MammothItemTooltip } from "./MammothItemTooltip";
import {
  buildMammothItemTooltipContent,
  type MammothItemTooltipContentModel,
} from "./mammothItemTooltipContent";
import { useMammothInventory, useMammothStash } from "./useMammothInventory";

type Props = {
  conn: DbConnection;
  stashKey: string;
  stashLabel: string;
  stashKind: ApartmentStashKind;
};

const NO_SELECT: CSSProperties = {
  userSelect: "none",
  WebkitUserSelect: "none",
  MozUserSelect: "none",
  msUserSelect: "none",
};

function renderStashSlot(
  slotIndex: number,
  pop: MammothPopulatedItem | null,
  opts: {
    toInstanceId: (pop: MammothPopulatedItem) => bigint;
    handleDragStart: (info: MammothDraggedItemInfo) => void;
    handleDrop: (result: MammothDropResult) => void;
    quickMoveStashToInventory: (pop: MammothPopulatedItem, fromStashIndex: number) => void;
    openItemTooltipForSlot: (
      slotInfo: MammothDragSourceSlotInfo,
      pop: MammothPopulatedItem,
      e: ReactMouseEvent,
    ) => void;
    updateTooltipPositionFromHoverEvent: (e: ReactMouseEvent) => void;
    hideItemTooltip: () => void;
    slotInner: (pop: MammothPopulatedItem | null) => ReactNode;
  },
) {
  const slotInfo = { type: "stash" as const, index: slotIndex };
  return (
    <MammothDroppableSlot key={`stash-${slotIndex}`} slotInfo={slotInfo}>
      {pop ? (
        <MammothDraggableItem
          key={String(opts.toInstanceId(pop))}
          item={pop}
          sourceSlot={slotInfo}
          onDragStart={opts.handleDragStart}
          onDrop={opts.handleDrop}
          onItemContextMenu={() => opts.quickMoveStashToInventory(pop, slotIndex)}
          slotHover={{
            onEnter: (e) => opts.openItemTooltipForSlot(slotInfo, pop, e),
            onMove: opts.updateTooltipPositionFromHoverEvent,
            onLeave: opts.hideItemTooltip,
          }}
        >
          {opts.slotInner(pop)}
        </MammothDraggableItem>
      ) : null}
    </MammothDroppableSlot>
  );
}

/** Slot-based storage for one apartment object (wardrobe, footlocker, stove, fridge). */
export function MammothStashHud({ conn, stashKey, stashLabel, stashKind }: Props) {
  const playerSlots = useMammothInventory(conn);
  const stash = useMammothStash(conn, stashKey, stashKind);
  const baseSlots = useMemo<SlotGrids>(
    () => ({ ...playerSlots, stash }),
    [playerSlots, stash],
  );
  const [optimisticSlots, setOptimisticSlots] = useState<SlotGrids | null>(null);
  const displaySlots = optimisticSlots ?? baseSlots;
  const dragRef = useRef<MammothDraggedItemInfo | null>(null);
  const baseSlotsRef = useRef(baseSlots);
  const optimisticSlotsRef = useRef<SlotGrids | null>(null);
  baseSlotsRef.current = baseSlots;
  optimisticSlotsRef.current = optimisticSlots;

  const stoveSections = useMemo(() => apartmentStashHudSections(stashKind), [stashKind]);
  const gridCols = useMemo(() => apartmentStashHudGridCols(stashKind), [stashKind]);

  const [itemTooltip, setItemTooltip] = useState<{
    visible: boolean;
    content: MammothItemTooltipContentModel | null;
    position: { x: number; y: number };
  }>({ visible: false, content: null, position: { x: 0, y: 0 } });
  const hoveredTooltipSlotRef = useRef<MammothDragSourceSlotInfo | null>(null);

  useEffect(() => {
    if (!optimisticSlots) return;
    if (inventorySlotGridsMatch(optimisticSlots, baseSlots)) {
      setOptimisticSlots(null);
    }
  }, [baseSlots, optimisticSlots]);

  const gridsForPrediction = useCallback(
    () => optimisticSlotsRef.current ?? baseSlotsRef.current,
    [],
  );

  const hideItemTooltip = useCallback(() => {
    hoveredTooltipSlotRef.current = null;
    setItemTooltip({ visible: false, content: null, position: { x: 0, y: 0 } });
  }, []);

  const updateTooltipPositionFromHoverEvent = useCallback((e: ReactMouseEvent) => {
    const slotEl = e.currentTarget.closest("[data-slot-type]") as HTMLElement | null;
    if (!slotEl) return;
    const rect = slotEl.getBoundingClientRect();
    setItemTooltip((prev) =>
      prev.visible
        ? {
            ...prev,
            position: { x: rect.left - 10, y: rect.top + rect.height / 2 },
          }
        : prev,
    );
  }, []);

  const openItemTooltipForSlot = useCallback(
    (slotInfo: MammothDragSourceSlotInfo, pop: MammothPopulatedItem, e: ReactMouseEvent) => {
      const slotEl = e.currentTarget.closest("[data-slot-type]") as HTMLElement | null;
      if (!slotEl) return;
      const rect = slotEl.getBoundingClientRect();
      hoveredTooltipSlotRef.current = slotInfo;
      setItemTooltip({
        visible: true,
        content: buildMammothItemTooltipContent(pop),
        position: { x: rect.left - 10, y: rect.top + rect.height / 2 },
      });
    },
    [],
  );

  useEffect(() => {
    if (!itemTooltip.visible || !hoveredTooltipSlotRef.current) return;
    const slot = hoveredTooltipSlotRef.current;
    const pop = slot.type === "stash" ? (displaySlots.stash?.[slot.index] ?? null) : null;
    if (!pop) {
      hideItemTooltip();
      return;
    }
    setItemTooltip((prev) => ({
      ...prev,
      content: buildMammothItemTooltipContent(pop),
    }));
  }, [displaySlots, hideItemTooltip, itemTooltip.visible]);

  const toInstanceId = useCallback((pop: MammothPopulatedItem) => {
    const id = pop.instance.instanceId;
    return typeof id === "bigint" ? id : BigInt(id as number);
  }, []);

  const blockBrowserContextMenu = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
  }, []);

  const handleDragStart = useCallback((info: MammothDraggedItemInfo) => {
    dragRef.current = info;
  }, []);

  const canAcceptItemInStash = useCallback(
    (item: MammothPopulatedItem, targetSlotIndex: number) => {
      if (!isApartmentStashSlotIndexValid(stashKind, targetSlotIndex)) return false;
      if (dragRef.current?.sourceSlot.type === "stash") return true;
      return mammothItemAllowedInApartmentStash(stashKind, item.def);
    },
    [stashKind],
  );

  const quickMoveStashToInventory = useCallback(
    (pop: MammothPopulatedItem, fromStashIndex: number) => {
      if (document.body.classList.contains("item-dragging")) return;
      const g = gridsForPrediction();
      const destIndex = destIndexForQuickTransfer(g.inventory, pop);
      const predicted = predictSlotMove(
        g,
        { type: "stash", index: fromStashIndex },
        { type: "inventory", index: destIndex },
      );
      if (predicted) setOptimisticSlots(predicted);
      try {
        void conn.reducers.stashPullItemToInventorySlot({
          itemInstanceId: toInstanceId(pop),
          unitKey: stashKey,
          targetInventorySlot: destIndex,
        });
      } catch (err) {
        console.warn("[MammothStashHud] quick move to inventory failed", err);
      }
    },
    [conn, gridsForPrediction, toInstanceId, stashKey],
  );

  const handleDrop = useCallback(
    (result: MammothDropResult) => {
      const src = dragRef.current;
      dragRef.current = null;
      document.body.classList.remove("item-dragging");
      if (!src || result.kind !== "slot") return;

      const target = result.slot;
      if (target.type !== "stash" && src.sourceSlot.type !== "stash") return;

      if (target.type === "stash" && !canAcceptItemInStash(src.item, target.index)) {
        console.warn("[MammothStashHud]", apartmentStashRejectionHint(stashKind));
        return;
      }

      const id = src.item.instance.instanceId;
      const instanceId = typeof id === "bigint" ? id : BigInt(id as number);
      const predicted = predictSlotMove(gridsForPrediction(), src.sourceSlot, target);
      if (predicted) setOptimisticSlots(predicted);

      try {
        if (target.type === "stash" && src.sourceSlot.type === "stash") {
          void conn.reducers.stashMoveItemToSlot({
            itemInstanceId: instanceId,
            unitKey: stashKey,
            targetStashSlot: target.index,
          });
        } else if (target.type === "stash") {
          void conn.reducers.stashPushItemToSlot({
            itemInstanceId: instanceId,
            unitKey: stashKey,
            targetStashSlot: target.index,
          });
        } else if (target.type === "inventory") {
          void conn.reducers.stashPullItemToInventorySlot({
            itemInstanceId: instanceId,
            unitKey: stashKey,
            targetInventorySlot: target.index,
          });
        } else {
          void conn.reducers.stashPullItemToHotbarSlot({
            itemInstanceId: instanceId,
            unitKey: stashKey,
            targetHotbarSlot: target.index,
          });
        }
      } catch (err) {
        console.warn("[MammothStashHud] drop/move failed", err);
      }
    },
    [canAcceptItemInStash, conn, gridsForPrediction, stashKey, stashKind],
  );

  const slotInner = (pop: MammothPopulatedItem | null) => {
    if (!pop) return null;
    return (
      <img
        src={pop.def.iconUrl}
        alt={pop.def.displayName}
        draggable={false}
        style={{
          width: 44,
          height: 44,
          objectFit: "contain",
          display: "block",
          margin: "auto",
          pointerEvents: "none",
          ...NO_SELECT,
        }}
      />
    );
  };

  const slotRenderOpts = {
    toInstanceId,
    handleDragStart,
    handleDrop,
    quickMoveStashToInventory,
    openItemTooltipForSlot,
    updateTooltipPositionFromHoverEvent,
    hideItemTooltip,
    slotInner,
  };

  const rulesHint =
    stashKind === "footlocker"
      ? "General storage — any item."
      : apartmentStashRejectionHint(stashKind);

  const slotGridStyle: CSSProperties = {
    display: "grid",
    gap: 6,
  };

  return (
    <div
      onContextMenu={blockBrowserContextMenu}
      onDragStart={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        right: 18,
        top: "50%",
        transform: "translateY(-50%)",
        padding: 12,
        borderRadius: 10,
        background: "linear-gradient(160deg, rgba(34,28,20,0.96), rgba(12,10,8,0.98))",
        border: "1px solid rgba(255,210,140,0.35)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.55)",
        color: "#dfe6f5",
        fontSize: 13,
        minWidth: 360,
        zIndex: 121,
        pointerEvents: "auto",
        ...NO_SELECT,
      }}
      data-testid="mammoth-stash-panel"
    >
      <div style={{ color: "#f2d39a", fontSize: 12, marginBottom: 4 }}>{`${stashLabel[0]!.toUpperCase()}${stashLabel.slice(1)}`}</div>
      <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 8 }}>
        Drag items in/out. {rulesHint} Tab, Esc, or E to close.
      </div>

      {stoveSections ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {stoveSections.map((section) => (
            <div key={section.label}>
              <div style={{ fontSize: 11, color: "#c9b896", marginBottom: 6 }}>{section.label}</div>
              <div style={{ ...slotGridStyle, gridTemplateColumns: `repeat(${section.cols}, 52px)` }}>
                {section.slotIndices.map((slotIndex) =>
                  renderStashSlot(slotIndex, displaySlots.stash?.[slotIndex] ?? null, slotRenderOpts),
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ ...slotGridStyle, gridTemplateColumns: `repeat(${gridCols}, 52px)` }}>
          {(displaySlots.stash ?? []).map((pop, slotIndex) =>
            renderStashSlot(slotIndex, pop, slotRenderOpts),
          )}
        </div>
      )}

      {createPortal(
        <MammothItemTooltip
          visible={itemTooltip.visible}
          content={itemTooltip.content}
          position={itemTooltip.position}
        />,
        document.body,
      )}
    </div>
  );
}