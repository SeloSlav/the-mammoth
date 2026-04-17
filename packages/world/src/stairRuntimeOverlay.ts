import * as THREE from "three";
import type { BuildingDoc, FloorDoc, StairWellDef } from "@the-mammoth/schemas";
import type { CollisionAabb } from "./collisionScene.js";
import { collectCollisionAabbsFromObject3D } from "./collisionScene.js";
import { getBuildingStairShaftSpecs, STOREY_SPACING_M } from "./buildingStairShafts.js";
import {
  addStairWellPlaceholder,
  applyStairWellPartTransforms,
  resolveStairWellGroundDoor,
  resolveStairWellSupplementalDoors,
  type StairWellAuthoringScope,
  type StairWellEditorPartId,
} from "./stairElevatorPlaceholders.js";
import {
  computeSwitchbackStairLayout,
  type StairCornerLanding,
  type StairSwitchbackLayout,
  type StairTreadSpec,
} from "./stairWellGeometry.js";

type LandingPartId = Extract<StairWellEditorPartId, "stair_landing_lower" | "stair_landing_upper">;

export type RuntimeStairSupportSurface =
  | {
      kind: "flat";
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
      topY: number;
    }
  | {
      kind: "slope";
      axis: "x" | "z";
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
      alongMin: number;
      alongMax: number;
      yAtAlongMin: number;
      yAtAlongMax: number;
    };

export type StairRuntimeOverlay = {
  blockerSuppressMasks: readonly CollisionAabb[];
  blockerReplacementAabbs: readonly CollisionAabb[];
  walkSuppressMasks: readonly CollisionAabb[];
  supportSurfaces: readonly RuntimeStairSupportSurface[];
};

type SupportTransformState = {
  lowerFlight: THREE.Object3D;
  upperFlight: THREE.Object3D;
  landingByIndex: THREE.Object3D[];
};

const _identityQuat = new THREE.Quaternion();

function aabbOverlaps(a: CollisionAabb, b: CollisionAabb): boolean {
  return !(
    a.max[0] <= b.min[0] ||
    a.min[0] >= b.max[0] ||
    a.max[1] <= b.min[1] ||
    a.min[1] >= b.max[1] ||
    a.max[2] <= b.min[2] ||
    a.min[2] >= b.max[2]
  );
}

function lowerFlightLegBoundary(counts: readonly [number, number, number, number]): number {
  const total = counts[0] + counts[1] + counts[2] + counts[3];
  if (total <= 0) return 0;
  let bestBoundary = 1;
  let bestDelta = Infinity;
  let accum = 0;
  for (let i = 0; i < counts.length - 1; i++) {
    accum += counts[i] ?? 0;
    const remaining = total - accum;
    if (accum <= 0 || remaining <= 0) continue;
    const delta = Math.abs(accum - total * 0.5);
    if (delta < bestDelta - 1e-6) {
      bestDelta = delta;
      bestBoundary = i + 1;
    }
  }
  return bestBoundary;
}

function stairLandingPartIdForIndex(
  indexWithinLap: number,
  landingsPerLap: number,
): LandingPartId {
  if (landingsPerLap <= 1) return "stair_landing_lower";
  return indexWithinLap < Math.ceil(landingsPerLap * 0.5)
    ? "stair_landing_lower"
    : "stair_landing_upper";
}

function createSupportTransformObject(
  partId: StairWellEditorPartId,
  scope: StairWellAuthoringScope,
  position: readonly [number, number, number],
): THREE.Object3D {
  const obj = new THREE.Object3D();
  obj.userData.editorStairPartId = partId;
  obj.userData.editorStairAuthoringScope = scope;
  obj.userData.editorStairBasePosition = [...position];
  obj.userData.editorStairBaseScale = [1, 1, 1];
  obj.userData.editorStairBaseRotation = [0, 0, 0, 1];
  obj.position.set(position[0], position[1], position[2]);
  return obj;
}

