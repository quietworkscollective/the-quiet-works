import { BlendFunction, Effect, EffectAttribute } from 'postprocessing';
import { Matrix4, Uniform, Vector3, Vector4, type Camera } from 'three';
import type { FarGlow, HeightFogLayer, Haze } from './data.ts';
import { hexToSrgb, srgbToLinear, type Rgb } from '../colour.ts';

/**
 * Height-fog layers as a screen-space effect on the HDR frame. Each layer is smoke whose density
 * falls off exponentially with height; the effect reads the scene's depth, rebuilds where each
 * pixel is in the world, and integrates every layer along the ray from the eye to that point in
 * closed form. It draws nothing into the scene, so it cannot disagree with how any material is
 * shaded, and it sits on top of whatever fog the space already has: the corridor's distance fog
 * (corridor/world/shader.ts) is left alone, this adds the vertical layering the distance fog
 * cannot express.
 *
 * The slow haze is the same smoke with its density varied by a fixed noise that drifts only when a
 * frame is being drawn anyway.
 */

/** Layers the shader holds; a space with fewer pads with empty ones. */
export const MAX_FOG_LAYERS = 4;

/**
 * Optical depth of one layer along the ray from `eye` to `point`, in closed form. The layer's
 * density is `density * exp(-s * (y - layer.y) / scaleHeight)`, with `s` +1 where the layer thins
 * upward and -1 where it thins downward, and the integral is the same expression the shader
 * evaluates.
 */
export function layerOpticalDepth(layer: HeightFogLayer, eye: readonly [number, number, number], point: readonly [number, number, number]): number {
  const dx = point[0] - eye[0];
  const dy = point[1] - eye[1];
  const dz = point[2] - eye[2];
  const length = Math.hypot(dx, dy, dz);
  if (length === 0) return 0;
  const s = layer.thins === 'up' ? 1 : -1;
  const a = (s * dy) / (layer.scaleHeight * length);
  const along = Math.abs(a * length) < 1e-3 ? length : (1 - Math.exp(-a * length)) / a;
  return layer.density * Math.exp((-s * (eye[1] - layer.y)) / layer.scaleHeight) * along;
}

/** Linear colour of a `#rrggbb` colour. */
export function linearColour(hex: string): Rgb {
  const [r, g, b] = hexToSrgb(hex);
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
}

/** Linear colour of a layer. */
export const layerColour = (layer: HeightFogLayer): Rgb => linearColour(layer.colour);

/**
 * How much of the far glow's light is added to a surface `distance` metres from the eye: nothing
 * up to `from`, rising smoothly to `strength` at `to`. The shader does the same, per pixel.
 */
export function farGlowAmount(glow: FarGlow, distance: number): number {
  const t = Math.min(1, Math.max(0, (distance - glow.from) / (glow.to - glow.from)));
  return glow.strength * t * t * (3 - 2 * t);
}

const FRAGMENT = /* glsl */ `
uniform mat4 projectionInverse;
uniform mat4 cameraWorld;
uniform vec3 eye;
uniform vec4 layers[LAYERS];
uniform vec3 colours[LAYERS];
uniform vec4 haze;
uniform vec3 hazeOffset;
uniform vec4 farGlow;
uniform vec3 farColour;

float hash31(vec3 p) {
	p = fract(p * 0.1031);
	p += dot(p, p.zyx + 31.32);
	return fract((p.x + p.y) * p.z);
}

float valueNoise(vec3 x) {
	vec3 i = floor(x);
	vec3 f = fract(x);
	f = f * f * (3.0 - 2.0 * f);
	return mix(
		mix(mix(hash31(i), hash31(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
		mix(mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
		f.z);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
	// Nothing was drawn here: the background already is the fog colour.
	if (depth >= 1.0) {
		outputColor = inputColor;
		return;
	}
	vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
	vec4 view = projectionInverse * clip;
	vec3 point = (cameraWorld * vec4(view.xyz / view.w, 1.0)).xyz;
	vec3 ray = point - eye;
	float rayLength = length(ray);
	// Patches of denser and thinner air, sampled once at the middle of the ray.
	float patches = 1.0 + haze.x * (valueNoise((eye + 0.5 * ray) * haze.y + hazeOffset) * 2.0 - 1.0);
	vec3 colour = inputColor.rgb;
	for (int i = 0; i < LAYERS; i++) {
		vec4 layer = layers[i];
		if (layer.w <= 0.0) continue;
		float a = layer.y * ray.y / (layer.z * rayLength);
		float along = abs(a * rayLength) < 0.001 ? rayLength : (1.0 - exp(-a * rayLength)) / a;
		float opticalDepth = layer.w * exp(-layer.y * (eye.y - layer.x) / layer.z) * along * patches;
		colour = mix(colours[i], colour, exp(-opticalDepth));
	}
	// Warm light added far away, so the end of a long room is lit and legible, never a void. It is
	// added, not mixed, so the detail that is still there keeps its contrast.
	colour += farColour * (farGlow.z * smoothstep(farGlow.x, farGlow.y, rayLength));
	outputColor = vec4(colour, inputColor.a);
}
`;

