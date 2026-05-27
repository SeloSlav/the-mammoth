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

  it("uses short objective labels for the first extraction", () => {
    const panel = buildPlayerMissionPanelEntry({
      identity: { __identity__: 0n } as never,
      activeMissionId: "work_order_fuse_wire_16e4",
      status: MISSION_STATUS.ACTIVE,
      itemCollected: false,
      itemDeposited: false,
      firstExtractionComplete: false,
    });
    expect(panel?.steps.map((s) => s.label)).toEqual([
      "Go to 16-E-4",
      "Retrieve Fuse wire pack",
      "Stash item",
    ]);
  });
});