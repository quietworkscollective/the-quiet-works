import {
  AdditiveBlending,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  ShaderMaterial,
  Vector2,
  type Texture,
} from 'three';
import { kelvinToLinear } from '../colour.ts';
import type { GoboSpec, LightConeSpec } from './data.ts';
import { CONE_TRIANGLES } from './data.ts';
import { NOISE_GLSL } from './noise.ts';
import type { Vec3 } from '../environment/layout.ts';

/**
 * Lamp cones: a faked shaft of light under each lamp, with no shadow map and no ray march. Each is
 * a low-poly open cone, all of them one instanced draw, shaded additively. The shell is brighter
 * where it faces the eye and nearer the lamp, broken up by a fixed noise, and faded where it meets
 * a surface by comparing its own depth with the scene's, so it never cuts a hard line across a
 * wall or a floor. The dust is lit by the same shafts (see dust.ts); the density function here is
 * the one both use.
 */

/** Linear radiance a cone adds at an opacity of 1, before the profile's opacity scales it. */
export const CONE_GAIN = 3.4;

/** The most cones a frame draws; a profile's `maxVisible` is clamped to this. */
export const MAX_CONES = 12;

/** Metres over which a cone fades out where it meets a surface. */
export const CONE_SOFTNESS = 0.4;

/** Metres of view distance over which a cone fades in, so walking into one never pops. */
export const CONE_NEAR_FADE: readonly [number, number] = [0.15, 0.9];

const smoothstep = (lo: number, hi: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};

/**
 * The two axes across a shaft, from its direction alone: the same construction the shaders use, so
 * a pattern drawn across the shaft lines up between the shell, the dust and the surfaces.
 */
