import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { UNIT_SHELL_WALL_THICKNESS_M } from "@the-mammoth/world";
import type { MyApartmentLayoutPiece } from "../../state/editorStoreTypes.js";
import type { OwnedApartmentBuiltinsDoc } from "@the-mammoth/schemas";
import type { OwnedApartmentFractionToPreviewXZ } from "./editorMyApartmentAuthoringShell.js";

const WARDROBE_URL = "/static/models/objects/wardrobe-closet.glb";
const FOOTLOCKER_URL = "/static/models/objects/footlocker.glb";
const BED_URL = "/static/models/objects/bed.glb";

const WARDROBE_VIS_SCALE = 0.98;
const FOOTLOCKER_VIS_SCALE = 0.56;
const BED_VIS_SCALE = 1.14;

/** Top of authoring shell floor slab — keep in sync with `editorMyApartmentAuthoringShell.ts`. */
export const EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y = 0.02;

/** Gizmo + serialized yaw for built-in apartment props (45° steps). */
export const EDITOR_MY_APARTMENT_YAW_SNAP_RAD = Math.PI / 4;

const qSnapYawScratch = new THREE.Quaternion();

/** Breath room inside plaster inner faces so thick prop meshes do not plane-fight drywall. */
const EDITOR_MY_APARTMENT_INTERIOR_SLACK_M = 0.03;

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

function readAuthoringShellSlabFromAncestors(
  o: THREE.Object3D,
): { sx: number; sz: number } | null {
  let cur: THREE.Object3D | null = o.parent;
  while (cur) {
    const sx = cur.userData.editorMyApartmentSlabSx as number | undefined;
    const sz = cur.userData.editorMyApartmentSlabSz as number | undefined;
    if (
      typeof sx === "number" &&
      typeof sz === "number" &&
      sx > 0 &&
      sz > 0
    ) {
      return { sx, sz };
    }
    cur = cur.parent;
  }
  return null;
}

export function snapOwnedApartmentYawRad(yRad: number): number {
  const s = EDITOR_MY_APARTMENT_YAW_SNAP_RAD;
  return Math.round(yRad / s) * s;
}

/** XZ-floor plane only; yaw on world Y; no pitch / roll; XZ clamped to hollow-shell interior for editor walls. */
export function constrainMyApartmentFurnitureRootPose(root: THREE.Object3D): void {
  root.position.y = 0;
  const eulerW = new THREE.Euler().setFromQuaternion(root.quaternion, "YXZ");
  const y = snapOwnedApartmentYawRad(eulerW.y);
  qSnapYawScratch.setFromEuler(new THREE.Euler(0, y, 0, "YXZ"));
  root.quaternion.copy(qSnapYawScratch);

  const slab = readAuthoringShellSlabFromAncestors(root);
  if (slab) {
    const c = clampPreviewXZToPlasterInterior({
      footprintSx: slab.sx,
      footprintSz: slab.sz,
      x: root.position.x,
      z: root.position.z,
    });
    root.position.x = c.x;
    root.position.z = c.z;
  }
}

export type EditorMyApartmentGltfTemplates = {
  wardrobeScene: THREE.Object3D;
  footScene: THREE.Object3D;
  bedScene: THREE.Object3D;
};

