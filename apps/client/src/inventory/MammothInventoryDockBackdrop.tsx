import { useSyncExternalStore, type CSSProperties } from "react";
import {
  THEME_ACCENT,
  THEME_ACCENT_ON,
  THEME_BACKDROP_SCRIM,
  THEME_CARD_BG_STRONG,
  THEME_CARD_BORDER_STRONG,
  THEME_PANEL_SHADOW,
  THEME_TEXT_MUTED,
  THEME_TEXT_PRIMARY,
  UI_FONT_SANS,
} from "@the-mammoth/ui-theme";
import {
  getFpActiveStashPanel,
  subscribeFpActiveStashPanel,
} from "../game/fpInteraction/fpActiveStashPanel";
import {
  getFpInventoryDockOpen,
  subscribeFpInventoryDockOpen,
} from "../game/fpInteraction/fpInventoryDockOpen";

/**
 * Full-screen blurred scrim + close-hint footer painted under the inventory + stash panels.
 *
 * Visible iff inventory grid OR a stash panel is mounted. Anchored visually so the player
 * focuses on the transfer — the world stays as context (still visible through the blur)
 * but no longer competes with the panels.
 *
 * Renders *under* the panels (z-index 119) but *above* world-overlay HUD elements like
 * the compass / reticule / FPS counter. Hotbar stays above (z-index 122) so it's still
 * actionable during transfer.
 */

const NO_SELECT: CSSProperties = {
  userSelect: "none",
  WebkitUserSelect: "none",
  MozUserSelect: "none",
  msUserSelect: "none",
};

const BACKDROP_Z_INDEX = 119;
const FOOTER_Z_INDEX = 123;

export function MammothInventoryDockBackdrop() {
  const invOpen = useSyncExternalStore(
    subscribeFpInventoryDockOpen,
    getFpInventoryDockOpen,
    getFpInventoryDockOpen,
  );
  const activeStash = useSyncExternalStore(
    subscribeFpActiveStashPanel,
    getFpActiveStashPanel,
    () => null,
  );

  const visible = invOpen || activeStash !== null;
  if (!visible) return null;

  const stashTitle = activeStash
    ? `${activeStash.stashLabel[0]!.toUpperCase()}${activeStash.stashLabel.slice(1)}`
    : "";

  const closeAction = activeStash ? `Close ${stashTitle}` : "Close inventory";

  return (
    <>
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: BACKDROP_Z_INDEX,
          pointerEvents: "none",
          background: THEME_BACKDROP_SCRIM,
          backdropFilter: "blur(7px) saturate(0.85)",
          WebkitBackdropFilter: "blur(7px) saturate(0.85)",
          transition: "opacity 140ms ease-out",
          ...NO_SELECT,
        }}
      />
      <div
        role="status"
        style={{
          position: "fixed",
          left: "50%",
          bottom: "max(120px, calc(env(safe-area-inset-bottom, 0px) + 110px))",
          transform: "translateX(-50%)",
          zIndex: FOOTER_Z_INDEX,
          pointerEvents: "none",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 16px",
          borderRadius: 12,
          background: THEME_CARD_BG_STRONG,
          border: `1px solid ${THEME_CARD_BORDER_STRONG}`,
          boxShadow: THEME_PANEL_SHADOW,
          color: THEME_TEXT_PRIMARY,
          fontFamily: UI_FONT_SANS,
          fontSize: 13,
          ...NO_SELECT,
        }}
      >
        <KeyCap>Tab</KeyCap>
        {activeStash ? (
          <>
            <KeyCap>E</KeyCap>
          </>
        ) : null}
        <KeyCap>Esc</KeyCap>
        <span
          style={{
            color: THEME_TEXT_MUTED,
            fontWeight: 500,
            letterSpacing: "0.01em",
          }}
        >
          {closeAction}
        </span>
      </div>
    </>
  );
}

function KeyCap({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 26,
        height: 22,
        padding: "0 7px",
        borderRadius: 6,
        background: THEME_ACCENT,
        color: THEME_ACCENT_ON,
        fontFamily: UI_FONT_SANS,
        fontWeight: 700,
        fontSize: 11,
        lineHeight: 1,
        letterSpacing: "0.02em",
        boxShadow: "0 1px 0 rgba(255,255,255,0.18) inset, 0 1px 2px rgba(0,0,0,0.4)",
      }}
    >
      {children}
    </kbd>
  );
}
