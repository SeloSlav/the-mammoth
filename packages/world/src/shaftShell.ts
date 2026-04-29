import * as THREE from "three";
import {
  SHAFT_DOUBLE_DOOR_H,
  SHAFT_DOUBLE_DOOR_W,
  type ShaftGroundDoorOpts,
} from "./stairElevatorShaftConstants.js";
import { normalizeStairDoorVerticalSpan } from "./stairShaftDoorGeometry.js";
import { doorFrameMat } from "./shaftHoistwayMaterials.js";
import {
  addDoorFrameTrimConstantX,
  addDoorFrameTrimConstantZ,
  addWallConstantXWithHoles,
  addWallConstantZWithHoles,
  applyWorldMetricUvsToAxisAlignedBoxMesh,
  pickFaceTowardPoint,
  type CardinalFace,
  type WallHoleXY,
  type WallHoleYZ,
} from "./wallWithDoorCutout.js";

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
  /**
   * Additional fully resolved door openings. Unlike the legacy extra-hole arrays, these retain the
   * target wall face so mixed-axis combinations (for example west + south) render correctly.
   */
  supplementalDoors?: readonly ShaftGroundDoorOpts[];
  /**
   * Extra corridor door holes on the **east/west** door wall (same YZ convention as the primary
   * door). When non-empty, the shell is not split; used for full-height mega shafts (one band
   * per storey).
   */
  corridorDoorExtraHolesYZ?: readonly WallHoleYZ[];
  /** Same for **north/south** door walls (XY holes). */
  corridorDoorExtraHolesXY?: readonly WallHoleXY[];
  /**
   * Extend the **door** façade wall outward (toward the adjacent corridor shell) by this much
   * so thin air gaps between shaft boxes and hollow corridor shells do not read as missing exterior.
   */
  corridorFlushGapM?: number;
  /**
   * Inset trim meshes around door cutouts (elevator hoistways). Stairwells omit this — opening is
   * wall material only.
   */
  includeDoorFrameTrim?: boolean;
  /**
   * Plate-space cardinals for faces on the building perimeter; those walls use {@link exteriorWallMat}
   * (facade concrete). Interior faces keep `wallM`.
   */
  exteriorShaftFaces?: readonly CardinalFace[];
  exteriorWallMat?: THREE.MeshStandardMaterial;
};

