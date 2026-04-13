import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type {
  MammothDraggedItemInfo,
  MammothDragSourceSlotInfo,
  MammothDropResult,
} from "./inventoryDragDropTypes";

type Props = {
  item: MammothDraggedItemInfo["item"];
  sourceSlot: MammothDragSourceSlotInfo;
  onDragStart: (info: MammothDraggedItemInfo) => void;
  onDrop: (result: MammothDropResult) => void;
  onActivate?: () => void;
  children: ReactNode;
};

export function MammothDraggableItem({
  item,
  sourceSlot,
  onDragStart,
  onDrop,
  onActivate,
  children,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const startRef = useRef({ x: 0, y: 0 });
  const onDropRef = useRef(onDrop);
  const onDragStartRef = useRef(onDragStart);
  const onActivateRef = useRef(onActivate);
  useEffect(() => {
    onDropRef.current = onDrop;
    onDragStartRef.current = onDragStart;
    onActivateRef.current = onActivate;
  }, [onDrop, onDragStart, onActivate]);

  const onMouseDown = (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      draggingRef.current = false;
      startRef.current = { x: e.clientX, y: e.clientY };

      const onMouseMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startRef.current.x;
        const dy = ev.clientY - startRef.current.y;
        if (!draggingRef.current && dx * dx + dy * dy >= 4) {
          draggingRef.current = true;
          document.body.classList.add("item-dragging");
          if (ref.current) ref.current.style.opacity = "0.45";
          onDragStartRef.current({ item, sourceSlot });
          const g = document.createElement("div");
          g.style.cssText = `position:fixed;left:${ev.clientX + 8}px;top:${ev.clientY + 8}px;z-index:100000;pointer-events:none;padding:4px;background:rgba(0,0,0,0.75);border-radius:6px;border:1px solid rgba(120,200,255,0.5)`;
          const img = document.createElement("img");
          img.src = item.def.iconUrl;
          img.alt = item.def.displayName;
          img.width = 40;
          img.height = 40;
          img.style.objectFit = "contain";
          g.appendChild(img);
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
          if ((type === "inventory" || type === "hotbar") && idx !== null) {
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

  return (
    <div
      ref={ref}
      role="presentation"
      onMouseDown={onMouseDown}
      style={{ width: "100%", height: "100%", position: "relative" }}
    >
      {children}
    </div>
  );
}
