let frameEditorBuildingImpl: (() => void) | null = null;
let frameEditorSelectionImpl: (() => void) | null = null;
let frameFocusedStoryImpl: (() => void) | null = null;

export function registerEditorNavigationBridge(
  handlers: {
    frameEditorBuilding?: () => void;
    frameEditorSelection?: () => void;
    frameFocusedStory?: () => void;
  } | null,
): void {
  if (!handlers) {
    frameEditorBuildingImpl = null;
    frameEditorSelectionImpl = null;
    frameFocusedStoryImpl = null;
    return;
  }
  frameEditorBuildingImpl = handlers.frameEditorBuilding ?? null;
  frameEditorSelectionImpl = handlers.frameEditorSelection ?? null;
  frameFocusedStoryImpl = handlers.frameFocusedStory ?? null;
}

export function frameEditorBuilding(): void {
  frameEditorBuildingImpl?.();
}

export function frameEditorSelection(): void {
  frameEditorSelectionImpl?.();
}

export function frameFocusedStory(): void {
  frameFocusedStoryImpl?.();
}
