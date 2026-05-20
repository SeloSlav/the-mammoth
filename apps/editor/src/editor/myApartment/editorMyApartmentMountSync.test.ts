import { describe, expect, it } from "vitest";
import {
  DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
  ownedApartmentBuiltinsDoc,
} from "@the-mammoth/schemas";
import type { EditorState } from "../../state/editorStoreTypes.js";
import { DEFAULT_BUILDING } from "../../state/editorStoreSeedValues.js";
import {
  apartmentMountSyncInputsChanged,
  captureApartmentMountSyncInputs,
  classifyApartmentMountSyncChange,
} from "./editorMyApartmentMountSync.js";
import { editorMyApartmentSelectedIdForDecor } from "./editorMyApartmentSelection.js";

function baseEditorState(overrides?: Partial<EditorState>): EditorState {
  return {
    mode: "my_apartment_layout",
    contentStructureEpoch: 0,
    selectedId: null,
    myApartmentMultiselectExtraIds: [],
    ownedApartmentBuiltins: DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
    floorDocs: {},
    building: DEFAULT_BUILDING,
    ...overrides,
  } as EditorState;
}

describe("apartmentMountSyncInputsChanged", () => {
  it("ignores selection and saved-group-only builtins edits", () => {
    const shared = baseEditorState();
    const prev = captureApartmentMountSyncInputs(
      { ...shared, selectedId: editorMyApartmentSelectedIdForDecor("decor-a") },
    );
    const nextSelection = captureApartmentMountSyncInputs(
      { ...shared, selectedId: editorMyApartmentSelectedIdForDecor("decor-b") },
    );
    expect(apartmentMountSyncInputsChanged(prev, nextSelection)).toBe(false);

    const nextGroupsOnly = captureApartmentMountSyncInputs({
      ...shared,
      ownedApartmentBuiltins: {
        ...DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
        objectGroups: [
          {
            id: "g1",
            name: "Group",
            memberSelectedIds: [
              editorMyApartmentSelectedIdForDecor("decor-a"),
              editorMyApartmentSelectedIdForDecor("decor-b"),
            ],
          },
        ],
      },
    });
    expect(apartmentMountSyncInputsChanged(prev, nextGroupsOnly)).toBe(false);
  });

  it("detects placement array changes", () => {
    const prev = captureApartmentMountSyncInputs(baseEditorState());
    const next = captureApartmentMountSyncInputs(
      baseEditorState({
        ownedApartmentBuiltins: ownedApartmentBuiltinsDoc({
          ...DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
          placedItems: [
            ...DEFAULT_OWNED_APARTMENT_BUILTINS_DOC.placedItems,
            {
              id: "decor-new",
              modelRelPath: "static/models/objects/obj.glb",
              fx: 0.5,
              fz: 0.5,
              dy: 0,
              yawRad: 0,
              pitchRad: 0,
              rollRad: 0,
              uniformScale: 1,
              ignoreSupportSurfaces: false,
              itemKind: "plain",
            },
          ],
        }),
      }),
    );
    expect(apartmentMountSyncInputsChanged(prev, next)).toBe(true);
  });

  it("classifies decor-only edits as incremental sync", () => {
    const base = baseEditorState();
    const prev = captureApartmentMountSyncInputs(base);
    const next = captureApartmentMountSyncInputs(
      baseEditorState({
        ownedApartmentBuiltins: {
          ...DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
          placedItems: DEFAULT_OWNED_APARTMENT_BUILTINS_DOC.placedItems.map((item) =>
            item.id === "mammoth_builtin_bed" ? { ...item, fx: 0.7, fz: 0.55 } : item,
          ),
        },
      }),
    );
    expect(classifyApartmentMountSyncChange(prev, next)).toBe("decor-only");
  });

  it("classifies wall-only edits as incremental sync", () => {
    const base = baseEditorState();
    const prev = captureApartmentMountSyncInputs(base);
    const next = captureApartmentMountSyncInputs(
      baseEditorState({
        ownedApartmentBuiltins: {
          ...DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
          wallItems: [
            ...DEFAULT_OWNED_APARTMENT_BUILTINS_DOC.wallItems,
            {
              id: "wall-new",
              fx: 0.5,
              fz: 0.5,
              dy: 0,
              yawRad: 0,
              pitchRad: 0,
              sizeX: 2,
              sizeY: 2.6,
              sizeZ: 0.07,
              material: { useMetalnessMap: false, useHeightMap: false },
            },
          ],
        },
      }),
    );
    expect(classifyApartmentMountSyncChange(prev, next)).toBe("walls-only");
  });
});
