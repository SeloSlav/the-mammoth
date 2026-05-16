import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { UNIT_SHELL_WALL_THICKNESS_M } from "@the-mammoth/world";
import type { MyApartmentLayoutPiece } from "../../state/editorStoreTypes.js";
import type { OwnedApartmentBuiltinsDoc } from "@the-mammoth/schemas";
import type { OwnedApartmentFractionToPreviewXZ } from "./editorMyApartmentAuthoringShell.js";
import {
  editorMyApartmentSelectedIdForDecor,
  editorMyApartmentSelectedIdForPiece,
} from "./editorMyApartmentSelection.js";

const WARDROBE_URL = "/static/models/objects/wardrobe-closet.glb";
const FOOTLOCKER_URL = "/static/models/objects/footlocker.glb";
const BED_URL = "/static/models/objects/bed.glb";
const STOVE_URL = "/static/models/objects/stove.glb";

const WARDROBE_VIS_SCALE = 0.98;
const FOOTLOCKER_VIS_SCALE = 0.56;
const BED_VIS_SCALE = 1.14;
const STOVE_VIS_SCALE = 0.88;

/** Top of authoring shell floor slab — keep in sync with `editorMyApartmentAuthoringShell.ts`. */
export const EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y = 0.02;

/** Gizmo + serialized yaw for built-in apartment props (45° steps). */
export const EDITOR_MY_APARTMENT_YAW_SNAP_RAD = Math.PI / 4;

const qSnapYawScratch = new THREE.Quaternion();

/** Breath room inside plaster inner faces so thick prop meshes do not plane-fight drywall. */
const EDITOR_MY_APARTMENT_INTERIOR_SLACK_M = 0.03;
/** Matches `OwnedApartmentDecorItemSchema.dy` max in `@the-mammoth/schemas`. */
export const EDITOR_MY_APARTMENT_DECOR_DY_SCHEMA_MAX_M = 4;
/** Matches built-in + decor `uniformScale` ranges in `@the-mammoth/schemas`. */
export const EDITOR_MY_APARTMENT_UNIFORM_SCALE_MIN = 0.08;
export const EDITOR_MY_APARTMENT_UNIFORM_SCALE_MAX = 5.5;
/** Matches runtime content decor clamp slack in `fpApartmentDecorMeshes.ts`. */
const EDITOR_MY_APARTMENT_DECOR_BOUNDARY_SLACK_M = 0.06;

const decorClampBoundsScratch = new THREE.Box3();
const decorClampSizeScratch = new THREE.Vector3();
const decorClampCenterScratch = new THREE.Vector3();

function clampPreviewXZToPlasterInterior(args: {
  footprintSx: number;
  footprintSz: number;
  x: number;
  z: number;
}): { x: number; z: number } {
  const wt = UNIT_SHELL_WALL_THICKNESS_M;
  const e = EDITOR_MY_APARTMENT_INTERIOR_SLACK_M;
  const ix0 = wt + e;
  const ix1 = args.footprintSx - wt - e;
  const iz0 = wt + e;
  const iz1 = args.footprintSz - wt - e;
  if (!(ix1 > ix0) || !(iz1 > iz0)) {
    return {
      x: THREE.MathUtils.clamp(args.x, 0, args.footprintSx),
      z: THREE.MathUtils.clamp(args.z, 0, args.footprintSz),
    };
  }
  return {
    x: THREE.MathUtils.clamp(args.x, ix0, ix1),
    z: THREE.MathUtils.clamp(args.z, iz0, iz1),
  };
}

/**
 * Clamps prefab-slab XZ so props stay inside drywall **and** every corner is representable with
 * `fx`/`fz` ∈ [0,1] (same hull as runtime `boundMin* + f * span`). Without this, the south/north
 * plaster line can sit outside that segment; authoring there encodes e.g. `fz = 0` while the true
 * fraction is < 0, then reload snaps inward.
 */
