import type { CSSProperties } from "react";

export const editorChromePanel: CSSProperties = {
  position: "fixed",
  right: 0,
  top: 0,
  bottom: 0,
  width: 312,
  background: "linear-gradient(168deg, #11111a 0%, #0c0c12 48%, #09090e 100%)",
  color: "#ddd",
  padding: 0,
  fontSize: 13,
  boxSizing: "border-box",
  overflow: "visible",
  display: "flex",
  flexDirection: "column",
  zIndex: 2,
  fontFamily: "system-ui, sans-serif",
  boxShadow: "-6px 0 28px rgba(0,0,0,0.45)",
};

/** Jump-to-section toolbar — fixed strip at top of the rail (scroll stays below). */
export const editorChromePanelJumpBarWrap: CSSProperties = {
  flexShrink: 0,
  padding: "8px 10px 10px",
  borderBottom: "1px solid rgba(255,255,255,0.12)",
  background: "linear-gradient(180deg, #13131c 0%, #101018 72%, #0e0e15 100%)",
  boxShadow: "inset 0 -1px 0 rgba(0,0,0,0.25)",
};

/** Scrollable column for all authoring cards beneath the jump bar. */
export const editorChromePanelBody: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  padding: "12px 12px 18px",
  boxSizing: "border-box",
};

/** Top-of-panel title (e.g. “Authoring”). */
export const editorChromePanelTitle: CSSProperties = {
  margin: "0 0 12px",
  padding: "0 0 12px",
  borderBottom: "1px solid rgba(255,255,255,0.12)",
  fontSize: 14,
  fontWeight: 700,
  letterSpacing: "0.02em",
  color: "#f1f4fa",
};

/** Card container for a major sidebar region. */
export const editorChromeSection: CSSProperties = {
  marginBottom: 12,
  padding: "12px 11px",
  borderRadius: 10,
  background: "linear-gradient(180deg, rgba(255,255,255,0.062) 0%, rgba(255,255,255,0.028) 100%)",
  border: "1px solid rgba(255,255,255,0.1)",
  boxShadow: "0 4px 20px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.05)",
};

/** Primary heading inside a section card (Outliner, Inspector, Import décor…). */
export const editorChromeSectionTitle: CSSProperties = {
  display: "block",
  margin: "0 0 10px",
  padding: "0 0 9px",
  borderBottom: "1px solid rgba(255,255,255,0.12)",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "rgba(229,236,246,0.94)",
};

/**
 * Divider sub-heading inside one large card (e.g. Disk / Edits inside the apartment card).
 */
export const editorChromeGroupTitle: CSSProperties = {
  display: "block",
  margin: "14px 0 8px",
  paddingTop: 12,
  borderTop: "1px solid rgba(255,255,255,0.09)",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  color: "rgba(200,210,225,0.82)",
};

/** Muted explanatory copy (helps, disclaimers). */
export const editorChromeHelp: CSSProperties = {
  margin: "8px 0 0",
  fontSize: 11,
  opacity: 0.74,
  lineHeight: 1.45,
};

/**
 * Labels for sub-groups under one section (“History”, “Content”, …).
 */
export const editorChromeSubsectionLabel: CSSProperties = {
  display: "block",
  margin: "14px 0 6px",
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "rgba(195,206,218,0.72)",
};

export const editorChromeSubsectionLabelFirst: CSSProperties = {
  ...editorChromeSubsectionLabel,
  margin: "8px 0 6px",
};

export const editorChromeLabel: CSSProperties = {
  display: "block",
  marginTop: 10,
  marginBottom: 4,
  opacity: 0.9,
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

export const editorChromeInput: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "#1e1e28",
  border: "1px solid #333",
  color: "#eee",
  padding: "4px 6px",
  borderRadius: 4,
};

export const editorChromeRowBtn: CSSProperties = {
  marginRight: 6,
  marginTop: 6,
  padding: "4px 8px",
  cursor: "pointer",
  border: "1px solid #444",
  borderRadius: 4,
  background: "#2a2a34",
  color: "#fff",
  outline: "none",
};

/** Dense toolbar buttons (saved group rows, capsule toolbars). */
export const editorChromeRowBtnCompact: CSSProperties = {
  ...editorChromeRowBtn,
  marginRight: 4,
  marginTop: 4,
  padding: "2px 7px",
  fontSize: 11,
};

/** Primary call-to-action for writing authoring JSON to `content/` (vs Reload / Undo). */
export const editorChromeDiskSaveBtn: CSSProperties = {
  ...editorChromeRowBtn,
  fontWeight: 600,
  padding: "6px 12px",
  background: "linear-gradient(180deg, #2870ff 0%, #1854d9 52%, #1447b8 100%)",
  border: "1px solid #6ca8ff",
  boxShadow:
    "0 2px 10px rgba(40, 112, 255, 0.42), inset 0 1px 0 rgba(255,255,255,0.14)",
};
