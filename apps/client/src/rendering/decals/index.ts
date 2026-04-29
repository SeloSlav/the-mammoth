export type {
  DecalCategory,
  DecalManifest,
  DecalManifestEntry,
  DecalMeshResolver,
  DecalPlacement,
  DecalMaterialOpts,
} from "./decalTypes.js";
export { DECAL_MANIFEST } from "./decalManifest.js";
export {
  createDecalMaterial,
  decalMaterialCacheKey,
  graffitiDecalMaterialOpts,
  grimeDecalMaterialOpts,
  stickerDecalMaterialOpts,
} from "./createDecalMaterial.js";
export { DecalManager } from "./DecalManager.js";
export {
  collectMeshesInSegment,
  eulerForDecalProjector,
  findStairShaftSegment,
  hashStringToSeed,
  mulberry32,
  resolveDecalHitMesh,
  stairShaftColumnName,
} from "./decalPlacementResolve.js";
export { generateStairwellDecalPlacements } from "./stairwellDecalPlacements.js";
export { debugDumpDecalPlacementFromPointer } from "./DecalPlacementTool.js";
