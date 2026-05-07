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
 * 4. **Instance matrices are only rewritten when the eased visual `open01` moves materially.**
 *    Idle doors skip `setMatrixAt`; only doors chasing a changing replica pay each frame.
 *
 * 5. **Prediction collision uses replicated `swing_open_01`**, not the eased visual. Closing stays on the thin doorway slab; past `SWING_DOOR_CLOSED_SLAB_MAX_OPEN_01` we mount the swinging-leaf hull so outward corridor doors stay physical cover when parked open (`swingDoorMovementBlockingAabb`).
 *
 * 6. **Spatial bucketed collision/interact iteration.** Player prediction queries touch just the
 *    two buckets adjacent to the query rect, so a corridor full of doors stays O(query size).
 */
import * as THREE from "three";
import type { BuildingDoc, LandingKitDef } from "@the-mammoth/schemas";
import { LandingKitDefSchema } from "@the-mammoth/schemas";
import {
  APARTMENT_DOOR_TEMPLATES,
  apartmentDoorInteractPromptKindFromTemplateId,
  apartmentDoorSwingInwardForTemplateId,
  buildApartmentSwingLeafGeometries,
  type CollisionAabb,
  DEFAULT_BUILDING_FLOOR_SPACING_M,
  FACE_CODE,
  FACE_FROM_CODE,
  isGlazedApartmentDoorTemplate,
  SWING_DOOR_ANIM_SPEED,
  SWING_DOOR_DEFAULT_MAX_RAD,
  type SwingDoorDimensions,
  type SwingDoorFace,
  swingDoorClosedSlabAabb,
  swingDoorClosedSlabActive,
  swingDoorFirearmBarrierAabb,
  swingDoorMovementBlockingAabb,
  swingDoorOrientationForFace,
  swingDoorParkedLeafAabb,
  swingDoorParkedLeafActive,
  swingDoorPlayerInInteractRange,
  swingDoorTangentRest,
  createSwingDoorMaterials,
  type ApartmentDoorInteractPromptKind,
} from "@the-mammoth/world";
import apartmentKitAuthoringJson from "../../../../../content/door/apartment_unit_kit.json";
import type { DbConnection, SubscriptionHandle } from "../../module_bindings";
import type { ApartmentDoor } from "../../module_bindings/types";
import type { DynamicCollisionQueryPose } from "../fpPhysics/fpPlayerCollision.js";
import { readFpDoorAnimSkewWarn } from "../fpPhysics/fpCollisionPolicy.js";
import {
  apartmentDoorMatchesContainingUnit,
  clientMayToggleApartmentDoor,
} from "./fpApartmentGameplay.js";

function parseApartmentKit(): LandingKitDef | undefined {
  const parsed = LandingKitDefSchema.safeParse(apartmentKitAuthoringJson);
  return parsed.success ? parsed.data : undefined;
}

const APARTMENT_KIT = parseApartmentKit();
const APARTMENT_DOOR_MAX_RAD =
  APARTMENT_KIT?.exteriorSwingMaxRad ?? SWING_DOOR_DEFAULT_MAX_RAD;

/**
 * Base merged leaf size from the apartment kit. Most templates match this exactly; stair-shaft
 * exit doors (`manual_stair_shaft_exit_*`) author wider/taller `panelWidthM` / `panelHeightM` and
 * get a per-instance non-uniform scale in {@link applyMatrix} so visuals match the shaft cutout.
 */
const APARTMENT_DOOR_DIMS: SwingDoorDimensions = {
  panelW: APARTMENT_KIT?.panelWidthM ?? 1.26,
  panelH: APARTMENT_KIT?.panelHeightM ?? 2.06,
};

const _hingeComposePos = new THREE.Vector3();
const _hingeComposeQuat = new THREE.Quaternion();
const _hingeComposeScale = new THREE.Vector3(1, 1, 1);
const _hingeYAxis = new THREE.Vector3(0, 1, 0);
const _interactCamWorld = new THREE.Vector3();
const _interactCamDir = new THREE.Vector3();

/** Bucket size (meters) used by the collision/interact spatial index. Tuned so a typical query
 *  window touches at most 2×2 buckets for 608 doors stretched over ~230 m. */
const APARTMENT_DOOR_BUCKET_SIZE_M = 8;

/** Threshold below which two open01 values are treated as converged (skip matrix rewrite). */
const APARTMENT_DOOR_ANIM_EPSILON = 1e-4;
const APARTMENT_DOOR_LOOK_MAX_DIST_M = 5.5;
const APARTMENT_DOOR_LOOK_MAX_PERP_M = 1.15;
const APARTMENT_DOOR_LOOK_MIN_FORWARD_M = 0.08;
const APARTMENT_DOOR_LOOK_TANGENT_PAD_M = 0.18;

