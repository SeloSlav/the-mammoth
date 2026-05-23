import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EDITOR_ORBIT_DRAG_SMOOTH_FACTOR } from "./editorOrbitSpeeds.js";

type OrbitControlsInertiaState = OrbitControls & {
  _sphericalDelta?: { set: (x: number, y: number, z: number) => void };
  _panOffset?: { set: (x: number, y: number, z: number) => void };
};

/**
 * Smooth orbit drag without post-release momentum.
 * Damping spreads each pointer step across a few render frames; on release we flush
 * any queued delta for accuracy, then zero inertia so the camera stops immediately.
 */
export function attachEditorOrbitSnappyFeel(orbitControls: OrbitControls): () => void {
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = EDITOR_ORBIT_DRAG_SMOOTH_FACTOR;

  const onEnd = (): void => {
    orbitControls.enableDamping = false;
    orbitControls.update();
    orbitControls.enableDamping = true;

    const internal = orbitControls as OrbitControlsInertiaState;
    internal._sphericalDelta?.set(0, 0, 0);
    internal._panOffset?.set(0, 0, 0);
  };

  orbitControls.addEventListener("end", onEnd);
  return () => {
    orbitControls.removeEventListener("end", onEnd);
  };
}
