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
  readonly canopySpread: number;
  readonly canopyLayers: number;
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
    leafScale: [0.17, 0.13, 0.17],
    canopySpread: 0.17,
    canopyLayers: 11,
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
    leafScale: [0.09, 0.24, 0.09],
    canopySpread: 0.1,
    canopyLayers: 9,
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
    leafScale: [0.15, 0.13, 0.15],
    canopySpread: 0.15,
    canopyLayers: 10,
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
const _leafTint = new THREE.Color();
const _leafEuler = new THREE.Euler();
const _leafQuatInst = new THREE.Quaternion();
const _leafScaleInst = new THREE.Vector3();

/** Unit sphere-ish offsets for layered crowns (two rings in {@link pushCanopyClusters}). */
const CANOPY_OFFSETS: readonly [number, number, number][] = [
  [0, 0.08, 0],
  [0.82, -0.06, 0.31],
  [-0.71, -0.04, 0.42],
  [0.28, 0.18, -0.79],
  [-0.22, -0.14, -0.76],
  [0.44, 0.26, 0.58],
  [-0.51, 0.2, -0.24],
  [0.12, -0.22, 0.88],
  [-0.88, 0.1, 0.18],
  [0.55, -0.18, -0.52],
  [-0.33, 0.28, 0.66],
  [0.66, 0.12, 0.35],
  [-0.15, -0.12, 0.92],
  [0.08, 0.32, -0.45],
];

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

function rotateLocal(
  q: THREE.Quaternion,
  axis: THREE.Vector3,
  angleRad: number,
): void {
  q.multiply(_segQuat.setFromAxisAngle(axis, angleRad));
}

function pushCanopyClusters(
  leaves: LeafPrototype[],
  position: THREE.Vector3,
  scale: THREE.Vector3,
  spread: number,
  layerCount: number,
): void {
  const rings = 2;
  for (let ring = 0; ring < rings; ring++) {
    const ringSpread = spread * (ring === 0 ? 1 : 1.48);
    const ringScale = ring === 0 ? 1 : 0.58;
    const ringPhase = ring * 4;
    for (let i = 0; i < layerCount; i++) {
      const [ox, oy, oz] =
        CANOPY_OFFSETS[(i + ringPhase) % CANOPY_OFFSETS.length]!;
      const layerScale =
        (1 + (i % 3) * 0.11 - (i === 0 && ring === 0 ? 0.03 : 0)) * ringScale;
      leaves.push({
        position: position
          .clone()
          .add(
            new THREE.Vector3(
              ox * ringSpread,
              oy * ringSpread * 0.78,
              oz * ringSpread,
            ),
          ),
        scale: scale.clone().multiplyScalar(layerScale),
      });
    }
  }
}

/** Deterministic 0..1 for per-instance leaf albedo variation. */
function foliageVariation01(
  treeIndex: number,
  leafIndex: number,
  salt: number,
): number {
  let h = (treeIndex * 374761393 + leafIndex * 668265263 + salt * 144269393) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h >>> 0) / 4294967296;
}

