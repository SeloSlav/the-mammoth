import type { CSSProperties, ReactNode } from "react";
import type { MammothDragSourceSlotInfo } from "./inventoryDragDropTypes";

type Props = {
  slotInfo: MammothDragSourceSlotInfo;
  isDraggingOver?: boolean;
  onClick?: () => void;
  children?: ReactNode;
  style?: CSSProperties;
};

export function MammothDroppableSlot({
  slotInfo,
  isDraggingOver,
  onClick,
  children,
  style,
}: Props) {
  return (
    <div
      role="presentation"
      data-slot-type={slotInfo.type}
      data-slot-index={String(slotInfo.index)}
      onClick={onClick}
      onDragStart={(e) => e.preventDefault()}
      style={{
        position: "relative",
        width: 52,
        height: 52,
        borderRadius: 6,
        border: `2px solid ${isDraggingOver ? "#6ae8ff" : "rgba(255,255,255,0.22)"}`,
        background: "rgba(0,0,0,0.5)",
        boxSizing: "border-box",
        cursor: onClick ? "pointer" : "default",
        userSelect: "none",
        WebkitUserSelect: "none",
        ...style,
      }}
    >
      {children}
    </div>
  );
}