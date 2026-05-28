// TSL node graphs use runtime types that @types/three does not model precisely.
// @ts-nocheck
import { TempNode } from "three/webgpu";
import {
  Fn,
  abs,
  clamp,
  convertToTexture,
  float,
  floor,
  luminance,
  max,
  mix,
  nodeObject,
  pow,
  smoothstep,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  screenSize,
} from "three/tsl";

export type MammothToonPostProcessOptions = {
  /** Posterize bands (≥2). Default 4. */
  levels?: number;
  /** Blend stylized grade over source (0–1). Default 0.88. */
  stylizeMix?: number;
  /** Darkest band floor (display-referred). Default 0.2. */
  shadowFloor?: number;
  /** Minimum retained fraction of source RGB. Default 0.76. */
  minSourceFraction?: number;
  /** Ink outline strength on lit edges. Default 0.42. */
  edgeStrength?: number;
  /** Edge sensitivity — higher = fewer lines. Default 0.16. */
  edgeThreshold?: number;
};

/**
 * Screen-space cel grade on the tonemapped beauty pass.
 * Visible banding + soft outlines; output never darker than `minSourceFraction` of source.
 */
class MammothToonPostProcessNode extends TempNode {
  static get type() {
    return "MammothToonPostProcessNode";
  }

  constructor(textureNode: ReturnType<typeof convertToTexture>, options: MammothToonPostProcessOptions = {}) {
    super("vec4");

    this.textureNode = textureNode;
    this.levels = uniform(options.levels ?? 4);
    this.stylizeMix = uniform(options.stylizeMix ?? 0.88);
    this.shadowFloor = uniform(options.shadowFloor ?? 0.2);
    this.minSourceFraction = uniform(options.minSourceFraction ?? 0.76);
    this.edgeStrength = uniform(options.edgeStrength ?? 0.42);
    this.edgeThreshold = uniform(options.edgeThreshold ?? 0.16);
  }

  textureNode: ReturnType<typeof convertToTexture>;
  levels: ReturnType<typeof uniform>;
  stylizeMix: ReturnType<typeof uniform>;
  shadowFloor: ReturnType<typeof uniform>;
  minSourceFraction: ReturnType<typeof uniform>;
  edgeStrength: ReturnType<typeof uniform>;
  edgeThreshold: ReturnType<typeof uniform>;

  setup() {
    const textureNode = this.textureNode;
    const levels = this.levels;
    const stylizeMix = this.stylizeMix;
    const shadowFloor = this.shadowFloor;
    const minSourceFraction = this.minSourceFraction;
    const edgeStrength = this.edgeStrength;
    const edgeThreshold = this.edgeThreshold;

    const toonPass = Fn(() => {
      const uvCoord = uv();
      const color = textureNode.sample(uvCoord);
      const original = color.rgb;

      const lum = luminance(original);
      const lumP = pow(max(lum, float(0.001)), float(0.55));
      const bandMax = max(levels.sub(1), float(1));
      const band = max(floor(lumP.mul(bandMax)).div(bandMax), shadowFloor);

      const safeLum = max(lum, float(0.001));
      const ratio = clamp(band.div(safeLum), float(0.52), float(1.32));
      let stylized = original.mul(ratio);

      const texel = vec2(1).div(screenSize);
      const lumLeft = luminance(textureNode.sample(uvCoord.sub(vec2(texel.x, 0))).rgb);
      const lumRight = luminance(textureNode.sample(uvCoord.add(vec2(texel.x, 0))).rgb);
      const lumUp = luminance(textureNode.sample(uvCoord.sub(vec2(0, texel.y))).rgb);
      const lumDown = luminance(textureNode.sample(uvCoord.add(vec2(0, texel.y))).rgb);
      const gx = lumRight.sub(lumLeft);
      const gy = lumDown.sub(lumUp);
      const edge = smoothstep(float(0), edgeThreshold, abs(gx).add(abs(gy)).mul(0.5));
      const edgeMask = smoothstep(float(0.07), float(0.22), lum);
      const ink = vec3(0.06, 0.055, 0.075);
      stylized = mix(stylized, ink, edge.mul(edgeStrength).mul(edgeMask));

      const graded = mix(original, stylized, stylizeMix);
      const playable = max(graded, original.mul(minSourceFraction));

      return vec4(playable, color.a);
    });

    return toonPass();
  }
}

export function mammothToonPostProcess(
  colorNode: unknown,
  options?: MammothToonPostProcessOptions,
): MammothToonPostProcessNode {
  return new MammothToonPostProcessNode(convertToTexture(nodeObject(colorNode)), options);
}
