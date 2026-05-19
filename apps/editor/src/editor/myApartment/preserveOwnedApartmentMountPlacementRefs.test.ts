import { describe, expect, it } from "vitest";
import { DEFAULT_OWNED_APARTMENT_BUILTINS_DOC } from "@the-mammoth/schemas";
import { preserveOwnedApartmentMountPlacementRefs } from "./preserveOwnedApartmentMountPlacementRefs.js";
import { editorMyApartmentSelectedIdForDecor } from "./editorMyApartmentSelection.js";

describe("preserveOwnedApartmentMountPlacementRefs", () => {
  it("reuses placement arrays when only objectGroups changed", () => {
    const prev = DEFAULT_OWNED_APARTMENT_BUILTINS_DOC;
    const next = {
      ...prev,
      placedItems: [...prev.placedItems],
      wallItems: [...prev.wallItems],
      mirrorItems: [...prev.mirrorItems],
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
    };

    const out = preserveOwnedApartmentMountPlacementRefs(prev, next);
    expect(out.placedItems).toBe(prev.placedItems);
    expect(out.wallItems).toBe(prev.wallItems);
    expect(out.mirrorItems).toBe(prev.mirrorItems);
    expect(out.objectGroups).toBe(next.objectGroups);
  });
});
