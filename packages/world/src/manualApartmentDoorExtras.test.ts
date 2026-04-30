import { describe, expect, it } from "vitest";
import {
  apartmentDoorSwingInwardForTemplateId,
  MANUAL_CORRIDOR_STAIR_DOOR_UNIT_ID_PREFIX,
  MANUAL_STAIR_SHAFT_EXIT_DOOR_UNIT_ID_PREFIX,
} from "./manualApartmentDoorExtras.js";

describe("apartmentDoorSwingInwardForTemplateId", () => {
  it("opens apartment and corridor doors outward into the hallway on the authored hinge", () => {
    expect(apartmentDoorSwingInwardForTemplateId("unit_e_001|w")).toBe(false);
    expect(apartmentDoorSwingInwardForTemplateId("unit_w_001|e")).toBe(false);
    expect(apartmentDoorSwingInwardForTemplateId(`${MANUAL_CORRIDOR_STAIR_DOOR_UNIT_ID_PREFIX}01|w`)).toBe(false);
    expect(apartmentDoorSwingInwardForTemplateId(`${MANUAL_STAIR_SHAFT_EXIT_DOOR_UNIT_ID_PREFIX}01|s`)).toBe(false);
  });
});
