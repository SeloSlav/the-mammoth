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
import type { DbConnection } from "../module_bindings";
import { hotbarSlotHasInstantConsume } from "../game/fpHotbar/fpHotbarActivate";
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
import { isTextInputFocused } from "../game/isTextInputFocused.js";
import {
  getFpHotbarSelectedSlot,
  setFpHotbarSelectedSlot,
  subscribeFpHotbarSelection,
} from "../game/fpHotbar/fpHotbarSelection";
import { getMammothItemDef, mammothItemDefSupportsHotbarInstantConsume } from "./mammothItemCatalog";
import {
  apartmentStashRejectionHint,
  isApartmentStashSlotIndexValid,
  mammothItemAllowedInApartmentStash,
} from "./apartmentStashInventoryRules";
import type {
  MammothDragSourceSlotInfo,
  MammothDraggedItemInfo,
  MammothDropResult,
  MammothPopulatedItem,
} from "./inventoryDragDropTypes";
import { MammothDraggableItem } from "./MammothDraggableItem";
import { MammothDroppableSlot } from "./MammothDroppableSlot";
import { MammothItemTooltip } from "./MammothItemTooltip";
import {
  buildMammothItemTooltipContent,
  type MammothItemTooltipContentModel,
} from "./mammothItemTooltipContent";
import { destIndexForQuickTransfer } from "./inventoryQuickTransfer";
import {
  inventorySlotGridsMatch,
  predictSlotMove,
  predictWorldDrop,
} from "./inventoryOptimistic";
import { useMammothInventory } from "./useMammothInventory";

