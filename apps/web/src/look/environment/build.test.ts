import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackSide, Color, DoubleSide, Mesh, MeshBasicMaterial, PMREMGenerator, Scene, Texture, Vector3, type WebGLRenderer } from 'three';
import { kelvinToLinear } from '../colour.ts';
import { CORRIDOR_LOOK, OFFICE_LOOK } from '../profiles.ts';
import { applyEnvironment, buildEnvironmentScene, buildLookEnvironment, type BuiltEnvironment } from './build.ts';
import { environmentLayout, normalisedRadiance } from './layout.ts';

const built = (profile = CORRIDOR_LOOK) => {
  const layout = environmentLayout(profile.environment);
  const radiance = normalisedRadiance(layout);
  return { layout, radiance, ...buildEnvironmentScene(layout, radiance) };
};

describe('the generated environment scene', () => {
  it('is a dark room with one patch for each entry of the layout, and nothing else', () => {
    const { scene, layout } = built();
    expect(scene.children).toHaveLength(1 + layout.patches.length);
    const room = scene.getObjectByName('look-environment-room') as Mesh;
    expect((room.material as MeshBasicMaterial).side).toBe(BackSide);
    for (const patch of layout.patches) {
      const mesh = scene.getObjectByName(`look-environment-${patch.id}`) as Mesh;
      expect(mesh, patch.id).toBeDefined();
      expect((mesh.material as MeshBasicMaterial).side).toBe(DoubleSide);
    }
  });

  it('puts each patch where the layout says, facing the point being lit', () => {
    const { scene, layout } = built();
    scene.updateMatrixWorld(true);
    for (const patch of layout.patches) {
      const mesh = scene.getObjectByName(`look-environment-${patch.id}`) as Mesh;
      const at = mesh.getWorldPosition(new Vector3());
      expect(at.x).toBeCloseTo(patch.direction[0] * patch.distance, 6);
      expect(at.y).toBeCloseTo(patch.direction[1] * patch.distance, 6);
      expect(at.z).toBeCloseTo(patch.direction[2] * patch.distance, 6);
      const facing = mesh.getWorldDirection(new Vector3());
      const towardOrigin = at.clone().negate().normalize();
      expect(facing.dot(towardOrigin), `${patch.id} faces the origin`).toBeGreaterThan(0.999);
    }
  });

  it('lights each patch with its colour temperature at its normalised radiance', () => {
    const { scene, layout, radiance } = built(OFFICE_LOOK);
    for (const patch of layout.patches) {
      const material = (scene.getObjectByName(`look-environment-${patch.id}`) as Mesh).material as MeshBasicMaterial;
      const [r, g, b] = kelvinToLinear(patch.kelvin);
      const scale = radiance.patches[patch.id];
      expect(material.color.r).toBeCloseTo(r * scale, 9);
      expect(material.color.g).toBeCloseTo(g * scale, 9);
      expect(material.color.b).toBeCloseTo(b * scale, 9);
    }
    const room = (scene.getObjectByName('look-environment-room') as Mesh).material as MeshBasicMaterial;
    expect(room.color.r).toBeCloseTo(kelvinToLinear(layout.base.kelvin)[0] * radiance.base, 9);
  });

  it('is warm overhead and dim and neutral at the window, as the layout asks', () => {
    const { scene } = built();
    const colourOf = (id: string): Color => ((scene.getObjectByName(`look-environment-${id}`) as Mesh).material as MeshBasicMaterial).color;
    const ceiling = colourOf('ceiling-left');
    const window = colourOf('window');
    expect(ceiling.r / ceiling.b, 'ceiling is warm').toBeGreaterThan(1.6);
    expect(Math.abs(window.r - window.b) / window.r, 'window is near neutral').toBeLessThan(0.08);
    expect(window.r + window.g + window.b).toBeLessThan(ceiling.r + ceiling.g + ceiling.b);
  });

  it('frees every geometry and material it made', () => {
    const { scene, dispose } = built();
    const disposed: string[] = [];
    scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.geometry.addEventListener('dispose', () => disposed.push('geometry'));
      (object.material as MeshBasicMaterial).addEventListener('dispose', () => disposed.push('material'));
    });
    dispose();
    expect(disposed.filter((d) => d === 'geometry')).toHaveLength(5);
    expect(disposed.filter((d) => d === 'material')).toHaveLength(5);
  });
});

