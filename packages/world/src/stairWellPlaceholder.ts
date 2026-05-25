import * as THREE from "three";
import type { StairWellDef } from "@the-mammoth/schemas";
import {
  computeSwitchbackStairLayout,
  GROUND_STOREY_EXTRA_BOTTOM_TREADS,
  STOREY_SPACING_M,
  type SwitchbackStairOpts,
} from "./stairWellGeometry.js";
import { applyWorldMetricUvsToAxisAlignedBoxMesh, type CardinalFace } from "./wallWithDoorCutout.js";
import { exteriorConcreteWallMaterial } from "./floorPlaceholderMeshMaterials.js";
import { createStairTreadBoxGeometry } from "./stairTreadUv.js";
import { addShaftShell } from "./shaftShell.js";
import { shaftCeil } from "./shaftHoistwayMaterials.js";
import {
  SHAFT_DOUBLE_DOOR_H,
  SHAFT_DOUBLE_DOOR_W,
  type ShaftGroundDoorOpts,
} from "./stairElevatorShaftConstants.js";
import { createStairWellMaterials } from "./stairWellMaterials.js";
import {
  STAIR_WELL_OPENING_PROXY_ID,
  STAIR_WELL_SECONDARY_OPENING_PROXY_ID,
  type StairWellAuthoringScope,
  type StairWellEditorPartId,
  type StairWellOpeningProxyId,
} from "./stairWellEditorIds.js";
import {
  LEGACY_STAIR_CORNER_LANDING_PART_ID,
  recordStairWellBaseTransforms,
  setStairWellEditorPartId,
  setStairWellEditorPickId,
} from "./stairWellEditorUserData.js";
import {
  resolveStairWellGroundDoor,
  resolveStairWellSupplementalDoors,
  type ResolvedStairWellGroundDoor,
  type StairWellGroundDoorContext,
} from "./stairWellGroundDoorResolve.js";
import { attachStairWellLandingProps } from "./stairWellLandingProps.js";
import { attachStairWellCeilingProps } from "./stairWellCeilingProps.js";
import { attachStairwellCigaretteLitter } from "./stairwellCigaretteLitter.js";
import { tagShaftShellMeshesSkipFloorGeometryMerge } from "./elevatorShaftPlaceholder.js";

export type StairWellPreviewOpeningSpec = {
  proxyId: StairWellOpeningProxyId;
  opening: ResolvedStairWellGroundDoor;
};

export function stairWellHasFloorSlab(scope: StairWellAuthoringScope): boolean {
  return scope === "ground";
}

/**
 * World-metric shaft wall UVs use unbounded planar U (see {@link applyWorldMetricUvsToAxisAlignedBoxMesh}).
 * Negating U mirrors plaster along each interior wall so alternating storeys do not read as a single
 * repeating tile phase up the full-height column.
 */
function negateWorldMetricUvUForShaftInteriorWalls(root: THREE.Object3D, wallMat: THREE.Material): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (obj.material !== wallMat) return;
    const n = obj.name;
    if (!n.startsWith("shaft_wall_")) return;
    if (n.includes("_exterior")) return;
    if (n.includes("_frame")) return;
    const g = obj.geometry as THREE.BufferGeometry;
    const attr = g.getAttribute("uv") as THREE.BufferAttribute | undefined;
    if (!attr?.array) return;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < arr.length; i += 2) {
      arr[i] = -arr[i]!;
    }
    attr.needsUpdate = true;
  });
}

