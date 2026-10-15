import { afterEach, expect, it, vi } from 'vitest';
import { BoxGeometry, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, Texture, type WebGLRenderTarget, type WebGLRenderer } from 'three';
import { markSceneTarget } from '../../../look/render.ts';
import { whenOfficeReady } from './ready.ts';

afterEach(() => vi.unstubAllGlobals());

function harness() {
  let serial = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { frames.set(++serial, fn); return serial; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  const tick = async () => {
    const batch = [...frames.values()]; frames.clear();
    batch.forEach(fn => fn(0));
    await Promise.resolve(); await Promise.resolve();
  };
  const image = { width: 32, height: 32, complete: false };
  const texture = new Texture(image as unknown as HTMLImageElement); texture.needsUpdate = true;
  const scene = new Scene();
  const material = new MeshStandardMaterial({ map: texture });
  scene.add(new Mesh(new BoxGeometry(), material));
  const camera = new PerspectiveCamera();
  const uploaded = new Map<Texture, { __webglTexture?: object; __version?: number }>();
  const compiled = { current: false };
  let resolveCompile!: () => void;
  const compilation = new Promise<void>(resolve => { resolveCompile = () => { compiled.current = true; resolve(); }; });
  const renderer = {
    info: { render: { frame: 12 } },
    properties: { get: (t: Texture) => uploaded.get(t) ?? {} },
    initTexture: vi.fn((t: Texture) => { if (image.complete) uploaded.set(t, { __webglTexture: {}, __version: t.version }); }),
    extensions: { has: vi.fn(() => true) },
    compile: vi.fn(),
    compileAsync: vi.fn(() => compilation),
    getRenderTarget: (): WebGLRenderTarget | null => null,
  };
  const gl = renderer as unknown as WebGLRenderer;
  const done = vi.fn(), invalidate = vi.fn(), onError = vi.fn();
  const fonts = { ready: true };
  const off = whenOfficeReady(gl, done, { scene, camera, fontsReady: () => fonts.ready, invalidate, onError });
  const draw = () => {
    renderer.info.render.frame++;
    scene.onAfterRender(gl, scene, camera, null!, null!, null!);
  };
  const dispose = () => { off(); material.dispose(); texture.dispose(); (scene.children[0] as Mesh).geometry.dispose(); };
  return { tick, image, texture, scene, camera, renderer, gl, done, invalidate, onError, fonts, resolveCompile, draw, dispose };
}

it('never signals ready while a scene texture is incomplete, even after offscreen renderer frames', async () => {
  const h = harness();
  await h.tick(); h.draw(); h.draw(); await h.tick();
  expect(h.done, 'a global render counter does not prove textures are complete').not.toHaveBeenCalled();
  expect(h.renderer.initTexture).not.toHaveBeenCalled();
  h.dispose();
});

it('waits for canvas fonts, uploads textures and waits for material compilation', async () => {
  const h = harness(); h.image.complete = true; h.fonts.ready = false;
  await h.tick(); h.draw();
  expect(h.done).not.toHaveBeenCalled(); expect(h.renderer.initTexture).not.toHaveBeenCalled();
  h.fonts.ready = true; await h.tick();
  expect(h.renderer.initTexture).toHaveBeenCalledWith(h.texture);
  expect(h.renderer.compileAsync).toHaveBeenCalledWith(h.scene, h.camera);
  h.draw(); h.draw(); expect(h.done).not.toHaveBeenCalled();
  h.resolveCompile(); await h.tick();
  h.draw(); expect(h.done).not.toHaveBeenCalled();
  h.draw(); expect(h.done).toHaveBeenCalledOnce();
  h.draw(); expect(h.done).toHaveBeenCalledOnce();
  h.dispose();
});

it('does not count another scene or a render target as a completed room frame', async () => {
  const h = harness(); h.image.complete = true; await h.tick(); h.resolveCompile(); await h.tick();
  h.scene.onAfterRender(h.gl, new Scene(), h.camera, null!, null!, null!);
  h.scene.onAfterRender(h.gl, h.scene, new PerspectiveCamera(), null!, null!, null!);
  const getTarget = h.renderer.getRenderTarget; h.renderer.getRenderTarget = () => ({}) as WebGLRenderTarget;
  h.draw(); h.draw(); expect(h.done).not.toHaveBeenCalled();
  h.renderer.getRenderTarget = getTarget;
  h.draw(); expect(h.done).not.toHaveBeenCalled(); h.draw(); expect(h.done).toHaveBeenCalledOnce();
  h.dispose();
});

it('counts frames the finishing stack draws into its scene buffer on the way to the screen', async () => {
  const h = harness(); h.image.complete = true; await h.tick(); h.resolveCompile(); await h.tick();
  const sceneBuffer = {} as WebGLRenderTarget;
  markSceneTarget(sceneBuffer);
  h.renderer.getRenderTarget = () => sceneBuffer;
  h.draw(); expect(h.done).not.toHaveBeenCalled();
  h.draw(); expect(h.done, 'with the stack mounted the room is drawn offscreen first, then shown').toHaveBeenCalledOnce();
  h.dispose();
});

it('cancels pending preparation and restores the room render hook on leave', async () => {
  const h = harness(); h.image.complete = true; await h.tick();
  const hook = h.scene.onAfterRender;
  h.dispose(); h.resolveCompile(); await h.tick(); h.draw(); h.draw();
  expect(h.done).not.toHaveBeenCalled(); expect(h.invalidate).not.toHaveBeenCalled();
  expect(h.scene.onAfterRender).not.toBe(hook);
});

it('counts the finishing stack main-camera target but reveals only after its complete output frame', async () => {
 const h=harness();h.dispose();h.image.complete=true;
 let complete: (()=>void)|undefined;
 const done=vi.fn();
 const off=whenOfficeReady(h.gl,done,{scene:h.scene,camera:h.camera,fontsReady:()=>true,invalidate:h.invalidate,onError:h.onError,
  acceptRenderTarget:()=>true,afterFrame:callback=>{complete=callback;}});
 h.renderer.getRenderTarget=()=>({}) as WebGLRenderTarget;
 await h.tick();h.resolveCompile();await h.tick();
 h.draw();h.draw();expect(done).not.toHaveBeenCalled();expect(complete).toBeTypeOf('function');
 complete?.();expect(done).toHaveBeenCalledOnce();off();
});


it('prepares shaders synchronously when parallel compilation is unavailable, still requiring two frames', async () => {
  const h = harness(); h.image.complete = true;
  h.renderer.extensions.has.mockReturnValue(false);
  await h.tick();
  expect(h.renderer.extensions.has).toHaveBeenCalledWith('KHR_parallel_shader_compile');
  expect(h.renderer.compileAsync, 'the optional extension must not be requested on an unsupported renderer').not.toHaveBeenCalled();
  expect(h.renderer.compile).toHaveBeenCalledWith(h.scene, h.camera);
  expect(h.done).not.toHaveBeenCalled();
  h.draw(); expect(h.done).not.toHaveBeenCalled();
  h.draw(); expect(h.done).toHaveBeenCalledOnce();
  h.dispose();
});
