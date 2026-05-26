import * as THREE from "three";
import type { NpcPerceptionProfile } from "@the-mammoth/game";

const OVERLAY_Y_M = 0.06;
const CONE_SEGMENTS = 28;

function makeVisionConeMesh(
  rangeM: number,
  visionHalfAngleRad: number,
): THREE.Mesh {
  const positions: number[] = [0, OVERLAY_Y_M, 0];
  for (let i = 0; i <= CONE_SEGMENTS; i++) {
    const t =
      -visionHalfAngleRad + (2 * visionHalfAngleRad * i) / CONE_SEGMENTS;
    positions.push(Math.sin(t) * rangeM, OVERLAY_Y_M, Math.cos(t) * rangeM);
  }
  const indices: number[] = [];
  for (let i = 1; i <= CONE_SEGMENTS; i++) {
    indices.push(0, i, i + 1);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return new THREE.Mesh(
    geom,
    new THREE.MeshBasicMaterial({
      color: 0x66ccff,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
}

function makeVisionConeEdges(
  rangeM: number,
  visionHalfAngleRad: number,
): THREE.LineSegments {
  const positions = new Float32Array(9);
  positions[0] = 0;
  positions[1] = OVERLAY_Y_M;
  positions[2] = 0;
  positions[3] = Math.sin(-visionHalfAngleRad) * rangeM;
  positions[4] = OVERLAY_Y_M;
  positions[5] = Math.cos(-visionHalfAngleRad) * rangeM;
  positions[6] = Math.sin(visionHalfAngleRad) * rangeM;
  positions[7] = OVERLAY_Y_M;
  positions[8] = Math.cos(visionHalfAngleRad) * rangeM;
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return new THREE.LineSegments(
    geom,
    new THREE.LineBasicMaterial({
      color: 0x88ddff,
      transparent: true,
      opacity: 0.95,
      depthTest: true,
    }),
  );
}

/** Dev overlay — forward vision cone wedge on the NPC (range + FOV). */
export class NpcDetectionDebugOverlay {
  readonly root = new THREE.Group();

  constructor(profile: NpcPerceptionProfile) {
    this.root.name = "npc_vision_cone_debug_overlay";
    this.root.add(
      makeVisionConeMesh(profile.aggroRangeM, profile.visionHalfAngleRad),
      makeVisionConeEdges(profile.aggroRangeM, profile.visionHalfAngleRad),
    );
  }

  setVisible(enabled: boolean): void {
    this.root.visible = enabled;
  }

  dispose(): void {
    this.root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = (mesh as THREE.Mesh).material;
      if (mat instanceof THREE.Material) mat.dispose();
    });
  }
}
