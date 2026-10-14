#!/usr/bin/env node
// Builds the shipped library from the pinned sources in .asset-cache/ (run fetch.mjs first).
//
//   node scripts/assets/build.mjs            rebuild every plan entry
//
// Models: glTF-Transform. Dedup, prune, weld, simplify to the tier's triangle cap, recentre to
// floor-centre in metres, textures resized and re-encoded as WebP (EXT_texture_webp), geometry
// quantised (KHR_mesh_quantization). No Draco, no meshopt, no KTX2: their decoders need
// WebAssembly, which the site's Content-Security-Policy does not allow.
// Surfaces: albedo, normal and a packed ORM map (R occlusion, G roughness, B metalness), WebP.
//
// Outputs (all under apps/web/src/assets/): models/<id>.glb, surfaces/<id>/*.webp,
// catalogue.data.ts, registry.generated.ts, third-party.json, THIRD_PARTY.md.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { LICENCES, TEXTURE_EDGE, TRIANGLE_CAP } from '../../apps/web/src/assets/policy.ts';
import { core, extensions, functions, MeshoptSimplifier, sharp, versions } from './lib/deps.mjs';
import { ambientMemberName } from './lib/maps.mjs';
import { writeThirdPartyMarkdown } from './lib/notices.mjs';
import { ASSETS_DIR, cachePath, LOCK_PATH, PLAN_PATH, readJson, sha256Buffer, writeJson } from './lib/util.mjs';
import { openZip } from './lib/zip.mjs';

const { NodeIO } = core;
const { ALL_EXTENSIONS, EXTTextureWebP, KHRMeshQuantization } = extensions;
const { dedup, getBounds, prune, quantize, simplify, weld } = functions;

const plan = readJson(PLAN_PATH);
const lock = readJson(LOCK_PATH);

/**
 * The same simplifier with meshoptimizer's Prune and Permissive flags, which let it drop tiny disconnected pieces and collapse across UV seams
 * (embossed lettering, stitching) when the error budget allows. Used only when plain simplification
 * stalls above a tier's cap.
 */
const PruningSimplifier = {
  ...MeshoptSimplifier,
  simplify: (indices, positions, stride, target, error, flags = []) => MeshoptSimplifier.simplify(indices, positions, stride, target, error, [...flags, 'Prune', 'Permissive']),
};

/** WebP quality by texture role. Normals and the packed ORM map are data, so they get more. */
const QUALITY = { baseColor: 76, normal: 84, orm: 84, emissive: 80 };
/** Heroes are seen close; small props are seen small, and the Office's lazy set has a 3 MB allocation. */
const MODEL_QUALITY = {
  hero: { baseColor: 80, normal: 82, orm: 82, emissive: 80 },
  prop: { baseColor: 74, normal: 76, orm: 78, emissive: 74 },
};
const SIZE_BY_TIER = { prop: TEXTURE_EDGE.prop, hero: TEXTURE_EDGE.standard };

function lockedFor(entry) {
  const locked = lock.entries[entry.id];
  if (!locked) throw new Error(`${entry.id} is not pinned; run node scripts/assets/fetch.mjs --pin ${entry.id}`);
  return locked;
}

function countTriangles(document) {
  let total = 0;
  for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== 4) throw new Error('only triangle lists are supported');
      const indices = primitive.getIndices();
      total += (indices ? indices.getCount() : primitive.getAttribute('POSITION').getCount()) / 3;
    }
  }
  return total;
}

function roleOf(material, texture) {
  if (material.getBaseColorTexture() === texture) return 'baseColor';
  if (material.getNormalTexture() === texture) return 'normal';
  if (material.getMetallicRoughnessTexture() === texture || material.getOcclusionTexture() === texture) return 'orm';
  if (material.getEmissiveTexture() === texture) return 'emissive';
  return 'baseColor';
}

