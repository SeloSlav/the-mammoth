import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  FP_ELEV_EXTERIOR_DOOR_PICK_UD,
  FP_ELEV_LANDING_HAIL_PICK_UD,
} from "../fpElevatorConstants.js";

describe("elevator landing interact pick targets", () => {
  it("tags the hail icon plane for crosshair raycasts (not just the cylinder body)", () => {
    const icon = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.25));
    const pick = { shaftKey: "shaft-a", level: 19 };
    icon.userData[FP_ELEV_LANDING_HAIL_PICK_UD] = pick;
    expect(icon.userData[FP_ELEV_LANDING_HAIL_PICK_UD]).toEqual(pick);
  });

  it("keeps exterior door pick slabs raycastable when visually hidden", () => {
    const doorPick = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 2.05, 0.9),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }),
    );
    doorPick.userData[FP_ELEV_EXTERIOR_DOOR_PICK_UD] = { shaftKey: "shaft-a", level: 19 };
    expect(doorPick.visible).toBe(true);

    const scene = new THREE.Scene();
    scene.add(doorPick);
    doorPick.position.set(0, 1.1, 0);
    doorPick.updateMatrixWorld(true);

    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(0, 1.1, 3),
      new THREE.Vector3(0, 0, -1),
    );
    const hits = raycaster.intersectObject(doorPick, false);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.object.userData[FP_ELEV_EXTERIOR_DOOR_PICK_UD]?.level).toBe(19);
  });
});
