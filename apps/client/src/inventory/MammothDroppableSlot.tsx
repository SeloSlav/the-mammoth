import type { CSSProperties, ReactNode } from "react";
import type { MammothDragSourceSlotInfo } from "./inventoryDragDropTypes";
import { MammothHotLootIndicator } from "./MammothHotLootIndicator";

type Props = {
  slotInfo: MammothDragSourceSlotInfo;
  isDraggingOver?: boolean;
  /** Hold-H hot loot mode: pulse slot chrome while sweeping. */
  hotLootActive?: boolean;
  /** Per-slot progress ring after a hot-loot transfer. */
  hotLootProgress?: number;
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
  hotLootActive,
  hotLootProgress,
  onClick,
  children,
  style,
  overlayProgress,
  overlayColor = "rgba(0, 0, 0, 0.42)",
}: Props) {
  const showOverlay = overlayProgress !== undefined && overlayProgress < 1;
  const showHotLootRing = hotLootProgress !== undefined;

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
        border: `2px solid ${
          isDraggingOver ? "#6ae8ff"
          : hotLootActive ? "#6ae8ff"
          : "rgba(255,255,255,0.22)"
        }`,
        background: hotLootActive ? "rgba(106,232,255,0.08)" : "rgba(0,0,0,0.5)",
        boxShadow: hotLootActive ? "0 0 10px rgba(106,232,255,0.35)" : undefined,
        boxSizing: "border-box",
        cursor: onClick ? "pointer" : "default",
        userSelect: "none",
        WebkitUserSelect: "none",
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
      {showHotLootRing ? <MammothHotLootIndicator progress={hotLootProgress} /> : null}
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
