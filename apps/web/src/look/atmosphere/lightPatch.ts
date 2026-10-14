import { BlendFunction, Effect, EffectAttribute } from 'postprocessing';
import { Matrix4, Uniform, Vector4, type Camera } from 'three';
import { kelvinToLinear } from '../colour.ts';
import { CONE_DENSITY_GLSL, coneDensity, type VisibleCone } from './cones.ts';

/**
 * The light a shaft puts on the surfaces it reaches: a pool on the desk under a lamp with a hard-ish
 * edge at the shade's rim, a window's panes laid across the floor and the wall. Every pool of light
 * in a frame then has a visible source and a shape, instead of an even wash.
 *
 * It is an effect on the HDR frame that reads the scene's depth, rebuilds where each pixel is in
 * the world, asks the same density function the cones and the dust use whether that point is in a
 * shaft, and brightens the surface by that fraction of what it already shows, tinted by the lamp.
 * It draws no geometry: the surface keeps its own colour and the lamp only adds to it. A surface
 * turned away from the lamp takes little of it: the facing comes from the depth's own derivatives
 * (no normal buffer), and where those jump, at a silhouette, the surface is taken as facing the lamp
 * rather than guessed at. Shafts whose `patch` is 0 are not in it at all.
 */

/** Shafts the effect holds; if more carry light, the strongest are used. */
export const MAX_PATCHES = 4;

/** How much a surface brightens, as a multiple of what it shows, where a patch is at full strength. */
export const PATCH_GAIN = 1;

/**
 * Linear light a patch adds to a surface whatever it shows, at full strength, so a dark floor or a
 * dark desk top still catches a bar of light: the multiple above alone would show nothing on a
 * surface that is near black.
 */
export const PATCH_FLOOR = 0.2;

/**
 * How a surface's facing scales the light it takes: `floor` of it when it faces directly away from
 * the lamp, all of it by the time the angle between the surface normal and the lamp is under about
 * 66 degrees (`ramp` is the cosine at which it is full). Neighbouring pixels further apart than
 * `edge` of their distance from the eye are a silhouette, not one surface, and take the full light.
 */
export const PATCH_FACING = { floor: 0.15, ramp: 0.4, edge: 0.03 } as const;

const FRAGMENT = /* glsl */ `
${CONE_DENSITY_GLSL}

float patchFacing(vec3 normal, vec3 toLight) {
	return mix(${PATCH_FACING.floor.toFixed(4)}, 1.0, smoothstep(0.0, ${PATCH_FACING.ramp.toFixed(4)}, dot(normal, toLight)));
}

uniform float patchFloor;
uniform mat4 projectionInverse;
uniform mat4 cameraWorld;
uniform int patchCount;
uniform vec4 patchApex[MAX_PATCHES];   // apex, length
uniform vec4 patchAxis[MAX_PATCHES];   // axis, tan(half angle)
uniform vec4 patchColour[MAX_PATCHES]; // linear tint times strength, falloff
uniform vec4 patchGobo[MAX_PATCHES];   // columns, rows, bar, soft
uniform float patchEdge[MAX_PATCHES];

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
	vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
	vec4 view = projectionInverse * clip;
	vec3 point = (cameraWorld * vec4(view.xyz / view.w, 1.0)).xyz;
	// Derivatives need every pixel in the quad to reach them, so they come before any early return.
	vec3 dx = dFdx(point);
	vec3 dy = dFdy(point);
	if (depth >= 1.0 || patchCount == 0) {
		outputColor = inputColor;
		return;
	}
	vec3 eye = cameraWorld[3].xyz;
	float distanceToEye = length(point - eye);
	vec3 normal = cross(dx, dy);
	bool surface = max(length(dx), length(dy)) < ${PATCH_FACING.edge.toFixed(4)} * distanceToEye && dot(normal, normal) > 1e-20;
	if (surface) {
		normal = normalize(normal);
		if (dot(normal, eye - point) < 0.0) normal = -normal;
	}
	vec3 lit = vec3(0.0);
	for (int i = 0; i < MAX_PATCHES; i++) {
		if (i >= patchCount) break;
		float density = coneDensity(point, patchApex[i].xyz, patchAxis[i].xyz, patchApex[i].w, patchAxis[i].w, patchColour[i].w, patchEdge[i], patchGobo[i]);
		float facing = surface ? patchFacing(normal, normalize(patchApex[i].xyz - point)) : 1.0;
		lit += patchColour[i].rgb * (density * facing);
	}
	outputColor = vec4(inputColor.rgb * (1.0 + lit) + lit * patchFloor, inputColor.a);
}
`;

