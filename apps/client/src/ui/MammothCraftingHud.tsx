import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import type { DbConnection } from "../module_bindings";
import type { CraftQueueItem as CraftQueueRow } from "../module_bindings/types";
import { isTextInputFocused } from "../game/isTextInputFocused.js";
import {
  getMammothItemDef,
  listMammothCraftableItemDefs,
  mammothCraftYieldCount,
} from "../inventory/mammothItemCatalog";
import type { MammothConstructionIngredient } from "../inventory/mammothItemCatalogTypes";
import type { MammothPopulatedItem } from "../inventory/inventoryDragDropTypes";
import { useMammothInventory } from "../inventory/useMammothInventory";
import { MammothGlbPreviewCanvas } from "./MammothGlbPreviewCanvas";
import {
  getFpSessionGameUiHidden,
  subscribeFpSessionGameUiHidden,
} from "../game/fpSession/fpSessionGameUiHidden";
import {
  THEME_ACCENT,
  THEME_ACCENT_ON,
  THEME_BACKDROP_SCRIM,
  THEME_CARD_BG,
  THEME_CARD_BORDER,
  THEME_DIVIDER,
  THEME_ERROR,
  THEME_TEXT_FAINT,
  THEME_TEXT_MUTED,
  THEME_TEXT_PRIMARY,
  UI_FONT_SANS,
} from "@the-mammoth/ui-theme";

const MAX_QUEUE_PER_PLAYER = 14;

function carrierCountForDef(
  grids: { hotbar: (MammothPopulatedItem | null)[]; inventory: (MammothPopulatedItem | null)[] },
  defId: string,
): number {
  let n = 0;
  for (const pop of grids.hotbar) {
    if (pop?.instance.defId === defId)
      n += typeof pop.instance.quantity === "bigint" ? Number(pop.instance.quantity) : (pop.instance.quantity ?? 0);
  }
  for (const pop of grids.inventory) {
    if (pop?.instance.defId === defId)
      n += typeof pop.instance.quantity === "bigint" ? Number(pop.instance.quantity) : (pop.instance.quantity ?? 0);
  }
  return n;
}

