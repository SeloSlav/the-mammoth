import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { DbConnection } from "../module_bindings";
import type { FpActiveStashPanelState } from "../game/fpInteraction/fpActiveStashPanel";
import { isTextInputFocused } from "../game/isTextInputFocused.js";
import { executeHotLootTransfer } from "./inventoryHotLootTransfer";
import type { MammothDragSourceSlotInfo, MammothPopulatedItem } from "./inventoryDragDropTypes";
import type { SlotGrids } from "./inventoryOptimistic";
import {
  mammothHotLootSlotKey,
  type MammothHotLootContext,
} from "./mammothHotLootSlotKey";
import { useMammothInventory, useMammothStash } from "./useMammothInventory";

const INDICATOR_ANIMATION_MS = 300;
const INDICATOR_FADE_DELAY_MS = 200;
const MIN_PROCESS_DELAY_MS = 100;

export type MammothHotLootSlotIndicator = {
  slotInfo: MammothDragSourceSlotInfo;
  progress: number;
  startTime: number;
};

export type MammothHotLootApi = {
  enabled: boolean;
  isHotLootActive: boolean;
  handleSlotHover: (
    item: MammothPopulatedItem | null,
    slotInfo: MammothDragSourceSlotInfo,
    context: MammothHotLootContext,
  ) => void;
  setCurrentHover: (
    item: MammothPopulatedItem | null,
    slotInfo: MammothDragSourceSlotInfo | null,
    context: MammothHotLootContext | null,
  ) => void;
  getSlotIndicator: (slotInfo: MammothDragSourceSlotInfo) => MammothHotLootSlotIndicator | undefined;
};

const noopApi: MammothHotLootApi = {
  enabled: false,
  isHotLootActive: false,
  handleSlotHover: () => {},
  setCurrentHover: () => {},
  getSlotIndicator: () => undefined,
};

const MammothHotLootContext = createContext<MammothHotLootApi>(noopApi);

export function useMammothHotLoot(): MammothHotLootApi {
  return useContext(MammothHotLootContext);
}

type ProviderProps = {
  conn: DbConnection;
  activeStash: FpActiveStashPanelState | null;
  children: ReactNode;
};

export function MammothHotLootProvider({ conn, activeStash, children }: ProviderProps) {
  const playerSlots = useMammothInventory(conn);
  const stashRows = useMammothStash(
    conn,
    activeStash?.stashKey ?? null,
    activeStash?.stashKind ?? null,
  );

  const grids = useMemo<SlotGrids>(
    () => ({ ...playerSlots, ...(activeStash ? { stash: stashRows } : {}) }),
    [playerSlots, activeStash, stashRows],
  );

  const enabled = activeStash != null;
  const api = useMammothHotLootController(conn, activeStash, grids, enabled);

  return (
    <MammothHotLootContext.Provider value={api}>{children}</MammothHotLootContext.Provider>
  );
}

