/** Wakes the on-demand editor render loop after scene/store changes while idle. */
let wake: (() => void) | null = null;

export function registerEditorSceneRenderWake(fn: () => void): () => void {
  wake = fn;
  return () => {
    if (wake === fn) wake = null;
  };
}

export function demandEditorSceneRender(): void {
  wake?.();
}
