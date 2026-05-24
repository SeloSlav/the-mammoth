import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { PreviewSelectionShapeOutline } from "./previewSelectionShapeOutline.js";

describe("PreviewSelectionShapeOutline", () => {
  it("builds shape-following outline meshes for the selected object", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 3));
    mesh.position.set(4, 5, 6);
    const outline = new PreviewSelectionShapeOutline();

    outline.setFromObject(mesh);

    expect(outline.visible).toBe(true);
    expect(outline.children.length).toBe(2);
    expect(outline.children[0]!.position.toArray()).toEqual([4, 5, 6]);

    outline.dispose();
    mesh.geometry.dispose();
  });

  it("skips nested opening proxies when outlining a larger preview assembly", () => {
    const root = new THREE.Group();
    const realMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    root.add(realMesh);
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    proxy.userData.editorStairOpeningProxy = true;
    root.add(proxy);
    const outline = new PreviewSelectionShapeOutline();

    outline.setFromObject(root);

    expect(outline.children.length).toBe(2);

    outline.dispose();
    realMesh.geometry.dispose();
    proxy.geometry.dispose();
  });

  it("includes the proxy mesh when the proxy itself is selected", () => {
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    proxy.userData.editorLandingOpeningProxy = true;
    const outline = new PreviewSelectionShapeOutline();

    outline.setFromObject(proxy);

    expect(outline.children.length).toBe(2);
    expect(outline.visible).toBe(true);

    outline.dispose();
    proxy.geometry.dispose();
  });

  it("can draw a sparse wireframe-only outline for apartment décor picks", () => {
    const root = new THREE.Group();
    const meshA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const meshB = new THREE.Mesh(new THREE.SphereGeometry(0.5));
    root.add(meshA, meshB);
    const outline = new PreviewSelectionShapeOutline();

    outline.setFromObject(root, { meshIncludeRatio: 0.5, wireframeOnly: true });

    expect(outline.visible).toBe(true);
    expect(outline.children.length).toBe(1);

    outline.dispose();
    meshA.geometry.dispose();
    meshB.geometry.dispose();
  });
});
