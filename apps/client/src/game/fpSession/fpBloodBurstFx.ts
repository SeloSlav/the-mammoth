import * as THREE from "three";

const GROUP_NAME = "fp_blood_burst_fx";
const TTL_MS = 400;
const GRAVITY_MPS2 = 11;
const MAX_BURST_MESHES = 36;
const MIN_DROPLETS = 14;
const SURFACE_POOL = 8;
const DROPLET_RADIUS_M = 0.026;

let sharedSphereGeom: THREE.SphereGeometry | null = null;

function sphereGeom(): THREE.SphereGeometry {
  if (!sharedSphereGeom) sharedSphereGeom = new THREE.SphereGeometry(DROPLET_RADIUS_M, 7, 5);
  return sharedSphereGeom;
}

type Droplet = {
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  vx: number;
  vy: number;
  vz: number;
};

type ActiveBurst = {
  droplets: Droplet[];
  birthMs: number;
};

function clampDropletCount(damage: number): number {
  const n = MIN_DROPLETS + Math.floor(damage / 4);
  return Math.min(MAX_BURST_MESHES, Math.max(MIN_DROPLETS, n));
}

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

export type FpBloodBurstFx = {
  spawnBurstAt: (worldX: number, worldY: number, worldZ: number, damage: number) => void;
  tick: (nowMs: number, dtSec: number) => void;
  dispose: () => void;
};

export function createFpBloodBurstFx(scene: THREE.Scene): FpBloodBurstFx {
  const root = new THREE.Group();
  root.name = GROUP_NAME;
  scene.add(root);

  const bursts: ActiveBurst[] = [];
  const scratchVel = new THREE.Vector3();

  const spawnBurstAt = (worldX: number, worldY: number, worldZ: number, damage: number): void => {
    while (bursts.length >= SURFACE_POOL) {
      const old = bursts.shift()!;
      for (const d of old.droplets) {
        root.remove(d.mesh);
        d.mesh.material.dispose();
      }
    }

    const n = clampDropletCount(damage);
    const droplets: Droplet[] = [];
    const geom = sphereGeom();
    const birth = performance.now();

    for (let i = 0; i < n; i++) {
      pushVelocity(scratchVel, birth + i * 9973);
      const hRoll = rand01(i * 40499);
      const hue = hRoll < 0.72 ? hRoll * 0.014 : 1.0 - (hRoll - 0.72) * 0.06;
      const light = 0.30 + rand01(i * 60149) * 0.20;
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(hue, 0.94, light),
        transparent: true,
        opacity: 0.94,
        depthWrite: false,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.name = "fp_blood_droplet";
      mesh.renderOrder = 500;
      const ox = (rand01(i * 13171) - 0.5) * 0.07;
      const oy = (rand01(i * 23171) - 0.35) * 0.11;
      const oz = (rand01(i * 33171) - 0.5) * 0.07;
      mesh.position.set(worldX + ox, worldY + oy, worldZ + oz);
      root.add(mesh);
      droplets.push({
        mesh,
        vx: scratchVel.x,
        vy: scratchVel.y,
        vz: scratchVel.z,
      });
    }
    bursts.push({ droplets, birthMs: birth });
  };

  return {
    spawnBurstAt,
    tick(nowMs: number, dtSec: number): void {
      const dt = Math.min(0.05, Math.max(0, dtSec));
      for (let b = bursts.length - 1; b >= 0; b--) {
        const burst = bursts[b]!;
        const u = (nowMs - burst.birthMs) / TTL_MS;
        if (u >= 1) {
          for (const d of burst.droplets) {
            root.remove(d.mesh);
            d.mesh.material.dispose();
          }
          bursts.splice(b, 1);
          continue;
        }
        const fade = Math.max(0, 1 - u * u);
        for (const d of burst.droplets) {
          d.vy -= GRAVITY_MPS2 * dt;
          d.mesh.position.x += d.vx * dt;
          d.mesh.position.y += d.vy * dt;
          d.mesh.position.z += d.vz * dt;
          d.mesh.material.opacity = fade * 0.94;
        }
      }
    },
    dispose(): void {
      for (const burst of bursts) {
        for (const d of burst.droplets) {
          root.remove(d.mesh);
          d.mesh.material.dispose();
        }
      }
      bursts.length = 0;
      scene.remove(root);
      sharedSphereGeom?.dispose();
      sharedSphereGeom = null;
    },
  };
}
