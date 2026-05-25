import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { StairWellLandingProp, StairWellDef } from "@the-mammoth/schemas";
import {
  landingNearRacetrackAnchor,
  pickCornerLandingNearDoorBand,
  type StairCornerLanding,
  type StairShaftCardinalFace,
  type StairSwitchbackLayout,
} from "./stairWellGeometry.js";
import { ENABLE_STAIRWELL_HEATER_LANDING_PROPS } from "./featureFlags.js";
import { canonicalStairwellLandingPropUniformScale } from "./stairwellLitterCanonicalScale.js";

/** Matches `content/elevator/stairwell.json` heater `landingProps` entries. */
const STAIRWELL_HEATER_LANDING_PROP_MODEL_URL =
  "/static/models/objects/stairwell-heater.glb";

const _loader = new GLTFLoader();
const _templatePromiseByUrl = new Map<string, Promise<THREE.Object3D>>();

export function loadPropTemplate(url: string): Promise<THREE.Object3D> {
  const cached = _templatePromiseByUrl.get(url);
  if (cached) return cached;

  // Node (walk/collision generators, Vitest): Three's FileLoader uses `fetch`, which rejects
  // site-root paths like `/static/...` without a browser origin. Props are visual-only
  // (`mammothNoCollision`); offline tooling does not need mesh data.
  if (typeof window === "undefined") {
    const pending = Promise.resolve(new THREE.Group());
    _templatePromiseByUrl.set(url, pending);
    return pending;
  }

  const pending = _loader
    .loadAsync(url)
    .then((gltf) => gltf.scene)
    .catch((err) => {
      _templatePromiseByUrl.delete(url);
      throw err;
    });
  _templatePromiseByUrl.set(url, pending);
  return pending;
}

type StairWellAuthoringScope = "typical" | "ground";

function stairWellEntryOpeningForScope(
  def: StairWellDef | undefined,
  scope: StairWellAuthoringScope,
): StairWellDef["entryOpening"] {
  return scope === "ground"
    ? (def?.groundEntryOpening ?? def?.entryOpening)
    : def?.entryOpening;
}

/**
 * Picks the corner pad in front of the `entryOpening` cutout, then
 * {@link pickCornerLandingOppositeDoorPad}. Authored `tangentOffsetAlongWallM` is often in
 * editor/plate space; when it does not overlap any pad in a given shaft, we use shaft-local
 * fallbacks.
 */
function pickEntryDoorPadForTopDeck(
  L: StairSwitchbackLayout,
  face: StairShaftCardinalFace,
  topDeck: StairCornerLanding,
  doorHalfW: number,
  omitOnly: StairCornerLanding | undefined,
  authoredTangent: number | undefined,
): StairCornerLanding | undefined {
  /**
   * Authoring often stores full corridor opening width (~2.5 m). {@link pickCornerLandingNearDoorBand}
   * requires the band to overlap a corner pad’s along-wall span — a half-width larger than that span
   * can fail every tangent and yield **no** door pad on typical storeys (ground uses `highest_y` and
   * never hits this path).
   */
  const shaftHalfSpan =
    face === "e" || face === "w"
      ? Math.max(0.15, L.hz * 0.5 - 0.14)
      : Math.max(0.15, L.hx * 0.5 - 0.14);
  const pickHalfW = Math.min(doorHalfW, shaftHalfSpan * 0.92);

  const tryTangent = (t: number) =>
    pickCornerLandingNearDoorBand(L, face, t, pickHalfW, topDeck.y);
  if (authoredTangent != null) {
    const found = tryTangent(authoredTangent);
    if (found) return found;
  }
  const along = face === "e" || face === "w" ? topDeck.z : topDeck.x;
  if (authoredTangent == null || Math.abs(along - authoredTangent) > 1e-4) {
    const a = tryTangent(along);
    if (a) return a;
  }
  if (authoredTangent == null || Math.abs(authoredTangent) > 1e-4) {
    const z = tryTangent(0);
    if (z) return z;
  }
  for (const cl of L.cornerLandings) {
    if (cl === omitOnly) continue;
    if (!landingNearRacetrackAnchor(L, cl, face)) continue;
    if (Math.abs(cl.y - topDeck.y) > 0.35) continue;
    const tAlong = face === "e" || face === "w" ? cl.z : cl.x;
    const found = tryTangent(tAlong);
    if (found) return found;
  }
  let best: StairCornerLanding | undefined;
  let bestDy = Infinity;
  for (const cl of L.cornerLandings) {
    if (cl === omitOnly) continue;
    if (!landingNearRacetrackAnchor(L, cl, face)) continue;
    const dy = Math.abs(cl.y - topDeck.y);
    if (dy < bestDy) {
      bestDy = dy;
      best = cl;
    }
  }
  return best;
}

