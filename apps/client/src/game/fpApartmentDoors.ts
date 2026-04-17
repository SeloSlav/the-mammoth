/**
 * Client-side apartment door world.
 *
 * Replicated `apartment_door` rows drive one hinged swing-door visual per (floor, unit, face).
 * The mesh, collision math, and interaction rules are all shared with the elevator landing
 * exterior door via `@the-mammoth/world/swingDoorMesh` + `swingDoorCollision`. The apartment kit
 * (`content/door/apartment_unit_kit.json`) toggles a solid fill vs frame + glass lites; instancing
 * uses one merged frame `InstancedMesh` plus an optional second `InstancedMesh` for the lite.
 *
 * Performance-critical design (Mamutica seeds ~608 rows):
 *
 * 1. **Pre-allocation from the generated template manifest.** We know every (level, template)
 *    pair at build time (`APARTMENT_DOOR_TEMPLATES`). Slots are materialized up-front, so the
 *    subscription stampede that used to build ~3000 `BoxGeometry` objects in one frame is gone:
 *    rows arriving from the server only flip state on pre-existing slots.
 *
 * 2. **One or two `InstancedMesh`es per floor plate** — merged frame (+ optional glass pass) —
 *    keeps the whole building to at most `2×#levels` door draws versus the previous ~3040.
 *
 * 3. **Per-level `mammothPlateLevelIndex` tagging** lets the existing floor-plate visibility band
 *    (`fpBuildingFloorPlateVisibilityBand`) cull entire storeys of doors with a single
 *    `object.visible = false`, just like the static floor geometry.
 *
 * 4. **Instance matrices are only rewritten for slots whose scalar interp is still settling.**
 *    Closed and fully-parked doors contribute zero per-frame cost; only the handful of actively
 *    animating doors pay.
 *
 * 5. **Spatial bucketed collision/interact iteration.** Player prediction queries touch just the
 *    two buckets adjacent to the query rect, so a corridor full of doors stays O(query size) and
 *    matches the server's `collect_apartment_door_collision_aabbs` path.
 */
