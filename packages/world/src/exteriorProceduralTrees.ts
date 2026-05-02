import { Tree } from "@dgreenheck/ez-tree";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  buildExteriorMegablockTreePlacements,
  EXTERIOR_PROCEDURAL_TREE_DEFAULT_COUNT,
  EXTERIOR_PROCEDURAL_TREE_DEFAULT_MAX_SCATTER_M,
  EXTERIOR_PROCEDURAL_TREE_DEFAULT_MIN_FACADE_CLEARANCE_M,
  EXTERIOR_PROCEDURAL_TREE_DEFAULT_SEED,
  EZ_TREE_MEGABLOCK_VARIANTS,
  type ExteriorProceduralTreeOptions,
  type ExteriorProceduralTreePlacement,
} from "./exteriorProceduralTreeSites.js";

const _bbox = new THREE.Box3();

function derivedTreeSeed(worldSeed: number, treeIndex: number): number {
  return (worldSeed + treeIndex * 0x9e37_79b9 + (treeIndex >>> 5) * 0x85eb_ca6b) >>> 0;
}

function naturalHeightM(tree: Tree): number {
  _bbox.setFromObject(tree);
  const dy = _bbox.max.y - _bbox.min.y;
  return Math.max(dy, 1e-3);
}

function firstMeshMaterial(m: THREE.Material | THREE.Material[]): THREE.Material {
  return Array.isArray(m) ? m[0]! : m;
}

/**
 * ez-tree tweaks shared bark / leaf textures; clone maps per merged mesh so presets do not stomp repeats.
 */
function forkMaterialTextures(
  material: THREE.Material,
): THREE.MeshPhongMaterial | THREE.MeshStandardMaterial {
  const m = material.clone() as THREE.MeshPhongMaterial | THREE.MeshStandardMaterial;
  const fork = (tex: THREE.Texture | null | undefined) => {
    if (!tex) return null as unknown as THREE.Texture | null | undefined;
    const n = tex.clone();
    n.needsUpdate = true;
    return n;
  };
  if ("map" in m) m.map = fork(m.map) ?? null;
  if ("normalMap" in m) m.normalMap = fork(m.normalMap) ?? null;
  if ("roughnessMap" in m) m.roughnessMap = fork(m.roughnessMap) ?? null;
  if ("metalnessMap" in m) m.metalnessMap = fork(m.metalnessMap) ?? null;
  if ("aoMap" in m) m.aoMap = fork(m.aoMap) ?? null;
  if ("bumpMap" in m) m.bumpMap = fork(m.bumpMap) ?? null;
  if ("alphaMap" in m) m.alphaMap = fork(m.alphaMap) ?? null;
  if ("emissiveMap" in m) m.emissiveMap = fork(m.emissiveMap) ?? null;
  return m;
}

export function buildExteriorProceduralTreeGroup(
  buildingFootprint: THREE.Box3,
  options: ExteriorProceduralTreeOptions = {},
  placementsPrecomputed?: readonly ExteriorProceduralTreePlacement[],
): THREE.Group {
  const countFloored = Math.max(
    0,
    Math.floor(options.count ?? EXTERIOR_PROCEDURAL_TREE_DEFAULT_COUNT),
  );
  const root = new THREE.Group();
  root.name = "exterior_procedural_tree_grove";
  root.userData.mammothExteriorProceduralTrees = true;
  if (buildingFootprint.isEmpty()) {
    root.userData.mammothExteriorProceduralTreeCount = 0;
    return root;
  }

  const placementOptions = {
    count: placementsPrecomputed ? placementsPrecomputed.length : countFloored,
    seed: options.seed ?? EXTERIOR_PROCEDURAL_TREE_DEFAULT_SEED,
    groundY: options.groundY ?? 0,
    minFacadeClearanceM:
      options.minFacadeClearanceM ?? EXTERIOR_PROCEDURAL_TREE_DEFAULT_MIN_FACADE_CLEARANCE_M,
    maxScatterDistanceM:
      options.maxScatterDistanceM ?? EXTERIOR_PROCEDURAL_TREE_DEFAULT_MAX_SCATTER_M,
  };
  const placements =
    placementsPrecomputed ??
    buildExteriorMegablockTreePlacements(buildingFootprint, placementOptions);

  root.userData.mammothExteriorProceduralTreeCount = placements.length;
  root.userData.mammothExteriorProceduralTreePlacements = placements;
  if (placements.length === 0) return root;

  const byVariant: ExteriorProceduralTreePlacement[][] = Array.from(
    { length: EZ_TREE_MEGABLOCK_VARIANTS.length },
    () => [],
  );
  for (const p of placements) {
    byVariant[p.prototypeIndex]!.push(p);
  }

  for (let vi = 0; vi < EZ_TREE_MEGABLOCK_VARIANTS.length; vi++) {
    const bucket = byVariant[vi]!;
    if (bucket.length === 0) continue;

    const variant = EZ_TREE_MEGABLOCK_VARIANTS[vi]!;
    const branchGeoms: THREE.BufferGeometry[] = [];
    const leafGeoms: THREE.BufferGeometry[] = [];
    let sampleBranchMat: THREE.Material | null = null;
    let sampleLeafMat: THREE.Material | null = null;

    for (let bi = 0; bi < bucket.length; bi++) {
      const p = bucket[bi]!;
      const tree = new Tree();
      tree.loadPreset(variant.preset);
      tree.options.seed = derivedTreeSeed(placementOptions.seed, vi * 50_003 + bi);
      tree.generate();

      const hNat = naturalHeightM(tree);
      const scale = p.heightM / hNat;
      tree.scale.setScalar(scale);
      tree.rotation.y = p.yawRad;
      tree.position.set(p.x, 0, p.z);
      tree.updateMatrixWorld(true);
      _bbox.setFromObject(tree);
      tree.position.y = placementOptions.groundY - _bbox.min.y;
      tree.updateMatrixWorld(true);

      sampleBranchMat = firstMeshMaterial(tree.branchesMesh.material);
      sampleLeafMat = firstMeshMaterial(tree.leavesMesh.material);

      const bg = tree.branchesMesh.geometry.clone();
      bg.applyMatrix4(tree.branchesMesh.matrixWorld);
      branchGeoms.push(bg);

      const lg = tree.leavesMesh.geometry.clone();
      lg.applyMatrix4(tree.leavesMesh.matrixWorld);
      leafGeoms.push(lg);
    }

    const mergedBranches = mergeGeometries(branchGeoms, false);
    const mergedLeaves = mergeGeometries(leafGeoms, false);
    for (const g of branchGeoms) g.dispose();
    for (const g of leafGeoms) g.dispose();

    if (mergedBranches && sampleBranchMat) {
      const mesh = new THREE.Mesh(
        mergedBranches,
        forkMaterialTextures(sampleBranchMat),
      );
      mesh.name = `exterior_ez_tree_branches_${variant.preset.replace(/\s+/g, "_").toLowerCase()}`;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      root.add(mesh);
    } else {
      mergedBranches?.dispose();
    }

    if (mergedLeaves && sampleLeafMat) {
      const mesh = new THREE.Mesh(
        mergedLeaves,
        forkMaterialTextures(sampleLeafMat),
      );
      mesh.name = `exterior_ez_tree_leaves_${variant.preset.replace(/\s+/g, "_").toLowerCase()}`;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      root.add(mesh);
    } else {
      mergedLeaves?.dispose();
    }
  }

  root.userData.mammothExteriorProceduralTreeEzTree = true as const;

  return root;
}
