import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { tagMeshResidentialUnitInterior } from "./apartmentInteriorLayers.js";
import { apartmentDecorMeshShouldCastFloorShadow } from "./apartmentInteriorDecorShadow.js";
import {
  APARTMENT_INTERIOR_VISUAL_PROFILE,
  apartmentDecorBakedFloorShadowHullScale,
  apartmentDecorBakedFloorShadowSnapToShellFloor,
  apartmentDecorContactShadowEligible,
  apartmentDecorIsLooseCigaretteDecorModel,
  type ApartmentUnitWorldBounds,
} from "./apartmentInteriorVisualProfile.js";

export const APARTMENT_BAKED_FLOOR_SHADOW_MESH_NAME = "apartment_decor_baked_floor_shadow";
export const MAMMOTH_APARTMENT_BAKED_FLOOR_SHADOW_MESH_UD = "mammothApartmentBakedFloorShadow";

const _parentInvScratch = new THREE.Matrix4();
const _meshWorldScratch = new THREE.Matrix4();
const _decorBoundsScratch = new THREE.Box3();
const _decorBoundsSizeScratch = new THREE.Vector3();
const _decorCenterScratch = new THREE.Vector3();
const _shadowPointScratch = new THREE.Vector3();

type ShadowPoint2 = {
  x: number;
  z: number;
};

const SHADOW_POINT_QUANTIZE_M = 0.025;
const MAX_SHADOW_HULL_POINTS = 96;

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

