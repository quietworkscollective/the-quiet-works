import { describe, expect, it, vi } from 'vitest';
import { ACESFilmicToneMapping, Material, NoToneMapping, PerspectiveCamera, Scene, SRGBColorSpace, Texture, WebGLRenderTarget, type Vector2, type WebGLRenderer } from 'three';
import { OFFICE_LOOK, CORRIDOR_LOOK, type LookProfile } from '../profiles.ts';
import { BlendFunction } from 'postprocessing';
import { BLOOM_GAIN, bloomRadius, LookDriver, type LookDriverOptions } from './driver.ts';
import { collectGpuObjects, type GpuObject } from './inspect.ts';
import { isOnScreenSceneTarget } from '../render.ts';

interface Spy {
  renderer: WebGLRenderer;
  info: { autoReset: boolean; render: { frame: number; calls: number; triangles: number }; reset(): void };
  size: { width: number; height: number; ratio: number };
  direct: ReturnType<typeof vi.fn>;
}

/** The parts of a renderer the composer and the passes touch while they are built and sized. */
function fakeRenderer(width = 1440, height = 900, ratio = 1): Spy {
  const size = { width, height, ratio };
  const info = {
    autoReset: true,
    render: { frame: 0, calls: 0, triangles: 0 },
    reset(): void {
      info.render.calls = 0;
      info.render.triangles = 0;
    },
  };
  const direct = vi.fn(() => {
    info.render.calls += 1;
    info.render.frame += 1;
  });
  const renderer = {
    toneMapping: ACESFilmicToneMapping,
    toneMappingExposure: 1,
    autoClear: true,
    outputColorSpace: SRGBColorSpace,
    info,
    capabilities: { maxSamples: 8, isWebGL2: true },
    getSize: (target: Vector2) => target.set(size.width, size.height),
    getDrawingBufferSize: (target: Vector2) => target.set(size.width * size.ratio, size.height * size.ratio),
    getPixelRatio: () => size.ratio,
    getContext: () => ({
      getContextAttributes: () => ({ alpha: true }),
      // A WebGL2 context that supports 8 samples: pmndrs clamps the multisampling to what it reports.
      renderbufferStorageMultisample: () => undefined,
      createRenderbuffer: () => ({}),
      bindRenderbuffer: () => undefined,
      deleteRenderbuffer: () => undefined,
      MAX_SAMPLES: 0x8d57,
      getParameter: () => 8,
    }),
    getRenderTarget: () => null,
    setSize: vi.fn(),
    setRenderTarget: vi.fn(),
    render: direct,
    dispose: vi.fn(),
  } as unknown as WebGLRenderer;
  return { renderer, info, size, direct };
}

function setup(overrides: Partial<LookDriverOptions> & { profile?: LookProfile } = {}): { driver: LookDriver; spy: Spy; scene: Scene; camera: PerspectiveCamera } {
  const spy = fakeRenderer();
  const scene = new Scene();
  const camera = new PerspectiveCamera(48, 1.6, 0.05, 45);
  const driver = new LookDriver({
    renderer: spy.renderer,
    scene,
    camera,
    tier: 'desktop',
    profile: OFFICE_LOOK,
    reducedMotion: false,
    ...overrides,
  });
  return { driver, spy, scene, camera };
}

describe('frames on their way to the screen', () => {
  it('marks the buffer it draws the scene into, and nothing else', () => {
    const { driver, scene, camera } = setup();
    driver.frame(scene, camera, 0);
    expect(isOnScreenSceneTarget(driver.composer.inputBuffer), 'the scene pass renders into the input buffer').toBe(true);
    expect(isOnScreenSceneTarget({}), 'an unrelated offscreen target').toBe(false);
    driver.dispose();
  });
});

