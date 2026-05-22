import { describe, expect, it } from "vitest";
import {
  isMyApartmentLayoutHidePickTarget,
  pruneMyApartmentLayoutHiddenPlacementIds,
  selectionAfterHidingMyApartmentLayoutPlacement,
  shouldHideMyApartmentLayoutSelectionGroup,
} from "./editorMyApartmentLayoutVisibility.js";
import {
  editorMyApartmentSelectedIdForDecor,
  editorMyApartmentSelectedIdForMirror,
  editorMyApartmentSelectedIdForSavedObjectGroup,
  editorMyApartmentSelectedIdForWall,
  editorMyApartmentSelectedIdForWallOpening,
} from "./editorMyApartmentSelection.js";

describe("editorMyApartmentLayoutVisibility", () => {
  const decorA = editorMyApartmentSelectedIdForDecor("a");
  const decorB = editorMyApartmentSelectedIdForDecor("b");
  const wallA = editorMyApartmentSelectedIdForWall("wall-a");
  const openingA = editorMyApartmentSelectedIdForWallOpening("wall-a", "door-1");
  const mirrorA = editorMyApartmentSelectedIdForMirror("mir-1");
  const groupA = editorMyApartmentSelectedIdForSavedObjectGroup("grp");

  it("accepts decor, walls, mirrors, and wall openings as hide targets", () => {
    expect(isMyApartmentLayoutHidePickTarget(decorA)).toBe(true);
    expect(isMyApartmentLayoutHidePickTarget(wallA)).toBe(true);
    expect(isMyApartmentLayoutHidePickTarget(mirrorA)).toBe(true);
    expect(isMyApartmentLayoutHidePickTarget(openingA)).toBe(true);
    expect(isMyApartmentLayoutHidePickTarget(groupA)).toBe(false);
  });

  it("clears primary selection when the hidden placement was selected", () => {
    expect(
      selectionAfterHidingMyApartmentLayoutPlacement(decorA, [decorB], decorA),
    ).toEqual({ selectedId: null, myApartmentMultiselectExtraIds: [] });
  });

  it("removes hidden ids from multiselect extras", () => {
    expect(
      selectionAfterHidingMyApartmentLayoutPlacement(decorA, [decorB, wallA], wallA),
    ).toEqual({ selectedId: decorA, myApartmentMultiselectExtraIds: [decorB] });
  });

  it("hides wall-opening groups when their parent wall is hidden", () => {
    const hidden = new Set([wallA]);
    expect(shouldHideMyApartmentLayoutSelectionGroup(openingA, hidden)).toBe(true);
    expect(shouldHideMyApartmentLayoutSelectionGroup(decorA, hidden)).toBe(false);
  });

  it("prunes hidden ids that no longer exist in the scene", () => {
    const known = new Set([decorA, wallA]);
    expect(
      pruneMyApartmentLayoutHiddenPlacementIds([decorA, decorB, wallA], known),
    ).toEqual([decorA, wallA]);
  });
});