function doorCollisionRegimeFromOpen01(
  open01: number,
): "closed-slab" | "passable" | "parked-leaf" {
  if (swingDoorClosedSlabActive(open01)) return "closed-slab";
  if (swingDoorParkedLeafActive(open01)) return "parked-leaf";
  return "passable";
}

export type MountFpApartmentDoorsOpts = {
  conn: DbConnection;
  buildingRoot: THREE.Group;
  building: BuildingDoc;
};

/** Debug: nearby apartment door — blocking matches replicated `swing_open_01`; `visualOpen01` is render-only. */
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
  /** Client-smoothed open01 — **instanced mesh / render only**; prediction blocking uses {@link replicatedOpen01}. */
  visualOpen01: number;
  /** Replicated `swing_open_01` — same sample used for **prediction collision** and server physics. */
  replicatedOpen01: number;
  /** Blocking regime (from `replicatedOpen01`) — matches server. */
  regime: "closed-slab" | "passable" | "parked-leaf";
  /** Same as `regime` (kept for existing debug JSON shape). */
  serverRegime: "closed-slab" | "passable" | "parked-leaf";
  /** Regime implied by `visualOpen01` only — can differ from {@link regime} while the door eases. */
  visualRegime: "closed-slab" | "passable" | "parked-leaf";
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
   * LOS / impact decals: widened closed slabs + parked leaves (mirrors server `hitscan` apartment pass).
   */
  visitFirearmBarrierAabbsInXZ(
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    visit: (aabb: CollisionAabb) => void,
  ): void;
  /**
   * Try to open/close the nearest eligible door. Returns true when a reducer was dispatched and
   * the `E` key chain should short-circuit (pickup etc. is suppressed).
   */
  consumeInteractKey(playerPos: THREE.Vector3, camera: THREE.PerspectiveCamera): boolean;
  /** True when an apartment door is in range, so the generic pickup prompt/action is suppressed. */
  shouldSuppressEpickup(playerPos: THREE.Vector3, camera: THREE.PerspectiveCamera): boolean;
  /** Drive the bottom interact prompt when the player is next to an apartment door. */
  getInteractPrompt(
    playerPos: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
  ): { willClose: boolean; promptKind: ApartmentDoorInteractPromptKind } | null;
  /** Returns every apartment door within `radiusM` of `(x,z)` with its live collision state. */
  debugSnapshot(x: number, z: number, radiusM: number): ApartmentDoorDebugSlot[];
};

/**
 * Apartment doors come in two visual flavors driven by {@link isGlazedApartmentDoorTemplate}:
 *
 * - `solid` — opaque leaf from the apartment kit (`apartment_unit_kit.json` with `solid: true`).
 *   Used for every per-unit door; one merged `InstancedMesh` per level.
 * - `glazed` — frame + glass lite from the same kit with `solid` overridden to `false`. Used only
 *   for the corridor→stairwell access doors (`manual_e_corridor_near_stair_*`) and shaft exits
 *   (`manual_stair_shaft_exit_*`). Adds a second
 *   `InstancedMesh` per level for the glass pass.
 *
 * Slots record which group they live in so `applyMatrix` writes to the right instance buffers;
 * the rest of the pipeline (collision, interact, buckets) treats both identically.
 */
type InstanceGroupKind = "solid" | "glazed";

type InstanceGroup = {
  kind: InstanceGroupKind;
  /** Frame mesh — merged opaque leaf for `solid`, frame-only for `glazed`. */
  mesh: THREE.InstancedMesh;
  /** Glass lite mesh; only populated when `kind === "glazed"`. */
  glassMesh: THREE.InstancedMesh | undefined;
  /** Door slot by `Raycaster` hit `instanceId` for both frame and optional glass pass. */
  slots: DoorSlot[];
  /** Flipped to true whenever any instance matrix was rewritten this frame. */
  dirty: boolean;
};

