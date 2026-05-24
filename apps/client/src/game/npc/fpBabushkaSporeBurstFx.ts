import * as THREE from "three";

const GROUP_NAME = "fp_babushka_spore_burst_fx";
const TTL_MS = 1150;
const MAX_SPORES = 112;
const MIN_SPORES = 12;
const SPORE_OPACITY = 0.82;
const TRAIL_SPORE_OPACITY = 0.46;
const SPORE_SIZE_MIN_M = 0.045;
const SPORE_SIZE_MAX_M = 0.105;
const UPWARD_DRIFT_MPS = 0.72;
const DRAG_PER_SEC = 2.4;

let sharedSporeTexture: THREE.CanvasTexture | null = null;

type SporeSlot = {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  active: boolean;
  birthMs: number;
  vx: number;
  vy: number;
  vz: number;
  swirl: number;
  size: number;
  opacity: number;
};

export type FpBabushkaSporeBurstFx = {
  spawnBurstAt: (worldX: number, worldY: number, worldZ: number, damage: number) => void;
  spawnTrailAt: (worldX: number, worldY: number, worldZ: number, nowMs: number) => void;
  tick: (nowMs: number, dtSec: number) => void;
  dispose: () => void;
};

function sporeTexture(): THREE.CanvasTexture {
  if (sharedSporeTexture) return sharedSporeTexture;

  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("[fpBabushkaSporeBurstFx] 2D canvas context unavailable");
  }

  const gradient = ctx.createRadialGradient(16, 16, 1, 16, 16, 16);
  gradient.addColorStop(0.0, "rgba(230, 255, 220, 1.0)");
  gradient.addColorStop(0.35, "rgba(95, 255, 166, 0.82)");
  gradient.addColorStop(0.72, "rgba(39, 205, 240, 0.32)");
  gradient.addColorStop(1.0, "rgba(39, 205, 240, 0.0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  sharedSporeTexture = new THREE.CanvasTexture(canvas);
  sharedSporeTexture.name = "babushka_spore_soft_disc";
  sharedSporeTexture.colorSpace = THREE.SRGBColorSpace;
  return sharedSporeTexture;
}

function rand01(seed: number): number {
  let x = seed ^ 0x85eb_ca6b;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return ((x >>> 0) % 0xffff_ffff) / 0xffff_ffff;
}

function sporeCountForDamage(damage: number): number {
  const n = MIN_SPORES + Math.floor(damage / 3);
  return Math.min(28, Math.max(MIN_SPORES, n));
}