function buildTreePrototype(spec: LSystemSpec): TreePrototype {
  const expanded = expandLSystem(spec);
  const segments: SegmentPrototype[] = [];
  const leaves: LeafPrototype[] = [];
  const stack: { pos: THREE.Vector3; quat: THREE.Quaternion; depth: number }[] =
    [];
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
        pushCanopyClusters(
          leaves,
          state.pos,
          new THREE.Vector3(...spec.leafScale).multiplyScalar(
            0.9 + 0.18 * ((leaves.length % 3) - 1),
          ),
          spec.canopySpread,
          spec.canopyLayers,
        );
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
  pushCanopyClusters(
    leaves,
    state.pos,
    new THREE.Vector3(...spec.leafScale).multiplyScalar(1.08),
    spec.canopySpread,
    spec.canopyLayers,
  );

  /** Upper-branch twig clusters: extra read without new L-system symbols. */
  const fillSpread = spec.canopySpread * 0.38;
  for (const seg of segments) {
    _segDir.set(0, 1, 0).applyQuaternion(seg.quat);
    const tip = seg.midpoint.clone().addScaledVector(_segDir, seg.length * 0.52);
    if (tip.y < maxY * 0.54) continue;
    pushCanopyClusters(
      leaves,
      tip,
      new THREE.Vector3(...spec.leafScale).multiplyScalar(0.34),
      fillSpread,
      3,
    );
  }

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
  if (prototypeIndex === 1)
    return THREE.MathUtils.lerp(22, 35, Math.pow(rand(), 0.65));
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
  options: Required<
    Pick<
      ExteriorProceduralTreeOptions,
      "count" | "seed" | "minFacadeClearanceM" | "maxScatterDistanceM"
    >
  >,
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
    /**
     * Most trees sit in the mid/far yard; only a minority use the "near" band, and that band
     * still keeps a floor distance so we do not hug the megablock façade.
     */
    const nearBand = rand() < 0.24;
    const scatter = nearBand
      ? options.maxScatterDistanceM * 0.14 +
        Math.pow(rand(), 1.85) * (options.maxScatterDistanceM * 0.36)
      : options.maxScatterDistanceM * (0.52 + rand() * 0.48);
    const offset = options.minFacadeClearanceM + scatter;
    const alongPad = nearBand ? 28 : 72;
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
    const jitter = nearBand ? 5 : 9;
    x += (rand() - 0.5) * jitter;
    z += (rand() - 0.5) * jitter;
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
  const count = Math.max(
    0,
    Math.floor(options.count ?? EXTERIOR_PROCEDURAL_TREE_DEFAULT_COUNT),
  );
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

  const branchGeom = new THREE.CylinderGeometry(1, 0.64, 1, 6, 1, false);
  branchGeom.name = "exterior_tree_branch_lsystem_segment";
  /** Low-poly sphere reads softer than an icosahedron under smooth shading (organic clumps). */
  const leafGeom = new THREE.SphereGeometry(1, 5, 4);
  leafGeom.name = "exterior_tree_leaf_cluster_sphere";
  const branchMat = new THREE.MeshStandardMaterial({
    color: 0x775b42,
    roughness: 0.9,
    metalness: 0,
    flatShading: true,
  });
  const leafMat = new THREE.MeshStandardMaterial({
    color: 0xc4dd8f,
    roughness: 0.74,
    metalness: 0,
    flatShading: false,
    vertexColors: true,
    emissive: 0x2a3520,
    emissiveIntensity: 0.028,
  });

  const branchMesh = new THREE.InstancedMesh(
    branchGeom,
    branchMat,
    segmentCount,
  );
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
  for (let ti = 0; ti < placements.length; ti++) {
    const p = placements[ti]!;
    const proto = prototypes[p.prototypeIndex]!;
    _treeQuat.setFromAxisAngle(_axisY, p.yawRad);
    _treeScale.setScalar(p.heightM);
    _treeMatrix.compose(
      new THREE.Vector3(p.x, placementOptions.groundY, p.z),
      _treeQuat,
      _treeScale,
    );

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
      const v4 = foliageVariation01(ti, leafIndex + 911, placementOptions.seed + 4);
      const v5 = foliageVariation01(leafIndex, ti + 427, placementOptions.seed + 5);
      const v6 = foliageVariation01(ti * 17 + leafIndex, 13, placementOptions.seed + 6);
      _leafEuler.set(
        (v4 - 0.5) * 1.2,
        (v5 - 0.5) * Math.PI * 2,
        (v6 - 0.5) * 1.15,
      );
      _leafQuatInst.setFromEuler(_leafEuler);
      _leafScaleInst.copy(leaf.scale);
      _leafScaleInst.multiplyScalar(0.88 + v4 * 0.26);
      _leafScaleInst.x *= 0.78 + v5 * 0.38;
      _leafScaleInst.y *= 0.72 + v6 * 0.42;
      _leafScaleInst.z *= 0.78 + (1 - v5) * 0.36;

      _localMatrix.compose(leaf.position, _leafQuatInst, _leafScaleInst);
      _instanceMatrix.multiplyMatrices(_treeMatrix, _localMatrix);
      leafMesh.setMatrixAt(leafIndex, _instanceMatrix);
      const v = foliageVariation01(ti, leafIndex, placementOptions.seed);
      const v2 = foliageVariation01(ti, leafIndex ^ 0x9e37_79b9, placementOptions.seed + 1);
      const v3 = foliageVariation01(leafIndex, ti, placementOptions.seed + 2);
      /** Yellow–spring green: hue 0.2–0.31, lighter reads, internal mottling. */
      const protoHueBias =
        p.prototypeIndex === 1 ? -0.02 : p.prototypeIndex === 0 ? 0 : 0.012;
      let hue = THREE.MathUtils.clamp(
        0.2 + protoHueBias + (v - 0.5) * 0.11 + (v2 - 0.5) * 0.06,
        0.17,
        0.32,
      );
      let sat = THREE.MathUtils.clamp(
        0.32 + v2 * 0.2 + (v3 - 0.5) * 0.12,
        0.22,
        0.55,
      );
      let light = THREE.MathUtils.clamp(
        0.52 + v * 0.18 + (v3 - 0.4) * 0.12,
        0.45,
        0.74,
      );
      /** Scattered drought / sun-scorch and cooler shaded patches — breaks uniform plastic blobs. */
      if (v2 > 0.68) {
        hue += (v2 - 0.68) * 0.06;
        sat *= THREE.MathUtils.lerp(1, 0.78, (v2 - 0.68) * 2.2);
        light = THREE.MathUtils.lerp(light, 0.62, (v2 - 0.68) * 0.85);
      }
      if (v3 < 0.28) {
        hue -= (0.28 - v3) * 0.12;
        sat *= THREE.MathUtils.lerp(1, 0.88, (0.28 - v3) * 2);
        light *= THREE.MathUtils.lerp(1, 0.94, (0.28 - v3) * 1.2);
      }
      hue = THREE.MathUtils.clamp(hue, 0.15, 0.34);
      sat = THREE.MathUtils.clamp(sat, 0.18, 0.58);
      light = THREE.MathUtils.clamp(light, 0.42, 0.76);
      _leafColor.setHSL(hue, sat, light);
      if (v * v3 > 0.55) {
        _leafTint.setHSL(0.14, 0.42, 0.52);
        _leafColor.lerp(_leafTint, 0.06 + (v * v3 - 0.55) * 0.08);
      }
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
