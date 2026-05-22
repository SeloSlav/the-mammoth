import { useEditorStore } from "../state/editorStore.js";

/** Viewport banner while apartment décor, lighting, walls, and mirrors mount. */
export function EditorApartmentLayoutLoadingOverlay() {
  const message = useEditorStore((s) => s.myApartmentLayoutLoadingMessage);
  if (!message) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        bottom: 0,
        right: 300,
        zIndex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          padding: "14px 20px",
          borderRadius: 8,
          background: "rgba(8, 10, 18, 0.82)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          color: "#e8ecf4",
          fontSize: 14,
          lineHeight: 1.45,
          textAlign: "center",
          maxWidth: 360,
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.35)",
        }}
      >
        {message}
      </div>
    </div>
  );
}
