import * as THREE from "three";
import {
  applyOwnedApartmentWallSurfaceMaterial,
  applyOwnedApartmentWallSurfaceMaterialToVisuals,
  buildOwnedApartmentPartitionWallRefMesh,
  rebuildOwnedApartmentPartitionWallVisual,
  readOwnedApartmentPartitionWallLocalExtents,
  clampOwnedApartmentWallOpeningsForLength,
  clampWallOpeningTangentOffsetM,
  syncOwnedApartmentWallOpeningProxies,
  buildApartmentPlanarMirrorVisual,
  hasPendingAsyncPbrMaterialReveal,
} from "@the-mammoth/world";
import { demandEditorSceneRender } from "../editorScene/editorSceneRenderDemand.js";
import {
  OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
  OWNED_APARTMENT_DECOR_ROLL_RAD_MAX,
  type OwnedApartmentBuiltinsDoc,
  type OwnedApartmentMirrorItem,
} from "@the-mammoth/schemas";
import type { OwnedApartmentFractionToPreviewXZ } from "./editorMyApartmentAuthoringShell.js";
import {
  constrainMyApartmentMirrorRootPose,
  constrainMyApartmentWallRootPose,
  EDITOR_MY_APARTMENT_WALL_MESH_USERDATA_KEY,
  EDITOR_MY_APARTMENT_WALL_RUN_LENGTH_UD,
  EDITOR_MY_APARTMENT_WALL_THICKNESS_UD,
  EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y,
  findEditorMyApartmentWallSlabMesh,
  previewWorldFromNormalizedPlacement,
  snapOwnedApartmentDecorPitchRad,
  snapOwnedApartmentWallYawRad,
} from "./editorMyApartmentDecorClamp.js";
import { disposeGroupSubtreeGeometry } from "./editorMyApartmentDecorPlacement.js";
import {
  editorMyApartmentSelectedIdForMirror,
  editorMyApartmentSelectedIdForWall,
  editorMyApartmentSelectedIdForWallOpening,
  parseMyApartmentLayoutWallOpeningSelectedId,
} from "./editorMyApartmentSelection.js";
import {
  ownedApartmentWallPlacementFieldsEqual,
} from "./preserveOwnedApartmentMountPlacementRefs.js";
import type { EditorMyApartmentFurnitureMount } from "./editorMyApartmentMeshes.js";

function placeWallGroup(args: {
  group: THREE.Group;
  wall: OwnedApartmentBuiltinsDoc["wallItems"][number];
  spans: OwnedApartmentFractionToPreviewXZ;
}): void {
  const { group, wall, spans } = args;
  disposeGroupSubtreeGeometry(group);
  group.clear();
  group.userData.mammothEditorMyApartmentProp = true;
  group.userData.mammothEditorMyApartmentWallId = wall.id;

  const pv = previewWorldFromNormalizedPlacement({
    spans,
    fx: wall.fx,
    fz: wall.fz,
  });
  group.position.set(pv.x, 0, pv.z);
  group.rotation.order = "YXZ";
  const yaw = snapOwnedApartmentWallYawRad(wall.yawRad);
  const pitch = THREE.MathUtils.clamp(
    snapOwnedApartmentDecorPitchRad(wall.pitchRad),
    -OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
    OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
  );
  group.rotation.set(pitch, yaw, 0, "YXZ");

  const refMesh = buildOwnedApartmentPartitionWallRefMesh({
    parent: group,
    sizeX: wall.sizeX,
    sizeY: wall.sizeY,
    sizeZ: wall.sizeZ,
  });
  refMesh.userData[EDITOR_MY_APARTMENT_WALL_MESH_USERDATA_KEY] = true;
  refMesh.userData.mammothEditorMyApartmentProp = true;

  constrainMyApartmentWallRootPose(group, undefined, { neighborSnap: false });

  const extents = readOwnedApartmentPartitionWallLocalExtents(group) ?? {
    sizeX: wall.sizeX,
    sizeY: wall.sizeY,
    sizeZ: wall.sizeZ,
  };
  writeEditorWallSlabExtentsCache(group, {
    sizeX: extents.sizeX,
    sizeZ: extents.sizeZ,
  });
  const openings = clampOwnedApartmentWallOpeningsForLength(
    extents.sizeX,
    wall.openings ?? [],
  );
  const wallMat = new THREE.MeshStandardMaterial({ visible: true, color: 0xc9c4bc });
  rebuildOwnedApartmentPartitionWallVisual({
    parent: group,
    sizeX: extents.sizeX,
    sizeY: extents.sizeY,
    sizeZ: extents.sizeZ,
    openings,
    wallMaterial: wallMat,
    opts: { editorWallVisual: true },
  });

  applyOwnedApartmentWallSurfaceMaterialToVisuals(group, (mesh) => {
    applyOwnedApartmentWallSurfaceMaterial(mesh, wall.material);
  });

  syncOwnedApartmentWallOpeningProxies({
    wallGroup: group,
    sizeX: extents.sizeX,
    sizeY: extents.sizeY,
    sizeZ: extents.sizeZ,
    openings,
  });

  const slabBottom = EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y + wall.dy;
  group.updateMatrixWorld(true);
  const boxBefore = new THREE.Box3().setFromObject(group);
  group.position.y += slabBottom - boxBefore.min.y;
  group.updateMatrixWorld(true);
}