export function clampPreviewXZToAuthoringInterior(
  spans: OwnedApartmentFractionToPreviewXZ,
  x: number,
  z: number,
): { x: number; z: number } {
  const wt = UNIT_SHELL_WALL_THICKNESS_M;
  const e = EDITOR_MY_APARTMENT_INTERIOR_SLACK_M;
  const sx = spans.prefabFootprintSx;
  const sz = spans.prefabFootprintSz;
  const ixPl0 = wt + e;
  const ixPl1 = sx - wt - e;
  const izPl0 = wt + e;
  const izPl1 = sz - wt - e;

  const lxMinR = spans.strictMinX - spans.prefabOriginX;
  const lxMaxR = spans.strictMinX + spans.spanX - spans.prefabOriginX;
  const lzMinR = spans.strictMinZ - spans.prefabOriginZ;
  const lzMaxR = spans.strictMinZ + spans.spanZ - spans.prefabOriginZ;

  const ix0 = Math.max(ixPl0, lxMinR);
  const ix1 = Math.min(ixPl1, lxMaxR);
  const iz0 = Math.max(izPl0, lzMinR);
  const iz1 = Math.min(izPl1, lzMaxR);

  if (!(ix1 > ix0) || !(iz1 > iz0)) {
    return clampPreviewXZToPlasterInterior({ footprintSx: sx, footprintSz: sz, x, z });
  }
  return {
    x: THREE.MathUtils.clamp(x, ix0, ix1),
    z: THREE.MathUtils.clamp(z, iz0, iz1),
  };
}

export type EditorMyApartmentAuthoringShellMeta = OwnedApartmentFractionToPreviewXZ & {
  sx: number;
  sz: number;
  /** Set when layout resolves; missing in square fallback (no ceiling clamp). */
  interiorCeilingInnerY?: number;
};

function readAuthoringShellAuthoringMetaFromAncestors(
  o: THREE.Object3D,
): EditorMyApartmentAuthoringShellMeta | null {
  let cur: THREE.Object3D | null = o.parent;
  while (cur) {
    const sx = cur.userData.editorMyApartmentSlabSx as number | undefined;
    const sz = cur.userData.editorMyApartmentSlabSz as number | undefined;
    const strictMinX = cur.userData.editorMyApartmentStrictMinX as number | undefined;
    const strictMinZ = cur.userData.editorMyApartmentStrictMinZ as number | undefined;
    const spanX = cur.userData.editorMyApartmentStrictSpanX as number | undefined;
    const spanZ = cur.userData.editorMyApartmentStrictSpanZ as number | undefined;
    const prefabOriginX = cur.userData.editorMyApartmentPrefabOriginX as number | undefined;
    const prefabOriginZ = cur.userData.editorMyApartmentPrefabOriginZ as number | undefined;
    const ceilingYRaw = cur.userData.editorMyApartmentInteriorCeilingInnerY as
      | number
      | undefined;
    const interiorCeilingInnerY =
      typeof ceilingYRaw === "number" && Number.isFinite(ceilingYRaw) && ceilingYRaw > 0
        ? ceilingYRaw
        : undefined;
    if (
      typeof sx === "number" &&
      typeof sz === "number" &&
      sx > 0 &&
      sz > 0
    ) {
      const haveStrict =
        typeof strictMinX === "number" &&
        typeof strictMinZ === "number" &&
        typeof spanX === "number" &&
        typeof spanZ === "number" &&
        typeof prefabOriginX === "number" &&
        typeof prefabOriginZ === "number" &&
        Number.isFinite(strictMinX) &&
        Number.isFinite(strictMinZ) &&
        Number.isFinite(spanX) &&
        Number.isFinite(spanZ) &&
        spanX > 0 &&
        spanZ > 0 &&
        Number.isFinite(prefabOriginX) &&
        Number.isFinite(prefabOriginZ);
      if (haveStrict) {
        return {
          sx,
          sz,
          strictMinX,
          strictMinZ,
          spanX,
          spanZ,
          prefabOriginX,
          prefabOriginZ,
          prefabFootprintSx: sx,
          prefabFootprintSz: sz,
          interiorCeilingInnerY,
        };
      }
      return {
        sx,
        sz,
        strictMinX: 0,
        strictMinZ: 0,
        spanX: sx,
        spanZ: sz,
        prefabOriginX: 0,
        prefabOriginZ: 0,
        prefabFootprintSx: sx,
        prefabFootprintSz: sz,
        interiorCeilingInnerY,
      };
    }
    cur = cur.parent;
  }
  return null;
}

export function snapOwnedApartmentYawRad(yRad: number): number {
  const s = EDITOR_MY_APARTMENT_YAW_SNAP_RAD;
  return Math.round(yRad / s) * s;
}

