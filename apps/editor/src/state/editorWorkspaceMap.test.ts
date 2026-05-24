import { describe, expect, it } from "vitest";
import { workspaceToInitialMode } from "./editorWorkspaceMap.js";

describe("workspaceToInitialMode", () => {
  it("opens apartment workspace in layout mode", () => {
    expect(workspaceToInitialMode("apartment", "kit")).toBe("my_apartment_layout");
  });
});
