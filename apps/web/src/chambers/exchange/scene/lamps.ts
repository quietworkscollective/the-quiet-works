import { Mesh, MeshStandardMaterial, type Color, type Object3D } from 'three';

export const LINES: readonly number[] = Array.from({ length: 12 }, (_, index) => index + 1);
export const lineNumber = (line: number) => String(line).padStart(2, '0');

export function setGlow(node: Object3D | undefined, colour: Color, intensity: number): void {
  if (!(node instanceof Mesh) || !(node.material instanceof MeshStandardMaterial)) return;
  node.material.emissive.copy(colour);
  node.material.emissiveIntensity = intensity;
}

/** The optimiser folds the twelve lamps onto one material, so each takes a copy to hold its own level. */
export function separateLamps(model: Object3D): void {
  for (const line of LINES) {
    const lamp = model.getObjectByName('line_lamp_' + lineNumber(line));
    if (lamp instanceof Mesh && lamp.material instanceof MeshStandardMaterial) lamp.material = lamp.material.clone();
  }
}
