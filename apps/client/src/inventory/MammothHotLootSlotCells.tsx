import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import type {
  MammothDragSourceSlotInfo,
  MammothDraggedItemInfo,
  MammothDropResult,
  MammothPopulatedItem,
} from "./inventoryDragDropTypes";
import { MammothDraggableItem } from "./MammothDraggableItem";
import { MammothDroppableSlot } from "./MammothDroppableSlot";
import {
  useMammothHotLootSlotChrome,
  useMammothHotLootSlotHover,
} from "./mammothHotLootSlotBindings";

type TooltipHandlers = {
  openItemTooltipForSlot: (
    slotInfo: MammothDragSourceSlotInfo,
    pop: MammothPopulatedItem,
    e: ReactMouseEvent,
  ) => void;
  updateTooltipPositionFromHoverEvent: (e: ReactMouseEvent) => void;
  hideItemTooltip: () => void;
};

type PlayerSlotCellProps = {
  pop: MammothPopulatedItem | null;
  slotInfo: MammothDragSourceSlotInfo;
  isDraggingOver: boolean;
  tooltip: TooltipHandlers;
  onDragStart: (info: MammothDraggedItemInfo) => void;
  onDrop: (result: MammothDropResult) => void;
  onItemContextMenu: () => void;
  onActivate?: () => void;
  slotInner: (pop: MammothPopulatedItem | null) => ReactNode;
  toInstanceId: (pop: MammothPopulatedItem) => bigint;
  droppableStyle?: CSSProperties;
  overlayProgress?: number;
  onClick?: () => void;
  slotPrefix: string;
  slotOverlay?: ReactNode;
};

/** Inventory or hotbar cell with hold-H hot loot hover wiring. */
export function MammothPlayerCarrySlotCell({
  pop,
  slotInfo,
  isDraggingOver,
  tooltip,
  onDragStart,
  onDrop,
  onItemContextMenu,
  onActivate,
  slotInner,
  toInstanceId,
  droppableStyle,
  overlayProgress,
  onClick,
  slotPrefix,
  slotOverlay,
}: PlayerSlotCellProps) {
  const hotLootChrome = useMammothHotLootSlotChrome(pop, slotInfo);
  const slotHover = useMammothHotLootSlotHover(pop, slotInfo, "player", {
    onEnter: (e) => {
      if (pop) tooltip.openItemTooltipForSlot(slotInfo, pop, e);
    },
    onMove: tooltip.updateTooltipPositionFromHoverEvent,
    onLeave: tooltip.hideItemTooltip,
  });

  return (
    <MammothDroppableSlot
      slotInfo={slotInfo}
      isDraggingOver={isDraggingOver}
      hotLootActive={hotLootChrome.hotLootActive}
      hotLootProgress={hotLootChrome.hotLootProgress}
      overlayProgress={overlayProgress}
      onClick={onClick}
      style={droppableStyle}
    >
      {slotOverlay}
      {pop ? (
        <MammothDraggableItem
          key={`${slotPrefix}-${String(toInstanceId(pop))}`}
          item={pop}
          sourceSlot={slotInfo}
          onDragStart={onDragStart}
          onDrop={onDrop}
          onActivate={onActivate}
          onItemContextMenu={onItemContextMenu}
          slotHover={slotHover}
        >
          {slotInner(pop)}
        </MammothDraggableItem>
      ) : null}
    </MammothDroppableSlot>
  );
}

type StashSlotCellProps = {
  pop: MammothPopulatedItem | null;
  slotIndex: number;
  isDraggingOver: boolean;
  tooltip: TooltipHandlers;
  onDragStart: (info: MammothDraggedItemInfo) => void;
  onDrop: (result: MammothDropResult) => void;
  onItemContextMenu: () => void;
  slotInner: (pop: MammothPopulatedItem | null) => ReactNode;
  toInstanceId: (pop: MammothPopulatedItem) => bigint;
};

export function MammothStashSlotCell({
  pop,
  slotIndex,
  isDraggingOver,
  tooltip,
  onDragStart,
  onDrop,
  onItemContextMenu,
  slotInner,
  toInstanceId,
}: StashSlotCellProps) {
  const slotInfo = { type: "stash" as const, index: slotIndex };
  const hotLootChrome = useMammothHotLootSlotChrome(pop, slotInfo);
  const slotHover = useMammothHotLootSlotHover(pop, slotInfo, "stash", {
    onEnter: (e) => {
      if (pop) tooltip.openItemTooltipForSlot(slotInfo, pop, e);
    },
    onMove: tooltip.updateTooltipPositionFromHoverEvent,
    onLeave: tooltip.hideItemTooltip,
  });

  return (
    <MammothDroppableSlot
      slotInfo={slotInfo}
      isDraggingOver={isDraggingOver}
      hotLootActive={hotLootChrome.hotLootActive}
      hotLootProgress={hotLootChrome.hotLootProgress}
    >
      {pop ? (
        <MammothDraggableItem
          key={`stash-${String(toInstanceId(pop))}`}
          item={pop}
          sourceSlot={slotInfo}
          onDragStart={onDragStart}
          onDrop={onDrop}
          onItemContextMenu={onItemContextMenu}
          slotHover={slotHover}
        >
          {slotInner(pop)}
        </MammothDraggableItem>
      ) : null}
    </MammothDroppableSlot>
  );
}