/** One pre-allocated door slot. World coordinates are stable across the session. */
type DoorSlot = {
  rowKey: string;
  /** Matches seeded `apartment_door.floor_doc_id`. */
  floorDocId: string;
  /** Matches `apartment_door.template_id` / codegen `templateId` (includes `|face` suffix). */
  templateId: string;
  level: number;
  face: SwingDoorFace;
  baseYaw: number;
  /** Per-template swing direction. Unit doors now swing outward into corridors for FPS cover. */
  swingInward: boolean;
  /** Cached `swingDoorEffectiveSwingSign(face, swingInward)` for {@link applyMatrix}. */
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
  /** Index into {@link InstanceGroup.mesh.instanceMatrix}. */
  instanceIndex: number;
  group: InstanceGroup;
  /** Server-mirrored state — initially closed, updated on subscription events. */
  desiredOpen: number;
  /** Replicated `swing_open_01` (authoritative sample; used for **prediction collision** + server parity). */
  swingOpen01: number;
  /** Client-driven visual open01; integrates toward `desiredOpen` at `SWING_DOOR_ANIM_SPEED` — **render / matrices only**. */
  visualOpen01: number;
  lastApplied: number;
  /** `true` once the server's row has been seen at least once (until then we draw "closed"). */
  seeded: boolean;
};

type DoorInteractTarget = {
  rowKey: string;
  floorDocId: string;
  templateId: string;
  level: number;
  face: SwingDoorFace;
  hingeX: number;
  hingeZ: number;
  feetY: number;
  panelWidthM: number;
  panelHeightM: number;
  desiredOpen: number;
};

type LevelMesh = {
  level: number;
  /** Up to two groups per level — `solid` for per-unit doors, `glazed` for the corridor→stairwell
   *  access doors. Empty subsets are simply absent (no zero-length `InstancedMesh` allocations). */
  groups: InstanceGroup[];
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

/** XZ AABB for spatial indexing: closed slab ∪ parked leaf. Wide stair doors span several meters
 *  from the hinge; indexing only the hinge point missed buckets when the player was near the tip. */
function doorSlotIndexFootprintXz(s: DoorSlot): { x0: number; x1: number; z0: number; z1: number } {
  const closed = swingDoorClosedSlabAabb({
    face: s.face,
    hingeX: s.hingeX,
    hingeZ: s.hingeZ,
    feetY: s.feetY,
    panelWidthM: s.panelWidthM,
    panelHeightM: s.panelHeightM,
  });
  const parked = swingDoorParkedLeafAabb({
    face: s.face,
    hingeX: s.hingeX,
    hingeZ: s.hingeZ,
    feetY: s.feetY,
    panelWidthM: s.panelWidthM,
    panelHeightM: s.panelHeightM,
    swingInward: s.swingInward,
  });
  return {
    x0: Math.min(closed.min[0], parked.min[0]),
    x1: Math.max(closed.max[0], parked.max[0]),
    z0: Math.min(closed.min[2], parked.min[2]),
    z1: Math.max(closed.max[2], parked.max[2]),
  };
}

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
    const fp = doorSlotIndexFootprintXz(s);
    if (fp.x0 < minX) minX = fp.x0;
    if (fp.x1 > maxX) maxX = fp.x1;
    if (fp.z0 < minZ) minZ = fp.z0;
    if (fp.z1 > maxZ) maxZ = fp.z1;
  }
  const nX = Math.max(1, Math.ceil((maxX - minX) / bucketSize) + 1);
  const nZ = Math.max(1, Math.ceil((maxZ - minZ) / bucketSize) + 1);
  const buckets: Bucket[] = [];
  for (let i = 0; i < nX * nZ; i++) buckets.push([]);

  const pad = 0.06;
  for (const s of slots) {
    const fp = doorSlotIndexFootprintXz(s);
    const ix0 = Math.max(0, Math.min(nX - 1, Math.floor((fp.x0 - pad - minX) / bucketSize)));
    const ix1 = Math.max(0, Math.min(nX - 1, Math.floor((fp.x1 + pad - minX) / bucketSize)));
    const iz0 = Math.max(0, Math.min(nZ - 1, Math.floor((fp.z0 - pad - minZ) / bucketSize)));
    const iz1 = Math.max(0, Math.min(nZ - 1, Math.floor((fp.z1 + pad - minZ) / bucketSize)));
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        buckets[iz * nX + ix]!.push(s);
      }
    }
  }
  return { bucketSize, minX, minZ, nX, nZ, buckets };
}

/**
 * Keep slot geometry aligned with replicated `apartment_door` rows. Codegen templates are the
 * initial guess; after subscription the server row is authoritative (stale DB vs new client would
 * otherwise show prompts that fail `apartment_door_toggle` validation).
 */
function syncSlotSwingFromApartmentDoorRow(slot: DoorSlot, row: ApartmentDoor): boolean {
  const face = FACE_FROM_CODE[row.face] ?? "w";
  const { baseYaw, swingSign } = swingDoorOrientationForFace(face);
  const swingInward = apartmentDoorSwingInwardForTemplateId(row.templateId);
  const effectiveSwingSign = (swingInward ? -swingSign : swingSign) as 1 | -1;
  if (
    slot.face === face &&
    slot.baseYaw === baseYaw &&
    slot.swingInward === swingInward &&
    slot.effectiveSwingSign === effectiveSwingSign
  ) {
    return false;
  }
  slot.face = face;
  slot.baseYaw = baseYaw;
  slot.swingInward = swingInward;
  slot.effectiveSwingSign = effectiveSwingSign;
  return true;
}