function cross2(o: ShadowPoint2, a: ShadowPoint2, b: ShadowPoint2): number {
  return (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
}

function convexHull2(points: ShadowPoint2[]): ShadowPoint2[] {
  if (points.length <= 3) return points;
  points.sort((a, b) => (a.x === b.x ? a.z - b.z : a.x - b.x));
  const lower: ShadowPoint2[] = [];
  for (const p of points) {
    while (
      lower.length >= 2 &&
      cross2(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: ShadowPoint2[] = [];
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i]!;
    while (
      upper.length >= 2 &&
      cross2(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function decimateHull(points: ShadowPoint2[], maxPoints: number): ShadowPoint2[] {
  if (points.length <= maxPoints) return points;
  const out: ShadowPoint2[] = [];
  const step = points.length / maxPoints;
  for (let i = 0; i < maxPoints; i++) {
    out.push(points[Math.floor(i * step)]!);
  }
  return out;
}

function scaleHullTowardCenter(
  hull: ShadowPoint2[],
  centerX: number,
  centerZ: number,
  scale: number,
): void {
  if (scale >= 0.999) return;
  for (const p of hull) {
    p.x = centerX + (p.x - centerX) * scale;
    p.z = centerZ + (p.z - centerZ) * scale;
  }
}

function ensureMinHullRadius(
  hull: ShadowPoint2[],
  centerX: number,
  centerZ: number,
  minRadiusM: number,
): void {
  if (minRadiusM <= 0) return;
  let maxDist = 0;
  for (const p of hull) {
    maxDist = Math.max(maxDist, Math.hypot(p.x - centerX, p.z - centerZ));
  }
  if (maxDist >= minRadiusM) return;
  const expand = minRadiusM / Math.max(maxDist, 1e-6);
  for (const p of hull) {
    p.x = centerX + (p.x - centerX) * expand;
    p.z = centerZ + (p.z - centerZ) * expand;
  }
}

function projectedHullGeometryForFloorShadow(
  geometry: THREE.BufferGeometry,
  meshWorld: THREE.Matrix4,
  shadowWorldY: number,
  parentWorldInv: THREE.Matrix4,
  softenRadiusM = 0,
  softenCenterWorld?: THREE.Vector3,
  hullScale = 1,
  pointQuantizeM = SHADOW_POINT_QUANTIZE_M,
  minHullRadiusM = 0,
): THREE.BufferGeometry | null {
  const position = geometry.getAttribute("position");
  if (!position) {
    throw new Error("decor floor shadow geometry missing position attribute");
  }
  const unique = new Map<string, ShadowPoint2>();
  for (let i = 0; i < position.count; i++) {
    _shadowPointScratch
      .set(position.getX(i), position.getY(i), position.getZ(i))
      .applyMatrix4(meshWorld);
    let x = _shadowPointScratch.x;
    let z = _shadowPointScratch.z;
    if (softenRadiusM > 0 && softenCenterWorld) {
      const dx = x - softenCenterWorld.x;
      const dz = z - softenCenterWorld.z;
      const len = Math.hypot(dx, dz);
      if (len > 1e-5) {
        x += (dx / len) * softenRadiusM;
        z += (dz / len) * softenRadiusM;
      }
    }
    const qx = Math.round(x / pointQuantizeM);
    const qz = Math.round(z / pointQuantizeM);
    unique.set(`${qx},${qz}`, {
      x: qx * pointQuantizeM,
      z: qz * pointQuantizeM,
    });
  }

  const hull = decimateHull(convexHull2([...unique.values()]), MAX_SHADOW_HULL_POINTS);
  if (hull.length < 3) return null;

  let centerX = 0;
  let centerZ = 0;
  for (const p of hull) {
    centerX += p.x;
    centerZ += p.z;
  }
  centerX /= hull.length;
  centerZ /= hull.length;
  scaleHullTowardCenter(hull, centerX, centerZ, hullScale);
  ensureMinHullRadius(hull, centerX, centerZ, minHullRadiusM);

  const vertices: number[] = [];
  const pushParentLocal = (x: number, z: number): void => {
    _shadowPointScratch.set(x, shadowWorldY, z).applyMatrix4(parentWorldInv);
    vertices.push(_shadowPointScratch.x, _shadowPointScratch.y, _shadowPointScratch.z);
  };
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]!;
    const b = hull[(i + 1) % hull.length]!;
    pushParentLocal(centerX, centerZ);
    pushParentLocal(a.x, a.z);
    pushParentLocal(b.x, b.z);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
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
    _decorBoundsScratch.getSize(_decorBoundsSizeScratch);
    const modelRelPath = group.userData.mammothApartmentDecorModelRelPath;
    const snapToShellFloor =
      typeof modelRelPath === "string" &&
      apartmentDecorBakedFloorShadowSnapToShellFloor(modelRelPath);
    const hullScale =
      typeof modelRelPath === "string"
        ? apartmentDecorBakedFloorShadowHullScale(
            modelRelPath,
            _decorBoundsSizeScratch,
          )
        : 1;
    const shadowWorldY = snapToShellFloor
      ? input.floorWorldY
      : Math.max(
          input.floorWorldY,
          _decorBoundsScratch.min.y + input.floorOffsetM,
        );
    const looseCigarette =
      typeof modelRelPath === "string" &&
      apartmentDecorIsLooseCigaretteDecorModel(modelRelPath);
    const shadowCfg = APARTMENT_INTERIOR_VISUAL_PROFILE.decorShadow;
    const pointQuantizeM = looseCigarette
      ? shadowCfg.bakedFloorCigarettePointQuantizeM
      : SHADOW_POINT_QUANTIZE_M;
    const minHullRadiusM = looseCigarette
      ? shadowCfg.bakedFloorCigaretteMinHullRadiusM
      : 0;
    group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (!obj.visible) return;
      if (!apartmentDecorMeshShouldCastFloorShadow(obj)) return;

      obj.updateWorldMatrix(true, false);
      _meshWorldScratch.copy(obj.matrixWorld);
      const geo = projectedHullGeometryForFloorShadow(
        obj.geometry as THREE.BufferGeometry,
        _meshWorldScratch,
        shadowWorldY,
        _parentInvScratch,
        (input.softenRadiusM ?? 0) * hullScale,
        _decorCenterScratch,
        hullScale,
        pointQuantizeM,
        minHullRadiusM,
      );
      if (geo) geos.push(geo);
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
    side: THREE.DoubleSide,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -12,
    polygonOffsetUnits: -12,
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
    softenRadiusM: cfg.bakedFloorCoreRadiusM,
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
