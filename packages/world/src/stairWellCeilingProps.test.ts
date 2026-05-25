import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { parseStairWellDef } from "./index.js";
import { addStairWellPlaceholder } from "./stairWellPlaceholder.js";
import {
  applyStairWellCeilingPropAnchors,
  attachStairWellCeilingProps,
  landingUndersideCeilingMountLocalY,
  patchStairWellCeilingPropAnchorInDef,
  resolveStairWellCeilingPropsForScope,
  shaftInteriorCeilingYLocal,
  stairWellCeilingPropInstanceId,
} from "./stairWellCeilingProps.js";
import { stairWellCeilingPropEditorId } from "./stairWellEditorIds.js";

describe("shaftInteriorCeilingYLocal", () => {
  it("matches addShaftShell wall top for a typical storey height", () => {
    const sy = 3.2;
    const wt = 0.11;
    const hy = sy * 0.5;
    const innerWallH = Math.max(sy - 2 * wt, 0.08);
    const wallCenterY = -hy + wt + innerWallH * 0.5;
    const yWallTop = wallCenterY + innerWallH * 0.5;
    expect(shaftInteriorCeilingYLocal(sy)).toBeCloseTo(yWallTop, 6);
  });
});

describe("StairWellDef ceilingProps", () => {
  it("parses shared ceiling fixture template", () => {
    const def = parseStairWellDef({
      id: "t",
      version: 1,
      entryOpening: { widthM: 1, heightM: 2, offsetXM: 0, offsetYM: 0 },
      groundEntryOpening: { widthM: 1, heightM: 2, offsetXM: 0, offsetYM: 0 },
      ceilingProps: [
        {
          id: "stairwell_ceiling_light",
          modelUrl: "/static/models/objects/light-ceiling-2.glb",
          applyToScopes: ["typical", "ground"],
          anchor: { yawRad: 0, uniformScale: 0.19 },
        },
      ],
    });
    expect(def.ceilingProps).toHaveLength(1);
    expect(def.ceilingProps?.[0]?.anchor.uniformScale).toBe(0.19);
  });

  it("parses groundCeilingProps overrides", () => {
    const def = parseStairWellDef({
      id: "t",
      version: 1,
      entryOpening: { widthM: 1, heightM: 2, offsetXM: 0, offsetYM: 0 },
      groundEntryOpening: { widthM: 1, heightM: 2, offsetXM: 0, offsetYM: 0 },
      ceilingProps: [
        {
          id: "stairwell_ceiling_light",
          modelUrl: "/static/models/objects/light-ceiling-2.glb",
          anchor: { uniformScale: 0.19 },
        },
      ],
      groundCeilingProps: [
        {
          id: "stairwell_ceiling_light",
          modelUrl: "/static/models/objects/light-ceiling-2.glb",
          anchor: { uniformScale: 0.22 },
        },
      ],
    });
    expect(resolveStairWellCeilingPropsForScope(def, "typical")[0]?.anchor.uniformScale).toBe(
      0.19,
    );
    expect(resolveStairWellCeilingPropsForScope(def, "ground")[0]?.anchor.uniformScale).toBe(
      0.22,
    );
  });
});

describe("stairWellCeilingProp landing underside placement", () => {
  const baseDef = parseStairWellDef({
    id: "t",
    version: 1,
    entryOpening: { widthM: 1, heightM: 2, offsetXM: 0, offsetYM: 0 },
    groundEntryOpening: { widthM: 1, heightM: 2, offsetXM: 0, offsetYM: 0 },
    ceilingProps: [
      {
        id: "stairwell_ceiling_light",
        modelUrl: "/static/models/objects/light-ceiling-2.glb",
        applyToScopes: ["typical", "ground"],
        anchor: { yawRad: 0.2, uniformScale: 0.19 },
      },
    ],
  });

  it("parents one centered fixture per corner landing on the slab underside", () => {
    const root = new THREE.Group();
    const sx = 4;
    const sy = 3.2;
    const sz = 4;
    addStairWellPlaceholder(root, sx, sy, sz, {
      def: baseDef,
      authoringScope: "typical",
      includeCeiling: false,
    });

    const landingMeshes: THREE.Mesh[] = [];
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      if (!o.userData.mammothStairCornerLandingRef) return;
      landingMeshes.push(o);
    });
    expect(landingMeshes.length).toBeGreaterThan(0);

    const lightWraps: THREE.Group[] = [];
    for (const landing of landingMeshes) {
      const cl = landing.userData.mammothStairCornerLandingRef;
      const child = landing.children.find(
        (c) => c.userData.mammothStairwellCeilingLight === true,
      ) as THREE.Group | undefined;
      expect(child).toBeDefined();
      expect(child!.position.x).toBeCloseTo(0, 6);
      expect(child!.position.z).toBeCloseTo(0, 6);
      expect(child!.position.y).toBeCloseTo(landingUndersideCeilingMountLocalY(cl), 6);
      expect(child!.userData.editorStairPickId).toBe(
        stairWellCeilingPropEditorId("stairwell_ceiling_light"),
      );
      lightWraps.push(child!);
    }

    expect(lightWraps.length).toBe(landingMeshes.length);
  });

  it("syncs template yaw/scale across instances", () => {
    const root = new THREE.Group();
    const sy = 3.2;
    addStairWellPlaceholder(root, 4, sy, 4, {
      def: baseDef,
      authoringScope: "typical",
      includeCeiling: false,
    });

    const wraps: THREE.Object3D[] = [];
    root.traverse((o) => {
      if (o.userData.mammothStairwellCeilingLight === true) wraps.push(o);
    });
    expect(wraps.length).toBeGreaterThan(1);
    const first = wraps[0] as THREE.Group;
    first.rotation.y = 0.9;
    first.scale.setScalar(0.25);

    const patched = patchStairWellCeilingPropAnchorInDef(
      baseDef,
      "typical",
      stairWellCeilingPropInstanceId(0),
      { yawRad: 0.9, uniformScale: 0.25 },
    );
    applyStairWellCeilingPropAnchors(root, patched);

    for (const wrap of wraps) {
      expect(wrap.rotation.y).toBeCloseTo(0.9, 6);
      expect(wrap.scale.x).toBeCloseTo(0.25, 6);
    }
  });
});