function syncSlotGeometryFromApartmentDoorRow(
  slot: DoorSlot,
  row: ApartmentDoor,
  ox: number,
  oy: number,
  oz: number,
): boolean {
  const nx = row.hingeX;
  const nz = row.hingeZ;
  const nf = row.feetY;
  const nw = row.panelWM;
  const nh = row.panelHM;
  if (
    Math.abs(slot.hingeX - nx) < 1e-4 &&
    Math.abs(slot.hingeZ - nz) < 1e-4 &&
    Math.abs(slot.feetY - nf) < 1e-4 &&
    Math.abs(slot.panelWidthM - nw) < 1e-4 &&
    Math.abs(slot.panelHeightM - nh) < 1e-4
  ) {
    return false;
  }
  slot.hingeX = nx;
  slot.hingeZ = nz;
  slot.feetY = nf;
  slot.panelWidthM = nw;
  slot.panelHeightM = nh;
  slot.localX = nx - ox;
  slot.localZ = nz - oz;
  slot.localCenterY = nf - oy + nh * 0.5;
  return true;
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

export function apartmentDoorLookScore(input: {
  cameraX: number;
  cameraZ: number;
  viewDirX: number;
  viewDirZ: number;
  targetX: number;
  targetZ: number;
  maxDistM?: number;
  maxPerpM?: number;
  minForwardM?: number;
}): number | null {
  const len = Math.hypot(input.viewDirX, input.viewDirZ);
  if (len < 1e-4) return null;
  const fx = input.viewDirX / len;
  const fz = input.viewDirZ / len;
  const dx = input.targetX - input.cameraX;
  const dz = input.targetZ - input.cameraZ;
  const forward = dx * fx + dz * fz;
  if (forward < (input.minForwardM ?? APARTMENT_DOOR_LOOK_MIN_FORWARD_M)) return null;
  if (forward > (input.maxDistM ?? APARTMENT_DOOR_LOOK_MAX_DIST_M)) return null;
  const perp = Math.abs(dx * fz - dz * fx);
  if (perp > (input.maxPerpM ?? APARTMENT_DOOR_LOOK_MAX_PERP_M)) return null;
  return perp + forward * 0.04;
}

function apartmentDoorLookTargetScore(input: {
  target: DoorInteractTarget;
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  viewDirX: number;
  viewDirY: number;
  viewDirZ: number;
}): number | null {
  const { target } = input;
  const tan = swingDoorTangentRest(target.face);
  const targetX = target.hingeX + tan.x * target.panelWidthM * 0.5;
  const targetY = target.feetY + target.panelHeightM * 0.52;
  const targetZ = target.hingeZ + tan.z * target.panelWidthM * 0.5;
  const dx = targetX - input.cameraX;
  const dy = targetY - input.cameraY;
  const dz = targetZ - input.cameraZ;
  const forward = dx * input.viewDirX + dy * input.viewDirY + dz * input.viewDirZ;
  if (forward < APARTMENT_DOOR_LOOK_MIN_FORWARD_M) return null;
  if (forward > APARTMENT_DOOR_LOOK_MAX_DIST_M) return null;
  const distSq = dx * dx + dy * dy + dz * dz;
  const perpSq = Math.max(0, distSq - forward * forward);
  const perp = Math.sqrt(perpSq);
  const maxPerp = Math.max(
    APARTMENT_DOOR_LOOK_MAX_PERP_M,
    target.panelWidthM * 0.65 + APARTMENT_DOOR_LOOK_TANGENT_PAD_M,
  );
  if (perp > maxPerp) return null;
  return perp + forward * 0.04;
}

function doorInteractTargetFromRow(row: ApartmentDoor): DoorInteractTarget {
  return {
    rowKey: row.rowKey,
    floorDocId: row.floorDocId,
    templateId: row.templateId,
    level: row.level,
    face: FACE_FROM_CODE[row.face] ?? "w",
    hingeX: row.hingeX,
    hingeZ: row.hingeZ,
    feetY: row.feetY,
    panelWidthM: row.panelWM,
    panelHeightM: row.panelHM,
    desiredOpen: row.desiredOpen,
  };
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

  // Build both leaf variants up-front. The apartment kit authors `solid: true` as the default
  // (opaque per-unit doors); `solid: false` is only used for the corridor→stairwell access doors.
  // We override the kit-level flag locally rather than forking the JSON so the two flavors share
  // one material palette, one glass-opening definition, and one kit file.
  const solidKit: LandingKitDef | undefined = APARTMENT_KIT
    ? { ...APARTMENT_KIT, solid: true }
    : undefined;
  const glazedKit: LandingKitDef | undefined = APARTMENT_KIT
    ? { ...APARTMENT_KIT, solid: false }
    : undefined;
  const solidGeoms = buildApartmentSwingLeafGeometries(APARTMENT_DOOR_DIMS, solidKit);
  const glazedGeoms = buildApartmentSwingLeafGeometries(APARTMENT_DOOR_DIMS, glazedKit);
  const solidFrameGeom = solidGeoms.frame;
  const glazedFrameGeom = glazedGeoms.frame;
  const glazedGlassGeom = glazedGeoms.glass;
  if (!glazedGlassGeom) {
    // Defensive: `buildApartmentSwingLeafGeometries` always returns a glass geometry when `solid`
    // is false. Surface a clear error if the invariant ever changes so we don't silently drop the
    // glass pass.
    throw new Error(
      "[fpApartmentDoors] glazed leaf built without glass geometry — check apartment kit",
    );
  }

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
    const yaw = slot.baseYaw + slot.effectiveSwingSign * open01 * APARTMENT_DOOR_MAX_RAD;
    const kitW = APARTMENT_DOOR_DIMS.panelW;
    const kitH = APARTMENT_DOOR_DIMS.panelH;
    const sw = slot.panelWidthM / kitW;
    const sh = slot.panelHeightM / kitH;
    if (Math.abs(sw - 1) < 0.004 && Math.abs(sh - 1) < 0.004) {
      composeHingeMatrix(scratchMatrix, slot.localX, slot.localCenterY, slot.localZ, yaw);
    } else {
      _hingeComposeScale.set(1, sh, sw);
      _hingeComposeQuat.setFromAxisAngle(_hingeYAxis, yaw);
      _hingeComposePos.set(slot.localX, slot.localCenterY, slot.localZ);
      scratchMatrix.compose(_hingeComposePos, _hingeComposeQuat, _hingeComposeScale);
    }
    slot.group.mesh.setMatrixAt(slot.instanceIndex, scratchMatrix);
    slot.group.glassMesh?.setMatrixAt(slot.instanceIndex, scratchMatrix);
    slot.group.dirty = true;
    slot.lastApplied = open01;
  };

  const createInstanceGroup = (
    kind: InstanceGroupKind,
    levelIndex: number,
    count: number,
  ): InstanceGroup => {
    const frameGeom = kind === "solid" ? solidFrameGeom : glazedFrameGeom;
    const mesh = new THREE.InstancedMesh(frameGeom, frameMat, count);
    mesh.name = `apartment_doors_${kind}:L${levelIndex}`;
    mesh.userData.mammothPlateLevelIndex = levelIndex;
    /**
     * Apartment doors are strictly corridor-facing — fully occluded by the opaque facade when
     * looking at the tower from outside. Tag as `mammothUnitInterior` so the session-level
     * interior-hide (see `mountFpSession` → `unitInteriorMeshes`) drops them from the exterior
     * view together with unit plaster / shaft interiors; avoids N_floors × instance fragment
     * cost for geometry that cannot possibly contribute to the silhouette.
     */
    mesh.userData.mammothUnitInterior = true;
    mesh.frustumCulled = false; // per-level group visibility drives culling, not frustum tests.
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    opts.buildingRoot.add(mesh);

    let glassMesh: THREE.InstancedMesh | undefined;
    if (kind === "glazed") {
      glassMesh = new THREE.InstancedMesh(glazedGlassGeom, glassMat, count);
      glassMesh.name = `apartment_doors_glass:L${levelIndex}`;
      glassMesh.userData.mammothPlateLevelIndex = levelIndex;
      glassMesh.userData.mammothUnitInterior = true;
      glassMesh.frustumCulled = false;
      glassMesh.castShadow = false;
      glassMesh.receiveShadow = false;
      glassMesh.renderOrder = 2;
      opts.buildingRoot.add(glassMesh);
    }

    return { kind, mesh, glassMesh, slots: [], dirty: true };
  };

  for (const ref of opts.building.floorRefs) {
    const templates = templatesByDocId.get(ref.floorDocId);
    if (!templates || templates.length === 0) continue;

    // Partition the floor's templates into the two visual flavors without allocating new arrays
    // if the floor is entirely one kind (the common case).
    let solidCount = 0;
    let glazedCount = 0;
    for (const t of templates) {
      if (isGlazedApartmentDoorTemplate(t.templateId)) glazedCount += 1;
      else solidCount += 1;
    }

    const solidGroup =
      solidCount > 0 ? createInstanceGroup("solid", ref.levelIndex, solidCount) : undefined;
    const glazedGroup =
      glazedCount > 0 ? createInstanceGroup("glazed", ref.levelIndex, glazedCount) : undefined;

    const levelMesh: LevelMesh = {
      level: ref.levelIndex,
      groups: [
        ...(solidGroup ? [solidGroup] : []),
        ...(glazedGroup ? [glazedGroup] : []),
      ],
    };
    levelMeshes.push(levelMesh);

    const plateWorldOriginY = oy + (ref.levelIndex - 1) * floorSpacing;
    let nextSolidIdx = 0;
    let nextGlazedIdx = 0;

    for (const t of templates) {
      const glazed = isGlazedApartmentDoorTemplate(t.templateId);
      const group = glazed ? glazedGroup : solidGroup;
      if (!group) continue; // unreachable: counts above ensure the matching group exists.
      const instanceIndex = glazed ? nextGlazedIdx++ : nextSolidIdx++;

      const { baseYaw, swingSign } = swingDoorOrientationForFace(t.face as SwingDoorFace);
      const swingInward = apartmentDoorSwingInwardForTemplateId(t.templateId);
      const effectiveSwingSign = (swingInward ? -swingSign : swingSign) as 1 | -1;
      const hingeX = t.hingeX;
      const hingeZ = t.hingeZ;
      const feetY = plateWorldOriginY + t.feetYOffset;
      const panelWidthM = t.panelWidthM;
      const panelHeightM = t.panelHeightM;
      const rowKey = `${ref.floorDocId}|${ref.levelIndex}|${t.templateId}`;

      const slot: DoorSlot = {
        rowKey,
        floorDocId: ref.floorDocId,
        templateId: t.templateId,
        level: ref.levelIndex,
        face: t.face as SwingDoorFace,
        baseYaw,
        swingInward,
        effectiveSwingSign,
        hingeX,
        hingeZ,
        feetY,
        panelWidthM,
        panelHeightM,
        localX: hingeX - ox,
        localCenterY: feetY - oy + panelHeightM * 0.5,
        localZ: hingeZ - oz,
        instanceIndex,
        group,
        desiredOpen: 0,
        swingOpen01: 0,
        visualOpen01: 0,
        lastApplied: Number.NaN, // force first write
        seeded: false,
      };
      group.slots[instanceIndex] = slot;
      applyMatrix(slot, 0);

      slotsByKey.set(rowKey, slot);
      allSlots.push(slot);
    }

    for (const g of levelMesh.groups) {
      g.mesh.instanceMatrix.needsUpdate = true;
      if (g.glassMesh) g.glassMesh.instanceMatrix.needsUpdate = true;
      g.dirty = false;
    }
  }

  let bucketIndex = buildBucketIndex(allSlots, APARTMENT_DOOR_BUCKET_SIZE_M);
  /** One door can sit in several buckets; collision queries may touch many buckets at once. */
  const collisionSlotVisitSeen = new Set<string>();

  const ingestRow = (row: ApartmentDoor) => {
    const slot = slotsByKey.get(row.rowKey);
    if (!slot) return; // orphan row (floor/template removed from codegen) — ignore.
    slot.floorDocId = row.floorDocId;
    slot.templateId = row.templateId;
    slot.level = row.level;
    const swingChanged = syncSlotSwingFromApartmentDoorRow(slot, row);
    const geomChanged = syncSlotGeometryFromApartmentDoorRow(slot, row, ox, oy, oz);
    if (geomChanged) {
      bucketIndex = buildBucketIndex(allSlots, APARTMENT_DOOR_BUCKET_SIZE_M);
    }
    if (swingChanged || geomChanged) {
      applyMatrix(slot, slot.visualOpen01);
    }
    const wasSeeded = slot.seeded;
    slot.desiredOpen = row.desiredOpen;
    const nextOpen = row.swingOpen01;
    slot.swingOpen01 = nextOpen;
    slot.seeded = true;
    if (!wasSeeded) {
      slot.visualOpen01 = nextOpen;
      applyMatrix(slot, nextOpen);
      return;
    }
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
    slot.swingOpen01 = 0;
    slot.visualOpen01 = 0;
    slot.seeded = false;
    applyMatrix(slot, 0);
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

  let lastApartmentDoorTickMs: number | null = null;
  let lastDoorSkewWarnMs = 0;
  const tick = (nowMs: number): void => {
    const dtSec =
      lastApartmentDoorTickMs != null
        ? Math.min(0.05, Math.max(0, (nowMs - lastApartmentDoorTickMs) * 0.001))
        : 0;
    lastApartmentDoorTickMs = nowMs;
    const maxStep = SWING_DOOR_ANIM_SPEED * dtSec;

    for (const slot of allSlots) {
      if (!slot.seeded) continue;
      const goal = slot.desiredOpen !== 0 ? 1 : 0;
      let v = slot.visualOpen01;
      if (dtSec > 0) {
        if (v < goal - 1e-5) v = Math.min(goal, v + maxStep);
        else if (v > goal + 1e-5) v = Math.max(goal, v - maxStep);
        else v = goal;
        slot.visualOpen01 = v;
      }
      if (Math.abs(slot.visualOpen01 - slot.lastApplied) > APARTMENT_DOOR_ANIM_EPSILON) {
        applyMatrix(slot, slot.visualOpen01);
      }
    }
    for (const lm of levelMeshes) {
      for (const g of lm.groups) {
        if (!g.dirty) continue;
        g.mesh.instanceMatrix.needsUpdate = true;
        if (g.glassMesh) g.glassMesh.instanceMatrix.needsUpdate = true;
        g.dirty = false;
      }
    }

    if (readFpDoorAnimSkewWarn() && nowMs - lastDoorSkewWarnMs >= 1800) {
      for (const slot of allSlots) {
        if (!slot.seeded) continue;
        const dv = Math.abs(slot.visualOpen01 - slot.swingOpen01);
        if (dv < 0.045) continue;
        const vReg = doorCollisionRegimeFromOpen01(slot.visualOpen01);
        const sReg = doorCollisionRegimeFromOpen01(slot.swingOpen01);
        if (vReg === sReg && dv < 0.12) continue;
        lastDoorSkewWarnMs = nowMs;
        console.warn(
          "[mmDoorAnimSkew] door **mesh** eases with `visualOpen01`; **blocking** uses replicated `swing_open_01`. " +
            "During animation the leaf may not match the magenta physics box — that is expected.",
          {
            rowKey: slot.rowKey,
            visualOpen01: +slot.visualOpen01.toFixed(3),
            replicatedOpen01: +slot.swingOpen01.toFixed(3),
            delta: +dv.toFixed(3),
            visualRegime: vReg,
            blockingRegime: sReg,
          },
        );
        break;
      }
    }
  };

  const visitCollisionAabbsInXZ = (
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    visit: (aabb: CollisionAabb) => void,
    queryPose?: DynamicCollisionQueryPose,
  ) => {
    void queryPose;
    collisionSlotVisitSeen.clear();
    visitBucketedSlots(bucketIndex, x0, x1, z0, z1, (slot) => {
      if (collisionSlotVisitSeen.has(slot.rowKey)) return;
      collisionSlotVisitSeen.add(slot.rowKey);
      /** Blocking matches server: replicated `swing_open_01` stepped at 20 Hz (see `movement::physics_tick_step`). */
      const open01 = slot.swingOpen01;
      const aabb = swingDoorMovementBlockingAabb({
        open01,
        face: slot.face,
        hingeX: slot.hingeX,
        hingeZ: slot.hingeZ,
        feetY: slot.feetY,
        panelWidthM: slot.panelWidthM,
        panelHeightM: slot.panelHeightM,
        swingInward: slot.swingInward,
        maxSwingRad: APARTMENT_DOOR_MAX_RAD,
      });
      if (!aabb) return;
      if (aabb.max[0] < x0 || aabb.min[0] > x1) return;
      if (aabb.max[2] < z0 || aabb.min[2] > z1) return;
      visit(aabb);
    });
  };

  const resolveInteractTarget = (
    playerPos: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
  ): DoorInteractTarget | null => {
    camera.getWorldPosition(_interactCamWorld);
    camera.getWorldDirection(_interactCamDir);
    const candidates: { target: DoorInteractTarget; score: number }[] = [];
    const id = opts.conn.identity ?? undefined;
    for (const row of opts.conn.db.apartment_door) {
      const target = doorInteractTargetFromRow(row as ApartmentDoor);
      if (
        !swingDoorPlayerInInteractRange({
          hingeX: target.hingeX,
          hingeZ: target.hingeZ,
          feetY: target.feetY,
          panelWidthM: target.panelWidthM,
          panelHeightM: target.panelHeightM,
          px: playerPos.x,
          py: playerPos.y,
          pz: playerPos.z,
        })
      ) {
        continue;
      }
      if (!apartmentDoorMatchesContainingUnit(opts.conn, playerPos, target)) continue;
      if (!clientMayToggleApartmentDoor(opts.conn, id, target)) continue;
      const score = apartmentDoorLookTargetScore({
        target,
        cameraX: _interactCamWorld.x,
        cameraY: _interactCamWorld.y,
        cameraZ: _interactCamWorld.z,
        viewDirX: _interactCamDir.x,
        viewDirY: _interactCamDir.y,
        viewDirZ: _interactCamDir.z,
      });
      if (score === null) continue;
      candidates.push({ target, score });
    }
    candidates.sort((a, b) => a.score - b.score);
    return candidates[0]?.target ?? null;
  };

  const consumeInteractKey = (playerPos: THREE.Vector3, camera: THREE.PerspectiveCamera): boolean => {
    const target = resolveInteractTarget(playerPos, camera);
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

  const shouldSuppressEpickup = (playerPos: THREE.Vector3, camera: THREE.PerspectiveCamera): boolean =>
    resolveInteractTarget(playerPos, camera) !== null;

  const getInteractPrompt = (playerPos: THREE.Vector3, camera: THREE.PerspectiveCamera) => {
    const target = resolveInteractTarget(playerPos, camera);
    if (!target) return null;
    return {
      willClose: target.desiredOpen !== 0,
      promptKind: apartmentDoorInteractPromptKindFromTemplateId(target.templateId),
    };
  };

  const debugSnapshot = (x: number, z: number, radiusM: number): ApartmentDoorDebugSlot[] => {
    const out: ApartmentDoorDebugSlot[] = [];
    const r2 = radiusM * radiusM;
    visitBucketedSlots(bucketIndex, x - radiusM, x + radiusM, z - radiusM, z + radiusM, (slot) => {
      const dx = slot.hingeX - x;
      const dz = slot.hingeZ - z;
      const d2 = dx * dx + dz * dz;
      if (d2 > r2) return;
      const visualOpen = slot.visualOpen01;
      const replicatedOpen = slot.swingOpen01;
      const regime = doorCollisionRegimeFromOpen01(replicatedOpen);
      const serverRegime = regime;
      const visualRegime = doorCollisionRegimeFromOpen01(visualOpen);
      const emittedAabb = swingDoorMovementBlockingAabb({
        open01: replicatedOpen,
        face: slot.face,
        hingeX: slot.hingeX,
        hingeZ: slot.hingeZ,
        feetY: slot.feetY,
        panelWidthM: slot.panelWidthM,
        panelHeightM: slot.panelHeightM,
        swingInward: slot.swingInward,
        maxSwingRad: APARTMENT_DOOR_MAX_RAD,
      });
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
        visualOpen01: visualOpen,
        replicatedOpen01: replicatedOpen,
        regime,
        serverRegime,
        visualRegime,
        emittedAabb,
        distanceMeters: Math.sqrt(d2),
      });
    });
    out.sort((a, b) => a.distanceMeters - b.distanceMeters);
    return out;
  };

  const visitFirearmBarrierAabbsInXZ = (
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    visit: (aabb: CollisionAabb) => void,
  ) => {
    collisionSlotVisitSeen.clear();
    visitBucketedSlots(bucketIndex, x0, x1, z0, z1, (slot) => {
      if (collisionSlotVisitSeen.has(slot.rowKey)) return;
      collisionSlotVisitSeen.add(slot.rowKey);
      const aabb = swingDoorFirearmBarrierAabb({
        open01: slot.swingOpen01,
        face: slot.face,
        hingeX: slot.hingeX,
        hingeZ: slot.hingeZ,
        feetY: slot.feetY,
        panelWidthM: slot.panelWidthM,
        panelHeightM: slot.panelHeightM,
        swingInward: slot.swingInward,
      });
      if (!aabb) return;
      if (aabb.max[0] < x0 || aabb.min[0] > x1) return;
      if (aabb.max[2] < z0 || aabb.min[2] > z1) return;
      visit(aabb);
    });
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
      for (const g of lm.groups) {
        g.mesh.removeFromParent();
        g.mesh.dispose();
        g.glassMesh?.removeFromParent();
        g.glassMesh?.dispose();
      }
    }
    levelMeshes.length = 0;
    slotsByKey.clear();
    allSlots.length = 0;
    solidFrameGeom.dispose();
    glazedFrameGeom.dispose();
    glazedGlassGeom.dispose();
    frameMat.dispose();
    glassMat.dispose();
  };

  return {
    dispose,
    tick,
    visitCollisionAabbsInXZ,
    visitFirearmBarrierAabbsInXZ,
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
