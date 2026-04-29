import * as THREE from "three";
import type { StairWellDef } from "@the-mammoth/schemas";
import { exteriorConcreteWallMaterial } from "./floorPlaceholderMeshMaterials.js";
import { addShaftShell } from "./shaftShell.js";
import { shaftCeil } from "./shaftHoistwayMaterials.js";
import { tagShaftShellMeshesSkipFloorGeometryMerge } from "./elevatorShaftPlaceholder.js";
import { createStairWellMaterials } from "./stairWellMaterials.js";
import {
  STAIR_WELL_OPENING_PROXY_ID,
  STAIR_WELL_SECONDARY_OPENING_PROXY_ID,
  isStairWellOpeningProxyId,
  type StairWellAuthoringScope,
  type StairWellOpeningProxyId,
} from "./stairWellEditorIds.js";
import {
  stairWellOpeningDefForProxyId,
  stairWellOpeningDefForScope,
  type StairWellEntryOpeningDef,
} from "./stairWellOpeningHelpers.js";
import {
  addStairWellPlaceholder,
  applyStairWellPartTransforms,
  groupGeneratedStairWellWallParts,
  stairWellHasFloorSlab,
  tagGeneratedStairWellShellParts,
  type StairWellPreviewOpeningSpec,
} from "./stairWellPlaceholder.js";
import {
  resolveStairWellGroundDoor,
  resolveStairWellSupplementalDoors,
  type ResolvedStairWellGroundDoor,
  type StairWellGroundDoorContext,
} from "./stairWellGroundDoorResolve.js";
import type { CardinalFace } from "./wallWithDoorCutout.js";
import { disposeObject3D } from "./threeDispose.js";

export type BuildStairWellPreviewRootArgs = {
  sx: number;
  sy: number;
  sz: number;
  def?: StairWellDef;
  authoringScope?: StairWellAuthoringScope;
  towardPlateXZ?: readonly [number, number];
  shaftPlateXZ?: readonly [number, number];
  /** Preview-only facade cardinals; lets the editor match runtime shaft exterior cladding. */
  shaftExteriorFaces?: readonly CardinalFace[];
};

export function buildStairWellPreviewRoot(args: BuildStairWellPreviewRootArgs): THREE.Group {
  const root = new THREE.Group();
  root.name = "editor_stair_well_preview";
  root.userData.editorStairPreviewArgs = args;
  addStairWellPlaceholder(root, args.sx, args.sy, args.sz, {
    def: args.def,
    authoringScope: args.authoringScope,
    omitGroundStoreyCornerLandings: args.authoringScope === "ground",
    previewGroundDoorContext:
      args.towardPlateXZ && args.shaftPlateXZ
        ? {
            towardPlateXZ: args.towardPlateXZ,
            shaftPlateXZ: args.shaftPlateXZ,
          }
        : undefined,
    shaftExteriorFaces: args.shaftExteriorFaces,
    addOpeningEditProxy: false,
  });
  return root;
}

function disposeObject3DTree(root: THREE.Object3D): void {
  disposeObject3D(root);
}

export function rebuildStairWellPreviewRoot(
  root: THREE.Group,
  def: StairWellDef | undefined,
): void {
  const args = root.userData.editorStairPreviewArgs as BuildStairWellPreviewRootArgs | undefined;
  if (!args) return;
  while (root.children.length > 0) {
    const child = root.children[0]!;
    root.remove(child);
    disposeObject3DTree(child);
  }
  addStairWellPlaceholder(root, args.sx, args.sy, args.sz, {
    def,
    authoringScope: args.authoringScope,
    omitGroundStoreyCornerLandings: args.authoringScope === "ground",
    previewGroundDoorContext:
      args.towardPlateXZ && args.shaftPlateXZ
        ? {
            towardPlateXZ: args.towardPlateXZ,
            shaftPlateXZ: args.shaftPlateXZ,
          }
        : undefined,
    shaftExteriorFaces: args.shaftExteriorFaces,
    addOpeningEditProxy: false,
  });
}

function resolveStairWellPreviewOpenings(args: {
  sx: number;
  sy: number;
  sz: number;
  context?: StairWellGroundDoorContext;
  def?: StairWellDef;
  authoringScope: StairWellAuthoringScope;
}): StairWellPreviewOpeningSpec[] {
  const primary = resolveStairWellGroundDoor({
    sx: args.sx,
    sy: args.sy,
    sz: args.sz,
    context: args.context,
    def: args.def,
    authoringScope: args.authoringScope,
  });
  if (!primary) return [];
  const out: StairWellPreviewOpeningSpec[] = [
    { proxyId: STAIR_WELL_OPENING_PROXY_ID, opening: primary },
  ];
  for (const opening of resolveStairWellSupplementalDoors({
    sx: args.sx,
    sy: args.sy,
    sz: args.sz,
    context: args.context,
    def: args.def,
    authoringScope: args.authoringScope,
    primaryDoor: primary,
  })) {
    out.push({
      proxyId: STAIR_WELL_SECONDARY_OPENING_PROXY_ID,
      opening,
    });
  }
  return out;
}