function createSporeMaterial(texture: THREE.Texture, index: number): THREE.SpriteMaterial {
  const hue = index % 2 === 0 ? 0.39 : 0.53;
  return new THREE.SpriteMaterial({
    map: texture,
    color: new THREE.Color().setHSL(hue, 0.88, 0.62),
    transparent: true,
    opacity: SPORE_OPACITY,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

export function createFpBabushkaSporeBurstFx(scene: THREE.Scene): FpBabushkaSporeBurstFx {
  const root = new THREE.Group();
  root.name = GROUP_NAME;
  root.frustumCulled = false;
  scene.add(root);

  const texture = sporeTexture();
  const slots: SporeSlot[] = [];
  for (let i = 0; i < MAX_SPORES; i += 1) {
    const material = createSporeMaterial(texture, i);
    const sprite = new THREE.Sprite(material);
    sprite.name = "fp_babushka_spore";
    sprite.renderOrder = 510;
    sprite.visible = false;
    sprite.frustumCulled = false;
    root.add(sprite);
    slots.push({
      sprite,
      material,
      active: false,
      birthMs: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      swirl: 0,
      size: SPORE_SIZE_MIN_M,
      opacity: SPORE_OPACITY,
    });
  }

  let nextSlot = 0;

  const nextSporeSlot = (): SporeSlot => {
    const slot = slots[nextSlot]!;
    nextSlot = (nextSlot + 1) % MAX_SPORES;
    return slot;
  };

  const spawnBurstAt = (worldX: number, worldY: number, worldZ: number, damage: number): void => {
    const n = sporeCountForDamage(damage);
    const birth = performance.now();
    for (let i = 0; i < n; i += 1) {
      const slot = nextSporeSlot();
      const salt = birth + i * 7919;
      const angle = rand01(salt + 11) * Math.PI * 2;
      const spread = 0.18 + rand01(salt + 23) * 0.56;
      const size = SPORE_SIZE_MIN_M + rand01(salt + 37) * (SPORE_SIZE_MAX_M - SPORE_SIZE_MIN_M);
      slot.active = true;
      slot.birthMs = birth;
      slot.vx = Math.cos(angle) * spread;
      slot.vy = UPWARD_DRIFT_MPS + rand01(salt + 41) * 0.7;
      slot.vz = Math.sin(angle) * spread;
      slot.swirl = (rand01(salt + 53) - 0.5) * 2.2;
      slot.size = size;
      slot.opacity = SPORE_OPACITY;
      slot.material.opacity = SPORE_OPACITY;
      slot.sprite.visible = true;
      slot.sprite.scale.setScalar(size);
      slot.sprite.position.set(
        worldX + (rand01(salt + 61) - 0.5) * 0.18,
        worldY + (rand01(salt + 71) - 0.2) * 0.22,
        worldZ + (rand01(salt + 83) - 0.5) * 0.18,
      );
    }
  };

  const spawnTrailAt = (worldX: number, worldY: number, worldZ: number, nowMs: number): void => {
    const slot = nextSporeSlot();
    const salt = nowMs + nextSlot * 1543;
    const angle = rand01(salt + 13) * Math.PI * 2;
    const drift = 0.05 + rand01(salt + 29) * 0.14;
    const size = SPORE_SIZE_MIN_M + rand01(salt + 43) * 0.035;

    slot.active = true;
    slot.birthMs = nowMs;
    slot.vx = Math.cos(angle) * drift;
    slot.vy = 0.42 + rand01(salt + 47) * 0.35;
    slot.vz = Math.sin(angle) * drift;
    slot.swirl = (rand01(salt + 59) - 0.5) * 1.6;
    slot.size = size;
    slot.opacity = TRAIL_SPORE_OPACITY;
    slot.material.opacity = TRAIL_SPORE_OPACITY;
    slot.sprite.visible = true;
    slot.sprite.scale.setScalar(size);
    slot.sprite.position.set(
      worldX + (rand01(salt + 67) - 0.5) * 0.22,
      worldY + (rand01(salt + 79) - 0.35) * 0.32,
      worldZ + (rand01(salt + 89) - 0.5) * 0.22,
    );
  };

  return {
    spawnBurstAt,
    spawnTrailAt,
    tick(nowMs: number, dtSec: number): void {
      const dt = Math.min(0.05, Math.max(0, dtSec));
      const drag = Math.max(0, 1 - DRAG_PER_SEC * dt);
      for (const slot of slots) {
        if (!slot.active) continue;
        const u = (nowMs - slot.birthMs) / TTL_MS;
        if (u >= 1) {
          slot.active = false;
          slot.sprite.visible = false;
          continue;
        }

        const fade = Math.sin((1 - u) * Math.PI * 0.5);
        const swirlPhase = u * Math.PI * 2 + slot.swirl;
        slot.material.opacity = fade * slot.opacity;
        slot.vx *= drag;
        slot.vz *= drag;
        slot.sprite.position.x += (slot.vx + Math.cos(swirlPhase) * 0.08) * dt;
        slot.sprite.position.y += slot.vy * dt;
        slot.sprite.position.z += (slot.vz + Math.sin(swirlPhase) * 0.08) * dt;
        slot.sprite.scale.setScalar(slot.size * (1 + u * 1.8));
      }
    },
    dispose(): void {
      for (const slot of slots) {
        slot.active = false;
        slot.sprite.visible = false;
        slot.material.dispose();
        root.remove(slot.sprite);
      }
      slots.length = 0;
      scene.remove(root);
    },
  };
}
