import * as THREE from "three";
import {
  defaultOwnedApartmentDecorScaleForModel,
  normalizeOwnedApartmentDecorModelRelPath,
  type StairWellCeilingProp,
  type StairWellCeilingPropAnchor,
  type StairWellDef,
} from "@the-mammoth/schemas";
import { clientModelUrlToOwnedApartmentDecorRelPath } from "./stairwellLitterCanonicalScale.js";
import { loadPropTemplate } from "./stairWellLandingProps.js";
import {
  stairWellCeilingPropEditorId,
  type StairWellAuthoringScope,
} from "./stairWellEditorIds.js";

export const STAIRWELL_CEILING_LIGHT_MODEL_URL =
  "/static/models/objects/light-ceiling-2.glb";

const _bboxScratch = new THREE.Box3();
const _centerScratch = new THREE.Vector3();

/** Interior ceiling plane Y in shaft-local space (matches {@link addShaftShell} wall top). */
export function shaftInteriorCeilingYLocal(sy: number): number {
  const wt = 0.11;
  const hy = sy * 0.5;
  const innerWallH = Math.max(sy - 2 * wt, 0.08);
  const wallCenterY = -hy + wt + innerWallH * 0.5;
  return wallCenterY + innerWallH * 0.5;
}

function propAllowedForScope(
  prop: Pick<StairWellCeilingProp, "applyToScopes">,
  scope: StairWellAuthoringScope,
): boolean {
  const scopes = prop.applyToScopes;
  if (scopes && scopes.length > 0) return scopes.includes(scope);
  return true;
}

/** Props list for runtime mount / editor sync for the given authoring scope. */
export function resolveStairWellCeilingPropsForScope(
  def: StairWellDef | undefined,
  scope: StairWellAuthoringScope,
): readonly StairWellCeilingProp[] {
  if (!def) return [];
  if (scope === "ground") {
    return def.groundCeilingProps ?? def.ceilingProps ?? [];
  }
  return def.ceilingProps ?? [];
}

export function patchStairWellCeilingPropAnchorInDef(
  def: StairWellDef,
  scope: StairWellAuthoringScope,
  propId: string,
  anchorPatch: Partial<StairWellCeilingPropAnchor>,
): StairWellDef {
  const mergeAnchor = (prop: StairWellCeilingProp): StairWellCeilingProp =>
    prop.id === propId
      ? { ...prop, anchor: { ...prop.anchor, ...anchorPatch } }
      : prop;

  if (scope === "ground") {
    const base = [...(def.groundCeilingProps ?? def.ceilingProps ?? [])];
    return { ...def, groundCeilingProps: base.map(mergeAnchor) };
  }
  const base = [...(def.ceilingProps ?? [])];
  return { ...def, ceilingProps: base.map(mergeAnchor) };
}

export function readStairWellCeilingPropAnchorFromTransform(
  obj: THREE.Object3D,
): Partial<StairWellCeilingPropAnchor> | null {
  const sy = obj.userData.editorStairPreviewSy as number | undefined;
  if (typeof sy !== "number" || !Number.isFinite(sy)) return null;
  const ceilingY = shaftInteriorCeilingYLocal(sy);
  const u = obj.scale.x;
  return {
    offsetXM: obj.position.x,
    offsetZM: obj.position.z,
    dropM: ceilingY - obj.position.y,
    yawRad: obj.rotation.y,
    uniformScale: Number.isFinite(u) && u > 0 ? u : undefined,
  };
}

function applyCeilingPropAnchorToWrap(
  wrap: THREE.Object3D,
  prop: StairWellCeilingProp,
  sy: number,
): void {
  const ceilingY = shaftInteriorCeilingYLocal(sy);
  const offsetX = prop.anchor.offsetXM ?? 0;
  const offsetZ = prop.anchor.offsetZM ?? 0;
  const dropM = prop.anchor.dropM ?? 0.06;
  wrap.position.set(offsetX, ceilingY - dropM, offsetZ);
  wrap.rotation.set(0, prop.anchor.yawRad ?? 0, 0);
  const u = resolveCeilingPropUniformScale(prop);
  wrap.scale.set(u, u, u);
}

function tagStairWellEditorCeilingProp(
  wrap: THREE.Group,
  propId: string,
  scope: StairWellAuthoringScope,
  sy: number,
): void {
  wrap.userData.editorStairCeilingPropId = propId;
  wrap.userData.editorStairPickId = stairWellCeilingPropEditorId(propId);
  wrap.userData.editorStairAuthoringScope = scope;
  wrap.userData.editorStairPreviewSy = sy;
}

