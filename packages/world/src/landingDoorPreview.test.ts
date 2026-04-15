import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { LandingKitDefSchema } from "@the-mammoth/schemas";
import {
  applyLandingKitPartTransforms,
  buildLandingDoorPreviewRoot,
  LANDING_DOOR_BOTTOM_RAIL_PART_ID,
  LANDING_DOOR_GLASS_PART_ID,
  LANDING_DOOR_LEFT_STILE_PART_ID,
  LANDING_DOOR_RIGHT_STILE_PART_ID,
  LANDING_DOOR_TOP_RAIL_PART_ID,
} from "./landingDoorPreview.js";

describe("landing door preview", () => {
  it("sizes glass from glassOpening on the def", () => {
    const def = LandingKitDefSchema.parse({
      id: "t",
      version: 1,
      glassOpening: { widthM: 0.9, heightM: 0.7, centerYM: 0.2 },
    });
    const root = buildLandingDoorPreviewRoot({ face: "e", hx: 2, hz: 2, def });
    const swing = root.getObjectByName("editor_landing_door_swing") as THREE.Group;
    const glass = swing.getObjectByName(LANDING_DOOR_GLASS_PART_ID) as THREE.Mesh;
    const geom = glass.geometry as THREE.BoxGeometry;
    expect(geom.parameters.height).toBeCloseTo(0.68);
    expect(geom.parameters.depth).toBeCloseTo(0.88);
    expect(glass.position.y).toBeCloseTo(0.2);
  });

  it("applyLandingKitPartTransforms skips procedural glass (opening is authoritative)", () => {
    const structure = new THREE.Group();
    const swing = new THREE.Group();
    structure.add(swing);
    const glass = new THREE.Mesh();
    glass.userData.editorLandingPartId = LANDING_DOOR_GLASS_PART_ID;
    swing.add(glass);

    const def = LandingKitDefSchema.parse({
      id: "t",
      version: 1,
      partTransforms: {
        [LANDING_DOOR_GLASS_PART_ID]: {
          position: [0.5, 0, 0],
          scale: [1, 2, 1],
        },
      },
    });

    applyLandingKitPartTransforms(structure, def);
    expect(glass.position.x).toBe(0);
    expect(glass.scale.y).toBe(1);
  });

  it("tags each red landing frame volume for direct viewport picking", () => {
    const root = buildLandingDoorPreviewRoot({ face: "e", hx: 2, hz: 2 });
    const taggedIds = new Set<string>();
    root.traverse((obj) => {
      const id = obj.userData.editorLandingPartId;
      if (typeof id === "string") taggedIds.add(id);
    });

    expect(taggedIds.has(LANDING_DOOR_TOP_RAIL_PART_ID)).toBe(true);
    expect(taggedIds.has(LANDING_DOOR_BOTTOM_RAIL_PART_ID)).toBe(true);
    expect(taggedIds.has(LANDING_DOOR_LEFT_STILE_PART_ID)).toBe(true);
    expect(taggedIds.has(LANDING_DOOR_RIGHT_STILE_PART_ID)).toBe(true);
  });
});
