import { AdditiveBlending, BufferGeometry, Float32BufferAttribute, Points, ShaderMaterial, Vector2, Vector3, Vector4, type Texture } from 'three';
import { kelvinToLinear } from '../colour.ts';
import type { Dust } from './data.ts';
import { CONE_DENSITY_GLSL, MAX_CONES, type VisibleCone } from './cones.ts';

/**
 * Dust in light: a few motes in a box around the camera that show only where a lamp cone lights
 * them, one points draw. Positions are a pure function of a fixed seed, the drift offset and the
 * camera, wrapped into the box, so the CPU never touches them: they hold still unless the offset
 * moves, and the offset only moves while a frame is being drawn anyway.
 */

/** Linear radiance of a mote at the brightest point of a cone of the reference opacity, before the profile's brightness. */
export const DUST_GAIN = 0.35;

/** The cone opacity at which a mote reaches `DUST_GAIN`; a brighter cone lights its dust more. */
export const DUST_REFERENCE_OPACITY = 0.1;

/** Metres of view distance past which a mote has faded out. */
export const DUST_FADE: readonly [number, number] = [9, 15];

/** A fixed pseudo-random sequence, so the same seed gives the same motes in every visit and test. */
export function seededSequence(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VERTEX = /* glsl */ `
${CONE_DENSITY_GLSL}

attribute vec4 seed;

uniform vec3 volume;
uniform vec3 offset;
uniform vec2 sizePx;
uniform float pixelRatio;
uniform float brightness;
uniform int coneCount;
uniform vec4 coneApex[MAX_CONES];   // apex, length
uniform vec4 coneAxis[MAX_CONES];   // axis, falloff
uniform vec4 coneColour[MAX_CONES]; // linear colour scaled by gain and opacity, edge
uniform float coneTan[MAX_CONES];
uniform vec4 coneGobo[MAX_CONES];

varying vec3 vColour;
varying float vViewDistance;
varying float vEdgeFade;

void main() {
	vec3 camera = cameraPosition;
	vec3 base = seed.xyz * volume + offset;
	vec3 point = mod(base - camera + 0.5 * volume, volume) - 0.5 * volume + camera;
	vec3 relative = (point - camera) / volume;
	vEdgeFade = 1.0 - smoothstep(0.38, 0.5, max(abs(relative.x), max(abs(relative.y), abs(relative.z))));
	vec3 lit = vec3(0.0);
	for (int i = 0; i < MAX_CONES; i++) {
		if (i >= coneCount) break;
		float density = coneDensity(point, coneApex[i].xyz, coneAxis[i].xyz, coneApex[i].w, coneTan[i], coneAxis[i].w, coneColour[i].w, coneGobo[i]);
		lit += coneColour[i].rgb * density;
	}
	vColour = lit * brightness;
	vec4 view = viewMatrix * vec4(point, 1.0);
	vViewDistance = -view.z;
	gl_Position = projectionMatrix * view;
	gl_PointSize = mix(sizePx.x, sizePx.y, seed.w) * pixelRatio;
}
`;

const FRAGMENT = /* glsl */ `
#include <packing>

uniform sampler2D depthMap;
uniform vec2 resolution;
uniform float cameraNear;
uniform float cameraFar;
uniform vec2 fade;

varying vec3 vColour;
varying float vViewDistance;
varying float vEdgeFade;

void main() {
	vec2 c = gl_PointCoord * 2.0 - 1.0;
	float dot2 = dot(c, c);
	if (dot2 > 1.0) discard;
	// A mote behind a surface is hidden; the scene's depth is the surface.
	float sceneDepth = texture2D(depthMap, gl_FragCoord.xy / resolution).r;
	float sceneDistance = -perspectiveDepthToViewZ(sceneDepth, cameraNear, cameraFar);
	if (sceneDistance < vViewDistance - 0.03) discard;
	float shape = 1.0 - smoothstep(0.1, 1.0, dot2);
	float distant = 1.0 - smoothstep(fade.x, fade.y, vViewDistance);
	gl_FragColor = vec4(vColour * shape * distant * vEdgeFade, 1.0);
}
`;

export interface DustCloud {
  readonly points: Points;
  readonly material: ShaderMaterial;
  /** Light the motes by the cones chosen this frame. */
  lightBy(cones: readonly VisibleCone[]): void;
  /** Apply a changed look (brightness, size, box) in place. The count is fixed at creation. */
  setLook(look: Pick<Dust, 'brightness' | 'sizePx' | 'volume'>): void;
  /** Move the motes: `x`, `y`, `z` are metres of drift since the start. */
  setOffset(x: number, y: number, z: number): void;
  setDepth(texture: Texture | null, cameraNear: number, cameraFar: number): void;
  setResolution(width: number, height: number, pixelRatio: number): void;
  dispose(): void;
}

export function createDust(dust: Dust): DustCloud {
  const random = seededSequence(0x5eed);
  const seeds = new Float32Array(dust.count * 4);
  for (let i = 0; i < seeds.length; i += 1) seeds[i] = random();
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(dust.count * 3), 3));
  geometry.setAttribute('seed', new Float32BufferAttribute(seeds, 4));

  const uniforms = {
    volume: { value: new Vector3(...dust.volume) },
    offset: { value: new Vector3() },
    sizePx: { value: new Vector2(dust.sizePx[0], dust.sizePx[1]) },
    pixelRatio: { value: 1 },
    brightness: { value: dust.brightness },
    coneCount: { value: 0 },
    coneApex: { value: Array.from({ length: MAX_CONES }, () => new Vector4()) },
    coneAxis: { value: Array.from({ length: MAX_CONES }, () => new Vector4()) },
    coneColour: { value: Array.from({ length: MAX_CONES }, () => new Vector4()) },
    coneTan: { value: new Array<number>(MAX_CONES).fill(0) },
    coneGobo: { value: Array.from({ length: MAX_CONES }, () => new Vector4()) },
    depthMap: { value: null as Texture | null },
    resolution: { value: new Vector2(1, 1) },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 100 },
    fade: { value: new Vector2(DUST_FADE[0], DUST_FADE[1]) },
  };
  const material = new ShaderMaterial({
    name: 'LookDust',
    defines: { MAX_CONES },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms,
    blending: AdditiveBlending,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  points.name = 'look-dust';

  return {
    points,
    material,
    lightBy(cones) {
      const chosen = cones.slice(0, MAX_CONES);
      chosen.forEach((cone, i) => {
        const [r, g, b] = kelvinToLinear(cone.spec.kelvin);
        const gain = DUST_GAIN * (cone.spec.opacity / DUST_REFERENCE_OPACITY);
        uniforms.coneApex.value[i]?.set(cone.apex[0], cone.apex[1], cone.apex[2], cone.spec.length);
        uniforms.coneAxis.value[i]?.set(cone.axis[0], cone.axis[1], cone.axis[2], cone.spec.falloff);
        uniforms.coneColour.value[i]?.set(r * gain, g * gain, b * gain, cone.spec.edge);
        uniforms.coneTan.value[i] = Math.tan((cone.spec.halfAngleDeg * Math.PI) / 180);
        const gobo = cone.spec.gobo;
        uniforms.coneGobo.value[i]?.set(gobo?.columns ?? 0, gobo?.rows ?? 0, gobo?.bar ?? 0, gobo?.soft ?? 0);
      });
      uniforms.coneCount.value = chosen.length;
    },
    setLook(look) {
      uniforms.brightness.value = look.brightness;
      uniforms.sizePx.value.set(look.sizePx[0], look.sizePx[1]);
      uniforms.volume.value.set(look.volume[0], look.volume[1], look.volume[2]);
    },
    setOffset(x, y, z) {
      uniforms.offset.value.set(x, y, z);
    },
    setDepth(texture, near, far) {
      uniforms.depthMap.value = texture;
      uniforms.cameraNear.value = near;
      uniforms.cameraFar.value = far;
    },
    setResolution(width, height, pixelRatio) {
      uniforms.resolution.value.set(width, height);
      uniforms.pixelRatio.value = pixelRatio;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
