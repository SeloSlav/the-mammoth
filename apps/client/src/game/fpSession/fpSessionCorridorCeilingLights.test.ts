import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  createCorridorCeilingLightProxyVisualForTests,
  MAMMOTH_CORRIDOR_CEILING_LIGHT_PROXY_UD,
  syncFpFloor19CorridorCeilingLightVisibility,
} from "./fpSessionCorridorCeilingLights";

describe("syncFpFloor19CorridorCeilingLightVisibility", () => {
  it("shows corridor proxies only in shared circulation spaces", () => {
    const root = new THREE.Group();
    syncFpFloor19CorridorCeilingLightVisibility(root, {
      insideResidentialUnit: false,
      insideApartmentInteriorLightingZone: true,
    });
    expect(root.visible).toBe(true);

    syncFpFloor19CorridorCeilingLightVisibility(root, {
      insideResidentialUnit: true,
      insideApartmentInteriorLightingZone: true,
    });
    expect(root.visible).toBe(false);

    syncFpFloor19CorridorCeilingLightVisibility(root, {
      insideResidentialUnit: false,
      insideApartmentInteriorLightingZone: false,
    });
    expect(root.visible).toBe(false);
  });

  it("no-ops on a missing root", () => {
    expect(() =>
      syncFpFloor19CorridorCeilingLightVisibility(null, {
        insideResidentialUnit: false,
        insideApartmentInteriorLightingZone: true,
      }),
    ).not.toThrow();
  });
});

describe("MAMMOTH_CORRIDOR_CEILING_LIGHT_PROXY_UD", () => {
  it("tags corridor ceiling proxies separately from apartment decor props", () => {
    expect(MAMMOTH_CORRIDOR_CEILING_LIGHT_PROXY_UD).toBe("mammothCorridorCeilingLightProxy");
  });
});

describe("createCorridorCeilingLightProxyVisualForTests", () => {
  it("includes a hot white hanging bulb read like light-ceiling-2", () => {
    const visual = createCorridorCeilingLightProxyVisualForTests();
    const bulbObj = visual.getObjectByName("fp_corridor_ceiling_bulb");
    expect(bulbObj).toBeInstanceOf(THREE.Mesh);
    if (!(bulbObj instanceof THREE.Mesh)) return;
    const mat = bulbObj.material;
    expect(mat).toBeInstanceOf(THREE.MeshStandardMaterial);
    if (!(mat instanceof THREE.MeshStandardMaterial)) return;
    expect(mat.toneMapped).toBe(false);
    expect(mat.emissiveIntensity).toBeGreaterThan(4);
    expect(bulbObj.position.y).toBeLessThan(-0.2);
  });
});