export type StairWellPlaceholderOpts = SwitchbackStairOpts & {
  /**
   * When true: skip exactly **one** interior corner pad — the lowest deck in the bottom storey
   * (building base / first plate). Other corner landings on that storey stay. Per-plate: story 1.
   * Mega: lowest pad among those with `y` in the bottom ~`STOREY_SPACING_M` of the shaft.
   */
  omitGroundStoreyCornerLandings?: boolean;
  /** Shared authored appearance / delta transforms applied to every stairwell. */
  def?: StairWellDef;
  /** Which authored stairwell bucket this instance belongs to. */
  authoringScope?: StairWellAuthoringScope;
  /** Explicit stair entry opening to cut into the shaft shell. */
  groundDoor?: ShaftGroundDoorOpts | null;
  /** Plan-space context used to derive a corridor-side entry opening when no explicit groundDoor is supplied. */
  previewGroundDoorContext?: StairWellGroundDoorContext;
  /** Additional non-primary corridor openings to cut into the shell. */
  supplementalDoors?: readonly ResolvedStairWellGroundDoor[];
  /** Editor-only wireframe gizmo target for the opening. */
  addOpeningEditProxy?: boolean;
  /** Cap this shaft segment with a ceiling slab. Used for the topmost storey only. */
  includeCeiling?: boolean;
  /** Skip generating stair treads while retaining the rest of the shaft shell/openings. */
  omitTreads?: boolean;
  /** Omit the highest landing in this segment. Used for the terminal top storey. */
  omitTopLanding?: boolean;
  /** Plate-space perimeter faces â€” PBR facade concrete on those shaft walls only (see `addShaftShell`). */
  shaftExteriorFaces?: readonly CardinalFace[];
  /**
   * When true: mirror world-metric **U** on inner `shaft_wall_*` meshes (not `_exterior`, not door
   * frame trim) so texture phase alternates vs the storey below. Matches
   * `(story - 1) % 2 === 1` / `(minLevelIndex + segmentIndex - 1) % 2 === 1` from callers.
   */
  interiorWallUvAlternated?: boolean;
  /** Seed for deterministic stairwell litter scatter (plan key XOR segment index at call sites). */
  segmentScatterSeed?: number;
  /**
   * Merge / visibility search root for stair litter (full-height stair column or floor plate).
   * When omitted, uses `group.parent ?? group`. FP callers should pass the stair column group.
   */
  stairGraphicsMergeRoot?: THREE.Object3D;
  /** When true, skip decorative stair litter (e.g. collision-only overlay segments with no parent). */
  omitStairwellCigaretteLitter?: boolean;
  /**
   * The segment that contains the top **inhabited** exit deck (mesh for the flight below the roof
   * cap). Enables roof-landing props opposite the authored `entryOpening`.
   */
  isTopOccupiedStairStorey?: boolean;
};

export function tagGeneratedStairWellShellParts(
  root: THREE.Object3D,
  scope: StairWellAuthoringScope,
  openings: readonly StairWellPreviewOpeningSpec[],
): void {
  root.traverse((obj) => {
    if (obj.name === "shaft_floor") {
      setStairWellEditorPartId(obj, "shaft_floor", scope);
    } else if (obj.name === "shaft_wall") {
      setStairWellEditorPartId(obj, "shaft_wall", scope);
      setStairWellEditorPickId(obj, "shaft_wall");
    } else if (obj.name !== "shaft_wall") {
      for (const opening of openings) {
        const openingFacePrefix = `shaft_wall_${opening.opening.face}`;
        if (obj.name.startsWith(openingFacePrefix)) {
          obj.userData.editorStairPickId = opening.proxyId;
          break;
        }
      }
    }
  });
}

export function groupGeneratedStairWellWallParts(root: THREE.Group): void {
  const wallChildren = root.children.filter((child) => child.name.startsWith("shaft_wall_"));
  if (wallChildren.length === 0) return;
  const wallGroup = new THREE.Group();
  wallGroup.name = "shaft_wall";
  for (const child of wallChildren) {
    root.remove(child);
    wallGroup.add(child);
  }
  root.add(wallGroup);
}

function stairWellPartTransformsForScope(
  def: StairWellDef | undefined,
  scope: StairWellAuthoringScope,
): StairWellDef["partTransforms"] {
  return scope === "ground" ? def?.groundPartTransforms : def?.partTransforms;
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
): Extract<StairWellEditorPartId, "stair_landing_lower" | "stair_landing_upper"> {
  if (landingsPerLap <= 1) return "stair_landing_lower";
  return indexWithinLap < Math.ceil(landingsPerLap * 0.5)
    ? "stair_landing_lower"
    : "stair_landing_upper";
}

