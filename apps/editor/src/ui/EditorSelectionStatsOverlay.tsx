import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { buildEditorSelectionOverlayModel } from "../editor/scene/editorSelectionOverlayModel.js";
import { formatEditorSelectionStat } from "../editor/scene/editorSelectionMeshStats.js";
import { getEditorSelectionTarget } from "../editor/scene/editorSelectionTargetBridge.js";
import { useEditorStore } from "../state/editorStore.js";

const panelStyle: CSSProperties = {
  position: "fixed",
  left: 14,
  top: 14,
  zIndex: 5,
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

const eyebrowStyle: CSSProperties = {
  margin: 0,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "rgba(180, 196, 220, 0.72)",
};

const titleStyle: CSSProperties = {
  margin: "6px 0 0",
  fontSize: 15,
  fontWeight: 650,
  lineHeight: 1.25,
  color: "#f3f6fb",
  wordBreak: "break-word",
};

const stackStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  marginTop: 10,
  maxHeight: 220,
  overflowY: "auto",
  paddingRight: 2,
};

const entryStyle: CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  background: "rgba(255, 255, 255, 0.045)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
};

const entryNameStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontWeight: 600,
  lineHeight: 1.25,
  color: "#eef3fb",
  wordBreak: "break-word",
};

const entryMetaStyle: CSSProperties = {
  margin: "4px 0 0",
  fontSize: 11,
  fontWeight: 500,
  color: "rgba(170, 186, 210, 0.82)",
  fontVariantNumeric: "tabular-nums",
};

const statsRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
  marginTop: 12,
};

const statCardStyle: CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  background: "rgba(255, 255, 255, 0.045)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
};

const statLabelStyle: CSSProperties = {
  display: "block",
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "rgba(170, 186, 210, 0.78)",
};

const statValueStyle: CSSProperties = {
  display: "block",
  marginTop: 4,
  fontSize: 18,
  fontWeight: 700,
  fontVariantNumeric: "tabular-nums",
  color: "#dce8ff",
};

function formatEntryStats(triangles: number, vertices: number): string {
  return `${formatEditorSelectionStat(triangles)} faces · ${formatEditorSelectionStat(vertices)} verts`;
}

/** Top-left viewport badge for the current selection's mesh complexity. */
export function EditorSelectionStatsOverlay() {
  const selectionState = useEditorStore(
    useShallow((s) => ({
      selectedId: s.selectedId,
      mode: s.mode,
      myApartmentMultiselectExtraIds: s.myApartmentMultiselectExtraIds,
      objectGroups: s.ownedApartmentBuiltins.objectGroups,
      placedItems: s.ownedApartmentBuiltins.placedItems,
    })),
  );

  const [model, setModel] = useState(() =>
    buildEditorSelectionOverlayModel({
      ...selectionState,
      fallbackTarget: getEditorSelectionTarget(),
    }),
  );

  useEffect(() => {
    const read = () =>
      buildEditorSelectionOverlayModel({
        ...selectionState,
        fallbackTarget: getEditorSelectionTarget(),
      });

    setModel(read());
    if (!selectionState.selectedId) return;

    const retry = window.setInterval(() => {
      setModel((prev) => {
        const next = read();
        if (!next) return prev;
        if (
          prev &&
          prev.kind === next.kind &&
          prev.title === next.title &&
          prev.entries.length === next.entries.length &&
          prev.totals.triangles === next.totals.triangles &&
          prev.totals.vertices === next.totals.vertices &&
          prev.entries.every(
            (entry, index) =>
              entry.name === next.entries[index]?.name &&
              entry.stats.triangles === next.entries[index]?.stats.triangles &&
              entry.stats.vertices === next.entries[index]?.stats.vertices,
          )
        ) {
          return prev;
        }
        return next;
      });
    }, 250);

    return () => window.clearInterval(retry);
  }, [selectionState]);

  if (!selectionState.selectedId || !model) return null;

  const showStack = model.kind !== "single";

  return (
    <div style={panelStyle} aria-live="polite">
      <p style={eyebrowStyle}>{model.eyebrow}</p>
      <p style={titleStyle}>{model.title}</p>

      {showStack ? (
        <div style={stackStyle}>
          {model.entries.map((entry) => (
            <div key={entry.selectionId} style={entryStyle}>
              <p style={entryNameStyle}>{entry.name}</p>
              <p style={entryMetaStyle}>
                {formatEntryStats(entry.stats.triangles, entry.stats.vertices)}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <div style={statsRowStyle}>
        <div style={statCardStyle}>
          <span style={statLabelStyle}>{showStack ? "Total faces" : "Faces"}</span>
          <span style={statValueStyle}>{formatEditorSelectionStat(model.totals.triangles)}</span>
        </div>
        <div style={statCardStyle}>
          <span style={statLabelStyle}>{showStack ? "Total vertices" : "Vertices"}</span>
          <span style={statValueStyle}>{formatEditorSelectionStat(model.totals.vertices)}</span>
        </div>
      </div>
    </div>
  );
}
