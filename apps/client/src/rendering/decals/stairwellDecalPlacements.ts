import * as THREE from "three";
import type { BuildingStairShaftSpec } from "@the-mammoth/world";
import type { DecalPlacement } from "./decalTypes.js";
import { findStairShaftSegment, hashStringToSeed, mulberry32 } from "./decalPlacementResolve.js";

const GRAFFITI_IDS = [
  "blok47_a",
  "blok47_b",
  "blok47_c",
  "blok47_d",
  "blok47_e",
  "blok47_f",
  "blok47_g",
  "blok47_h",
] as const;

function shaftSegmentHeightM(s: BuildingStairShaftSpec): number {
  return Math.max(s.syPlate, s.storeySpacing);
}

/**
 * ~3 projected graffiti placements per stair segment — deterministic from shaft id, level, slot.
 */
export function generateStairwellDecalPlacements(
  buildingRoot: THREE.Object3D,
  stairSpecs: readonly BuildingStairShaftSpec[],
): DecalPlacement[] {
  const out: DecalPlacement[] = [];

  for (const spec of stairSpecs) {
    const sySeg = shaftSegmentHeightM(spec);
    for (let i = 0; i < spec.storeyCount; i++) {
      const storeyLevelIndex = spec.minLevelIndex + i;
      const segment = findStairShaftSegment(buildingRoot, spec.id, storeyLevelIndex);
      if (!segment) continue;
      segment.updateMatrixWorld(true);

      const { sx, sz } = spec;
      const wallInset = 0.07;
      const yHalf = sySeg * 0.38;

      for (let slot = 0; slot < 3; slot++) {
        const seed = hashStringToSeed(`${spec.id}:${storeyLevelIndex}:${slot}`);
        const rnd = mulberry32(seed);

        const wallSwitch = Math.floor(rnd() * 4);
        const yFrac =
          slot === 0 ? 0.1 + rnd() * 0.14 : slot === 1 ? 0.38 + rnd() * 0.14 : 0.64 + rnd() * 0.14;
        const yLocal = (yFrac - 0.5) * yHalf * 2;

        const jitterAmt = Math.min(sx, sz) * 0.16;
        const jz = (rnd() - 0.5) * jitterAmt;
        const jx = (rnd() - 0.5) * jitterAmt;

        const walls: Array<{ lx: number; lz: number; nx: number; nz: number }> = [
          { lx: sx * 0.5 - wallInset, lz: jz, nx: -1, nz: 0 },
          { lx: -sx * 0.5 + wallInset, lz: jz, nx: 1, nz: 0 },
          { lx: jx, lz: -sz * 0.5 + wallInset, nx: 0, nz: 1 },
          { lx: jx, lz: sz * 0.5 - wallInset, nx: 0, nz: -1 },
        ];
        const w = walls[(wallSwitch + slot) % 4]!;

        const localPos = new THREE.Vector3(w.lx, yLocal, w.lz);
        const localNor = new THREE.Vector3(w.nx, 0, w.nz).normalize();
        const worldPos = localPos.clone();
        segment.localToWorld(worldPos);
        const worldNor = localNor.clone().transformDirection(segment.matrixWorld).normalize();

        const rotJitter = (rnd() - 0.5) * 0.24;
        const sizeJitter = 0.9 + rnd() * 0.2;
        const baseW = 0.95 * sizeJitter;
        const id = GRAFFITI_IDS[Math.floor(rnd() * GRAFFITI_IDS.length)]!;
        const grime = rnd() > 0.72;

        out.push({
          id,
          category: "graffiti",
          mode: "projected",
          stairShaftId: spec.id,
          storeyLevelIndex,
          position: [worldPos.x, worldPos.y, worldPos.z],
          normal: [worldNor.x, worldNor.y, worldNor.z],
          rotation: rotJitter,
          size: [baseW, baseW * (0.9 + rnd() * 0.14), 0.35],
          opacity: 0.96,
          grime,
        });
      }
    }
  }
  return out;
}