import * as THREE from "three";
import type { BuildingDoc, LandingKitDef } from "@the-mammoth/schemas";
import { LandingKitDefSchema } from "@the-mammoth/schemas";
import {
  APARTMENT_DOOR_TEMPLATES,
  buildApartmentSwingLeafGeometries,
  type CollisionAabb,
  DEFAULT_BUILDING_FLOOR_SPACING_M,
  FACE_CODE,
  FACE_FROM_CODE,
  SWING_DOOR_DEFAULT_MAX_RAD,
  type SwingDoorDimensions,
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

/**
 * Apartment doors swing INTO the unit (inward), not into the corridor. This matches
 * real-world residential-door behavior and keeps the open leaf out of shared corridor
 * traffic. It's the UX-correct answer to "I press E and the door juts into the hallway,
 * blocking me from walking straight in."
 */
const APARTMENT_DOOR_SWING_INWARD = true;

/**
 * Apartment doors currently share a single authored size (`UNIT_ENTRY_DOOR_W` × `UNIT_ENTRY_DOOR_H`
 * from `unitEntryAdjacency`) — every template in `APARTMENT_DOOR_TEMPLATES` matches these. We
 * keep the instanced path tight by assuming the shared size so a single merged geometry covers
 * every door; any future per-template dim override would need to fall back to the per-door mesh
 * path used pre-optimization.
 */
const APARTMENT_DOOR_DIMS: SwingDoorDimensions = {
  panelW: APARTMENT_KIT?.panelWidthM ?? 1.26,
  panelH: APARTMENT_KIT?.panelHeightM ?? 2.06,
};

/** Bucket size (meters) used by the collision/interact spatial index. Tuned so a typical query
 *  window touches at most 2×2 buckets for 608 doors stretched over ~230 m. */
const APARTMENT_DOOR_BUCKET_SIZE_M = 8;

/** Threshold below which two open01 values are treated as converged (skip matrix rewrite). */
const APARTMENT_DOOR_ANIM_EPSILON = 1e-4;

export type MountFpApartmentDoorsOpts = {
  conn: DbConnection;
  buildingRoot: THREE.Group;
  building: BuildingDoc;
};

/** Debug: live snapshot of a nearby apartment door — exactly the state the collision pipeline
 *  consumed this frame. Used by `window.__mmDoorDebug` to trace rubber-banding reports. */
export type ApartmentDoorDebugSlot = {
  rowKey: string;
  level: number;
  face: SwingDoorFace;
  hingeX: number;
  hingeZ: number;
  feetY: number;
  panelWidthM: number;
  panelHeightM: number;
  desiredOpen: number;
  swingOpen01: number;
  /** Which collision regime the `open01` falls in (what AABB — if any — is emitted). */
  regime: "closed-slab" | "passable" | "parked-leaf";
  /** The actual AABB the collision pipeline sees this frame (null when passable). */
  emittedAabb: CollisionAabb | null;
  /** XZ distance from player feet to hinge. */
  distanceMeters: number;
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
  /** Returns every apartment door within `radiusM` of `(x,z)` with its live collision state. */
  debugSnapshot(x: number, z: number, radiusM: number): ApartmentDoorDebugSlot[];
};

/** One pre-allocated door slot. World coordinates are stable across the session. */
type DoorSlot = {
  rowKey: string;
  level: number;
  face: SwingDoorFace;
  baseYaw: number;
  /** Effective swing sign after applying `APARTMENT_DOOR_SWING_INWARD` — negation of the
   *  corridor-direction table value. Cached so {@link applyMatrix} can avoid per-frame lookups. */
  effectiveSwingSign: 1 | -1;
  /** World-space hinge (feet ↔ collision). */
  hingeX: number;
  hingeZ: number;
  feetY: number;
  panelWidthM: number;
  panelHeightM: number;
  /** Building-local hinge (for InstancedMesh matrices). */
  localX: number;
  localCenterY: number;
  localZ: number;
  /** Index into {@link LevelMesh.mesh.instanceMatrix}. */
  instanceIndex: number;
  levelMesh: LevelMesh;
  /** Server-mirrored state — initially closed, updated on subscription events. */
  desiredOpen: number;
  swingOpen01: number;
  /** Visual smoothing toward `swingOpen01`. `lastApplied` lets us skip matrix writes when still. */
  interp: FpElevatorCabInterpScalar;
  lastApplied: number;
  animating: boolean;
  /** `true` once the server's row has been seen at least once (until then we draw "closed"). */
  seeded: boolean;
};

type LevelMesh = {
  level: number;
  mesh: THREE.InstancedMesh;
  /** Present when the kit authors a glass lite (second material / draw). */
  glassMesh: THREE.InstancedMesh | undefined;
  slots: DoorSlot[];
  /** Flipped to true whenever any instance matrix was rewritten this frame. */
  dirty: boolean;
};

type Bucket = DoorSlot[];
type BucketIndex = {
  bucketSize: number;
  minX: number;
  minZ: number;
  nX: number;
  nZ: number;
  buckets: Bucket[];
};

function buildBucketIndex(slots: DoorSlot[], bucketSize: number): BucketIndex {
  if (slots.length === 0) {
    return {
      bucketSize,
      minX: 0,
      minZ: 0,
      nX: 1,
      nZ: 1,
      buckets: [[]],
    };
  }
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const s of slots) {
    if (s.hingeX < minX) minX = s.hingeX;
    if (s.hingeX > maxX) maxX = s.hingeX;
    if (s.hingeZ < minZ) minZ = s.hingeZ;
    if (s.hingeZ > maxZ) maxZ = s.hingeZ;
  }
  const nX = Math.max(1, Math.ceil((maxX - minX) / bucketSize) + 1);
  const nZ = Math.max(1, Math.ceil((maxZ - minZ) / bucketSize) + 1);
  const buckets: Bucket[] = [];
  for (let i = 0; i < nX * nZ; i++) buckets.push([]);
  for (const s of slots) {
    const ix = Math.min(nX - 1, Math.max(0, Math.floor((s.hingeX - minX) / bucketSize)));
    const iz = Math.min(nZ - 1, Math.max(0, Math.floor((s.hingeZ - minZ) / bucketSize)));
    buckets[iz * nX + ix]!.push(s);
  }
  return { bucketSize, minX, minZ, nX, nZ, buckets };
}