function syncStairWellOpeningEditProxy(
  proxy: THREE.Mesh,
  proxyId: StairWellOpeningProxyId,
  scope: StairWellAuthoringScope,
  sx: number,
  sy: number,
  sz: number,
  context: StairWellGroundDoorContext | undefined,
  opening: ResolvedStairWellGroundDoor,
): void {
  const hx = sx * 0.5;
  const hz = sz * 0.5;
  const wt = 0.11;
  const inwardInset = 0.02;
  const depth = 0.055;
  proxy.geometry?.dispose();
  proxy.geometry =
    opening.face === "e" || opening.face === "w"
      ? new THREE.BoxGeometry(depth, Math.max(0.05, opening.heightM), Math.max(0.05, opening.widthM))
      : new THREE.BoxGeometry(Math.max(0.05, opening.widthM), Math.max(0.05, opening.heightM), depth);
  if (!(proxy.material instanceof THREE.MeshBasicMaterial)) {
    proxy.material = new THREE.MeshBasicMaterial({
      color: 0x55b4ff,
      wireframe: true,
      transparent: true,
      opacity: 0.45,
      depthTest: true,
    });
  }
  proxy.name = proxyId;
  proxy.userData.editorStairOpeningProxy = true;
  proxy.userData.editorStairOpeningId = proxyId;
  proxy.userData.editorStairOpeningScope = scope;
  proxy.userData.editorStairPreviewDims = [sx, sy, sz] as const;
  if (context) proxy.userData.editorStairPreviewContext = context;
  else delete proxy.userData.editorStairPreviewContext;
  proxy.rotation.set(0, 0, 0);
  proxy.scale.set(1, 1, 1);
  if (opening.face === "e") {
    proxy.position.set(hx - wt - inwardInset, opening.centerYM, opening.tangentOffsetAlongWallM);
  } else if (opening.face === "w") {
    proxy.position.set(-hx + wt + inwardInset, opening.centerYM, opening.tangentOffsetAlongWallM);
  } else if (opening.face === "n") {
    proxy.position.set(opening.tangentOffsetAlongWallM, opening.centerYM, hz - wt - inwardInset);
  } else {
    proxy.position.set(opening.tangentOffsetAlongWallM, opening.centerYM, -hz + wt + inwardInset);
  }
}

export function rebuildStairWellPreviewOpening(
  root: THREE.Group,
  def: StairWellDef | undefined,
  opts?: { preserveLiveProxyId?: string | null },
): void {
  const args = root.userData.editorStairPreviewArgs as BuildStairWellPreviewRootArgs | undefined;
  if (!args) return;
  const authoringScope = args.authoringScope ?? "typical";
  const context =
    args.towardPlateXZ && args.shaftPlateXZ
      ? {
          towardPlateXZ: args.towardPlateXZ,
          shaftPlateXZ: args.shaftPlateXZ,
        }
      : undefined;
  const openings = resolveStairWellPreviewOpenings({
    sx: args.sx,
    sy: args.sy,
    sz: args.sz,
    context,
    def,
    authoringScope,
  });
  const doomed: THREE.Object3D[] = [];
  const proxyById = new Map<StairWellOpeningProxyId, THREE.Mesh>();
  for (const child of root.children) {
    if (isStairWellOpeningProxyId(child.name) && child instanceof THREE.Mesh) {
      proxyById.set(child.name, child);
      continue;
    }
    if (
      child.name === "shaft_floor" ||
      child.name === "shaft_ceiling" ||
      child.name === "shaft_wall" ||
      child.name.startsWith("shaft_wall_")
    ) {
      doomed.push(child);
    }
  }
  for (const child of doomed) {
    root.remove(child);
    disposeObject3DTree(child);
  }
  const mats = createStairWellMaterials(def);
  addShaftShell(root, args.sx, args.sy, args.sz, mats.wall, shaftCeil, {
    includeFloor: stairWellHasFloorSlab(authoringScope),
    includeCeiling: false,
    floorMat: mats.floor,
    groundDoor: openings[0]?.opening.groundDoor ?? null,
    supplementalDoors: openings.slice(1).map((entry) => entry.opening.groundDoor),
    exteriorShaftFaces: args.shaftExteriorFaces,
    exteriorWallMat: exteriorConcreteWallMaterial,
  });
  groupGeneratedStairWellWallParts(root);
  tagGeneratedStairWellShellParts(root, authoringScope, openings);
  tagShaftShellMeshesSkipFloorGeometryMerge(root);
  applyStairWellPartTransforms(root, def);
  for (const entry of openings) {
    const liveProxy = proxyById.get(entry.proxyId) ?? new THREE.Mesh();
    if (!proxyById.has(entry.proxyId)) root.add(liveProxy);
    if (opts?.preserveLiveProxyId === entry.proxyId && proxyById.has(entry.proxyId)) {
      liveProxy.name = entry.proxyId;
      liveProxy.userData.editorStairOpeningProxy = true;
      liveProxy.userData.editorStairOpeningId = entry.proxyId;
      liveProxy.userData.editorStairOpeningScope = authoringScope;
      liveProxy.userData.editorStairPreviewDims = [args.sx, args.sy, args.sz] as const;
      if (context) liveProxy.userData.editorStairPreviewContext = context;
      else delete liveProxy.userData.editorStairPreviewContext;
    } else {
      syncStairWellOpeningEditProxy(
        liveProxy,
        entry.proxyId,
        authoringScope,
        args.sx,
        args.sy,
        args.sz,
        context,
        entry.opening,
      );
    }
    proxyById.delete(entry.proxyId);
  }
  for (const orphan of proxyById.values()) {
    root.remove(orphan);
    disposeObject3DTree(orphan);
  }
  if (openings[0]) {
    root.userData.editorStairPreviewGroundDoor = {
      face: openings[0].opening.face,
      tangentOffsetAlongWall: openings[0].opening.tangentOffsetAlongWallM,
    };
  } else {
    delete root.userData.editorStairPreviewGroundDoor;
  }
}

