import { describe, expect, it } from "vitest";
import {
  clearFpPickupPrompts,
  getFpPickupPrompt,
  getFpPickupPromptSecondary,
  setFpPickupPrompt,
  syncFpPickupPromptNotebookSecondary,
} from "./fpPickupPrompt";

describe("fpPickupPrompt secondary notebook", () => {
  it("stacks notebook when primary is another interact", () => {
    clearFpPickupPrompts();
    setFpPickupPrompt({
      kind: "apartment_sittable",
      sittableKey: "chair",
      unitKey: "u1",
      label: "Sit on chair",
    });
    syncFpPickupPromptNotebookSecondary(getFpPickupPrompt(), {
      kind: "apartment_notebook",
      notebookKey: "nb1",
      unitKey: "u1",
      label: "Open notebook",
      willClose: false,
    });
    expect(getFpPickupPrompt()?.kind).toBe("apartment_sittable");
    expect(getFpPickupPromptSecondary()?.kind).toBe("apartment_notebook");
  });

  it("drops secondary when notebook is already primary", () => {
    clearFpPickupPrompts();
    const notebook = {
      kind: "apartment_notebook" as const,
      notebookKey: "nb1",
      unitKey: "u1",
      label: "Open notebook",
      willClose: false,
    };
    setFpPickupPrompt(notebook);
    syncFpPickupPromptNotebookSecondary(getFpPickupPrompt(), notebook);
    expect(getFpPickupPromptSecondary()).toBeNull();
  });
});
