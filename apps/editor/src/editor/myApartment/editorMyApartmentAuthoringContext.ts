import type { BuildingDoc, FloorDoc, OwnedApartmentBuiltinsDoc } from "@the-mammoth/schemas";
import {
  resolveFloor19CorridorAuthoringFootprint,
  TYPICAL_FLOOR_DOC_ID,
} from "@the-mammoth/world";
import type { MyApartmentAuthoringTarget } from "../../state/editorStoreTypes.js";
import {
  floor19CorridorFractionMappingForEditor,
  ownedApartmentFractionMappingForEditor,
  resolveOwnedApartmentAuthoringLayoutForEditor,
  type OwnedApartmentFractionToPreviewXZ,
} from "./editorMyApartmentAuthoringShell.js";

export function isMyApartmentCorridorAuthoringTarget(
  target: MyApartmentAuthoringTarget,
): boolean {
  return target === "floor_19_corridor";
}

export function resolveMyApartmentAuthoringFractionMappingForEditor(args: {
  myApartmentAuthoringTarget: MyApartmentAuthoringTarget;
  floorDocs: Record<string, FloorDoc>;
  building: BuildingDoc;
  myApartmentPreviewUnitId: string;
  ownedApartmentBuiltins: OwnedApartmentBuiltinsDoc;
}): OwnedApartmentFractionToPreviewXZ {
  if (isMyApartmentCorridorAuthoringTarget(args.myApartmentAuthoringTarget)) {
    const footprint = resolveFloor19CorridorAuthoringFootprint(
      args.floorDocs[TYPICAL_FLOOR_DOC_ID],
    );
    return floor19CorridorFractionMappingForEditor({
      footprint,
      builtinsFallbackPreviewM: args.ownedApartmentBuiltins.previewSizeM,
    });
  }
  const layout = resolveOwnedApartmentAuthoringLayoutForEditor({
    floorDoc: args.floorDocs[TYPICAL_FLOOR_DOC_ID],
    building: args.building,
    previewUnitId: args.myApartmentPreviewUnitId,
  });
  return ownedApartmentFractionMappingForEditor({
    layout,
    builtinsFallbackPreviewM: args.ownedApartmentBuiltins.previewSizeM,
  });
}

export function resolveMyApartmentAuthoringInteriorHeightM(args: {
  myApartmentAuthoringTarget: MyApartmentAuthoringTarget;
  floorDocs: Record<string, FloorDoc>;
  layout: ReturnType<typeof resolveOwnedApartmentAuthoringLayoutForEditor>;
}): number {
  if (isMyApartmentCorridorAuthoringTarget(args.myApartmentAuthoringTarget)) {
    const footprint = resolveFloor19CorridorAuthoringFootprint(
      args.floorDocs[TYPICAL_FLOOR_DOC_ID],
    );
    return footprint != null ? footprint.ceilingInnerY - footprint.floorY : 3;
  }
  return args.layout?.shellPlan.vh ?? 3;
}
