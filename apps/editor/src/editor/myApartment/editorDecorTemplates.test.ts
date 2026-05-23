import { describe, expect, it } from "vitest";
import {
  DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
  ownedApartmentBuiltinsDoc,
} from "@the-mammoth/schemas";
import { APARTMENT_FISH_TANK_SWIMMER_MODEL_REL_PATH } from "@the-mammoth/world";
import {
  listMissingEditorDecorTemplatePaths,
  type EditorMyApartmentDecorTemplateMap,
} from "./editorMyApartmentMeshes.js";

describe("listMissingEditorDecorTemplatePaths", () => {
  it("returns paths that are placed but not yet loaded into the template map", () => {
    const templates: EditorMyApartmentDecorTemplateMap = new Map();
    templates.set("static/models/objects/bed.glb", {} as never);
    const doc = ownedApartmentBuiltinsDoc({
      ...DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
      placedItems: [
        {
          id: "new_desk",
          modelRelPath: "static/models/objects/desk.glb",
          fx: 0.5,
          fz: 0.5,
          dy: 0,
          yawRad: 0,
          pitchRad: 0,
          rollRad: 0,
          uniformScale: 1,
          ignoreSupportSurfaces: false,
          itemKind: "plain" as const,
        },
      ],
    });
    const missing = listMissingEditorDecorTemplatePaths(doc, templates);
    expect(missing).toEqual(["static/models/objects/desk.glb"]);
  });

  it("implicitly pulls the fish swimmer mesh when any fish tank is placed", () => {
    const templates: EditorMyApartmentDecorTemplateMap = new Map();
    templates.set("static/models/objects/fish-tank.glb", {} as never);
    const doc = ownedApartmentBuiltinsDoc({
      ...DEFAULT_OWNED_APARTMENT_BUILTINS_DOC,
      placedItems: [
        {
          id: "tank1",
          modelRelPath: "static/models/objects/fish-tank.glb",
          fx: 0.5,
          fz: 0.5,
          dy: 0,
          yawRad: 0,
          pitchRad: 0,
          rollRad: 0,
          uniformScale: 1,
          ignoreSupportSurfaces: false,
          itemKind: "plain" as const,
        },
      ],
    });
    expect(listMissingEditorDecorTemplatePaths(doc, templates)).toEqual([
      APARTMENT_FISH_TANK_SWIMMER_MODEL_REL_PATH,
    ]);
  });
});
