import { describe, expect, it } from "vitest";
import {
  readMyApartmentWallPlacementPatchFromSceneRoot,
  resolveMyApartmentDecorCommittedDy,
  resolveMyApartmentWallCommittedDy,
} from "./editorSceneCommitAttachedTransform.js";
import {
  EDITOR_MY_APARTMENT_WALL_MESH_USERDATA_KEY,
  EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y,
  syncEditorMyApartmentWallsOnMount,
} from "../myApartment/editorMyApartmentMeshes.js";
import { DEFAULT_OWNED_APARTMENT_BUILTINS_DOC } from "@the-mammoth/schemas";
import * as THREE from "three";
import { editorMyApartmentSelectedIdForWall } from "../myApartment/editorMyApartmentSelection.js";
import { createEditorApartmentFishTankBridge } from "../myApartment/editorApartmentFishTankBridge.js";

describe("resolveMyApartmentDecorCommittedDy", () => {
  it("serializes decor dy from the free-space pivot height", () => {
    const root = new THREE.Group();
    root.position.set(0, 1.75, 0);
    root.rotation.order = "YXZ";
    root.rotation.x = Math.PI / 6;
    root.updateMatrixWorld(true);

    expect(
      resolveMyApartmentDecorCommittedDy({
        targetRoot: root,
      }),
    ).toBeCloseTo(1.75 - EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y, 6);
  });

  it("is unaffected by child bounds moving under pitch rotation", () => {
    const root = new THREE.Group();
    root.position.set(0, 2.1, 0);
    const child = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4, 0.5));
    child.position.y = -3;
    root.add(child);
    root.rotation.order = "YXZ";
    root.rotation.x = Math.PI / 6;
    root.updateMatrixWorld(true);

    expect(
      resolveMyApartmentDecorCommittedDy({
        targetRoot: root,
      }),
    ).toBeCloseTo(2.1 - EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y, 6);
  });
});

describe("readMyApartmentWallPlacementPatchFromSceneRoot", () => {
  const fractionMapping = {
    unitId: "",
    strictMinX: 0,
    strictMinZ: 0,
    spanX: 8,
    spanZ: 8,
    prefabOriginX: 0,
    prefabOriginZ: 0,
    prefabFootprintSx: 8,
    prefabFootprintSz: 8,
  };

  it("does not move the wall while serializing placement for save", () => {
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
    });
    const furniture = new THREE.Group();
    shell.add(furniture);

    const wallRoot = new THREE.Group();
    wallRoot.userData.mammothEditorMyApartmentWallId = "wall_save";
    furniture.add(wallRoot);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.userData[EDITOR_MY_APARTMENT_WALL_MESH_USERDATA_KEY] = true;
    mesh.scale.set(2.5, 2.4, 0.08);
    mesh.position.y = mesh.scale.y / 2;
    wallRoot.add(mesh);
    wallRoot.rotation.order = "YXZ";
    wallRoot.rotation.set(0, 0, 0, "YXZ");
    wallRoot.position.set(3, EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y, 2.18);

    const posBefore = wallRoot.position.clone();
    const scaleBefore = mesh.scale.clone();
    const rootScaleBefore = wallRoot.scale.clone();

    const patch = readMyApartmentWallPlacementPatchFromSceneRoot(
      wallRoot,
      fractionMapping,
    );

    expect(patch).not.toBeNull();
    expect(wallRoot.position.x).toBeCloseTo(posBefore.x, 6);
    expect(wallRoot.position.y).toBeCloseTo(posBefore.y, 6);
    expect(wallRoot.position.z).toBeCloseTo(posBefore.z, 6);
    expect(mesh.scale.x).toBeCloseTo(scaleBefore.x, 6);
    expect(mesh.scale.y).toBeCloseTo(scaleBefore.y, 6);
    expect(mesh.scale.z).toBeCloseTo(scaleBefore.z, 6);
    expect(wallRoot.scale.x).toBeCloseTo(rootScaleBefore.x, 6);
    expect(patch!.sizeX).toBeCloseTo(2.5, 4);
  });
});

describe("resolveMyApartmentWallCommittedDy", () => {
  it("serializes wall dy from the slab bottom (world AABB min Y)", () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.userData[EDITOR_MY_APARTMENT_WALL_MESH_USERDATA_KEY] = true;
    mesh.scale.set(2, 0.6, 0.07);
    mesh.position.y = mesh.scale.y / 2;
    root.add(mesh);
    root.position.set(0, EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y + 1.35, 0);
    root.updateMatrixWorld(true);

    expect(
      resolveMyApartmentWallCommittedDy({ targetRoot: root }),
    ).toBeCloseTo(1.35, 4);
  });
});

describe("syncEditorMyApartmentWallsOnMount wall dy", () => {
  it("restores elevated lintel walls from saved dy when another wall is synced", () => {
    const root = new THREE.Group();
    const selectionGroups: Record<string, THREE.Group> = {};
    const mount = {
      root,
      selectionGroups,
      fishTankBridge: createEditorApartmentFishTankBridge(),
      mountedWallIds: new Set<string>(),
      mountedMirrorIds: new Set<string>(),
      mountedDecorIds: new Set<string>(),
      practicalLights: null,
      decorShadowRig: null,
      bakedFloorShadowMount: null,
      resyncPracticalLights: () => {},
      resyncDecorShadows: () => {},
      dispose: () => {},
    };
    const spans = {
      unitId: "",
      strictMinX: 0,
      strictMinZ: 0,
      spanX: 8,
      spanZ: 8,
      prefabOriginX: 0,
      prefabOriginZ: 0,
      prefabFootprintSx: 8,
      prefabFootprintSz: 8,
    };
    Object.assign(root.userData, {
      editorMyApartmentSlabSx: 8,
      editorMyApartmentSlabSz: 8,
      editorMyApartmentStrictMinX: 0,
      editorMyApartmentStrictMinZ: 0,
      editorMyApartmentStrictSpanX: 8,
      editorMyApartmentStrictSpanZ: 8,
      editorMyApartmentPrefabOriginX: 0,
      editorMyApartmentPrefabOriginZ: 0,
      editorMyApartmentInteriorCeilingInnerY:
        EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y + 2.8,
    });

    const lintelId = "wall_lintel";
    const doc = {
      ...DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
      wallItems: [
        {
          id: lintelId,
          fx: 0.5,
          fz: 0.5,
          dy: 1.4,
          yawRad: 0,
          pitchRad: 0,
          sizeX: 1.2,
          sizeY: 0.5,
          sizeZ: 0.07,
          material: { useMetalnessMap: false, useHeightMap: false },
        },
        {
          id: "wall_new",
          fx: 0.2,
          fz: 0.2,
          dy: 0,
          yawRad: 0,
          pitchRad: 0,
          sizeX: 2,
          sizeY: 2.6,
          sizeZ: 0.07,
          material: { useMetalnessMap: false, useHeightMap: false },
        },
      ],
    };

    syncEditorMyApartmentWallsOnMount(mount, doc, spans);

    const lintelGroup = selectionGroups[editorMyApartmentSelectedIdForWall(lintelId)]!;
    lintelGroup.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(lintelGroup);
    expect(box.min.y).toBeCloseTo(
      EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y + 1.4,
      3,
    );
  });
});
