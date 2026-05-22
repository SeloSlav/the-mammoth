import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_APARTMENT_UNIT_LAYOUT_PROFILES_DOC,
  DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
  OWNED_APARTMENT_MODEL_BED,
} from "@the-mammoth/schemas";
import { useEditorStore } from "./editorStore.js";
import { editorMyApartmentSelectedIdForDecor } from "../editor/myApartment/editorMyApartmentSelection.js";

describe("editorStore apartment undo", () => {
  beforeEach(() => {
    useEditorStore.setState({
      mode: "my_apartment_layout",
      activeApartmentLayoutSource: "owned_default",
      activeApartmentLayoutProfileId: null,
      apartmentUnitLayoutProfiles: DEFAULT_APARTMENT_UNIT_LAYOUT_PROFILES_DOC,
      apartmentUnitLayoutProfilesNeedsDiskFlush: false,
      ownedApartmentDefaultBuiltins: DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
      ownedApartmentBuiltins: DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
      historyPast: [],
      historyFuture: [],
      selectedId: null,
      myApartmentMultiselectExtraIds: [],
    });
  });

  it("undoes decor import via history stack", () => {
    const beforeCount = useEditorStore.getState().ownedApartmentBuiltins.placedItems.length;

    useEditorStore.getState().patchOwnedApartmentBuiltins((doc) => ({
      ...doc,
      placedItems: [
        ...doc.placedItems,
        {
          id: "test-decor",
          modelRelPath: OWNED_APARTMENT_MODEL_BED,
          fx: 0.5,
          fz: 0.5,
          dy: 0,
          yawRad: 0,
          pitchRad: 0,
          rollRad: 0,
          uniformScale: 1,
          verticalScaleMul: 1,
          ignoreSupportSurfaces: false,
          itemKind: "bed",
        },
      ],
    }));

    expect(useEditorStore.getState().ownedApartmentBuiltins.placedItems).toHaveLength(
      beforeCount + 1,
    );
    expect(useEditorStore.getState().historyPast.length).toBeGreaterThan(0);

    useEditorStore.getState().undo();

    expect(useEditorStore.getState().ownedApartmentBuiltins.placedItems).toHaveLength(beforeCount);
    expect(useEditorStore.getState().historyFuture.length).toBe(1);
  });

  it("redoes decor deletion", () => {
    const decorId = "test-decor-redo";
    useEditorStore.getState().patchOwnedApartmentBuiltins((doc) => ({
      ...doc,
      placedItems: [
        ...doc.placedItems,
        {
          id: decorId,
          modelRelPath: OWNED_APARTMENT_MODEL_BED,
          fx: 0.5,
          fz: 0.5,
          dy: 0,
          yawRad: 0,
          pitchRad: 0,
          rollRad: 0,
          uniformScale: 1,
          verticalScaleMul: 1,
          ignoreSupportSurfaces: false,
          itemKind: "bed",
        },
      ],
    }));
    useEditorStore.setState({
      selectedId: editorMyApartmentSelectedIdForDecor(decorId),
    });

    useEditorStore.getState().deleteMyApartmentLayoutSelection();
    expect(
      useEditorStore
        .getState()
        .ownedApartmentBuiltins.placedItems.some((item) => item.id === decorId),
    ).toBe(false);

    useEditorStore.getState().undo();
    expect(
      useEditorStore
        .getState()
        .ownedApartmentBuiltins.placedItems.some((item) => item.id === decorId),
    ).toBe(true);

    useEditorStore.getState().redo();
    expect(
      useEditorStore
        .getState()
        .ownedApartmentBuiltins.placedItems.some((item) => item.id === decorId),
    ).toBe(false);
  });

  it("creates a unit-owned profile and prevents non-owned units from editing the player default", () => {
    const unitKey = "floor_mamutica_typical|20|unit_e_004";
    useEditorStore.setState({
      myApartmentPreviewUnitKey: unitKey,
      myApartmentPreviewUnitId: "unit_e_004",
      activeApartmentLayoutSource: "unassigned",
      activeApartmentLayoutProfileId: null,
    });

    const profileId = useEditorStore
      .getState()
      .createApartmentLayoutProfileFromCurrent("Floor 19 East 4");

    expect(profileId).toBeTruthy();
    expect(useEditorStore.getState().activeApartmentLayoutSource).toBe("profile");
    expect(useEditorStore.getState().activeApartmentLayoutProfileId).toBe(profileId);
    expect(
      useEditorStore
        .getState()
        .apartmentUnitLayoutProfiles.assignments.find((a) => a.unitKey === unitKey)
        ?.profileId,
    ).toBe(profileId);

    useEditorStore.getState().setActiveApartmentLayoutSource("owned_default");

    expect(useEditorStore.getState().activeApartmentLayoutSource).toBe("profile");
    expect(useEditorStore.getState().activeApartmentLayoutProfileId).toBe(profileId);
  });

  it("does not let one unit select another unit's assigned profile", () => {
    const east4UnitKey = "floor_mamutica_typical|20|unit_e_004";
    const east5UnitKey = "floor_mamutica_typical|20|unit_e_005";
    useEditorStore.setState({
      myApartmentPreviewUnitKey: east4UnitKey,
      myApartmentPreviewUnitId: "unit_e_004",
      activeApartmentLayoutSource: "unassigned",
      activeApartmentLayoutProfileId: null,
    });
    const east4ProfileId = useEditorStore
      .getState()
      .createApartmentLayoutProfileFromCurrent("Floor 19 East 4");

    useEditorStore.setState({
      myApartmentPreviewUnitKey: east5UnitKey,
      myApartmentPreviewUnitId: "unit_e_005",
      activeApartmentLayoutSource: "unassigned",
      activeApartmentLayoutProfileId: null,
    });

    useEditorStore.getState().setActiveApartmentLayoutProfileId(east4ProfileId);

    expect(useEditorStore.getState().activeApartmentLayoutSource).toBe("unassigned");
    expect(useEditorStore.getState().activeApartmentLayoutProfileId).toBeNull();
  });
});
