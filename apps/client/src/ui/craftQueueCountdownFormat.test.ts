import { describe, expect, it } from "vitest";
import { formatCraftQueueCountdown } from "./craftQueueCountdownFormat";

describe("formatCraftQueueCountdown", () => {
  it("uses seconds under a minute", () => {
    expect(formatCraftQueueCountdown(45.2)).toBe("46s");
    expect(formatCraftQueueCountdown(0.1)).toBe("1s");
    expect(formatCraftQueueCountdown(0)).toBe("0s");
  });

  it("uses m:ss at one minute and above", () => {
    expect(formatCraftQueueCountdown(60)).toBe("1:00");
    expect(formatCraftQueueCountdown(61)).toBe("1:01");
    expect(formatCraftQueueCountdown(125)).toBe("2:05");
  });

  it("clamps negative input", () => {
    expect(formatCraftQueueCountdown(-5)).toBe("0s");
  });
});
