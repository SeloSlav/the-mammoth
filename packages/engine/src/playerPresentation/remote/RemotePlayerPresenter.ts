import * as THREE from "three";
import type { IModelLoadRegistry, ModelRef } from "@the-mammoth/assets";
import type {
  HeldItemId,
  LocalPlayerGameplayState,
  ReplicatedPlayerSnapshot,
  ThirdPersonWeaponPresentationDrive,
} from "@the-mammoth/game";
import { mammothGlbLoadCandidates } from "@the-mammoth/assets";
import { getConfiguredGltfLoader } from "../../loaders/createConfiguredGltfLoader.js";
import { loadGltfFirstMatch } from "../../loaders/gltfLoadFirstMatch.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { detachSkinnedModelCloneSubtree } from "../../loaders/deepDisposeObject3D.js";
import { CrowdSkinnedPresenter } from "../crowd/CrowdSkinnedPresenter.js";
import { buildPrimitiveHumanoid } from "../primitiveHumanoid.js";
import { resolvePlayerBodyClipName, type PlayerBodyClipName } from "./playerBodyMotion.js";
import { WeaponPresenter } from "../../weapons/WeaponPresenter.js";
import { getWeaponDefinitionForEquippedPrimary } from "../../weapons/weaponRegistry.js";
import {
  fpFirearmShotVisualConfigForHeldItem,
  sampleFpFirearmShotVisual,
  type FpFirearmShotVisualConfig,
} from "../local/fpFirearmShotVisuals.js";
import { FP_CROWBAR_GLTF_MAX_EDGE_M } from "../viewModelNormalize.js";
import { resolveSkinnedHumanoidHandBone } from "../humanoidAttachmentBones.js";

/**
 * Reserved for a future distance-based LOD policy. Crowd primitive LOD is disabled — remotes
 * always render the skinned body GLB.
 */
export const REMOTE_PLAYER_CROWD_FULL_DETAIL_NEAREST = 6;

export const REMOTE_PLAYER_BODY_URI_MALE = "/static/models/players/male.glb";
export const REMOTE_PLAYER_BODY_URI_FEMALE = "/static/models/players/female.glb";

const REMOTE_PLAYER_MODEL_URI = REMOTE_PLAYER_BODY_URI_MALE;
const REMOTE_PLAYER_YAW_OFFSET_RAD = Math.PI;
const REMOTE_PLAYER_TRANSITION_SEC = 0.18;
const LOCAL_MIRROR_BODY_FORWARD_OFFSET_M = 0.12;
const LOCAL_MIRROR_BODY_DOWN_OFFSET_M = 0.02;
const REMOTE_PLAYER_ENV_INTENSITY = 0.35;
const REMOTE_PLAYER_MIN_ROUGHNESS = 0.82;
const REMOTE_PLAYER_MAX_METALNESS = 0.04;
const REMOTE_NAME_TAG_Y_M = 2.08;
const REMOTE_NAME_TAG_WORLD_WIDTH_M = 1.1;
const REMOTE_NAME_TAG_WORLD_HEIGHT_M = 0.26;
const REMOTE_PLAYER_CLIP_NAMES = {
  idle: "Idle",
  walk: "Walking",
  run: "Running",
  jump: "Regular_Jump",
} as const satisfies Record<PlayerBodyClipName, string>;

const REMOTE_TP_MUZZLE_FLASH_COLOR = 0xffc46b;
/**
 * Bind-pose bounds sit inside locomotion extremes; inflate the frustum sphere so culling stays on
 * without clipping animated limbs (avoids `frustumCulled = false`, which submits every remote every frame).
 */
const REMOTE_PLAYER_FRUSTUM_SPHERE_RADIUS_MUL = 1.45;

function expectGltfModelRef(ref: ModelRef): Extract<ModelRef, { kind: "gltf" }> {
  if (ref.kind !== "gltf") throw new Error("[RemotePlayerPresenter] weapon asset must be glTF");
  return ref;
}

/**
 * Legacy approximate wield point in **feet / yaw root space** when no rig hand bone was resolved.
 * Prefer {@link resolveSkinnedHumanoidHandBone} + {@link WorldPlayerBodyPresenter.getThirdPersonWeaponMountHost}.
 */
