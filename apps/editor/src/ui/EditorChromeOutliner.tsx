import type { CSSProperties } from "react";
import type { FloorDoc, InteriorDoc } from "@the-mammoth/schemas";
import type { EditorMode } from "../state/editorStore.js";

export function EditorChromeOutliner(props: {
  mode: EditorMode;
  activeFloorDoc: FloorDoc | undefined;
  activeInteriorDoc: InteriorDoc | undefined;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  label: CSSProperties;
}) {
  const { mode, activeFloorDoc, activeInteriorDoc, selectedId, setSelectedId, label } =
    props;

  return (
    <>
      <span style={label}>Outliner</span>
      <div
        style={{
          maxHeight: 160,
          overflowY: "auto",
          border: "1px solid #333",
          borderRadius: 4,
          background: "#16161c",
        }}
      >
        {mode === "floor" && activeFloorDoc
          ? activeFloorDoc.objects.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setSelectedId(o.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 8px",
                  border: "none",
                  borderBottom: "1px solid #282830",
                  background:
                    selectedId === o.id ? "rgba(60,90,140,0.35)" : "transparent",
                  color: "#ddd",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {o.id}{" "}
                <span style={{ opacity: 0.65 }}>({o.prefabId})</span>
              </button>
            ))
          : null}
        {mode === "interior" && activeInteriorDoc
          ? activeInteriorDoc.placements.map((p) => (
              <button
                key={p.entityId}
                type="button"
                onClick={() => setSelectedId(p.entityId)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 8px",
                  border: "none",
                  borderBottom: "1px solid #282830",
                  background:
                    selectedId === p.entityId ? "rgba(60,90,140,0.35)" : "transparent",
                  color: "#ddd",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {p.entityId}{" "}
                <span style={{ opacity: 0.65 }}>
                  ({p.prefabId ?? p.assetId ?? "?"})
                </span>
              </button>
            ))
          : null}
      </div>
    </>
  );
}
