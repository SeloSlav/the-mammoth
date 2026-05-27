import { describe, expect, it } from "vitest";
import { MISSION_STATUS } from "@the-mammoth/schemas";
import { buildPlayerMissionPanelEntry } from "./playerMissionDisplay";

describe("buildPlayerMissionPanelEntry", () => {
  it("returns null when first extraction is complete", () => {
    expect(
      buildPlayerMissionPanelEntry({
        identity: { __identity__: 0n } as never,
        activeMissionId: "",
        status: MISSION_STATUS.COMPLETE,
        itemCollected: true,
        itemDeposited: true,
        firstExtractionComplete: true,
      }),
    ).toBeNull();
  });
});