export interface HeightFogOptions {
  readonly layers: readonly HeightFogLayer[];
  readonly haze: Haze;
  readonly farGlow: FarGlow;
}

/**
 * The height-fog effect. It needs the scene's depth (the composer provides it) and the camera,
 * which the pass hands over; `drift` is the distance the haze has moved, set by the stack per
 * authorised frame.
 */
function createUniforms() {
  return {
    projectionInverse: new Uniform(new Matrix4()),
    cameraWorld: new Uniform(new Matrix4()),
    eye: new Uniform(new Vector3()),
    layers: new Uniform(Array.from({ length: MAX_FOG_LAYERS }, () => new Vector4())),
    colours: new Uniform(Array.from({ length: MAX_FOG_LAYERS }, () => new Vector3())),
    haze: new Uniform(new Vector4()),
    hazeOffset: new Uniform(new Vector3()),
    farGlow: new Uniform(new Vector4()),
    farColour: new Uniform(new Vector3()),
  };
}

export class HeightFogEffect extends Effect {
  private camera: Camera | null = null;
  private readonly eye = new Vector3();
  private readonly u: ReturnType<typeof createUniforms>;

  constructor(options: HeightFogOptions) {
    const u = createUniforms();
    super('LookHeightFogEffect', FRAGMENT, {
      attributes: EffectAttribute.DEPTH,
      blendFunction: BlendFunction.SRC,
      defines: new Map<string, string>([['LAYERS', String(MAX_FOG_LAYERS)]]),
      uniforms: new Map<string, Uniform>(Object.entries(u)),
    });
    this.u = u;
    this.setAir(options.layers, options.haze, options.farGlow);
  }

  /** Replace the layers, the haze and the far glow; takes effect on the next frame, with no recompile. */
  setAir(layers: readonly HeightFogLayer[], haze: Haze, farGlow: FarGlow): void {
    const slots = this.u.layers.value;
    const colours = this.u.colours.value;
    for (let i = 0; i < MAX_FOG_LAYERS; i += 1) {
      const layer = layers[i];
      if (layer) {
        const [r, g, b] = layerColour(layer);
        slots[i]?.set(layer.y, layer.thins === 'up' ? 1 : -1, layer.scaleHeight, layer.density);
        colours[i]?.set(r, g, b);
      } else {
        slots[i]?.set(0, 1, 1, 0);
        colours[i]?.set(0, 0, 0);
      }
    }
    this.u.haze.value.set(haze.amplitude, 1 / haze.scale, 0, 0);
    this.u.farGlow.value.set(farGlow.from, farGlow.to, farGlow.strength, 0);
    const [r, g, b] = linearColour(farGlow.colour);
    this.u.farColour.value.set(r, g, b);
  }

  /** Where the haze has drifted to, in metres along each axis. */
  setHazeOffset(x: number, y: number, z: number): void {
    this.u.hazeOffset.value.set(x, y, z);
  }

  override set mainCamera(camera: Camera) {
    this.camera = camera;
  }

  override update(): void {
    const camera = this.camera;
    if (!camera) return;
    camera.updateMatrixWorld();
    this.u.projectionInverse.value.copy(camera.projectionMatrixInverse);
    this.u.cameraWorld.value.copy(camera.matrixWorld);
    this.eye.setFromMatrixPosition(camera.matrixWorld);
    this.u.eye.value.copy(this.eye);
  }
}
