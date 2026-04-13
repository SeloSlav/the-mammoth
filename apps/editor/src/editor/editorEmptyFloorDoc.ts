import { FloorDocSchema } from "@the-mammoth/schemas";

export function emptyFloorDoc(floorDocId: string) {
  return FloorDocSchema.parse({ id: floorDocId, version: 1, objects: [] });
}
