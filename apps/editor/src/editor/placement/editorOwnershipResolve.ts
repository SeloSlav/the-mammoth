import type { EditorMode, EditorWorkspace } from "../../state/editorStoreTypes.js";

export type SaveTargetKind = "shared" | "local" | "none";

/**
 * Human-readable save routing for the inspector banner (selection is resolved separately).
 * Maps workspace + mode → where "Save to disk" writes.
 */
export function describeEditorSaveTarget(args: {
  workspace: EditorWorkspace;
  mode: EditorMode;
  activeFloorDocId: string;
  activeInteriorDocId: string;
  activeCellDocId: string;
  activePrefabDefId: string | null;
  activeFloorOverrideDocId: string | null;
}): { kind: SaveTargetKind; title: string; detail: string } {
  const {
    workspace,
    mode,
    activeFloorDocId,
    activeInteriorDocId,
    activeCellDocId,
    activePrefabDefId,
    activeFloorOverrideDocId,
  } = args;

  if (mode === "cab") {
    return {
      kind: "shared",
      title: "Shared — ElevatorCabDef",
      detail: "content/elevator/cab.json (all shafts use this cab look)",
    };
  }
  if (mode === "landing_preview") {
    return {
      kind: "shared",
      title: "Shared — CorridorDoorKit",
      detail: "content/elevator/landing_kit.json (shared corridor door kit for elevator landings)",
    };
  }
  if (mode === "stairwell_preview") {
    return {
      kind: "shared",
      title: "Shared — StairWellDef",
      detail: "content/elevator/stairwell.json (all stairwells use this visual definition)",
    };
  }
  if (mode === "fp_viewmodel") {
    return {
      kind: "local",
      title: "Weapon presentation",
      detail: "content/weapons/*.presentation.json (per weapon)",
    };
  }

  if (mode === "floor") {
    return {
      kind: "local",
      title: "Local — FloorDoc",
      detail: `content/building/floors/${activeFloorDocId}.json`,
    };
  }
  if (mode === "floor_override") {
    return {
      kind: "local",
      title: "Local — FloorOverrideDoc",
      detail: activeFloorOverrideDocId
        ? `content/building/floor-overrides/${activeFloorOverrideDocId}.json`
        : "Pick an override doc",
    };
  }
  if (mode === "interior") {
    return {
      kind: "local",
      title: "Local — InteriorDoc",
      detail: `content/interiors/${activeInteriorDocId}.json`,
    };
  }
  if (mode === "cell") {
    return {
      kind: "local",
      title: "Local — CellDoc",
      detail: `content/cells/${activeCellDocId}.json`,
    };
  }
  if (mode === "prefab") {
    return {
      kind: "local",
      title: "Local — PrefabDef",
      detail: activePrefabDefId
        ? `content/prefabs/${activePrefabDefId}.json`
        : "Pick a prefab definition",
    };
  }

  if (mode === "my_apartment_layout") {
    return {
      kind: "local",
      title: "Local — OwnedApartmentBuiltinsDoc",
      detail: "content/apartment/owned_apartment_builtins.json (bed / wardrobe / footlocker layout)",
    };
  }

  return {
    kind: "none",
    title: "Unknown mode",
    detail: `workspace=${workspace}`,
  };
}
