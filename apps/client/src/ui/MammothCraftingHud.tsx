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
import { setFpCraftingPanelOpen } from "../game/fpInteraction/fpCraftingPanelOpen";
import {
  getMammothItemDef,
  listMammothCraftableItemDefs,
  mammothCraftYieldCount,
} from "../inventory/mammothItemCatalog";
import type {
  ItemCategory,
  MammothItemDef,
} from "../inventory/mammothItemCatalogTypes";
import { useMammothInventory } from "../inventory/useMammothInventory";
import {
  aggregatedCraftMaterialTotals,
  carrierCountForDef,
  MAX_CRAFT_QUEUE_PER_PLAYER,
} from "../inventory/mammothCraftEligibility";
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

const MAX_QUEUE_PER_PLAYER = MAX_CRAFT_QUEUE_PER_PLAYER;

/** Above inventory / pickup / toasts / vitals; keep below {@link PlayerDeathOverlay} (400). */
const CRAFTING_OVERLAY_Z_INDEX = 380;

const CATEGORY_ORDER: ItemCategory[] = [
  "weapon",
  "tool",
  "ammo",
  "utility",
  "placeable",
  "resource",
  "consumable",
];

const CATEGORY_LABEL: Record<ItemCategory, string> = {
  weapon: "Weapons",
  tool: "Tools",
  ammo: "Ammo",
  utility: "Utilities",
  placeable: "Placeables",
  resource: "Resources",
  consumable: "Consumables",
};

type Props = {
  conn: DbConnection;
};

