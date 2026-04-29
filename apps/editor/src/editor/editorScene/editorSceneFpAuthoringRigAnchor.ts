import * as THREE from "three";
import {
  FP_VIEWMODEL_DEFAULT_RIG_ROOT_AUTHORED,
  type LocalFirstPersonPresenter,
} from "@the-mammoth/engine";

/** Wireframe cube at canonical rig-rest anchor; editor-only. */
export function createEditorFpDefaultRigAnchorLines(): {
  attach: (pres: LocalFirstPersonPresenter) => void;
  dispose: () => void;
} {
  let lines: THREE.LineSegments | null = null;

  function dispose(): void {
    if (!lines) return;
    lines.parent?.remove(lines);
    lines.geometry.dispose();
    (lines.material as THREE.Material).dispose();
    lines = null;
  }

  function attach(pres: LocalFirstPersonPresenter): void {
    dispose();
    const fpRoot = pres.getFpViewmodelAuthoringRoot();
    const box = new THREE.BoxGeometry(0.11, 0.11, 0.11);
    const edges = new THREE.EdgesGeometry(box);
    box.dispose();
    const mat = new THREE.LineBasicMaterial({
      color: 0x5599dd,
      transparent: true,
      opacity: 0.92,
      depthTest: true,
    });
    const next = new THREE.LineSegments(edges, mat);
    next.name = "fp_default_rig_anchor_editor";
    const d = FP_VIEWMODEL_DEFAULT_RIG_ROOT_AUTHORED.positionM;
    next.position.set(d.x, d.y, d.z);
    next.renderOrder = 999;
    fpRoot.add(next);
    lines = next;
  }

  return { attach, dispose };
}
