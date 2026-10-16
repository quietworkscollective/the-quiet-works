import { expect, it } from 'vitest';
import { officeAssetSlot, OFFICE_SUPPORT_HARDWARE } from './assetSlots.ts';

const slot = (id: string) => officeAssetSlot(id);
const modelBottom = (id: string, localY: number) => {
  const value = slot(id);
  return value.position[1] + (value.modelOffset?.[1] ?? 0) + (value.modelScale?.[1] ?? 1) * localY;
};

it('gives the pull-out routing tray visible runners and contact shadow', () => {
  const tray=slot('routing-tray');
  expect(tray.support?.target).toBe('tray-runners');
  expect(tray.position[1]-.008).toBeCloseTo(tray.support?.surfaceY ?? 0,3);
  expect(OFFICE_SUPPORT_HARDWARE.trayRunners).toHaveLength(2);
  for(const runner of OFFICE_SUPPORT_HARDWARE.trayRunners) expect(runner.position[1]+runner.size[1]/2).toBeCloseTo(tray.support?.surfaceY ?? 0,3);
  expect(tray.support?.contactShadow).toBeDefined();
});

it('rests the loose file stack on the attended cabinet with a contact shadow', () => {
  const stack=slot('attended-stack');
  expect(modelBottom('attended-stack', -.225)).toBeCloseTo(1.325, 3);
  expect(stack.support?.target).toBe('attended-cabinet');
  expect(stack.support?.surfaceY).toBe(1.325);
  expect(stack.support?.contactShadow).toBeDefined();
});

it('rests the stationery on the desk and anchors it with a contact shadow', () => {
  const stationery=slot('pencil-cup');
  expect(modelBottom('pencil-cup', 0)).toBeCloseTo(.82, 3);
  expect(stationery.support?.target).toBe('office-desk');
  expect(stationery.support?.surfaceY).toBe(.82);
  expect(stationery.support?.contactShadow).toBeDefined();
});

it('mounts the anglepoise to the window sill with a contact shadow', () => {
  const lamp=slot('archive-anglepoise');
  expect(lamp.support?.target).toBe('lamp-sill-clamp');
  expect(modelBottom('archive-anglepoise', 0)).toBeCloseTo(1.084, 3);
  expect(OFFICE_SUPPORT_HARDWARE.lampSillClamp[0].position[1]+OFFICE_SUPPORT_HARDWARE.lampSillClamp[0].size[1]/2).toBeCloseTo(1.084,3);
  expect(OFFICE_SUPPORT_HARDWARE.lampSillClamp[1].position[2]).toBeLessThan(officeAssetSlot('certificate-sign').position[2]);
  expect(lamp.support?.contactShadow).toBeDefined();
});

it('keeps the box files in contact with the records cabinet', () => {
  for (const id of ['archive-file-a', 'archive-file-b']) {
    const file=slot(id);
    expect(modelBottom(id, -.0002)).toBeCloseTo(1.325, 3);
    expect(file.support?.target).toBe('records-cabinet');
    expect(file.support?.surfaceY).toBe(1.325);
    expect(file.support?.contactShadow).toBeDefined();
  }
});
