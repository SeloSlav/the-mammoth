import { useSyncExternalStore } from "react";
import { faPaintBrush } from "@fortawesome/free-solid-svg-icons";
import {
  MAMMOTH_TOON_PASS_LS_KEY,
  getMammothToonPassEnabledSnapshot,
  isMammothToonPassEnabled,
  setMammothToonPassEnabled,
  subscribeMammothToonPassEnabled,
} from "@the-mammoth/engine";
import {
  editorChromeHelp,
  editorChromeLabel,
  editorChromeRowBtn,
  editorChromeSection,
} from "./editorChromeStyles.js";
import { EditorChromeSectionTitleIcon } from "./EditorChromeSectionTitleIcon.js";
import { EDITOR_CHROME_SECTION } from "./editorChromeSectionAnchors.js";

export function EditorChromeViewport() {
  const toonOn = useSyncExternalStore(
    subscribeMammothToonPassEnabled,
    getMammothToonPassEnabledSnapshot,
    () => false,
  );

  return (
    <section id={EDITOR_CHROME_SECTION.viewport} style={editorChromeSection}>
      <EditorChromeSectionTitleIcon icon={faPaintBrush}>Viewport</EditorChromeSectionTitleIcon>
      <p style={editorChromeHelp}>
        Live post-process toggles — applies on the next frame (shared with FP session via{" "}
        <code>{MAMMOTH_TOON_PASS_LS_KEY}</code>).
      </p>
      <label style={{ ...editorChromeLabel, display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="checkbox"
          checked={toonOn}
          onChange={(event) => setMammothToonPassEnabled(event.target.checked)}
        />
        Toon shader pass
      </label>
      <button
        type="button"
        style={editorChromeRowBtn}
        onClick={() => setMammothToonPassEnabled(!isMammothToonPassEnabled())}
      >
        {toonOn ? "Disable toon pass" : "Enable toon pass"}
      </button>
    </section>
  );
}
