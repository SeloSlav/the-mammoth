import type { EditorMode, EditorWorkspace, LandingDocKind } from "./editorStoreTypes.js";

export function landingDocKindToMode(kind: LandingDocKind): EditorMode {
  switch (kind) {
    case "kit":
      return "landing_preview";
    case "interior":
      return "interior";
    case "cell":
      return "cell";
    case "prefab":
      return "prefab";
    case "floor_override":
      return "floor_override";
  }
}

export function workspaceToInitialMode(
  workspace: EditorWorkspace,
  landingDocKind: LandingDocKind,
): EditorMode {
  switch (workspace) {
    case "apartment":
      return "my_apartment_layout";
    case "cab":
      return "cab";
    case "stairwell":
      return "stairwell_preview";
    case "landing":
      return landingDocKindToMode(landingDocKind);
    case "combat_sim":
      return "my_apartment_layout";
  }
}