const REMOTE_WEAPON_FLOAT_LOCAL_POS = new THREE.Vector3(0.28, 1.06, 0.12);
const REMOTE_WEAPON_FLOAT_LOCAL_EULER = new THREE.Euler(0.12, -0.42, -0.14, "XYZ");

const remotePlayerLoader = getConfiguredGltfLoader();
type RemoteBodyTemplate = { scene: THREE.Object3D; animations: readonly THREE.AnimationClip[] };
const remoteBodyTemplates = new Map<string, RemoteBodyTemplate>();
const remoteBodyTemplateLoads = new Map<string, Promise<void>>();

function sanitizeRemotePlayerClip(clip: THREE.AnimationClip): THREE.AnimationClip {
  /**
   * The shipped body GLB contains scale keys on multiple bones, and `Idle` notably drives
   * `Hips.scale` above 1.0. That makes the whole avatar visibly grow/shrink when transitioning
   * between idle and locomotion. Third-person gameplay should preserve a stable silhouette, so
   * strip skeletal scale animation and keep only translation/rotation.
   */
  const tracks = clip.tracks.filter((track) => !track.name.endsWith(".scale"));
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

function cloneRemotePlayerScene(template: THREE.Object3D): THREE.Object3D {
  const root = cloneSkeleton(template);
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    /** FP session lighting is unshadowed; skip shadow flags so a future `castShadow` sun cannot multiply skinned cost. */
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.geometry = mesh.geometry.clone();
    mesh.geometry.computeBoundingSphere();
    const bs = mesh.geometry.boundingSphere;
    if (bs) {
      bs.radius *= REMOTE_PLAYER_FRUSTUM_SPHERE_RADIUS_MUL;
    }
    mesh.frustumCulled = true;
    const mat = mesh.material;
    mesh.material = Array.isArray(mat)
      ? mat.map((entry) => tuneRemotePlayerMaterial(entry.clone()))
      : tuneRemotePlayerMaterial(mat.clone());
  });
  return root;
}

function tuneRemotePlayerMaterial<T extends THREE.Material>(material: T): T {
  if (
    material instanceof THREE.MeshStandardMaterial ||
    material instanceof THREE.MeshPhysicalMaterial
  ) {
    /**
     * The authored GLB reads far glossier than the building shell under the session's muted
     * overcast lighting + environment map. Keep its albedo/normal detail, but bias the imported
     * body materials toward matte dielectric values so remotes sit in the same lighting family as
     * the world instead of reflecting like polished plastic.
     */
    material.envMapIntensity = Math.min(material.envMapIntensity ?? 1, REMOTE_PLAYER_ENV_INTENSITY);
    material.metalnessMap = null;
    material.metalness = Math.min(material.metalness, REMOTE_PLAYER_MAX_METALNESS);
    material.roughness = Math.max(material.roughness, REMOTE_PLAYER_MIN_ROUGHNESS);
    material.needsUpdate = true;
  }
  return material;
}

/** One skin + one cloth material for every low-LOD remote — avoids N× material instances in crowds. */
const remoteCrowdLodSkinMat = new THREE.MeshStandardMaterial({
  color: 0x9f7a6b,
  roughness: 0.72,
  metalness: 0.06,
});
const remoteCrowdLodClothMat = new THREE.MeshStandardMaterial({
  color: 0x4a5568,
  roughness: 0.78,
  metalness: 0.05,
});
tuneRemotePlayerMaterial(remoteCrowdLodSkinMat);
tuneRemotePlayerMaterial(remoteCrowdLodClothMat);

function normalizeRemotePlayerModel(model: THREE.Object3D): void {
  /**
   * `male.glb` already bakes the correct cm->m conversion on the armature root (`Armature.scale = 0.01`).
   * Scaling the cloned scene again blows up animated hip translations (`~95` authored cm keys become
   * tens of world meters once multiplied by the extra root scale), which is why remote players read as
   * building-sized giants. Keep authored scale; only recenter the scene so feet stay on Y=0.
   */
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -box.min.y, -center.z);
  model.updateMatrixWorld(true);
}

