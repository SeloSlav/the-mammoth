import { useLayoutEffect, useRef, useState } from "react";
import type { MammothItemTooltipContentModel } from "./mammothItemTooltipContent.js";
import styles from "./MammothItemTooltip.module.css";

export type MammothItemTooltipProps = {
  content: MammothItemTooltipContentModel | null;
  visible: boolean;
  /** Fixed position anchor (typically slot bbox corner before CSS transform). */
  position: { x: number; y: number };
  /** Match vibe Hotbar: opens to the left of the slot, vertically centered. */
  anchor?: "slot-left" | "none";
};

const VIEW_PAD_PX = 10;

/**
 * Correction (px) to add to `left`/`top` so `getBoundingClientRect()` fits inside the padded viewport.
 * Uses layout viewport coords — same space as `getBoundingClientRect`.
 */
function clampTooltipIntoViewport(el: HTMLElement): { dx: number; dy: number } {
  const pad = VIEW_PAD_PX;
  const vw = Math.max(1, window.innerWidth);
  const vh = Math.max(1, window.innerHeight);

  const r = el.getBoundingClientRect();
  let dx = 0;
  let dy = 0;

  if (r.right > vw - pad) dx += vw - pad - r.right;
  if (r.left + dx < pad) dx += pad - (r.left + dx);
  if (r.bottom > vh - pad) dy += vh - pad - r.bottom;
  if (r.top + dy < pad) dy += pad - (r.top + dy);

  return { dx, dy };
}

/** Stable identity for tooltip payload — parent often passes a new object literal each render. */
function tooltipPayloadKey(content: MammothItemTooltipContentModel): string {
  const stats =
    content.stats?.map((s) => `${s.label}:${s.value}:${s.color ?? ""}`).join("|") ?? "";
  return [
    content.name,
    content.category ?? "",
    content.description ?? "",
    stats,
  ].join("\x1e");
}

export function MammothItemTooltip({
  content,
  visible,
  position,
  anchor = "slot-left",
}: MammothItemTooltipProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [viewportNudge, setViewportNudge] = useState({ dx: 0, dy: 0 });

  const payloadKey = content ? tooltipPayloadKey(content) : "";

  useLayoutEffect(() => {
    if (!visible || !content) {
      setViewportNudge({ dx: 0, dy: 0 });
      return;
    }
    const el = rootRef.current;
    if (!el) return;

    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;

    const { dx, dy } = clampTooltipIntoViewport(el);
    setViewportNudge((prev) =>
      prev.dx === dx && prev.dy === dy ? prev : { dx, dy },
    );
  }, [visible, payloadKey, position.x, position.y, anchor]);

  if (!visible || !content) return null;

  const simpleTitleOnly =
    !content.category?.trim() &&
    !content.description?.trim() &&
    (!content.stats || content.stats.length === 0);

  const rootClass =
    anchor === "slot-left"
      ? `${styles.tooltipRoot} ${styles.anchorSlotLeft}`
      : styles.tooltipRoot;

  return (
    <div
      ref={rootRef}
      className={rootClass}
      style={{ left: position.x + viewportNudge.dx, top: position.y + viewportNudge.dy }}
    >
      <div className={`${styles.tooltipName} ${simpleTitleOnly ? styles.tooltipNameSimple : ""}`}>
        {content.name}
      </div>
      {content.category ? (
        <div className={styles.tooltipCategory}>{content.category}</div>
      ) : null}
      {content.description ? (
        <div className={styles.tooltipDescription}>{content.description}</div>
      ) : null}
      {content.stats && content.stats.length > 0 ? (
        <div className={styles.tooltipStatsSection}>
          {content.stats.map((stat, index) => (
            <div key={`${stat.label}-${index}`} className={styles.tooltipStatRow}>
              <span className={styles.statLabel}>{stat.label}</span>
              <span className={styles.statValue} style={{ color: stat.color }}>
                {stat.value}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