export function coneFrame(axis: Vec3): { right: Vec3; other: Vec3 } {
  const up: Vec3 = Math.abs(axis[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0];
  const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const r = cross(up, axis);
  const n = Math.hypot(r[0], r[1], r[2]) || 1;
  const right: Vec3 = [r[0] / n, r[1] / n, r[2] / n];
  return { right, other: cross(axis, right) };
}

/**
 * The bars of a frame at a point `q` across the shaft, each axis from -1 to 1: 1 inside a pane, 0 in
 * a bar, soft between. No frame is always 1. The shader's `goboMask` is this function.
 */
export function goboMask(q: readonly [number, number], gobo: GoboSpec | undefined): number {
  if (!gobo) return 1;
  const axisMask = (v: number, cells: number): number => {
    const cell = (v * 0.5 + 0.5) * cells;
    const f = cell - Math.floor(cell);
    return smoothstep(gobo.bar * 0.5, gobo.bar * 0.5 + gobo.soft, Math.min(f, 1 - f));
  };
  return axisMask(q[0], gobo.columns) * axisMask(q[1], gobo.rows);
}

/**
 * How much light a point holds in a shaft, 0 outside and up to 1 on the axis near the lamp. `apex`
 * is the lamp, `axis` a unit vector along the shaft. A shaft with a frame has a rectangular
 * section and the frame's bars cut across it. The shader's `coneDensity` is this function.
 */
export function coneDensity(
  spec: Pick<LightConeSpec, 'halfAngleDeg' | 'length' | 'falloff' | 'edge' | 'gobo'>,
  apex: Vec3,
  axis: Vec3,
  point: Vec3,
): number {
  const d: Vec3 = [point[0] - apex[0], point[1] - apex[1], point[2] - apex[2]];
  const along = d[0] * axis[0] + d[1] * axis[1] + d[2] * axis[2];
  const t = along / spec.length;
  if (t <= 0 || t >= 1) return 0;
  const radius = Math.max(along * Math.tan((spec.halfAngleDeg * Math.PI) / 180), 1e-4);
  const { right, other } = coneFrame(axis);
  const q: [number, number] = [(d[0] * right[0] + d[1] * right[1] + d[2] * right[2]) / radius, (d[0] * other[0] + d[1] * other[1] + d[2] * other[2]) / radius];
  const r = spec.gobo ? Math.max(Math.abs(q[0]), Math.abs(q[1])) : Math.hypot(q[0], q[1]);
  if (r >= 1) return 0;
  const axial = Math.pow(1 - t, spec.falloff) * smoothstep(0, 0.08, t);
  const soft = 1 - smoothstep(0.85 * (1 - spec.edge), 1, r);
  return axial * soft * goboMask(q, spec.gobo);
}

/** The shared GLSL: the shaft's frame, its bars, and its density, as in the functions above. */
export const CONE_DENSITY_GLSL = /* glsl */ `
void coneFrame(vec3 axis, out vec3 right, out vec3 other) {
	vec3 up = abs(axis.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
	right = normalize(cross(up, axis));
	other = cross(axis, right);
}

// gobo: columns, rows, bar, soft. Zero columns means no frame.
float goboMask(vec2 q, vec4 gobo) {
	if (gobo.x < 0.5) return 1.0;
	vec2 cell = (q * 0.5 + 0.5) * gobo.xy;
	vec2 f = fract(cell);
	vec2 edge = min(f, 1.0 - f);
	vec2 m = smoothstep(vec2(gobo.z * 0.5), vec2(gobo.z * 0.5 + gobo.w), edge);
	return m.x * m.y;
}

float coneDensity(vec3 point, vec3 apex, vec3 axis, float len, float tanHalf, float falloff, float edge, vec4 gobo) {
	vec3 d = point - apex;
	float along = dot(d, axis);
	float t = along / len;
	if (t <= 0.0 || t >= 1.0) return 0.0;
	vec3 right;
	vec3 other;
	coneFrame(axis, right, other);
	vec2 q = vec2(dot(d, right), dot(d, other)) / max(along * tanHalf, 0.0001);
	float r = gobo.x > 0.5 ? max(abs(q.x), abs(q.y)) : length(q);
	if (r >= 1.0) return 0.0;
	float axial = pow(1.0 - t, falloff) * smoothstep(0.0, 0.08, t);
	float soft = 1.0 - smoothstep(0.85 * (1.0 - edge), 1.0, r);
	return axial * soft * goboMask(q, gobo);
}
`;

const SEGMENTS = 16;

/**
 * A unit cone with its apex at the origin and its axis along +z: radius equals height, open at
 * the far end, 48 triangles. Each vertex carries the direction it faces around the axis, so the
 * shader can give the shell a smooth normal without storing one.
 */
export function createConeGeometry(): BufferGeometry {
  const positions: number[] = [];
  const radials: number[] = [];
  const vertex = (x: number, y: number, z: number, rx: number, ry: number): void => {
    positions.push(x, y, z);
    radials.push(rx, ry);
  };
  const ring = (k: number, radius: number): [number, number, number, number] => {
    const angle = (2 * Math.PI * k) / SEGMENTS;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius, radius, angle];
  };
  for (let k = 0; k < SEGMENTS; k += 1) {
    const [ax, ay, az, aAngle] = ring(k, 0.5);
    const [bx, by, bz, bAngle] = ring(k + 1, 0.5);
    const [cx, cy, cz, cAngle] = ring(k, 1);
    const [dx, dy, dz, dAngle] = ring(k + 1, 1);
    const mid = (aAngle + bAngle) / 2;
    vertex(0, 0, 0, Math.cos(mid), Math.sin(mid));
    vertex(ax, ay, az, Math.cos(aAngle), Math.sin(aAngle));
    vertex(bx, by, bz, Math.cos(bAngle), Math.sin(bAngle));
    vertex(ax, ay, az, Math.cos(aAngle), Math.sin(aAngle));
    vertex(cx, cy, cz, Math.cos(cAngle), Math.sin(cAngle));
    vertex(bx, by, bz, Math.cos(bAngle), Math.sin(bAngle));
    vertex(bx, by, bz, Math.cos(bAngle), Math.sin(bAngle));
    vertex(cx, cy, cz, Math.cos(cAngle), Math.sin(cAngle));
    vertex(dx, dy, dz, Math.cos(dAngle), Math.sin(dAngle));
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('radial', new Float32BufferAttribute(radials, 2));
  return geometry;
}

export const CONE_TRIANGLES_PER_INSTANCE = CONE_TRIANGLES;

const VERTEX = /* glsl */ `
${CONE_DENSITY_GLSL}
attribute vec2 radial;
attribute vec3 iApex;
attribute vec3 iAxis;
attribute vec4 iShape;   // length, tan(half angle), opacity, falloff
attribute vec3 iColour;  // linear, already scaled by gain and opacity
attribute vec3 iLook;    // edge, breakup, 1 for a framed (square) shaft

varying float vT;
varying float vFalloff;
varying vec3 vNormalView;
varying vec3 vView;
varying vec3 vWorld;
varying vec3 vColour;
varying float vBreakup;
varying float vEdge;

void main() {
	vec3 axis = normalize(iAxis);
	vec3 right;
	vec3 other;
	coneFrame(axis, right, other);
	float len = iShape.x;
	float tanHalf = iShape.y;
	// A framed shaft has a square section: pull each ring vertex out to the square around the circle.
	vec2 section = position.xy;
	if (iLook.z > 0.5) section /= max(max(abs(radial.x), abs(radial.y)), 0.0001);
	vec3 world = iApex + right * (section.x * tanHalf * len) + other * (section.y * tanHalf * len) + axis * (position.z * len);
	// The shell's true normal: tilted back from the radial direction by the cone's half angle.
	float cosHalf = inversesqrt(1.0 + tanHalf * tanHalf);
	float sinHalf = tanHalf * cosHalf;
	vec3 normalWorld = normalize(right * (radial.x * cosHalf) + other * (radial.y * cosHalf) - axis * sinHalf);
	vec4 viewPosition = viewMatrix * vec4(world, 1.0);
	vT = position.z;
	vFalloff = iShape.w;
	vNormalView = mat3(viewMatrix) * normalWorld;
	vView = viewPosition.xyz;
	vWorld = world;
	vColour = iColour;
	vBreakup = iLook.y;
	vEdge = iLook.x;
	gl_Position = projectionMatrix * viewPosition;
}
`;

const FRAGMENT = /* glsl */ `
#include <packing>
${NOISE_GLSL}

uniform sampler2D depthMap;
uniform vec2 resolution;
uniform float cameraNear;
uniform float cameraFar;
uniform float softness;
uniform vec2 nearFade;

varying float vT;
varying float vFalloff;
varying vec3 vNormalView;
varying vec3 vView;
varying vec3 vWorld;
varying vec3 vColour;
varying float vBreakup;
varying float vEdge;

void main() {
	float axial = pow(1.0 - vT, vFalloff) * smoothstep(0.0, 0.08, vT);
	// Brightest where the shell faces the eye, and soft toward its silhouette.
	float facing = abs(dot(normalize(vNormalView), normalize(-vView)));
	float side = pow(clamp(facing, 0.0, 1.0), 0.5 + 1.5 * vEdge);
	// Fade against the scene's depth: nothing where a surface is in front, a ramp where it meets one.
	vec2 screen = gl_FragCoord.xy / resolution;
	float sceneDepth = texture2D(depthMap, screen).r;
	float sceneDistance = -perspectiveDepthToViewZ(sceneDepth, cameraNear, cameraFar);
	float meets = clamp((sceneDistance - (-vView.z)) / softness, 0.0, 1.0);
	float nearby = smoothstep(nearFade.x, nearFade.y, length(vView));
	float breakup = 1.0 - vBreakup * valueNoise(vWorld * 2.5);
	float strength = axial * side * meets * nearby * breakup;
	gl_FragColor = vec4(vColour * strength, 1.0);
}
`;

/** A cone chosen for this frame: the lamp, and the spec it takes its shape from. */
export interface VisibleCone {
  readonly apex: Vec3;
  readonly axis: Vec3;
  readonly spec: LightConeSpec;
}

export interface Cones {
  readonly geometry: InstancedBufferGeometry;
  readonly material: ShaderMaterial;
  /** Fill the instance buffers from the cones chosen this frame. */
  set(cones: readonly VisibleCone[]): void;
  setDepth(texture: Texture | null, cameraNear: number, cameraFar: number): void;
  setResolution(width: number, height: number): void;
  dispose(): void;
}

export function createCones(capacity: number): Cones {
  const max = Math.min(capacity, MAX_CONES);
  const base = createConeGeometry();
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute('position', base.getAttribute('position'));
  geometry.setAttribute('radial', base.getAttribute('radial'));
  const apex = new InstancedBufferAttribute(new Float32Array(max * 3), 3);
  const axis = new InstancedBufferAttribute(new Float32Array(max * 3), 3);
  const shape = new InstancedBufferAttribute(new Float32Array(max * 4), 4);
  const colour = new InstancedBufferAttribute(new Float32Array(max * 3), 3);
  const look = new InstancedBufferAttribute(new Float32Array(max * 3), 3);
  geometry.setAttribute('iApex', apex);
  geometry.setAttribute('iAxis', axis);
  geometry.setAttribute('iShape', shape);
  geometry.setAttribute('iColour', colour);
  geometry.setAttribute('iLook', look);
  geometry.instanceCount = 0;

  const uniforms = {
    depthMap: { value: null as Texture | null },
    resolution: { value: new Vector2(1, 1) },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 100 },
    softness: { value: CONE_SOFTNESS },
    nearFade: { value: new Vector2(CONE_NEAR_FADE[0], CONE_NEAR_FADE[1]) },
  };
  const material = new ShaderMaterial({
    name: 'LookCones',
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms,
    blending: AdditiveBlending,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
    fog: false,
  });

  return {
    geometry,
    material,
    set(cones) {
      const chosen = cones.slice(0, max);
      chosen.forEach((cone, i) => {
        const [r, g, b] = kelvinToLinear(cone.spec.kelvin);
        const gain = CONE_GAIN * cone.spec.opacity;
        apex.setXYZ(i, cone.apex[0], cone.apex[1], cone.apex[2]);
        axis.setXYZ(i, cone.axis[0], cone.axis[1], cone.axis[2]);
        shape.setXYZW(i, cone.spec.length, Math.tan((cone.spec.halfAngleDeg * Math.PI) / 180), cone.spec.opacity, cone.spec.falloff);
        colour.setXYZ(i, r * gain, g * gain, b * gain);
        look.setXYZ(i, cone.spec.edge, cone.spec.breakup, cone.spec.gobo ? 1 : 0);
      });
      geometry.instanceCount = chosen.length;
      for (const attribute of [apex, axis, shape, colour, look]) attribute.needsUpdate = true;
    },
    setDepth(texture, near, far) {
      uniforms.depthMap.value = texture;
      uniforms.cameraNear.value = near;
      uniforms.cameraFar.value = far;
    },
    setResolution(width, height) {
      uniforms.resolution.value.set(width, height);
    },
    dispose() {
      geometry.dispose();
      base.dispose();
      material.dispose();
    },
  };
}
