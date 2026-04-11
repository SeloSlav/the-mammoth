import {
  CellDocSchema,
  FloorDocSchema,
  InteriorDocSchema,
} from "@the-mammoth/schemas";

export function assertFloorDoc(raw: unknown): void {
  FloorDocSchema.parse(raw);
}

export function assertCellDoc(raw: unknown): void {
  CellDocSchema.parse(raw);
}

export function assertInteriorDoc(raw: unknown): void {
  InteriorDocSchema.parse(raw);
}