/** World Y target for mesh bottom — set when mounting built-in preview groups. */
const EDITOR_MY_APARTMENT_FURNITURE_SNAP_FLOOR_USERDATA_KEY =
  "editorMyApartmentFurnitureSnapFloorY";

/** Clamps built-in / decor gizmo uniform scale to schema bounds. */
export function clampOwnedApartmentBuiltinUniformScale(s: number): number {
  return THREE.MathUtils.clamp(
    s,
    EDITOR_MY_APARTMENT_UNIFORM_SCALE_MIN,
    EDITOR_MY_APARTMENT_UNIFORM_SCALE_MAX,
  );
}

/** XZ-floor plane only; yaw on world Y; no pitch / roll; XZ clamped to hollow-shell interior for editor walls. */
export function constrainMyApartmentFurnitureRootPose(root: THREE.Object3D): void {
  root.position.y = 0;
  const eulerW = new THREE.Euler().setFromQuaternion(root.quaternion, "YXZ");
  const y = snapOwnedApartmentYawRad(eulerW.y);
  qSnapYawScratch.setFromEuler(new THREE.Euler(0, y, 0, "YXZ"));
  root.quaternion.copy(qSnapYawScratch);

  const meta = readAuthoringShellAuthoringMetaFromAncestors(root);
  if (meta) {
    const c = clampPreviewXZToAuthoringInterior(meta, root.position.x, root.position.z);
    root.position.x = c.x;
    root.position.z = c.z;
  }

  const uniform = clampOwnedApartmentBuiltinUniformScale(
    (root.scale.x + root.scale.y + root.scale.z) / 3,
  );
  root.scale.setScalar(uniform);

  const vis = root.children[0];
  if (!vis) return;

  const snapFloorRaw = root.userData[EDITOR_MY_APARTMENT_FURNITURE_SNAP_FLOOR_USERDATA_KEY] as
    | number
    | undefined;
  const snapFloorY =
    typeof snapFloorRaw === "number" && Number.isFinite(snapFloorRaw)
      ? snapFloorRaw
      : EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y;
  snapCloneBottomToWorldFloorUnderParentScale(vis, snapFloorY, uniform);
}

export function constrainMyApartmentDecorRootPose(root: THREE.Object3D): void {
  const eulerW = new THREE.Euler().setFromQuaternion(root.quaternion, "YXZ");
  const y = snapOwnedApartmentYawRad(eulerW.y);
  qSnapYawScratch.setFromEuler(new THREE.Euler(0, y, 0, "YXZ"));
  root.quaternion.copy(qSnapYawScratch);

  const meta = readAuthoringShellAuthoringMetaFromAncestors(root);
  if (meta) {
    const c = clampPreviewXZToAuthoringInterior(meta, root.position.x, root.position.z);
    root.position.x = c.x;
    root.position.z = c.z;
  }
  const uniform = THREE.MathUtils.clamp(
    (root.scale.x + root.scale.y + root.scale.z) / 3,
    EDITOR_MY_APARTMENT_UNIFORM_SCALE_MIN,
    EDITOR_MY_APARTMENT_UNIFORM_SCALE_MAX,
  );
  root.scale.setScalar(uniform);

  if (meta) {
    root.updateMatrixWorld(true);
    decorClampBoundsScratch.setFromObject(root);
    decorClampBoundsScratch.getSize(decorClampSizeScratch);
    decorClampBoundsScratch.getCenter(decorClampCenterScratch);

    const minX =
      meta.strictMinX - meta.prefabOriginX + EDITOR_MY_APARTMENT_DECOR_BOUNDARY_SLACK_M;
    const maxX =
      meta.strictMinX + meta.spanX - meta.prefabOriginX - EDITOR_MY_APARTMENT_DECOR_BOUNDARY_SLACK_M;
    const minZ =
      meta.strictMinZ - meta.prefabOriginZ + EDITOR_MY_APARTMENT_DECOR_BOUNDARY_SLACK_M;
    const maxZ =
      meta.strictMinZ + meta.spanZ - meta.prefabOriginZ - EDITOR_MY_APARTMENT_DECOR_BOUNDARY_SLACK_M;

    let dx = 0;
    if (decorClampSizeScratch.x > maxX - minX) {
      dx = (minX + maxX) * 0.5 - decorClampCenterScratch.x;
    } else if (decorClampBoundsScratch.min.x < minX) {
      dx = minX - decorClampBoundsScratch.min.x;
    } else if (decorClampBoundsScratch.max.x > maxX) {
      dx = maxX - decorClampBoundsScratch.max.x;
    }

    let dz = 0;
    if (decorClampSizeScratch.z > maxZ - minZ) {
      dz = (minZ + maxZ) * 0.5 - decorClampCenterScratch.z;
    } else if (decorClampBoundsScratch.min.z < minZ) {
      dz = minZ - decorClampBoundsScratch.min.z;
    } else if (decorClampBoundsScratch.max.z > maxZ) {
      dz = maxZ - decorClampBoundsScratch.max.z;
    }

    if (dx !== 0 || dz !== 0) {
      root.position.x += dx;
      root.position.z += dz;
    }
  }

  /** Floor slab, optional hollow-shell ceiling (no ceiling mesh yet, same `vh` as walls). */
  const floorY = EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y;
  const maxBottomY = floorY + EDITOR_MY_APARTMENT_DECOR_DY_SCHEMA_MAX_M;
  const ceilY = meta?.interiorCeilingInnerY;
  const ceilCap =
    typeof ceilY === "number" && ceilY > floorY
      ? ceilY - EDITOR_MY_APARTMENT_INTERIOR_SLACK_M
      : undefined;

  for (let pass = 0; pass < 4; pass++) {
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    if (box.min.y < floorY) {
      root.position.y += floorY - box.min.y;
      continue;
    }
    if (ceilCap !== undefined && box.max.y > ceilCap) {
      root.position.y -= box.max.y - ceilCap;
      continue;
    }
    if (box.min.y > maxBottomY) {
      root.position.y -= box.min.y - maxBottomY;
      continue;
    }
    break;
  }
}