/**
 * Corner pad opposite the authored {@link StairWellDef.entryOpening} (big stair door), at the
 * **highest** deck of the segment (top landing of each one-storey column segment).
 */
export function pickCornerLandingOppositeEntryOpening(
  L: StairSwitchbackLayout,
  def: StairWellDef | undefined,
  scope: StairWellAuthoringScope,
  omitOnly?: StairCornerLanding,
): StairCornerLanding | undefined {
  const o = stairWellEntryOpeningForScope(def, scope);
  const face = o?.face;
  if (!face) return undefined;
  const topDeck = pickCornerLandingHighestY(L, omitOnly);
  if (!topDeck) return undefined;
  const widthM = o.widthM ?? 2.2;
  const doorHalfW = widthM * 0.5;
  const doorLanding = pickEntryDoorPadForTopDeck(
    L,
    face,
    topDeck,
    doorHalfW,
    omitOnly,
    o.tangentOffsetAlongWallM,
  );
  if (!doorLanding) return undefined;
  return pickCornerLandingOppositeDoorPad(L, doorLanding, omitOnly);
}

/** Minimal door resolve for landing selection (matches {@link ResolvedStairWellGroundDoor}). */
type PrimaryDoorLike = {
  face: StairShaftCardinalFace;
  tangentOffsetAlongWallM: number;
  doorHalfW: number;
  centerYM: number;
};

/**
 * Corner landing that is **not** carrying the primary corridor door pad (best for props).
 * When the door pad cannot be resolved, picks the northernmost (+Z) candidate.
 */
function pickCornerLandingOppositeDoorPad(
  L: StairSwitchbackLayout,
  doorLanding: StairCornerLanding,
  omitOnly?: StairCornerLanding,
): StairCornerLanding | undefined {
  const candidates = L.cornerLandings.filter((cl) => cl !== omitOnly);
  if (candidates.length === 0) return undefined;
  const others = candidates.filter((cl) => cl !== doorLanding);
  if (others.length === 1) return others[0];
  if (others.length > 1) {
    let best: StairCornerLanding | undefined;
    let bestDy = Infinity;
    for (const cl of others) {
      const dy = Math.abs(cl.y - doorLanding.y);
      if (dy < bestDy) {
        bestDy = dy;
        best = cl;
      }
    }
    return best;
  }
  /**
   * Degenerate small layouts (or the only non-omitted pad is the door pad): no distinct “opposite”
   * slab — fall back to the door pad so a prop can still spawn (corner inset keeps it inboard).
   */
  return doorLanding;
}

export function pickCornerLandingOppositePrimaryDoor(
  L: StairSwitchbackLayout,
  primary: PrimaryDoorLike | null | undefined,
  omitOnly?: StairCornerLanding,
): StairCornerLanding | undefined {
  const candidates = L.cornerLandings.filter((cl) => cl !== omitOnly);
  if (candidates.length === 0) return undefined;

  const doorLanding =
    primary &&
    pickCornerLandingNearDoorBand(
      L,
      primary.face,
      primary.tangentOffsetAlongWallM,
      primary.doorHalfW,
      primary.centerYM,
    );

  if (doorLanding) {
    const opposite = pickCornerLandingOppositeDoorPad(L, doorLanding, omitOnly);
    if (opposite) return opposite;
  }

  let best: StairCornerLanding | undefined;
  let bestZ = -Infinity;
  for (const cl of candidates) {
    if (cl.z > bestZ) {
      bestZ = cl.z;
      best = cl;
    }
  }
  return best;
}

/**
 * Corner landing with the greatest deck height in the segment, ignoring an optional omitted pad
 * (e.g. ground lobby corner that has no mesh).
 */