function renderRemoteNameTagTexture(displayName: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }

  const label = displayName.trim().slice(0, 24) || "Guest";
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(4, 8, 14, 0.72)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.32)";
  ctx.lineWidth = 3;
  const x = 18;
  const y = 28;
  const w = canvas.width - x * 2;
  const h = 72;
  const r = 20;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.font = "700 38px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.72)";
  ctx.fillStyle = "rgba(238, 246, 255, 0.96)";
  ctx.strokeText(label, canvas.width / 2, y + h / 2 + 1);
  ctx.fillText(label, canvas.width / 2, y + h / 2 + 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createLoopingAction(
  mixer: THREE.AnimationMixer,
  clipLibrary: Map<string, THREE.AnimationClip>,
  clipName: string,
  loopMode: number,
): THREE.AnimationAction | null {
  const clip = clipLibrary.get(clipName);
  if (!clip) return null;
  const action = mixer.clipAction(clip);
  action.enabled = true;
  action.setLoop(
    loopMode as THREE.AnimationActionLoopStyles,
    loopMode === THREE.LoopOnce ? 1 : Infinity,
  );
  action.clampWhenFinished = loopMode === THREE.LoopOnce;
  return action;
}

class AnimatedRemotePlayerBody {
  readonly root = new THREE.Group();
  private readonly modelRoot: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<PlayerBodyClipName, THREE.AnimationAction>();
  private activeClip: PlayerBodyClipName | null = null;

  constructor(template: { scene: THREE.Object3D; animations: readonly THREE.AnimationClip[] }) {
    this.root.name = "remote_player_body";
    this.modelRoot = cloneRemotePlayerScene(template.scene);
    this.modelRoot.name = "remote_player_model";
    normalizeRemotePlayerModel(this.modelRoot);
    this.root.add(this.modelRoot);
    this.mixer = new THREE.AnimationMixer(this.modelRoot);
    const clipLibrary = new Map(template.animations.map((clip) => [clip.name, clip] as const));
    const idle = createLoopingAction(
      this.mixer,
      clipLibrary,
      REMOTE_PLAYER_CLIP_NAMES.idle,
      THREE.LoopRepeat,
    );
    const walk = createLoopingAction(
      this.mixer,
      clipLibrary,
      REMOTE_PLAYER_CLIP_NAMES.walk,
      THREE.LoopRepeat,
    );
    const run = createLoopingAction(
      this.mixer,
      clipLibrary,
      REMOTE_PLAYER_CLIP_NAMES.run,
      THREE.LoopRepeat,
    );
    const jump = createLoopingAction(
      this.mixer,
      clipLibrary,
      REMOTE_PLAYER_CLIP_NAMES.jump,
      THREE.LoopOnce,
    );
    if (idle) this.actions.set("idle", idle);
    if (walk) this.actions.set("walk", walk);
    if (run) this.actions.set("run", run);
    if (jump) this.actions.set("jump", jump);
    this.playClip("idle", true);
  }

  setVisible(visible: boolean): void {
    this.root.visible = visible;
  }

  /** Low-LOD path: hide skinned branch and stop mixer work. */
  freezeForLodLo(): void {
    this.mixer.stopAllAction();
    this.activeClip = null;
  }

  /** After showing the skinned body again, restart from a stable idle pose. */
  resumeAfterLodHi(): void {
    this.playClip("idle", true);
  }

  updateMotion(args: { grounded: boolean; locomotion: ReplicatedPlayerSnapshot["locomotion"] }, dt: number): void {
    this.playClip(resolvePlayerBodyClipName(args), false);
    this.mixer.update(dt);
  }

  /** Skinned `male.glb` / `female.glb` wrist socket; `null` when this rig uses another naming scheme. */
  getSkinnedRightHandWeaponBone(): THREE.Object3D | null {
    return resolveSkinnedHumanoidHandBone(this.modelRoot, "right");
  }

  dispose(): void {
    this.mixer.stopAllAction();
    detachSkinnedModelCloneSubtree(this.root);
  }

  private playClip(next: PlayerBodyClipName, immediate: boolean): void {
    if (this.activeClip === next) return;
    const nextAction = this.actions.get(next);
    if (!nextAction) return;
    const prevAction = this.activeClip ? this.actions.get(this.activeClip) : null;
    this.activeClip = next;
    if (prevAction && prevAction !== nextAction) {
      prevAction.fadeOut(immediate ? 0 : REMOTE_PLAYER_TRANSITION_SEC);
    }
    nextAction.reset();
    nextAction.fadeIn(immediate ? 0 : REMOTE_PLAYER_TRANSITION_SEC);
    nextAction.play();
  }
}

function loadRemoteBodyTemplate(uri: string): Promise<void> {
  let load = remoteBodyTemplateLoads.get(uri);
  if (!load) {
    load = loadGltfFirstMatch(mammothGlbLoadCandidates(uri), remotePlayerLoader).then((gltf) => {
      remoteBodyTemplates.set(uri, {
        scene: gltf.scene,
        animations: gltf.animations.map(sanitizeRemotePlayerClip),
      });
    });
    remoteBodyTemplateLoads.set(uri, load);
  }
  return load;
}

function getRemotePlayerBodyTemplate(uri: string): RemoteBodyTemplate {
  const resolved =
    remoteBodyTemplates.get(uri) ??
    remoteBodyTemplates.get(REMOTE_PLAYER_BODY_URI_MALE);
  if (!resolved) {
    throw new Error("[RemotePlayerPresenter] player body GLB not preloaded — call preloadRemotePlayerBody()");
  }
  return resolved;
}

/** Loads male (required) and attempts female (optional); mirrors may use either URI. */
export async function preloadRemotePlayerBody(): Promise<void> {
  await loadRemoteBodyTemplate(REMOTE_PLAYER_BODY_URI_MALE);
  void loadRemoteBodyTemplate(REMOTE_PLAYER_BODY_URI_FEMALE).catch(() => {
    remoteBodyTemplateLoads.delete(REMOTE_PLAYER_BODY_URI_FEMALE);
    remoteBodyTemplates.delete(REMOTE_PLAYER_BODY_URI_FEMALE);
  });
}

function getRemotePlayerTemplate(): RemoteBodyTemplate {
  return getRemotePlayerBodyTemplate(REMOTE_PLAYER_MODEL_URI);
}

/** Anything that can resolve a weapon parent (skinned hand bone, primitive socket, or feet-root float). */
type ThirdPersonWeaponMountSource = {
  getThirdPersonWeaponMountHost(): { parent: THREE.Object3D; identityLocal: boolean };
};

/** Third-person weapon + swing + muzzle flash — remotes, local mirror, NPCs (same presenter as players). */
export class RemoteHeldWeaponPresentation {
  private readonly modelRegistry: IModelLoadRegistry;
  private readonly weaponMount = new THREE.Group();
  private weapon?: WeaponPresenter;
  private visEquipped: HeldItemId = "unarmed";
  private lastMeleeSeq = 0;
  private meleeElapsedS = Number.POSITIVE_INFINITY;
  private lastFireSeq = 0;
  private shotCfg: FpFirearmShotVisualConfig | null = null;
  private shotElapsedS = Number.POSITIVE_INFINITY;
  private readonly flashRoot = new THREE.Group();
  private readonly flashMesh: THREE.Mesh;

  constructor(modelRegistry: IModelLoadRegistry) {
    this.modelRegistry = modelRegistry;
    const flashGeom = new THREE.PlaneGeometry(1, 1);
    const flashMat = new THREE.MeshBasicMaterial({
      color: REMOTE_TP_MUZZLE_FLASH_COLOR,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.flashMesh = new THREE.Mesh(flashGeom, flashMat);
    this.flashMesh.name = "remote_muzzle_flash_quad";
    this.flashRoot.name = "remote_muzzle_flash_root";
    this.flashRoot.add(this.flashMesh);
    this.flashRoot.visible = false;
    this.weaponMount.name = "remote_weapon_mount";
    this.weaponMount.visible = false;
  }

  dispose(): void {
    this.teardownMountedWeapon();
    this.flashMesh.geometry.dispose();
    (this.flashMesh.material as THREE.Material).dispose();
  }

  /** Drop the GLB weapon (keeps the shared muzzle quad alive for the next mount). */
  private teardownMountedWeapon(): void {
    if (this.flashRoot.parent) this.flashRoot.parent.remove(this.flashRoot);
    if (this.weapon) {
      this.weapon.dispose(this.weaponMount);
      this.weapon = undefined;
    }
    if (this.weaponMount.parent) this.weaponMount.parent.remove(this.weaponMount);
    this.visEquipped = "unarmed";
    this.weaponMount.visible = false;
    this.flashRoot.visible = false;
    (this.flashMesh.material as THREE.MeshBasicMaterial).opacity = 0;
  }

  private ensureWeaponMountOnHost(hostSrc: ThirdPersonWeaponMountSource): void {
    const { parent, identityLocal } = hostSrc.getThirdPersonWeaponMountHost();
    if (this.weaponMount.parent !== parent) {
      if (this.weaponMount.parent) this.weaponMount.parent.remove(this.weaponMount);
      parent.add(this.weaponMount);
    }
    if (identityLocal) {
      this.weaponMount.position.set(0, 0, 0);
      this.weaponMount.rotation.set(0, 0, 0);
    } else {
      this.weaponMount.position.copy(REMOTE_WEAPON_FLOAT_LOCAL_POS);
      this.weaponMount.rotation.copy(REMOTE_WEAPON_FLOAT_LOCAL_EULER);
    }
    this.weaponMount.scale.set(1, 1, 1);

    const layerMask = parent.layers.mask;
    this.weaponMount.layers.mask = layerMask;
    this.weaponMount.traverse((o) => {
      o.layers.mask = layerMask;
    });
  }

  syncWeaponPresentation(
    drive: ThirdPersonWeaponPresentationDrive,
    dt: number,
    hostSrc: ThirdPersonWeaponMountSource,
  ): void {
    const nextEquip = drive.equippedPrimary;
    const weaponDef =
      nextEquip === "unarmed" ? undefined : getWeaponDefinitionForEquippedPrimary(nextEquip);

    if (!weaponDef) {
      if (this.visEquipped !== "unarmed" || this.weapon !== undefined) {
        this.teardownMountedWeapon();
      }
      return;
    }

    this.ensureWeaponMountOnHost(hostSrc);

    if (!this.weapon || this.visEquipped !== nextEquip) {
      if (this.flashRoot.parent) this.flashRoot.parent.remove(this.flashRoot);
      if (this.weapon) {
        this.weapon.dispose(this.weaponMount);
        this.weapon = undefined;
      }
      const pr = this.modelRegistry.instantiateLoaded(expectGltfModelRef(weaponDef.modelRef));
      if (!pr.ok) {
        console.warn(`[RemoteHeldWeaponPresentation] GLB (${weaponDef.id}): ${pr.error}`);
        this.weaponMount.visible = false;
        return;
      }
      this.weapon = new WeaponPresenter({
        definition: weaponDef,
        role: "remote_third_person",
        visual: pr.root as THREE.Object3D,
      });
      this.weapon.normalizeVisualToMaxEdgeMeters(FP_CROWBAR_GLTF_MAX_EDGE_M);
      this.weapon.root.traverse((o) => {
        o.frustumCulled = false;
      });
      this.weaponMount.add(this.weapon.root);
      this.weapon.root.add(this.flashRoot);
      const layerMask = this.weaponMount.layers.mask;
      this.weapon.root.traverse((o) => {
        o.layers.mask = layerMask;
      });
      this.visEquipped = nextEquip;
      this.weaponMount.visible = true;
    }

    if (!this.weapon || !this.weaponMount.visible) {
      return;
    }

    if (drive.meleePresentationSeq !== this.lastMeleeSeq) {
      this.lastMeleeSeq = drive.meleePresentationSeq;
      const rangedCfg = fpFirearmShotVisualConfigForHeldItem(drive.equippedPrimary);
      if (!rangedCfg && getWeaponDefinitionForEquippedPrimary(drive.equippedPrimary)) {
        this.meleeElapsedS = 0;
      }
    }
    if (drive.firearmPresentationSeq !== this.lastFireSeq) {
      this.lastFireSeq = drive.firearmPresentationSeq;
      const cfg = fpFirearmShotVisualConfigForHeldItem(drive.equippedPrimary);
      if (cfg) {
        this.shotCfg = cfg;
        this.shotElapsedS = 0;
      }
    }

    const swingDef = getWeaponDefinitionForEquippedPrimary(drive.equippedPrimary);
    const swingDur =
      swingDef?.primitiveSwingDurationS && swingDef.primitiveSwingDurationS > 1e-6
        ? swingDef.primitiveSwingDurationS
        : 0.38;

    let meleePhase01 = 0;
    if (this.meleeElapsedS >= 0 && this.meleeElapsedS < swingDur) {
      meleePhase01 = this.meleeElapsedS / swingDur;
      this.meleeElapsedS += dt;
      if (this.meleeElapsedS >= swingDur) {
        this.meleeElapsedS = Number.POSITIVE_INFINITY;
      }
    }

    this.weapon.resetPose();
    if (meleePhase01 > 0) {
      this.weapon.updateMeleeSwing(meleePhase01);
    }

    if (this.shotCfg !== null && Number.isFinite(this.shotElapsedS) && this.shotElapsedS < this.shotCfg.durationS) {
      const sample = sampleFpFirearmShotVisual(this.shotCfg, this.shotElapsedS);
      this.weapon.root.position.x += sample.translationM.x;
      this.weapon.root.position.y += sample.translationM.y;
      this.weapon.root.position.z += sample.translationM.z;
      this.weapon.root.rotation.x += sample.rotationRad.x;
      this.weapon.root.rotation.y += sample.rotationRad.y;
      this.weapon.root.rotation.z += sample.rotationRad.z;
      if (sample.flashAlpha > 0) {
        this.flashRoot.visible = true;
        this.flashRoot.position.set(
          this.shotCfg.flashLocalPositionM.x,
          this.shotCfg.flashLocalPositionM.y,
          this.shotCfg.flashLocalPositionM.z,
        );
        this.flashRoot.scale.setScalar(sample.flashScaleM);
        (this.flashMesh.material as THREE.MeshBasicMaterial).opacity = sample.flashAlpha;
      } else {
        this.flashRoot.visible = false;
      }
      this.shotElapsedS += dt;
      if (this.shotElapsedS >= this.shotCfg.durationS) {
        this.shotCfg = null;
        this.shotElapsedS = Number.POSITIVE_INFINITY;
        this.flashRoot.visible = false;
        (this.flashMesh.material as THREE.MeshBasicMaterial).opacity = 0;
      }
    } else {
      this.flashRoot.visible = false;
      (this.flashMesh.material as THREE.MeshBasicMaterial).opacity = 0;
    }
  }
}

type BodyPose = {
  position: { x: number; y: number; z: number };
  yawRad: number;
  locomotion: ReplicatedPlayerSnapshot["locomotion"];
  grounded: boolean;
  displayName?: string;
};

export class WorldPlayerBodyPresenter {
  readonly root: THREE.Group;
  private readonly body: AnimatedRemotePlayerBody;
  private readonly highBranch: THREE.Group;
  private readonly lowBranch: THREE.Group;
  private readonly crowdLod: boolean;
  private readonly crowdSkinned: CrowdSkinnedPresenter | null;
  /** Present only when {@link crowdLod}; approximate hand socket on the low-LOD primitive. */
  private readonly primitiveRightHandWeaponSocket: THREE.Object3D | null;
  private readonly nameTag: THREE.Sprite | null = null;
  private readonly nameTagMaterial: THREE.SpriteMaterial | null = null;
  private nameTagText = "";

  constructor(
    scene: THREE.Scene,
    opts: { showNameTag: boolean; crowdLod: boolean; bodyUri?: string },
  ) {
    this.crowdLod = opts.crowdLod;
    this.root = new THREE.Group();
    this.root.name = "remote_player_world_root";

    this.highBranch = new THREE.Group();
    this.highBranch.name = "remote_player_high_lod_branch";

    const bodyTpl = getRemotePlayerBodyTemplate(opts.bodyUri ?? REMOTE_PLAYER_BODY_URI_MALE);
    this.body = new AnimatedRemotePlayerBody(bodyTpl);
    this.highBranch.add(this.body.root);

    this.lowBranch = new THREE.Group();
    this.lowBranch.name = "remote_player_low_lod_branch";
    let primitiveSocket: THREE.Object3D | null = null;
    if (opts.crowdLod) {
      const prim = buildPrimitiveHumanoid({
        sharedMaterials: { skin: remoteCrowdLodSkinMat, cloth: remoteCrowdLodClothMat },
        castShadow: false,
      });
      primitiveSocket = prim.handAttachRight;
      prim.root.name = "remote_player_primitive_body";
      prim.root.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.frustumCulled = true;
        }
      });
      this.lowBranch.add(prim.root);
    }
    this.primitiveRightHandWeaponSocket = primitiveSocket;

    this.root.add(this.highBranch);
    this.root.add(this.lowBranch);

    if (opts.showNameTag) {
      this.nameTagMaterial = new THREE.SpriteMaterial({
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        map: renderRemoteNameTagTexture("Guest"),
      });
      this.nameTag = new THREE.Sprite(this.nameTagMaterial);
      this.nameTag.name = "remote_player_name_tag";
      this.nameTag.position.set(0, REMOTE_NAME_TAG_Y_M, 0);
      this.nameTag.scale.set(REMOTE_NAME_TAG_WORLD_WIDTH_M, REMOTE_NAME_TAG_WORLD_HEIGHT_M, 1);
      this.nameTag.renderOrder = 2000;
      this.root.add(this.nameTag);
    }

    if (opts.crowdLod) {
      this.crowdSkinned = new CrowdSkinnedPresenter(
        this.highBranch,
        this.lowBranch,
        {
          freezeForLodLo: () => this.body.freezeForLodLo(),
          resumeAfterLodHi: () => this.body.resumeAfterLodHi(),
        },
        false,
      );
    } else {
      this.crowdSkinned = null;
      this.highBranch.visible = true;
      this.lowBranch.visible = false;
    }

    scene.add(this.root);
  }

  /**
   * When `crowdLod` is false (local mirror), this is a no-op — skinned body stays on.
   * Otherwise toggles skinned GLB vs shared primitive + freezes/resumes the animation mixer.
   */
  setDetailLevel(wantSkinnedGlb: boolean): void {
    if (!this.crowdLod) {
      this.highBranch.visible = true;
      this.lowBranch.visible = false;
      return;
    }
    this.crowdSkinned?.setDetailLevel(wantSkinnedGlb);
  }

  /**
   * Parent for {@link RemoteHeldWeaponPresentation}'s mount group: real hand bone when skinned body
   * is visible, primitive {@link buildPrimitiveHumanoid} socket at low LOD, else legacy float on feet root.
   */
  getThirdPersonWeaponMountHost(): { parent: THREE.Object3D; identityLocal: boolean } {
    if (
      this.crowdLod &&
      this.crowdSkinned &&
      !this.crowdSkinned.isHighDetailActive() &&
      this.primitiveRightHandWeaponSocket
    ) {
      return { parent: this.primitiveRightHandWeaponSocket, identityLocal: true };
    }
    if (!this.crowdLod || this.crowdSkinned?.isHighDetailActive()) {
      const bone = this.body.getSkinnedRightHandWeaponBone();
      if (bone) {
        return { parent: bone, identityLocal: true };
      }
    }
    return { parent: this.root, identityLocal: false };
  }

  private applyWorldFromPose(pose: BodyPose): void {
    this.root.position.set(pose.position.x, pose.position.y, pose.position.z);
    this.root.rotation.y = pose.yawRad + REMOTE_PLAYER_YAW_OFFSET_RAD;
  }

  updateFromPose(pose: BodyPose, dt: number): void {
    this.applyWorldFromPose(pose);
    if (!this.crowdLod || this.crowdSkinned?.isHighDetailActive()) {
      this.body.updateMotion({ grounded: pose.grounded, locomotion: pose.locomotion }, dt);
    }
    this.setNameTagText(pose.displayName ?? "Guest");
  }

  setVisible(visible: boolean): void {
    this.root.visible = visible;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.root);
    this.nameTagMaterial?.map?.dispose();
    this.nameTagMaterial?.dispose();
    this.body.dispose();
    if (this.crowdLod) {
      this.lowBranch.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
        }
      });
    }
  }

  private setNameTagText(displayName: string): void {
    if (!this.nameTagMaterial) return;
    const next = displayName.trim() || "Guest";
    if (next === this.nameTagText) return;
    this.nameTagText = next;
    const prev = this.nameTagMaterial.map;
    this.nameTagMaterial.map = renderRemoteNameTagTexture(next);
    this.nameTagMaterial.needsUpdate = true;
    prev?.dispose();
  }
}

