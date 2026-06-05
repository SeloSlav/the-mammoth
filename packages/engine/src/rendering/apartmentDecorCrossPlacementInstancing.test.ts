import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  applyApartmentDecorCrossPlacementInstancing,
  getLastApartmentDecorInstancingSummary,
  summarizeApartmentDecorCrossPlacementInstancingInScene,
  syncApartmentDecorCrossPlacementBatchVisibility,
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

  it("partitions apartment decor batches by unit and activates only PVS-visible sectors", () => {
    const decorRoot = new THREE.Group();
    const path = "static/models/objects/cigarette.glb";
    for (const [unitKey, level, x] of [
      ["floor|18|unit_a", 18, 0],
      ["floor|19|unit_b", 19, 20],
    ] as const) {
      for (let i = 0; i < 3; i++) {
        const g = decorPropGroup(path);
        g.userData.mammothApartmentUnitKey = unitKey;
        g.userData.mammothPlateLevelIndex = level;
        g.position.set(x + i, level * 3, 0);
        decorRoot.add(g);
      }
    }

    applyApartmentDecorCrossPlacementInstancing(decorRoot);

    const batches = decorRoot.children.filter(
      (c) => c instanceof THREE.InstancedMesh,
    ) as THREE.InstancedMesh[];
    expect(batches).toHaveLength(2);
    expect(batches.map((batch) => batch.userData.mammothApartmentUnitKey).sort()).toEqual([
      "floor|18|unit_a",
      "floor|19|unit_b",
    ]);
    expect(batches.map((batch) => batch.userData.mammothPlateLevelIndex).sort()).toEqual([18, 19]);

    syncApartmentDecorCrossPlacementBatchVisibility(decorRoot, {
      allowDemand: true,
      visibleUnitKeys: new Set(["floor|19|unit_b"]),
    });
    expect(
      batches.find((batch) => batch.userData.mammothApartmentUnitKey === "floor|18|unit_a")
        ?.visible,
    ).toBe(false);
    expect(
      batches.find((batch) => batch.userData.mammothApartmentUnitKey === "floor|19|unit_b")
        ?.visible,
    ).toBe(true);
  });

  it("does not cross-batch identical props between authored apartment units", () => {
    const decorRoot = new THREE.Group();
    const path = "static/models/objects/cigarette.glb";
    for (const unitKey of ["floor|18|unit_a", "floor|18|unit_b"]) {
      for (let i = 0; i < 2; i++) {
        const g = decorPropGroup(path);
        g.userData.mammothApartmentUnitKey = unitKey;
        decorRoot.add(g);
      }
    }

    applyApartmentDecorCrossPlacementInstancing(decorRoot);

    expect(decorRoot.children.some((c) => c instanceof THREE.InstancedMesh)).toBe(false);
    expect(decorRoot.children.every((c) => c.visible)).toBe(true);
  });

  it("inherits the nearest floor tag for non-unit fixture batches", () => {
    const buildingRoot = new THREE.Group();
    const path = "static/models/objects/light-ceiling-2.glb";
    const placementRoots: THREE.Object3D[] = [];
    for (const level of [18, 19]) {
      const floor = new THREE.Group();
      floor.userData.mammothPlateLevelIndex = level;
      buildingRoot.add(floor);
      for (let i = 0; i < 3; i++) {
        const g = decorPropGroup(path);
        floor.add(g);
        placementRoots.push(g);
      }
    }

    applyApartmentDecorCrossPlacementInstancing(buildingRoot, { placementRoots });

    const batches = buildingRoot.children.filter(
      (c) => c instanceof THREE.InstancedMesh,
    ) as THREE.InstancedMesh[];
    expect(batches).toHaveLength(2);
    expect(batches.map((batch) => batch.userData.mammothPlateLevelIndex).sort()).toEqual([18, 19]);
  });

  it("leaves exterior facade decor on its per-placement visibility path", () => {
    const decorRoot = new THREE.Group();
    const path = "static/models/objects/window-shutter.glb";
    for (let i = 0; i < 3; i++) {
      const g = decorPropGroup(path);
      g.userData.mammothExteriorFacadeDecor = true;
      decorRoot.add(g);
    }

    applyApartmentDecorCrossPlacementInstancing(decorRoot);

    expect(decorRoot.children.some((c) => c instanceof THREE.InstancedMesh)).toBe(false);
    expect(decorRoot.children.every((c) => c.visible)).toBe(true);
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
