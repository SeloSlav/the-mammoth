import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  applyMyApartmentWallSurfaceSnap,
  clampWallAabbToUnitShellInterior,
  getUnitInteriorShellBounds,
  snapOwnedApartmentWallYawRad,
} from "./editorMyApartmentWallSnap.js";
import {
  constrainMyApartmentWallRootPose,
  EDITOR_MY_APARTMENT_WALL_MESH_USERDATA_KEY,
  EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y,
} from "./editorMyApartmentMeshes.js";

function shellMeta(extra?: { interiorCeilingInnerY?: number }) {
  return {
    unitId: "",
    strictMinX: 0,
    strictMinZ: 0,
    spanX: 8,
    spanZ: 8,
    prefabOriginX: 0,
    prefabOriginZ: 0,
    prefabFootprintSx: 8,
    prefabFootprintSz: 8,
    interiorCeilingInnerY: extra?.interiorCeilingInnerY,
  };
}

function mountWall(args?: {
  sizeX?: number;
  sizeY?: number;
  yaw?: number;
  x?: number;
  z?: number;
  dy?: number;
  id?: string;
}): THREE.Group {
  const shell = new THREE.Group();
  Object.assign(shell.userData, {
    editorMyApartmentSlabSx: 8,
    editorMyApartmentSlabSz: 8,
    editorMyApartmentStrictMinX: 0,
    editorMyApartmentStrictMinZ: 0,
    editorMyApartmentStrictSpanX: 8,
    editorMyApartmentStrictSpanZ: 8,
    editorMyApartmentPrefabOriginX: 0,
    editorMyApartmentPrefabOriginZ: 0,
    editorMyApartmentInteriorCeilingInnerY:
      EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y + 2.5,
  });
  const furniture = new THREE.Group();
  shell.add(furniture);

  const wallRoot = new THREE.Group();
  wallRoot.userData.mammothEditorMyApartmentWallId = args?.id ?? "wall_a";
  furniture.add(wallRoot);

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  mesh.userData[EDITOR_MY_APARTMENT_WALL_MESH_USERDATA_KEY] = true;
  mesh.scale.set(args?.sizeX ?? 2, args?.sizeY ?? 2.4, 0.08);
  mesh.position.y = mesh.scale.y / 2;
  wallRoot.add(mesh);
  wallRoot.rotation.order = "YXZ";
  wallRoot.rotation.set(0, args?.yaw ?? 0, 0, "YXZ");
  const dy = args?.dy ?? 0;
  wallRoot.position.set(
    args?.x ?? 2,
    EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y + dy,
    args?.z ?? 2,
  );
  return wallRoot;
}

describe("snapOwnedApartmentWallYawRad", () => {
  it("snaps to 90° increments", () => {
    expect(snapOwnedApartmentWallYawRad(0.2)).toBeCloseTo(0, 5);
    expect(snapOwnedApartmentWallYawRad(Math.PI / 2 + 0.1)).toBeCloseTo(Math.PI / 2, 5);
  });
});

