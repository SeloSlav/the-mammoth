import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { parseStairWellDef } from "./index.js";
import {
  applyStairWellCeilingPropAnchors,
  patchStairWellCeilingPropAnchorInDef,
  resolveStairWellCeilingPropsForScope,
  shaftInteriorCeilingYLocal,
  attachStairWellCeilingProps,
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
  it("parses authored stairwell ceiling fixtures", () => {
    const def = parseStairWellDef({
      id: "t",
      version: 1,
      ceilingProps: [
        {
          id: "stairwell_ceiling_light_w",
          modelUrl: "/static/models/objects/light-ceiling-2.glb",
          applyToScopes: ["typical", "ground"],
          anchor: {
            offsetXM: -0.85,
            offsetZM: 0,
            dropM: 0.06,
            uniformScale: 0.19097143292300797,
          },
        },
      ],
    });
    expect(def.ceilingProps).toHaveLength(1);
    expect(def.ceilingProps?.[0]?.anchor.offsetXM).toBe(-0.85);
  });

  it("parses groundCeilingProps overrides", () => {
    const def = parseStairWellDef({
      id: "t",
      version: 1,
      entryOpening: { widthM: 1, heightM: 2, offsetXM: 0, offsetYM: 0 },
      groundEntryOpening: { widthM: 1, heightM: 2, offsetXM: 0, offsetYM: 0 },
      ceilingProps: [
        {
          id: "light_w",
          modelUrl: "/static/models/objects/light-ceiling-2.glb",
          anchor: { offsetXM: -0.85 },
        },
      ],
      groundCeilingProps: [
        {
          id: "light_w",
          modelUrl: "/static/models/objects/light-ceiling-2.glb",
          anchor: { offsetXM: -0.5 },
        },
      ],
    });
    expect(resolveStairWellCeilingPropsForScope(def, "typical")[0]?.anchor.offsetXM).toBe(
      -0.85,
    );
    expect(resolveStairWellCeilingPropsForScope(def, "ground")[0]?.anchor.offsetXM).toBe(
      -0.5,
    );
  });
});

describe("stairWellCeilingProp authoring", () => {
  const baseDef = parseStairWellDef({
    id: "t",
    version: 1,
    entryOpening: { widthM: 1, heightM: 2, offsetXM: 0, offsetYM: 0 },
    groundEntryOpening: { widthM: 1, heightM: 2, offsetXM: 0, offsetYM: 0 },
    ceilingProps: [
      {
        id: "stairwell_ceiling_light_w",
        modelUrl: "/static/models/objects/light-ceiling-2.glb",
        applyToScopes: ["typical", "ground"],
        anchor: { offsetXM: -0.85, offsetZM: 0, dropM: 0.06, uniformScale: 0.19 },
      },
    ],
  });

  it("tags ceiling wraps for editor picking and syncs anchors from def", () => {
    const root = new THREE.Group();
    const sy = 3.2;
    attachStairWellCeilingProps({
      root,
      def: baseDef,
      authoringScope: "typical",
      sy,
    });
    const wrap = root.children[0] as THREE.Group;
    expect(wrap.userData.editorStairCeilingPropId).toBe("stairwell_ceiling_light_w");
    expect(wrap.userData.editorStairPickId).toBe(
      stairWellCeilingPropEditorId("stairwell_ceiling_light_w"),
    );

    const patched = patchStairWellCeilingPropAnchorInDef(baseDef, "typical", "stairwell_ceiling_light_w", {
      offsetXM: -1.1,
    });
    applyStairWellCeilingPropAnchors(root, patched);
    expect(wrap.position.x).toBeCloseTo(-1.1, 6);
  });

  it("writes ground scope edits to groundCeilingProps", () => {
    const patched = patchStairWellCeilingPropAnchorInDef(
      baseDef,
      "ground",
      "stairwell_ceiling_light_w",
      { offsetXM: -0.4 },
    );
    expect(patched.groundCeilingProps).toHaveLength(1);
    expect(patched.groundCeilingProps?.[0]?.anchor.offsetXM).toBe(-0.4);
    expect(patched.ceilingProps?.[0]?.anchor.offsetXM).toBe(-0.85);
  });
});
