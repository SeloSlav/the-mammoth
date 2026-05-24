import * as THREE from "three";

const GROUP_NAME = "fp_blood_burst_fx";
const TTL_MS = 400;
const GRAVITY_MPS2 = 11;
const MAX_DROPLETS = 72;
const MIN_DROPLETS = 8;
const POINT_SIZE = 0.055;

type DropletSlot = {
  active: boolean;
  birthMs: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
};

function rand01(seed: number): number {
  let x = seed ^ 0x9e3779b9;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return ((x >>> 0) % 0xffff_ffff) / 0xffff_ffff;
}

function pushVelocity(out: THREE.Vector3, salt: number): void {
  const u = rand01(salt * 0xa2c7 + 1);
  const v = rand01(salt * 0x5e3d + 2);
  const w = rand01(salt * 0x31f1 + 3);
  const theta = u * Math.PI * 2;
  const phi = Math.acos(2 * v - 1);
  const sx = Math.sin(phi) * Math.cos(theta);
  const sy = Math.cos(phi);
  const sz = Math.sin(phi) * Math.sin(theta);
  const speed = 2.2 + w * 3.8;
  out.set(sx * speed, Math.max(0.35, sy) * speed * 0.85, sz * speed);
}

function clampDropletCount(damage: number): number {
  const n = MIN_DROPLETS + Math.floor(damage / 5);
  return Math.min(24, Math.max(MIN_DROPLETS, n));
}

export type FpBloodBurstFx = {
  spawnBurstAt: (worldX: number, worldY: number, worldZ: number, damage: number) => void;
  tick: (nowMs: number, dtSec: number) => void;
  dispose: () => void;
};

/** GPU-stable blood specks — one Points object, no mesh/material churn per hit. */
export function createFpBloodBurstFx(scene: THREE.Scene): FpBloodBurstFx {
  const root = new THREE.Group();
  root.name = GROUP_NAME;
  root.frustumCulled = false;
  scene.add(root);

  const slots: DropletSlot[] = Array.from({ length: MAX_DROPLETS }, () => ({
    active: false,
    birthMs: 0,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
  }));

  const positions = new Float32Array(MAX_DROPLETS * 3);
  const geometry = new THREE.BufferGeometry();
  const positionAttr = new THREE.BufferAttribute(positions, 3);
  positionAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positionAttr);

  const material = new THREE.PointsMaterial({
    color: 0x8a0a0a,
    size: POINT_SIZE,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    toneMapped: false,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geometry, material);
  points.name = "fp_blood_droplet_points";
  points.renderOrder = 500;
  points.frustumCulled = false;
  root.add(points);

  const scratchVel = new THREE.Vector3();
  let nextSlot = 0;

  const syncGeometry = (): void => {
    for (let i = 0; i < MAX_DROPLETS; i += 1) {
      const slot = slots[i]!;
      const o = i * 3;
      if (slot.active) {
        positions[o] = slot.x;
        positions[o + 1] = slot.y;
        positions[o + 2] = slot.z;
      } else {
        positions[o] = positions[o + 1] = positions[o + 2] = 0;
      }
    }
    positionAttr.needsUpdate = true;
    geometry.setDrawRange(0, MAX_DROPLETS);
  };

  const spawnBurstAt = (worldX: number, worldY: number, worldZ: number, damage: number): void => {
    const n = clampDropletCount(damage);
    const birth = performance.now();
    for (let i = 0; i < n; i += 1) {
      const slot = slots[nextSlot]!;
      nextSlot = (nextSlot + 1) % MAX_DROPLETS;
      pushVelocity(scratchVel, birth + i * 9973);
      slot.active = true;
      slot.birthMs = birth;
      slot.x = worldX + (rand01(i * 13171) - 0.5) * 0.07;
      slot.y = worldY + (rand01(i * 23171) - 0.35) * 0.11;
      slot.z = worldZ + (rand01(i * 33171) - 0.5) * 0.07;
      slot.vx = scratchVel.x;
      slot.vy = scratchVel.y;
      slot.vz = scratchVel.z;
    }
    syncGeometry();
  };

  return {
    spawnBurstAt,
    tick(nowMs: number, dtSec: number): void {
      const dt = Math.min(0.05, Math.max(0, dtSec));
      let anyActive = false;
      let maxFade = 0;
      for (const slot of slots) {
        if (!slot.active) continue;
        const u = (nowMs - slot.birthMs) / TTL_MS;
        if (u >= 1) {
          slot.active = false;
          continue;
        }
        anyActive = true;
        maxFade = Math.max(maxFade, Math.max(0, 1 - u * u));
        slot.vy -= GRAVITY_MPS2 * dt;
        slot.x += slot.vx * dt;
        slot.y += slot.vy * dt;
        slot.z += slot.vz * dt;
      }
      material.opacity = anyActive ? maxFade * 0.92 : 0;
      if (anyActive) {
        syncGeometry();
      }
    },
    dispose(): void {
      for (const slot of slots) {
        slot.active = false;
      }
      geometry.dispose();
      material.dispose();
      scene.remove(root);
    },
  };
};
