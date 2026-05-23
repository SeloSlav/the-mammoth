import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { buildEditorSelectionOverlayModel } from "../editor/scene/editorSelectionOverlayModel.js";
import { formatEditorSelectionStat } from "../editor/scene/editorSelectionMeshStats.js";
import { getEditorSelectionTarget } from "../editor/scene/editorSelectionTargetBridge.js";
import { useEditorStore } from "../state/editorStore.js";
import {
  editorViewportStatsCardStyle,
  editorViewportStatsEyebrowStyle,
  editorViewportStatsLabelStyle,
  editorViewportStatsPanelStyle,
  editorViewportStatsRowStyle,
  editorViewportStatsTitleStyle,
  editorViewportStatsValueStyle,
} from "./editorViewportStatsPanelStyles.js";

const stackStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  marginTop: 10,
  maxHeight: 220,
  overflowY: "auto",
  paddingRight: 4,
  overscrollBehavior: "contain",
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

function formatEntryStats(triangles: number, vertices: number): string {
  return `${formatEditorSelectionStat(triangles)} faces · ${formatEditorSelectionStat(vertices)} verts`;
}

/** Viewport badge for the current selection's mesh complexity (stacked under unit totals). */
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
    <div
      style={{
        ...editorViewportStatsPanelStyle,
        pointerEvents: showStack ? "auto" : "none",
      }}
      aria-live="polite"
      onWheel={showStack ? (event) => event.stopPropagation() : undefined}
    >
      <p style={editorViewportStatsEyebrowStyle}>{model.eyebrow}</p>
      <p style={editorViewportStatsTitleStyle}>{model.title}</p>

      {showStack ? (
        <div style={stackStyle} onWheel={(event) => event.stopPropagation()}>
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

      <div
        style={{
          ...editorViewportStatsRowStyle,
          gridTemplateColumns: "1fr 1fr",
        }}
      >
        <div style={editorViewportStatsCardStyle}>
          <span style={editorViewportStatsLabelStyle}>{showStack ? "Total faces" : "Faces"}</span>
          <span style={editorViewportStatsValueStyle}>
            {formatEditorSelectionStat(model.totals.triangles)}
          </span>
        </div>
        <div style={editorViewportStatsCardStyle}>
          <span style={editorViewportStatsLabelStyle}>
            {showStack ? "Total vertices" : "Vertices"}
          </span>
          <span style={editorViewportStatsValueStyle}>
            {formatEditorSelectionStat(model.totals.vertices)}
          </span>
        </div>
      </div>
    </div>
  );
}
