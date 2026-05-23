import { EditorApartmentUnitStatsOverlay } from "./EditorApartmentUnitStatsOverlay.js";
import { EditorSelectionStatsOverlay } from "./EditorSelectionStatsOverlay.js";
import { editorViewportStatsStackStyle } from "./editorViewportStatsPanelStyles.js";

/** Top-left viewport stats cards: unit totals above selection detail. */
export function EditorViewportStatsStack() {
  return (
    <div style={editorViewportStatsStackStyle}>
      <EditorApartmentUnitStatsOverlay />
      <EditorSelectionStatsOverlay />
    </div>
  );
}