export type EditorMyApartmentGltfTemplates = {
  wardrobeScene: THREE.Object3D;
  footScene: THREE.Object3D;
  stoveScene: THREE.Object3D;
  bedScene: THREE.Object3D;
};

export type EditorMyApartmentDecorTemplateMap = Map<string, THREE.Object3D>;

export function previewWorldFromNormalizedPlacement(args: {
  spans: OwnedApartmentFractionToPreviewXZ;
  fx: number;
  fz: number;
}): { x: number; z: number } {
  const { spans, fx, fz } = args;
  const pos = clampPreviewXZToAuthoringInterior(
    spans,
    spans.strictMinX + fx * spans.spanX - spans.prefabOriginX,
    spans.strictMinZ + fz * spans.spanZ - spans.prefabOriginZ,
  );
  return {
    x: pos.x,
    z: pos.z,
  };
}

function snapCloneBottomToWorldFloor(root: THREE.Object3D, floorWorldY: number): void {
  root.position.y = 0;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  root.position.y = floorWorldY - box.min.y;
  root.updateMatrixWorld(true);
}

function snapCloneBottomToWorldFloorUnderParentScale(
  root: THREE.Object3D,
  floorWorldY: number,
  parentUniformScale: number,
): void {
  root.position.y = 0;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const scale = Math.max(1e-6, parentUniformScale);
  root.position.y = floorWorldY / scale - box.min.y;
  root.updateMatrixWorld(true);
}

function disposeGroupSubtreeGeometry(group: THREE.Object3D): void {
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
}

function cloneProp(template: THREE.Object3D): THREE.Object3D {
  const r = template.clone(true);
  r.userData.mammothEditorMyApartmentProp = true;
  r.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  return r;
}

function decorAssetUrl(modelRelPath: string): string {
  return `/${modelRelPath.trim().replace(/^\/+/u, "")}`;
}