describe('applying the environment to a scene', () => {
  const environment = (): BuiltEnvironment & { disposed: number } => {
    const state = { texture: new Texture(), disposed: 0, dispose: () => undefined };
    state.dispose = () => {
      state.disposed += 1;
    };
    return state;
  };

  it('makes it the scene’s environment at the profile’s intensity, and never the background', () => {
    const scene = new Scene();
    scene.background = new Color('#151A20');
    const first = environment();
    applyEnvironment(scene, first, 0.15);
    expect(scene.environment).toBe(first.texture);
    expect(scene.environmentIntensity).toBe(0.15);
    expect(scene.background).toEqual(new Color('#151A20'));
  });

  it('puts the previous environment and intensity back on dispose, and frees the new one once', () => {
    const scene = new Scene();
    const before = new Texture();
    scene.environment = before;
    scene.environmentIntensity = 0.7;
    const next = environment();
    const applied = applyEnvironment(scene, next, 0.15);
    applied.dispose();
    expect(scene.environment).toBe(before);
    expect(scene.environmentIntensity).toBe(0.7);
    expect(next.disposed).toBe(1);
    applied.dispose();
    expect(next.disposed, 'a second dispose does nothing').toBe(1);
  });

  it('restores a scene that had no environment to none', () => {
    const scene = new Scene();
    const applied = applyEnvironment(scene, environment(), 0.15);
    applied.dispose();
    expect(scene.environment).toBeNull();
  });

  it('retunes the intensity in place, and not after it was removed', () => {
    const scene = new Scene();
    const applied = applyEnvironment(scene, environment(), 0.15);
    applied.setIntensity(0.2);
    expect(scene.environmentIntensity).toBe(0.2);
    applied.dispose();
    const after = scene.environmentIntensity;
    applied.setIntensity(0.9);
    expect(scene.environmentIntensity).toBe(after);
  });

  it('does not overwrite an environment a space set after this one, but still frees its own', () => {
    const scene = new Scene();
    const mine = environment();
    const applied = applyEnvironment(scene, mine, 0.15);
    const own = new Texture();
    scene.environment = own;
    scene.environmentIntensity = 0.5;
    applied.dispose();
    expect(scene.environment).toBe(own);
    expect(scene.environmentIntensity).toBe(0.5);
    expect(mine.disposed).toBe(1);
  });
});

describe('prefiltering the environment', () => {
  afterEach(() => vi.restoreAllMocks());

  it('prefilters once with a light blur, frees the generator and the temporary scene at once, and the cube map on dispose', () => {
    const target = { texture: new Texture(), dispose: vi.fn() };
    const disposed: string[] = [];
    const fromScene = vi.spyOn(PMREMGenerator.prototype, 'fromScene').mockImplementation((scene: Scene) => {
      scene.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        object.geometry.addEventListener('dispose', () => disposed.push('geometry'));
        (object.material as MeshBasicMaterial).addEventListener('dispose', () => disposed.push('material'));
      });
      return target as never;
    });
    const generatorDispose = vi.spyOn(PMREMGenerator.prototype, 'dispose').mockImplementation(() => undefined);

    const environment = buildLookEnvironment({} as WebGLRenderer, CORRIDOR_LOOK.environment);

    expect(fromScene).toHaveBeenCalledTimes(1);
    const sigma = fromScene.mock.calls[0]?.[1] ?? 0;
    expect(sigma, 'a blur, so a patch is soft').toBeGreaterThan(0);
    expect(sigma, 'a light one, so a patch stays a patch').toBeLessThanOrEqual(0.1);
    expect(generatorDispose, 'the generator is freed').toHaveBeenCalledTimes(1);
    expect(disposed.filter((d) => d === 'geometry'), 'the temporary scene’s geometry is freed').toHaveLength(5);
    expect(disposed.filter((d) => d === 'material'), 'and its materials').toHaveLength(5);
    expect(environment.texture).toBe(target.texture);
    expect(target.dispose, 'the cube map lives until it is disposed').not.toHaveBeenCalled();
    environment.dispose();
    expect(target.dispose).toHaveBeenCalledTimes(1);
  });
});
