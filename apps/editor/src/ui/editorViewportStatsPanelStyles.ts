import type { CSSProperties } from "react";

export const editorViewportStatsStackStyle: CSSProperties = {
  position: "fixed",
  left: 14,
  top: 14,
  zIndex: 5,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  alignItems: "flex-start",
  pointerEvents: "none",
};

export const editorViewportStatsPanelStyle: CSSProperties = {
  pointerEvents: "none",
  fontFamily: "system-ui, sans-serif",
  minWidth: 200,
  maxWidth: 340,
  padding: "12px 14px",
  borderRadius: 12,
  background: "linear-gradient(165deg, rgba(14, 16, 24, 0.92) 0%, rgba(8, 10, 16, 0.88) 100%)",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  boxShadow: "0 10px 36px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.06)",
  backdropFilter: "blur(10px)",
};

export const editorViewportStatsEyebrowStyle: CSSProperties = {
  margin: 0,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "rgba(180, 196, 220, 0.72)",
};

export const editorViewportStatsTitleStyle: CSSProperties = {
  margin: "6px 0 0",
  fontSize: 15,
  fontWeight: 650,
  lineHeight: 1.25,
  color: "#f3f6fb",
  wordBreak: "break-word",
};

export const editorViewportStatsRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: 8,
  marginTop: 12,
};

export const editorViewportStatsCardStyle: CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  background: "rgba(255, 255, 255, 0.045)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
};

export const editorViewportStatsLabelStyle: CSSProperties = {
  display: "block",
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "rgba(170, 186, 210, 0.78)",
};

export const editorViewportStatsValueStyle: CSSProperties = {
  display: "block",
  marginTop: 4,
  fontSize: 18,
  fontWeight: 700,
  fontVariantNumeric: "tabular-nums",
  color: "#dce8ff",
};
