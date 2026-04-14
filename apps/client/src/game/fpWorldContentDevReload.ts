/**
 * Dev-only world-content watcher.
 *
 * We intentionally keep this lightweight: poll authored JSON from `/content/**`, and when it
 * changes, trigger a full page reload so visuals, walk sampling, and static collision all restart
 * from the same authored revision. This avoids half-reloading only one side of the static world.
 */
export function mountWorldContentDevReload(onChange: () => void): () => void {
  /* eslint-disable turbo/no-undeclared-env-vars -- Vite-injected */
  if (!import.meta.env.DEV) return () => {};
  /* eslint-enable turbo/no-undeclared-env-vars */

  let lastFingerprint = "";
  let inFlight = false;

  const pull = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      const buildingRes = await fetch("/content/building/mammoth.json", {
        cache: "no-store",
      });
      if (!buildingRes.ok) return;
      const buildingText = await buildingRes.text();
      const building = JSON.parse(buildingText) as {
        floorRefs?: { floorDocId?: string }[];
      };
      const floorIds = [...new Set((building.floorRefs ?? []).map((r) => r.floorDocId).filter(Boolean))];
      const parts = [`building:${buildingText}`, "cell:"];
      try {
        const cellRes = await fetch("/content/cells/cell_0_0.json", { cache: "no-store" });
        parts[1] = cellRes.ok ? `cell:${await cellRes.text()}` : "cell:";
      } catch {
        parts[1] = "cell:";
      }
      for (const id of floorIds) {
        const res = await fetch(`/content/building/floors/${id}.json`, { cache: "no-store" });
        if (!res.ok) continue;
        parts.push(`floor:${id}:${await res.text()}`);
      }
      const next = parts.join("\n");
      if (lastFingerprint && next !== lastFingerprint) onChange();
      lastFingerprint = next;
    } catch {
      /* ignore transient partial writes */
    } finally {
      inFlight = false;
    }
  };

  void pull();
  const id = window.setInterval(() => void pull(), 900);
  return () => clearInterval(id);
}
