import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getFpActiveStashPanel,
  setFpActiveStashPanel,
} from "./fpActiveStashPanel";
import {
  closeFpNotebookTipsPanel,
  isFpNotebookTipsPanelOpen,
  openFpNotebookTipsPanel,
} from "../fpApartment/fpNotebookTipsPanelState";
import { publishFpInteractionFeet } from "./fpInteractionFeetState";
import { dismissFpInteractPanelsWhenOutOfRange } from "./fpDismissPanelsWhenOutOfRange";

vi.mock("../fpApartment/fpApartmentGameplay.js", () => ({
  clientMayUseApartmentStash: vi.fn(() => true),
}));

import { clientMayUseApartmentStash } from "../fpApartment/fpApartmentGameplay.js";

describe("dismissFpInteractPanelsWhenOutOfRange", () => {
  beforeEach(() => {
    setFpActiveStashPanel(null);
    closeFpNotebookTipsPanel();
    publishFpInteractionFeet({ x: 0, y: 0, z: 0 });
    vi.mocked(clientMayUseApartmentStash).mockReturnValue(true);
  });

  it("closes stash and inventory when out of range", () => {
    setFpActiveStashPanel({
      stashKey: "u1#wardrobe",
      stashLabel: "Wardrobe",
      stashKind: "wardrobe",
    });
    vi.mocked(clientMayUseApartmentStash).mockReturnValue(false);

    dismissFpInteractPanelsWhenOutOfRange({
      conn: { identity: "id" } as never,
      getApartmentNotebookPrompt: () => null,
    });

    expect(getFpActiveStashPanel()).toBeNull();
  });

  it("closes notebook panel when prompt is no longer in range", () => {
    openFpNotebookTipsPanel();
    expect(isFpNotebookTipsPanelOpen()).toBe(true);

    dismissFpInteractPanelsWhenOutOfRange({
      conn: { identity: "id" } as never,
      getApartmentNotebookPrompt: () => null,
    });

    expect(isFpNotebookTipsPanelOpen()).toBe(false);
  });

  it("keeps panels open while still in range", () => {
    setFpActiveStashPanel({
      stashKey: "u1#footlocker",
      stashLabel: "Footlocker",
      stashKind: "footlocker",
    });
    openFpNotebookTipsPanel();

    dismissFpInteractPanelsWhenOutOfRange({
      conn: { identity: "id" } as never,
      getApartmentNotebookPrompt: () => ({ notebookKey: "nb1" }),
    });

    expect(getFpActiveStashPanel()).not.toBeNull();
    expect(isFpNotebookTipsPanelOpen()).toBe(true);
  });
});