function buildSupportTransformState(
  layout: StairSwitchbackLayout,
  def: StairWellDef | undefined,
  scope: StairWellAuthoringScope,
): SupportTransformState {
  const root = new THREE.Group();
  const lowerFlight = createSupportTransformObject("stair_flight_lower", scope, [0, 0, 0]);
  const upperFlight = createSupportTransformObject("stair_flight_upper", scope, [0, 0, 0]);
  root.add(lowerFlight);
  root.add(upperFlight);
  const landingsPerLap =
    layout.numLaps > 0 ? Math.max(1, Math.floor(layout.cornerLandings.length / layout.numLaps)) : 1;
  const landingByIndex: THREE.Object3D[] = [];
  for (const [landingIndex, cl] of layout.cornerLandings.entries()) {
    const landing = createSupportTransformObject(
      stairLandingPartIdForIndex(landingIndex % landingsPerLap, landingsPerLap),
      scope,
      [cl.x, cl.y, cl.z],
    );
    landingByIndex.push(landing);
    root.add(landing);
  }
  applyStairWellPartTransforms(root, def);
  return { lowerFlight, upperFlight, landingByIndex };
}

function treadAabb(tr: StairTreadSpec): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  const cos = Math.cos(tr.yaw);
  const sin = Math.sin(tr.yaw);
  const ha = tr.halfAlong;
  const hac = tr.halfAcross;
  const corners: [number, number][] = [
    [-ha, -hac],
    [ha, -hac],
    [ha, hac],
    [-ha, hac],
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [lx, lz] of corners) {
    const wx = tr.x + lx * cos - lz * sin;
    const wz = tr.z + lx * sin + lz * cos;
    minX = Math.min(minX, wx);
    maxX = Math.max(maxX, wx);
    minZ = Math.min(minZ, wz);
    maxZ = Math.max(maxZ, wz);
  }
  return { minX, maxX, minZ, maxZ };
}

function transformPointViaPart(
  part: THREE.Object3D,
  baseWorldX: number,
  baseWorldY: number,
  baseWorldZ: number,
  localX: number,
  localY: number,
  localZ: number,
): { x: number; y: number; z: number } {
  // Current stair authoring uses translation/scale deltas only. If rotation authoring ever becomes
  // non-identity here, we should promote support sampling to a rotated-surface evaluator.
  if (!part.quaternion.equals(_identityQuat)) {
    return {
      x: baseWorldX + part.position.x + localX * part.scale.x,
      y: baseWorldY + part.position.y + localY * part.scale.y,
      z: baseWorldZ + part.position.z + localZ * part.scale.z,
    };
  }
  return {
    x: baseWorldX + part.position.x + localX * part.scale.x,
    y: baseWorldY + part.position.y + localY * part.scale.y,
    z: baseWorldZ + part.position.z + localZ * part.scale.z,
  };
}