export function pickCornerLandingHighestY(
  L: StairSwitchbackLayout,
  omitOnly?: StairCornerLanding,
): StairCornerLanding | undefined {
  const candidates = L.cornerLandings.filter((cl) => cl !== omitOnly);
  if (candidates.length === 0) return undefined;
  let best = candidates[0]!;
  for (let i = 1; i < candidates.length; i++) {
    const cl = candidates[i]!;
    if (cl.y > best.y + 1e-9) best = cl;
    else if (Math.abs(cl.y - best.y) <= 1e-9 && cl.z > best.z) best = cl;
  }
  return best;
}

/** Bottommost corner deck in the segment (ignore optional omitted mesh ref). */
export function pickCornerLandingLowestY(
  L: StairSwitchbackLayout,
  omitOnly?: StairCornerLanding,
): StairCornerLanding | undefined {
  const candidates = L.cornerLandings.filter((cl) => cl !== omitOnly);
  if (candidates.length === 0) return undefined;
  let best = candidates[0]!;
  for (let i = 1; i < candidates.length; i++) {
    const cl = candidates[i]!;
    if (cl.y < best.y - 1e-9) best = cl;
    else if (Math.abs(cl.y - best.y) <= 1e-9 && cl.z > best.z) best = cl;
  }
  return best;
}

function landingLocalCornerPosition(
  cl: Pick<StairCornerLanding, "halfW" | "halfD" | "thicknessHalf">,
  prop: StairWellLandingProp,
): THREE.Vector3 {
  const insetXM = prop.anchor.insetXM ?? 0.45;
  const insetZM = prop.anchor.insetZM ?? 0.35;
  const liftM = prop.anchor.liftM ?? 0.02;
  const { halfW: hw, halfD: hd, thicknessHalf: th } = cl;
  const corner = prop.anchor.corner;
  let x = 0;
  let z = 0;
  switch (corner) {
    case "ne":
      x = hw - insetXM;
      z = hd - insetZM;
      break;
    case "nw":
      x = -hw + insetXM;
      z = hd - insetZM;
      break;
    case "se":
      x = hw - insetXM;
      z = -hd + insetZM;
      break;
    case "sw":
      x = -hw + insetXM;
      z = -hd + insetZM;
      break;
    default:
      x = hw - insetXM;
      z = hd - insetZM;
  }
  const y = th + liftM;
  const v = new THREE.Vector3(x, y, z);
  const p = prop.pivotOffsetM;
  if (p) v.add(new THREE.Vector3(p[0], p[1], p[2]));
  return v;
}

function alignSceneToAnchorCorner(
  scene: THREE.Object3D,
  prop: StairWellLandingProp,
): void {
  const box = new THREE.Box3().setFromObject(scene);
  if (box.isEmpty()) return;
  let x = 0;
  let z = 0;
  switch (prop.anchor.corner) {
    case "ne":
      x = box.max.x;
      z = box.max.z;
      break;
    case "nw":
      x = box.min.x;
      z = box.max.z;
      break;
    case "se":
      x = box.max.x;
      z = box.min.z;
      break;
    case "sw":
      x = box.min.x;
      z = box.min.z;
      break;
  }
  // Land the model on the slab and pin the selected bbox corner to the wrap origin.
  scene.position.set(-x, -box.min.y, -z);
}

export function findLandingMeshForCorner(
  root: THREE.Object3D,
  landing: StairCornerLanding,
): THREE.Mesh | undefined {
  let found: THREE.Mesh | undefined;
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (o.userData.mammothStairCornerLandingRef === landing) found = o;
  });
  return found;
}

function propAllowedForScope(
  prop: StairWellLandingProp,
  scope: StairWellAuthoringScope,
): boolean {
  if (prop.skipGroundStorey === true && scope === "ground") return false;
  const scopes = prop.applyToScopes;
  if (scopes && scopes.length > 0) return scopes.includes(scope);
  return true;
}

function propAllowedForTopOccupiedStairStorey(
  prop: StairWellLandingProp,
  isTopOccupiedStairStorey: boolean | undefined,
): boolean {
  if (prop.onlyOnTopOccupiedStairStorey === true && isTopOccupiedStairStorey !== true) {
    return false;
  }
  return true;
}

/**
 * Parents GLB props under the correct corner-landing mesh (after part transform deltas).
 * Loads asynchronously; failures are logged once.
 */