function previewWorldFromDoc(
  doc: OwnedApartmentBuiltinsDoc,
  m: OwnedApartmentFractionToPreviewXZ,
): {
  wardrobe: { x: number; z: number; yaw: number; snapFloorY: number };
  foot: { x: number; z: number; yaw: number; snapFloorY: number };
  stove: { x: number; z: number; yaw: number; snapFloorY: number };
  bed: { x: number; z: number; yaw: number; snapFloorY: number };
} {
  const wardrobeSnap = EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y + doc.wardrobeDy;
  const footSnap = EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y + doc.footDy;
  const stoveSnap = EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y + doc.stoveDy;
  const bedSnap = EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y + doc.bedDy;
  const wPos = clampPreviewXZToAuthoringInterior(
    m,
    m.strictMinX + doc.wardrobeFx * m.spanX - m.prefabOriginX,
    m.strictMinZ + doc.wardrobeFz * m.spanZ - m.prefabOriginZ,
  );
  const footPos = clampPreviewXZToAuthoringInterior(
    m,
    m.strictMinX + doc.footFx * m.spanX - m.prefabOriginX,
    m.strictMinZ + doc.footFz * m.spanZ - m.prefabOriginZ,
  );
  const stovePos = clampPreviewXZToAuthoringInterior(
    m,
    m.strictMinX + doc.stoveFx * m.spanX - m.prefabOriginX,
    m.strictMinZ + doc.stoveFz * m.spanZ - m.prefabOriginZ,
  );
  const bedPos = clampPreviewXZToAuthoringInterior(
    m,
    m.strictMinX + doc.bedFx * m.spanX - m.prefabOriginX,
    m.strictMinZ + doc.bedFz * m.spanZ - m.prefabOriginZ,
  );
  return {
    wardrobe: {
      x: wPos.x,
      z: wPos.z,
      yaw: doc.wardrobeYawRad,
      snapFloorY: wardrobeSnap,
    },
    foot: {
      x: footPos.x,
      z: footPos.z,
      yaw: doc.footYawRad,
      snapFloorY: footSnap,
    },
    stove: {
      x: stovePos.x,
      z: stovePos.z,
      yaw: doc.stoveYawRad,
      snapFloorY: stoveSnap,
    },
    bed: {
      x: bedPos.x,
      z: bedPos.z,
      yaw: doc.bedYawRad,
      snapFloorY: bedSnap,
    },
  };
}

function placeWardrobeGroup(
  group: THREE.Group,
  templates: EditorMyApartmentGltfTemplates,
  doc: OwnedApartmentBuiltinsDoc,
  spans: OwnedApartmentFractionToPreviewXZ,
): void {
  disposeGroupSubtreeGeometry(group);
  group.clear();
  group.userData.mammothEditorMyApartmentProp = true;
  group.userData.mammothEditorMyApartmentPiece = "wardrobe" as const;
  const pv = previewWorldFromDoc(doc, spans).wardrobe;
  group.position.set(pv.x, 0, pv.z);
  group.rotation.y = snapOwnedApartmentYawRad(pv.yaw);
  group.scale.setScalar(clampOwnedApartmentBuiltinUniformScale(doc.wardrobeUniformScale));
  group.userData[EDITOR_MY_APARTMENT_FURNITURE_SNAP_FLOOR_USERDATA_KEY] = pv.snapFloorY;
  const vis = cloneProp(templates.wardrobeScene);
  vis.scale.setScalar(WARDROBE_VIS_SCALE);
  snapCloneBottomToWorldFloorUnderParentScale(vis, pv.snapFloorY, group.scale.x);
  group.add(vis);
}

function placeFootlockerGroup(
  group: THREE.Group,
  templates: EditorMyApartmentGltfTemplates,
  doc: OwnedApartmentBuiltinsDoc,
  spans: OwnedApartmentFractionToPreviewXZ,
): void {
  disposeGroupSubtreeGeometry(group);
  group.clear();
  group.userData.mammothEditorMyApartmentProp = true;
  group.userData.mammothEditorMyApartmentPiece = "footlocker" as const;
  const pv = previewWorldFromDoc(doc, spans).foot;
  group.position.set(pv.x, 0, pv.z);
  group.rotation.y = snapOwnedApartmentYawRad(pv.yaw);
  group.scale.setScalar(clampOwnedApartmentBuiltinUniformScale(doc.footUniformScale));
  group.userData[EDITOR_MY_APARTMENT_FURNITURE_SNAP_FLOOR_USERDATA_KEY] = pv.snapFloorY;
  const vis = cloneProp(templates.footScene);
  vis.scale.setScalar(FOOTLOCKER_VIS_SCALE);
  snapCloneBottomToWorldFloorUnderParentScale(vis, pv.snapFloorY, group.scale.x);
  group.add(vis);
}

