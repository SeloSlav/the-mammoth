import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { UNIT_SHELL_WALL_THICKNESS_M } from "@the-mammoth/world";
import {
  centerDecorRootOnVisualBounds,
  clampPreviewXZToAuthoringInterior,
  constrainMyApartmentDecorRootPose,
  constrainMyApartmentWallRootPose,
  EDITOR_MY_APARTMENT_WALL_MESH_USERDATA_KEY,
  EDITOR_MY_APARTMENT_WALL_THICKNESS_MIN_M,
  EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y,
  getMyApartmentDecorAnchorWorldPosition,
  previewWorldFromNormalizedPlacement,
} from "./editorMyApartmentMeshes.js";
import type { OwnedApartmentFractionToPreviewXZ } from "./editorMyApartmentAuthoringShell.js";

const SLACK = 0.03;

describe("owned apartment authoring XZ clamp", () => {
  it("lets negative fz reach the south plaster edge when the strict hull starts north of it", () => {
    const plasterSouth = UNIT_SHELL_WALL_THICKNESS_M + SLACK;
    /** Mirrors the real end-cap unit layout where the gameplay hull starts well north of the south wall. */
    const strictMinZ = 0.88;
    const spanZ = 6.6;
    const sz = 7.1;
    const spans: OwnedApartmentFractionToPreviewXZ = {
      strictMinX: 0,
      strictMinZ,
      spanX: 6,
      spanZ,
      prefabOriginX: 0,
      prefabOriginZ: 0,
      prefabFootprintSx: 8,
      prefabFootprintSz: sz,
    };

    const clamped = clampPreviewXZToAuthoringInterior(spans, 2, -5);
    expect(clamped.z).toBeCloseTo(plasterSouth, 5);

    const lz = clamped.z;
    const fz = (lz + spans.prefabOriginZ - spans.strictMinZ) / spans.spanZ;
    expect(fz).toBeLessThan(0);
    const again = previewWorldFromNormalizedPlacement({ spans, fx: 0.2, fz });
    expect(again.z).toBeCloseTo(lz, 5);
  });

  it("does not clamp decor translation while snapping rotation and scale", () => {
    const freeY = EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y + 3.6;
    const shell = new THREE.Group();
    shell.userData.editorMyApartmentSlabSx = 8;
    shell.userData.editorMyApartmentSlabSz = 8;
    shell.userData.editorMyApartmentStrictMinX = 1;
    shell.userData.editorMyApartmentStrictMinZ = 1;
    shell.userData.editorMyApartmentStrictSpanX = 6;
    shell.userData.editorMyApartmentStrictSpanZ = 6;
    shell.userData.editorMyApartmentPrefabOriginX = 0;
    shell.userData.editorMyApartmentPrefabOriginZ = 0;

    const furniture = new THREE.Group();
    shell.add(furniture);

    const decor = new THREE.Group();
    decor.userData.mammothEditorMyApartmentDecorId = "south_wall";
    furniture.add(decor);

    const vis = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.4));
    decor.add(vis);
    decor.position.set(-3.25, freeY, -4.5);
    decor.rotation.order = "YXZ";
    decor.rotation.set(0.31, 0.44, 0.12, "YXZ");
    decor.scale.set(1.7, 1.4, 1.2);

    constrainMyApartmentDecorRootPose(decor);

    expect(decor.position.x).toBeCloseTo(-3.25, 6);
    expect(decor.position.y).toBeCloseTo(freeY, 6);
    expect(decor.position.z).toBeCloseTo(-4.5, 6);
    expect(decor.scale.x).toBeCloseTo(decor.scale.y, 6);
    expect(decor.scale.y).toBeCloseTo(decor.scale.z, 6);
  });
});

