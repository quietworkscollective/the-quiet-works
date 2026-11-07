import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { LINES, lineNumber, separateLamps, setGlow } from './lamps.ts';

function boardWithSharedLampMaterial(): Group {
  const shared = new MeshStandardMaterial();
  const group = new Group();
  for (const line of LINES) {
    const lamp = new Mesh(new BoxGeometry(), shared);
    lamp.name = 'line_lamp_' + lineNumber(line);
    group.add(lamp);
  }
  return group;
}

const level = (board: Group, line: number) =>
  ((board.getObjectByName('line_lamp_' + lineNumber(line)) as Mesh).material as MeshStandardMaterial).emissiveIntensity;

describe('Exchange line lamps', () => {
  it('lets one lamp stand out although the model gives all twelve one material', () => {
    const board = boardWithSharedLampMaterial();
    separateLamps(board);
    const colour = new Color('#ffb265');
    for (const line of LINES) setGlow(board.getObjectByName('line_lamp_' + lineNumber(line)), colour, line === 3 ? 1.6 : 0.56);
    expect(level(board, 3)).toBe(1.6);
    expect(level(board, 2)).toBe(0.56);
    expect(level(board, 12)).toBe(0.56);
  });
});
