import { describe, expect, it } from "vitest";
import {
  buildFirstExtractionMissionPanel,
  FIRST_EXTRACTION_LEVEL_INDEX,
  FIRST_EXTRACTION_MISSION_ID,
  firstExtractionUnitKey,
  MISSION_STATUS,
  missionStatusLabel,
} from "./playerMissions.js";

describe("playerMissions", () => {
  it("maps elevator deck 16 to levelIndex 17", () => {
    expect(FIRST_EXTRACTION_LEVEL_INDEX).toBe(17);
    expect(firstExtractionUnitKey()).toBe(
      "floor_mamutica_typical|17|unit_e_004",
    );
  });

  it("builds panel steps from mission progress row", () => {
    const panel = buildFirstExtractionMissionPanel(
      {
        activeMissionId: FIRST_EXTRACTION_MISSION_ID,
        status: MISSION_STATUS.COLLECTED,
        itemCollected: true,
        itemDeposited: false,
      },
      "Fuse wire pack",
    );
    expect(panel?.steps.find((s) => s.id === "collect")?.done).toBe(true);
    expect(panel?.steps.find((s) => s.id === "deposit")?.done).toBe(false);
  });

  it("marks stash step done while waiting for shift turn-in reward", () => {
    const panel = buildFirstExtractionMissionPanel(
      {
        activeMissionId: FIRST_EXTRACTION_MISSION_ID,
        status: MISSION_STATUS.TURNED_IN,
        itemCollected: true,
        itemDeposited: true,
      },
      "Fuse wire pack",
    );
    expect(panel?.status).toBe(MISSION_STATUS.TURNED_IN);
    expect(panel?.steps.find((s) => s.id === "deposit")?.done).toBe(true);
    expect(missionStatusLabel(MISSION_STATUS.TURNED_IN)).toBe("Turned in");
  });
});
