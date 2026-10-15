import { DirectionalLight, HemisphereLight, Light, PointLight, SpotLight, Vector3, type Object3D, type Scene } from 'three';
import { buildWorld } from '../corridor/world/build.ts';
import { analyticIntensity, pointPower, spotPower, type BakeLight, type BakeManifest } from './contract.ts';

export function sceneLights(scene: Scene, space: BakeManifest['space'], includeDynamic = false): BakeLight[] {
  scene.updateMatrixWorld(true);
  const lights: BakeLight[] = [];
  scene.traverse(o => {
    if (!(o instanceof Light)) return;
    if (!includeDynamic) for (let ancestor: Object3D | null = o; ancestor; ancestor = ancestor.parent) if (ancestor.userData['bake'] === 'dynamic') return;
    const position = o.getWorldPosition(new Vector3()).toArray();
    const light: BakeLight = { type: o.type, position, colour: o.color.toArray(), intensity: o.intensity, distance: 0, decay: 2 };
    if (o instanceof PointLight || o instanceof SpotLight) { light.distance = o.distance; light.decay = o.decay; light.power = o instanceof SpotLight ? spotPower(o.intensity) : pointPower(o.intensity); }
    if (o instanceof SpotLight || o instanceof DirectionalLight) light.direction = o.target.getWorldPosition(new Vector3()).sub(o.getWorldPosition(new Vector3())).normalize().toArray();
    if (o instanceof SpotLight) { light.angle = o.angle; light.penumbra = o.penumbra; }
    if (o instanceof HemisphereLight) light.colour = o.color.clone().lerp(o.groundColor, .5).toArray();
    lights.push(light);
  });
  if (space === 'corridor') {
    for (const lamp of buildWorld().lamps) {
      const peak = Math.max(...lamp.colour);
      lights.push({ type: 'AnalyticPoint', position: [...lamp.position], colour: lamp.colour.map(c => c / peak), intensity: analyticIntensity(peak, lamp.soft), power: pointPower(analyticIntensity(peak, lamp.soft)), distance: lamp.range, decay: 2 });
    }
  }
  return lights.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
