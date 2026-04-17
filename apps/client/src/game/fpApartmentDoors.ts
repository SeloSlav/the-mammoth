/**
 * Client-side apartment door world.
 *
 * Replicated `apartment_door` rows drive one hinged swing-door visual per (floor, unit, face).
 * The mesh, collision math, and interaction rules are all shared with the elevator landing
 * exterior door via `@the-mammoth/world/swingDoorMesh` + `swingDoorCollision`. The visual
 * appearance differs only because the apartment kit authors `solid: true` (opaque leaf) and
 * different panel dimensions, both of which the shared primitive handles.
 *
 * Responsibilities (mirrors the elevator-door half of `fpElevatorWorld`):
 *
 * - Subscribe to the `apartment_door` table (blanket — the set is static, ~608 rows total).
 * - Build/teardown Three.js meshes per door row, parented per-level under `buildingRoot` so the
 *   existing floor-plate visibility band naturally culls doors on far-away floors.
 * - Smooth the replicated `swingOpen01` onto the mesh with the same short visual interpolation
 *   used by the landing door.
 * - Emit the closed-slab + parked-leaf AABBs for the client prediction pipeline, matching the
 *   server's `collect_apartment_door_collision_aabbs`.
 * - Resolve a player-proximity interact target for the `E` key chain and dispatch the
 *   `apartment_door_toggle` reducer.
 */
import * as THREE from "three";
import type { BuildingDoc, LandingKitDef } from "@the-mammoth/schemas";
import { LandingKitDefSchema } from "@the-mammoth/schemas";
import {
  type CollisionAabb,
  FACE_FROM_CODE,
  populateSwingDoorLeaf,
  SWING_DOOR_DEFAULT_MAX_RAD,
  type SwingDoorFace,
  swingDoorClosedSlabAabb,
  swingDoorClosedSlabActive,
  swingDoorOrientationForFace,
  swingDoorParkedLeafAabb,
  swingDoorParkedLeafActive,
  swingDoorPlayerInInteractRange,
  createSwingDoorMaterials,
} from "@the-mammoth/world";
import apartmentKitAuthoringJson from "../../../../content/door/apartment_unit_kit.json";
import type { DbConnection, SubscriptionHandle } from "../module_bindings";
import type { ApartmentDoor } from "../module_bindings/types";
import { EXTERIOR_DOOR_VIS_INTERP_SEC } from "./fpElevatorConstants.js";
import { FpElevatorCabInterpScalar } from "./fpElevatorShaftVisual.js";
import type { DynamicCollisionQueryPose } from "./fpPlayerCollision.js";

function parseApartmentKit(): LandingKitDef | undefined {
  const parsed = LandingKitDefSchema.safeParse(apartmentKitAuthoringJson);
  return parsed.success ? parsed.data : undefined;
}

const APARTMENT_KIT = parseApartmentKit();
const APARTMENT_DOOR_MAX_RAD =
  APARTMENT_KIT?.exteriorSwingMaxRad ?? SWING_DOOR_DEFAULT_MAX_RAD;

/** Small outward offset so the rendered leaf hinge sits just inside the corridor, matching the
 * sound emitter position on the server (`sound_xyz_for_row` uses the same +0.06 m outward step). */
const APARTMENT_DOOR_HINGE_OUTWARD_PICK_OFFSET_M = 0.0;

export type MountFpApartmentDoorsOpts = {
  conn: DbConnection;
  buildingRoot: THREE.Group;
  building: BuildingDoc;
};

export type MountFpApartmentDoorsResult = {
  dispose(): void;
  /** Per-frame: advance visual interpolation and apply swing rotations. */
  tick(nowMs: number): void;
  /** Player prediction: emit live door colliders for the query window. */
  visitCollisionAabbsInXZ(
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    visit: (aabb: CollisionAabb) => void,
    queryPose?: DynamicCollisionQueryPose,
  ): void;
  /**
   * Try to open/close the nearest eligible door. Returns true when a reducer was dispatched and
   * the `E` key chain should short-circuit (pickup etc. is suppressed).
   */
  consumeInteractKey(playerPos: THREE.Vector3): boolean;
  /** True when an apartment door is in range, so the generic pickup prompt/action is suppressed. */
  shouldSuppressEpickup(playerPos: THREE.Vector3): boolean;
  /** Drive the bottom interact prompt when the player is next to an apartment door. */
  getInteractPrompt(playerPos: THREE.Vector3): { willClose: boolean } | null;
};