export class RemotePlayerPresenter {
  readonly root: THREE.Group;
  private readonly presenter: WorldPlayerBodyPresenter;
  private readonly weaponFx: RemoteHeldWeaponPresentation;

  constructor(scene: THREE.Scene, modelRegistry: IModelLoadRegistry) {
    this.weaponFx = new RemoteHeldWeaponPresentation(modelRegistry);
    this.presenter = new WorldPlayerBodyPresenter(scene, { showNameTag: true, crowdLod: false });
    this.root = this.presenter.root;
  }

  /** @deprecated Crowd primitive LOD disabled — always full skinned GLB. */
  setRemoteCrowdDetail(_wantSkinnedGlb: boolean): void {
    this.presenter.setDetailLevel(true);
  }

  updateFromSnapshot(snap: ReplicatedPlayerSnapshot, dt: number, nowMs: number): void {
    void nowMs;
    this.presenter.updateFromPose(
      {
        position: snap.worldPosition,
        yawRad: snap.yawRad,
        locomotion: snap.locomotion,
        grounded: snap.grounded,
        displayName: snap.displayName,
      },
      dt,
    );
    this.weaponFx.syncWeaponPresentation(
      {
        equippedPrimary: snap.equippedPrimary,
        meleePresentationSeq: snap.meleePresentationSeq,
        firearmPresentationSeq: snap.firearmPresentationSeq,
      },
      dt,
      this.presenter,
    );
  }

