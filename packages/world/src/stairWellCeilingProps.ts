import * as THREE from "three";
import {
  defaultOwnedApartmentDecorScaleForModel,
  normalizeOwnedApartmentDecorModelRelPath,
  type StairWellCeilingProp,
  type StairWellCeilingPropAnchor,
  type StairWellDef,
} from "@the-mammoth/schemas";
import { clientModelUrlToOwnedApartmentDecorRelPath } from "./stairwellLitterCanonicalScale.js";
import { findLandingMeshForCorner, loadPropTemplate } from "./stairWellLandingProps.js";
import {
  stairWellCeilingPropEditorId,
  type StairWellAuthoringScope,
} from "./stairWellEditorIds.js";
import type { StairCornerLanding, StairSwitchbackLayout } from "./stairWellGeometry.js";
import { ENABLE_STAIRWELL_AND_CORRIDOR_CEILING_LIGHTS } from "./featureFlags.js";

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

/** First ceiling fixture template for a scope (model + shared yaw/scale). */
export function resolveStairWellCeilingPropTemplate(
  def: StairWellDef | undefined,
  scope: StairWellAuthoringScope,
): StairWellCeilingProp | undefined {
  return resolveStairWellCeilingPropsForScope(def, scope).find((prop) =>
    propAllowedForScope(prop, scope),
  );
}

export function stairWellCeilingPropInstanceId(landingIndex: number): string {
  return `landing_${landingIndex}`;
}

export function patchStairWellCeilingPropAnchorInDef(
  def: StairWellDef,
  scope: StairWellAuthoringScope,
  propId: string,
  anchorPatch: Partial<StairWellCeilingPropAnchor>,
): StairWellDef {
  const templateId = resolveStairWellCeilingTemplateIdForPatch(def, scope, propId);
  if (!templateId) return def;

  const mergeAnchor = (prop: StairWellCeilingProp): StairWellCeilingProp =>
    prop.id === templateId
      ? { ...prop, anchor: { ...prop.anchor, ...anchorPatch } }
      : prop;

  if (scope === "ground") {
    const base = [...(def.groundCeilingProps ?? def.ceilingProps ?? [])];
    return { ...def, groundCeilingProps: base.map(mergeAnchor) };
  }
  const base = [...(def.ceilingProps ?? [])];
  return { ...def, ceilingProps: base.map(mergeAnchor) };
}

function resolveStairWellCeilingTemplateIdForPatch(
  def: StairWellDef,
  scope: StairWellAuthoringScope,
  propOrInstanceId: string,
): string | null {
  const props = resolveStairWellCeilingPropsForScope(def, scope);
  if (props.some((p) => p.id === propOrInstanceId)) return propOrInstanceId;
  if (props.length > 0 && propOrInstanceId.startsWith("landing_")) {
    return props[0]!.id;
  }
  return null;
}

