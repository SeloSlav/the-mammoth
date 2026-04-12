import * as THREE from "three";
import type { FloorDoc, PlacedObject } from "@the-mammoth/schemas";
import { shaftPlanKey } from "./buildingStairShafts.js";
import {
  addElevatorShaftPlaceholder,
  addStairWellPlaceholder,
} from "./stairElevatorPlaceholders.js";
import {
  collectShaftSlabHoles,
  hollowShellXZRectsWithShaftCutouts,
  subtractHolesFromRect,
  type RectXZ,
  type ShaftSlabHole,
} from "./shaftPlanformClip.js";

type PlaceholderKind = "corridor" | "unit" | "core" | "misc";

function classifyPrefab(prefabId: string): PlaceholderKind {
  const p = prefabId.toLowerCase();
  if (p.includes("corridor") || p.includes("lobby") || p.includes("hall"))
    return "corridor";
  if (p.includes("apartment") || p.includes("unit")) return "unit";
  if (p.includes("stair") || p.includes("elev") || p.includes("core"))
    return "core";
  return "misc";
}

/** Shared materials so massive generated floors do not allocate thousands of materials. */
const mat = {
  corridorFloor: new THREE.MeshStandardMaterial({
    color: 0xb8a898,
    roughness: 0.9,
    metalness: 0.02,
  }),
  corridorCeil: new THREE.MeshStandardMaterial({
    color: 0xcfc5b8,
    roughness: 0.88,
    metalness: 0.02,
  }),
  corridorWall: new THREE.MeshStandardMaterial({
    color: 0xc2b6a6,
    roughness: 0.9,
    metalness: 0.02,
  }),
  unitFloor: new THREE.MeshStandardMaterial({
    color: 0xa3988c,
    roughness: 0.9,
    metalness: 0.03,
  }),
  unitCeil: new THREE.MeshStandardMaterial({
    color: 0xb5aa9e,
    roughness: 0.88,
    metalness: 0.03,
  }),
  unitWall: new THREE.MeshStandardMaterial({
    color: 0xae9f92,
    roughness: 0.9,
    metalness: 0.03,
  }),
  coreFloor: new THREE.MeshStandardMaterial({
    color: 0x8f8a84,
    roughness: 0.9,
    metalness: 0.06,
  }),
  coreCeil: new THREE.MeshStandardMaterial({
    color: 0x9a9590,
    roughness: 0.88,
    metalness: 0.06,
  }),
  coreWall: new THREE.MeshStandardMaterial({
    color: 0x928d87,
    roughness: 0.9,
    metalness: 0.08,
  }),
  miscFloor: new THREE.MeshStandardMaterial({
    color: 0xa8a098,
    roughness: 0.9,
    metalness: 0.03,
  }),
  miscCeil: new THREE.MeshStandardMaterial({
    color: 0xbab2aa,
    roughness: 0.88,
    metalness: 0.03,
  }),
  miscWall: new THREE.MeshStandardMaterial({
    color: 0xb0a89e,
    roughness: 0.9,
    metalness: 0.03,
  }),
  slab: new THREE.MeshStandardMaterial({
    color: 0x6a6460,
    roughness: 0.93,
    metalness: 0.02,
  }),
};

function matsFor(kind: PlaceholderKind): {
  floor: THREE.MeshStandardMaterial;
  ceil: THREE.MeshStandardMaterial;
  wall: THREE.MeshStandardMaterial;
} {
  switch (kind) {
    case "corridor":
      return { floor: mat.corridorFloor, ceil: mat.corridorCeil, wall: mat.corridorWall };
    case "unit":
      return { floor: mat.unitFloor, ceil: mat.unitCeil, wall: mat.unitWall };
    case "core":
      return { floor: mat.coreFloor, ceil: mat.coreCeil, wall: mat.coreWall };
    default:
      return { floor: mat.miscFloor, ceil: mat.miscCeil, wall: mat.miscWall };
  }
}

type HollowShellOpts = {
  shaftHolesPlate: readonly ShaftSlabHole[];
  roomPx: number;
  roomPz: number;
  /** When set (e.g. room has rotation), use solid floor/ceiling plates — cutouts are axis-only. */
  skipShaftCutouts: boolean;
};

function addShellFloorCeilingPieces(
  group: THREE.Group,
  rects: readonly RectXZ[],
  wt: number,
  hy: number,
  floorM: THREE.MeshStandardMaterial,
  ceilM: THREE.MeshStandardMaterial,
): void {
  let fi = 0;
  let ci = 0;
  for (const r of rects) {
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const cx = (r.x0 + r.x1) * 0.5;
    const cz = (r.z0 + r.z1) * 0.5;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w, wt, d), floorM);
    floor.name = rects.length > 1 ? `shell_floor_${fi}` : "shell_floor";
    fi += 1;
    floor.position.set(cx, -hy + wt * 0.5, cz);
    group.add(floor);

    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(w, wt, d), ceilM);
    ceiling.name = rects.length > 1 ? `shell_ceiling_${ci}` : "shell_ceiling";
    ci += 1;
    ceiling.position.set(cx, hy - wt * 0.5, cz);
    group.add(ceiling);
  }
}

