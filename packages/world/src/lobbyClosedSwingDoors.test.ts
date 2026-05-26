import { describe, expect, it } from "vitest";
import {
  LOBBY_EXTERIOR_CLADDING_TH_M,
  lobbyClosedDoorHingeXForEastWestWall,
  lobbyClosedDoorHingeZForNorthSouthWall,
} from "./lobbyClosedSwingDoors.js";
import {
  doorFrameTrimPlaneConstantX,
  doorFrameTrimPlaneConstantZ,
} from "./wallWithDoorCutout.js";
import { SWING_DOOR_PANEL_THICK_M } from "./swingDoorMesh.js";

describe("lobbyClosedSwingDoors", () => {
  const hx = 10.5;
  const hz = 79;
  const wt = 0.11;
  const cladT = LOBBY_EXTERIOR_CLADDING_TH_M;

  it("coplanar east exterior leaf with black exterior trim plane", () => {
    const framePlaneX = doorFrameTrimPlaneConstantX(hx + cladT, -1);
    const hingeX = lobbyClosedDoorHingeXForEastWestWall({
      face: "e",
      hx,
      wt,
      exterior: true,
      exteriorCladT: cladT,
    });
    expect(hingeX + SWING_DOOR_PANEL_THICK_M * 0.5).toBeCloseTo(framePlaneX, 5);
  });

  it("coplanar west exterior leaf with black exterior trim plane", () => {
    const framePlaneX = doorFrameTrimPlaneConstantX(-hx - cladT, 1);
    const hingeX = lobbyClosedDoorHingeXForEastWestWall({
      face: "w",
      hx,
      wt,
      exterior: true,
      exteriorCladT: cladT,
    });
    expect(hingeX + SWING_DOOR_PANEL_THICK_M * 0.5).toBeCloseTo(framePlaneX, 5);
  });

  it("coplanar north exterior leaf with black exterior trim plane", () => {
    const framePlaneZ = doorFrameTrimPlaneConstantZ(hz + cladT, -1);
    const hingeZ = lobbyClosedDoorHingeZForNorthSouthWall({
      face: "n",
      hz,
      wt,
      exterior: true,
      exteriorCladT: cladT,
    });
    expect(hingeZ - SWING_DOOR_PANEL_THICK_M * 0.5).toBeCloseTo(framePlaneZ, 5);
  });

  it("coplanar south exterior leaf with black exterior trim plane", () => {
    const framePlaneZ = doorFrameTrimPlaneConstantZ(-hz - cladT, 1);
    const hingeZ = lobbyClosedDoorHingeZForNorthSouthWall({
      face: "s",
      hz,
      wt,
      exterior: true,
      exteriorCladT: cladT,
    });
    expect(hingeZ - SWING_DOOR_PANEL_THICK_M * 0.5).toBeCloseTo(framePlaneZ, 5);
  });
});