/** Reapply authored anchors from {@link StairWellDef} onto tagged editor/runtime wraps. */
export function applyStairWellCeilingPropAnchors(
  root: THREE.Object3D,
  def: StairWellDef | undefined,
): void {
  if (!def) return;
  root.traverse((obj) => {
    const propId = obj.userData.editorStairCeilingPropId as string | undefined;
    if (!propId) return;
    const scope =
      (obj.userData.editorStairAuthoringScope as StairWellAuthoringScope | undefined) ??
      "typical";
    const sy = obj.userData.editorStairPreviewSy as number | undefined;
    if (typeof sy !== "number" || !Number.isFinite(sy)) return;
    const prop = resolveStairWellCeilingPropsForScope(def, scope).find(
      (entry) => entry.id === propId,
    );
    if (!prop) return;
    applyCeilingPropAnchorToWrap(obj, prop, sy);
  });
}

function alignCeilingFixtureToMountPoint(scene: THREE.Object3D): void {
  _bboxScratch.setFromObject(scene);
  if (_bboxScratch.isEmpty()) return;
  _bboxScratch.getCenter(_centerScratch);
  scene.position.set(
    -_centerScratch.x,
    -_bboxScratch.max.y,
    -_centerScratch.z,
  );
}

function resolveCeilingPropUniformScale(prop: StairWellCeilingProp): number {
  if (prop.anchor.uniformScale != null) return prop.anchor.uniformScale;
  const rel = clientModelUrlToOwnedApartmentDecorRelPath(prop.modelUrl);
  return defaultOwnedApartmentDecorScaleForModel(rel).uniformScale;
}

function resolveCeilingPropModelRelPath(prop: StairWellCeilingProp): string {
  return normalizeOwnedApartmentDecorModelRelPath(
    clientModelUrlToOwnedApartmentDecorRelPath(prop.modelUrl),
  );
}

/**
 * Parents ceiling GLBs under each stair segment root (typical + ground share authored offsets).
 */
export function attachStairWellCeilingProps(args: {
  root: THREE.Group;
  def: StairWellDef | undefined;
  authoringScope: StairWellAuthoringScope;
  sy: number;
}): void {
  const props = resolveStairWellCeilingPropsForScope(args.def, args.authoringScope);
  if (props.length === 0) return;

  for (const prop of props) {
    if (!propAllowedForScope(prop, args.authoringScope)) continue;

    const wrap = new THREE.Group();
    wrap.name = `stairwell_ceiling_light_${prop.id}`;
    wrap.userData.mammothStairwellCeilingLight = true;
    wrap.userData.mammothApartmentDecorModelRelPath = resolveCeilingPropModelRelPath(prop);
    wrap.userData.mammothApartmentDecorProp = true;
    wrap.userData.mammothUnitInterior = true;
    wrap.userData.mammothSkipFloorGeometryMerge = true;
    wrap.userData.mammothNoCollision = true;
    tagStairWellEditorCeilingProp(wrap, prop.id, args.authoringScope, args.sy);
    applyCeilingPropAnchorToWrap(wrap, prop, args.sy);

    args.root.add(wrap);

    const url = prop.modelUrl;
    void loadPropTemplate(url).then(
      (template) => {
        const scene = template.clone(true);
        scene.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          o.castShadow = false;
          o.receiveShadow = false;
          o.userData.mammothUnitInterior = true;
          o.userData.mammothNoCollision = true;
        });
        alignCeilingFixtureToMountPoint(scene);
        wrap.add(scene);
        wrap.userData.mammothStairwellCeilingLightMeshesReady = true;
        notifyStairwellCeilingPropReady();
      },
      (err) => {
        console.warn(
          `[attachStairWellCeilingProps] failed to load "${url}" for prop "${prop.id}":`,
          err,
        );
        wrap.userData.mammothStairwellCeilingLightLoadFailed = true;
        notifyStairwellCeilingPropReady();
      },
    );
  }
}

export function collectStairwellCeilingLightGroups(root: THREE.Object3D): THREE.Group[] {
  const out: THREE.Group[] = [];
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Group)) return;
    if (obj.userData.mammothStairwellCeilingLight !== true) return;
    if (typeof obj.userData.mammothApartmentDecorModelRelPath !== "string") return;
    out.push(obj);
  });
  return out;
}

const stairwellCeilingPropReadyListeners = new Set<() => void>();

/** Editor + FP subscribe once; fired after each async ceiling GLB mounts. */
export function subscribeStairwellCeilingPropReady(listener: () => void): () => void {
  stairwellCeilingPropReadyListeners.add(listener);
  return () => {
    stairwellCeilingPropReadyListeners.delete(listener);
  };
}

function notifyStairwellCeilingPropReady(): void {
  for (const listener of stairwellCeilingPropReadyListeners) {
    listener();
  }
}

export function allStairwellCeilingLightGroupsReady(root: THREE.Object3D): boolean {
  const groups = collectStairwellCeilingLightGroups(root);
  if (groups.length === 0) return false;
  return groups.every((group) => group.children.length > 0);
}