/**
 * Hollow shell: floor + ceiling plates (with shaft cutouts when `opts` provided), four thin walls.
 */
function addHollowRoomShell(
  group: THREE.Group,
  sx: number,
  sy: number,
  sz: number,
  kind: PlaceholderKind,
  opts: HollowShellOpts,
): void {
  const wt = 0.12;
  const hx = sx * 0.5;
  const hy = sy * 0.5;
  const hz = sz * 0.5;
  const { floor: floorM, ceil: ceilM } = matsFor(kind);

  const rects = opts.skipShaftCutouts
    ? ([{ x0: -hx, x1: hx, z0: -hz, z1: hz }] as const)
    : hollowShellXZRectsWithShaftCutouts(sx, sz, opts.roomPx, opts.roomPz, opts.shaftHolesPlate);
  addShellFloorCeilingPieces(group, rects, wt, hy, floorM, ceilM);

  // No perimeter placeholder walls — they read as an unwanted low curb around the exterior;
  // stairs / elevator shafts still get their own shells in `stairElevatorPlaceholders`.
}

function expandBoxForPlacedObject(
  min: THREE.Vector3,
  max: THREE.Vector3,
  obj: PlacedObject,
): void {
  const [px, py, pz] = obj.position;
  const sx = obj.scale?.[0] ?? 1;
  const sy = obj.scale?.[1] ?? 1;
  const sz = obj.scale?.[2] ?? 1;
  const hx = sx * 0.5;
  const hy = sy * 0.5;
  const hz = sz * 0.5;
  min.x = Math.min(min.x, px - hx);
  min.y = Math.min(min.y, py - hy);
  min.z = Math.min(min.z, pz - hz);
  max.x = Math.max(max.x, px + hx);
  max.y = Math.max(max.y, py + hy);
  max.z = Math.max(max.z, pz + hz);
}

function addConcreteSlabWithOptionalShaftHoles(
  root: THREE.Group,
  min: THREE.Vector3,
  max: THREE.Vector3,
  marginXZ: number,
  thickness: number,
  holes: readonly ShaftSlabHole[],
): void {
  const x0 = min.x - marginXZ;
  const x1 = max.x + marginXZ;
  const z0 = min.z - marginXZ;
  const z1 = max.z + marginXZ;
  const bottom = min.y - thickness * 0.5;
  const slabRect: RectXZ = { x0, x1, z0, z1 };
  const pieces =
    holes.length > 0 ? subtractHolesFromRect(slabRect, holes) : [slabRect];
  let i = 0;
  for (const p of pieces) {
    const w = p.x1 - p.x0;
    const d = p.z1 - p.z0;
    const cx = (p.x0 + p.x1) * 0.5;
    const cz = (p.z0 + p.z1) * 0.5;
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(w, thickness, d),
      mat.slab,
    );
    slab.name = holes.length > 0 ? `floor_slab_piece_${i}` : "floor_slab_placeholder";
    i += 1;
    slab.position.set(cx, bottom, cz);
    root.add(slab);
  }
}

export type BuildFloorMeshesOptions = {
  /**
   * Skip per-plate stair geometry for columns that are drawn once as full-height shafts
   * (`shaftPlanKey` from `obj.position` XZ).
   */
  stairShaftSkipKeys?: ReadonlySet<string>;
};

/**
 * Turns each `FloorDoc` volume into a hollow shell (floor + ceiling + four walls).
 */
export function buildFloorMeshes(
  doc: FloorDoc,
  opts?: BuildFloorMeshesOptions,
): THREE.Group {
  const root = new THREE.Group();
  root.name = `floor:${doc.id}`;

  const shaftHolesPlate = collectShaftSlabHoles(doc);

  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  let hasBounds = false;

  for (const obj of doc.objects) {
    expandBoxForPlacedObject(min, max, obj);
    hasBounds = true;

    const kind = classifyPrefab(obj.prefabId);
    const sx = obj.scale?.[0] ?? 1;
    const sy = obj.scale?.[1] ?? 1;
    const sz = obj.scale?.[2] ?? 1;

    const room = new THREE.Group();
    room.name = obj.id;
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
      addElevatorShaftPlaceholder(room, sx, sy, sz);
    } else if (pid.includes("stair_well") || pid.includes("stairwell")) {
      const sk = shaftPlanKey(obj.position[0], obj.position[2]);
      if (!opts?.stairShaftSkipKeys?.has(sk)) {
        addStairWellPlaceholder(room, sx, sy, sz);
      }
    } else {
      const skipShaftCutouts = Boolean(obj.rotation);
      addHollowRoomShell(room, sx, sy, sz, kind, {
        shaftHolesPlate: shaftHolesPlate,
        roomPx: obj.position[0],
        roomPz: obj.position[2],
        skipShaftCutouts,
      });
    }
    root.add(room);
  }

  if (hasBounds) {
    addConcreteSlabWithOptionalShaftHoles(root, min, max, 0.8, 0.16, shaftHolesPlate);
  }

  return root;
}