function visitBucketedSlots(
  idx: BucketIndex,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  visit: (slot: DoorSlot) => void,
): void {
  const ix0 = Math.max(0, Math.floor((x0 - idx.minX) / idx.bucketSize));
  const ix1 = Math.min(idx.nX - 1, Math.floor((x1 - idx.minX) / idx.bucketSize));
  const iz0 = Math.max(0, Math.floor((z0 - idx.minZ) / idx.bucketSize));
  const iz1 = Math.min(idx.nZ - 1, Math.floor((z1 - idx.minZ) / idx.bucketSize));
  if (ix0 > ix1 || iz0 > iz1) return;
  for (let iz = iz0; iz <= iz1; iz++) {
    for (let ix = ix0; ix <= ix1; ix++) {
      const bucket = idx.buckets[iz * idx.nX + ix];
      if (!bucket) continue;
      for (const slot of bucket) visit(slot);
    }
  }
}

/**
 * Compose `T(localX, localCenterY, localZ) * R_y(yaw)` in-place into `out`. Matches the static
 * Three.js `Object3D.matrix.compose` call but avoids the quaternion + vector garbage per call.
 */
function composeHingeMatrix(
  out: THREE.Matrix4,
  localX: number,
  localCenterY: number,
  localZ: number,
  yaw: number,
): void {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const e = out.elements;
  e[0] = c;
  e[1] = 0;
  e[2] = -s;
  e[3] = 0;
  e[4] = 0;
  e[5] = 1;
  e[6] = 0;
  e[7] = 0;
  e[8] = s;
  e[9] = 0;
  e[10] = c;
  e[11] = 0;
  e[12] = localX;
  e[13] = localCenterY;
  e[14] = localZ;
  e[15] = 1;
}

