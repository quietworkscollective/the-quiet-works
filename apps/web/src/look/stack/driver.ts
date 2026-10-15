import { BlendFunction, BloomEffect, Effect, EffectComposer, EffectPass, LUT3DEffect, RenderPass, ToneMappingEffect, ToneMappingMode, type Pass } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { Color, HalfFloatType, NoToneMapping, Vector2, type Camera, type Data3DTexture, type Scene, type ToneMapping, type WebGLRenderer } from 'three';
import { AtmospherePass } from '../atmosphere/pass.ts';
import { HeightFogEffect } from '../atmosphere/heightFog.ts';
import { LightPatchEffect } from '../atmosphere/lightPatch.ts';
import type { AtmosphereLamp } from '../atmosphere/lamps.ts';
import { GrainEffect } from '../effects/grain.ts';
import { VignetteEffect } from '../effects/vignette.ts';
import { createLutTexture } from '../lut.ts';
import type { LookProfile } from '../profiles.ts';
import { planFor, type LookEffect, type LookPlan, type LookTier } from '../tier.ts';
import { markSceneTarget } from '../render.ts';

/**
 * Runs the finishing stack on pmndrs `postprocessing`: the scene once, then (desktop) the contact
 * shadow and the air, then one merged pass of every effect, the last of which writes the canvas.
 * It is plain TypeScript with no React in it, so the on-demand behaviour, the tone mapping and
 * the disposal are all testable without a browser. `LookStack` is the thin component around it.
 *
 * What it never does: schedule a frame. `frame` is called by the renderer's own loop and nothing
 * else, and nothing here owns a timer or a listener. The grain and the haze change only when a
 * frame is drawn.
 */

/** Longest step, in seconds, the haze and dust drift advances in one frame, so a frame after a long idle does not jump. */
export const MAX_DRIFT_STEP = 1 / 15;

/**
 * Bloom: pmndrs `intensity` per unit of a profile's `strength`. At 3 the glow carries about a third
 * of the energy UnrealBloom gives at the same numbers; 4.5 carries about half, so a lamp's core
 * reads as a lit bulb. The profile's strength stays inside the consult's range, so the glow is
 * still restrained, and only pixels above the threshold (lamp cores) feed it.
 */
export const BLOOM_GAIN = 4.5;
/** Bloom: pmndrs `radius` (the spread of the mip upsampling) for a profile radius. */
export const bloomRadius = (profileRadius: number): number => Math.min(1, 0.4 + 2 * profileRadius);
/** Bloom: width of the luminance knee above the threshold, in linear HDR. */
export const BLOOM_SMOOTHING = 0.05;

export interface LookDriverOptions {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: Camera;
  readonly tier: Exclude<LookTier, 'lite'>;
  readonly profile: LookProfile;
  readonly reducedMotion: boolean;
  readonly lamps?: readonly AtmosphereLamp[];
  /** Record draws per pass on every frame (for measurement; adds a little work per pass). */
  readonly instrument?: boolean;
}

/** What the last frame cost in draw calls and triangles, as three counts them. */
export interface FrameStats {
  /** Frames drawn through the stack. */
  readonly frames: number;
  /** Draw calls and triangles of the scene itself: the one pass over the geometry. */
  readonly scene: { readonly calls: number; readonly triangles: number };
  /** Draw calls and triangles of the whole frame: the scene plus every fullscreen and atmosphere draw. */
  readonly total: { readonly calls: number; readonly triangles: number };
  /** Draws per pass, in order, when instrumentation is on. */
  readonly passes: readonly { readonly name: string; readonly calls: number; readonly triangles: number }[];
}

interface FinishHandles {
  readonly pass: EffectPass;
  readonly effects: Effect[];
  readonly bloom: BloomEffect | null;
  readonly lut: LUT3DEffect | null;
  readonly vignette: VignetteEffect | null;
  readonly grain: GrainEffect | null;
  readonly fog: HeightFogEffect | null;
  readonly patch: LightPatchEffect | null;
}

