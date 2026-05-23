import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { deepDisposeObject3D, detachRegistryCloneSubtree } from "./deepDisposeObject3D.js";

describe("deepDisposeObject3D / detachRegistryCloneSubtree", () => {
  it("deepDisposeObject3D disposes owned mesh GPU resources", () => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial();
    const mesh = new THREE.Mesh(geo, mat);
    const geoDispose = vi.spyOn(geo, "dispose");
    const matDispose = vi.spyOn(mat, "dispose");

    deepDisposeObject3D(mesh);

    expect(geoDispose).toHaveBeenCalledOnce();
    expect(matDispose).toHaveBeenCalledOnce();
  });

  it("detachRegistryCloneSubtree keeps template geometry alive", () => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial();
    const template = new THREE.Mesh(geo, mat);
    const cloneRoot = new THREE.Group();
    cloneRoot.add(template.clone(true));
    const cloneMesh = cloneRoot.children[0] as THREE.Mesh;
    const geoDispose = vi.spyOn(geo, "dispose");

    expect(cloneMesh.geometry).toBe(geo);

    detachRegistryCloneSubtree(cloneRoot);

    expect(geoDispose).not.toHaveBeenCalled();
    expect(geo.attributes.position).toBeDefined();
    expect(cloneRoot.parent).toBeNull();
  });

  it("deepDisposeObject3D on a registry clone also disposes the shared template geometry", () => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const template = new THREE.Mesh(geo, new THREE.MeshStandardMaterial());
    const clone = template.clone(true);
    const geoDispose = vi.spyOn(geo, "dispose");

    deepDisposeObject3D(clone);

    expect(geoDispose).toHaveBeenCalledOnce();
  });
});
