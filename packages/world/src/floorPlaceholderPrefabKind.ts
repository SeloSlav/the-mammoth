import * as THREE from "three";
import { floorPlaceholderMeshMaterials as mat } from "./floorPlaceholderMeshMaterials.js";
import type { PlaceholderKind } from "./floorPlaceholderMeshTypes.js";

/** Exported for unit tests / tooling; drives corridor vs unit mesh routing. */
export function classifyPrefab(prefabId: string): PlaceholderKind {
  const p = prefabId.toLowerCase();
  if (p.includes("corridor") || p.includes("lobby") || p.includes("hall"))
    return "corridor";
  if (p.includes("apartment") || p.includes("unit")) return "unit";
  if (p.includes("stair") || p.includes("elev") || p.includes("core"))
    return "core";
  return "misc";
}

export function matsFor(
  kind: PlaceholderKind,
  storyLevelIndex?: number,
): {
  floor: THREE.MeshStandardMaterial;
  ceil: THREE.MeshStandardMaterial;
  wall: THREE.MeshStandardMaterial;
  exteriorWall: THREE.MeshStandardMaterial;
} {
  const upperCorridorFloor =
    kind === "corridor" &&
    storyLevelIndex != null &&
    storyLevelIndex > 1 &&
    storyLevelIndex !== 99;
  switch (kind) {
    case "corridor":
      return {
        floor: upperCorridorFloor ? mat.corridorFloorUpperStorey : mat.corridorFloor,
        ceil: mat.corridorCeil,
        /** Default shell wall; hollow room shell swaps in PBR for ground + unit-adjacent runs. */
        wall: mat.corridorWall,
        exteriorWall: mat.corridorExteriorWall,
      };
    case "unit":
      return {
        floor: mat.unitFloor,
        ceil: mat.unitCeil,
        wall: mat.unitWall,
        exteriorWall: mat.unitExteriorWall,
      };
    case "core":
      return {
        floor: mat.coreFloor,
        ceil: mat.coreCeil,
        wall: mat.coreWall,
        exteriorWall: mat.coreExteriorWall,
      };
    default:
      return {
        floor: mat.miscFloor,
        ceil: mat.miscCeil,
        wall: mat.miscWall,
        exteriorWall: mat.miscExteriorWall,
      };
  }
}
