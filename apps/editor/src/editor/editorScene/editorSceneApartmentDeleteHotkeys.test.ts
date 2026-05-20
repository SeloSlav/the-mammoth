import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "../../state/editorStore.js";
import { editorMyApartmentSelectedIdForDecor } from "../myApartment/editorMyApartmentSelection.js";
import {
  apartmentLayoutCloneFromKeyboardEvent,
  apartmentLayoutCutFromKeyboardEvent,
  apartmentLayoutDeleteFromKeyboardEvent,
} from "./editorSceneApartmentDeleteHotkeys.js";

describe("apartmentLayoutDeleteFromKeyboardEvent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

describe("apartmentLayoutCutFromKeyboardEvent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    useEditorStore.setState({
      mode: "my_apartment_layout",
      selectedId: editorMyApartmentSelectedIdForDecor("decor-a"),
      myApartmentMultiselectExtraIds: [],
    });
  });

  it("deletes on Ctrl+X with a deletable selection", () => {
    const deleteSpy = vi
      .spyOn(useEditorStore.getState(), "deleteMyApartmentLayoutSelection")
      .mockReturnValue(true);

    expect(
      apartmentLayoutCutFromKeyboardEvent({
        code: "KeyX",
        key: "x",
        repeat: false,
        target: null,
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
      }),
    ).toBe(true);
    expect(deleteSpy).toHaveBeenCalledOnce();
  });

  it("ignores Ctrl+X without a deletable selection", () => {
    useEditorStore.setState({ selectedId: null });
    const deleteSpy = vi.spyOn(useEditorStore.getState(), "deleteMyApartmentLayoutSelection");

    expect(
      apartmentLayoutCutFromKeyboardEvent({
        code: "KeyX",
        key: "x",
        repeat: false,
        target: null,
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
      }),
    ).toBe(false);
    expect(deleteSpy).not.toHaveBeenCalled();
  });
});

describe("apartmentLayoutCloneFromKeyboardEvent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    useEditorStore.setState({
      mode: "my_apartment_layout",
      selectedId: editorMyApartmentSelectedIdForDecor("decor-a"),
      myApartmentMultiselectExtraIds: [],
    });
  });

  it("clones on Ctrl+C with a clonable selection", () => {
    const cloneSpy = vi
      .spyOn(useEditorStore.getState(), "cloneMyApartmentLayoutSelection")
      .mockReturnValue(true);

    expect(
      apartmentLayoutCloneFromKeyboardEvent({
        code: "KeyC",
        key: "c",
        repeat: false,
        target: null,
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
      }),
    ).toBe(true);
    expect(cloneSpy).toHaveBeenCalledOnce();
  });
});
