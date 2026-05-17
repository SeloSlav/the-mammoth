import * as THREE from "three";

/**
 * World-axis AABB wire around an object — cheap, readable “selection border” for the editor.
 */
export class FpSelectionAabbOutline extends THREE.LineSegments {
  constructor(color = 0x66e8ff) {
    const mat = new THREE.LineBasicMaterial({
      color,
      depthTest: true,
      toneMapped: false,
      transparent: true,
      opacity: 0.95,
    });
    super(new THREE.BufferGeometry(), mat);
    this.name = "fp_selection_aabb_outline";
    this.frustumCulled = false;
    this.renderOrder = 1000;
  }

  setFromUnionOfObjects(objects: readonly THREE.Object3D[]): void {
    const list = objects.filter(Boolean);
    if (list.length === 0) {
      this.visible = false;
      return;
    }
    const box = new THREE.Box3();
    let any = false;
    for (const obj of list) {
      obj.updateWorldMatrix(true, true);
      const b = new THREE.Box3().setFromObject(obj);
      if (!b.isEmpty()) {
        box.union(b);
        any = true;
      }
    }
    if (!any) {
      this.visible = false;
      return;
    }
    this.visible = true;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const boxGeo = new THREE.BoxGeometry(size.x, size.y, size.z);
    const edges = new THREE.EdgesGeometry(boxGeo);
    boxGeo.dispose();
    this.geometry.dispose();
    this.geometry = edges;
    this.position.copy(center);
    this.quaternion.identity();
    this.scale.set(1, 1, 1);
  }

  setFromObject(obj: THREE.Object3D | null): void {
    if (!obj) {
      this.visible = false;
      return;
    }
    obj.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) {
      this.visible = false;
      return;
    }
    this.visible = true;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const boxGeo = new THREE.BoxGeometry(size.x, size.y, size.z);
    const edges = new THREE.EdgesGeometry(boxGeo);
    boxGeo.dispose();
    this.geometry.dispose();
    this.geometry = edges;
    this.position.copy(center);
    this.quaternion.identity();
    this.scale.set(1, 1, 1);
  }
}
