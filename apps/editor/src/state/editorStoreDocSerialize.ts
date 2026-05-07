import {
  BuildingDocSchema,
  CellDocSchema,
  ElevatorCabDefSchema,
  FloorDocSchema,
  FloorOverrideDocSchema,
  InteriorDocSchema,
  LandingKitDefSchema,
  OwnedApartmentBuiltinsDocSchema,
  PrefabDefSchema,
  StairWellDefSchema,
  type BuildingDoc,
  type CellDoc,
  type ElevatorCabDef,
  type FloorDoc,
  type FloorOverrideDoc,
  type InteriorDoc,
  type LandingKitDef,
  type OwnedApartmentBuiltinsDoc,
  type PrefabDef,
  type StairWellDef,
} from "@the-mammoth/schemas";

export function serializeFloorDocPretty(doc: FloorDoc): string {
  return `${JSON.stringify(FloorDocSchema.parse(doc), null, 2)}\n`;
}

export function serializeInteriorDocPretty(doc: InteriorDoc): string {
  return `${JSON.stringify(InteriorDocSchema.parse(doc), null, 2)}\n`;
}

export function serializeCellDocPretty(doc: CellDoc): string {
  return `${JSON.stringify(CellDocSchema.parse(doc), null, 2)}\n`;
}

export function serializePrefabDefPretty(doc: PrefabDef): string {
  return `${JSON.stringify(PrefabDefSchema.parse(doc), null, 2)}\n`;
}

export function serializeFloorOverrideDocPretty(doc: FloorOverrideDoc): string {
  return `${JSON.stringify(FloorOverrideDocSchema.parse(doc), null, 2)}\n`;
}

export function serializeBuildingDocPretty(doc: BuildingDoc): string {
  return `${JSON.stringify(BuildingDocSchema.parse(doc), null, 2)}\n`;
}

export function serializeElevatorCabDefPretty(doc: ElevatorCabDef): string {
  return `${JSON.stringify(ElevatorCabDefSchema.parse(doc), null, 2)}\n`;
}

export function serializeLandingKitDefPretty(doc: LandingKitDef): string {
  return `${JSON.stringify(LandingKitDefSchema.parse(doc), null, 2)}\n`;
}

export function serializeStairWellDefPretty(doc: StairWellDef): string {
  return `${JSON.stringify(StairWellDefSchema.parse(doc), null, 2)}\n`;
}

export function serializeOwnedApartmentBuiltinsDocPretty(
  doc: OwnedApartmentBuiltinsDoc,
): string {
  return `${JSON.stringify(OwnedApartmentBuiltinsDocSchema.parse(doc), null, 2)}\n`;
}
