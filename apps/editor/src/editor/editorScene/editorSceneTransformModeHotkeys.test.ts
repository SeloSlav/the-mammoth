import { describe, expect, it } from "vitest";
import { transformModeFromDigitPhysicalKey } from "./editorSceneTransformModeHotkeys.js";

describe("transformModeFromDigitPhysicalKey", () => {
  it("maps main-row and numpad digits", () => {
    expect(transformModeFromDigitPhysicalKey({ code: "Digit1" })).toBe("translate");
    expect(transformModeFromDigitPhysicalKey({ code: "Digit2" })).toBe("rotate");
    expect(transformModeFromDigitPhysicalKey({ code: "Digit3" })).toBe("scale");
    expect(transformModeFromDigitPhysicalKey({ code: "Numpad1" })).toBe("translate");
    expect(transformModeFromDigitPhysicalKey({ code: "Numpad2" })).toBe("rotate");
    expect(transformModeFromDigitPhysicalKey({ code: "Numpad3" })).toBe("scale");
    expect(transformModeFromDigitPhysicalKey({ code: "Digit4" })).toBeNull();
  });
});