function aggregatedMaterialTotals(materials: MammothConstructionIngredient[]): [string, number][] {
  const m = new Map<string, number>();
  for (const ing of materials) {
    m.set(ing.itemId, (m.get(ing.itemId) ?? 0) + ing.quantity);
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
}

type Props = {
  conn: DbConnection;
};

export function MammothCraftingHud({ conn }: Props) {
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const craftables = useMemo(() => listMammothCraftableItemDefs(), []);
  const defaultDefId = craftables[0]?.id ?? "";

  const [selectedOutputDefId, setSelectedOutputDefId] = useState(defaultDefId);

  useEffect(() => {
    if (craftables.length === 0) return;
    if (!craftables.some((d) => d.id === selectedOutputDefId))
      setSelectedOutputDefId(craftables[0]!.id);
  }, [craftables, selectedOutputDefId]);

  const selectedDef =
    craftables.find((d) => d.id === selectedOutputDefId) ?? craftables[0];
  const cons = selectedDef?.construction ?? null;

  const gameUiHidden = useSyncExternalStore(
    subscribeFpSessionGameUiHidden,
    getFpSessionGameUiHidden,
    getFpSessionGameUiHidden,
  );

  const { hotbar, inventory } = useMammothInventory(conn);
  const grids = useMemo(() => ({ hotbar, inventory }), [hotbar, inventory]);

  const matsAgg = useMemo(
    () => (cons ? aggregatedMaterialTotals(cons.materials) : []),
    [cons],
  );

  const haveMaterials =
    matsAgg.length > 0 &&
    matsAgg.every(([materialId, need]) => carrierCountForDef(grids, materialId) >= need);

  const haveTools =
    (cons?.requiredTools ?? []).length === 0 ||
    (cons?.requiredTools ?? []).every((tid) => carrierCountForDef(grids, tid) >= 1);

  const self = conn.identity;
  const queueRows = useMemo(() => {
    if (!self) return [];
    const rows: CraftQueueRow[] = [];
    for (const r of conn.db.craft_queue_item) {
      const row = r as CraftQueueRow;
      try {
        if (row.owner.isEqual(self)) rows.push(row);
      } catch {
        /* ignore */
      }
    }
    rows.sort((a, b) => {
      const oa = typeof a.orderIndex === "bigint" ? Number(a.orderIndex) : Number(a.orderIndex);
      const ob = typeof b.orderIndex === "bigint" ? Number(b.orderIndex) : Number(b.orderIndex);
      return oa - ob;
    });
    return rows;
  }, [conn, self, tick, open]);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, [open]);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    conn.db.craft_queue_item.onInsert(bump);
    conn.db.craft_queue_item.onUpdate(bump);
    conn.db.craft_queue_item.onDelete(bump);
    return () => {
      conn.db.craft_queue_item.removeOnInsert(bump);
      conn.db.craft_queue_item.removeOnUpdate(bump);
      conn.db.craft_queue_item.removeOnDelete(bump);
    };
  }, [conn]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (gameUiHidden || isTextInputFocused()) return;
      if (e.code !== "KeyB" || e.repeat) return;
      e.preventDefault();
      setOpen((o) => !o);
      if (document.pointerLockElement) void document.exitPointerLock();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [gameUiHidden]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => {
      if (e.code !== "Escape" || isTextInputFocused()) return;
      e.preventDefault();
      setOpen(false);
    };
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [open]);

  const onEnqueue = useCallback(() => {
    if (!selectedDef) return;
    void conn.reducers.enqueueCraft({ outputDefId: selectedDef.id }).catch(() => {
      /* reducer no-ops on failure */
    });
  }, [conn, selectedDef]);

  const onCancelWaiting = useCallback(
    (queueItemId: bigint) => {
      void conn.reducers.cancelWaitingCraft({ queueItemId }).catch(() => {});
    },
    [conn],
  );

  const nowUs = Date.now() * 1000;

  if (gameUiHidden) return null;

  const yieldCount = selectedDef ? mammothCraftYieldCount(selectedDef) : 1;

  return createPortal(
    open ? (
      <div
        data-mammoth-crafting="open"
        data-mammoth-no-hotbar-wheel="true"
        role="presentation"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 118,
          background: THEME_BACKDROP_SCRIM,
          display: "flex",
          alignItems: "stretch",
          justifyContent: "stretch",
          fontFamily: UI_FONT_SANS,
        }}
      >
        <div
          style={{
            flex: 1,
            margin: "3vh auto",
            width: "min(1100px, calc(100vw - 48px))",
            maxHeight: "94vh",
            display: "grid",
            gridTemplateColumns: "220px minmax(0, 1fr) minmax(0, 340px)",
            gap: 16,
            boxSizing: "border-box",
            padding: "18px 20px",
            borderRadius: 12,
            background: THEME_CARD_BG,
            border: `1px solid ${THEME_CARD_BORDER}`,
            color: THEME_TEXT_PRIMARY,
            overflow: "hidden",
          }}
          onMouseDown={(e) => e.stopPropagation()}
          data-mammoth-no-hotbar-wheel="true"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 11, opacity: 0.65 }}>CRAFTING</div>
            {craftables.length === 0 ? (
              <div style={{ color: THEME_TEXT_FAINT, fontSize: 12 }}>No craftable defs in catalog.</div>
            ) : (
              craftables.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setSelectedOutputDefId(d.id)}
                  style={{
                    textAlign: "left",
                    padding: "11px 12px",
                    borderRadius: 8,
                    border:
                      selectedOutputDefId === d.id
                        ? `1px solid ${THEME_ACCENT}`
                        : `1px solid ${THEME_CARD_BORDER}`,
                    background:
                      selectedOutputDefId === d.id ? "rgba(107,140,174,0.18)" : "rgba(0,0,0,0.35)",
                    color: THEME_TEXT_PRIMARY,
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  {d.displayName}
                </button>
              ))
            )}
            <div style={{ flex: 1 }} />
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: `1px solid ${THEME_CARD_BORDER}`,
                background: "rgba(0,0,0,0.45)",
                color: THEME_TEXT_MUTED,
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Close · Esc
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", minWidth: 0, gap: 12 }}>
            {selectedDef && cons ? (
              <>
                <div style={{ fontSize: 18, fontWeight: 650 }}>{selectedDef.displayName}</div>
                <div style={{ color: THEME_TEXT_MUTED, fontSize: 13, lineHeight: 1.55 }}>
                  {selectedDef.description}
                </div>
                <div
                  style={{
                    height: 1,
                    background: THEME_DIVIDER,
                    margin: "4px 0",
                  }}
                />
                <div style={{ flex: "1 1 52%", minHeight: 260 }}>
                  <MammothGlbPreviewCanvas
                    defId={selectedDef.id}
                    style={{
                      border: `1px solid ${THEME_CARD_BORDER}`,
                      background:
                        "radial-gradient(ellipse at center, rgba(107,140,174,0.12), rgba(0,0,0,0.5))",
                      minHeight: 280,
                      width: "100%",
                    }}
                  />
                </div>
                <div style={{ fontSize: 13, display: "grid", gap: 6 }}>
                  <div>
                    <span style={{ color: THEME_TEXT_FAINT }}>Max stack:</span>{" "}
                    {selectedDef.maxStack ?? "—"}
                  </div>
                  <div>
                    <span style={{ color: THEME_TEXT_FAINT }}>Category:</span>{" "}
                    {selectedDef.category ?? "—"}
                  </div>
                  <div>
                    <span style={{ color: THEME_TEXT_FAINT }}>Craft time:</span> {cons.buildTimeSecs}s (server advances{" "}
                    ~1 Hz)
                  </div>
                  {yieldCount > 1 ? (
                    <div>
                      <span style={{ color: THEME_TEXT_FAINT }}>Yield per job:</span> ×{yieldCount}{" "}
                      {selectedDef.displayName.toLowerCase()}
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <div style={{ opacity: 0.7 }}>Select a blueprint.</div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              minWidth: 0,
              borderLeft: `1px solid ${THEME_DIVIDER}`,
              paddingLeft: 16,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 620 }}>Requirements</div>
            {selectedDef && cons ? (
              <ul style={{ margin: 0, paddingLeft: 18, color: THEME_TEXT_MUTED, fontSize: 13 }}>
                {(cons.requiredTools ?? []).map((toolId) => {
                  const have = carrierCountForDef(grids, toolId) >= 1;
                  const label = getMammothItemDef(toolId)?.displayName ?? toolId;
                  return (
                    <li key={toolId}>
                      {label} carried (tool/weapon — not consumed){" "}
                      <span style={{ color: have ? THEME_TEXT_PRIMARY : THEME_ERROR }}>
                        {have ? "OK" : "missing"}
                      </span>
                    </li>
                  );
                })}
                {matsAgg.map(([materialId, need]) => {
                  const have = carrierCountForDef(grids, materialId);
                  const label = getMammothItemDef(materialId)?.displayName ?? materialId;
                  const ok = have >= need;
                  return (
                    <li key={materialId}>
                      {label} ×{need}{" "}
                      <span style={{ color: ok ? THEME_TEXT_PRIMARY : THEME_ERROR }}>(you have {have})</span>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            <button
              type="button"
              disabled={
                !selectedDef ||
                !cons ||
                !haveMaterials ||
                !haveTools ||
                queueRows.length >= MAX_QUEUE_PER_PLAYER
              }
              onClick={onEnqueue}
              style={{
                padding: "11px 14px",
                borderRadius: 8,
                border: "none",
                background: THEME_ACCENT,
                color: THEME_ACCENT_ON,
                fontWeight: 650,
                cursor:
                  selectedDef && cons && haveMaterials && haveTools && queueRows.length < MAX_QUEUE_PER_PLAYER
                    ? "pointer"
                    : "not-allowed",
                opacity:
                  selectedDef && cons && haveMaterials && haveTools && queueRows.length < MAX_QUEUE_PER_PLAYER
                    ? 1
                    : 0.5,
              }}
            >
              Add to crafting queue
            </button>

            <div style={{ fontSize: 14, fontWeight: 620, marginTop: 8 }}>Queue</div>
            <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
              {queueRows.length === 0 ? (
                <div style={{ color: THEME_TEXT_FAINT, fontSize: 13 }}>Empty.</div>
              ) : (
                queueRows.map((row) => {
                  const sid = typeof row.id === "bigint" ? row.id : BigInt(Number(row.id));
                  const outputId =
                    typeof row.outputDefId === "string" ? row.outputDefId : String(row.outputDefId);
                  const label = getMammothItemDef(outputId)?.displayName ?? outputId;
                  const sm = typeof row.startMicros === "bigint" ? row.startMicros : BigInt(row.startMicros);
                  const fm = typeof row.finishMicros === "bigint" ? row.finishMicros : BigInt(row.finishMicros);
                  const waiting = Number(sm) === 0;
                  const denom = Math.max(1e-6, Number(fm) - Number(sm));
                  const prog = waiting ? 0 : Math.min(1, (nowUs - Number(sm)) / denom);
                  return (
                    <div
                      key={`${sid}`}
                      style={{
                        padding: "9px 10px",
                        borderRadius: 8,
                        border: `1px solid ${THEME_CARD_BORDER}`,
                        background: "rgba(0,0,0,0.35)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ fontSize: 13 }}>{label}</div>
                        {waiting ? (
                          <button
                            type="button"
                            style={{
                              fontSize: 11,
                              padding: "3px 7px",
                              borderRadius: 6,
                              border: `1px solid ${THEME_CARD_BORDER}`,
                              background: "rgba(0,0,0,0.45)",
                              color: THEME_TEXT_MUTED,
                              cursor: "pointer",
                            }}
                            onClick={() => onCancelWaiting(sid)}
                          >
                            Cancel
                          </button>
                        ) : (
                          <div style={{ fontSize: 11, color: THEME_TEXT_FAINT }}>In progress</div>
                        )}
                      </div>
                      {!waiting ? (
                        <div style={{ marginTop: 8 }}>
                          <div
                            style={{
                              height: 5,
                              borderRadius: 3,
                              background: "rgba(255,255,255,0.08)",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                width: `${Math.round(prog * 100)}%`,
                                height: "100%",
                                background: THEME_ACCENT,
                              }}
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ fontSize: 11, color: THEME_TEXT_FAINT, lineHeight: 1.45 }}>
              Ingredients are consumed when each job begins. Tools stay equipped in inventory/hotbar. If something is
              missing when a job activates, it is discarded and the next waiting job is tried.
            </div>
          </div>
        </div>
      </div>
    ) : null,
    document.body,
  );
}
