import type { DbConnection } from "../../module_bindings";
import { clientMayUseApartmentStash } from "../fpApartment/fpApartmentGameplay.js";
import {
  closeFpNotebookTipsPanel,
  isFpNotebookTipsPanelOpen,
} from "../fpApartment/fpNotebookTipsPanelState.js";
import {
  closeApartmentStashAndInventory,
  getFpActiveStashPanel,
} from "./fpActiveStashPanel.js";
import { getFpInteractionFeetSnapshot } from "./fpInteractionFeetState.js";

export type DismissFpInteractPanelsArgs = {
  conn: DbConnection;
  /** Returns null when the player is outside notebook interact range. */
  getApartmentNotebookPrompt: () => unknown;
};

/** Close stash inventory / notebook UI when the player walks out of interact range. */
export function dismissFpInteractPanelsWhenOutOfRange(args: DismissFpInteractPanelsArgs): void {
  const { conn, getApartmentNotebookPrompt } = args;
  const feet = getFpInteractionFeetSnapshot();

  const activeStash = getFpActiveStashPanel();
  if (activeStash && conn.identity) {
    if (!clientMayUseApartmentStash(conn, conn.identity, activeStash.stashKey, feet)) {
      closeApartmentStashAndInventory();
    }
  }

  if (isFpNotebookTipsPanelOpen() && !getApartmentNotebookPrompt()) {
    closeFpNotebookTipsPanel();
  }
}
