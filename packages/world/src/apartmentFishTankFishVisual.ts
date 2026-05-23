import * as THREE from "three";
import {
  FISH_TANK_SWIM_AABB,
  fnv1a32,
  mulberry32,
  stepFishTankFish,
  type FishTankSwimFishState,
} from "./apartmentFishTankSwim.js";

/** Decorative fish mesh used only as swimmer geometry inside `fish-tank.glb` (not a décor catalog row). */
export const APARTMENT_FISH_TANK_SWIMMER_MODEL_REL_PATH = "static/models/objects/fish.glb" as const;

/** Capsule fallback when `fish.glb` fails to load. */
const FALLBACK_CAPSULE_RADIUS = 0.017;
const FALLBACK_CAPSULE_SEGMENT_LENGTH = Math.max(
  0.066 - 2 * FALLBACK_CAPSULE_RADIUS,
  1e-4,
);
const FISH_COUNT = 6;

/** Max bbox extent (~meters) after centering/scaling to match authored fish-tank interior. */
const SWIMMER_NORMALIZED_BOUNDING_MAX_EXTENT_M = 0.084;

/** Min horizontal velocity² before updating yaw; otherwise keep heading (handles near-vertical drift). */
const HORIZONTAL_VEL_SQ_EPS = 1e-10;

let warnedMissingFishTemplate = false;

export type FishTankFishSwimUpdater = {
  readonly update: (dt: number) => void;
};

export type CreateApartmentFishTankFishSchoolOptions = {
  /** Loaded `fish.glb` scene root — shared prototype cloned per fish. Omit for capsule fallback. */
  fishTemplateRoot?: THREE.Object3D | null;
  /** Applied to each swimmer mesh after clone (FP mood grading, editor decor pass). */
  decorateSwimmerMesh?: (mesh: THREE.Mesh) => void;
};

function cloneTemplateMeshesDeep(sceneRoot: THREE.Object3D): THREE.Object3D {
  const c = sceneRoot.clone(true);
  c.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry = o.geometry.clone();
    const m = o.material;
    if (Array.isArray(m)) {
      o.material = m.map((mat) => mat.clone());
    } else {
      o.material = m.clone();
    }
  });
  return c;
}

/** Center + scale template once; reused for all swimmers in a school. */
export function buildNormalizedFishPrototype(templateSceneRoot: THREE.Object3D): THREE.Group {
  const wrap = new THREE.Group();
  const fish = cloneTemplateMeshesDeep(templateSceneRoot);
  fish.updateMatrixWorld(true);
  wrap.add(fish);
  const bound = new THREE.Box3().setFromObject(wrap);
  const center = bound.getCenter(new THREE.Vector3());
  fish.position.sub(center);
  fish.updateMatrixWorld(true);
  const sized = new THREE.Box3().setFromObject(wrap);
  const ext = sized.getSize(new THREE.Vector3());
  const maxDim = Math.max(ext.x, ext.y, ext.z, 1e-9);
  wrap.scale.setScalar(SWIMMER_NORMALIZED_BOUNDING_MAX_EXTENT_M / maxDim);
  wrap.updateMatrixWorld(true);
  wrap.name = "fish_tank_fish_prototype";
  return wrap;
}

/** Shallow scene clone — shares geometry/material buffers with the prototype. */
export function spawnFishInstanceFromPrototype(prototype: THREE.Group): THREE.Group {
  const instance = prototype.clone(true);
  instance.name = "fish_tank_fish_instance";
  return instance;
}

function tagSwimmerMeshes(
  root: THREE.Object3D,
  decorateSwimmerMesh?: (mesh: THREE.Mesh) => void,
): void {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.castShadow = false;
    o.receiveShadow = false;
    o.frustumCulled = true;
    o.userData.mammothFishTankFish = true;
    o.userData.mammothUnitInterior = true;
    decorateSwimmerMesh?.(o);
  });
}

/**
 * Six swimmers inside the authored tank bounds; meshes from {@link APARTMENT_FISH_TANK_SWIMMER_MODEL_REL_PATH}
 * when loaded, otherwise small capsules as a degraded fallback.
 */
