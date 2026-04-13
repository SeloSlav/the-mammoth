import type { CSSProperties } from "react";

export const editorChromePanel: CSSProperties = {
  position: "fixed",
  right: 0,
  top: 0,
  bottom: 0,
  width: 300,
  background: "rgba(12,12,18,0.94)",
  color: "#ddd",
  padding: 12,
  fontSize: 13,
  boxSizing: "border-box",
  overflowY: "auto",
  zIndex: 2,
  fontFamily: "system-ui, sans-serif",
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
};
