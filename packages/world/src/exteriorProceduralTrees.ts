import * as THREE from "three";

export const EXTERIOR_PROCEDURAL_TREE_DEFAULT_COUNT = 440;

type LSystemSpec = {
  readonly name: string;
  readonly axiom: string;
  readonly rules: Readonly<Record<string, string>>;
  readonly iterations: number;
  readonly angleRad: number;
  readonly step: number;
  readonly lengthFalloff: number;
  readonly radius: number;
  readonly radiusFalloff: number;
  readonly leafScale: readonly [number, number, number];
};

type SegmentPrototype = {
  readonly midpoint: THREE.Vector3;
  readonly quat: THREE.Quaternion;
  readonly radius: number;
  readonly length: number;
};

type LeafPrototype = {
  readonly position: THREE.Vector3;
  readonly scale: THREE.Vector3;
};

type TreePrototype = {
  readonly segments: readonly SegmentPrototype[];
  readonly leaves: readonly LeafPrototype[];
};

export type ExteriorProceduralTreePlacement = {
  readonly x: number;
  readonly z: number;
  readonly heightM: number;
  readonly yawRad: number;
  readonly prototypeIndex: number;
};

export type ExteriorProceduralTreeOptions = {
  readonly count?: number;
  readonly seed?: number;
  readonly groundY?: number;
  readonly minFacadeClearanceM?: number;
  readonly maxScatterDistanceM?: number;
};

const L_SYSTEMS: readonly LSystemSpec[] = [
  {
    name: "zagreb_linden_plane",
    axiom: "F[+X][-X][&X][^X]",
    rules: { X: "F[+F][-F][&F]" },
    iterations: 1,
    angleRad: THREE.MathUtils.degToRad(34),
    step: 0.34,
    lengthFalloff: 0.78,
    radius: 0.028,
    radiusFalloff: 0.68,
    leafScale: [0.12, 0.09, 0.12],
  },
  {
    name: "zagreb_poplar",
    axiom: "F[^X][&X][+X][-X]F[^X][&X]",
    rules: { X: "F[+F][-F]" },
    iterations: 1,
    angleRad: THREE.MathUtils.degToRad(17),
    step: 0.24,
    lengthFalloff: 0.84,
    radius: 0.022,
    radiusFalloff: 0.7,
    leafScale: [0.065, 0.17, 0.065],
  },
  {
    name: "zagreb_yard_tree",
    axiom: "F[+X][-X][&X]",
    rules: { X: "F[+F][-F][^F]" },
    iterations: 1,
    angleRad: THREE.MathUtils.degToRad(29),
    step: 0.31,
    lengthFalloff: 0.76,
    radius: 0.026,
    radiusFalloff: 0.66,
    leafScale: [0.1, 0.1, 0.1],
  },
];

const _axisX = new THREE.Vector3(1, 0, 0);
const _axisY = new THREE.Vector3(0, 1, 0);
const _axisZ = new THREE.Vector3(0, 0, 1);
const _segDir = new THREE.Vector3();
const _segMid = new THREE.Vector3();
const _segQuat = new THREE.Quaternion();
const _treeQuat = new THREE.Quaternion();
const _treeScale = new THREE.Vector3();
const _treeMatrix = new THREE.Matrix4();
const _localMatrix = new THREE.Matrix4();
const _instanceMatrix = new THREE.Matrix4();
const _leafColor = new THREE.Color();

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), t | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function expandLSystem(spec: LSystemSpec): string {
  let current = spec.axiom;
  for (let i = 0; i < spec.iterations; i++) {
    let next = "";
    for (const ch of current) next += spec.rules[ch] ?? ch;
    current = next;
  }
  return current.replaceAll("X", "F");
}

function rotateLocal(q: THREE.Quaternion, axis: THREE.Vector3, angleRad: number): void {
  q.multiply(_segQuat.setFromAxisAngle(axis, angleRad));
}

