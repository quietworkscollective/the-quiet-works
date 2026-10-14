// Which file inside an ambientCG archive holds which map, and which maps a surface plan uses.
export const AMBIENTCG_SUFFIX = {
  albedo: 'Color',
  normal: 'NormalGL', // OpenGL convention, which three.js expects. Never the DX file.
  rough: 'Roughness',
  ao: 'AmbientOcclusion',
  metal: 'Metalness',
};

export function ambientMemberName(slug, attribute, role) {
  return `${slug}_${attribute}_${AMBIENTCG_SUFFIX[role]}.jpg`;
}

/** The maps a surface plan reads from its source. */
export function planMaps(entry) {
  return [...new Set(entry.maps)];
}
