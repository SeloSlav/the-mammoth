import { describe, expect, it } from "vitest";
import {
  computeApartmentPlacementCanvasPick,
  resolveApartmentLayoutPlacementActivation,
} from "./apartmentLayoutSelectionOps.js";
import {
  editorMyApartmentSelectedIdForDecor,
  editorMyApartmentSelectedIdForSavedObjectGroup,
  editorMyApartmentSelectedIdForWall,
} from "./editorMyApartmentSelection.js";

describe("computeApartmentPlacementCanvasPick", () => {
  const dA = editorMyApartmentSelectedIdForDecor("decor-a");
  const dB = editorMyApartmentSelectedIdForDecor("decor-b");
  const wA = editorMyApartmentSelectedIdForWall("wall-a");
  const foreign = "mammoth_editor_some_other_target:xyz";
  const groupSel = editorMyApartmentSelectedIdForSavedObjectGroup("grp-1");

  it("empty click clears multiset", () => {
    expect(
      computeApartmentPlacementCanvasPick({
        clickedId: null,
        additive: false,
        previousSelectedId: dA,
        previousExtras: [dB],
      }),
    ).toEqual({ selectedId: null, myApartmentMultiselectExtraIds: [] });
  });

  it("single non-additive pick replaces extras", () => {
    expect(
      computeApartmentPlacementCanvasPick({
        clickedId: dA,
        additive: false,
        previousSelectedId: dB,
        previousExtras: [wA],
      }),
    ).toEqual({ selectedId: dA, myApartmentMultiselectExtraIds: [] });
  });

  it("additive decor anchors on the interacted id when it survives the toggle", () => {
    const first = computeApartmentPlacementCanvasPick({
      clickedId: dA,
      additive: false,
      previousSelectedId: null,
      previousExtras: [],
    });
    expect(first).toEqual({ selectedId: dA, myApartmentMultiselectExtraIds: [] });

    const second = computeApartmentPlacementCanvasPick({
      clickedId: dB,
      additive: true,
      previousSelectedId: first.selectedId,
      previousExtras: first.myApartmentMultiselectExtraIds,
    });
    expect(second.selectedId).toBe(dB);
    expect(second.myApartmentMultiselectExtraIds).toEqual([dA]);

    const third = computeApartmentPlacementCanvasPick({
      clickedId: dB,
      additive: true,
      previousSelectedId: second.selectedId,
      previousExtras: second.myApartmentMultiselectExtraIds,
    });
    /** Toggle-off the anchor → multiset collapses to a single décor id. */
    expect(third).toEqual({ selectedId: dA, myApartmentMultiselectExtraIds: [] });
  });

  it("additive pick after saved-group anchor starts a fresh multiset", () => {
    const out = computeApartmentPlacementCanvasPick({
      clickedId: wA,
      additive: true,
      previousSelectedId: groupSel,
      previousExtras: [],
    });
    expect(out).toEqual({ selectedId: wA, myApartmentMultiselectExtraIds: [] });
  });

  it("additive pick on non-groupable id resets to that sole selection", () => {
    const out = computeApartmentPlacementCanvasPick({
      clickedId: foreign,
      additive: true,
      previousSelectedId: dA,
      previousExtras: [dB],
    });
    expect(out).toEqual({
      selectedId: foreign,
      myApartmentMultiselectExtraIds: [],
    });
  });

  it("sorts multiset extras lexicographically and dedupes", () => {
    const step1 = computeApartmentPlacementCanvasPick({
      clickedId: dA,
      additive: false,
      previousSelectedId: null,
      previousExtras: [],
    });
    const step2 = computeApartmentPlacementCanvasPick({
      clickedId: dB,
      additive: true,
      previousSelectedId: step1.selectedId,
      previousExtras: step1.myApartmentMultiselectExtraIds,
    });
    const step3 = computeApartmentPlacementCanvasPick({
      clickedId: wA,
      additive: true,
      previousSelectedId: step2.selectedId,
      previousExtras: step2.myApartmentMultiselectExtraIds,
    });
    expect(step3.selectedId).toBe(wA);
    const expectedSorted = [dA, dB].slice().sort((a, b) => a.localeCompare(b));
    expect(step3.myApartmentMultiselectExtraIds).toEqual(expectedSorted);
    expect(new Set(step3.myApartmentMultiselectExtraIds).size).toBe(
      step3.myApartmentMultiselectExtraIds.length,
    );
  });
});

describe("resolveApartmentLayoutPlacementActivation", () => {
  const dA = editorMyApartmentSelectedIdForDecor("decor-a");
  const dB = editorMyApartmentSelectedIdForDecor("decor-b");

  it("first click selects without arming", () => {
    expect(
      resolveApartmentLayoutPlacementActivation({
        clickedId: dA,
        additive: false,
        selectedId: null,
        previousExtras: [],
        transformArmed: false,
      }),
    ).toEqual({
      selectedId: dA,
      myApartmentMultiselectExtraIds: [],
      myApartmentLayoutTransformArmed: false,
    });
  });

  it("second click on the same placement arms transform", () => {
    expect(
      resolveApartmentLayoutPlacementActivation({
        clickedId: dA,
        additive: false,
        selectedId: dA,
        previousExtras: [],
        transformArmed: false,
      }),
    ).toEqual({
      selectedId: dA,
      myApartmentMultiselectExtraIds: [],
      myApartmentLayoutTransformArmed: true,
    });
  });

  it("clicking a different placement re-selects and disarms", () => {
    expect(
      resolveApartmentLayoutPlacementActivation({
        clickedId: dB,
        additive: false,
        selectedId: dA,
        previousExtras: [],
        transformArmed: true,
      }),
    ).toEqual({
      selectedId: dB,
      myApartmentMultiselectExtraIds: [],
      myApartmentLayoutTransformArmed: false,
    });
  });
});