/** Re-encodes every texture as WebP at no more than `edge` pixels on its longest side. */
async function encodeTextures(document, edge, dataEdge, quality, notes) {
  document.createExtension(EXTTextureWebP).setRequired(true);
  const roles = new Map();
  for (const material of document.getRoot().listMaterials()) {
    for (const texture of document.getRoot().listTextures()) {
      if (material.getBaseColorTexture() === texture || material.getNormalTexture() === texture || material.getMetallicRoughnessTexture() === texture || material.getOcclusionTexture() === texture || material.getEmissiveTexture() === texture) {
        roles.set(texture, roleOf(material, texture));
      }
    }
  }
  const summary = [];
  for (const texture of document.getRoot().listTextures()) {
    const role = roles.get(texture) ?? 'baseColor';
    const source = Buffer.from(texture.getImage());
    const image = sharp(source);
    const meta = await image.metadata();
    // Colour carries the visible detail; normals and the packed occlusion-roughness map are read at
    // lower frequency, so they ship at half the edge by default.
    const limit = role === 'normal' || role === 'orm' ? dataEdge : edge;
    const scale = Math.min(1, limit / Math.max(meta.width, meta.height));
    const width = Math.max(1, Math.round(meta.width * scale));
    const height = Math.max(1, Math.round(meta.height * scale));
    const out = await image
      .resize(width, height, { kernel: 'lanczos3', fit: 'fill' })
      .webp({ quality: quality[role], effort: 6, smartSubsample: true, alphaQuality: 90 })
      .toBuffer();
    texture.setImage(new Uint8Array(out)).setMimeType('image/webp').setURI('');
    summary.push({ role, width, height, bytes: out.length });
  }
  notes.push(`textures: resized to at most ${edge} px (normal and packed maps ${dataEdge} px) and re-encoded as WebP (EXT_texture_webp), quality ${quality.baseColor} colour, ${quality.normal} normal, ${quality.orm} packed occlusion-roughness-metalness`);
  return summary;
}

