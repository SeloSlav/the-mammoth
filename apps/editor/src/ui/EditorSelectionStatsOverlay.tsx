import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { resolveEditorSelectionDisplayName } from "../editor/scene/editorSelectionDisplayName.js";
import {
  formatEditorSelectionStat,
  measureEditorSelectionMeshStats,
  type EditorSelectionMeshStats,
} from "../editor/scene/editorSelectionMeshStats.js";
import { getEditorSelectionTarget } from "../editor/scene/editorSelectionTargetBridge.js";
import { useEditorStore } from "../state/editorStore.js";

type OverlayStats = EditorSelectionMeshStats & { name: string };

const panelStyle: CSSProperties = {
  position: "fixed",
  left: 14,
  top: 14,
  zIndex: 5,
  pointerEvents: "none",
  fontFamily: "system-ui, sans-serif",
  minWidth: 200,
  maxWidth: 320,
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

const nameStyle: CSSProperties = {
  margin: "6px 0 0",
  fontSize: 15,
  fontWeight: 650,
  lineHeight: 1.25,
  color: "#f3f6fb",
  wordBreak: "break-word",
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

function readSelectionStats(selectedId: string | null): OverlayStats | null {
  if (!selectedId) return null;
  const target = getEditorSelectionTarget();
  if (!target) return null;
  const meshStats = measureEditorSelectionMeshStats(target);
  return {
    name: resolveEditorSelectionDisplayName(target, selectedId),
    ...meshStats,
  };
}

/** Top-left viewport badge for the current selection's mesh complexity. */
export function EditorSelectionStatsOverlay() {
  const { selectedId, mode } = useEditorStore(
    useShallow((s) => ({
      selectedId: s.selectedId,
      mode: s.mode,
    })),
  );
  const [stats, setStats] = useState<OverlayStats | null>(() => readSelectionStats(selectedId));

  useEffect(() => {
    setStats(readSelectionStats(selectedId));
    if (!selectedId) return;
    const retry = window.setInterval(() => {
      setStats((prev) => {
        const next = readSelectionStats(selectedId);
        if (!next) return prev;
        if (
          prev &&
          prev.name === next.name &&
          prev.triangles === next.triangles &&
          prev.vertices === next.vertices &&
          prev.meshCount === next.meshCount
        ) {
          return prev;
        }
        return next;
      });
    }, 250);
    return () => window.clearInterval(retry);
  }, [selectedId, mode]);

  if (!selectedId || !stats) return null;

  return (
    <div style={panelStyle} aria-live="polite">
      <p style={eyebrowStyle}>Selected object</p>
      <p style={nameStyle}>{stats.name}</p>
      <div style={statsRowStyle}>
        <div style={statCardStyle}>
          <span style={statLabelStyle}>Faces</span>
          <span style={statValueStyle}>{formatEditorSelectionStat(stats.triangles)}</span>
        </div>
        <div style={statCardStyle}>
          <span style={statLabelStyle}>Vertices</span>
          <span style={statValueStyle}>{formatEditorSelectionStat(stats.vertices)}</span>
        </div>
      </div>
    </div>
  );
}
