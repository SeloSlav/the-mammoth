import * as THREE from "three";
import type { IModelLoadRegistry, ModelRef } from "@the-mammoth/assets";
import type { HeldItemId, ReplicatedPlayerSnapshot } from "@the-mammoth/game";
import { buildPrimitiveHumanoid } from "../primitiveHumanoid.js";
import { getWeaponDefinition } from "../../weapons/weaponRegistry.js";
import { WeaponPresenter } from "../../weapons/WeaponPresenter.js";
import { TP_CROWBAR_GLTF_MAX_EDGE_M } from "../viewModelNormalize.js";

type GltfRef = Extract<ModelRef, { kind: "gltf" }>;

function asGltf(ref: ModelRef): GltfRef {
  if (ref.kind !== "gltf") throw new Error(`Expected gltf ModelRef, got ${ref.kind}`);
  return ref;
}

/**
 * Third-person-only body + held item visuals for other players.
 * TODO: swap `buildPrimitiveHumanoid` for `GltfCharacterInstance` + animation graph.
 */
export class RemotePlayerPresenter {
  readonly root: THREE.Group;
  private humanoid: ReturnType<typeof buildPrimitiveHumanoid>;
  private weapon?: WeaponPresenter;
  private equippedPrimary: HeldItemId = "unarmed";
  private readonly modelRegistry: IModelLoadRegistry;

  constructor(scene: THREE.Scene, tint: number, modelRegistry: IModelLoadRegistry) {
    this.modelRegistry = modelRegistry;
    this.root = new THREE.Group();
    this.root.name = "remote_player_body";
    this.humanoid = buildPrimitiveHumanoid({ tint });
    this.root.add(this.humanoid.root);
    scene.add(this.root);
    this.syncWeapon("unarmed");
  }

  private syncWeapon(equipped: ReplicatedPlayerSnapshot["equippedPrimary"]): void {
    if (equipped === this.equippedPrimary && (equipped === "unarmed" || this.weapon)) return;
    this.equippedPrimary = equipped;
    this.weapon?.dispose(this.humanoid.handAttachRight);
    this.weapon = undefined;
    if (equipped === "unarmed") return;

    const def = getWeaponDefinition(equipped);
    if (!def) {
      console.warn(`[RemotePlayerPresenter] no definition for equipped id "${equipped}"`);
      return;
    }
    const res = this.modelRegistry.instantiateLoaded(asGltf(def.modelRef));
    if (!res.ok) {
      console.error(`[RemotePlayerPresenter] weapon GLB (${def.id}): ${res.error}`);
      return;
    }
    this.weapon = new WeaponPresenter({
      definition: def,
      role: "remote_third_person",
      visual: res.root as THREE.Object3D,
    });
    this.weapon.normalizeVisualToMaxEdgeMeters(TP_CROWBAR_GLTF_MAX_EDGE_M);
    this.humanoid.handAttachRight.add(this.weapon.root);
  }

  updateFromSnapshot(snap: ReplicatedPlayerSnapshot, dt: number, nowMs: number): void {
    void nowMs;
    void dt;
    this.syncWeapon(snap.equippedPrimary);
    const { x, y, z } = snap.worldPosition;
    this.root.position.set(x, y, z);
    this.root.rotation.y = snap.yawRad;
    if (this.weapon) {
      // TODO: drive from replicated action bits / animation state when server exposes them.
      this.weapon.resetPose();
    }
  }

  dispose(scene: THREE.Scene): void {
    this.weapon?.dispose(this.humanoid.handAttachRight);
    this.weapon = undefined;
    scene.remove(this.root);
    this.humanoid.root.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        const mat = m.material;
        if (!Array.isArray(mat)) mat.dispose();
        else mat.forEach((x) => x.dispose());
      }
    });
  }
}
