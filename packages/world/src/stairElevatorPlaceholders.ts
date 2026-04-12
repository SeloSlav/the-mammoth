import * as THREE from "three";
import {
  computeSwitchbackStairLayout,
  pickStairShaftGroundDoorPlacement,
  STOREY_SPACING_M,
  type SwitchbackStairOpts,
} from "./stairWellGeometry.js";
import {
  addDoorFrameTrimConstantX,
  addDoorFrameTrimConstantZ,
  addWallConstantXWithHoles,
  addWallConstantZWithHoles,
  pickFaceTowardPoint,
  type CardinalFace,
  type WallHoleXY,
  type WallHoleYZ,
} from "./wallWithDoorCutout.js";

const stairTread = new THREE.MeshStandardMaterial({
  color: 0xc8c0b4,
  roughness: 0.75,
  metalness: 0.04,
  emissive: 0x2a2218,
  emissiveIntensity: 0.06,
});
const landingMat = new THREE.MeshStandardMaterial({
  color: 0x9e968c,
  roughness: 0.85,
  metalness: 0.04,
  emissive: 0x1a1814,
  emissiveIntensity: 0.04,
});
const railMat = new THREE.MeshStandardMaterial({
  color: 0x5c5a58,
  roughness: 0.35,
  metalness: 0.35,
});
const shaftWall = new THREE.MeshStandardMaterial({
  color: 0x7a7d82,
  roughness: 0.55,
  metalness: 0.25,
  emissive: 0x252830,
  emissiveIntensity: 0.09,
});
/** Pit / landing slab at hoistway bottom (world slab is open here — must not read as outdoor grass). */
const hoistwayFloor = new THREE.MeshStandardMaterial({
  color: 0x5c5a58,
  roughness: 0.94,
  metalness: 0.03,
});
/** Slightly brighter than hoistways so stair volumes read in dim lobby light. */
const stairShaftWall = new THREE.MeshStandardMaterial({
  color: 0x9ea2aa,
  roughness: 0.58,
  metalness: 0.12,
  emissive: 0x101418,
  emissiveIntensity: 0.05,
});
const shaftCeil = new THREE.MeshStandardMaterial({
  color: 0x6a6d72,
  roughness: 0.5,
  metalness: 0.2,
});
const doorFrameMat = new THREE.MeshStandardMaterial({
  color: 0x4a4846,
  roughness: 0.42,
  metalness: 0.55,
});

/**
 * Ground-level hoistway / stair entry: **double-door clear width** (m).
 * Leaf geometry comes later — opening + frame trim only for now.
 */
const SHAFT_DOUBLE_DOOR_W = 1.86;
const SHAFT_DOUBLE_DOOR_H = 2.2;
const SHAFT_DOOR_SILL = 0.05;
/** Ground-level door cutout only reaches this high on mega stair shafts (m). */
export const SHAFT_GROUND_DOOR_BAND_M = STOREY_SPACING_M - 0.38;

export type ShaftGroundDoorOpts = {
  /**
   * Elevators: set explicitly. Stair wells: omit and provide `towardPlateXZ` + `shaftPlateXZ`
   * so a face is chosen away from circulating treads / corner landings.
   */
  face?: CardinalFace;
  /**
   * Vertical band from interior floor where a door opening may be cut (m).
   * Full-height shells use the whole wall; mega shafts use ~one storey.
   */
  bandHeightM: number;
  /** Plate-space XZ (e.g. floor centroid) for stair door tie-break / fallback. */
  towardPlateXZ?: readonly [number, number];
  /** Plate-space XZ of this shaft’s column (stair auto door only). */
  shaftPlateXZ?: readonly [number, number];
  /**
   * Hole centre offset along wall tangent (+Z for E/W, +X for N/S). Stairs: set by auto placement.
   */
  tangentOffsetAlongWall?: number;
};

type ShaftShellOpts = {
  /** If false, no bottom slab (hoistway stays open through stacked floors). */
  includeFloor: boolean;
  /** If false, top stays open so you can see through stacked storeys. */
  includeCeiling: boolean;
  /** Bottom slab mat when `includeFloor`; defaults to wall mat. */
  floorMat?: THREE.MeshStandardMaterial;
  /** When no ceiling: lengthen interior walls slightly to tuck past storey plate seams. */
  openTopWallExtend?: number;
  /** Single ground-level opening (toward lobby / building core). */
  groundDoor?: ShaftGroundDoorOpts | null;
};

