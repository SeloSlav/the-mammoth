import type { DbConnection } from "../module_bindings";
import type { FpActiveStashPanelState } from "../game/fpInteraction/fpActiveStashPanel";
import { useStashServerNoticeGameplayErrorBridge } from "../inventory/useStashServerNoticeGameplayErrorBridge";
import { MammothGameplayErrorBarHud } from "./MammothGameplayErrorBarHud";

type Props = {
  conn: DbConnection | null;
  activeStash: FpActiveStashPanelState | null;
};

/** Mounts the shared error bar plus feature-specific server→bar bridges. */
export function GameplayErrorBarShell({ conn, activeStash }: Props) {
  useStashServerNoticeGameplayErrorBridge(conn, activeStash);
  return <MammothGameplayErrorBarHud />;
}
