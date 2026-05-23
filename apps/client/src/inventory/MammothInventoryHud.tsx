import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import {
  THEME_ACCENT,
  THEME_CARD_BG_STRONG,
  THEME_CARD_BORDER_STRONG,
  THEME_PANEL_SHADOW,
  THEME_TEXT_FAINT,
  UI_FONT_SANS,
} from "@the-mammoth/ui-theme";
import type { DbConnection } from "../module_bindings";
import { hotbarSlotHasHotbarUseAction } from "../game/fpHotbar/fpHotbarActivate";
import { runFpHotbarInstantConsume } from "../game/fpHotbar/fpHotbarConsume";
import { primeHotbarConsumeAudio } from "../game/fpHotbar/hotbarConsumeLocalAudio";
import { getHotbarSlotInventoryItem } from "../game/fpHotbar/fpHotbarResolve";
import {
  getHotbarInstantConsumeCooldownVersion,
  hotbarInstantConsumeCooldownProgress,
  subscribeHotbarInstantConsumeCooldown,
} from "../game/fpHotbar/fpHotbarInstantConsumeCooldown";
import {
  closeApartmentStashAndInventory,
  setFpActiveStashPanel,
  type FpActiveStashPanelState,
} from "../game/fpInteraction/fpActiveStashPanel";
import {
  onMammothInventoryCloseRequestFromFp,
  onMammothInventoryOpenRequestFromFp,
} from "../game/fpInteraction/fpInventoryOpenRequest";
import {
  setFpInventoryDockOpen,
} from "../game/fpInteraction/fpInventoryDockOpen";
import { isTextInputFocused } from "../game/isTextInputFocused.js";
import {
  getFpHotbarSelectedSlot,
  setFpHotbarSelectedSlot,
  subscribeFpHotbarSelection,
} from "../game/fpHotbar/fpHotbarSelection";
import { getMammothItemDef, mammothItemDefSupportsHotbarInstantConsume, mammothItemDefSupportsHotbarUseAction, mammothItemDefSupportsHotbarWaterDrink } from "./mammothItemCatalog";
import { WaterBottleHotbarFillBar } from "./WaterBottleHotbarFillBar";
import { useWaterBottleFillVersion } from "./useWaterContainerState";
import { waterBottleFillFraction } from "./waterContainerHelpers";
import {
  apartmentStashMoveFailureHint,
  clientMayPushToActiveApartmentStash,
  mammothItemAllowedInApartmentStash,
  reportApartmentStashRejection,
} from "./apartmentStashInventoryRules";
import { showGameplayErrorBar } from "../ui/gameplayErrorBar";
import type {
  MammothDragSourceSlotInfo,
  MammothDraggedItemInfo,
  MammothDropResult,
  MammothPopulatedItem,
} from "./inventoryDragDropTypes";
import { MammothItemIcon } from "./MammothItemIcon";
import { MammothItemTooltip } from "./MammothItemTooltip";
import {
  buildMammothItemTooltipContent,
  type MammothItemTooltipContentModel,
} from "./mammothItemTooltipContent";
import {
  mammothHotLootActiveLabel,
  mammothHotLootSubtitle,
} from "./mammothHotLootSlotBindings";
import { useMammothHotLoot } from "./MammothHotLootContext";
import { MammothPlayerCarrySlotCell } from "./MammothHotLootSlotCells";
import { destIndexForQuickTransfer } from "./inventoryQuickTransfer";
import { evaluateInventoryDrop, type InventoryDragDropRulesContext } from "./inventoryDragDropHelpers";
import { beginInventoryDrag, endInventoryDrag, getInventoryDragSession } from "./inventoryDragSession";
import { playInventoryItemDragDropSound } from "./inventoryDragUiSound";
import { useInventoryDragHoverSlot } from "./useInventoryDragHoverSlot";
import { MammothHudPanel } from "./MammothHudPanel";
import {
  inventorySlotGridsMatch,
  inventorySlotGridsSemanticallyMatch,
  predictSlotMove,
  type SlotGrids,
} from "./inventoryOptimistic";
import {
  PLAYER_INVENTORY_GRID_COLS,
} from "@the-mammoth/schemas";
import {
  mammothInventoryHudSlotCount,
  useMammothInventory,
  useMammothStash,
} from "./useMammothInventory";

const NO_SELECT: CSSProperties = {
  userSelect: "none",
  WebkitUserSelect: "none",
  MozUserSelect: "none",
  msUserSelect: "none",
};

type Props = {
  conn: DbConnection;
  activeStash?: FpActiveStashPanelState | null;
};

