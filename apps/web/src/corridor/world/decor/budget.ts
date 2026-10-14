import manifest from './lod/manifest.json';

export const DECOR_MODEL_IDS = [
  'bench-painted-wood',
  'plant-large',
  'clock-wall',
  'frame-photo-white',
  'column-radiator-6',
  'column-radiator-10',
  'banker-lamp',
] as const;

export const DECOR_TRIANGLES = DECOR_MODEL_IDS.reduce((sum, id) => {
  const model = manifest.models[id];
  return sum + model.triangles * model.instances;
}, 0);

export const DECOR_DRAW_CALLS = DECOR_MODEL_IDS.reduce((sum, id) => {
  const model = manifest.models[id];
  return sum + model.drawCalls * model.instances;
}, 0);