  dispose(scene: THREE.Scene): void {
    this.weaponFx.dispose();
    this.presenter.dispose(scene);
  }
}

export class LocalMirrorPlayerPresenter {
  readonly root: THREE.Group;
  private readonly presenter: WorldPlayerBodyPresenter;
  private readonly weaponFx: RemoteHeldWeaponPresentation;
  private readonly mirrorPosition = new THREE.Vector3();

  constructor(scene: THREE.Scene, modelRegistry: IModelLoadRegistry, bodyUri?: string) {
    this.weaponFx = new RemoteHeldWeaponPresentation(modelRegistry);
    this.presenter = new WorldPlayerBodyPresenter(scene, {
      showNameTag: false,
      crowdLod: false,
      bodyUri,
    });
    this.root = this.presenter.root;
    this.presenter.setVisible(false);
  }

  updateFromLocalState(state: LocalPlayerGameplayState, dt: number): void {
    this.mirrorPosition.set(
      state.position.x - Math.sin(state.yawRad) * LOCAL_MIRROR_BODY_FORWARD_OFFSET_M,
      state.position.y - LOCAL_MIRROR_BODY_DOWN_OFFSET_M,
      state.position.z - Math.cos(state.yawRad) * LOCAL_MIRROR_BODY_FORWARD_OFFSET_M,
    );
    this.presenter.updateFromPose(
      {
        position: this.mirrorPosition,
        yawRad: state.yawRad,
        locomotion: state.locomotion,
        grounded: state.grounded,
      },
      dt,
    );
    this.weaponFx.syncWeaponPresentation(
      {
        equippedPrimary: state.equippedPrimary,
        meleePresentationSeq: state.meleeAttackSeq,
        firearmPresentationSeq: state.firearmShotSeq,
      },
      dt,
      this.presenter,
    );
  }

  setVisible(visible: boolean): void {
    this.presenter.setVisible(visible);
  }

  dispose(scene: THREE.Scene): void {
    this.weaponFx.dispose();
    this.presenter.dispose(scene);
  }
}
