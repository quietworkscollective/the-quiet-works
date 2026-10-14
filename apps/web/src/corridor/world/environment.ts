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
import { kelvinToLinear } from './colour.ts';

export interface Environment {
  texture: Texture;
  dispose(): void;
}

/**
 * A small procedural corridor for glossy things to reflect: a dark long box, a row of warm lamp
 * panels down each wall at sconce height, a faint cool ceiling strip. It is prefiltered once with
 * PMREM and only ever shows up in reflections (brass, enamel, glass, polished floor); the scene
 * itself has no environment lighting, so it cannot lift the shadows.
 */
export function buildEnvironment(renderer: WebGLRenderer): Environment {
  const scene = new Scene();
  const disposables: { dispose(): void }[] = [];

  const room = new Mesh(new BoxGeometry(3.2, 3.8, 40), new MeshBasicMaterial({ color: new Color('#0d1112'), side: BackSide }));
  scene.add(room);
  disposables.push(room.geometry, room.material);

  const panel = (width: number, height: number, colour: Color, gain: number): Mesh => {
    const material = new MeshBasicMaterial({ color: colour.clone().multiplyScalar(gain), side: DoubleSide });
    const mesh = new Mesh(new PlaneGeometry(width, height), material);
    disposables.push(mesh.geometry, material);
    return mesh;
  };

  const warm = new Color(...kelvinToLinear(2700));
  for (const side of [-1, 1]) {
    for (let k = 0; k < 6; k += 1) {
      const lamp = panel(0.34, 0.6, warm, 2.6);
      lamp.position.set(side * 1.58, 0.35, -2 - k * 3.4 - (side > 0 ? 1.7 : 0));
      lamp.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      scene.add(lamp);
    }
  }
  const ceiling = panel(1.6, 30, new Color('#9aa6a6'), 0.16);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 1.88, -2);
  scene.add(ceiling);
  const far = panel(1.0, 1.6, new Color('#2b3a3b'), 0.5);
  far.position.set(0, 0, -19.9);
  scene.add(far);

  const generator = new PMREMGenerator(renderer);
  const target = generator.fromScene(scene, 0.03);
  generator.dispose();
  for (const item of disposables) item.dispose();
  return { texture: target.texture, dispose: () => target.dispose() };
}
