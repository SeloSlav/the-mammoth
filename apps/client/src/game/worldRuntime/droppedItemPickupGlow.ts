import * as THREE from "three";

const GLOW_EDGE_NAME = "dropped_pickup_glow_edges";
/** Source geometry uuid → refcount + shared {@link THREE.EdgesGeometry} for one pickup visual root. */
const GLOW_EDGE_REGISTRY_KEY = "pickupGlowEdgeRegistry";

type EdgeRegistryEntry = { edges: THREE.EdgesGeometry; count: number };
type EdgeRegistry = Map<string, EdgeRegistryEntry>;

/** Degrees — balance readability vs line count on dense GLBs. */
const EDGE_THRESHOLD_DEG = 40;

/** Avoid spikes on huge props: prioritize largest submeshes first. */
const MAX_MESHES_PER_PICKUP = 18;

const _v1 = new THREE.Vector3();

function meshSortWeight(mesh: THREE.Mesh): number {
  const g = mesh.geometry;
  if (!g) return 0;
  const pos = g.getAttribute("position");
  if (!pos) return 0;
  const n = pos.count;
  mesh.getWorldScale(_v1);
  const vol = Math.abs(_v1.x * _v1.y * _v1.z);
  return n * (Number.isFinite(vol) && vol > 1e-8 ? vol : 1);
}

function collectGlowMeshes(visualRoot: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  visualRoot.updateWorldMatrix(true, true);
  visualRoot.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    if (m.visible === false) return;
    const pos = m.geometry.getAttribute("position");
    if (!pos || pos.count < 3) return;
    out.push(m);
  });
  out.sort((a, b) => meshSortWeight(b) - meshSortWeight(a));
  return out.slice(0, MAX_MESHES_PER_PICKUP);
}

/**
 * Rim pass: depth-tested + polygon offset so lines sit on the mesh without drawing through walls.
 * Additive read keeps the “glow” read in dark corners.
 */
export function createDroppedPickupGlowMaterial(): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color: 0xffd24a,
    transparent: true,
    opacity: 0.85,
    toneMapped: false,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -1,
  });
}

function getOrCreateEdges(
  sourceGeo: THREE.BufferGeometry,
  registry: EdgeRegistry,
): THREE.EdgesGeometry {
  const id = sourceGeo.uuid;
  let e = registry.get(id);
  if (!e) {
    e = { edges: new THREE.EdgesGeometry(sourceGeo, EDGE_THRESHOLD_DEG), count: 0 };
    registry.set(id, e);
  }
  e.count += 1;
  return e.edges;
}

function releaseEdges(sourceGeoUuid: string, registry: EdgeRegistry | undefined): void {
  if (!registry) return;
  const e = registry.get(sourceGeoUuid);
  if (!e) return;
  e.count -= 1;
  if (e.count <= 0) {
    e.edges.dispose();
    registry.delete(sourceGeoUuid);
  }
}

/**
 * Attaches child {@link THREE.LineSegments} on the highest-importance meshes so edges follow transforms.
 * Reuses one {@link THREE.EdgesGeometry} per distinct source {@link THREE.BufferGeometry} under this root.
 */
export function attachDroppedPickupGlow(visualRoot: THREE.Object3D, material: THREE.LineBasicMaterial): void {
  const meshes = collectGlowMeshes(visualRoot);
  if (meshes.length === 0) return;

  const registry: EdgeRegistry = new Map();
  for (const m of meshes) {
    let edgesGeo: THREE.EdgesGeometry;
    try {
      edgesGeo = getOrCreateEdges(m.geometry, registry);
    } catch {
      continue;
    }
    const lines = new THREE.LineSegments(edgesGeo, material);
    lines.name = GLOW_EDGE_NAME;
    lines.renderOrder = 450;
    lines.frustumCulled = true;
    lines.raycast = () => {};
    lines.userData.pickupGlowSourceGeometryUuid = m.geometry.uuid;
    m.add(lines);
  }

  if (registry.size > 0) {
    (visualRoot.userData as Record<string, unknown>)[GLOW_EDGE_REGISTRY_KEY] = registry;
  }
}

/** Removes glow line segments under `visualRoot` and disposes edge geometries (not `material`). */
export function stripDroppedPickupGlow(visualRoot: THREE.Object3D): void {
  const registry = (visualRoot.userData as Record<string, unknown>)[GLOW_EDGE_REGISTRY_KEY] as
    | EdgeRegistry
    | undefined;
  const removeList: THREE.LineSegments[] = [];
  visualRoot.traverse((o) => {
    if (o.name !== GLOW_EDGE_NAME) return;
    const ls = o as THREE.LineSegments;
    if (ls.isLineSegments) removeList.push(ls);
  });
  for (const ls of removeList) {
    const uuid = ls.userData.pickupGlowSourceGeometryUuid as string | undefined;
    ls.removeFromParent();
    if (typeof uuid === "string") {
      releaseEdges(uuid, registry);
    } else {
      ls.geometry.dispose();
    }
  }
  delete (visualRoot.userData as Record<string, unknown>)[GLOW_EDGE_REGISTRY_KEY];
}
