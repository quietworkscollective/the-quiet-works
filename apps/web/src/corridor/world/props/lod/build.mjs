#!/usr/bin/env node
// Builds the props' lighter copies of the ready-made models.
//
//   node apps/web/src/corridor/world/props/lod/build.mjs [id ...]
//
// The twelve props share a budget of about 25,000 triangles. The ready-made models were built as
// stand-alone hero or small props (up to 15,000 and 3,000 triangles, with 1K and 512 px textures),
// which is more than a prop seen from a metre or two needs, and the props repack every model's
// textures into one atlas cell of 128 to 512 px. So each model is copied here at what the corridor
// can use: simplified to the triangle count in `PLAN`, and its textures resized to its atlas cell
// (see ../modelAtlasLayout.ts) and re-encoded as WebP. The originals are untouched; the copies are
// what the props load (../modelSources.ts).
//
// Same tools as scripts/assets/build.mjs (glTF-Transform, meshoptimizer's simplifier and sharp,
// run here in Node at build time; the page never runs them). No Draco, meshopt or KTX2 in the
// output: their decoders are WebAssembly, which the site's policy forbids.
//
// Source of each copy, its licence and what was done to it are recorded in lod.json.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { core, extensions, functions, MeshoptSimplifier, sharp, versions } from '../../../../../../../scripts/assets/lib/deps.mjs';
import { MODEL_EDGE } from '../modelAtlasLayout.ts';

const { NodeIO } = core;
const { ALL_EXTENSIONS, EXTTextureWebP, KHRMeshQuantization } = extensions;
const { dedup, dequantize, prune, quantize, simplify, weld, getBounds } = functions;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(HERE, '../../../../assets');

/**
 * `triangles`: what the prop can spend on the model. A model already under it is copied as it is.
 * `from`: which library it comes from. Where a shape is mostly flat plates (a shield) or tiny (a
 * ball), the target is lower than its size alone would suggest.
 */
const PLAN = {
  'trophy-cup-tall': { from: 'original', triangles: 450 },
  'trophy-cup-squat': { from: 'original', triangles: 350 },
  'trophy-shield': { from: 'original', triangles: 250 },
  'trophy-plinth-small': { from: 'original', triangles: 300 },
  'cricket-bat': { from: 'original', triangles: 400 },
  'cricket-stumps': { from: 'original', triangles: 350 },
  'cricket-ball': { from: 'original', triangles: 100 },
  scorebook: { from: 'original', triangles: 100 },
  'toolbox-metal': { from: 'models', triangles: 450 },
  'glove-work': { from: 'models', triangles: 400 },
  'watering-can': { from: 'models', triangles: 450 },
};

/** WebP quality by texture role: normals and the packed occlusion, roughness and metalness map are data. */
const QUALITY = { baseColor: 78, normal: 84, orm: 84 };

const countTriangles = (document) => {
  let total = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const indices = primitive.getIndices();
      total += (indices ? indices.getCount() : primitive.getAttribute('POSITION').getCount()) / 3;
    }
  }
  return total;
};

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

async function build(id, plan, manifestSources) {
  const sourcePath = path.join(ASSETS, plan.from === 'original' ? 'original' : 'models', `${id}.glb`);
  const sourceBytes = readFileSync(sourcePath);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const document = await io.readBinary(new Uint8Array(sourceBytes));
  const root = document.getRoot();
  const before = countTriangles(document);
  const edge = MODEL_EDGE[id] ?? 256;

  // Simplification wants plain float positions: undo the source's quantisation, then redo it.
  await document.transform(dequantize(), dedup(), prune(), weld());

  // Simplify in as many passes as it takes to reach the target, loosening the error each time.
  let triangles = countTriangles(document);
  for (let attempt = 0; triangles > plan.triangles && attempt < 10; attempt += 1) {
    const ratio = Math.max(0.02, (plan.triangles / triangles) * 0.97);
    await document.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.01 * (attempt + 1) ** 2, lockBorder: false }), prune());
    triangles = countTriangles(document);
  }

  // Textures: the colour map at the atlas cell's edge, the data maps at the same (they share the cell).
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
    const scale = Math.min(1, edge / Math.max(meta.width, meta.height));
    const width = Math.max(1, Math.round(meta.width * scale));
    const height = Math.max(1, Math.round(meta.height * scale));
    const out = await image.resize(width, height, { kernel: 'lanczos3', fit: 'fill' }).webp({ quality: QUALITY[role], effort: 6, smartSubsample: true }).toBuffer();
    texture.setImage(new Uint8Array(out)).setMimeType('image/webp').setURI('');
    textures.push({ role, width, height, bytes: out.length });
  }

  document.createExtension(KHRMeshQuantization).setRequired(true);
  await document.transform(quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12 }), dedup(), prune());
  root.getAsset().generator = `UNHELD props lod (glTF-Transform ${versions.gltfTransform})`;

  const scene = root.listScenes()[0];
  const bounds = getBounds(scene);
  const glb = await io.writeBinary(document);
  const out = path.join(HERE, `${id}.glb`);
  writeFileSync(out, glb);
  return {
    id,
    source: path.relative(path.resolve(HERE, '../../../../../..'), sourcePath),
    sourceSha256: sha256(sourceBytes),
    licence: manifestSources[id]?.licence ?? 'unknown',
    copyright: manifestSources[id]?.copyright,
    sha256: sha256(Buffer.from(glb)),
    bytes: glb.length,
    sourceBytes: sourceBytes.length,
    triangles,
    sourceTriangles: before,
    textureEdge: edge,
    textures,
    dimensions: [0, 1, 2].map((i) => Math.round((bounds.max[i] - bounds.min[i]) * 10000) / 10000),
    done: ['dequantised, welded', `simplified from ${before} to ${triangles} triangles`, `textures resized to at most ${edge} px and re-encoded as WebP`, 'geometry re-quantised'],
  };
}

const ids = process.argv.length > 2 ? process.argv.slice(2) : Object.keys(PLAN);
const originals = JSON.parse(readFileSync(path.join(ASSETS, 'original', 'original.json'), 'utf8')).props;
const thirdParty = JSON.parse(readFileSync(path.join(ASSETS, 'third-party.json'), 'utf8'));
const sources = {};
for (const p of originals) sources[p.id] = { licence: p.licence, copyright: p.copyright };
for (const entry of thirdParty.assets) {
  if (entry.kind === 'model') sources[entry.id] = { licence: entry.licence, copyright: entry.attribution };
}
const manifestFile = path.join(HERE, 'lod.json');
let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
} catch {
  manifest = { models: {} };
}
manifest.models = Object.fromEntries(Object.entries(manifest.models ?? {}).filter(([id]) => Object.hasOwn(PLAN, id)));
for (const id of ids) {
  const plan = PLAN[id];
  if (!plan) throw new Error(`no plan for ${id}`);
  const entry = await build(id, plan, sources);
  manifest.models[id] = entry;
  console.log(`${id.padEnd(20)} ${String(entry.sourceTriangles).padStart(6)} -> ${String(entry.triangles).padStart(5)} triangles   ${(entry.sourceBytes / 1000).toFixed(0).padStart(4)} kB -> ${(entry.bytes / 1000).toFixed(0).padStart(4)} kB   textures ${entry.textures.map((t) => `${t.width}`).join('/')}`);
}
manifest.tools = { 'glTF-Transform': versions.gltfTransform, sharp: versions.sharp };
manifest.note = 'Lighter copies of the library models for the corridor props, built by build.mjs. Licences are the sources\'.';
writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