function buildFlightSlopeSurface(
  treads: readonly StairTreadSpec[],
  part: THREE.Object3D,
  baseWorldX: number,
  baseWorldY: number,
  baseWorldZ: number,
): RuntimeStairSupportSurface | null {
  if (treads.length === 0) return null;
  const first = treads[0]!;
  const last = treads[treads.length - 1]!;
  const axis = Math.abs(last.x - first.x) >= Math.abs(last.z - first.z) ? "x" : "z";
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const tread of treads) {
    const b = treadAabb(tread);
    minX = Math.min(minX, b.minX);
    maxX = Math.max(maxX, b.maxX);
    minZ = Math.min(minZ, b.minZ);
    maxZ = Math.max(maxZ, b.maxZ);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minZ)) return null;
  if (axis === "x") {
    const lowAlong = transformPointViaPart(
      part,
      baseWorldX,
      baseWorldY,
      baseWorldZ,
      minX,
      first.x <= last.x ? first.y + first.riseHalf : last.y + last.riseHalf,
      0,
    );
    const highAlong = transformPointViaPart(
      part,
      baseWorldX,
      baseWorldY,
      baseWorldZ,
      maxX,
      first.x <= last.x ? last.y + last.riseHalf : first.y + first.riseHalf,
      0,
    );
    const minPt = transformPointViaPart(part, baseWorldX, baseWorldY, baseWorldZ, minX, 0, minZ);
    const maxPt = transformPointViaPart(part, baseWorldX, baseWorldY, baseWorldZ, maxX, 0, maxZ);
    return {
      kind: "slope",
      axis,
      minX: Math.min(minPt.x, maxPt.x),
      maxX: Math.max(minPt.x, maxPt.x),
      minZ: Math.min(minPt.z, maxPt.z),
      maxZ: Math.max(minPt.z, maxPt.z),
      alongMin: Math.min(minPt.x, maxPt.x),
      alongMax: Math.max(minPt.x, maxPt.x),
      yAtAlongMin: lowAlong.y,
      yAtAlongMax: highAlong.y,
    };
  }
  const lowAlong = transformPointViaPart(
    part,
    baseWorldX,
    baseWorldY,
    baseWorldZ,
    0,
    first.z <= last.z ? first.y + first.riseHalf : last.y + last.riseHalf,
    minZ,
  );
  const highAlong = transformPointViaPart(
    part,
    baseWorldX,
    baseWorldY,
    baseWorldZ,
    0,
    first.z <= last.z ? last.y + last.riseHalf : first.y + first.riseHalf,
    maxZ,
  );
  const minPt = transformPointViaPart(part, baseWorldX, baseWorldY, baseWorldZ, minX, 0, minZ);
  const maxPt = transformPointViaPart(part, baseWorldX, baseWorldY, baseWorldZ, maxX, 0, maxZ);
  return {
    kind: "slope",
    axis,
    minX: Math.min(minPt.x, maxPt.x),
    maxX: Math.max(minPt.x, maxPt.x),
    minZ: Math.min(minPt.z, maxPt.z),
    maxZ: Math.max(minPt.z, maxPt.z),
    alongMin: Math.min(minPt.z, maxPt.z),
    alongMax: Math.max(minPt.z, maxPt.z),
    yAtAlongMin: lowAlong.y,
    yAtAlongMax: highAlong.y,
  };
}

function buildLandingFlatSurface(
  landing: StairCornerLanding,
  part: THREE.Object3D,
  baseWorldX: number,
  baseWorldY: number,
  baseWorldZ: number,
): RuntimeStairSupportSurface {
  const minPt = transformPointViaPart(
    part,
    baseWorldX,
    baseWorldY,
    baseWorldZ,
    -landing.halfW,
    landing.thicknessHalf,
    -landing.halfD,
  );
  const maxPt = transformPointViaPart(
    part,
    baseWorldX,
    baseWorldY,
    baseWorldZ,
    landing.halfW,
    landing.thicknessHalf,
    landing.halfD,
  );
  return {
    kind: "flat",
    minX: Math.min(minPt.x, maxPt.x),
    maxX: Math.max(minPt.x, maxPt.x),
    minZ: Math.min(minPt.z, maxPt.z),
    maxZ: Math.max(minPt.z, maxPt.z),
    topY: minPt.y,
  };
}

function buildRuntimeSupportSurfacesForSegment(args: {
  sx: number;
  sy: number;
  sz: number;
  baseWorldX: number;
  baseWorldY: number;
  baseWorldZ: number;
  def: StairWellDef | undefined;
  scope: StairWellAuthoringScope;
  omitGroundStoreyCornerLandings: boolean;
  omitTreads: boolean;
  omitTopLanding: boolean;
}): RuntimeStairSupportSurface[] {
  const layout = computeSwitchbackStairLayout(args.sx, args.sy, args.sz, {});
  const transformState = buildSupportTransformState(layout, args.def, args.scope);
  const boundary = lowerFlightLegBoundary(layout.legTreadCounts);
  const out: RuntimeStairSupportSurface[] = [];

  if (!args.omitTreads) {
    let treadIndex = 0;
    for (let lap = 0; lap < layout.numLaps; lap++) {
      for (let legIndex = 0; legIndex < layout.legTreadCounts.length; legIndex++) {
        const count = layout.legTreadCounts[legIndex] ?? 0;
        const legTreads = layout.treads.slice(treadIndex, treadIndex + count);
        treadIndex += count;
        const part = legIndex < boundary ? transformState.lowerFlight : transformState.upperFlight;
        const surface = buildFlightSlopeSurface(
          legTreads,
          part,
          args.baseWorldX,
          args.baseWorldY,
          args.baseWorldZ,
        );
        if (surface) out.push(surface);
      }
    }
  }

  let omitOnlyLanding: StairCornerLanding | undefined;
  if (args.omitGroundStoreyCornerLandings) {
    const groundLandingYMax =
      layout.wallCenterY - layout.innerWallH * 0.5 + STOREY_SPACING_M * 0.98;
    let bestDeck = Infinity;
    for (const landing of layout.cornerLandings.filter((cl) => cl.y < groundLandingYMax)) {
      const deckBottom = landing.y - landing.thicknessHalf;
      if (deckBottom < bestDeck - 1e-6) {
        bestDeck = deckBottom;
        omitOnlyLanding = landing;
      }
    }
  }
  if (args.omitTopLanding) {
    let highestDeck = -Infinity;
    for (const landing of layout.cornerLandings) {
      if (omitOnlyLanding && landing === omitOnlyLanding) continue;
      const deckTop = landing.y + landing.thicknessHalf;
      if (deckTop > highestDeck + 1e-6) {
        highestDeck = deckTop;
        omitOnlyLanding = landing;
      }
    }
  }

  for (const [index, landing] of layout.cornerLandings.entries()) {
    if (omitOnlyLanding && landing === omitOnlyLanding) continue;
    out.push(
      buildLandingFlatSurface(
        landing,
        transformState.landingByIndex[index]!,
        args.baseWorldX,
        args.baseWorldY,
        args.baseWorldZ,
      ),
    );
  }
  return out;
}

