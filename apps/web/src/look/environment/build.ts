import {
  BackSide,
  BoxGeometry,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { kelvinToLinear } from '../colour.ts';
import { environmentLayout, normalisedRadiance, type EnvironmentLayout, type EnvironmentRadiance } from './layout.ts';
import type { LookProfile } from '../profiles.ts';

/**
 * Builds the generated environment from its layout: an offscreen scene of emissive patches in a
 * dark room, with every colour and size taken from `layout.ts`, prefiltered once by PMREM into a
 * cube map that lights the materials with no environment map of their own. Nothing is downloaded
 * and nothing is captured again afterwards. The renderer-specific part (PMREM) is here and in
 * `useLookEnvironment`; the layout and the radiance maths are renderer-free.
 */

/** Edge of the dark room the patches sit inside, metres: larger than any patch distance. */
const ROOM_SIZE = 24;

/** Blur, in radians, the prefilter applies to the patches' edges. */
const SIGMA = 0.04;

export interface EnvironmentScene {
  readonly scene: Scene;
  dispose(): void;
}

const emissive = (kelvin: number, radiance: number): Color => {
  const [r, g, b] = kelvinToLinear(kelvin);
  // Components are set directly in the linear working space, and may exceed 1: the target is half-float.
  return new Color(r * radiance, g * radiance, b * radiance);
};

/** The offscreen scene for a layout and its normalised radiance. Pure three; no renderer. */
export function buildEnvironmentScene(layout: EnvironmentLayout, radiance: EnvironmentRadiance): EnvironmentScene {
  const scene = new Scene();
  const owned: { dispose(): void }[] = [];

  const room = new Mesh(
    new BoxGeometry(ROOM_SIZE, ROOM_SIZE, ROOM_SIZE),
    new MeshBasicMaterial({ color: emissive(layout.base.kelvin, radiance.base), side: BackSide }),
  );
  room.name = 'look-environment-room';
  scene.add(room);
  owned.push(room.geometry, room.material);

  for (const patch of layout.patches) {
    const material = new MeshBasicMaterial({ color: emissive(patch.kelvin, radiance.patches[patch.id]), side: DoubleSide });
    const mesh = new Mesh(new PlaneGeometry(patch.size[0], patch.size[1]), material);
    mesh.name = `look-environment-${patch.id}`;
    mesh.position.set(patch.direction[0] * patch.distance, patch.direction[1] * patch.distance, patch.direction[2] * patch.distance);
    // Face the point being lit; a patch straight above or below needs an up vector that is not its own axis.
    mesh.up.set(0, Math.abs(patch.direction[1]) > 0.99 ? 0 : 1, Math.abs(patch.direction[1]) > 0.99 ? 1 : 0);
    mesh.lookAt(0, 0, 0);
    scene.add(mesh);
    owned.push(mesh.geometry, material);
  }
  return {
    scene,
    dispose() {
      for (const item of owned) item.dispose();
    },
  };
}

export interface BuiltEnvironment {
  /** The prefiltered cube map, to assign to `scene.environment`. */
  readonly texture: Texture;
  /** Free the cube map's GPU memory. */
  dispose(): void;
}

/** Prefilter the environment once with PMREM. The temporary scene and the generator are freed here. */
export function buildLookEnvironment(renderer: WebGLRenderer, env: LookProfile['environment']): BuiltEnvironment {
  const layout = environmentLayout(env);
  const built = buildEnvironmentScene(layout, normalisedRadiance(layout));
  const generator = new PMREMGenerator(renderer);
  const target = generator.fromScene(built.scene, SIGMA, 0.1, 100);
  generator.dispose();
  built.dispose();
  return { texture: target.texture, dispose: () => target.dispose() };
}

/** What applying an environment to a scene changed, so it can be put back. */
export interface AppliedEnvironment {
  setIntensity(intensity: number): void;
  dispose(): void;
}

/**
 * Make a built environment the scene's `environment` at `intensity`, remembering what was there.
 * `dispose` puts back the previous values (only if the scene still holds this environment: a
 * space that has set its own since is not overwritten) and frees the cube map. Never the
 * background: `scene.background` is not touched.
 */
export function applyEnvironment(scene: Scene, built: BuiltEnvironment, intensity: number): AppliedEnvironment {
  const previous = { environment: scene.environment, intensity: scene.environmentIntensity };
  scene.environment = built.texture;
  scene.environmentIntensity = intensity;
  let disposed = false;
  return {
    setIntensity(value) {
      if (!disposed && scene.environment === built.texture) scene.environmentIntensity = value;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (scene.environment === built.texture) {
        scene.environment = previous.environment;
        scene.environmentIntensity = previous.intensity;
      }
      built.dispose();
    },
  };
}
