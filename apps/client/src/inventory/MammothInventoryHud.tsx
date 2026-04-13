import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { DbConnection } from "../module_bindings";
import {
  getFpHotbarSelectedSlot,
  setFpHotbarSelectedSlot,
  subscribeFpHotbarSelection,
} from "../game/fpHotbarSelection";
import type { MammothDraggedItemInfo, MammothDropResult } from "./inventoryDragDropTypes";
import { MammothDraggableItem } from "./MammothDraggableItem";
import { MammothDroppableSlot } from "./MammothDroppableSlot";
import { useMammothInventory } from "./useMammothInventory";

const INV_COLS = 6;
const INV_ROWS = 4;

function isTextInputFocused(): boolean {
  const el = document.activeElement;
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

type Props = {
  conn: DbConnection;
};

export function MammothInventoryHud({ conn }: Props) {
  const { hotbar, inventory } = useMammothInventory(conn);
  const [invOpen, setInvOpen] = useState(false);
  const dragRef = useRef<MammothDraggedItemInfo | null>(null);
  const selectedSlot = useSyncExternalStore(
    subscribeFpHotbarSelection,
    getFpHotbarSelectedSlot,
    getFpHotbarSelectedSlot,
  );
  const lastHotbarClickRef = useRef<{ slot: number; t: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Tab" || e.repeat) return;
      if (isTextInputFocused()) return;
      e.preventDefault();
      setInvOpen((o) => !o);
      if (document.pointerLockElement) void document.exitPointerLock();
    };
    // Capture so Tab opens inventory even when focus is on the canvas / other controls.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const handleDragStart = useCallback((info: MammothDraggedItemInfo) => {
    dragRef.current = info;
  }, []);

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
          void conn.reducers.dropItem({
            itemInstanceId: instanceId,
            quantityToDrop: qty,
          });
          return;
        }
        const target = result.slot;
        if (target.type === "inventory") {
          void conn.reducers.moveItemToInventory({
            itemInstanceId: instanceId,
            targetInventorySlot: target.index,
          });
        } else {
          void conn.reducers.moveItemToHotbar({
            itemInstanceId: instanceId,
            targetHotbarSlot: target.index,
          });
        }
      } catch (err) {
        console.warn("[MammothInventoryHud] drop/move failed", err);
      }
    },
    [conn],
  );

  const onHotbarSlotClick = useCallback((index: number) => {
    const now = performance.now();
    const prev = lastHotbarClickRef.current;
    if (prev && prev.slot === index && now - prev.t < 380) {
      setFpHotbarSelectedSlot(null);
      lastHotbarClickRef.current = null;
      return;
    }
    lastHotbarClickRef.current = { slot: index, t: now };
    setFpHotbarSelectedSlot(index);
  }, []);

  const slotInner = (pop: MammothDraggedItemInfo["item"] | null) => {
    if (!pop) return null;
    return (
      <img
        src={pop.def.iconUrl}
        alt={pop.def.displayName}
        title={pop.def.displayName}
        draggable={false}
        style={{
          width: 44,
          height: 44,
          objectFit: "contain",
          display: "block",
          margin: "auto",
          pointerEvents: "none",
        }}
      />
    );
  };

  const hotbarBottom = "max(16px, calc(env(safe-area-inset-bottom, 0px) + 12px))";

  return (
    <div
      data-mammoth-inventory={invOpen ? "open" : "closed"}
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 120,
      }}
    >
      {invOpen && (
        <div
          style={{
            pointerEvents: "auto",
            position: "fixed",
            left: "50%",
            bottom: `calc(${hotbarBottom} + 88px)`,
            transform: "translateX(-50%)",
            padding: 12,
            borderRadius: 10,
            background: "linear-gradient(160deg, rgba(25,28,38,0.96), rgba(12,14,20,0.98))",
            border: "1px solid rgba(120,200,255,0.35)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.55)",
            minWidth: 360,
            zIndex: 121,
          }}
        >
          <div style={{ color: "#b8c4d8", fontSize: 12, marginBottom: 8 }}>Inventory — Tab to close</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${INV_COLS}, 52px)`,
              gap: 6,
            }}
          >
            {Array.from({ length: INV_ROWS * INV_COLS }, (_, i) => {
              const pop = inventory[i] ?? null;
              const slotInfo = { type: "inventory" as const, index: i };
              return (
                <MammothDroppableSlot key={`inv-${i}`} slotInfo={slotInfo}>
                  {pop ? (
                    <MammothDraggableItem
                      item={pop}
                      sourceSlot={slotInfo}
                      onDragStart={handleDragStart}
                      onDrop={handleDrop}
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
        }}
      >
        {hotbar.map((pop, index) => {
          const slotInfo = { type: "hotbar" as const, index };
          const sel = selectedSlot === index;
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
                }}
              >
                {index + 1}
              </div>
              <MammothDroppableSlot
                slotInfo={slotInfo}
                isDraggingOver={false}
                onClick={() => onHotbarSlotClick(index)}
                style={{
                  outline: sel ? "2px solid #5cf" : undefined,
                  outlineOffset: 1,
                }}
              >
                {pop ? (
                  <MammothDraggableItem
                    item={pop}
                    sourceSlot={slotInfo}
                    onDragStart={handleDragStart}
                    onDrop={handleDrop}
                    onActivate={() => onHotbarSlotClick(index)}
                  >
                    {slotInner(pop)}
                  </MammothDraggableItem>
                ) : null}
              </MammothDroppableSlot>
            </div>
          );
        })}
      </div>
    </div>
  );
}
