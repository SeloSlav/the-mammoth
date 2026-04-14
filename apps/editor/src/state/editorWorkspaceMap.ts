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
  if (workspace === "cab") return "cab";
  if (workspace === "landing") return landingDocKindToMode(landingDocKind);
  return "floor";
}
