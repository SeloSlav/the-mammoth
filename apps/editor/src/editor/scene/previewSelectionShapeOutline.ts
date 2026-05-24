import * as THREE from "three";

export type PreviewSelectionOutlineOptions = {
  /** Include a stable fraction of source meshes (0–1). Default 1 = all meshes. */
  meshIncludeRatio?: number;
  /** Skip the translucent shell — draw edge wireframe only. */
  wireframeOnly?: boolean;
};

type OutlineEntry = {
  source: THREE.Mesh;
  shell: THREE.Mesh | null;
  edges: THREE.LineSegments;
};

const DEFAULT_OUTLINE_OPTIONS: PreviewSelectionOutlineOptions = {};

/**
 * Pink selection shell that follows the actual preview meshes, not just their world AABB.
 * This keeps cab / landing / stairwell picks readable when the selected part is thin or grouped.
 */
export class PreviewSelectionShapeOutline extends THREE.Group {
  private sourceRoot: THREE.Object3D | null = null;
  private multiSourceRoots: THREE.Object3D[] | null = null;
  private entries: OutlineEntry[] = [];
  private outlineOptions: PreviewSelectionOutlineOptions = DEFAULT_OUTLINE_OPTIONS;
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
      (obj.userData.editorLandingOpeningProxy === true ||
        obj.userData.editorStairOpeningProxy === true ||
        obj.userData.editorMyApartmentWallOpeningProxy === true)
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

  private selectMeshesForOutline(
    meshes: readonly THREE.Mesh[],
    ratio: number,
  ): THREE.Mesh[] {
    if (meshes.length <= 1 || ratio >= 1) return [...meshes];
    const clamped = Math.max(0.1, Math.min(1, ratio));
    const stride = Math.max(2, Math.round(1 / clamped));
    return meshes.filter((_, index) => index % stride === 0);
  }

  private optionsMatch(next: PreviewSelectionOutlineOptions): boolean {
    return (
      (this.outlineOptions.meshIncludeRatio ?? 1) === (next.meshIncludeRatio ?? 1) &&
      (this.outlineOptions.wireframeOnly ?? false) === (next.wireframeOnly ?? false)
    );
  }

  private clearEntries(): void {
    for (const entry of this.entries) {
      entry.edges.geometry.dispose();
    }
    this.clear();
    this.entries = [];
    this.sourceRoot = null;
    this.multiSourceRoots = null;
    this.outlineOptions = DEFAULT_OUTLINE_OPTIONS;
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

  private rebuildFromMeshes(
    primaryRoot: THREE.Object3D | null,
    meshes: readonly THREE.Mesh[],
    options: PreviewSelectionOutlineOptions = DEFAULT_OUTLINE_OPTIONS,
  ): void {
    this.clearEntries();
    this.sourceRoot = primaryRoot;
    this.outlineOptions = options;
    const ratio = options.meshIncludeRatio ?? 1;
    const wireframeOnly = options.wireframeOnly === true;
    const selectedMeshes = this.selectMeshesForOutline(meshes, ratio);
    for (const mesh of selectedMeshes) {
      let shell: THREE.Mesh | null = null;
      if (!wireframeOnly) {
        shell = new THREE.Mesh(mesh.geometry, this.shellMaterial);
        shell.matrixAutoUpdate = false;
        shell.frustumCulled = false;
        shell.renderOrder = 1000;
        shell.raycast = () => {};
        this.add(shell);
      }
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(mesh.geometry),
        this.edgeMaterial,
      );
      edges.matrixAutoUpdate = false;
      edges.frustumCulled = false;
      edges.renderOrder = 1001;
      edges.raycast = () => {};
      this.add(edges);
      this.entries.push({ source: mesh, shell, edges });
    }
    this.syncFromSource();
  }

