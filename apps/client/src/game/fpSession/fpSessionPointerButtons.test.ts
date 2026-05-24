import { describe, expect, it } from "vitest";
import { detectPointerButtonEdges } from "./fpSessionPointerButtons.js";

describe("detectPointerButtonEdges", () => {
  it("detects a lone primary press", () => {
    const edges = detectPointerButtonEdges(0, 1);
    expect(edges.primaryPress).toBe(true);
    expect(edges.secondaryPress).toBe(false);
  });

  it("detects chorded primary press while secondary is already held", () => {
    const edges = detectPointerButtonEdges(2, 3);
    expect(edges.primaryPress).toBe(true);
    expect(edges.secondaryPress).toBe(false);
    expect(edges.secondaryRelease).toBe(false);
  });

  it("detects secondary release while primary remains held", () => {
    const edges = detectPointerButtonEdges(3, 1);
    expect(edges.secondaryRelease).toBe(true);
    expect(edges.primaryRelease).toBe(false);
  });
});