export function stairWellEntryOpeningFromProxyMesh(
  proxy: THREE.Object3D,
  def: StairWellDef | undefined,
): StairWellEntryOpeningDef | null {
  const scope =
    (proxy.userData.editorStairOpeningScope as StairWellAuthoringScope | undefined) ?? "typical";
  const dims = proxy.userData.editorStairPreviewDims as readonly [number, number, number] | undefined;
  const context = proxy.userData.editorStairPreviewContext as
    | StairWellGroundDoorContext
    | undefined;
  if (!dims) return null;
  const proxyIdRaw = (proxy.userData.editorStairOpeningId as string | undefined) ?? proxy.name;
  const proxyId = isStairWellOpeningProxyId(proxyIdRaw)
    ? proxyIdRaw
    : STAIR_WELL_OPENING_PROXY_ID;
  const current =
    proxyId === STAIR_WELL_SECONDARY_OPENING_PROXY_ID
      ? resolveStairWellSupplementalDoors({
          sx: dims[0],
          sy: dims[1],
          sz: dims[2],
          context,
          def,
          authoringScope: scope,
        })[0] ?? null
      : resolveStairWellGroundDoor({
          sx: dims[0],
          sy: dims[1],
          sz: dims[2],
          context,
          def,
          authoringScope: scope,
        });
  if (!current) return null;
  const widthScale =
    current.face === "e" || current.face === "w" ? Math.abs(proxy.scale.z) : Math.abs(proxy.scale.x);
  const nextRaw: StairWellEntryOpeningDef = {
    face: current.face,
    tangentOffsetAlongWallM:
      current.face === "e" || current.face === "w" ? proxy.position.z : proxy.position.x,
    widthM: current.widthM * widthScale,
    heightM: current.heightM * Math.abs(proxy.scale.y),
    centerYM: proxy.position.y,
  };
  const baseDef = (def ?? { id: "stair_preview", version: 1 }) as StairWellDef;
  const nextDef: StairWellDef =
    proxyId === STAIR_WELL_SECONDARY_OPENING_PROXY_ID
      ? {
          ...baseDef,
          secondaryEntryOpening: {
            ...stairWellOpeningDefForProxyId(def, scope, proxyId),
            ...nextRaw,
          },
        }
      : scope === "ground"
        ? {
            ...baseDef,
            groundEntryOpening: { ...stairWellOpeningDefForScope(def, scope), ...nextRaw },
          }
        : {
            ...baseDef,
            entryOpening: { ...stairWellOpeningDefForScope(def, scope), ...nextRaw },
          };
  const resolved =
    proxyId === STAIR_WELL_SECONDARY_OPENING_PROXY_ID
      ? resolveStairWellSupplementalDoors({
          sx: dims[0],
          sy: dims[1],
          sz: dims[2],
          context,
          def: nextDef,
          authoringScope: scope,
        })[0] ?? null
      : resolveStairWellGroundDoor({
          sx: dims[0],
          sy: dims[1],
          sz: dims[2],
          context,
          authoringScope: scope,
          def: nextDef,
        });
  if (!resolved) return null;
  return {
    face: resolved.face,
    tangentOffsetAlongWallM: resolved.tangentOffsetAlongWallM,
    widthM: resolved.widthM,
    heightM: resolved.heightM,
    centerYM: resolved.centerYM,
  };
}
