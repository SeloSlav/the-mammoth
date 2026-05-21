import type { CSSProperties } from "react";

type Props = {
  fillFraction: number;
  widthPx?: number;
};

/** Blue vertical strip on the left edge of a hotbar slot — water bottle fill level. */
export function WaterBottleHotbarFillBar({ fillFraction, widthPx = 3 }: Props) {
  const pct = Math.min(1, Math.max(0, fillFraction));
  const barStyle: CSSProperties = {
    position: "absolute",
    left: 2,
    bottom: 2,
    width: widthPx,
    height: `${pct * 100}%`,
    maxHeight: "calc(100% - 4px)",
    background: "rgba(0, 150, 255, 0.85)",
    borderRadius: 1,
    pointerEvents: "none",
    zIndex: 2,
  };
  return <div aria-hidden style={barStyle} data-testid="water-bottle-fill-bar" />;
}
