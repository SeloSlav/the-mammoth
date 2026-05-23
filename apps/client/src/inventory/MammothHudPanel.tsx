import type { CSSProperties, ReactNode } from "react";
import {
  THEME_CARD_BG_STRONG,
  THEME_CARD_BORDER_STRONG,
  THEME_DIVIDER,
  THEME_PANEL_SHADOW,
  THEME_TEXT_FAINT,
  THEME_TEXT_MUTED,
  THEME_TEXT_PRIMARY,
  UI_FONT_SANS,
} from "@the-mammoth/ui-theme";

/**
 * Shared chrome for inventory + stash side-by-side panels inside the dock overlay.
 *
 * Same padding, border, shadow, header treatment everywhere — only the body content
 * (slot grid layout, water bar, fertilizer note, etc.) varies. Centralizes the visual
 * grammar so adding a new stash kind doesn't recreate a slightly-different look.
 */

const NO_SELECT: CSSProperties = {
  userSelect: "none",
  WebkitUserSelect: "none",
  MozUserSelect: "none",
  msUserSelect: "none",
};

/**
 * Canonical dock panel width.
 *
 * Derived from slot grid width + horizontal chrome. Inventory and quick-craft panels use
 * {@link mammothHudPanelWidthForGridCols}; stash kinds with wider grids opt into overrides.
 */
export const MAMMOTH_HUD_SLOT_PX = 52;
export const MAMMOTH_HUD_SLOT_GAP_PX = 6;
/** Left + right padding (18×2) + 1px border each side. */
export const MAMMOTH_HUD_PANEL_HORIZONTAL_CHROME_PX = 38;

export function mammothHudPanelWidthForGridCols(cols: number): number {
  const gridW = cols * MAMMOTH_HUD_SLOT_PX + Math.max(0, cols - 1) * MAMMOTH_HUD_SLOT_GAP_PX;
  return gridW + MAMMOTH_HUD_PANEL_HORIZONTAL_CHROME_PX;
}

/** Player inventory panel — 4 columns × 3 rows, no dead space. */
export const MAMMOTH_INVENTORY_PANEL_WIDTH_PX = mammothHudPanelWidthForGridCols(4);

/** Quick craft icon grid beside inventory (Tab). */
export const MAMMOTH_QUICK_CRAFT_PANEL_WIDTH_PX = mammothHudPanelWidthForGridCols(4);

/** Legacy default for stash panels that center smaller grids inside a wider card. */
export const MAMMOTH_HUD_PANEL_WIDTH_PX = 380;

type Props = {
  title: string;
  subtitle?: string;
  accent?: string;
  children: ReactNode;
  testid?: string;
  /** Extra DOM markers (e.g. data-mammoth-inventory) the engine reads via querySelector. */
  domMarkers?: Record<string, string>;
  /** Override the canonical width; reserved for kinds whose slot grid genuinely exceeds it. */
  widthPx?: number;
  onContextMenu?: (e: React.MouseEvent) => void;
};

export function MammothHudPanel({
  title,
  subtitle,
  accent,
  children,
  testid,
  domMarkers,
  widthPx,
  onContextMenu,
}: Props) {
  const width = widthPx ?? MAMMOTH_HUD_PANEL_WIDTH_PX;
  return (
    <div
      onContextMenu={onContextMenu}
      onDragStart={(e) => e.preventDefault()}
      data-testid={testid}
      {...(domMarkers ?? {})}
      style={{
        pointerEvents: "auto",
        boxSizing: "border-box",
        width,
        padding: "16px 18px 18px",
        borderRadius: 14,
        background: THEME_CARD_BG_STRONG,
        border: `1px solid ${THEME_CARD_BORDER_STRONG}`,
        boxShadow: THEME_PANEL_SHADOW,
        color: THEME_TEXT_PRIMARY,
        fontFamily: UI_FONT_SANS,
        backdropFilter: "blur(2px)",
        ...NO_SELECT,
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: "0.02em",
          color: accent ?? THEME_TEXT_PRIMARY,
          marginBottom: subtitle ? 4 : 12,
        }}
      >
        {title}
      </div>
      {subtitle ? (
        <div
          style={{
            fontSize: 11,
            color: THEME_TEXT_FAINT,
            lineHeight: 1.5,
            marginBottom: 12,
            overflowWrap: "break-word",
          }}
        >
          {subtitle}
        </div>
      ) : null}
      <div
        style={{
          height: 1,
          background: THEME_DIVIDER,
          marginBottom: 14,
          opacity: 0.6,
        }}
      />
      <div style={{ color: THEME_TEXT_MUTED, overflowWrap: "break-word" }}>{children}</div>
    </div>
  );
}
