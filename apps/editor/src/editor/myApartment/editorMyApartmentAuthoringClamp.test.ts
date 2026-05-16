import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { UNIT_SHELL_WALL_THICKNESS_M } from "@the-mammoth/world";
import {
  clampPreviewXZToAuthoringInterior,
  constrainMyApartmentDecorRootPose,
  EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y,
  previewWorldFromNormalizedPlacement,
} from "./editorMyApartmentMeshes.js";
import type { OwnedApartmentFractionToPreviewXZ } from "./editorMyApartmentAuthoringShell.js";

const SLACK = 0.03;

describe("owned apartment authoring XZ clamp", () => {
  it("ties south/north bounds to strict hull so fz encodes without sub-0 snapback", () => {
    const plasterSouth = UNIT_SHELL_WALL_THICKNESS_M + SLACK;
    /** Strict f=0 sits slightly north of hollow-shell south slack — classic snapback case. */
    const strictMinZ = plasterSouth + 0.05;
    const spanZ = 4;
    const sz = 10;
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

    const southReachable = strictMinZ - spans.prefabOriginZ;
    expect(southReachable).toBeGreaterThan(plasterSouth);

    const clamped = clampPreviewXZToAuthoringInterior(spans, 2, plasterSouth);
    expect(clamped.z).toBeCloseTo(southReachable, 5);

    const lz = southReachable;
    const fz = Math.max(
      0,
      Math.min(1, (lz + spans.prefabOriginZ - spans.strictMinZ) / spans.spanZ),
    );
    expect(fz).toBe(0);
    const again = previewWorldFromNormalizedPlacement({ spans, fx: 0.2, fz });
    expect(again.z).toBeCloseTo(lz, 5);
  });

  it("keeps decor AABB inside the strict south boundary so editor matches runtime", () => {
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
    decor.position.set(2, EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y, 1);

    constrainMyApartmentDecorRootPose(decor);

    decor.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(decor);
    expect(box.min.z).toBeGreaterThanOrEqual(1.06 - 1e-4);
  });
});

describe("owned apartment authoring Y clamp", () => {
  it("keeps decor world AABB max at or below hollow-shell ceiling minus slack", () => {
    const vh = 2.5;
    const ceilingInner = EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y + vh;

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

    const decor = new THREE.Group();
    decor.userData.mammothEditorMyApartmentDecorId = "test_decor";
    furniture.add(decor);

    const vis = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.2));
    decor.add(vis);
    decor.position.set(2, ceilingInner + 0.6, 2);

    constrainMyApartmentDecorRootPose(decor);

    decor.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(decor);
    expect(box.max.y).toBeLessThanOrEqual(ceilingInner - SLACK + 1e-4);
    expect(box.min.y).toBeGreaterThanOrEqual(
      EDITOR_OWNED_APARTMENT_PREVIEW_SLAB_TOP_Y - 1e-4,
    );
  });
});
