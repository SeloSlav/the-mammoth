import type { StairWellDef } from "@the-mammoth/schemas";
import {
  STAIR_WELL_SECONDARY_OPENING_PROXY_ID,
  type StairWellAuthoringScope,
  type StairWellOpeningProxyId,
} from "./stairWellEditorIds.js";

export type StairWellEntryOpeningDef = NonNullable<StairWellDef["entryOpening"]>;

export function stairWellOpeningDefForScope(
  def: StairWellDef | undefined,
  scope: StairWellAuthoringScope,
): StairWellEntryOpeningDef | undefined {
  return scope === "ground" ? (def?.groundEntryOpening ?? def?.entryOpening) : def?.entryOpening;
}

export function stairWellOpeningDefForProxyId(
  def: StairWellDef | undefined,
  scope: StairWellAuthoringScope,
  proxyId: StairWellOpeningProxyId,
): StairWellEntryOpeningDef | undefined {
  if (proxyId === STAIR_WELL_SECONDARY_OPENING_PROXY_ID) {
    return scope === "typical" ? def?.secondaryEntryOpening : undefined;
  }
  return stairWellOpeningDefForScope(def, scope);
}
