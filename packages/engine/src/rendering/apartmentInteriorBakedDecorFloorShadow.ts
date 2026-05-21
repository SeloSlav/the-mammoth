import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { tagMeshResidentialUnitInterior } from "./apartmentInteriorLayers.js";
import { apartmentDecorMeshShouldCastFloorShadow } from "./apartmentInteriorDecorShadow.js";
import {
  APARTMENT_INTERIOR_VISUAL_PROFILE,
  apartmentDecorContactShadowEligible,
  type ApartmentUnitWorldBounds,
} from "./apartmentInteriorVisualProfile.js";

export const APARTMENT_BAKED_FLOOR_SHADOW_MESH_NAME = "apartment_decor_baked_floor_shadow";
export const MAMMOTH_APARTMENT_BAKED_FLOOR_SHADOW_MESH_UD = "mammothApartmentBakedFloorShadow";

const _parentInvScratch = new THREE.Matrix4();
const _meshWorldScratch = new THREE.Matrix4();
const _decorBoundsScratch = new THREE.Box3();
const _decorCenterScratch = new THREE.Vector3();

export type ApartmentDecorBakedFloorShadowMount = {
  overlay: THREE.Mesh;
  softOverlays: THREE.Mesh[];
  /** First soft layer, kept for older editor/test callers that only inspect one penumbra mesh. */
  softOverlay?: THREE.Mesh;
  dispose: () => void;
};

function eligibleDecorGroups(decorGroups: readonly THREE.Object3D[]): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  for (const group of decorGroups) {
    const modelRelPath = group.userData.mammothApartmentDecorModelRelPath;
    if (typeof modelRelPath !== "string") continue;
    if (!apartmentDecorContactShadowEligible(modelRelPath)) continue;
    out.push(group);
  }
  return out;
}

function cloneDecorGeometryForFloorShadow(
  geometry: THREE.BufferGeometry,
  meshWorld: THREE.Matrix4,
  shadowWorldY: number,
  parentWorldInv: THREE.Matrix4,
  softenRadiusM = 0,
  softenCenterWorld?: THREE.Vector3,
): THREE.BufferGeometry {
  let geo = geometry.clone();
  if (geo.index) {
    const nonIndexed = geo.toNonIndexed();
    geo.dispose();
    geo = nonIndexed;
  }
  geo.applyMatrix4(meshWorld);
  const position = geo.getAttribute("position");
  if (!position) {
    geo.dispose();
    throw new Error("decor floor shadow geometry missing position attribute");
  }
  for (let i = 0; i < position.count; i++) {
    if (softenRadiusM > 0 && softenCenterWorld) {
      const dx = position.getX(i) - softenCenterWorld.x;
      const dz = position.getZ(i) - softenCenterWorld.z;
      const len = Math.hypot(dx, dz);
      if (len > 1e-5) {
        position.setX(i, position.getX(i) + (dx / len) * softenRadiusM);
        position.setZ(i, position.getZ(i) + (dz / len) * softenRadiusM);
      }
    }
    position.setY(i, shadowWorldY);
  }
  position.needsUpdate = true;
  geo.applyMatrix4(parentWorldInv);
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

function collectDecorFloorShadowGeometries(input: {
  decorGroups: readonly THREE.Object3D[];
  parent: THREE.Object3D;
  floorWorldY: number;
  floorOffsetM: number;
  softenRadiusM?: number;
}): THREE.BufferGeometry[] {
  input.parent.updateMatrixWorld(true);
  _parentInvScratch.copy(input.parent.matrixWorld).invert();

  const geos: THREE.BufferGeometry[] = [];
  for (const group of input.decorGroups) {
    group.updateMatrixWorld(true);
    _decorBoundsScratch.setFromObject(group);
    if (_decorBoundsScratch.isEmpty()) continue;
    _decorBoundsScratch.getCenter(_decorCenterScratch);
    const shadowWorldY = Math.max(
      input.floorWorldY,
      _decorBoundsScratch.min.y + input.floorOffsetM,
    );
    group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (!obj.visible) return;
      if (!apartmentDecorMeshShouldCastFloorShadow(obj)) return;

      obj.updateWorldMatrix(true, false);
      _meshWorldScratch.copy(obj.matrixWorld);
      geos.push(
        cloneDecorGeometryForFloorShadow(
          obj.geometry as THREE.BufferGeometry,
          _meshWorldScratch,
          shadowWorldY,
          _parentInvScratch,
          input.softenRadiusM ?? 0,
          _decorCenterScratch,
        ),
      );
    });
  }
  return geos;
}

function createFloorShadowOverlayMaterial(
  tintHex: number,
  opacity: number,
): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: tintHex,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    toneMapped: false,
  });
}

function mergeDecorFloorShadowGeometries(
  geos: readonly THREE.BufferGeometry[],
): THREE.BufferGeometry | null {
  if (geos.length === 0) return null;
  if (geos.length === 1) return geos[0]!.clone();
  const merged = mergeGeometries([...geos], false);
  return merged;
}