export function attachStairWellLandingProps(args: {
  root: THREE.Group;
  def: StairWellDef | undefined;
  authoringScope: StairWellAuthoringScope;
  L: StairSwitchbackLayout;
  primaryDoor: PrimaryDoorLike | null | undefined;
  omitOnlyLanding: StairCornerLanding | undefined;
  /**
   * True for the stair segment that **owns** the roof-exit deck mesh (storey below the cap with
   * {@link addStairWellPlaceholder}'s `omitTopLanding`). Used for props that should only appear on
   * that top inhabited flight.
   */
  isTopOccupiedStairStorey?: boolean;
  /**
   * Top shaft segment uses {@link addStairWellPlaceholder}'s `omitTopLanding`: the roof slab corner
   * is omitted, but the deck below still exists as the **upper** corner landing of the storey
   * below. Typical `landingProps` (e.g. `applyToScopes: ["typical"]`) would attach again on this
   * segment’s coincident landing mesh → duplicate GLBs (two heaters on the pad before the roof door).
   * Ground-scoped props (single-storey lobby) must still run.
   */
  skipTypicalLandingProps?: boolean;
}): void {
  const props = args.def?.landingProps;
  if (!props || props.length === 0) return;

  for (const prop of props) {
    if (
      !ENABLE_STAIRWELL_HEATER_LANDING_PROPS &&
      prop.modelUrl === STAIRWELL_HEATER_LANDING_PROP_MODEL_URL
    ) {
      continue;
    }
    if (
      args.skipTypicalLandingProps === true &&
      prop.applyToScopes?.includes("typical") === true
    ) {
      continue;
    }
    if (!propAllowedForScope(prop, args.authoringScope)) continue;
    if (!propAllowedForTopOccupiedStairStorey(prop, args.isTopOccupiedStairStorey)) continue;

    let cl: StairCornerLanding | undefined;
    switch (prop.landingSelector.kind) {
      case "opposite_primary_door":
        cl = pickCornerLandingOppositePrimaryDoor(
          args.L,
          args.primaryDoor,
          args.omitOnlyLanding,
        );
        break;
      case "highest_y":
        cl = pickCornerLandingHighestY(args.L, args.omitOnlyLanding);
        break;
      case "lowest_y":
        cl = pickCornerLandingLowestY(args.L, args.omitOnlyLanding);
        break;
      case "opposite_entry_opening":
        cl = pickCornerLandingOppositeEntryOpening(
          args.L,
          args.def,
          args.authoringScope,
          args.omitOnlyLanding,
        );
        break;
      default: {
        const _never: never = prop.landingSelector;
        void _never;
      }
    }
    if (!cl) continue;
    if (
      prop.skipIfResolvedIsTopDeckOnTopOccupiedStairStorey === true &&
      args.isTopOccupiedStairStorey === true
    ) {
      const topDeck = pickCornerLandingHighestY(args.L, args.omitOnlyLanding);
      if (topDeck && cl === topDeck) continue;
    }

    const landingMesh = findLandingMeshForCorner(args.root, cl);
    if (!landingMesh) continue;
    /** FP static-world build merges stair columns by material; preserve this landing subtree. */
    landingMesh.userData.mammothSkipFloorGeometryMerge = true;

    const localPos = landingLocalCornerPosition(cl, prop);
    const wrap = new THREE.Group();
    wrap.name = `stairwell_prop_${prop.id}`;
    wrap.userData.mammothUnitInterior = true;
    wrap.position.copy(localPos);
    const yaw = prop.anchor.yawRad ?? 0;
    if (yaw !== 0) wrap.rotation.y = yaw;
    const u = canonicalStairwellLandingPropUniformScale({
      modelUrl: prop.modelUrl,
      authoredUniformScale: prop.anchor.uniformScale,
    });
    if (u !== 1) wrap.scale.set(u, u, u);

    landingMesh.add(wrap);

    const url = prop.modelUrl;
    void loadPropTemplate(url).then(
      (template) => {
        const scene = template.clone(true);
        scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = false;
            m.receiveShadow = false;
            m.userData.mammothUnitInterior = true;
            /** High-poly GLB — do not feed every triangle into static AABB bake (see collisionScene). */
            m.userData.mammothNoCollision = true;
          }
        });
        alignSceneToAnchorCorner(scene, prop);
        wrap.add(scene);
      },
      (err) => {
        console.warn(
          `[attachStairWellLandingProps] failed to load "${url}" for prop "${prop.id}":`,
          err,
        );
      },
    );
  }
}
