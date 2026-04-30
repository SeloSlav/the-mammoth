import { useEffect, useRef } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import type {
  MammothDraggedItemInfo,
  MammothDragSourceSlotInfo,
  MammothDropResult,
} from "./inventoryDragDropTypes";
import { mammothShowStackQuantityOnSlotIcon } from "./inventoryStackBadge";

type Props = {
  item: MammothDraggedItemInfo["item"];
  sourceSlot: MammothDragSourceSlotInfo;
  onDragStart: (info: MammothDraggedItemInfo) => void;
  onDrop: (result: MammothDropResult) => void;
  onActivate?: () => void;
  /** Right-click: browser menu suppressed; used for quick move (inventory ↔ hotbar). */
  onItemContextMenu?: () => void;
  /** Inventory/hotbar hover tooltip — cleared when drag starts. */
  slotHover?: {
    onEnter: (e: ReactMouseEvent) => void;
    onMove: (e: ReactMouseEvent) => void;
    onLeave: () => void;
  };
  children: ReactNode;
};

export function MammothDraggableItem({
  item,
  sourceSlot,
  onDragStart,
  onDrop,
  onActivate,
  onItemContextMenu,
  slotHover,
  children,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const startRef = useRef({ x: 0, y: 0 });
  const onDropRef = useRef(onDrop);
  const onDragStartRef = useRef(onDragStart);
  const onActivateRef = useRef(onActivate);
  const onItemContextMenuRef = useRef(onItemContextMenu);
  useEffect(() => {
    onDropRef.current = onDrop;
    onDragStartRef.current = onDragStart;
    onActivateRef.current = onActivate;
    onItemContextMenuRef.current = onItemContextMenu;
  }, [onDrop, onDragStart, onActivate, onItemContextMenu]);

  const onMouseDown = (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      draggingRef.current = false;
      startRef.current = { x: e.clientX, y: e.clientY };

      const onMouseMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startRef.current.x;
        const dy = ev.clientY - startRef.current.y;
        if (!draggingRef.current && dx * dx + dy * dy >= 4) {
          draggingRef.current = true;
          slotHover?.onLeave();
          document.body.classList.add("item-dragging");
          if (ref.current) ref.current.style.opacity = "0.45";
          onDragStartRef.current({ item, sourceSlot });
          const g = document.createElement("div");
          g.style.cssText = `position:fixed;left:${ev.clientX + 8}px;top:${ev.clientY + 8}px;z-index:100000;pointer-events:none;padding:4px;background:rgba(0,0,0,0.75);border-radius:6px;border:1px solid rgba(120,200,255,0.5);box-sizing:border-box;min-width:48px;min-height:48px`;
          const img = document.createElement("img");
          img.src = item.def.iconUrl;
          img.alt = item.def.displayName;
          img.width = 40;
          img.height = 40;
          img.style.objectFit = "contain";
          g.appendChild(img);
          if (mammothShowStackQuantityOnSlotIcon(item.def, item.instance.quantity)) {
            const q = document.createElement("div");
            q.textContent = String(item.instance.quantity);
            q.style.cssText =
              "position:absolute;bottom:0;right:0;font-size:10px;font-weight:700;color:rgba(255,255,255,0.95);background:rgba(0,0,0,0.72);padding:1px 4px;border-radius:3px;line-height:1;pointer-events:none;font-family:ui-monospace,Menlo,Consolas,monospace";
            g.appendChild(q);
          }
          document.body.appendChild(g);
          ghostRef.current = g;
        }
        if (draggingRef.current && ghostRef.current) {
          ghostRef.current.style.left = `${ev.clientX + 8}px`;
          ghostRef.current.style.top = `${ev.clientY + 8}px`;
        }
      };

      const onMouseUp = (ev: MouseEvent) => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        if (!draggingRef.current) {
          if (ev.button === 0 && onActivateRef.current) onActivateRef.current();
          return;
        }
        draggingRef.current = false;
        document.body.classList.remove("item-dragging");
        if (ref.current) ref.current.style.opacity = "1";
        let result: MammothDropResult = { kind: "world" };
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const slot = el?.closest("[data-slot-type]") as HTMLElement | null;
        if (slot) {
          const type = slot.getAttribute("data-slot-type") as MammothDragSourceSlotInfo["type"] | null;
          const idx = slot.getAttribute("data-slot-index");
          if ((type === "inventory" || type === "hotbar" || type === "stash") && idx !== null) {
            const index = Number.parseInt(idx, 10);
            if (!Number.isNaN(index)) {
              const targetSlot: MammothDragSourceSlotInfo = { type, index };
              const same =
                targetSlot.type === sourceSlot.type && targetSlot.index === sourceSlot.index;
              result = same ? { kind: "cancel" } : { kind: "slot", slot: targetSlot };
            }
          }
        }
        const g = ghostRef.current;
        if (g?.parentNode) g.parentNode.removeChild(g);
        ghostRef.current = null;
        onDropRef.current(result);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (document.body.classList.contains("item-dragging")) return;
    onItemContextMenuRef.current?.();
  };

  return (
    <div
      ref={ref}
      role="presentation"
      onMouseDown={onMouseDown}
      onMouseEnter={slotHover?.onEnter}
      onMouseMove={slotHover?.onMove}
      onMouseLeave={slotHover?.onLeave}
      onContextMenu={onItemContextMenu ? handleContextMenu : undefined}
      onDragStart={(e) => e.preventDefault()}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {children}
      {mammothShowStackQuantityOnSlotIcon(item.def, item.instance.quantity) ? (
        <div
          style={{
            position: "absolute",
            bottom: 2,
            right: 3,
            fontSize: 10,
            fontWeight: 700,
            lineHeight: 1,
            color: "rgba(255,255,255,0.95)",
            backgroundColor: "rgba(0,0,0,0.72)",
            padding: "1px 4px",
            borderRadius: 3,
            userSelect: "none",
            pointerEvents: "none",
            zIndex: 2,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          }}
        >
          {item.instance.quantity}
        </div>
      ) : null}
    </div>
  );
}
