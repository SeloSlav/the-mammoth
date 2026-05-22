import { describe, expect, it } from "vitest";
import {
  closeFpNotebookTipsPanel,
  isFpNotebookTipsPanelOpen,
  openFpNotebookTipsPanel,
  toggleFpNotebookTipsPanel,
} from "./fpNotebookTipsPanelState";

describe("fpNotebookTipsPanelState", () => {
  it("opens and closes the tips panel", () => {
    closeFpNotebookTipsPanel();
    expect(isFpNotebookTipsPanelOpen()).toBe(false);
    openFpNotebookTipsPanel();
    expect(isFpNotebookTipsPanelOpen()).toBe(true);
    closeFpNotebookTipsPanel();
    expect(isFpNotebookTipsPanelOpen()).toBe(false);
  });

  it("toggle flips open state", () => {
    closeFpNotebookTipsPanel();
    toggleFpNotebookTipsPanel();
    expect(isFpNotebookTipsPanelOpen()).toBe(true);
    toggleFpNotebookTipsPanel();
    expect(isFpNotebookTipsPanelOpen()).toBe(false);
    closeFpNotebookTipsPanel();
  });
});
