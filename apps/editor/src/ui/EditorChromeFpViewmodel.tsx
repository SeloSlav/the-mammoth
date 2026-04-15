import { useEffect, useState } from "react";
import { ALL_WEAPON_DEFINITIONS } from "@the-mammoth/engine";
import type { FpAuthorCameraKind, TransformMode } from "../state/editorStore.js";
import {
  FP_AUTHORABLE_CONSUMABLE_IDS,
  isFpAuthorConsumableId,
  saveConsumablePresentationFromEditor,
} from "../editor/consumablePresentationDiskSave.js";
import { isFpAuthorWeaponId, saveWeaponPresentationFromEditor } from "../editor/weaponPresentationDiskSave.js";
import { useEditorFpViewmodelPanelStore } from "./hooks/useEditorFpViewmodelPanelStore.js";
import { frameFpMountIntoGameplayView } from "../editor/fpViewmodelAuthoringBridge.js";
import { editorChromeInput, editorChromeLabel, editorChromeRowBtn } from "./editorChromeStyles.js";

type WeaponAssetSurvey = {
  registryIds: string[];
  glbStems: string[];
  presentationStems: string[];
  glbWithoutRegistry: string[];
  registryWithoutGlb: string[];
  presentationWithoutRegistry: string[];
};

type ConsumableAssetSurvey = {
  authorableIds: string[];
  glbIds: string[];
  presentationStems: string[];
  glbWithoutAuthorable: string[];
  authorableWithoutGlb: string[];
  presentationWithoutAuthorable: string[];
};

type Props = {
  transformMode: TransformMode;
  setTransformMode: (m: TransformMode) => void;
  gridSnapM: number;
  setGridSnapM: (m: number) => void;
};