describe("applyMyApartmentWallSurfaceSnap", () => {
  it("snaps a scaled wall end to a parallel neighbor face", () => {
    const wallA = mountWall({ sizeX: 2, x: 2, z: 2, yaw: 0, id: "wall_a" });
    const wallB = mountWall({ sizeX: 1.5, x: 4.12, z: 2, yaw: 0, id: "wall_b" });
    wallA.parent!.add(wallB);
    constrainMyApartmentWallRootPose(wallA);
    constrainMyApartmentWallRootPose(wallB);

    wallA.scale.x = 1.35;
    const meshA = wallA.children[0] as THREE.Mesh;
    applyMyApartmentWallSurfaceSnap(wallA, meshA, shellMeta(), {
      scaleDrag: {
        meshScaleAtGestureStart: meshA.scale.clone(),
        activeWorldAxis: "X",
      },
    });

    wallA.updateMatrixWorld(true);
    wallB.updateMatrixWorld(true);
    const boxA = new THREE.Box3().setFromObject(wallA);
    const boxB = new THREE.Box3().setFromObject(wallB);
    const gap = Math.abs(boxA.max.x - boxB.min.x);
    expect(gap).toBeLessThan(0.03);
  });

  it("hard-clamps wall AABB inside unit shell when translated through outer walls", () => {
    const meta = shellMeta();
    const bounds = getUnitInteriorShellBounds(meta);
    const wallRoot = mountWall({ sizeX: 1.2, x: bounds.maxX + 1.5, z: 2, yaw: 0 });
    const mesh = wallRoot.children[0] as THREE.Mesh;
    clampWallAabbToUnitShellInterior(wallRoot, mesh, meta);
    wallRoot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(wallRoot);
    expect(box.min.x).toBeGreaterThanOrEqual(bounds.minX - 1e-3);
    expect(box.max.x).toBeLessThanOrEqual(bounds.maxX + 1e-3);
    expect(box.min.z).toBeGreaterThanOrEqual(bounds.minZ - 1e-3);
    expect(box.max.z).toBeLessThanOrEqual(bounds.maxZ + 1e-3);
    expect(box.min.y).toBeGreaterThanOrEqual(bounds.floorY - 1e-3);
    expect(box.max.y).toBeLessThanOrEqual((bounds.ceilY ?? 999) + 1e-3);
  });

  it("does not squash wall height when pushed into the ceiling (translate / move)", () => {
    const meta = shellMeta({
      interiorCeilingInnerY: EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y + 2.8,
    });
    const bounds = getUnitInteriorShellBounds(meta);
    const wallRoot = mountWall({ sizeX: 1.2, sizeY: 2, x: 2, z: 2, yaw: 0 });
    const mesh = wallRoot.children[0] as THREE.Mesh;
    const heightBefore = mesh.scale.y;
    wallRoot.position.y += 1.2;
    clampWallAabbToUnitShellInterior(wallRoot, mesh, meta);
    wallRoot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(wallRoot);
    expect(mesh.scale.y).toBeCloseTo(heightBefore, 4);
    expect(box.max.y).toBeLessThanOrEqual((bounds.ceilY ?? 999) + 1e-3);
  });

  it("shrinks an over-long scaled wall to fit between shell faces", () => {
    const meta = shellMeta();
    const bounds = getUnitInteriorShellBounds(meta);
    const wallRoot = mountWall({
      sizeX: bounds.maxX - bounds.minX + 2,
      x: (bounds.minX + bounds.maxX) * 0.5,
      z: 2,
      yaw: 0,
    });
    const mesh = wallRoot.children[0] as THREE.Mesh;
    clampWallAabbToUnitShellInterior(wallRoot, mesh, meta);
    wallRoot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(wallRoot);
    expect(box.max.x - box.min.x).toBeLessThanOrEqual(bounds.maxX - bounds.minX + 1e-3);
    expect(box.min.x).toBeGreaterThanOrEqual(bounds.minX - 1e-3);
    expect(box.max.x).toBeLessThanOrEqual(bounds.maxX + 1e-3);
  });

  it("forms an L-corner when a perpendicular wall end meets a neighbor broad face", () => {
    const wallA = mountWall({ sizeX: 2, x: 3, z: 3, yaw: 0, id: "wall_a" });
    const wallB = mountWall({ sizeX: 2, x: 3.96, z: 4.35, yaw: Math.PI / 2, id: "wall_b" });
    wallA.parent!.add(wallB);
    constrainMyApartmentWallRootPose(wallA);
    constrainMyApartmentWallRootPose(wallB);

    const meshA = wallA.children[0] as THREE.Mesh;
    applyMyApartmentWallSurfaceSnap(wallA, meshA, shellMeta());

    wallA.updateMatrixWorld(true);
    wallB.updateMatrixWorld(true);
    const boxA = new THREE.Box3().setFromObject(wallA);
    const boxB = new THREE.Box3().setFromObject(wallB);
    expect(Math.abs(boxA.max.x - boxB.min.x)).toBeLessThan(0.05);
    expect(Math.abs(boxA.max.z - boxB.min.z)).toBeLessThan(0.05);
  });

  it("keeps the pinned length end fixed while scaling from the opposite handle", () => {
    const wall = mountWall({ sizeX: 2, x: 3, z: 3, yaw: 0, id: "wall_only" });
    constrainMyApartmentWallRootPose(wall);
    wall.updateMatrixWorld(true);
    const boxBefore = new THREE.Box3().setFromObject(wall);
    const pinnedMinX = boxBefore.min.x;
    const mesh = wall.children[0] as THREE.Mesh;
    wall.scale.x = 1.4;
    const pin = {
      localAxis: "x" as const,
      worldAxis: "x" as const,
      side: "min" as const,
      plane: pinnedMinX,
    };
    constrainMyApartmentWallRootPose(wall, {
      meshScaleAtGestureStart: mesh.scale.clone(),
      activeWorldAxis: "X",
      pinnedSpan: pin,
    });
    wall.updateMatrixWorld(true);
    const boxAfter = new THREE.Box3().setFromObject(wall);
    expect(boxAfter.min.x).toBeCloseTo(pinnedMinX, 4);
    expect(boxAfter.max.x).toBeGreaterThan(boxBefore.max.x);
  });

  it("preserves a deliberate north (Z) offset when neighbor snap is disabled", () => {
    const wallA = mountWall({ sizeX: 2, x: 2, z: 2, yaw: 0, id: "wall_a" });
    const wallB = mountWall({ sizeX: 2, x: 4, z: 2.22, yaw: 0, id: "wall_b" });
    wallA.parent!.add(wallB);
    constrainMyApartmentWallRootPose(wallA);
    constrainMyApartmentWallRootPose(wallB);

    const meshB = wallB.children[0] as THREE.Mesh;
    const zBefore = wallB.position.z;
    applyMyApartmentWallSurfaceSnap(wallB, meshB, shellMeta(), {
      autoYaw: false,
      neighborSnap: false,
    });
    expect(wallB.position.z).toBeCloseTo(zBefore, 4);
  });

  it("keeps parallel yaw when aligning thickness without autoYaw (translate drag)", () => {
    const wallA = mountWall({ sizeX: 2, x: 2, z: 2, yaw: 0, id: "wall_a" });
    const wallB = mountWall({ sizeX: 2, x: 4, z: 2.35, yaw: 0, id: "wall_b" });
    wallA.parent!.add(wallB);
    constrainMyApartmentWallRootPose(wallA);
    constrainMyApartmentWallRootPose(wallB);

    const meshB = wallB.children[0] as THREE.Mesh;
    applyMyApartmentWallSurfaceSnap(wallB, meshB, shellMeta(), { autoYaw: false });

    const yaw = new THREE.Euler().setFromQuaternion(wallB.quaternion, "YXZ").y;
    expect(yaw).toBeCloseTo(0, 3);
    wallB.updateMatrixWorld(true);
    wallA.updateMatrixWorld(true);
    const boxB = new THREE.Box3().setFromObject(wallB);
    const boxA = new THREE.Box3().setFromObject(wallA);
    const centerDeltaZ = Math.abs(
      (boxA.min.z + boxA.max.z) * 0.5 - (boxB.min.z + boxB.max.z) * 0.5,
    );
    expect(centerDeltaZ).toBeLessThan(0.05);
  });

  it("auto-yaws a parallel wall when dragged into an L-corner position", () => {
    const wallA = mountWall({ sizeX: 2, x: 3, z: 3, yaw: 0, id: "wall_a" });
    const wallB = mountWall({ sizeX: 2, x: 4.05, z: 3.35, yaw: 0, id: "wall_b" });
    wallA.parent!.add(wallB);
    constrainMyApartmentWallRootPose(wallA);
    constrainMyApartmentWallRootPose(wallB);

    const meshB = wallB.children[0] as THREE.Mesh;
    applyMyApartmentWallSurfaceSnap(wallB, meshB, shellMeta(), { autoYaw: true });

    const yaw = new THREE.Euler().setFromQuaternion(wallB.quaternion, "YXZ").y;
    expect(Math.abs(yaw)).toBeCloseTo(Math.PI / 2, 2);
  });

  it("snaps a grounded wall to an elevated lintel in plan (perpendicular L-corner)", () => {
    const lintel = mountWall({
      sizeX: 1.2,
      sizeY: 0.45,
      x: 3,
      z: 3,
      dy: 1.5,
      yaw: 0,
      id: "lintel",
    });
    const wall = mountWall({
      sizeX: 2.6,
      sizeY: 2.6,
      x: 2.88,
      z: 3,
      dy: 0,
      yaw: Math.PI / 2,
      id: "wall",
    });
    lintel.parent!.add(wall);
    constrainMyApartmentWallRootPose(lintel);
    constrainMyApartmentWallRootPose(wall);

    const meshWall = wall.children[0] as THREE.Mesh;
    applyMyApartmentWallSurfaceSnap(wall, meshWall, shellMeta(), { autoYaw: true });

    wall.updateMatrixWorld(true);
    lintel.updateMatrixWorld(true);
    const boxWall = new THREE.Box3().setFromObject(wall);
    const boxLintel = new THREE.Box3().setFromObject(lintel);
    expect(Math.abs(boxWall.max.x - boxLintel.min.x)).toBeLessThan(0.05);
  });

  it("snaps a wall top to the bottom of an elevated lintel in Y", () => {
    const lintel = mountWall({
      sizeX: 1.2,
      sizeY: 0.4,
      x: 3,
      z: 3,
      dy: 1.5,
      yaw: 0,
      id: "lintel",
    });
    const wall = mountWall({
      sizeX: 0.08,
      sizeY: 1.42,
      x: 3,
      z: 3,
      dy: 0,
      yaw: Math.PI / 2,
      id: "wall",
    });
    lintel.parent!.add(wall);
    constrainMyApartmentWallRootPose(lintel);
    constrainMyApartmentWallRootPose(wall);

    const meshWall = wall.children[0] as THREE.Mesh;
    applyMyApartmentWallSurfaceSnap(wall, meshWall, shellMeta());

    wall.updateMatrixWorld(true);
    lintel.updateMatrixWorld(true);
    const boxWall = new THREE.Box3().setFromObject(wall);
    const boxLintel = new THREE.Box3().setFromObject(lintel);
    expect(Math.abs(boxWall.max.y - boxLintel.min.y)).toBeLessThan(0.05);
  });
});