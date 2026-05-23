import { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRotateLeft, faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";
import { isProceduralApartmentDecorModelPath } from "@the-mammoth/world";
import { requestEditorMyApartmentDecorModelReload } from "../editor/myApartment/editorMyApartmentPieceGroupBridge.js";
import {
  editorChromeHelp,
  editorChromeLabel,
  editorChromeRowBtn,
  editorChromeSection,
} from "./editorChromeStyles.js";
import { EditorChromeSectionTitleIcon } from "./EditorChromeSectionTitleIcon.js";
import { EDITOR_CHROME_SECTION } from "./editorChromeSectionAnchors.js";
import {
  fetchApartmentDecorGlbOptimizeStatus,
  postOptimizeApartmentDecorGlb,
  postRevertApartmentDecorGlb,
  type ApartmentDecorGlbOptimizeStatus,
} from "./editorApartmentDecorGlbOptimizeNetwork.js";

const TRIANGLE_KEEP_RATIO_MIN = 0.35;
const TRIANGLE_KEEP_RATIO_MAX = 1;
const TRIANGLE_KEEP_RATIO_DEFAULT = 0.75;

function formatTriCount(tris: number | null | undefined): string {
  if (tris == null || !Number.isFinite(tris)) return "—";
  return tris.toLocaleString();
}

function formatKb(kb: number | null | undefined): string {
  if (kb == null || !Number.isFinite(kb)) return "—";
  return `${kb.toLocaleString()} KB`;
}

function decorCatalogLeaf(modelRelPath: string): string {
  return modelRelPath.split("/").at(-1) ?? modelRelPath;
}

export function EditorChromeMyApartmentModelOptimize(props: {
  selectedCatalogModelRelPath: string | null;
}) {
  const { selectedCatalogModelRelPath } = props;
  const [triangleKeepRatio, setTriangleKeepRatio] = useState(TRIANGLE_KEEP_RATIO_DEFAULT);
  const [compressTextures, setCompressTextures] = useState(false);
  const [status, setStatus] = useState<ApartmentDecorGlbOptimizeStatus | null>(null);
  const [busy, setBusy] = useState<"optimize" | "revert" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isOptimizable =
    selectedCatalogModelRelPath != null &&
    selectedCatalogModelRelPath.toLowerCase().endsWith(".glb") &&
    !isProceduralApartmentDecorModelPath(selectedCatalogModelRelPath);

  const triangleKeepPercent = Math.round(triangleKeepRatio * 100);

  const refreshStatus = useCallback(async (modelRelPath: string) => {
    const next = await fetchApartmentDecorGlbOptimizeStatus(modelRelPath);
    setStatus(next);
    return next;
  }, []);

  useEffect(() => {
    if (!isOptimizable || !selectedCatalogModelRelPath) {
      setStatus(null);
      setMessage(null);
      setError(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const next = await refreshStatus(selectedCatalogModelRelPath);
        if (!cancelled) {
          setError(null);
          setMessage(null);
          if (!next.exists) {
            setError("Model file not found on disk.");
          }
        }
      } catch (err) {
        if (!cancelled) {
          setStatus(null);
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOptimizable, refreshStatus, selectedCatalogModelRelPath]);

  const statusLine = useMemo(() => {
    if (!status?.exists) return null;
    const parts = [
      `${formatTriCount(status.tris)} tris`,
      formatKb(status.kb),
      status.allWebp ? "WebP textures" : "mixed textures",
    ];
    if (status.hasBackup) {
      parts.push(`backup ${formatTriCount(status.backupTris)} tris / ${formatKb(status.backupKb)}`);
    }
    return parts.join(" · ");
  }, [status]);

  async function runOptimize(): Promise<void> {
    if (!selectedCatalogModelRelPath || !isOptimizable) return;
    setBusy("optimize");
    setError(null);
    setMessage(null);
    try {
      const result = await postOptimizeApartmentDecorGlb({
        modelRelPath: selectedCatalogModelRelPath,
        ratio: triangleKeepRatio,
        compressTextures,
        fromBackup: compressTextures,
      });
      if (result.skipped) {
        setMessage(result.reason ?? "Nothing changed.");
      } else if (result.error) {
        setError(result.error);
      } else {
        const triNote =
          result.beforeTris != null && result.afterTris != null
            ? `${formatTriCount(result.beforeTris)} → ${formatTriCount(result.afterTris)} tris`
            : "Optimized";
        const sizeNote =
          result.beforeKB != null && result.afterKB != null
            ? `${result.beforeKB} → ${result.afterKB} KB`
            : "";
        setMessage([triNote, sizeNote].filter(Boolean).join(" · "));
      }
      await requestEditorMyApartmentDecorModelReload(selectedCatalogModelRelPath);
      await refreshStatus(selectedCatalogModelRelPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function runRevert(): Promise<void> {
    if (!selectedCatalogModelRelPath || !isOptimizable) return;
    setBusy("revert");
    setError(null);
    setMessage(null);
    try {
      const result = await postRevertApartmentDecorGlb(selectedCatalogModelRelPath);
      if (!result.ok) {
        setError(result.reason ?? "Revert failed.");
        return;
      }
      setMessage(
        `Restored backup · ${formatTriCount(result.tris)} tris · ${formatKb(result.kb)}`,
      );
      await requestEditorMyApartmentDecorModelReload(selectedCatalogModelRelPath);
      await refreshStatus(selectedCatalogModelRelPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      style={{ ...editorChromeSection, scrollMarginTop: 6 }}
      id={EDITOR_CHROME_SECTION.modelOptimize}
    >
      <EditorChromeSectionTitleIcon icon={faWandMagicSparkles}>
        Model optimize
      </EditorChromeSectionTitleIcon>
      <p style={{ ...editorChromeHelp, marginTop: 0 }}>
        Select a catalog GLB above, tune triangle reduction, then optimize in place. The first
        optimize backs up the original to{" "}
        <code style={{ fontSize: 10 }}>content/models/glb-source-backups/</code>. Use{" "}
        <strong>Revert to backup</strong> if the preview looks worse. Leave{" "}
        <strong>Recompress textures</strong> off for rugs and detail-heavy props; turn it on for
        large Meshy exports that still need WebP downscale.
      </p>
      {!selectedCatalogModelRelPath ? (
        <div style={{ fontSize: 11, opacity: 0.68, marginTop: 8 }}>
          Pick a model in Import décor to optimize it.
        </div>
      ) : !isOptimizable ? (
        <div style={{ fontSize: 11, opacity: 0.68, marginTop: 8 }}>
          <code style={{ fontSize: 10 }}>{selectedCatalogModelRelPath}</code> cannot be optimized
          here (procedural or non-GLB).
        </div>
      ) : (
        <>
          <div style={{ marginTop: 8, fontSize: 11, opacity: 0.82 }}>
            Target: <code style={{ fontSize: 10 }}>{decorCatalogLeaf(selectedCatalogModelRelPath)}</code>
          </div>
          {statusLine ? (
            <div style={{ marginTop: 6, fontSize: 11, opacity: 0.72, lineHeight: 1.35 }}>
              {statusLine}
            </div>
          ) : null}
          <div style={{ marginTop: 10 }}>
            <label htmlFor="editor-decor-glb-triangle-keep" style={{ ...editorChromeLabel, margin: 0 }}>
              Keep triangles
            </label>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginTop: 6,
              }}
            >
              <input
                id="editor-decor-glb-triangle-keep"
                type="range"
                min={TRIANGLE_KEEP_RATIO_MIN}
                max={TRIANGLE_KEEP_RATIO_MAX}
                step={0.05}
                value={triangleKeepRatio}
                onChange={(e) => setTriangleKeepRatio(Number(e.target.value))}
                style={{ flex: 1 }}
                disabled={busy != null}
              />
              <span style={{ fontSize: 11, minWidth: 40, textAlign: "right" }}>
                {triangleKeepPercent}%
              </span>
            </div>
            <p style={{ margin: "4px 0 0", fontSize: 10, opacity: 0.65, lineHeight: 1.35 }}>
              Lower keeps fewer triangles. 100% only reorders mesh indices (no decimation).
            </p>
          </div>
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              marginTop: 10,
              fontSize: 11,
              cursor: busy != null ? "not-allowed" : "pointer",
              opacity: busy != null ? 0.6 : 1,
            }}
          >
            <input
              type="checkbox"
              checked={compressTextures}
              onChange={(e) => setCompressTextures(e.target.checked)}
              disabled={busy != null}
              style={{ marginTop: 2 }}
            />
            <span>
              <strong>Recompress textures</strong> — restores backup first, then WebP ≤1024. Can
              look worse on already-optimized props.
            </span>
          </label>
          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              style={editorChromeRowBtn}
              onClick={() => void runOptimize()}
              disabled={busy != null}
            >
              {busy === "optimize" ? "Optimizing…" : "Run optimize"}
            </button>
            <button
              type="button"
              style={editorChromeRowBtn}
              onClick={() => void runRevert()}
              disabled={busy != null || status?.hasBackup !== true}
              title={
                status?.hasBackup
                  ? "Restore the first backup copy of this GLB"
                  : "No backup yet — run optimize once"
              }
            >
              <FontAwesomeIcon icon={faRotateLeft} style={{ marginRight: 6 }} />
              {busy === "revert" ? "Reverting…" : "Revert to backup"}
            </button>
          </div>
        </>
      )}
      {message ? (
        <div style={{ marginTop: 8, fontSize: 11, color: "#9fd4a3", lineHeight: 1.35 }}>{message}</div>
      ) : null}
      {error ? (
        <div style={{ marginTop: 8, fontSize: 11, color: "#f0a0a0", lineHeight: 1.35 }}>{error}</div>
      ) : null}
    </div>
  );
}
