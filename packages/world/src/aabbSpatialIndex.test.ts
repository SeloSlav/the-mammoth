import { describe, expect, it } from "vitest";
import {
  aabbIntersectsFrustum,
  buildAabbSpatialIndex,
  type Aabb3,
} from "./aabbSpatialIndex.js";

describe("buildAabbSpatialIndex", () => {
  const boxes: Aabb3[] = [
    { min: [0, 0, 0], max: [1, 2, 1] },
    { min: [10, 0, 10], max: [11, 2, 11] },
    { min: [20, 0, 0], max: [21, 2, 1] },
  ];

  it("returns only indices overlapping a 3D query box", () => {
    const idx = buildAabbSpatialIndex(boxes);
    const hits: number[] = [];
    idx.visitInBox(9.5, 11.5, -1, 3, 9.5, 11.5, (i) => hits.push(i));
    expect(hits).toEqual([1]);
  });

  it("matches brute-force frustum visits", () => {
    const idx = buildAabbSpatialIndex(boxes);
    const planes: Readonly<[number, number, number, number]>[] = [
      [1, 0, 0, -0.5],
      [-1, 0, 0, 10.5],
      [0, 1, 0, 0],
      [0, -1, 0, 3],
      [0, 0, 1, 0],
      [0, 0, -1, 12],
    ];
    const indexed: number[] = [];
    idx.visitInFrustum(planes, (i) => indexed.push(i));
    const brute: number[] = [];
    for (let i = 0; i < boxes.length; i++) {
      if (aabbIntersectsFrustum(boxes[i]!, planes)) brute.push(i);
    }
    indexed.sort((a, b) => a - b);
    brute.sort((a, b) => a - b);
    expect(indexed).toEqual(brute);
  });
});