function addShaftShell(
  group: THREE.Group,
  sx: number,
  sy: number,
  sz: number,
  wallM: THREE.MeshStandardMaterial,
  ceilM: THREE.MeshStandardMaterial,
  opts: ShaftShellOpts,
): void {
  const wt = 0.11;
  const hx = sx * 0.5;
  const hy = sy * 0.5;
  const hz = sz * 0.5;
  const topExtend =
    opts.includeCeiling ? 0 : Math.max(0, opts.openTopWallExtend ?? 0);
  const innerWallH = Math.max(sy - 2 * wt + topExtend, 0.08);
  const wallCenterY = (-hy + wt) + innerWallH * 0.5;
  const vlenX = Math.max(sx - 2 * wt, 0.05);
  const vlenZ = Math.max(sz - 2 * wt, 0.05);
  const yWallBottom = wallCenterY - innerWallH * 0.5;
  const yWallTop = wallCenterY + innerWallH * 0.5;

  if (opts.includeFloor) {
    const floorMat = opts.floorMat ?? wallM;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(sx, wt, sz), floorMat);
    floor.name = "shaft_floor";
    floor.position.set(0, -hy + wt * 0.5, 0);
    group.add(floor);
  }

  if (opts.includeCeiling) {
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(sx, wt, sz), ceilM);
    ceiling.name = "shaft_ceiling";
    ceiling.position.set(0, hy - wt * 0.5, 0);
    group.add(ceiling);
  }

  const door = opts.groundDoor ?? null;
  const bandCap = door
    ? Math.max(0.55, Math.min(door.bandHeightM, innerWallH))
    : innerWallH;
  const splitShaft = Boolean(door && bandCap < innerWallH - 0.08);
  const ySplit = yWallBottom + bandCap;

  const doorHalfW = Math.min(
    SHAFT_DOUBLE_DOOR_W * 0.5,
    vlenZ * 0.5 - 0.06,
    vlenX * 0.5 - 0.06,
  );
  const doorH = Math.min(
    SHAFT_DOUBLE_DOOR_H,
    bandCap - SHAFT_DOOR_SILL - 0.06,
  );
  const yDoor0 = yWallBottom + SHAFT_DOOR_SILL;
  const yDoor1 = yDoor0 + Math.max(0.55, doorH);
  /** Along-wall shift: +Z for E/W door walls, +X for N/S (matches stair placement). */
  const doorTangent = door?.tangentOffsetAlongWall ?? 0;

  const addEastWest = (
    face: "e" | "w",
    xCenter: number,
    withDoor: boolean,
    y0: number,
    y1: number,
    name: string,
  ): void => {
    const zMin = -vlenZ * 0.5;
    const zMax = vlenZ * 0.5;
    if (withDoor && door && yDoor1 <= y1 + 1e-3 && yDoor0 >= y0 - 1e-3) {
      const z0 = Math.max(zMin, doorTangent - doorHalfW);
      const z1 = Math.min(zMax, doorTangent + doorHalfW);
      const holes: WallHoleYZ[] =
        z1 > z0 + 0.08
          ? [
              {
                z0,
                z1,
                y0: yDoor0,
                y1: Math.min(yDoor1, y1),
              },
            ]
          : [];
      addWallConstantXWithHoles(
        group,
        wallM,
        xCenter,
        wt,
        zMin,
        zMax,
        y0,
        y1,
        holes,
        name,
      );
      const xInner = face === "e" ? hx - wt : -hx + wt;
      const inwardX = face === "e" ? -1 : 1;
      if (holes.length > 0) {
        addDoorFrameTrimConstantX(
          group,
          doorFrameMat,
          xInner,
          inwardX,
          z0,
          z1,
          yDoor0,
          Math.min(yDoor1, y1),
          `${name}_frame`,
        );
      }
    } else {
      addWallConstantXWithHoles(
        group,
        wallM,
        xCenter,
        wt,
        zMin,
        zMax,
        y0,
        y1,
        [],
        name,
      );
    }
  };

  const addNorthSouth = (
    face: "n" | "s",
    zCenter: number,
    withDoor: boolean,
    y0: number,
    y1: number,
    name: string,
  ): void => {
    const xMin = -vlenX * 0.5;
    const xMax = vlenX * 0.5;
    if (withDoor && door && yDoor1 <= y1 + 1e-3 && yDoor0 >= y0 - 1e-3) {
      const x0 = Math.max(xMin, doorTangent - doorHalfW);
      const x1 = Math.min(xMax, doorTangent + doorHalfW);
      const holes: WallHoleXY[] =
        x1 > x0 + 0.08
          ? [
              {
                x0,
                x1,
                y0: yDoor0,
                y1: Math.min(yDoor1, y1),
              },
            ]
          : [];
      addWallConstantZWithHoles(
        group,
        wallM,
        zCenter,
        wt,
        xMin,
        xMax,
        y0,
        y1,
        holes,
        name,
      );
      const zInner = face === "n" ? hz - wt : -hz + wt;
      const inwardZ = face === "n" ? -1 : 1;
      if (holes.length > 0) {
        addDoorFrameTrimConstantZ(
          group,
          doorFrameMat,
          zInner,
          inwardZ,
          x0,
          x1,
          yDoor0,
          Math.min(yDoor1, y1),
          `${name}_frame`,
        );
      }
    } else {
      addWallConstantZWithHoles(
        group,
        wallM,
        zCenter,
        wt,
        xMin,
        xMax,
        y0,
        y1,
        [],
        name,
      );
    }
  };

  if (!door) {
    addEastWest("e", hx - wt * 0.5, false, yWallBottom, yWallTop, "shaft_wall_e");
    addEastWest("w", -hx + wt * 0.5, false, yWallBottom, yWallTop, "shaft_wall_w");
    addNorthSouth("n", hz - wt * 0.5, false, yWallBottom, yWallTop, "shaft_wall_n");
    addNorthSouth("s", -hz + wt * 0.5, false, yWallBottom, yWallTop, "shaft_wall_s");
    return;
  }

  const face = door.face!;
  if (!splitShaft) {
    addEastWest("e", hx - wt * 0.5, face === "e", yWallBottom, yWallTop, "shaft_wall_e");
    addEastWest("w", -hx + wt * 0.5, face === "w", yWallBottom, yWallTop, "shaft_wall_w");
    addNorthSouth("n", hz - wt * 0.5, face === "n", yWallBottom, yWallTop, "shaft_wall_n");
    addNorthSouth("s", -hz + wt * 0.5, face === "s", yWallBottom, yWallTop, "shaft_wall_s");
    return;
  }

  addEastWest("e", hx - wt * 0.5, face === "e", yWallBottom, ySplit, "shaft_wall_e_lo");
  addEastWest("e", hx - wt * 0.5, false, ySplit, yWallTop, "shaft_wall_e_hi");
  addEastWest("w", -hx + wt * 0.5, face === "w", yWallBottom, ySplit, "shaft_wall_w_lo");
  addEastWest("w", -hx + wt * 0.5, false, ySplit, yWallTop, "shaft_wall_w_hi");
  addNorthSouth("n", hz - wt * 0.5, face === "n", yWallBottom, ySplit, "shaft_wall_n_lo");
  addNorthSouth("n", hz - wt * 0.5, false, ySplit, yWallTop, "shaft_wall_n_hi");
  addNorthSouth("s", -hz + wt * 0.5, face === "s", yWallBottom, ySplit, "shaft_wall_s_lo");
  addNorthSouth("s", -hz + wt * 0.5, false, ySplit, yWallTop, "shaft_wall_s_hi");
}

