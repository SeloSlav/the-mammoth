import type { CSSProperties, ReactNode } from "react";
import type { MammothDragSourceSlotInfo } from "./inventoryDragDropTypes";

type Props = {
  slotInfo: MammothDragSourceSlotInfo;
  isDraggingOver?: boolean;
  onClick?: () => void;
  children?: ReactNode;
  style?: CSSProperties;
  /** 0 = full dim, 1 = clear; same semantics as vibe Hotbar `overlayProgress`. */
  overlayProgress?: number;
  overlayColor?: string;
};

export function MammothDroppableSlot({
  slotInfo,
  isDraggingOver,
  onClick,
  children,
  style,
  overlayProgress,
  overlayColor = "rgba(0, 0, 0, 0.42)",
}: Props) {
  const showOverlay = overlayProgress !== undefined && overlayProgress < 1;

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
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
      {showOverlay && overlayProgress !== undefined ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 5,
            pointerEvents: "none",
            isolation: "isolate",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: `${(1 - overlayProgress) * 100}%`,
              backgroundColor: overlayColor,
              borderRadius: 4,
            }}
            title={`Use cooldown: ${Math.round((1 - overlayProgress) * 100)}% remaining`}
          />
        </div>
      ) : null}
    </div>
  );
}
