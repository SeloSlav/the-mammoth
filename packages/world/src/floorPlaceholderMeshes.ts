import * as THREE from "three";
import type { FloorDoc } from "@the-mammoth/schemas";
import { withoutElevatorsInStairwells } from "./floorCoreSanitize.js";
import {
  mergeShaftExteriorHints,
  readShaftFacadeHintFaces,
  shaftPlanKey,
  shaftStackSy,
  STOREY_SPACING_M,
} from "./buildingStairShafts.js";
import {
  addElevatorShaftPlaceholder,
  addStairWellPlaceholder,
  elevatorGroundDoorOpeningLocals,
  resolveStairWellGroundDoor,
  resolveStairWellSupplementalDoors,
} from "./stairElevatorPlaceholders.js";
import {
  exteriorFacesForPlacedObjectInFloor,
  shaftFacesTowardAdjacentElevatorHoistways,
  shaftFacesTowardAdjacentStairwells,
} from "./exteriorFaceExposure.js";
import { type CardinalFace } from "./wallWithDoorCutout.js";
import {
  collectShaftSlabHoles,
  mergeElevatorShaftSlabHolesFromFloorDocs,
} from "./shaftPlanformClip.js";
import {
  GROUND_SLAB_MARGIN_XZ,
  GROUND_SLAB_THICKNESS_M,
  addConcreteSlabWithOptionalShaftHoles,
  addGroundFootprintGrassOccluder,
} from "./floorSlabPlaceholder.js";
import { floorPlaceholderMeshMaterials as mat } from "./floorPlaceholderMeshMaterials.js";
import {
  corridorFlushGapForShaftDoor,
  elevatorDoorFaceFromFloorCorridors,
  firstCorridorOrLobbyFromFloor,
  shaftDoorTowardPointFromFloorCorridors,
} from "./shaftCorridorFlush.js";
import {
  readElevatorDoorFaceOverride,
  type BuildFloorMeshesOptions,
} from "./elevatorDoorFacesFromGroundFloorDoc.js";
import { unitExteriorGlassMeshesEnabledForStoryLevel } from "@the-mammoth/schemas";
import {
  addUnitExteriorWindowGlassMeshes,
  corridorCapFacesForExteriorWindows,
  DEFAULT_EXTERIOR_FACADE_SALT,
  planCorridorCapExteriorWindow,
  planUnitExteriorWindowsForFace,
  unitShellFacesForExteriorWindows,
} from "./unitExteriorWindows.js";
import { stairwellLitterScatterSeed } from "./stairwellCigaretteLitter.js";
import type { PlateStairCorridorDoorPunch } from "./floorPlaceholderDoorPunchTypes.js";
import type { CorridorShellWallHoles } from "./floorPlaceholderMeshTypes.js";
import { classifyPrefab } from "./floorPlaceholderPrefabKind.js";
import { manualCorridorShellHoleExtrasForFloor } from "./manualApartmentDoorExtras.js";
/** Exported for unit tests / tooling; re-exported from prefab classifier. */
export { classifyPrefab } from "./floorPlaceholderPrefabKind.js";
export type { PlaceholderKind } from "./floorPlaceholderMeshTypes.js";
import { addHollowRoomShell } from "./hollowRoomShell.js";
import {
  residentialBalconyPartitionFace,
  residentialUnitHasBalconyBay,
} from "./residentialUnitBalcony.js";
import {
  addResidentialBalconyBayShell,
  residentialBalconyHollowShellExtras,
} from "./residentialUnitBalconyShell.js";
import {
  corridorShellHolesFromAdjacentUnitEntries,
  corridorShellHolesFromStairPunches,
  corridorShellWallHoleCount,
  elevatorCorridorSignPlacementsFromPunches,
  mergeCorridorShellWallHoles,
  mergeStairCorridorSignPlacements,
  stairCorridorSignPlacementsFromPunches,
  stairSignPlacementsFromCorridorWallHoleSpans,
  unitEntryWallHolesFromFloorAdjacency,
} from "./floorCorridorPlateSignage.js";
import { MAMMOTH_CORRIDOR_HALLWAY_SHELL_UD } from "./mammothMeshUserData.js";
import { expandBoxForPlacedObject } from "./floorPlaceholderExpandBounds.js";

/**
 * Turns each `FloorDoc` volume into a hollow shell (floor + ceiling + four walls).
 */
