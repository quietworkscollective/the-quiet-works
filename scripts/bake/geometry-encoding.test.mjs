import { test } from 'node:test';
import assert from 'node:assert/strict';
import { core, extensions, functions } from '../assets/lib/deps.mjs';
import { BAKE_GEOMETRY_BITS, quantizeBakeArgs } from './geometry-encoding.mjs';

test('pins the corridor geometry encoding flags used by the bake pipeline', () => {
  assert.deepEqual(quantizeBakeArgs('baked.glb', 'quantized.glb'), [
    'quantize', 'baked.glb', 'quantized.glb',
    '--quantize-position', '12',
    '--quantize-normal', '8',
    '--quantize-texcoord', '16',
    '--quantize-color', '8',
  ]);
});

test('allows the corridor, Office and Annex room to keep their measured encoding precision', () => {
  assert.deepEqual(quantizeBakeArgs('baked.glb', 'quantized.glb', { position: 14, normal: 10, texcoord: 14, color: 8 }), [
    'quantize', 'baked.glb', 'quantized.glb',
    '--quantize-position', '14',
    '--quantize-normal', '10',
    '--quantize-texcoord', '14',
    '--quantize-color', '8',
  ]);
});

test('12-bit positions stay within 13 mm over a 100 m span and 8-bit normals within 0.015 radians', async () => {
  const { Document } = core;
  const { KHRMeshQuantization } = extensions;
  const { getBounds, quantize } = functions;
  const document = new Document();
  const buffer = document.createBuffer();
  const position = new Float32Array([0, 0, 0, 100, 0, 0, 50.01, 1.23, 0, 75.12, 50.45, 10.9]);
  const normals = new Float32Array([0, 0, 1, 0.1, 0.2, 0.97, -0.3, 0.9, 0.2, 0, 1, 0]);
  const primitive = document.createPrimitive()
    .setAttribute('POSITION', document.createAccessor('position').setType('VEC3').setArray(position).setBuffer(buffer))
    .setAttribute('NORMAL', document.createAccessor('normal').setType('VEC3').setArray(normals).setBuffer(buffer));
  const mesh = document.createMesh().addPrimitive(primitive);
  const scene = document.createScene().addChild(document.createNode().setMesh(mesh));
  const before = getBounds(scene);
  document.createExtension(KHRMeshQuantization).setRequired(true);
  await document.transform(quantize({
    quantizePosition: BAKE_GEOMETRY_BITS.position,
    quantizeNormal: BAKE_GEOMETRY_BITS.normal,
    quantizeTexcoord: BAKE_GEOMETRY_BITS.texcoord,
    quantizeColor: BAKE_GEOMETRY_BITS.color,
  }));
  const after = getBounds(scene);
  const boundsError = Math.max(...before.min.map((value, axis) => Math.abs(value - (after.min[axis] ?? 0))), ...before.max.map((value, axis) => Math.abs(value - (after.max[axis] ?? 0))));
  assert.ok(boundsError <= 0.013, `position bounds error ${boundsError} m`);

  const quantized = primitive.getAttribute('NORMAL');
  let maxAngle = 0;
  for (let index = 0; index < quantized.getCount(); index += 1) {
    const source = [normals[index * 3] ?? 0, normals[index * 3 + 1] ?? 0, normals[index * 3 + 2] ?? 0];
    const decoded = quantized.getElement(index, []);
    const sourceLength = Math.hypot(...source);
    const decodedLength = Math.hypot(...decoded);
    const cosine = ((source[0] ?? 0) * (decoded[0] ?? 0) + (source[1] ?? 0) * (decoded[1] ?? 0) + (source[2] ?? 0) * (decoded[2] ?? 0)) / (sourceLength * decodedLength);
    maxAngle = Math.max(maxAngle, Math.acos(Math.max(-1, Math.min(1, cosine))));
  }
  assert.ok(maxAngle < 0.015, `normal angle error ${maxAngle} rad`);
});
