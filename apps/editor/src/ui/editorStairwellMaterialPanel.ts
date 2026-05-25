import type { StairWellDef } from "@the-mammoth/schemas";
import type { EditorState } from "../state/editorStore.js";
import {
  filterMaterialTextureUrls,
  type AuthoringMaterialSlot,
} from "./editorMaterialSlotEditor.js";

export type StairwellMaterialPanelState = {
  title: string;
  detail: string;
  slot: AuthoringMaterialSlot | undefined;
  textureOptions: readonly string[];
  onPatch: (patch: Partial<AuthoringMaterialSlot>) => void;
};

function stairSlotForSelectedId(
  selectedId: string | null,
): "wall" | "floor" | "tread" | "landing" | null {
  if (selectedId === "shaft_wall") return "wall";
  if (selectedId === "shaft_floor") return "floor";
  if (
    selectedId === "stair_flights" ||
    selectedId === "stair_flight_lower" ||
    selectedId === "stair_flight_upper"
  ) {
    return "tread";
  }
  if (selectedId === "stair_landing_lower" || selectedId === "stair_landing_upper") {
    return "landing";
  }
  return null;
}

export function resolveStairwellMaterialPanelState(args: {
  selectedId: string | null;
  stairWellDef: StairWellDef;
  materialTextureUrls: readonly string[];
  patchStairWellDef: EditorState["patchStairWellDef"];
}): { panel: StairwellMaterialPanelState | null; emptyMessage: string } {
  const slot = stairSlotForSelectedId(args.selectedId);
  if (slot) {
    return {
      panel: {
        title: args.selectedId ?? "stair part",
        detail: `Editing shared stairwell ${slot} material.`,
        slot: args.stairWellDef.materials?.[slot],
        textureOptions: filterMaterialTextureUrls(args.materialTextureUrls, ["stairwell"]),
        onPatch: (patch) => {
          args.patchStairWellDef((d) => ({
            ...d,
            materials: {
              ...d.materials,
              [slot]: { ...d.materials?.[slot], ...patch },
            },
          }));
        },
      },
      emptyMessage: "",
    };
  }

  let emptyMessage = "Pick a wall, floor, flight, or landing in the outliner to edit its material.";
  if (args.selectedId) {
    emptyMessage =
      args.selectedId === "stair_entry_opening_proxy"
        ? "The opening proxy edits geometry only. Select a wall, floor, flight, or landing to edit material."
        : "That selected stairwell item does not have its own material slot.";
  }
  return { panel: null, emptyMessage };
}
