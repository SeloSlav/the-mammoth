import type { TransformControls } from "three/addons/controls/TransformControls.js";

/** Same rationale as apps/editor `@see editorScenePatchTransformControls.ts`. */
export function patchFpTransformControlsPointerForCaptureCompat(
  transformControls: TransformControls,
): void {
  type TcPriv = {
    _getPointer: (e: PointerEvent) => {
      x: number;
      y: number;
      button: number;
    };
  };
  const tc = transformControls as unknown as TcPriv;
  const orig = tc._getPointer.bind(transformControls);
  tc._getPointer = function (this: TransformControls, event: PointerEvent) {
    const out = orig(event);
    if (this.dragging === true && event.type === "pointermove") {
      return { ...out, button: -1 };
    }
    return out;
  };
}
