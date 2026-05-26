import * as THREE from "three";
import {
  BABUSHKA_NPC_PERCEPTION,
  npcCrouchAggroRangeM,
  npcDetectionRangeM,
} from "@the-mammoth/game";

const OVERLAY_Y_M = 0.06;
const RING_SEGMENTS = 64;

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

/** Dev rings at the local player's feet — standing vs crouch NPC detection range. */
export function createFpPlayerStealthDetectionDebugOverlay(): {
  group: THREE.Group;
  update(pos: THREE.Vector3, crouch: boolean): void;
  setEnabled(enabled: boolean): void;
} {
  const group = new THREE.Group();
  group.name = "fpPlayerStealthDetectionDebug";
  group.visible = false;

  const standingRangeM = BABUSHKA_NPC_PERCEPTION.aggroRangeM;
  const crouchRangeM = npcCrouchAggroRangeM(BABUSHKA_NPC_PERCEPTION);

  const standingRing = makeRingLineLoop(standingRangeM, 0xffcc44, 0.92);
  const crouchRing = makeRingLineLoop(crouchRangeM, 0xff9955, 0.72);
  group.add(standingRing, crouchRing);

  const standingMat = standingRing.material as THREE.LineBasicMaterial;
  const crouchMat = crouchRing.material as THREE.LineBasicMaterial;

  const activeOpacity = 0.92;
  const inactiveOpacity = 0.28;

  return {
    group,
    setEnabled(enabled: boolean) {
      group.visible = enabled;
    },
    update(pos, crouch) {
      group.position.copy(pos);
      const activeRangeM = npcDetectionRangeM(BABUSHKA_NPC_PERCEPTION, crouch);
      const standingActive = activeRangeM >= standingRangeM - 1e-4;
      standingMat.opacity = standingActive ? activeOpacity : inactiveOpacity;
      crouchMat.opacity = standingActive ? inactiveOpacity : activeOpacity;
    },
  };
}
