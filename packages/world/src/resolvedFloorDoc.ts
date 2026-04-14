import {
  FloorDocSchema,
  FloorOverrideDocSchema,
  type BuildingDoc,
  type BuildingFloorRef,
  type FloorDoc,
  type FloorOverrideDoc,
  type PlacedObject,
} from "@the-mammoth/schemas";

export type GetFloorOverrideDoc = (floorOverrideDocId: string) => FloorOverrideDoc | undefined;

export function defaultFloorOverrideDocId(buildingId: string, levelIndex: number): string {
  return `${buildingId}__L${String(levelIndex).padStart(2, "0")}`;
}

export function resolveFloorOverrideDocId(
  building: BuildingDoc,
  ref: BuildingFloorRef,
): string {
  return ref.floorOverrideDocId ?? defaultFloorOverrideDocId(building.id, ref.levelIndex);
}

export function applyFloorOverrideDoc(
  base: FloorDoc,
  overrideDoc: FloorOverrideDoc | undefined,
): FloorDoc {
  const parsedBase = FloorDocSchema.parse(base);
  if (!overrideDoc) return parsedBase;
  const parsedOverride = FloorOverrideDocSchema.parse(overrideDoc);
  const removed = new Set(parsedOverride.removedObjectIds);
  const patchById = new Map(parsedOverride.objectPatches.map((row) => [row.targetObjectId, row.patch]));
  const objects: PlacedObject[] = parsedBase.objects
    .filter((obj) => !removed.has(obj.id))
    .map((obj) => {
      const patch = patchById.get(obj.id);
      return patch ? { ...obj, ...patch } : obj;
    });
  objects.push(...parsedOverride.addedObjects);
  return FloorDocSchema.parse({
    ...parsedBase,
    displayName: parsedOverride.displayName ?? parsedBase.displayName,
    metadata:
      parsedOverride.metadata == null
        ? parsedBase.metadata
        : { ...(parsedBase.metadata ?? {}), ...parsedOverride.metadata },
    objects,
  });
}

export function resolveFloorDocForLevel(args: {
  building: BuildingDoc;
  ref: BuildingFloorRef;
  getFloorDoc: (floorDocId: string) => FloorDoc;
  getFloorOverrideDoc?: GetFloorOverrideDoc;
}): FloorDoc {
  const base = args.getFloorDoc(args.ref.floorDocId);
  const overrideDoc = args.getFloorOverrideDoc?.(
    resolveFloorOverrideDocId(args.building, args.ref),
  );
  return applyFloorOverrideDoc(base, overrideDoc);
}