export function EditorChromeFpViewmodel({
  transformMode,
  setTransformMode,
  gridSnapM,
  setGridSnapM,
}: Props) {
  const [weaponSurvey, setWeaponSurvey] = useState<WeaponAssetSurvey | null>(null);
  const [consumableSurvey, setConsumableSurvey] = useState<ConsumableAssetSurvey | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetch("/__editor/weapon-asset-survey", { cache: "no-store" })
        .then(async (r) => (r.ok ? ((await r.json()) as WeaponAssetSurvey) : null))
        .catch(() => null),
      fetch("/__editor/consumable-asset-survey", { cache: "no-store" })
        .then(async (r) => (r.ok ? ((await r.json()) as ConsumableAssetSurvey) : null))
        .catch(() => null),
    ]).then(([nextWeaponSurvey, nextConsumableSurvey]) => {
      if (cancelled) return;
      setWeaponSurvey(nextWeaponSurvey);
      setConsumableSurvey(nextConsumableSurvey);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const {
    fpAuthorCamera,
    fpAuthorSubjectKind,
    fpAuthorTargetId,
    fpAuthorPitchRad,
    fpAuthorInitMessage,
    fpAuthorPickList,
    fpAuthorWeaponId,
    fpAuthorConsumableId,
    setFpAuthorWeaponId,
    setFpAuthorConsumableId,
    setFpAuthorCamera,
    setFpAuthorSubjectKind,
    pickFpAuthorTarget,
    setFpAuthorPitchRad,
    fpAuthorToast,
    showFpAuthorToast,
  } = useEditorFpViewmodelPanelStore();

  const isConsumable = fpAuthorSubjectKind === "consumable";
  const assetValue = isConsumable
    ? `consumable:${fpAuthorConsumableId}`
    : `weapon:${fpAuthorWeaponId}`;
  const gizmoTargetValue =
    fpAuthorPickList.length === 0 ? "" : fpAuthorPickList.some((p) => p.id === fpAuthorTargetId)
      ? fpAuthorTargetId
      : (fpAuthorPickList[0]?.id ?? "");

  const label = editorChromeLabel;
  const input = editorChromeInput;
  const rowBtn = editorChromeRowBtn;

  const saveLayout = () => {
    void (async () => {
      try {
        if (isConsumable) {
          await saveConsumablePresentationFromEditor(fpAuthorConsumableId);
        } else {
          await saveWeaponPresentationFromEditor(fpAuthorWeaponId);
        }
        showFpAuthorToast(
          isConsumable
            ? "Saved. This consumable preview and the game client now share the same layout."
            : "Saved. This preview is updated; the game dev client picks up the same layout automatically.",
        );
      } catch (e) {
        showFpAuthorToast(e instanceof Error ? e.message : String(e), 7000);
      }
    })();
  };

  return (
    <>
      <p style={{ opacity: 0.9, fontSize: 12, lineHeight: 1.45, margin: "0 0 10px" }}>
        {isConsumable ? (
          <>
            Consumables now use the same FP authoring flow as weapons. Use <strong>Orbit</strong> for
            a studio view and <strong>Gameplay</strong> to inspect the real FP lens.{" "}
            <strong>Save layout</strong> writes <code>{fpAuthorConsumableId}.presentation.json</code> to{" "}
            <code>content/consumables/</code>.
          </>
        ) : (
          <>
            The <strong style={{ color: "#7ab0e8" }}>cyan wire cube</strong> marks the canonical
            default rig offset (reference only). <strong>Fit in gameplay camera</strong> switches to{" "}
            <strong>Gameplay</strong>, resets that default, then nudges the rig so the mount sits in
            the real FP lens (in memory). Use <strong>Save layout</strong> to write{" "}
            <code>{fpAuthorWeaponId}.presentation.json</code>. Use <strong>Orbit</strong> for a studio
            view around the meshes.
          </>
        )}
      </p>

      {fpAuthorInitMessage ? (
        <p style={{ color: "#f88", fontSize: 12, margin: "0 0 8px" }}>{fpAuthorInitMessage}</p>
      ) : null}

      {!isConsumable &&
      weaponSurvey &&
      (weaponSurvey.glbWithoutRegistry.length > 0 ||
        weaponSurvey.registryWithoutGlb.length > 0 ||
        weaponSurvey.presentationWithoutRegistry.length > 0) ? (
        <p
          style={{
            color: "#e8c07a",
            fontSize: 11,
            lineHeight: 1.4,
            margin: "0 0 10px",
            padding: "8px 10px",
            background: "#2a2618",
            border: "1px solid #5a4a2a",
            borderRadius: 4,
          }}
        >
          <strong>Weapon assets vs registry</strong>
          {weaponSurvey.glbWithoutRegistry.length > 0 ? (
            <>
              <br />
              GLBs on disk without an engine definition:{" "}
              <code>{weaponSurvey.glbWithoutRegistry.join(", ")}</code> — add{" "}
              <code>WeaponDefinition</code> + catalog row, then reload.
            </>
          ) : null}
          {weaponSurvey.registryWithoutGlb.length > 0 ? (
            <>
              <br />
              Registry ids missing <code>.glb</code> under{" "}
              <code>apps/client/public/static/models/weapons/</code>:{" "}
              <code>{weaponSurvey.registryWithoutGlb.join(", ")}</code>
            </>
          ) : null}
          {weaponSurvey.presentationWithoutRegistry.length > 0 ? (
            <>
              <br />
              <code>content/weapons/*.presentation.json</code> with no registry id:{" "}
              <code>{weaponSurvey.presentationWithoutRegistry.join(", ")}</code>
            </>
          ) : null}
        </p>
      ) : null}

      {isConsumable && consumableSurvey && consumableSurvey.authorableWithoutGlb.length > 0 ? (
        <p
          style={{
            color: "#e8c07a",
            fontSize: 11,
            lineHeight: 1.4,
            margin: "0 0 10px",
            padding: "8px 10px",
            background: "#2a2618",
            border: "1px solid #5a4a2a",
            borderRadius: 4,
          }}
        >
          <strong>Missing GLBs</strong>
          <br />
          Authorable consumables without a GLB under{" "}
          <code>apps/client/public/static/models/consumables/</code>:{" "}
          <code>{consumableSurvey.authorableWithoutGlb.join(", ")}</code>
        </p>
      ) : null}

      <span style={label}>FP asset</span>
      <p style={{ fontSize: 10, opacity: 0.75, margin: "0 0 4px" }}>
        Weapons and consumables now share this same FP authoring pipeline. Pick the asset you want to
        preview and the editor swaps the live FP session underneath.
      </p>
      <select
        style={{ ...input, marginBottom: 10 }}
        value={assetValue}
        onChange={(e) => {
          const [kind, id] = e.target.value.split(":");
          if (!id) return;
          if (kind === "weapon" && isFpAuthorWeaponId(id)) {
            setFpAuthorSubjectKind("weapon");
            setFpAuthorWeaponId(id);
            return;
          }
          if (kind === "consumable" && isFpAuthorConsumableId(id)) {
            setFpAuthorSubjectKind("consumable");
            setFpAuthorConsumableId(id);
          }
        }}
      >
        <optgroup label="Weapons">
          {ALL_WEAPON_DEFINITIONS.map((d) => (
            <option key={`weapon:${d.id}`} value={`weapon:${d.id}`}>
              {d.displayName}
            </option>
          ))}
        </optgroup>
        <optgroup label="Consumables">
          {FP_AUTHORABLE_CONSUMABLE_IDS.map((id) => (
            <option key={`consumable:${id}`} value={`consumable:${id}`}>
              {id}
            </option>
          ))}
        </optgroup>
      </select>

      <span style={label}>Camera</span>
      <p style={{ fontSize: 11, opacity: 0.8, margin: "0 0 6px" }}>
        <strong>Orbit</strong>: drag empty space with <strong>LMB</strong> to orbit; drag the gizmo
        handles with <strong>LMB</strong> to edit. <strong>MMB</strong> dollys, <strong>RMB</strong>{" "}
        pans.{" "}
        <strong>Gameplay</strong>: through the real FP lens (no orbit).
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {(
          [
            ["orbit", "Orbit"],
            ["gameplay", "Gameplay"],
          ] as const
        ).map(([id, text]) => (
          <button
            key={id}
            type="button"
            style={{
              ...rowBtn,
              flex: 1,
              minWidth: 0,
              fontWeight: fpAuthorCamera === id ? 700 : 400,
              background: fpAuthorCamera === id ? "#3a4a7a" : "#2a2a34",
              border: "1px solid #444",
              color: "#fff",
            }}
            onClick={() => setFpAuthorCamera(id as FpAuthorCameraKind)}
          >
            {text}
          </button>
        ))}
        {!isConsumable ? (
          <button
            type="button"
            style={{
              ...rowBtn,
              flex: "1 1 100%",
              background: "#3a4a5a",
              border: "1px solid #5a6a8a",
            }}
            onClick={() => {
              setFpAuthorCamera("gameplay");
              frameFpMountIntoGameplayView();
              pickFpAuthorTarget("rigRoot");
            }}
          >
            Fit in gameplay camera
          </button>
        ) : null}
      </div>

      <span style={label}>Look pitch (rad)</span>
      <input
        style={{ ...input, marginBottom: 4 }}
        type="number"
        step={0.02}
        value={fpAuthorPitchRad}
        onChange={(e) => setFpAuthorPitchRad(Number(e.target.value) || 0)}
      />
      <p style={{ fontSize: 10, opacity: 0.75, margin: "0 0 8px" }}>
        Default <strong>0</strong> matches in-game FPOV before you move the mouse (same head pitch as
        the client).
      </p>

      <span style={label}>Part</span>
      <p style={{ fontSize: 10, opacity: 0.75, margin: "0 0 4px" }}>
        {isConsumable
          ? "Consumables currently expose a single authored mount root."
          : "Grip socket: stay within a normal reach of the hand; extreme values are blocked on save."}
      </p>
      <select
        style={{ ...input, marginBottom: 8 }}
        value={gizmoTargetValue}
        onChange={(e) => {
          pickFpAuthorTarget(e.target.value);
        }}
      >
        {fpAuthorPickList.length === 0 ? (
          <option value="">Loading…</option>
        ) : (
          fpAuthorPickList.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))
        )}
      </select>

      <span style={label}>Gizmo</span>
      <div style={{ marginBottom: 8 }}>
        {(["translate", "rotate", "scale"] as const).map((m) => (
          <button
            key={m}
            type="button"
            style={{
              ...rowBtn,
              background: transformMode === m ? "#2d5a3d" : "#2a2a34",
              border: "1px solid #444",
              color: "#fff",
            }}
            onClick={() => setTransformMode(m)}
          >
            {m}
          </button>
        ))}
      </div>

      <span style={label}>Grid snap (m)</span>
      <input
        style={{ ...input, marginBottom: 12 }}
        type="number"
        step={0.5}
        min={0}
        value={gridSnapM || ""}
        placeholder="0 = off"
        onChange={(e) => setGridSnapM(Number(e.target.value) || 0)}
      />

      <button
        type="button"
        style={{
          ...rowBtn,
          width: "100%",
          padding: "10px 12px",
          fontSize: 14,
          fontWeight: 600,
          background: "#2d4a5a",
          border: "1px solid #4a7a9a",
        }}
        onClick={saveLayout}
      >
        Save layout
      </button>
      {fpAuthorToast ? (
        <p
          style={{
            fontSize: 12,
            margin: "8px 0 0",
            color:
              fpAuthorToast.startsWith("Saved") || fpAuthorToast.startsWith("Framed")
                ? "#a8d8a8"
                : "#f8a8a8",
          }}
        >
          {fpAuthorToast}
        </p>
      ) : null}
    </>
  );
}
