import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { THEME_TEXT_FAINT } from "@the-mammoth/ui-theme";

type Props = {
  slotIndex: number;
  onHoverStart: (slotIndex: number, e: ReactMouseEvent) => void;
  onHoverMove: (e: ReactMouseEvent) => void;
  onHoverEnd: () => void;
  style?: CSSProperties;
};

/** Greyed-out backpack slot reserved for a future upgrade tier. */
export function MammothLockedInventorySlot({
  slotIndex,
  onHoverStart,
  onHoverMove,
  onHoverEnd,
  style,
}: Props) {
  return (
    <div
      role="presentation"
      data-slot-type="inventory-locked"
      data-slot-index={String(slotIndex)}
      onMouseEnter={(e) => onHoverStart(slotIndex, e)}
      onMouseMove={onHoverMove}
      onMouseLeave={onHoverEnd}
      onDragStart={(e) => e.preventDefault()}
      style={{
        position: "relative",
        width: 52,
        height: 52,
        borderRadius: 6,
        border: "2px dashed rgba(255,255,255,0.14)",
        background: "rgba(0,0,0,0.28)",
        boxSizing: "border-box",
        opacity: 0.55,
        cursor: "not-allowed",
        userSelect: "none",
        WebkitUserSelect: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
    >
      <svg
        width={18}
        height={18}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
        style={{ opacity: 0.35, color: THEME_TEXT_FAINT }}
      >
        <path
          d="M8 10V8a4 4 0 1 1 8 0v2"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <rect
          x="5"
          y="10"
          width="14"
          height="10"
          rx="2"
          stroke="currentColor"
          strokeWidth="1.75"
        />
      </svg>
    </div>
  );
}