function placeStoveGroup(
  group: THREE.Group,
  templates: EditorMyApartmentGltfTemplates,
  doc: OwnedApartmentBuiltinsDoc,
  spans: OwnedApartmentFractionToPreviewXZ,
): void {
  disposeGroupSubtreeGeometry(group);
  group.clear();
  group.userData.mammothEditorMyApartmentProp = true;
  group.userData.mammothEditorMyApartmentPiece = "stove" as const;
  const pv = previewWorldFromDoc(doc, spans).stove;
  group.position.set(pv.x, 0, pv.z);
  group.rotation.y = snapOwnedApartmentYawRad(pv.yaw);
  group.scale.setScalar(clampOwnedApartmentBuiltinUniformScale(doc.stoveUniformScale));
  group.userData[EDITOR_MY_APARTMENT_FURNITURE_SNAP_FLOOR_USERDATA_KEY] = pv.snapFloorY;
  const vis = cloneProp(templates.stoveScene);
  vis.scale.setScalar(STOVE_VIS_SCALE);
  snapCloneBottomToWorldFloorUnderParentScale(vis, pv.snapFloorY, group.scale.x);
  group.add(vis);
}

function placeBedGroup(
  group: THREE.Group,
  templates: EditorMyApartmentGltfTemplates,
  doc: OwnedApartmentBuiltinsDoc,
  spans: OwnedApartmentFractionToPreviewXZ,
): void {
  disposeGroupSubtreeGeometry(group);
  group.clear();
  group.userData.mammothEditorMyApartmentProp = true;
  group.userData.mammothEditorMyApartmentPiece = "bed" as const;
  const pv = previewWorldFromDoc(doc, spans).bed;
  group.position.set(pv.x, 0, pv.z);
  group.rotation.y = snapOwnedApartmentYawRad(pv.yaw);
  group.scale.setScalar(clampOwnedApartmentBuiltinUniformScale(doc.bedUniformScale));
  group.userData[EDITOR_MY_APARTMENT_FURNITURE_SNAP_FLOOR_USERDATA_KEY] = pv.snapFloorY;
  const vis = cloneProp(templates.bedScene);
  vis.scale.setScalar(BED_VIS_SCALE);
  snapCloneBottomToWorldFloorUnderParentScale(vis, pv.snapFloorY, group.scale.x);
  group.add(vis);
}

function placeDecorGroup(args: {
  group: THREE.Group;
  template: THREE.Object3D;
  decor: OwnedApartmentBuiltinsDoc["decorItems"][number];
  spans: OwnedApartmentFractionToPreviewXZ;
}): void {
  const { group, template, decor, spans } = args;
  disposeGroupSubtreeGeometry(group);
  group.clear();
  group.userData.mammothEditorMyApartmentProp = true;
  group.userData.mammothEditorMyApartmentDecorId = decor.id;
  const pv = previewWorldFromNormalizedPlacement({
    spans,
    fx: decor.fx,
    fz: decor.fz,
  });
  group.position.set(pv.x, 0, pv.z);
  group.rotation.y = snapOwnedApartmentYawRad(decor.yawRad);
  group.scale.setScalar(decor.uniformScale);
  const vis = cloneProp(template);
  snapCloneBottomToWorldFloorUnderParentScale(
    vis,
    EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y + decor.dy,
    decor.uniformScale,
  );
  group.add(vis);
  constrainMyApartmentDecorRootPose(group);
}

export type EditorMyApartmentFurnitureMount = {
  root: THREE.Group;
  groups: Record<MyApartmentLayoutPiece, THREE.Group>;
  selectionGroups: Record<string, THREE.Group>;
  dispose: () => void;
};

export async function loadEditorMyApartmentGltfTemplates(): Promise<EditorMyApartmentGltfTemplates> {
  const loader = new GLTFLoader();
  const [wardrobeGltf, footGltf, stoveGltf, bedGltf] = await Promise.all([
    loader.loadAsync(WARDROBE_URL),
    loader.loadAsync(FOOTLOCKER_URL),
    loader.loadAsync(STOVE_URL),
    loader.loadAsync(BED_URL),
  ]);
  return {
    wardrobeScene: wardrobeGltf.scene,
    footScene: footGltf.scene,
    stoveScene: stoveGltf.scene,
    bedScene: bedGltf.scene,
  };
}

const editorMyApartmentDecorTemplatePromises = new Map<string, Promise<THREE.Object3D>>();