export function addShaftShell(
  group: THREE.Group,
  sx: number,
  sy: number,
  sz: number,
  wallM: THREE.MeshStandardMaterial,
  ceilM: THREE.MeshStandardMaterial,
  opts: ShaftShellOpts,
): void {
  const wt = 0.11;
  const exteriorCladdingThickness = 0.016;
  const hx = sx * 0.5;
  const hy = sy * 0.5;
  const hz = sz * 0.5;
  const extMat = opts.exteriorWallMat;
  const extFaces = opts.exteriorShaftFaces;
  const hasExteriorFace = (card: CardinalFace): boolean => Boolean(extMat && extFaces?.includes(card));
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
    applyWorldMetricUvsToAxisAlignedBoxMesh(floor);
    floor.userData.mammothAxisAlignedCollisionBox = true;
    group.add(floor);
  }

  if (opts.includeCeiling) {
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(sx, wt, sz), ceilM);
    ceiling.name = "shaft_ceiling";
    ceiling.position.set(0, hy - wt * 0.5, 0);
    group.add(ceiling);
  }

  const door = opts.groundDoor ?? null;
  const supplementalDoors = opts.supplementalDoors ?? [];
  const extraHolesYZ = opts.corridorDoorExtraHolesYZ ?? [];
  const extraHolesXY = opts.corridorDoorExtraHolesXY ?? [];
  const doorFrameTrim = opts.includeDoorFrameTrim === true;
  const multiCorridorDoors =
    supplementalDoors.length > 0 || extraHolesYZ.length > 0 || extraHolesXY.length > 0;
  const bandCap = door
    ? Math.max(0.55, Math.min(door.bandHeightM, innerWallH))
    : innerWallH;
  const doorOpeningYMax =
    door && door.bandHeightM >= innerWallH - 0.02 ? yWallTop : yWallTop - 0.04;
  const splitShaft =
    Boolean(door && bandCap < innerWallH - 0.08) && !multiCorridorDoors;
  const ySplit = yWallBottom + bandCap;

  const doorHalfW = Math.min(
    (door?.doorWidthM ?? SHAFT_DOUBLE_DOOR_W) * 0.5,
    vlenZ * 0.5 - 0.06,
    vlenX * 0.5 - 0.06,
  );
  const doorH = Math.min(SHAFT_DOUBLE_DOOR_H, bandCap - 0.06);
  let yDoor0 = yWallBottom;
  let yDoor1 = yDoor0 + Math.max(0.55, doorH);
  if (
    door?.doorHoleY0Local != null &&
    door?.doorHoleY1Local != null &&
    Number.isFinite(door.doorHoleY0Local) &&
    Number.isFinite(door.doorHoleY1Local)
  ) {
    const a = Math.min(door.doorHoleY0Local, door.doorHoleY1Local);
    const b = Math.max(door.doorHoleY0Local, door.doorHoleY1Local);
    yDoor0 = Math.max(yWallBottom, a);
    yDoor1 = Math.min(doorOpeningYMax, b);
  }
  ({ y0: yDoor0, y1: yDoor1 } = normalizeStairDoorVerticalSpan(
    yWallBottom,
    doorOpeningYMax,
    yDoor0,
    yDoor1,
  ));
  /** Along-wall shift: +Z for E/W door walls, +X for N/S (matches stair placement). */
  const doorTangent = door?.tangentOffsetAlongWall ?? 0;

  const addExteriorCladdingX = (
    face: "e" | "w",
    xCenter: number,
    wallThickness: number,
    zMin: number,
    zMax: number,
    y0: number,
    y1: number,
    holes: readonly WallHoleYZ[],
    name: string,
  ): void => {
    if (!extMat || !hasExteriorFace(face)) return;
    const outward = face === "e" ? 1 : -1;
    const skinX =
      xCenter + outward * (wallThickness * 0.5 + exteriorCladdingThickness * 0.5 + 0.001);
    addWallConstantXWithHoles(
      group,
      extMat,
      skinX,
      exteriorCladdingThickness,
      zMin,
      zMax,
      y0,
      y1,
      holes,
      `${name}_exterior`,
      { noCollision: true },
    );
  };

  const addExteriorCladdingZ = (
    face: "n" | "s",
    zCenter: number,
    wallThickness: number,
    xMin: number,
    xMax: number,
    y0: number,
    y1: number,
    holes: readonly WallHoleXY[],
    name: string,
  ): void => {
    if (!extMat || !hasExteriorFace(face)) return;
    const outward = face === "n" ? 1 : -1;
    const skinZ =
      zCenter + outward * (wallThickness * 0.5 + exteriorCladdingThickness * 0.5 + 0.001);
    addWallConstantZWithHoles(
      group,
      extMat,
      skinZ,
      exteriorCladdingThickness,
      xMin,
      xMax,
      y0,
      y1,
      holes,
      `${name}_exterior`,
      { noCollision: true },
    );
  };

  const addEastWest = (
    face: "e" | "w",
    xCenter: number,
    wallThickness: number,
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
        wallThickness,
        zMin,
        zMax,
        y0,
        y1,
        holes,
        name,
      );
      addExteriorCladdingX(face, xCenter, wallThickness, zMin, zMax, y0, y1, holes, name);
      if (doorFrameTrim && holes.length > 0) {
        const xInner = face === "e" ? hx - wt : -hx + wt;
        const inwardX = face === "e" ? -1 : 1;
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
        wallThickness,
        zMin,
        zMax,
        y0,
        y1,
        [],
        name,
      );
      addExteriorCladdingX(face, xCenter, wallThickness, zMin, zMax, y0, y1, [], name);
    }
  };

  const addNorthSouth = (
    face: "n" | "s",
    zCenter: number,
    wallThickness: number,
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
        wallThickness,
        xMin,
        xMax,
        y0,
        y1,
        holes,
        name,
      );
      addExteriorCladdingZ(face, zCenter, wallThickness, xMin, xMax, y0, y1, holes, name);
      if (doorFrameTrim && holes.length > 0) {
        const zInner = face === "n" ? hz - wt : -hz + wt;
        const inwardZ = face === "n" ? -1 : 1;
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
        wallThickness,
        xMin,
        xMax,
        y0,
        y1,
        [],
        name,
      );
      addExteriorCladdingZ(face, zCenter, wallThickness, xMin, xMax, y0, y1, [], name);
    }
  };

  if (!door) {
    addWallConstantXWithHoles(
      group,
      wallM,
      hx - wt * 0.5,
      wt,
      -vlenZ * 0.5,
      vlenZ * 0.5,
      yWallBottom,
      yWallTop,
      [],
      "shaft_wall_e",
    );
    addExteriorCladdingX(
      "e",
      hx - wt * 0.5,
      wt,
      -vlenZ * 0.5,
      vlenZ * 0.5,
      yWallBottom,
      yWallTop,
      [],
      "shaft_wall_e",
    );
    addWallConstantXWithHoles(
      group,
      wallM,
      -hx + wt * 0.5,
      wt,
      -vlenZ * 0.5,
      vlenZ * 0.5,
      yWallBottom,
      yWallTop,
      [],
      "shaft_wall_w",
    );
    addExteriorCladdingX(
      "w",
      -hx + wt * 0.5,
      wt,
      -vlenZ * 0.5,
      vlenZ * 0.5,
      yWallBottom,
      yWallTop,
      [],
      "shaft_wall_w",
    );
    addWallConstantZWithHoles(
      group,
      wallM,
      hz - wt * 0.5,
      wt,
      -vlenX * 0.5,
      vlenX * 0.5,
      yWallBottom,
      yWallTop,
      [],
      "shaft_wall_n",
    );
    addExteriorCladdingZ(
      "n",
      hz - wt * 0.5,
      wt,
      -vlenX * 0.5,
      vlenX * 0.5,
      yWallBottom,
      yWallTop,
      [],
      "shaft_wall_n",
    );
    addWallConstantZWithHoles(
      group,
      wallM,
      -hz + wt * 0.5,
      wt,
      -vlenX * 0.5,
      vlenX * 0.5,
      yWallBottom,
      yWallTop,
      [],
      "shaft_wall_s",
    );
    addExteriorCladdingZ(
      "s",
      -hz + wt * 0.5,
      wt,
      -vlenX * 0.5,
      vlenX * 0.5,
      yWallBottom,
      yWallTop,
      [],
      "shaft_wall_s",
    );
    return;
  }

  const face =
    door.face ??
    pickFaceTowardPoint(0, 0, 1, 0);
  const flushG = Math.max(0, Math.min(0.35, opts.corridorFlushGapM ?? 0));
  const thE = face === "e" && flushG > 0 ? wt + flushG : wt;
  const xE = face === "e" && flushG > 0 ? hx - wt * 0.5 + flushG * 0.5 : hx - wt * 0.5;
  const thW = face === "w" && flushG > 0 ? wt + flushG : wt;
  const xW = face === "w" && flushG > 0 ? -hx + wt * 0.5 - flushG * 0.5 : -hx + wt * 0.5;
  const thN = face === "n" && flushG > 0 ? wt + flushG : wt;
  const zN = face === "n" && flushG > 0 ? hz - wt * 0.5 + flushG * 0.5 : hz - wt * 0.5;
  const thS = face === "s" && flushG > 0 ? wt + flushG : wt;
  const zS = face === "s" && flushG > 0 ? -hz + wt * 0.5 - flushG * 0.5 : -hz + wt * 0.5;
  const zMinWall = -vlenZ * 0.5;
  const zMaxWall = vlenZ * 0.5;
  const xMinWall = -vlenX * 0.5;
  const xMaxWall = vlenX * 0.5;

  const clampHolesYZ = (holes: readonly WallHoleYZ[]): WallHoleYZ[] => {
    const out: WallHoleYZ[] = [];
    for (const h of holes) {
      const y0 = Math.max(yWallBottom, Math.min(h.y0, h.y1));
      const y1 = Math.min(yWallTop, Math.max(h.y0, h.y1));
      const z0 = Math.max(zMinWall, Math.min(h.z0, h.z1));
      const z1 = Math.min(zMaxWall, Math.max(h.z0, h.z1));
      if (y1 > y0 + 0.08 && z1 > z0 + 0.08) out.push({ y0, y1, z0, z1 });
    }
    return out;
  };

  const clampHolesXY = (holes: readonly WallHoleXY[]): WallHoleXY[] => {
    const out: WallHoleXY[] = [];
    for (const h of holes) {
      const y0 = Math.max(yWallBottom, Math.min(h.y0, h.y1));
      const y1 = Math.min(yWallTop, Math.max(h.y0, h.y1));
      const x0 = Math.max(xMinWall, Math.min(h.x0, h.x1));
      const x1 = Math.min(xMaxWall, Math.max(h.x0, h.x1));
      if (y1 > y0 + 0.08 && x1 > x0 + 0.08) out.push({ y0, y1, x0, x1 });
    }
    return out;
  };

  const appendOpeningHole = (
    opening: ShaftGroundDoorOpts,
    yzByFace: { e: WallHoleYZ[]; w: WallHoleYZ[] },
    xyByFace: { n: WallHoleXY[]; s: WallHoleXY[] },
  ): void => {
    const openingFace = opening.face ?? "e";
    const openingHalfW = Math.min(
      (opening.doorWidthM ?? SHAFT_DOUBLE_DOOR_W) * 0.5,
      vlenZ * 0.5 - 0.06,
      vlenX * 0.5 - 0.06,
    );
    const openingBandCap = Math.max(0.55, Math.min(opening.bandHeightM, innerWallH));
    const openingYMax =
      opening.bandHeightM >= innerWallH - 0.02 ? yWallTop : yWallTop - 0.04;
    const openingDoorH = Math.min(SHAFT_DOUBLE_DOOR_H, openingBandCap - 0.06);
    let openingY0 = yWallBottom;
    let openingY1 = openingY0 + Math.max(0.55, openingDoorH);
    if (
      opening.doorHoleY0Local != null &&
      opening.doorHoleY1Local != null &&
      Number.isFinite(opening.doorHoleY0Local) &&
      Number.isFinite(opening.doorHoleY1Local)
    ) {
      const a = Math.min(opening.doorHoleY0Local, opening.doorHoleY1Local);
      const b = Math.max(opening.doorHoleY0Local, opening.doorHoleY1Local);
      openingY0 = Math.max(yWallBottom, a);
      openingY1 = Math.min(openingYMax, b);
    }
    ({ y0: openingY0, y1: openingY1 } = normalizeStairDoorVerticalSpan(
      yWallBottom,
      openingYMax,
      openingY0,
      openingY1,
    ));
    if (openingY1 <= openingY0 + 0.45) return;
    const tangent = opening.tangentOffsetAlongWall ?? 0;
    if (openingFace === "e" || openingFace === "w") {
      const z0 = Math.max(zMinWall, tangent - openingHalfW);
      const z1 = Math.min(zMaxWall, tangent + openingHalfW);
      if (z1 <= z0 + 0.08) return;
      yzByFace[openingFace].push({
        z0,
        z1,
        y0: openingY0,
        y1: openingY1,
      });
      return;
    }
    const x0 = Math.max(xMinWall, tangent - openingHalfW);
    const x1 = Math.min(xMaxWall, tangent + openingHalfW);
    if (x1 <= x0 + 0.08) return;
    xyByFace[openingFace].push({
      x0,
      x1,
      y0: openingY0,
      y1: openingY1,
    });
  };

  if (!splitShaft) {
    if (multiCorridorDoors) {
      const yzByFace: { e: WallHoleYZ[]; w: WallHoleYZ[] } = { e: [], w: [] };
      const xyByFace: { n: WallHoleXY[]; s: WallHoleXY[] } = { n: [], s: [] };
      if (door) appendOpeningHole(door, yzByFace, xyByFace);
      for (const extraDoor of supplementalDoors) {
        appendOpeningHole(extraDoor, yzByFace, xyByFace);
      }
      if (face === "e") yzByFace.e.push(...extraHolesYZ);
      else if (face === "w") yzByFace.w.push(...extraHolesYZ);
      else if (face === "n") xyByFace.n.push(...extraHolesXY);
      else xyByFace.s.push(...extraHolesXY);

      const holesE = clampHolesYZ(yzByFace.e);
      const holesW = clampHolesYZ(yzByFace.w);
      const holesN = clampHolesXY(xyByFace.n);
      const holesS = clampHolesXY(xyByFace.s);

      addWallConstantXWithHoles(
        group,
        wallM,
        xE,
        thE,
        zMinWall,
        zMaxWall,
        yWallBottom,
        yWallTop,
        holesE,
        "shaft_wall_e",
      );
      addExteriorCladdingX(
        "e",
        xE,
        thE,
        zMinWall,
        zMaxWall,
        yWallBottom,
        yWallTop,
        holesE,
        "shaft_wall_e",
      );
      addWallConstantXWithHoles(
        group,
        wallM,
        xW,
        thW,
        zMinWall,
        zMaxWall,
        yWallBottom,
        yWallTop,
        holesW,
        "shaft_wall_w",
      );
      addExteriorCladdingX(
        "w",
        xW,
        thW,
        zMinWall,
        zMaxWall,
        yWallBottom,
        yWallTop,
        holesW,
        "shaft_wall_w",
      );
      addWallConstantZWithHoles(
        group,
        wallM,
        zN,
        thN,
        xMinWall,
        xMaxWall,
        yWallBottom,
        yWallTop,
        holesN,
        "shaft_wall_n",
      );
      addExteriorCladdingZ(
        "n",
        zN,
        thN,
        xMinWall,
        xMaxWall,
        yWallBottom,
        yWallTop,
        holesN,
        "shaft_wall_n",
      );
      addWallConstantZWithHoles(
        group,
        wallM,
        zS,
        thS,
        xMinWall,
        xMaxWall,
        yWallBottom,
        yWallTop,
        holesS,
        "shaft_wall_s",
      );
      addExteriorCladdingZ(
        "s",
        zS,
        thS,
        xMinWall,
        xMaxWall,
        yWallBottom,
        yWallTop,
        holesS,
        "shaft_wall_s",
      );

      if (doorFrameTrim) {
        const xInnerE = hx - wt;
        for (let i = 0; i < holesE.length; i++) {
          const h = holesE[i]!;
          addDoorFrameTrimConstantX(
            group,
            doorFrameMat,
            xInnerE,
            -1,
            h.z0,
            h.z1,
            h.y0,
            h.y1,
            `shaft_wall_e_frame_${i}`,
          );
        }
        const xInnerW = -hx + wt;
        for (let i = 0; i < holesW.length; i++) {
          const h = holesW[i]!;
          addDoorFrameTrimConstantX(
            group,
            doorFrameMat,
            xInnerW,
            1,
            h.z0,
            h.z1,
            h.y0,
            h.y1,
            `shaft_wall_w_frame_${i}`,
          );
        }
        const zInnerN = hz - wt;
        for (let i = 0; i < holesN.length; i++) {
          const h = holesN[i]!;
          addDoorFrameTrimConstantZ(
            group,
            doorFrameMat,
            zInnerN,
            -1,
            h.x0,
            h.x1,
            h.y0,
            h.y1,
            `shaft_wall_n_frame_${i}`,
          );
        }
        const zInnerS = -hz + wt;
        for (let i = 0; i < holesS.length; i++) {
          const h = holesS[i]!;
          addDoorFrameTrimConstantZ(
            group,
            doorFrameMat,
            zInnerS,
            1,
            h.x0,
            h.x1,
            h.y0,
            h.y1,
            `shaft_wall_s_frame_${i}`,
          );
        }
      }
    } else {
      addEastWest("e", xE, thE, face === "e", yWallBottom, yWallTop, "shaft_wall_e");
      addEastWest("w", xW, thW, face === "w", yWallBottom, yWallTop, "shaft_wall_w");
      addNorthSouth("n", zN, thN, face === "n", yWallBottom, yWallTop, "shaft_wall_n");
      addNorthSouth("s", zS, thS, face === "s", yWallBottom, yWallTop, "shaft_wall_s");
    }
    return;
  }

  addEastWest("e", xE, thE, face === "e", yWallBottom, ySplit, "shaft_wall_e_lo");
  addEastWest("e", xE, thE, false, ySplit, yWallTop, "shaft_wall_e_hi");
  addEastWest("w", xW, thW, face === "w", yWallBottom, ySplit, "shaft_wall_w_lo");
  addEastWest("w", xW, thW, false, ySplit, yWallTop, "shaft_wall_w_hi");
  addNorthSouth("n", zN, thN, face === "n", yWallBottom, ySplit, "shaft_wall_n_lo");
  addNorthSouth("n", zN, thN, false, ySplit, yWallTop, "shaft_wall_n_hi");
  addNorthSouth("s", zS, thS, face === "s", yWallBottom, ySplit, "shaft_wall_s_lo");
  addNorthSouth("s", zS, thS, false, ySplit, yWallTop, "shaft_wall_s_hi");
}