function createUniforms() {
  return {
    projectionInverse: new Uniform(new Matrix4()),
    cameraWorld: new Uniform(new Matrix4()),
    patchCount: new Uniform(0),
    patchFloor: new Uniform(PATCH_FLOOR),
    patchApex: new Uniform(Array.from({ length: MAX_PATCHES }, () => new Vector4())),
    patchAxis: new Uniform(Array.from({ length: MAX_PATCHES }, () => new Vector4())),
    patchColour: new Uniform(Array.from({ length: MAX_PATCHES }, () => new Vector4())),
    patchGobo: new Uniform(Array.from({ length: MAX_PATCHES }, () => new Vector4())),
    patchEdge: new Uniform(new Array<number>(MAX_PATCHES).fill(0)),
  };
}

/** Where the cones chosen this frame are read from: the atmosphere pass. */
export interface PatchSource {
  readonly lastChosen: readonly VisibleCone[];
}

/**
 * How much a surface at `point` brightens under one shaft, as a fraction of what it shows: the
 * shaft's density at that point times its `patch` strength and the gain, and, given the surface's
 * unit normal, its facing. The effect's shader evaluates the same, summed over the shafts, and adds
 * `PATCH_FLOOR` of it as light of its own.
 */
export function patchBoost(cone: VisibleCone, point: readonly [number, number, number], normal?: readonly [number, number, number]): number {
  const density = coneDensity(cone.spec, cone.apex, cone.axis, point) * cone.spec.patch * PATCH_GAIN;
  if (!normal) return density;
  const toLight = [cone.apex[0] - point[0], cone.apex[1] - point[1], cone.apex[2] - point[2]] as const;
  const length = Math.hypot(toLight[0], toLight[1], toLight[2]) || 1;
  return density * patchFacing((normal[0] * toLight[0] + normal[1] * toLight[1] + normal[2] * toLight[2]) / length);
}

/** How much of a lamp's light a surface takes, from the cosine between its normal and the direction to the lamp. */
export function patchFacing(cosine: number): number {
  const t = Math.min(1, Math.max(0, cosine / PATCH_FACING.ramp));
  return PATCH_FACING.floor + (1 - PATCH_FACING.floor) * (t * t * (3 - 2 * t));
}

/** The shafts that carry light, strongest first (ties keep the order they came in), no more than the effect holds. */
export function strongest(cones: readonly VisibleCone[]): VisibleCone[] {
  return cones
    .map((cone, index) => ({ cone, index }))
    .filter(({ cone }) => cone.spec.patch > 0)
    .sort((a, b) => b.cone.spec.patch - a.cone.spec.patch || a.index - b.index)
    .slice(0, MAX_PATCHES)
    .map(({ cone }) => cone);
}

export class LightPatchEffect extends Effect {
  private camera: Camera | null = null;
  private source: PatchSource | null = null;
  private readonly u: ReturnType<typeof createUniforms>;

  constructor() {
    const u = createUniforms();
    super('LookLightPatchEffect', FRAGMENT, {
      attributes: EffectAttribute.DEPTH,
      blendFunction: BlendFunction.SRC,
      defines: new Map<string, string>([['MAX_PATCHES', String(MAX_PATCHES)]]),
      uniforms: new Map<string, Uniform>(Object.entries(u)),
    });
    this.u = u;
  }

  /** Read the shafts from this source each frame. */
  setSource(source: PatchSource | null): void {
    this.source = source;
  }

  override set mainCamera(camera: Camera) {
    this.camera = camera;
  }

  /** Fill the uniforms from the shafts that carry light. Exposed so a test can read what a frame would use. */
  load(cones: readonly VisibleCone[]): number {
    const lit = strongest(cones);
    lit.forEach((cone, i) => {
      const [r, g, b] = kelvinToLinear(cone.spec.kelvin);
      const strength = cone.spec.patch * PATCH_GAIN;
      this.u.patchApex.value[i]?.set(cone.apex[0], cone.apex[1], cone.apex[2], cone.spec.length);
      this.u.patchAxis.value[i]?.set(cone.axis[0], cone.axis[1], cone.axis[2], Math.tan((cone.spec.halfAngleDeg * Math.PI) / 180));
      this.u.patchColour.value[i]?.set(r * strength, g * strength, b * strength, cone.spec.falloff);
      const gobo = cone.spec.gobo;
      this.u.patchGobo.value[i]?.set(gobo?.columns ?? 0, gobo?.rows ?? 0, gobo?.bar ?? 0, gobo?.soft ?? 0);
      this.u.patchEdge.value[i] = cone.spec.edge;
    });
    this.u.patchCount.value = lit.length;
    return lit.length;
  }

  override update(): void {
    const camera = this.camera;
    if (!camera) return;
    camera.updateMatrixWorld();
    this.u.projectionInverse.value.copy(camera.projectionMatrixInverse);
    this.u.cameraWorld.value.copy(camera.matrixWorld);
    this.load(this.source?.lastChosen ?? []);
  }
}
