import * as THREE from "three";
import type { OwnedApartmentWallOpening } from "@the-mammoth/schemas";
import { MAMMOTH_FP_INTERIOR_PARTITION_SOLID } from "./fpInteriorPartitionSolid.js";
import {
  addWallConstantZWithHoles,
  type WallHoleXY,
} from "./wallWithDoorCutout.js";

/** Standard interior doorway clear opening (meters). */
export const OWNED_APARTMENT_STANDARD_DOOR_WIDTH_M = 0.9;
export const OWNED_APARTMENT_STANDARD_DOOR_HEIGHT_M = 2.1;

export const EDITOR_MY_APARTMENT_WALL_OPENING_PROXY_UD = "editorMyApartmentWallOpeningProxy" as const;
export const EDITOR_MY_APARTMENT_WALL_VISUAL_UD = "mammothEditorMyApartmentWallVisual" as const;
/** Holed slab fragments under `wall_visual` — editor + FP runtime share PBR application. */
export const OWNED_APARTMENT_WALL_SURFACE_MESH_UD = "mammothOwnedApartmentWallSurfaceMesh" as const;

export function wallOpeningToHoleXY(opening: OwnedApartmentWallOpening): WallHoleXY {
  const halfW = opening.widthM * 0.5;
  const halfH = opening.heightM * 0.5;
  return {
    x0: opening.tangentOffsetM - halfW,
    x1: opening.tangentOffsetM + halfW,
    y0: opening.centerYM - halfH,
    y1: opening.centerYM + halfH,
  };
}

export function clampWallOpeningTangentOffsetM(
  wallLengthM: number,
  openingWidthM: number,
  tangentOffsetM: number,
): number {
  const halfSpan = wallLengthM * 0.5;
  const halfW = openingWidthM * 0.5;
  const inset = halfW + 0.02;
  if (halfSpan <= inset + 1e-4) return 0;
  return THREE.MathUtils.clamp(tangentOffsetM, -halfSpan + inset, halfSpan - inset);
}

export function defaultOwnedApartmentWallDoorOpening(openingId: string): OwnedApartmentWallOpening {
  return {
    id: openingId,
    tangentOffsetM: 0,
    widthM: OWNED_APARTMENT_STANDARD_DOOR_WIDTH_M,
    heightM: OWNED_APARTMENT_STANDARD_DOOR_HEIGHT_M,
    centerYM: OWNED_APARTMENT_STANDARD_DOOR_HEIGHT_M * 0.5,
  };
}

export function clampOwnedApartmentWallOpeningsForLength(
  sizeX: number,
  openings: readonly OwnedApartmentWallOpening[],
): OwnedApartmentWallOpening[] {
  return openings.map((opening) => ({
    ...opening,
    tangentOffsetM: clampWallOpeningTangentOffsetM(sizeX, opening.widthM, opening.tangentOffsetM),
  }));
}

export type BuildOwnedApartmentPartitionWallOpts = {
  /** Tag collision meshes for FP partition solids (client runtime). */
  fpInteriorPartitionSolid?: boolean;
  /** Tag editor-visible wall fragments for PBR application. */
  editorWallVisual?: boolean;
};

/**
 * Hidden unit-cube ref mesh for editor gizmo scale (same convention as legacy solid walls).
 */
export function buildOwnedApartmentPartitionWallRefMesh(args: {
  parent: THREE.Group;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
}): THREE.Mesh {
  const { parent, sizeX, sizeY, sizeZ } = args;
  const refSlabMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ visible: false }),
  );
  refSlabMesh.name = "wall_slab_ref";
  refSlabMesh.scale.set(sizeX, sizeY, sizeZ);
  refSlabMesh.position.y = sizeY / 2;
  parent.add(refSlabMesh);
  return refSlabMesh;
}

export function rebuildOwnedApartmentPartitionWallVisual(args: {
  parent: THREE.Group;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  openings: readonly OwnedApartmentWallOpening[];
  wallMaterial: THREE.MeshStandardMaterial;
  opts?: BuildOwnedApartmentPartitionWallOpts;
}): void {
  const { parent, sizeX, sizeY, sizeZ, openings, wallMaterial, opts } = args;

  const doomed: THREE.Object3D[] = [];
  for (const child of parent.children) {
    if (child.name === "wall_visual") doomed.push(child);
  }
  for (const d of doomed) {
    parent.remove(d);
    d.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        if (obj.material instanceof THREE.Material) obj.material.dispose();
      }
    });
  }

  const visualGroup = new THREE.Group();
  visualGroup.name = "wall_visual";
  parent.add(visualGroup);

  const holes = openings.map(wallOpeningToHoleXY);
  addWallConstantZWithHoles(
    visualGroup,
    wallMaterial,
    0,
    sizeZ,
    -sizeX * 0.5,
    sizeX * 0.5,
    0,
    sizeY,
    holes,
    "apt_wall",
  );

  for (const child of visualGroup.children) {
    if (!(child instanceof THREE.Mesh)) continue;
    child.userData[OWNED_APARTMENT_WALL_SURFACE_MESH_UD] = true;
    if (opts?.fpInteriorPartitionSolid === true) {
      child.userData[MAMMOTH_FP_INTERIOR_PARTITION_SOLID] = true;
    }
    if (opts?.editorWallVisual === true) {
      child.userData[EDITOR_MY_APARTMENT_WALL_VISUAL_UD] = true;
      child.userData.mammothEditorMyApartmentProp = true;
    }
    child.castShadow = false;
    child.receiveShadow = false;
  }
}