export function buildFloorMeshes(
  doc: FloorDoc,
  opts?: BuildFloorMeshesOptions,
): THREE.Group {
  const floor = withoutElevatorsInStairwells(doc);
  const root = new THREE.Group();
  root.name = `floor:${floor.id}`;
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  let hasBounds = false;
  for (const obj of floor.objects) {
    expandBoxForPlacedObject(min, max, obj);
    hasBounds = true;
  }
  const shaftHolesPlate =
    opts?.shaftHolesPlateMerged ?? collectShaftSlabHoles(floor);
  const shaftElevatorsMerged =
    opts?.shaftElevatorsMerged ??
    mergeElevatorShaftSlabHolesFromFloorDocs([floor]);
  let plateCx = 0;
  let plateCz = 0;
  let plateN = 0;
  for (const o of floor.objects) {
    plateCx += o.position[0];
    plateCz += o.position[2];
    plateN += 1;
  }
  if (plateN > 0) {
    plateCx /= plateN;
    plateCz /= plateN;
  }
  const story = opts?.storyLevelIndex ?? 99;
  const corridorFootprint = firstCorridorOrLobbyFromFloor(floor);
  const elevatorDoorPunchesPlate: PlateStairCorridorDoorPunch[] = [];
  for (const o of floor.objects) {
    if (!o.prefabId.toLowerCase().includes("elevator")) continue;
    const ex = o.scale?.[0] ?? 1;
    const ey = o.scale?.[1] ?? 1;
    const ez = o.scale?.[2] ?? 1;
    const skE = shaftPlanKey(o.position[0], o.position[2]);
    const overrideFace = readElevatorDoorFaceOverride(o);
    const elevFace =
      opts?.elevatorDoorFaceByShaftKey?.get(skE) ??
      overrideFace ??
      elevatorDoorFaceFromFloorCorridors(
        o.position[0],
        o.position[2],
        floor,
        plateCx,
        plateCz,
      );
    const loc = elevatorGroundDoorOpeningLocals(ex, ey, ez, elevFace, 0);
    elevatorDoorPunchesPlate.push({
      stairFace: loc.face,
      tangentLocal: loc.tangentOffsetAlongWall,
      doorHalfW: loc.doorHalfW,
      y0Local: loc.y0Local,
      y1Local: loc.y1Local,
      spx: o.position[0],
      spz: o.position[2],
      spy: o.position[1],
      shx: ex * 0.5,
      shz: ez * 0.5,
      isElevator: true,
    });
  }
  const stairDoorPunchesPlate: PlateStairCorridorDoorPunch[] = [];
  const stairAuthoringScope =
    story === 1 || story === 99 ? "ground" : "typical";
  for (const o of floor.objects) {
    if (
      !o.prefabId.toLowerCase().includes("stair_well") &&
      !o.prefabId.toLowerCase().includes("stairwell")
    ) {
      continue;
    }
    const sx = o.scale?.[0] ?? 1;
    const sy = o.scale?.[1] ?? 1;
    const sz = o.scale?.[2] ?? 1;
    const towardPlateXZ = shaftDoorTowardPointFromFloorCorridors(
      o.position[0],
      o.position[2],
      floor,
      plateCx,
      plateCz,
    );
    const resolved = resolveStairWellGroundDoor({
      sx,
      sy,
      sz,
      def: opts?.stairWellDef,
      authoringScope: stairAuthoringScope,
      context: {
        towardPlateXZ,
        shaftPlateXZ: [o.position[0], o.position[2]],
      },
    });
    if (!resolved) continue;
    const doors = [
      resolved,
      ...resolveStairWellSupplementalDoors({
        sx,
        sy,
        sz,
        def: opts?.stairWellDef,
        authoringScope: stairAuthoringScope,
        context: {
          towardPlateXZ,
          shaftPlateXZ: [o.position[0], o.position[2]],
        },
        primaryDoor: resolved,
      }),
    ];
    for (const door of doors) {
      stairDoorPunchesPlate.push({
        stairFace: door.groundDoor.face ?? "e",
        tangentLocal: door.groundDoor.tangentOffsetAlongWall ?? 0,
        doorHalfW: door.doorHalfW,
        y0Local: door.y0Local,
        y1Local: door.y1Local,
        spx: o.position[0],
        spz: o.position[2],
        spy: o.position[1],
        shx: sx * 0.5,
        shz: sz * 0.5,
      });
    }
  }
  const corridorShaftDoorPunchesPlate: readonly PlateStairCorridorDoorPunch[] =
    [...elevatorDoorPunchesPlate, ...stairDoorPunchesPlate];
  for (const obj of floor.objects) {
    const kind = classifyPrefab(obj.prefabId);
    const sx = obj.scale?.[0] ?? 1;
    const sy = obj.scale?.[1] ?? 1;
    const sz = obj.scale?.[2] ?? 1;
    const roomExteriorFaces = exteriorFacesForPlacedObjectInFloor(floor, obj);
    const room = new THREE.Group();
    room.name = obj.id;
    room.userData.placedObjectId = obj.id;
    room.userData.floorDocId = floor.id;
    room.position.set(obj.position[0], obj.position[1], obj.position[2]);
    if (obj.rotation)
      room.quaternion.set(
        obj.rotation[0],
        obj.rotation[1],
        obj.rotation[2],
        obj.rotation[3] ?? 1,
      );
    const pid = obj.prefabId.toLowerCase();
    if (pid.includes("elevator")) {
      const sk = shaftPlanKey(obj.position[0], obj.position[2]);
      const overrideFace = readElevatorDoorFaceOverride(obj);
      const doorFace =
        opts?.elevatorDoorFaceByShaftKey?.get(sk) ??
        overrideFace ??
        elevatorDoorFaceFromFloorCorridors(
          obj.position[0],
          obj.position[2],
          floor,
          plateCx,
          plateCz,
        );
      /** Pit slab only on ground plate; `99` = legacy default when no `storyLevelIndex` (single-plate). */
      const elevatorPitSlab = story === 1 || story === 99;
      const halfX = sx * 0.5;
      const halfZ = sz * 0.5;
      let elevFlush: number | undefined;
      if (corridorFootprint) {
        const g = corridorFlushGapForShaftDoor(
          doorFace,
          obj.position[0],
          obj.position[2],
          halfX,
          halfZ,
          corridorFootprint,
        );
        if (g > 1e-4) elevFlush = Math.min(0.35, g);
      }
      const elevSy = shaftStackSy(sy, STOREY_SPACING_M);
      const shaftExteriorFaces = [
        ...new Set<CardinalFace>([
          ...mergeShaftExteriorHints(
            roomExteriorFaces,
            readShaftFacadeHintFaces(obj.metadata),
          ),
          ...shaftFacesTowardAdjacentStairwells(floor, obj),
        ]),
      ];
      addElevatorShaftPlaceholder(room, sx, elevSy, sz, {
        groundDoor: { face: doorFace, bandHeightM: elevSy },
        includePitFloor: elevatorPitSlab,
        corridorFlushGapM: elevFlush,
        shaftExteriorFaces,
      });
    } else if (pid.includes("stair_well") || pid.includes("stairwell")) {
      const sk = shaftPlanKey(obj.position[0], obj.position[2]);
      if (!opts?.stairShaftSkipKeys?.has(sk)) {
        const stairDoorContext = {
          towardPlateXZ: shaftDoorTowardPointFromFloorCorridors(
            obj.position[0],
            obj.position[2],
            floor,
            plateCx,
            plateCz,
          ),
          shaftPlateXZ: [obj.position[0], obj.position[2]] as const,
        };
        const resolvedDoor = resolveStairWellGroundDoor({
          sx,
          sy,
          sz,
          context: stairDoorContext,
          def: opts?.stairWellDef,
          authoringScope: story === 1 || story === 99 ? "ground" : "typical",
        });
        const resolvedGroundDoor = resolvedDoor?.groundDoor;
        const supplementalDoors = resolveStairWellSupplementalDoors({
          sx,
          sy,
          sz,
          context: stairDoorContext,
          def: opts?.stairWellDef,
          authoringScope: story === 1 || story === 99 ? "ground" : "typical",
          primaryDoor: resolvedDoor,
        });
        const shaftExteriorFaceSet = new Set<CardinalFace>([
          ...mergeShaftExteriorHints(
            roomExteriorFaces,
            readShaftFacadeHintFaces(obj.metadata),
          ),
          ...shaftFacesTowardAdjacentElevatorHoistways(floor, obj),
        ]);
        /**
         * `exteriorFacesForPlacedObjectInFloor` can omit the ground-entry door cardinal when the
         * shaft sits inset from the plate edge (lobby / massing overlaps the door band). Without that
         * face in `shaftExteriorFaces`, `addShaftShell` skips `*_exterior` cladding on the door wall
         * — the outer world then sees `mats.wall` (stairwell interior concrete) instead of
         * `exteriorConcreteWallMaterial`. Always treat resolved ground (and supplemental) door
         * faces as façade on **ground / legacy single plate** storeys only.
         */
        if (story === 1 || story === 99) {
          const f = resolvedGroundDoor?.face;
          if (f) shaftExteriorFaceSet.add(f);
          for (const sup of supplementalDoors) {
            if (sup.face) shaftExteriorFaceSet.add(sup.face);
          }
        }
        const shaftExteriorFaces = [...shaftExteriorFaceSet];
        const typicalTop =
          story > 1 && story !== 99 && opts?.isTopOccupiedFloor === true;
        addStairWellPlaceholder(room, sx, sy, sz, {
          omitGroundStoreyCornerLandings: story === 1 || story === 99,
          def: opts?.stairWellDef,
          authoringScope: story === 1 || story === 99 ? "ground" : "typical",
          groundDoor: resolvedGroundDoor,
          supplementalDoors,
          shaftExteriorFaces,
          interiorWallUvAlternated: (story - 1) % 2 === 1,
          segmentScatterSeed: stairwellLitterScatterSeed(sk, story),
          stairGraphicsMergeRoot: room.parent ?? room,
          isTopOccupiedStairStorey: typicalTop,
          storyLevelIndex: story,
          storyShortLabel: opts?.storyShortLabel,
        });
      }
    } else {
      const skipShaftCutouts = Boolean(obj.rotation);
      const unitAdjacentCorridorHoles =
        kind === "corridor" && !skipShaftCutouts
          ? corridorShellHolesFromAdjacentUnitEntries(obj, sx, sy, sz, floor)
          : undefined;
      const corridorWallHoles = skipShaftCutouts
        ? undefined
        : mergeCorridorShellWallHoles(
            mergeCorridorShellWallHoles(
              mergeCorridorShellWallHoles(
                kind === "corridor"
                  ? corridorShellHolesFromStairPunches(
                      obj,
                      sx,
                      sy,
                      sz,
                      kind,
                      corridorShaftDoorPunchesPlate,
                    )
                  : undefined,
                unitAdjacentCorridorHoles,
              ),
              kind === "corridor"
                ? manualCorridorShellHoleExtrasForFloor(floor, obj, sx, sy, sz)
                : undefined,
            ),
            kind === "unit"
              ? unitEntryWallHolesFromFloorAdjacency(
                  obj,
                  sx,
                  sy,
                  sz,
                  kind,
                  floor,
                )
              : undefined,
          );
      const useAuthoringCorridorCeiling =
        kind === "corridor" &&
        !skipShaftCutouts &&
        (story === 1 ||
          story === 99 ||
          corridorShellWallHoleCount(unitAdjacentCorridorHoles) > 0);
      const elevatorSignPlacements =
        kind === "corridor" && !skipShaftCutouts
          ? elevatorCorridorSignPlacementsFromPunches(
              obj,
              sx,
              sy,
              sz,
              elevatorDoorPunchesPlate,
            )
          : [];
      const stairSignPlacements =
        kind === "corridor" && !skipShaftCutouts
          ? mergeStairCorridorSignPlacements(
              stairCorridorSignPlacementsFromPunches(
                obj,
                sx,
                sy,
                sz,
                stairDoorPunchesPlate,
              ),
              (() => {
                const manual = manualCorridorShellHoleExtrasForFloor(
                  floor,
                  obj,
                  sx,
                  sy,
                  sz,
                );
                return manual
                  ? stairSignPlacementsFromCorridorWallHoleSpans(manual, sy)
                  : [];
              })(),
            )
          : [];
      let exteriorWindowHoles: CorridorShellWallHoles | undefined;
      let tintByExteriorFace: Partial<Record<CardinalFace, number>> | undefined;
      let exteriorGlassFaces: CardinalFace[] = [];
      const balconyShell =
        kind === "unit" ? residentialBalconyHollowShellExtras(obj.id, sx) : null;
      const partitionFace =
        kind === "unit" ? residentialBalconyPartitionFace(obj.id) : null;
      if (
        (kind === "unit" || kind === "corridor") &&
        roomExteriorFaces.length > 0 &&
        !skipShaftCutouts
      ) {
        const windowFaces =
          kind === "unit"
            ? unitShellFacesForExteriorWindows(roomExteriorFaces, {
                floor,
                placedObject: obj,
              }).filter(
                (face) => face !== partitionFace,
              )
            : corridorCapFacesForExteriorWindows(roomExteriorFaces);
        if (windowFaces.length > 0) {
          const wt = 0.11;
          const vh = Math.max(sy - 2 * wt, 0.05);
          const vlenX = Math.max(sx - 2 * wt, 0.05);
          const vlenZ = Math.max(sz - 2 * wt, 0.05);
          const yLo = -vh * 0.5;
          const yHi = vh * 0.5;
          const salt = opts?.facadeSalt ?? DEFAULT_EXTERIOR_FACADE_SALT;
          const gathered: CorridorShellWallHoles = {
            e: [],
            w: [],
            n: [],
            s: [],
          };
          tintByExteriorFace = {};
          for (const face of windowFaces) {
            const plan =
              kind === "corridor" && (face === "n" || face === "s")
                ? planCorridorCapExteriorWindow({
                    face,
                    vlenX,
                    yLo,
                    yHi,
                    facadeSalt: salt,
                    storyLevelIndex: story,
                    floorDocId: floor.id,
                    placedObjectId: obj.id,
                  })
                : planUnitExteriorWindowsForFace({
                    face,
                    vlenX,
                    vlenZ,
                    yLo,
                    yHi,
                    facadeSalt: salt,
                    storyLevelIndex: story,
                    floorDocId: floor.id,
                    placedObjectId: obj.id,
                    wallSpanX: balconyShell?.wallSpanX,
                  });
            tintByExteriorFace[face] = plan.tintId;
            if (face === "e") {
              gathered.e.push(...plan.holesEw);
            } else if (face === "w") {
              gathered.w.push(...plan.holesEw);
            } else if (face === "n") {
              gathered.n.push(...plan.holesNs);
            } else if (face === "s") {
              gathered.s.push(...plan.holesNs);
            }
          }
          const anyHole =
            gathered.e.length +
              gathered.w.length +
              gathered.n.length +
              gathered.s.length >
            0;
          exteriorWindowHoles = anyHole ? gathered : undefined;
          if (!anyHole) {
            tintByExteriorFace = undefined;
          } else {
            exteriorGlassFaces = windowFaces;
          }
        }
      }
      addHollowRoomShell(room, sx, sy, sz, kind, {
        shaftHolesPlate: shaftHolesPlate,
        roomPx: obj.position[0],
        roomPz: obj.position[2],
        skipShaftCutouts,
        storyLevelIndex: opts?.storyLevelIndex,
        storyShortLabel: opts?.storyShortLabel,
        shaftElevatorsMerged,
        corridorWallHoles,
        elevatorSignPlacements,
        stairSignPlacements,
        exteriorFaces: roomExteriorFaces,
        exteriorWindowHoles,
        useAuthoringCorridorCeiling,
        ...(balconyShell ?? {}),
      });
      if (
        (kind === "unit" || kind === "corridor") &&
        exteriorWindowHoles &&
        tintByExteriorFace &&
        exteriorGlassFaces.length > 0 &&
        unitExteriorGlassMeshesEnabledForStoryLevel(story)
      ) {
        const hx = sx * 0.5;
        const hz = sz * 0.5;
        addUnitExteriorWindowGlassMeshes(room, {
          faces: exteriorGlassFaces,
          hx,
          hz,
          tintByFace: tintByExteriorFace,
          holesEw: { e: exteriorWindowHoles.e, w: exteriorWindowHoles.w },
          holesNs: { n: exteriorWindowHoles.n, s: exteriorWindowHoles.s },
        });
      }
      if (kind === "unit" && !skipShaftCutouts && residentialUnitHasBalconyBay(obj.id)) {
        addResidentialBalconyBayShell(room, sx, sy, sz, obj.id, {
          storyLevelIndex: story,
          floorDocId: floor.id,
          facadeSalt: opts?.facadeSalt ?? DEFAULT_EXTERIOR_FACADE_SALT,
          unitExteriorFaces: roomExteriorFaces,
        });
      }
      /**
       * `mergeGroupDescendantsByMaterial` (client `fpSessionWorldMount`) collapses each floor plate
       * into a few merged meshes. Hollow unit shells + shared plaster materials can produce bad merged
       * buffers / bounds so interior faces never draw — preserve the interior shell walls / floors /
       * ceilings. **Do merge** exterior cladding (concrete) and per-face glass windows: the glass
       * panels are simple `BoxGeometry` with shared alpha-blend materials (6 tints × N floors
       * otherwise drops ~1200 draws to ~120), and the merge is purely geometric so they combine cleanly.
       */
      if (kind === "unit") {
        const placedObjectId = obj.id;
        room.traverse((mesh) => {
          if (!(mesh instanceof THREE.Mesh)) return;
          if (mesh.name.startsWith("shell_exterior_cladding")) return;
          if (mesh.name.startsWith("unit_exterior_glass_")) {
            mesh.userData.mammothSkipFloorGeometryMerge = true;
            mesh.userData.mammothPlacedObjectId = placedObjectId;
            mesh.userData.mammothUnitInterior = true;
            mesh.userData.mammothResidentialUnitExteriorGlass = true;
            /** Thin N/S corner panels — keep drawable at auth orbit distance. */
            mesh.frustumCulled = false;
            return;
          }
          const isInteriorShell =
            mesh.name.startsWith("shell_wall_") ||
            mesh.name.startsWith("shell_floor") ||
            mesh.name.startsWith("shell_ceiling") ||
            mesh.name.startsWith("balcony_") ||
            mesh.name.startsWith("balcony_shell_");
          if (!isInteriorShell) return;
          mesh.userData.mammothSkipFloorGeometryMerge = true;
          mesh.userData.mammothPlacedObjectId = placedObjectId;
          /**
           * Tag interior hollow-shell pieces (walls, inter-unit floors, inter-unit ceilings) for
           * tooling / consistency (`mammothUnitInterior`). FP no longer toggles these off by footprint
           * (merged-building AABB + pose sources were too unreliable vs in-unit plaster).
           *
           * `shell_ceiling_*` on the **top floor** still doubles as the roof silhouette (no separate
           * roof slab; cladding covers walls only).
           */
          mesh.userData.mammothUnitInterior = true;
          /** Sphere vs frustum tests can drop hollow shells when the camera sits inside the volume. */
          mesh.frustumCulled = false;
        });
      } else if (kind === "corridor") {
        /**
         * Corridors sit behind units + exterior cladding (except their own `shell_exterior_cladding_*`
         * faces). Reuse the `mammothUnitInterior` tag with units — same FP near-footprint visibility
         * as hollow unit shells.
         * Corridor meshes do NOT get `mammothSkipFloorGeometryMerge`: unlike unit hollow shells,
         * corridor geometry merges cleanly, and keeping merge on is critical for draw-call count.
         */
        const placedObjectId = obj.id;
        room.traverse((mesh) => {
          if (!(mesh instanceof THREE.Mesh)) return;
          if (mesh.name.startsWith("shell_exterior_cladding")) return;
          if (mesh.name.startsWith("unit_exterior_glass_")) {
            mesh.userData.mammothSkipFloorGeometryMerge = true;
            mesh.userData.mammothPlacedObjectId = placedObjectId;
            /** N/S corridor end caps — same thin-panel culling issue as unit corner glass at auth orbit. */
            mesh.frustumCulled = false;
            return;
          }
          if (
            mesh.name.startsWith("shell_wall_") ||
            mesh.name.startsWith("shell_floor") ||
            mesh.name.startsWith("shell_ceiling")
          ) {
            mesh.userData.mammothUnitInterior = true;
            mesh.userData[MAMMOTH_CORRIDOR_HALLWAY_SHELL_UD] = true;
          }
        });
      }
    }
    root.add(room);
  }
  if (hasBounds) {
    addConcreteSlabWithOptionalShaftHoles(
      root,
      min,
      max,
      GROUND_SLAB_MARGIN_XZ,
      GROUND_SLAB_THICKNESS_M,
      shaftHolesPlate,
      mat.slab,
    );
    const plateWy = opts?.plateWorldOriginY ?? 0;
    if (story === 1 || story === 99) {
      addGroundFootprintGrassOccluder(
        root,
        min,
        max,
        plateWy,
        shaftHolesPlate,
        mat.groundFootprintOccluder,
      );
    }
  }
  return root;
}
