// Resolves a plan entry to a pinned file list on its provider, after checking the licence on the
// asset's own page. Only CC0 sources are wired in; a CC BY source needs a deliberate addition here
// and a recorded attribution, never a silent one.
import { getJson, getText } from './util.mjs';

const CC0 = {
  id: 'CC0-1.0',
  url: 'https://creativecommons.org/publicdomain/zero/1.0/',
};

/** The sentence each provider prints on an asset's own page. A page without it is rejected. */
const PAGE_EVIDENCE = {
  polyhaven: /CC0 1\.0 Universal - public domain dedication/,
  ambientcg: /CC0 license, making them free to use without attribution/,
};

async function checkPage(provider, page) {
  const html = await getText(page);
  const match = PAGE_EVIDENCE[provider].exec(html);
  if (!match) throw new Error(`${page}: the asset page does not state CC0 (looked for ${PAGE_EVIDENCE[provider]}); not accepting it`);
  return match[0];
}

/** Poly Haven: models ship as a .gltf with a .bin and JPG textures; textures ship as separate JPG maps. */
async function polyhaven(entry, kind) {
  const slug = entry.slug;
  const page = `https://polyhaven.com/a/${slug}`;
  const info = await getJson(`https://api.polyhaven.com/info/${slug}`);
  const wanted = kind === 'model' ? 2 : 1;
  if (info.type !== wanted) throw new Error(`${slug}: Poly Haven type ${info.type}, expected ${wanted}`);
  const evidence = await checkPage('polyhaven', page);
  const author = Object.keys(info.authors ?? {}).join(', ');
  if (!author) throw new Error(`${slug}: no author recorded by Poly Haven; not accepting it`);
  const files = await getJson(`https://api.polyhaven.com/files/${slug}`);
  const resolution = entry.sourceResolution ?? '1k';
  const out = [];
  if (kind === 'model') {
    const gltf = files.gltf?.[resolution]?.gltf;
    if (!gltf) throw new Error(`${slug}: no glTF at ${resolution}`);
    out.push({ path: gltf.url.split('/').pop(), url: gltf.url, bytes: gltf.size, md5: gltf.md5 });
    for (const [relative, file] of Object.entries(gltf.include ?? {})) {
      // The API lists a shared .bin under the 8k folder, and for some assets (vintage_grandfather_clock_01)
      // that folder holds a different version than the one the listed md5, the listed size and the
      // glTF's own byteLength describe. The same file under the chosen resolution's folder is tried
      // next, and only a download whose md5 matches the provider's listing is ever accepted.
      const alternates = file.url.includes('/gltf/8k/') ? [file.url.replace('/gltf/8k/', `/gltf/${resolution}/`)] : [];
      out.push({ path: relative, url: file.url, alternates, bytes: file.size, md5: file.md5 });
    }
  } else {
    const maps = { albedo: 'Diffuse', normal: 'nor_gl', rough: 'Rough', ao: 'AO', arm: 'arm', metal: 'Metal' };
    for (const key of entry.maps) {
      const group = files[maps[key]]?.[resolution]?.jpg;
      if (!group) throw new Error(`${slug}: no ${maps[key]} map at ${resolution}`);
      out.push({ path: `${key}.jpg`, url: group.url, bytes: group.size, md5: group.md5, role: key });
    }
  }
  return {
    provider: 'polyhaven',
    slug,
    page,
    author,
    title: info.name,
    // What the provider says the real object measures, in metres (it lists millimetres, Z up). The
    // build compares the converted model against it, because a few glTFs ship at the wrong scale.
    ...(kind === 'model' && Array.isArray(info.dimensions) ? { dimensionsMetres: info.dimensions.map((d) => Math.round(d) / 1000) } : {}),
    licence: CC0.id,
    licenceUrl: CC0.url,
    licenceEvidence: evidence,
    files: out,
  };
}

/** ambientCG: one ZIP per resolution; the maps the plan names are read out of it at build time. */
async function ambientcg(entry) {
  const slug = entry.slug;
  const page = `https://ambientcg.com/a/${slug}`;
  const evidence = await checkPage('ambientcg', page);
  const data = await getJson(`https://ambientcg.com/api/v2/full_json?id=${encodeURIComponent(slug)}&include=downloadData`);
  const asset = data.foundAssets?.find((a) => a.assetId === slug);
  if (!asset) throw new Error(`${slug}: not found on ambientCG`);
  if (asset.dataType !== 'Material') throw new Error(`${slug}: ambientCG type ${asset.dataType}, expected Material`);
  const attribute = entry.sourceResolution ?? '1K-JPG';
  const downloads = asset.downloadFolders?.default?.downloadFiletypeCategories?.zip?.downloads ?? [];
  const zip = downloads.find((d) => d.attribute === attribute);
  if (!zip) throw new Error(`${slug}: no ${attribute} zip`);
  return {
    provider: 'ambientcg',
    slug,
    page,
    author: 'ambientCG',
    title: asset.displayName,
    licence: CC0.id,
    licenceUrl: CC0.url,
    licenceEvidence: evidence,
    files: [{ path: zip.fileName, url: zip.downloadLink, bytes: zip.size }],
  };
}

export async function resolveSource(entry, kind) {
  if (entry.provider === 'polyhaven') return polyhaven(entry, kind);
  if (entry.provider === 'ambientcg') {
    if (kind !== 'surface') throw new Error(`${entry.id}: ambientCG is wired in for surfaces only`);
    return ambientcg(entry);
  }
  throw new Error(`${entry.id}: unknown provider "${entry.provider}"`);
}