const INV_COLS = 6;
const INV_ROWS = 4;

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
  const baseSlots = useMemo(() => ({ hotbar, inventory }), [hotbar, inventory]);
  const [optimisticSlots, setOptimisticSlots] = useState<typeof baseSlots | null>(null);
  const displaySlots = optimisticSlots ?? baseSlots;
  const baseSlotsRef = useRef(baseSlots);
  const optimisticSlotsRef = useRef<typeof baseSlots | null>(null);
  baseSlotsRef.current = baseSlots;
  optimisticSlotsRef.current = optimisticSlots;

  const gridsForPrediction = useCallback(() => optimisticSlotsRef.current ?? baseSlotsRef.current, []);

  useEffect(() => {
    if (!optimisticSlots) return;
    if (inventorySlotGridsMatch(optimisticSlots, baseSlots)) {
      setOptimisticSlots(null);
    }
  }, [baseSlots, optimisticSlots]);
  const [invOpen, setInvOpen] = useState(false);
  const dragRef = useRef<MammothDraggedItemInfo | null>(null);
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
    dragRef.current = info;
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
        });
      } catch (err) {
        console.warn("[MammothInventoryHud] quick move to hotbar failed", err);
      }
    },
    [conn, gridsForPrediction, toInstanceId],
  );

  const quickMovePlayerItemToStash = useCallback(
    (pop: MammothPopulatedItem) => {
      if (!activeStash || document.body.classList.contains("item-dragging")) return;
      if (!mammothItemAllowedInApartmentStash(activeStash.stashKind, pop.def)) {
        console.warn("[MammothInventoryHud]", apartmentStashRejectionHint(activeStash.stashKind));
        return;
      }
      try {
        void conn.reducers.stashPushItem({
          itemInstanceId: toInstanceId(pop),
          unitKey: activeStash.stashKey,
        });
      } catch (err) {
        console.warn("[MammothInventoryHud] quick move to stash failed", err);
      }
    },
    [activeStash, conn, toInstanceId],
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
        });
      } catch (err) {
        console.warn("[MammothInventoryHud] quick move to inventory failed", err);
      }
    },
    [conn, gridsForPrediction, toInstanceId],
  );

  const handleDrop = useCallback(
    (result: MammothDropResult) => {
      const src = dragRef.current;
      dragRef.current = null;
      document.body.classList.remove("item-dragging");
      if (!src) return;
      const id = src.item.instance.instanceId;
      const instanceId = typeof id === "bigint" ? id : BigInt(id as number);
      const qty = src.item.instance.quantity;
      try {
        if (result.kind === "cancel") return;
        if (result.kind === "world") {
          const predicted = predictWorldDrop(gridsForPrediction(), src.sourceSlot, qty);
          if (predicted) setOptimisticSlots(predicted);
          void conn.reducers.dropItem({
            itemInstanceId: instanceId,
            quantityToDrop: qty,
          });
          return;
        }
        const target = result.slot;
        if (target.type === "inventory") {
          const predicted = predictSlotMove(gridsForPrediction(), src.sourceSlot, target);
          if (predicted) setOptimisticSlots(predicted);
          void conn.reducers.moveItemToInventory({
            itemInstanceId: instanceId,
            targetInventorySlot: target.index,
          });
        } else if (target.type === "stash") {
          if (!activeStash) return;
          if (
            !isApartmentStashSlotIndexValid(activeStash.stashKind, target.index) ||
            (src.sourceSlot.type !== "stash" &&
              !mammothItemAllowedInApartmentStash(activeStash.stashKind, src.item.def))
          ) {
            console.warn(
              "[MammothInventoryHud]",
              apartmentStashRejectionHint(activeStash.stashKind),
            );
            return;
          }
          const predicted = predictSlotMove(gridsForPrediction(), src.sourceSlot, target);
          if (predicted) setOptimisticSlots(predicted);
          void conn.reducers.stashPushItemToSlot({
            itemInstanceId: instanceId,
            unitKey: activeStash.stashKey,
            targetStashSlot: target.index,
          });
        } else {
          const predicted = predictSlotMove(gridsForPrediction(), src.sourceSlot, target);
          if (predicted) setOptimisticSlots(predicted);
          void conn.reducers.moveItemToHotbar({
            itemInstanceId: instanceId,
            targetHotbarSlot: target.index,
          });
        }
      } catch (err) {
        console.warn("[MammothInventoryHud] drop/move failed", err);
      }
    },
    [activeStash, conn, gridsForPrediction],
  );

  const onHotbarSlotClick = useCallback(
    (index: number) => {
      if (!conn.identity) return;
      const prevSel = getFpHotbarSelectedSlot();

      // Broth-style: second activation on the same slot while it holds an instant-use consumable → consume.
      if (prevSel === index && hotbarSlotHasInstantConsume(conn, conn.identity, index)) {
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
      if (netRow && mammothItemDefSupportsHotbarInstantConsume(def)) {
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

  const hotbarBottom = "max(16px, calc(env(safe-area-inset-bottom, 0px) + 12px))";

  const { hotbar: hb, inventory: inv } = displaySlots;

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
          onContextMenu={blockBrowserContextMenu}
          onDragStart={(e) => e.preventDefault()}
          style={{
            pointerEvents: "auto",
            position: "fixed",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            padding: 12,
            borderRadius: 10,
            background: "linear-gradient(160deg, rgba(25,28,38,0.96), rgba(12,14,20,0.98))",
            border: "1px solid rgba(120,200,255,0.35)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.55)",
            minWidth: 360,
            zIndex: 121,
            ...NO_SELECT,
          }}
        >
          <div style={{ color: "#b8c4d8", fontSize: 12, marginBottom: 8 }}>
            Inventory — Tab to close
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${INV_COLS}, 52px)`,
              gap: 6,
            }}
          >
            {Array.from({ length: INV_ROWS * INV_COLS }, (_, i) => {
              const pop = inv[i] ?? null;
              const slotInfo = { type: "inventory" as const, index: i };
              return (
                <MammothDroppableSlot key={`inv-${i}`} slotInfo={slotInfo}>
                  {pop ? (
                    <MammothDraggableItem
                      key={String(toInstanceId(pop))}
                      item={pop}
                      sourceSlot={slotInfo}
                      onDragStart={handleDragStart}
                      onDrop={handleDrop}
                      onItemContextMenu={() =>
                        activeStash
                          ? quickMovePlayerItemToStash(pop)
                          : quickMoveInventoryToHotbar(pop, i)
                      }
                      slotHover={{
                        onEnter: (e) => openItemTooltipForSlot(slotInfo, pop, e),
                        onMove: updateTooltipPositionFromHoverEvent,
                        onLeave: hideItemTooltip,
                      }}
                    >
                      {slotInner(pop)}
                    </MammothDraggableItem>
                  ) : null}
                </MammothDroppableSlot>
              );
            })}
          </div>
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
          padding: "6px 10px",
          borderRadius: 10,
          background: "rgba(8,10,16,0.88)",
          border: "1px solid rgba(120,200,255,0.28)",
          zIndex: 122,
          boxShadow: "0 -4px 24px rgba(0,0,0,0.45)",
          ...NO_SELECT,
        }}
      >
        {hb.map((pop, index) => {
          const slotInfo = { type: "hotbar" as const, index };
          const sel = selectedSlot === index;
          const consumeCd =
            pop && mammothItemDefSupportsHotbarInstantConsume(pop.def)
              ? hotbarInstantConsumeCooldownProgress(index)
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
                  color: "rgba(200,210,230,0.75)",
                  width: 52,
                  textAlign: "center",
                  ...NO_SELECT,
                }}
              >
                {index + 1}
              </div>
              <MammothDroppableSlot
                slotInfo={slotInfo}
                isDraggingOver={false}
                onClick={pop ? undefined : () => onHotbarSlotClick(index)}
                overlayProgress={consumeCd ?? undefined}
                style={{
                  outline: sel ? "2px solid #5cf" : undefined,
                  outlineOffset: 1,
                }}
              >
                {pop ? (
                  <MammothDraggableItem
                    key={String(toInstanceId(pop))}
                    item={pop}
                    sourceSlot={slotInfo}
                    onDragStart={handleDragStart}
                    onDrop={handleDrop}
                    onActivate={() => onHotbarSlotClick(index)}
                    onItemContextMenu={() =>
                      activeStash
                        ? quickMovePlayerItemToStash(pop)
                        : quickMoveHotbarToInventory(pop, index)
                    }
                    slotHover={{
                      onEnter: (e) => openItemTooltipForSlot(slotInfo, pop, e),
                      onMove: updateTooltipPositionFromHoverEvent,
                      onLeave: hideItemTooltip,
                    }}
                  >
                    {slotInner(pop)}
                  </MammothDraggableItem>
                ) : null}
              </MammothDroppableSlot>
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
