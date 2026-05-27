import { describe, expect, it } from "vitest";
import {
  clearFpPickupPrompts,
  getFpPickupPrompt,
  getFpPickupPromptSecondary,
  setFpPickupPrompt,
  syncFpPickupPromptNotebookSecondary,
} from "./fpPickupPrompt";

describe("fpPickupPrompt secondary notebook", () => {
  it("stacks notebook when primary is grow tray stash", () => {
    clearFpPickupPrompts();
    setFpPickupPrompt({
      kind: "apartment_stash",
      stashKey: "grow-tray",
      unitKey: "u1",
      stashLabel: "Grow tray",
      willClose: false,
    });
    syncFpPickupPromptNotebookSecondary(getFpPickupPrompt(), {
      kind: "apartment_notebook",
      notebookKey: "nb1",
      unitKey: "u1",
      label: "Open notebook",
      willClose: false,
    });
    expect(getFpPickupPrompt()?.kind).toBe("apartment_stash");
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