type DoorVisual = {
  row: ApartmentDoor;
  face: SwingDoorFace;
  structure: THREE.Group;
  swing: THREE.Group;
  swingSign: 1 | -1;
  interp: FpElevatorCabInterpScalar;
};

export function mountFpApartmentDoors(
  opts: MountFpApartmentDoorsOpts,
): MountFpApartmentDoorsResult {
  const ox = opts.building.worldOrigin?.[0] ?? 0;
  const oy = opts.building.worldOrigin?.[1] ?? 0;
  const oz = opts.building.worldOrigin?.[2] ?? 0;

  // Shared materials across all apartment doors — one frame material + one (unused when solid)
  // glass material. Reusing these keeps draw-call count proportional to mesh count, not door count.
  const { frameMat, glassMat } = createSwingDoorMaterials(APARTMENT_KIT);

  const rootGroup = new THREE.Group();
  rootGroup.name = "apartment_doors";
  opts.buildingRoot.add(rootGroup);

  // Per-level group tagged with `mammothPlateLevelIndex` so the existing floor-plate visibility
  // band hides apartment doors on far-away storeys.
  const levelGroups = new Map<number, THREE.Group>();
  const getLevelGroup = (level: number): THREE.Group => {
    let g = levelGroups.get(level);
    if (!g) {
      g = new THREE.Group();
      g.name = `apartment_doors:L${level}`;
      g.userData.mammothPlateLevelIndex = level;
      rootGroup.add(g);
      levelGroups.set(level, g);
    }
    return g;
  };

  const visuals = new Map<string, DoorVisual>();

  const buildVisual = (row: ApartmentDoor): DoorVisual => {
    const face = FACE_FROM_CODE[row.face] ?? "n";
    const { baseYaw, swingSign } = swingDoorOrientationForFace(face);

    const structure = new THREE.Group();
    structure.name = `apartment_door:${row.rowKey}`;
    const swing = new THREE.Group();
    swing.name = "apartment_door_swing";
    structure.add(swing);
    populateSwingDoorLeaf(swing, frameMat, glassMat, APARTMENT_KIT, {
      panelW: row.panelWM,
      panelH: row.panelHM,
    });

    // Convert world coordinates from the server row into `buildingRoot`-local coordinates.
    const localX = row.hingeX - ox;
    const localY = row.feetY - oy + row.panelHM * 0.5;
    const localZ = row.hingeZ - oz;
    structure.position.set(localX, localY, localZ);
    structure.rotation.y = baseYaw;

    const interp = new FpElevatorCabInterpScalar(EXTERIOR_DOOR_VIS_INTERP_SEC);
    interp.setTarget(row.swingOpen01, performance.now());

    const levelGroup = getLevelGroup(row.level);
    levelGroup.add(structure);

    return { row, face, structure, swing, swingSign, interp };
  };

  const disposeVisual = (v: DoorVisual) => {
    v.structure.removeFromParent();
    v.swing.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry?.dispose();
    });
  };

  const ingestRow = (row: ApartmentDoor) => {
    const existing = visuals.get(row.rowKey);
    if (!existing) {
      visuals.set(row.rowKey, buildVisual(row));
      return;
    }
    const prev = existing.row;
    existing.row = row;
    if (prev.swingOpen01 !== row.swingOpen01) {
      existing.interp.setTarget(row.swingOpen01, performance.now());
    }
  };

  // Seed from any rows already in the client-side cache before subscribing.
  for (const row of opts.conn.db.apartment_door) ingestRow(row as ApartmentDoor);

  const onInsert = (_ctx: unknown, row: ApartmentDoor) => ingestRow(row);
  const onUpdate = (_ctx: unknown, _old: ApartmentDoor, row: ApartmentDoor) => ingestRow(row);
  const onDelete = (_ctx: unknown, row: ApartmentDoor) => {
    const v = visuals.get(row.rowKey);
    if (v) disposeVisual(v);
    visuals.delete(row.rowKey);
  };
  opts.conn.db.apartment_door.onInsert(onInsert);
  opts.conn.db.apartment_door.onUpdate(onUpdate);
  opts.conn.db.apartment_door.onDelete(onDelete);

  let sub: SubscriptionHandle | null = null;
  try {
    sub = opts.conn
      .subscriptionBuilder()
      .subscribe(["SELECT * FROM apartment_door"]);
  } catch (e) {
    console.warn("[fpApartmentDoors] subscribe failed", e);
  }

  const tick = (nowMs: number): void => {
    for (const v of visuals.values()) {
      const u = v.interp.eval(nowMs);
      v.swing.rotation.y = v.swingSign * u * APARTMENT_DOOR_MAX_RAD;
    }
  };

  const visitCollisionAabbsInXZ = (
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    visit: (aabb: CollisionAabb) => void,
    _queryPose?: DynamicCollisionQueryPose,
  ) => {
    for (const v of visuals.values()) {
      const row = v.row;
      const open01 = row.swingOpen01;
      let aabb: CollisionAabb | null = null;
      if (swingDoorClosedSlabActive(open01)) {
        aabb = swingDoorClosedSlabAabb({
          face: v.face,
          hingeX: row.hingeX,
          hingeZ: row.hingeZ,
          feetY: row.feetY,
          panelWidthM: row.panelWM,
          panelHeightM: row.panelHM,
        });
      } else if (swingDoorParkedLeafActive(open01)) {
        aabb = swingDoorParkedLeafAabb({
          face: v.face,
          hingeX: row.hingeX,
          hingeZ: row.hingeZ,
          feetY: row.feetY,
          panelWidthM: row.panelWM,
          panelHeightM: row.panelHM,
        });
      }
      if (!aabb) continue;
      if (aabb.max[0] < x0 || aabb.min[0] > x1) continue;
      if (aabb.max[2] < z0 || aabb.min[2] > z1) continue;
      visit(aabb);
    }
  };

  const resolveInteractTarget = (playerPos: THREE.Vector3): DoorVisual | null => {
    let best: { v: DoorVisual; dsq: number } | null = null;
    for (const v of visuals.values()) {
      const row = v.row;
      if (
        !swingDoorPlayerInInteractRange({
          hingeX: row.hingeX,
          hingeZ: row.hingeZ,
          feetY: row.feetY,
          panelWidthM: row.panelWM,
          panelHeightM: row.panelHM,
          px: playerPos.x,
          py: playerPos.y,
          pz: playerPos.z,
        })
      ) {
        continue;
      }
      const dx = playerPos.x - row.hingeX;
      const dz = playerPos.z - row.hingeZ;
      const dsq = dx * dx + dz * dz;
      if (best == null || dsq < best.dsq) best = { v, dsq };
    }
    return best?.v ?? null;
  };

  const consumeInteractKey = (playerPos: THREE.Vector3): boolean => {
    const target = resolveInteractTarget(playerPos);
    if (!target) return false;
    try {
      void opts.conn.reducers.apartmentDoorToggle({
        rowKey: target.row.rowKey,
        clientFeetX: playerPos.x,
        clientFeetY: playerPos.y,
        clientFeetZ: playerPos.z,
      });
    } catch (e) {
      console.warn("[fpApartmentDoors] apartmentDoorToggle", e);
    }
    return true;
  };

  const shouldSuppressEpickup = (playerPos: THREE.Vector3): boolean =>
    resolveInteractTarget(playerPos) !== null;

  const getInteractPrompt = (playerPos: THREE.Vector3) => {
    const target = resolveInteractTarget(playerPos);
    if (!target) return null;
    const willClose = target.row.desiredOpen !== 0;
    return { willClose };
  };

  const dispose = () => {
    try {
      sub?.unsubscribe();
    } catch {
      /* subscription may already be torn down */
    }
    for (const v of visuals.values()) disposeVisual(v);
    visuals.clear();
    for (const g of levelGroups.values()) g.removeFromParent();
    levelGroups.clear();
    rootGroup.removeFromParent();
    frameMat.dispose();
    glassMat.dispose();
    try {
      opts.conn.db.apartment_door.removeOnInsert(onInsert);
      opts.conn.db.apartment_door.removeOnUpdate(onUpdate);
      opts.conn.db.apartment_door.removeOnDelete(onDelete);
    } catch {
      /* removeOn* may be absent on older bindings; falling through is safe */
    }
  };

  return {
    dispose,
    tick,
    visitCollisionAabbsInXZ,
    consumeInteractKey,
    shouldSuppressEpickup,
    getInteractPrompt,
  };
}

// Kept to silence unused-export warnings if future wiring needs it.
void APARTMENT_DOOR_HINGE_OUTWARD_PICK_OFFSET_M;