function buildTreePrototype(spec: LSystemSpec): TreePrototype {
  const expanded = expandLSystem(spec);
  const segments: SegmentPrototype[] = [];
  const leaves: LeafPrototype[] = [];
  const stack: { pos: THREE.Vector3; quat: THREE.Quaternion; depth: number }[] = [];
  const state = {
    pos: new THREE.Vector3(0, 0, 0),
    quat: new THREE.Quaternion(),
    depth: 0,
  };

  let maxY = 1e-4;
  for (const ch of expanded) {
    if (ch === "F") {
      const len = spec.step * Math.pow(spec.lengthFalloff, state.depth);
      const radius = spec.radius * Math.pow(spec.radiusFalloff, state.depth);
      _segDir.set(0, 1, 0).applyQuaternion(state.quat).normalize();
      const start = state.pos.clone();
      const end = start.clone().addScaledVector(_segDir, len);
      maxY = Math.max(maxY, end.y);
      _segMid.copy(start).add(end).multiplyScalar(0.5);
      segments.push({
        midpoint: _segMid.clone(),
        quat: new THREE.Quaternion().setFromUnitVectors(_axisY, _segDir),
        radius,
        length: len,
      });
      state.pos.copy(end);
    } else if (ch === "[") {
      stack.push({
        pos: state.pos.clone(),
        quat: state.quat.clone(),
        depth: state.depth,
      });
      state.depth += 1;
    } else if (ch === "]") {
      if (state.depth >= 2) {
        leaves.push({
          position: state.pos.clone(),
          scale: new THREE.Vector3(...spec.leafScale).multiplyScalar(
            0.9 + 0.18 * ((leaves.length % 3) - 1),
          ),
        });
      }
      const popped = stack.pop();
      if (popped) {
        state.pos.copy(popped.pos);
        state.quat.copy(popped.quat);
        state.depth = popped.depth;
      }
    } else if (ch === "+") {
      rotateLocal(state.quat, _axisZ, spec.angleRad);
    } else if (ch === "-") {
      rotateLocal(state.quat, _axisZ, -spec.angleRad);
    } else if (ch === "&") {
      rotateLocal(state.quat, _axisX, spec.angleRad);
    } else if (ch === "^") {
      rotateLocal(state.quat, _axisX, -spec.angleRad);
    } else if (ch === "/") {
      rotateLocal(state.quat, _axisY, spec.angleRad);
    }
  }
  leaves.push({
    position: state.pos.clone(),
    scale: new THREE.Vector3(...spec.leafScale),
  });

  const invHeight = 1 / maxY;
  return {
    segments: segments.map((s) => ({
      midpoint: s.midpoint.clone().multiplyScalar(invHeight),
      quat: s.quat,
      radius: s.radius,
      length: s.length * invHeight,
    })),
    leaves: leaves.map((l) => ({
      position: l.position.clone().multiplyScalar(invHeight),
      scale: l.scale.clone(),
    })),
  };
}

function treeHeightM(rand: () => number, prototypeIndex: number): number {
  if (prototypeIndex === 1) return THREE.MathUtils.lerp(22, 35, Math.pow(rand(), 0.65));
  const mature = rand() < 0.24;
  return mature
    ? THREE.MathUtils.lerp(16, 24, rand())
    : THREE.MathUtils.lerp(7.5, 15.5, Math.pow(rand(), 0.82));
}

function choosePrototypeIndex(rand: () => number): number {
  const r = rand();
  if (r < 0.15) return 1;
  if (r < 0.58) return 0;
  return 2;
}

function buildTreePlacements(
  footprint: THREE.Box3,
  options: Required<Pick<
    ExteriorProceduralTreeOptions,
    "count" | "seed" | "minFacadeClearanceM" | "maxScatterDistanceM"
  >>,
): ExteriorProceduralTreePlacement[] {
  const rand = mulberry32(options.seed);
  const minX = footprint.min.x;
  const maxX = footprint.max.x;
  const minZ = footprint.min.z;
  const maxZ = footprint.max.z;
  const width = Math.max(1, maxX - minX);
  const depth = Math.max(1, maxZ - minZ);
  const sideWeights = [width, width, depth, depth];
  const total = sideWeights.reduce((a, b) => a + b, 0);
  const placements: ExteriorProceduralTreePlacement[] = [];

  for (let i = 0; i < options.count; i++) {
    const prototypeIndex = choosePrototypeIndex(rand);
    const sidePick = rand() * total;
    const side =
      sidePick < sideWeights[0]!
        ? 0
        : sidePick < sideWeights[0]! + sideWeights[1]!
          ? 1
          : sidePick < sideWeights[0]! + sideWeights[1]! + sideWeights[2]!
            ? 2
            : 3;
    const nearBand = rand() < 0.72;
    const scatter = nearBand
      ? Math.pow(rand(), 1.65) * (options.maxScatterDistanceM * 0.52)
      : options.maxScatterDistanceM * (0.48 + rand() * 0.52);
    const offset = options.minFacadeClearanceM + scatter;
    const alongPad = nearBand ? 34 : 72;
    let x = 0;
    let z = 0;
    if (side === 0) {
      x = THREE.MathUtils.lerp(minX - alongPad, maxX + alongPad, rand());
      z = maxZ + offset;
    } else if (side === 1) {
      x = THREE.MathUtils.lerp(minX - alongPad, maxX + alongPad, rand());
      z = minZ - offset;
    } else if (side === 2) {
      x = maxX + offset;
      z = THREE.MathUtils.lerp(minZ - alongPad, maxZ + alongPad, rand());
    } else {
      x = minX - offset;
      z = THREE.MathUtils.lerp(minZ - alongPad, maxZ + alongPad, rand());
    }
    x += (rand() - 0.5) * 9;
    z += (rand() - 0.5) * 9;
    placements.push({
      x,
      z,
      heightM: treeHeightM(rand, prototypeIndex),
      yawRad: rand() * Math.PI * 2,
      prototypeIndex,
    });
  }
  return placements;
}

