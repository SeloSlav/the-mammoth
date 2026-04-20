import {
  BuildingDocSchema,
  FloorDocSchema,
  StairWellDefSchema,
  type BuildingDoc,
  type FloorDoc,
  type StairWellDef,
} from "@the-mammoth/schemas";

export function parseFloorDoc(raw: unknown): FloorDoc {
  return FloorDocSchema.parse(raw);
}

export function parseBuildingDoc(raw: unknown): BuildingDoc {
  return BuildingDocSchema.parse(raw);
}

export function parseStairWellDef(raw: unknown): StairWellDef {
  return StairWellDefSchema.parse(raw);
}