/**
 * Open-top hoistway (no ceiling) so stacked floors read as one continuous shaft.
 * Optional **concrete pit floor** at the hoistway bottom (use on ground storey only): when every
 * stacked plate adds a slab, each reads as a ceiling to the storey below.
 */
export type ElevatorShaftPlaceholderOpts = {
  groundDoor?: ShaftGroundDoorOpts | null;
  /**
   * Bottom concrete slab inside the shaft. False on upper stacked storeys so the hoistway is
   * open through; true on story 1 (pit over structural hole). Defaults to true when omitted.
   */
  includePitFloor?: boolean;
};

export function addElevatorShaftPlaceholder(
  group: THREE.Group,
  sx: number,
  sy: number,
  sz: number,
  opts?: ElevatorShaftPlaceholderOpts | null,
): void {
  const includePitFloor = opts?.includePitFloor !== false;
  addShaftShell(group, sx, sy, sz, shaftWall, shaftCeil, {
    includeFloor: includePitFloor,
    includeCeiling: false,
    floorMat: hoistwayFloor,
    openTopWallExtend: 0.06,
    groundDoor: opts?.groundDoor ?? null,
  });
}

/**
 * Circulating stair in a rectangular shaft (open top): perimeter runs + corner landings, stacked
 * per storey on tall shafts.
 */
export type StairWellPlaceholderOpts = SwitchbackStairOpts & {
  groundDoor?: ShaftGroundDoorOpts | null;
};

