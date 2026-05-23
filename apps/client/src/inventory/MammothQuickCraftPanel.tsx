import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useMemo } from "react";
import { THEME_TEXT_FAINT, THEME_TEXT_PRIMARY } from "@the-mammoth/ui-theme";
import type { DbConnection } from "../module_bindings";
import type { CraftQueueItem as CraftQueueRow } from "../module_bindings/types";
import { listMammothCraftableItemDefs } from "./mammothItemCatalog";
import type { MammothItemDef } from "./mammothItemCatalogTypes";
import { MammothHudPanel, MAMMOTH_QUICK_CRAFT_PANEL_WIDTH_PX } from "./MammothHudPanel";
import { MammothItemIcon } from "./MammothItemIcon";
import {
  canEnqueueCraft,
  type MammothCarrierGrids,
} from "./mammothCraftEligibility";
import { useMammothInventory } from "./useMammothInventory";

const NO_SELECT: CSSProperties = {
  userSelect: "none",
  WebkitUserSelect: "none",
  MozUserSelect: "none",
  msUserSelect: "none",
};

const QUICK_CRAFT_GRID_COLS = 4;

type Props = {
  conn: DbConnection;
  queueLength: number;
  onHoverRecipe: (def: MammothItemDef, e: ReactMouseEvent) => void;
  onHoverMove: (e: ReactMouseEvent) => void;
  onHoverEnd: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
};

export function MammothQuickCraftPanel({
  conn,
  queueLength,
  onHoverRecipe,
  onHoverMove,
  onHoverEnd,
  onContextMenu,
}: Props) {
  const craftables = useMemo(() => listMammothCraftableItemDefs(), []);
  const { hotbar, inventory } = useMammothInventory(conn);
  const grids = useMemo((): MammothCarrierGrids => ({ hotbar, inventory }), [hotbar, inventory]);

  const onCraftClick = useCallback(
    (def: MammothItemDef) => {
      if (!canEnqueueCraft(def, grids, queueLength)) return;
      void conn.reducers.enqueueCraft({ outputDefId: def.id }).catch(() => {
        /* reducer no-ops on failure */
      });
    },
    [conn, grids, queueLength],
  );

  return (
    <MammothHudPanel
      title="Quick craft"
      subtitle="Click ready recipes to queue · B for full crafting"
      widthPx={MAMMOTH_QUICK_CRAFT_PANEL_WIDTH_PX}
      onContextMenu={onContextMenu}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${QUICK_CRAFT_GRID_COLS}, 52px)`,
          gap: 6,
        }}
      >
        {craftables.map((def) => {
          const ready = canEnqueueCraft(def, grids, queueLength);
          const hasIcon = def.iconUrl.length > 0;
          return (
            <button
              key={def.id}
              type="button"
              aria-disabled={!ready}
              aria-label={def.displayName}
              onMouseEnter={(e) => onHoverRecipe(def, e)}
              onMouseMove={onHoverMove}
              onMouseLeave={onHoverEnd}
              onClick={() => onCraftClick(def)}
              style={{
                position: "relative",
                width: 52,
                minHeight: hasIcon ? 72 : 52,
                padding: hasIcon ? "4px 2px 3px" : "4px 3px",
                borderRadius: 6,
                border: `2px solid ${ready ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.1)"}`,
                background: ready ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.28)",
                boxSizing: "border-box",
                cursor: ready ? "pointer" : "not-allowed",
                opacity: ready ? 1 : 0.72,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: hasIcon ? "flex-start" : "center",
                gap: hasIcon ? 2 : 0,
                overflow: "hidden",
                color: ready ? THEME_TEXT_PRIMARY : THEME_TEXT_FAINT,
                ...NO_SELECT,
              }}
            >
              {hasIcon ? <MammothItemIcon def={def} size={32} style={NO_SELECT} /> : null}
              <span
                aria-hidden
                style={{
                  width: "100%",
                  fontSize: hasIcon ? 8 : 9,
                  lineHeight: 1.15,
                  fontWeight: 600,
                  textAlign: "center",
                  display: "-webkit-box",
                  WebkitLineClamp: hasIcon ? 2 : 3,
                  WebkitBoxOrient: "vertical" as const,
                  overflow: "hidden",
                  overflowWrap: "anywhere",
                }}
              >
                {def.displayName}
              </span>
            </button>
          );
        })}
      </div>
    </MammothHudPanel>
  );
}

/** Queue rows owned by the connected player. */
export function countPlayerCraftQueueRows(conn: DbConnection): number {
  const self = conn.identity;
  if (!self) return 0;
  let n = 0;
  for (const r of conn.db.craft_queue_item) {
    const row = r as CraftQueueRow;
    try {
      if (row.owner.isEqual(self)) n += 1;
    } catch {
      /* ignore */
    }
  }
  return n;
}