/**
 * Builds ref + visual in one call (client runtime — no post-constrain pass).
 */
export function buildOwnedApartmentPartitionWallInGroup(args: {
  parent: THREE.Group;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  openings: readonly OwnedApartmentWallOpening[];
  wallMaterial: THREE.MeshStandardMaterial;
  opts?: BuildOwnedApartmentPartitionWallOpts;
}): THREE.Mesh {
  const { parent, sizeX, sizeY, sizeZ, openings, wallMaterial, opts } = args;
  const refSlabMesh = buildOwnedApartmentPartitionWallRefMesh({
    parent,
    sizeX,
    sizeY,
    sizeZ,
  });
  rebuildOwnedApartmentPartitionWallVisual({
    parent,
    sizeX,
    sizeY,
    sizeZ,
    openings,
    wallMaterial,
    opts,
  });
  return refSlabMesh;
}

export function readOwnedApartmentPartitionWallLocalExtents(root: THREE.Object3D): {
  sizeX: number;
  sizeY: number;
  sizeZ: number;
} | null {
  root.updateMatrixWorld(true);
  for (const child of root.children) {
    if (!(child instanceof THREE.Mesh) || child.name !== "wall_slab_ref") continue;
    return {
      sizeX: Math.abs(child.scale.x * root.scale.x),
      sizeY: Math.abs(child.scale.y * root.scale.y),
      sizeZ: Math.abs(child.scale.z * root.scale.z),
    };
  }
  return null;
}

export function syncOwnedApartmentWallOpeningProxies(args: {
  wallGroup: THREE.Group;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  openings: readonly OwnedApartmentWallOpening[];
}): THREE.Group[] {
  const { wallGroup, sizeX, sizeY, sizeZ, openings } = args;
  const keepIds = new Set(openings.map((o) => o.id));

  const doomed: THREE.Object3D[] = [];
  for (const child of wallGroup.children) {
    if (
      child instanceof THREE.Group &&
      child.userData[EDITOR_MY_APARTMENT_WALL_OPENING_PROXY_UD] === true
    ) {
      const id = child.userData.mammothEditorMyApartmentWallOpeningId as string | undefined;
      if (!id || !keepIds.has(id)) doomed.push(child);
    }
  }
  for (const d of doomed) {
    wallGroup.remove(d);
    d.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        if (obj.material instanceof THREE.Material) obj.material.dispose();
      }
    });
  }

  const proxyById = new Map<string, THREE.Group>();
  for (const child of wallGroup.children) {
    if (
      child instanceof THREE.Group &&
      child.userData[EDITOR_MY_APARTMENT_WALL_OPENING_PROXY_UD] === true
    ) {
      const id = child.userData.mammothEditorMyApartmentWallOpeningId as string | undefined;
      if (id) proxyById.set(id, child);
    }
  }

  const out: THREE.Group[] = [];
  const faceZ = sizeZ * 0.5 + 0.015;

  for (const opening of openings) {
    let proxy = proxyById.get(opening.id);
    if (!proxy) {
      proxy = new THREE.Group();
      proxy.name = `editor_wall_opening:${opening.id}`;
      proxy.userData[EDITOR_MY_APARTMENT_WALL_OPENING_PROXY_UD] = true;
      proxy.userData.mammothEditorMyApartmentWallOpeningId = opening.id;
      const wire = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial({
          color: 0x55b4ff,
          wireframe: true,
          transparent: true,
          opacity: 0.55,
          depthTest: true,
        }),
      );
      wire.name = "opening_wire";
      wire.raycast = () => {};
      const pick = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      pick.name = "opening_pick";
      proxy.add(wire);
      proxy.add(pick);
      wallGroup.add(proxy);
    }

    const tangent = clampWallOpeningTangentOffsetM(sizeX, opening.widthM, opening.tangentOffsetM);
    proxy.position.set(tangent, opening.centerYM, faceZ);
    proxy.rotation.set(0, 0, 0);
    proxy.scale.set(1, 1, 1);

    const wire = proxy.children.find((c) => c.name === "opening_wire");
    const pick = proxy.children.find((c) => c.name === "opening_pick");
    if (wire instanceof THREE.Mesh) {
      wire.scale.set(opening.widthM, opening.heightM, 0.04);
    }
    if (pick instanceof THREE.Mesh) {
      pick.scale.set(opening.widthM, opening.heightM, Math.max(sizeZ, 0.06));
    }

    out.push(proxy);
  }

  void sizeY;
  return out;
}

export function applyOwnedApartmentWallSurfaceMaterialToVisuals(
  wallGroup: THREE.Object3D,
  apply: (mesh: THREE.Mesh) => void,
): void {
  wallGroup.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (obj.userData[OWNED_APARTMENT_WALL_SURFACE_MESH_UD] !== true) return;
    apply(obj);
  });
}
