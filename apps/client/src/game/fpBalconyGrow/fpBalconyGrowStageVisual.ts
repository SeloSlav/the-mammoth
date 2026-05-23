import * as THREE from "three";
import {
  BALCONY_GROW_SLOT_LOCAL_OFFSETS,
  BALCONY_GROW_SLOT_SOIL_INSET_FRAC,
  BALCONY_GROW_SOIL_LOCAL_Y,
  balconyGrowSlotLocalPosition,
  balconyGrowSlotOffsetsFromHalfExtents,
  type BalconyGrowSlotXZ,
  type BalconyGrowStage,
} from "@the-mammoth/schemas";
import { readDecorVisualLocalBounds } from "../fpApartment/fpApartmentInteractionPick.js";

const _boundsScratch = new THREE.Box3();
const _sizeScratch = new THREE.Vector3();
const _decorScaleScratch = new THREE.Vector3();
const _seedGeometry = new THREE.SphereGeometry(0.025, 8, 6);
const _stemGeometry = new THREE.CylinderGeometry(0.012, 0.018, 1, 6);
const _leafGeometry = new THREE.SphereGeometry(0.05, 8, 6);

const SEED_OFFSETS: readonly [number, number, number][] = [
  [-0.045, 0.012, -0.025],
  [-0.012, 0.016, 0.018],
  [0.026, 0.013, -0.016],
  [0.052, 0.014, 0.025],
  [0.006, 0.019, -0.048],
];

/** Probe merged tray decor for the soil rim height in tray-local space. */
export function probeGrowTraySoilLocalY(decorGroup: THREE.Object3D): number {
  readDecorVisualLocalBounds(decorGroup, _boundsScratch);
  if (_boundsScratch.isEmpty()) return BALCONY_GROW_SOIL_LOCAL_Y;
  return _boundsScratch.max.y - 0.01;
}

/** 2×2 slot centers spread across the inset soil patch in tray-local space. */
export function probeGrowTraySlotLocalOffsets(decorGroup: THREE.Object3D): BalconyGrowSlotXZ[] {
  readDecorVisualLocalBounds(decorGroup, _boundsScratch);
  if (_boundsScratch.isEmpty()) {
    return BALCONY_GROW_SLOT_LOCAL_OFFSETS.map((o) => ({ ...o }));
  }

  _boundsScratch.getSize(_sizeScratch);
  const insetX = _sizeScratch.x * BALCONY_GROW_SLOT_SOIL_INSET_FRAC;
  const insetZ = _sizeScratch.z * BALCONY_GROW_SLOT_SOIL_INSET_FRAC;
  _boundsScratch.min.x += insetX;
  _boundsScratch.max.x -= insetX;
  _boundsScratch.min.z += insetZ;
  _boundsScratch.max.z -= insetZ;

  _boundsScratch.getSize(_sizeScratch);
  const centerX = (_boundsScratch.min.x + _boundsScratch.max.x) * 0.5;
  const centerZ = (_boundsScratch.min.z + _boundsScratch.max.z) * 0.5;

  return balconyGrowSlotOffsetsFromHalfExtents(
    _sizeScratch.x * 0.5,
    _sizeScratch.z * 0.5,
    centerX,
    centerZ,
  );
}

/** Uniform world scale on the tray decor root — placed slot visuals inherit this. */
export function readGrowTrayDecorUniformScale(trayRoot: THREE.Object3D): number {
  trayRoot.getWorldScale(_decorScaleScratch);
  return (_decorScaleScratch.x + _decorScaleScratch.y + _decorScaleScratch.z) / 3;
}

export function readGrowTraySoilLocalY(trayRoot: THREE.Object3D): number {
  const y = trayRoot.userData.mammothGrowTraySoilLocalY;
  return typeof y === "number" && Number.isFinite(y) ? y : BALCONY_GROW_SOIL_LOCAL_Y;
}

export function readGrowTraySlotLocalOffsets(trayRoot: THREE.Object3D): readonly BalconyGrowSlotXZ[] {
  const stored = trayRoot.userData.mammothGrowTraySlotOffsets;
  if (Array.isArray(stored) && stored.length === 4) {
    return stored as BalconyGrowSlotXZ[];
  }
  return BALCONY_GROW_SLOT_LOCAL_OFFSETS;
}

/** Bottom of `visual` rests on holder origin (soil contact). */
export function bottomAlignGrowStageVisual(visual: THREE.Object3D, uniformScale: number): void {
  visual.scale.setScalar(uniformScale);
  visual.position.set(0, 0, 0);
  visual.rotation.set(0, 0, 0);
  visual.updateMatrixWorld(true);
  _boundsScratch.setFromObject(visual);
  visual.position.y = -_boundsScratch.min.y;
}