export function readStairWellCeilingPropAnchorFromTransform(
  obj: THREE.Object3D,
): Partial<StairWellCeilingPropAnchor> | null {
  const templateId = obj.userData.editorStairCeilingTemplateId as string | undefined;
  if (templateId) {
    const u = obj.scale.x;
    return {
      yawRad: obj.rotation.y,
      uniformScale: Number.isFinite(u) && u > 0 ? u : undefined,
    };
  }
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

/** Mount point on the landing slab underside, centered in landing-local space. */
export function landingUndersideCeilingMountLocalY(cl: StairCornerLanding): number {
  return -cl.thicknessHalf;
}

export function applyLandingUndersideCeilingPropToWrap(
  wrap: THREE.Object3D,
  prop: StairWellCeilingProp,
  cl: StairCornerLanding,
): void {
  wrap.position.set(0, landingUndersideCeilingMountLocalY(cl), 0);
  wrap.rotation.set(0, prop.anchor.yawRad ?? 0, 0);
  const u = resolveCeilingPropUniformScale(prop);
  wrap.scale.set(u, u, u);
}

function tagStairWellEditorCeilingProp(
  wrap: THREE.Group,
  instanceId: string,
  templateId: string,
  scope: StairWellAuthoringScope,
  sy: number,
): void {
  wrap.userData.editorStairCeilingPropId = instanceId;
  wrap.userData.editorStairCeilingTemplateId = templateId;
  wrap.userData.editorStairPickId = stairWellCeilingPropEditorId(templateId);
  wrap.userData.editorStairAuthoringScope = scope;
  wrap.userData.editorStairPreviewSy = sy;
}

/** Reapply authored template (yaw/scale) and landing underside placement on every instance. */
export function applyStairWellCeilingPropAnchors(
  root: THREE.Object3D,
  def: StairWellDef | undefined,
): void {
  if (!def) return;
  root.traverse((obj) => {
    const templateId = obj.userData.editorStairCeilingTemplateId as string | undefined;
    if (!templateId) return;
    const scope =
      (obj.userData.editorStairAuthoringScope as StairWellAuthoringScope | undefined) ??
      "typical";
    const prop = resolveStairWellCeilingPropsForScope(def, scope).find(
      (entry) => entry.id === templateId,
    );
    if (!prop) return;
    const landingMesh = obj.parent;
    const cl = landingMesh?.userData.mammothStairCornerLandingRef as
      | StairCornerLanding
      | undefined;
    if (!cl) return;
    applyLandingUndersideCeilingPropToWrap(obj, prop, cl);
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

/**
 * One flush ceiling fixture per corner landing, centered on the slab underside (parents to the
 * landing mesh so {@link applyStairWellPartTransforms} moves lights with each deck).
 */
export function attachStairWellCeilingProps(args: {
  root: THREE.Group;
  def: StairWellDef | undefined;
  authoringScope: StairWellAuthoringScope;
  sy: number;
  L: StairSwitchbackLayout;
  omitOnlyLanding?: StairCornerLanding;
}): void {
  if (!ENABLE_STAIRWELL_AND_CORRIDOR_CEILING_LIGHTS) return;
  const template = resolveStairWellCeilingPropTemplate(args.def, args.authoringScope);
  if (!template) return;

  for (const [landingIndex, cl] of args.L.cornerLandings.entries()) {
    if (args.omitOnlyLanding !== undefined && cl === args.omitOnlyLanding) continue;

    const landingMesh = findLandingMeshForCorner(args.root, cl);
    if (!landingMesh) continue;
    landingMesh.userData.mammothSkipFloorGeometryMerge = true;

    const instanceId = stairWellCeilingPropInstanceId(landingIndex);
    const wrap = new THREE.Group();
    wrap.name = `stairwell_ceiling_light_${instanceId}`;
    wrap.userData.mammothStairwellCeilingLight = true;
    wrap.userData.mammothApartmentDecorModelRelPath = resolveCeilingPropModelRelPath(template);
    wrap.userData.mammothApartmentDecorProp = true;
    wrap.userData.mammothUnitInterior = true;
    wrap.userData.mammothSkipFloorGeometryMerge = true;
    wrap.userData.mammothNoCollision = true;
    tagStairWellEditorCeilingProp(
      wrap,
      instanceId,
      template.id,
      args.authoringScope,
      args.sy,
    );
    applyLandingUndersideCeilingPropToWrap(wrap, template, cl);

    landingMesh.add(wrap);

    const url = template.modelUrl;
    void loadPropTemplate(url).then(
      (loaded) => {
        const scene = loaded.clone(true);
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
          `[attachStairWellCeilingProps] failed to load "${url}" for landing ${landingIndex}:`,
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

/** Keep yaw/scale in sync across every landing instance sharing a template id. */
export function syncStairWellCeilingTemplateInstances(
  segmentRoot: THREE.Object3D,
  templateId: string,
  sourceWrap: THREE.Object3D,
): void {
  segmentRoot.traverse((obj) => {
    if (obj.userData.editorStairCeilingTemplateId !== templateId) return;
    obj.rotation.copy(sourceWrap.rotation);
    obj.scale.copy(sourceWrap.scale);
    const cl = obj.parent?.userData.mammothStairCornerLandingRef as
      | StairCornerLanding
      | undefined;
    if (!cl) return;
    obj.position.set(0, landingUndersideCeilingMountLocalY(cl), 0);
  });
}
