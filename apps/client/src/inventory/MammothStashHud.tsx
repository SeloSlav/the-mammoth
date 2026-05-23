import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  apartmentStashHudGridCols,
  apartmentStashHudSections,
} from "@the-mammoth/schemas";
import {
  THEME_ACCENT,
  THEME_CARD_BORDER_STRONG,
  THEME_DIVIDER,
  THEME_TEXT_FAINT,
  THEME_TEXT_MUTED,
  THEME_TEXT_PRIMARY,
} from "@the-mammoth/ui-theme";
import type { DbConnection } from "../module_bindings";
import type { ApartmentStashKind } from "../game/fpApartment/fpApartmentStashKey";
import type {
  MammothDragSourceSlotInfo,
  MammothDraggedItemInfo,
  MammothDropResult,
  MammothPopulatedItem,
} from "./inventoryDragDropTypes";
import { destPlayerCarrySlotForQuickTransfer, type MammothPlayerCarrySlot } from "./inventoryQuickTransfer";
import { evaluateInventoryDrop, type InventoryDragDropRulesContext } from "./inventoryDragDropHelpers";
import { beginInventoryDrag, endInventoryDrag } from "./inventoryDragSession";
import { playInventoryItemDragDropSound } from "./inventoryDragUiSound";
import { useInventoryDragHoverSlot } from "./useInventoryDragHoverSlot";
import {
  inventorySlotGridsMatch,
  inventorySlotGridsSemanticallyMatch,
  predictSlotMove,
  type SlotGrids,
} from "./inventoryOptimistic";
import {
  apartmentStashMoveFailureHint,
  apartmentStashRejectionHint,
  reportApartmentStashRejection,
} from "./apartmentStashInventoryRules";
import { showGameplayErrorBar } from "../ui/gameplayErrorBar";
import { MammothDraggableItem } from "./MammothDraggableItem";
import { MammothHudPanel, MAMMOTH_HUD_PANEL_WIDTH_PX } from "./MammothHudPanel";
import { MammothItemIcon } from "./MammothItemIcon";
import { MammothDroppableSlot } from "./MammothDroppableSlot";
import { MammothItemTooltip } from "./MammothItemTooltip";
import { APARTMENT_STASH_KIND_FRIDGE } from "../game/fpApartment/fpApartmentStashKey";
import {
  buildMammothItemTooltipContent,
  type MammothItemTooltipContentModel,
} from "./mammothItemTooltipContent";
import { APARTMENT_STASH_KIND_GROW_TRAY, APARTMENT_STASH_KIND_WATER_TANK } from "../game/fpApartment/fpApartmentStashKey";
import { parseApartmentStashKeyFull } from "../game/fpApartment/fpApartmentStashKey";
import { useApartmentWaterTankLiters, useWaterBottleFillVersion } from "./useWaterContainerState";
import {
  APARTMENT_WATER_TANK_CAPACITY_L,
  mammothItemDefSupportsHotbarWaterDrink,
  waterBottleFillFraction,
} from "./waterContainerHelpers";
import { WaterBottleHotbarFillBar } from "./WaterBottleHotbarFillBar";
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
    quickMoveStashToPlayerCarry: (pop: MammothPopulatedItem, fromStashIndex: number) => void;
    openItemTooltipForSlot: (
      slotInfo: MammothDragSourceSlotInfo,
      pop: MammothPopulatedItem,
      e: ReactMouseEvent,
    ) => void;
    updateTooltipPositionFromHoverEvent: (e: ReactMouseEvent) => void;
    hideItemTooltip: () => void;
    slotInner: (pop: MammothPopulatedItem | null) => ReactNode;
    isDragHoverSlot: (slot: MammothDragSourceSlotInfo) => boolean;
  },
) {
  const slotInfo = { type: "stash" as const, index: slotIndex };
  return (
    <MammothDroppableSlot
      key={`stash-${slotIndex}`}
      slotInfo={slotInfo}
      isDraggingOver={opts.isDragHoverSlot(slotInfo)}
    >
      {pop ? (
        <MammothDraggableItem
          key={String(opts.toInstanceId(pop))}
          item={pop}
          sourceSlot={slotInfo}
          onDragStart={opts.handleDragStart}
          onDrop={opts.handleDrop}
          onItemContextMenu={() => opts.quickMoveStashToPlayerCarry(pop, slotIndex)}
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
  const unitKey = useMemo(() => parseApartmentStashKeyFull(stashKey).unitKey, [stashKey]);
  const tankLiters = useApartmentWaterTankLiters(conn, stashKind === APARTMENT_STASH_KIND_WATER_TANK ? unitKey : null);
  const waterFillVer = useWaterBottleFillVersion(conn);
  void waterFillVer;
  const baseSlots = useMemo<SlotGrids>(
    () => ({ ...playerSlots, stash }),
    [playerSlots, stash],
  );
  const [optimisticSlots, setOptimisticSlots] = useState<SlotGrids | null>(null);
  const displaySlots = optimisticSlots ?? baseSlots;
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
    if (
      inventorySlotGridsMatch(optimisticSlots, baseSlots) ||
      inventorySlotGridsSemanticallyMatch(optimisticSlots, baseSlots)
    ) {
      setOptimisticSlots(null);
    }
  }, [baseSlots, optimisticSlots]);

  useEffect(() => {
    if (!optimisticSlots) return;
    const id = window.setTimeout(() => {
      if (!optimisticSlotsRef.current) return;
      if (
        inventorySlotGridsMatch(optimisticSlotsRef.current, baseSlotsRef.current) ||
        inventorySlotGridsSemanticallyMatch(optimisticSlotsRef.current, baseSlotsRef.current)
      ) {
        return;
      }
      setOptimisticSlots(null);
      showGameplayErrorBar(apartmentStashMoveFailureHint(stashKind));
    }, 900);
    return () => window.clearTimeout(id);
  }, [optimisticSlots, baseSlots]);

  const gridsForPrediction = useCallback(
    () => optimisticSlotsRef.current ?? baseSlotsRef.current,
    [],
  );

  const dragDropRules = useMemo(
    (): InventoryDragDropRulesContext => ({
      conn,
      activeStash: { stashKey, stashLabel, stashKind },
      openStash: { stashKey, stashKind },
    }),
    [conn, stashKey, stashKind, stashLabel],
  );
  const dragHoverSlot = useInventoryDragHoverSlot(gridsForPrediction, dragDropRules, true);
  const isDragHoverSlot = useCallback(
    (slot: MammothDragSourceSlotInfo) =>
      dragHoverSlot?.type === slot.type && dragHoverSlot.index === slot.index,
    [dragHoverSlot],
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
    beginInventoryDrag(info);
  }, []);

  const quickMoveStashToPlayerCarry = useCallback(
    (pop: MammothPopulatedItem, fromStashIndex: number) => {
      if (document.body.classList.contains("item-dragging")) return;
      const g = gridsForPrediction();
      const dest: MammothPlayerCarrySlot = destPlayerCarrySlotForQuickTransfer(
        g.hotbar,
        g.inventory,
        pop,
      );
      const predicted = predictSlotMove(
        g,
        { type: "stash", index: fromStashIndex },
        dest,
      );
      if (predicted) setOptimisticSlots(predicted);
      try {
        if (dest.type === "hotbar") {
          void conn.reducers.stashPullItemToHotbarSlot({
            itemInstanceId: toInstanceId(pop),
            unitKey: stashKey,
            targetHotbarSlot: dest.index,
            quantityToMove: 0,
          });
        } else {
          void conn.reducers.stashPullItemToInventorySlot({
            itemInstanceId: toInstanceId(pop),
            unitKey: stashKey,
            targetInventorySlot: dest.index,
            quantityToMove: 0,
          });
        }
      } catch (err) {
        console.warn("[MammothStashHud] quick move to player carry failed", err);
      }
    },
    [conn, gridsForPrediction, toInstanceId, stashKey],
  );

  const handleDrop = useCallback(
    (result: MammothDropResult) => {
      const src = endInventoryDrag();
      document.body.classList.remove("item-dragging");
      if (!src || result.kind !== "slot") return;

      const evaluation = evaluateInventoryDrop({
        grids: gridsForPrediction(),
        src,
        result,
        rules: dragDropRules,
        requireStashInvolvement: true,
      });

      if (evaluation.kind === "cancel" || evaluation.kind === "noop") return;
      if (evaluation.kind === "rejectStash") {
        reportApartmentStashRejection(evaluation.stashKind);
        return;
      }
      if (evaluation.kind === "world") return;

      playInventoryItemDragDropSound();

      const id = src.item.instance.instanceId;
      const instanceId = typeof id === "bigint" ? id : BigInt(id as number);
      const target = evaluation.target;

      setOptimisticSlots(evaluation.predicted);

      try {
        if (target.type === "stash" && src.sourceSlot.type === "stash") {
          void conn.reducers.stashMoveItemToSlot({
            itemInstanceId: instanceId,
            unitKey: stashKey,
            targetStashSlot: target.index,
            quantityToMove: evaluation.quantityToMove,
          });
        } else if (target.type === "stash") {
          void conn.reducers.stashPushItemToSlot({
            itemInstanceId: instanceId,
            unitKey: stashKey,
            targetStashSlot: target.index,
            quantityToMove: evaluation.quantityToMove,
          });
        } else if (target.type === "inventory") {
          void conn.reducers.stashPullItemToInventorySlot({
            itemInstanceId: instanceId,
            unitKey: stashKey,
            targetInventorySlot: target.index,
            quantityToMove: evaluation.quantityToMove,
          });
        } else {
          void conn.reducers.stashPullItemToHotbarSlot({
            itemInstanceId: instanceId,
            unitKey: stashKey,
            targetHotbarSlot: target.index,
            quantityToMove: evaluation.quantityToMove,
          });
        }
      } catch (err) {
        console.warn("[MammothStashHud] drop/move failed", err);
      }
    },
    [conn, dragDropRules, gridsForPrediction, stashKey],
  );

  const slotInner = (pop: MammothPopulatedItem | null) => {
    if (!pop) return null;
    const waterFill =
      mammothItemDefSupportsHotbarWaterDrink(pop.def) && pop.def.waterContainer
        ? waterBottleFillFraction(
            conn,
            pop.instance.instanceId,
            pop.def.waterContainer.capacityLiters,
          )
        : null;
    return (
      <div style={{ position: "relative", width: 44, height: 44, margin: "auto" }}>
        {waterFill != null ? <WaterBottleHotbarFillBar fillFraction={waterFill} /> : null}
        <MammothItemIcon def={pop.def} size={44} style={NO_SELECT} />
      </div>
    );
  };

  const tankBottle = displaySlots.stash?.[0] ?? null;
  const tankBottleNeedsFill =
    tankBottle?.def.waterContainer != null &&
    waterBottleFillFraction(
      conn,
      tankBottle.instance.instanceId,
      tankBottle.def.waterContainer.capacityLiters,
    ) < 0.999;
  const canFillBottle =
    stashKind === APARTMENT_STASH_KIND_WATER_TANK &&
    tankBottle != null &&
    tankBottleNeedsFill &&
    tankLiters > 0.001;

  const onFillBottleAtTank = useCallback(() => {
    try {
      void conn.reducers.fillWaterBottleAtTank({ unitKey: stashKey });
    } catch (err) {
      console.warn("[MammothStashHud] fillWaterBottleAtTank failed", err);
    }
  }, [conn, stashKey]);

  const slotRenderOpts = {
    toInstanceId,
    handleDragStart,
    handleDrop,
    quickMoveStashToPlayerCarry,
    openItemTooltipForSlot,
    updateTooltipPositionFromHoverEvent,
    hideItemTooltip,
    slotInner,
    isDragHoverSlot,
  };

  const subtitle = useMemo(() => {
    const ruleHint =
      stashKind === "footlocker"
        ? "General storage — any item."
        : apartmentStashRejectionHint(stashKind);
    return `Drag items in or out. ${ruleHint} Right-click to quick-transfer.`;
  }, [stashKind]);

  /**
   * Grids are always centered inside the panel content area so smaller stashes (water tank,
   * grow tray, wardrobe, stove) don't sit off-center against the symmetric panel chrome.
   */
  const slotGridStyle: CSSProperties = {
    display: "grid",
    gap: 6,
    justifyContent: "center",
  };

  const titleText = `${stashLabel[0]!.toUpperCase()}${stashLabel.slice(1)}`;
  /** Fridge has 7 columns; the default panel width fits at most 6 × 52px. */
  const panelWidthPx =
    stashKind === APARTMENT_STASH_KIND_FRIDGE ? 440 : MAMMOTH_HUD_PANEL_WIDTH_PX;

  return (
    <>
      <div
        style={{
          position: "fixed",
          left: "calc(50% + 8px)",
          top: "50%",
          transform: "translate(0, -50%)",
          zIndex: 121,
          pointerEvents: "auto",
        }}
      >
        <MammothHudPanel
          title={titleText}
          subtitle={subtitle}
          testid="mammoth-stash-panel"
          widthPx={panelWidthPx}
          onContextMenu={blockBrowserContextMenu}
        >
          {stashKind === APARTMENT_STASH_KIND_GROW_TRAY ? (
            <GrowTrayDescription />
          ) : null}

          {stashKind === APARTMENT_STASH_KIND_WATER_TANK ? (
            <WaterTankReadout
              tankLiters={tankLiters}
              canFillBottle={canFillBottle}
              onFillBottleAtTank={onFillBottleAtTank}
            />
          ) : null}

          {stoveSections ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {stoveSections.map((section) => (
                <div key={section.label}>
                  <div
                    style={{
                      fontSize: 10,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: THEME_TEXT_FAINT,
                      marginBottom: 6,
                      fontWeight: 600,
                      textAlign: "center",
                    }}
                  >
                    {section.label}
                  </div>
                  <div
                    style={{ ...slotGridStyle, gridTemplateColumns: `repeat(${section.cols}, 52px)` }}
                  >
                    {section.slotIndices.map((slotIndex) =>
                      renderStashSlot(
                        slotIndex,
                        displaySlots.stash?.[slotIndex] ?? null,
                        slotRenderOpts,
                      ),
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
        </MammothHudPanel>
      </div>

      {createPortal(
        <MammothItemTooltip
          visible={itemTooltip.visible}
          content={itemTooltip.content}
          position={itemTooltip.position}
        />,
        document.body,
      )}
    </>
  );
}

/** Grow tray sub-readout: explains the fertilizer slot behavior. */
function GrowTrayDescription() {
  return (
    <div
      style={{
        marginBottom: 14,
        padding: "10px 12px",
        borderRadius: 8,
        border: `1px solid ${THEME_CARD_BORDER_STRONG}`,
        background: "rgba(255,255,255,0.025)",
        fontSize: 11.5,
        lineHeight: 1.5,
        color: THEME_TEXT_MUTED,
      }}
    >
      Drop tray compost here before sleep. If this slot holds compost when you sleep,{" "}
      <strong style={{ color: THEME_TEXT_PRIMARY, fontWeight: 600 }}>one unit is consumed</strong>{" "}
      and all four growing slots in this tray get faster nights and better harvest rolls. Water the
      tray before sleep; grow lights must be on overnight.
    </div>
  );
}

/** Water tank sub-readout: tank level bar + fill-bottle action. */
function WaterTankReadout({
  tankLiters,
  canFillBottle,
  onFillBottleAtTank,
}: {
  tankLiters: number;
  canFillBottle: boolean;
  onFillBottleAtTank: () => void;
}) {
  const pct = Math.min(100, (tankLiters / APARTMENT_WATER_TANK_CAPACITY_L) * 100);
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          fontSize: 11,
          color: THEME_TEXT_MUTED,
          marginBottom: 6,
        }}
      >
        <span
          style={{
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: THEME_TEXT_FAINT,
            fontWeight: 600,
          }}
        >
          Tank
        </span>
        <span style={{ fontVariantNumeric: "tabular-nums", color: THEME_TEXT_PRIMARY }}>
          {tankLiters.toFixed(1)} / {APARTMENT_WATER_TANK_CAPACITY_L} L
        </span>
      </div>
      <div
        style={{
          height: 8,
          borderRadius: 4,
          background: "rgba(0,0,0,0.4)",
          border: `1px solid ${THEME_DIVIDER}`,
          overflow: "hidden",
          marginBottom: 12,
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: "linear-gradient(90deg, rgba(46,116,170,0.9), rgba(120,180,225,0.95))",
            transition: "width 200ms ease-out",
          }}
        />
      </div>
      <button
        type="button"
        disabled={!canFillBottle}
        onClick={onFillBottleAtTank}
        style={{
          width: "100%",
          padding: "8px 10px",
          borderRadius: 8,
          border: `1px solid ${canFillBottle ? THEME_ACCENT : THEME_CARD_BORDER_STRONG}`,
          background: canFillBottle ? THEME_ACCENT : "rgba(255,255,255,0.04)",
          color: canFillBottle ? "#0f1218" : THEME_TEXT_FAINT,
          cursor: canFillBottle ? "pointer" : "not-allowed",
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.02em",
          transition: "background 120ms ease-out, border-color 120ms ease-out",
        }}
      >
        Fill bottle
      </button>
    </div>
  );
}