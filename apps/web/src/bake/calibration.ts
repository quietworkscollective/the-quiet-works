import { FloatType, Mesh, MeshLambertMaterial, NoToneMapping, OrthographicCamera, PlaneGeometry, PointLight, SpotLight, RGBAFormat, Scene, WebGLRenderer, WebGLRenderTarget } from 'three';
import { pointPower, spotPower } from '../baked/contract.ts';

export function measurePhysicalLight(kind: 'point' | 'spot' = 'point') {
  const scene = new Scene();
  const geometry = new PlaneGeometry(1, 1);
  const material = new MeshLambertMaterial({ color: 0xffffff });
  scene.add(new Mesh(geometry, material));
  const light = kind === 'point' ? new PointLight(0xffffff, 10, 0, 2) : new SpotLight(0xffffff, 10, 0, .62, .75, 2);
  light.position.set(0, 0, 2);
  scene.add(light);
  const camera = new OrthographicCamera(-.5, .5, .5, -.5, .1, 10);
  camera.position.set(0, 0, 4);
  const renderer = new WebGLRenderer();
  renderer.toneMapping = NoToneMapping;
  renderer.setSize(32, 32);
  const target = new WebGLRenderTarget(32, 32, { type: FloatType, format: RGBAFormat });
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  const pixel = new Float32Array(4);
  renderer.readRenderTargetPixels(target, 16, 16, 1, 1, pixel);
  const irradiance = (pixel[0] ?? 0) * Math.PI;
  target.dispose(); geometry.dispose(); material.dispose(); light.dispose(); renderer.dispose(); renderer.forceContextLoss();
  return { irradiance, expected: 2.5, blenderPower: kind === 'point' ? pointPower(10) : spotPower(10), tolerance: .03 };
}
