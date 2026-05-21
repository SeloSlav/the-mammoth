import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  attachApartmentWarmFixtureBulbGlow,
  MAMMOTH_APARTMENT_FIXTURE_BULB_GLOW_UD,
  moodGradeMammothApartmentDecorMaterial,
} from "./apartmentDecorMoodGrade.js";
import { MAMMOTH_CEILING_LENS_GLOW_MESH_UD } from "./apartmentCeilingFixtureLensGlow.js";

describe("moodGradeMammothApartmentDecorMaterial warm fixtures", () => {
  it("boosts standing-lamp emissive maps for the shade read", () => {
    const graded = moodGradeMammothApartmentDecorMaterial(
      new THREE.MeshStandardMaterial({
        emissive: 0xffffff,
        emissiveIntensity: 1,
        emissiveMap: new THREE.Texture(),
      }),
      { modelRelPath: "static/models/objects/lamp-standing.glb" },
    ) as THREE.MeshStandardMaterial;

    expect(graded.emissive.r).toBeGreaterThan(0.95);
    expect(graded.emissiveIntensity).toBeGreaterThan(2);
  });

  it("strips emissive maps from ceiling fixtures", () => {
    const graded = moodGradeMammothApartmentDecorMaterial(
      new THREE.MeshStandardMaterial({
        emissive: 0xffffff,
        emissiveIntensity: 2,
        emissiveMap: new THREE.Texture(),
      }),
      { modelRelPath: "static/models/objects/light-ceiling.glb" },
    ) as THREE.MeshStandardMaterial;

    expect(graded.emissive.r).toBe(0);
    expect(graded.emissiveMap).toBeNull();
  });
});

describe("attachApartmentWarmFixtureBulbGlow", () => {
  it("does not add emissive lens glow to ceiling fixtures", () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.12, 0.35),
      new THREE.MeshStandardMaterial(),
    );
    mesh.position.y = 0.06;
    root.add(mesh);
    root.updateMatrixWorld(true);

    attachApartmentWarmFixtureBulbGlow(
      root,
      "static/models/objects/light-ceiling.glb",
    );

    expect(
      root.children.some(
        (c) => c.userData[MAMMOTH_CEILING_LENS_GLOW_MESH_UD] === true,
      ),
    ).toBe(false);
    expect(root.children).toHaveLength(1);
  });

  it("adds an in-shade emissive orb for standing lamps", () => {
    const root = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 1.0, 0.08),
      new THREE.MeshStandardMaterial(),
    );
    pole.position.y = 0.5;
    const shade = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.35, 0.35),
      new THREE.MeshStandardMaterial(),
    );
    shade.position.y = 1.18;
    root.add(pole, shade);
    root.updateMatrixWorld(true);

    attachApartmentWarmFixtureBulbGlow(
      root,
      "static/models/objects/lamp-standing.glb",
    );

    const glow = root.children.find(
      (c) => c.userData[MAMMOTH_APARTMENT_FIXTURE_BULB_GLOW_UD] === true,
    ) as THREE.Mesh | undefined;
    expect(glow).toBeDefined();
    expect(glow!.position.y).toBeGreaterThan(1.0);
    expect(glow!.name).toBe("apt_standing_shade_bulb_glow");
  });

  it("no-ops for non-fixture decor", () => {
    const root = new THREE.Group();
    attachApartmentWarmFixtureBulbGlow(
      root,
      "static/models/objects/chandelier.glb",
    );
    expect(root.children).toHaveLength(0);
  });
});
