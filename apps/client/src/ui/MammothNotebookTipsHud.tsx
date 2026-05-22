import { useEffect, useSyncExternalStore, type CSSProperties } from "react";
import {
  THEME_ACCENT,
  THEME_BACKDROP_SCRIM,
  THEME_CARD_BG_STRONG,
  THEME_CARD_BORDER_STRONG,
  THEME_DIVIDER,
  THEME_PANEL_SHADOW,
  THEME_TEXT_FAINT,
  THEME_TEXT_MUTED,
  THEME_TEXT_PRIMARY,
  UI_FONT_MONO,
  UI_FONT_SANS,
} from "@the-mammoth/ui-theme";
import {
  closeFpNotebookTipsPanel,
  isFpNotebookTipsPanelOpen,
  subscribeFpNotebookTipsPanel,
} from "../game/fpApartment/fpNotebookTipsPanelState";
import { PLAYER_NOTEBOOK_TIPS } from "./playerNotebookTipsContent";

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 165,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  background: THEME_BACKDROP_SCRIM,
  backdropFilter: "blur(4px)",
};

const panelStyle: CSSProperties = {
  width: "min(92vw, 520px)",
  maxHeight: "min(82vh, 640px)",
  display: "flex",
  flexDirection: "column",
  borderRadius: 14,
  border: `1px solid ${THEME_CARD_BORDER_STRONG}`,
  background: THEME_CARD_BG_STRONG,
  boxShadow: THEME_PANEL_SHADOW,
  color: THEME_TEXT_PRIMARY,
  fontFamily: UI_FONT_SANS,
  overflow: "hidden",
};

const scrollStyle: CSSProperties = {
  overflowY: "auto",
  padding: "18px 22px 8px",
  flex: 1,
};

const btnBase: CSSProperties = {
  padding: "10px 16px",
  borderRadius: 10,
  border: `1px solid ${THEME_CARD_BORDER_STRONG}`,
  background: "rgba(255,255,255,0.06)",
  color: THEME_TEXT_PRIMARY,
  cursor: "pointer",
  fontFamily: UI_FONT_SANS,
  fontSize: 13,
  fontWeight: 650,
};

export function MammothNotebookTipsHud() {
  const open = useSyncExternalStore(
    subscribeFpNotebookTipsPanel,
    isFpNotebookTipsPanelOpen,
    isFpNotebookTipsPanelOpen,
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeFpNotebookTipsPanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div style={overlayStyle} onClick={() => closeFpNotebookTipsPanel()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mammoth-notebook-title"
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: "16px 22px 12px",
            borderBottom: `1px solid ${THEME_DIVIDER}`,
          }}
        >
          <div
            id="mammoth-notebook-title"
            style={{
              fontSize: 17,
              fontWeight: 700,
              letterSpacing: "0.02em",
              marginBottom: 4,
            }}
          >
            Runner's notebook
          </div>
          <div style={{ fontSize: 12, color: THEME_TEXT_FAINT, lineHeight: 1.45 }}>
            Scribbled on move-in day — mechanics I can't afford to forget.
          </div>
        </div>

        <div style={scrollStyle}>
          {PLAYER_NOTEBOOK_TIPS.map((section) => (
            <section key={section.heading} style={{ marginBottom: 18 }}>
              <h3
                style={{
                  margin: "0 0 8px",
                  fontSize: 13,
                  fontWeight: 700,
                  color: THEME_ACCENT,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                {section.heading}
              </h3>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  fontFamily: UI_FONT_MONO,
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  color: THEME_TEXT_MUTED,
                }}
              >
                {section.lines.map((line) => (
                  <li key={line} style={{ marginBottom: 6 }}>
                    {line}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div
          style={{
            padding: "12px 22px 16px",
            borderTop: `1px solid ${THEME_DIVIDER}`,
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button type="button" autoFocus style={btnBase} onClick={() => closeFpNotebookTipsPanel()}>
            Close (Esc)
          </button>
        </div>
      </div>
    </div>
  );
}
