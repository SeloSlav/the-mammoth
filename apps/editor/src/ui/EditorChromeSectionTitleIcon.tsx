import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import type { ReactNode } from "react";
import { editorChromeGroupTitle, editorChromeSectionTitle } from "./editorChromeStyles.js";

/**
 * Section card header: Font Awesome icon + uppercase title (visual scan in the editor rail).
 */
export function EditorChromeSectionTitleIcon(props: {
  icon: IconDefinition;
  children: ReactNode;
}): React.ReactNode {
  const { icon, children } = props;
  return (
    <span
      style={{
        ...editorChromeSectionTitle,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <FontAwesomeIcon
        icon={icon}
        fixedWidth
        style={{ opacity: 0.88, fontSize: "0.95em" }}
        aria-hidden
      />
      <span>{children}</span>
    </span>
  );
}

/** Divider sub-heading inside one large card (e.g. Disk / Edits in the apartment unit card). */
export function EditorChromeGroupTitleIcon(props: {
  icon: IconDefinition;
  children: ReactNode;
}): React.ReactNode {
  const { icon, children } = props;
  return (
    <span
      style={{
        ...editorChromeGroupTitle,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <FontAwesomeIcon
        icon={icon}
        fixedWidth
        style={{ opacity: 0.78, fontSize: "0.92em" }}
        aria-hidden
      />
      <span>{children}</span>
    </span>
  );
}