export class LookDriver {
  readonly composer: EffectComposer;
  readonly tier: Exclude<LookTier, 'lite'>;
  plan: LookPlan;
  /** True once a frame threw: the stack has stood down and frames render directly. */
  failed = false;

  private readonly renderer: WebGLRenderer;
  private scene: Scene;
  private camera: Camera;
  private profile: LookProfile;
  private reducedMotion: boolean;
  private readonly instrument: boolean;
  private readonly lut: Data3DTexture;
  private readonly renderPass: RenderPass;
  private ao: N8AOPostPass | null = null;
  private atmosphere: AtmospherePass | null = null;
  private finish: FinishHandles;
  private lamps: readonly AtmosphereLamp[];
  private readonly previous: { toneMapping: ToneMapping; exposure: number; autoClear: boolean };
  private readonly size = new Vector2(-1, -1);
  private frames = 0;
  private drift = 0;
  private disposed = false;
  private stats: FrameStats = { frames: 0, scene: { calls: 0, triangles: 0 }, total: { calls: 0, triangles: 0 }, passes: [] };
  private readonly passDraws = new Map<string, { calls: number; triangles: number }>();

  constructor(options: LookDriverOptions) {
    this.renderer = options.renderer;
    this.scene = options.scene;
    this.camera = options.camera;
    this.tier = options.tier;
    this.profile = options.profile;
    this.reducedMotion = options.reducedMotion;
    this.instrument = options.instrument ?? false;
    this.lamps = options.lamps ?? [];
    this.previous = { toneMapping: this.renderer.toneMapping, exposure: this.renderer.toneMappingExposure, autoClear: this.renderer.autoClear };

    const drawing = this.renderer.getDrawingBufferSize(new Vector2());
    this.plan = planFor(this.tier, this.profile, { reducedMotion: this.reducedMotion, pixels: drawing.x * drawing.y });
    this.lut = createLutTexture();
    // The finish pass owns tone mapping from here on: the renderer's own is switched off, so a
    // frame is mapped once, by the effect, and a direct render cannot map it a second time.
    this.renderer.toneMapping = NoToneMapping;

    this.composer = new EffectComposer(this.renderer, {
      frameBufferType: HalfFloatType,
      multisampling: this.plan.msaaSamples,
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.finish = this.assemble();
    this.composer.setMainCamera(this.camera);
    this.composer.setMainScene(this.scene);
    if (this.instrument) this.instrumentPasses();
    this.syncSize();
  }

  /** Pass names in the order they run, for the tier test. */
  get passNames(): string[] {
    return this.composer.passes.map((pass) => pass.name);
  }

  get effectNames(): string[] {
    return this.finish.effects.map((effect) => effect.name);
  }

  get lastStats(): FrameStats {
    return this.stats;
  }

  /** Every pass the composer holds, for measurement. */
  get passes(): readonly Pass[] {
    return this.composer.passes;
  }

  /** Draw one frame. Called from the renderer's loop and nowhere else. */
  frame(scene: Scene, camera: Camera, deltaSeconds: number): void {
    if (this.disposed) return;
    if (this.failed) {
      this.renderer.render(scene, camera);
      return;
    }
    const renderer = this.renderer;
    const info = renderer.info;
    const autoReset = info.autoReset;
    const frameBefore = info.render.frame;
    try {
      this.syncSize();
      this.follow(scene, camera);
      this.advance(deltaSeconds);
      renderer.toneMapping = NoToneMapping;
      renderer.toneMappingExposure = this.profile.exposure;
      info.autoReset = false;
      info.reset();
      this.passDraws.clear();
      markSceneTarget(this.composer.inputBuffer);
      this.composer.render(0);
    } catch (error) {
      this.failed = true;
      console.error('[look] the finishing stack failed and has stood down:', error);
      info.autoReset = autoReset;
      renderer.toneMapping = this.previous.toneMapping;
      renderer.autoClear = true;
      renderer.render(scene, camera);
      return;
    }
    const total = { calls: info.render.calls, triangles: info.render.triangles };
    // Fullscreen passes render through `render()` too; keep the frame counter meaning "frames".
    info.render.frame = frameBefore + 1;
    info.autoReset = autoReset;
    this.frames += 1;
    const passes = [...this.passDraws.entries()].map(([name, draws]) => ({ name, ...draws }));
    const sceneDraws = this.passDraws.get(this.renderPass.name) ?? { calls: total.calls, triangles: total.triangles };
    this.stats = { frames: this.frames, scene: { calls: sceneDraws.calls, triangles: sceneDraws.triangles }, total, passes };
  }

  /**
   * Apply a new profile. Numbers change in place; a change that adds or removes an effect rebuilds
   * the finish pass. Returns whether the picture will differ, so the caller can ask for one frame.
   */
  setProfile(profile: LookProfile): boolean {
    if (this.disposed || profile === this.profile) return false;
    this.profile = profile;
    const plan = planFor(this.tier, profile, { reducedMotion: this.reducedMotion, pixels: this.drawingPixels() });
    this.applyPlan(plan);
    return true;
  }

  setReducedMotion(reduced: boolean): boolean {
    if (this.disposed || reduced === this.reducedMotion) return false;
    this.reducedMotion = reduced;
    this.applyPlan(planFor(this.tier, this.profile, { reducedMotion: reduced, pixels: this.drawingPixels() }));
    return true;
  }

  setLamps(lamps: readonly AtmosphereLamp[]): void {
    this.lamps = lamps;
    this.atmosphere?.setLamps(lamps);
  }

  setInstrumentation(on: boolean): void {
    if (on && !this.instrument) this.instrumentPasses();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const renderer = this.renderer;
    renderer.toneMapping = this.previous.toneMapping;
    renderer.toneMappingExposure = this.previous.exposure;
    renderer.autoClear = this.previous.autoClear;
    const ao = this.ao;
    this.composer.dispose();
    // N8AO keeps its full-screen quads in objects the base pass does not free.
    if (ao) disposeN8aoQuads(ao);
    this.lut.dispose();
  }

  // ---------------------------------------------------------------------------------------------

  private drawingPixels(): number {
    const size = this.renderer.getDrawingBufferSize(new Vector2());
    return size.x * size.y;
  }

  /** Build the passes after the scene pass, in plan order. */
  private assemble(): FinishHandles {
    const { plan, profile } = this;
    if (plan.stages.includes('ao')) {
      this.ao = createAo(this.scene, this.camera, profile);
      this.composer.addPass(this.ao);
    }
    if (plan.stages.includes('atmosphere')) {
      this.atmosphere = new AtmospherePass(profile.atmosphere, plan.atmosphere);
      this.atmosphere.setLamps(this.lamps);
      this.atmosphere.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.addPass(this.atmosphere);
    }
    const finish = createFinish(this.camera, plan, profile, this.lut);
    finish.patch?.setSource(this.atmosphere);
    this.composer.addPass(finish.pass);
    this.trimOutputBuffer();
    return finish;
  }

  /**
   * The composer makes its second buffer a copy of the first: multisampled, with a depth buffer
   * and a depth texture. Only the first is ever the scene's target; the second is where a pass
   * writes a finished full-screen result. Giving it none of that saves about 44 bytes a pixel,
   * which is more than 50 MiB at 1440 by 900. Done before the buffer is first used, because three
   * allocates a target's GPU memory on first use; and again after every rebuild, because the
   * composer recreates the depth textures when a depth-reading pass is added.
   */
  private trimOutputBuffer(): void {
    const output = this.composer.outputBuffer;
    output.samples = 0;
    output.depthBuffer = false;
    output.depthTexture = null;
  }

  /** Rebuild only what the new plan changes. */
  private applyPlan(plan: LookPlan): void {
    const same = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);
    const built = this.atmosphere?.built;
    const air = this.profile.atmosphere;
    const structural =
      !same(plan.stages, this.plan.stages) ||
      !same(plan.effects, this.plan.effects) ||
      plan.atmosphere.cones !== this.plan.atmosphere.cones ||
      plan.atmosphere.dust !== this.plan.atmosphere.dust ||
      (built !== undefined && (built.maxVisible !== air.cones.maxVisible || built.dustCount !== air.dust.count));
    this.plan = plan;
    if (structural) {
      this.rebuildPasses();
      return;
    }
    this.tune();
  }

  private rebuildPasses(): void {
    const composer = this.composer;
    const ao = this.ao;
    for (const pass of [...composer.passes]) {
      if (pass === this.renderPass) continue;
      composer.removePass(pass);
      pass.dispose();
    }
    if (ao) disposeN8aoQuads(ao);
    this.ao = null;
    this.atmosphere = null;
    this.finish = this.assemble();
    composer.setMainCamera(this.camera);
    composer.setMainScene(this.scene);
    if (this.instrument) this.instrumentPasses();
    this.size.set(-1, -1);
    this.syncSize();
  }

  /** Update numbers in place: no pass is added or removed. */
  private tune(): void {
    const { profile, finish } = this;
    if (this.ao) configureAo(this.ao, profile);
    this.atmosphere?.setProfile(profile.atmosphere);
    if (finish.bloom) {
      finish.bloom.intensity = profile.bloom.strength * BLOOM_GAIN;
      finish.bloom.luminanceMaterial.threshold = profile.bloom.threshold;
      finish.bloom.mipmapBlurPass.radius = bloomRadius(profile.bloom.radius);
    }
    if (finish.lut) finish.lut.blendMode.opacity.value = this.plan.lutIntensity;
    if (finish.vignette) {
      finish.vignette.amount = profile.vignette.amount;
      finish.vignette.inner = profile.vignette.inner;
    }
    if (finish.grain) finish.grain.amount = profile.grain.amount;
    finish.fog?.setAir(profile.atmosphere.heightFog, profile.atmosphere.haze, profile.atmosphere.farGlow);
  }

  private syncSize(): void {
    const size = this.renderer.getDrawingBufferSize(new Vector2());
    if (size.x === this.size.x && size.y === this.size.y) return;
    this.size.copy(size);
    this.atmosphere?.setPixelRatio(this.renderer.getPixelRatio());
    // The renderer's own size, which fiber has already set: the composer then only resizes its buffers.
    const css = this.renderer.getSize(new Vector2());
    this.composer.setSize(css.x, css.y, false);
  }

  /** Hand the passes the scene and camera when fiber swaps them. */
  private follow(scene: Scene, camera: Camera): void {
    if (scene !== this.scene) {
      this.scene = scene;
      this.composer.setMainScene(scene);
      if (this.ao) this.ao.scene = scene;
    }
    if (camera !== this.camera) {
      this.camera = camera;
      this.composer.setMainCamera(camera);
      if (this.ao) this.ao.camera = camera;
    }
  }

  /** Move the frozen things on by one authorised frame: the grain's seed, the haze and dust drift. */
  private advance(deltaSeconds: number): void {
    const { finish, profile } = this;
    if (finish.grain) finish.grain.seed = (this.frames + 1) % 65536;
    if (!this.reducedMotion) this.drift += Math.min(Math.max(deltaSeconds, 0), MAX_DRIFT_STEP);
    const haze = profile.atmosphere.haze;
    finish.fog?.setHazeOffset(haze.drift * this.drift, 0, haze.drift * 0.6 * this.drift);
    this.atmosphere?.setDrift(this.drift);
  }

  private instrumentPasses(): void {
    const info = this.renderer.info.render;
    for (const pass of this.composer.passes) {
      const original = pass.render.bind(pass) as Pass['render'];
      const draws = this.passDraws;
      pass.render = (renderer, inputBuffer, outputBuffer, deltaTime, stencilTest) => {
        const calls = info.calls;
        const triangles = info.triangles;
        original(renderer, inputBuffer, outputBuffer, deltaTime, stencilTest);
        draws.set(pass.name, { calls: info.calls - calls, triangles: info.triangles - triangles });
      };
    }
  }
}

/** The contact shadow pass, configured from the profile. */
function createAo(scene: Scene, camera: Camera, profile: LookProfile): N8AOPostPass {
  const ao = new N8AOPostPass(scene, camera, 1, 1);
  ao.name = 'N8AOPostPass';
  const { configuration } = ao;
  configuration.halfRes = true;
  ao.setQualityMode(profile.ao.quality);
  configuration.transparencyAware = false;
  // The finish pass converts to the output colour space, once; the contact shadow must not.
  configuration.gammaCorrection = false;
  configuration.accumulate = false;
  configureAo(ao, profile);
  return ao;
}

function configureAo(ao: N8AOPostPass, profile: LookProfile): void {
  ao.configuration.aoRadius = profile.ao.radius;
  ao.configuration.intensity = profile.ao.intensity;
  ao.configuration.distanceFalloff = profile.ao.distanceFalloff;
  ao.configuration.color = new Color(profile.ao.tint);
}

/** N8AO's full-screen quads are not freed by `Pass.dispose`; free their materials and geometry. */
function disposeN8aoQuads(ao: N8AOPostPass): void {
  const quads = ao as unknown as Record<string, { dispose?: () => void } | null | undefined>;
  for (const key of ['effectShaderQuad', 'poissonBlurQuad', 'effectCompositerQuad', 'depthDownsampleQuad', 'copyQuad', 'accumulationQuad', 'depthCopyPass']) {
    quads[key]?.dispose?.();
  }
}

/** The one merged pass, effects in plan order. */
function createFinish(camera: Camera, plan: LookPlan, profile: LookProfile, lut: Data3DTexture): FinishHandles {
  const effects: Effect[] = [];
  const handles: { -readonly [K in keyof FinishHandles]?: FinishHandles[K] } = {};
  for (const name of plan.effects) {
    const effect = createEffect(name, plan, profile, lut);
    effects.push(effect);
    if (effect instanceof BloomEffect) handles.bloom = effect;
    else if (effect instanceof LUT3DEffect) handles.lut = effect;
    else if (effect instanceof VignetteEffect) handles.vignette = effect;
    else if (effect instanceof GrainEffect) handles.grain = effect;
    else if (effect instanceof HeightFogEffect) handles.fog = effect;
    else if (effect instanceof LightPatchEffect) handles.patch = effect;
  }
  const pass = new EffectPass(camera, ...effects);
  pass.dithering = plan.dither;
  return { pass, effects, bloom: handles.bloom ?? null, lut: handles.lut ?? null, vignette: handles.vignette ?? null, grain: handles.grain ?? null, fog: handles.fog ?? null, patch: handles.patch ?? null };
}

function createEffect(name: LookEffect, plan: LookPlan, profile: LookProfile, lut: Data3DTexture): Effect {
  switch (name) {
    case 'light-patch':
      return new LightPatchEffect();
    case 'height-fog':
      return new HeightFogEffect({ layers: profile.atmosphere.heightFog, haze: profile.atmosphere.haze, farGlow: profile.atmosphere.farGlow });
    case 'bloom':
      return new BloomEffect({
        blendFunction: BlendFunction.ADD,
        luminanceThreshold: profile.bloom.threshold,
        luminanceSmoothing: BLOOM_SMOOTHING,
        mipmapBlur: true,
        intensity: profile.bloom.strength * BLOOM_GAIN,
        radius: bloomRadius(profile.bloom.radius),
        levels: profile.bloom.levels,
        resolutionScale: 0.5 * plan.bloomScale,
      });
    case 'tone-mapping':
      return new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    case 'lut': {
      const effect = new LUT3DEffect(lut, { blendFunction: BlendFunction.NORMAL });
      effect.blendMode.opacity.value = plan.lutIntensity;
      return effect;
    }
    case 'vignette':
      return new VignetteEffect(profile.vignette.amount, profile.vignette.inner);
    case 'grain':
      return new GrainEffect(profile.grain.amount);
  }
}