export function buildExteriorProceduralTreeGroup(
  buildingFootprint: THREE.Box3,
  options: ExteriorProceduralTreeOptions = {},
): THREE.Group {
  const count = Math.max(0, Math.floor(options.count ?? EXTERIOR_PROCEDURAL_TREE_DEFAULT_COUNT));
  const root = new THREE.Group();
  root.name = "exterior_procedural_tree_grove";
  root.userData.mammothAlwaysVisible = true;
  root.userData.mammothExteriorProceduralTrees = true;
  root.userData.mammothExteriorProceduralTreeCount = count;
  if (count === 0 || buildingFootprint.isEmpty()) return root;

  const placementOptions = {
    count,
    seed: options.seed ?? 0x7a_67_72_65,
    groundY: options.groundY ?? 0,
    minFacadeClearanceM: options.minFacadeClearanceM ?? 11,
    maxScatterDistanceM: options.maxScatterDistanceM ?? 170,
  };
  const prototypes = L_SYSTEMS.map(buildTreePrototype);
  const placements = buildTreePlacements(buildingFootprint, placementOptions);
  root.userData.mammothExteriorProceduralTreePlacements = placements;

  let segmentCount = 0;
  let leafCount = 0;
  for (const p of placements) {
    const proto = prototypes[p.prototypeIndex]!;
    segmentCount += proto.segments.length;
    leafCount += proto.leaves.length;
  }

  const branchGeom = new THREE.CylinderGeometry(1, 0.72, 1, 5, 1, false);
  branchGeom.name = "exterior_tree_branch_lsystem_segment";
  const leafGeom = new THREE.IcosahedronGeometry(1, 0);
  leafGeom.name = "exterior_tree_leaf_cluster_lowpoly";
  const branchMat = new THREE.MeshStandardMaterial({
    color: 0x4a3527,
    roughness: 0.96,
    metalness: 0,
    flatShading: true,
  });
  const leafMat = new THREE.MeshStandardMaterial({
    color: 0x496337,
    roughness: 0.92,
    metalness: 0,
    flatShading: true,
    vertexColors: true,
  });

  const branchMesh = new THREE.InstancedMesh(branchGeom, branchMat, segmentCount);
  branchMesh.name = "exterior_tree_lsystem_branches_instanced";
  branchMesh.castShadow = false;
  branchMesh.receiveShadow = false;
  branchMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

  const leafMesh = new THREE.InstancedMesh(leafGeom, leafMat, leafCount);
  leafMesh.name = "exterior_tree_lsystem_leaf_clusters_instanced";
  leafMesh.castShadow = false;
  leafMesh.receiveShadow = false;
  leafMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

  let segmentIndex = 0;
  let leafIndex = 0;
  for (const p of placements) {
    const proto = prototypes[p.prototypeIndex]!;
    _treeQuat.setFromAxisAngle(_axisY, p.yawRad);
    _treeScale.setScalar(p.heightM);
    _treeMatrix.compose(new THREE.Vector3(p.x, placementOptions.groundY, p.z), _treeQuat, _treeScale);

    for (const segment of proto.segments) {
      _localMatrix.compose(
        segment.midpoint,
        segment.quat,
        new THREE.Vector3(segment.radius, segment.length, segment.radius),
      );
      _instanceMatrix.multiplyMatrices(_treeMatrix, _localMatrix);
      branchMesh.setMatrixAt(segmentIndex++, _instanceMatrix);
    }

    for (const leaf of proto.leaves) {
      _localMatrix.compose(leaf.position, _treeQuat.identity(), leaf.scale);
      _instanceMatrix.multiplyMatrices(_treeMatrix, _localMatrix);
      leafMesh.setMatrixAt(leafIndex, _instanceMatrix);
      const hueShift = (p.prototypeIndex === 1 ? -0.04 : 0.02) + ((leafIndex % 7) - 3) * 0.006;
      _leafColor.setHSL(0.27 + hueShift, 0.26 + (leafIndex % 5) * 0.025, 0.27 + (leafIndex % 3) * 0.035);
      leafMesh.setColorAt(leafIndex, _leafColor);
      leafIndex += 1;
    }
  }

  branchMesh.instanceMatrix.needsUpdate = true;
  leafMesh.instanceMatrix.needsUpdate = true;
  if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true;
  branchMesh.computeBoundingSphere();
  leafMesh.computeBoundingSphere();
  root.add(branchMesh, leafMesh);
  return root;
}