describe('what the driver builds', () => {
  it('runs the desktop tier as scene, contact shadow, atmosphere, then one finish pass', () => {
    const { driver } = setup();
    expect(driver.passNames).toEqual(['RenderPass', 'N8AOPostPass', 'AtmospherePass', 'EffectPass']);
    expect(driver.plan.stages).toEqual(['scene', 'ao', 'atmosphere', 'finish']);
  });

  it('merges every effect into that single pass, in order: light patch, fog, bloom, tone mapping, grade, vignette, grain', () => {
    const { driver } = setup();
    expect(driver.effectNames).toEqual([
      'LookLightPatchEffect',
      'LookHeightFogEffect',
      'BloomEffect',
      'ToneMappingEffect',
      'LUT3DEffect',
      'LookVignetteEffect',
      'LookGrainEffect',
    ]);
    expect(driver.passNames.filter((name) => name === 'EffectPass')).toHaveLength(1);
  });

  it('runs the mobile tier as the scene and one finish pass: tone mapping and the grade only', () => {
    const { driver } = setup({ tier: 'mobile' });
    expect(driver.passNames).toEqual(['RenderPass', 'EffectPass']);
    expect(driver.effectNames).toEqual(['ToneMappingEffect', 'LUT3DEffect']);
  });

  it('has no contact shadow, no atmosphere pass, no vignette and no grain on the mobile tier', () => {
    const { driver } = setup({ tier: 'mobile' });
    expect(driver.passNames).not.toContain('N8AOPostPass');
    expect(driver.passNames).not.toContain('AtmospherePass');
    expect(driver.effectNames).not.toContain('LookVignetteEffect');
    expect(driver.effectNames).not.toContain('LookGrainEffect');
    expect(driver.effectNames).not.toContain('LookHeightFogEffect');
  });

  it('configures the contact shadow from the profile: half resolution, no gamma, no transparency pass', () => {
    const { driver } = setup({ profile: CORRIDOR_LOOK });
    const ao = driver.passes.find((pass) => pass.name === 'N8AOPostPass') as unknown as { configuration: Record<string, unknown> };
    expect(ao.configuration['halfRes']).toBe(true);
    expect(ao.configuration['aoRadius']).toBe(CORRIDOR_LOOK.ao.radius);
    expect(ao.configuration['intensity']).toBe(CORRIDOR_LOOK.ao.intensity);
    expect(ao.configuration['transparencyAware']).toBe(false);
    expect(ao.configuration['gammaCorrection']).toBe(false);
    expect(ao.configuration['accumulate']).toBe(false);
  });

  it('leaves out grain when the visitor asked for less motion', () => {
    const { driver } = setup({ reducedMotion: true });
    expect(driver.effectNames).not.toContain('LookGrainEffect');
    expect(driver.effectNames).toContain('LookVignetteEffect');
  });
});

describe('tone mapping happens once', () => {
  it('switches the renderer’s own tone mapping off while the stack is mounted, and puts it back on unmount', () => {
    const { driver, spy } = setup();
    expect(spy.renderer.toneMapping).toBe(NoToneMapping);
    driver.dispose();
    expect(spy.renderer.toneMapping).toBe(ACESFilmicToneMapping);
  });

  it('holds it off for every frame even if a scene sets it back', () => {
    const { driver, spy, scene, camera } = setup();
    const seen: number[] = [];
    driver.composer.render = vi.fn(() => {
      seen.push(spy.renderer.toneMapping);
    });
    spy.renderer.toneMapping = ACESFilmicToneMapping;
    driver.frame(scene, camera, 0.016);
    expect(seen).toEqual([NoToneMapping]);
  });

  it('has exactly one tone-mapping effect and no pass that converts colour', () => {
    const { driver } = setup();
    expect(driver.effectNames.filter((name) => name === 'ToneMappingEffect')).toHaveLength(1);
    const ao = driver.passes.find((pass) => pass.name === 'N8AOPostPass') as unknown as { configuration: { gammaCorrection: boolean } };
    expect(ao.configuration.gammaCorrection).toBe(false);
  });

  it('restores exposure and clearing as well, after frames that set their own', () => {
    const spy = fakeRenderer();
    spy.renderer.toneMappingExposure = 1.4;
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    const driver = new LookDriver({ renderer: spy.renderer, scene, camera, tier: 'desktop', profile: OFFICE_LOOK, reducedMotion: false });
    driver.composer.render = vi.fn();
    driver.frame(scene, camera, 0.016);
    expect(spy.renderer.toneMappingExposure, 'the frame ran at the profile’s exposure').toBe(OFFICE_LOOK.exposure);
    driver.dispose();
    expect(spy.renderer.toneMappingExposure).toBe(1.4);
    expect(spy.renderer.autoClear).toBe(true);
  });
});

