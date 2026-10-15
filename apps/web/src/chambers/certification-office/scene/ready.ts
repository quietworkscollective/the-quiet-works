import { Texture, type Camera, type Material, type Object3D, type Scene, type WebGLRenderer } from 'three';
import { isOnScreenSceneTarget } from '../../../look/render.ts';

export interface ReadyResources {
  scene: Scene;
  camera: Camera;
  fontsReady(): boolean;
  renderReady?(): boolean;
  acceptRenderTarget?(): boolean;
  afterFrame?(complete: () => void): void;
  invalidate(): void;
  onError(error: unknown): void;
}

function imageComplete(image: unknown): boolean {
  if (Array.isArray(image)) return image.length > 0 && image.every(imageComplete);
  if (!image || typeof image !== 'object') return false;
  const source = image as { complete?: boolean; width?: number; height?: number; readyState?: number };
  return source.complete !== false && (source.readyState === undefined || source.readyState >= 2) &&
    (source.width ?? 0) > 0 && (source.height ?? 0) > 0;
}

function sceneTextures(scene: Scene): Texture[] {
  const textures = new Set<Texture>();
  const take = (value: unknown) => {
    if (value instanceof Texture) textures.add(value);
    else if (Array.isArray(value)) value.forEach(item => { if (item instanceof Texture) textures.add(item); });
  };
  const materialTextures = (material: Material) => {
    Object.values(material).forEach(take);
    const uniforms = (material as Material & { uniforms?: Record<string, { value: unknown }> }).uniforms;
    if (uniforms) Object.values(uniforms).forEach(uniform => take(uniform.value));
  };
  take(scene.environment); take(scene.background);
  scene.traverse(object => {
    const material = (object as Object3D & { material?: Material | Material[] }).material;
    if (!material) return;
    (Array.isArray(material) ? material : [material]).forEach(materialTextures);
  });
  return [...textures];
}

/** Native resource preparation and two completed main-camera frames, never PMREM's frame count. */
export function whenOfficeReady(gl: WebGLRenderer, done: () => void, resources: ReadyResources): () => void {
  const { scene, camera } = resources;
  const previous = scene.onAfterRender;
  let cancelled = false, compiling = false, prepared = false, frames = 0, raf = 0;
  let lastFrame = -1;
  let versions = new Map<Texture, number>();
  const timeout = setTimeout(() => fail(new Error('Office resources did not finish preparation')), 60_000);
  const uploaded = (texture: Texture) => {
    const data = gl.properties.get(texture) as { __webglTexture?: unknown; __version?: number };
    return Boolean(data.__webglTexture) && (texture.isRenderTargetTexture || data.__version === texture.version);
  };
  function clean() {
    cancelled = true;
    cancelAnimationFrame(raf); clearTimeout(timeout);
    if (scene.onAfterRender === after) scene.onAfterRender = previous;
  }
  function fail(error: unknown) { if (!cancelled) { clean(); resources.onError(error); } }
  function prepare() {
    if (cancelled || compiling) return;
    const textures = sceneTextures(scene);
    if (!resources.fontsReady() || resources.renderReady?.() === false || textures.some(texture => !texture.isRenderTargetTexture && !imageComplete(texture.image))) {
      raf = requestAnimationFrame(prepare); return;
    }
    try {
      textures.forEach(texture => { if (!texture.isRenderTargetTexture) gl.initTexture(texture); });
      if (!textures.every(uploaded)) { raf = requestAnimationFrame(prepare); return; }
      compiling = true;
      // Parallel compilation is optional; compile() prepares the same materials without requesting it.
      const compilation = gl.extensions.has('KHR_parallel_shader_compile')
        ? gl.compileAsync(scene, camera)
        : Promise.resolve(gl.compile(scene, camera));
      void compilation.then(() => {
        compiling = false;
        if (cancelled) return;
        versions = new Map(textures.map(texture => [texture, texture.version]));
        prepared = true; frames = 0; resources.invalidate();
      }, fail);
    } catch (error) { fail(error); }
  }
  const after: Scene['onAfterRender'] = (...args) => {
    previous.apply(scene, args);
    if (cancelled || !prepared || args[0] !== gl || args[1] !== scene || args[2] !== camera || (!isOnScreenSceneTarget(gl.getRenderTarget()) && !resources.acceptRenderTarget?.())) return;
    const textures = sceneTextures(scene);
    if (!resources.fontsReady() || textures.length !== versions.size || textures.some(texture =>
      versions.get(texture) !== texture.version || !uploaded(texture) || (!texture.isRenderTargetTexture && !imageComplete(texture.image)))) {
      prepared = false; frames = 0; raf = requestAnimationFrame(prepare); return;
    }
    const frame = gl.info.render.frame;
    if (frame === lastFrame) return;
    lastFrame = frame; frames++;
    if (frames === 2) {
      clean();
      if (resources.afterFrame) resources.afterFrame(done); else done();
    }
    else resources.invalidate();
  };
  scene.onAfterRender = after;
  raf = requestAnimationFrame(prepare);
  return clean;
}
