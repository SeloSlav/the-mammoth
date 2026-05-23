import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  formatEditorSelectionStat,
  measureEditorSelectionMeshStats,
  type EditorSelectionMeshStats,
} from "../editor/scene/editorSelectionMeshStats.js";
import { getEditorMyApartmentUnitStatsRoot } from "../editor/myApartment/editorMyApartmentPieceGroupBridge.js";
import { formatOwnedApartmentPreviewUnitKeyHeading } from "@the-mammoth/world";
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

const emptyStats = (): EditorSelectionMeshStats => ({
  triangles: 0,
  vertices: 0,
  meshCount: 0,
});

function readApartmentUnitStats(): EditorSelectionMeshStats {
  const root = getEditorMyApartmentUnitStatsRoot();
  if (!root) return emptyStats();
  return measureEditorSelectionMeshStats(root);
}

/** Top-left viewport badge for the preview apartment unit's total mesh complexity. */
export function EditorApartmentUnitStatsOverlay() {
  const { mode, myApartmentPreviewUnitId, myApartmentPreviewUnitKey, contentStructureEpoch } =
    useEditorStore(
    useShallow((s) => ({
      mode: s.mode,
      myApartmentPreviewUnitId: s.myApartmentPreviewUnitId,
      myApartmentPreviewUnitKey: s.myApartmentPreviewUnitKey,
      contentStructureEpoch: s.contentStructureEpoch,
    })),
  );

  const [stats, setStats] = useState<EditorSelectionMeshStats>(() => readApartmentUnitStats());

  useEffect(() => {
    if (mode !== "my_apartment_layout") return;

    const sync = () => {
      setStats((prev) => {
        const next = readApartmentUnitStats();
        if (
          prev.triangles === next.triangles &&
          prev.vertices === next.vertices &&
          prev.meshCount === next.meshCount
        ) {
          return prev;
        }
        return next;
      });
    };

    sync();
    const retry = window.setInterval(sync, 250);
    return () => window.clearInterval(retry);
  }, [mode, myApartmentPreviewUnitKey, myApartmentPreviewUnitId, contentStructureEpoch]);

  if (mode !== "my_apartment_layout") return null;

  return (
    <div style={editorViewportStatsPanelStyle} aria-live="polite">
      <p style={editorViewportStatsEyebrowStyle}>Apartment unit</p>
      <p style={editorViewportStatsTitleStyle}>
        {formatOwnedApartmentPreviewUnitKeyHeading(
          myApartmentPreviewUnitKey,
          myApartmentPreviewUnitId,
        )}
      </p>
      <div style={editorViewportStatsRowStyle}>
        <div style={editorViewportStatsCardStyle}>
          <span style={editorViewportStatsLabelStyle}>Triangles</span>
          <span style={editorViewportStatsValueStyle}>
            {formatEditorSelectionStat(stats.triangles)}
          </span>
        </div>
        <div style={editorViewportStatsCardStyle}>
          <span style={editorViewportStatsLabelStyle}>Faces</span>
          <span style={editorViewportStatsValueStyle}>
            {formatEditorSelectionStat(stats.triangles)}
          </span>
        </div>
        <div style={editorViewportStatsCardStyle}>
          <span style={editorViewportStatsLabelStyle}>Vertices</span>
          <span style={editorViewportStatsValueStyle}>
            {formatEditorSelectionStat(stats.vertices)}
          </span>
        </div>
      </div>
    </div>
  );
}
