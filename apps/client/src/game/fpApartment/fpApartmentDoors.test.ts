import { describe, expect, it } from "vitest";
import { apartmentDoorLookScore } from "./fpApartmentDoors";

describe("apartmentDoorLookScore", () => {
  it("accepts the door frame in the camera ray and rejects cross-hall side targets", () => {
    const lookedAtOwnDoor = apartmentDoorLookScore({
      cameraX: -4,
      cameraZ: 0,
      viewDirX: 1,
      viewDirZ: 0,
      targetX: -1.925,
      targetZ: 0.15,
    });
    const crossHallSideDoor = apartmentDoorLookScore({
      cameraX: -4,
      cameraZ: 0,
      viewDirX: 1,
      viewDirZ: 0,
      targetX: 1.925,
      targetZ: 2.2,
    });

    expect(lookedAtOwnDoor).not.toBeNull();
    expect(crossHallSideDoor).toBeNull();
  });

  it("rejects a door behind the camera even if it is nearby", () => {
    expect(
      apartmentDoorLookScore({
        cameraX: -4,
        cameraZ: 0,
        viewDirX: 1,
        viewDirZ: 0,
        targetX: -5,
        targetZ: 0,
      }),
    ).toBeNull();
  });
});
