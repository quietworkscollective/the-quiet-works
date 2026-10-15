#!/usr/bin/env node
// Builds lower-cost corridor copies of the catalogued room models. The originals stay unchanged;
// the page loads only these copies through inline glTF URLs.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { core, extensions, functions, MeshoptSimplifier, sharp, versions } from '../../../../../../../scripts/assets/lib/deps.mjs';

const { NodeIO } = core;
const { ALL_EXTENSIONS, EXTTextureWebP, KHRMeshQuantization } = extensions;
const { dequantize, dedup, prune, quantize, simplify, weld, getBounds } = functions;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(HERE, '../../../../assets');
const PLAN = {
  'bench-painted-wood': { from: 'models', triangles: 650, edge: 256, instances: 1 },
  'plant-large': { from: 'models', triangles: 1400, edge: 256, instances: 2 },
  'clock-wall': { from: 'models', triangles: 600, edge: 192, instances: 1 },
  'frame-photo-white': { from: 'models', triangles: 500, edge: 256, instances: 1 },
  'column-radiator-6': { from: 'original', triangles: 700, edge: 256, instances: 2 },
  'column-radiator-10': { from: 'original', triangles: 1000, edge: 256, instances: 4 },
  'banker-lamp': { from: 'original', triangles: 1800, edge: 256, instances: 1 },
};
const QUALITY = { baseColor: 78, normal: 82, orm: 82 };
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function countTriangles(document) {
  let total = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const indices = primitive.getIndices();
      total += (indices ? indices.getCount() : primitive.getAttribute('POSITION').getCount()) / 3;
    }
  }
  return total;
}

function sourceInfo() {
  const originals = JSON.parse(readFileSync(path.join(ASSETS, 'original/original.json'), 'utf8')).props;
  const thirdParty = JSON.parse(readFileSync(path.join(ASSETS, 'third-party.json'), 'utf8'));
  const all = new Map();
  for (const item of originals) all.set(item.id, { licence: item.licence, copyright: item.copyright });
  for (const item of thirdParty.assets) if (item.kind === 'model') all.set(item.id, { licence: item.licence, copyright: item.attribution });
  return all;
}

async function build(id, plan, sources) {
  const sourcePath = path.join(ASSETS, plan.from, `${id}.glb`);
  const sourceBytes = readFileSync(sourcePath);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const document = await io.readBinary(new Uint8Array(sourceBytes));
  const root = document.getRoot();
  const sourceTriangles = countTriangles(document);
  const drawCalls = root.listMeshes().reduce((sum, mesh) => sum + mesh.listPrimitives().length, 0);
  await document.transform(dequantize(), dedup(), prune(), weld());
  let triangles = countTriangles(document);
  for (let pass = 0; triangles > plan.triangles && pass < 10; pass += 1) {
    const ratio = Math.max(0.02, (plan.triangles / triangles) * 0.97);
    await document.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.01 * (pass + 1) ** 2, lockBorder: false }), prune());
    triangles = countTriangles(document);
  }

  document.createExtension(EXTTextureWebP).setRequired(true);
  const roles = new Map();
  for (const material of root.listMaterials()) {
    for (const texture of root.listTextures()) {
      if (material.getBaseColorTexture() === texture) roles.set(texture, 'baseColor');
      else if (material.getNormalTexture() === texture) roles.set(texture, 'normal');
      else if (material.getMetallicRoughnessTexture() === texture || material.getOcclusionTexture() === texture) roles.set(texture, 'orm');
    }
  }
  const textures = [];
  for (const texture of root.listTextures()) {
    const role = roles.get(texture) ?? 'baseColor';
    const image = sharp(Buffer.from(texture.getImage()));
    const meta = await image.metadata();
    const scale = Math.min(1, plan.edge / Math.max(meta.width, meta.height));
    const width = Math.max(1, Math.round(meta.width * scale));
    const height = Math.max(1, Math.round(meta.height * scale));
    const output = await image.resize(width, height, { kernel: 'lanczos3', fit: 'fill' }).webp({ quality: QUALITY[role], effort: 6, smartSubsample: true }).toBuffer();
    texture.setImage(new Uint8Array(output)).setMimeType('image/webp').setURI('');
    textures.push({ role, width, height, bytes: output.length });
  }

  document.createExtension(KHRMeshQuantization).setRequired(true);
  await document.transform(quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12, quantizeColor: 8 }), dedup(), prune());
  root.getAsset().generator = `UNHELD corridor decor (glTF-Transform ${versions.gltfTransform})`;
  const bounds = getBounds(root.listScenes()[0]);
  const glb = await io.writeBinary(document);
  writeFileSync(path.join(HERE, `${id}.glb`), glb);
  return {
    id,
    source: path.relative(path.resolve(HERE, '../../../../../..'), sourcePath),
    sourceSha256: sha256(sourceBytes),
    licence: sources.get(id)?.licence ?? 'unknown',
    copyright: sources.get(id)?.copyright,
    sha256: sha256(Buffer.from(glb)),
    bytes: glb.length,
    sourceBytes: sourceBytes.length,
    triangles,
    sourceTriangles,
    instances: plan.instances,
    drawCalls,
    textureEdge: plan.edge,
    textures,
    dimensions: [0, 1, 2].map((i) => Math.round((bounds.max[i] - bounds.min[i]) * 10000) / 10000),
  };
}

const ids = process.argv.length > 2 ? process.argv.slice(2) : Object.keys(PLAN);
const sources = sourceInfo();
const manifest = { models: {}, tools: { 'glTF-Transform': versions.gltfTransform, sharp: versions.sharp } };
for (const id of ids) {
  const plan = PLAN[id];
  if (!plan) throw new Error(`no corridor decor plan for ${id}`);
  const entry = await build(id, plan, sources);
  manifest.models[id] = entry;
  console.log(`${id.padEnd(20)} ${String(entry.sourceTriangles).padStart(6)} -> ${String(entry.triangles).padStart(5)} triangles   ${(entry.sourceBytes / 1000).toFixed(0).padStart(4)} kB -> ${(entry.bytes / 1000).toFixed(0).padStart(4)} kB`);
}
writeFileSync(path.join(HERE, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
