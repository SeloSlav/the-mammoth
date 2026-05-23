import { useEffect, useRef } from "react";

import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

import type {

  MammothDraggedItemInfo,

  MammothDragSourceSlotInfo,

  MammothDropResult,

} from "./inventoryDragDropTypes";

import { mammothInventoryResolveDropResult } from "./inventoryDragDropHelpers";

import { mammothHalfStackDragQuantity, mammothSingleUnitDragQuantity } from "./inventoryStackSplit";

import { mammothShowStackQuantityOnSlotIcon } from "./inventoryStackBadge";

import {

  playInventoryItemDragPickSound,

} from "./inventoryDragUiSound";



type Props = {

  item: MammothDraggedItemInfo["item"];

  sourceSlot: MammothDragSourceSlotInfo;

  onDragStart: (info: MammothDraggedItemInfo) => void;

  onDrop: (result: MammothDropResult) => void;

  onActivate?: () => void;

  /** Right-click without drag: quick move (inventory ↔ hotbar / stash). Right-click drag moves one unit. */
  onItemContextMenu?: () => void;

  /** Inventory/hotbar hover tooltip — cleared when drag starts. */

  slotHover?: {

    onEnter: (e: ReactMouseEvent) => void;

    onMove: (e: ReactMouseEvent) => void;

    onLeave: () => void;

  };

  children: ReactNode;

};



function appendGhostIcon(

  container: HTMLDivElement,

  item: MammothDraggedItemInfo["item"],

  dragQuantity: number,

) {

  if (item.def.iconUrl) {

    const img = document.createElement("img");

    img.src = item.def.iconUrl;

    img.alt = item.def.displayName;

    img.width = 40;

    img.height = 40;

    img.style.objectFit = "contain";

    container.appendChild(img);

  } else {

    const label = document.createElement("span");

    label.textContent = item.def.displayName.trim().slice(0, 2) || "—";

    label.style.cssText =

      "display:flex;align-items:center;justify-content:center;width:40px;height:40px;font-size:10px;font-weight:600;color:rgba(200,210,220,0.75);text-transform:uppercase";

    container.appendChild(label);

  }

  if (mammothShowStackQuantityOnSlotIcon(item.def, dragQuantity)) {

    const q = document.createElement("div");

    q.textContent = String(dragQuantity);

    q.style.cssText =

      "position:absolute;bottom:0;right:0;font-size:10px;font-weight:700;color:rgba(255,255,255,0.95);background:rgba(0,0,0,0.72);padding:1px 4px;border-radius:3px;line-height:1;pointer-events:none;font-family:ui-monospace,Menlo,Consolas,monospace";

    container.appendChild(q);

  }

}



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

      if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;

      const splitDrag =

        e.button === 1

          ? mammothHalfStackDragQuantity(item.instance.quantity, item.def.maxStack)

          : null;

      const singleUnitDrag =

        e.button === 2 ? mammothSingleUnitDragQuantity(item.instance.quantity) : null;

      if (e.button === 1 && splitDrag == null) return;

      if (e.button === 2 && singleUnitDrag == null) return;



      if (e.button === 1 || e.button === 2) {

        e.preventDefault();

        e.stopPropagation();

      }



      const dragQuantity = splitDrag ?? singleUnitDrag ?? item.instance.quantity;

      draggingRef.current = false;

      startRef.current = { x: e.clientX, y: e.clientY };



      const onMouseMove = (ev: MouseEvent) => {

        const dx = ev.clientX - startRef.current.x;

        const dy = ev.clientY - startRef.current.y;

        if (!draggingRef.current && dx * dx + dy * dy >= 4) {

          draggingRef.current = true;

          playInventoryItemDragPickSound();

          slotHover?.onLeave();

          document.body.classList.add("item-dragging");

          if (ref.current) ref.current.style.opacity = "0.45";

          onDragStartRef.current({ item, sourceSlot, dragQuantity });

          const g = document.createElement("div");

          g.style.cssText = `position:fixed;left:${ev.clientX + 8}px;top:${ev.clientY + 8}px;z-index:100000;pointer-events:none;padding:4px;background:rgba(0,0,0,0.75);border-radius:6px;border:1px solid rgba(120,200,255,0.5);box-sizing:border-box;min-width:48px;min-height:48px`;

          appendGhostIcon(g, item, dragQuantity);

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

          else if (ev.button === 2 && onItemContextMenuRef.current) onItemContextMenuRef.current();

          return;

        }

        draggingRef.current = false;

        document.body.classList.remove("item-dragging");

        if (ref.current) ref.current.style.opacity = "1";

        const result = mammothInventoryResolveDropResult(ev.clientX, ev.clientY, sourceSlot);

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


