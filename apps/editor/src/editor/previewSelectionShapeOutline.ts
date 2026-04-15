import * as THREE from "three";

type OutlineEntry = {
  source: THREE.Mesh;
  shell: THREE.Mesh;
  edges: THREE.LineSegments;
};

/**
 * Pink selection shell that follows the actual preview meshes, not just their world AABB.
 * This keeps cab / landing / stairwell picks readable when the selected part is thin or grouped.
 */
export class PreviewSelectionShapeOutline extends THREE.Group {
  private sourceRoot: THREE.Object3D | null = null;
  private entries: OutlineEntry[] = [];
  private readonly shellMaterial: THREE.MeshBasicMaterial;
  private readonly edgeMaterial: THREE.LineBasicMaterial;
  private readonly tempPos = new THREE.Vector3();
  private readonly tempQuat = new THREE.Quaternion();
  private readonly tempScale = new THREE.Vector3();

  constructor(color = 0xff4fa3) {
    super();
    this.name = "preview_selection_shape_outline";
    this.frustumCulled = false;
    this.renderOrder = 1000;
    this.visible = false;
    this.shellMaterial = new THREE.MeshBasicMaterial({
      color,
      side: THREE.BackSide,
      toneMapped: false,
      transparent: true,
      opacity: 0.16,
      depthTest: false,
      depthWrite: false,
    });
    this.edgeMaterial = new THREE.LineBasicMaterial({
      color,
      toneMapped: false,
      transparent: true,
      opacity: 0.98,
      depthTest: false,
      depthWrite: false,
    });
  }

  private shouldIncludeMesh(root: THREE.Object3D, obj: THREE.Object3D): obj is THREE.Mesh {
    if (!(obj instanceof THREE.Mesh)) return false;
    if (obj.visible === false) return false;
    if (!obj.geometry) return false;
    if (
      obj !== root &&
      (obj.userData.editorLandingOpeningProxy === true || obj.userData.editorStairOpeningProxy === true)
    ) {
      return false;
    }
    return true;
  }

  private collectSourceMeshes(root: THREE.Object3D): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    root.traverse((obj) => {
      if (this.shouldIncludeMesh(root, obj)) meshes.push(obj);
    });
    return meshes;
  }

  private clearEntries(): void {
    for (const entry of this.entries) {
      entry.edges.geometry.dispose();
    }
    this.clear();
    this.entries = [];
    this.sourceRoot = null;
    this.visible = false;
  }

  private syncEntryWorldTransform(
    source: THREE.Mesh,
    target: THREE.Object3D,
    inflateScale: number,
  ): void {
    source.updateWorldMatrix(true, false);
    source.matrixWorld.decompose(this.tempPos, this.tempQuat, this.tempScale);
    target.position.copy(this.tempPos);
    target.quaternion.copy(this.tempQuat);
    target.scale.copy(this.tempScale).multiplyScalar(inflateScale);
    target.updateMatrix();
    target.visible = source.visible;
  }

  private rebuild(root: THREE.Object3D, meshes: readonly THREE.Mesh[]): void {
    this.clearEntries();
    this.sourceRoot = root;
    for (const mesh of meshes) {
      const shell = new THREE.Mesh(mesh.geometry, this.shellMaterial);
      shell.matrixAutoUpdate = false;
      shell.frustumCulled = false;
      shell.renderOrder = 1000;
      shell.raycast = () => {};
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), this.edgeMaterial);
      edges.matrixAutoUpdate = false;
      edges.frustumCulled = false;
      edges.renderOrder = 1001;
      edges.raycast = () => {};
      this.add(shell);
      this.add(edges);
      this.entries.push({ source: mesh, shell, edges });
    }
    this.syncFromSource();
  }

  private syncFromSource(): void {
    if (!this.sourceRoot || this.entries.length === 0) {
      this.visible = false;
      return;
    }
    let anyVisible = false;
    for (const entry of this.entries) {
      this.syncEntryWorldTransform(entry.source, entry.shell, 1.06);
      this.syncEntryWorldTransform(entry.source, entry.edges, 1.03);
      if (entry.shell.visible) anyVisible = true;
    }
    this.visible = anyVisible;
  }

  setFromObject(obj: THREE.Object3D | null): void {
    if (!obj) {
      this.clearEntries();
      return;
    }
    const meshes = this.collectSourceMeshes(obj);
    if (meshes.length === 0) {
      this.clearEntries();
      return;
    }
    const canReuse =
      obj === this.sourceRoot &&
      meshes.length === this.entries.length &&
      meshes.every((mesh, index) => this.entries[index]?.source === mesh);
    if (!canReuse) {
      this.rebuild(obj, meshes);
      return;
    }
    this.syncFromSource();
  }

  dispose(): void {
    this.clearEntries();
    this.shellMaterial.dispose();
    this.edgeMaterial.dispose();
  }
}
