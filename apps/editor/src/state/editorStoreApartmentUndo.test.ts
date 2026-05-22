import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
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
});