export function MammothCraftingHud({ conn }: Props) {
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const craftables = useMemo(() => listMammothCraftableItemDefs(), []);
  const { craftablesByCategory, categoriesWithRecipes } = useMemo(() => {
    const m = new Map<ItemCategory, MammothItemDef[]>();
    for (const c of CATEGORY_ORDER) m.set(c, []);
    for (const d of craftables) {
      m.get(d.category)!.push(d);
    }
    for (const c of CATEGORY_ORDER) {
      m.get(c)!.sort((a, b) => a.displayName.localeCompare(b.displayName));
    }
    const cats = CATEGORY_ORDER.filter((c) => m.get(c)!.length > 0);
    return { craftablesByCategory: m, categoriesWithRecipes: cats };
  }, [craftables]);

  const [selectedCategory, setSelectedCategory] = useState<ItemCategory | null>(null);
  useEffect(() => {
    if (categoriesWithRecipes.length === 0) return;
    if (!selectedCategory || !categoriesWithRecipes.includes(selectedCategory)) {
      setSelectedCategory(categoriesWithRecipes[0]!);
    }
  }, [categoriesWithRecipes, selectedCategory]);

  const itemsInCategory = useMemo(() => {
    if (!selectedCategory) return [];
    return craftablesByCategory.get(selectedCategory) ?? [];
  }, [selectedCategory, craftablesByCategory]);

  const [selectedOutputDefId, setSelectedOutputDefId] = useState(() => craftables[0]?.id ?? "");

  useEffect(() => {
    if (craftables.length === 0) return;
    if (!craftables.some((d) => d.id === selectedOutputDefId)) {
      setSelectedOutputDefId(craftables[0]!.id);
    }
  }, [craftables, selectedOutputDefId]);

  useEffect(() => {
    if (itemsInCategory.length === 0) return;
    if (!itemsInCategory.some((d) => d.id === selectedOutputDefId)) {
      setSelectedOutputDefId(itemsInCategory[0]!.id);
    }
  }, [itemsInCategory, selectedOutputDefId]);

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
    () => (cons ? aggregatedCraftMaterialTotals(cons.materials) : []),
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
    setFpCraftingPanelOpen(open);
    return () => setFpCraftingPanelOpen(false);
  }, [open]);

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
          zIndex: CRAFTING_OVERLAY_Z_INDEX,
          background: THEME_BACKDROP_SCRIM,
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          justifyContent: "stretch",
          fontFamily: UI_FONT_SANS,
          padding: "4px 8px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            width: "100%",
            maxWidth: "100%",
            margin: 0,
            boxSizing: "border-box",
            padding: "14px 18px",
            borderRadius: 12,
            background: THEME_CARD_BG,
            border: `1px solid ${THEME_CARD_BORDER}`,
            color: THEME_TEXT_PRIMARY,
            overflow: "hidden",
          }}
          onMouseDown={(e) => e.stopPropagation()}
          data-mammoth-no-hotbar-wheel="true"
        >
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              paddingBottom: 12,
              marginBottom: 12,
              borderBottom: `1px solid ${THEME_DIVIDER}`,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 650, letterSpacing: "0.02em" }}>Crafting</div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: `1px solid ${THEME_CARD_BORDER}`,
                background: "rgba(0,0,0,0.45)",
                color: THEME_TEXT_PRIMARY,
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 550,
              }}
            >
              Close · Esc
            </button>
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "grid",
              gridTemplateColumns: "200px minmax(0, 1fr) minmax(300px, 380px)",
              gap: 16,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                minHeight: 0,
                overflowY: "auto",
              }}
            >
              {categoriesWithRecipes.length === 0 ? (
                <div style={{ color: THEME_TEXT_FAINT, fontSize: 12 }}>No craftable defs in catalog.</div>
              ) : (
                categoriesWithRecipes.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    style={{
                      textAlign: "left",
                      padding: "10px 12px",
                      borderRadius: 8,
                      border:
                        selectedCategory === cat
                          ? `1px solid ${THEME_ACCENT}`
                          : `1px solid ${THEME_CARD_BORDER}`,
                      background:
                        selectedCategory === cat ? "rgba(107,140,174,0.18)" : "rgba(0,0,0,0.35)",
                      color: THEME_TEXT_PRIMARY,
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: selectedCategory === cat ? 650 : 400,
                    }}
                  >
                    {CATEGORY_LABEL[cat]}
                  </button>
                ))
              )}
            </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
              minHeight: 0,
              gap: 10,
              borderLeft: `1px solid ${THEME_DIVIDER}`,
              borderRight: `1px solid ${THEME_DIVIDER}`,
              paddingLeft: 16,
              paddingRight: 16,
              overflow: "hidden",
            }}
          >
            <div style={{ flexShrink: 0, fontSize: 12, color: THEME_TEXT_MUTED }}>
              {selectedCategory ? CATEGORY_LABEL[selectedCategory] : "—"}
            </div>
            {itemsInCategory.length === 0 ? (
              <div style={{ color: THEME_TEXT_MUTED, fontSize: 13 }}>No recipes in this category.</div>
            ) : (
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: "auto",
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(108px, 1fr))",
                  gap: 10,
                  alignContent: "start",
                }}
              >
                {itemsInCategory.map((d) => {
                  const selected = d.id === selectedOutputDefId;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setSelectedOutputDefId(d.id)}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 8,
                        padding: "12px 8px",
                        borderRadius: 10,
                        border: selected
                          ? `1px solid ${THEME_ACCENT}`
                          : `1px solid ${THEME_CARD_BORDER}`,
                        background: selected
                          ? "rgba(107,140,174,0.2)"
                          : "rgba(0,0,0,0.32)",
                        color: THEME_TEXT_PRIMARY,
                        cursor: "pointer",
                        textAlign: "center",
                        minHeight: 100,
                      }}
                    >
                      <div
                        style={{
                          width: 52,
                          height: 52,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: 8,
                          background: "rgba(0,0,0,0.35)",
                        }}
                      >
                        {d.iconUrl ? (
                          <img
                            src={d.iconUrl}
                            alt=""
                            draggable={false}
                            style={{
                              maxWidth: 46,
                              maxHeight: 46,
                              objectFit: "contain",
                            }}
                          />
                        ) : (
                          <span style={{ fontSize: 10, color: THEME_TEXT_FAINT }}>—</span>
                        )}
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          lineHeight: 1.25,
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical" as const,
                          overflow: "hidden",
                        }}
                      >
                        {d.displayName}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              minWidth: 0,
              minHeight: 0,
              overflowY: "auto",
              paddingLeft: 4,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 620 }}>Recipe</div>
            {selectedDef && cons ? (
              <>
                <div
                  style={{
                    display: "flex",
                    gap: 14,
                    alignItems: "flex-start",
                  }}
                >
                  <div
                    style={{
                      width: 88,
                      height: 88,
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 10,
                      border: `1px solid ${THEME_CARD_BORDER}`,
                      background:
                        "radial-gradient(ellipse at center, rgba(107,140,174,0.12), rgba(0,0,0,0.45))",
                    }}
                  >
                    {selectedDef.iconUrl ? (
                      <img
                        src={selectedDef.iconUrl}
                        alt=""
                        draggable={false}
                        style={{
                          maxWidth: 76,
                          maxHeight: 76,
                          objectFit: "contain",
                        }}
                      />
                    ) : (
                      <span style={{ fontSize: 11, color: THEME_TEXT_FAINT }}>No icon</span>
                    )}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 17, fontWeight: 650, lineHeight: 1.25 }}>
                      {selectedDef.displayName}
                    </div>
                    <div
                      style={{
                        marginTop: 6,
                        color: THEME_TEXT_MUTED,
                        fontSize: 12,
                        lineHeight: 1.5,
                      }}
                    >
                      {selectedDef.description}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    height: 1,
                    background: THEME_DIVIDER,
                    margin: "2px 0",
                  }}
                />
                <div style={{ fontSize: 12, display: "grid", gap: 5, color: THEME_TEXT_MUTED }}>
                  <div>
                    <span style={{ color: THEME_TEXT_FAINT }}>Max stack:</span> {selectedDef.maxStack ?? "—"}
                  </div>
                  <div>
                    <span style={{ color: THEME_TEXT_FAINT }}>Category:</span>{" "}
                    {CATEGORY_LABEL[selectedDef.category]}
                  </div>
                  <div>
                    <span style={{ color: THEME_TEXT_FAINT }}>Craft time:</span> {cons.buildTimeSecs}s (~1 Hz server)
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
              <div style={{ color: THEME_TEXT_MUTED, fontSize: 13 }}>
                Select an item from the grid to see recipe details and craft.
              </div>
            )}

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

            <div
              style={{
                flexShrink: 0,
                fontSize: 12,
                color: THEME_TEXT_MUTED,
                lineHeight: 1.45,
              }}
            >
              Ingredients are consumed when each job begins. Tools stay equipped in inventory/hotbar. If something is
              missing when a job activates, it is discarded and the next waiting job is tried.
            </div>
          </div>
          </div>
        </div>
      </div>
    ) : null,
    document.body,
  );
}
