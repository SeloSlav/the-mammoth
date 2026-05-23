import * as THREE from "three";
import {
  BALCONY_GROW_SLOT_SOIL_INSET_FRAC,
  BALCONY_GROW_TRAY_MAX_WATER_L,
} from "@the-mammoth/schemas";
import { readDecorVisualLocalBounds } from "../fpApartment/fpApartmentInteractionPick.js";
import { FP_INTERACTION_PICK_LAYER } from "../fpSession/fpSessionConstants.js";

const PEBBLE_COUNT = 34;
const _boundsScratch = new THREE.Box3();
const _pebbleGeometry = new THREE.IcosahedronGeometry(1, 0);
const _moistureDark = new THREE.Color(0x2a2218);
const _colorScratch = new THREE.Color();

/** Deterministic 0..1 from tray id + index — stable pebble scatter per tray. */
function trayScatter01(trayId: string, index: number, salt: number): number {
  let h = salt >>> 0;
  for (let i = 0; i < trayId.length; i++) {
    h = Math.imul(h ^ trayId.charCodeAt(i), 0x9e3779b1);
  }
  h = Math.imul(h ^ index, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 0xffffffff;
}

function isGrowTraySurfaceMesh(mesh: THREE.Mesh): boolean {
  if (mesh.userData.mammothGrowTrayCompostPebble === true) return false;
  if (mesh.userData.mammothGrowPlantPick === true) return false;
  if (mesh.userData.mammothGrowTrayCenterPick === true) return false;
  if (mesh.userData.mammothGrowTrayId !== undefined && mesh.material !== undefined) {
    const transparent =
      mesh.material instanceof THREE.Material &&
      mesh.material.transparent &&
      "opacity" in mesh.material &&
      mesh.material.opacity === 0;
    if (transparent) return false;
  }
  if (mesh.layers.mask === (1 << FP_INTERACTION_PICK_LAYER)) return false;
  return true;
}

function ensureTraySurfaceBaseColor(material: THREE.MeshStandardMaterial): THREE.Color {
  const stored = material.userData.mammothGrowTraySurfaceBaseColor as THREE.Color | undefined;
  if (stored) return stored;
  const base = material.color.clone();
  material.userData.mammothGrowTraySurfaceBaseColor = base;
  return base;
}

function moistureDarkenFactor(waterLiters: number): number {
  if (waterLiters <= 0.05) return 0;
  const wet = THREE.MathUtils.clamp(waterLiters / BALCONY_GROW_TRAY_MAX_WATER_L, 0, 1);
  return THREE.MathUtils.lerp(0.08, 0.42, wet);
}

/** Low-poly compost pebbles scattered on the inset soil patch. */
export function mountGrowTrayCompostPebbles(
  decorGroup: THREE.Object3D,
  trayId: string,
  soilLocalY: number,
): THREE.Group {
  let group = decorGroup.userData.mammothGrowTrayCompostPebbles as THREE.Group | undefined;
  if (group) return group;

  readDecorVisualLocalBounds(decorGroup, _boundsScratch);
  if (_boundsScratch.isEmpty()) {
    group = new THREE.Group();
    group.name = `grow_tray_compost_pebbles:${trayId}`;
    group.visible = false;
    decorGroup.add(group);
    decorGroup.userData.mammothGrowTrayCompostPebbles = group;
    return group;
  }

  const insetX = (_boundsScratch.max.x - _boundsScratch.min.x) * BALCONY_GROW_SLOT_SOIL_INSET_FRAC;
  const insetZ = (_boundsScratch.max.z - _boundsScratch.min.z) * BALCONY_GROW_SLOT_SOIL_INSET_FRAC;
  const minX = _boundsScratch.min.x + insetX;
  const maxX = _boundsScratch.max.x - insetX;
  const minZ = _boundsScratch.min.z + insetZ;
  const maxZ = _boundsScratch.max.z - insetZ;

  group = new THREE.Group();
  group.name = `grow_tray_compost_pebbles:${trayId}`;
  group.visible = false;

  for (let i = 0; i < PEBBLE_COUNT; i++) {
    const u = trayScatter01(trayId, i, 0x1e01a2b3);
    const v = trayScatter01(trayId, i, 0x2e02c3d4);
    const w = trayScatter01(trayId, i, 0x3e03e4f5);
    const size = THREE.MathUtils.lerp(0.006, 0.016, w);

    const pebble = new THREE.Mesh(
      _pebbleGeometry,
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(0xd6d2ca).lerp(new THREE.Color(0xa09a90), u * 0.65),
        roughness: 0.94,
        metalness: 0,
      }),
    );
    pebble.name = `grow_tray_compost_pebble:${trayId}:${i}`;
    pebble.userData.mammothGrowTrayCompostPebble = true;
    pebble.position.set(
      THREE.MathUtils.lerp(minX, maxX, u),
      soilLocalY + THREE.MathUtils.lerp(0.002, 0.008, v),
      THREE.MathUtils.lerp(minZ, maxZ, v),
    );
    pebble.rotation.set(
      trayScatter01(trayId, i, 0x4a01b001) * Math.PI * 2,
      trayScatter01(trayId, i, 0x5a02b002) * Math.PI * 2,
      trayScatter01(trayId, i, 0x6a03b003) * Math.PI * 2,
    );
    pebble.scale.set(
      size * THREE.MathUtils.lerp(0.75, 1.15, w),
      size * THREE.MathUtils.lerp(0.55, 0.95, u),
      size * THREE.MathUtils.lerp(0.8, 1.25, v),
    );
    pebble.castShadow = true;
    pebble.receiveShadow = true;
    group.add(pebble);
  }

  decorGroup.add(group);
  decorGroup.userData.mammothGrowTrayCompostPebbles = group;
  return group;
}

export function syncGrowTrayCompostPebbles(
  decorGroup: THREE.Object3D,
  fertilizerPresent: boolean,
): void {
  const group = decorGroup.userData.mammothGrowTrayCompostPebbles as THREE.Group | undefined;
  if (!group) return;
  group.visible = fertilizerPresent;
}

/** Darken tray surface materials when the tray holds water. */
export function syncGrowTrayMoistureTint(
  decorGroup: THREE.Object3D,
  waterLiters: number,
): void {
  const visualKey = waterLiters.toFixed(2);
  if (decorGroup.userData.mammothGrowMoistureVisualKey === visualKey) return;
  decorGroup.userData.mammothGrowMoistureVisualKey = visualKey;

  const darken = moistureDarkenFactor(waterLiters);
  decorGroup.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !isGrowTraySurfaceMesh(o)) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mat of mats) {
      if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
      const base = ensureTraySurfaceBaseColor(mat);
      _colorScratch.copy(base);
      if (darken > 0) {
        _colorScratch.lerp(_moistureDark, darken);
      }
      mat.color.copy(_colorScratch);
    }
  });
}

export function syncGrowTraySurfaceVisuals(
  decorGroup: THREE.Object3D,
  waterLiters: number,
  fertilizerPresent: boolean,
): void {
  syncGrowTrayCompostPebbles(decorGroup, fertilizerPresent);
  syncGrowTrayMoistureTint(decorGroup, waterLiters);
}