export function MammothInventoryHud({ conn, activeStash = null }: Props) {
  const { hotbar, inventory } = useMammothInventory(conn);
  const stashRows = useMammothStash(
    conn,
    activeStash?.stashKey ?? null,
    activeStash?.stashKind ?? null,
  );
  const baseSlots = useMemo(
    () => ({ hotbar, inventory, ...(activeStash ? { stash: stashRows } : {}) }),
    [hotbar, inventory, activeStash, stashRows],
  );
  const [optimisticSlots, setOptimisticSlots] = useState<SlotGrids | null>(null);
  const displaySlots = optimisticSlots ?? baseSlots;
  const baseSlotsRef = useRef(baseSlots);
  const optimisticSlotsRef = useRef<SlotGrids | null>(null);
  baseSlotsRef.current = baseSlots;
  optimisticSlotsRef.current = optimisticSlots;

  const gridsForPrediction = useCallback(() => optimisticSlotsRef.current ?? baseSlotsRef.current, []);

  useEffect(() => {
    if (!optimisticSlots) return;
    if (getInventoryDragSession()) return;
    if (
      inventorySlotGridsMatch(optimisticSlots, baseSlots) ||
      inventorySlotGridsSemanticallyMatch(optimisticSlots, baseSlots)
    ) {
      setOptimisticSlots(null);
      return;
    }
    // Harvest / pickup toasts replicate before stale drag-less optimistic UI clears.
    setOptimisticSlots(null);
  }, [baseSlots, optimisticSlots]);

  /** Drop failed server-side: replicated grids never matched optimistic stash deposit. */
  useEffect(() => {
    if (!optimisticSlots || !activeStash) return;
    const id = window.setTimeout(() => {
      if (!optimisticSlotsRef.current) return;
      if (
        inventorySlotGridsMatch(optimisticSlotsRef.current, baseSlotsRef.current) ||
        inventorySlotGridsSemanticallyMatch(optimisticSlotsRef.current, baseSlotsRef.current)
      ) {
        return;
      }
      setOptimisticSlots(null);
      showGameplayErrorBar(apartmentStashMoveFailureHint(activeStash.stashKind));
    }, 900);
    return () => window.clearTimeout(id);
  }, [optimisticSlots, activeStash, baseSlots]);
  const waterFillVer = useWaterBottleFillVersion(conn);
  void waterFillVer;
  const [invOpen, setInvOpen] = useState(false);
  const dragDropRules = useMemo(
    (): InventoryDragDropRulesContext => ({
      conn,
      activeStash,
      ...(activeStash
        ? { openStash: { stashKey: activeStash.stashKey, stashKind: activeStash.stashKind } }
        : {}),
    }),
    [conn, activeStash],
  );
  const dragHoverSlot = useInventoryDragHoverSlot(gridsForPrediction, dragDropRules);
  const isDragHoverSlot = useCallback(
    (slot: MammothDragSourceSlotInfo) =>
      dragHoverSlot?.type === slot.type && dragHoverSlot.index === slot.index,
    [dragHoverSlot],
  );
  const selectedSlot = useSyncExternalStore(
    subscribeFpHotbarSelection,
    getFpHotbarSelectedSlot,
    getFpHotbarSelectedSlot,
  );
  /** Re-render while instant-consume cooldown animates (RAF-driven version bumps). */
  useSyncExternalStore(
    subscribeHotbarInstantConsumeCooldown,
    getHotbarInstantConsumeCooldownVersion,
    getHotbarInstantConsumeCooldownVersion,
  );
  const lastHotbarClickRef = useRef<{ slot: number; t: number } | null>(null);

  const hoveredTooltipSlotRef = useRef<MammothDragSourceSlotInfo | null>(null);
  const [itemTooltip, setItemTooltip] = useState<{
    visible: boolean;
    content: MammothItemTooltipContentModel | null;
    position: { x: number; y: number };
  }>({ visible: false, content: null, position: { x: 0, y: 0 } });

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
    const arr = slot.type === "hotbar" ? displaySlots.hotbar : displaySlots.inventory;
    const pop = arr[slot.index] ?? null;
    if (!pop) {
      hideItemTooltip();
      return;
    }
    setItemTooltip((prev) => ({
      ...prev,
      content: buildMammothItemTooltipContent(pop),
    }));
  }, [displaySlots, itemTooltip.visible, hideItemTooltip]);

  useEffect(() => {
    if (!invOpen && hoveredTooltipSlotRef.current?.type === "inventory") {
      hideItemTooltip();
    }
  }, [invOpen, hideItemTooltip]);

  /** Mirror local panel state into the shared signal so sibling overlays (backdrop, footer) render in lockstep. */
  useEffect(() => {
    setFpInventoryDockOpen(invOpen);
    return () => setFpInventoryDockOpen(false);
  }, [invOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Tab" || e.repeat) return;
      if (isTextInputFocused()) return;
      e.preventDefault();
      if (activeStash) {
        closeApartmentStashAndInventory();
        if (document.pointerLockElement) void document.exitPointerLock();
        return;
      }
      setInvOpen((o) => {
        if (o) setFpActiveStashPanel(null);
        return !o;
      });
      if (document.pointerLockElement) void document.exitPointerLock();
    };
    // Capture so Tab opens inventory even when focus is on the canvas / other controls.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [activeStash]);

  useEffect(() => {
    if (!invOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Escape" || e.repeat || isTextInputFocused()) return;
      e.preventDefault();
      closeApartmentStashAndInventory();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [invOpen]);

  useEffect(() => {
    return onMammothInventoryOpenRequestFromFp(() => {
      setInvOpen(true);
      if (document.pointerLockElement) void document.exitPointerLock();
    });
  }, []);

  useEffect(() => {
    return onMammothInventoryCloseRequestFromFp(() => {
      setInvOpen(false);
    });
  }, []);

  const handleDragStart = useCallback((info: MammothDraggedItemInfo) => {
    beginInventoryDrag(info);
  }, []);

  const blockBrowserContextMenu = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
  }, []);

  const toInstanceId = useCallback((pop: MammothPopulatedItem) => {
    const id = pop.instance.instanceId;
    return typeof id === "bigint" ? id : BigInt(id as number);
  }, []);

  const quickMoveInventoryToHotbar = useCallback(
    (pop: MammothPopulatedItem, fromInventoryIndex: number) => {
      if (document.body.classList.contains("item-dragging")) return;
      const g = gridsForPrediction();
      const destIndex = destIndexForQuickTransfer(g.hotbar, pop);
      const predicted = predictSlotMove(g, { type: "inventory", index: fromInventoryIndex }, {
        type: "hotbar",
        index: destIndex,
      });
      if (predicted) setOptimisticSlots(predicted);
      try {
        void conn.reducers.moveItemToHotbar({
          itemInstanceId: toInstanceId(pop),
          targetHotbarSlot: destIndex,
          quantityToMove: 0,
        });
      } catch (err) {
        console.warn("[MammothInventoryHud] quick move to hotbar failed", err);
      }
    },
    [conn, gridsForPrediction, toInstanceId],
  );

  const quickMovePlayerItemToStash = useCallback(
    (pop: MammothPopulatedItem, sourceSlot: MammothDragSourceSlotInfo) => {
      if (!activeStash || document.body.classList.contains("item-dragging")) return;
      if (!mammothItemAllowedInApartmentStash(activeStash.stashKind, pop.def)) {
        reportApartmentStashRejection(activeStash.stashKind);
        return;
      }
      if (!clientMayPushToActiveApartmentStash(conn, activeStash)) return;
      const g = gridsForPrediction();
      const destIndex = destIndexForQuickTransfer(g.stash ?? [], pop);
      const predicted = predictSlotMove(g, sourceSlot, { type: "stash", index: destIndex });
      if (!predicted) return;
      playInventoryItemDragDropSound();
      setOptimisticSlots(predicted);
      try {
        void conn.reducers.stashPushItemToSlot({
          itemInstanceId: toInstanceId(pop),
          unitKey: activeStash.stashKey,
          targetStashSlot: destIndex,
          quantityToMove: 0,
        });
      } catch (err) {
        console.warn("[MammothInventoryHud] quick move to stash failed", err);
      }
    },
    [activeStash, conn, gridsForPrediction, toInstanceId],
  );

  const quickMoveHotbarToInventory = useCallback(
    (pop: MammothPopulatedItem, fromHotbarIndex: number) => {
      if (document.body.classList.contains("item-dragging")) return;
      const g = gridsForPrediction();
      const destIndex = destIndexForQuickTransfer(g.inventory, pop);
      const predicted = predictSlotMove(g, { type: "hotbar", index: fromHotbarIndex }, {
        type: "inventory",
        index: destIndex,
      });
      if (predicted) setOptimisticSlots(predicted);
      try {
        void conn.reducers.moveItemToInventory({
          itemInstanceId: toInstanceId(pop),
          targetInventorySlot: destIndex,
          quantityToMove: 0,
        });
      } catch (err) {
        console.warn("[MammothInventoryHud] quick move to inventory failed", err);
      }
    },
    [conn, gridsForPrediction, toInstanceId],
  );

  const handleDrop = useCallback(
    (result: MammothDropResult) => {
      const src = endInventoryDrag();
      document.body.classList.remove("item-dragging");
      if (!src) return;

      const evaluation = evaluateInventoryDrop({
        grids: gridsForPrediction(),
        src,
        result,
        rules: dragDropRules,
      });

      if (evaluation.kind === "cancel" || evaluation.kind === "noop") return;
      if (evaluation.kind === "rejectStash") {
        reportApartmentStashRejection(evaluation.stashKind);
        return;
      }

      playInventoryItemDragDropSound();

      const id = src.item.instance.instanceId;
      const instanceId = typeof id === "bigint" ? id : BigInt(id as number);

      try {
        if (evaluation.kind === "world") {
          setOptimisticSlots(evaluation.predicted);
          void conn.reducers.dropItem({
            itemInstanceId: instanceId,
            quantityToDrop: evaluation.quantityToDrop,
          });
          return;
        }

        setOptimisticSlots(evaluation.predicted);
        const target = evaluation.target;
        if (target.type === "inventory") {
          void conn.reducers.moveItemToInventory({
            itemInstanceId: instanceId,
            targetInventorySlot: target.index,
            quantityToMove: evaluation.quantityToMove,
          });
        } else if (target.type === "stash") {
          if (!activeStash) return;
          void conn.reducers.stashPushItemToSlot({
            itemInstanceId: instanceId,
            unitKey: activeStash.stashKey,
            targetStashSlot: target.index,
            quantityToMove: evaluation.quantityToMove,
          });
        } else {
          void conn.reducers.moveItemToHotbar({
            itemInstanceId: instanceId,
            targetHotbarSlot: target.index,
            quantityToMove: evaluation.quantityToMove,
          });
        }
      } catch (err) {
        console.warn("[MammothInventoryHud] drop/move failed", err);
      }
    },
    [activeStash, conn, dragDropRules, gridsForPrediction],
  );

  const onHotbarSlotClick = useCallback(
    (index: number) => {
      if (!conn.identity) return;
      const prevSel = getFpHotbarSelectedSlot();

      // Broth-style: second activation on the same slot while it holds an instant-use consumable → consume.
      if (prevSel === index && hotbarSlotHasHotbarUseAction(conn, conn.identity, index)) {
        lastHotbarClickRef.current = null;
        void runFpHotbarInstantConsume(
          conn,
          conn.identity,
          index,
          primeHotbarConsumeAudio,
          "MammothInventoryHud",
        );
        return;
      }

      const netRow = getHotbarSlotInventoryItem(conn, conn.identity, index);
      const def = netRow ? getMammothItemDef(netRow.defId) : undefined;
      if (netRow && mammothItemDefSupportsHotbarUseAction(def)) {
        lastHotbarClickRef.current = { slot: index, t: performance.now() };
        setFpHotbarSelectedSlot(index);
        return;
      }

      const now = performance.now();
      const prev = lastHotbarClickRef.current;
      if (prev && prev.slot === index && now - prev.t < 380) {
        setFpHotbarSelectedSlot(null);
        lastHotbarClickRef.current = null;
        return;
      }
      lastHotbarClickRef.current = { slot: index, t: now };
      setFpHotbarSelectedSlot(index);
    },
    [conn],
  );

  const slotInner = (pop: MammothDraggedItemInfo["item"] | null) => {
    if (!pop) return null;
    return <MammothItemIcon def={pop.def} size={44} style={NO_SELECT} />;
  };

  const hotbarBottom = "max(16px, calc(env(safe-area-inset-bottom, 0px) + 12px))";

  const { hotbar: hb, inventory: inv } = displaySlots;
  const inventoryHudSlots = mammothInventoryHudSlotCount(inv);
  const hotLoot = useMammothHotLoot();
  const hotLootBanner = mammothHotLootActiveLabel(hotLoot.isHotLootActive);
  const stashSubtitleSuffix = mammothHotLootSubtitle(hotLoot.enabled);

  const tooltipHandlers = useMemo(
    () => ({
      openItemTooltipForSlot,
      updateTooltipPositionFromHoverEvent,
      hideItemTooltip,
    }),
    [openItemTooltipForSlot, updateTooltipPositionFromHoverEvent, hideItemTooltip],
  );

  /**
   * Inventory anchors the LEFT half of the dock when a stash is open (so the pair feels
   * balanced around the viewport center) and centers fully when opened solo via Tab.
   * Stash panel uses the mirrored anchor (see MammothStashHud).
   */
  const inventoryAnchor: CSSProperties = activeStash
    ? { right: "calc(50% + 8px)", top: "50%", transform: "translate(0, -50%)" }
    : { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };

  return (
    <div
      data-mammoth-inventory={invOpen ? "open" : "closed"}
      onDragStart={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 120,
        ...NO_SELECT,
      }}
    >
      {invOpen && (
        <div
          style={{
            position: "fixed",
            ...inventoryAnchor,
            zIndex: 121,
            pointerEvents: "auto",
          }}
        >
          <MammothHudPanel
            title="Inventory"
            subtitle={
              hotLootBanner ??
              (activeStash
                ? `Drag items in or out. Right-click to quick-transfer.${stashSubtitleSuffix}`
                : "Right-click to send an item to the hotbar.")
            }
            onContextMenu={blockBrowserContextMenu}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${PLAYER_INVENTORY_GRID_COLS}, 52px)`,
                gap: 6,
              }}
            >
              {Array.from({ length: inventoryHudSlots }, (_, i) => {
                const pop = inv[i] ?? null;
                const slotInfo = { type: "inventory" as const, index: i };
                return (
                  <MammothPlayerCarrySlotCell
                    key={`inv-${i}`}
                    slotPrefix={`inv-${i}`}
                    pop={pop}
                    slotInfo={slotInfo}
                    isDraggingOver={isDragHoverSlot(slotInfo)}
                    tooltip={tooltipHandlers}
                    onDragStart={handleDragStart}
                    onDrop={handleDrop}
                    onItemContextMenu={() =>
                      activeStash
                        ? quickMovePlayerItemToStash(pop!, slotInfo)
                        : quickMoveInventoryToHotbar(pop!, i)
                    }
                    slotInner={slotInner}
                    toInstanceId={toInstanceId}
                  />
                );
              })}
            </div>
          </MammothHudPanel>
        </div>
      )}

      <div
        onContextMenu={blockBrowserContextMenu}
        onDragStart={(e) => e.preventDefault()}
        style={{
          pointerEvents: "auto",
          position: "fixed",
          left: "50%",
          bottom: hotbarBottom,
          transform: "translateX(-50%)",
          display: "flex",
          gap: 6,
          padding: "8px 12px",
          borderRadius: 12,
          background: THEME_CARD_BG_STRONG,
          border: `1px solid ${THEME_CARD_BORDER_STRONG}`,
          zIndex: 122,
          boxShadow: THEME_PANEL_SHADOW,
          fontFamily: UI_FONT_SANS,
          ...NO_SELECT,
        }}
      >
        {hb.map((pop, index) => {
          const slotInfo = { type: "hotbar" as const, index };
          const sel = selectedSlot === index;
          const consumeCd =
            pop && mammothItemDefSupportsHotbarUseAction(pop.def)
              ? hotbarInstantConsumeCooldownProgress(index)
              : null;
          const waterFill =
            pop && mammothItemDefSupportsHotbarWaterDrink(pop.def) && pop.def.waterContainer
              ? waterBottleFillFraction(
                  conn,
                  pop.instance.instanceId,
                  pop.def.waterContainer.capacityLiters,
                )
              : null;
          return (
            <div key={`hb-${index}`} style={{ position: "relative" }}>
              <div
                style={{
                  position: "absolute",
                  top: -14,
                  left: "50%",
                  transform: "translateX(-50%)",
                  fontSize: 10,
                  color: THEME_TEXT_FAINT,
                  width: 52,
                  textAlign: "center",
                  ...NO_SELECT,
                }}
              >
                {index + 1}
              </div>
              <MammothPlayerCarrySlotCell
                slotPrefix={`hb-${index}`}
                pop={pop}
                slotInfo={slotInfo}
                isDraggingOver={isDragHoverSlot(slotInfo)}
                tooltip={tooltipHandlers}
                onDragStart={handleDragStart}
                onDrop={handleDrop}
                onActivate={() => onHotbarSlotClick(index)}
                onItemContextMenu={() =>
                  activeStash
                    ? quickMovePlayerItemToStash(pop!, slotInfo)
                    : quickMoveHotbarToInventory(pop!, index)
                }
                slotInner={slotInner}
                toInstanceId={toInstanceId}
                overlayProgress={consumeCd ?? undefined}
                onClick={pop ? undefined : () => onHotbarSlotClick(index)}
                droppableStyle={{
                  outline: sel ? `2px solid ${THEME_ACCENT}` : undefined,
                  outlineOffset: 1,
                  position: "relative",
                }}
                slotOverlay={
                  waterFill != null ? <WaterBottleHotbarFillBar fillFraction={waterFill} /> : null
                }
              />
            </div>
          );
        })}
      </div>

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