describe('rendering on demand', () => {
  it('draws only when its frame method is called, and schedules nothing of its own', () => {
    vi.useFakeTimers();
    const raf = vi.fn(() => 0);
    vi.stubGlobal('requestAnimationFrame', raf);
    const timeouts = vi.spyOn(globalThis, 'setTimeout');
    const { driver, scene, camera } = setup();
    const render = vi.fn();
    driver.composer.render = render;
    vi.advanceTimersByTime(5000);
    expect(render, 'nothing renders while idle').not.toHaveBeenCalled();
    expect(raf, 'no animation frame was requested').not.toHaveBeenCalled();
    expect(timeouts).not.toHaveBeenCalled();
    driver.frame(scene, camera, 0.016);
    expect(render).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(render, 'one frame was asked for, one was drawn').toHaveBeenCalledTimes(1);
    expect(raf).not.toHaveBeenCalled();
    expect(timeouts).not.toHaveBeenCalled();
    timeouts.mockRestore();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('draws nothing after it is disposed', () => {
    const { driver, scene, camera } = setup();
    const render = vi.fn();
    driver.composer.render = render;
    driver.dispose();
    driver.frame(scene, camera, 0.016);
    expect(render).not.toHaveBeenCalled();
  });

  it('keeps the frame counter meaning frames, though a stack frame renders many passes', () => {
    const { driver, spy, scene, camera } = setup();
    driver.composer.render = vi.fn(() => {
      for (let i = 0; i < 20; i += 1) {
        spy.info.render.calls += 1;
        spy.info.render.frame += 1;
      }
    });
    driver.frame(scene, camera, 0.016);
    driver.frame(scene, camera, 0.016);
    expect(spy.info.render.frame).toBe(2);
    expect(spy.info.autoReset, 'the renderer’s own reset is back on').toBe(true);
  });

  it('falls back to a direct render, and stays there, if the stack throws', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { driver, spy, scene, camera } = setup();
    driver.composer.render = vi.fn(() => {
      throw new Error('shader failed');
    });
    driver.frame(scene, camera, 0.016);
    expect(driver.failed).toBe(true);
    expect(spy.direct).toHaveBeenCalledTimes(1);
    expect(spy.renderer.toneMapping, 'tone mapping is back for the direct render').toBe(ACESFilmicToneMapping);
    driver.frame(scene, camera, 0.016);
    expect(spy.direct).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});

describe('grain', () => {
  it('advances its seed only when a frame is drawn, so a still view holds still', () => {
    const { driver, scene, camera } = setup();
    driver.composer.render = vi.fn();
    const grain = (): number => (driver as unknown as { finish: { grain: { seed: number } } }).finish.grain.seed;
    const first = grain();
    expect(grain(), 'idle').toBe(first);
    driver.frame(scene, camera, 0.016);
    const second = grain();
    expect(second).not.toBe(first);
    expect(grain(), 'still the same until the next frame').toBe(second);
    driver.frame(scene, camera, 0.016);
    expect(grain()).not.toBe(second);
  });

  it('removes the grain when reduced motion is switched on, and brings it back when it is switched off', () => {
    const { driver } = setup();
    expect(driver.effectNames).toContain('LookGrainEffect');
    expect(driver.setReducedMotion(true)).toBe(true);
    expect(driver.effectNames).not.toContain('LookGrainEffect');
    expect(driver.setReducedMotion(true), 'no change, no new frame').toBe(false);
    expect(driver.setReducedMotion(false)).toBe(true);
    expect(driver.effectNames).toContain('LookGrainEffect');
  });

  it('holds the haze and dust still under reduced motion', () => {
    const { driver, scene, camera } = setup({ reducedMotion: true });
    driver.composer.render = vi.fn();
    const drift = (): number => (driver as unknown as { drift: number }).drift;
    driver.frame(scene, camera, 0.016);
    driver.frame(scene, camera, 0.016);
    expect(drift()).toBe(0);
  });

  it('moves the haze and dust by the frame time, but never by more than a bounded step after an idle', () => {
    const { driver, scene, camera } = setup();
    driver.composer.render = vi.fn();
    const drift = (): number => (driver as unknown as { drift: number }).drift;
    driver.frame(scene, camera, 0.02);
    expect(drift()).toBeCloseTo(0.02, 9);
    driver.frame(scene, camera, 30);
    expect(drift()).toBeLessThan(0.02 + 0.07);
  });
});

describe('disposal', () => {
  it('frees every render target, texture and material it created', () => {
    const { driver } = setup();
    const objects = [...collectGpuObjects(driver)];
    const disposed = new Set<GpuObject>();
    for (const object of objects) object.addEventListener('dispose', () => disposed.add(object));
    expect(objects.length, 'the walk found the stack’s GPU objects').toBeGreaterThan(20);
    driver.dispose();
    const leaked = objects.filter((object) => !disposed.has(object));
    expect(
      leaked.map((object) => `${object.constructor.name}:${(object as { name?: string }).name ?? ''}`),
      'objects that were never disposed',
    ).toEqual([]);
    expect(objects.some((o) => o instanceof WebGLRenderTarget)).toBe(true);
    expect(objects.some((o) => o instanceof Texture)).toBe(true);
    expect(objects.some((o) => o instanceof Material)).toBe(true);
  });

  it('frees everything on the mobile tier too, and a second dispose does nothing', () => {
    const { driver } = setup({ tier: 'mobile' });
    const objects = [...collectGpuObjects(driver)];
    let count = 0;
    for (const object of objects) object.addEventListener('dispose', () => (count += 1));
    driver.dispose();
    const once = count;
    expect(once).toBeGreaterThanOrEqual(objects.length);
    driver.dispose();
    expect(count).toBe(once);
  });

  it('frees what a rebuild replaces, and what the old finish pass held', () => {
    const { driver } = setup();
    const before = [...collectGpuObjects(driver)];
    const disposed = new Set<GpuObject>();
    for (const object of before) object.addEventListener('dispose', () => disposed.add(object));
    driver.setReducedMotion(true);
    const kept = new Set(collectGpuObjects(driver));
    const dropped = before.filter((object) => !kept.has(object));
    expect(dropped.length, 'the old finish pass was replaced').toBeGreaterThan(0);
    expect(dropped.filter((object) => !disposed.has(object)).map((o) => o.constructor.name)).toEqual([]);
  });
});

describe('the profile’s numbers reach the effects', () => {
  type Internals = {
    finish: {
      pass: { dithering: boolean };
      bloom: { intensity: number; blendMode: { blendFunction: number }; luminanceMaterial: { threshold: number }; mipmapBlurPass: { radius: number } };
      lut: { blendMode: { opacity: { value: number } } };
      vignette: { amount: number; inner: number };
      grain: { amount: number };
    };
  };
  const finish = (driver: LookDriver): Internals['finish'] => (driver as unknown as Internals).finish;

  it('sets bloom from the profile: only a lamp core crosses the threshold, and the glow is added, not screened', () => {
    const { driver } = setup({ profile: CORRIDOR_LOOK });
    const bloom = finish(driver).bloom;
    expect(bloom.luminanceMaterial.threshold).toBe(CORRIDOR_LOOK.bloom.threshold);
    expect(bloom.intensity).toBeCloseTo(CORRIDOR_LOOK.bloom.strength * BLOOM_GAIN, 9);
    expect(bloom.mipmapBlurPass.radius).toBeCloseTo(bloomRadius(CORRIDOR_LOOK.bloom.radius), 9);
    // HDR values above 1 break a screen blend; the glow is added.
    expect(bloom.blendMode.blendFunction).toBe(BlendFunction.ADD);
  });

  it('sets the grade, vignette and grain from the profile, and dithers the output', () => {
    const { driver } = setup({ profile: OFFICE_LOOK });
    const { lut, vignette, grain, pass } = finish(driver);
    expect(lut.blendMode.opacity.value).toBe(OFFICE_LOOK.lut.intensity);
    expect(vignette.amount).toBe(OFFICE_LOOK.vignette.amount);
    expect(vignette.inner).toBe(OFFICE_LOOK.vignette.inner);
    expect(grain.amount).toBe(OFFICE_LOOK.grain.amount);
    expect(pass.dithering).toBe(true);
  });

  it('retunes the bloom radius and the fog in place when a profile changes without adding or removing an effect', () => {
    const { driver } = setup({ profile: CORRIDOR_LOOK });
    const before = driver.passes.slice();
    const air = CORRIDOR_LOOK.atmosphere;
    const next: LookProfile = {
      ...CORRIDOR_LOOK,
      bloom: { ...CORRIDOR_LOOK.bloom, radius: 0.25 },
      atmosphere: { ...air, farGlow: { ...air.farGlow, strength: air.farGlow.strength + 0.05 }, heightFog: air.heightFog.map((layer) => ({ ...layer, density: layer.density * 2 })) },
    };
    expect(driver.setProfile(next)).toBe(true);
    expect(driver.passes, 'no pass was rebuilt').toEqual(before);
    expect(finish(driver).bloom.mipmapBlurPass.radius).toBeCloseTo(bloomRadius(0.25), 9);
    const fog = (driver as unknown as { finish: { fog: { uniforms: Map<string, { value: unknown }> } } }).finish.fog;
    expect((fog.uniforms.get('farGlow')?.value as { z: number }).z).toBeCloseTo(air.farGlow.strength + 0.05, 9);
    expect((fog.uniforms.get('layers')?.value as { w: number }[])[0]?.w).toBeCloseTo((air.heightFog[0]?.density ?? 0) * 2, 9);
  });

  it('mixes the phone’s own grade intensity in, and keeps it when the profile changes in place', () => {
    const { driver } = setup({ tier: 'mobile', profile: OFFICE_LOOK });
    expect(finish(driver).lut.blendMode.opacity.value).toBe(OFFICE_LOOK.lut.mobileIntensity);
    expect(OFFICE_LOOK.lut.mobileIntensity).not.toBe(OFFICE_LOOK.lut.intensity);
    expect(driver.setProfile({ ...OFFICE_LOOK, lut: { intensity: 0.25, mobileIntensity: 0.6 } })).toBe(true);
    expect(finish(driver).lut.blendMode.opacity.value).toBe(0.6);
  });

  it('dithers on the mobile tier too, where there is no grain to hide banding', () => {
    const { driver } = setup({ tier: 'mobile' });
    expect(finish(driver).pass.dithering).toBe(true);
  });

  it('applies a new profile in place when no effect is added or removed, and asks for one frame', () => {
    const { driver } = setup({ profile: OFFICE_LOOK });
    const before = driver.passes.slice();
    const tweaked: LookProfile = { ...OFFICE_LOOK, lut: { intensity: 0.4, mobileIntensity: 0.4 }, vignette: { amount: 0.06, inner: 0.45 } };
    expect(driver.setProfile(tweaked)).toBe(true);
    expect(driver.passes).toEqual(before);
    expect(finish(driver).lut.blendMode.opacity.value).toBe(0.4);
    expect(finish(driver).vignette.amount).toBe(0.06);
    expect(driver.setProfile(tweaked), 'the same profile changes nothing').toBe(false);
  });

  it('rebuilds the finish pass when a new profile adds an effect, and frees the old one', () => {
    const { driver } = setup({ profile: CORRIDOR_LOOK });
    const old = driver.passes.find((pass) => pass.name === 'EffectPass');
    expect(driver.effectNames).toContain('LookVignetteEffect');
    expect(driver.setProfile({ ...CORRIDOR_LOOK, vignette: { amount: 0, inner: 0.5 } })).toBe(true);
    expect(driver.effectNames).not.toContain('LookVignetteEffect');
    expect(driver.passes.find((pass) => pass.name === 'EffectPass')).not.toBe(old);
  });
});

describe('exposure, size and cameras follow the frame', () => {
  it('sets the profile’s exposure for the frame, whatever the scene left it at', () => {
    const { driver, spy, scene, camera } = setup();
    const seen: number[] = [];
    driver.composer.render = vi.fn(() => {
      seen.push(spy.renderer.toneMappingExposure);
    });
    spy.renderer.toneMappingExposure = 1.8;
    driver.frame(scene, camera, 0.016);
    expect(seen).toEqual([OFFICE_LOOK.exposure]);
  });

  it('resizes the buffers when the canvas changes size, and not otherwise', () => {
    const { driver, spy, scene, camera } = setup();
    driver.composer.render = vi.fn();
    const resize = vi.spyOn(driver.composer, 'setSize');
    driver.frame(scene, camera, 0.016);
    driver.frame(scene, camera, 0.016);
    expect(resize).not.toHaveBeenCalled();
    spy.size.width = 1000;
    spy.size.ratio = 2;
    driver.frame(scene, camera, 0.016);
    expect(resize).toHaveBeenCalledTimes(1);
    driver.frame(scene, camera, 0.016);
    expect(resize).toHaveBeenCalledTimes(1);
  });

  it('hands the contact shadow and the other passes a new camera when fiber swaps it', () => {
    const { driver, scene } = setup();
    driver.composer.render = vi.fn();
    const replacement = new PerspectiveCamera(60, 1, 0.1, 80);
    driver.frame(scene, replacement, 0.016);
    const ao = driver.passes.find((pass) => pass.name === 'N8AOPostPass') as unknown as { camera: PerspectiveCamera };
    const render = driver.passes.find((pass) => pass.name === 'RenderPass') as unknown as { camera: PerspectiveCamera };
    expect(ao.camera).toBe(replacement);
    expect(render.camera).toBe(replacement);
  });
});

describe('a changed atmosphere reaches the passes that draw it', () => {
  const air = (driver: LookDriver): { profile: LookProfile['atmosphere']; dust: { material: { uniforms: Record<string, { value: unknown }> } } } =>
    driver.passes.find((pass) => pass.name === 'AtmospherePass') as unknown as { profile: LookProfile['atmosphere']; dust: { material: { uniforms: Record<string, { value: unknown }> } } };

  it('applies new cone specs and dust brightness in place, without a rebuild', () => {
    const { driver } = setup({ profile: OFFICE_LOOK });
    const pass = driver.passes.find((p) => p.name === 'AtmospherePass');
    const brighter: LookProfile = {
      ...OFFICE_LOOK,
      atmosphere: {
        ...OFFICE_LOOK.atmosphere,
        cones: { ...OFFICE_LOOK.atmosphere.cones, specs: OFFICE_LOOK.atmosphere.cones.specs.map((spec) => ({ ...spec, opacity: spec.opacity * 4 })) },
        dust: { ...OFFICE_LOOK.atmosphere.dust, brightness: 0.2 },
      },
    };
    expect(driver.setProfile(brighter)).toBe(true);
    expect(driver.passes.find((p) => p.name === 'AtmospherePass'), 'the same pass').toBe(pass);
    expect(air(driver).profile.cones.specs[0]?.opacity).toBe((OFFICE_LOOK.atmosphere.cones.specs[0]?.opacity ?? 0) * 4);
    expect(air(driver).dust.material.uniforms['brightness']?.value).toBe(0.2);
  });

  it('builds the atmosphere pass again, and frees the old one, when the dust count or the cone cap changes', () => {
    const { driver } = setup({ profile: OFFICE_LOOK });
    const old = driver.passes.find((pass) => pass.name === 'AtmospherePass');
    const freed: string[] = [];
    for (const object of collectGpuObjects(old)) object.addEventListener('dispose', () => freed.push(object.constructor.name));
    const more: LookProfile = { ...OFFICE_LOOK, atmosphere: { ...OFFICE_LOOK.atmosphere, dust: { ...OFFICE_LOOK.atmosphere.dust, count: OFFICE_LOOK.atmosphere.dust.count * 2 } } };
    expect(driver.setProfile(more)).toBe(true);
    const next = driver.passes.find((pass) => pass.name === 'AtmospherePass');
    expect(next).not.toBe(old);
    expect(freed.length, 'the old pass’s geometry and materials were freed').toBeGreaterThan(0);
    expect(air(driver).profile.dust.count).toBe(OFFICE_LOOK.atmosphere.dust.count * 2);
  });
});

describe('render-target memory', () => {
  const buffers = (driver: LookDriver): { input: WebGLRenderTarget; output: WebGLRenderTarget } => ({
    input: (driver.composer as unknown as { inputBuffer: WebGLRenderTarget }).inputBuffer,
    output: (driver.composer as unknown as { outputBuffer: WebGLRenderTarget }).outputBuffer,
  });

  it('multisamples only the buffer the scene is drawn into, and gives the other no depth', () => {
    const { driver } = setup();
    const { input, output } = buffers(driver);
    expect(input.samples).toBe(driver.plan.msaaSamples);
    expect(input.depthTexture, 'the scene target keeps its depth texture').not.toBeNull();
    expect(output.samples).toBe(0);
    expect(output.depthBuffer).toBe(false);
    expect(output.depthTexture).toBeNull();
  });

  it('keeps that after a rebuild, which recreates the composer’s depth textures', () => {
    const { driver } = setup();
    driver.setReducedMotion(true);
    const { input, output } = buffers(driver);
    expect(input.depthTexture).not.toBeNull();
    expect(output.samples).toBe(0);
    expect(output.depthTexture).toBeNull();
  });

  it('gives a phone the lower sample count on its one buffer, and no depth texture at all', () => {
    const { driver } = setup({ tier: 'mobile' });
    const { input } = buffers(driver);
    expect(input.samples).toBe(driver.plan.msaaSamples);
    expect(input.depthTexture).toBeNull();
  });
});

describe('the bloom calibration', () => {
  it('carries about half the energy of UnrealBloom at the profile’s numbers: stronger than a third, well under all of it', () => {
    expect(BLOOM_GAIN).toBeGreaterThanOrEqual(4);
    expect(BLOOM_GAIN).toBeLessThanOrEqual(6);
  });
});

describe('the light a shaft lays on surfaces', () => {
  it('reads the shafts the atmosphere pass drew this frame', () => {
    const { driver } = setup({ profile: OFFICE_LOOK });
    const internals = driver as unknown as { atmosphere: unknown; finish: { patch: { source: unknown } } };
    expect(internals.finish.patch.source, 'wired to the atmosphere pass').toBe(internals.atmosphere);
  });

  it('hands the effect the shafts of a frame: the atmosphere pass records the cones it chose, and the effect loads them', () => {
    const lamps = [{ id: 'd', kind: 'desk-lamp', position: [0, 1.4, -2], direction: [0, -1, 0] }] as const;
    const { driver, spy, camera } = setup({ profile: OFFICE_LOOK, lamps });
    type Internals = { atmosphere: { lastChosen: { spec: { lamp: string } }[]; render(renderer: WebGLRenderer, target: WebGLRenderTarget): void }; finish: { patch: { update(): void; uniforms: Map<string, { value: unknown }> } } };
    const internals = driver as unknown as Internals;
    expect(internals.atmosphere.lastChosen).toHaveLength(0);
    camera.updateMatrixWorld();
    internals.atmosphere.render(spy.renderer, new WebGLRenderTarget(4, 4));
    expect(internals.atmosphere.lastChosen.map((c) => c.spec.lamp)).toEqual(['desk-lamp']);
    internals.finish.patch.update();
    expect(internals.finish.patch.uniforms.get('patchCount')?.value, 'the effect loaded it').toBe(1);
  });

  it('is absent on a profile whose shafts carry no light, and on a phone', () => {
    expect(setup({ profile: CORRIDOR_LOOK }).driver.effectNames).not.toContain('LookLightPatchEffect');
    expect(setup({ tier: 'mobile' }).driver.effectNames).not.toContain('LookLightPatchEffect');
  });
});
