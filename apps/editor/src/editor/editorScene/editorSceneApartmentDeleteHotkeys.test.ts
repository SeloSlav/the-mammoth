import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "../../state/editorStore.js";
import { editorMyApartmentSelectedIdForDecor } from "../myApartment/editorMyApartmentSelection.js";
import { apartmentLayoutDeleteFromKeyboardEvent } from "./editorSceneApartmentDeleteHotkeys.js";

describe("apartmentLayoutDeleteFromKeyboardEvent", () => {
  beforeEach(() => {
    useEditorStore.setState({
      mode: "my_apartment_layout",
      selectedId: editorMyApartmentSelectedIdForDecor("decor-a"),
      myApartmentMultiselectExtraIds: [],
    });
  });

  it("ignores non-Delete keys", () => {
    const deleteSpy = vi.spyOn(useEditorStore.getState(), "deleteMyApartmentLayoutSelection");
    expect(
      apartmentLayoutDeleteFromKeyboardEvent({
        code: "Backspace",
        repeat: false,
        target: null,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      }),
    ).toBe(false);
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("deletes when Delete is pressed with a deletable selection", () => {
    const deleteSpy = vi
      .spyOn(useEditorStore.getState(), "deleteMyApartmentLayoutSelection")
      .mockReturnValue(true);

    expect(
      apartmentLayoutDeleteFromKeyboardEvent({
        code: "Delete",
        repeat: false,
        target: null,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      }),
    ).toBe(true);
    expect(deleteSpy).toHaveBeenCalledOnce();
  });
});