async function buildModel(entry) {
  const locked = lockedFor(entry);
  const dir = path.dirname(cachePath(entry.id, locked.files[0].path));
  const gltfFile = locked.files.find((f) => f.path.endsWith('.gltf'));
  if (!gltfFile) throw new Error(`${entry.id}: no .gltf among the pinned files`);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const document = await io.read(path.join(dir, gltfFile.path));
  const root = document.getRoot();
  const notes = [];
  const cap = Math.min(TRIANGLE_CAP[entry.tier], entry.maxTriangles ?? Infinity);
  const edge = entry.textureSize ?? SIZE_BY_TIER[entry.tier];

  for (const animation of root.listAnimations()) animation.dispose();
  for (const camera of root.listCameras()) camera.dispose();
  if (root.listSkins().length > 0) throw new Error(`${entry.id}: skinned meshes are not supported by this pipeline`);
  notes.push('removed animations and cameras');

  // Poly Haven models carry a separate "glass" pane in a blended material that reuses the frame's opaque
  // texture; rendered as exported it is an opaque dark sheet over the picture, clock face or register.
  const glass = root.listMaterials().filter((material) => /_glass$/i.test(material.getName()));
  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) if (glass.includes(primitive.getMaterial())) primitive.dispose();
  }
  if (glass.length > 0) notes.push(`removed the blended glass pane (${glass.map((m) => m.getName()).join(', ')})`);

  await document.transform(dedup(), prune(), weld());
  notes.push('deduplicated, pruned and welded');

  const original = countTriangles(document);
  let triangles = original;
  let pruned = false;
  for (let attempt = 0; triangles > cap && attempt < 8; attempt += 1) {
    const ratio = Math.max(0.01, (cap / triangles) * 0.96);
    const pruning = attempt >= 2;
    await document.transform(simplify({ simplifier: pruning ? PruningSimplifier : MeshoptSimplifier, ratio, error: 0.02 * (attempt + 1), lockBorder: false }), prune());
    if (pruning) pruned = true;
    triangles = countTriangles(document);
    if (process.env.ASSET_DEBUG) console.log(`  simplify attempt ${attempt + 1}: ratio ${ratio.toFixed(3)} -> ${triangles}`);
  }
  if (triangles > cap) throw new Error(`${entry.id}: ${triangles} triangles after simplification, cap is ${cap}`);
  if (triangles < original) notes.push(`simplified from ${original} to ${triangles} triangles (tier ${entry.tier}, cap ${cap})${pruned ? ', dropping tiny disconnected details' : ''}`);
  else notes.push(`kept ${original} triangles (tier ${entry.tier}, cap ${cap})`);

  for (const material of root.listMaterials()) {
    if (entry.singleSided) material.setDoubleSided(false);
    // The scan's packed map carries ambient occlusion in its red channel; use it.
    const orm = material.getMetallicRoughnessTexture();
    if (orm && !material.getOcclusionTexture()) {
      material.setOcclusionTexture(orm);
      // Same sampler as the roughness slot, so the loader shares one texture between them.
      const from = material.getMetallicRoughnessTextureInfo();
      const to = material.getOcclusionTextureInfo();
      to.setTexCoord(from.getTexCoord()).setMagFilter(from.getMagFilter()).setMinFilter(from.getMinFilter()).setWrapS(from.getWrapS()).setWrapT(from.getWrapT());
    }
  }
  if (entry.singleSided) notes.push('materials set to single-sided');

  const textures = await encodeTextures(document, edge, entry.dataSize ?? Math.max(128, edge / 2), { ...MODEL_QUALITY[entry.tier], ...entry.quality }, notes);

  const scene = root.listScenes()[0];
  const before = getBounds(scene);
  // A few glTFs ship at the wrong scale (a 1.1 m shelf at 11 m). The provider lists the real size;
  // where the model's longest side is off by more than a quarter, scale uniformly to match.
  let scale = 1;
  if (locked.dimensionsMetres) {
    const measured = Math.max(...[0, 1, 2].map((i) => before.max[i] - before.min[i]));
    const listed = Math.max(...locked.dimensionsMetres);
    const ratio = listed / measured;
    if (ratio < 0.8 || ratio > 1.25) scale = Math.round(ratio * 1000) / 1000;
  }
  const wrapper = document
    .createNode('asset')
    .setScale([scale, scale, scale])
    .setTranslation([-((before.min[0] + before.max[0]) / 2) * scale, -before.min[1] * scale, -((before.min[2] + before.max[2]) / 2) * scale]);
  for (const child of scene.listChildren()) {
    scene.removeChild(child);
    wrapper.addChild(child);
  }
  scene.addChild(wrapper);
  if (scale !== 1) notes.push(`rescaled by ${scale} to the real size the provider lists (${Math.max(...locked.dimensionsMetres)} m longest side)`);
  notes.push('recentred to floor-centre (origin at the middle of the footprint, base on y = 0), metres, +Y up');

  document.createExtension(KHRMeshQuantization).setRequired(true);
  await document.transform(quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12 }), dedup(), prune());
  notes.push('geometry quantised (KHR_mesh_quantization: 14-bit positions, 8-bit normals, 12-bit texture coordinates)');

  const asset = root.getAsset();
  asset.generator = `UNHELD asset build (glTF-Transform ${versions.gltfTransform})`;
  asset.copyright = `${locked.title} by ${locked.author}, ${locked.licence}, ${locked.page}`;
  for (const node of root.listNodes()) node.setExtras({});
  for (const mesh of root.listMeshes()) mesh.setExtras({});

  const after = getBounds(scene);
  if (Math.abs(after.min[1]) > 0.001) throw new Error(`${entry.id}: base is at y = ${after.min[1]} after recentring`);
  const glb = await io.writeBinary(document);
  const file = path.join(ASSETS_DIR, 'models', `${entry.id}.glb`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, glb);
  const textureBytes = textures.reduce((sum, t) => sum + t.bytes, 0);
  const textureMemoryBytes = textures.reduce((sum, t) => sum + Math.round(t.width * t.height * 4 * (4 / 3)), 0);
  return {
    stats: {
      dimensions: [0, 1, 2].map((i) => round(after.max[i] - after.min[i])),
      triangles,
      textureBytes,
      textureMemoryBytes,
      compressedBytes: glb.length,
      textures,
      drawCalls: root.listNodes().filter((n) => n.getMesh()).reduce((sum, n) => sum + n.getMesh().listPrimitives().length, 0),
    },
    outputs: [{ path: `models/${entry.id}.glb`, sha256: sha256Buffer(glb), bytes: glb.length }],
    notes,
  };
}