export async function loadEditorMyApartmentDecorTemplates(
  modelRelPaths: readonly string[],
): Promise<EditorMyApartmentDecorTemplateMap> {
  const gltfLoader = new GLTFLoader();
  const objLoader = new OBJLoader();
  const out: EditorMyApartmentDecorTemplateMap = new Map();
  await Promise.all(
    [...new Set(modelRelPaths)].map(async (modelRelPath) => {
      let pending = editorMyApartmentDecorTemplatePromises.get(modelRelPath);
      if (!pending) {
        const url = decorAssetUrl(modelRelPath);
        pending = modelRelPath.toLowerCase().endsWith(".obj")
          ? objLoader.loadAsync(url)
          : gltfLoader.loadAsync(url).then((gltf) => gltf.scene);
        editorMyApartmentDecorTemplatePromises.set(modelRelPath, pending);
      }
      out.set(modelRelPath, await pending);
    }),
  );
  return out;
}

export function mountEditorMyApartmentFurnitureUnder(
  parent: THREE.Object3D,
  templates: EditorMyApartmentGltfTemplates,
  decorTemplates: EditorMyApartmentDecorTemplateMap,
  doc: OwnedApartmentBuiltinsDoc,
  authoringFractionMapping: OwnedApartmentFractionToPreviewXZ,
): EditorMyApartmentFurnitureMount {
  const root = new THREE.Group();
  root.name = "editor_my_apartment_furniture";
  parent.add(root);

  const groups: Record<MyApartmentLayoutPiece, THREE.Group> = {
    bed: new THREE.Group(),
    wardrobe: new THREE.Group(),
    footlocker: new THREE.Group(),
    stove: new THREE.Group(),
  };

  groups.bed.name = "editor_my_apartment_bed";
  groups.wardrobe.name = "editor_my_apartment_wardrobe";
  groups.footlocker.name = "editor_my_apartment_footlocker";
  groups.stove.name = "editor_my_apartment_stove";

  for (const g of Object.values(groups)) root.add(g);

  placeBedGroup(groups.bed, templates, doc, authoringFractionMapping);
  placeWardrobeGroup(groups.wardrobe, templates, doc, authoringFractionMapping);
  placeFootlockerGroup(groups.footlocker, templates, doc, authoringFractionMapping);
  placeStoveGroup(groups.stove, templates, doc, authoringFractionMapping);

  const selectionGroups: Record<string, THREE.Group> = {
    [editorMyApartmentSelectedIdForPiece("bed")]: groups.bed,
    [editorMyApartmentSelectedIdForPiece("wardrobe")]: groups.wardrobe,
    [editorMyApartmentSelectedIdForPiece("footlocker")]: groups.footlocker,
    [editorMyApartmentSelectedIdForPiece("stove")]: groups.stove,
  };

  for (const decor of doc.decorItems) {
    const template = decorTemplates.get(decor.modelRelPath);
    if (!template) continue;
    const group = new THREE.Group();
    group.name = `editor_my_apartment_decor:${decor.id}`;
    root.add(group);
    placeDecorGroup({ group, template, decor, spans: authoringFractionMapping });
    selectionGroups[editorMyApartmentSelectedIdForDecor(decor.id)] = group;
  }

  const dispose = (): void => {
    for (const g of Object.values(selectionGroups)) disposeGroupSubtreeGeometry(g);
    parent.remove(root);
    root.clear();
  };

  return { root, groups, selectionGroups, dispose };
}

export function updateEditorMyApartmentMountFromDoc(
  mount: EditorMyApartmentFurnitureMount,
  templates: EditorMyApartmentGltfTemplates,
  decorTemplates: EditorMyApartmentDecorTemplateMap,
  doc: OwnedApartmentBuiltinsDoc,
  authoringFractionMapping: OwnedApartmentFractionToPreviewXZ,
): void {
  const parent = mount.root.parent;
  if (!parent) return;
  const rebuilt = mountEditorMyApartmentFurnitureUnder(
    parent,
    templates,
    decorTemplates,
    doc,
    authoringFractionMapping,
  );
  mount.dispose();
  mount.root = rebuilt.root;
  mount.groups = rebuilt.groups;
  mount.selectionGroups = rebuilt.selectionGroups;
  mount.dispose = rebuilt.dispose;
}