export function createApartmentFishTankFishSchool(
  tankVisualRoot: THREE.Object3D,
  stableKey: string,
  options: CreateApartmentFishTankFishSchoolOptions = {},
): FishTankFishSwimUpdater {
  const { fishTemplateRoot, decorateSwimmerMesh } = options;
  const rng = mulberry32(fnv1a32(stableKey) ^ 0x9e37_79b9);
  const steerRng = mulberry32(fnv1a32(`${stableKey}:steer`) ^ 0xaa55_aa55);

  const group = new THREE.Group();
  group.name = "apartment_fish_tank_swimmers";

  const fishStates: FishTankSwimFishState[] = [];
  const fishRoots: THREE.Object3D[] = [];
  const maxSpeeds: number[] = [];

  const aabb = FISH_TANK_SWIM_AABB;

  const fishPrototype =
    fishTemplateRoot != null ? buildNormalizedFishPrototype(fishTemplateRoot) : null;

  if (fishPrototype == null && !warnedMissingFishTemplate) {
    warnedMissingFishTemplate = true;
    console.warn(
      "[apartmentFishTank] fish.glb template missing — using capsule swimmers (check asset path).",
    );
  }

  for (let i = 0; i < FISH_COUNT; i++) {
    const rx = rng();
    const ry = rng();
    const rz = rng();
    fishStates.push({
      px: aabb.minX + rx * (aabb.maxX - aabb.minX),
      py: aabb.minY + ry * (aabb.maxY - aabb.minY),
      pz: aabb.minZ + rz * (aabb.maxZ - aabb.minZ),
      vx: 0,
      vy: 0,
      vz: 0,
      steerT: rng() * 3,
      tx: 0,
      ty: 0,
      tz: 0,
    });

    maxSpeeds.push(0.035 + rng() * 0.038);

    let instanceRoot: THREE.Object3D;
    if (fishPrototype) {
      instanceRoot = spawnFishInstanceFromPrototype(fishPrototype);
      tagSwimmerMeshes(instanceRoot, decorateSwimmerMesh);
    } else {
      const geom = new THREE.CapsuleGeometry(
        FALLBACK_CAPSULE_RADIUS,
        FALLBACK_CAPSULE_SEGMENT_LENGTH,
        4,
        8,
      );
      const hue = 0.02 + rng() * 0.12;
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(hue, 0.78, 0.5),
        roughness: 0.43,
        metalness: 0.11,
        envMapIntensity: 0.92,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.name = `fish_tank_fish_capsule:${i}`;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      mesh.userData.mammothFishTankFish = true;
      mesh.userData.mammothUnitInterior = true;
      decorateSwimmerMesh?.(mesh);
      instanceRoot = mesh;
    }

    instanceRoot.rotation.order = "YXZ";
    instanceRoot.rotation.y = rng() * Math.PI * 2;
    fishRoots.push(instanceRoot);
    instanceRoot.name = `fish_tank_fish:${i}`;
    group.add(instanceRoot);
  }

  tankVisualRoot.add(group);

  return {
    update(dt: number) {
      const dtSafe = Math.min(Math.max(dt, 0), 0.055);
      for (let fi = 0; fi < FISH_COUNT; fi++) {
        const fish = fishStates[fi]!;
        stepFishTankFish(fish, dtSafe, FISH_TANK_SWIM_AABB, steerRng, { maxSpeed: maxSpeeds[fi] });
        const fishRoot = fishRoots[fi]!;
        fishRoot.position.set(fish.px, fish.py, fish.pz);

        fishRoot.rotation.order = "YXZ";
        fishRoot.rotation.x = 0;
        fishRoot.rotation.z = 0;
        const horizSq = fish.vx * fish.vx + fish.vz * fish.vz;
        if (horizSq > HORIZONTAL_VEL_SQ_EPS) {
          fishRoot.rotation.y = Math.atan2(fish.vx, fish.vz);
        }
      }
    },
  };
}