export function mountBalconyGrowStageVisual(
  holder: THREE.Group,
  template: THREE.Object3D,
  stage: BalconyGrowStage,
  stageScale: number,
  tint: string,
  matureGlow: boolean,
): THREE.Object3D {
  const vis = template.clone(true);
  bottomAlignGrowStageVisual(vis, stageScale);
  vis.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
      o.material = o.material.clone();
      o.material.color.set(tint);
      if (matureGlow) {
        o.material.emissive.set(tint);
        o.material.emissiveIntensity = 0.12;
      }
    }
  });
  holder.add(vis);
  return vis;
}

/** Small procedural seed cluster; avoids using the plant GLB for the just-planted stage. */
export function mountBalconyGrowSeedVisual(
  holder: THREE.Group,
  stageScale: number,
  tint: string,
): THREE.Object3D {
  const group = new THREE.Group();
  group.name = "grow_stage_seed_cluster";
  const tintColor = new THREE.Color(tint);
  const seedColor = new THREE.Color(0x9a7b4f).lerp(tintColor, 0.16);
  const scale = Math.max(0.92, stageScale / 0.14) * 1.08;

  for (let i = 0; i < SEED_OFFSETS.length; i++) {
    const seed = new THREE.Mesh(
      _seedGeometry,
      new THREE.MeshStandardMaterial({
        color: seedColor,
        roughness: 0.92,
        metalness: 0,
      }),
    );
    const [x, y, z] = SEED_OFFSETS[i]!;
    seed.position.set(x * scale, y * scale, z * scale);
    seed.scale.set(1.0 * scale, 0.48 * scale, 0.72 * scale);
    seed.rotation.set(0.4 + i * 0.31, i * 0.73, 0.2 - i * 0.17);
    group.add(seed);
  }

  holder.add(group);
  return group;
}

/** Low-poly plant silhouette for grow stages; cheaper and clearer than reusing one GLB. */
export function mountBalconyGrowPlantVisual(
  holder: THREE.Group,
  stage: Exclude<BalconyGrowStage, "seed">,
  stageScale: number,
  tint: string,
  matureGlow: boolean,
): THREE.Object3D {
  const group = new THREE.Group();
  group.name = `grow_stage_${stage}_procedural`;
  const scale = Math.max(0.72, stageScale / 0.2);
  const tintColor = new THREE.Color(tint);
  const stemColor = new THREE.Color(0x315f2f).lerp(tintColor, 0.25);
  const leafColor = new THREE.Color(0x4f9b45).lerp(tintColor, 0.55);
  const stageSpec = {
    sapling: { stems: 2, height: 0.18, leaf: 0.78 },
    mid: { stems: 4, height: 0.3, leaf: 1.05 },
    mature: { stems: 5, height: 0.4, leaf: 1.26 },
  }[stage];

  for (let i = 0; i < stageSpec.stems; i++) {
    const angle = (i / stageSpec.stems) * Math.PI * 2 + 0.35;
    const lean = stage === "sapling" ? 0.018 : 0.032;
    const height = stageSpec.height * scale * (0.88 + i * 0.045);
    const stem = new THREE.Mesh(
      _stemGeometry,
      new THREE.MeshStandardMaterial({
        color: stemColor,
        roughness: 0.86,
        metalness: 0,
      }),
    );
    stem.position.set(Math.cos(angle) * lean * scale, height * 0.5, Math.sin(angle) * lean * scale);
    stem.scale.set(0.72 * scale, height, 0.72 * scale);
    stem.rotation.set(Math.sin(angle) * 0.18, 0, Math.cos(angle) * -0.18);
    group.add(stem);

    const leaf = new THREE.Mesh(
      _leafGeometry,
      new THREE.MeshStandardMaterial({
        color: leafColor,
        roughness: 0.8,
        metalness: 0,
        emissive: matureGlow ? tintColor : new THREE.Color(0x000000),
        emissiveIntensity: matureGlow ? 0.08 : 0,
      }),
    );
    leaf.position.set(
      Math.cos(angle) * (0.045 + lean) * scale,
      height * (0.82 + (i % 2) * 0.08),
      Math.sin(angle) * (0.045 + lean) * scale,
    );
    leaf.scale.set(0.75 * stageSpec.leaf * scale, 0.18 * stageSpec.leaf * scale, 0.38 * stageSpec.leaf * scale);
    leaf.rotation.set(0.45, angle, i % 2 === 0 ? 0.38 : -0.38);
    group.add(leaf);
  }

  holder.add(group);
  return group;
}

export function balconyGrowSlotWorldPosition(
  trayWorldMatrix: THREE.Matrix4,
  slotIndex: number,
  soilLocalY: number,
  out: THREE.Vector3,
  trayRoot?: THREE.Object3D,
): THREE.Vector3 {
  const offsets = trayRoot ? readGrowTraySlotLocalOffsets(trayRoot) : BALCONY_GROW_SLOT_LOCAL_OFFSETS;
  const local = balconyGrowSlotLocalPosition(slotIndex, soilLocalY, offsets);
  return out.set(local.x, local.y, local.z).applyMatrix4(trayWorldMatrix);
}
