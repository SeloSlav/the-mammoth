declare module "sky-cloud-3d" {
  import type { Camera, Mesh, Vector3 } from "three";
  export class SkyCloudMesh extends Mesh {
    isSkyCloudMesh: boolean;
    ready: Promise<SkyCloudMesh>;
    constructor(options?: Record<string, unknown>);
    updateSun(direction: Vector3): void;
    updateTime(time: number): void;
    updateResolution(width: number, height: number): void;
    updateCamera(camera: Camera): void;
    dispose(): void;
  }
}