describe("decor edit pivot centering", () => {
  it("recenters the decor root on the visual bounds while preserving the serialized anchor", () => {
    const root = new THREE.Group();
    const vis = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.6));
    vis.position.y = 0.6;
    root.add(vis);

    root.updateMatrixWorld(true);
    const beforeCenter = new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3());
    const beforeAnchor = root.getWorldPosition(new THREE.Vector3());

    centerDecorRootOnVisualBounds(root);

    root.updateMatrixWorld(true);
    const afterCenter = new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3());
    const afterAnchor = getMyApartmentDecorAnchorWorldPosition(root);
    expect(root.position.distanceTo(beforeCenter)).toBeLessThan(1e-6);
    expect(afterCenter.distanceTo(beforeCenter)).toBeLessThan(1e-6);
    expect(afterAnchor.distanceTo(beforeAnchor)).toBeLessThan(1e-6);
  });
});

describe("owned apartment wall slab clamp", () => {
  it("clamps wall thickness to schema minimum while keeping height/width", () => {
    const shell = new THREE.Group();
    shell.userData.editorMyApartmentSlabSx = 8;
    shell.userData.editorMyApartmentSlabSz = 8;
    shell.userData.editorMyApartmentStrictMinX = 0;
    shell.userData.editorMyApartmentStrictMinZ = 0;
    shell.userData.editorMyApartmentStrictSpanX = 8;
    shell.userData.editorMyApartmentStrictSpanZ = 8;
    shell.userData.editorMyApartmentPrefabOriginX = 0;
    shell.userData.editorMyApartmentPrefabOriginZ = 0;

    const furniture = new THREE.Group();
    shell.add(furniture);

    const wallRoot = new THREE.Group();
    wallRoot.userData.mammothEditorMyApartmentWallId = "wall_test";
    furniture.add(wallRoot);

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.userData[EDITOR_MY_APARTMENT_WALL_MESH_USERDATA_KEY] = true;
    mesh.scale.set(2.5, 2.2, 0.001);
    mesh.position.y = mesh.scale.y / 2;
    wallRoot.add(mesh);
    wallRoot.position.set(2, EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y, 2);

    constrainMyApartmentWallRootPose(wallRoot);

    expect(mesh.scale.z).toBeGreaterThanOrEqual(EDITOR_MY_APARTMENT_WALL_THICKNESS_MIN_M - 1e-6);
    expect(mesh.scale.x).toBeCloseTo(2.5, 5);
    expect(mesh.scale.y).toBeCloseTo(2.2, 5);
  });

  it("clamps wall slab height so world AABB stays at or below hollow-shell ceiling", () => {
    const vh = 2.5;
    const ceilingInner = EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y + vh;
    const ceilCap = ceilingInner - SLACK;

    const shell = new THREE.Group();
    shell.userData.editorMyApartmentSlabSx = 8;
    shell.userData.editorMyApartmentSlabSz = 8;
    shell.userData.editorMyApartmentStrictMinX = 0;
    shell.userData.editorMyApartmentStrictMinZ = 0;
    shell.userData.editorMyApartmentStrictSpanX = 8;
    shell.userData.editorMyApartmentStrictSpanZ = 8;
    shell.userData.editorMyApartmentPrefabOriginX = 0;
    shell.userData.editorMyApartmentPrefabOriginZ = 0;
    shell.userData.editorMyApartmentInteriorCeilingInnerY = ceilingInner;

    const furniture = new THREE.Group();
    shell.add(furniture);

    const wallRoot = new THREE.Group();
    wallRoot.userData.mammothEditorMyApartmentWallId = "wall_tall";
    furniture.add(wallRoot);

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.userData[EDITOR_MY_APARTMENT_WALL_MESH_USERDATA_KEY] = true;
    mesh.scale.set(1, 3.6, 0.08);
    mesh.position.y = mesh.scale.y / 2;
    wallRoot.add(mesh);
    wallRoot.position.set(2, EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y, 2);

    constrainMyApartmentWallRootPose(wallRoot);

    wallRoot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(wallRoot);
    expect(box.max.y).toBeLessThanOrEqual(ceilCap + 1e-3);
    expect(box.min.y).toBeGreaterThanOrEqual(EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y - 1e-4);
    expect(mesh.scale.y).toBeLessThan(3.6 - 1e-3);
  });
});