function tagShadowOverlayMesh(
  mesh: THREE.Mesh,
  unitKey: string | undefined,
  renderOrder: number,
): void {
  mesh.renderOrder = renderOrder;
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  mesh.userData[MAMMOTH_APARTMENT_BAKED_FLOOR_SHADOW_MESH_UD] = true;
  if (typeof unitKey === "string") {
    mesh.userData.mammothApartmentUnitKey = unitKey;
  }
  tagMeshResidentialUnitInterior(mesh);
}

/**
 * Top-down orthographic projection of static decor onto the shell floor — mesh-accurate grounding
 * (not circle blobs). Uses merged floor-hugging geometry instead of a render-target bake so WebGPU
 * bind groups stay valid and shadows are always visible.
 */
export function isApartmentBakedFloorShadowMesh(mesh: THREE.Mesh): boolean {
  return mesh.userData[MAMMOTH_APARTMENT_BAKED_FLOOR_SHADOW_MESH_UD] === true;
}

export function syncApartmentDecorBakedFloorShadowOverlay(input: {
  /** Kept for editor/FP call-site parity; geometry overlay does not bake through the renderer. */
  renderer: THREE.WebGPURenderer;
  parent: THREE.Object3D;
  decorGroups: readonly THREE.Object3D[];
  unitBounds?: ApartmentUnitWorldBounds;
  /** Owning apartment unit — tagged on overlay for FP profiler / isolation. */
  unitKey?: string;
  /** Minimum world Y of the shadow plane; individual decor can project higher onto rugs. */
  floorWorldY?: number;
  previous?: ApartmentDecorBakedFloorShadowMount | null;
}): ApartmentDecorBakedFloorShadowMount | null {
  input.previous?.dispose();

  const cfg = APARTMENT_INTERIOR_VISUAL_PROFILE.decorShadow;
  if (!cfg.enabled || !cfg.bakedFloorOverlay) {
    return null;
  }

  const eligible = eligibleDecorGroups(input.decorGroups);
  if (eligible.length === 0) {
    return null;
  }

  const bounds = input.unitBounds;
  const floorWorldY =
    input.floorWorldY ??
    (bounds ? bounds.minY + cfg.bakedFloorOffsetM : cfg.bakedFloorOffsetM);

  const geos = collectDecorFloorShadowGeometries({
    decorGroups: eligible,
    parent: input.parent,
    floorWorldY,
    floorOffsetM: cfg.bakedFloorOffsetM,
  });
  if (geos.length === 0) {
    return null;
  }

  let merged: THREE.BufferGeometry | null;
  try {
    merged = mergeDecorFloorShadowGeometries(geos);
  } finally {
    for (const geo of geos) geo.dispose();
  }
  if (!merged) {
    return null;
  }

  const overlay = new THREE.Mesh(
    merged,
    createFloorShadowOverlayMaterial(cfg.bakedFloorShadowTint, cfg.bakedFloorOpacity),
  );
  overlay.name = APARTMENT_BAKED_FLOOR_SHADOW_MESH_NAME;
  tagShadowOverlayMesh(overlay, input.unitKey, 2);
  input.parent.add(overlay);

  const softOverlays: THREE.Mesh[] = [];
  if (cfg.bakedFloorSoftOpacity > 0 && cfg.bakedFloorSoftRadiusM > 0) {
    const rings = Math.max(1, Math.floor(cfg.bakedFloorSoftRings));
    const weightTotal = (rings * (rings + 1)) / 2;
    for (let ring = 1; ring <= rings; ring++) {
      const radiusM = cfg.bakedFloorSoftRadiusM * (ring / rings);
      const weight = (rings - ring + 1) / weightTotal;
      const opacity = cfg.bakedFloorSoftOpacity * weight;
      const softGeos = collectDecorFloorShadowGeometries({
        decorGroups: eligible,
        parent: input.parent,
        floorWorldY,
        floorOffsetM: cfg.bakedFloorOffsetM * 1.35,
        softenRadiusM: radiusM,
      });
      let softMerged: THREE.BufferGeometry | null = null;
      try {
        softMerged = mergeDecorFloorShadowGeometries(softGeos);
      } finally {
        for (const geo of softGeos) geo.dispose();
      }
      if (!softMerged) continue;
      const softOverlay = new THREE.Mesh(
        softMerged,
        createFloorShadowOverlayMaterial(cfg.bakedFloorShadowTint, opacity),
      );
      softOverlay.name = `${APARTMENT_BAKED_FLOOR_SHADOW_MESH_NAME}_soft_${ring}`;
      tagShadowOverlayMesh(softOverlay, input.unitKey, 1 + ring * 0.01);
      softOverlays.push(softOverlay);
      input.parent.add(softOverlay);
    }
  }

  return {
    overlay,
    softOverlays,
    softOverlay: softOverlays[0],
    dispose: () => {
      overlay.geometry.dispose();
      (overlay.material as THREE.Material).dispose();
      overlay.removeFromParent();
      for (const softOverlay of softOverlays) {
        softOverlay.geometry.dispose();
        (softOverlay.material as THREE.Material).dispose();
        softOverlay.removeFromParent();
      }
    },
  };
}
