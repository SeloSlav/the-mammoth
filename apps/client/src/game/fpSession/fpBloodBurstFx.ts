import * as THREE from "three";

const GROUP_NAME = "fp_blood_burst_fx";
const TTL_MS = 400;
const GRAVITY_MPS2 = 11;
const MAX_DROPLETS = 48;
const MIN_DROPLETS = 10;
const DROPLET_RADIUS_M = 0.028;
const DROPLET_OPACITY = 0.94;

let sharedSphereGeom: THREE.SphereGeometry | null = null;

function sphereGeom(): THREE.SphereGeometry {
  if (!sharedSphereGeom) {
    sharedSphereGeom = new THREE.SphereGeometry(DROPLET_RADIUS_M, 6, 4);
  }
  return sharedSphereGeom;
}

function createDropletMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color().setHSL(0.01, 0.94, 0.36),
    transparent: true,
    opacity: DROPLET_OPACITY,
    depthWrite: false,
    toneMapped: false,
  });
}

type DropletSlot = {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  active: boolean;
  birthMs: number;
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
  const n = MIN_DROPLETS + Math.floor(damage / 4);
  return Math.min(22, Math.max(MIN_DROPLETS, n));
}

export type FpBloodBurstFx = {
  spawnBurstAt: (worldX: number, worldY: number, worldZ: number, damage: number) => void;
  tick: (nowMs: number, dtSec: number) => void;
  dispose: () => void;
};

/** Pooled mesh droplets — shared geometry, per-slot materials (opacity per droplet). */
export function createFpBloodBurstFx(scene: THREE.Scene): FpBloodBurstFx {
  const root = new THREE.Group();
  root.name = GROUP_NAME;
  root.frustumCulled = false;
  scene.add(root);

  const geom = sphereGeom();
  const materialTemplate = createDropletMaterial();
  const slots: DropletSlot[] = [];
  for (let i = 0; i < MAX_DROPLETS; i += 1) {
    const mesh = new THREE.Mesh(geom, materialTemplate.clone());
    mesh.name = "fp_blood_droplet";
    mesh.renderOrder = 500;
    mesh.visible = false;
    mesh.frustumCulled = false;
    root.add(mesh);
    slots.push({ mesh, active: false, birthMs: 0, vx: 0, vy: 0, vz: 0 });
  }
  materialTemplate.dispose();

  const scratchVel = new THREE.Vector3();
  let nextSlot = 0;

  const spawnBurstAt = (worldX: number, worldY: number, worldZ: number, damage: number): void => {
    const n = clampDropletCount(damage);
    const birth = performance.now();
    for (let i = 0; i < n; i += 1) {
      const slot = slots[nextSlot]!;
      nextSlot = (nextSlot + 1) % MAX_DROPLETS;
      pushVelocity(scratchVel, birth + i * 9973);
      slot.active = true;
      slot.birthMs = birth;
      slot.vx = scratchVel.x;
      slot.vy = scratchVel.y;
      slot.vz = scratchVel.z;
      slot.mesh.material.opacity = DROPLET_OPACITY;
      slot.mesh.visible = true;
      slot.mesh.position.set(
        worldX + (rand01(i * 13171) - 0.5) * 0.07,
        worldY + (rand01(i * 23171) - 0.35) * 0.11,
        worldZ + (rand01(i * 33171) - 0.5) * 0.07,
      );
    }
  };

  return {
    spawnBurstAt,
    tick(nowMs: number, dtSec: number): void {
      const dt = Math.min(0.05, Math.max(0, dtSec));
      for (const slot of slots) {
        if (!slot.active) continue;
        const u = (nowMs - slot.birthMs) / TTL_MS;
        if (u >= 1) {
          slot.active = false;
          slot.mesh.visible = false;
          continue;
        }
        const fade = Math.max(0, 1 - u * u);
        slot.mesh.material.opacity = fade * DROPLET_OPACITY;
        slot.vy -= GRAVITY_MPS2 * dt;
        slot.mesh.position.x += slot.vx * dt;
        slot.mesh.position.y += slot.vy * dt;
        slot.mesh.position.z += slot.vz * dt;
      }
    },
    dispose(): void {
      for (const slot of slots) {
        slot.active = false;
        slot.mesh.visible = false;
        slot.mesh.material.dispose();
        root.remove(slot.mesh);
      }
      slots.length = 0;
      scene.remove(root);
    },
  };
};