function snapCloneBottomToWorldFloor(root: THREE.Object3D, floorWorldY: number): void {
  root.position.y = 0;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  root.position.y = floorWorldY - box.min.y;
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

function previewWorldFromDoc(
  doc: OwnedApartmentBuiltinsDoc,
  m: OwnedApartmentFractionToPreviewXZ,
): {
  wardrobe: { x: number; z: number; yaw: number; snapFloorY: number };
  foot: { x: number; z: number; yaw: number; snapFloorY: number };
  bed: { x: number; z: number; yaw: number; snapFloorY: number };
} {
  const wardrobeSnap = EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y + doc.wardrobeDy;
  const footSnap = EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y + doc.footDy;
  const bedSnap = EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y + doc.bedDy;
  const wPos = clampPreviewXZToPlasterInterior({
    footprintSx: m.prefabFootprintSx,
    footprintSz: m.prefabFootprintSz,
    x: m.strictMinX + doc.wardrobeFx * m.spanX - m.prefabOriginX,
    z: m.strictMinZ + doc.wardrobeFz * m.spanZ - m.prefabOriginZ,
  });
  const footPos = clampPreviewXZToPlasterInterior({
    footprintSx: m.prefabFootprintSx,
    footprintSz: m.prefabFootprintSz,
    x: m.strictMinX + doc.footFx * m.spanX - m.prefabOriginX,
    z: m.strictMinZ + doc.footFz * m.spanZ - m.prefabOriginZ,
  });
  const bedPos = clampPreviewXZToPlasterInterior({
    footprintSx: m.prefabFootprintSx,
    footprintSz: m.prefabFootprintSz,
    x: m.strictMinX + doc.bedFx * m.spanX - m.prefabOriginX,
    z: m.strictMinZ + doc.bedFz * m.spanZ - m.prefabOriginZ,
  });
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
  group.scale.set(1, 1, 1);
  const vis = cloneProp(templates.wardrobeScene);
  vis.scale.setScalar(WARDROBE_VIS_SCALE);
  snapCloneBottomToWorldFloor(vis, pv.snapFloorY);
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
  group.scale.set(1, 1, 1);
  const vis = cloneProp(templates.footScene);
  vis.scale.setScalar(FOOTLOCKER_VIS_SCALE);
  snapCloneBottomToWorldFloor(vis, pv.snapFloorY);
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
  group.scale.set(1, 1, 1);
  const vis = cloneProp(templates.bedScene);
  vis.scale.setScalar(BED_VIS_SCALE);
  snapCloneBottomToWorldFloor(vis, pv.snapFloorY);
  group.add(vis);
}

export type EditorMyApartmentFurnitureMount = {
  root: THREE.Group;
  groups: Record<MyApartmentLayoutPiece, THREE.Group>;
  dispose: () => void;
};

export async function loadEditorMyApartmentGltfTemplates(): Promise<EditorMyApartmentGltfTemplates> {
  const loader = new GLTFLoader();
  const [wardrobeGltf, footGltf, bedGltf] = await Promise.all([
    loader.loadAsync(WARDROBE_URL),
    loader.loadAsync(FOOTLOCKER_URL),
    loader.loadAsync(BED_URL),
  ]);
  return {
    wardrobeScene: wardrobeGltf.scene,
    footScene: footGltf.scene,
    bedScene: bedGltf.scene,
  };
}

export function mountEditorMyApartmentFurnitureUnder(
  parent: THREE.Object3D,
  templates: EditorMyApartmentGltfTemplates,
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
  };

  groups.bed.name = "editor_my_apartment_bed";
  groups.wardrobe.name = "editor_my_apartment_wardrobe";
  groups.footlocker.name = "editor_my_apartment_footlocker";

  for (const g of Object.values(groups)) root.add(g);

  placeBedGroup(groups.bed, templates, doc, authoringFractionMapping);
  placeWardrobeGroup(groups.wardrobe, templates, doc, authoringFractionMapping);
  placeFootlockerGroup(groups.footlocker, templates, doc, authoringFractionMapping);

  const dispose = (): void => {
    for (const g of Object.values(groups)) disposeGroupSubtreeGeometry(g);
    parent.remove(root);
    root.clear();
  };

  return { root, groups, dispose };
}

export function updateEditorMyApartmentMountFromDoc(
  mount: EditorMyApartmentFurnitureMount,
  templates: EditorMyApartmentGltfTemplates,
  doc: OwnedApartmentBuiltinsDoc,
  authoringFractionMapping: OwnedApartmentFractionToPreviewXZ,
): void {
  placeBedGroup(mount.groups.bed, templates, doc, authoringFractionMapping);
  placeWardrobeGroup(mount.groups.wardrobe, templates, doc, authoringFractionMapping);
  placeFootlockerGroup(mount.groups.footlocker, templates, doc, authoringFractionMapping);
}
