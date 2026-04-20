import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  applyWorldMetricUvsToAxisAlignedBoxMesh,
  WALL_SEGMENT_UV_METERS_PER_TILE,
} from "./wallWithDoorCutout.js";

describe("applyWorldMetricUvsToAxisAlignedBoxMesh", () => {
  it("makes UV range scale with world extent on a long thin wall (no 0–1 stretch)", () => {
    const short = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 2.5, 2),
      new THREE.MeshStandardMaterial(),
    );
    short.position.set(1, 0, 0);
    applyWorldMetricUvsToAxisAlignedBoxMesh(short);

    const long = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 2.5, 14),
      new THREE.MeshStandardMaterial(),
    );
    long.position.set(1, 0, 0);
    applyWorldMetricUvsToAxisAlignedBoxMesh(long);

    const uvShort = short.geometry.attributes.uv!;
    const uvLong = long.geometry.attributes.uv!;
    let maxUShort = -Infinity;
    let maxULong = -Infinity;
    for (let i = 0; i < uvShort.count; i++) {
      maxUShort = Math.max(maxUShort, uvShort.getX(i));
    }
    for (let i = 0; i < uvLong.count; i++) {
      maxULong = Math.max(maxULong, uvLong.getX(i));
    }
    const spanRatio = (14 - 2) / 2; // extra Z span vs short piece
    expect(maxULong - maxUShort).toBeGreaterThan(spanRatio * 0.9 / WALL_SEGMENT_UV_METERS_PER_TILE);
  });
});