  private rebuildMulti(
    roots: readonly THREE.Object3D[],
    options: PreviewSelectionOutlineOptions = DEFAULT_OUTLINE_OPTIONS,
  ): void {
    const ordered = [...roots];
    const meshes: THREE.Mesh[] = [];
    for (const root of ordered) meshes.push(...this.collectSourceMeshes(root));
    if (meshes.length === 0) {
      this.clearEntries();
      return;
    }
    this.rebuildFromMeshes(null, meshes, options);
    this.multiSourceRoots = [...ordered];
  }

  private rootsMatch(
    prev: THREE.Object3D[] | null,
    next: readonly THREE.Object3D[],
  ): boolean {
    if (!prev || prev.length !== next.length) return false;
    for (let i = 0; i < prev.length; i++) {
      if (prev[i] !== next[i]) return false;
    }
    return true;
  }

  private syncFromSource(): void {
    const multi = this.multiSourceRoots;
    if (multi && multi.length > 0) {
      if (this.entries.length === 0) {
        this.visible = false;
        return;
      }
      let anyVisible = false;
      for (const entry of this.entries) {
        if (entry.shell) {
          this.syncEntryWorldTransform(entry.source, entry.shell, 1.06);
        }
        this.syncEntryWorldTransform(entry.source, entry.edges, 1.03);
        if (entry.shell?.visible || entry.edges.visible) anyVisible = true;
      }
      this.visible = anyVisible;
      return;
    }
    if (!this.sourceRoot || this.entries.length === 0) {
      this.visible = false;
      return;
    }
    let anyVisible = false;
    for (const entry of this.entries) {
      if (entry.shell) {
        this.syncEntryWorldTransform(entry.source, entry.shell, 1.06);
      }
      this.syncEntryWorldTransform(entry.source, entry.edges, 1.03);
      if (entry.shell?.visible || entry.edges.visible) anyVisible = true;
    }
    this.visible = anyVisible;
  }

  setFromRoots(
    roots: readonly THREE.Object3D[] | null,
    options: PreviewSelectionOutlineOptions = DEFAULT_OUTLINE_OPTIONS,
  ): void {
    if (!roots || roots.length === 0) {
      this.clearEntries();
      return;
    }
    const meshes: THREE.Mesh[] = [];
    for (const r of roots) meshes.push(...this.collectSourceMeshes(r));
    if (meshes.length === 0) {
      this.clearEntries();
      return;
    }
    const selectedMeshes = this.selectMeshesForOutline(meshes, options.meshIncludeRatio ?? 1);
    const canReuse =
      this.rootsMatch(this.multiSourceRoots, roots) &&
      this.optionsMatch(options) &&
      selectedMeshes.length === this.entries.length &&
      selectedMeshes.every((mesh, index) => this.entries[index]?.source === mesh);
    if (!canReuse) this.rebuildMulti(roots, options);
    else {
      this.outlineOptions = options;
      this.syncFromSource();
    }
  }

  setFromObject(
    obj: THREE.Object3D | null,
    options: PreviewSelectionOutlineOptions = DEFAULT_OUTLINE_OPTIONS,
  ): void {
    if (!obj) {
      this.clearEntries();
      return;
    }
    const meshes = this.collectSourceMeshes(obj);
    if (meshes.length === 0) {
      this.clearEntries();
      return;
    }
    this.multiSourceRoots = null;
    const selectedMeshes = this.selectMeshesForOutline(meshes, options.meshIncludeRatio ?? 1);
    const canReuse =
      obj === this.sourceRoot &&
      this.optionsMatch(options) &&
      selectedMeshes.length === this.entries.length &&
      selectedMeshes.every((mesh, index) => this.entries[index]?.source === mesh);
    if (!canReuse) {
      this.rebuildFromMeshes(obj, meshes, options);
      return;
    }
    this.outlineOptions = options;
    this.syncFromSource();
  }

  dispose(): void {
    this.clearEntries();
    this.shellMaterial.dispose();
    this.edgeMaterial.dispose();
  }
}