export function mountFpApartmentDoors(
  opts: MountFpApartmentDoorsOpts,
): MountFpApartmentDoorsResult {
  const ox = opts.building.worldOrigin?.[0] ?? 0;
  const oy = opts.building.worldOrigin?.[1] ?? 0;
  const oz = opts.building.worldOrigin?.[2] ?? 0;
  const floorSpacing = DEFAULT_BUILDING_FLOOR_SPACING_M;

  const { frameMat, glassMat } = createSwingDoorMaterials(APARTMENT_KIT);
  const { frame: frameLeafGeom, glass: glassLeafGeom } = buildApartmentSwingLeafGeometries(
    APARTMENT_DOOR_DIMS,
    APARTMENT_KIT,
  );

  const templatesByDocId = new Map<
    string,
    readonly (typeof APARTMENT_DOOR_TEMPLATES)[number]["templates"][number][]
  >();
  for (const set of APARTMENT_DOOR_TEMPLATES) {
    templatesByDocId.set(set.floorDocId, set.templates);
  }

  const slotsByKey = new Map<string, DoorSlot>();
  const levelMeshes: LevelMesh[] = [];
  const allSlots: DoorSlot[] = [];

  const scratchMatrix = new THREE.Matrix4();
  const applyMatrix = (slot: DoorSlot, open01: number): void => {
    // Apartment doors swing INWARD (into the unit): `effectiveSwingSign` is the negation of
    // the table's corridor-direction swing sign. This keeps the open leaf out of shared
    // corridor traffic and matches real apartment-door conventions.
    const yaw = slot.baseYaw + slot.effectiveSwingSign * open01 * APARTMENT_DOOR_MAX_RAD;
    composeHingeMatrix(scratchMatrix, slot.localX, slot.localCenterY, slot.localZ, yaw);
    slot.levelMesh.mesh.setMatrixAt(slot.instanceIndex, scratchMatrix);
    slot.levelMesh.glassMesh?.setMatrixAt(slot.instanceIndex, scratchMatrix);
    slot.levelMesh.dirty = true;
    slot.lastApplied = open01;
  };

  for (const ref of opts.building.floorRefs) {
    const templates = templatesByDocId.get(ref.floorDocId);
    if (!templates || templates.length === 0) continue;

    const mesh = new THREE.InstancedMesh(frameLeafGeom, frameMat, templates.length);
    mesh.name = `apartment_doors:L${ref.levelIndex}`;
    mesh.userData.mammothPlateLevelIndex = ref.levelIndex;
    mesh.frustumCulled = false; // per-level group visibility drives culling, not frustum tests.
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    opts.buildingRoot.add(mesh);

    let glassMesh: THREE.InstancedMesh | undefined;
    if (glassLeafGeom) {
      glassMesh = new THREE.InstancedMesh(glassLeafGeom, glassMat, templates.length);
      glassMesh.name = `apartment_doors_glass:L${ref.levelIndex}`;
      glassMesh.userData.mammothPlateLevelIndex = ref.levelIndex;
      glassMesh.frustumCulled = false;
      glassMesh.castShadow = false;
      glassMesh.receiveShadow = false;
      glassMesh.renderOrder = 2;
      opts.buildingRoot.add(glassMesh);
    }

    const levelMesh: LevelMesh = {
      level: ref.levelIndex,
      mesh,
      glassMesh,
      slots: [],
      dirty: true,
    };
    levelMeshes.push(levelMesh);

    const plateWorldOriginY = oy + (ref.levelIndex - 1) * floorSpacing;

    for (let i = 0; i < templates.length; i++) {
      const t = templates[i]!;
      const { baseYaw, swingSign } = swingDoorOrientationForFace(t.face as SwingDoorFace);
      const effectiveSwingSign: 1 | -1 = APARTMENT_DOOR_SWING_INWARD
        ? ((-swingSign) as 1 | -1)
        : swingSign;
      const hingeX = t.hingeX;
      const hingeZ = t.hingeZ;
      const feetY = plateWorldOriginY + t.feetYOffset;
      const panelWidthM = t.panelWidthM;
      const panelHeightM = t.panelHeightM;
      const rowKey = `${ref.floorDocId}|${ref.levelIndex}|${t.templateId}`;

      const slot: DoorSlot = {
        rowKey,
        level: ref.levelIndex,
        face: t.face as SwingDoorFace,
        baseYaw,
        effectiveSwingSign,
        hingeX,
        hingeZ,
        feetY,
        panelWidthM,
        panelHeightM,
        localX: hingeX - ox,
        localCenterY: feetY - oy + panelHeightM * 0.5,
        localZ: hingeZ - oz,
        instanceIndex: i,
        levelMesh,
        desiredOpen: 0,
        swingOpen01: 0,
        interp: new FpElevatorCabInterpScalar(EXTERIOR_DOOR_VIS_INTERP_SEC),
        lastApplied: Number.NaN, // force first write
        animating: false,
        seeded: false,
      };
      slot.interp.setTarget(0, performance.now());
      applyMatrix(slot, 0);

      levelMesh.slots.push(slot);
      slotsByKey.set(rowKey, slot);
      allSlots.push(slot);
    }

    mesh.instanceMatrix.needsUpdate = true;
    levelMesh.dirty = false;
  }

  const bucketIndex = buildBucketIndex(allSlots, APARTMENT_DOOR_BUCKET_SIZE_M);

  const ingestRow = (row: ApartmentDoor) => {
    const slot = slotsByKey.get(row.rowKey);
    if (!slot) return; // orphan row (floor/template removed from codegen) — ignore.
    slot.desiredOpen = row.desiredOpen;
    const nextOpen = row.swingOpen01;
    if (!slot.seeded || Math.abs(nextOpen - slot.swingOpen01) > APARTMENT_DOOR_ANIM_EPSILON) {
      slot.interp.setTarget(nextOpen, performance.now());
      slot.animating = true;
    }
    slot.swingOpen01 = nextOpen;
    slot.seeded = true;
  };

  for (const row of opts.conn.db.apartment_door) ingestRow(row as ApartmentDoor);

  const onInsert = (_ctx: unknown, row: ApartmentDoor) => ingestRow(row);
  const onUpdate = (_ctx: unknown, _old: ApartmentDoor, row: ApartmentDoor) => ingestRow(row);
  /** Deletions aren't expected (template set is static), but keep the slot in the closed state
   *  if a row ever disappears so the visual matches the server's "unknown ⇒ closed" contract. */
  const onDelete = (_ctx: unknown, row: ApartmentDoor) => {
    const slot = slotsByKey.get(row.rowKey);
    if (!slot) return;
    slot.desiredOpen = 0;
    slot.seeded = false;
    slot.interp.setTarget(0, performance.now());
    slot.animating = true;
  };
  opts.conn.db.apartment_door.onInsert(onInsert);
  opts.conn.db.apartment_door.onUpdate(onUpdate);
  opts.conn.db.apartment_door.onDelete(onDelete);

  let sub: SubscriptionHandle | null = null;
  try {
    sub = opts.conn.subscriptionBuilder().subscribe(["SELECT * FROM apartment_door"]);
  } catch (e) {
    console.warn("[fpApartmentDoors] subscribe failed", e);
  }

  const tick = (nowMs: number): void => {
    // Only walk slots still settling. Static closed / fully parked doors stay out of this loop,
    // so the per-frame cost is proportional to "doors currently animating", not to door count.
    for (const slot of allSlots) {
      if (!slot.animating) continue;
      const u = slot.interp.eval(nowMs);
      if (Math.abs(u - slot.lastApplied) > APARTMENT_DOOR_ANIM_EPSILON) {
        applyMatrix(slot, u);
      }
      if (Math.abs(u - slot.swingOpen01) <= APARTMENT_DOOR_ANIM_EPSILON) {
        // Converged to the latest server target; lock-in the final matrix and stop ticking.
        slot.animating = false;
        slot.lastApplied = slot.swingOpen01;
      }
    }
    for (const lm of levelMeshes) {
      if (!lm.dirty) continue;
      lm.mesh.instanceMatrix.needsUpdate = true;
      if (lm.glassMesh) lm.glassMesh.instanceMatrix.needsUpdate = true;
      lm.dirty = false;
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
    visitBucketedSlots(bucketIndex, x0, x1, z0, z1, (slot) => {
      const open01 = slot.swingOpen01;
      let aabb: CollisionAabb | null = null;
      if (swingDoorClosedSlabActive(open01)) {
        aabb = swingDoorClosedSlabAabb({
          face: slot.face,
          hingeX: slot.hingeX,
          hingeZ: slot.hingeZ,
          feetY: slot.feetY,
          panelWidthM: slot.panelWidthM,
          panelHeightM: slot.panelHeightM,
        });
      } else if (swingDoorParkedLeafActive(open01)) {
        aabb = swingDoorParkedLeafAabb({
          face: slot.face,
          hingeX: slot.hingeX,
          hingeZ: slot.hingeZ,
          feetY: slot.feetY,
          panelWidthM: slot.panelWidthM,
          panelHeightM: slot.panelHeightM,
          swingInward: APARTMENT_DOOR_SWING_INWARD,
        });
      }
      if (!aabb) return;
      if (aabb.max[0] < x0 || aabb.min[0] > x1) return;
      if (aabb.max[2] < z0 || aabb.min[2] > z1) return;
      visit(aabb);
    });
  };

  type BestInteract = { slot: DoorSlot; dsq: number };
  const resolveInteractTarget = (playerPos: THREE.Vector3): DoorSlot | null => {
    const r = 1.6 + APARTMENT_DOOR_DIMS.panelW; // conservative bucket expansion
    let best: BestInteract | null = null;
    visitBucketedSlots(
      bucketIndex,
      playerPos.x - r,
      playerPos.x + r,
      playerPos.z - r,
      playerPos.z + r,
      (slot) => {
        if (
          !swingDoorPlayerInInteractRange({
            hingeX: slot.hingeX,
            hingeZ: slot.hingeZ,
            feetY: slot.feetY,
            panelWidthM: slot.panelWidthM,
            panelHeightM: slot.panelHeightM,
            px: playerPos.x,
            py: playerPos.y,
            pz: playerPos.z,
          })
        ) {
          return;
        }
        const dx = playerPos.x - slot.hingeX;
        const dz = playerPos.z - slot.hingeZ;
        const dsq = dx * dx + dz * dz;
        if (best == null || dsq < best.dsq) best = { slot, dsq };
      },
    );
    return best === null ? null : (best as BestInteract).slot;
  };

  const consumeInteractKey = (playerPos: THREE.Vector3): boolean => {
    const target = resolveInteractTarget(playerPos);
    if (!target) return false;
    try {
      void opts.conn.reducers.apartmentDoorToggle({
        rowKey: target.rowKey,
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
    return { willClose: target.desiredOpen !== 0 };
  };

  const debugSnapshot = (x: number, z: number, radiusM: number): ApartmentDoorDebugSlot[] => {
    const out: ApartmentDoorDebugSlot[] = [];
    const r2 = radiusM * radiusM;
    visitBucketedSlots(bucketIndex, x - radiusM, x + radiusM, z - radiusM, z + radiusM, (slot) => {
      const dx = slot.hingeX - x;
      const dz = slot.hingeZ - z;
      const d2 = dx * dx + dz * dz;
      if (d2 > r2) return;
      const open01 = slot.swingOpen01;
      let regime: ApartmentDoorDebugSlot["regime"];
      let emittedAabb: CollisionAabb | null = null;
      if (swingDoorClosedSlabActive(open01)) {
        regime = "closed-slab";
        emittedAabb = swingDoorClosedSlabAabb({
          face: slot.face,
          hingeX: slot.hingeX,
          hingeZ: slot.hingeZ,
          feetY: slot.feetY,
          panelWidthM: slot.panelWidthM,
          panelHeightM: slot.panelHeightM,
        });
      } else if (swingDoorParkedLeafActive(open01)) {
        regime = "parked-leaf";
        emittedAabb = swingDoorParkedLeafAabb({
          face: slot.face,
          hingeX: slot.hingeX,
          hingeZ: slot.hingeZ,
          feetY: slot.feetY,
          panelWidthM: slot.panelWidthM,
          panelHeightM: slot.panelHeightM,
          swingInward: APARTMENT_DOOR_SWING_INWARD,
        });
      } else {
        regime = "passable";
      }
      out.push({
        rowKey: slot.rowKey,
        level: slot.level,
        face: slot.face,
        hingeX: slot.hingeX,
        hingeZ: slot.hingeZ,
        feetY: slot.feetY,
        panelWidthM: slot.panelWidthM,
        panelHeightM: slot.panelHeightM,
        desiredOpen: slot.desiredOpen,
        swingOpen01: open01,
        regime,
        emittedAabb,
        distanceMeters: Math.sqrt(d2),
      });
    });
    out.sort((a, b) => a.distanceMeters - b.distanceMeters);
    return out;
  };

  const dispose = () => {
    try {
      sub?.unsubscribe();
    } catch {
      /* subscription may already be torn down */
    }
    try {
      opts.conn.db.apartment_door.removeOnInsert(onInsert);
      opts.conn.db.apartment_door.removeOnUpdate(onUpdate);
      opts.conn.db.apartment_door.removeOnDelete(onDelete);
    } catch {
      /* removeOn* may be absent on older bindings; falling through is safe */
    }
    for (const lm of levelMeshes) {
      lm.mesh.removeFromParent();
      lm.mesh.dispose();
      lm.glassMesh?.removeFromParent();
      lm.glassMesh?.dispose();
    }
    levelMeshes.length = 0;
    slotsByKey.clear();
    allSlots.length = 0;
    frameLeafGeom.dispose();
    glassLeafGeom?.dispose();
    frameMat.dispose();
    glassMat.dispose();
  };

  return {
    dispose,
    tick,
    visitCollisionAabbsInXZ,
    consumeInteractKey,
    shouldSuppressEpickup,
    getInteractPrompt,
    debugSnapshot,
  };
}

// Kept to silence unused-symbol warnings. These are re-exported elsewhere but referenced here for
// completeness of the per-face convention documentation.
void FACE_CODE;
void FACE_FROM_CODE;