export function syncWallOpeningSelectionGroups(
  selectionGroups: Record<string, THREE.Group>,
  wallId: string,
  wallGroup: THREE.Group,
  openings: readonly { id: string }[],
): void {
  const keep = new Set(
    openings.map((o) => editorMyApartmentSelectedIdForWallOpening(wallId, o.id)),
  );
  for (const key of Object.keys(selectionGroups)) {
    const parsed = parseMyApartmentLayoutWallOpeningSelectedId(key);
    if (parsed?.wallId === wallId && !keep.has(key)) {
      delete selectionGroups[key];
    }
  }
  for (const opening of openings) {
    const selId = editorMyApartmentSelectedIdForWallOpening(wallId, opening.id);
    const proxy = wallGroup.children.find(
      (c) =>
        c instanceof THREE.Group &&
        c.userData.mammothEditorMyApartmentWallOpeningId === opening.id,
    );
    if (proxy instanceof THREE.Group) {
      selectionGroups[selId] = proxy;
    }
  }
}

export function purgeWallOpeningSelectionGroups(
  selectionGroups: Record<string, THREE.Group>,
  wallId: string,
): void {
  for (const key of Object.keys(selectionGroups)) {
    const parsed = parseMyApartmentLayoutWallOpeningSelectedId(key);
    if (parsed?.wallId === wallId) delete selectionGroups[key];
  }
}

/** Read wall run length for opening clamp without updating the holed visual subtree. */
export function readEditorWallSlabExtentsForOpeningClamp(
  wallRoot: THREE.Object3D,
  wallItem: Pick<OwnedApartmentBuiltinsDoc["wallItems"][number], "sizeX" | "sizeZ">,
): { sizeX: number; sizeZ: number } {
  const cachedX = wallRoot.userData[EDITOR_MY_APARTMENT_WALL_RUN_LENGTH_UD] as number | undefined;
  const cachedZ = wallRoot.userData[EDITOR_MY_APARTMENT_WALL_THICKNESS_UD] as number | undefined;
  if (
    typeof cachedX === "number" &&
    cachedX > 0 &&
    typeof cachedZ === "number" &&
    cachedZ > 0
  ) {
    return { sizeX: cachedX, sizeZ: cachedZ };
  }
  for (const child of wallRoot.children) {
    if (child instanceof THREE.Mesh && child.name === "wall_slab_ref") {
      return {
        sizeX: Math.abs(child.scale.x * wallRoot.scale.x),
        sizeZ: Math.abs(child.scale.z * wallRoot.scale.z),
      };
    }
  }
  return { sizeX: wallItem.sizeX, sizeZ: wallItem.sizeZ };
}

