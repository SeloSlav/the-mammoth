import * as THREE from "three";
import type { ApartmentSittableSpec } from "@the-mammoth/schemas";
import {
  apartmentSittableLateralSeatCount,
  apartmentSittableLateralSeatLocalX,
  computeDecorGroupLocalBounds,
} from "./fpApartmentSittableSeat.js";

export type ApartmentSittableWorldPose = {
  feetX: number;
  feetY: number;
  feetZ: number;
  bodyYawRad: number;
  eyeHeightM: number;
  defaultPitchRad: number;
  mode: ApartmentSittableSpec["mode"];
};

const _localSeat = new THREE.Vector3();
const _worldSeat = new THREE.Vector3();
const _worldForward = new THREE.Vector3();
const _boundsScratch = new THREE.Box3();
const _sizeScratch = new THREE.Vector3();

/**
 * World feet anchor and body yaw for a decor/furniture group from a sittable spec.
 * Seat XZ use the prop world AABB center; `localSeatOffset.y` is height above AABB floor.
 * Local +Z is the seat forward axis (matches practical-light / TV convention).
 */
export function computeApartmentSittableWorldPose(
  group: THREE.Object3D,
  spec: ApartmentSittableSpec,
  seatIndex = 0,
): ApartmentSittableWorldPose {
  group.updateMatrixWorld(true);
  const seatCount = apartmentSittableLateralSeatCount(spec);
  if (seatCount > 1) {
    computeDecorGroupLocalBounds(group, _boundsScratch);
    const seatLocalX = apartmentSittableLateralSeatLocalX(_boundsScratch, seatIndex, seatCount);
    const seatLocalZ = (_boundsScratch.min.z + _boundsScratch.max.z) * 0.5;
    _localSeat.set(
      seatLocalX + spec.localSeatOffset.x,
      _boundsScratch.min.y + spec.localSeatOffset.y,
      seatLocalZ + spec.localSeatOffset.z,
    );
    group.localToWorld(_localSeat);
    _worldSeat.copy(_localSeat);
  } else {
    _boundsScratch.setFromObject(group);
    _boundsScratch.getSize(_sizeScratch);
    if (_sizeScratch.lengthSq() < 1e-6) {
      _localSeat.set(
        spec.localSeatOffset.x,
        spec.localSeatOffset.y,
        spec.localSeatOffset.z,
      );
      group.localToWorld(_localSeat);
      _worldSeat.copy(_localSeat);
    } else {
      _boundsScratch.getCenter(_worldSeat);
      _worldSeat.y = _boundsScratch.min.y + spec.localSeatOffset.y;
    }
  }

  group.getWorldQuaternion(_worldQuatScratch);
  _worldForward.set(0, 0, 1).applyQuaternion(_worldQuatScratch);
  _worldForward.y = 0;
  if (_worldForward.lengthSq() < 1e-8) {
    _worldForward.set(0, 0, 1);
  } else {
    _worldForward.normalize();
  }

  const bodyYawRad =
    Math.atan2(_worldForward.x, _worldForward.z) + spec.bodyYawOffsetRad;

  return {
    feetX: _worldSeat.x,
    feetY: _worldSeat.y,
    feetZ: _worldSeat.z,
    bodyYawRad,
    eyeHeightM: spec.eyeHeightM,
    defaultPitchRad: spec.defaultPitchRad,
    mode: spec.mode,
  };
}

const _worldQuatScratch = new THREE.Quaternion();
