import { useEditorStore } from "../../state/editorStore.js";
import { serializeOwnedApartmentBuiltinsDocPretty } from "../../state/editorStoreDocSerialize.js";
import { postSaveOwnedApartmentBuiltins } from "../../ui/editorChromeNetwork.js";
import { resolveOwnedApartmentBuiltinsForDiskWrite } from "./resolveOwnedApartmentBuiltinsForDiskWrite.js";

/**
 * Writes the current in-memory owned-default apartment layout to
 * `content/apartment/owned_apartment_builtins.json` via the editor dev middleware.
 *
 * Used after object-group CRUD so a browser refresh does not drop groups when the user only
 * clicked “Save group” (in-memory) and not the full “Save owned apartment builtins” action.
 */
export async function flushOwnedApartmentBuiltinsToDisk(): Promise<void> {
  const st = useEditorStore.getState();
  const json = serializeOwnedApartmentBuiltinsDocPretty(
    resolveOwnedApartmentBuiltinsForDiskWrite(st),
  );
  await postSaveOwnedApartmentBuiltins(json);
  useEditorStore.getState().clearOwnedApartmentBuiltinsDiskFlushFlag();
}
