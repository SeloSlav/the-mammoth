import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRulerCombined } from "@fortawesome/free-solid-svg-icons";
import {
  editorChromeHelp,
  editorChromeRowBtn,
  editorChromeSection,
} from "./editorChromeStyles.js";
import { EditorChromeSectionTitleIcon } from "./EditorChromeSectionTitleIcon.js";
import { EDITOR_CHROME_SECTION } from "./editorChromeSectionAnchors.js";
import { postSyncOwnedApartmentDecorDefaultScale } from "./editorApartmentDecorDefaultScaleSyncNetwork.js";
import type { OwnedApartmentPlacedItem } from "@the-mammoth/schemas";

export function EditorChromeMyApartmentDecorDefaultScaleSync(props: {
  placedItems: readonly OwnedApartmentPlacedItem[];
}) {
  const { placedItems } = props;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runSyncFromLayout(): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const payload = placedItems.map((item) => ({
        modelRelPath: item.modelRelPath,
        uniformScale: item.uniformScale,
        verticalScaleMul: item.verticalScaleMul,
      }));
      const result = await postSyncOwnedApartmentDecorDefaultScale({ placedItems: payload });
      setMessage(
        `Synced ${result.modelCount} default model scale${result.modelCount === 1 ? "" : "s"} from ${result.placementCount} placement${result.placementCount === 1 ? "" : "s"} (current layout). Wrote ownedApartmentDecorDefaultScale.ts — new imports in the editor use these defaults.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{ ...editorChromeSection, scrollMarginTop: 6 }}
      id={EDITOR_CHROME_SECTION.decorDefaultScale}
    >
      <EditorChromeSectionTitleIcon icon={faRulerCombined}>
        Default import scales
      </EditorChromeSectionTitleIcon>
      <p style={{ ...editorChromeHelp, marginTop: 0 }}>
        After you tune scales in this reference unit, push the first placement of each GLB into{" "}
        <code style={{ fontSize: 10 }}>ownedApartmentDecorDefaultScale.ts</code> so{" "}
        <strong>Import selected model</strong> and other units pick up the same defaults. Uses the
        current sidebar layout (save JSON separately if you want disk aligned too).
      </p>
      <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button
          type="button"
          style={editorChromeRowBtn}
          onClick={() => void runSyncFromLayout()}
          disabled={busy || placedItems.length === 0}
          title="Regenerate packages/schemas/src/ownedApartmentDecorDefaultScale.ts from this unit's placedItems"
        >
          <FontAwesomeIcon icon={faRulerCombined} style={{ marginRight: 6 }} />
          {busy ? "Syncing scales…" : "Sync default import scales"}
        </button>
      </div>
      {message ? (
        <div style={{ marginTop: 8, fontSize: 11, color: "#9fd4a3", lineHeight: 1.35 }}>{message}</div>
      ) : null}
      {error ? (
        <div style={{ marginTop: 8, fontSize: 11, color: "#f0a0a0", lineHeight: 1.35 }}>{error}</div>
      ) : null}
    </div>
  );
}
