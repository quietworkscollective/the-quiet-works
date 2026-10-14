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
import { PALETTE } from './palette.ts';

export interface Environment {
  texture: Texture;
  dispose(): void;
}

/**
 * A tiny procedural studio for metal to reflect: a dark room, one warm softbox where the lamp
 * hangs, a cool teal strip behind-right, and a pale slit of far window. Prefiltered once with
 * PMREM; the scene itself has no environment lighting, so this only shows up in reflections.
 */
export function buildEnvironment(renderer: WebGLRenderer): Environment {
  const scene = new Scene();
  const disposables: Array<{ dispose(): void }> = [];

  const room = new Mesh(
    new BoxGeometry(12, 7, 12),
    new MeshBasicMaterial({ color: new Color('#0c1014'), side: BackSide }),
  );
  scene.add(room);
  disposables.push(room.geometry, room.material);

  const panel = (width: number, height: number, color: string, gain: number): Mesh => {
    const material = new MeshBasicMaterial({ color: new Color(color).multiplyScalar(gain), side: DoubleSide });
    const mesh = new Mesh(new PlaneGeometry(width, height), material);
    disposables.push(mesh.geometry, material);
    return mesh;
  };

  const softbox = panel(2.6, 1.6, PALETTE.lampWarm, 7);
  softbox.position.set(-1.4, 3, 0.4);
  softbox.lookAt(0, 0, 0);
  scene.add(softbox);

  const warmBounce = panel(2.2, 0.8, PALETTE.amber, 1.2);
  warmBounce.position.set(-2.8, 0.4, 1.8);
  warmBounce.lookAt(0, 0, 0);
  scene.add(warmBounce);

  const tealStrip = panel(0.5, 3.6, PALETTE.rim, 3.2);
  tealStrip.position.set(3.4, 1.4, -2.6);
  tealStrip.lookAt(0, 0.4, 0);
  scene.add(tealStrip);

  const farWindow = panel(2.2, 0.35, '#dfe6e4', 0.9);
  farWindow.position.set(0.4, 1.2, -4.6);
  farWindow.lookAt(0, 0.4, 0);
  scene.add(farWindow);

  const generator = new PMREMGenerator(renderer);
  const target = generator.fromScene(scene, 0.035);
  generator.dispose();
  for (const item of disposables) item.dispose();

  return {
    texture: target.texture,
    dispose: () => target.dispose(),
  };
}
