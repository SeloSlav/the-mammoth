import * as THREE from "three";
import type { Identity } from "spacetimedb";
import type { DbConnection } from "../../module_bindings";
import type { PlayerPose, PlayerVitals } from "../../module_bindings/types";

const GROUP_NAME = "fp_player_damage_blood_fx";
const HEALTH_DROP_EPS = 0.05;
/** Ignore hunger/thirst micro-ticks (~<1 HP / slow vitals tick); melee & typical pellets exceed this. */
const MIN_DAMAGE_FOR_BLOOD_FX = 1;
const TTL_MS = 400;
const TORSO_Y_ABOVE_FEET_M = 1.04;
const GRAVITY_MPS2 = 11;
const MAX_BURST_MESHES = 36;
const MIN_DROPLETS = 14;
const SURFACE_POOL = 8;

/** Shared tiny spheres — cheap WebGPU path (same idea as firearm decal meshes). */
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

/**
 * Rough outward “squirt”: biased sideways + up with slight backward scatter (impact reaction).
 */
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

export type FpPlayerDamageBloodSquirt = {
  tick: (nowMs: number, dtSec: number) => void;
  dispose: () => void;
};

export function createFpPlayerDamageBloodSquirt(opts: {
  scene: THREE.Scene;
  /** Writes predicted local feet (world) into `out`. */
  getLocalFeetWorld: (out: THREE.Vector3) => void;
  conn: DbConnection;
}): FpPlayerDamageBloodSquirt {
  const root = new THREE.Group();
  root.name = GROUP_NAME;
  opts.scene.add(root);

  const bursts: ActiveBurst[] = [];
  const scratchOrigin = new THREE.Vector3();
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
      const hue = 0.02 + rand01(i * 40499) * 0.04;
      const light = 0.38 + rand01(i * 60149) * 0.22;
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(hue, 0.92, light),
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

  const resolveVictimChestWorld = (victim: Identity): THREE.Vector3 | null => {
    const self = opts.conn.identity;
    if (self?.isEqual(victim)) {
      opts.getLocalFeetWorld(scratchOrigin);
      scratchOrigin.y += TORSO_Y_ABOVE_FEET_M;
      return scratchOrigin.clone();
    }
    const pose = opts.conn.db.player_pose.identity.find(victim) as PlayerPose | undefined;
    if (!pose) return null;
    scratchOrigin.set(pose.x, pose.y + TORSO_Y_ABOVE_FEET_M, pose.z);
    return scratchOrigin.clone();
  };

  const onVitalsUpdate = (_ctx: unknown, oldRow: PlayerVitals, newRow: PlayerVitals): void => {
    if (newRow.health >= oldRow.health - HEALTH_DROP_EPS) return;
    const damage = oldRow.health - newRow.health;
    if (damage < MIN_DAMAGE_FOR_BLOOD_FX) return;
    const p = resolveVictimChestWorld(newRow.identity);
    if (!p) return;
    spawnBurstAt(p.x, p.y, p.z, damage);
  };

  opts.conn.db.player_vitals.onUpdate(onVitalsUpdate);

  return {
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
      opts.conn.db.player_vitals.removeOnUpdate(onVitalsUpdate);
      for (const burst of bursts) {
        for (const d of burst.droplets) {
          root.remove(d.mesh);
          d.mesh.material.dispose();
        }
      }
      bursts.length = 0;
      opts.scene.remove(root);
      sharedSphereGeom?.dispose();
      sharedSphereGeom = null;
    },
  };
}