function buildSegmentMask(
  worldX: number,
  worldY: number,
  worldZ: number,
  sx: number,
  sy: number,
  sz: number,
): CollisionAabb {
  return {
    min: [worldX - sx * 0.5, worldY - sy * 0.5, worldZ - sz * 0.5],
    max: [worldX + sx * 0.5, worldY + sy * 0.5, worldZ + sz * 0.5],
  };
}

export function buildStairRuntimeOverlayForBuilding(
  building: BuildingDoc,
  getFloorDoc: (floorDocId: string) => FloorDoc,
  stairWellDef: StairWellDef | undefined,
  floorSpacingM: number,
): StairRuntimeOverlay {
  const blockerSuppressMasks: CollisionAabb[] = [];
  const walkSuppressMasks: CollisionAabb[] = [];
  const blockerReplacementAabbs: CollisionAabb[] = [];
  const supportSurfaces: RuntimeStairSupportSurface[] = [];
  const worldOrigin = building.worldOrigin ?? [0, 0, 0];
  const sorted = [...building.floorRefs].sort((a, b) => a.levelIndex - b.levelIndex);
  const stairShaftSpecs = getBuildingStairShaftSpecs(building, getFloorDoc, sorted, floorSpacingM);

  for (const spec of stairShaftSpecs) {
    for (let i = 0; i < spec.storeyCount; i++) {
      const isTopStorey = i === spec.storeyCount - 1;
      const scope: StairWellAuthoringScope = i === 0 ? "ground" : "typical";
      const worldX = worldOrigin[0] + spec.px;
      const worldY =
        worldOrigin[1] + spec.bottomY + STOREY_SPACING_M * 0.5 + i * spec.storeySpacing;
      const worldZ = worldOrigin[2] + spec.pz;
      const resolvedDoor = resolveStairWellGroundDoor({
        sx: spec.sx,
        sy: spec.syPlate,
        sz: spec.sz,
        context: spec.entryDoorContexts[i],
        def: stairWellDef,
        authoringScope: scope,
      });
      const supplementalDoors = resolveStairWellSupplementalDoors({
        sx: spec.sx,
        sy: spec.syPlate,
        sz: spec.sz,
        context: spec.entryDoorContexts[i],
        def: stairWellDef,
        authoringScope: scope,
        primaryDoor: resolvedDoor,
      });
      const segment = new THREE.Group();
      segment.position.set(worldX, worldY, worldZ);
      addStairWellPlaceholder(segment, spec.sx, spec.syPlate, spec.sz, {
        omitGroundStoreyCornerLandings: i === 0,
        def: stairWellDef,
        authoringScope: scope,
        groundDoor: resolvedDoor?.groundDoor,
        supplementalDoors,
        includeCeiling: isTopStorey,
        omitTreads: isTopStorey,
        omitTopLanding: isTopStorey,
      });
      blockerReplacementAabbs.push(...collectCollisionAabbsFromObject3D(segment));
      const mask = buildSegmentMask(worldX, worldY, worldZ, spec.sx, spec.syPlate, spec.sz);
      blockerSuppressMasks.push(mask);
      walkSuppressMasks.push(mask);
      supportSurfaces.push(
        ...buildRuntimeSupportSurfacesForSegment({
          sx: spec.sx,
          sy: spec.syPlate,
          sz: spec.sz,
          baseWorldX: worldX,
          baseWorldY: worldY,
          baseWorldZ: worldZ,
          def: stairWellDef,
          scope,
          omitGroundStoreyCornerLandings: i === 0,
          omitTreads: isTopStorey,
          omitTopLanding: isTopStorey,
        }),
      );
    }
  }

  return {
    blockerSuppressMasks,
    blockerReplacementAabbs,
    walkSuppressMasks,
    supportSurfaces,
  };
}