export function writeEditorWallSlabExtentsCache(
  wallRoot: THREE.Object3D,
  extents: { sizeX: number; sizeZ: number },
): void {
  wallRoot.userData[EDITOR_MY_APARTMENT_WALL_RUN_LENGTH_UD] = extents.sizeX;
  wallRoot.userData[EDITOR_MY_APARTMENT_WALL_THICKNESS_UD] = extents.sizeZ;
}

/** Re-cut door holes + proxies without resetting wall pose (opening drag commit / add door). */
export function refreshWallOpeningsOnGroup(
  group: THREE.Group,
  wall: OwnedApartmentBuiltinsDoc["wallItems"][number],
): void {
  const { sizeX, sizeZ } = readEditorWallSlabExtentsForOpeningClamp(group, wall);
  writeEditorWallSlabExtentsCache(group, { sizeX, sizeZ });
  const ref = findEditorMyApartmentWallSlabMesh(group);
  const sizeY = ref ? Math.abs(ref.scale.y * group.scale.y) : wall.sizeY;
  const openings = clampOwnedApartmentWallOpeningsForLength(sizeX, wall.openings ?? []);
  const wallMat = new THREE.MeshStandardMaterial({ visible: true, color: 0xc9c4bc });
  rebuildOwnedApartmentPartitionWallVisual({
    parent: group,
    sizeX,
    sizeY,
    sizeZ,
    openings,
    wallMaterial: wallMat,
    opts: { editorWallVisual: true },
  });
  applyOwnedApartmentWallSurfaceMaterialToVisuals(group, (mesh) => {
    applyOwnedApartmentWallSurfaceMaterial(mesh, wall.material);
  });
  syncOwnedApartmentWallOpeningProxies({
    wallGroup: group,
    sizeX,
    sizeY,
    sizeZ,
    openings,
  });
}

export function clampMyApartmentWallOpeningProxyPose(
  proxy: THREE.Object3D,
  wallRoot: THREE.Object3D,
  wallItem: OwnedApartmentBuiltinsDoc["wallItems"][number],
  openingId: string,
): void {
  const opening = (wallItem.openings ?? []).find((o) => o.id === openingId);
  if (!opening) return;
  const { sizeX, sizeZ } = readEditorWallSlabExtentsForOpeningClamp(wallRoot, wallItem);
  proxy.position.x = clampWallOpeningTangentOffsetM(sizeX, opening.widthM, proxy.position.x);
  proxy.position.y = opening.centerYM;
  proxy.position.z = sizeZ * 0.5 + 0.015;
  proxy.rotation.set(0, 0, 0);
  proxy.scale.set(1, 1, 1);
}

function placeMirrorGroup(args: {
  group: THREE.Group;
  mirror: OwnedApartmentMirrorItem;
  spans: OwnedApartmentFractionToPreviewXZ;
}): void {
  const { group, mirror, spans } = args;
  disposeGroupSubtreeGeometry(group);
  group.clear();
  group.userData.mammothEditorMyApartmentProp = true;
  group.userData.mammothEditorMyApartmentMirrorId = mirror.id;

  const pv = previewWorldFromNormalizedPlacement({
    spans,
    fx: mirror.fx,
    fz: mirror.fz,
  });
  group.position.set(pv.x, 0, pv.z);
  group.rotation.order = "YXZ";
  const yaw = mirror.yawRad;
  const pitch = THREE.MathUtils.clamp(
    mirror.pitchRad,
    -OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
    OWNED_APARTMENT_DECOR_PITCH_RAD_MAX,
  );
  const roll = THREE.MathUtils.clamp(
    mirror.rollRad ?? 0,
    -OWNED_APARTMENT_DECOR_ROLL_RAD_MAX,
    OWNED_APARTMENT_DECOR_ROLL_RAD_MAX,
  );
  group.rotation.set(pitch, yaw, roll, "YXZ");

  const visual = buildApartmentPlanarMirrorVisual({
    widthM: mirror.sizeX,
    heightM: mirror.sizeY,
    includeFrame: true,
  });
  group.add(visual);
  constrainMyApartmentMirrorRootPose(group);

  const slabTop = EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y + mirror.dy;
  group.updateMatrixWorld(true);
  const boxBefore = new THREE.Box3().setFromObject(group);
  group.position.y += slabTop - boxBefore.min.y;
  group.updateMatrixWorld(true);
}

