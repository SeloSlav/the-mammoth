import "../test/pretextCanvasSetup";
import { describe, expect, it } from "vitest";
import {
  blockLineCount,
  buildNotebookSpreads,
  flattenNotebookSections,
  paginateNotebookBlocks,
  NOTEBOOK_CONTENT_LINES_PER_PAGE,
} from "./playerNotebookLayout";

describe("playerNotebookLayout", () => {
  it("wraps long lines into multiple blocks", () => {
    const blocks = flattenNotebookSections();
    const bullets = blocks.filter((b) => b.type === "ref-bullet");
    expect(bullets.length).toBeGreaterThan(10);
  });

  it("uses one ruled row per layout block", () => {
    const blocks = flattenNotebookSections();
    for (const block of blocks) {
      expect(blockLineCount(block)).toBe(1);
    }
  });

  it("paginates content without exceeding line budget", () => {
    const blocks = flattenNotebookSections();
    const pages = paginateNotebookBlocks(blocks, NOTEBOOK_CONTENT_LINES_PER_PAGE);
    expect(pages.length).toBeGreaterThan(1);

    for (const page of pages) {
      const lines = page.reduce((sum, block) => sum + blockLineCount(block), 0);
      expect(lines).toBeLessThanOrEqual(NOTEBOOK_CONTENT_LINES_PER_PAGE);
    }
  });

  it("includes a cover spread plus content spreads", () => {
    const spreads = buildNotebookSpreads();
    expect(spreads[0]?.cover).toBe(true);
    expect(spreads.some((s) => !s.cover)).toBe(true);
  });
});