export function applyStairRuntimeBlockerOverlay(
  base: readonly CollisionAabb[],
  overlay: StairRuntimeOverlay,
): CollisionAabb[] {
  const kept = base.filter(
    (aabb) =>
      !overlay.blockerSuppressMasks.some((mask) => aabbOverlaps(aabb, mask)),
  );
  return [...kept, ...overlay.blockerReplacementAabbs];
}

export function applyStairRuntimeWalkSuppressMasks(
  base: readonly CollisionAabb[],
  overlay: StairRuntimeOverlay,
): CollisionAabb[] {
  return base.filter(
    (aabb) => !overlay.walkSuppressMasks.some((mask) => aabbOverlaps(aabb, mask)),
  );
}

export function sampleRuntimeStairSupportTopY(
  surfaces: readonly RuntimeStairSupportSurface[],
  x: number,
  z: number,
  probeTopY: number,
  opts?: { footRadiusXZ?: number; stepUpMargin?: number; probeDy?: number },
): number {
  const stepUpMargin = opts?.stepUpMargin ?? 0.82;
  const footR = opts?.footRadiusXZ ?? 0.22;
  const probeDy = opts?.probeDy ?? 1.05;
  const feetY = probeTopY - probeDy;
  const fx0 = x - footR;
  const fx1 = x + footR;
  const fz0 = z - footR;
  const fz1 = z + footR;
  let best = Number.NaN;
  for (const surface of surfaces) {
    if (
      fx1 < surface.minX ||
      fx0 > surface.maxX ||
      fz1 < surface.minZ ||
      fz0 > surface.maxZ
    ) {
      continue;
    }
    let top = Number.NaN;
    if (surface.kind === "flat") {
      top = surface.topY;
    } else if (surface.axis === "x") {
      const overlapMin = Math.max(fx0, surface.minX);
      const overlapMax = Math.min(fx1, surface.maxX);
      if (overlapMax >= overlapMin) {
        const span = Math.max(surface.alongMax - surface.alongMin, 1e-6);
        const y0 =
          surface.yAtAlongMin +
          ((overlapMin - surface.alongMin) / span) *
            (surface.yAtAlongMax - surface.yAtAlongMin);
        const y1 =
          surface.yAtAlongMin +
          ((overlapMax - surface.alongMin) / span) *
            (surface.yAtAlongMax - surface.yAtAlongMin);
        top = Math.max(y0, y1);
      }
    } else {
      const overlapMin = Math.max(fz0, surface.minZ);
      const overlapMax = Math.min(fz1, surface.maxZ);
      if (overlapMax >= overlapMin) {
        const span = Math.max(surface.alongMax - surface.alongMin, 1e-6);
        const y0 =
          surface.yAtAlongMin +
          ((overlapMin - surface.alongMin) / span) *
            (surface.yAtAlongMax - surface.yAtAlongMin);
        const y1 =
          surface.yAtAlongMin +
          ((overlapMax - surface.alongMin) / span) *
            (surface.yAtAlongMax - surface.yAtAlongMin);
        top = Math.max(y0, y1);
      }
    }
    if (!Number.isFinite(top)) continue;
    if (top <= feetY + stepUpMargin) {
      best = Number.isFinite(best) ? Math.max(best, top) : top;
    }
  }
  return best;
}
