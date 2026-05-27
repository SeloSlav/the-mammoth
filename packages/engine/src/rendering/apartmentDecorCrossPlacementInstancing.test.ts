import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  applyApartmentDecorCrossPlacementInstancing,
  getLastApartmentDecorInstancingSummary,
  summarizeApartmentDecorCrossPlacementInstancingInScene,
} from "./apartmentDecorCrossPlacementInstancing.js";

function decorPropGroup(
  modelRelPath: string,
  opts?: { placedKind?: string; meshCount?: number },
): THREE.Group {
  const root = new THREE.Group();
  root.userData.mammothApartmentDecorProp = true;
  root.userData.mammothApartmentDecorModelRelPath = modelRelPath;
  if (opts?.placedKind !== undefined) {
    root.userData.mammothApartmentDecorPlacedKind = opts.placedKind;
  }
  const meshCount = opts?.meshCount ?? 1;
  for (let i = 0; i < meshCount; i++) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.2, 0.2),
      new THREE.MeshBasicMaterial({ color: 0xffffff * (i + 1) }),
    );
    mesh.position.set(i * 0.3, 0, 0);
    mesh.name = `part_${i}`;
    root.add(mesh);
  }
  return root;
}

describe("applyApartmentDecorCrossPlacementInstancing", () => {
  it("batches ≥3 identical non-pick props into one InstancedMesh", () => {
    const unitRoot = new THREE.Group();
    const path = "static/models/objects/empty-beer-can-ozujsko.glb";
    for (let i = 0; i < 3; i++) {
      const g = decorPropGroup(path);
      g.position.set(i, 0, 0);
      unitRoot.add(g);
    }

    applyApartmentDecorCrossPlacementInstancing(unitRoot);

    const instanced = unitRoot.children.filter(
      (c) => c instanceof THREE.InstancedMesh,
    ) as THREE.InstancedMesh[];
    expect(instanced).toHaveLength(1);
    expect(instanced[0]!.count).toBe(3);
    expect(unitRoot.children.filter((c) => c.visible === false)).toHaveLength(3);

    const summary = getLastApartmentDecorInstancingSummary();
    expect(summary?.batches).toBe(1);
    expect(summary?.instances).toBe(3);
  });

  it("batches explicit placement roots under a shared parent (corridor / stairwell)", () => {
    const buildingRoot = new THREE.Group();
    const path = "static/models/objects/light-ceiling-2.glb";
    for (let i = 0; i < 4; i++) {
      const landing = new THREE.Group();
      landing.position.set(i * 2, 0, 0);
      buildingRoot.add(landing);
      const wrap = decorPropGroup(path);
      wrap.userData.mammothStairwellCeilingLight = true;
      landing.add(wrap);
    }

    applyApartmentDecorCrossPlacementInstancing(buildingRoot, {
      placementRoots: buildingRoot.children.flatMap((l) => l.children),
    });

    expect(
      buildingRoot.children.some((c) => c instanceof THREE.InstancedMesh),
    ).toBe(true);
    expect(getLastApartmentDecorInstancingSummary()?.instances).toBe(4);
  });

  it("summarizeApartmentDecorCrossPlacementInstancingInScene counts batches and hidden roots", () => {
    const root = new THREE.Group();
    const path = "static/models/objects/light-ceiling-2.glb";
    for (let i = 0; i < 3; i++) {
      root.add(decorPropGroup(path));
    }
    applyApartmentDecorCrossPlacementInstancing(root);
    const snap = summarizeApartmentDecorCrossPlacementInstancingInScene(root);
    expect(snap.visibleBatches).toBe(1);
    expect(snap.visibleInstances).toBe(3);
    expect(snap.hiddenPlacementRoots).toBe(3);
    expect(snap.estDrawCallsSaved).toBe(2);
    expect(snap.lastRebuildSummary).toContain("light-ceiling-2.glb");
  });

  it("skips stash and notebook paths", () => {
    const unitRoot = new THREE.Group();
    const stashPath = "static/models/objects/footlocker.glb";
    for (let i = 0; i < 3; i++) {
      unitRoot.add(decorPropGroup(stashPath, { placedKind: "wardrobe_stash" }));
    }
    for (let i = 0; i < 3; i++) {
      unitRoot.add(decorPropGroup("static/models/objects/notebook.glb"));
    }

    applyApartmentDecorCrossPlacementInstancing(unitRoot);

    expect(unitRoot.children.some((c) => c instanceof THREE.InstancedMesh)).toBe(false);
    expect(getLastApartmentDecorInstancingSummary()).toBeNull();
  });

  it("batches every submesh when a prop has multiple meshes (post-merge fallback)", () => {
    const unitRoot = new THREE.Group();
    const path = "static/models/objects/cigarette.glb";
    for (let i = 0; i < 3; i++) {
      const g = decorPropGroup(path, { meshCount: 2 });
      g.position.set(i, 0, 0);
      unitRoot.add(g);
    }

    applyApartmentDecorCrossPlacementInstancing(unitRoot);

    const instanced = unitRoot.children.filter(
      (c) => c instanceof THREE.InstancedMesh,
    ) as THREE.InstancedMesh[];
    expect(instanced).toHaveLength(2);
    expect(instanced.every((m) => m.count === 3)).toBe(true);
  });
});
