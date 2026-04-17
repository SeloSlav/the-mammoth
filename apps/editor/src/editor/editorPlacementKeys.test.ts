import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { FloorDoc, InteriorDoc } from "@the-mammoth/schemas";
import {
  LANDING_DOOR_OPENING_PROXY_ID,
  STAIR_WELL_OPENING_PROXY_ID,
  STAIR_WELL_SECONDARY_OPENING_PROXY_ID,
} from "@the-mammoth/world";
import {
  floorPlacedObjectIdForTransformRoot,
  interiorEntityIdForTransformRoot,
  placementKey,
  PLACEMENT_KEY_SEP,
  resolveCabPartId,
  resolveCabPartTarget,
  resolveFloorPlacementTransformRoot,
  resolveGizmoFloorDocId,
  resolveGizmoInteriorDocId,
  resolveInteriorPlacementTransformRoot,
  resolveLandingKitPickId,
  resolveLandingKitPickTarget,
  resolvePlacedId,
  resolveStairWellPartId,
  resolveStairWellPartTarget,
} from "./editorPlacementKeys.js";

describe("placementKey", () => {
  it("joins floor and object ids with a separator that cannot appear in ids", () => {
    expect(placementKey("floor_a", "obj_1")).toBe(`floor_a${PLACEMENT_KEY_SEP}obj_1`);
  });
});

describe("resolveCabPartId", () => {
  it("walks ancestors for editorCabPartId", () => {
    const mesh = new THREE.Mesh();
    mesh.userData.editorCabPartId = "cab_floor";
    expect(resolveCabPartId(mesh)).toBe("cab_floor");
    const parent = new THREE.Group();
    parent.add(mesh);
    mesh.userData.editorCabPartId = undefined;
    parent.userData.editorCabPartId = "cab_ceiling";
    expect(resolveCabPartId(mesh)).toBe("cab_ceiling");
  });

  it("prefers editorCabPickId so repeated button meshes share one selectable slot", () => {
    const group = new THREE.Group();
    group.userData.editorCabPartId = "cab_floor_panel";
    const mesh = new THREE.Mesh();
    mesh.userData.editorCabPickId = "cab_floor_button";
    group.add(mesh);
    expect(resolveCabPartId(mesh)).toBe("cab_floor_button");
    expect(resolveCabPartTarget(mesh)).toBe(mesh);
  });

  it("returns null when absent", () => {
    expect(resolveCabPartId(new THREE.Mesh())).toBe(null);
  });

  it("returns the actual tagged object for viewport highlighting", () => {
    const parent = new THREE.Group();
    parent.userData.editorCabPartId = "cab_ceiling";
    const mesh = new THREE.Mesh();
    parent.add(mesh);
    expect(resolveCabPartTarget(mesh)).toBe(parent);
  });
});

describe("resolveLandingKitPickId", () => {
  it("detects editorLandingKitRoot on self or ancestor", () => {
    const root = new THREE.Group();
    root.userData.editorLandingKitRoot = true;
    const mesh = new THREE.Mesh();
    root.add(mesh);
    expect(resolveLandingKitPickId(mesh)).toBe("landing_door_kit");
  });

  it("maps glass hits to the opening proxy (hole resize target)", () => {
    const root = new THREE.Group();
    root.userData.editorLandingKitRoot = true;
    const swing = new THREE.Group();
    root.add(swing);
    const proxy = new THREE.Mesh();
    proxy.name = LANDING_DOOR_OPENING_PROXY_ID;
    proxy.userData.editorLandingOpeningProxy = true;
    swing.add(proxy);
    const glass = new THREE.Mesh();
    glass.userData.editorLandingPartId = "landing_glass_lite";
    swing.add(glass);
    expect(resolveLandingKitPickId(glass)).toBe(LANDING_DOOR_OPENING_PROXY_ID);
    expect(resolveLandingKitPickTarget(glass)).toBe(proxy);
  });

  it("returns individually tagged landing frame volumes directly", () => {
    const frame = new THREE.Mesh();
    frame.userData.editorLandingPartId = "landing_frame_top_rail";
    expect(resolveLandingKitPickId(frame)).toBe("landing_frame_top_rail");
    expect(resolveLandingKitPickTarget(frame)).toBe(frame);
  });

  it("collapses solid-leaf landing picks to the whole kit when requested", () => {
    const root = new THREE.Group();
    root.userData.editorLandingKitRoot = true;
    const swing = new THREE.Group();
    root.add(swing);
    const frame = new THREE.Mesh();
    frame.userData.editorLandingPartId = "landing_frame_top_rail";
    swing.add(frame);
    expect(resolveLandingKitPickId(frame, { solidLeafAsWhole: true })).toBe("landing_door_kit");
    expect(resolveLandingKitPickTarget(frame, { solidLeafAsWhole: true })).toBe(root);
  });

  it("returns null when absent", () => {
    expect(resolveLandingKitPickId(new THREE.Mesh())).toBe(null);
  });
});