export function addStairWellPlaceholder(
  group: THREE.Group,
  sx: number,
  sy: number,
  sz: number,
  opts?: StairWellPlaceholderOpts,
): void {
  const { groundDoor, ...layoutOpts } = opts ?? {};
  const L = computeSwitchbackStairLayout(sx, sy, sz, layoutOpts);

  let resolvedShellDoor: ShaftGroundDoorOpts | null = null;
  if (groundDoor) {
    const wt = 0.11;
    const hy = sy * 0.5;
    const innerWallH = Math.max(sy - 2 * wt, 0.08);
    const wallCenterY = (-hy + wt) + innerWallH * 0.5;
    const yWallBottom = wallCenterY - innerWallH * 0.5;
    const yWallTop = wallCenterY + innerWallH * 0.5;
    const bandCap = Math.max(0.55, Math.min(groundDoor.bandHeightM, innerWallH));
    const splitShaft = bandCap < innerWallH - 0.08;
    const ySplit = yWallBottom + bandCap;
    const vlenX = Math.max(sx - 2 * wt, 0.05);
    const vlenZ = Math.max(sz - 2 * wt, 0.05);
    const doorHalfW = Math.min(
      SHAFT_DOUBLE_DOOR_W * 0.5,
      vlenZ * 0.5 - 0.06,
      vlenX * 0.5 - 0.06,
    );
    const doorH = Math.min(SHAFT_DOUBLE_DOOR_H, bandCap - SHAFT_DOOR_SILL - 0.06);
    const yDoor0 = yWallBottom + SHAFT_DOOR_SILL;
    const doorInnerTop = yDoor0 + Math.max(0.55, doorH);
    const yHoleTop = Math.min(doorInnerTop, splitShaft ? ySplit : yWallTop);

    let face: CardinalFace;
    let tangentOffsetAlongWall = groundDoor.tangentOffsetAlongWall ?? 0;
    if (groundDoor.face != null) {
      face = groundDoor.face;
    } else if (groundDoor.towardPlateXZ && groundDoor.shaftPlateXZ) {
      const placement = pickStairShaftGroundDoorPlacement(L, {
        sx,
        sz,
        wallThickness: wt,
        doorHalfWidthM: doorHalfW,
        doorY0Local: yDoor0,
        doorY1Local: yHoleTop,
        collisionYMaxLocal: splitShaft ? ySplit + 0.06 : undefined,
        towardX: groundDoor.towardPlateXZ[0],
        towardZ: groundDoor.towardPlateXZ[1],
        shaftPx: groundDoor.shaftPlateXZ[0],
        shaftPz: groundDoor.shaftPlateXZ[1],
      });
      face = placement.face;
      tangentOffsetAlongWall = placement.tangentOffsetM;
    } else {
      face = pickFaceTowardPoint(0, 0, 1, 0);
    }

    resolvedShellDoor = {
      bandHeightM: groundDoor.bandHeightM,
      face,
      tangentOffsetAlongWall,
    };
  }

  addShaftShell(group, sx, sy, sz, stairShaftWall, shaftCeil, {
    includeFloor: true,
    includeCeiling: false,
    groundDoor: resolvedShellDoor,
  });

  const { innerWallH, wallCenterY, ix0, ix1, iz0, iz1 } = L;

  let ti = 0;
  for (const tr of L.treads) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(tr.halfAlong * 2, tr.riseHalf * 2, tr.halfAcross * 2),
      stairTread,
    );
    mesh.name = `stair_tread_${ti}`;
    ti += 1;
    mesh.position.set(tr.x, tr.y, tr.z);
    mesh.rotation.y = tr.yaw;
    group.add(mesh);
  }

  let li = 0;
  for (const cl of L.cornerLandings) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(
        cl.halfW * 2,
        cl.thicknessHalf * 2,
        cl.halfD * 2,
      ),
      landingMat,
    );
    mesh.name = `stair_corner_landing_${li}`;
    li += 1;
    mesh.position.set(cl.x, cl.y, cl.z);
    group.add(mesh);
  }

  const railPost = 0.055;
  const corners: readonly [number, number][] = [
    [ix0, iz0],
    [ix1, iz0],
    [ix1, iz1],
    [ix0, iz1],
  ];
  let pi = 0;
  for (const [rx, rz] of corners) {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(railPost, innerWallH, railPost),
      railMat,
    );
    post.name = `stair_rail_post_${pi}`;
    pi += 1;
    post.position.set(rx, wallCenterY, rz);
    group.add(post);
  }
}
