import * as THREE from "three";

export type EditorSelectionMeshStats = {
  triangles: number;
  vertices: number;
  meshCount: number;
};

function countGeometryTopology(geometry: THREE.BufferGeometry): {
  triangles: number;
  vertices: number;
} {
  const position = geometry.attributes.position;
  if (!position) return { triangles: 0, vertices: 0 };

  const vertices = position.count;
  const index = geometry.index;
  if (index) {
    return { triangles: Math.floor(index.count / 3), vertices };
  }
  return { triangles: Math.floor(vertices / 3), vertices };
}

/** Sum mesh / instanced-mesh topology under a selection root (world transforms ignored). */
export function measureEditorSelectionMeshStats(root: THREE.Object3D): EditorSelectionMeshStats {
  let triangles = 0;
  let vertices = 0;
  let meshCount = 0;

  root.traverse((obj) => {
    if (obj instanceof THREE.InstancedMesh) {
      meshCount += 1;
      const { triangles: tri, vertices: vert } = countGeometryTopology(obj.geometry);
      const instances = Math.max(0, obj.count);
      triangles += tri * instances;
      vertices += vert * instances;
      return;
    }
    if (!(obj instanceof THREE.Mesh)) return;
    meshCount += 1;
    const { triangles: tri, vertices: vert } = countGeometryTopology(obj.geometry);
    triangles += tri;
    vertices += vert;
  });

  return { triangles, vertices, meshCount };
}

export function formatEditorSelectionStat(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("en-US");
}
