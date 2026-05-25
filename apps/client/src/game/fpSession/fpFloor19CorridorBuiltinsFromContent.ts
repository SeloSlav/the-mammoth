import {
  FloorDocSchema,
  OwnedApartmentBuiltinsDocSchema,
  type FloorDoc,
  type OwnedApartmentBuiltinsDoc,
} from "@the-mammoth/schemas";
import {
  FLOOR_19_GAMEPLAY_LEVEL_INDEX,
  resolveFloor19CorridorAuthoringFootprint,
  resolveFloor19CorridorDecorPoses,
  type CorridorAuthoringFootprint,
} from "@the-mammoth/world";

let corridorDocCached: OwnedApartmentBuiltinsDoc | null | undefined;
let typicalFloorCached: FloorDoc | null | undefined;

export async function loadFloor19CorridorBuiltinsDocFromContent(): Promise<OwnedApartmentBuiltinsDoc | null> {
  if (corridorDocCached !== undefined) return corridorDocCached;
  try {
    const res = await fetch("/content/apartment/floor_19_corridor_builtins.json", {
      cache: "no-store",
    });
    if (!res.ok) {
      corridorDocCached = null;
      return null;
    }
    corridorDocCached = OwnedApartmentBuiltinsDocSchema.parse(await res.json());
    return corridorDocCached;
  } catch {
    corridorDocCached = null;
    return null;
  }
}

async function loadTypicalFloorDocFromContent(): Promise<FloorDoc | null> {
  if (typicalFloorCached !== undefined) return typicalFloorCached;
  try {
    const res = await fetch("/content/building/floors/floor_mamutica_typical.json", {
      cache: "no-store",
    });
    if (!res.ok) {
      typicalFloorCached = null;
      return null;
    }
    typicalFloorCached = FloorDocSchema.parse(await res.json());
    return typicalFloorCached;
  } catch {
    typicalFloorCached = null;
    return null;
  }
}

export async function resolveFpFloor19CorridorAuthoringContext(): Promise<{
  doc: OwnedApartmentBuiltinsDoc | null;
  footprint: CorridorAuthoringFootprint | null;
}> {
  const [doc, floorDoc] = await Promise.all([
    loadFloor19CorridorBuiltinsDocFromContent(),
    loadTypicalFloorDocFromContent(),
  ]);
  return {
    doc,
    footprint: resolveFloor19CorridorAuthoringFootprint(floorDoc ?? undefined),
  };
}

export type FpFloor19CorridorDecorPlacement = {
  id: string;
  modelRelPath: string;
  position: readonly [number, number, number];
  yawRad: number;
  pitchRad: number;
  rollRad: number;
  uniformScale: number;
  verticalScaleMul: number;
  scaleX?: number;
  scaleY?: number;
  scaleZ?: number;
};

export function resolveFpFloor19CorridorDecorPlacements(args: {
  doc: OwnedApartmentBuiltinsDoc | null | undefined;
  footprint: CorridorAuthoringFootprint | null;
}): FpFloor19CorridorDecorPlacement[] {
  return resolveFloor19CorridorDecorPoses(args.doc, {
    footprint: args.footprint,
    levelIndex: FLOOR_19_GAMEPLAY_LEVEL_INDEX,
  }).map((pose) => ({
    id: pose.id,
    modelRelPath: pose.modelRelPath,
    position: [pose.x, pose.y, pose.z] as const,
    yawRad: pose.yaw,
    pitchRad: pose.pitch,
    rollRad: pose.roll,
    uniformScale: pose.uniformScale,
    verticalScaleMul: pose.verticalScaleMul,
    scaleX: pose.scaleX,
    scaleY: pose.scaleY,
    scaleZ: pose.scaleZ,
  }));
}
