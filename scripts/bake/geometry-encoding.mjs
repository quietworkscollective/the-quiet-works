export const BAKE_GEOMETRY_BITS = {
  position: 12,
  normal: 8,
  texcoord: 16,
  color: 8,
};

export function quantizeBakeArgs(input, output, bits = BAKE_GEOMETRY_BITS) {
  return [
    'quantize', input, output,
    '--quantize-position', String(bits.position),
    '--quantize-normal', String(bits.normal),
    '--quantize-texcoord', String(bits.texcoord),
    '--quantize-color', String(bits.color),
  ];
}
