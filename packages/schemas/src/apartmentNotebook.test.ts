import { describe, expect, it } from "vitest";
import {
  APARTMENT_NOTEBOOK_PROMPT_LABEL,
  isApartmentNotebookModelRelPath,
  OWNED_APARTMENT_MODEL_NOTEBOOK,
} from "./apartmentNotebook.js";

describe("apartmentNotebook", () => {
  it("recognizes canonical notebook model path", () => {
    expect(isApartmentNotebookModelRelPath(OWNED_APARTMENT_MODEL_NOTEBOOK)).toBe(true);
    expect(isApartmentNotebookModelRelPath("/static/models/objects/notebook.glb")).toBe(true);
  });

  it("rejects unrelated models", () => {
    expect(isApartmentNotebookModelRelPath("static/models/objects/desk.glb")).toBe(false);
  });

  it("exports a stable HUD label", () => {
    expect(APARTMENT_NOTEBOOK_PROMPT_LABEL.length).toBeGreaterThan(0);
  });
});
