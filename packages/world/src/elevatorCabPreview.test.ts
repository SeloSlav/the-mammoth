import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ElevatorCabDefSchema } from "@the-mammoth/schemas";
import {
  applyElevatorCabPartTransforms,
  buildElevatorCabCarVisual,
  buildElevatorCabCarPreviewRoot,
  MAMMOTH_MERGED_CAB_FLOOR_PICK_UD,
  resolveMergedCabFloorPickLevel,
  type MergedCabFloorPickLayout,
} from "./elevatorCabPreview.js";

describe("applyElevatorCabPartTransforms", () => {
  it("applies partTransforms to tagged meshes", () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh();
    mesh.userData.editorCabPartId = "cab_floor";
    mesh.position.set(0, 0, 0);
    root.add(mesh);

    const def = ElevatorCabDefSchema.parse({
      id: "t",
      version: 1,
      partTransforms: {
        cab_floor: { position: [1, 2, 3], scale: [2, 1, 1] },
      },
    });

    applyElevatorCabPartTransforms(root, def);
    expect(mesh.position.x).toBe(1);
    expect(mesh.position.y).toBe(2);
    expect(mesh.position.z).toBe(3);
    expect(mesh.scale.x).toBe(2);
  });

  it("builds the in-car selector panel with one floor button per level", () => {
    const root = buildElevatorCabCarPreviewRoot({
      layout: {
        planKey: "shaft",
        plateX: 0,
        plateZ: 0,
        plateLocalY: 0,
        sx: 3.4,
        sy: 3.2,
        sz: 3.8,
        doorFace: "e",
      },
      maxLevel: 6,
      includeDoors: false,
    });

    const panel = root.getObjectByName("cab_floor_panel");
    expect(panel?.userData.editorCabPartId).toBe("cab_floor_panel");
    expect(root.getObjectByName("cab_door_l")).toBeUndefined();
    expect(root.getObjectByName("cab_door_r")).toBeUndefined();
    const labels: string[] = [];
    root.traverse((child) => {
      if (child.name.startsWith("cab_floor_button_label_")) labels.push(child.name);
    });
    expect(labels).toHaveLength(6);
    expect(root.getObjectByName("cab_floor_button_label_6")).not.toBeNull();
    expect(root.getObjectByName("cab_floor_button_body_6")).not.toBeNull();
    expect(root.getObjectByName("cab_floor_button_body_6")?.userData.editorCabPickId).toBe(
      "cab_floor_button",
    );
    expect(root.getObjectByName("cab_floor_button_body_6")).toMatchObject({
      geometry: expect.objectContaining({ type: "CylinderGeometry" }),
    });
    expect(root.getObjectByName("cab_floor_button_label_6")).toMatchObject({
      geometry: expect.objectContaining({ type: "CircleGeometry" }),
    });
    const board = root.getObjectByName("cab_floor_panel_board");
    expect(board?.position.length()).toBeGreaterThan(0.1);
    expect(root.getObjectByName("cab_wall_front_top")?.userData.editorCabPartId).toBe("cab_wall_front_top");
    expect(root.getObjectByName("cab_wall_front_n")?.userData.editorCabPartId).toBe("cab_wall_front_n");
    expect(root.getObjectByName("cab_wall_front_s")?.userData.editorCabPartId).toBe("cab_wall_front_s");
  });

  it("builds front wall panels for north-facing cab doors too", () => {
    const root = buildElevatorCabCarPreviewRoot({
      layout: {
        planKey: "shaft_n",
        plateX: 0,
        plateZ: 0,
        plateLocalY: 0,
        sx: 3.4,
        sy: 3.2,
        sz: 3.8,
        doorFace: "n",
      },
      includeDoors: false,
    });

    expect(root.getObjectByName("cab_wall_front_top")?.userData.editorCabPartId).toBe("cab_wall_front_top");
    expect(root.getObjectByName("cab_wall_front_e")?.userData.editorCabPartId).toBe("cab_wall_front_e");
    expect(root.getObjectByName("cab_wall_front_w")?.userData.editorCabPartId).toBe("cab_wall_front_w");
  });

  it("mergeCabFloorButtons emits one merged body + label mesh and resolvable pick layout", () => {
    const vis = buildElevatorCabCarVisual({
      layout: {
        planKey: "shaft",
        plateX: 0,
        plateZ: 0,
        plateLocalY: 0,
        sx: 3.4,
        sy: 3.2,
        sz: 3.8,
        doorFace: "e",
      },
      maxLevel: 6,
      includeDoors: false,
      mergeCabFloorButtons: true,
    });
    expect(vis.mergedFloorButtons).toBe(true);
    const mergedBody = vis.panelRoot.getObjectByName("cab_floor_button_bodies_merged");
    const mergedLabel = vis.panelRoot.getObjectByName("cab_floor_button_labels_merged");
    expect(mergedBody).toBeInstanceOf(THREE.Mesh);
    expect(mergedLabel).toBeInstanceOf(THREE.Mesh);
    const layout = (mergedBody as THREE.Mesh).userData[
      MAMMOTH_MERGED_CAB_FLOOR_PICK_UD
    ] as MergedCabFloorPickLayout;
    expect(layout.maxLevel).toBe(6);
    expect(layout.centersPanelLocal).toHaveLength(6);
    expect(layout.vertsPerBodyLevel).toBeGreaterThan(10);
    expect(layout.vertsPerLabelLevel).toBeGreaterThan(10);

    vis.root.updateMatrixWorld(true);
    const c1 = layout.centersPanelLocal[0]!;
    const worldNear = new THREE.Vector3(c1.x, c1.y, c1.z);
    vis.panelRoot.localToWorld(worldNear);
    expect(resolveMergedCabFloorPickLevel(worldNear, vis.panelRoot, layout)).toBe(1);
  });
});