function useMammothHotLootController(
  conn: DbConnection,
  activeStash: FpActiveStashPanelState | null,
  grids: SlotGrids,
  enabled: boolean,
): MammothHotLootApi {
  const [isHotLootActive, setIsHotLootActive] = useState(false);
  const [indicators, setIndicators] = useState<Map<string, MammothHotLootSlotIndicator>>(new Map());

  const isHotLootActiveRef = useRef(false);
  const activeStashRef = useRef(activeStash);
  const connRef = useRef(conn);
  const gridsRef = useRef(grids);
  const processedSlotsRef = useRef<Set<string>>(new Set());
  const lastProcessTimeRef = useRef(0);
  const indicatorCountRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const currentHoverRef = useRef<{
    item: MammothPopulatedItem | null;
    slotInfo: MammothDragSourceSlotInfo | null;
    context: MammothHotLootContext | null;
  }>({ item: null, slotInfo: null, context: null });

  useEffect(() => {
    isHotLootActiveRef.current = isHotLootActive;
  }, [isHotLootActive]);
  useEffect(() => {
    activeStashRef.current = activeStash;
  }, [activeStash]);
  useEffect(() => {
    connRef.current = conn;
  }, [conn]);
  useEffect(() => {
    gridsRef.current = grids;
  }, [grids]);

  const updateIndicators = useCallback(() => {
    const now = Date.now();
    setIndicators((prev) => {
      if (prev.size === 0) {
        indicatorCountRef.current = 0;
        return prev;
      }
      const updated = new Map(prev);
      let changed = false;
      for (const [key, indicator] of updated) {
        const elapsed = now - indicator.startTime;
        const progress = Math.min(1, elapsed / INDICATOR_ANIMATION_MS);
        if (progress !== indicator.progress) {
          updated.set(key, { ...indicator, progress });
          changed = true;
        }
        if (progress >= 1 && elapsed > INDICATOR_ANIMATION_MS + INDICATOR_FADE_DELAY_MS) {
          updated.delete(key);
          changed = true;
        }
      }
      indicatorCountRef.current = updated.size;
      return changed ? updated : prev;
    });

    if (indicatorCountRef.current > 0 || isHotLootActiveRef.current) {
      animationFrameRef.current = requestAnimationFrame(updateIndicators);
    } else {
      animationFrameRef.current = null;
    }
  }, []);

  useEffect(() => {
    const shouldRun = indicators.size > 0 || isHotLootActive;
    if (shouldRun && animationFrameRef.current == null) {
      animationFrameRef.current = requestAnimationFrame(updateIndicators);
    }
    return () => {
      if (animationFrameRef.current != null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [indicators.size, isHotLootActive, updateIndicators]);

  const executeHotLoot = useCallback(
    (
      item: MammothPopulatedItem,
      slotInfo: MammothDragSourceSlotInfo,
      context: MammothHotLootContext,
      slotKey: string,
    ) => {
      const stash = activeStashRef.current;
      if (!stash) return;

      processedSlotsRef.current.add(slotKey);
      lastProcessTimeRef.current = Date.now();

      setIndicators((prev) => {
        const updated = new Map(prev);
        updated.set(slotKey, {
          slotInfo,
          progress: 0,
          startTime: Date.now(),
        });
        indicatorCountRef.current = updated.size;
        return updated;
      });

      executeHotLootTransfer({
        conn: connRef.current,
        activeStash: stash,
        grids: gridsRef.current,
        pop: item,
        slotInfo,
        context,
      });
    },
    [],
  );

  const handleSlotHover = useCallback(
    (
      item: MammothPopulatedItem | null,
      slotInfo: MammothDragSourceSlotInfo,
      context: MammothHotLootContext,
    ) => {
      currentHoverRef.current = { item, slotInfo, context };
      if (!enabled || !isHotLootActiveRef.current || !item) return;

      const slotKey = mammothHotLootSlotKey(slotInfo);
      if (processedSlotsRef.current.has(slotKey)) return;

      const now = Date.now();
      const elapsed = now - lastProcessTimeRef.current;
      if (elapsed < MIN_PROCESS_DELAY_MS) {
        window.setTimeout(() => {
          if (!isHotLootActiveRef.current || processedSlotsRef.current.has(slotKey)) return;
          executeHotLoot(item, slotInfo, context, slotKey);
        }, MIN_PROCESS_DELAY_MS - elapsed);
        return;
      }

      executeHotLoot(item, slotInfo, context, slotKey);
    },
    [enabled, executeHotLoot],
  );

  const setCurrentHover = useCallback(
    (
      item: MammothPopulatedItem | null,
      slotInfo: MammothDragSourceSlotInfo | null,
      context: MammothHotLootContext | null,
    ) => {
      currentHoverRef.current = { item, slotInfo, context };
    },
    [],
  );

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "KeyH" || event.repeat) return;
      if (isTextInputFocused()) return;
      if (!activeStashRef.current) return;

      setIsHotLootActive(true);
      isHotLootActiveRef.current = true;
      processedSlotsRef.current.clear();
      lastProcessTimeRef.current = 0;

      const { item, slotInfo, context } = currentHoverRef.current;
      if (item && slotInfo && context) {
        const slotKey = mammothHotLootSlotKey(slotInfo);
        executeHotLoot(item, slotInfo, context, slotKey);
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "KeyH") return;
      setIsHotLootActive(false);
      isHotLootActiveRef.current = false;
      processedSlotsRef.current.clear();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [enabled, executeHotLoot]);

  const getSlotIndicator = useCallback(
    (slotInfo: MammothDragSourceSlotInfo) => indicators.get(mammothHotLootSlotKey(slotInfo)),
    [indicators],
  );

  return useMemo(
    (): MammothHotLootApi => ({
      enabled,
      isHotLootActive,
      handleSlotHover,
      setCurrentHover,
      getSlotIndicator,
    }),
    [enabled, getSlotIndicator, handleSlotHover, isHotLootActive, setCurrentHover],
  );
}