const round = (value) => Math.round(value * 10000) / 10000;

function readSurfaceSource(entry, locked, role) {
  if (locked.provider === 'polyhaven') {
    return readFileSync(cachePath(entry.id, `${role}.jpg`));
  }
  const attribute = entry.sourceResolution ?? '1K-JPG';
  const zip = openZip(cachePath(entry.id, locked.files[0].path));
  const member = zip.find((m) => m.name === ambientMemberName(entry.slug, attribute, role));
  if (!member) throw new Error(`${entry.id}: archive has no ${role} map`);
  const buffer = member.read();
  const pinned = locked.members?.find((m) => m.role === role);
  if (!pinned || pinned.sha256 !== sha256Buffer(buffer)) throw new Error(`${entry.id}: ${role} map does not match its pinned sha256`);
  return buffer;
}

async function greyscale(buffer, size) {
  const { data } = await sharp(buffer).resize(size, size, { kernel: 'lanczos3', fit: 'fill' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  return data;
}

async function buildSurface(entry) {
  const locked = lockedFor(entry);
  const size = entry.size ?? TEXTURE_EDGE.standard;
  const sizes = { albedo: size, normal: entry.normalSize ?? size, orm: entry.ormSize ?? size };
  const notes = [];
  const dir = path.join(ASSETS_DIR, 'surfaces');
  mkdirSync(dir, { recursive: true });
  const outputs = [];
  const textures = [];
  const quality = { ...QUALITY, ...entry.quality };
  const resized = (buffer, edge) => sharp(buffer).resize(edge, edge, { kernel: 'lanczos3', fit: 'fill' });
  const emit = async (name, pipeline, role, edge) => {
    const buffer = await pipeline.webp({ quality: quality[role], effort: 6, smartSubsample: true }).toBuffer();
    // Flat and unique names (<id>-<map>.webp): Vite keeps the base name in the built file, and the
    // asset audit matches shipped files to manifest entries by that name.
    const file = `${entry.id}-${name}`;
    writeFileSync(path.join(dir, file), buffer);
    outputs.push({ path: `surfaces/${file}`, sha256: sha256Buffer(buffer), bytes: buffer.length });
    textures.push({ role, width: edge, height: edge, bytes: buffer.length });
  };

  await emit('albedo.webp', resized(readSurfaceSource(entry, locked, 'albedo'), sizes.albedo), 'baseColor', sizes.albedo);
  if (entry.maps.includes('normal')) {
    await emit('normal.webp', resized(readSurfaceSource(entry, locked, 'normal'), sizes.normal), 'normal', sizes.normal);
  }

  let ormSource = null;
  if (entry.maps.includes('arm')) {
    ormSource = resized(readSurfaceSource(entry, locked, 'arm'), sizes.orm);
  } else if (entry.maps.some((m) => ['rough', 'ao', 'metal'].includes(m))) {
    const pixels = sizes.orm * sizes.orm;
    const merged = Buffer.alloc(pixels * 3);
    const channels = [
      ['ao', 0, 255],
      ['rough', 1, 255],
      ['metal', 2, 0],
    ];
    for (const [role, offset, fallback] of channels) {
      if (entry.maps.includes(role)) {
        const data = await greyscale(readSurfaceSource(entry, locked, role), sizes.orm);
        for (let i = 0; i < pixels; i += 1) merged[i * 3 + offset] = data[i];
      } else {
        for (let i = 0; i < pixels; i += 1) merged[i * 3 + offset] = fallback;
      }
    }
    ormSource = sharp(merged, { raw: { width: sizes.orm, height: sizes.orm, channels: 3 } });
  }
  if (ormSource) await emit('orm.webp', ormSource, 'orm', sizes.orm);

  const bytes = outputs.reduce((sum, o) => sum + o.bytes, 0);
  notes.push(`maps: ${entry.maps.join(', ')} (OpenGL normal convention; no displacement)`);
  notes.push(`resized to albedo ${sizes.albedo} px${entry.maps.includes('normal') ? `, normal ${sizes.normal} px` : ''}${ormSource ? `, orm ${sizes.orm} px` : ''}; WebP quality ${quality.baseColor} colour, ${quality.normal} normal, ${quality.orm} orm`);
  if (!entry.maps.includes('arm') && ormSource) notes.push(`packed ${['ao', 'rough', 'metal'].filter((m) => entry.maps.includes(m)).join(', ')} into orm.webp (R occlusion, G roughness, B metalness)`);
  return {
    stats: {
      texelsPerMetre: Math.round(sizes.albedo / entry.tileMetres),
      tileMetres: entry.tileMetres,
      maps: { albedo: true, normal: entry.maps.includes('normal'), orm: ormSource !== null },
      ...(entry.metalness === undefined ? {} : { metalness: entry.metalness }),
      ...(entry.normalScale === undefined ? {} : { normalScale: entry.normalScale }),
      textureBytes: bytes,
      textureMemoryBytes: textures.reduce((sum, t) => sum + Math.round(t.width * t.height * 4 * (4 / 3)), 0),
      compressedBytes: bytes,
      textures,
    },
    outputs,
    notes,
  };
}

function attributionFor(locked) {
  if (locked.provider === 'ambientcg') {
    return `Created using ${locked.title} from ambientCG.com, licensed under the Creative Commons CC0 1.0 Universal License.`;
  }
  return `${locked.title} by ${locked.author} (Poly Haven), ${LICENCES[locked.licence].name}, ${locked.page}`;
}

async function main() {
  // Always a full rebuild: nothing from an earlier plan is left behind.
  rmSync(path.join(ASSETS_DIR, 'models'), { recursive: true, force: true });
  rmSync(path.join(ASSETS_DIR, 'surfaces'), { recursive: true, force: true });
  const manifest = [];
  const catalogue = [];
  const all = [
    ...plan.models.map((entry) => ({ entry, kind: 'model' })),
    ...plan.surfaces.map((entry) => ({ entry, kind: 'surface' })),
  ];
  for (const { entry, kind } of all) {
    const locked = lockedFor(entry);
    if (!LICENCES[locked.licence]) throw new Error(`${entry.id}: licence ${locked.licence} is not on the allow list`);
    const result = kind === 'model' ? await buildModel(entry) : await buildSurface(entry);
    console.log(`${kind} ${entry.id}: ${result.stats.compressedBytes} bytes${kind === 'model' ? `, ${result.stats.triangles} triangles` : ''}`);
    const licence = LICENCES[locked.licence];
    manifest.push({
      id: entry.id,
      kind,
      title: entry.title ?? locked.title,
      author: locked.author,
      source: locked.page,
      licence: locked.licence,
      licenceUrl: licence.url,
      attribution: attributionFor(locked),
      retrieved: locked.retrieved,
      sourceFiles: locked.files.map((f) => ({ path: f.path, url: f.url, bytes: f.bytes, sha256: f.sha256 })),
      ...(locked.members ? { sourceMembers: locked.members.map((m) => ({ archive: m.zip, name: m.name, sha256: m.sha256 })) } : {}),
      transforms: result.notes,
      outputs: result.outputs,
    });
    catalogue.push({
      id: entry.id,
      kind,
      title: entry.title ?? locked.title,
      origin: 'third-party',
      licence: locked.licence,
      tags: entry.tags,
      ...(kind === 'model' ? { tier: entry.tier } : {}),
      ...result.stats,
    });
  }
  const catalogueSource = [
    '// Generated by scripts/assets/build.mjs from the shipped files. Do not edit.',
    "import type { CatalogueEntry } from './types.ts';",
    '',
    `export const CATALOGUE_DATA: readonly CatalogueEntry[] = ${JSON.stringify(catalogue.map(({ textures: _textures, ...rest }) => rest), null, 2)};`,
    '',
  ].join('\n');
  writeFileSync(path.join(ASSETS_DIR, 'catalogue.data.ts'), catalogueSource);
  const modelIds = catalogue.filter((c) => c.kind === 'model').map((c) => c.id);
  const surfaces = catalogue.filter((c) => c.kind === 'surface');
  const registrySource = [
    '// Generated by scripts/assets/build.mjs. Do not edit.',
    '// Every file is a lazily loaded module, so bytes arrive through the module graph and never',
    "// through fetch (the site's policy is connect-src 'none'). A model is a data: URL string of its",
    '// GLB; a surface map is an asset URL for an <img>-based texture load.',
    "import type { SurfaceLoaders } from './types.ts';",
    '',
    'export const MODEL_LOADERS: Readonly<Record<string, () => Promise<string>>> = {',
    ...modelIds.map((id) => `  '${id}': async () => (await import('./models/${id}.glb?url&inline')).default,`),
    '};',
    '',
    'export const SURFACE_LOADERS: Readonly<Record<string, SurfaceLoaders>> = {',
    ...surfaces.flatMap((c) => [
      `  '${c.id}': {`,
      ...['albedo', 'normal', 'orm'].filter((m) => c.maps[m]).map((m) => `    ${m}: async () => (await import('./surfaces/${c.id}-${m}.webp?url')).default,`),
      '  },',
    ]),
    '};',
    '',
  ].join('\n');
  writeFileSync(path.join(ASSETS_DIR, 'registry.generated.ts'), registrySource);
  writeJson(path.join(ASSETS_DIR, 'third-party.json'), {
    schema: 1,
    generatedBy: 'scripts/assets/build.mjs',
    tools: { 'glTF-Transform': versions.gltfTransform, sharp: versions.sharp },
    licences: LICENCES,
    assets: manifest,
  });
  writeThirdPartyMarkdown(path.join(ASSETS_DIR, 'THIRD_PARTY.md'), manifest);
  // Entries in the shape of apps/web/scripts/assets.manifest.json, for the lead to merge when the app
  // first imports a surface. Only surface maps appear: they ship as hashed .webp files, which the
  // audit matches by base name. Models ship inside JavaScript chunks as data: URLs, so the audit never
  // sees them as media files; third-party.json and its tests are their record.
  writeJson(path.join(ASSETS_DIR, 'audit-entries.json'), {
    $comment: [
      'Generated by scripts/assets/build.mjs: entries for apps/web/scripts/assets.manifest.json covering the surface maps in apps/web/src/assets/surfaces.',
      'licenceFile points at LICENSES/CC0-1.0.txt, which the repository does not hold yet; the audit requires it to contain "CC0 1.0 Universal".',
    ],
    entries: manifest
      .filter((asset) => asset.kind === 'surface')
      .map((asset) => ({
        name: `Surface: ${asset.id}`,
        pattern: `^${asset.id}-(?:albedo|normal|orm)-[\\w-]+\\.webp$`,
        source: `third-party:${providerOf(asset.source)}`,
        licence: asset.licence,
        licenceFile: `../../LICENSES/${asset.licence}.txt`,
        attribution: asset.attribution,
      })),
  });
  console.log(`built ${manifest.length} assets`);
}

/** The provider a source page belongs to, for the audit manifest's `third-party:<provider>` source. */
function providerOf(page) {
  const host = new URL(page).hostname;
  if (host.endsWith('ambientcg.com')) return 'ambientCG';
  if (host.endsWith('polyhaven.com')) return 'Poly Haven';
  throw new Error(`no provider name for ${page}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
