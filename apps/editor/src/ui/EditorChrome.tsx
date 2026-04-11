/** Editor side chrome (React); 3D view is owned by the engine-style loop in App.tsx. */
export function EditorChrome() {
  return (
    <div
      style={{
        position: "fixed",
        right: 0,
        top: 0,
        bottom: 0,
        width: 280,
        background: "rgba(12,12,18,0.92)",
        color: "#ddd",
        padding: 12,
        fontSize: 13,
        boxSizing: "border-box",
      }}
    >
      <strong>Editor</strong>
      <p style={{ opacity: 0.85 }}>
        TODO: selection, transforms, prefab placement, save to disk (wired to same
        content docs as client).
      </p>
    </div>
  );
}
