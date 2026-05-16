import type { TransformControls } from "three/addons/controls/TransformControls.js";

/**
 * `TransformControls.pointerMove` ignores moves unless `getPointer().button === -1` (see three
 * `TransformControls.js`). Some browsers send `button: 0` on captured `pointermove` while the
 * primary button is held, so drags never apply → nothing commits and the next sync snaps back.
 */
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
