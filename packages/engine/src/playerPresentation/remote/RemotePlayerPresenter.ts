import * as THREE from "three";
import type { ReplicatedPlayerSnapshot } from "@the-mammoth/game";
import { buildPrimitiveHumanoid } from "../primitiveHumanoid.js";
import { crowbarWeaponDefinition } from "../../weapons/sampleDefinitions.js";
import { WeaponPresenter } from "../../weapons/WeaponPresenter.js";

/**
 * Third-person-only body + held item visuals for other players.
 * TODO: swap `buildPrimitiveHumanoid` for `GltfCharacterInstance` + animation graph.
 */
export class RemotePlayerPresenter {
  readonly root: THREE.Group;
  private humanoid: ReturnType<typeof buildPrimitiveHumanoid>;
  private weapon?: WeaponPresenter;

  constructor(scene: THREE.Scene, tint: number) {
    this.root = new THREE.Group();
    this.root.name = "remote_player_body";
    this.humanoid = buildPrimitiveHumanoid({ tint });
    this.root.add(this.humanoid.root);
    scene.add(this.root);
    this.syncWeapon("crowbar");
  }

  private syncWeapon(equipped: ReplicatedPlayerSnapshot["equippedPrimary"]): void {
    if (equipped === "unarmed") {
      this.weapon?.dispose(this.humanoid.handAttachRight);
      this.weapon = undefined;
      return;
    }
    if (this.weapon) return;
    this.weapon = new WeaponPresenter({
      definition: crowbarWeaponDefinition,
      role: "remote_third_person",
      color: 0x7c8aa0,
    });
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