describe("resolvePlacedId", () => {
  const floorDocs: Record<string, FloorDoc> = {
    f1: {
      id: "f1",
      version: 1,
      objects: [{ id: "chair", prefabId: "x", position: [0, 0, 0] }],
    },
  };

  it("reads placedObjectId from userData on the hit or an ancestor", () => {
    const mesh = new THREE.Mesh();
    mesh.userData.placedObjectId = "chair";
    expect(resolvePlacedId(mesh, floorDocs)).toBe("chair");
    const parent = new THREE.Group();
    parent.add(mesh);
    mesh.userData.placedObjectId = undefined;
    parent.userData.placedObjectId = "chair";
    expect(resolvePlacedId(mesh, floorDocs)).toBe("chair");
  });

  it("resolves Group name when it matches a placed object id", () => {
    const g = new THREE.Group();
    g.name = "chair";
    expect(resolvePlacedId(g, floorDocs)).toBe("chair");
  });

  it("returns null when nothing matches", () => {
    expect(resolvePlacedId(new THREE.Mesh(), floorDocs)).toBe(null);
  });
});

describe("resolveStairWellPartId", () => {
  it("prefers explicit pick handles so grouped flights select as one object", () => {
    const flight = new THREE.Group();
    flight.userData.editorStairPartId = "stair_flight_lower";
    flight.userData.editorStairPickId = "stair_flight_lower";
    const tread = new THREE.Mesh();
    flight.add(tread);
    expect(resolveStairWellPartId(tread)).toBe("stair_flight_lower");
    expect(resolveStairWellPartTarget(tread)).toBe(flight);
  });

  it("maps stair opening proxies to the shared opening selection id", () => {
    const root = new THREE.Group();
    const proxy = new THREE.Mesh();
    proxy.name = STAIR_WELL_OPENING_PROXY_ID;
    proxy.userData.editorStairOpeningProxy = true;
    root.add(proxy);
    const child = new THREE.Mesh();
    proxy.add(child);
    expect(resolveStairWellPartId(child)).toBe(STAIR_WELL_OPENING_PROXY_ID);
    expect(resolveStairWellPartTarget(child)).toBe(proxy);
  });

  it("keeps the secondary stair opening proxy id distinct", () => {
    const proxy = new THREE.Mesh();
    proxy.name = STAIR_WELL_SECONDARY_OPENING_PROXY_ID;
    proxy.userData.editorStairOpeningProxy = true;
    proxy.userData.editorStairOpeningId = STAIR_WELL_SECONDARY_OPENING_PROXY_ID;
    const child = new THREE.Mesh();
    proxy.add(child);
    expect(resolveStairWellPartId(child)).toBe(STAIR_WELL_SECONDARY_OPENING_PROXY_ID);
    expect(resolveStairWellPartTarget(child)).toBe(proxy);
  });
});

describe("resolveGizmoFloorDocId", () => {
  it("uses mesh floorDocId instead of a mismatched active floor doc", () => {
    const g = new THREE.Group();
    g.userData.floorDocId = "plate_doc";
    expect(resolveGizmoFloorDocId(g, "wrong_active")).toBe("plate_doc");
  });

  it("walks ancestors for floorDocId when the gizmo attaches to a child", () => {
    const parent = new THREE.Group();
    parent.userData.floorDocId = "from_parent";
    const child = new THREE.Mesh();
    parent.add(child);
    expect(resolveGizmoFloorDocId(child, "other")).toBe("from_parent");
  });

  it("falls back to active floor doc when no floorDocId is present", () => {
    const g = new THREE.Group();
    expect(resolveGizmoFloorDocId(g, "fallback")).toBe("fallback");
  });
});

describe("resolveGizmoInteriorDocId", () => {
  it("uses streamDocId from ancestors", () => {
    const root = new THREE.Group();
    root.userData.streamDocId = "stream_a";
    const mesh = new THREE.Mesh();
    root.add(mesh);
    expect(resolveGizmoInteriorDocId(mesh, "wrong_active")).toBe("stream_a");
  });
});

describe("resolveFloorPlacementTransformRoot", () => {
  const floorDocs: Record<string, FloorDoc> = {
    f1: {
      id: "f1",
      version: 1,
      objects: [{ id: "roomA", prefabId: "corridor", position: [1, 2, 3] }],
    },
  };

  it("returns the placement group when the gizmo is on a child mesh without userData", () => {
    const room = new THREE.Group();
    room.name = "roomA";
    room.userData.placedObjectId = "roomA";
    room.userData.floorDocId = "f1";
    const shell = new THREE.Mesh();
    room.add(shell);
    expect(resolveFloorPlacementTransformRoot(shell, floorDocs)).toBe(room);
    expect(floorPlacedObjectIdForTransformRoot(room, floorDocs)).toBe("roomA");
  });
});

describe("resolveInteriorPlacementTransformRoot", () => {
  const doc: InteriorDoc = {
    id: "lobby",
    version: 1,
    placements: [{ entityId: "ent1", prefabId: "box", position: [0, 0, 0] }],
    portals: [],
    decals: [],
  };

  it("returns the mesh from a deeper descendant if ids match on an ancestor", () => {
    const mesh = new THREE.Mesh();
    mesh.name = "ent1";
    mesh.userData.placedObjectId = "ent1";
    mesh.userData.streamDocId = "lobby";
    const sub = new THREE.Group();
    mesh.add(sub);
    const deep = new THREE.Mesh();
    sub.add(deep);
    expect(resolveInteriorPlacementTransformRoot(deep, doc)).toBe(mesh);
    expect(interiorEntityIdForTransformRoot(mesh)).toBe("ent1");
  });
});