function stairWellPartTransformEntry(
  partTransforms: StairWellDef["partTransforms"],
  partId: string,
) {
  const direct = partTransforms?.[partId];
  if (direct) return direct;
  if (partId === "stair_landing_lower" || partId === "stair_landing_upper") {
    return partTransforms?.[LEGACY_STAIR_CORNER_LANDING_PART_ID];
  }
  return undefined;
}

export function applyStairWellPartTransforms(
  root: THREE.Object3D,
  def: StairWellDef | undefined,
): void {
  const _baseQ = new THREE.Quaternion();
  const _deltaQ = new THREE.Quaternion();
  root.traverse((obj) => {
    const partId = obj.userData.editorStairPartId as string | undefined;
    if (!partId) return;
    const scope =
      (obj.userData.editorStairAuthoringScope as StairWellAuthoringScope | undefined) ??
      "typical";
    const partTransforms = stairWellPartTransformsForScope(def, scope);
    const basePos = obj.userData.editorStairBasePosition as readonly number[] | undefined;
    const baseScale = obj.userData.editorStairBaseScale as readonly number[] | undefined;
    const baseRot = obj.userData.editorStairBaseRotation as readonly number[] | undefined;
    if (!basePos || !baseScale || !baseRot) return;

    obj.position.set(basePos[0] ?? 0, basePos[1] ?? 0, basePos[2] ?? 0);
    obj.scale.set(baseScale[0] ?? 1, baseScale[1] ?? 1, baseScale[2] ?? 1);
    obj.quaternion.set(baseRot[0] ?? 0, baseRot[1] ?? 0, baseRot[2] ?? 0, baseRot[3] ?? 1);

    const tweak = stairWellPartTransformEntry(partTransforms, partId);
    if (!tweak) return;

    if (tweak.position) {
      obj.position.x += tweak.position[0];
      obj.position.y += tweak.position[1];
      obj.position.z += tweak.position[2];
    }
    if (tweak.scale) {
      obj.scale.x *= tweak.scale[0];
      obj.scale.y *= tweak.scale[1];
      obj.scale.z *= tweak.scale[2];
    }
    if (tweak.rotation) {
      _baseQ.set(baseRot[0] ?? 0, baseRot[1] ?? 0, baseRot[2] ?? 0, baseRot[3] ?? 1);
      _deltaQ.set(
        tweak.rotation[0],
        tweak.rotation[1],
        tweak.rotation[2],
        tweak.rotation[3] ?? 1,
      );
      obj.quaternion.copy(_baseQ).multiply(_deltaQ);
    }
  });
}

