import * as THREE from "three";
import {
  npcCrouchAggroRangeM,
  type NpcPerceptionProfile,
} from "@the-mammoth/game";

const OVERLAY_Y_M = 0.06;
const RING_SEGMENTS = 64;
const CONE_SEGMENTS = 28;

function makeRingLineLoop(radiusM: number, color: number, opacity: number): THREE.LineLoop {
  const positions = new Float32Array((RING_SEGMENTS + 1) * 3);
  for (let i = 0; i <= RING_SEGMENTS; i++) {
    const t = (i / RING_SEGMENTS) * Math.PI * 2;
    positions[i * 3] = Math.sin(t) * radiusM;
    positions[i * 3 + 1] = OVERLAY_Y_M;
    positions[i * 3 + 2] = Math.cos(t) * radiusM;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return new THREE.LineLoop(
    geom,
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthTest: true,
    }),
  );
}

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

/** Dev overlay — standing/crouch detection rings + forward vision cone wedge. */
export class NpcDetectionDebugOverlay {
  readonly root = new THREE.Group();
  private readonly detectionRadiusGroup = new THREE.Group();
  private readonly visionConeGroup = new THREE.Group();

  constructor(profile: NpcPerceptionProfile) {
    this.root.name = "npc_detection_debug_overlay";
    const crouchRangeM = npcCrouchAggroRangeM(profile);

    this.detectionRadiusGroup.name = "npc_detection_radius";
    this.detectionRadiusGroup.add(
      makeRingLineLoop(profile.aggroRangeM, 0xffcc44, 0.92),
      makeRingLineLoop(crouchRangeM, 0xff9955, 0.72),
    );
    this.root.add(this.detectionRadiusGroup);

    this.visionConeGroup.name = "npc_vision_cone";
    this.visionConeGroup.add(
      makeVisionConeMesh(profile.aggroRangeM, profile.visionHalfAngleRad),
      makeVisionConeEdges(profile.aggroRangeM, profile.visionHalfAngleRad),
    );
    this.root.add(this.visionConeGroup);
  }

  setShowDetectionRadius(enabled: boolean): void {
    this.detectionRadiusGroup.visible = enabled;
  }

  setShowVisionCone(enabled: boolean): void {
    this.visionConeGroup.visible = enabled;
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
