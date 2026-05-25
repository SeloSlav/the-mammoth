import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  attachApartmentWarmFixtureBulbGlow,
  MAMMOTH_APARTMENT_DECOR_SKIP_MOOD_GRADE_UD,
  MAMMOTH_APARTMENT_FIXTURE_BULB_GLOW_UD,
  moodGradeMammothApartmentDecorMaterial,
  moodGradeMammothApartmentDecorMesh,
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

  it("strips emissive from ceiling fixtures without authored emissive maps", () => {
    const graded = moodGradeMammothApartmentDecorMaterial(
      new THREE.MeshStandardMaterial({
        emissive: 0xffffff,
        emissiveIntensity: 2,
      }),
      { modelRelPath: "static/models/objects/light-ceiling.glb" },
    ) as THREE.MeshStandardMaterial;

    expect(graded.emissive.r).toBe(0);
    expect(graded.emissiveMap).toBeNull();
  });

  it("preserves authored emissive maps on ceiling fixtures with bulb masks", () => {
    const graded = moodGradeMammothApartmentDecorMaterial(
      new THREE.MeshStandardMaterial({
        emissive: 0xffffff,
        emissiveIntensity: 1,
        emissiveMap: new THREE.Texture(),
      }),
      { modelRelPath: "static/models/objects/light-ceiling-2.glb" },
    ) as THREE.MeshStandardMaterial;

    expect(graded.emissiveMap).not.toBeNull();
    expect(graded.emissive.r).toBeGreaterThan(0.95);
    expect(graded.emissiveIntensity).toBeGreaterThan(1.4);
    expect(graded.toneMapped).toBe(false);
  });

  it("grades grow-op fixtures with cool white emissive", () => {
    const graded = moodGradeMammothApartmentDecorMaterial(
      new THREE.MeshStandardMaterial({
        emissive: 0xffffff,
        emissiveIntensity: 1,
        emissiveMap: new THREE.Texture(),
      }),
      { modelRelPath: "static/models/objects/light-grow-op.glb" },
    ) as THREE.MeshStandardMaterial;

    expect(graded.emissive.b).toBeGreaterThan(graded.emissive.r);
    expect(graded.emissiveIntensity).toBeGreaterThan(1.8);
    expect(graded.toneMapped).toBe(false);
  });

  it("turns bright chandelier materials into warm-white emissive bulbs", () => {
    const graded = moodGradeMammothApartmentDecorMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x000000,
        emissiveIntensity: 1,
      }),
      { modelRelPath: "static/models/objects/chandelier.glb" },
    ) as THREE.MeshStandardMaterial;

    expect(graded.emissive.r).toBeGreaterThan(0.95);
    expect(graded.emissive.g).toBeGreaterThan(0.9);
    expect(graded.emissiveIntensity).toBeGreaterThan(1.2);
    expect(graded.toneMapped).toBe(false);
  });

  it("does not make dark chandelier housing emissive", () => {
    const graded = moodGradeMammothApartmentDecorMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x20170f,
        emissive: 0x000000,
        emissiveIntensity: 1,
      }),
      { modelRelPath: "static/models/objects/chandelier.glb" },
    ) as THREE.MeshStandardMaterial;

    expect(graded.emissive.r).toBe(0);
    expect(graded.emissiveIntensity).toBe(1);
  });

  it("only tints emissive-masked screen areas on TV/computer, not the whole housing", () => {
    const housingOnly = moodGradeMammothApartmentDecorMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x444444,
        emissive: 0xffffff,
        emissiveIntensity: 1,
      }),
      { modelRelPath: "static/models/objects/tv.glb" },
    ) as THREE.MeshStandardMaterial;

    expect(housingOnly.emissive.r).toBe(0);
    expect(housingOnly.emissiveMap).toBeNull();

    const masked = moodGradeMammothApartmentDecorMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x444444,
        emissive: 0xffffff,
        emissiveIntensity: 1,
        emissiveMap: new THREE.Texture(),
      }),
      { modelRelPath: "static/models/objects/computer.glb" },
    ) as THREE.MeshStandardMaterial;

    expect(masked.emissiveMap).not.toBeNull();
    expect(masked.emissive.b).toBeGreaterThan(masked.emissive.r);
    expect(masked.toneMapped).toBe(false);
  });
});

describe("moodGradeMammothApartmentDecorMesh skip flag", () => {
  it("leaves transparent decor materials unchanged when skip userData is set", () => {
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.045,
      roughness: 0,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    mesh.userData[MAMMOTH_APARTMENT_DECOR_SKIP_MOOD_GRADE_UD] = true;

    moodGradeMammothApartmentDecorMesh(mesh);

    const graded = mesh.material as THREE.MeshStandardMaterial;
    expect(graded.color.getHex()).toBe(0xffffff);
    expect(graded.opacity).toBe(0.045);
    expect(graded.roughness).toBe(0);
  });
});

describe("attachApartmentWarmFixtureBulbGlow", () => {
  it("adds warm lens glow to ceiling fixtures without authored emissive", () => {
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
    ).toBe(true);
  });

  it("adds warm lens glow to standing lamps without authored emissive", () => {
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

    expect(
      root.children.some(
        (c) => c.userData[MAMMOTH_CEILING_LENS_GLOW_MESH_UD] === true,
      ),
    ).toBe(true);
  });

  it("adds cool lower-panel emissive for grow-op fixtures without authored emissive", () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.28, 0.4),
      new THREE.MeshStandardMaterial(),
    );
    mesh.position.y = 0.14;
    root.add(mesh);
    root.updateMatrixWorld(true);

    attachApartmentWarmFixtureBulbGlow(
      root,
      "static/models/objects/light-grow-op.glb",
    );

    expect(
      root.children.some(
        (c) => c.userData[MAMMOTH_CEILING_LENS_GLOW_MESH_UD] === true,
      ),
    ).toBe(true);
  });

  it("no-ops for empty chandelier root", () => {
    const root = new THREE.Group();
    attachApartmentWarmFixtureBulbGlow(
      root,
      "static/models/objects/chandelier.glb",
    );
    expect(root.children).toHaveLength(0);
  });
});