export function addStairWellPlaceholder(
  group: THREE.Group,
  sx: number,
  sy: number,
  sz: number,
  opts?: StairWellPlaceholderOpts,
): void {
  const { omitGroundStoreyCornerLandings, def: _def, ...layoutOpts } = opts ?? {};
  const authoringScope = opts?.authoringScope ?? "typical";
  const L = computeSwitchbackStairLayout(sx, sy, sz, {
    ...layoutOpts,
    extraBottomTreads:
      opts?.extraBottomTreads ??
      (authoringScope === "ground" ? GROUND_STOREY_EXTRA_BOTTOM_TREADS : 0),
  });
  const mats = createStairWellMaterials(opts?.def);
  const resolvedGroundDoor =
    opts?.groundDoor != null
      ? (() => {
          const widthM = opts.groundDoor?.doorWidthM ?? SHAFT_DOUBLE_DOOR_W;
          const y0Local = opts.groundDoor?.doorHoleY0Local ?? (-sy * 0.5 + 0.11);
          const y1Local =
            opts.groundDoor?.doorHoleY1Local ?? (y0Local + Math.min(SHAFT_DOUBLE_DOOR_H, sy - 0.4));
          return {
            groundDoor: opts.groundDoor,
            doorHalfW: widthM * 0.5,
            y0Local,
            y1Local,
            face: opts.groundDoor?.face ?? "e",
            tangentOffsetAlongWallM: opts.groundDoor?.tangentOffsetAlongWall ?? 0,
            widthM,
            heightM: y1Local - y0Local,
            centerYM: (y0Local + y1Local) * 0.5,
          } satisfies ResolvedStairWellGroundDoor;
        })()
      : resolveStairWellGroundDoor({
          layout: L,
          sx,
          sy,
          sz,
          context: opts?.previewGroundDoorContext,
          def: opts?.def,
          authoringScope,
        });
  const stairGroundDoor = resolvedGroundDoor?.groundDoor ?? null;
  const supplementalDoors =
    opts?.supplementalDoors ??
    resolveStairWellSupplementalDoors({
      layout: L,
      sx,
      sy,
      sz,
      context: opts?.previewGroundDoorContext,
      def: opts?.def,
      authoringScope,
      primaryDoor: resolvedGroundDoor,
    });
  if (stairGroundDoor) {
    group.userData.editorStairPreviewGroundDoor = {
      face: stairGroundDoor.face,
      tangentOffsetAlongWall: stairGroundDoor.tangentOffsetAlongWall,
    };
  } else {
    delete group.userData.editorStairPreviewGroundDoor;
  }
  const stairFlights = new THREE.Group();
  stairFlights.name = "stair_flights";
  setStairWellEditorPartId(stairFlights, "stair_flights", authoringScope);
  setStairWellEditorPickId(stairFlights, "stair_flights");
  group.add(stairFlights);

  const lowerFlight = new THREE.Group();
  lowerFlight.name = "stair_flight_lower";
  setStairWellEditorPartId(lowerFlight, "stair_flight_lower", authoringScope);
  setStairWellEditorPickId(lowerFlight, "stair_flight_lower");
  stairFlights.add(lowerFlight);

  const upperFlight = new THREE.Group();
  upperFlight.name = "stair_flight_upper";
  setStairWellEditorPartId(upperFlight, "stair_flight_upper", authoringScope);
  setStairWellEditorPickId(upperFlight, "stair_flight_upper");
  stairFlights.add(upperFlight);

  addShaftShell(group, sx, sy, sz, mats.wall, shaftCeil, {
    includeFloor: stairWellHasFloorSlab(authoringScope),
    includeCeiling: opts?.includeCeiling === true,
    floorMat: mats.floor,
    groundDoor: stairGroundDoor,
    supplementalDoors: supplementalDoors.map((door) => door.groundDoor),
    exteriorShaftFaces: opts?.shaftExteriorFaces,
    exteriorWallMat: exteriorConcreteWallMaterial,
  });
  groupGeneratedStairWellWallParts(group);
  if (opts?.interiorWallUvAlternated === true) {
    negateWorldMetricUvUForShaftInteriorWalls(group, mats.wall);
  }
  tagGeneratedStairWellShellParts(group, authoringScope, [
    ...(resolvedGroundDoor
      ? [{ proxyId: STAIR_WELL_OPENING_PROXY_ID, opening: resolvedGroundDoor }]
      : []),
    ...supplementalDoors.map((opening) => ({
      proxyId: STAIR_WELL_SECONDARY_OPENING_PROXY_ID,
      opening,
    })),
  ]);

  const boundary = lowerFlightLegBoundary(L.legTreadCounts);

  let ti = 0;
  for (let lap = 0; lap < L.numLaps; lap++) {
    for (let legIndex = 0; legIndex < L.legTreadCounts.length; legIndex++) {
      const target = legIndex < boundary ? lowerFlight : upperFlight;
      const count = L.legTreadCounts[legIndex] ?? 0;
      for (let local = 0; local < count; local++) {
        const tr = L.treads[ti];
        if (!tr) break;
        if (opts?.omitTreads !== true) {
          /** Single material on full box so Patina / PBR wraps every face (riser, bottom, sides).
           * Multi-material arrays were avoided â€” they broke WebGPU draws in the editor.
           * Metric UVs ({@link createStairTreadBoxGeometry}) avoid default cube UV stretch on wide tops. */
          const mesh = new THREE.Mesh(
            createStairTreadBoxGeometry(tr.halfAlong, tr.riseHalf, tr.halfAcross),
            mats.tread,
          );
          mesh.name = `stair_tread_${ti}`;
          mesh.position.set(tr.x, tr.y, tr.z);
          mesh.rotation.y = tr.yaw;
          target.add(mesh);
        }
        ti += 1;
      }
    }
  }

  const climbFull = opts?.climbFullShaft ?? false;
  const omitGroundPads = omitGroundStoreyCornerLandings === true;
  const yShaftInnerBot = L.wallCenterY - L.innerWallH * 0.5;
  const groundLandingYMax = yShaftInnerBot + STOREY_SPACING_M * 0.98;

  let omitOnlyLanding: (typeof L.cornerLandings)[number] | undefined;
  if (omitGroundPads) {
    const candidates = climbFull
      ? L.cornerLandings.filter((cl) => cl.y < groundLandingYMax)
      : L.cornerLandings;
    let bestDeck = Infinity;
    for (const cl of candidates) {
      const deckBot = cl.y - cl.thicknessHalf;
      if (deckBot < bestDeck - 1e-6) {
        bestDeck = deckBot;
        omitOnlyLanding = cl;
      }
    }
  }
  if (opts?.omitTopLanding === true) {
    let highestDeck = -Infinity;
    for (const cl of L.cornerLandings) {
      if (omitOnlyLanding !== undefined && cl === omitOnlyLanding) continue;
      const deckTop = cl.y + cl.thicknessHalf;
      if (deckTop > highestDeck + 1e-6) {
        highestDeck = deckTop;
        omitOnlyLanding = cl;
      }
    }
  }

  const landingsPerLap =
    L.numLaps > 0 ? Math.max(1, Math.floor(L.cornerLandings.length / L.numLaps)) : 1;
  let li = 0;
  for (const [landingIndex, cl] of L.cornerLandings.entries()) {
    if (omitOnlyLanding !== undefined && cl === omitOnlyLanding) continue;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(
        cl.halfW * 2,
        cl.thicknessHalf * 2,
        cl.halfD * 2,
      ),
      mats.landing,
    );
    mesh.name = `stair_corner_landing_${li}`;
    setStairWellEditorPartId(
      mesh,
      stairLandingPartIdForIndex(landingIndex % landingsPerLap, landingsPerLap),
      authoringScope,
    );
    li += 1;
    mesh.position.set(cl.x, cl.y, cl.z);
    /** Same world-metric tile scale as shaft walls and typical-storey landings (default m/tile). */
    applyWorldMetricUvsToAxisAlignedBoxMesh(mesh);
    mesh.userData.mammothAxisAlignedCollisionBox = true;
    /** Stable ref for {@link attachStairWellLandingProps} (same object as layout `cornerLandings`). */
    mesh.userData.mammothStairCornerLandingRef = cl;
    group.add(mesh);
  }

  recordStairWellBaseTransforms(group);
  applyStairWellPartTransforms(group, opts?.def);
  attachStairWellLandingProps({
    root: group,
    def: opts?.def,
    authoringScope,
    L,
    primaryDoor: resolvedGroundDoor ?? undefined,
    omitOnlyLanding,
    isTopOccupiedStairStorey: opts?.isTopOccupiedStairStorey,
    skipTypicalLandingProps:
      opts?.omitTopLanding === true && authoringScope === "typical",
  });
  attachStairWellCeilingProps({
    root: group,
    def: opts?.def,
    authoringScope,
    sy,
  });
  if (opts?.omitStairwellCigaretteLitter !== true) {
    const litterSearchRoot = opts?.stairGraphicsMergeRoot ?? group.parent ?? group;
    attachStairwellCigaretteLitter({
      root: group,
      litterSearchRoot,
      L,
      omitOnlyLanding,
      omitTreads: opts?.omitTreads === true,
      scatterSeed: opts?.segmentScatterSeed ?? 0,
    });
  }
  /**
   * Same merge skip as {@link addElevatorShaftPlaceholder}: without this, stair-shaft
   * `shaft_wall_*` / `*_exterior*` geometry shares `exteriorConcreteWallMaterial` with merged
   * faÃ§ade slabs and gets collapsed into one mesh (see {@link tagShaftShellMeshesSkipFloorGeometryMerge}).
   */
  tagShaftShellMeshesSkipFloorGeometryMerge(group);
}