/** Add/update/remove wall groups without rebuilding decor/mirror meshes. */
export function syncEditorMyApartmentWallsOnMount(
  mount: EditorMyApartmentFurnitureMount,
  doc: OwnedApartmentBuiltinsDoc,
  spans: OwnedApartmentFractionToPreviewXZ,
  opts?: {
    onlyWallIds?: ReadonlySet<string>;
    prevWallItems?: OwnedApartmentBuiltinsDoc["wallItems"];
  },
): void {
  const prevById = new Map((opts?.prevWallItems ?? []).map((w) => [w.id, w]));
  const nextIds = new Set(doc.wallItems.map((w) => w.id));
  for (const wall of doc.wallItems) {
    if (opts?.onlyWallIds && !opts.onlyWallIds.has(wall.id)) {
      continue;
    }
    const selId = editorMyApartmentSelectedIdForWall(wall.id);
    let group = mount.selectionGroups[selId];
    if (!group) {
      group = new THREE.Group();
      group.name = `editor_my_apartment_wall:${wall.id}`;
      mount.root.add(group);
      mount.selectionGroups[selId] = group;
    }
    const prevWall = prevById.get(wall.id);
    const openingsOnly =
      prevWall !== undefined &&
      group.children.length > 0 &&
      ownedApartmentWallPlacementFieldsEqual(prevWall, wall) &&
      JSON.stringify(prevWall.openings ?? []) !== JSON.stringify(wall.openings ?? []);
    if (openingsOnly) {
      refreshWallOpeningsOnGroup(group, wall);
    } else {
      placeWallGroup({ group, wall, spans });
    }
    syncWallOpeningSelectionGroups(mount.selectionGroups, wall.id, group, wall.openings ?? []);
  }
  for (const id of mount.mountedWallIds) {
    if (nextIds.has(id)) continue;
    purgeWallOpeningSelectionGroups(mount.selectionGroups, id);
    const selId = editorMyApartmentSelectedIdForWall(id);
    const group = mount.selectionGroups[selId];
    if (group) {
      disposeGroupSubtreeGeometry(group);
      mount.root.remove(group);
      delete mount.selectionGroups[selId];
    }
  }
  mount.mountedWallIds = nextIds;
  if (hasPendingAsyncPbrMaterialReveal()) {
    demandEditorSceneRender();
  }
}

export function syncEditorMyApartmentMirrorsOnMount(
  mount: EditorMyApartmentFurnitureMount,
  doc: OwnedApartmentBuiltinsDoc,
  spans: OwnedApartmentFractionToPreviewXZ,
): void {
  const nextIds = new Set(doc.mirrorItems.map((m) => m.id));
  for (const mirror of doc.mirrorItems) {
    const selId = editorMyApartmentSelectedIdForMirror(mirror.id);
    let group = mount.selectionGroups[selId];
    if (!group) {
      group = new THREE.Group();
      group.name = `editor_my_apartment_mirror:${mirror.id}`;
      mount.root.add(group);
      mount.selectionGroups[selId] = group;
    }
    placeMirrorGroup({ group, mirror, spans });
  }
  for (const id of mount.mountedMirrorIds) {
    if (nextIds.has(id)) continue;
    const selId = editorMyApartmentSelectedIdForMirror(id);
    const group = mount.selectionGroups[selId];
    if (group) {
      disposeGroupSubtreeGeometry(group);
      mount.root.remove(group);
      delete mount.selectionGroups[selId];
    }
  }
  mount.mountedMirrorIds = nextIds;
}

export { placeWallGroup, placeMirrorGroup };
